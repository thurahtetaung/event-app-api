ALTER TABLE "events" ADD COLUMN "timezone" text DEFAULT 'Asia/Bangkok' NOT NULL;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_stripe_account_id_unique" UNIQUE("stripe_account_id");