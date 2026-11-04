import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * Service-role client for the agent pipeline and scripts. Bypasses RLS, so it
 * is never imported from client components and never exposed to the browser.
 */
let client: ReturnType<typeof createClient<Database>> | undefined;

export function adminClient() {
  if (typeof window !== 'undefined') throw new Error('adminClient must not run in the browser');
  client ??= createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
