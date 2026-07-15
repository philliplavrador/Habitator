'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Field } from './ui/Field';
import { useConfirm } from './ui/confirm';
import EditableHistoryRow from './EditableHistoryRow';
import {
  apiDeletePlankSession,
  apiDeletePlankVideo,
  apiUpdatePlankLasted,
  apiUploadPlankVideo,
} from '@/lib/client';
import { formatHuman } from '@/lib/dates';
import { formatHold } from '@/lib/plankFormat';
import { plankVideoUrl } from '@/lib/plankVideo';
import type { PlankSession } from '@/lib/types';

interface Props {
  /** The program's API base, e.g. '/api/plank-programs/5'. */
  basePath: string;
  sessions: PlankSession[];
}

/** Editable log of every plank hold for a program, newest first. */
export default function PlankProgramHistory({ basePath, sessions }: Props) {
  if (sessions.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-base font-bold text-text-primary">Session history</h2>
      <ul className="flex flex-col gap-2">
        {sessions.map((s) => (
          <SessionRow key={s.id} basePath={basePath} session={s} />
        ))}
      </ul>
      <p className="mt-2 text-xs text-text-muted">
        Editing or deleting a session can shift your current day — progress is the
        count of completed days.
      </p>
    </section>
  );
}

function SessionRow({
  basePath,
  session,
}: {
  basePath: string;
  session: PlankSession;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [held, setHeld] = useState<string>(String(session.lasted_seconds));
  const [playing, setPlaying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const videoUrl = plankVideoUrl(basePath, session);

  async function save() {
    const n = parseInt(held, 10);
    await apiUpdatePlankLasted(
      basePath,
      session.id,
      Number.isFinite(n) && n >= 0 ? n : 0
    );
  }

  return (
    <EditableHistoryRow
      confirmCopy={{
        title: 'Delete this session?',
        message:
          'This may roll your current program day back, and removes its video.',
        confirmLabel: 'Delete',
      }}
      onSave={save}
      onDelete={() => apiDeletePlankSession(basePath, session.id)}
      onCancel={() => setHeld(String(session.lasted_seconds))}
      read={
        <>
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-bold text-text-primary">
              Day {session.day_index}
            </span>
            {session.completed ? (
              <span className="rounded-btn bg-pass/15 px-1.5 py-0.5 text-xs font-semibold text-pass">
                ✓ done
              </span>
            ) : (
              <span className="rounded-btn bg-warn/15 px-1.5 py-0.5 text-xs font-semibold text-warn">
                attempted
              </span>
            )}
            {videoUrl && <span className="text-xs text-text-muted">🎬</span>}
          </div>
          <p className="mt-0.5 text-sm tabular-nums text-text-secondary">
            {formatHold(session.lasted_seconds)}{' '}
            <span className="text-text-faint">
              / {formatHold(session.target_seconds)}
            </span>
          </p>
          <p className="text-xs text-text-faint">{formatHuman(session.date)}</p>
        </>
      }
      editForm={
        <>
          <div className="mb-2 text-sm font-semibold text-text-secondary">
            Day {session.day_index} · target {formatHold(session.target_seconds)}
          </div>
          <Field
            label="Seconds held"
            type="number"
            inputMode="numeric"
            min={0}
            value={held}
            onChange={(e) => setHeld(e.target.value)}
            hint={`= ${formatHold(parseInt(held, 10) || 0)}`}
          />
        </>
      }
      extraActions={({ busy, run }) => {
        const upload = (file: File) => {
          if (fileRef.current) fileRef.current.value = '';
          run(
            async () => {
              await apiUploadPlankVideo(basePath, session.id, file);
              // A replace mints a new filename, so collapse the open player (its
              // URL would point at the now-deleted old file). Re-open to see it.
              setPlaying(false);
              router.refresh();
            },
            { errorTitle: 'Could not upload video' }
          );
        };

        const removeVideo = async () => {
          const ok = await confirm({
            title: 'Remove the video?',
            message: 'The session stays; only the video is deleted.',
            confirmLabel: 'Remove',
            danger: true,
          });
          if (!ok) return;
          run(
            async () => {
              setPlaying(false);
              await apiDeletePlankVideo(basePath, session.id);
              router.refresh();
            },
            { errorTitle: 'Could not remove video' }
          );
        };

        return (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
              }}
            />

            <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-border/60 pt-2 text-xs">
              {videoUrl ? (
                <>
                  <button
                    type="button"
                    onClick={() => setPlaying((p) => !p)}
                    className="text-accent-400 active:text-accent"
                  >
                    {playing ? 'Hide video' : '▶ Video'}
                  </button>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    className="text-text-muted underline active:text-text-primary disabled:opacity-50"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={removeVideo}
                    disabled={busy}
                    className="text-text-muted underline active:text-fail disabled:opacity-50"
                  >
                    Remove
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  className="text-text-muted underline active:text-text-primary disabled:opacity-50"
                >
                  {busy ? 'Uploading…' : '🎬 Add video'}
                </button>
              )}
            </div>

            {playing && videoUrl && (
              <video
                src={videoUrl}
                controls
                playsInline
                preload="metadata"
                className="mt-2 w-full rounded-btn border border-border bg-black"
              />
            )}
          </>
        );
      }}
    />
  );
}
