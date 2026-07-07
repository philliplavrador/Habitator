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
  isVideoFile,
  saveVideo,
} from './media';

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
    deleteVideoFile(removed.video);
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

    // Reject oversized uploads BEFORE buffering the body (formData holds the whole
    // part in memory). Content-Length can be absent/spoofed, so the exact
    // file.size check below still runs — this is just a cheap early-out.
    const declared = Number(req.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_VIDEO_BYTES + 1_000_000) {
      return NextResponse.json(
        {
          error: `Video too large (max ${Math.round(
            MAX_VIDEO_BYTES / 1024 / 1024
          )} MB).`,
        },
        { status: 413 }
      );
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { error: 'Expected multipart form data.' },
        { status: 400 }
      );
    }
    const file = form.get('video');
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: 'No video file provided.' },
        { status: 400 }
      );
    }
    if (file.size > MAX_VIDEO_BYTES) {
      return NextResponse.json(
        {
          error: `Video too large (max ${Math.round(
            MAX_VIDEO_BYTES / 1024 / 1024
          )} MB).`,
        },
        { status: 413 }
      );
    }
    if (!isVideoFile(file)) {
      return NextResponse.json(
        { error: 'That file is not a video.' },
        { status: 415 }
      );
    }

    const filename = await saveVideo(program.config.key, id, file);
    // Commit the DB row FIRST, then drop the old file. If the DB write fails, the
    // row still points at the valid old file (only the new upload is orphaned,
    // and orphans are harmless/cleanable) rather than dangling at a deleted file.
    const session = await program.setVideo(userId, id, filename);
    if (existing.video && existing.video !== filename) {
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
