// Video storage for rep-program sessions. Files live next to the SQLite DB on
// the Railway volume (data/uploads/), so they persist across deploys and are
// gitignored via `/data/`. Only the stored filename is kept in the DB; bytes
// never touch git or the bundle.
//
// SERVER-ONLY (fs/path/crypto/stream + lib/db). Never import from client code.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dataDir } from './db';
import type { RepProgramKey } from './types';

/**
 * Reject anything larger — a short lift clip is tens of MB. Kept well under the
 * container's memory ceiling because `req.formData()` buffers the whole part in
 * memory (undici doesn't spool to disk), so the cap doubles as an OOM guard.
 */
export const MAX_VIDEO_BYTES = 80 * 1024 * 1024; // 80 MB

// These three tables are three views of the same ext↔MIME mapping and can drift
// out of sync (e.g. adding a format to one but not the others). They'd ideally
// collapse to a single source of truth — one `{ ext, mime }[]` the sets/records
// derive from. Until then, edit all three together.
const ALLOWED_EXT = new Set([
  'mp4', 'm4v', 'mov', 'webm', 'mkv', 'ogv', 'ogg', 'avi', '3gp',
]);

const EXT_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
  'video/ogg': 'ogv',
  'video/x-msvideo': 'avi',
  'video/3gpp': '3gp',
};

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  ogv: 'video/ogg',
  ogg: 'video/ogg',
  avi: 'video/x-msvideo',
  '3gp': 'video/3gpp',
};

function uploadsDir(): string {
  const dir = path.join(dataDir(), 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** True if `file` looks like a video (by MIME or a known extension). */
export function isVideoFile(file: File): boolean {
  if (file.type && file.type.startsWith('video/')) return true;
  return ALLOWED_EXT.has(extOf(file.name ?? ''));
}

/**
 * Only ever operate on a bare, well-formed filename inside uploads/. Rejects any
 * path separators / traversal — the DB is the sole source of these names, but we
 * treat them as untrusted at the fs boundary regardless.
 */
function safeName(filename: string): string | null {
  if (
    !filename ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('..')
  ) {
    return null;
  }
  return /^[\w.-]+$/.test(filename) ? filename : null;
}

/** Persist an uploaded video and return its stored filename. */
export async function saveVideo(
  key: RepProgramKey,
  sessionId: number,
  file: File
): Promise<string> {
  const nameExt = extOf(file.name ?? '');
  const ext = ALLOWED_EXT.has(nameExt)
    ? nameExt
    : EXT_BY_MIME[file.type] ?? 'mp4';
  const filename = `${key}-${sessionId}-${crypto
    .randomBytes(8)
    .toString('hex')}.${ext}`;
  const dest = path.join(uploadsDir(), filename);
  try {
    // Stream the part straight to disk — avoids a second full in-memory copy
    // (arrayBuffer) and keeps the write off the event loop. file.stream() is a
    // web ReadableStream; Readable.fromWeb adapts it to a Node stream.
    await pipeline(
      Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]),
      fs.createWriteStream(dest)
    );
  } catch (e) {
    try {
      fs.unlinkSync(dest);
    } catch {
      /* nothing to clean up */
    }
    throw e;
  }
  return filename;
}

/**
 * Best-effort delete of a stored video; missing files are ignored.
 *
 * CRASH-SAFETY CONTRACT with callers (lib/repRoute.ts): the route handlers
 * commit the DB row change FIRST — clearing/repointing the `video` column — and
 * only THEN call this to unlink the old bytes. A crash in that window orphans a
 * file (harmless, cleanable) instead of leaving a row pointing at a deleted
 * file. Keep that ordering; never unlink before the row is committed.
 */
export function deleteVideoFile(filename: string | null | undefined): void {
  if (!filename) return;
  const n = safeName(filename);
  if (!n) return;
  try {
    fs.unlinkSync(path.join(uploadsDir(), n));
  } catch {
    /* already gone — fine */
  }
}

// Parse an HTTP Range header ("bytes=start-end" / "bytes=start-" / "bytes=-N").
function parseRange(
  header: string | null,
  size: number
): { start: number; end: number } | null {
  if (!header || !header.startsWith('bytes=')) return null;
  const spec = header.slice(6).split(',')[0].trim();
  const dash = spec.indexOf('-');
  if (dash < 0) return null;
  const startStr = spec.slice(0, dash);
  const endStr = spec.slice(dash + 1);

  let start: number;
  let end: number;
  if (startStr === '') {
    const suffix = parseInt(endStr, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    end = size - 1;
    start = Math.max(0, size - suffix);
  } else {
    start = parseInt(startStr, 10);
    if (!Number.isFinite(start)) return null;
    end = endStr === '' ? size - 1 : parseInt(endStr, 10);
    if (!Number.isFinite(end)) end = size - 1;
  }
  if (start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

/**
 * Build a streaming Response for a stored video, honoring Range requests (206)
 * so `<video>` seeking — and iOS Safari playback, which demands range support —
 * works. Returns null when the file is missing/invalid so the caller can 404.
 */
export function buildVideoResponse(
  filename: string,
  rangeHeader: string | null
): Response | null {
  const n = safeName(filename);
  if (!n) return null;
  const full = path.join(uploadsDir(), n);

  let stat: fs.Stats;
  try {
    stat = fs.statSync(full);
  } catch {
    return null;
  }
  const size = stat.size;
  const contentType = CONTENT_TYPE_BY_EXT[extOf(n)] ?? 'application/octet-stream';
  const baseHeaders: Record<string, string> = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=31536000, immutable',
  };

  const range = parseRange(rangeHeader, size);
  if (range) {
    const { start, end } = range;
    const stream = Readable.toWeb(
      fs.createReadStream(full, { start, end })
    ) as unknown as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
      },
    });
  }

  const stream = Readable.toWeb(
    fs.createReadStream(full)
  ) as unknown as ReadableStream;
  return new Response(stream, {
    status: 200,
    headers: { ...baseHeaders, 'Content-Length': String(size) },
  });
}
