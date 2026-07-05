'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Field } from '@/components/ui/Field';
import Button from '@/components/ui/Button';

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
        {/* Signature ring mark over the gradient wordmark. */}
        <div
          aria-hidden="true"
          className="mx-auto mb-5 h-12 w-12 rounded-full border-2 border-accent/70 shadow-glow-accent"
        />
        <h1 className="mb-1 text-center font-display text-3xl font-bold tracking-tight text-gradient">
          Habitator
        </h1>
        <p className="mb-8 text-center text-sm text-text-muted">
          Enter the password to continue.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Field
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            autoComplete="current-password"
            error={error}
          />
          <Button type="submit" size="lg" fullWidth loading={busy}>
            Enter
          </Button>
        </form>
      </div>
    </main>
  );
}
