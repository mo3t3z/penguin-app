-- OPTIONAL administrative seed; never run from the mobile app. No schema changes.
-- Review the target project before running. Slugs are Penguin identifiers, not official IDs.
-- Sources: https://utm.rnu.tn/utm/fr/universite--contacts
--          https://uma.rnu.tn/fr/article/93/nous-joindre
--          https://utm.rnu.tn/utm/fr/universite--plan-acces
--          https://ensit.rnu.tn/
--          https://pmo.ucar.rnu.tn/web/content/3192?download=true&unique=017eacc282d8208a555a8f16a029bdcb3592724c
--          https://ihec.rnu.tn/fr/contact
--          https://uss.rnu.tn/page/contrat
--          https://www.uj.rnu.tn/fr/universite/accueil
--          https://www.univgb.tn/
begin;
insert into public.institutions (name, slug, country, city) values
  ('Université de Tunis El Manar', 'universite-tunis-el-manar', 'TN', 'Tunis'),
  ('Université de la Manouba', 'universite-la-manouba', 'TN', 'Manouba'),
  ('Université de Sfax', 'universite-sfax', 'TN', 'Sfax'),
  ('Université de Jendouba', 'universite-jendouba', 'TN', 'Jendouba'),
  ('Université de Gabès', 'universite-gabes', 'TN', 'Gabès'),
  ('École Nationale d''Ingénieurs de Tunis', 'ecole-nationale-ingenieurs-tunis', 'TN', 'Tunis'),
  ('École Nationale Supérieure d''Ingénieurs de Tunis', 'ecole-nationale-superieure-ingenieurs-tunis', 'TN', 'Tunis'),
  ('Institut National des Sciences Appliquées et de Technologie', 'institut-national-sciences-appliquees-technologie', 'TN', 'Tunis'),
  ('Institut des Hautes Études Commerciales de Carthage', 'institut-hautes-etudes-commerciales-carthage', 'TN', 'Carthage')
on conflict (slug) do nothing;

insert into public.fields (name, slug) values
  ('Computer Science', 'computer-science'),
  ('Information Systems / Business Computing', 'information-systems-business-computing'),
  ('Engineering', 'engineering'),
  ('Business and Economics', 'business-economics'),
  ('Business Administration', 'business-administration'),
  ('Economics', 'economics'),
  ('Finance and Accounting', 'finance-accounting'),
  ('Data Science', 'data-science'),
  ('Mathematics', 'mathematics'),
  ('Health Sciences', 'health-sciences'),
  ('Law', 'law'),
  ('Arts and Humanities', 'arts-humanities'),
  ('Natural Sciences', 'natural-sciences'),
  ('Languages', 'languages'),
  ('Architecture / Design', 'architecture-design')
on conflict (slug) do nothing;
commit;
