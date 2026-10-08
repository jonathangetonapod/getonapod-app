-- Fix: allow deleting clients by cascading to onboarding_sessions
-- The existing foreign key prevents client deletion when an onboarding session references it

alter table onboarding_sessions
  drop constraint onboarding_sessions_client_id_fkey,
  add constraint onboarding_sessions_client_id_fkey
    foreign key (client_id) references clients(id) on delete set null;
