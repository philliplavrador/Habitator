'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Field } from './ui/Field';
import { useConfirm } from './ui/confirm';
import EditableHistoryRow from './EditableHistoryRow';
import {
  apiDeleteRepSession,
  apiDeleteRepVideo,
  apiUpdateReps,
  apiUploadRepVideo,
} from '@/lib/client';
import { formatHuman } from '@/lib/dates';
import type { RepProgramKey, RepSession } from '@/lib/types';

interface Props {
  program: RepProgramKey;
  sessions: RepSession[];
}

/** Editable log of every session for a rep program, newest first. */
export default function RepProgramHistory({ program, sessions }: Props) {
  if (sessions.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-base font-bold text-text-primary">Session history</h2>
      <ul className="flex flex-col gap-2">
        {sessions.map((s) => (
          <SessionRow key={s.id} program={program} session={s} />
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
  program,
  session,
}: {
  program: RepProgramKey;
  session: RepSession;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [reps, setReps] = useState<string[]>(session.reps.map(String));
  const [showVideo, setShowVideo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const videoUrl = session.video
    ? `/api/${program}/${session.id}/video?v=${encodeURIComponent(session.video)}`
    : null;

  async function save() {
    const parsed = reps.map((r) => {
      const n = parseInt(r, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    });
    await apiUpdateReps(program, session.id, parsed);
  }

  return (
    <EditableHistoryRow
      confirmCopy={{
        title: 'Delete this session?',
        message: 'This may roll your current program day back, and removes its video.',
        confirmLabel: 'Delete',
      }}
      onSave={save}
      onDelete={() => apiDeleteRepSession(program, session.id)}
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
            {videoUrl && <span className="text-xs text-text-muted">🎬</span>}
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
        const uploadVideo = (file: File) =>
          run(
            async () => {
              await apiUploadRepVideo(program, session.id, file);
              setShowVideo(true);
              router.refresh();
            },
            {
              errorTitle: 'Could not upload video',
              onFinally: () => {
                if (fileRef.current) fileRef.current.value = '';
              },
            },
          );

        const removeVideo = async () => {
          const ok = await confirm({
            title: 'Remove this video?',
            message: 'The session stays; only the video is deleted.',
            confirmLabel: 'Remove',
            danger: true,
          });
          if (!ok) return;
          run(
            async () => {
              await apiDeleteRepVideo(program, session.id);
              setShowVideo(false);
              router.refresh();
            },
            { errorTitle: 'Could not remove video' },
          );
        };

        return (
          <>
            {/* Optional video: play inline, replace, or remove; add if none yet. */}
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadVideo(f);
              }}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-border/60 pt-2 text-xs">
              {videoUrl ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowVideo((v) => !v)}
                    className="text-accent-400 active:text-accent"
                  >
                    {showVideo ? 'Hide video' : '▶ Play video'}
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
                    Remove video
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

            {videoUrl && showVideo && (
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
