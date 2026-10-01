CREATE TYPE "public"."spotlight_status" AS ENUM('active', 'paused', 'ended');--> statement-breakpoint
CREATE TABLE "spotlight_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"category_id" uuid,
	"status" "spotlight_status" DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spotlight_campaigns" ADD CONSTRAINT "spotlight_campaigns_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotlight_campaigns" ADD CONSTRAINT "spotlight_campaigns_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotlight_campaigns" ADD CONSTRAINT "spotlight_campaigns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spotlight_active_idx" ON "spotlight_campaigns" USING btree ("status","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "spotlight_one_active_uq" ON "spotlight_campaigns" USING btree ("business_id") WHERE "spotlight_campaigns"."status" = 'active';