import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Disclaimer } from '@/components/disclaimer';
import { Badge } from '@/components/ui';
import { requireUser } from '@/lib/supabase/server';
import { signOut } from '../login/actions';

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const { profile } = await requireUser();
  if (!profile) redirect('/login');
  const staff = profile.role !== 'client';
  return (
    <>
      <Disclaimer />
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Link href="/cases" className="font-serif text-xl font-semibold tracking-tight">
              Exhibit A
            </Link>
            <nav className="flex gap-1 text-sm">
              <Link href="/cases" className="rounded-md px-3 py-1.5 text-muted hover:bg-slate-100 hover:text-ink">
                Cases
              </Link>
              {staff && (
                <Link href="/evals" className="rounded-md px-3 py-1.5 text-muted hover:bg-slate-100 hover:text-ink">
                  Evals
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">{profile.full_name || profile.email}</span>
            <Badge tone={profile.role === 'attorney' ? 'violet' : profile.role === 'paralegal' ? 'blue' : 'slate'}>{profile.role}</Badge>
            <form action={signOut}>
              <button className="text-muted hover:text-ink">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-6">{children}</main>
    </>
  );
}
