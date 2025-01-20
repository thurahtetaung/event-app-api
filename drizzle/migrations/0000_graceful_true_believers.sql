CREATE TYPE "public"."order_status" AS ENUM('pending', 'completed', 'failed', 'cancelled');
CREATE TYPE "public"."platform_configurations_keys" AS ENUM('platform_name', 'platform_fee', 'platform_currency');
CREATE TYPE "public"."ticket_status" AS ENUM('available', 'booked');
CREATE TYPE "public"."user_roles" AS ENUM('user', 'admin', 'organizer');
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT null,
	"organization_id" uuid NOT NULL,
	"capacity" integer NOT NULL,
	"category_id" uuid DEFAULT null,
	"venue_id" uuid DEFAULT null,
	"is_virtual" boolean DEFAULT true,
	"banner_url" text DEFAULT null,
	"created_at" timestamp DEFAULT now(),
	"start_timestamp" timestamp,
	"end_timestamp" timestamp,
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
	"stripe_payment_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'pending',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"name" text NOT NULL,
	"description" text DEFAULT null,
	"logo_url" text DEFAULT null,
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

CREATE TABLE "tickets" (
	"name" text NOT NULL,
	"seat_number" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid,
	"price" integer NOT NULL,
	"status" "ticket_status" DEFAULT 'available',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "tickets_eventId_seatNumber_unique" UNIQUE("event_id","seat_number")
);

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"username" text NOT NULL,
	"supabase_user_id" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"role" "user_roles" DEFAULT 'user' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_supabaseUserId_unique" UNIQUE("supabase_user_id")
);

CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"capacity" integer NOT NULL,
	"is_active" boolean DEFAULT true,
	"banner_url" text DEFAULT null,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "events" ADD CONSTRAINT "events_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "events_organization_id_index" ON "events" USING btree ("organization_id");
CREATE INDEX "events_category_id_index" ON "events" USING btree ("category_id");
CREATE INDEX "events_venue_id_index" ON "events" USING btree ("venue_id");
CREATE INDEX "orders_user_id_index" ON "orders" USING btree ("user_id");
CREATE INDEX "orders_event_id_index" ON "orders" USING btree ("event_id");
CREATE INDEX "organizations_owner_id_index" ON "organizations" USING btree ("owner_id");
CREATE INDEX "tickets_event_id_index" ON "tickets" USING btree ("event_id");
CREATE INDEX "tickets_user_id_index" ON "tickets" USING btree ("user_id");
CREATE INDEX "users_email_index" ON "users" USING btree ("email");
CREATE INDEX "users_username_index" ON "users" USING btree ("username");