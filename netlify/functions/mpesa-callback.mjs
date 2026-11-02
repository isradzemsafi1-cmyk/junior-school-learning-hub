import { respond, validCallback, acceptCallback, receiveCallback, processCallback } from '../lib/mpesa.mjs';

export function callbackHandler({ accept = acceptCallback, receive = receiveCallback, process = processCallback } = {}) {
return async request => {
  if (request.method !== 'POST') return respond(405, { success: false });
  let callback;
  try {
    const payload = await request.text();
    if (payload.length > 65536) return respond(413, { success: false });
    callback = JSON.parse(payload)?.Body?.stkCallback;
  }
  catch { return respond(400, { success: false }); }
  if (!validCallback(callback)) return respond(400, { success: false });
  try {
    if (!await accept(request, callback)) return respond(403, { success: false });
    await receive(callback);
    await process(callback.CheckoutRequestID);
    return respond(200, { ResultCode: 0, ResultDesc: 'Received' });
  } catch {
    // The durable inbox is retried by mpesa-reconcile; non-2xx also signals delivery failure.
    console.error('M-Pesa callback awaits processing; no access granted.');
    return respond(503, { success: false, message: 'Callback processing awaits retry.' });
  }
};


}
export default async request => callbackHandler()(request);
