import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { getDatabase, MissingDatabaseConnectionError } from '@netlify/database';
import { getStore } from '@netlify/blobs';
import { respond, registerPayment, signedCallbackURL, acceptCallback, receiveCallback, processCallback, accessFor, supabase, configuration, safaricom, password } from '../lib/mpesa.mjs';
import { statusHandler } from './payment-status.mjs';
import { callbackHandler } from './mpesa-callback.mjs';
import { materialsHandler } from './premium-materials.mjs';

// Explicitly authorized preview diagnostics. No public endpoint gains an auth bypass.
// Database fixtures roll back. Synthetic payments use simulated services; legacy
// customer verification uses read-only Supabase and Safaricom status requests.
export default async (request, context) => {
  if (context?.deploy?.context !== 'deploy-preview' || request.method !== 'POST') return respond(404, { success: false });
  const key = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key || !context.deploy.id) return respond(404, { success: false });
  const expected = createHmac('sha256', key).update('preview-payment-verification:' + context.deploy.id).digest('hex');
  const supplied = request.headers.get('x-preview-verification') || '';
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return respond(404, { success: false });
  const safeFailure = error => ({
    category: ['safaricom_authentication', 'safaricom_request', 'database_request', 'payment_configuration', 'callback_configuration'].includes(error.message) ? error.message : error.name === 'TimeoutError' ? 'dependency_timeout' : 'runtime_dependency_failure',
    http: Number.isInteger(error.status) ? error.status : undefined,
    retryAfterSeconds: Number.isFinite(error.retryAfterSeconds) ? error.retryAfterSeconds : undefined,
    network: ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'UND_ERR_CONNECT_TIMEOUT'].includes(error.cause?.code) ? error.cause.code : undefined,
  });
  // Isolate read-only dependencies even on diagnostic drafts without a Database binding.
  // This mode never certifies access and cannot substitute for the complete managed suite.
  if (new URL(request.url).searchParams.get('suite') === 'dependencies') {
    let dependencyStage = 'supabase';
    try {
      const entitlements = await supabase('entitlements?active=eq.true&expires_at=gt.' + encodeURIComponent(new Date().toISOString()) + '&select=*');
      if (!entitlements.length) return respond(503, { success: false, stage: 'legacy_entitlement_missing' });
      const old = entitlements[0];
      const [payment] = await supabase('payments?id=eq.' + encodeURIComponent(old.payment_id) + '&select=*');
      dependencyStage = 'provider_configuration';
      const config = configuration();
      dependencyStage = 'provider_status_query';
      const result = await safaricom(config, '/mpesa/stkpushquery/v1/query', { ...password(config), CheckoutRequestID: payment.checkout_request_id });
      if (String(result.ResultCode) !== '0') return respond(503, { success: false, stage: 'provider_not_successful' });
      dependencyStage = 'premium_materials_store';
      await getStore('premium-materials').list({ prefix: old.product_id + '/' });
      return respond(200, { success: true, providerStatusVerified: true, premiumStoreReadable: true, accessCertified: false });
    } catch (error) { return respond(503, { success: false, stage: dependencyStage, failure: safeFailure(error), accessCertified: false }); }
  }
  const passed = [];
  const check = (condition, name) => { if (!condition) throw new Error('verification_assertion'); passed.push(name); };
  let client, store, fileKey, stage = 'database_binding', cleanupFailed = false;
  const extraKeys = [];
  let failure = false, errorCategory, failureDetails, legacyListing, legacyDownload;
  try {
    stage = 'blobs_binding';
    // Fixtures require immediate read-after-write visibility, unlike ordinary uploads.
    store = getStore({ name: 'mpesa-preview-verification', consistency: 'strong' });
    await store.list();
    passed.push('Hosted Blobs binding read');
    stage = 'database_binding';
    client = await getDatabase().pool.connect();
    stage = 'database_schema';
    await client.query('BEGIN');
    // Confirm migrated schema through the same runtime binding used by the functions.
    await client.query('SELECT checkout_id, receipt, verified_at, synced_at FROM mpesa_callbacks LIMIT 0');
    await client.query('SELECT payment_id FROM mpesa_requests LIMIT 0');
    await client.query('SELECT payment_id, entitlement_id, receipt, expires_at, verified_at FROM mpesa_legacy_verifications LIMIT 0');
    passed.push('Hosted Database binding and migrated tables');
    const db = { sql: async (parts, ...values) => {
      let sql = parts[0];
      for (let index = 0; index < values.length; index++) sql += '$' + (index + 1) + parts[index + 1];
      return (await client.query(sql, values)).rows;
    } };
    const id = randomUUID(), userId = randomUUID(), checkout = 'fixture-' + randomUUID();
    const receipt = 'TEST' + randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
    const payment = { id, user_id: userId, product_id: 'premium_quizzes', amount: 20, phone: '254700000000', status: 'pending', checkout_request_id: checkout, merchant_request_id: 'fixture-merchant', mpesa_receipt: null, result_code: null };
    // A synthetic Supabase adapter: never sends a request to the customer database.
    const lookup = async (path, options = {}) => {
      if (path.startsWith('entitlements?')) return [];
      const params = new URL('https://fixture.invalid/' + path).searchParams;
      for (const field of ['id', 'user_id', 'product_id', 'checkout_request_id', 'mpesa_receipt', 'result_code']) {
        const filter = params.get(field);
        if (filter?.startsWith('eq.') && String(payment[field]) !== filter.slice(3)) return [];
      }
      const filter = params.get('status');
      if (filter?.startsWith('eq.') && payment.status !== filter.slice(3)) return [];
      if (filter?.startsWith('in.(') && !filter.slice(4, -1).split(',').includes(payment.status)) return [];
      if (options.method === 'PATCH') Object.assign(payment, options.body);
      return [{ ...payment }];
    };
    const authenticate = async () => ({ id: userId });
    const authorize = (owner, product) => accessFor(owner, product, db, lookup);
    const status = statusHandler({ authenticate, lookup, authorize });
    const statusRequest = () => new Request('https://fixture.invalid/.netlify/functions/payment-status?product_id=premium_quizzes&payment_id=' + id);
    const callback = { CheckoutRequestID: checkout, MerchantRequestID: payment.merchant_request_id, ResultCode: 0, CallbackMetadata: { Item: [
      { Name: 'MpesaReceiptNumber', Value: receipt }, { Name: 'Amount', Value: 20 }, { Name: 'PhoneNumber', Value: 254700000000 },
    ] } };
    let providerCalls = 0;
    const services = { queryPayments: lookup, getConfiguration: () => ({ shortcode: 'fixture', passkey: 'fixture' }), querySafaricom: async () => { providerCalls++; return { ResultCode: '0', CheckoutRequestID: checkout, MerchantRequestID: payment.merchant_request_id }; } };
    const handler = callbackHandler({ accept: (req, data) => acceptCallback(req, data, db), receive: data => receiveCallback(data, db), process: checkoutId => processCallback(checkoutId, db, services) });
    const callbackRequest = () => new Request(signedCallbackURL('https://fixture.invalid/.netlify/functions/mpesa-callback', id), { method: 'POST', body: JSON.stringify({ Body: { stkCallback: callback } }) });
    stage = 'pending_state';
    const pending = await status(statusRequest());
    check(pending.status === 200 && !(await pending.json()).unlocked, 'Pending fixture remains locked');
    await registerPayment(id, db);
    stage = 'controlled_callback';
    const confirmed = await handler(callbackRequest());
    check(confirmed.status === 200 && payment.status === 'success' && payment.mpesa_receipt === receipt && providerCalls === 1, 'Controlled callback verifies and records fixture receipt');
    const success = await status(statusRequest());
    const active = await success.json();
    check(success.status === 200 && active.unlocked && active.receipt === receipt, 'Successful fixture grants verified access');
    stage = 'duplicate_callback';
    const duplicate = await handler(callbackRequest());
    const repeated = await (await status(statusRequest())).json();
    const count = await db.sql`SELECT COUNT(*)::int AS count FROM mpesa_callbacks WHERE checkout_id = ${checkout}`;
    check(duplicate.status === 200 && providerCalls === 1 && count[0].count === 1 && String(repeated.expiresAt) === String(active.expiresAt), 'Duplicate callback creates no duplicate confirmation or expiry extension');
    stage = 'blobs_binding';
    store = getStore({ name: 'mpesa-preview-verification', consistency: 'strong' });
    const file = 'verification-' + id + '.txt'; fileKey = 'premium_quizzes/' + file;
    await store.set(fileKey, 'Preview verification fixture; not learning content.');
    const materials = materialsHandler({ authenticate, authorize, storage: () => store });
    const materialRequest = download => new Request('https://fixture.invalid/.netlify/functions/premium-materials?product_id=premium_quizzes' + (download ? '&file=' + encodeURIComponent(file) : ''));
    const listing = await materials(materialRequest(false));
    check(listing.status === 200 && (await listing.json()).files.includes(file), 'Hosted Blobs binding and authorized material listing');
    const download = await materials(materialRequest(true));
    check(download.status === 200 && download.headers.get('cache-control') === 'private, no-store' && (await download.text()) === 'Preview verification fixture; not learning content.', 'Authorized download uses private non-cacheable response');
    stage = 'denied_states';
    for (const state of ['pending', 'failed', 'reversed']) {
      payment.status = state;
      const result = await (await status(statusRequest())).json();
      const list = await materials(materialRequest(false)), denied = await materials(materialRequest(true));
      check(!result.unlocked && list.status === 403 && denied.status === 403, state + ' fixture denies status access, listing and download');
    }
    // An unsynchronized retry must also respect a reversal, rather than restoring success.
    await db.sql`UPDATE mpesa_callbacks SET synced_at = NULL WHERE checkout_id = ${checkout}`;
    let reversalDenied = false;
    try { await processCallback(checkout, db, services); } catch { reversalDenied = true; }
    check(reversalDenied && payment.status === 'reversed', 'Reversed fixture cannot be restored by callback retry');
    payment.status = 'success';
    await db.sql`UPDATE mpesa_callbacks SET verified_at = NOW() - INTERVAL '25 hours', synced_at = NOW() WHERE checkout_id = ${checkout}`;
    const expired = await (await status(statusRequest())).json();
    check(!expired.unlocked && (await materials(materialRequest(false))).status === 403 && (await materials(materialRequest(true))).status === 403, 'Expired fixture denies status access, listing and download');
    await db.sql`UPDATE mpesa_callbacks SET verified_at = NOW() WHERE checkout_id = ${checkout}`;
    const other = materialsHandler({ authenticate: async () => ({ id: randomUUID() }), authorize, storage: () => store });
    check(!!await authorize(userId, 'premium_quizzes') && (await other(materialRequest(true))).status === 403, 'Different learner cannot download fixture material');
    stage = 'legacy_compatibility';
    const legacyPayment = { ...payment, id: randomUUID(), checkout_request_id: 'legacy-' + randomUUID(), mpesa_receipt: 'TESTLEGACY0001', status: 'success' };
    const entitlement = { id: randomUUID(), payment_id: legacyPayment.id, user_id: userId, product_id: 'premium_quizzes', active: true, expires_at: new Date(Date.now() + 3600000).toISOString() };
    const legacyLookup = async (path, options = {}) => {
      if (options.method) throw new Error('legacy_mutation_forbidden');
      const params = new URL('https://fixture.invalid/' + path).searchParams;
      if (path.startsWith('entitlements?')) return [{ ...entitlement }];
      if (params.has('or')) return [{ id: legacyPayment.id }];
      if (params.get('status') === 'eq.success' && legacyPayment.status !== 'success') return [];
      return [{ ...legacyPayment }];
    };
    let legacyProviderCalls = 0;
    const legacyServices = { getConfiguration: services.getConfiguration, querySafaricom: async () => { legacyProviderCalls++; return { ResultCode: '0', CheckoutRequestID: legacyPayment.checkout_request_id, MerchantRequestID: legacyPayment.merchant_request_id }; } };
    const legacyAuthorize = (owner, product) => accessFor(owner, product, db, legacyLookup, legacyServices);
    // Remove the new-purchase fixture from this transaction so it cannot mask the fallback.
    await db.sql`DELETE FROM mpesa_callbacks WHERE checkout_id = ${checkout}`;
    const legacyStatus = statusHandler({ authenticate, lookup: legacyLookup, authorize: legacyAuthorize });
    const legacyMaterials = materialsHandler({ authenticate, authorize: legacyAuthorize, storage: () => store });
    const legacyActive = await (await legacyStatus(statusRequest())).json();
    check(legacyActive.unlocked && legacyActive.receipt === legacyPayment.mpesa_receipt && legacyActive.expiresAt === entitlement.expires_at, 'Legacy verified fixture retains receipt and original expiry');
    check((await legacyMaterials(materialRequest(false))).status === 200 && (await legacyMaterials(materialRequest(true))).status === 200, 'Legacy verified fixture authorizes hosted listing and download');
    check(legacyProviderCalls === 1, 'Durable legacy evidence avoids repeated provider queries');
    const historicalCallback = { ...callback, CheckoutRequestID: legacyPayment.checkout_request_id, CallbackMetadata: { Item: callback.CallbackMetadata.Item.map(item => item.Name === 'MpesaReceiptNumber' ? { ...item, Value: legacyPayment.mpesa_receipt } : item) } };
    const historicalServices = { ...legacyServices, queryPayments: legacyLookup };
    for (let delivery = 0; delivery < 2; delivery++) {
      await receiveCallback(historicalCallback, db);
      await processCallback(legacyPayment.checkout_request_id, db, historicalServices);
    }
    const [historical] = await db.sql`SELECT verified_at, synced_at FROM mpesa_callbacks WHERE checkout_id = ${legacyPayment.checkout_request_id}`;
    const legacyRepeated = await legacyAuthorize(userId, 'premium_quizzes');
    check(historical?.synced_at && !historical.verified_at && legacyRepeated?.expiresAt === entitlement.expires_at && legacyProviderCalls === 1, 'Historical duplicate success cannot restart legacy entitlement');
    for (const state of ['pending', 'failed', 'reversed']) {
      legacyPayment.status = state;
      check(!(await (await legacyStatus(statusRequest())).json()).unlocked && (await legacyMaterials(materialRequest(true))).status === 403, 'Legacy ' + state + ' fixture remains locked');
    }
    legacyPayment.status = 'success';
    entitlement.expires_at = new Date(Date.now() - 1000).toISOString();
    check((await legacyMaterials(materialRequest(true))).status === 403, 'Expired legacy fixture remains locked');
    stage = 'existing_purchase_read_only';
    // Existing customer data is read only. This performs STK status queries, never STK initiation.
    const existing = await supabase('entitlements?active=eq.true&expires_at=gt.' + encodeURIComponent(new Date().toISOString()) + '&select=*');
    check(existing.length > 0, 'Existing active legacy entitlement is present');
    for (const old of existing) {
      const legacyLookup = async (path, options) => {
        stage = 'existing_purchase_supabase';
        return supabase(path, options);
      };
      const legacyServices = {
        getConfiguration: () => { stage = 'existing_purchase_configuration'; return configuration(); },
        querySafaricom: async (...args) => { stage = 'existing_purchase_provider'; return safaricom(...args); },
      };
      const authorizeExisting = (owner, product) => accessFor(owner, product, db, legacyLookup, legacyServices);
      const verified = await authorizeExisting(old.user_id, old.product_id);
      check(!!verified && verified.verificationSource === 'legacy' && verified.expiresAt === new Date(old.expires_at).toISOString(), 'Existing legacy purchase independently verifies with original expiry');
      const owned = await supabase('payments?id=eq.' + encodeURIComponent(old.payment_id) + '&select=mpesa_receipt');
      check(owned.length === 1 && verified.receipt === owned[0].mpesa_receipt, 'Existing legacy receipt is preserved');
      legacyListing = { authorization: 'not_checked', storage: 'not_checked' };
      const existingMaterials = materialsHandler({
        authenticate: async () => ({ id: old.user_id }),
        authorize: async (owner, product) => {
          stage = 'existing_purchase_material_authorization';
          try {
            const access = await authorizeExisting(owner, product);
            legacyListing.authorization = access ? 'verified' : 'denied';
            return access;
          } catch (error) {
            legacyListing.authorization = ['safaricom_authentication', 'safaricom_request', 'database_request'].includes(error.message) ? error.message : 'verification_unavailable';
            throw error;
          }
        },
        storage: () => ({ list: async options => {
          stage = 'existing_purchase_material_storage';
          try {
            const result = await getStore('premium-materials').list(options);
            legacyListing.storage = 'available';
            return result;
          } catch (error) {
            legacyListing.storage = 'unavailable';
            throw error;
          }
        } }),
      });
      const listingResponse = await existingMaterials(new Request('https://fixture.invalid/.netlify/functions/premium-materials?product_id=' + encodeURIComponent(old.product_id)));
      legacyListing.http = listingResponse.status;
      check(listingResponse.status === 200, 'Existing legacy purchase authorizes protected materials listing');
      stage = 'existing_purchase_download';
      // Use a separate temporary non-learning marker; never upload to the premium store.
      const markerKey = old.product_id + '/' + file;
      if (markerKey !== fileKey) { extraKeys.push(markerKey); await store.set(markerKey, 'Preview verification fixture; not learning content.'); }
      const existingDownload = materialsHandler({ authenticate: async () => ({ id: old.user_id }), authorize: authorizeExisting, storage: () => store });
      const response = await existingDownload(new Request('https://fixture.invalid/.netlify/functions/premium-materials?product_id=' + encodeURIComponent(old.product_id) + '&file=' + encodeURIComponent(file)));
      legacyDownload = { http: response.status };
      check(response.status === 200 && response.headers.get('cache-control') === 'private, no-store' && (await response.text()) === 'Preview verification fixture; not learning content.', 'Existing legacy learner authorizes protected marker download');
      const preserved = await authorizeExisting(old.user_id, old.product_id);
      check(preserved?.receipt === verified.receipt && preserved?.expiresAt === verified.expiresAt, 'Repeated existing learner access preserves receipt and original expiry');
    }
    stage = 'complete';
  } catch (error) {
    failure = true;
    failureDetails = safeFailure(error);
    errorCategory = error instanceof MissingDatabaseConnectionError ? 'missing_database_binding' : error.code === '42P01' ? 'required_table_missing' : error.message === 'verification_assertion' ? 'fixture_assertion_failed' : 'runtime_dependency_failure';
  }
  finally {
    if (client) {
      try { await client.query('ROLLBACK'); } catch { cleanupFailed = true; }
      client.release(cleanupFailed);
    }
    if (store && fileKey) { try { await store.delete(fileKey); } catch { cleanupFailed = true; } }
    if (store) for (const extraKey of extraKeys) { try { await store.delete(extraKey); } catch { cleanupFailed = true; } }
  }
  return respond(failure || cleanupFailed ? 503 : 200, { success: !failure && !cleanupFailed, passed, stage, errorCategory, failureDetails, legacyListing, legacyDownload, cleanupSucceeded: !cleanupFailed, paymentServices: 'simulated fixtures plus read-only legacy status verification; no STK initiation' });
};
