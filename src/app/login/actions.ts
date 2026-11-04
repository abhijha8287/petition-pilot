'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const Credentials = z.object({ email: z.email(), password: z.string().min(6) });

export async function signIn(_prev: { error?: string } | undefined, form: FormData) {
  const parsed = Credentials.safeParse({ email: form.get('email'), password: form.get('password') });
  if (!parsed.success) return { error: 'Enter a valid email and password.' };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };
  redirect('/cases');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
