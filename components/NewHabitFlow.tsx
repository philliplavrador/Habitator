'use client';

import { useState } from 'react';
import AddHabitForm from './AddHabitForm';
import RepProgramForm from './RepProgramForm';

type Template = 'build' | 'quit' | 'reps';

/**
 * The add-habit entry point: pick a template, then fill in its form. Build/Quit
 * open the habit form (with the kind preselected); Rep program opens the
 * configurable rep-program form. This is the "create new habits from templates"
 * flow — new template archetypes plug in here.
 */
export default function NewHabitFlow({ tz }: { tz: string }) {
  const [template, setTemplate] = useState<Template | null>(null);

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
          emoji="💪"
          title="Rep program"
          desc="A ramping strength program like Pushups — sets, rest, and a rep added each day."
          onClick={() => setTemplate('reps')}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => setTemplate(null)}
        className="self-start text-sm text-text-muted active:text-text-primary"
      >
        ‹ Choose a different type
      </button>
      {template === 'reps' ? (
        <RepProgramForm />
      ) : (
        <AddHabitForm tz={tz} initialKind={template} />
      )}
    </div>
  );
}

function TemplateCard({
  emoji,
  title,
  desc,
  onClick,
}: {
  emoji: string;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-card border border-border bg-surface px-4 py-4 text-left shadow-card transition-colors active:border-accent"
    >
      <span className="text-2xl" aria-hidden>
        {emoji}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-text-primary">{title}</span>
        <span className="mt-0.5 block text-sm text-text-muted">{desc}</span>
      </span>
    </button>
  );
}
