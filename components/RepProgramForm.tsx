'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { apiCreateRepProgram } from '@/lib/client';

const MAX_PROGRAM_DAYS = 2000; // mirrors lib/validate.ts

/** "54" → "3 × 18" when it divides evenly, else "54 reps". */
function perSet(total: number, sets: number): string {
  return total % sets === 0 ? `${sets} × ${total / sets}` : `${total} reps`;
}

/**
 * Create a user-defined rep program (the configurable "template instance", the
 * generalization of pushups/pullups). Progression adds 1 rep/day to the total,
 * spread across the sets — so the program length is *derived* from where you
 * start and where you want to finish (day 1 → goal), rather than being a third
 * number the user has to work out. On success it jumps to the new program's
 * screen.
 */
export default function RepProgramForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sets, setSets] = useState('3');
  const [day1, setDay1] = useState('54');
  const [goal, setGoal] = useState('300');
  const [rest, setRest] = useState('90');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nSets = Math.max(1, Math.floor(Number(sets) || 1));
  const nDay1 = Math.max(nSets, Math.floor(Number(day1) || nSets));
  const nGoal = Math.floor(Number(goal) || 0);
  // One rep is added to the total each day, so day 1 = nDay1 and the last day
  // is nGoal — that's (nGoal - nDay1) additions, i.e. one more day than that.
  const programDays = nGoal - nDay1 + 1;
  const validGoal = nGoal >= nDay1 && programDays <= MAX_PROGRAM_DAYS;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim() === '') {
      setError('Name is required.');
      return;
    }
    if (nGoal < nDay1) {
      setError('The goal must be at least the day-1 total.');
      return;
    }
    if (programDays > MAX_PROGRAM_DAYS) {
      setError(
        `That goal is ${programDays.toLocaleString()} days away — the most is ${MAX_PROGRAM_DAYS.toLocaleString()}. Start higher or aim lower.`
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const program = await apiCreateRepProgram({
        name: name.trim(),
        sets: nSets,
        day1_total: nDay1,
        program_days: programDays,
        rest_seconds: Math.max(0, Math.min(3600, Math.floor(Number(rest) || 0))),
      });
      router.push(`/rep-programs/${program.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the program.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">
        A ramping strength program (like Pushups/Pullups) that adds one rep a day.
        Tell it where you start and where you want to finish — it works out how
        long that takes. Log each day’s sets: hit every target to advance and add
        a rep; fall short and the day repeats (your streak is safe).
      </p>

      <Field
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Squats"
        autoFocus
        maxLength={200}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Sets per day"
          type="number"
          min={1}
          max={10}
          value={sets}
          onChange={(e) => setSets(e.target.value)}
        />
        <Field
          label="Rest between sets (s)"
          type="number"
          min={0}
          max={3600}
          value={rest}
          onChange={(e) => setRest(e.target.value)}
        />
        <Field
          label="Day-1 total reps"
          type="number"
          min={nSets}
          value={day1}
          onChange={(e) => setDay1(e.target.value)}
          hint={`Across all sets — ${perSet(nDay1, nSets)}`}
        />
        <Field
          label="Goal total reps"
          type="number"
          min={nDay1}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          hint={
            nGoal >= nSets ? `Finish at ${perSet(nGoal, nSets)}` : 'Across all sets'
          }
        />
      </div>

      <div className="rounded-btn bg-surface2/60 px-3 py-2 text-center text-sm text-text-secondary">
        {validGoal ? (
          <>
            <span className="font-semibold text-text-primary">
              {perSet(nDay1, nSets)}
            </span>
            {' → '}
            <span className="font-semibold text-text-primary">
              {perSet(nGoal, nSets)}
            </span>
            <span className="text-text-muted">
              {' '}
              · {programDays.toLocaleString()}{' '}
              {programDays === 1 ? 'day' : 'days'}
            </span>
          </>
        ) : (
          <span className="text-text-muted">
            {nGoal < nDay1
              ? 'The goal must be at least the day-1 total.'
              : `That’s ${programDays.toLocaleString()} days — the most is ${MAX_PROGRAM_DAYS.toLocaleString()}.`}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-fail">{error}</p>}

      <Button type="submit" size="lg" fullWidth loading={busy} disabled={!validGoal}>
        Create program
      </Button>
    </form>
  );
}
