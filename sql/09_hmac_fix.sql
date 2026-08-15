-- ============================================================================
-- GIMNASIO - Parche: fix de hmac() con argumentos de texto (Etapa I)
--
-- Corré esto DESPUÉS de 08_qr_grace.sql.
--
-- Bug real encontrado al fin: pgcrypto en este Postgres no tiene la
-- sobrecarga hmac(text, text, text) — solo hmac(bytea, bytea, text). Como
-- Postgres no convierte text a bytea de forma implícita, current_qr_token()
-- (y su hermana current_access_code(), que tiene el mismo problema y nunca
-- se llegó a probar) fallaban SIEMPRE con:
--   "function hmac(text, text, unknown) does not exist"
--
-- Por eso el QR salía con el token vacío (?t=) y el check-in lo rechazaba:
-- no es que el QR estuviera vencido, es que nunca hubo un token real.
-- ============================================================================
create or replace function current_qr_token(p_window_offset integer default 0)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_secret  text;
  v_seconds integer;
  v_window  bigint;
begin
  select value #>> '{}' into v_secret from settings where key = 'access_asecret';
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

-- Mismo fix en current_access_code(), que tiene el bug idéntico (dormida
-- desde que access_mode dejó de usar el código tipeado a mano, pero mejor
-- dejarla andando por si se vuelve a necesitar).
create or replace function current_access_code(p_window_offset integer default 0)
returns text
language plpgsql
stable
security definer
set search_path = public
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
--   select current_qr_token();      -- antes: error. ahora: un hex de 64 caracteres
--   select current_access_code();   -- antes: error. ahora: 6 dígitos
-- ============================================================================
