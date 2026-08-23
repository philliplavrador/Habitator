'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import Button from './ui/Button';
import { Field, Textarea } from './ui/Field';
import { cx } from './ui/cx';
import { useConfirm } from './ui/confirm';
import { useToast } from './ui/toast';
import {
  apiCreateTask,
  apiDeleteTask,
  apiSetTaskDone,
  apiUpdateTask,
} from '@/lib/client';
import { formatClockHM, formatHuman } from '@/lib/dates';
import type { Task } from '@/lib/types';

interface Props {
  /** The day being shown (YYYY-MM-DD). New tasks land here by default. */
  date: string;
  /** Today in the owner's zone. */
  today: string;
  /** Server-rendered tasks for `date`, already rolled forward. */
  initialTasks: Task[];
  /** Latest day a task may be moved to (today + MAX_FUTURE_DAYS). */
  maxDate: string;
}

/** The shape both the add form and the edit panel submit. */
interface Draft {
  title: string;
  notes: string;
  date: string;
  at_time: string | null;
}

/**
 * Board order, identical to the server's ORDER BY: timed tasks first in clock
 * order, then untimed ones in manual order. Kept in sync so an optimistic
 * insert lands exactly where a refresh would put it.
 */
function sortTasks(list: Task[]): Task[] {
  return [...list].sort((a, b) => {
    if ((a.at_time === null) !== (b.at_time === null)) {
      return a.at_time === null ? 1 : -1;
    }
    if (a.at_time && b.at_time && a.at_time !== b.at_time) {
      return a.at_time < b.at_time ? -1 : 1;
    }
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id - b.id;
  });
}

const spring = { type: 'spring', stiffness: 500, damping: 40 } as const;

/** The round check control — the one place a task actually gets finished. */
function Check({
  done,
  busy,
  onClick,
}: {
  done: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <m.button
      type="button"
      aria-label={done ? 'Mark not done' : 'Mark done'}
      aria-pressed={done}
      disabled={busy}
      onClick={onClick}
      whileTap={{ scale: 0.86 }}
      transition={{ type: 'spring', stiffness: 420, damping: 16 }}
      className={cx(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:opacity-50',
        done
          ? 'border-pass bg-pass text-white'
          : 'border-border-strong text-transparent active:border-pass'
      )}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 12.5 9.5 18 20 6.5" />
      </svg>
    </m.button>
  );
}

/** A single task: the read row, plus the edit panel it expands into. */
function TaskRow({
  task,
  today,
  maxDate,
  busy,
  editing,
  onToggleEdit,
  onToggleDone,
  onSave,
  onDelete,
}: {
  task: Task;
  today: string;
  maxDate: string;
  busy: boolean;
  editing: boolean;
  onToggleEdit: () => void;
  onToggleDone: () => void;
  onSave: (patch: Draft) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [time, setTime] = useState(task.at_time ?? '');
  const [day, setDay] = useState(task.date);

  // Re-seed the draft whenever the panel opens or the row's data changes under
  // it (a save elsewhere, a day refresh), so it never edits a stale copy.
  useEffect(() => {
    if (!editing) return;
    setTitle(task.title);
    setNotes(task.notes);
    setTime(task.at_time ?? '');
    setDay(task.date);
  }, [editing, task.title, task.notes, task.at_time, task.date]);

  const done = task.done === 1;
  // A task that has already slipped a day wears a warm border — the one visual
  // cue that it's older than the day it's sitting on.
  const carried = !done && task.carried_from !== null;

  return (
    <li
      className={cx(
        'rounded-card border bg-surface shadow-card transition-colors',
        carried ? 'border-warn/40' : 'border-border'
      )}
    >
      <div className="flex items-center gap-3 px-3 py-3">
        <Check done={done} busy={busy} onClick={onToggleDone} />

        <button
          type="button"
          onClick={onToggleEdit}
          aria-expanded={editing}
          className="min-w-0 flex-1 text-left active:opacity-70"
        >
          <span
            className={cx(
              'block truncate text-[15px] font-medium',
              done ? 'text-text-muted line-through' : 'text-text-primary'
            )}
          >
            {task.title}
          </span>
          {(task.at_time || carried || task.notes) && (
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
              {task.at_time && (
                <span className="font-medium text-accent-300">
                  {formatClockHM(task.at_time)}
                </span>
              )}
              {carried && task.carried_from && (
                <span className="text-warn">
                  carried from {formatHuman(task.carried_from)}
                </span>
              )}
              {task.notes && <span className="truncate">{task.notes}</span>}
            </span>
          )}
        </button>

        <span
          aria-hidden="true"
          className={cx(
            'shrink-0 px-1 text-lg leading-none text-text-faint transition-transform',
            editing && 'rotate-90'
          )}
        >
          ›
        </span>
      </div>

      <AnimatePresence initial={false}>
        {editing && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
              <Field
                label="Task"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  hint="Optional"
                />
                <Field
                  label="Day"
                  type="date"
                  value={day}
                  max={maxDate}
                  onChange={(e) => setDay(e.target.value)}
                  hint={day === today ? 'Today' : 'Moves the task'}
                />
              </div>
              <Textarea
                label="Notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
                className="min-h-[60px]"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  loading={busy}
                  onClick={() =>
                    onSave({
                      title: title.trim(),
                      notes: notes.trim(),
                      date: day,
                      at_time: time === '' ? null : time,
                    })
                  }
                >
                  Save
                </Button>
                <Button size="sm" variant="secondary" onClick={onToggleEdit}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  className="ml-auto"
                  disabled={busy}
                  onClick={onDelete}
                >
                  Delete
                </Button>
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/**
 * The /tasks day board. Holds one day's tasks in local state and writes through
 * the `lib/client` helpers. Carry-over of unfinished tasks happens server-side
 * on read (lib/tasks.ts rollOverTasks), so everything here is about a day whose
 * contents are already settled.
 */
export default function TasksClient({ date, today, initialTasks, maxDate }: Props) {
  const { show } = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<Task[]>(initialTasks);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // A fresh server snapshot (day navigation, refresh) replaces the board.
  useEffect(() => {
    setItems(initialTasks);
    setEditingId(null);
  }, [initialTasks]);

  const open = useMemo(() => items.filter((t) => t.done === 0), [items]);
  const done = useMemo(() => items.filter((t) => t.done === 1), [items]);

  async function guard(id: number | null, fn: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong.';
      setError(message);
      show({ tone: 'error', title: message });
    } finally {
      setBusyId(null);
    }
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const name = title.trim();
    if (name === '') return;
    setAdding(true);
    setError(null);
    try {
      const task = await apiCreateTask({
        title: name,
        notes: '',
        date,
        at_time: time === '' ? null : time,
      });
      setItems((cur) => sortTasks([...cur, task]));
      setTitle('');
      setTime('');
      titleRef.current?.focus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not add the task.';
      setError(message);
      show({ tone: 'error', title: message });
    } finally {
      setAdding(false);
    }
  }

  function toggleDone(task: Task) {
    const next = task.done === 0;
    // Optimistic: checking off should feel instant. A failure rolls the row back
    // to the snapshot we captured here.
    setItems((cur) =>
      cur.map((t) => (t.id === task.id ? { ...t, done: next ? 1 : 0 } : t))
    );
    void guard(task.id, async () => {
      try {
        const fresh = await apiSetTaskDone(task.id, next);
        setItems((cur) => cur.map((t) => (t.id === fresh.id ? fresh : t)));
      } catch (err) {
        setItems((cur) => cur.map((t) => (t.id === task.id ? task : t)));
        throw err;
      }
    });
  }

  function save(task: Task, patch: Draft) {
    if (patch.title === '') {
      setError('Title is required.');
      return;
    }
    void guard(task.id, async () => {
      const fresh = await apiUpdateTask(task.id, patch);
      setEditingId(null);
      if (fresh.date !== date) {
        // Moved to another day — it belongs to that board now, so drop it here.
        setItems((cur) => cur.filter((t) => t.id !== fresh.id));
        show({ tone: 'success', title: `Moved to ${formatHuman(fresh.date)}` });
        return;
      }
      setItems((cur) => sortTasks(cur.map((t) => (t.id === fresh.id ? fresh : t))));
    });
  }

  function remove(task: Task) {
    void (async () => {
      const ok = await confirm({
        title: 'Delete this task?',
        message: task.title,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      await guard(task.id, async () => {
        await apiDeleteTask(task.id);
        setItems((cur) => cur.filter((t) => t.id !== task.id));
        setEditingId(null);
      });
    })();
  }

  const row = (task: Task) => (
    <TaskRow
      key={task.id}
      task={task}
      today={today}
      maxDate={maxDate}
      busy={busyId === task.id}
      editing={editingId === task.id}
      onToggleEdit={() => setEditingId((cur) => (cur === task.id ? null : task.id))}
      onToggleDone={() => toggleDone(task)}
      onSave={(patch) => save(task, patch)}
      onDelete={() => remove(task)}
    />
  );

  const addLabel = date === today ? 'Add to today' : `Add to ${formatHuman(date)}`;
  // Lives here rather than on the server page so it tracks checks, edits and
  // deletes without a round trip — a stale "4 to do" over three rows reads as a
  // bug.
  const carried = open.filter((t) => t.carried_from !== null).length;
  const summary =
    items.length === 0
      ? 'No tasks yet'
      : open.length === 0
        ? `${done.length} done`
        : `${open.length} to do${done.length > 0 ? ` · ${done.length} done` : ''}`;

  return (
    <div className="flex flex-col gap-4 pt-4">
      <p className="-mb-1 text-center text-xs text-text-muted">
        {summary}
        {carried > 0 && <span className="text-warn"> · {carried} carried over</span>}
      </p>

      <form onSubmit={addTask} className="flex flex-col gap-2">
        {/* ui/Field owns the input styling (components/CLAUDE.md rule 1); the
            sizing lives on the wrappers, since Field renders its own div. */}
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Field
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a task…"
              maxLength={200}
              aria-label="New task"
            />
          </div>
          <div className="w-[7.5rem] shrink-0">
            <Field
              value={time}
              onChange={(e) => setTime(e.target.value)}
              type="time"
              aria-label="Time (optional)"
              className="px-2 text-sm"
            />
          </div>
        </div>
        <Button type="submit" loading={adding} disabled={title.trim() === ''} fullWidth>
          {addLabel}
        </Button>
      </form>

      {error && <p className="text-sm text-fail">{error}</p>}

      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-text-muted">
          Nothing planned for this day.
        </p>
      ) : (
        <>
          {open.length > 0 ? (
            <ul className="flex flex-col gap-2">
              <AnimatePresence initial={false}>{open.map(row)}</AnimatePresence>
            </ul>
          ) : (
            <p className="py-6 text-center text-sm font-medium text-pass">
              All done for this day.
            </p>
          )}

          {done.length > 0 && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                className="self-center rounded-pill border border-border px-3 py-1.5 text-xs text-text-muted active:bg-surface2"
              >
                {showDone ? 'Hide' : 'Show'} {done.length} completed
              </button>
              <AnimatePresence initial={false}>
                {showDone && (
                  <m.ul
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={spring}
                    className="flex flex-col gap-2 overflow-hidden"
                  >
                    {done.map(row)}
                  </m.ul>
                )}
              </AnimatePresence>
            </div>
          )}
        </>
      )}
    </div>
  );
}
