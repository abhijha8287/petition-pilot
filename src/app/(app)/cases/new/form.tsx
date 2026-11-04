'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui';
import { createCase } from '../actions';

const FIELDS = [
  { name: 'beneficiary_name', label: 'Beneficiary', placeholder: 'Dr. Jane Example' },
  { name: 'field', label: 'Field of endeavor', placeholder: 'Machine learning systems' },
  { name: 'petitioner', label: 'Petitioner (U.S. employer or agent)', placeholder: 'Example Labs, Inc.' },
  { name: 'proposed_role', label: 'Proposed role', placeholder: 'Chief Technology Officer' },
];

export function NewCaseForm() {
  const [state, action, pending] = useActionState(createCase, undefined);
  return (
    <form action={action} className="space-y-4 px-5 py-4">
      {FIELDS.map((f) => (
        <label key={f.name} className="block text-sm">
          <span className="font-medium">{f.label}</span>
          <input name={f.name} placeholder={f.placeholder} required className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none" />
        </label>
      ))}
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create case'}
      </Button>
    </form>
  );
}
