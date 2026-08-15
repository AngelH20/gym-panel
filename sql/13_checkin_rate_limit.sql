-- ============================================================================
-- GIMNASIO - Parche: rate limit del check-in público (Etapa M)
--
-- Corré esto DESPUÉS de 12_reopen_fix.sql.
--
-- El check-in ya está protegido por el QR rotativo (probás estar frente al
-- mostrador) y por RLS, pero nada impedía que alguien con un token vigente
-- scriptee muchos intentos de DNI en esos ~50 segundos de validez, o que
-- alguien inunde /c de pedidos solo para gastar cómputo de Supabase. Este
-- parche agrega un límite por IP: como máximo 12 intentos cada 2 minutos.
--
-- No hace falta un cron para limpiar la tabla: cada chequeo borra de paso
-- los intentos viejos de esa misma IP, así que se autolimita sola.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. checkin_attempts — un renglón por intento. RLS activado y SIN políticas:
--    nadie con la clave anon o un usuario logueado puede leer ni escribir
--    acá directo. Solo entra por check_in_rate_limited(), que es security
--    definer y corre con los privilegios del dueño de la función.
-- ---------------------------------------------------------------------------
create table if not exists checkin_attempts (
  ip           inet not null,
  attempted_at timestamptz not null default now()
);

create index if not exists checkin_attempts_ip_time_idx
  on checkin_attempts (ip, attempted_at desc);

alter table checkin_attempts enable row level security;

comment on table checkin_attempts is
  'Intentos recientes de /c por IP, solo para el rate limit. Se autolimpia en cada chequeo.';


-- ---------------------------------------------------------------------------
-- 2. check_in_rate_limited(ip) — true si esa IP ya gastó su cupo en la
--    ventana. Si no hay IP (ej. desarrollo local sin proxy) deja pasar: no
--    hay forma de limitar lo que no se puede identificar.
-- ---------------------------------------------------------------------------
create or replace function check_in_rate_limited(
  p_ip              inet,
  p_max_attempts    integer default 12,
  p_window_seconds  integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_ip is null then
    return false;
  end if;

  delete from checkin_attempts
   where ip = p_ip
     and attempted_at < now() - (p_window_seconds || ' seconds')::interval;

  select count(*) into v_count
    from checkin_attempts
   where ip = p_ip
     and attempted_at >= now() - (p_window_seconds || ' seconds')::interval;

  if v_count >= p_max_attempts then
    return true;
  end if;

  insert into checkin_attempts (ip) values (p_ip);
  return false;
end;
$$;

comment on function check_in_rate_limited is
  'Cupo por IP para /c: 12 intentos cada 120s por defecto. De paso borra los intentos viejos de esa IP.';

revoke execute on function check_in_rate_limited(inet, integer, integer) from anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. perform_check_in_by_dni — mismo cuerpo de 06_qr_rotating.sql, con el
--    chequeo de rate limit como primer paso (antes de tocar la tabla de
--    socios) y un parámetro nuevo, p_client_ip, para saber a quién limitar.
-- ---------------------------------------------------------------------------
drop function if exists perform_check_in_by_dni(text, checkin_source, text, text);

create or replace function perform_check_in_by_dni(
  p_dni        text,
  p_source     checkin_source default 'qr',
  p_user_agent text default null,
  p_qr_token   text default null,
  p_client_ip  inet default null
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
  -- 0) Rate limit por IP, antes de cualquier otra cosa.
  if check_in_rate_limited(p_client_ip) then
    return jsonb_build_object(
      'ok', false, 'code', 'RATE_LIMITED',
      'message', 'Demasiados intentos seguidos desde este dispositivo. Esperá un minuto y probá de nuevo.'
    );
  end if;

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
  'Check-in por DNI + QR rotativo + rate limit por IP. Primera entrada del día cobra un uso; reingresos el mismo día solo se registran.';

revoke execute on function perform_check_in_by_dni(text, checkin_source, text, text, inet) from anon, authenticated;

-- ============================================================================
-- Probalo:
--   select check_in_rate_limited('1.2.3.4'::inet, 2, 60);  -- false
--   select check_in_rate_limited('1.2.3.4'::inet, 2, 60);  -- false (2do intento, sigue bajo el cupo)
--   select check_in_rate_limited('1.2.3.4'::inet, 2, 60);  -- true  (3er intento, bloqueado)
--
--   select perform_check_in_by_dni('30111222', 'qr', null, null, '9.9.9.9'::inet);
-- ============================================================================
