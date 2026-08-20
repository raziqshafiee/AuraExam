# Face Match threshold-calibration protocol

This document is the procedure for the real-world calibration experiment behind
`face_live_threshold` (and, as a byproduct, sanity-checking the other
`platform_settings` face thresholds). It pairs with the analysis tooling in
`scripts/face-calibration-analyze.ts`.

> **This is a real-world task, not something an agent can run.** Per Global
> Constraint #10 of the Face Match plan: recruiting volunteers, collecting
> consent, and capturing faces on different days/lighting/devices is
> human-subjects work that the FYP author runs personally, later, under the
> **same consent screen shown to production users** (`verify-identity.tsx`'s
> enrollment ceremony) — not a separate, lower-bar research flow. Nothing in
> this repository — including `scripts/face-calibration-analyze.ts` and its
> synthetic-data self-test — substitutes for actually running this experiment.
> The script only proves the analysis math is correct; it does not produce a
> real threshold.

## 1. Recruit participants

- Recruit **~15 volunteers** (classmates, coursemates, lab-mates — anyone who
  can plausibly stand in for the student population). More is better if time
  allows, but 15 is the floor for a distribution that isn't dominated by
  outliers.
- Each volunteer must go through the same consent screen and copy shown to
  real students before enrollment (`/student/verify-identity`). Do not skip
  or shortcut consent because "it's just for calibration" — the PDPA posture
  is identical to production (see §5).

## 2. Collect captures

For each volunteer:

1. **Enroll** them exactly as a real student would: card capture (matric
   card / student ID) + live capture, through the normal enrollment flow.
   This produces the reference descriptor(s) used for genuine-pair scoring.
2. **Collect 3 additional live captures**, each on a **different day,
   lighting condition, or device** than the enrollment capture and than each
   other where possible (e.g. capture 1 on a laptop webcam in a bright room
   the day of enrollment; capture 2 on a phone camera in dim lighting a few
   days later; capture 3 outdoors/different room on a third day). The point
   is to stress the descriptor across the same real-world variation a
   student will hit across a semester of exams — that's what makes the
   resulting genuine-pair distribution meaningful rather than optimistic.
3. Export the raw descriptor for every capture (enrollment + 3 extra, per
   person) as a CSV row: `person_id,d0,d1,...,d1023` — one row per capture,
   1024-dim descriptor vector, same format `scripts/face-calibration-analyze.ts`
   expects. Use an anonymous `person_id` (e.g. `p01`..`p15`), not the
   volunteer's real name or matric number — the CSV itself should carry no
   directly identifying information beyond what's already in the descriptor.

With ~15 people × 4 captures each, that's ~15 × C(4,2) = 90 genuine pairs and
~C(15,2) × 4 × 4 = 1680 impostor pairs — enough to plot a meaningful
histogram and DET curve without being an unreasonable data-collection ask.

## 3. Compute the distributions

Run the analysis script against the collected CSV:

```bash
npx tsx scripts/face-calibration-analyze.ts descriptors.csv
```

This:

- Computes **genuine-pair scores**: cosine similarity between every pair of
  captures belonging to the *same* person (`genuine_scores.csv`).
- Computes **impostor-pair scores**: cosine similarity between every pair of
  captures belonging to *different* people (`impostor_scores.csv`).
- **Sweeps the threshold from 0 to 1 in steps of 0.01** and, at each
  threshold `t`, computes:
  - `FAR(t)` = fraction of impostor pairs with similarity `>= t` (false
    accepts — impostors who'd be let through at that threshold)
  - `FRR(t)` = fraction of genuine pairs with similarity `< t` (false
    rejects — the real person who'd be rejected at that threshold)
  - writes the full sweep to `far_frr_sweep.csv`.
- Finds the **EER** (equal error rate): the threshold where `|FAR - FRR|` is
  minimized, i.e. where the two error rates are closest to equal. This is
  the standard summary statistic for a biometric matcher and the number to
  report as "the operating point" in the FYP's Chapter 6.

These three CSVs (`genuine_scores.csv`, `impostor_scores.csv`,
`far_frr_sweep.csv`) are the raw material for Chapter 6's genuine/impostor
histogram and DET curve.

## 4. Set `face_live_threshold`

Set `face_live_threshold` **slightly below the EER**, not at it. The
reasoning is explicit and asymmetric:

- A **false accept** (impostor let through) produces a similarity-score
  match that is still reviewable — it lands in the admin identity review
  queue if it's below `face_auto_approve_threshold`, or it's logged and
  visible on the exam monitor/results timeline either way. A human can catch
  it after the fact.
- A **false reject** (the real student rejected) blocks that student
  mid-exam — a hard, immediate, unrecoverable-in-the-moment failure for
  someone who did nothing wrong.

Given that asymmetry, it is better to tolerate a few more false accepts (all
of which remain reviewable) than to add false rejects (which block a
legitimate student outright). Concretely: take the EER threshold printed by
the script and subtract a small margin (the script suggests 0.03 as a
starting point) to land `face_live_threshold` a bit below EER, trading a
slightly higher FAR for a lower FRR.

Record in the Chapter 6 report:
- The EER value and threshold.
- The chosen `face_live_threshold` and the margin applied.
- FAR/FRR at the chosen threshold (read off `far_frr_sweep.csv`).
- This tradeoff rationale, stated explicitly, so a reader understands why
  the chosen threshold isn't simply "the EER."

Update the live threshold via the admin settings backend (`platform_settings`
table / `face_live_threshold` key, `src/lib/supabase/settings.ts`) — do not
hardcode it in application code.

## 5. Data retention (PDPA)

Volunteer capture data collected for this experiment is subject to the
**same PDPA posture as production** face-verification data:

- Volunteers are told, at consent, that their captures are used only for
  this calibration experiment.
- Once the experiment's CSVs and report figures are produced, **delete the
  volunteers' raw captures and descriptor CSV** — do not keep them longer
  than needed to run the analysis and generate the report. Do not commit
  raw descriptor CSVs or capture images to this repository.
- If any volunteer capture was routed through the real enrollment flow
  (§2 step 1) and therefore landed in production tables/storage
  (`face_enrollments`, `identity-evidence` bucket), delete that data
  explicitly afterward — production's periodic evidence-retention cron
  (Task 1/4, `facePurge`) only purges by age, not by "this was a
  calibration volunteer," so this cleanup is a manual step.

## 6. What's synthetic vs. real

- `scripts/face-calibration-analyze.ts` was verified against **synthetic**
  descriptor data (randomly generated per-person clusters, and a
  known-answer identical/orthogonal-vector construction) to prove the
  FAR/FRR/EER math is implemented correctly. That verification is recorded
  in the Task 8 implementation report, not in this document.
- This document describes the **real** experiment: real volunteers, real
  captures on different days/lighting/devices, run personally by the FYP
  author. Its output — not the synthetic self-test's — is what belongs in
  the Chapter 6 report.
