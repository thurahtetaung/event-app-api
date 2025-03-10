CREATE TABLE "seeding_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_ids" text NOT NULL,
	"metadata" text,
	"status" text NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now(),
	"created_by" text
);
