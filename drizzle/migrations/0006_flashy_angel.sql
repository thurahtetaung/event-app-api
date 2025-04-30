CREATE INDEX "events_created_at_index" ON "events" USING btree ("created_at");
CREATE INDEX "orders_created_at_index" ON "orders" USING btree ("created_at");
CREATE INDEX "orders_status_index" ON "orders" USING btree ("status");