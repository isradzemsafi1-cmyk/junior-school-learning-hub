# Grade 7 Revision Bank — Quality Audit and Build Standard

## Agreed delivery target

Grade 7 only, three terms, ten learning areas per term. Every learning-area/term bank must contain at least:

- 80 multiple-choice questions (four options A–D, one verified answer, explanation).
- 120 structured questions (clear marks and a usable marking guide).
- 200 questions minimum per learning area per term.
- 2,000 questions minimum per term and 6,000 across the three terms.

Learning areas: Agriculture & Nutrition; Creative Arts & Sports; CRE; English; Integrated Science; IRE; Kiswahili; Mathematics; Pre-Technical Studies; Social Studies.

## Source mapping

- Term 1: OPENER 001 2027 Term 1 Grade 7 (86-page uploaded PDF).
- Term 3: SIGNAL Grade 7 Term 3 2026 (52-page scanned uploaded PDF).
- Term 2: Grade 7 curriculum and the user's Grade 7 term schemes; do not label it as exam-paper-derived.
- Where an area is absent from a source paper, develop clearly labelled JSLH curriculum-aligned supplementary practice rather than imply it came from that paper.
- Keep the original question-paper wording and the JSLH-authored supplementary questions distinguishable in source metadata. Do not copy publisher branding, contact details, answer schemes or promotional material.

## Audit findings on the current main branch (25 November 2026)

1. `learner-centre/revision-data/grade7-term3-2026.json` currently has ten learning-area entries, but each contains only 5 MCQs and 2 structured questions (70 MCQs + 20 structured in total). It is a starter collection, not the 200-per-area bank.
2. `learner-centre/quiz-bank/data/grade7` is reported in its catalogue as 4,050 records across 135 files. A sampled English file contains 30 single-choice questions built from repeated generic distractors and generic prompts. It does not meet the requested 80 MCQ + 120 structured format and must not be counted as a completed 2027 source-based revision bank.
3. The Term 3 assessment PDF is scanned. Page-image inspection is required; text-only extraction returns no parsed text.
4. Existing learner-centre pages and payment/learner flows are production-sensitive. This content expansion must not replace login, quiz attempt storage, M-Pesa confirmation, paid access, or permanent purchase entitlements.

## File format for the expanded term banks

Create one file per term:

- `learner-centre/revision-data/grade7-term1-2027.json`
- `learner-centre/revision-data/grade7-term2-2027.json`
- `learner-centre/revision-data/grade7-term3-2027.json`

Use the same tuple schema already consumed by `grade7-term3-revision-2026.html`:

- MCQ: [prompt, [option A, option B, option C, option D], correct option index (0–3), explanation]
- Structured: [prompt, marking guide, marks]

Each term file must include metadata `grade: 7`, `term: 1|2|3`, and all ten learning areas. Preserve subject-specific curriculum language and include application, analysis, practical and scenario-based items—not merely repeated definition questions.

## Quality gate

Run:

```sh
node scripts/validate-grade7-revision-bank.js
```

The check fails until all 30 learning-area/term combinations meet the minimum counts, have four-option MCQs with answer explanations, structured marking guides, valid marks, and no duplicate prompts.

## Release rule

This work is developed on a feature branch and reviewed before it is merged or deployed. Do not claim that the live site contains the expanded bank until the data is complete, validation passes, and the learner-facing pages are tested. The KES 10 payment verification and repeat-access rules remain unchanged.
