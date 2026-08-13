-- Reference data only.  Auth-linked profiles and user content are created by
-- the application after signup, so this seed is safe to run in every project.

insert into public.sports (id, slug, name, description)
values
  ('11111111-1111-4111-8111-111111111111', 'ski', 'Ski', 'Skis, boots, bindings, apparel, and accessories.'),
  ('22222222-2222-4222-8222-222222222222', 'hockey', 'Hockey', 'Ice, street, and roller hockey equipment.')
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    is_active = true,
    updated_at = now();
