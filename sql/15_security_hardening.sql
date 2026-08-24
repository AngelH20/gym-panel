-- ============================================================================
-- GIMNASIO - Parche: endurecimiento de seguridad (Etapa L)
--
-- Corré esto DESPUÉS de 14_custom_welcome_message.sql.
--
-- Qué cambia:
--   1) current_qr_token() / current_access_code() ya no caen en un secreto
--      hardcodeado ('fallback-secret', visible en este mismo repo público en
--      GitHub) si a la fila access_secret le pasa algo. Antes, si esa fila
--      faltaba o se borraba, el QR seguía funcionando en apariencia pero
--      quedaba firmado con una clave que cualquiera puede leer en el
--      código fuente — cualquiera podría calcular el token válido sin
--      escanear nada. Ahora, sin secreto configurado, la función revienta
--      en vez de emitir un QR falsificable.
--   2) renew_membership() ahora chequea is_admin() explícitamente, además
--      de la RLS. Es cinturón y tiradores: hoy ya no hay forma de loguearse
--      sin ser admin (signIn() desloguea a quien no esté en la allowlist),
--      pero si el día de mañana se habilita el alta pública de usuarios en
--      el proyecto de Supabase, esta función quedaba como la única que un
--      usuario autenticado no-admin podía invocar igual.
--   3) rotate_access_secret() — botón de pánico. Regenera el secreto que
--      firma el QR y el código de acceso: invalida al instante CUALQUIER
--      QR ya generado, mostrado, impreso o fotografiado, incluso el que
--      está en pantalla en este momento. Pensado para el botón "Invalidar
--      QR ahora" al lado del código QR en /panel/acceso.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. current_qr_token() — sin fallback silencioso.
-- ---------------------------------------------------------------------------
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

  if v_secret is null or length(v_secret) < 16 then
    raise exception 'Falta configurar settings.access_secret (o es demasiado corto). Sin esto el QR no puede firmarse de forma segura.';
  end if;

  select (value #>> '{}')::integer into v_seconds from settings where key = 'qr_rotate_seconds';
  v_seconds := greatest(coalesce(v_seconds, 30), 5);

  v_window := floor(extract(epoch from now()) / v_seconds)::bigint + p_window_offset;

  return encode(
    hmac(('qr:' || v_window::text)::bytea, v_secret::bytea, 'sha256'),
    'hex'
  );
end;
$$;

comment on function current_qr_token is
  'Token del QR de la ventana de tiempo actual. Firmado con settings.access_secret; sin fallback, para que nunca corra con una clave adivinable.';


-- ---------------------------------------------------------------------------
-- 2. current_access_code() — mismo endurecimiento.
-- ---------------------------------------------------------------------------
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
  select value #>> '{}' into v_secret from settings where key = 'access_secret';

  if v_secret is null or length(v_secret) < 16 then
    raise exception 'Falta configurar settings.access_secret (o es demasiado corto). Sin esto el código de acceso no puede firmarse de forma segura.';
  end if;

  select (value #>> '{}')::integer into v_minutes from settings where key = 'access_rotate_minutes';
  v_minutes := greatest(coalesce(v_minutes, 5), 1);

  v_window := floor(extract(epoch from now()) / (v_minutes * 60))::bigint + p_window_offset;

  v_digest := hmac(v_window::text::bytea, v_secret::bytea, 'sha256');

  v_number := (get_byte(v_digest, 0)::bigint << 24)
            + (get_byte(v_digest, 1)::bigint << 16)
            + (get_byte(v_digest, 2)::bigint << 8)
            +  get_byte(v_digest, 3)::bigint;

  return lpad((v_number % 1000000)::text, 6, '0');
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. renew_membership() — is_admin() explícito, además de la RLS.
-- ---------------------------------------------------------------------------
create or replace function renew_membership(
  p_member_id      uuid,
  p_plan_id        uuid,
  p_start          date default null,
  p_uses_override  integer default null
)
returns memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan  plans;
  v_start date;
  v_new   memberships;
begin
  if not is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select * into v_plan from plans where id = p_plan_id;
  if not found then
    raise exception 'El plan indicado no existe';
  end if;

  v_start := coalesce(p_start, gym_local_date(now()));

  update memberships
     set status = 'expired'
   where member_id = p_member_id
     and status = 'active';

  insert into memberships (
    member_id, plan_id, period_start, period_end,
    uses_total, uses_remaining, status, created_by
  )
  values (
    p_member_id,
    p_plan_id,
    v_start,
    v_start + (v_plan.period_days - 1),
    coalesce(p_uses_override, v_plan.uses_per_period),
    coalesce(p_uses_override, v_plan.uses_per_period),
    'active',
    auth.uid()
  )
  returning * into v_new;

  return v_new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 4. rotate_access_secret() — botón de pánico para el admin.
-- ---------------------------------------------------------------------------
create or replace function rotate_access_secret()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  update settings
     set value = to_jsonb(encode(gen_random_bytes(32), 'hex'))
   where key = 'access_secret';
end;
$$;

comment on function rotate_access_secret is
  'Botón de pánico: regenera el secreto de firma del QR/código de acceso. Invalida al instante cualquier QR ya generado, incluso el que está en pantalla.';

revoke execute on function rotate_access_secret() from anon;
grant  execute on function rotate_access_secret() to authenticated;

-- ============================================================================
-- Probalo:
--   select rotate_access_secret();                -- como admin: ok
--   select current_qr_token();                     -- token nuevo, distinto al de antes
--   update settings set value = 'null'::jsonb where key = 'access_secret';
--   select current_qr_token();                      -- ahora explota, en vez de firmar con 'fallback-secret'
--   select rotate_access_secret();                   -- restaura un secreto válido
-- ============================================================================
