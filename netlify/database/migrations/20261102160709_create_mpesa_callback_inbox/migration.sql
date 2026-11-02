CREATE TABLE "mpesa_callbacks" (
	"checkout_id" text PRIMARY KEY,
	"payload" jsonb NOT NULL,
	"receipt" text UNIQUE,
	"payment_id" text UNIQUE,
	"user_id" text,
	"product_id" text,
	"verified_at" timestamp with time zone,
	"synced_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
