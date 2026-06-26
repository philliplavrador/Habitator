'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace('/');
        router.refresh();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? 'Incorrect password.');
        setBusy(false);
      }
    } catch {
      setError('Network error. Try again.');
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center">
      <div className="w-full max-w-xs">
        <h1 className="mb-1 text-center text-2xl font-bold text-text-primary">
          Habitator
        </h1>
        <p className="mb-8 text-center text-sm text-text-muted">
          Enter the password to continue.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            autoComplete="current-password"
            className="w-full rounded-btn border border-border bg-surface px-3 py-3 text-text-primary placeholder:text-text-muted outline-none focus:border-accent"
          />
          {error && <p className="text-sm text-fail">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-btn bg-accent px-4 py-3 font-semibold text-white active:bg-accent-soft disabled:opacity-50"
          >
            {busy ? 'Checking…' : 'Enter'}
          </button>
        </form>
      </div>
    </main>
  );
}
