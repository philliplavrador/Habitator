'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from './ui/Button';
import { Field } from './ui/Field';
import { useToast } from './ui/toast';
import EditableHistoryRow from './EditableHistoryRow';
import { apiDeleteAnkiDay, apiLogAnki, apiUpdateAnkiDay } from '@/lib/client';
import { formatHuman } from '@/lib/dates';
import type { AnkiDay } from '@/lib/types';

interface Props {
  days: AnkiDay[];
  dailyMin: number;
  startDate: string;
  today: string;
}

/** Editable log of every day's new-card count, newest first, plus a backfill form. */
export default function AnkiHistory({ days, dailyMin, startDate, today }: Props) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-bold text-text-primary">Daily log</h2>
        <span className="text-xs text-text-muted">
          {days.length} {days.length === 1 ? 'day' : 'days'}
        </span>
      </div>

      <AddDayForm startDate={startDate} today={today} dailyMin={dailyMin} />

      {days.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {days.map((d) => (
            <DayRow key={d.id} day={d} dailyMin={dailyMin} />
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-text-muted">
        Editing or deleting a day recomputes your totals, pace, and completion
        estimates.
      </p>
    </section>
  );
}

function AddDayForm({
  startDate,
  today,
  dailyMin,
}: {
  startDate: string;
  today: string;
  dailyMin: number;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [cards, setCards] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const n = parseInt(cards, 10);
    if (!Number.isFinite(n) || n < 0) {
      setError('Enter a whole number of cards.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiLogAnki(date, n);
      show({ tone: 'success', title: 'Day saved', description: `${n} cards on ${formatHuman(date)}.` });
      setOpen(false);
      setCards('');
      setDate(today);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" fullWidth onClick={() => setOpen(true)}>
        + Add / backfill a day
      </Button>
    );
  }

  return (
    <div className="rounded-card border border-border bg-surface p-3 shadow-card">
      <div className="grid grid-cols-2 gap-2">
        <Field
          label="Date"
          type="date"
          min={startDate}
          max={today}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Field
          label="New cards"
          type="number"
          inputMode="numeric"
          min={0}
          placeholder={String(dailyMin)}
          value={cards}
          onChange={(e) => {
            setCards(e.target.value);
            setError(null);
          }}
        />
      </div>
      {error && <p className="mt-2 text-sm text-fail">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Button size="sm" fullWidth onClick={save} loading={busy}>
          Save day
        </Button>
        <Button
          size="sm"
          variant="secondary"
          fullWidth
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function DayRow({ day, dailyMin }: { day: AnkiDay; dailyMin: number }) {
  const [cards, setCards] = useState(String(day.new_cards));

  const metMin = day.new_cards >= dailyMin;

  async function save() {
    const n = parseInt(cards, 10);
    const parsed = Number.isFinite(n) && n >= 0 ? n : 0;
    await apiUpdateAnkiDay(day.id, parsed);
  }

  return (
    <EditableHistoryRow
      readAlign="center"
      confirmCopy={{
        title: 'Delete this day?',
        message: 'This recomputes your totals and completion estimates.',
        confirmLabel: 'Delete',
      }}
      onSave={save}
      onDelete={() => apiDeleteAnkiDay(day.id)}
      onCancel={() => setCards(String(day.new_cards))}
      read={
        <>
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-bold tabular-nums text-text-primary">
              {day.new_cards} {day.new_cards === 1 ? 'card' : 'cards'}
            </span>
            {metMin ? (
              <span className="rounded-btn bg-pass/15 px-1.5 py-0.5 text-xs font-semibold text-pass">
                ✓ met
              </span>
            ) : (
              <span className="rounded-btn bg-warn/15 px-1.5 py-0.5 text-xs font-semibold text-warn">
                below min
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-text-faint">{formatHuman(day.date)}</p>
        </>
      }
      editForm={
        <>
          <div className="mb-2 text-sm font-semibold text-text-secondary">
            {formatHuman(day.date)}
          </div>
          <Field
            label="New cards"
            type="number"
            inputMode="numeric"
            min={0}
            value={cards}
            onChange={(e) => setCards(e.target.value)}
          />
        </>
      }
    />
  );
}
