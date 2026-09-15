-- Adds Spanish/English names to trades, since the app is now bilingual.
-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once — every step below is guarded so it won't
-- error whether this is the first attempt or a retry after a partial failure.

alter table trades add column if not exists name_es text;
alter table trades add column if not exists name_en text;

update trades set name_es = 'Plomería', name_en = 'Plumbing' where slug = 'plumbing';
update trades set name_es = 'Electricidad', name_en = 'Electrical' where slug = 'electrical';
update trades set name_es = 'HVAC / Aire Acondicionado', name_en = 'HVAC / Air Conditioning' where slug = 'hvac-ac';
update trades set name_es = 'Concreto / Albañilería', name_en = 'Concrete / Masonry' where slug = 'concrete-masonry';
update trades set name_es = 'Carpintería', name_en = 'Carpentry' where slug = 'carpentry';
update trades set name_es = 'Techado', name_en = 'Roofing' where slug = 'roofing';
update trades set name_es = 'Pintura', name_en = 'Painting' where slug = 'painting';
update trades set name_es = 'Paisajismo', name_en = 'Landscaping' where slug = 'landscaping';
update trades set name_es = 'Reparación de Electrodomésticos', name_en = 'Appliance Repair' where slug = 'appliance-repair';
update trades set name_es = 'General / No Estoy Seguro', name_en = 'General Handyman / Not Sure' where slug = 'general';

alter table trades alter column name_es set not null;
alter table trades alter column name_en set not null;
alter table trades drop column if exists name;
