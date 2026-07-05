# "Why Was I Wrong?" — study autopsy module

An add-on study module. After a student's exam is graded, `/study` lists
their attempts that contain wrong MCQ/True-False answers, and
`/study/autopsy/$attemptId` shows each wrong answer with an on-demand,
cached AI explanation (correct answer, why the student's choice was wrong,
the underlying concept) plus a "weak topics" summary.

This is **strictly an add-on**: it never modifies any existing table, route,
or component. It only reads existing graded exam data and writes to one new
table, `answer_explanations`.

## How it fits together

```
src/routes/_authenticated/study.index.tsx              /study
src/routes/_authenticated/study.autopsy.$attemptId.tsx /study/autopsy/$attemptId
src/features/study-autopsy/
  types.ts                 shared TS types
  server.ts                read-only TanStack Start server fns (getAutopsyList, getAttemptAutopsy)
  use-explanations.ts      client hook: per-question generate/loading/error state
  components/
    WeakTopicsCard.tsx      "You lost most marks on: X (60%)" summary
    WrongAnswerAccordion.tsx accordion of wrong answers
    ExplanationPanel.tsx     generate button / cached explanation display
supabase/migrations/0001_study_autopsy.sql  new table + RLS only
supabase/functions/study-explain/index.ts   Gemini-backed edge function
```

Data flow: the route loader reads wrong MCQ/TF answers (from the existing
`essay_answers` table — see note below) plus any already-cached
explanations from `answer_explanations`. Clicking "Generate explanation"
calls the `study-explain` edge function, which checks the cache, calls
Gemini on a miss, stores the result, and returns it — the frontend merges
the response into local state, no page reload needed.

**Non-obvious repo detail:** despite the name, the existing `essay_answers`
table stores MCQ and True/False answers too (not just essays) — see
`src/lib/supabase/exams.ts`'s `gradeAnswers`/`persistAnswers`. This module's
server functions filter that table to `questions.type IN ('MCQ','TF')` and
`score = 0` to find wrong objective answers.

## Setup

### 1. Run the migration

This repo has no automated migration runner for new tables (existing
`scripts/migrate-*.ts` scripts only ever alter existing tables). Run the new
SQL file manually:

- Supabase Dashboard → SQL Editor → paste & run
  `supabase/migrations/0001_study_autopsy.sql`, **or**
- `supabase db execute --file supabase/migrations/0001_study_autopsy.sql` if
  you have the Supabase CLI linked to the project.

This only creates the new `answer_explanations` table + its RLS policies.

### 2. Get a free Gemini API key

Create one at <https://aistudio.google.com/app/apikey> (free tier covers
`gemini-2.0-flash`).

### 3. Deploy the edge function

```bash
# one-time: link the CLI to your Supabase project, if not already done
supabase link --project-ref <your-project-ref>

# set the secret (server-side only — never exposed to the client)
supabase secrets set GEMINI_API_KEY=your-key-here

# deploy
supabase functions deploy study-explain
```

No other env vars are needed for the function — `SUPABASE_URL` and
`SUPABASE_ANON_KEY` are automatically injected into every Supabase edge
function at runtime.

### 4. Nothing to change in the app's own `.env`

The frontend calls the function via the existing browser Supabase client
(`src/lib/supabase/client.ts`), which already has `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` configured — `supabase.functions.invoke(...)`
automatically forwards the signed-in student's access token, which is how
the function knows who is calling and lets RLS do the rest.

## Privacy

The edge function sends Gemini **only**: question text, MCQ options (if
any), the correct answer, and the student's chosen answer. It never sends
the student's name, email, or user id. The student's identity stays local
to the function — Gemini only ever sees anonymous question/answer text.

## Re-deploying after edits

Any change to `supabase/functions/study-explain/index.ts` requires
re-running `supabase functions deploy study-explain` to take effect — Vite's
own `npm run build`/`npm run dev` do not touch edge functions.

## Known limitations / next steps

- No nav link has been added anywhere in the existing UI (e.g. `AppShell`)
  to avoid editing any existing file. Until you choose to add one yourself,
  students reach `/study` only via direct URL.
- Essay questions are out of scope by design (the brief asks for
  objective/MCQ-TF questions only).
- `concept_tag` clustering falls back to the question's existing `tags[0]`
  column until an explanation has actually been generated for a question —
  so the weak-topics card is meaningful immediately, then sharpens as the
  student generates more explanations.
