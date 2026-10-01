ALTER TABLE "media" ADD COLUMN "visibility" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_currency_ck" CHECK ("businesses"."currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_visibility_ck" CHECK ("media"."visibility" in ('public', 'private'));--> statement-breakpoint
UPDATE "media" SET "visibility" = 'private' WHERE "id" IN (SELECT unnest("media_ids") FROM "support_messages") OR "id" IN (SELECT "media_id" FROM "messages" WHERE "media_id" IS NOT NULL);
