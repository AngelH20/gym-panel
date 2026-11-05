-- ============================================================================
-- GIMNASIO - Parche: topes de largo (y foto https) también en la base
--
-- Corré esto DESPUÉS de 33_pause_membership.sql.
-- Se puede correr más de una vez: cada constraint se agrega solo si falta.
--
-- Por qué:
--   Los topes de largo de socios, notas de caja, motivos de anulación,
--   planes y cuentas, y la regla de que la foto del socio sea un link
--   https, existían SOLO en las server actions de Next. La RLS deja que
--   cualquier staff (también el profesor) haga UPDATE de members, así que
--   con su sesión y la anon key se podía ir directo a la API de Supabase y
--   saltearse todo: se comprobó (en una transacción con rollback) que un
--   profesor podía guardar un mensaje de bienvenida de 50.000 caracteres,
--   que sale en la pantalla pública del check-in, y una foto
--   "javascript:...".
--
--   Los números son los mismos que ya usa la app (MAX_LEN en
--   app/panel/socios/actions.ts, MAX_TEXT en app/panel/caja/actions.ts,
--   app/panel/planes/actions.ts y app/panel/usuarios/actions.ts), así que
--   nada de lo que hoy se puede cargar desde el panel deja de andar.
--
--   Los datos actuales entran holgados (revisado el 05/11/2026: el texto
--   más largo es un mensaje de bienvenida de 159 caracteres y no hay fotos
--   cargadas). Si algún dato viejo no entrara, el VALIDATE falla y avisa
--   cuál constraint es; el resto queda igual.
-- ============================================================================

do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('members',       'members_full_name_len',       'char_length(full_name) <= 120'),
      ('members',       'members_phone_len',           'phone is null or char_length(phone) <= 40'),
      ('members',       'members_email_len',           'email is null or char_length(email) <= 254'),
      ('members',       'members_photo_url_https',     'photo_url is null or (char_length(photo_url) <= 500 and photo_url ~* ''^https://'')'),
      ('members',       'members_notes_len',           'notes is null or char_length(notes) <= 2000'),
      ('members',       'members_welcome_message_len', 'welcome_message is null or char_length(welcome_message) <= 300'),
      ('cash_openings', 'cash_openings_notes_len',     'notes is null or char_length(notes) <= 500'),
      ('cash_closings', 'cash_closings_notes_len',     'notes is null or char_length(notes) <= 500'),
      ('payments',      'payments_void_reason_len',    'void_reason is null or char_length(void_reason) <= 500'),
      ('plans',         'plans_name_len',              'char_length(name) <= 80'),
      ('plans',         'plans_description_len',       'description is null or char_length(description) <= 500'),
      ('admins',        'admins_full_name_len',        'full_name is null or char_length(full_name) <= 120')
    ) as t(tbl, name, expr)
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = c.name and conrelid = format('public.%I', c.tbl)::regclass
    ) then
      -- NOT VALID + VALIDATE: el chequeo de las filas existentes no bloquea
      -- escrituras mientras corre (tablas chicas, pero no cuesta nada).
      execute format('alter table public.%I add constraint %I check (%s) not valid', c.tbl, c.name, c.expr);
      execute format('alter table public.%I validate constraint %I', c.tbl, c.name);
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Probalo (con una sesión de staff, o en el SQL Editor con rollback):
--
--   begin;
--   update members set welcome_message = repeat('a', 301)
--    where id = (select id from members limit 1);   -- error: members_welcome_message_len
--   rollback;
--
--   begin;
--   update members set photo_url = 'javascript:alert(1)'
--    where id = (select id from members limit 1);   -- error: members_photo_url_https
--   rollback;
-- ----------------------------------------------------------------------------
