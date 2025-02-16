CREATE TYPE "public"."event_status" AS ENUM('draft', 'published', 'cancelled');
CREATE TYPE "public"."event_types" AS ENUM('conference', 'workshop', 'concert', 'exhibition', 'sports', 'networking', 'festival', 'corporate');
CREATE TYPE "public"."order_status" AS ENUM('pending', 'completed', 'failed', 'cancelled');
CREATE TYPE "public"."organization_type" AS ENUM('company', 'individual', 'non_profit');
CREATE TYPE "public"."platform_configurations_keys" AS ENUM('platform_name', 'platform_fee');
CREATE TYPE "public"."ticket_status" AS ENUM('available', 'booked');
CREATE TYPE "public"."ticket_type" AS ENUM('paid', 'free');
CREATE TYPE "public"."user_roles" AS ENUM('user', 'organizer', 'admin');
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"start_timestamp" timestamp NOT NULL,
	"end_timestamp" timestamp NOT NULL,
	"venue" text,
	"address" text,
	"category" text NOT NULL,
	"is_online" boolean DEFAULT false,
	"capacity" integer NOT NULL,
	"cover_image" text,
	"organization_id" uuid NOT NULL,
	"status" "event_status" DEFAULT 'draft',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"event_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'pending',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"organization_type" "organization_type" NOT NULL,
	"description" text NOT NULL,
	"website" text,
	"logo_url" text,
	"social_links" text,
	"phone_number" text,
	"event_types" text NOT NULL,
	"address" text NOT NULL,
	"country" text NOT NULL,
	"stripe_account_id" text,
	"stripe_account_status" text DEFAULT 'pending',
	"stripe_account_created_at" timestamp,
	"stripe_account_updated_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "organizations_stripe_account_id_unique" UNIQUE("stripe_account_id")
);

CREATE TABLE "organizer_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_name" text NOT NULL,
	"organization_type" "organization_type" NOT NULL,
	"description" text NOT NULL,
	"experience" text NOT NULL,
	"website" text,
	"logo_url" text,
	"social_links" text,
	"phone_number" text,
	"event_types" text NOT NULL,
	"address" text NOT NULL,
	"country" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"approved_by" uuid,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "platform_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" "platform_configurations_keys" NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "ticket_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" integer NOT NULL,
	"quantity" integer NOT NULL,
	"type" "ticket_type" NOT NULL,
	"sale_start" timestamp NOT NULL,
	"sale_end" timestamp NOT NULL,
	"max_per_order" integer,
	"min_per_order" integer,
	"event_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"user_id" uuid,
	"reserved_at" timestamp,
	"booked_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"date_of_birth" timestamp NOT NULL,
	"country" text NOT NULL,
	"supabase_user_id" text,
	"role" "user_roles" DEFAULT 'user' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_supabase_user_id_unique" UNIQUE("supabase_user_id")
);

ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "organizer_applications" ADD CONSTRAINT "organizer_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "organizer_applications" ADD CONSTRAINT "organizer_applications_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "events_organization_id_index" ON "events" USING btree ("organization_id");
CREATE INDEX "events_status_index" ON "events" USING btree ("status");
CREATE INDEX "orders_user_id_index" ON "orders" USING btree ("user_id");
CREATE INDEX "orders_event_id_index" ON "orders" USING btree ("event_id");
CREATE INDEX "organizations_owner_id_index" ON "organizations" USING btree ("owner_id");
CREATE UNIQUE INDEX "platform_configurations_key_unique" ON "platform_configurations" USING btree ("key");
CREATE INDEX "ticket_types_event_id_index" ON "ticket_types" USING btree ("event_id");
CREATE INDEX "tickets_event_id_index" ON "tickets" USING btree ("event_id");
CREATE INDEX "tickets_ticket_type_id_index" ON "tickets" USING btree ("ticket_type_id");
CREATE INDEX "tickets_status_index" ON "tickets" USING btree ("status");
CREATE INDEX "users_email_index" ON "users" USING btree ("email");