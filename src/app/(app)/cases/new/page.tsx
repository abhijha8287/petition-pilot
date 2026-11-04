import { redirect } from 'next/navigation';
import { Card, CardHeader } from '@/components/ui';
import { requireUser } from '@/lib/supabase/server';
import { NewCaseForm } from './form';

export default async function NewCasePage() {
  const { profile } = await requireUser();
  if (profile?.role === 'client') redirect('/cases');
  return (
    <Card className="max-w-xl">
      <CardHeader title="New O-1A case" subtitle="Use fictional data only. Upload exhibits on the next screen." />
      <NewCaseForm />
    </Card>
  );
}
