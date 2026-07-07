'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Field } from './ui/Field';
import { useConfirm } from './ui/confirm';
import EditableHistoryRow from './EditableHistoryRow';
import {
  apiDeleteRepSession,
  apiDeleteRepSetVideo,
  apiDeleteRepVideo,
  apiUpdateReps,
  apiUploadRepSetVideo,
  apiUploadRepVideo,
} from '@/lib/client';
import { formatHuman } from '@/lib/dates';
import type { RepSession } from '@/lib/types';

interface Props {
  /** The program's API base, e.g. '/api/pushups' or '/api/rep-programs/5'. */
  basePath: string;
  sessions: RepSession[];
}

/** Editable log of every session for a rep program, newest first. */
export default function RepProgramHistory({ basePath, sessions }: Props) {
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

/** Target of a pending upload: the whole-workout video, or one set's slot. */
type UploadTarget = { kind: 'workout' } | { kind: 'set'; index: number };

function SessionRow({
  basePath,
  session,
}: {
  basePath: string;
  session: RepSession;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [reps, setReps] = useState<string[]>(session.reps.map(String));
  // Which video is currently expanded in the inline player (its URL), if any.
  const [playing, setPlaying] = useState<string | null>(null);
  const pendingTarget = useRef<UploadTarget | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const workoutUrl = session.video
    ? `${basePath}/${session.id}/video?v=${encodeURIComponent(session.video)}`
    : null;
  const setUrl = (i: number) => {
    const name = session.videos[i];
    return name
      ? `${basePath}/${session.id}/video/${i}?v=${encodeURIComponent(name)}`
      : null;
  };
  const hasAnyVideo = !!workoutUrl || session.videos.some(Boolean);

  async function save() {
    const parsed = reps.map((r) => {
      const n = parseInt(r, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    });
    await apiUpdateReps(basePath, session.id, parsed);
  }

  return (
    <EditableHistoryRow
      confirmCopy={{
        title: 'Delete this session?',
        message:
          'This may roll your current program day back, and removes its videos.',
        confirmLabel: 'Delete',
      }}
      onSave={save}
      onDelete={() => apiDeleteRepSession(basePath, session.id)}
      onCancel={() => setReps(session.reps.map(String))}
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
            {hasAnyVideo && <span className="text-xs text-text-muted">🎬</span>}
          </div>
          <p className="mt-0.5 text-sm tabular-nums text-text-secondary">
            {session.reps.join(' · ')}{' '}
            <span className="text-text-faint">/ {session.target.join(' · ')}</span>
          </p>
          <p className="text-xs text-text-faint">{formatHuman(session.date)}</p>
        </>
      }
      editForm={
        <>
          <div className="mb-2 text-sm font-semibold text-text-secondary">
            Day {session.day_index} · target {session.target.join(' · ')}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {session.reps.map((_, i) => (
              <Field
                key={i}
                label={`Set ${i + 1}`}
                type="number"
                inputMode="numeric"
                min={0}
                value={reps[i] ?? ''}
                onChange={(e) => {
                  const next = [...reps];
                  next[i] = e.target.value;
                  setReps(next);
                }}
              />
            ))}
          </div>
        </>
      }
      extraActions={({ busy, run }) => {
        const upload = (file: File) => {
          const target = pendingTarget.current;
          pendingTarget.current = null;
          if (fileRef.current) fileRef.current.value = '';
          if (!target) return;
          run(
            async () => {
              if (target.kind === 'workout') {
                await apiUploadRepVideo(basePath, session.id, file);
              } else {
                await apiUploadRepSetVideo(basePath, session.id, target.index, file);
              }
              // Collapse any open player: a replace mints a new filename, so the
              // `playing` URL would otherwise point at the now-deleted old file
              // and the toggle label would desync. Re-open to see the new video.
              setPlaying(null);
              router.refresh();
            },
            { errorTitle: 'Could not upload video' }
          );
        };

        const pick = (target: UploadTarget) => {
          pendingTarget.current = target;
          fileRef.current?.click();
        };

        const removeWorkout = async () => {
          const ok = await confirm({
            title: 'Remove the workout video?',
            message: 'The session stays; only the video is deleted.',
            confirmLabel: 'Remove',
            danger: true,
          });
          if (!ok) return;
          run(
            async () => {
              if (playing === workoutUrl) setPlaying(null);
              await apiDeleteRepVideo(basePath, session.id);
              router.refresh();
            },
            { errorTitle: 'Could not remove video' }
          );
        };

        const removeSet = async (i: number) => {
          const ok = await confirm({
            title: `Remove the set ${i + 1} video?`,
            message: 'The session stays; only the video is deleted.',
            confirmLabel: 'Remove',
            danger: true,
          });
          if (!ok) return;
          run(
            async () => {
              if (playing === setUrl(i)) setPlaying(null);
              await apiDeleteRepSetVideo(basePath, session.id, i);
              router.refresh();
            },
            { errorTitle: 'Could not remove video' }
          );
        };

        const toggle = (url: string) =>
          setPlaying((cur) => (cur === url ? null : url));

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

            <div className="mt-2 flex flex-col gap-2 border-t border-border/60 pt-2 text-xs">
              {/* Whole-workout video (the guided one-take recording). */}
              <div className="flex flex-wrap items-center gap-3">
                {workoutUrl ? (
                  <>
                    <button
                      type="button"
                      onClick={() => toggle(workoutUrl)}
                      className="text-accent-400 active:text-accent"
                    >
                      {playing === workoutUrl ? 'Hide workout' : '▶ Workout video'}
                    </button>
                    <button
                      type="button"
                      onClick={() => pick({ kind: 'workout' })}
                      disabled={busy}
                      className="text-text-muted underline active:text-text-primary disabled:opacity-50"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={removeWorkout}
                      disabled={busy}
                      className="text-text-muted underline active:text-fail disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => pick({ kind: 'workout' })}
                    disabled={busy}
                    className="text-text-muted underline active:text-text-primary disabled:opacity-50"
                  >
                    {busy ? 'Uploading…' : '🎬 Add workout video'}
                  </button>
                )}
              </div>

              {/* Per-set videos: play/remove if present, add if empty. */}
              <div className="flex flex-wrap items-center gap-2">
                {session.videos.map((_, i) => {
                  const url = setUrl(i);
                  return url ? (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-btn border border-border bg-surface2/60 px-2 py-1"
                    >
                      <button
                        type="button"
                        onClick={() => toggle(url)}
                        className="text-accent-400 active:text-accent"
                      >
                        {playing === url ? `Hide set ${i + 1}` : `▶ Set ${i + 1}`}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSet(i)}
                        disabled={busy}
                        aria-label={`Remove set ${i + 1} video`}
                        className="text-text-muted active:text-fail disabled:opacity-50"
                      >
                        ✕
                      </button>
                    </span>
                  ) : (
                    <button
                      key={i}
                      type="button"
                      onClick={() => pick({ kind: 'set', index: i })}
                      disabled={busy}
                      className="rounded-btn border border-dashed border-border px-2 py-1 text-text-muted active:bg-surface2 disabled:opacity-50"
                    >
                      🎬 Set {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {playing && (
              <video
                src={playing}
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
