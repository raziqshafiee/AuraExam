# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**Aura Exam** — a calm, fair online examination platform for Malaysian classrooms. Three roles: `student`, `lecturer`, `admin`. Built with TanStack Start (SSR), Supabase (auth + DB + storage), and a neo-brutalist design system (warm cream + neon lime/pink/purple accents).

## Commands

```bash
npm run dev          # Start dev server (Vite)
npm run build        # Production build
npm run lint         # ESLint
npm run format       # Prettier

# Database scripts (run once per migration, use tsx)
# NOTE: these scripts use pg directly and require DATABASE_URL connectivity.
# If the direct DB host is unreachable from your network, run the SQL manually
# in the Supabase Dashboard → SQL Editor instead.
npm run seed:admin
npm run seed:lecturer
npm run migrate:appeals
npm run migrate:assignments
npm run migrate:assignment-grading
npm run migrate:assignment-max-score
npm run migrate:submission-rls
npm run migrate:submission-started-at
npm run migrate:proctoring
npm run migrate:exam-lifecycle
npm run migrate:notifications
npm run create:buckets

# Clear data (destructive)
npm run clear:exam-data
npm run clear:submissions
npm run clear:appeals
```

No test suite exists in this project.

## Pending schema changes (run in Supabase SQL Editor)

```sql
-- 1. Add category column to audit_log (required for audit logging to work)
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general'
  CHECK (category IN ('user_management','exam','integrity','appeal','class','general'));

-- 2. Allow admin to read class_enrollments (fixes zero student count on admin/classes)
DROP POLICY IF EXISTS "enrollments: read" ON class_enrollments;
CREATE POLICY "enrollments: read" ON class_enrollments FOR SELECT
  USING (
    auth.uid() = student_id
    OR EXISTS (SELECT 1 FROM classes WHERE id = class_id AND lecturer_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
```

## Architecture

### Stack
- **TanStack Start** (SSR + file-based routing) with `@tanstack/react-router` and `@tanstack/react-query`
- **Supabase** for auth, PostgreSQL DB, RLS, and storage. Three clients:
  - `src/lib/supabase/client.ts` — browser (anon key)
  - `src/lib/supabase/server.ts` — SSR (reads session from cookies)
  - Admin client — created inline in `users.ts` and `audit.ts` using `SUPABASE_SERVICE_ROLE_KEY` for operations that require bypassing RLS
- **Vite** build via `@lovable.dev/vite-tanstack-config` — do NOT add `tanstackStart`, `viteReact`, `tailwindcss`, or `tsConfigPaths` plugins manually; they are already injected
- **Tailwind CSS v4** with design tokens in `src/styles.css` (oklch semantic vars)

### Auth & roles
- `src/lib/auth.ts` — `getAuthUser()` (server/client-aware), `useAuthUser()` hook, `signIn`/`signUp`/`signOut`
- Role is stored in `user.user_metadata.role` and as a `profiles.role` column
- `ROLE_HOME` maps role → home route (`/student`, `/lecturer`, `/admin`)
- `_authenticated.tsx` layout route enforces auth via `beforeLoad`; unauthenticated users redirect to `/login`

### Route structure
```
src/routes/
  __root.tsx                      # QueryClientProvider, Toaster, error/404 boundaries
  _authenticated.tsx              # Auth guard + AppShell wrapper
  _authenticated/
    student/   (dashboard, classes/$classId, exams/$examId/take, appeals, notifications, profile)
    lecturer/  (dashboard, classes/$classId, question-bank, exams/$examId/edit|results|monitor, appeals, notifications, profile)
    admin/     (dashboard, users, classes, exams, settings, audit-log, pdpa)
  login.tsx, register.tsx, ...    # Public auth pages
  index.tsx, features.tsx, ...    # Marketing pages
```

Routes use TanStack Router's file-based convention; `routeTree.gen.ts` is auto-generated — do not edit it manually.

The exam take page (`/student/exams/$examId/take`) is fullscreen — AppShell hides the nav when the URL matches `/exams/[id]/take`.

### Server functions
All DB access goes through `createServerFn` from `@tanstack/react-start`. Server functions live in `src/lib/supabase/*.ts` and use the SSR Supabase client. The pattern is always:

```ts
export const myFn = createServerFn({ method: "GET" | "POST" })
  .inputValidator((data: T) => data)   // optional
  .handler(async ({ data }) => { ... });
```

Server functions call `supabase.auth.getUser()` at the top to enforce authorization. The `db()` helper casts to `any` to bypass TS strict-mode on Supabase's generic types — this is intentional.

### Environment variables
```
VITE_SUPABASE_URL=         # Supabase project URL (import.meta.env)
VITE_SUPABASE_ANON_KEY=    # Public anon key (import.meta.env)
SUPABASE_SERVICE_ROLE_KEY= # Service role key (process.env, server-only) — required for admin API
DATABASE_URL=              # Direct Postgres URL — only needed by migration scripts
```

### Data model (key tables)

`profiles`, `classes`, `class_enrollments`, `questions`, `exams`, `exam_questions`, `submissions`, `essay_answers`, `flag_reasons`, `appeals`, `notifications`, `class_assignments`, `assignment_submissions`, `audit_log`, `class_notes`, `announcements`

#### Key invariants
- `submissions.auto_score` = MCQ+TF points (immutable after submit); `submissions.score` = auto_score + graded essay points
- `submissions.flags` increments on each hard integrity event; at 3 flags the exam is auto-submitted as `"flagged"`
- Essays have `score: null` until a lecturer grades them; the submission is promoted to `"graded"` only when ALL essays have a score
- `submissions.started_at` is set on first answer save; `submissions.last_seen_at` is updated by heartbeat pings every 30s
- `audit_log.category` must be one of: `user_management`, `exam`, `integrity`, `appeal`, `class`, `general`

#### Exam lifecycle
```
draft → upcoming (published) → live (start_time reached) → closed (end_time reached) → graded (all essays scored)
```
- `draft → upcoming`: full edit allowed, requires title + class + schedule + questions
- `upcoming → draft`: unpublish — only if no submissions and window not yet open
- Once `upcoming`: only title and `require_camera` can change
- `live/closed/graded`: no edits or deletion permitted

#### Appeal business rules
- One appeal per submission (score dispute or integrity challenge)
- Appeal window: 7 days from submission/flagging
- Integrity appeal approved → status becomes `retake-approved`
- Score appeal approved → lecturer supplies corrected score; `submissions.score` is updated

#### Integrity / proctoring
- Hard flags (tab-switch, copy-paste, fullscreen-exit, multiple-faces): counted toward 3-strike auto-submit
- Advisory flags (face-missing, camera-lost, gaze-away, head-turned): recorded for review only, do NOT count toward auto-submit
- `proctor-snapshots` storage bucket holds face captures scoped to `{submissionId}/`
- **Fullscreen**: exam enters fullscreen on lobby "Start exam" click (user-gesture scope); exiting fires a hard flag; exits cleanly on unmount
- **Multiple-faces hard flag**: 8-second grace period (avoids walk-past false positives), 60-second cooldown between reports
- **Gaze tracking**: uses FaceLandmarker head-pose matrix — `head-turned` fires when |yaw| > 45° for 5s; `gaze-away` fires when pitch < −30° (looking down) for 5s; both advisory only, 5s grace, 30s cooldown
- **Adaptive snapshots**: normal rate 60s; any suspicious event triggers 2-minute alert mode at 15s rate
- Face detector upgraded from BlazeFace (`FaceDetector`) to `FaceLandmarker` (~26MB, cached after first load) — provides face count + head-pose matrix in one pass
- `CameraProctor` accepts `onHardFlag?: (type, label) => void` prop; take page wires it to the same `sendFlag` used for tab-switch so auto-submit logic stays centralised

#### Assignment rules
- Deadline enforced server-side; client timer is advisory only
- Resubmission allowed until deadline (replaces file, resets status to `submitted`)
- After `reviewed` status, submission is locked
- Grading is only available after `end_at`

### Audit log
`src/lib/supabase/audit.ts` — `writeAudit(actorId, { action, target, category })` uses the service role client and never throws.

Events logged:
| Category | Events |
|---|---|
| `user_management` | admin bans/unbans a user |
| `class` | admin deletes a class |
| `exam` | lecturer publishes, unpublishes, deletes exam; all essays fully graded |
| `integrity` | exam auto-submitted after 3 integrity flags |
| `appeal` | lecturer approves or rejects an appeal |

### Components
- `src/components/brand/` — custom primitives:
  - `AppShell` — role-aware nav with unread notification badge (polls every 30s)
  - `WakeoutButton` — neo-brutalist button
  - `QuestionEditor` — MCQ/TF/Essay question creation and editing
  - `ExamBuilder` — full exam creation/editing wizard
  - `CameraProctor` — face detection + integrity flag UI during exams
  - `ProfilePage` — shared profile editing (student + lecturer)
  - `NotificationsPage` — shared notifications list
  - `ConfirmModal` — reusable destructive-action confirmation modal (replaces all `window.confirm`)
- `src/components/ui/` — shadcn/ui components (do not modify without reason)

### Export / reporting
`src/lib/export.ts` exports `buildCSV`, `downloadCSV`, `printTable`. Available reports: class roster, per-student history, all-exams summary, full combined report.

### Design tokens
Role accent colors: `student=sky (#5dd5fc)`, `lecturer=violet (#7c5cff)`, `admin=lime (#c4f542)`. Primary CTA is lime.

### Stubs / incomplete features
- `admin/settings` — UI only, no backend; settings are hardcoded (flag threshold = 3, appeal window = 7 days)
- `admin/pdpa` — mock data only; no real PDPA request processing

### Known issues / tech debt
- `pg` package still in `package.json` (used only by migration scripts)
- `src/lib/mock-data.ts` still present; `auditLog` export no longer used
- `src/lib/database.types.ts` is stale — `db()` cast-to-any is used everywhere as a workaround
- No cron for `syncExamStatuses` — exam transitions rely on client-triggered calls
- No rate limiting on server functions
- No test suite




Website (dev server):
npm run dev

Android phone (run on device/emulator):

Step 1 — build the web app first:
npm run build

Step 2 — sync to Android:
npx cap sync android

Step 3 — open Android Studio to run on phone:
npx cap open android

Then in Android Studio, click the Run button (▶) to deploy to your connected phone or emulator.