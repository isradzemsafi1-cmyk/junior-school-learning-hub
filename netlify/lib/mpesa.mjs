import { createHmac, timingSafeEqual } from 'node:crypto';
import { getDatabase } from '@netlify/database';

export function respond(status, data) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function catalog() {
  return { online_tuition: 100, premium_quizzes: 20, grade8_notes: 30, grade9_notes: 30 };
}
export function normalizePhone(value) {
  const phone = String(value ?? '').replace(/[\s+-]/g, '');
  return phone.startsWith('0') ? '254' + phone.slice(1) : phone;
}
export function configuration() {
  const env = name => Netlify.env.get(name);
  const mode = env('MPESA_ENVIRONMENT') || 'sandbox';
  if (!['sandbox', 'production'].includes(mode)) throw new Error('payment_configuration');
  const config = {
    url: env('SUPABASE_URL'), key: env('SUPABASE_SERVICE_ROLE_KEY'),
    consumerKey: env('MPESA_CONSUMER_KEY'), consumerSecret: env('MPESA_CONSUMER_SECRET'),
    shortcode: env('MPESA_SHORTCODE'), passkey: env('MPESA_PASSKEY'),
    callback: env('MPESA_CALLBACK_URL'),
    base: mode === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke',
    transactionType: env('MPESA_TRANSACTION_TYPE') || 'CustomerPayBillOnline',
  };
  if (Object.values(config).some(v => !v)) throw new Error('payment_configuration');
  const callback = new URL(config.callback);
  if (callback.protocol !== 'https:' || callback.pathname !== '/.netlify/functions/mpesa-callback' || callback.search || callback.hash) throw new Error('callback_configuration');
  return config;
}
export async function supabase(path, { method = 'GET', body, representation = false } = {}) {
  const url = Netlify.env.get('SUPABASE_URL');
  const key = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('database_configuration');
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
      Prefer: representation ? 'return=representation' : 'return=minimal' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    // Log only the database error code, never response bodies or credentials.
    console.error('Payment database request failed', { status: response.status, code: /^[A-Z0-9]+$/.test(error.code || '') ? error.code : 'unknown' });
    throw new Error('database_request');
  }
  return response.status === 204 ? null : response.json();
}
export async function authenticatedUser(request) {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const response = await fetch(`${Netlify.env.get('SUPABASE_URL')}/auth/v1/user`, {
    headers: { apikey: Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'), Authorization: auth },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user.id ? user : null;
}
export function password(config) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const timestamp = ['year','month','day','hour','minute','second'].map(t => parts.find(p => p.type === t).value).join('');
  return { BusinessShortCode: config.shortcode, Password: Buffer.from(config.shortcode + config.passkey + timestamp).toString('base64'), Timestamp: timestamp };
}
export async function safaricom(config, path, body) {
  const tokenResponse = await fetch(`${config.base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${Buffer.from(config.consumerKey + ':' + config.consumerSecret).toString('base64')}` }, signal: AbortSignal.timeout(10000),
  });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token) throw Object.assign(new Error('safaricom_authentication'), { status: tokenResponse.status });
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${config.base}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const result = await response.json().catch(() => null);
    if (response.ok && result) return result;
    const retryHeader = response.headers.get('retry-after');
    const retryAfter = retryHeader === null ? 1 : /^\d+$/.test(retryHeader) ? Number(retryHeader) : Math.max(0, Math.ceil((Date.parse(retryHeader) - Date.now()) / 1000));
    // Only read-only status queries may retry. Never repeat an STK initiation.
    if (path === '/mpesa/stkpushquery/v1/query' && attempt === 0 && [429, 502, 503, 504].includes(response.status) && Number.isFinite(retryAfter) && retryAfter <= 2) {
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      continue;
    }
    throw Object.assign(new Error('safaricom_request'), { status: response.status, retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : undefined });
  }
}
export function validCallback(callback) {
  return callback && typeof callback.CheckoutRequestID === 'string' && callback.CheckoutRequestID.length > 0 && callback.CheckoutRequestID.length < 200 && typeof callback.MerchantRequestID === 'string' && callback.MerchantRequestID.length > 0 && callback.MerchantRequestID.length < 200 && /^\d+$/.test(String(callback.ResultCode));
}
export function matchesPayment(callback, payment) {
  const items = callback.CallbackMetadata?.Item;
  if (!Array.isArray(items)) return false;
  const value = name => items.find(item => item.Name === name)?.Value;
  const receipt = value('MpesaReceiptNumber');
  return typeof receipt === 'string' && /^[A-Z0-9]{10,20}$/.test(receipt) &&
    Number(value('Amount')) === Number(payment.amount) &&
    normalizePhone(value('PhoneNumber')) === normalizePhone(payment.phone) &&
    catalog()[payment.product_id] === Number(payment.amount) &&
    callback.MerchantRequestID === payment.merchant_request_id;
}
export function signedCallbackURL(base, paymentId) {
  const url = new URL(base);
  const signature = createHmac('sha256', Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')).update('mpesa-callback:' + paymentId).digest('hex');
  url.pathname = '/api/mpesa/callback/' + paymentId + '/' + signature;
  return url.toString();
}
export function callbackPaymentId(request) {
  const path = new URL(request.url).pathname;
  const match = path.match(/^\/api\/mpesa\/callback\/([0-9a-f-]{36})\/([0-9a-f]{64})$/i);
  if (!match) return null;
  const expected = new URL(signedCallbackURL(request.url, match[1])).pathname.split('/').pop();
  return timingSafeEqual(Buffer.from(match[2].toLowerCase()), Buffer.from(expected)) ? match[1] : null;
}
export async function registerPayment(paymentId, db = getDatabase()) {
  await db.sql`INSERT INTO mpesa_requests (payment_id) VALUES (${paymentId})`;
}
export async function acceptCallback(request, callback, db) {
  const paymentId = callbackPaymentId(request);
  if (new URL(request.url).pathname.startsWith('/api/mpesa/callback/') && !paymentId) return false;
  db ??= getDatabase();
  if (paymentId) {
    const rows = await db.sql`SELECT payment_id FROM mpesa_requests WHERE payment_id = ${paymentId}`;
    if (!rows.length) return false;
    callback.sourcePaymentId = paymentId;
    return true;
  }
  // Compatibility for historical STK pushes only. New requests require their signed URL.
  delete callback.sourcePaymentId;
  const payments = await supabase(`payments?checkout_request_id=eq.${encodeURIComponent(callback.CheckoutRequestID)}&select=*`);
  if (payments.length !== 1) return false;
  const registered = await db.sql`SELECT payment_id FROM mpesa_requests WHERE payment_id = ${payments[0].id}`;
  return !registered.length && callback.MerchantRequestID === payments[0].merchant_request_id &&
    (String(callback.ResultCode) !== '0' || matchesPayment(callback, payments[0]));
}
export async function receiveCallback(callback, db = getDatabase()) {
  // Confirmed metadata is immutable. A successful callback may supersede an earlier failure.
  await db.sql`INSERT INTO mpesa_callbacks (checkout_id, payload) VALUES (${callback.CheckoutRequestID}, ${JSON.stringify(callback)}::jsonb) ON CONFLICT (checkout_id) DO UPDATE SET payload = EXCLUDED.payload, synced_at = NULL WHERE mpesa_callbacks.verified_at IS NULL AND mpesa_callbacks.payload->>'ResultCode' <> '0' AND EXCLUDED.payload->>'ResultCode' = '0'`;
}
export async function processCallback(checkoutId, db = getDatabase(), services = {}) {
  const queryPayments = services.queryPayments || supabase;
  const querySafaricom = services.querySafaricom || safaricom;
  const getConfiguration = services.getConfiguration || configuration;
  const [inbox] = await db.sql`SELECT * FROM mpesa_callbacks WHERE checkout_id = ${checkoutId}`;
  if (!inbox || inbox.synced_at) return;
  const callback = inbox.payload;
  const selector = callback.sourcePaymentId ? `id=eq.${encodeURIComponent(callback.sourcePaymentId)}` : `checkout_request_id=eq.${encodeURIComponent(checkoutId)}`;
  const payments = await queryPayments(`payments?${selector}&select=*`);
  if (payments.length !== 1) throw new Error('payment_not_matched');
  const payment = payments[0];
  if (!['pending', 'failed', 'success'].includes(payment.status)) throw new Error('payment_revoked');
  if (payment.checkout_request_id && payment.checkout_request_id !== checkoutId) throw new Error('checkout_not_matched');
  if (!payment.merchant_request_id && callback.sourcePaymentId) payment.merchant_request_id = callback.MerchantRequestID;
  if (callback.MerchantRequestID !== payment.merchant_request_id) throw new Error('merchant_not_matched');
  if (String(callback.ResultCode) !== '0') {
    const config = getConfiguration();
    const result = await querySafaricom(config, '/mpesa/stkpushquery/v1/query', { ...password(config), CheckoutRequestID: checkoutId });
    if (String(result.ResultCode) !== String(callback.ResultCode) || (result.CheckoutRequestID && result.CheckoutRequestID !== checkoutId)) throw new Error('failure_not_verified');
    // Never downgrade a confirmed payment, including concurrent callback delivery.
    await queryPayments(`payments?id=eq.${encodeURIComponent(payment.id)}&status=in.(pending,failed)`, { method: 'PATCH', body: { status: 'failed', result_code: String(callback.ResultCode), result_desc: 'M-Pesa payment was not completed.' } });
    await db.sql`UPDATE mpesa_callbacks SET synced_at = NOW() WHERE checkout_id = ${checkoutId}`;
    return;
  }
  if (!matchesPayment(callback, payment)) throw new Error('callback_details_mismatch');
  if (!inbox.verified_at && payment.status === 'success' && payment.mpesa_receipt) {
    const registered = await db.sql`SELECT payment_id FROM mpesa_requests WHERE payment_id = ${payment.id}`;
    if (!registered.length) {
      const receipt = callback.CallbackMetadata.Item.find(item => item.Name === 'MpesaReceiptNumber').Value;
      if (receipt !== payment.mpesa_receipt) throw new Error('legacy_receipt_mismatch');
      // Replayed historical confirmations must never start a fresh 24-hour term.
      // The legacy entitlement and its independent proof remain the access authority.
      await db.sql`UPDATE mpesa_callbacks SET synced_at = NOW() WHERE checkout_id = ${checkoutId}`;
      return;
    }
  }
  if (!inbox.verified_at) {
    const config = getConfiguration();
    const result = await querySafaricom(config, '/mpesa/stkpushquery/v1/query', { ...password(config), CheckoutRequestID: checkoutId });
    // Some Daraja query responses omit the echoed request IDs. Validate any IDs that are present.
    if (String(result.ResultCode) !== '0' || (result.CheckoutRequestID && result.CheckoutRequestID !== checkoutId) || (result.MerchantRequestID && result.MerchantRequestID !== payment.merchant_request_id)) throw new Error('verification_not_successful');
    const receipt = callback.CallbackMetadata.Item.find(item => item.Name === 'MpesaReceiptNumber').Value;
    // Unique receipt/payment constraints and one conditional write prevent double confirmation.
    await db.sql`UPDATE mpesa_callbacks SET receipt = ${receipt}, payment_id = ${payment.id}, user_id = ${payment.user_id}, product_id = ${payment.product_id}, verified_at = NOW() WHERE checkout_id = ${checkoutId} AND verified_at IS NULL`;
  }
  const [verified] = await db.sql`SELECT * FROM mpesa_callbacks WHERE checkout_id = ${checkoutId}`;
  const updated = await queryPayments(`payments?id=eq.${encodeURIComponent(payment.id)}&status=in.(pending,failed,success)&or=(checkout_request_id.is.null,checkout_request_id.eq.${encodeURIComponent(checkoutId)})`, { method: 'PATCH', representation: true, body: {
    status: 'success', checkout_request_id: checkoutId, merchant_request_id: payment.merchant_request_id, mpesa_receipt: verified.receipt, result_code: '0', result_desc: 'Payment independently verified with Safaricom.', updated_at: verified.verified_at,
  } });
  if (updated.length !== 1) throw new Error('payment_update_not_matched');
  await db.sql`UPDATE mpesa_callbacks SET synced_at = NOW() WHERE checkout_id = ${checkoutId}`;
}
export async function legacyAccessFor(userId, productId, db = getDatabase(), queryPayments = supabase, services = {}) {
  if (!Object.hasOwn(catalog(), productId)) return null;
  const now = Date.now();
  const entitlements = await queryPayments(`entitlements?user_id=eq.${encodeURIComponent(userId)}&product_id=eq.${encodeURIComponent(productId)}&active=eq.true&expires_at=gt.${encodeURIComponent(new Date(now).toISOString())}&select=*&order=expires_at.desc&limit=10`);
  for (const entitlement of entitlements) {
    if (entitlement.user_id !== userId || entitlement.product_id !== productId || entitlement.active !== true || !entitlement.payment_id || !(new Date(entitlement.expires_at).getTime() > now)) continue;
    const registered = await db.sql`SELECT payment_id FROM mpesa_requests WHERE payment_id = ${entitlement.payment_id}`;
    // New purchases must complete the normal callback/confirmation path.
    if (registered.length) continue;
    const path = `payments?id=eq.${encodeURIComponent(entitlement.payment_id)}&user_id=eq.${encodeURIComponent(userId)}&product_id=eq.${encodeURIComponent(productId)}&status=eq.success&result_code=eq.0&select=*`;
    const payments = await queryPayments(path);
    if (payments.length !== 1) continue;
    const payment = payments[0];
    if (payment.id !== entitlement.payment_id || payment.user_id !== userId || payment.product_id !== productId || payment.status !== 'success' || String(payment.result_code) !== '0' || !/^[A-Z0-9]{10,20}$/.test(payment.mpesa_receipt || '') || Number(payment.amount) !== catalog()[productId] || !payment.checkout_request_id || !payment.merchant_request_id || !/^254[17]\d{8}$/.test(normalizePhone(payment.phone))) continue;
    // Ambiguous or reused provider identifiers must not authorize another purchase.
    const unique = await queryPayments(`payments?or=(checkout_request_id.eq.${encodeURIComponent(payment.checkout_request_id)},mpesa_receipt.eq.${encodeURIComponent(payment.mpesa_receipt)})&select=id`);
    if (unique.length !== 1 || unique[0].id !== payment.id) continue;
    let [proof] = await db.sql`SELECT * FROM mpesa_legacy_verifications WHERE payment_id = ${payment.id}`;
    const matchesProof = value => value && value.payment_id === payment.id && value.entitlement_id === entitlement.id && value.user_id === userId && value.product_id === productId && value.receipt === payment.mpesa_receipt && value.checkout_id === payment.checkout_request_id && value.merchant_id === payment.merchant_request_id && new Date(value.expires_at).getTime() > Date.now() && new Date(value.verified_at).getTime() <= Date.now() + 5000;
    if (proof && !matchesProof(proof)) continue;
    if (!proof) {
      const config = (services.getConfiguration || configuration)();
      const result = await (services.querySafaricom || safaricom)(config, '/mpesa/stkpushquery/v1/query', { ...password(config), CheckoutRequestID: payment.checkout_request_id });
      if (String(result.ResultCode) !== '0' || (result.CheckoutRequestID && result.CheckoutRequestID !== payment.checkout_request_id) || (result.MerchantRequestID && result.MerchantRequestID !== payment.merchant_request_id)) continue;
    }
    // Recheck revocation and expiry after the provider round trip. Never renew access.
    const current = await queryPayments(`entitlements?id=eq.${encodeURIComponent(entitlement.id)}&user_id=eq.${encodeURIComponent(userId)}&product_id=eq.${encodeURIComponent(productId)}&payment_id=eq.${encodeURIComponent(payment.id)}&active=eq.true&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*`);
    const stillPaid = await queryPayments(path + `&mpesa_receipt=eq.${encodeURIComponent(payment.mpesa_receipt)}`);
    if (current.length === 1 && current[0].active === true && current[0].user_id === userId && current[0].product_id === productId && current[0].payment_id === payment.id && new Date(current[0].expires_at).getTime() > Date.now() && stillPaid.length === 1 && stillPaid[0].status === 'success' && String(stillPaid[0].result_code) === '0' && stillPaid[0].mpesa_receipt === payment.mpesa_receipt) {
      const originalExpiry = new Date(Math.min(new Date(entitlement.expires_at).getTime(), new Date(current[0].expires_at).getTime())).toISOString();
      if (!proof) {
        // Preserve original expiry and evidence once; concurrent requests cannot renew it.
        await db.sql`INSERT INTO mpesa_legacy_verifications (payment_id, entitlement_id, user_id, product_id, receipt, checkout_id, merchant_id, expires_at) VALUES (${payment.id}, ${entitlement.id}, ${userId}, ${productId}, ${payment.mpesa_receipt}, ${payment.checkout_request_id}, ${payment.merchant_request_id}, ${originalExpiry}) ON CONFLICT DO NOTHING`;
        [proof] = await db.sql`SELECT * FROM mpesa_legacy_verifications WHERE payment_id = ${payment.id}`;
      }
      if (!matchesProof(proof)) continue;
      return { expiresAt: new Date(Math.min(new Date(originalExpiry).getTime(), new Date(proof.expires_at).getTime())).toISOString(), receipt: payment.mpesa_receipt, verificationSource: 'legacy' };
    }
  }
  return null;
}

export async function accessFor(userId, productId, db = getDatabase(), queryPayments = supabase, legacyServices = {}) {
  const rows = await db.sql`SELECT payment_id, receipt, verified_at, verified_at + INTERVAL '24 hours' AS expires_at FROM mpesa_callbacks WHERE user_id = ${userId} AND product_id = ${productId} AND verified_at > NOW() - INTERVAL '24 hours' AND synced_at IS NOT NULL ORDER BY verified_at DESC LIMIT 1`;
  if (rows.length) {
    const verified = rows[0];
    const payments = await queryPayments(`payments?id=eq.${encodeURIComponent(verified.payment_id)}&user_id=eq.${encodeURIComponent(userId)}&product_id=eq.${encodeURIComponent(productId)}&status=eq.success&result_code=eq.0&mpesa_receipt=eq.${encodeURIComponent(verified.receipt)}&select=id`);
    if (payments.length === 1) return { expiresAt: verified.expires_at, receipt: verified.receipt };
  }
  return legacyAccessFor(userId, productId, db, queryPayments, legacyServices);
}
