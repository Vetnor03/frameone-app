-- Keep historical age confirmations, but no age attestation is collected in the public signup.
-- Confirm adult borrower or legal guardian when an applicant is selected for a physical loan.
alter table public.pilot_applications
  alter column age_confirmed drop not null;

alter table public.pilot_applications
  add column if not exists follow_up_interview_opt_in boolean not null default false;

comment on column public.pilot_applications.age_confirmed is
  'Legacy confirmation, nullable because adult or guardian eligibility is reviewed before any physical loan.';
