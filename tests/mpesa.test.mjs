import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { configuration, matchesPayment, processCallback, accessFor, validCallback, safaricom } from '../netlify/lib/mpesa.mjs';
import stk from '../netlify/functions/mpesa-stk.mjs';
import callbackHandler from '../netlify/functions/mpesa-callback.mjs';

const originalFetch = globalThis.fetch;
const payment = { id: 'test-payment', user_id: 'test-user', product_id: 'premium_quizzes', amount: 20, phone: '254700000000', merchant_request_id: 'test-merchant', status: 'pending' };
function callback() { return { CheckoutRequestID: 'test-checkout', MerchantRequestID: 'test-merchant', ResultCode: 0, CallbackMetadata: { Item: [{ Name: 'MpesaReceiptNumber', Value: 'TEST000001' }, { Name: 'Amount', Value: 20 }, { Name: 'PhoneNumber', Value: 254700000000 }] } }; }
let calls, inbox, queryResult, db;
beforeEach(() => {
  calls = []; inbox = { checkout_id: 'test-checkout', payload: callback() }; queryResult = { ResultCode: '0' };
  globalThis.Netlify = { env: { get(name) { return { SUPABASE_URL: 'https://database.test', SUPABASE_SERVICE_ROLE_KEY: 'test-only', MPESA_CONSUMER_KEY: 'test-only', MPESA_CONSUMER_SECRET: 'test-only', MPESA_SHORTCODE: 'test-only', MPESA_PASSKEY: 'test-only', MPESA_CALLBACK_URL: 'https://site.test/.netlify/functions/mpesa-callback' }[name]; } } };
  db = { sql: async (parts, ...values) => { const sql = parts.join('?'); calls.push({sql,values}); if (sql.startsWith('SELECT *')) return [inbox]; if (sql.includes('SET receipt')) { inbox.receipt = values[0]; inbox.verified_at = '2026-11-02T12:00:00Z'; } if (sql.includes('SET synced_at')) inbox.synced_at = '2026-11-02T12:00:00Z'; return []; } };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/oauth/')) return Response.json({ access_token: 'test-only' });
    if (url.includes('/stkpushquery/')) return Response.json(queryResult);
    if (url.includes('/entitlements?')) return Response.json([]);
    if (url.includes('/payments?')) return Response.json(options.method === 'PATCH' ? [{ ...payment, ...JSON.parse(options.body) }] : [payment]);
    throw new Error('Unexpected network request');
  };
});
afterEach(() => { globalThis.fetch = originalFetch; delete globalThis.Netlify; });
test('read-only provider status retries a short rate limit once', async () => {
  let queries=0;
  globalThis.fetch=async url=>url.includes('/oauth/')?Response.json({access_token:'test-only'}):++queries===1?Response.json({}, {status:429,headers:{'retry-after':'0'}}):Response.json({ResultCode:'0'});
  const result=await safaricom(configuration(),'/mpesa/stkpushquery/v1/query',{});
  assert.equal(result.ResultCode,'0');assert.equal(queries,2);
});
test('provider cooldown beyond the retry budget fails closed without hammering', async () => {
  let queries=0;
  globalThis.fetch=async url=>url.includes('/oauth/')?Response.json({access_token:'test-only'}):(queries++,Response.json({}, {status:429,headers:{'retry-after':'60'}}));
  await assert.rejects(safaricom(configuration(),'/mpesa/stkpushquery/v1/query',{}),error=>error.status===429&&error.retryAfterSeconds===60);
  assert.equal(queries,1);
});
test('STK initiation is never retried after a provider error', async () => {
  let queries=0;
  globalThis.fetch=async url=>url.includes('/oauth/')?Response.json({access_token:'test-only'}):(queries++,Response.json({}, {status:503,headers:{'retry-after':'0'}}));
  await assert.rejects(safaricom(configuration(),'/mpesa/stkpush/v1/processrequest',{}));assert.equal(queries,1);
});
test('preview blocks all payment requests before any network access', async () => {
  const result = await stk(new Request('https://preview.test', {method:'POST', body:'{}'}), {deploy:{context:'deploy-preview'}});
  assert.equal(result.status,403); assert.equal(calls.length,0);
});
test('successful callback independently verifies and saves receipt before activating', async () => {
  await processCallback('test-checkout', db);
  assert.equal(inbox.receipt,'TEST000001'); assert.ok(inbox.synced_at);
  const patch = calls.find(c=>c.options?.method==='PATCH');
  assert.equal(JSON.parse(patch.options.body).status,'success');
  assert.equal(JSON.parse(patch.options.body).mpesa_receipt,'TEST000001');
  assert.ok(calls.some(c=>c.url?.includes('stkpushquery')));
});
test('transient verification failure keeps callback available for retry', async () => {
  queryResult = {errorCode:'pending'};
  await assert.rejects(processCallback('test-checkout',db));
  assert.equal(inbox.verified_at,undefined); assert.equal(inbox.synced_at,undefined);
  assert.ok(!calls.some(c=>c.options?.method==='PATCH'));
  queryResult = {ResultCode:0}; await processCallback('test-checkout',db); assert.ok(inbox.synced_at);
});
test('duplicate confirmed callback does not renew access or write again', async () => {
  inbox.synced_at='2026-11-02T12:00:00Z'; await processCallback('test-checkout',db);
  assert.equal(calls.length,1);
});
test('replayed historical success cannot create a fresh access term or rewrite the receipt', async () => {
  const old={...payment,status:'success',result_code:'0',mpesa_receipt:'TEST000001',checkout_request_id:'test-checkout'};
  const writes=[];
  await processCallback('test-checkout',db,{queryPayments:async(path,options)=>{if(options?.method)writes.push(options);return [old];},querySafaricom:async()=>{throw new Error('duplicate must not query provider');}});
  assert.ok(inbox.synced_at);assert.equal(inbox.verified_at,undefined);assert.equal(writes.length,0);
});
test('historical duplicate with a changed receipt is rejected', async () => {
  const old={...payment,status:'success',result_code:'0',mpesa_receipt:'TESTOTHER001',checkout_request_id:'test-checkout'};
  await assert.rejects(processCallback('test-checkout',db,{queryPayments:async()=>[old]}),/legacy_receipt_mismatch/);
  assert.equal(inbox.verified_at,undefined);assert.equal(inbox.synced_at,undefined);
});
test('failure is independently checked and never confirms or downgrades success', async () => {
  inbox.payload = {...callback(),ResultCode:1032}; queryResult={ResultCode:1032};
  await processCallback('test-checkout',db);
  const patch=calls.find(c=>c.options?.method==='PATCH');
  assert.ok(patch.url.includes('status=in.(pending,failed)')); assert.equal(JSON.parse(patch.options.body).status,'failed'); assert.equal(inbox.verified_at,undefined);
});
test('spoofed failure cannot mark payment failed', async () => {
  inbox.payload={...callback(),ResultCode:1032};
  await assert.rejects(processCallback('test-checkout',db)); assert.ok(!calls.some(c=>c.options?.method==='PATCH'));
});
test('mismatched query identifiers do not confirm', async () => {
  queryResult={ResultCode:0,CheckoutRequestID:'other'}; await assert.rejects(processCallback('test-checkout',db)); assert.equal(inbox.verified_at,undefined);
});
test('amount, phone, merchant, product and receipt must all match', () => {
  assert.ok(matchesPayment(callback(),payment));
  for(const changed of [{amount:1},{phone:'254711111111'},{merchant_request_id:'other'},{product_id:'unknown'}]) assert.equal(matchesPayment(callback(),{...payment,...changed}),false);
  const missing=callback(); missing.CallbackMetadata.Item.shift(); assert.equal(matchesPayment(missing,payment),false);
});
test('database update error does not acknowledge or grant access', async () => {
  const fetchMock=globalThis.fetch;
  globalThis.fetch=async(u,o)=>o?.method==='PATCH'?Response.json({code:'42501'},{status:403}):fetchMock(u,o);
  await assert.rejects(processCallback('test-checkout',db)); assert.equal(inbox.synced_at,undefined);
});
test('missing payment stays recoverable for callback before STK persistence', async () => {
  globalThis.fetch=async()=>Response.json([]);
  await assert.rejects(processCallback('test-checkout',db)); assert.equal(inbox.synced_at,undefined);
});
test('pending, failed or unverified payments have no access', async () => {
  assert.equal(await accessFor('test-user','premium_quizzes',db),null);
  assert.ok(calls[0].sql.includes('synced_at IS NOT NULL'));
  assert.ok(calls[0].sql.includes("INTERVAL '24 hours'"));
});
test('invalid JSON callback returns 400 without network access', async()=> {
  const response=await callbackHandler(new Request('https://site.test',{method:'POST',body:'{'}));assert.equal(response.status,400);assert.equal(calls.length,0);
});
test('invalid callback and unsupported environment are rejected',()=> {
  assert.equal(!!validCallback({}),false);
  const get=Netlify.env.get; Netlify.env.get=n=>n==='MPESA_ENVIRONMENT'?'invalid':get(n);
  assert.throws(configuration);
});
test('verified ledger still requires matching successful Supabase payment', async () => {
  const ledger={sql:async()=>[{payment_id:'test-payment',receipt:'TEST000001',expires_at:'2026-11-03T12:00:00Z'}]};
  globalThis.fetch=async()=>Response.json([]);
  assert.equal(await accessFor('test-user','premium_quizzes',ledger),null);
  globalThis.fetch=async()=>Response.json([{id:'test-payment'}]);
  assert.equal((await accessFor('test-user','premium_quizzes',ledger)).receipt,'TEST000001');
});
test('duplicate receipt constraint prevents mirror update and activation', async () => {
  const sql=db.sql;
  db.sql=async(parts,...values)=> { if(parts.join('?').includes('SET receipt')) throw new Error('unique violation'); return sql(parts,...values); };
  await assert.rejects(processCallback('test-checkout',db));
  assert.ok(!calls.some(c=>c.options?.method==='PATCH')); assert.equal(inbox.synced_at,undefined);
});
test('reversed and refunded records cannot be restored by callback retry', async () => {
  for (const status of ['reversed','refunded','chargeback']) {
    globalThis.fetch=async()=>Response.json([{...payment,status}]);
    await assert.rejects(processCallback('test-checkout',db), /payment_revoked/);
    assert.equal(inbox.verified_at,undefined);
  }
});
test('success update condition excludes reversed payments during concurrent changes', async () => {
  await processCallback('test-checkout',db);
  const patch=calls.find(c=>c.options?.method==='PATCH');
  assert.ok(patch.url.includes('status=in.(pending,failed,success)'));
});
test('signed callback binds the request to its payment and rejects tampering', async () => {
  const { signedCallbackURL, callbackPaymentId, acceptCallback } = await import('../netlify/lib/mpesa.mjs');
  const id='11111111-1111-4111-8111-111111111111';
  const url=signedCallbackURL('https://site.test/.netlify/functions/mpesa-callback',id);
  assert.equal(callbackPaymentId(new Request(url)),id);
  assert.equal(callbackPaymentId(new Request(url.slice(0,-1)+(url.endsWith('0')?'1':'0'))),null);
  const data=callback();
  const registered={sql:async()=>[{payment_id:id}]};
  assert.equal(await acceptCallback(new Request(url),data,registered),true);
  assert.equal(data.sourcePaymentId,id);
});
test('new payment cannot use unsigned historical callback endpoint',async()=> {
  const {acceptCallback}=await import('../netlify/lib/mpesa.mjs');
  const registered={sql:async()=>[{payment_id:'test-payment'}]};
  assert.equal(await acceptCallback(new Request('https://site.test/.netlify/functions/mpesa-callback'),callback(),registered),false);
});
test('signed callback recovers identifiers if STK record update has not completed',async()=> {
  inbox.payload.sourcePaymentId=payment.id;
  const base=globalThis.fetch;
  globalThis.fetch=async(url,options)=>url.includes('/payments?')&&!options?.method?Response.json([{...payment,checkout_request_id:null,merchant_request_id:null}]):base(url,options);
  await processCallback('test-checkout',db);
  assert.ok(inbox.synced_at);
  const patch=calls.find(c=>c.options?.method==='PATCH');
  assert.equal(JSON.parse(patch.options.body).checkout_request_id,'test-checkout');
});
test('oversized callbacks are rejected before persistence',async()=> {
  const response=await callbackHandler(new Request('https://site.test',{method:'POST',body:' '.repeat(65537)}));
  assert.equal(response.status,413);assert.equal(calls.length,0);
});
test('forged signed callbacks reject before opening a database connection',async()=> {
  const {acceptCallback}=await import('../netlify/lib/mpesa.mjs');
  const request=new Request('https://site.test/api/mpesa/callback/11111111-1111-4111-8111-111111111111/'+'0'.repeat(64));
  assert.equal(await acceptCallback(request,callback()),false);
});
