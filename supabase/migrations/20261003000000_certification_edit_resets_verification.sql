-- Bug: protect_certification_verified() currently forces
-- new.is_verified := old.is_verified on every authenticated update. That
-- was meant to stop a handyman self-verifying, but it also means the app
-- can never reset is_verified to false when a verified certification is
-- edited -- a verified "Handyman" cert silently stays verified if edited to
-- "Licensed Electrician". Editing a certification should always send it
-- back for review.
create or replace function protect_certification_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' then
    new.is_verified := false;
  end if;
  return new;
end;
$$;
