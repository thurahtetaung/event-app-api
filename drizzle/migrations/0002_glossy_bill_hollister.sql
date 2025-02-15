CREATE TYPE "public"."event_types" AS ENUM('conference', 'workshop', 'concert', 'exhibition', 'sports', 'networking', 'festival', 'corporate');
ALTER TABLE "organizer_applications" ADD COLUMN "event_types" text NOT NULL;
ALTER TABLE "organizer_applications" ADD COLUMN "address" text NOT NULL;