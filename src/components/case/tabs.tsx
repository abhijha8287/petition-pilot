'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/components/ui';

export function CaseTabs({ caseId, tabs }: { caseId: string; tabs: { href: string; label: string; count?: number }[] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 border-b border-line">
      {tabs.map((t) => {
        const href = `/cases/${caseId}${t.href}`;
        const active = t.href === '' ? path === href : path.startsWith(href);
        return (
          <Link
            key={t.href}
            href={href}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
              active ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-muted">{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
