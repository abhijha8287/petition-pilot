/**
 * Loads public USCIS AAO non-precedent O-1 decisions (2023-2026) into Postgres:
 * full text for the golden set, plus chunks + embeddings for hybrid retrieval.
 *
 * Source: https://www.uscis.gov/administrative-appeals/aao-decisions/aao-non-precedent-decisions
 * (topic "I-129 - Petition for a Nonimmigrant Worker (Extraordinary Ability - O)").
 * AAO decisions are U.S. government works and are redacted by USCIS before publication.
 *
 *   npm run aao:ingest
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';
import { chunkDecision } from '../src/lib/aao/retrieval';
import { embedTexts } from '../src/lib/ai/embeddings';
import { adminClient } from '../src/lib/supabase/admin';

type Entry = { id: string; date: string; url: string; golden: boolean };
const DATA = path.resolve('data/aao');

async function loadPdf(e: Entry): Promise<Uint8Array> {
  const file = path.join(DATA, 'pdf', `${e.id}.pdf`);
  try {
    return new Uint8Array(await fs.readFile(file));
  } catch {
    const res = await fetch(e.url, { headers: { 'User-Agent': 'exhibit-a-research/1.0' } });
    if (!res.ok) throw new Error(`${e.id}: HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, buf);
    await new Promise((r) => setTimeout(r, 400)); // be polite to uscis.gov
    return buf;
  }
}

function classify(text: string) {
  const t = text.replace(/\s+/g, ' ');
  const order = t.match(/ORDER:\s*([^.]+)\./i)?.[1]?.trim() ?? 'unknown';
  const outcome = /appeal is dismissed/i.test(order)
    ? 'dismissed'
    : /withdrawn|remanded/i.test(order)
      ? 'withdrawn_or_remanded'
      : /sustained/i.test(order)
        ? 'sustained'
        : /motion/i.test(order)
          ? 'motion_dismissed'
          : 'other';
  const field = t.match(/seeks to classify the Beneficiary as an? ([^.]{3,90}?) of extraordinary (ability|achievement)/i)?.[1] ?? null;
  return { outcome, field };
}

async function main() {
  const db = adminClient();
  const entries: Entry[] = JSON.parse(await fs.readFile(path.join(DATA, 'decisions.json'), 'utf8'));
  let chunksTotal = 0;
  for (const e of entries) {
    const pdf = await getDocumentProxy(await loadPdf(e));
    const { text } = await extractText(pdf, { mergePages: false });
    const content = text.join('\n\n');
    const { outcome, field } = classify(content);
    const up = await db.from('aao_decisions').upsert({
      id: e.id,
      decision_date: e.date,
      source_url: e.url,
      field,
      outcome,
      split: e.golden ? 'golden' : 'corpus',
      content,
    });
    if (up.error) throw up.error;

    const { count } = await db.from('aao_chunks').select('id', { count: 'exact', head: true }).eq('decision_id', e.id);
    if ((count ?? 0) > 0) continue;
    const chunks = chunkDecision(content);
    const embeddings = await embedTexts(chunks);
    const ins = await db.from('aao_chunks').insert(
      chunks.map((c, i) => ({ decision_id: e.id, chunk_index: i, content: c, embedding: JSON.stringify(embeddings[i]) })),
    );
    if (ins.error) throw ins.error;
    chunksTotal += chunks.length;
    process.stdout.write(`${e.id} ${outcome} ${field ?? ''} (${chunks.length} chunks)\n`);
  }
  const { count: golden } = await db.from('aao_decisions').select('id', { count: 'exact', head: true }).eq('split', 'golden');
  console.log(`\nIngested ${entries.length} decisions (${golden} golden), ${chunksTotal} new chunks.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
