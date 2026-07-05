'use client';

import { useCallback } from 'react';

// Brand confetti palette (indigo → violet + a pass-green + a light fleck).
const COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#22c55e', '#e8eaed'];

function prefersReduced(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// canvas-confetti is a client-only lib pulling in a canvas; import it lazily so
// it never touches SSR and only loads the first time something celebrates.
async function load() {
  const mod = await import('canvas-confetti');
  return mod.default;
}

/**
 * Celebration bursts for the app's satisfying moments. Every preset no-ops under
 * prefers-reduced-motion. Presets:
 *  - burst():     a single pop (a goal met, a day completed)
 *  - perfectDay(): dual side cannons (every habit done today)
 *  - milestone(n): a bigger blast, scaled to the streak length
 */
export function useCelebration() {
  const burst = useCallback(async () => {
    if (prefersReduced()) return;
    const confetti = await load();
    confetti({
      particleCount: 90,
      spread: 75,
      startVelocity: 38,
      origin: { y: 0.7 },
      colors: COLORS,
      disableForReducedMotion: true,
    });
  }, []);

  const perfectDay = useCallback(async () => {
    if (prefersReduced()) return;
    const confetti = await load();
    const common = {
      particleCount: 70,
      spread: 65,
      startVelocity: 45,
      ticks: 220,
      colors: COLORS,
      disableForReducedMotion: true,
    } as const;
    confetti({ ...common, angle: 60, origin: { x: 0, y: 0.7 } });
    confetti({ ...common, angle: 120, origin: { x: 1, y: 0.7 } });
    confetti({ ...common, angle: 90, spread: 100, origin: { x: 0.5, y: 0.6 } });
  }, []);

  const milestone = useCallback(async (streak: number) => {
    if (prefersReduced()) return;
    const confetti = await load();
    const particleCount = streak >= 100 ? 220 : streak >= 30 ? 150 : 100;
    confetti({
      particleCount,
      spread: 110,
      startVelocity: 50,
      ticks: 260,
      origin: { y: 0.6 },
      colors: COLORS,
      disableForReducedMotion: true,
    });
  }, []);

  return { burst, perfectDay, milestone };
}
