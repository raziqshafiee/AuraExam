## Design direction (Wakeout, applied to Aura Exam)

Override the dark/purple wireframes with Wakeout's vibe:

- **Background:** warm cream `#fcfbf6` (light mode primary), surfaces in off-white/pale lilac
- **Accents:** neon lime `#c4f542` (primary CTA), hot pink `#ff5fa2`, electric purple `#7c5cff`, sky `#5dd5fc` (role accents: student=sky, lecturer=purple, admin=lime)
- **Type:** chunky rounded display (Fraunces or Bricolage Grotesque, heavy weight, tight tracking) for headings; Outfit/Inter for body; DM Mono for timers/IDs
- **Shapes:** pill buttons with hard 2px borders + offset shadow (neo-brutalist), squiggle/star/dot SVG doodles scattered behind sections, rounded-3xl cards
- **Motion:** light bounce on hover, no fades-everywhere

Tokens go into `src/styles.css` as oklch semantic vars and a brand layer.

## Scope: every screen in the spec

Based on the spec's Wireframe Screen Inventory (§13) and your wireframes file. Built as UI-complete routes with mock data — no backend yet (Cloud can be enabled in a follow-up).

### Public / marketing
- `/` — Landing (hero "Exams that actually feel calm.", feature pills, role-split CTAs, social proof, FAQ, footer)
- `/philosophy`, `/features`, `/contact` — supporting marketing pages

### Auth
- `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`

### Student (`/_authenticated/student/*`)
- `dashboard` — upcoming exams, recent grades, classes
- `classes`, `classes/$classId` — enrolled list + class detail (announcements, notes feed, members)
- `exams` — list + filters
- `exams/$examId/lobby` — pre-exam camera check + instructions
- `exams/$examId/take` — desktop-only exam runtime (question nav, flag, timer, lockdown UI shell)
- `exams/$examId/submit-confirm` — modal/page
- `exams/$examId/result` — score, breakdown, retake/appeal CTA
- `appeals/new`, `appeals` — submit + history
- `notifications`, `profile`

### Lecturer (`/_authenticated/lecturer/*`)
- `dashboard`
- `classes`, `classes/$classId` (members, announcements, notes)
- `question-bank` — list, filters, version history
- `question-bank/new`, `question-bank/$id/edit` — TipTap-style editor shell (MCQ / T-F / Essay)
- `exams` — list
- `exams/new`, `exams/$id/edit` — builder (drag/select questions, settings, schedule)
- `exams/$id/monitor` — live proctoring view (student list, flag count, screenshot thumbs)
- `exams/$id/results` — submissions, grade essays, override scores
- `appeals` — review queue
- `notifications`, `profile`

### Admin (`/_authenticated/admin/*`)
- `dashboard` — platform stats
- `users` — list, ban/unban, approve lecturers
- `classes`, `exams` — global oversight
- `settings` — default grace period, flag threshold, session timeout
- `audit-log`
- `pdpa` — data deletion requests

### Shared
- 404, error boundary, unauthorized

## Technical approach

- **Stack:** TanStack Start (existing). File-based routes under `src/routes/`. `_authenticated` pathless layout for role-gated routes. Auth currently mocked via React context with a role-switcher in dev nav — wired so real Lovable Cloud auth can drop in later.
- **Layout:** Shared `MarketingLayout` (top nav + footer) for public, `AppShell` (sidebar w/ role-colored nav + topbar) for authenticated screens.
- **Components:** Build a small playful primitive set on top of shadcn — `WakeoutButton` (pill + offset shadow), `DoodleBackdrop`, `StatCard`, `ExamCard`, `QuestionEditor`, `Timer`, `FlagBadge`, `ScreenshotGrid`. Reuse shadcn for forms, dialogs, tabs, dropdowns.
- **Data:** Typed mock fixtures in `src/lib/mock/*` per entity (users, classes, exams, questions, submissions, appeals, notifications) so all screens render realistic data and can be swapped for server functions later.
- **SEO:** Each public route gets its own `head()` (title, description, og).
- **No backend this pass:** exam lockdown, MediaPipe proctoring, TipTap, plagiarism, and Supabase wiring are stubbed as UI placeholders with clear extension points.

## Build order (so you can review as it lands)

1. Design tokens + primitives + marketing landing
2. Auth pages + role-switching mock auth + AppShell
3. Student flows (dashboard → classes → exam lobby → take → result → appeal)
4. Lecturer flows (dashboard → question bank → exam builder → monitor → results)
5. Admin flows + notifications + profile
6. Polish pass: doodles, empty states, 404, og images

## Out of scope this round (call out explicitly)

- Real auth, RLS, database, Supabase Storage, Realtime
- Functional camera/MediaPipe proctoring (UI shell only)
- TipTap editor (textarea stand-in with toolbar UI)
- Plagiarism scoring, real grading
- Email delivery
- pg_cron / webhooks

These each need their own follow-up turn once you confirm the UI direction.

## Note on size

This is a 20+ screen build. I'll ship it in the order above and pause between phases so you can redirect if the look or structure isn't landing — better than burning the whole thing on a wrong aesthetic guess.