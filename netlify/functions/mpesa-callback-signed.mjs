import callback from './mpesa-callback.mjs';

export default callback;
export const config = { path: '/api/mpesa/callback/:paymentId/:signature' };
