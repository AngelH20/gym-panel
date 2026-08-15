-- ============================================================================
-- GIMNASIO - Esquema de base de datos (Etapa A)
-- Postgres 15+ / Supabase
--
-- Cómo usarlo:
--   Supabase Dashboard -> SQL Editor -> New query -> pegar todo -> Run
--   O bien: psql "$DATABASE_URL" -f 01_schema.sql
--
-- Notas de diseño:
--   * Los identificadores y los valores de enum están en inglés a propósito.
--     La traducción al español vive en la UI (lib/labels.ts). Esto evita
--     problemas de encoding y mantiene el código consistente.
--   * Toda fecha/hora se guarda en timestamptz (UTC). El "día calendario"
--     se calcula SIEMPRE con la zona America/Argentina/Buenos_Aires.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensiones
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid(), gen_random_bytes()

-- ---------------------------------------------------------------------------
-- 1. Constante de zona horaria
--    Un único lugar donde vive el timezone. Si algún día cambia, se cambia acá.
-- ---------------------------------------------------------------------------
create or replace function gym_timezone()
returns text
language sql
immutable
as $$
  select 'America/Argentina/Buenos_Aires'::text
$$;

comment on function gym_timezone() is
  'Zona horaria única del negocio. Define los límites de "día" para los check-ins.';

-- Devuelve el día calendario local para un instante dado.
create or replace function gym_local_date(p_at timestamptz)
returns date
language sql
stable
as $$
  select (p_at at time zone gym_timezone())::date
$$;

-- ---------------------------------------------------------------------------
-- 2. Tipos enumerados
-- ---------------------------------------------------------------------------

-- Estado manual del socio. OJO: "expired" NO se setea a mano, se deriva de la
-- membresía activa. El único estado que el admin toca es "suspended".
do $$ begin
  create type member_status as enum ('active', 'suspended');
exception when duplicate_object then null; end $$;

-- Estado de una membresía (un período pago).
do $$ begin
  create type membership_status as enum ('active', 'expired', 'cancelled');
exception when duplicate_object then null; end $$;

-- Cada cuánto se renueva el cupo de usos del plan.
do $$ begin
  create type plan_period as enum ('month', 'week');
exception when duplicate_object then null; end $$;

-- De dónde vino el check-in.
do $$ begin
  create type checkin_source as enum ('qr', 'manual');
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------------
-- 3. admins — allowlist de usuarios habilitados al panel
--    Sin esta tabla, cualquiera que se registre en el proyecto Supabase
--    tendría acceso. El email debe coincidir con el de auth.users.
-- ---------------------------------------------------------------------------
create table if not exists admins (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users(id) on delete cascade,
  email       text not null unique,
  full_name   text,
  created_at  timestamptz not null default now()
);

comment on table admins is 'Allowlist de administradores. Ver función is_admin().';

-- ¿El usuario autenticado actual es admin? Se usa en todas las policies de RLS.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from admins a
    where a.user_id = auth.uid()
       or a.email = (auth.jwt() ->> 'email')
  )
$$;


-- ---------------------------------------------------------------------------
-- 4. plans — planes configurables por el admin
-- ---------------------------------------------------------------------------
create table if not exists plans (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  description       text,

  -- Cantidad de entradas permitidas por período.
  uses_per_period   integer not null check (uses_per_period > 0),
  period            plan_period not null default 'month',

  -- Duración del período en días. Para 'month' usamos 30 por defecto; si
  -- preferís mes calendario, se ajusta en la función de renovación.
  period_days       integer not null default 30 check (period_days > 0),

  -- Preparado para la etapa de plata. Nullable a propósito: hoy no se usa.
  price_cents       integer check (price_cents is null or price_cents >= 0),
  currency          char(3) not null default 'ARS',

  is_active         boolean not null default true,
  sort_order        integer not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists plans_active_idx on plans (is_active, sort_order);

comment on column plans.uses_per_period is
  'Entradas permitidas por período. Ej: Pase Libre = 31, 3x semana = 3 (period=week).';
comment on column plans.price_cents is
  'Reservado para el módulo de cobranzas. Hoy no se usa en la lógica.';


-- ---------------------------------------------------------------------------
-- 5. members — el socio (entidad permanente)
-- ---------------------------------------------------------------------------
create table if not exists members (
  id           uuid primary key default gen_random_uuid(),

  full_name    text not null check (length(trim(full_name)) > 0),
  phone        text,
  email        text,
  photo_url    text,
  joined_on    date not null default gym_local_date(now()),
  status       member_status not null default 'active',
  notes        text,

  -- Credencial del socio para el QR. Opaco, 43 chars base64url, no adivinable.
  -- Es persistente: el socio guarda el mismo link para siempre.
  qr_token     text not null unique
                 default replace(replace(encode(gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Búsqueda por token: es el lookup más caliente del sistema (cada scan).
create unique index if not exists members_qr_token_idx on members (qr_token);
-- Un socio por email. Nulos no chocan entre sí (comportamiento estándar de
-- Postgres). La usan tanto 02_seed.sql (ON CONFLICT) como createMember().
create unique index if not exists members_email_idx on members (email);
-- Búsqueda por nombre en el panel (case-insensitive, substring).
create index if not exists members_name_idx on members (lower(full_name));
create index if not exists members_status_idx on members (status);

comment on column members.qr_token is
  'Token opaco de 32 bytes. Única credencial del socio. NO derivar del id.';
comment on column members.status is
  'Solo "active" o "suspended". El vencimiento se deriva de la membresía activa.';


-- ---------------------------------------------------------------------------
-- 6. memberships — un período pago con su contador de usos
--    Cada renovación = una fila nueva. Nunca se sobreescribe.
--    Esto ES el historial de renovaciones.
-- ---------------------------------------------------------------------------
create table if not exists memberships (
  id               uuid primary key default gen_random_uuid(),
  member_id        uuid not null references members(id) on delete cascade,
  plan_id          uuid not null references plans(id) on delete restrict,

  period_start     date not null,
  period_end       date not null,

  -- Snapshot del plan al momento de vender: si mañana cambiás el plan de 31 a
  -- 30 usos, las membresías ya vendidas no se alteran.
  uses_total       integer not null check (uses_total > 0),
  uses_remaining   integer not null check (uses_remaining >= 0),

  status           membership_status not null default 'active',

  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id) on delete set null,

  constraint memberships_period_valid    check (period_end >= period_start),
  constraint memberships_uses_consistent check (uses_remaining <= uses_total)
);

-- Solo puede haber UNA membresía activa por socio. Índice único parcial:
-- garantía a nivel base de datos, no a nivel código.
create unique index if not exists memberships_one_active_per_member_idx
  on memberships (member_id)
  where status = 'active';

create index if not exists memberships_member_idx     on memberships (member_id, created_at desc);
create index if not exists memberships_expiring_idx   on memberships (period_end) where status = 'active';
create index if not exists memberships_low_uses_idx   on memberships (uses_remaining) where status = 'active';

comment on table memberships is
  'Historial de renovaciones. Una fila por período pago. El futuro payments apuntará acá.';


-- ---------------------------------------------------------------------------
-- 7. check_ins — una entrada registrada
-- ---------------------------------------------------------------------------
create table if not exists check_ins (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references members(id) on delete cascade,
  membership_id  uuid not null references memberships(id) on delete cascade,

  checked_in_at  timestamptz not null default now(),

  -- Día calendario en Buenos Aires. NO puede ser GENERATED porque
  -- "AT TIME ZONE <literal>" sobre timestamptz es STABLE, no IMMUTABLE, y
  -- Postgres exige inmutabilidad en columnas generadas.
  -- Lo setea perform_check_in().
  local_date     date not null,

  source         checkin_source not null default 'qr',
  user_agent     text,

  created_at     timestamptz not null default now()
);

-- ANTI-DOBLE-CONTEO. Esta es la garantía real: incluso con dos scans
-- simultáneos, el segundo INSERT falla por violación de unicidad.
create unique index if not exists check_ins_one_per_day_idx
  on check_ins (member_id, local_date);

-- Dashboard: entradas de hoy, resumen semanal/mensual.
create index if not exists check_ins_local_date_idx on check_ins (local_date desc);
create index if not exists check_ins_at_idx         on check_ins (checked_in_at desc);
create index if not exists check_ins_membership_idx on check_ins (membership_id);


-- ---------------------------------------------------------------------------
-- 8. settings — configuración clave/valor
-- ---------------------------------------------------------------------------
create table if not exists settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

insert into settings (key, value) values
  ('gym_name',                  '"CAREF"'::jsonb),
  ('checkin_cooldown_minutes',  '0'::jsonb),      -- 0 = solo aplica el límite de 1 por día
  ('low_uses_threshold',        '2'::jsonb),      -- alertar con <= 2 usos restantes
  ('expiring_days_threshold',   '3'::jsonb)       -- alertar si vence en <= 3 días
on conflict (key) do nothing;

comment on column settings.value is
  'JSONB para no tener que migrar el esquema cada vez que sumás una config.';


-- ---------------------------------------------------------------------------
-- 9. updated_at automático
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists members_touch on members;
create trigger members_touch before update on members
  for each row execute function touch_updated_at();

drop trigger if exists plans_touch on plans;
create trigger plans_touch before update on plans
  for each row execute function touch_updated_at();

drop trigger if exists settings_touch on settings;
create trigger settings_touch before update on settings
  for each row execute function touch_updated_at();


-- ---------------------------------------------------------------------------
-- 10. Vista: estado consolidado de cada socio
--     Es lo que consume el listado del panel y las alertas.
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

  -- Estado efectivo para mostrar en la UI.
  case
    when m.status = 'suspended'                             then 'suspended'
    when ms.id is null                                      then 'no_membership'
    when ms.period_end < gym_local_date(now())              then 'expired'
    when ms.uses_remaining = 0                              then 'exhausted'
    else 'active'
  end                            as effective_status,

  (ms.period_end - gym_local_date(now()))                   as days_left,

  -- ¿Ya entró hoy?
  exists (
    select 1 from check_ins ci
    where ci.member_id = m.id
      and ci.local_date = gym_local_date(now())
  )                              as checked_in_today,

  (select max(ci.checked_in_at) from check_ins ci where ci.member_id = m.id)
                                 as last_check_in_at
from members m
left join memberships ms
       on ms.member_id = m.id and ms.status = 'active'
left join plans p on p.id = ms.plan_id;

comment on view member_overview is
  'Socio + membresía activa + estado efectivo derivado. Base del listado y las alertas.';


-- ---------------------------------------------------------------------------
-- 11. perform_check_in — EL CORAZÓN DEL SISTEMA
--
--     Transaccional y a prueba de concurrencia:
--       a) SELECT ... FOR UPDATE bloquea la fila de la membresía. Dos scans
--          simultáneos se serializan.
--       b) El índice único (member_id, local_date) es la red de seguridad
--          final: si algo se escapa, el INSERT falla.
--
--     Devuelve JSON con { ok, code, message, ... } para que la API lo pase
--     directo al front. Los mensajes ya vienen en español.
--
--     SECURITY DEFINER + revoke a anon: solo se invoca desde el servidor
--     Next.js con la service_role key.
-- ---------------------------------------------------------------------------
create or replace function perform_check_in(
  p_qr_token   text,
  p_source     checkin_source default 'qr',
  p_user_agent text default null
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
  v_cooldown     integer;
  v_last_at      timestamptz;
  v_checkin_id   uuid;
begin
  v_today := gym_local_date(v_now);

  -- 1) Resolver el socio por token.
  select * into v_member from members where qr_token = p_qr_token;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_TOKEN',
      'message', 'Código QR inválido. Pedile al staff que te genere uno nuevo.'
    );
  end if;

  -- 2) Socio suspendido.
  if v_member.status = 'suspended' then
    return jsonb_build_object(
      'ok', false,
      'code', 'SUSPENDED',
      'member_name', v_member.full_name,
      'message', 'Tu cuenta está suspendida. Acercate al mostrador.'
    );
  end if;

  -- 3) Traer la membresía activa CON BLOQUEO DE FILA.
  --    Acá es donde se resuelve la concurrencia: el segundo scan espera.
  select * into v_membership
  from memberships
  where member_id = v_member.id
    and status = 'active'
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'NO_MEMBERSHIP',
      'member_name', v_member.full_name,
      'message', 'No tenés un pase activo. Pasá por el mostrador para activarlo.'
    );
  end if;

  select * into v_plan from plans where id = v_membership.plan_id;

  -- 4) Pase vencido por fecha.
  if v_membership.period_end < v_today then
    update memberships set status = 'expired' where id = v_membership.id;

    return jsonb_build_object(
      'ok', false,
      'code', 'EXPIRED',
      'member_name', v_member.full_name,
      'period_end', v_membership.period_end,
      'message', 'Tu pase venció el ' ||
                 to_char(v_membership.period_end, 'DD/MM/YYYY') ||
                 '. Renovalo en el mostrador.'
    );
  end if;

  -- 5) Sin usos disponibles.
  if v_membership.uses_remaining <= 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'NO_USES_LEFT',
      'member_name', v_member.full_name,
      'message', 'Ya usaste las ' || v_membership.uses_total ||
                 ' entradas de tu pase. Renovalo para seguir entrenando.'
    );
  end if;

  -- 6) ¿Ya entró hoy? (chequeo explícito para dar un mensaje lindo;
  --    el índice único igual protege si hay carrera)
  select max(checked_in_at) into v_last_at
  from check_ins
  where member_id = v_member.id and local_date = v_today;

  if v_last_at is not null then
    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_CHECKED_IN',
      'member_name', v_member.full_name,
      'uses_remaining', v_membership.uses_remaining,
      'checked_in_at', v_last_at,
      'message', 'Ya registramos tu entrada hoy a las ' ||
                 to_char(v_last_at at time zone gym_timezone(), 'HH24:MI') ||
                 '. No te descontamos otro uso.'
    );
  end if;

  -- 7) Cooldown configurable (además del límite diario).
  select coalesce((value #>> '{}')::integer, 0) into v_cooldown
  from settings where key = 'checkin_cooldown_minutes';

  if coalesce(v_cooldown, 0) > 0 then
    select max(checked_in_at) into v_last_at
    from check_ins
    where member_id = v_member.id
      and checked_in_at > v_now - (v_cooldown || ' minutes')::interval;

    if v_last_at is not null then
      return jsonb_build_object(
        'ok', false,
        'code', 'COOLDOWN',
        'member_name', v_member.full_name,
        'message', 'Registramos una entrada tuya hace muy poco. Esperá unos minutos.'
      );
    end if;
  end if;

  -- 8) Registrar la entrada y descontar el uso. Todo en la misma transacción.
  insert into check_ins (member_id, membership_id, checked_in_at, local_date, source, user_agent)
  values (v_member.id, v_membership.id, v_now, v_today, p_source, p_user_agent)
  returning id into v_checkin_id;

  update memberships
     set uses_remaining = uses_remaining - 1
   where id = v_membership.id
  returning * into v_membership;

  -- Si se quedó sin usos, cerramos el período.
  if v_membership.uses_remaining = 0 then
    update memberships set status = 'expired' where id = v_membership.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'CHECKED_IN',
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
  -- Red de seguridad: si dos transacciones llegaron al INSERT a la vez.
  when unique_violation then
    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_CHECKED_IN',
      'message', 'Tu entrada de hoy ya estaba registrada. No te descontamos otro uso.'
    );
end;
$$;

comment on function perform_check_in is
  'Check-in transaccional. FOR UPDATE + índice único = imposible descontar dos veces.';


-- ---------------------------------------------------------------------------
-- 12. renew_membership — renovación / alta de pase
--     Cierra la membresía activa anterior y crea una nueva.
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
  select * into v_plan from plans where id = p_plan_id;
  if not found then
    raise exception 'El plan indicado no existe';
  end if;

  v_start := coalesce(p_start, gym_local_date(now()));

  -- Cerrar el período anterior. El índice único parcial nos obliga a esto,
  -- que es justamente lo que queremos.
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
-- 13. expire_stale_memberships — housekeeping
--     Corré esto una vez por día (pg_cron o un cron de Vercel).
-- ---------------------------------------------------------------------------
create or replace function expire_stale_memberships()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  update memberships
     set status = 'expired'
   where status = 'active'
     and (period_end < gym_local_date(now()) or uses_remaining = 0);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


-- ---------------------------------------------------------------------------
-- 14. Row Level Security
--     Regla general: solo admins autenticados. El rol anon NO toca nada.
--     El check-in público pasa por el servidor Next.js con service_role.
-- ---------------------------------------------------------------------------
alter table admins      enable row level security;
alter table plans       enable row level security;
alter table members     enable row level security;
alter table memberships enable row level security;
alter table check_ins   enable row level security;
alter table settings    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['plans','members','memberships','check_ins','settings']
  loop
    execute format('drop policy if exists %I_admin_all on %I', t, t);
    execute format(
      'create policy %I_admin_all on %I for all to authenticated using (is_admin()) with check (is_admin())',
      t, t
    );
  end loop;
end $$;

drop policy if exists admins_self_read on admins;
create policy admins_self_read on admins
  for select to authenticated
  using (user_id = auth.uid() or is_admin());

-- El rol anon no puede invocar el check-in directamente: se hace desde el
-- servidor, que además valida el código de acceso del gimnasio si lo activás.
revoke execute on function perform_check_in(text, checkin_source, text) from anon, authenticated;
revoke execute on function renew_membership(uuid, uuid, date, integer) from anon;
revoke execute on function expire_stale_memberships() from anon;
grant  execute on function renew_membership(uuid, uuid, date, integer) to authenticated;


-- ============================================================================
-- FIN DEL ESQUEMA
-- ============================================================================
