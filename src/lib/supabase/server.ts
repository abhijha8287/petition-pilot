import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './types';

/** Per-request client bound to the signed-in user's session. RLS applies. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component; the proxy refreshes the session instead.
          }
        },
      },
    },
  );
}

export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { supabase, user: null, profile: null } as const;
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
  return { supabase, user: { id: userId, email: data.claims.email as string | undefined }, profile } as const;
}
