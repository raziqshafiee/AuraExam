-- ============================================================
-- "Why Was I Wrong?" study module — ADD-ON migration
-- Run this entire file in the Supabase SQL editor (or via the
-- Supabase CLI). It only CREATES new objects — it does not alter,
-- rename, or drop any existing table, column, policy, or function.
-- ============================================================

-- Caches one AI-generated explanation per (attempt, question) pair so the
-- same wrong answer is never re-sent to Gemini twice.
--
-- attempt_id  -> submissions.id   (the existing exam attempt; uuid)
-- question_id -> questions.id     (the existing question; uuid)
-- user_id     -> profiles.id      (the student; duplicated from the
--                attempt for RLS — lets the policy check ownership
--                without a join, and survives even if the FK chain
--                is ever queried independently)
create table if not exists answer_explanations (
  id              uuid primary key default gen_random_uuid(),
  attempt_id      uuid not null references submissions(id) on delete cascade,
  question_id     uuid not null references questions(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,
  correct_answer  text,
  explanation     text not null,
  concept_tag     text,
  created_at      timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index if not exists answer_explanations_user_idx
  on answer_explanations (user_id);

create index if not exists answer_explanations_attempt_idx
  on answer_explanations (attempt_id);

alter table answer_explanations enable row level security;

-- Students may only ever see/create their own cached explanations.
-- INSERT is allowed here (not just via a service-role function) because the
-- study-explain edge function forwards the calling student's own JWT — it
-- never uses the service-role key — so this policy is the actual gate.
create policy "answer_explanations: own select"
  on answer_explanations for select
  using (auth.uid() = user_id);

create policy "answer_explanations: own insert"
  on answer_explanations for insert
  with check (auth.uid() = user_id);
