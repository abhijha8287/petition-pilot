// One-off: apply the readable-text rules to objections written before they existed.
import { stripClaimHandles, tidyExcerpt } from '../../src/lib/citations/verify';
import { adminClient } from '../../src/lib/supabase/admin';

const db = adminClient();
const readable = (t: string) =>
  stripClaimHandles(
    t
      .replace(/\s*\(\s*P\d{1,2}(?:\s*[/,]\s*P\d{1,2})*\s*\)/g, '')
      .replace(/\bAAO P\d{1,2}\b/g, 'AAO precedent')
      .replace(/\bP\d{1,2}\b/g, 'AAO precedent'),
  );
const { data } = await db.from('objections').select('id,objection,suggested_fix,aao_refs');
let n = 0;
for (const o of data ?? []) {
  const refs = ((o.aao_refs ?? []) as { decisionId: string; quote: string; url?: string }[]).map((r) => ({ ...r, quote: tidyExcerpt(r.quote) }));
  const next = { objection: readable(o.objection), suggested_fix: readable(o.suggested_fix ?? ''), aao_refs: refs };
  if (next.objection !== o.objection || next.suggested_fix !== o.suggested_fix || JSON.stringify(refs) !== JSON.stringify(o.aao_refs)) {
    const { error } = await db.from('objections').update(next).eq('id', o.id);
    if (error) throw error;
    n++;
  }
}
console.log(`tidied ${n} of ${data?.length ?? 0} objections`);
process.exit(0);
