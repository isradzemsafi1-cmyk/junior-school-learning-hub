import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import verify from '../netlify/functions/preview-payment-verification.mjs';
afterEach(() => { delete globalThis.Netlify; });
test('hosted verification cannot run in production', async () => {
  const response=await verify(new Request('https://test.invalid',{method:'POST'}),{deploy:{context:'production',id:'test'}});
  assert.equal(response.status,404);
});
test('hosted verification rejects unauthenticated preview invocation before database access',async()=> {
  globalThis.Netlify={env:{get:()=> 'test-only-key'}};
  const response=await verify(new Request('https://test.invalid',{method:'POST'}),{deploy:{context:'deploy-preview',id:'test'}});
  assert.equal(response.status,404);
});
test('hosted verification refuses GET and incorrect authorization',async()=> {
  globalThis.Netlify={env:{get:()=> 'test-only-key'}};
  const context={deploy:{context:'deploy-preview',id:'test'}};
  assert.equal((await verify(new Request('https://test.invalid'),context)).status,404);
  assert.equal((await verify(new Request('https://test.invalid',{method:'POST',headers:{'x-preview-verification':'0'.repeat(64)}}),context)).status,404);
});
