// Client-safe duration formatting for plank programs. No server imports, so this
// is safe to bundle into client components (the card, timer, history, summary).

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function pad3(n: number): string {
  return n < 10 ? `00${n}` : n < 100 ? `0${n}` : String(n);
}

/**
 * Compact hold label from whole seconds: "0:30", "1:30", "1:05:00". Minutes are
 * always shown; hours only when non-zero. Used for targets, "amount lasted", and
 * the finish label.
 */
export function formatHold(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${m}:${pad2(sec)}`;
}

/**
 * The live guided-recording clock: HH:MM:SS:MMM (millisecond precision) from a
 * millisecond duration. Clamped at zero so a slight overrun never shows negative.
 */
export function formatTimerMs(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms));
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}:${pad3(millis)}`;
}

/** Split whole seconds into {minutes, seconds} for a min:sec input pair. */
export function toMinSec(totalSeconds: number): { minutes: number; seconds: number } {
  const s = Math.max(0, Math.floor(totalSeconds));
  return { minutes: Math.floor(s / 60), seconds: s % 60 };
}

/**
 * Days in the hold ramp start→end by step: each day adds `step` seconds and the
 * final day caps at `end`, so the count is ceil((end - start) / step) + 1. Lives
 * here (client-safe) so both the server validator and the creation form can use
 * it. Assumes end >= start and step >= 1 (the validator enforces both).
 */
export function plankProgramDays(
  startSeconds: number,
  endSeconds: number,
  stepSeconds: number
): number {
  return Math.ceil((endSeconds - startSeconds) / stepSeconds) + 1;
}
