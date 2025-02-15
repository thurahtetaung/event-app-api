CREATE TYPE "public"."organization_type" AS ENUM('company', 'individual', 'non_profit');
ALTER TABLE "organizations" ALTER COLUMN "country" SET DATA TYPE text;
ALTER TABLE "organizer_applications" ALTER COLUMN "country" SET DATA TYPE text;
ALTER TABLE "organizer_applications" ADD COLUMN "organization_type" "organization_type" NOT NULL;
ALTER TABLE "organizer_applications" ADD COLUMN "experience" text NOT NULL;
ALTER TABLE "organizer_applications" ADD COLUMN "social_links" text;
ALTER TABLE "organizer_applications" ADD COLUMN "phone_number" text;
DROP TYPE "public"."country";