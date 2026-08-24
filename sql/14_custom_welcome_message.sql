-- ============================================================================
-- GIMNASIO - Parche: mensaje de bienvenida personalizado por socio
--
-- Corré esto DESPUÉS de 13_checkin_rate_limit.sql.
--
-- Qué cambia:
--   * members.welcome_message: texto opcional. Si un socio lo tiene cargado,
--     se muestra en vez del "¡Bienvenido/a, Nombre! Te quedan N entradas."
--     de siempre cuando escanea su primera entrada del día. Vacío o null
--     = se sigue usando el mensaje genérico.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. members.welcome_message
-- ---------------------------------------------------------------------------
alter table members add column if not exists welcome_message text;

comment on column members.welcome_message is
  'Mensaje de bienvenida personalizado para la pantalla de check-in. Si es null/vacío se usa el genérico.';


-- ---------------------------------------------------------------------------
-- 2. member_overview — sumamos welcome_message al final (ver nota en
--    05_dni_checkin.sql sobre por qué las columnas nuevas van al final).
-- ---------------------------------------------------------------------------
create or replace view member_overview as
select
  m.id,
  m.full_name,
  m.phone,
  m.email,
  m.photo_url,
  m.joined_on,
  m.status                       as member_status,
  m.qr_token,
  ms.id                          as membership_id,
  p.id                           as plan_id,
  p.name                         as plan_name,
  ms.period_start,
  ms.period_end,
  ms.uses_total,
  ms.uses_remaining,

  case
    when m.status = 'suspended'                             then 'suspended'
    when ms.id is null                                      then 'no_membership'
    when ms.period_end < gym_local_date(now())              then 'expired'
    when ms.uses_remaining = 0                               then 'exhausted'
    else 'active'
  end                            as effective_status,

  (ms.period_end - gym_local_date(now()))                   as days_left,

  exists (
    select 1 from check_ins ci
    where ci.member_id = m.id
      and ci.local_date = gym_local_date(now())
  )                              as checked_in_today,

  (select max(ci.checked_in_at) from check_ins ci where ci.member_id = m.id)
                                 as last_check_in_at,

  m.dni,

  (select count(*) from check_ins ci
    where ci.member_id = m.id
      and ci.local_date = gym_local_date(now())
  )                              as visits_today,

  -- Nueva en este parche.
  m.welcome_message
from members m
left join memberships ms
       on ms.member_id = m.id and ms.status = 'active'
left join plans p on p.id = ms.plan_id;

comment on view member_overview is
  'Socio + membresía activa + estado efectivo + movimiento del día + mensaje de bienvenida. Base del listado y las alertas.';


-- ---------------------------------------------------------------------------
-- 3. perform_check_in_by_dni — mismo cuerpo de 13_checkin_rate_limit.sql,
--    solo cambia el mensaje de la primera entrada del día: si el socio
--    tiene welcome_message cargado, se usa ese en vez del genérico.
-- ---------------------------------------------------------------------------
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
  v_message      text;
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

  -- Mensaje de la pantalla de bienvenida: el personalizado del socio si lo
  -- tiene cargado, si no el genérico de siempre.
  v_message := coalesce(
    nullif(trim(v_member.welcome_message), ''),
    '¡Bienvenido/a, ' || split_part(v_member.full_name, ' ', 1) ||
      '! Te quedan ' || v_membership.uses_remaining || ' entradas.'
  );

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
    'message', v_message
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
  'Check-in por DNI + QR rotativo + rate limit por IP + mensaje de bienvenida personalizado. Primera entrada del día cobra un uso; reingresos el mismo día solo se registran.';

revoke execute on function perform_check_in_by_dni(text, checkin_source, text, text, inet) from anon, authenticated;

-- ============================================================================
-- Probalo:
--   update members set welcome_message = 'Bienvenido a CAREF, wachín' where dni = '30111222';
--   select perform_check_in_by_dni('30111222', 'qr', null, null, '9.9.9.9'::inet);  -- usa el mensaje custom
--   update members set welcome_message = null where dni = '30111222';
--   select perform_check_in_by_dni('30111222', 'qr', null, null, '9.9.9.9'::inet);  -- vuelve al genérico
-- ============================================================================
