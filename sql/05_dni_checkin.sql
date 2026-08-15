-- ============================================================================
-- GIMNASIO - Parche: login por DNI + QR fijo + movimiento intradía (Etapa E)
--
-- Corré esto DESPUÉS de 01_schema.sql, 02_seed.sql, 03_access_code.sql y
-- 04_payments.sql.
--
-- Qué cambia:
--   * El check-in deja de depender del link personal del socio (qr_token).
--     Ahora hay UN SOLO QR fijo, impreso en el mostrador, que lleva a /c.
--     Ahí el socio se identifica con su DNI (más el código del mostrador,
--     si está activo).
--   * Un pase cubre el día completo: la primera entrada del día descuenta
--     un uso, como siempre. Las entradas siguientes ese mismo día se
--     REGISTRAN (para saber cuántas veces entró) pero no descuentan nada
--     ni vuelven a validar vencimiento/usos: ya se ganaron el día.
--
-- La columna qr_token de members NO se borra (evita romper nada que la use
-- todavía), pero deja de ser el mecanismo de login. Los tokens quedan huérfanos.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. members.dni — identificador para el login en el kiosco.
--    Nullable a propósito: los socios viejos no lo tienen cargado todavía.
--    Se guarda normalizado (solo dígitos) desde la app.
-- ---------------------------------------------------------------------------
alter table members add column if not exists dni text;

create unique index if not exists members_dni_idx
  on members (dni)
  where dni is not null;

comment on column members.dni is
  'DNI del socio, solo dígitos. Único entre quienes lo tienen cargado. Es la credencial del kiosco /c.';


-- ---------------------------------------------------------------------------
-- 2. check_ins.charged — ¿esta fila descontó un uso del pase?
--    La primera entrada del día es charged = true. Los reingresos del mismo
--    día quedan charged = false: existen para el rastreo de movimiento,
--    nunca para restar entradas.
-- ---------------------------------------------------------------------------
alter table check_ins add column if not exists charged boolean not null default true;

-- Reemplaza el índice viejo: ahora puede haber varias filas por socio y día,
-- pero como máximo UNA con charged = true. Esa es la garantía anti-doble-cobro.
drop index if exists check_ins_one_per_day_idx;

create unique index if not exists check_ins_one_charged_per_day_idx
  on check_ins (member_id, local_date)
  where charged;

comment on column check_ins.charged is
  'true = esta entrada descontó un uso del pase (la primera del día). false = reingreso del mismo día, solo movimiento.';


-- ---------------------------------------------------------------------------
-- 3. member_overview — sumamos dni y visits_today.
-- ---------------------------------------------------------------------------
create or replace view member_overview as
select
  -- OJO: CREATE OR REPLACE VIEW solo permite agregar columnas al final de la
  -- lista, nunca insertarlas en el medio (Postgres lo interpreta como un
  -- rename de la columna que quedó corrida y tira el error 42P16). Por eso
  -- dni y visits_today, que son nuevas en este parche, van al final,
  -- DESPUÉS de last_check_in_at, y no intercaladas con las columnas
  -- originales de 01_schema.sql.
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

  -- Nuevas en este parche: van al final a propósito (ver comentario arriba).
  m.dni,

  (select count(*) from check_ins ci
    where ci.member_id = m.id
      and ci.local_date = gym_local_date(now())
  )                              as visits_today
from members m
left join memberships ms
       on ms.member_id = m.id and ms.status = 'active'
left join plans p on p.id = ms.plan_id;

comment on view member_overview is
  'Socio + membresía activa + estado efectivo + movimiento del día. Base del listado y las alertas.';


-- ---------------------------------------------------------------------------
-- 4. perform_check_in_by_dni — reemplaza perform_check_in(token, ...).
--    Misma garantía transaccional (FOR UPDATE + índice único), pero:
--      a) resuelve al socio por DNI en vez de por token,
--      b) si ya tiene una entrada "charged" hoy, no vuelve a validar pase
--         ni descuenta: solo inserta una fila de movimiento.
-- ---------------------------------------------------------------------------
create or replace function perform_check_in_by_dni(
  p_dni         text,
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

  -- 2) Validar presencia en el local, antes de filtrar cualquier estado del pase.
  select value #>> '{}' into v_mode from settings where key = 'access_mode';

  if coalesce(v_mode, 'off') <> 'off' and not verify_access_code(p_access_code) then
    return jsonb_build_object(
      'ok', false, 'code', 'BAD_ACCESS_CODE',
      'message', 'El código no es correcto. Mirá la pantalla del mostrador y probá de nuevo.'
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
    -- Anti doble-tap: si la última entrada (de cualquier tipo) fue hace
    -- menos de 20 segundos, no sumamos otra fila de movimiento.
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

  -- Cooldown configurable (independiente del anti-doble-tap de arriba).
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
  'Check-in por DNI. Primera entrada del día cobra un uso; reingresos el mismo día solo se registran.';

-- La versión por token queda obsoleta: la borramos.
drop function if exists perform_check_in(text, checkin_source, text, text);

revoke execute on function perform_check_in_by_dni(text, checkin_source, text, text) from anon, authenticated;

-- ============================================================================
-- Probalo:
--   update members set dni = '30111222' where full_name = 'Alguien de prueba';
--   select perform_check_in_by_dni('30111222');                 -- CHECKED_IN
--   select perform_check_in_by_dni('30.111.222');                -- normaliza igual
--   select perform_check_in_by_dni('30111222');                 -- ALREADY_CHECKED_IN (movimiento)
--   select visits_today from member_overview where dni = '30111222';
-- ============================================================================
