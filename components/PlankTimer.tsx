'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Button from './ui/Button';
import { heroInputClass } from './HeroLogCard';
import { formatHold, formatTimerMs } from '@/lib/plankFormat';

interface Props {
  /** The day's prescribed hold, in seconds. */
  targetSeconds: number;
  /** The program name — used only for the recording filename. */
  label: string;
  /** True while the parent is saving (log + upload) — disables the save button. */
  busy: boolean;
  /** Called with the seconds held and the recording. */
  onSave: (lasted: number, video: File) => void;
  /** Called to leave guided mode (back to manual entry). */
  onCancel: () => void;
}

type Phase = 'intro' | 'ready' | 'prep' | 'active' | 'review' | 'error';
type Facing = 'environment' | 'user';

// Get-into-position countdown before the hold starts (and before recording).
const PREP_SECONDS = 15;

// Auto-stop guard: a runaway recording that blows past the server cap would be
// rejected on upload, losing everything — so stop well before that.
const MAX_RECORDING_MS = 18 * 60 * 1000;

/** Prefer a universally-playable container; fall back to whatever's supported. */
function pickMimeType(): string | undefined {
  const candidates = [
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const c of candidates) {
    if (
      typeof MediaRecorder !== 'undefined' &&
      MediaRecorder.isTypeSupported(c)
    ) {
      return c;
    }
  }
  return undefined;
}

/**
 * The guided "record your plank" flow. Open the camera, tap start, get a 15-second
 * countdown to drop into position, then recording begins and a millisecond clock
 * counts DOWN to the day's target; once the target passes it flips to a "goal
 * reached" stopwatch counting the bonus hold up. Stop whenever you drop — the
 * elapsed hold is measured and prefilled for review, then the parent logs the
 * session and attaches the one video.
 *
 * Everything camera-related is feature-detected and cleaned up on unmount; if
 * recording isn't available it surfaces an error with a way back to manual entry.
 */
export default function PlankTimer({
  targetSeconds,
  label,
  busy,
  onSave,
  onCancel,
}: Props) {
  const targetMs = targetSeconds * 1000;

  const [phase, setPhase] = useState<Phase>('intro');
  const [facing, setFacing] = useState<Facing>('environment');
  const [errorMsg, setErrorMsg] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [prep, setPrep] = useState(PREP_SECONDS);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [reachedGoal, setReachedGoal] = useState(false);
  const [lasted, setLasted] = useState(String(targetSeconds));

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const videoUrlRef = useRef<string | null>(null);
  const recStartRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const videoFileRef = useRef<File | null>(null);
  const mountedRef = useRef(true);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const stopRecorder = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        /* already stopping */
      }
    }
  }, []);

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const revokeUrl = useCallback(() => {
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = null;
    }
  }, []);

  // Tear everything down when the component leaves (mode switch / save / nav).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopRaf();
      stopRecorder();
      stopCamera();
      revokeUrl();
    };
  }, [stopRaf, stopCamera, stopRecorder, revokeUrl]);

  // Keep the live preview wired to the active stream whenever it's on screen.
  const attachPreview = useCallback((el: HTMLVideoElement | null) => {
    previewRef.current = el;
    if (el && streamRef.current) {
      el.srcObject = streamRef.current;
      el.play().catch(() => {});
    }
  }, []);

  // ── Prep countdown: ticks while in 'prep'; at 0, starts recording. ──
  useEffect(() => {
    if (phase !== 'prep') return;
    if (prep <= 0) {
      beginRecording();
      return;
    }
    const id = setTimeout(() => setPrep((p) => p - 1), 1000);
    return () => clearTimeout(id);
    // beginRecording is stable enough for this effect; prep/phase drive it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, prep]);

  async function openCamera(nextFacing?: Facing) {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setErrorMsg(
        'Recording isn’t supported in this browser. Use “Type time” instead.'
      );
      setPhase('error');
      return;
    }
    const use = nextFacing ?? facing;
    const video = { facingMode: use, width: { ideal: 1280 }, height: { ideal: 720 } };
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      }
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      stopCamera(); // drop any prior stream (e.g. when flipping cameras)
      streamRef.current = stream;
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        previewRef.current.play().catch(() => {});
      }
      setPhase('ready');
    } catch {
      setErrorMsg(
        'Couldn’t access the camera. Grant camera permission, or use “Type time”.'
      );
      setPhase('error');
    }
  }

  function flipCamera() {
    const next: Facing = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
    openCamera(next);
  }

  function startPrep() {
    if (!streamRef.current) {
      setErrorMsg('Camera is not ready. Try again.');
      setPhase('error');
      return;
    }
    setPrep(PREP_SECONDS);
    setPhase('prep');
  }

  // The rAF loop: advance the on-screen clock and flip to the bonus stopwatch
  // once the target passes. Reads a monotonic clock so it never drifts. The hard
  // MAX_RECORDING_MS cap is NOT enforced here — rAF is paused while the tab is
  // hidden, so a backgrounded recording would never be capped; the cap lives in
  // recorder.ondataavailable, which fires every timeslice regardless of visibility.
  function tick() {
    const ms = performance.now() - recStartRef.current;
    setElapsedMs(ms);
    if (ms >= targetMs) setReachedGoal(true);
    rafRef.current = requestAnimationFrame(tick);
  }

  function beginRecording() {
    const stream = streamRef.current;
    if (!stream) {
      setErrorMsg('Camera is not ready. Try again.');
      setPhase('error');
      return;
    }
    const mimeType = pickMimeType();
    chunksRef.current = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 1_200_000,
        audioBitsPerSecond: 128_000,
      });
    } catch {
      setErrorMsg('Recording failed to start. Use “Type time” instead.');
      setPhase('error');
      return;
    }
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      // Authoritative auto-stop cap: this fires every timeslice even while the
      // tab is backgrounded (unlike the rAF clock), so a hidden recording is
      // still stopped before it grows past the server's upload limit and the
      // whole session is lost. Mirrors GuidedWorkout's guard.
      if (performance.now() - recStartRef.current > MAX_RECORDING_MS) {
        stopRecorder();
      }
    };
    recorder.onstop = () => {
      // Fired after an unmount (e.g. mode switched mid-recording)? Don't mint an
      // object URL nothing would ever revoke (it would pin the blob in memory).
      if (!mountedRef.current) return;
      const type = recorder.mimeType || mimeType || 'video/webm';
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunksRef.current, { type });
      const file = new File([blob], `${label.toLowerCase()}-plank.${ext}`, { type });
      videoFileRef.current = file;
      revokeUrl();
      const url = URL.createObjectURL(blob);
      videoUrlRef.current = url;
      setVideoUrl(url);
      // Freeze the measured hold as the prefilled "seconds lasted".
      const measuredMs = performance.now() - recStartRef.current;
      setLasted(String(Math.max(0, Math.round(measuredMs / 1000))));
      stopCamera();
      setPhase('review');
    };
    recStartRef.current = performance.now();
    setElapsedMs(0);
    setReachedGoal(false);
    recorder.start(1000); // emit a chunk every second (robust; survives a crash)
    recorderRef.current = recorder;
    setPhase('active');
    rafRef.current = requestAnimationFrame(tick);
  }

  // Stop the rAF loop as soon as we leave the active phase.
  useEffect(() => {
    if (phase !== 'active') stopRaf();
  }, [phase, stopRaf]);

  function finishHold() {
    stopRecorder(); // → onstop → review
  }

  function handleSave() {
    const file = videoFileRef.current;
    if (!file) return;
    const n = parseInt(lasted, 10);
    onSave(Number.isFinite(n) && n >= 0 ? n : 0, file);
  }

  function redo() {
    revokeUrl();
    setVideoUrl(null);
    videoFileRef.current = null;
    chunksRef.current = [];
    setElapsedMs(0);
    setReachedGoal(false);
    setLasted(String(targetSeconds));
    setPhase('intro');
  }

  const remainingMs = Math.max(0, targetMs - elapsedMs);

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="mt-3 flex flex-col gap-3">
      {/* Live camera preview (shown once open, through prep + active). */}
      {(phase === 'ready' || phase === 'prep' || phase === 'active') && (
        <div className="relative overflow-hidden rounded-btn border border-border bg-black">
          <video
            ref={attachPreview}
            muted
            playsInline
            autoPlay
            className="aspect-video w-full object-cover"
          />
          {phase === 'active' && (
            <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded-btn bg-black/60 px-2 py-1 text-xs font-semibold text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-fail" />
              REC
            </span>
          )}
          {phase === 'prep' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 text-center">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/80">
                Get into position
              </span>
              <span className="font-mono text-6xl font-bold tabular-nums text-white">
                {prep}
              </span>
              <span className="mt-1 text-xs text-white/70">
                Hold starts at 0 · goal {formatHold(targetSeconds)}
              </span>
            </div>
          )}
        </div>
      )}

      {phase === 'intro' && (
        <div className="flex flex-col gap-2 text-center">
          <p className="text-xs text-text-muted">
            Records your plank. After a {PREP_SECONDS}-second countdown to get set,
            a timer counts down to today’s {formatHold(targetSeconds)} goal — hold
            as long as you can.
          </p>
          <Button fullWidth size="lg" onClick={() => openCamera()}>
            📷 Open camera
          </Button>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-text-muted underline active:text-text-primary"
          >
            Cancel
          </button>
        </div>
      )}

      {phase === 'ready' && (
        <div className="flex flex-col gap-2">
          <p className="text-center text-xs text-text-muted">
            Frame yourself, then start — you’ll get{' '}
            <span className="font-semibold text-text-secondary">
              {PREP_SECONDS} seconds
            </span>{' '}
            to get into position. Goal today is{' '}
            <span className="font-semibold text-text-secondary">
              {formatHold(targetSeconds)}
            </span>
            .
          </p>
          <Button fullWidth size="lg" onClick={startPrep}>
            ● Start · {PREP_SECONDS}s to get set
          </Button>
          <div className="flex items-center justify-center gap-4 text-xs">
            <button
              type="button"
              onClick={flipCamera}
              className="text-text-secondary underline active:text-text-primary"
            >
              🔄 Flip camera
            </button>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onCancel();
              }}
              className="text-text-muted underline active:text-text-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {phase === 'active' && (
        <div className="flex flex-col items-center gap-2 text-center">
          {reachedGoal ? (
            <>
              <p className="text-sm font-semibold text-pass">
                Goal reached 💪 · holding the bonus
              </p>
              <span className="font-mono text-4xl font-bold tabular-nums text-pass">
                {formatTimerMs(elapsedMs)}
              </span>
              <span className="text-xs text-text-muted">
                held · goal {formatHold(targetSeconds)} ✓
              </span>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-text-primary">
                Hold to goal {formatHold(targetSeconds)}
              </p>
              <span className="font-mono text-4xl font-bold tabular-nums text-text-primary">
                {formatTimerMs(remainingMs)}
              </span>
              <span className="text-xs text-text-muted">left to reach the goal</span>
            </>
          )}
          <Button fullWidth size="lg" onClick={finishHold}>
            ■ Stop hold
          </Button>
        </div>
      )}

      {phase === 'review' && (
        <div className="flex flex-col gap-3">
          <p className="text-center text-sm font-semibold text-text-primary">
            Review &amp; save
          </p>
          {videoUrl && (
            <video
              src={videoUrl}
              controls
              playsInline
              className="w-full rounded-btn border border-border bg-black"
            />
          )}
          <label className="flex flex-col gap-1">
            <span className="text-center text-xs text-text-muted">
              Seconds held (goal {formatHold(targetSeconds)})
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className={heroInputClass}
              value={lasted}
              onChange={(e) => setLasted(e.target.value)}
            />
            <span className="text-center text-xs text-text-faint">
              = {formatHold(parseInt(lasted, 10) || 0)}
            </span>
          </label>
          <Button fullWidth size="lg" onClick={handleSave} disabled={busy}>
            {busy ? 'Saving…' : 'Save plank'}
          </Button>
          <button
            type="button"
            onClick={redo}
            disabled={busy}
            className="text-xs text-text-muted underline active:text-text-primary disabled:opacity-50"
          >
            Discard &amp; re-record
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="flex flex-col gap-2 text-center">
          <p className="rounded-btn bg-fail/10 px-3 py-2 text-xs text-text-secondary">
            {errorMsg}
          </p>
          <Button fullWidth onClick={onCancel}>
            Switch to typing time
          </Button>
          <button
            type="button"
            onClick={() => openCamera()}
            className="text-xs text-text-muted underline active:text-text-primary"
          >
            Try the camera again
          </button>
        </div>
      )}
    </div>
  );
}
