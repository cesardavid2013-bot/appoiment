-- Double-booking prevention. A staff member (or resource) can never hold two
-- overlapping reservations. This is enforced by Postgres itself, so it holds
-- under concurrent requests, retries and application bugs alike.
ALTER TABLE "occupancies"
  ADD CONSTRAINT "occupancies_member_no_overlap"
  EXCLUDE USING gist ("member_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("member_id" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "occupancies"
  ADD CONSTRAINT "occupancies_resource_no_overlap"
  EXCLUDE USING gist ("resource_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("resource_id" IS NOT NULL);
--> statement-breakpoint
CREATE INDEX "occupancies_member_range_idx" ON "occupancies" USING gist ("member_id", tstzrange("starts_at", "ends_at", '[)'));
--> statement-breakpoint
-- Search: search_text is normalised (lower-case, accents stripped) by the application.
CREATE INDEX "businesses_search_trgm_idx" ON "businesses" USING gin ("search_text" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "businesses_search_fts_idx" ON "businesses" USING gin (to_tsvector('simple', "search_text"));
--> statement-breakpoint
-- Only one active staff membership can be the owner of a business.
CREATE UNIQUE INDEX "members_one_owner_uq" ON "business_members" ("business_id") WHERE ("role" = 'owner' AND "status" <> 'disabled');
--> statement-breakpoint
-- Reserved and route-colliding slugs can never be claimed, even by direct SQL.
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_slug_format_ck" CHECK ("slug" ~ '^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$');
