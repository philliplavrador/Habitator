interface Props {
  label: string;
  value: string;
  accent?: 'pass' | 'fail' | 'accent';
}

const accentClass: Record<NonNullable<Props['accent']>, string> = {
  pass: 'text-pass',
  fail: 'text-fail',
  accent: 'text-text-primary',
};

export default function StatCard({ label, value, accent = 'accent' }: Props) {
  return (
    <div className="rounded-card border border-border bg-surface px-3 py-4 text-center">
      <div className={`text-2xl font-bold ${accentClass[accent]}`}>{value}</div>
      <div className="mt-1 text-xs text-text-muted">{label}</div>
    </div>
  );
}
