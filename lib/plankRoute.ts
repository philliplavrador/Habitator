// Route-handler factories for the plank-program API. Mirrors lib/repRoute.ts but
// for the single-value plank model (one hold per day) and the single video a
// plank session carries (no per-set videos). Each factory takes a
// `resolve(userId, params)` that yields the program the request acts on
// (user plank programs resolve it from the `[id]` route segment per request).
//
// Every handler resolves the logged-in user and scopes all program access to
// them, so accounts' logs never cross.
//
// SERVER-ONLY.

import { NextRequest, NextResponse } from 'next/server';
import type { PlankProgram } from './plankProgram';
import { getCurrentUserId } from './auth';
import { parsePlankLasted } from './validate';
import { getTimezone } from './tz';
import { parseId, readJson, unauthorized } from './apiRoute';
import {
  MAX_VIDEO_BYTES,
  buildVideoResponse,
  deleteVideoFile,
  saveVideoStream,
} from './media';

/** Resolves the program a request targets, or null (bad/unknown/not-theirs). */
export type ResolvePlankProgram = (
  userId: number,
  params: Record<string, string>
) => Promise<PlankProgram | null> | PlankProgram | null;

type RouteCtx = { params: Record<string, string> } | undefined;

const paramsOf = (ctx: RouteCtx): Record<string, string> => ctx?.params ?? {};

const programNotFound = () =>
  NextResponse.json({ error: 'Program not found.' }, { status: 404 });

/** Cheap early-out for an obviously-oversized upload, from Content-Length. The
 *  authoritative check is the byte-counter in saveVideoStream. */
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

// GET  /api/plank-programs/[id]              → computed program state
// POST /api/plank-programs/[id]  { lasted }  → log a hold at the current day
export function createPlankCollectionRoute(resolve: ResolvePlankProgram) {
  async function GET(_req: NextRequest, ctx: RouteCtx) {
    const userId = await getCurrentUserId();
    if (userId === null) return unauthorized();
    const program = await resolve(userId, paramsOf(ctx));
    if (!program) return programNotFound();
    return NextResponse.json({
      state: await program.getState(userId, getTimezone()),
    });
  }

  async function POST(req: NextRequest, ctx: RouteCtx) {
    const userId = await getCurrentUserId();
    if (userId === null) return unauthorized();
    const program = await resolve(userId, paramsOf(ctx));
    if (!program) return programNotFound();
    const body = await readJson(req);
    if (body === undefined) {
      return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
    }
    const parsed = parsePlankLasted(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const state = await program.log(userId, parsed.value, getTimezone());
    return NextResponse.json({ state }, { status: 201 });
  }

  return { GET, POST };
}

// PATCH  /api/plank-programs/[id]/[sid]  { lasted } → edit a session's hold
// DELETE /api/plank-programs/[id]/[sid]             → remove a session (+ video)
export function createPlankItemRoute(
  resolve: ResolvePlankProgram,
  sessionParam = 'id'
) {
  async function PATCH(req: NextRequest, ctx: RouteCtx) {
    const userId = await getCurrentUserId();
    if (userId === null) return unauthorized();
    const params = paramsOf(ctx);
    const program = await resolve(userId, params);
    if (!program) return programNotFound();
    const id = parseId(params[sessionParam]);
    if (id === null) {
      return NextResponse.json({ error: 'Bad id.' }, { status: 400 });
    }
    const body = await readJson(req);
    if (body === undefined) {
      return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
    }
    const parsed = parsePlankLasted(body);
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

  async function DELETE(_req: NextRequest, ctx: RouteCtx) {
    const userId = await getCurrentUserId();
    if (userId === null) return unauthorized();
    const params = paramsOf(ctx);
    const program = await resolve(userId, params);
    if (!program) return programNotFound();
    const id = parseId(params[sessionParam]);
    if (id === null) {
      return NextResponse.json({ error: 'Bad id.' }, { status: 400 });
    }
    const removed = await program.remove(userId, id);
    if (!removed) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
    // The row is gone (committed), so unlink its video. An orphaned file on a
    // crash here is harmless; a dangling row is not (media.ts crash-safety).
    if (removed.video) deleteVideoFile(removed.video);
    return NextResponse.json({
      ok: true,
      state: await program.getState(userId, getTimezone()),
    });
  }

  return { PATCH, DELETE };
}

// GET    /api/plank-programs/[id]/[sid]/video → stream the video (Range-aware)
// PUT    /api/plank-programs/[id]/[sid]/video → attach/replace a video (raw body)
// DELETE /api/plank-programs/[id]/[sid]/video → detach + delete the video
export function createPlankVideoRoute(
  resolve: ResolvePlankProgram,
  sessionParam = 'id'
) {
  async function GET(req: NextRequest, ctx: RouteCtx) {
    const userId = await getCurrentUserId();
    if (userId === null) return unauthorized();
    const params = paramsOf(ctx);
    const program = await resolve(userId, params);
    if (!program) return programNotFound();
    const id = parseId(params[sessionParam]);
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

  async function PUT(req: NextRequest, ctx: RouteCtx) {
    const userId = await getCurrentUserId();
    if (userId === null) return unauthorized();
    const params = paramsOf(ctx);
    const program = await resolve(userId, params);
    if (!program) return programNotFound();
    const id = parseId(params[sessionParam]);
    if (id === null) {
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
      uploadMeta(req)
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    // Commit the DB row FIRST, then drop the old file (crash-safety: a failed DB
    // write leaves the row pointing at the valid old file; only the new upload is
    // orphaned, and orphans are harmless/cleanable).
    const session = await program.setVideo(userId, id, result.filename);
    if (existing.video && existing.video !== result.filename) {
      deleteVideoFile(existing.video);
    }
    return NextResponse.json({
      session,
      state: await program.getState(userId, getTimezone()),
    });
  }

  async function DELETE(_req: NextRequest, ctx: RouteCtx) {
    const userId = await getCurrentUserId();
    if (userId === null) return unauthorized();
    const params = paramsOf(ctx);
    const program = await resolve(userId, params);
    if (!program) return programNotFound();
    const id = parseId(params[sessionParam]);
    if (id === null) {
      return NextResponse.json({ error: 'Bad id.' }, { status: 400 });
    }
    const existing = await program.get(userId, id);
    if (!existing) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
    // Clear the reference first, then unlink — a crash in between orphans the file
    // (harmless) rather than leaving the row pointing at a deleted file.
    const session = await program.clearVideo(userId, id);
    deleteVideoFile(existing.video);
    return NextResponse.json({
      session,
      state: await program.getState(userId, getTimezone()),
    });
  }

  return { GET, PUT, DELETE };
}
