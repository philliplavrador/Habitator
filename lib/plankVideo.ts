// Client-safe, pure helper for a plank session's video playback URL. Mirrors
// lib/repVideo.ts but for the single video a plank session carries. No server
// imports.

import type { PlankSession } from './types';

/** Playback URL for a plank session's video, or null when none. `?v=` is the
 *  stored filename, so a replaced video busts the browser cache. */
export function plankVideoUrl(
  basePath: string,
  session: PlankSession
): string | null {
  return session.video
    ? `${basePath}/${session.id}/video?v=${encodeURIComponent(session.video)}`
    : null;
}

/** Whether a session has a video attached. */
export function sessionHasVideo(session: PlankSession): boolean {
  return !!session.video;
}
