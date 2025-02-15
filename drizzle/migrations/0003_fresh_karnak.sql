ALTER TABLE "organizations" ALTER COLUMN "owner_id" SET NOT NULL;
ALTER TABLE "organizations" ALTER COLUMN "description" SET NOT NULL;
ALTER TABLE "organizations" ADD COLUMN "organization_type" "organization_type" NOT NULL;
ALTER TABLE "organizations" ADD COLUMN "social_links" text;
ALTER TABLE "organizations" ADD COLUMN "phone_number" text;
ALTER TABLE "organizations" ADD COLUMN "event_types" text NOT NULL;
ALTER TABLE "organizations" ADD COLUMN "address" text NOT NULL;