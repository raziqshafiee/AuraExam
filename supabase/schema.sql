-- ============================================================
-- AuraExam — Supabase Schema
-- Run this entire file in the Supabase SQL editor.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ── Profiles (extends auth.users) ────────────────────────────
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  role        text not null check (role in ('student','lecturer','admin')) default 'student',
  status      text not null check (status in ('active','banned','pending')) default 'active',
  created_at  timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, name, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    case coalesce(new.raw_user_meta_data->>'role','student')
      when 'lecturer' then 'pending'
      else 'active'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Classes ──────────────────────────────────────────────────
create table if not exists classes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,
  name        text not null,
  lecturer_id uuid references profiles(id) on delete set null,
  color       text not null default 'lime',
  created_at  timestamptz not null default now()
);

-- ── Class enrollments ────────────────────────────────────────
create table if not exists class_enrollments (
  class_id    uuid references classes(id) on delete cascade,
  student_id  uuid references profiles(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

-- ── Exams ────────────────────────────────────────────────────
create table if not exists exams (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  class_id        uuid references classes(id) on delete cascade,
  start_time      timestamptz not null,
  end_time        timestamptz not null,
  duration        int not null check (duration > 0),
  questions_count int not null default 0,
  status          text not null check (status in ('draft','upcoming','live','closed','graded')) default 'draft',
  shuffle         boolean not null default false,
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- ── Questions ────────────────────────────────────────────────
create table if not exists questions (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('MCQ','TF','ESSAY')),
  text        text not null,
  class_id    uuid references classes(id) on delete set null,
  difficulty  text not null check (difficulty in ('easy','med','hard')) default 'med',
  points      int not null default 1,
  tags        text[] not null default '{}',
  version     int not null default 1,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ── Exam questions ───────────────────────────────────────────
create table if not exists exam_questions (
  exam_id      uuid references exams(id) on delete cascade,
  question_id  uuid references questions(id) on delete cascade,
  order_index  int not null,
  primary key (exam_id, question_id)
);

-- ── Submissions ──────────────────────────────────────────────
create table if not exists submissions (
  id              uuid primary key default gen_random_uuid(),
  exam_id         uuid references exams(id) on delete cascade,
  student_id      uuid references profiles(id) on delete cascade,
  status          text not null check (status in ('in-progress','submitted','graded','flagged')) default 'in-progress',
  score           int,
  total           int not null,
  flags           int not null default 0,
  appeal_required boolean not null default false,
  started_at      timestamptz,
  last_seen_at    timestamptz,
  submitted_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (exam_id, student_id)
);

-- ── Flag reasons ─────────────────────────────────────────────
create table if not exists flag_reasons (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid references submissions(id) on delete cascade,
  time           text not null,
  type           text not null,
  label          text not null,
  created_at     timestamptz not null default now()
);

-- ── Essay answers ────────────────────────────────────────────
create table if not exists essay_answers (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid references submissions(id) on delete cascade,
  question_id    uuid references questions(id) on delete cascade,
  answer         text,
  score          int,
  graded_by      uuid references profiles(id) on delete set null,
  graded_at      timestamptz,
  created_at     timestamptz not null default now(),
  unique (submission_id, question_id)
);

-- ── Announcements ────────────────────────────────────────────
create table if not exists announcements (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid references classes(id) on delete cascade,
  author_id   uuid references profiles(id) on delete set null,
  title       text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);

-- ── Class notes ──────────────────────────────────────────────
create table if not exists class_notes (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid references classes(id) on delete cascade,
  author_id   uuid references profiles(id) on delete set null,
  title       text not null,
  description text not null default '',
  file_type   text not null check (file_type in ('pdf','image','file')),
  file_name   text not null,
  file_url    text,
  created_at  timestamptz not null default now()
);

-- ── Student file submissions ─────────────────────────────────
create table if not exists student_file_submissions (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid references classes(id) on delete cascade,
  student_id  uuid references profiles(id) on delete cascade,
  title       text not null,
  file_name   text not null,
  file_type   text not null check (file_type in ('pdf','image','file')),
  file_url    text,
  status      text not null check (status in ('submitted','reviewed')) default 'submitted',
  created_at  timestamptz not null default now()
);

-- ── Appeals ──────────────────────────────────────────────────
create table if not exists appeals (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid references submissions(id) on delete set null,
  student_id     uuid references profiles(id) on delete cascade,
  exam_title     text not null,
  question_ref   text,
  type           text not null check (type in ('score','integrity')),
  status         text not null check (status in ('pending','approved','rejected')) default 'pending',
  reason         text not null,
  created_at     timestamptz not null default now()
);

-- ── Notifications ────────────────────────────────────────────
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete cascade,
  kind        text not null check (kind in ('exam','grade','appeal','system','integrity')),
  title       text not null,
  body        text not null,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── Audit log ────────────────────────────────────────────────
create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references profiles(id) on delete set null,
  action      text not null,
  target      text not null,
  category    text not null default 'general'
                check (category in ('user_management','exam','integrity','appeal','class','general')),
  created_at  timestamptz not null default now()
);

-- ============================================================
-- Better Auth Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    image TEXT,
    role TEXT NOT NULL DEFAULT 'student',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "session" (
    id TEXT PRIMARY KEY,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    token TEXT NOT NULL UNIQUE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
    id TEXT PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ,
    "refreshTokenExpiresAt" TIMESTAMPTZ,
    scope TEXT,
    password TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "verification" (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table profiles                 enable row level security;
alter table classes                  enable row level security;
alter table class_enrollments        enable row level security;
alter table exams                    enable row level security;
alter table questions                enable row level security;
alter table exam_questions           enable row level security;
alter table submissions              enable row level security;
alter table flag_reasons             enable row level security;
alter table essay_answers            enable row level security;
alter table announcements            enable row level security;
alter table class_notes              enable row level security;
alter table student_file_submissions enable row level security;
alter table appeals                  enable row level security;
alter table notifications            enable row level security;
alter table audit_log                enable row level security;
alter table "user"                   enable row level security;
alter table "session"                enable row level security;
alter table "account"                enable row level security;
alter table "verification"           enable row level security;

-- Profiles
create policy "profiles: read all"   on profiles for select using (true);
create policy "profiles: update own" on profiles for update using (auth.uid() = id);
create policy "profiles: insert own" on profiles for insert with check (auth.uid() = id);

-- Classes
create policy "classes: read all"        on classes for select using (true);
create policy "classes: lecturer manage" on classes for all using (auth.uid() = lecturer_id);

-- Enrollments
create policy "enrollments: read" on class_enrollments for select
  using (auth.uid() = student_id
    or exists (select 1 from classes where id = class_id and lecturer_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "enrollments: join" on class_enrollments for insert with check (auth.uid() = student_id);

-- Exams
create policy "exams: read all"          on exams for select using (true);
create policy "exams: lecturer manage"   on exams for all
  using (exists (select 1 from classes where id = class_id and lecturer_id = auth.uid()));

-- Questions
create policy "questions: read all"      on questions for select using (true);
create policy "questions: lecturer manage" on questions for all
  using (exists (select 1 from classes where id = class_id and lecturer_id = auth.uid()));

-- Exam questions
create policy "exam_questions: read"     on exam_questions for select using (true);

-- Submissions
create policy "submissions: student own" on submissions for select using (auth.uid() = student_id);
create policy "submissions: lecturer read" on submissions for select
  using (exists (
    select 1 from exams e join classes c on e.class_id = c.id
    where e.id = exam_id and c.lecturer_id = auth.uid()
  ));
create policy "submissions: student insert" on submissions for insert with check (auth.uid() = student_id);
create policy "submissions: student update" on submissions for update using (auth.uid() = student_id);
create policy "submissions: lecturer update" on submissions for update
  using (exists (
    select 1 from exams e join classes c on e.class_id = c.id
    where e.id = exam_id and c.lecturer_id = auth.uid()
  ));

-- Flag reasons
create policy "flags: read" on flag_reasons for select
  using (exists (select 1 from submissions s where s.id = submission_id
    and (s.student_id = auth.uid() or exists (
      select 1 from exams e join classes c on e.class_id = c.id
      where e.id = s.exam_id and c.lecturer_id = auth.uid()
    ))));
create policy "flags: insert" on flag_reasons for insert with check (true);

-- Essay answers
create policy "essays: read" on essay_answers for select
  using (exists (select 1 from submissions s where s.id = submission_id
    and (s.student_id = auth.uid() or exists (
      select 1 from exams e join classes c on e.class_id = c.id
      where e.id = s.exam_id and c.lecturer_id = auth.uid()
    ))));
create policy "essays: insert" on essay_answers for insert with check (true);
create policy "essays: grade"  on essay_answers for update
  using (exists (
    select 1 from submissions s join exams e on e.id = s.exam_id join classes c on c.id = e.class_id
    where s.id = submission_id and c.lecturer_id = auth.uid()
  ));

-- Announcements
create policy "announcements: read"   on announcements for select using (true);
create policy "announcements: insert" on announcements for insert
  with check (exists (select 1 from classes where id = class_id and lecturer_id = auth.uid()));

-- Class notes
create policy "notes: read"   on class_notes for select using (true);
create policy "notes: insert" on class_notes for insert
  with check (exists (select 1 from classes where id = class_id and lecturer_id = auth.uid()));
create policy "notes: delete" on class_notes for delete
  using (exists (select 1 from classes where id = class_id and lecturer_id = auth.uid()));

-- Student file submissions
create policy "sfs: student own"    on student_file_submissions for select using (auth.uid() = student_id);
create policy "sfs: lecturer read"  on student_file_submissions for select
  using (exists (select 1 from classes where id = class_id and lecturer_id = auth.uid()));
create policy "sfs: student insert" on student_file_submissions for insert with check (auth.uid() = student_id);

-- Appeals
create policy "appeals: student own"    on appeals for select using (auth.uid() = student_id);
create policy "appeals: lecturer read"  on appeals for select
  using (exists (
    select 1 from submissions s join exams e on e.id = s.exam_id join classes c on c.id = e.class_id
    where s.id = submission_id and c.lecturer_id = auth.uid()
  ));
create policy "appeals: student insert" on appeals for insert with check (auth.uid() = student_id);
create policy "appeals: lecturer update" on appeals for update
  using (exists (
    select 1 from submissions s join exams e on e.id = s.exam_id join classes c on c.id = e.class_id
    where s.id = submission_id and c.lecturer_id = auth.uid()
  ));

-- Notifications
create policy "notifs: own read"   on notifications for select  using (auth.uid() = user_id);
create policy "notifs: own update" on notifications for update  using (auth.uid() = user_id);

-- Audit log (admin read only)
create policy "audit: admin read" on audit_log for select
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- ============================================================
-- Storage buckets
-- ============================================================

insert into storage.buckets (id, name, public) values ('class-notes', 'class-notes', false)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public) values ('student-submissions', 'student-submissions', false)
  on conflict (id) do nothing;

create policy "class-notes upload"   on storage.objects for insert
  with check (bucket_id = 'class-notes' and auth.role() = 'authenticated');
create policy "class-notes read"     on storage.objects for select
  using (bucket_id = 'class-notes' and auth.role() = 'authenticated');

create policy "student-sub upload"   on storage.objects for insert
  with check (bucket_id = 'student-submissions' and auth.role() = 'authenticated');
create policy "student-sub own read" on storage.objects for select
  using (bucket_id = 'student-submissions' and auth.role() = 'authenticated');

-- Proctor face snapshots — private bucket. Object path is "{submission_id}/{ts}.jpg".
insert into storage.buckets (id, name, public) values ('proctor-snapshots', 'proctor-snapshots', false)
  on conflict (id) do nothing;

create policy "proctor-snapshots student upload" on storage.objects for insert
  with check (
    bucket_id = 'proctor-snapshots'
    and exists (
      select 1 from submissions s
      where s.id::text = (storage.foldername(name))[1] and s.student_id = auth.uid()
    )
  );
create policy "proctor-snapshots owner+lecturer read" on storage.objects for select
  using (
    bucket_id = 'proctor-snapshots'
    and exists (
      select 1 from submissions s
      join exams e on e.id = s.exam_id
      join classes c on c.id = e.class_id
      where s.id::text = (storage.foldername(name))[1]
        and (s.student_id = auth.uid() or c.lecturer_id = auth.uid())
    )
  );

-- ============================================================
-- Exam status lifecycle  (draft → upcoming → live → closed → graded)
-- ============================================================
-- Authoritative, time-driven state machine. Scheduled every minute by pg_cron
-- so an exam's status never lies. SECURITY DEFINER lets the scheduled run
-- update rows regardless of RLS.

create or replace function sync_exam_statuses()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- upcoming -> live : start time reached
  update exams set status = 'live'
   where status = 'upcoming' and start_time <= now();

  -- live -> closed : end time reached
  update exams set status = 'closed'
   where status = 'live' and end_time <= now();

  -- live -> closed : every enrolled student already has a terminal submission
  update exams e set status = 'closed'
   where e.status = 'live'
     and exists (select 1 from class_enrollments ce where ce.class_id = e.class_id)
     and not exists (
       select 1 from class_enrollments ce
        where ce.class_id = e.class_id
          and not exists (
            select 1 from submissions s
             where s.exam_id = e.id and s.student_id = ce.student_id
               and s.status in ('submitted','graded','flagged')
          )
     );

  -- closed -> graded : has submissions and no essay answer is still ungraded
  update exams e set status = 'graded'
   where e.status = 'closed'
     and exists (
       select 1 from submissions s
        where s.exam_id = e.id and s.status in ('submitted','graded','flagged')
     )
     and not exists (
       select 1 from essay_answers ea
         join submissions s on s.id = ea.submission_id
        where s.exam_id = e.id and ea.score is null
     );
end
$fn$;

-- Schedule every minute. Requires the pg_cron extension (Dashboard → Database →
-- Extensions, or `create extension pg_cron;`). Safe to run more than once.
-- create extension if not exists pg_cron;
-- select cron.schedule('exam-status-sync', '* * * * *', $$ select sync_exam_statuses(); $$);
