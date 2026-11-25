#!/usr/bin/env node
/**
 * Grade 7 JSLH revision-bank quality gate.
 *
 * Expected files:
 *   learner-centre/revision-data/grade7-term1-2027.json
 *   learner-centre/revision-data/grade7-term2-2027.json
 *   learner-centre/revision-data/grade7-term3-2027.json
 *
 * Each file uses the established revision page schema:
 * subjects: [{ id, name, mcq: [[prompt, [A,B,C,D], correctIndex, explanation]],
 *              structured: [[prompt, markingGuide, marks]] }]
 *
 * This validator deliberately fails on underfilled banks, repeated prompts,
 * malformed answer keys, or learning areas missing from a term.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'learner-centre', 'revision-data');
const EXPECTED = [
  'agriculture', 'creative-arts', 'cre', 'english', 'integrated-science',
  'ire', 'kiswahili', 'mathematics', 'pre-technical', 'social-studies'
];
const TARGET_MCQ = 80;
const TARGET_STRUCTURED = 120;
const failures = [];
const summaries = [];
const GENERIC_STRUCTURED_PATTERNS = [
  /characteristics or examples of/i, /reasons why .+ is important/i,
  /steps or procedures related to/i, /safety measures or good practices related to/i,
  /challenges associated with .+ and suggest a response/i,
  /uses or applications of/i, /compare .+ with a related concept/i,
  /demonstrate correct use or application of/i,
  /factors to consider when selecting or applying/i
];

function fail(file, message) { failures.push(file + ': ' + message); }
function normalise(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

for (const term of [1, 2, 3]) {
  const filename = `grade7-term${term}-2027.json`;
  const fullPath = path.join(DATA, filename);
  if (!fs.existsSync(fullPath)) {
    fail(filename, 'file is missing');
    continue;
  }
  let bank;
  try { bank = JSON.parse(fs.readFileSync(fullPath, 'utf8')); }
  catch (error) { fail(filename, 'invalid JSON: ' + error.message); continue; }

  if (bank.grade !== 7 || bank.term !== term) fail(filename, 'grade/term metadata does not match file name');
  if (!Array.isArray(bank.subjects)) { fail(filename, 'subjects must be an array'); continue; }

  const byId = new Map(bank.subjects.map(subject => [subject.id, subject]));
  for (const id of EXPECTED) {
    const subject = byId.get(id);
    if (!subject) { fail(filename, 'missing learning area: ' + id); continue; }
    if (!Array.isArray(subject.mcq) || !Array.isArray(subject.structured)) {
      fail(filename, id + ': mcq and structured must be arrays'); continue;
    }
    if (subject.mcq.length < TARGET_MCQ) fail(filename, id + ': only ' + subject.mcq.length + ' MCQs; target is ' + TARGET_MCQ);
    if (subject.structured.length < TARGET_STRUCTURED) fail(filename, id + ': only ' + subject.structured.length + ' structured questions; target is ' + TARGET_STRUCTURED);

    const seen = new Set();
    const answerCounts = [0, 0, 0, 0];
    for (let i = 0; i < subject.mcq.length; i++) {
      const q = subject.mcq[i];
      if (!Array.isArray(q) || q.length < 4) { fail(filename, id + ': malformed MCQ #' + (i + 1)); continue; }
      const [prompt, options, answer, explanation] = q;
      if (typeof prompt !== 'string' || prompt.trim().length < 12) fail(filename, id + ': weak/empty MCQ prompt #' + (i + 1));
      const key = normalise(prompt);
      if (seen.has(key)) fail(filename, id + ': duplicate prompt: ' + prompt.slice(0, 90));
      seen.add(key);
      if (!Array.isArray(options) || options.length !== 4 || options.some(option => typeof option !== 'string' || !option.trim())) fail(filename, id + ': MCQ #' + (i + 1) + ' must have four non-empty options');
      if (!Number.isInteger(answer) || answer < 0 || answer > 3) fail(filename, id + ': invalid answer index in MCQ #' + (i + 1));
      if (Number.isInteger(answer)) answerCounts[answer] = (answerCounts[answer] || 0) + 1;
      if (typeof explanation !== 'string' || explanation.trim().length < 8) fail(filename, id + ': missing explanation in MCQ #' + (i + 1));
    }
    for (let i = 0; i < subject.structured.length; i++) {
      const q = subject.structured[i];
      if (!Array.isArray(q) || q.length < 3) { fail(filename, id + ': malformed structured question #' + (i + 1)); continue; }
      const [prompt, guide, marks] = q;
      if (typeof prompt !== 'string' || prompt.trim().length < 15) fail(filename, id + ': weak/empty structured prompt #' + (i + 1));
      const key = normalise(prompt);
      if (seen.has(key)) fail(filename, id + ': duplicate prompt: ' + prompt.slice(0, 90));
      seen.add(key);
      if (typeof guide !== 'string' || guide.trim().length < 12) fail(filename, id + ': missing marking guide in structured question #' + (i + 1));
      if (typeof prompt === 'string' && GENERIC_STRUCTURED_PATTERNS.some(pattern => pattern.test(prompt))) fail(filename, id + ': generic/template structured prompt #' + (i + 1) + ': ' + prompt.slice(0, 100));
      if (!Number.isInteger(marks) || marks < 1) fail(filename, id + ': invalid marks in structured question #' + (i + 1));
    }
    const maxAnswerShare = Math.max(...answerCounts) / Math.max(1, subject.mcq.length);
    if (subject.mcq.length >= TARGET_MCQ && maxAnswerShare > 0.65) fail(filename, id + ': answer key distribution is too concentrated (' + answerCounts.join('/') + '); review option positions');
    summaries.push({ term, id, mcq: subject.mcq.length, structured: subject.structured.length, total: subject.mcq.length + subject.structured.length, answerCounts: answerCounts.join('/') });
  }
}

console.log('Grade 7 JSLH revision bank quality check');
console.table(summaries);
if (failures.length) {
  console.error(`FAILED: ${failures.length} quality issue(s)`);
  for (const issue of failures) console.error(' - ' + issue);
  process.exitCode = 1;
} else {
  console.log('PASS: all 30 learning-area/term banks meet the minimum question and validation rules.');
}
