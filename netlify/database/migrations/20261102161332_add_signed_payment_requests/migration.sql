CREATE TABLE "mpesa_requests" (
	"payment_id" text PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
