import { getStore } from '@netlify/blobs';
import { respond, authenticatedUser, accessFor, catalog } from '../lib/mpesa.mjs';

// The same server-side check guards listings and every individual download.
export function materialsHandler({ authenticate = authenticatedUser, authorize = accessFor, storage = () => getStore('premium-materials') } = {}) {
  return async request => {
    if (request.method !== 'GET') return respond(405, { success: false });
    try {
      const user = await authenticate(request);
      if (!user) return respond(401, { success: false });
      const params = new URL(request.url).searchParams;
      const product = params.get('product_id');
      if (!Object.hasOwn(catalog(), product)) return respond(400, { success: false });
      const access = await authorize(user.id, product);
      if (!access) return respond(403, { success: false, message: 'Verified successful payment required.' });
      const file = params.get('file');
      const store = storage();
      if (file !== null) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9 _.-]{0,119}$/.test(file) || file.includes('..')) return respond(400, { success: false });
        const data = await store.get(product + '/' + file, { type: 'stream' });
        if (!data) return respond(404, { success: false, message: 'Material not found.' });
        return new Response(data, { headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${file}"`,
          'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
        } });
      }
      const { blobs } = await store.list({ prefix: product + '/' });
      const files = blobs.map(blob => blob.key.slice(product.length + 1)).filter(file => /^[a-zA-Z0-9][a-zA-Z0-9 _.-]{0,119}$/.test(file) && !file.includes('..'));
      return respond(200, { success: true, files, expiresAt: access.expiresAt, message: files.length ? 'Available premium materials.' : 'Your access is active. Premium materials have not been uploaded yet.' });
    } catch { return respond(503, { success: false, message: 'Access could not be verified. Please try again later.' }); }
  };
}
export default async request => materialsHandler()(request);
