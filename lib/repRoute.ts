// Route-handler factories shared by the pushup and pullup API routes. Each
// program's route.ts just binds these to its configured program instance, so
// the request/response contract stays identical across both.
//
// Every handler resolves the logged-in user and scopes all program access to
// them, so the two accounts' logs never cross.
//
// SERVER-ONLY.

import { NextRequest, NextResponse } from 'next/server';
import type { RepProgram } from './repProgram';
import { getCurrentUserId } from './auth';
import { parseRepSets } from './validate';
import { getTimezone } from './tz';
import { parseId, readJson, unauthorized } from './apiRoute';
import {
  MAX_VIDEO_BYTES,
  buildVideoResponse,
  deleteVideoFile,
  saveVideoStream,
} from './media';

/** The whole-workout + all per-set video filenames on a session, de-nulled. */
function allVideoFiles(session: {
  video: string | null;
  videos: (string | null)[];
}): string[] {
  return [session.video, ...session.videos].filter(
    (v): v is string => typeof v === 'string'
  );
}

/**
 * A cheap early-out for an obviously-oversized upload, read from Content-Length
 * BEFORE we stream the body. The authoritative check is the byte-counter in
 * `saveVideoStream` (Content-Length can be absent or spoofed); this just avoids
 * streaming gigabytes only to reject them.
 */
function tooLargeByHeader(req: NextRequest): boolean {
  const declared = Number(req.headers.get('content-length'));
  return Number.isFinite(declared) && declared > MAX_VIDEO_BYTES + 1_000_000;
}

const tooLargeResponse = () =>
  NextResponse.json(
    { error: `Video too large (max ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB).` },
    { status: 413 }
  );

/** Filename + content-type of a raw-body video upload (name via ?name= query). */
function uploadMeta(req: NextRequest): { filename: string; contentType: string } {
  const name = new URL(req.url).searchParams.get('name') ?? 'video';
  return { filename: name, contentType: req.headers.get('content-type') ?? '' };
}

// GET  /api/<prog>        → computed program state
// POST /api/<prog>  { reps } → log an attempt at the current day
export function createRepCollectionRoute(program: RepProgram) {
  async function GET() {
    const userId = await getCurrentUserId();
    if (userId === null) return unauthorized();
    return NextResponse.json({
      state: await program.getState(userId, getTimezone()),
    });
  }

  async function POST(req: NextRequest) {
    const userId = await getCurrentUserId();
    if (userId === null) return unauthorized();
    const body = await readJson(req);
    if (body === undefined) {
      return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
    }
    const parsed = parseRepSets(body, program.config.sets);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const state = await program.log(userId, parsed.value, getTimezone());
    return NextResponse.json({ state }, { status: 201 });
  }

  return { GET, POST };
}

// PATCH  /api/<prog>/[id]  { reps } → edit a session's reps
// DELETE /api/<prog>/[id]           → remove a session (+ its video file)
export function createRepItemRoute(program: RepProgram) {
  async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
  ) {
    const userId = await getCurrentUserId();
    if (userId === null) return unauthorized();
    const id = parseId(params.id);
    if (id === null) {
      return NextResponse.json({ error: 'Bad id.' }, { status: 400 });
    }
    const body = await readJson(req);
    if (body === undefined) {
      return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
    }
    const parsed = parseRepSets(body, program.config.sets);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const session = await program.update(userId, id, parsed.value);
    if (!session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
    return NextResponse.json({
      session,
      state: await program.getState(userId, getTimezone()),
    });
  }

  async function DELETE(
    _req: NextRequest,
    { params }: { params: { id: string } }
  ) {
    const userId = await getCurrentUserId();
    if (userId === null) return unauthorized();
    const id = parseId(params.id);
    if (id === null) {
      return NextResponse.json({ error: 'Bad id.' }, { status: 400 });
    }
    const removed = await program.remove(userId, id);
    if (!removed) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
    // The row is gone (committed), so unlink every video it referenced — the
    // whole-workout clip and any per-set clips. Orphaned files on a crash here
    // are harmless; a dangling row is not (see media.ts crash-safety contract).
    for (const f of allVideoFiles(removed)) deleteVideoFile(f);
    return NextResponse.json({
      ok: true,
      state: await program.getState(userId, getTimezone()),
    });
  }

  return { PATCH, DELETE };
}

// GET    /api/<prog>/[id]/video → stream the attached video (Range-aware)
// PUT    /api/<prog>/[id]/video → attach/replace a video (multipart, field "video")
// DELETE /api/<prog>/[id]/video → detach + delete the video
export function createRepVideoRoute(program: RepProgram) {
  async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
  ) {
    const userId = await getCurrentUserId();
    if (userId === null) return unauthorized();
    const id = parseId(params.id);
    if (id === null) {
      return NextResponse.json({ error: 'Bad id.' }, { status: 400 });
    }
    const session = await program.get(userId, id);
    if (!session || !session.video) {
      return NextResponse.json({ error: 'No video.' }, { status: 404 });
    }
    const res = buildVideoResponse(session.video, req.headers.get('range'));
    if (!res) {
      return NextResponse.json({ error: 'Video file missing.' }, { status: 404 });
    }
    return res;
  }

  async function PUT(
    req: NextRequest,
    { params }: { params: { id: string } }
  ) {
    const userId = await getCurrentUserId();
    if (userId === null) return unauthorized();
    const id = parseId(params.id);
    if (id === null) {
      return NextResponse.json({ error: 'Bad id.' }, { status: 400 });
    }
    const existing = await program.get(userId, id);
    if (!existing) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
    if (tooLargeByHeader(req)) return tooLargeResponse();

    // Stream the raw request body straight to disk (see saveVideoStream) — the
    // whole-workout recording can be large, and nothing is buffered in memory.
    const result = await saveVideoStream(
      program.config.key,
      id,
      req.body,
      uploadMeta(req)
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    // Commit the DB row FIRST, then drop the old file. If the DB write fails, the
    // row still points at the valid old file (only the new upload is orphaned,
    // and orphans are harmless/cleanable) rather than dangling at a deleted file.
    const session = await program.setVideo(userId, id, result.filename);
    if (existing.video && existing.video !== result.filename) {
      deleteVideoFile(existing.video);
    }
    return NextResponse.json({
      session,
      state: await program.getState(userId, getTimezone()),
    });
  }

  async function DELETE(
    _req: NextRequest,
    { params }: { params: { id: string } }
  ) {
    const userId = await getCurrentUserId();
    if (userId === null) return unauthorized();
    const id = parseId(params.id);
    if (id === null) {
      return NextResponse.json({ error: 'Bad id.' }, { status: 400 });
    }
    const existing = await program.get(userId, id);
    if (!existing) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
    // Clear the reference first, then unlink — a crash in between orphans the
    // file (harmless) rather than leaving the row pointing at a deleted file.
    const session = await program.clearVideo(userId, id);
    deleteVideoFile(existing.video);
    return NextResponse.json({
      session,
      state: await program.getState(userId, getTimezone()),
    });
  }

  return { GET, PUT, DELETE };
}

// GET    /api/<prog>/[id]/video/[set] → stream the video for one set (Range-aware)
// PUT    /api/<prog>/[id]/video/[set] → attach/replace that set's video (raw body)
// DELETE /api/<prog>/[id]/video/[set] → detach + delete that set's video
//
// "set" is a 0-based index in [0, sets). This mirrors createRepVideoRoute but
// targets one slot of the per-set `videos` array instead of the single `video`.
export function createRepSetVideoRoute(program: RepProgram) {
  // A 0-based set index in range, or null. (parseId rejects 0, so it can't be
  // reused here — set 0 is the first, valid, set.)
  function parseSet(raw: string): number | null {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n >= program.config.sets) return null;
    return n;
  }

  async function GET(
    req: NextRequest,
    { params }: { params: { id: string; set: string } }
  ) {
    const userId = await getCurrentUserId();
    if (userId === null) return unauthorized();
    const id = parseId(params.id);
    const set = parseSet(params.set);
    if (id === null || set === null) {
      return NextResponse.json({ error: 'Bad id.' }, { status: 400 });
    }
    const session = await program.get(userId, id);
    const filename = session?.videos[set] ?? null;
    if (!filename) {
      return NextResponse.json({ error: 'No video.' }, { status: 404 });
    }
    const res = buildVideoResponse(filename, req.headers.get('range'));
    if (!res) {
      return NextResponse.json({ error: 'Video file missing.' }, { status: 404 });
    }
    return res;
  }

  async function PUT(
    req: NextRequest,
    { params }: { params: { id: string; set: string } }
  ) {
    const userId = await getCurrentUserId();
    if (userId === null) return unauthorized();
    const id = parseId(params.id);
    const set = parseSet(params.set);
    if (id === null || set === null) {
      return NextResponse.json({ error: 'Bad id.' }, { status: 400 });
    }
    const existing = await program.get(userId, id);
    if (!existing) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
    if (tooLargeByHeader(req)) return tooLargeResponse();

    const result = await saveVideoStream(
      program.config.key,
      id,
      req.body,
      uploadMeta(req),
      set
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    // Commit the row FIRST, then unlink the replaced file (same crash-safety
    // ordering as the whole-workout video above).
    const prior = existing.videos[set];
    const session = await program.setSetVideo(userId, id, set, result.filename);
    if (prior && prior !== result.filename) deleteVideoFile(prior);
    return NextResponse.json({
      session,
      state: await program.getState(userId, getTimezone()),
    });
  }

  async function DELETE(
    _req: NextRequest,
    { params }: { params: { id: string; set: string } }
  ) {
    const userId = await getCurrentUserId();
    if (userId === null) return unauthorized();
    const id = parseId(params.id);
    const set = parseSet(params.set);
    if (id === null || set === null) {
      return NextResponse.json({ error: 'Bad id.' }, { status: 400 });
    }
    const existing = await program.get(userId, id);
    if (!existing) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
    const prior = existing.videos[set];
    const session = await program.clearSetVideo(userId, id, set);
    deleteVideoFile(prior);
    return NextResponse.json({
      session,
      state: await program.getState(userId, getTimezone()),
    });
  }

  return { GET, PUT, DELETE };
}
