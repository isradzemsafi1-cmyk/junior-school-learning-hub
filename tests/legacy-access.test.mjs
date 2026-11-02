import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legacyAccessFor, accessFor } from '../netlify/lib/mpesa.mjs';
function fixture() {
  const payment={id:'payment',user_id:'learner',product_id:'premium_quizzes',amount:20,phone:'254700000000',status:'success',result_code:'0',mpesa_receipt:'TEST000001',checkout_request_id:'checkout',merchant_request_id:'merchant'};
  const entitlement={id:'entitlement',payment_id:'payment',user_id:'learner',product_id:'premium_quizzes',active:true,expires_at:new Date(Date.now()+3600000).toISOString()};
  const calls=[];let providerCalls=0;
  const state={registered:false,duplicate:false,verified:true};
  const db={sql:async(parts,...values)=>{
    const sql=parts.join('');
    if(sql.includes('mpesa_requests'))return state.registered?[{payment_id:'payment'}]:[];
    if(sql.startsWith('INSERT INTO mpesa_legacy_verifications')) {
      const fields=['payment_id','entitlement_id','user_id','product_id','receipt','checkout_id','merchant_id','expires_at'];
      state.proof??=Object.fromEntries(fields.map((field,index)=>[field,values[index]]));
      state.proof.verified_at=new Date().toISOString();return [];
    }
    if(sql.includes('mpesa_legacy_verifications'))return state.proof?[{...state.proof}]:[];
    return [];
  }};
  const lookup=async(path,options={})=> {
    assert.equal(options.method,undefined,'legacy path never mutates Supabase');calls.push(path);
    const table=path.split('?')[0];const params=new URL('https://fixture.invalid/'+path).searchParams;
    if(table==='entitlements') return entitlement.active&&new Date(entitlement.expires_at)>new Date()?[{...entitlement}]:[];
    if(params.has('or')) return state.duplicate?[{id:'payment'},{id:'other'}]:[{id:'payment'}];
    if(params.get('status')==='eq.success'&&payment.status!=='success')return [];
    return [{...payment}];
  };
  const services={getConfiguration:()=>({shortcode:'fixture',passkey:'fixture'}),querySafaricom:async(_config,path)=>{assert.equal(path,'/mpesa/stkpushquery/v1/query');providerCalls++;return {ResultCode:state.verified?'0':'1032',CheckoutRequestID:payment.checkout_request_id,MerchantRequestID:payment.merchant_request_id};}};
  return {payment,entitlement,calls,state,db,lookup,services,providerCalls:()=>providerCalls};
}
test('verified legacy purchase retains exact expiry and receipt without writing Supabase records',async()=>{
 const f=fixture();const result=await accessFor('learner','premium_quizzes',f.db,f.lookup,f.services);
 assert.equal(result.expiresAt,f.entitlement.expires_at);assert.equal(result.receipt,f.payment.mpesa_receipt);assert.equal(result.verificationSource,'legacy');assert.equal(f.providerCalls(),1);
});
test('legacy access denies pending, failed, reversed and refunded payments',async()=>{
 for(const status of ['pending','failed','reversed','refunded']){const f=fixture();f.payment.status=status;assert.equal(await legacyAccessFor('learner','premium_quizzes',f.db,f.lookup,f.services),null);assert.equal(f.providerCalls(),0);}
});
test('legacy access denies expired, inactive, wrong-user and wrong-product entitlements',async()=>{
 for(const update of [{expires_at:new Date(Date.now()-1000).toISOString()},{active:false},{user_id:'other'},{product_id:'grade9_notes'}]){const f=fixture();Object.assign(f.entitlement,update);assert.equal(await legacyAccessFor('learner','premium_quizzes',f.db,f.lookup,f.services),null);assert.equal(f.providerCalls(),0);}
});
test('legacy access denies missing receipt, invalid amount or unverified result',async()=>{
 for(const update of [{mpesa_receipt:null},{amount:1},{result_code:'1032'},{user_id:'other'},{checkout_request_id:null}]){const f=fixture();Object.assign(f.payment,update);assert.equal(await legacyAccessFor('learner','premium_quizzes',f.db,f.lookup,f.services),null);}
});
test('legacy access denies reused identifiers and newly registered purchases',async()=>{
 for(const update of [{duplicate:true},{registered:true}]){const f=fixture();Object.assign(f.state,update);assert.equal(await legacyAccessFor('learner','premium_quizzes',f.db,f.lookup,f.services),null);assert.equal(f.providerCalls(),0);}
});
test('legacy access requires independent provider verification',async()=>{
 const f=fixture();f.state.verified=false;assert.equal(await legacyAccessFor('learner','premium_quizzes',f.db,f.lookup,f.services),null);
});
test('legacy access rechecks reversal after provider verification',async()=>{
 const f=fixture();const original=f.services.querySafaricom;f.services.querySafaricom=async(...args)=>{const result=await original(...args);f.payment.status='reversed';return result;};assert.equal(await legacyAccessFor('learner','premium_quizzes',f.db,f.lookup,f.services),null);
});
test('replayed legacy checks never extend entitlement expiry',async()=>{
 const f=fixture();const first=await legacyAccessFor('learner','premium_quizzes',f.db,f.lookup,f.services);const second=await legacyAccessFor('learner','premium_quizzes',f.db,f.lookup,f.services);assert.equal(first.expiresAt,second.expiresAt);assert.equal(second.expiresAt,f.entitlement.expires_at);assert.equal(f.providerCalls(),1);
});
test('durable provider evidence avoids repeat queries but never bypasses revocation',async()=>{
 const f=fixture();await legacyAccessFor('learner','premium_quizzes',f.db,f.lookup,f.services);
 f.services.querySafaricom=async()=>{throw new Error('provider must not be queried twice');};
 assert.ok(await legacyAccessFor('learner','premium_quizzes',f.db,f.lookup,f.services));
 for(const status of ['pending','failed','reversed','refunded']){f.payment.status=status;assert.equal(await legacyAccessFor('learner','premium_quizzes',f.db,f.lookup,f.services),null);}
 f.payment.status='success';f.entitlement.active=false;assert.equal(await legacyAccessFor('learner','premium_quizzes',f.db,f.lookup,f.services),null);
});
test('durable evidence cannot authorize changed identities, receipts, checkout or expiry',async()=>{
 for(const update of [{user_id:'other'},{entitlement_id:'other'},{receipt:'TESTCHANGED001'},{checkout_id:'other'},{expires_at:new Date(Date.now()-1000).toISOString()}]){
  const f=fixture();await legacyAccessFor('learner','premium_quizzes',f.db,f.lookup,f.services);Object.assign(f.state.proof,update);
  assert.equal(await legacyAccessFor('learner','premium_quizzes',f.db,f.lookup,f.services),null);assert.equal(f.providerCalls(),1);
 }
});
test('extending a legacy entitlement cannot extend previously verified access',async()=>{
 const f=fixture();const first=await legacyAccessFor('learner','premium_quizzes',f.db,f.lookup,f.services);
 f.entitlement.expires_at=new Date(Date.now()+7200000).toISOString();
 const second=await legacyAccessFor('learner','premium_quizzes',f.db,f.lookup,f.services);assert.equal(second.expiresAt,first.expiresAt);assert.equal(f.providerCalls(),1);
});
