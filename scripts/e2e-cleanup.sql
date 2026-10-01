-- Removes data created by the e2e flows (throwaway flow*/invitee* accounts and "E2E Test Service" copies).
-- Runs inside one transaction (see scripts/e2e.mjs); temp tables drop on commit.
create temp table e2e_users on commit drop as select id from users where email like 'flow%@example.com' or email like 'invitee-%@kept.test';
create temp table e2e_appts on commit drop as select id, business_customer_id from appointments where customer_user_id in (select id from e2e_users);
delete from occupancies where appointment_id in (select id from e2e_appts);
delete from appointment_events where appointment_id in (select id from e2e_appts) or actor_user_id in (select id from e2e_users);
delete from promotion_redemptions where appointment_id in (select id from e2e_appts);
delete from messages where appointment_id in (select id from e2e_appts) or conversation_id in (select id from conversations where customer_user_id in (select id from e2e_users));
delete from conversations where customer_user_id in (select id from e2e_users);
delete from payments where appointment_id in (select id from e2e_appts);
delete from appointments where id in (select id from e2e_appts);
delete from business_customers where user_id in (select id from e2e_users);
delete from notifications where user_id in (select id from e2e_users) or href like any (select '%' || id || '%' from e2e_appts);
delete from jobs where status <> 'running' and (payload::text like '%@example.com%' or payload::text like '%invitee-%' or payload::text like any (select '%' || id || '%' from e2e_appts));
delete from business_members where user_id in (select id from e2e_users) or invite_email like 'invitee-%@kept.test';
delete from sessions where user_id in (select id from e2e_users);
delete from auth_tokens where user_id in (select id from e2e_users);
delete from audit_logs where actor_user_id in (select id from e2e_users);
delete from recent_views where user_id in (select id from e2e_users);
delete from users where id in (select id from e2e_users);
delete from service_options where group_id in (select g.id from service_option_groups g join services s on s.id = g.service_id where s.name like 'E2E Test Service%');
delete from service_option_groups where service_id in (select id from services where name like 'E2E Test Service%');
delete from service_staff where service_id in (select id from services where name like 'E2E Test Service%');
delete from service_locations where service_id in (select id from services where name like 'E2E Test Service%');
delete from services where name like 'E2E Test Service%' and not exists (select 1 from appointments a where a.service_id = services.id);
delete from rate_limits;
