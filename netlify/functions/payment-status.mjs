import { respond, authenticatedUser, supabase, catalog, accessFor } from '../lib/mpesa.mjs';
export function statusHandler({ authenticate = authenticatedUser, lookup = supabase, authorize = accessFor } = {}) {
return async request => {
  if (request.method !== 'GET') return respond(405, { success: false });
  try {
    const user = await authenticate(request);
    if (!user) return respond(401, { success: false });
    const url = new URL(request.url);
    const product = url.searchParams.get('product_id');
    if (!Object.hasOwn(catalog(), product)) return respond(400, { success: false });
    const id = url.searchParams.get('payment_id');
    if (id && !/^[0-9a-f-]{36}$/i.test(id)) return respond(400, { success: false });
    const payments = await lookup(`payments?user_id=eq.${encodeURIComponent(user.id)}&product_id=eq.${product}${id ? `&id=eq.${id}` : ''}&select=id,status&order=created_at.desc&limit=1`);
    const access = await authorize(user.id, product);
    return respond(200, { success: true, status: payments[0]?.status || 'none', unlocked: !!access, ...access });
  } catch { return respond(503, { success: false, unlocked: false, message: 'Unable to verify payment. Access remains locked.' }); }
};

}
export default async request => statusHandler()(request);
