'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AddHabitForm from './AddHabitForm';
import RepProgramForm from './RepProgramForm';
import { apiAddDomain } from '@/lib/client';
import type { DomainLibraryEntry, LibraryEntry } from '@/lib/domains';

type Template = 'build' | 'quit' | 'custom';

interface Props {
  tz: string;
  /** The coded-in custom habits on offer (see lib/domains.ts). */
  library: LibraryEntry[];
  /** Library keys the user already has — shown as "Added" and not re-addable. */
  added: string[];
}

/**
 * The add-habit entry point, in three steps:
 *   1. Pick a type — build, quit, or custom.
 *   2. Build/Quit open the habit form with the kind preselected. Custom opens
 *      the LIBRARY of habits coded into the app.
 *   3. A library pick either opens its form (the configurable rep program) or is
 *      added straight away (a one-per-account domain like the Anki goal).
 *
 * New habit archetypes plug into step 1; new coded-in trackers plug into the
 * library in lib/domains.ts, never into a new bottom-nav tab.
 */
export default function NewHabitFlow({ tz, library, added }: Props) {
  const router = useRouter();
  const [template, setTemplate] = useState<Template | null>(null);
  const [picked, setPicked] = useState<LibraryEntry | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** A one-per-account library habit: enable it, then land on its screen. */
  async function addDomain(entry: DomainLibraryEntry) {
    setBusyKey(entry.key);
    setError(null);
    try {
      await apiAddDomain(entry.key);
      router.push(entry.href);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the habit.');
      setBusyKey(null);
    }
  }

  // ── Step 1: what kind of habit? ──
  if (template === null) {
    return (
      <div className="flex flex-col gap-3">
        <p className="mb-1 text-sm text-text-muted">What are you tracking?</p>
        <TemplateCard
          emoji="✅"
          title="Build a habit"
          desc="Something to do — daily or on a schedule. Check it off to keep your streak."
          onClick={() => setTemplate('build')}
        />
        <TemplateCard
          emoji="🚫"
          title="Quit a habit"
          desc="Something to avoid. Clean by default; you only tap the days you slip."
          onClick={() => setTemplate('quit')}
        />
        <TemplateCard
          emoji="🧩"
          title="Custom habit"
          desc="Pick a purpose-built tracker from the library — rep programs, Anki goals, and more."
          onClick={() => setTemplate('custom')}
        />
      </div>
    );
  }

  // ── Step 2: the library of coded-in custom habits. ──
  if (template === 'custom' && picked === null) {
    return (
      <div className="flex flex-col gap-3">
        <BackLink label="Choose a different type" onClick={() => setTemplate(null)} />
        <p className="mb-1 text-sm text-text-muted">
          Pick a custom habit from the library.
        </p>
        {error && <p className="text-sm text-fail">{error}</p>}
        {library.map((entry) => {
          const isAdded = added.includes(entry.key);
          return (
            <TemplateCard
              key={entry.key}
              emoji={entry.emoji}
              title={entry.title}
              desc={entry.desc}
              badge={isAdded ? 'Added' : undefined}
              disabled={isAdded || busyKey !== null}
              onClick={() =>
                entry.key === 'reps' ? setPicked(entry) : addDomain(entry)
              }
            />
          );
        })}
      </div>
    );
  }

  // ── Step 3: the chosen habit's form. ──
  return (
    <div className="flex flex-col gap-4">
      {template === 'custom' ? (
        <BackLink label="Back to the library" onClick={() => setPicked(null)} />
      ) : (
        <BackLink label="Choose a different type" onClick={() => setTemplate(null)} />
      )}
      {template === 'custom' ? (
        <RepProgramForm />
      ) : (
        <AddHabitForm tz={tz} initialKind={template} />
      )}
    </div>
  );
}

function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start text-sm text-text-muted active:text-text-primary"
    >
      ‹ {label}
    </button>
  );
}

function TemplateCard({
  emoji,
  title,
  desc,
  badge,
  disabled,
  onClick,
}: {
  emoji: string;
  title: string;
  desc: string;
  badge?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-start gap-3 rounded-card border border-border bg-surface px-4 py-4 text-left shadow-card transition-colors active:border-accent disabled:opacity-50 disabled:active:border-border"
    >
      <span className="text-2xl" aria-hidden>
        {emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-semibold text-text-primary">{title}</span>
          {badge && (
            <span className="shrink-0 text-xs font-semibold text-accent-400">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-sm text-text-muted">{desc}</span>
      </span>
    </button>
  );
}
