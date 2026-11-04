# Grade 9 Mathematics library — implementation and source coverage

## Implementation status

The responsive blue-and-gold library page provides term selection, topic navigation, topic sections, quiz feedback, and saving quiz attempts to the existing `learner_quiz_attempts` table. It fetches term JSON only from `get-grade9-mathematics-content`, which verifies the learner session and active `grade9_notes` entitlement before reading from a private Supabase Storage bucket. No lesson text, answer keys, source documents, or PDFs are bundled in the public frontend or repository.

The original schemes and notes were supplied in the conversation, not as repository files. They have not been copied into this repository. Do not copy the school name, original source documents, PDF, or premium text into Git.

## Private content storage contract

Create a private Supabase Storage bucket named `grade9-mathematics-private`; do not make it public. Place the completed source-based JSON at:

- `grade9/mathematics/term-i.json`
- `grade9/mathematics/term-ii.json`
- `grade9/mathematics/term-iii.json`

Only the server-side Netlify function may read objects using the existing server-only `SUPABASE_SERVICE_ROLE_KEY`. Do not put that key or signed/public object URLs in browser code. The function returns content after checking the learner JWT against Supabase Auth and a live `grade9_notes` entitlement. No storage credentials, project settings, or M-Pesa functions have been changed. The actual private bucket and term JSON cannot be provisioned by this repository-only implementation; the endpoint returns unavailable until an administrator uploads the reviewed content.

Term object schema:

```json
{
  "term": "I",
  "topics": [{
    "id": "stable-topic-id",
    "title": "Scheme-ordered topic title",
    "week": "2",
    "outcomes": {"knowledge": [], "skills": [], "attitudes": []},
    "notes": "Plain text or an array of plain-text paragraphs",
    "definitions": [],
    "rulesAndFormulas": [],
    "workedExamples": [{"title": "", "question": "", "steps": [], "answer": ""}],
    "applications": [],
    "exercises": [],
    "answersAndExplanations": [{"question": "", "answer": "", "explanation": ""}],
    "quiz": [{"q": "", "o": [], "a": 0, "e": ""}]
  }]
}
```

The page creates DOM nodes and inserts text as text (not lesson HTML). Preserve the schemes' topic order and combine repeated lesson headings into one topic where appropriate; retain the order of their first appearance. Keep each topic's learning outcomes, notes, examples, practice, answers and quiz exclusively in private JSON.

## Scheme topic sequence (deduplicated in first-appearance order)

### Term I

1. Integers: addition, subtraction, multiplication, division, combined operations and applications.
2. Cubes and cube roots: cubes by multiplication and tables; cube roots by factor method and tables; calculator use and applications.
3. Indices and logarithms: index form; multiplication/division, power and zero-index laws; negative and fractional indices; applications of index laws; powers of 10 and common logarithms.
4. Compound proportions and rates of work: proportional parts; relating ratios; continued proportion; compound proportion by ratio method and applications; rates of work with two and three variables, further applications and IT-supported practice.
5. Matrices: identification, order and element position; equal matrices; compatibility, addition, subtraction, combined operations and applications.
6. Equations of a straight line: gradient and rise/run; gradient from two points and gradient types; equation from two points or point and gradient; standard form `y = mx + c`; gradient/intercept interpretation and x/y-intercepts, equations from intercepts.
7. Linear inequalities: one unknown; multiplication/division by negatives; number-line and graphical representation; two unknowns; real-life applications.

### Term II

1. Area and surface area: regular pentagons and hexagons; triangular and rectangular prisms; pyramids (including square and rectangular bases); sectors and segments; spheres and hemispheres.
2. Volume: triangular and rectangular prisms; square, rectangular and triangular pyramids; cones; pyramid and cone frustums; spheres and hemispheres.
3. Mass, volume, weight and density: mass-unit conversions; mass/weight/gravity relationships; density calculations and applications.
4. Time, distance and speed: speed in km/h and m/s; distance, time, average speed, velocity, acceleration and deceleration; longitudes, time relationship and local-time differences.
5. Money: currencies and exchange; buying/selling rates; export and import duties; excise duty, VAT and combined import taxes.
6. Approximations and errors: estimation, measurement errors, percentage error and applications.
7. Coordinates, graphs and scale drawing: plotting; straight-line graphs; parallel/perpendicular lines and gradient relationships; compass and true bearings; bearing-and-distance scale diagrams; elevation/depression; triangulation, transverse survey and bearing/distance survey.

### Term III

1. Similarity and enlargement: similar figures and their properties; construction; centre and scale factor; positive and negative scale factors; enlargement on Cartesian planes with origin and other centres; linear scale factor and applications.
2. Trigonometry: right-triangle sides; tangent, sine and cosine ratios and tables; calculator use and applications.
3. Grouped-data interpretation: class width, frequency tables, modal class, grouped mean and grouped median.
4. Probability: equally likely outcomes and experiments; probability range; mutually exclusive and independent events; addition/multiplication laws; tree diagrams.

## Notes-PDF coverage gaps / partial matches

These topics are present in the schemes but are absent or not sufficiently explained in the supplied searchable notes text. Do not fill the gaps with invented or generic curriculum material; obtain an authoritative source or explicit approval for supplementary notes before creating those lessons:

- **Term I — cube roots from mathematical tables:** cube tables and factor-method roots are described; a worked method for reading cube-root tables is not clearly supplied.
- **Term II — area of regular pentagons and hexagons:** the notes cover basic shapes and circle sectors, but no dedicated regular-polygon area derivations or worked examples are present.
- **Term II — surface area of spheres and hemispheres:** sphere volume is covered; sphere/hemisphere surface-area formulas and worked examples are not clearly included. General net/surface-area material may support some pyramid work but does not fully cover every scheme-specific case.
- **Term II — foreign-currency exchange and buying/selling rates:** the notes discuss profit, loss and money, but do not supply exchange-rate conversion instruction.
- **Term II — export duty, import duty, excise duty, VAT and combined customs taxes:** these scheme topics are not explained in the supplied notes. Do not substitute the unrelated income-tax section.
- **Term II — weight:** a heading is present, but the extracted notes do not provide a complete explanation or worked examples for weight.
- **Term III — grouped-data median formula:** grouped-data mean and introductory median/cumulative frequency material appear, but the scheme-specific grouped-median calculation is not fully supported by a clear formula and worked example in the supplied extraction.

Other headings are generally represented in the notes, although OCR extraction has corrupted or omitted some symbols, diagrams, tables, exercise values and worked steps. Verify all transcription and calculations against the original PDF before uploading. Avoid reproducing errors or unintelligible OCR; mark unclear source items for editorial review.

## Test and release gate

1. Upload reviewed term objects to the **private** bucket; inspect object ACL and bucket visibility.
2. Verify unauthenticated, expired-token, no-entitlement, and expired-entitlement requests cannot retrieve content; verify an entitled learner can.
3. Check all topic ordering, section rendering, quiz choices and correct answers; validate every worked calculation from the source PDF.
4. Test page at desktop and narrow mobile widths, keyboard navigation, term/topic links, instant feedback, dashboard score persistence, login/logout, payment handoff, and existing homepage/Grade 7/8 journeys on a deploy preview.
5. Only merge to `main` after the above tests pass. No deployment or merge is performed by this preparation change.
