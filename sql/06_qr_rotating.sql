-- ============================================================================
-- GIMNASIO - Parche: QR rotativo (Etapa F)
--
-- Corré esto DESPUÉS de 05_dni_checkin.sql.
--
-- Problema que resuelve: el QR fijo de /panel/acceso, si queda impreso en
-- papel o como imagen quieta en una pantalla, se puede fotografiar y usar
-- desde cualquier lado. La pantalla de /panel/acceso deja de mostrar un QR
-- estático: ahora muestra SOLO un QR que cambia cada 40 segundos (reusando
-- el mismo secreto que ya usa el código rotativo de 03_access_code.sql).
-- Escanearlo prueba que estás mirando la pantalla del mostrador en este
-- momento. El destino sigue siendo siempre el mismo: /c, donde el socio
-- pone su DNI.
--
-- El PIN fijo y el código rotativo tipeado a mano (03_access_code.sql)
-- quedan en la base sin usar: no se borran por si el día de mañana hace
-- falta un modo de respaldo, pero el panel ya no los muestra.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Configuración: cada cuántos segundos rota el QR.
-- ---------------------------------------------------------------------------
insert into settings (key, value) values
  ('qr_rotate_seconds', '30'::jsonb)
on conflict (key) do nothing;


-- ---------------------------------------------------------------------------
-- 2. current_qr_token(offset) — mismo mecanismo que current_access_code(),
--    pero con ventana en segundos (no minutos) y devolviendo el hex del
--    HMAC completo en vez de reducirlo a 6 dígitos: nadie lo tipea, así que
--    no hace falta que sea corto, y más largo es más difícil de adivinar.
-- ---------------------------------------------------------------------------
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
  select value #>> '{}' into v_secret from settings where key = 'access_secret';
  select (value #>> '{}')::integer into v_seconds from settings where key = 'qr_rotate_seconds';
  v_seconds := greatest(coalesce(v_seconds, 40), 5);

  v_window := floor(extract(epoch from now()) / v_seconds)::bigint + p_window_offset;

  return encode(hmac('qr:' || v_window::text, coalesce(v_secret, 'fallback-secret'), 'sha256'), 'hex');
end;
$$;

comment on function current_qr_token is
  'Token del QR de la ventana de tiempo actual. Se codifica en la URL de /c, nunca se tipea.';


-- ---------------------------------------------------------------------------
-- 3. Segundos que le quedan al QR actual, para la barra de progreso.
-- ---------------------------------------------------------------------------
create or replace function qr_token_seconds_left()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_seconds integer;
begin
  select (value #>> '{}')::integer into v_seconds from settings where key = 'qr_rotate_seconds';
  v_seconds := greatest(coalesce(v_seconds, 40), 5);
  return v_seconds - (floor(extract(epoch from now()))::integer % v_seconds);
end;
$$;


-- ---------------------------------------------------------------------------
-- 4. verify_qr_token — acepta la ventana actual y las 4 anteriores (hasta
--    ~2.5 minutos de margen con qr_rotate_seconds=30): el tiempo entre
--    escanear, que cargue la página y tipear el DNI no es instantáneo, y no
--    queremos que alguien se quede afuera por tipear lento o por una carga
--    lenta. Sigue siendo mucho más ajustado que una foto vieja del QR.
-- ---------------------------------------------------------------------------
create or replace function verify_qr_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_token is not null and p_token in (
    current_qr_token(0), current_qr_token(-1), current_qr_token(-2),
    current_qr_token(-3), current_qr_token(-4)
  );
$$;


-- ---------------------------------------------------------------------------
-- 5. perform_check_in_by_dni — reemplaza la validación de p_access_code
--    (código tipeado a mano) por p_qr_token (viaja oculto en el form,
--    tomado de la URL con la que se escaneó el QR). Misma idea de fondo:
--    "off" en access_mode sigue salteando la validación, para poder probar
--    sin tener la pantalla del mostrador abierta.
-- ---------------------------------------------------------------------------
drop function if exists perform_check_in_by_dni(text, checkin_source, text, text);

create or replace function perform_check_in_by_dni(
  p_dni        text,
  p_source     checkin_source default 'qr',
  p_user_agent text default null,
  p_qr_token   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member       members;
  v_membership   memberships;
  v_plan         plans;
  v_today        date;
  v_now          timestamptz := now();
  v_mode         text;
  v_cooldown     integer;
  v_last_at      timestamptz;
  v_checkin_id   uuid;
  v_charged_row  check_ins;
  v_visits       integer;
  v_dni          text := regexp_replace(coalesce(p_dni, ''), '\D', '', 'g');
begin
  v_today := gym_local_date(v_now);

  if v_dni = '' then
    return jsonb_build_object(
      'ok', false, 'code', 'INVALID_DNI',
      'message', 'Ingresá tu DNI para poder entrar.'
    );
  end if;

  -- 1) Resolver el socio por DNI.
  select * into v_member from members where dni = v_dni;

  if not found then
    return jsonb_build_object(
      'ok', false, 'code', 'INVALID_DNI',
      'message', 'No encontramos ese DNI. Pasá por el mostrador para que te lo carguen.'
    );
  end if;

  -- 2) Validar que el QR escaneado esté vigente, antes de filtrar cualquier
  --    estado del pase.
  select value #>> '{}' into v_mode from settings where key = 'access_mode';

  if coalesce(v_mode, 'off') <> 'off' and not verify_qr_token(p_qr_token) then
    return jsonb_build_object(
      'ok', false, 'code', 'BAD_QR',
      'message', 'Este QR ya no es válido. Volvé a escanear el que está en el mostrador.'
    );
  end if;

  -- 3) Socio suspendido: bloquea siempre, incluso si ya entró hoy.
  if v_member.status = 'suspended' then
    return jsonb_build_object(
      'ok', false, 'code', 'SUSPENDED',
      'member_name', v_member.full_name,
      'message', 'Tu cuenta está suspendida. Acercate al mostrador.'
    );
  end if;

  -- 4) ¿Ya se ganó el día? Buscamos la entrada que cobró el uso hoy.
  select * into v_charged_row
  from check_ins
  where member_id = v_member.id and local_date = v_today and charged
  limit 1;

  if found then
    select max(checked_in_at) into v_last_at
    from check_ins where member_id = v_member.id and local_date = v_today;

    if v_last_at is not null and v_now - v_last_at < interval '20 seconds' then
      select count(*) into v_visits
      from check_ins where member_id = v_member.id and local_date = v_today;

      return jsonb_build_object(
        'ok', true, 'code', 'ALREADY_CHECKED_IN',
        'member_name', v_member.full_name,
        'photo_url', v_member.photo_url,
        'visits_today', v_visits,
        'checked_in_at', v_last_at,
        'message', 'Ya registramos tu entrada. No te descontamos otro uso.'
      );
    end if;

    insert into check_ins (member_id, membership_id, checked_in_at, local_date, source, user_agent, charged)
    values (v_member.id, v_charged_row.membership_id, v_now, v_today, p_source, p_user_agent, false)
    returning id into v_checkin_id;

    select count(*) into v_visits
    from check_ins where member_id = v_member.id and local_date = v_today;

    return jsonb_build_object(
      'ok', true, 'code', 'ALREADY_CHECKED_IN',
      'member_name', v_member.full_name,
      'photo_url', v_member.photo_url,
      'visits_today', v_visits,
      'checked_in_at', v_now,
      'message', 'Bienvenido/a de nuevo, ' || split_part(v_member.full_name, ' ', 1) ||
                 '. Esta es tu entrada n.º ' || v_visits || ' de hoy. No te descontamos otro uso.'
    );
  end if;

  -- 5) Primera entrada del día: se valida todo como antes.
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

  if v_membership.uses_remaining <= 0 then
    return jsonb_build_object(
      'ok', false, 'code', 'NO_USES_LEFT',
      'member_name', v_member.full_name,
      'message', 'Ya usaste las ' || v_membership.uses_total ||
                 ' entradas de tu pase. Renovalo para seguir entrenando.'
    );
  end if;

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

  insert into check_ins (member_id, membership_id, checked_in_at, local_date, source, user_agent, charged)
  values (v_member.id, v_membership.id, v_now, v_today, p_source, p_user_agent, true)
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
    'visits_today', 1,
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

comment on function perform_check_in_by_dni is
  'Check-in por DNI + QR rotativo. Primera entrada del día cobra un uso; reingresos el mismo día solo se registran.';

revoke execute on function perform_check_in_by_dni(text, checkin_source, text, text) from anon, authenticated;
revoke execute on function current_qr_token(integer) from anon;
revoke execute on function qr_token_seconds_left()  from anon;
grant  execute on function current_qr_token(integer) to authenticated;
grant  execute on function qr_token_seconds_left()  to authenticated;

-- ============================================================================
-- Probalo:
--   select current_qr_token(), qr_token_seconds_left();
--   select verify_qr_token(current_qr_token());   -- true
--   select verify_qr_token('lo que sea');          -- false
--
-- Para desarrollar sin tener la pantalla del mostrador abierta:
--   update settings set value = '"off"' where key = 'access_mode';
-- ============================================================================
