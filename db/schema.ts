import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

// Durable inbox: callbacks survive Safaricom query delays and mirror failures.
export const mpesaCallbacks = pgTable('mpesa_callbacks', {
  checkoutId: text('checkout_id').primaryKey(),
  payload: jsonb('payload').notNull(),
  receipt: text('receipt').unique(),
  paymentId: text('payment_id').unique(),
  userId: text('user_id'),
  productId: text('product_id'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  syncedAt: timestamp('synced_at', { withTimezone: true }),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
});

// Records which payment requests require the signed callback route.
export const mpesaRequests = pgTable('mpesa_requests', {
  paymentId: text('payment_id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Immutable provider evidence for pre-existing purchases, never a replacement
// for checking the current payment and entitlement on each protected request.
export const mpesaLegacyVerifications = pgTable('mpesa_legacy_verifications', {
  paymentId: text('payment_id').primaryKey(),
  entitlementId: text('entitlement_id').notNull(),
  userId: text('user_id').notNull(),
  productId: text('product_id').notNull(),
  receipt: text('receipt').notNull().unique(),
  checkoutId: text('checkout_id').notNull().unique(),
  merchantId: text('merchant_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }).defaultNow().notNull(),
});
