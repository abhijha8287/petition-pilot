'use client';

import { useActionState, useRef } from 'react';
import { Button } from '@/components/ui';
import { signIn } from './actions';

const DEMO = [
  { email: 'attorney@petition-pilot.test', label: 'Attorney', note: 'reviews and signs off' },
  { email: 'paralegal@petition-pilot.test', label: 'Paralegal', note: 'runs agents, cannot sign' },
  { email: 'mateo.alvarez@client.petition-pilot.test', label: 'Client', note: 'sees own case only' },
];

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, undefined);
  const email = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input ref={email} name="email" type="email" required className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Password</span>
        <input ref={password} name="password" type="password" required className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft" />
      </label>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <Button type="submit" className="w-full py-2" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
      <div className="border-t border-line pt-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Demo accounts (fictional)</p>
        <div className="grid gap-2">
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              onClick={() => {
                if (email.current) email.current.value = d.email;
                if (password.current) password.current.value = 'petition-pilot-demo';
              }}
              className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-medium">{d.label}</span>
              <span className="text-xs text-muted">{d.note}</span>
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}
