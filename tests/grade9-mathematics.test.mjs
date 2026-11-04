import { gradeQuiz, saveQuizAttempt } from '../assets/grade9-quiz.mjs';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import getGrade9Content from '../netlify/functions/get-grade9-mathematics-content.mjs';

const originalFetch = globalThis.fetch;
const originalNetlify = globalThis.Netlify;
const baseEnv = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-not-a-real-secret' };
const req = (url = 'https://site.test/.netlify/functions/get-grade9-mathematics-content?term=I', token = '') =>
  new Request(url, { method: 'GET', headers: token ? { authorization: `Bearer ${token}` } : {} });
const jsonResponse = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

function setup({ env = baseEnv, fetchMock } = {}) {
  globalThis.Netlify = { env: { get: (name) => env[name] } };
  globalThis.fetch = fetchMock;
}
function restore() { globalThis.fetch = originalFetch; globalThis.Netlify = originalNetlify; }

test('requires GET and one supported term', async () => {
  setup({ fetchMock: async () => { throw new Error('must not fetch'); } });
  try {
    assert.equal((await getGrade9Content(new Request('https://site.test/x', { method: 'POST' }))).status, 405);
    assert.equal((await getGrade9Content(req('https://site.test/x?term=IV'))).status, 400);
  } finally { restore(); }
});

test('rejects unauthenticated request before network calls', async () => {
  let calls = 0;
  setup({ fetchMock: async () => { calls++; throw new Error('unexpected network call'); } });
  try {
    const response = await getGrade9Content(req());
    assert.equal(response.status, 401);
    assert.equal(calls, 0);
  } finally { restore(); }
});

test('rejects invalid learner token and never checks storage', async () => {
  const calls = [];
  setup({ fetchMock: async (url) => { calls.push(String(url)); return jsonResponse(401, {}); } });
  try {
    const response = await getGrade9Content(req(undefined, 'expired-token'));
    assert.equal(response.status, 401);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /auth\/v1\/user/);
  } finally { restore(); }
});

test('rejects learner without a current entitlement before object retrieval', async () => {
  const calls = [];
  setup({ fetchMock: async (url) => {
    calls.push(String(url));
    return calls.length === 1 ? jsonResponse(200, { id: 'learner-1' }) : jsonResponse(200, []);
  } });
  try {
    const response = await getGrade9Content(req(undefined, 'valid-token'));
    assert.equal(response.status, 403);
    assert.equal(calls.length, 2);
    assert.match(calls[1], /grade9_notes/);
  } finally { restore(); }
});

test('serves selected term only after valid auth and active entitlement', async () => {
  const calls = [];
  const payload = { term: 'II', topics: [{ id: 'area', title: 'Area', notes: 'source-derived' }] };
  setup({ fetchMock: async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return jsonResponse(200, { id: 'learner-1' });
    if (calls.length === 2) return jsonResponse(200, [{ id: 'entitlement-1' }]);
    return jsonResponse(200, payload);
  } });
  try {
    const response = await getGrade9Content(req('https://site.test/content?term=II', 'valid-token'));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.content, payload);
    assert.match(calls[2].url, /grade9-mathematics-private\/grade9\/mathematics\/term-ii\.json/);
    assert.equal(calls[2].options.cache, 'no-store');
    assert.equal(calls[2].options.headers.Authorization, `Bearer ${baseEnv.SUPABASE_SERVICE_ROLE_KEY}`);
    assert.equal(response.headers.get('cache-control'), 'no-store, private');
    assert.equal(JSON.stringify(body).includes(baseEnv.SUPABASE_SERVICE_ROLE_KEY), false);
  } finally { restore(); }
});

test('does not deliver invalid stored term payload', async () => {
  let call = 0;
  setup({ fetchMock: async () => {
    call++;
    if (call === 1) return jsonResponse(200, { id: 'learner-1' });
    if (call === 2) return jsonResponse(200, [{ id: 'active' }]);
    return jsonResponse(200, { term: 'III', topics: [] });
  } });
  try {
    assert.equal((await getGrade9Content(req(undefined, 'valid-token'))).status, 500);
  } finally { restore(); }
});

test('grades quiz responses and saves the expected dashboard record', async () => {
  const questions = [
    { q: '2 + 2?', o: ['3', '4'], a: 1, e: 'Four.' },
    { q: '3 × 3?', o: ['6', '9'], a: 1, e: 'Nine.' }
  ];
  const result = gradeQuiz(questions, [1, 0]);
  assert.deepEqual(result, { score: 1, total: 2, answered: 2, percentage: 50, feedback: ['Correct. Four.', 'Review: Nine.'] });
  let inserted;
  const client = { from(table) { assert.equal(table, 'learner_quiz_attempts'); return { insert: async (row) => { inserted = row; return { error: null }; } }; } };
  const save = await saveQuizAttempt(client, { userId: 'learner-1', term: 'III', topic: 'Probability', questions, selectedAnswers: [1, 0], result });
  assert.equal(save.error, null);
  assert.equal(inserted.user_id, 'learner-1');
  assert.equal(inserted.subject, 'Mathematics');
  assert.equal(inserted.total, 2);
  assert.equal(inserted.percentage, 50);
  assert.equal(inserted.answers[0].term, 'III');
  assert.equal(inserted.answers[0].topic, 'Probability');
});

test('library page includes all terms, entitlement endpoint, topic navigation and quiz submission', async () => {
  const html = await readFile(new URL('../grade9-mathematics-library.html', import.meta.url), 'utf8');
  for (const term of ['I', 'II', 'III']) assert.match(html, new RegExp(`data-term="${term}"`));
  assert.match(html, /get-grade9-mathematics-content\?term=/);
  assert.match(html, /selectTopic\(index \+ 1\)/);
  assert.match(html, /saveQuizAttempt\(/);
  assert.match(html, /learner_quiz_attempts/);
  assert.match(html, /grade9-quiz\.mjs/);
});
