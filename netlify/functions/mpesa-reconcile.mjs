import { getDatabase } from '@netlify/database';
import { processCallback } from '../lib/mpesa.mjs';
export default async () => {
  const db = getDatabase();
  const rows = await db.sql`SELECT checkout_id FROM mpesa_callbacks WHERE synced_at IS NULL AND received_at > NOW() - INTERVAL '7 days' ORDER BY received_at DESC LIMIT 10`;
  const results = await Promise.allSettled(rows.map(row => processCallback(row.checkout_id)));
  const failures = results.filter(result => result.status === 'rejected').length;
  if (failures) console.error('M-Pesa reconciliation awaits retry', { failures });
};
export const config = { schedule: '*/5 * * * *' };
