import { gradeQuiz, saveQuizAttempt } from '../assets/grade9-quiz.mjs';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import getGrade9Content from '../netlify/functions/get-grade9-mathematics-content.mjs';

const originalFetch = globalThis.fetch;
const originalNetlify = globalThis.Netlify;
const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-not-a-real-secret' };
const jsonResponse = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const request = (term = 'I', token = '') => new Request(
  `https://site.test/.netlify/functions/get-grade9-mathematics-content?term=${encodeURIComponent(term)}`,
  { method: 'GET', headers: token ? { authorization: `Bearer ${token}` } : {} }
);
function setup(fetchMock) {
  globalThis.Netlify = { env: { get: (name) => env[name] } };
  globalThis.fetch = fetchMock;
}
function restore() {
  globalThis.fetch = originalFetch;
  globalThis.Netlify = originalNetlify;
}

for (const term of ['I', 'II', 'III']) {
  test(`authenticates, checks entitlement, and fetches exact private path for term ${term}`, async () => {
    const calls = [];
    const payload = { term, topics: [{ id: 'topic-1', title: 'Source topic', notes: ['Source-based notes'], quiz: [] }] };
    setup(async (url, options) => {
      calls.push({ url: String(url), options });
      if (calls.length === 1) return jsonResponse(200, { id: 'learner-test' });
      if (calls.length === 2) return jsonResponse(200, [{ id: 'active-entitlement' }]);
      return jsonResponse(200, payload);
    });
    try {
      const response = await getGrade9Content(request(term, 'test-learner-token'));
      assert.equal(response.status, 200);
      const returnedBody = await response.json();
      assert.deepEqual(returnedBody.content, payload);
      assert.match(calls[0].url, /\/auth\/v1\/user$/);
      assert.match(calls[1].url, /product_id=eq\.grade9_notes/);
      assert.match(calls[2].url, new RegExp(`grade9-mathematics-private/grade9/mathematics/term-${term.toLowerCase()}\\.json$`));
      assert.equal(calls[2].options.cache, 'no-store');
      assert.equal(calls[2].options.headers.Authorization, `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
      assert.equal(response.headers.get('cache-control'), 'no-store, private');
      assert.equal(JSON.stringify(returnedBody).includes(env.SUPABASE_SERVICE_ROLE_KEY), false);
    } finally { restore(); }
  });
}

test('requires GET and one supported term', async () => {
  setup(async () => { throw new Error('must not fetch'); });
  try {
    assert.equal((await getGrade9Content(new Request('https://site.test/x', { method: 'POST' }))).status, 405);
    assert.equal((await getGrade9Content(request('IV'))).status, 400);
  } finally { restore(); }
});

test('rejects unauthenticated request before network calls', async () => {
  let calls = 0;
  setup(async () => { calls++; throw new Error('unexpected network call'); });
  try {
    assert.equal((await getGrade9Content(request())).status, 401);
    assert.equal(calls, 0);
  } finally { restore(); }
});

test('rejects invalid learner token before entitlement or Storage requests', async () => {
  const calls = [];
  setup(async (url) => { calls.push(String(url)); return jsonResponse(401, {}); });
  try {
    assert.equal((await getGrade9Content(request('I', 'expired-token'))).status, 401);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /auth\/v1\/user/);
  } finally { restore(); }
});

test('rejects a learner without active entitlement before retrieving an object', async () => {
  const calls = [];
  setup(async (url) => {
    calls.push(String(url));
    return calls.length === 1 ? jsonResponse(200, { id: 'learner-test' }) : jsonResponse(200, []);
  });
  try {
    assert.equal((await getGrade9Content(request('II', 'valid-token'))).status, 403);
    assert.equal(calls.length, 2);
    assert.match(calls[1], /product_id=eq\.grade9_notes/);
  } finally { restore(); }
});

test('does not deliver invalid stored term payload', async () => {
  let calls = 0;
  setup(async () => {
    calls++;
    if (calls === 1) return jsonResponse(200, { id: 'learner-test' });
    if (calls === 2) return jsonResponse(200, [{ id: 'active-entitlement' }]);
    return jsonResponse(200, { term: 'III', topics: [] });
  });
  try {
    assert.equal((await getGrade9Content(request('I', 'valid-token'))).status, 500);
  } finally { restore(); }
});

test('quiz feedback and score-saving payload match the learner attempts schema', async () => {
  const questions = [
    { q: '2 + 2?', o: ['3', '4'], a: 1, e: 'Four.' },
    { q: '3 × 3?', o: ['6', '9'], a: 1, e: 'Nine.' }
  ];
  const result = gradeQuiz(questions, [1, 0]);
  assert.deepEqual(result, {
    score: 1, total: 2, answered: 2, percentage: 50,
    feedback: ['Correct. Four.', 'Review: Nine.']
  });
  let inserted;
  const client = {
    from(table) {
      assert.equal(table, 'learner_quiz_attempts');
      return { insert: async (row) => { inserted = row; return { error: null }; } };
    }
  };
  const saved = await saveQuizAttempt(client, {
    userId: 'learner-test', term: 'III', topic: 'Probability',
    questions, selectedAnswers: [1, 0], result
  });
  assert.equal(saved.error, null);
  assert.deepEqual(Object.keys(inserted).sort(), ['answers', 'answered', 'grade', 'percentage', 'score', 'subject', 'total', 'user_id'].sort());
  assert.equal(inserted.user_id, 'learner-test');
  assert.equal(inserted.grade, 'Grade 9');
  assert.equal(inserted.subject, 'Mathematics');
  assert.equal(inserted.total, 2);
  assert.equal(inserted.percentage, 50);
  assert.equal(inserted.answers[0].term, 'III');
  assert.equal(inserted.answers[0].topic, 'Probability');
});

test('term manifests are valid JSON with ordered topics and source sequences', async () => {
  for (const term of ['i', 'ii', 'iii']) {
    const manifest = JSON.parse(await readFile(new URL(`../docs/grade9-mathematics-term-${term}-manifest.json`, import.meta.url), 'utf8'));
    assert.equal(manifest.term, term.toUpperCase());
    assert.ok(Array.isArray(manifest.topics) && manifest.topics.length > 0);
    for (const topic of manifest.topics) {
      assert.ok(topic.id && topic.title);
      assert.ok(Array.isArray(topic.sequence) && topic.sequence.length > 0);
    }
  }
});

test('library page includes all term selectors, topic navigation, quiz feedback and protected content request', async () => {
  const html = await readFile(new URL('../grade9-mathematics-library.html', import.meta.url), 'utf8');
  for (const term of ['I', 'II', 'III']) assert.match(html, new RegExp(`data-term="${term}"`));
  assert.match(html, /get-grade9-mathematics-content\?term=/);
  assert.match(html, /selectTopic\(index \+ 1\)/);
  assert.match(html, /async function markQuiz\(\)/);
  assert.match(html, /learner_quiz_attempts/);
  assert.match(html, /feedback-/);
  assert.match(html, /Cache-Control|cache: 'no-store'/);
});
