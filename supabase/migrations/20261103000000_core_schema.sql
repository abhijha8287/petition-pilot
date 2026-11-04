-- Exhibit A: core schema
-- Every table has RLS enabled in the same migration that creates it.
-- Pipeline writes go through the service role (server-only); people read and
-- write through their own session, so RLS is the permission boundary.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('attorney', 'paralegal', 'client');
create type public.case_status as enum ('intake', 'processing', 'needs_review', 'signed_off', 'failed');
create type public.criterion_key as enum (
  'awards',                 -- (o)(3)(iii)(B)(1)
  'membership',             -- (B)(2)
  'published_material',     -- (B)(3)
  'judging',                -- (B)(4)
  'original_contributions', -- (B)(5)
  'scholarly_articles',     -- (B)(6)
  'critical_employment',    -- (B)(7)
  'high_remuneration'       -- (B)(8)
);
create type public.evidence_strength as enum ('strong', 'moderate', 'weak', 'none');
create type public.paragraph_status as enum ('pending', 'accepted', 'edited', 'rejected');

-- ---------------------------------------------------------------------------
-- Profiles and role helpers
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role public.user_role not null default 'client',
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- New auth users always start as 'client'. Staff roles are granted by an
-- admin (service role), never self-assigned from signup metadata.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.my_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid())
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('attorney', 'paralegal') from public.profiles where id = (select auth.uid())), false)
$$;

create policy "read own profile or staff reads all" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.is_staff()));

-- ---------------------------------------------------------------------------
-- Cases
-- ---------------------------------------------------------------------------
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  beneficiary_name text not null,
  field text not null,
  petitioner text not null default '',
  proposed_role text not null default '',
  client_id uuid references public.profiles (id),
  attorney_id uuid references public.profiles (id),
  created_by uuid references public.profiles (id),
  status public.case_status not null default 'intake',
  active_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.cases enable row level security;
create index on public.cases (client_id);

create function public.can_read_case(p_case uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select public.is_staff())
      or exists (select 1 from public.cases c where c.id = p_case and c.client_id = (select auth.uid()))
$$;

create policy "staff and own client read cases" on public.cases
  for select to authenticated using ((select public.can_read_case(id)));
create policy "staff create cases" on public.cases
  for insert to authenticated with check ((select public.is_staff()));
create policy "staff update cases" on public.cases
  for update to authenticated using ((select public.is_staff()));

-- ---------------------------------------------------------------------------
-- Exhibits (uploaded PDFs) and extracted page text
-- ---------------------------------------------------------------------------
create table public.exhibits (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  label text not null,                  -- "A", "B", ... as cited in the petition
  title text not null,
  doc_type text not null default 'other',
  storage_path text not null,
  sha256 text not null,
  page_count int not null default 0,
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (case_id, label),
  unique (case_id, sha256)
);
alter table public.exhibits enable row level security;
create policy "read exhibits of readable case" on public.exhibits
  for select to authenticated using ((select public.can_read_case(case_id)));
create policy "staff or own client add exhibits" on public.exhibits
  for insert to authenticated with check ((select public.can_read_case(case_id)));

create table public.exhibit_pages (
  exhibit_id uuid not null references public.exhibits (id) on delete cascade,
  case_id uuid not null references public.cases (id) on delete cascade,
  page_no int not null check (page_no >= 1),
  content text not null,
  primary key (exhibit_id, page_no)
);
alter table public.exhibit_pages enable row level security;
create policy "read pages of readable case" on public.exhibit_pages
  for select to authenticated using ((select public.can_read_case(case_id)));

-- ---------------------------------------------------------------------------
-- Pipeline runs. Every output row is keyed by run so that repeated runs
-- (reliability evals, re-runs after new evidence) never overwrite each other.
-- ---------------------------------------------------------------------------
create table public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  workflow_run_id text,
  status text not null default 'running' check (status in ('running', 'suspended', 'succeeded', 'failed')),
  current_step text,
  error text,
  config jsonb not null default '{}',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.pipeline_runs enable row level security;
create index on public.pipeline_runs (case_id, started_at desc);
create policy "staff read runs" on public.pipeline_runs
  for select to authenticated using ((select public.is_staff()));

alter table public.cases
  add constraint cases_active_run_fk foreign key (active_run_id) references public.pipeline_runs (id) on delete set null;

-- Idempotency ledger: a step that already committed its output for a run is
-- skipped on retry/resume instead of re-calling the model.
create table public.step_checkpoints (
  run_id uuid not null references public.pipeline_runs (id) on delete cascade,
  step text not null,
  output jsonb not null,
  completed_at timestamptz not null default now(),
  primary key (run_id, step)
);
alter table public.step_checkpoints enable row level security;
create policy "staff read checkpoints" on public.step_checkpoints
  for select to authenticated using ((select public.is_staff()));

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pipeline_runs (id) on delete cascade,
  case_id uuid not null references public.cases (id) on delete cascade,
  exhibit_id uuid not null references public.exhibits (id) on delete cascade,
  page_no int not null,
  quote text not null,          -- verbatim span from the page
  statement text not null,      -- normalized factual claim
  quote_verified boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.claims enable row level security;
create index on public.claims (run_id);
create policy "staff read claims" on public.claims
  for select to authenticated using ((select public.is_staff()));

create table public.criterion_assessments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pipeline_runs (id) on delete cascade,
  case_id uuid not null references public.cases (id) on delete cascade,
  criterion public.criterion_key not null,
  strength public.evidence_strength not null,
  rationale text not null,
  claim_ids uuid[] not null default '{}',
  comparable_evidence boolean not null default false,
  unique (run_id, criterion)
);
alter table public.criterion_assessments enable row level security;
create policy "staff read assessments" on public.criterion_assessments
  for select to authenticated using ((select public.is_staff()));

-- Gaps cover both the 8 criteria and the non-criteria O-1A requirements
-- (advisory opinion, itinerary/contract, employer relationship, final merits).
create table public.gaps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pipeline_runs (id) on delete cascade,
  case_id uuid not null references public.cases (id) on delete cascade,
  kind text not null check (kind in ('criterion', 'requirement', 'final_merits')),
  criterion public.criterion_key,
  title text not null,
  detail text not null,
  severity text not null check (severity in ('high', 'medium', 'low'))
);
alter table public.gaps enable row level security;
create policy "staff read gaps" on public.gaps
  for select to authenticated using ((select public.is_staff()));

create table public.follow_up_questions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pipeline_runs (id) on delete cascade,
  case_id uuid not null references public.cases (id) on delete cascade,
  criterion public.criterion_key,
  question text not null,
  rationale text not null,
  status text not null default 'open' check (status in ('open', 'answered', 'dismissed')),
  answer text,
  answered_by uuid references public.profiles (id),
  answered_at timestamptz
);
alter table public.follow_up_questions enable row level security;
create policy "read questions of readable case" on public.follow_up_questions
  for select to authenticated using ((select public.can_read_case(case_id)));
create policy "answer questions of readable case" on public.follow_up_questions
  for update to authenticated using ((select public.can_read_case(case_id)));

-- ---------------------------------------------------------------------------
-- Draft: sections -> paragraphs -> sentences (jsonb) with citations.
-- sentences: [{ "text": "...", "citations": [{ "claimId", "exhibitLabel", "page", "quote" }] }]
-- ---------------------------------------------------------------------------
create table public.draft_sections (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pipeline_runs (id) on delete cascade,
  case_id uuid not null references public.cases (id) on delete cascade,
  criterion public.criterion_key,
  heading text not null,
  position int not null
);
alter table public.draft_sections enable row level security;
create policy "staff read sections" on public.draft_sections
  for select to authenticated using ((select public.is_staff()));

create table public.paragraphs (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.draft_sections (id) on delete cascade,
  case_id uuid not null references public.cases (id) on delete cascade,
  position int not null,
  sentences jsonb not null,
  status public.paragraph_status not null default 'pending',
  version int not null default 1,
  review_note text,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  constraint every_sentence_cited check (
    jsonb_typeof(sentences) = 'array'
    and jsonb_array_length(sentences) > 0
    and not jsonb_path_exists(sentences, '$[*] ? (!exists(@.citations[0]))')
  )
);
alter table public.paragraphs enable row level security;
create index on public.paragraphs (section_id, position);
create policy "staff read paragraphs" on public.paragraphs
  for select to authenticated using ((select public.is_staff()));
create policy "staff review paragraphs" on public.paragraphs
  for update to authenticated using ((select public.is_staff()));

-- Immutable version history (no update/delete policies exist).
create table public.paragraph_versions (
  id bigint generated always as identity primary key,
  paragraph_id uuid not null references public.paragraphs (id) on delete cascade,
  case_id uuid not null references public.cases (id) on delete cascade,
  version int not null,
  sentences jsonb not null,
  status public.paragraph_status not null,
  actor_kind text not null check (actor_kind in ('agent', 'human')),
  actor_id uuid references public.profiles (id),
  note text,
  created_at timestamptz not null default now()
);
alter table public.paragraph_versions enable row level security;
create policy "staff read versions" on public.paragraph_versions
  for select to authenticated using ((select public.is_staff()));

-- BEFORE UPDATE: enforce the sign-off lock and bump the version.
create function public.guard_paragraph_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select status from public.cases where id = new.case_id) = 'signed_off' then
    raise exception 'case % is signed off; the draft is locked', new.case_id using errcode = 'P0001';
  end if;
  if new.sentences is distinct from old.sentences or new.status is distinct from old.status then
    new.version := old.version + 1;
    new.updated_at := now();
    new.updated_by := (select auth.uid());
  end if;
  return new;
end $$;
create trigger paragraphs_guard before update on public.paragraphs
  for each row execute function public.guard_paragraph_update();

-- AFTER INSERT/UPDATE: append the immutable history row (agent if no session, else the human).
create function public.record_paragraph_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.version = old.version then
    return null;
  end if;
  insert into public.paragraph_versions (paragraph_id, case_id, version, sentences, status, actor_kind, actor_id, note)
  values (new.id, new.case_id, new.version, new.sentences, new.status,
          case when (select auth.uid()) is null then 'agent' else 'human' end,
          (select auth.uid()), new.review_note);
  return null;
end $$;
create trigger paragraphs_versioning after insert or update on public.paragraphs
  for each row execute function public.record_paragraph_version();

-- ---------------------------------------------------------------------------
-- Objections raised by the adversarial "USCIS officer" agent
-- ---------------------------------------------------------------------------
create table public.objections (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pipeline_runs (id) on delete cascade,
  case_id uuid not null references public.cases (id) on delete cascade,
  prong text not null check (prong in ('criteria', 'final_merits', 'requirement')),
  criterion public.criterion_key,
  reason_code text not null,
  objection text not null,
  severity text not null check (severity in ('high', 'medium', 'low')),
  suggested_fix text not null,
  aao_refs jsonb not null default '[]',
  status text not null default 'open' check (status in ('open', 'addressed', 'dismissed'))
);
alter table public.objections enable row level security;
create policy "staff read objections" on public.objections
  for select to authenticated using ((select public.is_staff()));
create policy "staff triage objections" on public.objections
  for update to authenticated using ((select public.is_staff()));

-- ---------------------------------------------------------------------------
-- Attorney sign-off: the human checkpoint. Enforced in the database, not UI:
-- only an attorney, only when every paragraph is resolved. The draft hash
-- makes the signed content tamper-evident.
-- ---------------------------------------------------------------------------
create table public.signoffs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  run_id uuid not null references public.pipeline_runs (id),
  attorney_id uuid not null references public.profiles (id) default auth.uid(),
  note text,
  content_sha256 text,
  created_at timestamptz not null default now()
);
alter table public.signoffs enable row level security;
create policy "staff read signoffs" on public.signoffs
  for select to authenticated using ((select public.can_read_case(case_id)));
create policy "attorney signs resolved draft" on public.signoffs
  for insert to authenticated with check (
    (select public.my_role()) = 'attorney'
    and attorney_id = (select auth.uid())
    and not exists (
      select 1 from public.paragraphs p
      join public.draft_sections s on s.id = p.section_id
      where s.run_id = signoffs.run_id and p.status = 'pending'
    )
  );

create function public.draft_digest(p_run uuid) returns text
language sql stable security definer set search_path = '' as $$
  select encode(extensions.digest(coalesce(string_agg(p.sentences::text || ':' || p.status::text, '|' order by s.position, p.position), ''), 'sha256'), 'hex')
  from public.paragraphs p join public.draft_sections s on s.id = p.section_id
  where s.run_id = p_run and p.status <> 'rejected'
$$;

create function public.finalize_signoff() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.content_sha256 := public.draft_digest(new.run_id);
  update public.cases set status = 'signed_off', updated_at = now() where id = new.case_id;
  return new;
end $$;
create trigger signoffs_finalize before insert on public.signoffs
  for each row execute function public.finalize_signoff();

-- ---------------------------------------------------------------------------
-- Observability: every step, model call, retry and checkpoint
-- ---------------------------------------------------------------------------
create table public.agent_events (
  id bigint generated always as identity primary key,
  case_id uuid references public.cases (id) on delete cascade,
  run_id uuid references public.pipeline_runs (id) on delete cascade,
  step text not null,
  kind text not null check (kind in ('step_start', 'step_end', 'step_skipped', 'llm_call', 'retry', 'error', 'checkpoint', 'info')),
  message text not null,
  model text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(12, 6),
  latency_ms int,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.agent_events enable row level security;
create index on public.agent_events (run_id, id);
create policy "staff read events" on public.agent_events
  for select to authenticated using ((select public.is_staff()));

-- Audit trail for case-level actions taken by people.
create table public.audit_log (
  id bigint generated always as identity primary key,
  case_id uuid references public.cases (id) on delete cascade,
  actor_id uuid references public.profiles (id) default auth.uid(),
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
create policy "staff read audit" on public.audit_log
  for select to authenticated using ((select public.is_staff()));
create policy "members append audit" on public.audit_log
  for insert to authenticated with check ((select public.can_read_case(case_id)) and actor_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Public AAO decisions corpus (grounding for the officer agent + golden set)
-- ---------------------------------------------------------------------------
create table public.aao_decisions (
  id text primary key,                 -- USCIS file stem, e.g. MAR242026_01D8101
  decision_date date not null,
  source_url text not null,
  field text,
  outcome text not null,
  split text not null default 'corpus' check (split in ('corpus', 'golden')),
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.aao_decisions enable row level security;
create policy "staff read decisions" on public.aao_decisions
  for select to authenticated using ((select public.is_staff()));

create table public.aao_chunks (
  id bigint generated always as identity primary key,
  decision_id text not null references public.aao_decisions (id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding extensions.vector(768),
  fts tsvector generated always as (to_tsvector('english', content)) stored,
  unique (decision_id, chunk_index)
);
alter table public.aao_chunks enable row level security;
create policy "staff read chunks" on public.aao_chunks
  for select to authenticated using ((select public.is_staff()));
create index aao_chunks_embedding_idx on public.aao_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index aao_chunks_fts_idx on public.aao_chunks using gin (fts);

-- Hybrid retrieval (vector + full text) fused with Reciprocal Rank Fusion.
-- exclude_ids enables leave-one-out evaluation: a golden decision is never
-- allowed to retrieve itself.
create function public.match_aao_chunks(
  query_embedding extensions.vector(768),
  query_text text,
  match_count int default 8,
  exclude_ids text[] default '{}',
  rrf_k int default 50
) returns table (decision_id text, chunk_index int, content text, score double precision)
language sql stable set search_path = public, extensions as $$
  with semantic as (
    select c.id, row_number() over (order by c.embedding <=> query_embedding) as rank
    from public.aao_chunks c
    where not (c.decision_id = any (exclude_ids))
    order by c.embedding <=> query_embedding
    limit match_count * 4
  ),
  lexical as (
    select c.id, row_number() over (order by ts_rank_cd(c.fts, websearch_to_tsquery('english', query_text)) desc) as rank
    from public.aao_chunks c
    where c.fts @@ websearch_to_tsquery('english', query_text)
      and not (c.decision_id = any (exclude_ids))
    order by ts_rank_cd(c.fts, websearch_to_tsquery('english', query_text)) desc
    limit match_count * 4
  )
  select c.decision_id, c.chunk_index, c.content,
         coalesce(1.0 / (rrf_k + s.rank), 0) + coalesce(1.0 / (rrf_k + l.rank), 0) as score
  from semantic s
  full outer join lexical l on l.id = s.id
  join public.aao_chunks c on c.id = coalesce(s.id, l.id)
  order by score desc
  limit match_count
$$;

-- ---------------------------------------------------------------------------
-- Storage: private bucket, objects stored under <case_id>/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exhibits', 'exhibits', false, 26214400, array['application/pdf'])
on conflict (id) do nothing;

create policy "read exhibit files of readable case" on storage.objects
  for select to authenticated
  using (bucket_id = 'exhibits' and (select public.can_read_case(((storage.foldername(name))[1])::uuid)));
create policy "upload exhibit files to readable case" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'exhibits' and (select public.can_read_case(((storage.foldername(name))[1])::uuid)));
