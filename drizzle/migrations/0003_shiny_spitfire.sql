ALTER TABLE "events" ALTER COLUMN "category" DROP NOT NULL;
ALTER TABLE "events" ADD COLUMN "category_id" uuid NOT NULL;
ALTER TABLE "events" ADD CONSTRAINT "events_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "events_category_id_index" ON "events" USING btree ("category_id");