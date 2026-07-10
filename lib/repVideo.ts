// Client-safe, pure helpers for a rep session's video playback URLs. Shared by
// the editable Session history (RepProgramHistory) and the read-only Recordings
// gallery (RepRecordings) so the URL shape stays in one place. No server imports.

import type { RepSession } from './types';

/** Playback URLs for a session's videos. `?v=` is the stored filename, so a
 *  replaced video busts the browser cache and re-fetches the new file. */
export function repVideoUrls(basePath: string, session: RepSession): {
  /** The whole-workout video (guided one-take / legacy), or null. */
  workout: string | null;
  /** One slot per set: a playback URL, or null when that set has no video. */
  sets: (string | null)[];
} {
  const workout = session.video
    ? `${basePath}/${session.id}/video?v=${encodeURIComponent(session.video)}`
    : null;
  const sets = session.videos.map((name, i) =>
    name
      ? `${basePath}/${session.id}/video/${i}?v=${encodeURIComponent(name)}`
      : null
  );
  return { workout, sets };
}

/** Whether a session has any video attached (workout or any set). */
export function sessionHasVideo(session: RepSession): boolean {
  return !!session.video || session.videos.some(Boolean);
}
