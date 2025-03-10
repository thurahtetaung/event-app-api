CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive', 'banned');
ALTER TABLE "users" ADD COLUMN "status" "user_status" DEFAULT 'active' NOT NULL;