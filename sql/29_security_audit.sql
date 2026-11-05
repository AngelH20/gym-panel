-- ============================================================================
-- GIMNASIO - Parche: auditoría de seguridad (Etapa Y)
--
-- Corré esto DESPUÉS de 28_roles_programador_dueno.sql.
-- Hacé un backup antes (como siempre). Es idempotente: se puede correr más
-- de una vez sin romper nada. Va todo dentro de una transacción: o entra
-- entero o no entra nada (importante por el punto 1, que mueve el secreto
-- del QR).
--
-- No toca ninguna policy de RLS, así que no se pisa con
-- 30_performance.sql (que reescribe las policies de lectura).
--
-- Qué cambia y por qué:
--
--   1) El secreto que firma el QR (settings.access_secret) se muda a una
--      tabla en un schema "private" que la API no expone. Hoy la policy
--      settings_select deja leer TODA la tabla settings a cualquier staff:
--      un profesor podía hacer GET /rest/v1/settings y llevarse el secreto,
--      y con eso calcular el QR de cualquier minuto (hoy, mañana, el mes que
--      viene) sin estar en el gimnasio. El secreto conserva su valor: los
--      QR que estén en pantalla siguen andando sin cortes.
--
--   2) current_qr_token() ahora exige ser staff y solo calcula la ventana
--      actual o la próxima (offset 0 o 1, lo único que usa la app). Antes
--      cualquier usuario logueado en Supabase Auth, aunque no estuviera en
--      admins, podía pedir el QR de cualquier ventana futura.
--
--   3) Funciones que la app no llama y que un usuario logueado podía
--      invocar directo por /rest/v1/rpc/...:
--        * renew_membership(): un profesor podía darle a cualquier socio un
--          pase activo con las entradas y la fecha que quisiera SIN cobro en
--          la caja (la venta de verdad es sell_membership_split, que la
--          sigue llamando por dentro).
--        * sell_membership() (envoltorio viejo), verify_qr_token(),
--          current_access_code(), verify_access_code(),
--          access_code_seconds_left() (el código de 6 dígitos ya no se
--          usa), expire_stale_memberships() y family_size().
--
--   4) sell_membership_split(): chequea staff de entrada, rechaza fechas de
--      inicio futuras (un pase "que arranca en 2030" dura hasta 2030) y deja
--      cambiar la cantidad de entradas (p_uses_override) solo a dueño o
--      programador. La app ya no manda fechas futuras ni override al vender.
--
--   5) members: archive_member()/unarchive_member() exigen dueño, pero la
--      policy members_update (is_admin) dejaba a un profesor hacer
--      PATCH /rest/v1/members?id=... {"archived_at": null} y reactivar (o
--      dar de baja) a un socio salteándose esa regla. Un trigger lo frena.
--
--   6) perform_check_in_by_dni(): valida el QR ANTES de buscar el DNI.
--      Antes, sin QR (o con uno vencido), la respuesta ya distinguía "No
--      encontramos ese DNI" de "QR no válido": desde cualquier lado se podía
--      averiguar qué DNI son socios del gimnasio. Ahora sin QR vigente la
--      respuesta es siempre BAD_QR.
--
--   7) Permisos de tablas: anon no usa ninguna tabla (el check-in va con la
--      service_role y el panel con sesión), pero seguía teniendo todos los
--      permisos y solo lo frenaba la RLS. Se los sacamos, y también
--      TRUNCATE / REFERENCES / TRIGGER a authenticated (TRUNCATE no pasa
--      por RLS). checkin_attempts queda solo para las funciones.
--
--   8) search_path fijo en touch_updated_at() y gym_next_birthday() (aviso
--      del linter de Supabase). gym_local_date() y gym_timezone() quedan como
--      están a propósito: son funciones SQL chicas que Postgres "inlinea"
--      dentro de member_overview, y un SET search_path lo impide (se
--      pagaría en cada consulta). Ni anon ni authenticated pueden crear
--      objetos en public, así que no hay forma de secuestrarles el
--      search_path.
--
--   9) Schema backups: ya estaba cerrado; se reafirma por las dudas.
--
-- Lo que la app sigue usando, sin cambios de firma: current_qr_token(int),
-- qr_token_seconds_left(), rotate_access_secret(), sell_membership_split(...),
-- perform_check_in_by_dni(...), is_admin(), is_manager(), is_superadmin(),
-- current_admin_role(), open/close_cash_register, void_sale,
-- set_membership_period_end/plan, archive/unarchive_member,
-- link/unlink_family_member.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Secreto del QR fuera de settings.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.access_secret (
  id         boolean primary key default true check (id),  -- una sola fila
  secret     text not null check (length(secret) >= 16),
  rotated_at timestamptz not null default now()
);
revoke all on private.access_secret from public, anon, authenticated;

comment on table private.access_secret is
  'Secreto HMAC del QR rotativo. Fuera de public a propósito: la API REST no lo ve. Solo lo leen las funciones SECURITY DEFINER.';

-- Mismo valor que tenía settings: el QR que está en pantalla sigue valiendo.
insert into private.access_secret (id, secret)
select true, value #>> '{}'
from settings
where key = 'access_secret'
  and length(value #>> '{}') >= 16
on conflict (id) do nothing;

-- Si no había ninguno usable (o ya se migró antes y está), nos aseguramos de
-- que exista uno.
insert into private.access_secret (id, secret)
values (true, encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

-- Firma de una ventana del QR. Interna: no la puede llamar nadie por la API
-- (y además es SECURITY INVOKER: aunque alguien le diera permiso, sin acceso
-- a private.access_secret no podría leer nada).
create or replace function private.qr_token_for_window(p_window_offset integer)
returns text
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_secret  text;
  v_seconds integer;
  v_window  bigint;
begin
  select secret into v_secret from private.access_secret where id;

  if v_secret is null or length(v_secret) < 16 then
    raise exception 'Falta el secreto del QR (private.access_secret). Sin esto el QR no puede firmarse de forma segura.';
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

revoke execute on function private.qr_token_for_window(integer) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. current_qr_token(): solo staff, solo ventana actual o próxima.
-- ---------------------------------------------------------------------------
create or replace function current_qr_token(p_window_offset integer default 0)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  -- 0 = la que está en pantalla; 1 = la próxima (RotatingQR la pide unos
  -- segundos antes para que el cambio sea instantáneo). Nada más.
  if coalesce(p_window_offset, 0) not in (0, 1) then
    raise exception 'Ventana de QR inválida.' using errcode = '22023';
  end if;

  return private.qr_token_for_window(coalesce(p_window_offset, 0));
end;
$$;

revoke execute on function current_qr_token(integer) from public, anon;
grant  execute on function current_qr_token(integer) to authenticated;

-- verify_qr_token(): misma lógica que en 08_qr_grace.sql, pero firmando con
-- la función interna (la de arriba ahora exige staff, y el check-in corre
-- con la service_role, sin usuario).
create or replace function verify_qr_token(p_token text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_seconds integer;
  v_grace   integer;
  v_elapsed integer;
begin
  if p_token is null or p_token = '' then
    return false;
  end if;

  if p_token = private.qr_token_for_window(0) then
    return true;
  end if;

  select (value #>> '{}')::integer into v_seconds from settings where key = 'qr_rotate_seconds';
  v_seconds := greatest(coalesce(v_seconds, 30), 5);

  select (value #>> '{}')::integer into v_grace from settings where key = 'qr_grace_seconds';
  v_grace := greatest(coalesce(v_grace, 20), 0);

  -- Segundos transcurridos desde que arrancó la ventana actual.
  v_elapsed := floor(extract(epoch from now()))::integer % v_seconds;

  return v_elapsed <= v_grace and p_token = private.qr_token_for_window(-1);
end;
$$;

-- Botón de pánico: ahora rota el secreto en su tabla nueva.
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

  update private.access_secret
     set secret = encode(gen_random_bytes(32), 'hex'),
         rotated_at = now()
   where id;
end;
$$;

revoke execute on function rotate_access_secret() from public, anon;
grant  execute on function rotate_access_secret() to authenticated;

-- El código de 6 dígitos (03_access_code.sql) ya no lo usa nadie, pero se
-- apunta al secreto nuevo para que no quede leyendo una fila que ya no está.
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
  select secret into v_secret from private.access_secret where id;

  if v_secret is null or length(v_secret) < 16 then
    raise exception 'Falta el secreto del QR (private.access_secret).';
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

-- Recién ahora, con todo apuntando a private.access_secret, se borra de
-- settings (que cualquier staff puede leer).
delete from settings where key = 'access_secret';


-- ---------------------------------------------------------------------------
-- 3. Funciones que nadie llama desde la app: fuera de la API.
--    Las que las usan por dentro (sell_membership_split -> renew_membership,
--    perform_check_in_by_dni -> verify_qr_token, el trigger del pack
--    familiar -> family_size) son SECURITY DEFINER del mismo dueño
--    (postgres), así que siguen pudiendo llamarlas.
-- ---------------------------------------------------------------------------
revoke execute on function renew_membership(uuid, uuid, date, integer)                         from public, anon, authenticated;
revoke execute on function sell_membership(uuid, uuid, integer, payment_method, date, integer)  from public, anon, authenticated;
revoke execute on function verify_qr_token(text)                                               from public, anon, authenticated;
revoke execute on function current_access_code(integer)                                        from public, anon, authenticated;
revoke execute on function verify_access_code(text)                                            from public, anon, authenticated;
revoke execute on function access_code_seconds_left()                                          from public, anon, authenticated;
revoke execute on function expire_stale_memberships()                                          from public, anon, authenticated;
revoke execute on function family_size(uuid)                                                   from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 4. sell_membership_split(): staff, sin fechas futuras, override solo dueño.
--    El resto, idéntico a 19_split_payment_and_plan_fix.sql.
-- ---------------------------------------------------------------------------
create or replace function sell_membership_split(
  p_member_id      uuid,
  p_plan_id        uuid,
  p_cash_cents     integer default 0,
  p_transfer_cents integer default 0,
  p_start          date    default null,
  p_uses_override  integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today      date := gym_local_date(now());
  v_plan       plans;
  v_membership memberships;
  v_cash       integer := coalesce(p_cash_cents, 0);
  v_transfer   integer := coalesce(p_transfer_cents, 0);
  v_ids        uuid[] := '{}';
  v_id         uuid;
begin
  if not is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if v_cash < 0 or v_transfer < 0 then
    raise exception 'Los montos cobrados no pueden ser negativos.';
  end if;

  -- Retroactivo sí (cobro cargado al día siguiente); a futuro no.
  if p_start is not null and p_start > v_today then
    raise exception 'El pase no puede arrancar en una fecha futura.';
  end if;

  if p_uses_override is not null and not is_manager() then
    raise exception 'Solo el dueño puede cambiar la cantidad de entradas de un pase.'
      using errcode = '42501';
  end if;

  if p_uses_override is not null and p_uses_override < 1 then
    raise exception 'El pase tiene que tener al menos una entrada.';
  end if;

  if not exists (select 1 from cash_openings where opening_date = v_today) then
    raise exception 'Abrí la caja antes de registrar cobros.';
  end if;

  if exists (select 1 from cash_closings where closing_date = v_today) then
    raise exception 'La caja de hoy ya está cerrada. No se pueden registrar más ventas.';
  end if;

  select * into v_plan from plans where id = p_plan_id;
  if not found then
    raise exception 'El plan indicado no existe';
  end if;

  select * into v_membership
  from renew_membership(p_member_id, p_plan_id, p_start, p_uses_override);

  if v_cash > 0 then
    insert into payments (
      member_id, membership_id, plan_id, plan_name,
      amount_cents, method, local_date, created_by
    )
    values (
      p_member_id, v_membership.id, p_plan_id, v_plan.name,
      v_cash, 'cash', v_today, auth.uid()
    )
    returning id into v_id;
    v_ids := v_ids || v_id;
  end if;

  if v_transfer > 0 then
    insert into payments (
      member_id, membership_id, plan_id, plan_name,
      amount_cents, method, local_date, created_by
    )
    values (
      p_member_id, v_membership.id, p_plan_id, v_plan.name,
      v_transfer, 'transfer', v_today, auth.uid()
    )
    returning id into v_id;
    v_ids := v_ids || v_id;
  end if;

  if v_cash = 0 and v_transfer = 0 then
    insert into payments (
      member_id, membership_id, plan_id, plan_name,
      amount_cents, method, local_date, created_by
    )
    values (
      p_member_id, v_membership.id, p_plan_id, v_plan.name,
      0, 'cash', v_today, auth.uid()
    )
    returning id into v_id;
    v_ids := v_ids || v_id;
  end if;

  return jsonb_build_object(
    'membership_id', v_membership.id,
    'payment_id',    v_ids[1],
    'payment_ids',   to_jsonb(v_ids)
  );
end;
$$;

revoke execute on function sell_membership_split(uuid, uuid, integer, integer, date, integer) from public, anon;
grant  execute on function sell_membership_split(uuid, uuid, integer, integer, date, integer) to authenticated;


-- ---------------------------------------------------------------------------
-- 5. Dar de baja / reactivar socios: solo por las funciones (o dueño).
--
--    SECURITY INVOKER a propósito: current_user es quien ejecuta el UPDATE.
--    Por la API es 'authenticated'; dentro de archive_member() /
--    unarchive_member() (SECURITY DEFINER) es 'postgres', y esas ya
--    chequearon is_manager(). La service_role (check-in) no toca members.
-- ---------------------------------------------------------------------------
create or replace function guard_member_archive()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and not is_manager() then
    if tg_op = 'INSERT' then
      if new.archived_at is not null or new.archived_by_name is not null then
        raise exception 'Solo el dueño puede dar de baja socios.' using errcode = '42501';
      end if;
    elsif new.archived_at is distinct from old.archived_at
       or new.archived_by_name is distinct from old.archived_by_name then
      raise exception 'Solo el dueño puede dar de baja o reactivar socios.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function guard_member_archive() from public, anon, authenticated;

drop trigger if exists members_guard_archive on members;
create trigger members_guard_archive
  before insert or update on members
  for each row execute function guard_member_archive();


-- ---------------------------------------------------------------------------
-- 6. Check-in: el QR se valida antes de mirar el DNI.
--    Único cambio respecto de la versión vigente: el bloque "2) Validar
--    que el QR..." subió antes de "1) Resolver el socio por DNI".
-- ---------------------------------------------------------------------------
create or replace function perform_check_in_by_dni(
  p_dni        text,
  p_source     checkin_source default 'qr',
  p_user_agent text           default null,
  p_qr_token   text           default null,
  p_client_ip  inet           default null
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

  -- 1) Validar que el QR escaneado esté vigente ANTES de mirar el DNI: sin
  --    QR no se puede saber si un DNI es socio o no.
  select value #>> '{}' into v_mode from settings where key = 'access_mode';

  if coalesce(v_mode, 'off') <> 'off' and not verify_qr_token(p_qr_token) then
    return jsonb_build_object(
      'ok', false, 'code', 'BAD_QR',
      'message', 'Este QR ya no es válido. Volvé a escanear el que está en el mostrador.'
    );
  end if;

  if v_dni = '' then
    return jsonb_build_object(
      'ok', false, 'code', 'INVALID_DNI',
      'message', 'Ingresá tu DNI para poder entrar.'
    );
  end if;

  -- 2) Resolver el socio por DNI.
  select * into v_member from members where dni = v_dni;

  if not found then
    return jsonb_build_object(
      'ok', false, 'code', 'INVALID_DNI',
      'message', 'No encontramos ese DNI. Pasá por el mostrador para que te lo carguen.'
    );
  end if;

  v_is_birthday := v_member.birth_date is not null
    and extract(month from v_member.birth_date) = extract(month from v_today)
    and extract(day from v_member.birth_date) = extract(day from v_today);

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
        'is_birthday', v_is_birthday,
        'message', 'Ya registramos tu entrada. No te descontamos otro uso.'
      );
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

    return jsonb_build_object(
      'ok', true, 'code', 'ALREADY_CHECKED_IN',
      'member_name', v_member.full_name,
      'photo_url', v_member.photo_url,
      'visits_today', v_visits,
      'checked_in_at', v_now,
      'is_birthday', v_is_birthday,
      'message', v_message
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
  -- tiene cargado, si no el genérico de siempre; con saludo de cumpleaños
  -- adelante si hoy es el día.
  v_message := coalesce(
    nullif(trim(v_member.welcome_message), ''),
    '¡Bienvenido/a, ' || split_part(v_member.full_name, ' ', 1) ||
      '! Te quedan ' || v_membership.uses_remaining || ' entradas.'
  );
  if v_is_birthday then
    v_message := '🎉 ¡Feliz cumpleaños, ' || split_part(v_member.full_name, ' ', 1) || '! ' || v_message;
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
    'is_birthday', v_is_birthday,
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

-- Solo la service_role (el servidor de /c). Igual que antes.
revoke execute on function perform_check_in_by_dni(text, checkin_source, text, text, inet) from public, anon, authenticated;
grant  execute on function perform_check_in_by_dni(text, checkin_source, text, text, inet) to service_role;


-- ---------------------------------------------------------------------------
-- 7. Permisos de tablas.
-- ---------------------------------------------------------------------------
-- anon: nada de nada (las tablas y la vista member_overview).
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

-- authenticated: lo que usa la API (select/insert/update/delete, filtrado
-- por la RLS). TRUNCATE no pasa por la RLS; REFERENCES y TRIGGER no hacen
-- falta.
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Los intentos de check-in solo los tocan check_in_rate_limited() y
-- perform_check_in_by_dni() (SECURITY DEFINER).
revoke all on checkin_attempts from anon, authenticated;

-- Lo mismo para las tablas que se creen de acá en adelante.
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from authenticated;


-- ---------------------------------------------------------------------------
-- 8. search_path fijo (aviso function_search_path_mutable del linter).
-- ---------------------------------------------------------------------------
alter function touch_updated_at()        set search_path = public;
alter function gym_next_birthday(date)   set search_path = public;


-- ---------------------------------------------------------------------------
-- 9. Schema backups: cerrado a la API.
-- ---------------------------------------------------------------------------
revoke all on schema backups from public, anon, authenticated;
revoke all on all tables in schema backups from public, anon, authenticated;

commit;

-- ============================================================================
-- Probalo (con el SQL editor, que corre como postgres):
--
--   -- El secreto ya no está en settings y sí en private:
--   select count(*) from settings where key = 'access_secret';        -- 0
--   select length(secret) >= 16 from private.access_secret;           -- true
--
--   -- El QR sigue siendo el mismo que antes del parche (comparalo con la
--   -- pantalla de /panel/acceso: tiene que seguir andando sin recargar).
--
--   -- Como un usuario logueado que NO es staff (o anon):
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000"}', true);
--   select current_qr_token(0);          -- ERROR: No autorizado
--   select renew_membership(null, null); -- ERROR: permission denied
--   select * from settings;              -- 0 filas
--   reset role;
--
--   set local role anon;
--   select count(*) from members;        -- ERROR: permission denied
--   reset role;
--
--   -- Check-in sin QR: siempre BAD_QR, exista o no el DNI.
--   select perform_check_in_by_dni('00000000', 'qr', null, null, null);
-- ============================================================================
