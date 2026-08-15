-- ============================================================================
-- GIMNASIO - Parche: apertura de caja con fondo inicial (Etapa K)
--
-- Corré esto DESPUÉS de 10_search_path_fix.sql.
--
-- Hasta ahora solo existía el cierre. Se agrega la apertura: al empezar el
-- día, el encargado declara cuánto efectivo hay en el cajón para arrancar
-- (el "fondo" o "vuelto"). No se puede cobrar nada sin abrir la caja antes.
-- Al cerrar, además del total vendido, se cuenta el efectivo físico y el
-- sistema muestra la diferencia contra lo esperado (fondo + ventas en
-- efectivo) — el chequeo real de si faltó o sobró plata en el cajón.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. cash_openings — un fondo inicial por día.
-- ---------------------------------------------------------------------------
create table if not exists cash_openings (
  id                    uuid primary key default gen_random_uuid(),
  opening_date          date not null unique,
  opened_at             timestamptz not null default now(),
  opened_by             uuid references auth.users(id) on delete set null,

  starting_cash_cents   integer not null check (starting_cash_cents >= 0),

  notes                 text
);

comment on table cash_openings is
  'Fondo inicial declarado al abrir la caja del día. Sin esto, sell_membership() rechaza la venta.';


-- ---------------------------------------------------------------------------
-- 2. cash_closings — sumamos la conciliación. Nullable: los cierres viejos
--    (de antes de este parche) quedan sin estos datos, no se pueden inferir.
-- ---------------------------------------------------------------------------
alter table cash_closings add column if not exists starting_cash_cents integer;
alter table cash_closings add column if not exists expected_cash_cents integer;
alter table cash_closings add column if not exists counted_cash_cents  integer;
alter table cash_closings add column if not exists difference_cents   integer;

comment on column cash_closings.expected_cash_cents is
  'Fondo inicial + ventas en efectivo del día. Lo que debería haber en el cajón.';
comment on column cash_closings.counted_cash_cents is
  'Efectivo que el encargado contó físicamente al cerrar.';
comment on column cash_closings.difference_cents is
  'counted_cash_cents - expected_cash_cents. Negativo = faltante, positivo = sobrante.';


-- ---------------------------------------------------------------------------
-- 3. open_cash_register — abre la caja de hoy con su fondo inicial.
-- ---------------------------------------------------------------------------
create or replace function open_cash_register(
  p_starting_cash_cents integer,
  p_notes               text default null
)
returns cash_openings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := gym_local_date(now());
  v_row   cash_openings;
begin
  if exists (select 1 from cash_openings where opening_date = v_today) then
    raise exception 'La caja de hoy ya está abierta.';
  end if;

  if p_starting_cash_cents is null or p_starting_cash_cents < 0 then
    raise exception 'El fondo inicial no puede ser negativo.';
  end if;

  insert into cash_openings (opening_date, opened_by, starting_cash_cents, notes)
  values (v_today, auth.uid(), p_starting_cash_cents, p_notes)
  returning * into v_row;

  return v_row;
end;
$$;

comment on function open_cash_register is
  'Abre la caja de hoy: declara el fondo inicial. Sin esto no se puede vender.';


-- ---------------------------------------------------------------------------
-- 4. close_cash_register — ahora pide el efectivo contado y calcula la
--    diferencia contra lo esperado. Reemplaza la versión de 04_payments.sql
--    (esa tenía solo p_notes; esta pide también p_counted_cash_cents).
-- ---------------------------------------------------------------------------
drop function if exists close_cash_register(text);

create or replace function close_cash_register(
  p_counted_cash_cents integer,
  p_notes              text default null
)
returns cash_closings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today    date := gym_local_date(now());
  v_opening  cash_openings;
  v_cash     integer;
  v_transfer integer;
  v_count    integer;
  v_expected integer;
  v_row      cash_closings;
begin
  if exists (select 1 from cash_closings where closing_date = v_today) then
    raise exception 'La caja de hoy ya está cerrada.';
  end if;

  select * into v_opening from cash_openings where opening_date = v_today;
  if not found then
    raise exception 'Todavía no abriste la caja hoy.';
  end if;

  if p_counted_cash_cents is null or p_counted_cash_cents < 0 then
    raise exception 'El efectivo contado no puede ser negativo.';
  end if;

  select
    coalesce(sum(amount_cents) filter (where method = 'cash'), 0),
    coalesce(sum(amount_cents) filter (where method = 'transfer'), 0),
    count(*)
  into v_cash, v_transfer, v_count
  from payments
  where local_date = v_today;

  v_expected := v_opening.starting_cash_cents + v_cash;

  insert into cash_closings (
    closing_date, closed_by,
    starting_cash_cents, total_cash_cents, total_transfer_cents,
    expected_cash_cents, counted_cash_cents, difference_cents,
    payments_count, notes
  )
  values (
    v_today, auth.uid(),
    v_opening.starting_cash_cents, v_cash, v_transfer,
    v_expected, p_counted_cash_cents, p_counted_cash_cents - v_expected,
    v_count, p_notes
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function close_cash_register is
  'Cierra la caja de hoy: fija los totales, compara el efectivo contado contra el esperado y bloquea nuevas ventas para esa fecha.';


-- ---------------------------------------------------------------------------
-- 5. sell_membership — ahora exige caja abierta, además de no cerrada.
-- ---------------------------------------------------------------------------
create or replace function sell_membership(
  p_member_id     uuid,
  p_plan_id       uuid,
  p_amount_cents  integer,
  p_method        payment_method,
  p_start         date default null,
  p_uses_override integer default null
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
  v_payment_id uuid;
begin
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

  insert into payments (
    member_id, membership_id, plan_id, plan_name,
    amount_cents, method, local_date, created_by
  )
  values (
    p_member_id, v_membership.id, p_plan_id, v_plan.name,
    p_amount_cents, p_method, v_today, auth.uid()
  )
  returning id into v_payment_id;

  return jsonb_build_object(
    'membership_id', v_membership.id,
    'payment_id', v_payment_id
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- 6. RLS — mismo patrón que el resto.
-- ---------------------------------------------------------------------------
alter table cash_openings enable row level security;

drop policy if exists cash_openings_admin_all on cash_openings;
create policy cash_openings_admin_all on cash_openings
  for all to authenticated using (is_admin()) with check (is_admin());

revoke execute on function open_cash_register(integer, text)  from anon;
revoke execute on function close_cash_register(integer, text) from anon;
grant  execute on function open_cash_register(integer, text)  to authenticated;
grant  execute on function close_cash_register(integer, text) to authenticated;

-- ============================================================================
-- Probalo:
--   select open_cash_register(1000000);          -- $10.000 de fondo
--   select sell_membership(...);                 -- ahora sí funciona
--   select close_cash_register(4500000);          -- $45.000 contados
--   select difference_cents from cash_closings where closing_date = gym_local_date(now());
-- ============================================================================
