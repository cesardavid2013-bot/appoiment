CREATE TYPE "public"."actor_type" AS ENUM('customer', 'business', 'system', 'admin');--> statement-breakpoint
CREATE TYPE "public"."appointment_source" AS ENUM('marketplace', 'direct_link', 'manual', 'walk_in');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('pending_payment', 'requested', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'declined', 'no_show', 'expired');--> statement-breakpoint
CREATE TYPE "public"."block_reason" AS ENUM('break', 'personal', 'vacation', 'sick', 'holiday', 'other');--> statement-breakpoint
CREATE TYPE "public"."booking_mode" AS ENUM('instant', 'request');--> statement-breakpoint
CREATE TYPE "public"."business_kind" AS ENUM('individual', 'business');--> statement-breakpoint
CREATE TYPE "public"."business_status" AS ENUM('draft', 'active', 'suspended', 'closed');--> statement-breakpoint
CREATE TYPE "public"."deposit_type" AS ENUM('fixed', 'percent');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'done', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."location_kind" AS ENUM('physical', 'mobile', 'virtual');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'manager', 'receptionist', 'provider', 'custom');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('invited', 'active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."option_selection" AS ENUM('single', 'multiple');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('deposit', 'full', 'balance', 'tip', 'cancellation_fee', 'no_show_fee');--> statement-breakpoint
CREATE TYPE "public"."payment_policy" AS ENUM('pay_later', 'deposit', 'full');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('stripe', 'manual');--> statement-breakpoint
CREATE TYPE "public"."payment_record_status" AS ENUM('requires_payment', 'processing', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."appointment_payment_status" AS ENUM('not_required', 'unpaid', 'pay_in_person', 'deposit_paid', 'paid', 'partially_refunded', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."plan_tier" AS ENUM('free', 'pro', 'business');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('user', 'support', 'admin');--> statement-breakpoint
CREATE TYPE "public"."portfolio_kind" AS ENUM('image', 'video', 'before_after');--> statement-breakpoint
CREATE TYPE "public"."price_type" AS ENUM('fixed', 'starting_at', 'range', 'free', 'quote');--> statement-breakpoint
CREATE TYPE "public"."promo_kind" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('published', 'hidden', 'removed');--> statement-breakpoint
CREATE TYPE "public"."sender_role" AS ENUM('customer', 'business', 'system');--> statement-breakpoint
CREATE TYPE "public"."service_status" AS ENUM('active', 'hidden', 'archived');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'awaiting_customer', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."token_kind" AS ENUM('email_verify', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('not_submitted', 'pending', 'verified', 'rejected', 'needs_info');--> statement-breakpoint
CREATE TYPE "public"."waitlist_status" AS ENUM('active', 'notified', 'booked', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "appointment_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"appointment_id" uuid NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_user_id" uuid,
	"type" text NOT NULL,
	"from_status" "appointment_status",
	"to_status" "appointment_status",
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"business_id" uuid NOT NULL,
	"location_id" uuid,
	"service_id" uuid NOT NULL,
	"member_id" uuid,
	"resource_id" uuid,
	"group_session_id" uuid,
	"customer_user_id" uuid,
	"business_customer_id" uuid NOT NULL,
	"status" "appointment_status" NOT NULL,
	"source" "appointment_source" DEFAULT 'marketplace' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"block_starts_at" timestamp with time zone NOT NULL,
	"block_ends_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"selected_option_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"snapshot" jsonb NOT NULL,
	"intake_answers" jsonb,
	"consent_accepted_at" timestamp with time zone,
	"customer_note" text,
	"service_address" text,
	"currency" text NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"fee_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"is_estimate" boolean DEFAULT false NOT NULL,
	"deposit_due_cents" integer DEFAULT 0 NOT NULL,
	"amount_paid_cents" integer DEFAULT 0 NOT NULL,
	"amount_refunded_cents" integer DEFAULT 0 NOT NULL,
	"tip_cents" integer DEFAULT 0 NOT NULL,
	"payment_status" "appointment_payment_status" NOT NULL,
	"promotion_id" uuid,
	"hold_expires_at" timestamp with time zone,
	"idempotency_key" text,
	"rescheduled_from_id" uuid,
	"reschedule_count" integer DEFAULT 0 NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" "actor_type",
	"cancellation_reason" text,
	"confirmed_at" timestamp with time zone,
	"checked_in_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"no_show_at" timestamp with time zone,
	"check_in_code" text NOT NULL,
	"created_by_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_range_ck" CHECK ("appointments"."starts_at" < "appointments"."ends_at" and "appointments"."block_starts_at" <= "appointments"."starts_at" and "appointments"."block_ends_at" >= "appointments"."ends_at"),
	CONSTRAINT "appointments_money_ck" CHECK ("appointments"."total_cents" >= 0 and "appointments"."amount_paid_cents" >= 0 and "appointments"."amount_refunded_cents" >= 0 and "appointments"."tip_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"business_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "token_kind" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"member_id" uuid,
	"location_id" uuid,
	"weekday" smallint NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rules_weekday_ck" CHECK ("availability_rules"."weekday" between 1 and 7),
	CONSTRAINT "rules_minutes_ck" CHECK ("availability_rules"."start_minute" >= 0 and "availability_rules"."end_minute" <= 1440 and "availability_rules"."start_minute" < "availability_rules"."end_minute")
);
--> statement-breakpoint
CREATE TABLE "business_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"email" "citext",
	"phone" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"preferences" text,
	"marketing_consent_at" timestamp with time zone,
	"appointment_count" integer DEFAULT 0 NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"cancelled_count" integer DEFAULT 0 NOT NULL,
	"no_show_count" integer DEFAULT 0 NOT NULL,
	"total_spent_cents" integer DEFAULT 0 NOT NULL,
	"first_visit_at" timestamp with time zone,
	"last_visit_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid,
	"invite_email" "citext",
	"invite_token_hash" text,
	"invite_expires_at" timestamp with time zone,
	"role" "member_role" NOT NULL,
	"custom_permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"display_name" text NOT NULL,
	"title" text,
	"bio" text,
	"avatar_media_id" uuid,
	"is_bookable" boolean DEFAULT true NOT NULL,
	"status" "member_status" DEFAULT 'active' NOT NULL,
	"commission_bps" integer,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" "citext" NOT NULL,
	"name" text NOT NULL,
	"kind" "business_kind" NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"primary_category_id" uuid,
	"tagline" text,
	"about" text,
	"logo_media_id" uuid,
	"cover_media_id" uuid,
	"timezone" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"website" text,
	"social_links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"amenities" text[] DEFAULT '{}'::text[] NOT NULL,
	"years_experience" smallint,
	"status" "business_status" DEFAULT 'draft' NOT NULL,
	"verification_status" "verification_status" DEFAULT 'not_submitted' NOT NULL,
	"plan" "plan_tier" DEFAULT 'free' NOT NULL,
	"booking_mode" "booking_mode" DEFAULT 'instant' NOT NULL,
	"min_notice_minutes" integer DEFAULT 60 NOT NULL,
	"max_advance_days" integer DEFAULT 60 NOT NULL,
	"slot_interval_minutes" integer DEFAULT 15 NOT NULL,
	"allow_any_staff" boolean DEFAULT true NOT NULL,
	"cancellation_window_hours" integer DEFAULT 24 NOT NULL,
	"reschedule_window_hours" integer DEFAULT 24 NOT NULL,
	"late_cancel_fee_percent" smallint DEFAULT 0 NOT NULL,
	"no_show_fee_percent" smallint DEFAULT 0 NOT NULL,
	"deposit_refundable" boolean DEFAULT true NOT NULL,
	"late_policy" text,
	"booking_instructions" text,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"tax_label" text,
	"reminder_offsets_minutes" integer[] DEFAULT '{1440,120}'::int[] NOT NULL,
	"stripe_account_id" text,
	"payments_enabled" boolean DEFAULT false NOT NULL,
	"rating_avg" double precision,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"price_min_cents" integer,
	"price_max_cents" integer,
	"search_text" text DEFAULT '' NOT NULL,
	"offers_mobile" boolean DEFAULT false NOT NULL,
	"offers_virtual" boolean DEFAULT false NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"city" text,
	"onboarding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_slot_interval_ck" CHECK ("businesses"."slot_interval_minutes" between 5 and 240),
	CONSTRAINT "businesses_fee_pct_ck" CHECK ("businesses"."late_cancel_fee_percent" between 0 and 100 and "businesses"."no_show_fee_percent" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"customer_user_id" uuid NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_preview" text,
	"customer_last_read_at" timestamp with time zone,
	"business_last_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"business_customer_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"template" text NOT NULL,
	"user_id" uuid,
	"recipient_hint" text,
	"status" text NOT NULL,
	"provider_message_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_business_id_pk" PRIMARY KEY("user_id","business_id")
);
--> statement-breakpoint
CREATE TABLE "group_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"location_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"booked_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_sessions_capacity_ck" CHECK ("group_sessions"."booked_count" >= 0 and "group_sessions"."booked_count" <= "group_sessions"."capacity")
);
--> statement-breakpoint
CREATE TABLE "intake_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "location_kind" NOT NULL,
	"line1" text,
	"line2" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"country" text,
	"lat" double precision,
	"lng" double precision,
	"service_radius_km" integer,
	"timezone" text NOT NULL,
	"phone" text,
	"instructions" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"business_id" uuid,
	"kind" "media_kind" NOT NULL,
	"status" "media_status" DEFAULT 'processing' NOT NULL,
	"original_key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"duration_seconds" double precision,
	"variants" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"placeholder" text,
	"alt" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_locations" (
	"member_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	CONSTRAINT "member_locations_member_id_location_id_pk" PRIMARY KEY("member_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_user_id" uuid,
	"sender_role" "sender_role" NOT NULL,
	"body" text NOT NULL,
	"appointment_id" uuid,
	"media_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "occupancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"member_id" uuid,
	"resource_id" uuid,
	"appointment_id" uuid,
	"group_session_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occupancies_range_ck" CHECK ("occupancies"."starts_at" < "occupancies"."ends_at")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"customer_user_id" uuid,
	"kind" "payment_kind" NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_payment_id" text,
	"method" text,
	"amount_cents" integer NOT NULL,
	"application_fee_cents" integer DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"status" "payment_record_status" NOT NULL,
	"failure_message" text,
	"recorded_by_user_id" uuid,
	"succeeded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_ck" CHECK ("payments"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "portfolio_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"member_id" uuid,
	"service_id" uuid,
	"kind" "portfolio_kind" NOT NULL,
	"media_id" uuid NOT NULL,
	"before_media_id" uuid,
	"caption" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotion_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promotion_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"customer_user_id" uuid,
	"discount_cents" integer NOT NULL,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"code" "citext" NOT NULL,
	"name" text NOT NULL,
	"kind" "promo_kind" NOT NULL,
	"value" integer NOT NULL,
	"min_subtotal_cents" integer DEFAULT 0 NOT NULL,
	"service_ids" uuid[],
	"new_customers_only" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"max_redemptions" integer,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"per_customer_limit" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "recent_views" (
	"user_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recent_views_user_id_business_id_pk" PRIMARY KEY("user_id","business_id")
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"reason" text,
	"status" "refund_status" NOT NULL,
	"provider_refund_id" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_amount_ck" CHECK ("refunds"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolved_by_user_id" uuid,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"location_id" uuid,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"member_id" uuid,
	"service_id" uuid,
	"customer_user_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"body" text,
	"status" "review_status" DEFAULT 'published' NOT NULL,
	"response_body" text,
	"responded_at" timestamp with time zone,
	"responded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating_ck" CHECK ("reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "schedule_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"member_id" uuid,
	"location_id" uuid,
	"date" date NOT NULL,
	"intervals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_locations" (
	"service_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	CONSTRAINT "service_locations_service_id_location_id_pk" PRIMARY KEY("service_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "service_option_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"selection" "option_selection" DEFAULT 'single' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"max_select" integer,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_delta_cents" integer DEFAULT 0 NOT NULL,
	"duration_delta_minutes" integer DEFAULT 0 NOT NULL,
	"eligible_member_ids" uuid[],
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_resources" (
	"service_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	CONSTRAINT "service_resources_service_id_resource_id_pk" PRIMARY KEY("service_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "service_staff" (
	"service_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"price_cents_override" integer,
	"duration_minutes_override" integer,
	CONSTRAINT "service_staff_service_id_member_id_pk" PRIMARY KEY("service_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"category_id" uuid,
	"menu_section" text,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"duration_minutes" integer NOT NULL,
	"buffer_before_minutes" integer DEFAULT 0 NOT NULL,
	"buffer_after_minutes" integer DEFAULT 0 NOT NULL,
	"price_type" "price_type" DEFAULT 'fixed' NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"sale_price_cents" integer,
	"price_max_cents" integer,
	"payment_policy" "payment_policy" DEFAULT 'pay_later' NOT NULL,
	"deposit_type" "deposit_type",
	"deposit_value" integer,
	"capacity" integer DEFAULT 1 NOT NULL,
	"min_attendees" integer DEFAULT 1 NOT NULL,
	"min_notice_minutes" integer,
	"max_advance_days" integer,
	"requires_approval" boolean,
	"service_hours" jsonb,
	"intake_form_id" uuid,
	"consent_text" text,
	"min_age" smallint,
	"booking_instructions" text,
	"cover_media_id" uuid,
	"status" "service_status" DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_duration_ck" CHECK ("services"."duration_minutes" between 5 and 1440),
	CONSTRAINT "services_price_ck" CHECK ("services"."price_cents" >= 0),
	CONSTRAINT "services_capacity_ck" CHECK ("services"."capacity" >= 1 and "services"."min_attendees" >= 1 and "services"."min_attendees" <= "services"."capacity"),
	CONSTRAINT "services_buffers_ck" CHECK ("services"."buffer_before_minutes" >= 0 and "services"."buffer_after_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"is_staff" boolean DEFAULT false NOT NULL,
	"body" text NOT NULL,
	"media_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"business_id" uuid,
	"appointment_id" uuid,
	"category" text NOT NULL,
	"subject" text NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"member_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" "block_reason" DEFAULT 'other' NOT NULL,
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_range_ck" CHECK ("time_blocks"."starts_at" < "time_blocks"."ends_at")
);
--> statement-breakpoint
CREATE TABLE "user_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"city" text NOT NULL,
	"region" text,
	"postal_code" text,
	"country" text DEFAULT 'US' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext",
	"email_verified_at" timestamp with time zone,
	"phone" text,
	"phone_verified_at" timestamp with time zone,
	"password_hash" text,
	"name" text NOT NULL,
	"avatar_media_id" uuid,
	"platform_role" "platform_role" DEFAULT 'user' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"timezone" text,
	"notification_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_login_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"details" text,
	"document_media_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"status" "verification_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by_user_id" uuid,
	"decision_note" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"member_id" uuid,
	"customer_user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"earliest_minute" integer DEFAULT 0 NOT NULL,
	"latest_minute" integer DEFAULT 1440 NOT NULL,
	"status" "waitlist_status" DEFAULT 'active' NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_member_id_business_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."business_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_group_session_id_group_sessions_id_fk" FOREIGN KEY ("group_session_id") REFERENCES "public"."group_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_customer_id_business_customers_id_fk" FOREIGN KEY ("business_customer_id") REFERENCES "public"."business_customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_member_id_business_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."business_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_customers" ADD CONSTRAINT "business_customers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_customers" ADD CONSTRAINT "business_customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_primary_category_id_categories_id_fk" FOREIGN KEY ("primary_category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_business_customer_id_business_customers_id_fk" FOREIGN KEY ("business_customer_id") REFERENCES "public"."business_customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_sessions" ADD CONSTRAINT "group_sessions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_sessions" ADD CONSTRAINT "group_sessions_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_sessions" ADD CONSTRAINT "group_sessions_member_id_business_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."business_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_sessions" ADD CONSTRAINT "group_sessions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_forms" ADD CONSTRAINT "intake_forms_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_locations" ADD CONSTRAINT "member_locations_member_id_business_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."business_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_locations" ADD CONSTRAINT "member_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occupancies" ADD CONSTRAINT "occupancies_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occupancies" ADD CONSTRAINT "occupancies_member_id_business_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."business_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occupancies" ADD CONSTRAINT "occupancies_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occupancies" ADD CONSTRAINT "occupancies_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occupancies" ADD CONSTRAINT "occupancies_group_session_id_group_sessions_id_fk" FOREIGN KEY ("group_session_id") REFERENCES "public"."group_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_member_id_business_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."business_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_before_media_id_media_id_fk" FOREIGN KEY ("before_media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recent_views" ADD CONSTRAINT "recent_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recent_views" ADD CONSTRAINT "recent_views_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_member_id_business_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."business_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_responded_by_user_id_users_id_fk" FOREIGN KEY ("responded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_overrides" ADD CONSTRAINT "schedule_overrides_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_overrides" ADD CONSTRAINT "schedule_overrides_member_id_business_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."business_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_overrides" ADD CONSTRAINT "schedule_overrides_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_locations" ADD CONSTRAINT "service_locations_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_locations" ADD CONSTRAINT "service_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_option_groups" ADD CONSTRAINT "service_option_groups_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_options" ADD CONSTRAINT "service_options_group_id_service_option_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."service_option_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_resources" ADD CONSTRAINT "service_resources_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_resources" ADD CONSTRAINT "service_resources_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_staff" ADD CONSTRAINT "service_staff_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_staff" ADD CONSTRAINT "service_staff_member_id_business_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."business_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_intake_form_id_intake_forms_id_fk" FOREIGN KEY ("intake_form_id") REFERENCES "public"."intake_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_member_id_business_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."business_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_member_id_business_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."business_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_events_appointment_id_created_at_index" ON "appointment_events" USING btree ("appointment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_reference_uq" ON "appointments" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_idempotency_uq" ON "appointments" USING btree ("customer_user_id","idempotency_key") WHERE "appointments"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "appointments_business_time_idx" ON "appointments" USING btree ("business_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_member_time_idx" ON "appointments" USING btree ("member_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_customer_time_idx" ON "appointments" USING btree ("customer_user_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_business_customer_id_index" ON "appointments" USING btree ("business_customer_id");--> statement-breakpoint
CREATE INDEX "appointments_hold_idx" ON "appointments" USING btree ("hold_expires_at") WHERE "appointments"."status" = 'pending_payment';--> statement-breakpoint
CREATE INDEX "audit_logs_business_id_created_at_index" ON "audit_logs" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_user_id_created_at_index" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_index" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tokens_hash_uq" ON "auth_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_tokens_user_id_kind_index" ON "auth_tokens" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "availability_rules_business_id_member_id_index" ON "availability_rules" USING btree ("business_id","member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bcustomers_business_user_uq" ON "business_customers" USING btree ("business_id","user_id") WHERE "business_customers"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "business_customers_business_id_last_visit_at_index" ON "business_customers" USING btree ("business_id","last_visit_at");--> statement-breakpoint
CREATE UNIQUE INDEX "members_business_user_uq" ON "business_members" USING btree ("business_id","user_id") WHERE "business_members"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "members_invite_hash_uq" ON "business_members" USING btree ("invite_token_hash") WHERE "business_members"."invite_token_hash" is not null;--> statement-breakpoint
CREATE INDEX "business_members_user_id_index" ON "business_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "businesses_slug_uq" ON "businesses" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "businesses_owner_user_id_index" ON "businesses" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "businesses_status_primary_category_id_index" ON "businesses" USING btree ("status","primary_category_id");--> statement-breakpoint
CREATE INDEX "businesses_geo_idx" ON "businesses" USING btree ("lat","lng");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_uq" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "categories_parent_id_index" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_pair_uq" ON "conversations" USING btree ("business_id","customer_user_id");--> statement-breakpoint
CREATE INDEX "conversations_customer_user_id_last_message_at_index" ON "conversations" USING btree ("customer_user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_business_id_last_message_at_index" ON "conversations" USING btree ("business_id","last_message_at");--> statement-breakpoint
CREATE INDEX "customer_notes_business_customer_id_index" ON "customer_notes" USING btree ("business_customer_id");--> statement-breakpoint
CREATE INDEX "delivery_log_created_at_index" ON "delivery_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "group_sessions_slot_uq" ON "group_sessions" USING btree ("service_id","member_id","starts_at");--> statement-breakpoint
CREATE INDEX "intake_forms_business_id_index" ON "intake_forms" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "jobs_ready_idx" ON "jobs" USING btree ("run_at") WHERE "jobs"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_uq" ON "jobs" USING btree ("dedupe_key") WHERE "jobs"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "locations_business_id_index" ON "locations" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "media_business_id_index" ON "media" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "media_owner_user_id_index" ON "media" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_created_at_index" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_id_created_at_index" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_provider_account_uq" ON "oauth_accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "oauth_accounts_user_id_index" ON "oauth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "occupancies_appointment_uq" ON "occupancies" USING btree ("appointment_id") WHERE "occupancies"."appointment_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "occupancies_session_uq" ON "occupancies" USING btree ("group_session_id") WHERE "occupancies"."group_session_id" is not null;--> statement-breakpoint
CREATE INDEX "occupancies_business_id_starts_at_index" ON "occupancies" USING btree ("business_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_id_uq" ON "payments" USING btree ("provider_payment_id") WHERE "payments"."provider_payment_id" is not null;--> statement-breakpoint
CREATE INDEX "payments_appointment_id_index" ON "payments" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "payments_business_id_created_at_index" ON "payments" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "portfolio_items_business_id_created_at_index" ON "portfolio_items" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "portfolio_items_service_id_index" ON "portfolio_items" USING btree ("service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "redemptions_appointment_uq" ON "promotion_redemptions" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "promotion_redemptions_promotion_id_customer_user_id_index" ON "promotion_redemptions" USING btree ("promotion_id","customer_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promotions_business_code_uq" ON "promotions" USING btree ("business_id","code");--> statement-breakpoint
CREATE INDEX "recent_views_user_id_viewed_at_index" ON "recent_views" USING btree ("user_id","viewed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_provider_id_uq" ON "refunds" USING btree ("provider_refund_id") WHERE "refunds"."provider_refund_id" is not null;--> statement-breakpoint
CREATE INDEX "refunds_appointment_id_index" ON "refunds" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "reports_status_created_at_index" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_once_uq" ON "reports" USING btree ("reporter_user_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "resources_business_id_index" ON "resources" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_appointment_uq" ON "reviews" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "reviews_business_id_status_created_at_index" ON "reviews" USING btree ("business_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "overrides_scope_date_uq" ON "schedule_overrides" USING btree ("business_id",coalesce("member_id", '00000000-0000-0000-0000-000000000000'::uuid),coalesce("location_id", '00000000-0000-0000-0000-000000000000'::uuid),"date");--> statement-breakpoint
CREATE INDEX "service_locations_location_id_index" ON "service_locations" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "service_option_groups_service_id_index" ON "service_option_groups" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "service_options_group_id_index" ON "service_options" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "service_staff_member_id_index" ON "service_staff" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "services_business_id_status_index" ON "services" USING btree ("business_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "services_business_slug_uq" ON "services" USING btree ("business_id","slug");--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_index" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "support_messages_ticket_id_created_at_index" ON "support_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_user_id_created_at_index" ON "support_tickets" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_status_last_activity_at_index" ON "support_tickets" USING btree ("status","last_activity_at");--> statement-breakpoint
CREATE INDEX "time_blocks_business_id_starts_at_index" ON "time_blocks" USING btree ("business_id","starts_at");--> statement-breakpoint
CREATE INDEX "user_addresses_user_id_index" ON "user_addresses" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email") WHERE "users"."email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_uq" ON "users" USING btree ("phone") WHERE "users"."phone" is not null;--> statement-breakpoint
CREATE INDEX "verification_requests_status_created_at_index" ON "verification_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "verification_requests_business_id_index" ON "verification_requests" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "waitlist_entries_business_id_date_status_index" ON "waitlist_entries" USING btree ("business_id","date","status");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_once_uq" ON "waitlist_entries" USING btree ("customer_user_id","service_id","date") WHERE "waitlist_entries"."status" in ('active','notified');