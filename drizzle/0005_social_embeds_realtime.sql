CREATE TABLE "social_embeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"provider_id" text NOT NULL,
	"url" text NOT NULL,
	"caption" text,
	"service_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_embeds_provider_ck" CHECK ("social_embeds"."provider" in ('youtube', 'tiktok', 'instagram', 'vimeo', 'soundcloud', 'spotify')),
	CONSTRAINT "social_embeds_caption_ck" CHECK (char_length("social_embeds"."caption") <= 200)
);
--> statement-breakpoint
ALTER TABLE "social_embeds" ADD CONSTRAINT "social_embeds_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_embeds" ADD CONSTRAINT "social_embeds_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "social_embeds_item_uq" ON "social_embeds" USING btree ("business_id","provider","provider_id");--> statement-breakpoint
CREATE INDEX "social_embeds_business_id_sort_order_index" ON "social_embeds" USING btree ("business_id","sort_order");--> statement-breakpoint
-- Realtime: small pg_notify payloads on channel "kept_events" (ids only; delivered on commit).
-- The app keeps one LISTEN connection per process and fans events out to authorized SSE clients.
CREATE OR REPLACE FUNCTION kept_notify_appointment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.starts_at = OLD.starts_at
    AND NEW.ends_at = OLD.ends_at
    AND NEW.member_id IS NOT DISTINCT FROM OLD.member_id
    AND NEW.payment_status IS NOT DISTINCT FROM OLD.payment_status THEN
    RETURN NULL;
  END IF;
  PERFORM pg_notify('kept_events', json_build_object(
    'k', 'appt', 'id', NEW.id, 'b', NEW.business_id, 'm', NEW.member_id, 'u', NEW.customer_user_id,
    'pm', CASE WHEN TG_OP = 'UPDATE' AND OLD.member_id IS DISTINCT FROM NEW.member_id THEN OLD.member_id END
  )::text);
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE TRIGGER "appointments_realtime" AFTER INSERT OR UPDATE ON "appointments" FOR EACH ROW EXECUTE FUNCTION kept_notify_appointment();--> statement-breakpoint
CREATE OR REPLACE FUNCTION kept_notify_message() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE conv record;
BEGIN
  SELECT business_id, customer_user_id INTO conv FROM conversations WHERE id = NEW.conversation_id;
  IF FOUND THEN
    PERFORM pg_notify('kept_events', json_build_object(
      'k', 'msg', 'id', NEW.id, 'c', NEW.conversation_id, 'b', conv.business_id, 'u', conv.customer_user_id, 'r', NEW.sender_role
    )::text);
  END IF;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE TRIGGER "messages_realtime" AFTER INSERT ON "messages" FOR EACH ROW EXECUTE FUNCTION kept_notify_message();--> statement-breakpoint
CREATE OR REPLACE FUNCTION kept_notify_conversation_read() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.customer_last_read_at IS DISTINCT FROM OLD.customer_last_read_at OR NEW.business_last_read_at IS DISTINCT FROM OLD.business_last_read_at THEN
    PERFORM pg_notify('kept_events', json_build_object('k', 'read', 'id', NEW.id, 'b', NEW.business_id, 'u', NEW.customer_user_id)::text);
  END IF;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE TRIGGER "conversations_read_realtime" AFTER UPDATE OF "customer_last_read_at", "business_last_read_at" ON "conversations" FOR EACH ROW EXECUTE FUNCTION kept_notify_conversation_read();--> statement-breakpoint
CREATE OR REPLACE FUNCTION kept_notify_notification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('kept_events', json_build_object('k', 'ntf', 'id', NEW.id, 'u', NEW.user_id)::text);
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE TRIGGER "notifications_realtime" AFTER INSERT ON "notifications" FOR EACH ROW EXECUTE FUNCTION kept_notify_notification();
