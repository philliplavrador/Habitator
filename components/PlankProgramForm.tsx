'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { apiCreatePlankProgram } from '@/lib/client';
import { formatHold, plankProgramDays } from '@/lib/plankFormat';

const MAX_PROGRAM_DAYS = 2000; // mirrors lib/validate.ts
const MAX_TARGET = 7200; // 2h, mirrors lib/validate.ts

/**
 * Create a Plank Progression (the timed sibling of a rep program). You set the
 * day-1 hold, the goal hold, and how many seconds to add each day — the program
 * length is *derived* from those. Each day: hold for the target time to advance;
 * fall short and the day repeats (your streak is safe). On success it jumps to
 * the new program's screen. Durations are entered in whole seconds, with a live
 * m:ss preview.
 */
export default function PlankProgramForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [start, setStart] = useState('30');
  const [end, setEnd] = useState('180');
  const [step, setStep] = useState('15');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nStart = Math.max(1, Math.min(MAX_TARGET, Math.floor(Number(start) || 0)));
  const nEnd = Math.max(1, Math.min(MAX_TARGET, Math.floor(Number(end) || 0)));
  const nStep = Math.max(1, Math.min(3600, Math.floor(Number(step) || 0)));
  const programDays = plankProgramDays(nStart, nEnd, nStep);
  const validRamp = nEnd >= nStart && programDays <= MAX_PROGRAM_DAYS;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim() === '') {
      setError('Name is required.');
      return;
    }
    if (nEnd < nStart) {
      setError('The end time must be at least the start time.');
      return;
    }
    if (programDays > MAX_PROGRAM_DAYS) {
      setError(
        `That goal is ${programDays.toLocaleString()} days away — the most is ${MAX_PROGRAM_DAYS.toLocaleString()}. Start higher, aim lower, or increase by more.`
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const program = await apiCreatePlankProgram({
        name: name.trim(),
        start_seconds: nStart,
        end_seconds: nEnd,
        step_seconds: nStep,
      });
      router.push(`/plank-programs/${program.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the program.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">
        A timed plank that gets a little longer each day. Tell it where you start,
        where you want to finish, and how much to add daily — it works out how long
        that takes. Hold the full time to advance; fall short and the day repeats
        (your streak is safe).
      </p>

      <Field
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Plank Progression"
        autoFocus
        maxLength={200}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Start hold (seconds)"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_TARGET}
          value={start}
          onChange={(e) => setStart(e.target.value)}
          hint={`= ${formatHold(nStart)}`}
        />
        <Field
          label="Goal hold (seconds)"
          type="number"
          inputMode="numeric"
          min={nStart}
          max={MAX_TARGET}
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          hint={`= ${formatHold(nEnd)}`}
        />
        <Field
          label="Increase by (seconds/day)"
          type="number"
          inputMode="numeric"
          min={1}
          max={3600}
          value={step}
          onChange={(e) => setStep(e.target.value)}
          className="col-span-2"
          hint={`Adds ${nStep}s to the target each day`}
        />
      </div>

      <div className="rounded-btn bg-surface2/60 px-3 py-2 text-center text-sm text-text-secondary">
        {validRamp ? (
          <>
            <span className="font-semibold text-text-primary">
              {formatHold(nStart)}
            </span>
            {' → '}
            <span className="font-semibold text-text-primary">
              {formatHold(nEnd)}
            </span>
            <span className="text-text-muted">
              {' '}
              · +{nStep}s/day · {programDays.toLocaleString()}{' '}
              {programDays === 1 ? 'day' : 'days'}
            </span>
          </>
        ) : (
          <span className="text-text-muted">
            {nEnd < nStart
              ? 'The goal hold must be at least the start hold.'
              : `That's ${programDays.toLocaleString()} days — the most is ${MAX_PROGRAM_DAYS.toLocaleString()}.`}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-fail">{error}</p>}

      <Button type="submit" size="lg" fullWidth loading={busy} disabled={!validRamp}>
        Create Plank Progression
      </Button>
    </form>
  );
}
