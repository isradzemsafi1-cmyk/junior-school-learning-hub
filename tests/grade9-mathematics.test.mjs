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
    const payload = {
      term,
      topics: [{
        id: 'topic-1', title: 'Source topic', week: '2', sequence: ['Subtopic one'],
        outcomes: { knowledge: ['Know'], skills: ['Do'], attitudes: ['Value'] },
        notes: ['Source-based notes'], definitions: ['A definition'],
        rulesAndFormulas: ['A = b × h'],
        workedExamples: [{ title: 'Example', question: 'Q?', steps: ['Step one'], answer: 'Answer.' }],
        applications: ['Practical example'], exercises: ['Exercise one'],
        answersAndExplanations: [{ question: 'Exercise one', answer: 'Answer one', explanation: 'Because.' }],
        sourceGaps: [{ item: 'Unmatched lesson', status: 'SOURCE_GAP', detail: 'No source explanation.' }],
        quiz: [{ q: 'Check?', o: ['Yes', 'No'], a: 0, e: 'Source feedback.' }]
      }]
    };
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
      assert.equal(returnedBody.term, term);
      assert.equal(returnedBody.content.topics[0].title, 'Source topic');
      assert.deepEqual(returnedBody.content.topics[0].notes, [
        'Source-based notes',
        'Scheme lesson sequence: Subtopic one',
        'Source gap: Unmatched lesson — SOURCE_GAP — No source explanation.'
      ]);
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

test('unauthorised and no-entitlement paths do not fetch lesson objects', async () => {
  const calls = [];
  setup(async (url) => {
    calls.push(String(url));
    if (calls.length === 1) return jsonResponse(200, { id: 'learner-test' });
    return jsonResponse(200, []);
  });
  try {
    const noToken = await getGrade9Content(request('I'));
    assert.equal(noToken.status, 401);
    const noEntitlement = await getGrade9Content(request('I', 'valid-token'));
    assert.equal(noEntitlement.status, 403);
    assert.equal(calls.filter((url) => url.includes('/storage/v1/object/')).length, 0);
  } finally { restore(); }
});

test('quiz helper returns feedback and saves attempt with term and topic metadata', async () => {
  const questions = [{ q: '2 + 2?', o: ['3', '4'], a: 1, e: 'Four.' }, { q: '3 × 3?', o: ['6', '9'], a: 1, e: 'Nine.' }];
  const result = gradeQuiz(questions, [1, 0]);
  assert.deepEqual(result, { score: 1, total: 2, answered: 2, percentage: 50, feedback: ['Correct. Four.', 'Review: Nine.'] });
  let inserted;
  const client = { from(table) { assert.equal(table, 'learner_quiz_attempts'); return { insert: async (row) => { inserted = row; return { error: null }; } }; } };
  const saved = await saveQuizAttempt(client, { userId: 'learner-test', term: 'III', topic: 'Probability', questions, selectedAnswers: [1, 0], result });
  assert.equal(saved.error, null);
  assert.equal(inserted.user_id, 'learner-test');
  assert.equal(inserted.subject, 'Mathematics');
  assert.equal(inserted.total, 2);
  assert.equal(inserted.percentage, 50);
  assert.equal(inserted.answers[0].term, 'III');
  assert.equal(inserted.answers[0].topic, 'Probability');
});

test('frontend reads actual private topic field names, uses safe DOM and shows access states', async () => {
  const html = await readFile(new URL('../grade9-mathematics-library.html', import.meta.url), 'utf8');
  for (const term of ['I', 'II', 'III']) assert.match(html, new RegExp(`data-term="${term}"`));
  for (const field of ['week', 'sequence', 'outcomes', 'notes', 'definitions', 'rulesAndFormulas', 'workedExamples', 'applications', 'exercises', 'answersAndExplanations', 'sourceGaps', 'quiz']) {
    assert.ok(html.includes(`topic.${field}`), `expected topic.${field}`);
  }
  assert.match(html, /get-grade9-mathematics-content\?term=/);
  assert.match(html, /selectTopic\(index - 1\)/);
  assert.match(html, /selectTopic\(index \+ 1\)/);
  assert.match(html, /gradeQuiz\(questions, selected\)/);
  assert.match(html, /saveQuizAttempt\(/);
  assert.match(html, /\.textContent/);
  assert.doesNotMatch(html, /\.innerHTML\s*=/);
  assert.match(html, /response.status === 401/);
  assert.match(html, /response.status === 403/);
  assert.match(html, /network error/i);
});
