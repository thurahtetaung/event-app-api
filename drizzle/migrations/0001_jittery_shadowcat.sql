ALTER TABLE "tickets" ADD COLUMN "access_token" uuid;
ALTER TABLE "tickets" ADD COLUMN "is_validated" boolean DEFAULT false NOT NULL;
ALTER TABLE "tickets" ADD COLUMN "validated_at" timestamp;