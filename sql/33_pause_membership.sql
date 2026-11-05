-- ============================================================================
-- GIMNASIO - Parche: pausar un pase (vacaciones, lesión, viaje)
--
-- Corré esto DESPUÉS de 32_cash_movements.sql.
-- Se puede correr más de una vez: todo es "if not exists" / "or replace".
--
-- Cómo funciona:
--
--   Pausar     El dueño (o el programador) elige la fecha de vuelta, que
--              tiene que ser posterior a hoy y como mucho dentro de 90 días,
--              y un motivo opcional. Los días de pausa (vuelta - hoy) se
--              SUMAN al vencimiento en el momento. El pase sigue 'active':
--              no hay un estado nuevo en la tabla, la pausa es "paused_until
--              es posterior a hoy".
--              Ej.: hoy 05/11, vence el 20/11, vuelve el 15/11 -> 10 días de
--              pausa, el vencimiento pasa al 30/11.
--
--   Durante    El check-in no deja entrar (código PAUSED), ni siquiera como
--              reingreso del mismo día: hoy ya cuenta como día de pausa (se
--              le devolvió en el vencimiento).
--
--   Reanudar   Si vuelve antes, el dueño reanuda: los días que no usó
--              (vuelta - hoy) se RESTAN del vencimiento y paused_until queda
--              en hoy, que es el día en que volvió de verdad.
--              Ej.: el mismo de arriba reanuda el 10/11 -> sobran 5 días, el
--              vencimiento vuelve al 25/11.
--
--   Al volver  Cuando llega la fecha de vuelta la pausa termina sola: no hay
--              cron, todo compara contra gym_local_date(now()).
--
-- Quién pausó, cuándo y por qué queda en el mismo pase (paused_at,
-- paused_by, paused_by_name, pause_reason). Es la última pausa de ese pase:
-- alcanza para responder "¿por qué no puede entrar?".
--
-- Funciones vigentes que se reescriben (partiendo de lo que está en la base,
-- no de los .sql viejos):
--   perform_check_in_by_dni   + chequeo de pausa, después de "suspendido".
--   expire_stale_memberships  no vence por fecha un pase pausado.
--   member_overview           effective_status puede ser 'paused'; columnas
--                             nuevas paused_until e is_paused AL FINAL.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Columnas de la pausa en memberships.
-- ---------------------------------------------------------------------------
alter table memberships add column if not exists paused_at      timestamptz;
alter table memberships add column if not exists paused_until   date;
alter table memberships add column if not exists paused_by      uuid references auth.users(id) on delete set null;
alter table memberships add column if not exists paused_by_name text;
alter table memberships add column if not exists pause_reason   text;

alter table memberships drop constraint if exists memberships_pause_reason_len;
alter table memberships add constraint memberships_pause_reason_len
  check (pause_reason is null or char_length(pause_reason) <= 300);

comment on column memberships.paused_until is
  'Fecha de vuelta de la última pausa. El pase está pausado mientras sea posterior a hoy (gym_local_date). Al reanudar antes, queda en el día en que volvió.';
comment on column memberships.paused_at is 'Cuándo se pausó por última vez.';
comment on column memberships.paused_by is 'Quién pausó (auth.users).';
comment on column memberships.paused_by_name is 'Nombre de quien pausó, por si después se borra la cuenta.';
comment on column memberships.pause_reason is 'Motivo opcional de la pausa (vacaciones, lesión...).';


-- ---------------------------------------------------------------------------
-- 2. pause_membership: pausar hasta una fecha de vuelta.
-- ---------------------------------------------------------------------------
create or replace function pause_membership(
  p_membership_id uuid,
  p_until         date,
  p_reason        text default null
)
returns memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today      date := gym_local_date(now());
  v_membership memberships;
  v_reason     text := nullif(trim(coalesce(p_reason, '')), '');
  v_name       text;
  v_new        memberships;
begin
  if not is_manager() then
    raise exception 'Solo el dueño puede pausar un pase.' using errcode = '42501';
  end if;

  -- Bloqueo la fila: que un check-in o una venta en paralelo no se crucen.
  select * into v_membership from memberships where id = p_membership_id for update;
  if not found then
    raise exception 'El pase indicado no existe.';
  end if;

  if v_membership.status <> 'active' then
    raise exception 'Solo se puede pausar el pase vigente.';
  end if;
  if v_membership.paused_until is not null and v_membership.paused_until > v_today then
    raise exception 'El pase ya está pausado hasta el %.', to_char(v_membership.paused_until, 'DD/MM');
  end if;
  if v_membership.period_end < v_today then
    raise exception 'El pase está vencido: no se puede pausar.';
  end if;
  if v_membership.uses_remaining <= 0 then
    raise exception 'El pase no tiene entradas: no se puede pausar.';
  end if;

  if p_until is null or p_until <= v_today then
    raise exception 'La fecha de vuelta tiene que ser posterior a hoy.';
  end if;
  if p_until > v_today + 90 then
    raise exception 'La pausa puede durar como mucho 90 días.';
  end if;
  if v_reason is not null and char_length(v_reason) > 300 then
    raise exception 'El motivo es demasiado largo (máximo 300 caracteres).';
  end if;

  select coalesce(nullif(trim(a.full_name), ''), a.email) into v_name
  from admins a
  where a.user_id = auth.uid() or a.email = (auth.jwt() ->> 'email')
  limit 1;

  update memberships
     set period_end     = period_end + (p_until - v_today),
         paused_at      = now(),
         paused_until   = p_until,
         paused_by      = auth.uid(),
         paused_by_name = v_name,
         pause_reason   = v_reason
   where id = p_membership_id
  returning * into v_new;

  return v_new;
end;
$$;

revoke all     on function pause_membership(uuid, date, text) from public, anon;
grant  execute on function pause_membership(uuid, date, text) to authenticated;


-- ---------------------------------------------------------------------------
-- 3. resume_membership: volver antes de la fecha de vuelta.
-- ---------------------------------------------------------------------------
create or replace function resume_membership(p_membership_id uuid)
returns memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today      date := gym_local_date(now());
  v_membership memberships;
  v_unused     integer;
  v_new        memberships;
begin
  if not is_manager() then
    raise exception 'Solo el dueño puede reanudar un pase.' using errcode = '42501';
  end if;

  select * into v_membership from memberships where id = p_membership_id for update;
  if not found then
    raise exception 'El pase indicado no existe.';
  end if;

  if v_membership.status <> 'active'
     or v_membership.paused_until is null
     or v_membership.paused_until <= v_today then
    raise exception 'El pase no está pausado.';
  end if;

  -- Los días que no usó de la pausa se descuentan del vencimiento. Nunca
  -- antes del inicio del pase (memberships_period_valid), por si el dueño
  -- corrigió el vencimiento a mano durante la pausa.
  v_unused := v_membership.paused_until - v_today;

  update memberships
     set period_end   = greatest(period_end - v_unused, period_start),
         paused_until = v_today
   where id = p_membership_id
  returning * into v_new;

  return v_new;
end;
$$;

revoke all     on function resume_membership(uuid) from public, anon;
grant  execute on function resume_membership(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 4. Si el pase deja de estar vigente (venta de uno nuevo con
--    renew_membership, baja con archive_member, corrección con
--    set_membership_period_end sobre otro pase), su pausa se cierra.
--    El pase nuevo arranca sin pausa (columnas en null), así que el check-in
--    no lo bloquea; esto evita además que una pausa vieja "reviva" si el
--    dueño después reactiva ese pase viejo a mano.
-- ---------------------------------------------------------------------------
create or replace function close_pause_when_membership_ends()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.paused_until is not null and new.paused_until > gym_local_date(now()) then
    new.paused_until := gym_local_date(now());
  end if;
  return new;
end;
$$;

revoke all on function close_pause_when_membership_ends() from public, anon, authenticated;

drop trigger if exists memberships_close_pause on memberships;
create trigger memberships_close_pause
  before update of status on memberships
  for each row
  when (old.status = 'active' and new.status <> 'active')
  execute function close_pause_when_membership_ends();


-- ---------------------------------------------------------------------------
-- 5. perform_check_in_by_dni: la versión vigente (QR antes del DNI, rate
--    limit) + el chequeo de pausa. Va después de "suspendido" y ANTES del
--    reingreso del día: si lo pausaron hoy, hoy ya es día de pausa (se le
--    sumó al vencimiento) y no vuelve a entrar. Si volvió antes, lo reanudan
--    en el mostrador.
--    La expiración por fecha de más abajo no puede tocar un pase pausado:
--    el chequeo de pausa corta antes.
-- ---------------------------------------------------------------------------
create or replace function perform_check_in_by_dni(
  p_dni        text,
  p_source     checkin_source default 'qr'::checkin_source,
  p_user_agent text default null::text,
  p_qr_token   text default null::text,
  p_client_ip  inet default null::inet
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
  v_is_birthday  boolean;
  v_paused_until date;
  v_dni          text := regexp_replace(coalesce(p_dni, ''), '\D', '', 'g');
begin
  if check_in_rate_limited(p_client_ip) then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED',
      'message', 'Demasiados intentos seguidos desde este dispositivo. Esperá un minuto y probá de nuevo.');
  end if;

  v_today := gym_local_date(v_now);

  select value #>> '{}' into v_mode from settings where key = 'access_mode';
  if coalesce(v_mode, 'off') <> 'off' and not verify_qr_token(p_qr_token) then
    return jsonb_build_object('ok', false, 'code', 'BAD_QR',
      'message', 'Este QR ya no es válido. Volvé a escanear el que está en el mostrador.');
  end if;

  if v_dni = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_DNI',
      'message', 'Ingresá tu DNI para poder entrar.');
  end if;

  select * into v_member from members where dni = v_dni;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'INVALID_DNI',
      'message', 'No encontramos ese DNI. Pasá por el mostrador para que te lo carguen.');
  end if;

  v_is_birthday := v_member.birth_date is not null
    and extract(month from v_member.birth_date) = extract(month from v_today)
    and extract(day from v_member.birth_date) = extract(day from v_today);

  if v_member.status = 'suspended' then
    return jsonb_build_object('ok', false, 'code', 'SUSPENDED',
      'member_name', v_member.full_name,
      'message', 'Tu cuenta está suspendida. Acercate al mostrador.');
  end if;

  -- Pase pausado: no entra, ni siquiera como reingreso del día.
  select ms.paused_until into v_paused_until
  from memberships ms
  where ms.member_id = v_member.id
    and ms.status = 'active'
    and ms.paused_until > v_today
  limit 1;

  if v_paused_until is not null then
    return jsonb_build_object('ok', false, 'code', 'PAUSED',
      'member_name', v_member.full_name, 'photo_url', v_member.photo_url,
      'paused_until', v_paused_until,
      'message', 'Tu pase está pausado hasta el ' || to_char(v_paused_until, 'DD/MM') ||
                 '. Si volviste antes, avisá en el mostrador.');
  end if;

  select * into v_charged_row from check_ins
  where member_id = v_member.id and local_date = v_today and charged limit 1;

  if found then
    select max(checked_in_at) into v_last_at
    from check_ins where member_id = v_member.id and local_date = v_today;

    if v_last_at is not null and v_now - v_last_at < interval '20 seconds' then
      select count(*) into v_visits
      from check_ins where member_id = v_member.id and local_date = v_today;
      return jsonb_build_object('ok', true, 'code', 'ALREADY_CHECKED_IN',
        'member_name', v_member.full_name, 'photo_url', v_member.photo_url,
        'visits_today', v_visits, 'checked_in_at', v_last_at, 'is_birthday', v_is_birthday,
        'message', 'Ya registramos tu entrada. No te descontamos otro uso.');
    end if;

    insert into check_ins (member_id, membership_id, checked_in_at, local_date, source, user_agent, charged)
    values (v_member.id, v_charged_row.membership_id, v_now, v_today, p_source, p_user_agent, false)
    returning id into v_checkin_id;

    select count(*) into v_visits
    from check_ins where member_id = v_member.id and local_date = v_today;

    v_message := 'Bienvenido/a de nuevo, ' || split_part(v_member.full_name, ' ', 1) ||
                 '. Esta es tu entrada n.º ' || v_visits || ' de hoy. No te descontamos otro uso.';
    if v_is_birthday then
      v_message := '🎉 ¡Feliz cumpleaños, ' || split_part(v_member.full_name, ' ', 1) || '! ' || v_message;
    end if;

    return jsonb_build_object('ok', true, 'code', 'ALREADY_CHECKED_IN',
      'member_name', v_member.full_name, 'photo_url', v_member.photo_url,
      'visits_today', v_visits, 'checked_in_at', v_now, 'is_birthday', v_is_birthday,
      'message', v_message);
  end if;

  select * into v_membership from memberships
  where member_id = v_member.id and status = 'active' for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_MEMBERSHIP',
      'member_name', v_member.full_name,
      'message', 'No tenés un pase activo. Pasá por el mostrador para activarlo.');
  end if;

  select * into v_plan from plans where id = v_membership.plan_id;

  if v_membership.period_end < v_today then
    update memberships set status = 'expired' where id = v_membership.id;
    return jsonb_build_object('ok', false, 'code', 'EXPIRED',
      'member_name', v_member.full_name, 'period_end', v_membership.period_end,
      'message', 'Tu pase venció el ' || to_char(v_membership.period_end, 'DD/MM/YYYY') ||
                 '. Renovalo en el mostrador.');
  end if;

  if v_membership.uses_remaining <= 0 then
    return jsonb_build_object('ok', false, 'code', 'NO_USES_LEFT',
      'member_name', v_member.full_name,
      'message', 'Ya usaste las ' || v_membership.uses_total ||
                 ' entradas de tu pase. Renovalo para seguir entrenando.');
  end if;

  select coalesce((value #>> '{}')::integer, 0) into v_cooldown
  from settings where key = 'checkin_cooldown_minutes';

  if coalesce(v_cooldown, 0) > 0 then
    select max(checked_in_at) into v_last_at from check_ins
    where member_id = v_member.id
      and checked_in_at > v_now - (v_cooldown || ' minutes')::interval;
    if v_last_at is not null then
      return jsonb_build_object('ok', false, 'code', 'COOLDOWN',
        'member_name', v_member.full_name,
        'message', 'Registramos una entrada tuya hace muy poco. Esperá unos minutos.');
    end if;
  end if;

  insert into check_ins (member_id, membership_id, checked_in_at, local_date, source, user_agent, charged)
  values (v_member.id, v_membership.id, v_now, v_today, p_source, p_user_agent, true)
  returning id into v_checkin_id;

  update memberships set uses_remaining = uses_remaining - 1
   where id = v_membership.id
  returning * into v_membership;

  if v_membership.uses_remaining = 0 then
    update memberships set status = 'expired' where id = v_membership.id;
  end if;

  v_message := coalesce(
    nullif(trim(v_member.welcome_message), ''),
    '¡Bienvenido/a, ' || split_part(v_member.full_name, ' ', 1) ||
      '! Te quedan ' || v_membership.uses_remaining || ' entradas.'
  );
  if v_is_birthday then
    v_message := '🎉 ¡Feliz cumpleaños, ' || split_part(v_member.full_name, ' ', 1) || '! ' || v_message;
  end if;

  return jsonb_build_object('ok', true, 'code', 'CHECKED_IN',
    'check_in_id', v_checkin_id, 'member_name', v_member.full_name,
    'photo_url', v_member.photo_url, 'plan_name', v_plan.name,
    'uses_remaining', v_membership.uses_remaining, 'uses_total', v_membership.uses_total,
    'period_end', v_membership.period_end, 'visits_today', 1,
    'checked_in_at', v_now, 'is_birthday', v_is_birthday, 'message', v_message);

exception
  when unique_violation then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_CHECKED_IN',
      'message', 'Tu entrada de hoy ya estaba registrada. No te descontamos otro uso.');
end;
$$;

-- Igual que en 29_security_audit.sql: solo la llama el servidor (service_role).
revoke execute on function perform_check_in_by_dni(text, checkin_source, text, text, inet) from public, anon, authenticated;
grant  execute on function perform_check_in_by_dni(text, checkin_source, text, text, inet) to service_role;


-- ---------------------------------------------------------------------------
-- 6. expire_stale_memberships: un pase pausado no se vence. Con la pausa el
--    vencimiento ya quedó después de la fecha de vuelta, así que por fecha
--    no debería pasar; esto cubre el caso de un vencimiento corregido a mano
--    durante la pausa. Cuando la pausa termina, vence normalmente.
-- ---------------------------------------------------------------------------
create or replace function expire_stale_memberships()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := gym_local_date(now());
  v_count integer;
begin
  update memberships
     set status = 'expired'
   where status = 'active'
     and (paused_until is null or paused_until <= v_today)
     and (period_end < v_today or uses_remaining = 0);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function expire_stale_memberships() from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 7. member_overview: la vista vigente + la pausa.
--    - effective_status devuelve 'paused' mientras dure la pausa (antes de
--      'expired' y 'exhausted'): un pausado no es "al día" (no puede entrar),
--      ni "por vencer", ni "vencido".
--    - paused_until e is_paused van AL FINAL: create or replace view no deja
--      reordenar ni sacar columnas.
--    - Sigue siendo security_invoker (la lee el panel con RLS de is_admin()).
-- ---------------------------------------------------------------------------
create or replace view member_overview
with (security_invoker = true)
as
 SELECT m.id,
    m.full_name,
    m.phone,
    m.email,
    m.photo_url,
    m.joined_on,
    m.status AS member_status,
    m.qr_token,
    ms.id AS membership_id,
    p.id AS plan_id,
    p.name AS plan_name,
    ms.period_start,
    ms.period_end,
    ms.uses_total,
    ms.uses_remaining,
        CASE
            WHEN m.status = 'suspended'::member_status THEN 'suspended'::text
            WHEN ms.id IS NULL THEN 'no_membership'::text
            WHEN ms.paused_until > gym_local_date(now()) THEN 'paused'::text
            WHEN ms.period_end < gym_local_date(now()) THEN 'expired'::text
            WHEN ms.uses_remaining = 0 THEN 'exhausted'::text
            ELSE 'active'::text
        END AS effective_status,
    ms.period_end - gym_local_date(now()) AS days_left,
    (EXISTS ( SELECT 1
           FROM check_ins ci
          WHERE ci.member_id = m.id AND ci.local_date = gym_local_date(now()))) AS checked_in_today,
    ( SELECT max(ci.checked_in_at) AS max
           FROM check_ins ci
          WHERE ci.member_id = m.id) AS last_check_in_at,
    m.dni,
    ( SELECT count(*) AS count
           FROM check_ins ci
          WHERE ci.member_id = m.id AND ci.local_date = gym_local_date(now())) AS visits_today,
    m.welcome_message,
    m.birth_date,
    gym_next_birthday(m.birth_date) AS next_birthday,
    gym_next_birthday(m.birth_date) - gym_local_date(now()) AS days_to_birthday,
    gym_next_birthday(m.birth_date) = gym_local_date(now()) AS is_birthday_today,
    m.archived_at,
    m.archived_by_name,
    ms.paused_until,
    coalesce(ms.paused_until > gym_local_date(now()), false) AS is_paused
   FROM members m
     LEFT JOIN memberships ms ON ms.member_id = m.id AND ms.status = 'active'::membership_status
     LEFT JOIN plans p ON p.id = ms.plan_id;
