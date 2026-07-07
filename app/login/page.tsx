'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Field } from '@/components/ui/Field';
import Button from '@/components/ui/Button';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  // The registration-code field only appears once the server says a new account
  // needs it — so signing in stays a two-field form.
  const [showCode, setShowCode] = useState(false);
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
        body: JSON.stringify({ username, password, code }),
      });
      if (res.ok) {
        router.replace('/');
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => null);
      if (data?.needsCode) setShowCode(true);
      setError(data?.error ?? 'Incorrect username or password.');
      setBusy(false);
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
          Sign in, or pick a new username to create an account.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Field
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
          />
          <Field
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            error={showCode ? null : error}
          />
          {showCode && (
            <Field
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Registration code (new account)"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              error={error}
            />
          )}
          <Button type="submit" size="lg" fullWidth loading={busy}>
            {showCode ? 'Create account' : 'Enter'}
          </Button>
        </form>
      </div>
    </main>
  );
}
