import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Geist, Geist_Mono, Source_Serif_4 } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
const sourceSerif = Source_Serif_4({ variable: '--font-source-serif', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Exhibit A · O-1A evidence mapping',
  description: 'Source-cited O-1A evidence mapping, drafting and attorney review. Demo project; not legal advice.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {/* Every page is per-user (cookies + RLS), so the app streams inside one boundary. */}
        <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading…</div>}>{children}</Suspense>
      </body>
    </html>
  );
}
