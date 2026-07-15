'use client';

import { useState } from 'react';
import { plankVideoUrl, sessionHasVideo } from '@/lib/plankVideo';
import { formatHuman } from '@/lib/dates';
import { formatHold } from '@/lib/plankFormat';
import type { PlankSession } from '@/lib/types';

interface Props {
  /** The program's API base, e.g. '/api/plank-programs/5'. */
  basePath: string;
  sessions: PlankSession[];
}

/**
 * Read-only gallery of every plank session that has a video, newest first — the
 * discoverable "look back at past recordings" surface. Playback only; adding,
 * replacing and removing videos stays in the editable Session history below.
 * Self-hides when nothing has been recorded yet.
 */
export default function PlankRecordings({ basePath, sessions }: Props) {
  const recorded = sessions.filter(sessionHasVideo);
  const [playing, setPlaying] = useState<number | null>(null);

  if (recorded.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="mb-1 text-base font-bold text-text-primary">Recordings</h2>
      <p className="mb-3 text-xs text-text-muted">
        Play back the plank videos you saved on past days.
      </p>
      <ul className="flex flex-col gap-2">
        {recorded.map((s) => {
          const url = plankVideoUrl(basePath, s);
          const open = playing === s.id;
          return (
            <li
              key={s.id}
              className="rounded-card border border-border bg-surface p-3 shadow-card"
            >
              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-bold text-text-primary">
                  Day {s.day_index}
                </span>
                {s.completed ? (
                  <span className="rounded-btn bg-pass/15 px-1.5 py-0.5 text-xs font-semibold text-pass">
                    ✓ done
                  </span>
                ) : (
                  <span className="rounded-btn bg-warn/15 px-1.5 py-0.5 text-xs font-semibold text-warn">
                    attempted
                  </span>
                )}
                <span className="text-xs tabular-nums text-text-muted">
                  {formatHold(s.lasted_seconds)}
                </span>
                <span className="text-xs text-text-faint">{formatHuman(s.date)}</span>
              </div>

              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setPlaying((cur) => (cur === s.id ? null : s.id))}
                  className="rounded-btn border border-border bg-surface2/60 px-2.5 py-1 text-xs font-medium text-accent-400 active:bg-surface2"
                >
                  {open ? 'Hide video' : '▶ Play'}
                </button>
              </div>

              {open && url && (
                <video
                  src={url}
                  controls
                  playsInline
                  preload="metadata"
                  className="mt-2 w-full rounded-btn border border-border bg-black"
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
