/**
 * Seeds demo users (attorney, paralegal, clients) and one case per fictional
 * applicant, uploading the fixture PDFs to Supabase Storage.
 *
 *   npm run seed            # idempotent
 *   npm run seed -- --reset # delete demo cases first
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { adminClient } from '../src/lib/supabase/admin';
import { PERSONAS } from './fixtures/personas';

export const DEMO_PASSWORD = 'petition-pilot-demo';
const STAFF = [
  { email: 'attorney@petition-pilot.test', name: 'Jordan Reyes, Esq.', role: 'attorney' as const },
  { email: 'paralegal@petition-pilot.test', name: 'Sam Patel', role: 'paralegal' as const },
];

async function ensureUser(email: string, fullName: string, role: 'attorney' | 'paralegal' | 'client') {
  const db = adminClient();
  const { data: list } = await db.auth.admin.listUsers({ perPage: 200 });
  let user = list.users.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw error;
    user = data.user;
  }
  const { error } = await db.from('profiles').update({ role, full_name: fullName }).eq('id', user.id);
  if (error) throw error;
  return user.id;
}

async function main() {
  const db = adminClient();
  const reset = process.argv.includes('--reset');
  const ids: Record<string, string> = {};
  for (const s of STAFF) ids[s.role] = await ensureUser(s.email, s.name, s.role);

  for (const p of PERSONAS) {
    const clientId = await ensureUser(p.clientEmail, p.beneficiary, 'client');
    const title = `O-1A · ${p.beneficiary}`;
    const { data: existing } = await db.from('cases').select('id').eq('title', title).maybeSingle();
    if (existing && reset) {
      await db.storage.from('exhibits').remove(
        (await db.storage.from('exhibits').list(existing.id)).data?.map((o) => `${existing.id}/${o.name}`) ?? [],
      );
      await db.from('cases').delete().eq('id', existing.id);
    } else if (existing) {
      console.log(`= ${title} (exists)`);
      continue;
    }
    const { data: c, error } = await db
      .from('cases')
      .insert({
        title,
        beneficiary_name: p.beneficiary,
        field: p.field,
        petitioner: p.petitioner,
        proposed_role: p.proposedRole,
        client_id: clientId,
        attorney_id: ids.attorney,
        created_by: ids.paralegal,
      })
      .select('id')
      .single();
    if (error) throw error;

    for (const d of p.docs) {
      const file = path.resolve('fixtures', p.key, `${d.label}-${d.slug}.pdf`);
      const bytes = await fs.readFile(file);
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      const storagePath = `${c.id}/${d.label}-${d.slug}.pdf`;
      const up = await db.storage.from('exhibits').upload(storagePath, bytes, { contentType: 'application/pdf', upsert: true });
      if (up.error) throw up.error;
      const ins = await db.from('exhibits').insert({
        case_id: c.id,
        label: d.label,
        title: d.title,
        storage_path: storagePath,
        sha256,
        uploaded_by: ids.paralegal,
      });
      if (ins.error) throw ins.error;
    }
    console.log(`+ ${title}: ${p.docs.length} exhibits`);
  }
  console.log(`\nDemo logins (password "${DEMO_PASSWORD}"):\n  ${STAFF.map((s) => `${s.email} (${s.role})`).join('\n  ')}\n  ${PERSONAS.map((p) => `${p.clientEmail} (client)`).join('\n  ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
