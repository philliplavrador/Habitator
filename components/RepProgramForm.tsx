'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { apiCreateRepProgram } from '@/lib/client';

/**
 * Create a user-defined rep program (the configurable "template instance", the
 * generalization of pushups/pullups). Progression adds 1 rep/day to the total,
 * spread across the sets — so day-1 total → day-1-total + (length − 1) at the
 * end. On success it jumps to the new program's screen.
 */
export default function RepProgramForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sets, setSets] = useState('3');
  const [day1, setDay1] = useState('30');
  const [days, setDays] = useState('60');
  const [rest, setRest] = useState('90');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nSets = Math.max(1, Math.floor(Number(sets) || 1));
  const nDay1 = Math.max(nSets, Math.floor(Number(day1) || nSets));
  const nDays = Math.max(1, Math.floor(Number(days) || 1));
  const finalTotal = nDay1 + (nDays - 1);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim() === '') {
      setError('Name is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const program = await apiCreateRepProgram({
        name: name.trim(),
        sets: nSets,
        day1_total: nDay1,
        program_days: nDays,
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
        Log each day’s sets — hit every target to advance and add a rep; fall
        short and the day repeats (your streak is safe).
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
          hint="Across all sets"
        />
        <Field
          label="Program length (days)"
          type="number"
          min={1}
          max={2000}
          value={days}
          onChange={(e) => setDays(e.target.value)}
        />
      </div>

      <div className="rounded-btn bg-surface2/60 px-3 py-2 text-center text-sm text-text-secondary">
        Day 1: <span className="font-semibold text-text-primary">{nDay1}</span> reps
        {' → '}
        Day {nDays}: <span className="font-semibold text-text-primary">{finalTotal}</span> reps
        <span className="text-text-muted"> · {nSets} sets/day</span>
      </div>

      {error && <p className="text-sm text-fail">{error}</p>}

      <Button type="submit" size="lg" fullWidth loading={busy}>
        Create program
      </Button>
    </form>
  );
}
