-- ============================================================================
-- GIMNASIO - Parche: pgcrypto vive en el schema "extensions" (Etapa J)
--
-- Corré esto DESPUÉS de 09_hmac_fix.sql.
--
-- El cast a bytea de 09 estaba bien (por eso cambió el mensaje de error),
-- pero seguía fallando: "function hmac(bytea, bytea, unknown) does not
-- exist". La razón real es que en Supabase pgcrypto se instala en el schema
-- "extensions", no en "public". Nuestras funciones declaran
-- `set search_path = public` a propósito (por seguridad, para que nadie
-- pueda colarles un objeto con el mismo nombre desde otro schema) — pero
-- eso mismo hace invisible a hmac(), que vive afuera de "public".
--
-- La solución NO es sacar el search_path fijo (eso reabriría el problema de
-- seguridad que buscaba evitar). Es agregar "extensions" a la lista.
-- ============================================================================

create or replace function current_qr_token(p_window_offset integer default 0)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_secret  text;
  v_seconds integer;
  v_window  bigint;
begin
  select value #>> '{}' into v_secret from settings where key = 'access_secret';
  select (value #>> '{}')::integer into v_seconds from settings where key = 'qr_rotate_seconds';
  v_seconds := greatest(coalesce(v_seconds, 30), 5);

  v_window := floor(extract(epoch from now()) / v_seconds)::bigint + p_window_offset;

  return encode(
    hmac(
      ('qr:' || v_window::text)::bytea,
      coalesce(v_secret, 'fallback-secret')::bytea,
      'sha256'
    ),
    'hex'
  );
end;
$$;

create or replace function current_access_code(p_window_offset integer default 0)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_secret   text;
  v_minutes  integer;
  v_window   bigint;
  v_digest   bytea;
  v_number   bigint;
begin
  select value #>> '{}' into v_secret  from settings where key = 'access_secret';
  select (value #>> '{}')::integer into v_minutes from settings where key = 'access_rotate_minutes';

  v_minutes := greatest(coalesce(v_minutes, 5), 1);

  v_window := floor(extract(epoch from now()) / (v_minutes * 60))::bigint + p_window_offset;

  v_digest := hmac(v_window::text::bytea, coalesce(v_secret, 'fallback-secret')::bytea, 'sha256');

  v_number := (get_byte(v_digest, 0)::bigint << 24)
            + (get_byte(v_digest, 1)::bigint << 16)
            + (get_byte(v_digest, 2)::bigint << 8)
            +  get_byte(v_digest, 3)::bigint;

  return lpad((v_number % 1000000)::text, 6, '0');
end;
$$;

-- ============================================================================
-- Probalo:
--   select current_qr_token();      -- un hex de 64 caracteres, por fin
--   select current_access_code();   -- 6 dígitos
-- ============================================================================
