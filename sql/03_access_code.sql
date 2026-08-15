-- ============================================================================
-- GIMNASIO - Parche: validación de presencia en el gimnasio
--
-- Corré esto DESPUÉS de 01_schema.sql.
--
-- Problema que resuelve: si el link del socio alcanza por sí solo, el socio
-- puede registrar su entrada desde la casa. Necesitamos exigir algo que solo
-- exista físicamente en el local.
--
-- Dos modos, configurables desde el panel:
--   'off'      -> sin validación (útil para probar)
--   'pin'      -> PIN fijo que el admin cambia a mano y anota en un pizarrón
--   'rotating' -> código de 6 dígitos que cambia cada N minutos, mostrado en
--                 una pantalla en el mostrador. No se puede compartir.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Configuración
-- ---------------------------------------------------------------------------
insert into settings (key, value) values
  ('access_mode',            '"rotating"'::jsonb),
  ('access_pin',             '"1234"'::jsonb),
  ('access_rotate_minutes',  '5'::jsonb),
  -- Secreto para derivar el código rotativo. Se genera una sola vez.
  ('access_secret',          to_jsonb(encode(gen_random_bytes(32), 'hex')))
on conflict (key) do nothing;


-- ---------------------------------------------------------------------------
-- 2. current_access_code(offset)
--    Deriva un código de 6 dígitos determinístico a partir del secreto y de
--    la ventana de tiempo actual. No hace falta guardar el código en ninguna
--    parte ni sincronizar relojes entre dispositivos: cualquier cliente que
--    consulte la base obtiene el mismo número.
--
--    p_window_offset = 0 -> ventana actual
--    p_window_offset = -1 -> ventana anterior (se acepta como tolerancia)
-- ---------------------------------------------------------------------------
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

  -- Ventana temporal: cuántos bloques de N minutos pasaron desde epoch.
  v_window := floor(extract(epoch from now()) / (v_minutes * 60))::bigint + p_window_offset;

  v_digest := hmac(v_window::text, coalesce(v_secret, 'fallback-secret'), 'sha256');

  -- Tomamos 4 bytes del digest y los reducimos a 6 dígitos.
  v_number := (get_byte(v_digest, 0)::bigint << 24)
            + (get_byte(v_digest, 1)::bigint << 16)
            + (get_byte(v_digest, 2)::bigint << 8)
            +  get_byte(v_digest, 3)::bigint;

  return lpad((v_number % 1000000)::text, 6, '0');
end;
$$;

comment on function current_access_code is
  'Código de acceso de 6 dígitos para la ventana de tiempo actual. Mostrarlo en el mostrador.';


-- ---------------------------------------------------------------------------
-- 3. Segundos que le quedan al código actual.
--    Sirve para dibujar la barra de progreso en la pantalla del mostrador.
-- ---------------------------------------------------------------------------
create or replace function access_code_seconds_left()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_minutes integer;
  v_period  integer;
begin
  select (value #>> '{}')::integer into v_minutes from settings where key = 'access_rotate_minutes';
  v_period := greatest(coalesce(v_minutes, 5), 1) * 60;
  return v_period - (floor(extract(epoch from now()))::integer % v_period);
end;
$$;


-- ---------------------------------------------------------------------------
-- 4. verify_access_code — valida lo que tipeó el socio
-- ---------------------------------------------------------------------------
create or replace function verify_access_code(p_code text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mode text;
  v_pin  text;
  v_code text := regexp_replace(coalesce(p_code, ''), '\s', '', 'g');
begin
  select value #>> '{}' into v_mode from settings where key = 'access_mode';

  if coalesce(v_mode, 'off') = 'off' then
    return true;
  end if;

  if v_mode = 'pin' then
    select value #>> '{}' into v_pin from settings where key = 'access_pin';
    return v_code = coalesce(v_pin, '');
  end if;

  -- rotating: aceptamos la ventana actual y la anterior, para que nadie quede
  -- afuera por tipear justo cuando el código cambia.
  return v_code = current_access_code(0)
      or v_code = current_access_code(-1);
end;
$$;


-- ---------------------------------------------------------------------------
-- 5. perform_check_in con validación de código
--    Reemplaza la versión de 01_schema.sql. La lógica transaccional es
--    idéntica; solo se agrega el chequeo del código antes de escribir nada.
-- ---------------------------------------------------------------------------
create or replace function perform_check_in(
  p_qr_token    text,
  p_source      checkin_source default 'qr',
  p_user_agent  text default null,
  p_access_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member      members;
  v_membership  memberships;
  v_plan        plans;
  v_today       date;
  v_now         timestamptz := now();
  v_mode        text;
  v_cooldown    integer;
  v_last_at     timestamptz;
  v_checkin_id  uuid;
begin
  v_today := gym_local_date(v_now);

  -- 1) Resolver el socio.
  select * into v_member from members where qr_token = p_qr_token;

  if not found then
    return jsonb_build_object(
      'ok', false, 'code', 'INVALID_TOKEN',
      'message', 'Código QR inválido. Pedile al staff que te genere uno nuevo.'
    );
  end if;

  -- 2) Validar presencia en el local. Se chequea ANTES de todo lo demás para
  --    no filtrar el estado del pase de un socio a quien no está en el local.
  select value #>> '{}' into v_mode from settings where key = 'access_mode';

  if coalesce(v_mode, 'off') <> 'off' and not verify_access_code(p_access_code) then
    return jsonb_build_object(
      'ok', false, 'code', 'BAD_ACCESS_CODE',
      'message', 'El código no es correcto. Mirá la pantalla del mostrador y probá de nuevo.'
    );
  end if;

  -- 3) Socio suspendido.
  if v_member.status = 'suspended' then
    return jsonb_build_object(
      'ok', false, 'code', 'SUSPENDED',
      'member_name', v_member.full_name,
      'message', 'Tu cuenta está suspendida. Acercate al mostrador.'
    );
  end if;

  -- 4) Membresía activa CON BLOQUEO DE FILA (serializa scans concurrentes).
  select * into v_membership
  from memberships
  where member_id = v_member.id and status = 'active'
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false, 'code', 'NO_MEMBERSHIP',
      'member_name', v_member.full_name,
      'message', 'No tenés un pase activo. Pasá por el mostrador para activarlo.'
    );
  end if;

  select * into v_plan from plans where id = v_membership.plan_id;

  -- 5) Vencido por fecha.
  if v_membership.period_end < v_today then
    update memberships set status = 'expired' where id = v_membership.id;
    return jsonb_build_object(
      'ok', false, 'code', 'EXPIRED',
      'member_name', v_member.full_name,
      'period_end', v_membership.period_end,
      'message', 'Tu pase venció el ' || to_char(v_membership.period_end, 'DD/MM/YYYY') ||
                 '. Renovalo en el mostrador.'
    );
  end if;

  -- 6) Sin usos.
  if v_membership.uses_remaining <= 0 then
    return jsonb_build_object(
      'ok', false, 'code', 'NO_USES_LEFT',
      'member_name', v_member.full_name,
      'message', 'Ya usaste las ' || v_membership.uses_total ||
                 ' entradas de tu pase. Renovalo para seguir entrenando.'
    );
  end if;

  -- 7) ¿Ya entró hoy?
  select max(checked_in_at) into v_last_at
  from check_ins where member_id = v_member.id and local_date = v_today;

  if v_last_at is not null then
    return jsonb_build_object(
      'ok', true, 'code', 'ALREADY_CHECKED_IN',
      'member_name', v_member.full_name,
      'uses_remaining', v_membership.uses_remaining,
      'uses_total', v_membership.uses_total,
      'checked_in_at', v_last_at,
      'message', 'Ya registramos tu entrada hoy a las ' ||
                 to_char(v_last_at at time zone gym_timezone(), 'HH24:MI') ||
                 '. No te descontamos otro uso.'
    );
  end if;

  -- 8) Cooldown configurable.
  select coalesce((value #>> '{}')::integer, 0) into v_cooldown
  from settings where key = 'checkin_cooldown_minutes';

  if coalesce(v_cooldown, 0) > 0 then
    select max(checked_in_at) into v_last_at
    from check_ins
    where member_id = v_member.id
      and checked_in_at > v_now - (v_cooldown || ' minutes')::interval;

    if v_last_at is not null then
      return jsonb_build_object(
        'ok', false, 'code', 'COOLDOWN',
        'member_name', v_member.full_name,
        'message', 'Registramos una entrada tuya hace muy poco. Esperá unos minutos.'
      );
    end if;
  end if;

  -- 9) Registrar y descontar, misma transacción.
  insert into check_ins (member_id, membership_id, checked_in_at, local_date, source, user_agent)
  values (v_member.id, v_membership.id, v_now, v_today, p_source, p_user_agent)
  returning id into v_checkin_id;

  update memberships
     set uses_remaining = uses_remaining - 1
   where id = v_membership.id
  returning * into v_membership;

  if v_membership.uses_remaining = 0 then
    update memberships set status = 'expired' where id = v_membership.id;
  end if;

  return jsonb_build_object(
    'ok', true, 'code', 'CHECKED_IN',
    'check_in_id', v_checkin_id,
    'member_name', v_member.full_name,
    'photo_url', v_member.photo_url,
    'plan_name', v_plan.name,
    'uses_remaining', v_membership.uses_remaining,
    'uses_total', v_membership.uses_total,
    'period_end', v_membership.period_end,
    'checked_in_at', v_now,
    'message', '¡Bienvenido/a, ' || split_part(v_member.full_name, ' ', 1) ||
               '! Te quedan ' || v_membership.uses_remaining || ' entradas.'
  );

exception
  when unique_violation then
    return jsonb_build_object(
      'ok', true, 'code', 'ALREADY_CHECKED_IN',
      'message', 'Tu entrada de hoy ya estaba registrada. No te descontamos otro uso.'
    );
end;
$$;

-- La versión vieja de 3 parámetros queda huérfana: la borramos.
drop function if exists perform_check_in(text, checkin_source, text);

-- Solo el servidor (service_role) puede invocar el check-in.
revoke execute on function perform_check_in(text, checkin_source, text, text) from anon, authenticated;
revoke execute on function current_access_code(integer)      from anon;
revoke execute on function verify_access_code(text)          from anon;
revoke execute on function access_code_seconds_left()        from anon;
grant  execute on function current_access_code(integer)      to authenticated;
grant  execute on function access_code_seconds_left()        to authenticated;

-- ============================================================================
-- Probalo:
--   select current_access_code(), access_code_seconds_left();
--   select verify_access_code(current_access_code());   -- true
--   select verify_access_code('000000');                -- false (casi seguro)
--
-- Para desactivar la validación mientras desarrollás:
--   update settings set value = '"off"' where key = 'access_mode';
-- ============================================================================
