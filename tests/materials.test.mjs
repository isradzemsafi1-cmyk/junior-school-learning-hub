import { test } from 'node:test';
import assert from 'node:assert/strict';
import { materialsHandler } from '../netlify/functions/premium-materials.mjs';

const request = query => new Request('https://site.test/.netlify/functions/premium-materials?product_id=premium_quizzes' + query);
function dependencies(access=true) {
  const reads=[];
  return { reads, authenticate:async()=>({id:'learner'}), authorize:async()=>access?{expiresAt:'2026-11-03T12:00:00Z'}:null,
    storage:()=>({list:async({prefix})=>{reads.push(prefix);return {blobs:[]};},get:async(key)=>{reads.push(key);return new Uint8Array([1,2]);}}) };
}
test('unauthenticated visitors cannot list or download paid materials',async()=> {
  const deps=dependencies();deps.authenticate=async()=>null;
  assert.equal((await materialsHandler(deps)(request(''))).status,401);
  assert.equal((await materialsHandler(deps)(request('&file=notes.pdf'))).status,401);
  assert.equal(deps.reads.length,0);
});
test('pending, failed, expired and reversed access cannot reach storage',async()=> {
  const deps=dependencies(false);
  for(const suffix of ['', '&file=notes.pdf']) assert.equal((await materialsHandler(deps)(request(suffix))).status,403);
  assert.equal(deps.reads.length,0);
});
test('verified access sees an empty library without invented content',async()=> {
  const deps=dependencies();const response=await materialsHandler(deps)(request(''));
  assert.equal(response.status,200);assert.deepEqual((await response.json()).files,[]);assert.deepEqual(deps.reads,['premium_quizzes/']);
});
test('verified downloads are private and constrained to purchased product',async()=> {
  const deps=dependencies();const response=await materialsHandler(deps)(request('&file=revision.pdf'));
  assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(response.headers.get('Content-Disposition'),'attachment; filename="revision.pdf"');
  assert.deepEqual(deps.reads,['premium_quizzes/revision.pdf']);
});
test('path traversal and invalid products never disclose files',async()=> {
  const deps=dependencies();
  for(const file of ['../grade9_notes/notes.pdf','nested/file.pdf','bad..pdf','x".html']) assert.equal((await materialsHandler(deps)(request('&file='+encodeURIComponent(file)))).status,400);
  const response=await materialsHandler(deps)(new Request('https://site.test/?product_id=unknown'));
  assert.equal(response.status,400);assert.equal(deps.reads.length,0);
});
test('access is checked again for every download after reversal',async()=> {
  const deps=dependencies();let active=true;deps.authorize=async()=>active?{expiresAt:'2026-11-03T12:00:00Z'}:null;
  const handler=materialsHandler(deps);
  assert.equal((await handler(request(''))).status,200);
  active=false;
  assert.equal((await handler(request('&file=notes.pdf'))).status,403);
  assert.equal(deps.reads.length,1);
});
