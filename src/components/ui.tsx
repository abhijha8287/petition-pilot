import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

const buttonStyles = {
  primary: 'bg-brand text-white hover:bg-blue-950 disabled:bg-slate-300',
  secondary: 'border border-line bg-white text-ink hover:bg-slate-50 disabled:text-slate-400',
  danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
  ghost: 'text-muted hover:bg-slate-100 hover:text-ink',
  success: 'bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-slate-300',
};

export function Button({ variant = 'primary', className, ...props }: ComponentProps<'button'> & { variant?: keyof typeof buttonStyles }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed',
        buttonStyles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function ButtonLink({ variant = 'secondary', className, ...props }: ComponentProps<typeof Link> & { variant?: keyof typeof buttonStyles }) {
  return (
    <Link
      className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors', buttonStyles[variant], className)}
      {...props}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-lg border border-line bg-white shadow-sm', className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const tones = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-blue-50 text-blue-800 ring-blue-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
};

export function Badge({ tone = 'slate', children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone], className)}>{children}</span>;
}

export const strengthTone = { strong: 'green', moderate: 'blue', weak: 'amber', none: 'slate' } as const;
export const severityTone = { high: 'red', medium: 'amber', low: 'slate' } as const;
export const statusTone = { intake: 'slate', processing: 'blue', needs_review: 'amber', signed_off: 'green', failed: 'red' } as const;
export const statusLabel = { intake: 'Intake', processing: 'Agents working', needs_review: 'Needs attorney review', signed_off: 'Signed off', failed: 'Failed' } as const;

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className="rounded-lg border border-line bg-white px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={cn('mt-1 text-2xl font-semibold tabular-nums', tone === 'good' && 'text-emerald-700', tone === 'warn' && 'text-amber-700', tone === 'bad' && 'text-red-700')}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-5 py-8 text-center text-sm text-muted">{children}</div>;
}
