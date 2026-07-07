'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Button from './ui/Button';
import { heroInputClass } from './HeroLogCard';

interface Props {
  /** Per-set goals for the current program day (length === sets). */
  target: number[];
  /** Rest between sets, in seconds (from the program config). */
  restSeconds: number;
  /** "Pushups" | "Pullups" — used only for copy. */
  label: string;
  /** True while the parent is saving (log + upload) — disables the save button. */
  busy: boolean;
  /** Called with the entered reps and the single whole-workout recording. */
  onSave: (reps: number[], video: File) => void;
  /** Called to leave guided mode (back to manual entry). */
  onCancel: () => void;
}

type Phase = 'intro' | 'ready' | 'active' | 'resting' | 'review' | 'error';
type Facing = 'environment' | 'user';

// Auto-stop guard: a runaway recording that blows past the server cap would be
// rejected on upload, losing everything — so stop well before that (~18 min at
// ~1.2 Mbps ≈ 160 MB, under the 200 MB cap).
const MAX_RECORDING_MS = 18 * 60 * 1000;

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

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
  return undefined; // let the browser choose its default
}

/**
 * The guided "record your workout" flow for a rep program. Opens the camera and
 * runs ONE continuous recording across every set and rest: tap to start, "finish
 * set" kicks off the rest countdown, which auto-starts the next set, and
 * "finish workout" stops the single recording. Then you confirm reps per set and
 * save — the parent logs the session and attaches the one video.
 *
 * Everything camera-related is feature-detected and cleaned up on unmount; if
 * recording isn't available the component surfaces an error with a way back to
 * manual entry.
 */
export default function GuidedWorkout({
  target,
  restSeconds,
  label,
  busy,
  onSave,
  onCancel,
}: Props) {
  const sets = target.length;

  const [phase, setPhase] = useState<Phase>('intro');
  const [setIndex, setSetIndex] = useState(0);
  const [reps, setReps] = useState<string[]>(target.map(String));
  const [rest, setRest] = useState(restSeconds);
  const [facing, setFacing] = useState<Facing>('environment');
  const [errorMsg, setErrorMsg] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const videoUrlRef = useRef<string | null>(null);
  const recStartRef = useRef<number>(0);
  const videoFileRef = useRef<File | null>(null);
  // Guards async callbacks (getUserMedia resolve, recorder.onstop) that can fire
  // AFTER the component unmounts — without it, a late-resolving stream or a
  // post-stop blob URL would be created on a dead instance and never cleaned up.
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
      stopRecorder();
      stopCamera();
      revokeUrl();
    };
  }, [stopCamera, stopRecorder, revokeUrl]);

  // Keep the live preview wired to the active stream whenever it's on screen.
  const attachPreview = useCallback((el: HTMLVideoElement | null) => {
    previewRef.current = el;
    if (el && streamRef.current) {
      el.srcObject = streamRef.current;
      el.play().catch(() => {});
    }
  }, []);

  // ── Rest countdown: ticks while resting; at 0, auto-starts the next set. ──
  useEffect(() => {
    if (phase !== 'resting') return;
    if (rest <= 0) {
      setSetIndex((i) => i + 1);
      setPhase('active');
      return;
    }
    const id = setTimeout(() => setRest((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, rest]);

  async function openCamera(nextFacing?: Facing) {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setErrorMsg(
        'Recording isn’t supported in this browser. Use “Type reps” instead.'
      );
      setPhase('error');
      return;
    }
    const use = nextFacing ?? facing;
    const video = { facingMode: use, width: { ideal: 1280 }, height: { ideal: 720 } };
    try {
      let stream: MediaStream;
      try {
        // Record sound alongside the video…
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
      } catch {
        // …but if the mic is denied or there isn't one, fall back to video-only
        // so the recording still works (a NotAllowedError on the camera itself
        // rejects again here and drops to the outer catch → error state).
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      }
      // Unmounted while the camera was opening: the unmount cleanup already ran
      // (with streamRef still null), so stop these tracks here or the camera
      // would stay live on a dead instance until the page is closed.
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
        'Couldn’t access the camera. Grant camera permission, or use “Type reps”.'
      );
      setPhase('error');
    }
  }

  function flipCamera() {
    const next: Facing = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
    openCamera(next); // re-open immediately with the new camera
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
        audioBitsPerSecond: 128_000, // ignored if the stream has no audio track
      });
    } catch {
      setErrorMsg('Recording failed to start. Use “Type reps” instead.');
      setPhase('error');
      return;
    }
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      if (Date.now() - recStartRef.current > MAX_RECORDING_MS) stopRecorder();
    };
    recorder.onstop = () => {
      // Fired after an unmount (e.g. mode switched mid-recording)? The cleanup
      // already stopped the camera; don't mint an object URL that nothing would
      // ever revoke (it would pin the whole recording blob in memory).
      if (!mountedRef.current) return;
      const type = recorder.mimeType || mimeType || 'video/webm';
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunksRef.current, { type });
      const file = new File([blob], `${label.toLowerCase()}-workout.${ext}`, { type });
      videoFileRef.current = file;
      revokeUrl();
      const url = URL.createObjectURL(blob);
      videoUrlRef.current = url;
      setVideoUrl(url);
      stopCamera();
      setPhase('review');
    };
    recStartRef.current = Date.now();
    recorder.start(1000); // emit a chunk every second (robust; feeds the guard)
    recorderRef.current = recorder;
    setSetIndex(0);
    setPhase('active');
  }

  function finishSet() {
    if (setIndex < sets - 1) {
      setRest(restSeconds);
      setPhase('resting');
    } else {
      stopRecorder(); // → onstop → review
    }
  }

  function skipRest() {
    setRest(0); // the countdown effect advances to the next set at 0
  }

  function updateRep(i: number, value: string) {
    setReps((prev) => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
  }

  function handleSave() {
    const file = videoFileRef.current;
    if (!file) return;
    const parsed = reps.map((r) => {
      const n = parseInt(r, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    });
    onSave(parsed, file);
  }

  function redo() {
    revokeUrl();
    setVideoUrl(null);
    videoFileRef.current = null;
    chunksRef.current = [];
    setReps(target.map(String));
    setSetIndex(0);
    setPhase('intro');
  }

  const recording = phase === 'active' || phase === 'resting';

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="mt-3 flex flex-col gap-3">
      {/* Live camera preview (shown once the camera is open, hidden in review). */}
      {(phase === 'ready' || recording) && (
        <div className="relative overflow-hidden rounded-btn border border-border bg-black">
          <video
            ref={attachPreview}
            muted
            playsInline
            autoPlay
            className="aspect-video w-full object-cover"
          />
          {recording && (
            <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded-btn bg-black/60 px-2 py-1 text-xs font-semibold text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-fail" />
              REC
            </span>
          )}
        </div>
      )}

      {phase === 'intro' && (
        <div className="flex flex-col gap-2 text-center">
          <p className="text-xs text-text-muted">
            Records one continuous video across all {sets} sets and rests. You’ll
            enter reps and save at the end.
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
            Frame yourself, then start — Set 1 goal is{' '}
            <span className="font-semibold text-text-secondary">{target[0]}</span>.
          </p>
          <Button fullWidth size="lg" onClick={beginRecording}>
            ● Start recording · Set 1
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
        <div className="flex flex-col gap-3">
          <p className="text-center text-sm font-semibold text-text-primary">
            Set {setIndex + 1} of {sets} · goal {target[setIndex]}
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-center text-xs text-text-muted">
              Reps this set
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className={heroInputClass}
              value={reps[setIndex] ?? ''}
              onChange={(e) => updateRep(setIndex, e.target.value)}
            />
          </label>
          <Button fullWidth size="lg" onClick={finishSet}>
            {setIndex < sets - 1
              ? `Finish set ${setIndex + 1} → rest`
              : 'Finish workout ✓'}
          </Button>
        </div>
      )}

      {phase === 'resting' && (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-xs text-text-muted">
            Rest — Set {setIndex + 2} of {sets} starts automatically
          </p>
          <span className="font-mono text-4xl font-bold tabular-nums text-text-primary">
            {clock(rest)}
          </span>
          <button
            type="button"
            onClick={skipRest}
            className="rounded-btn border border-border px-3 py-2 text-sm text-text-secondary active:bg-surface2"
          >
            Skip rest → Set {setIndex + 2}
          </button>
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
          <div className="grid grid-cols-3 gap-2">
            {target.map((t, i) => (
              <label key={i} className="flex flex-col gap-1">
                <span className="text-center text-xs text-text-muted">
                  Set {i + 1} · goal {t}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className={heroInputClass}
                  value={reps[i] ?? ''}
                  onChange={(e) => updateRep(i, e.target.value)}
                />
              </label>
            ))}
          </div>
          <Button fullWidth size="lg" onClick={handleSave} disabled={busy}>
            {busy ? 'Saving…' : 'Save workout'}
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
            Switch to typing reps
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
