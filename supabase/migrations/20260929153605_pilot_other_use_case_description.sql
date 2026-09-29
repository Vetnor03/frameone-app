-- Keep historic application rows intact, including any earlier "other" selections.
alter table public.pilot_applications
  add column if not exists use_case_other text;

comment on column public.pilot_applications.use_case_other
  is 'Applicant-provided use-case explanation. Required by the API when use_case is other, otherwise null. Older rows may be null.';
