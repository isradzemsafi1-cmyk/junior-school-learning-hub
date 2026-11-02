CREATE TABLE "mpesa_legacy_verifications" (
	"payment_id" text PRIMARY KEY,
	"entitlement_id" text NOT NULL,
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"receipt" text NOT NULL UNIQUE,
	"checkout_id" text NOT NULL UNIQUE,
	"merchant_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
