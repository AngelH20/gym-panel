-- ============================================================================
-- GIMNASIO - Parche: ventas y cierre de caja (Etapa D)
--
-- Corré esto DESPUÉS de 01_schema.sql, 02_seed.sql y 03_access_code.sql.
--
-- No se cobra nada de verdad acá: los pagos reales se manejan aparte (MP).
-- Esto es un registro manual de "cobré tanto, por tal medio" para poder
-- cerrar la caja del día y saber cuánto se facturó. El admin tipea el monto
-- y el medio (efectivo/transferencia) cuando activa o renueva un pase.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Precio dual por plan: reemplaza el price_cents (nunca usado) de 01.
-- ---------------------------------------------------------------------------
alter table plans add column if not exists price_cash_cents integer
  check (price_cash_cents is null or price_cash_cents >= 0);
alter table plans add column if not exists price_transfer_cents integer
  check (price_transfer_cents is null or price_transfer_cents >= 0);
alter table plans drop column if exists price_cents;

comment on column plans.price_cash_cents is
  'Precio en efectivo, en centavos. Nullable: un plan puede no tener precio cargado todavía.';
comment on column plans.price_transfer_cents is
  'Precio por transferencia, en centavos. Suele ser mayor al de efectivo.';

-- El pase "Día" es 1 entrada / 1 día: encaja en el modelo de plans sin
-- ningún caso especial. Esto es solo para que el período se lea bien.
alter type plan_period add value if not exists 'day';


-- ---------------------------------------------------------------------------
-- 2. payments — una fila por venta simulada.
-- ---------------------------------------------------------------------------
do $$ begin
  create type payment_method as enum ('cash', 'transfer');
exception when duplicate_object then null; end $$;

create table if not exists payments (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references members(id) on delete cascade,
  membership_id  uuid not null references memberships(id) on delete cascade,

  -- Snapshot del plan al momento de vender: si el plan se borra o cambia de
  -- precio después, la venta ya registrada no se altera.
  plan_id        uuid references plans(id) on delete set null,
  plan_name      text not null,

  amount_cents   integer not null check (amount_cents >= 0),
  currency       char(3) not null default 'ARS',
  method         payment_method not null,

  -- Mismo patrón que check_ins: el día calendario en Buenos Aires, seteado
  -- a mano porque "AT TIME ZONE" no es IMMUTABLE.
  local_date     date not null,
  paid_at        timestamptz not null default now(),

  created_by     uuid references auth.users(id) on delete set null
);

create index if not exists payments_local_date_idx on payments (local_date desc);
create index if not exists payments_member_idx     on payments (member_id, paid_at desc);

comment on table payments is
  'Registro manual de cobros simulados. El cobro real pasa por MP, aparte.';


-- ---------------------------------------------------------------------------
-- 3. cash_closings — un cierre por día. Una vez cerrado, no se puede vender
--    con fecha de ese día (ver sell_membership).
-- ---------------------------------------------------------------------------
create table if not exists cash_closings (
  id                    uuid primary key default gen_random_uuid(),
  closing_date          date not null unique,
  closed_at             timestamptz not null default now(),
  closed_by             uuid references auth.users(id) on delete set null,

  total_cash_cents      integer not null,
  total_transfer_cents  integer not null,
  payments_count        integer not null,

  notes                 text
);

comment on table cash_closings is
  'Un cierre fija los totales del día. Después de cerrado, ese día queda de solo lectura.';


-- ---------------------------------------------------------------------------
-- 4. sell_membership — activa/renueva el pase Y registra el cobro, atómico.
--    Envuelve renew_membership() en lugar de duplicar su lógica.
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

comment on function sell_membership is
  'Renueva el pase y registra el cobro simulado en una sola transacción.';


-- ---------------------------------------------------------------------------
-- 5. close_cash_register — fija los totales del día actual.
-- ---------------------------------------------------------------------------
create or replace function close_cash_register(p_notes text default null)
returns cash_closings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := gym_local_date(now());
  v_row   cash_closings;
begin
  if exists (select 1 from cash_closings where closing_date = v_today) then
    raise exception 'La caja de hoy ya está cerrada.';
  end if;

  insert into cash_closings (
    closing_date, closed_by,
    total_cash_cents, total_transfer_cents, payments_count, notes
  )
  select
    v_today,
    auth.uid(),
    coalesce(sum(amount_cents) filter (where method = 'cash'), 0),
    coalesce(sum(amount_cents) filter (where method = 'transfer'), 0),
    count(*),
    p_notes
  from payments
  where local_date = v_today
  returning * into v_row;

  return v_row;
end;
$$;

comment on function close_cash_register is
  'Cierra la caja de hoy: fija los totales y bloquea nuevas ventas para esa fecha.';


-- ---------------------------------------------------------------------------
-- 6. RLS — mismo patrón que el resto: solo admins autenticados.
-- ---------------------------------------------------------------------------
alter table payments      enable row level security;
alter table cash_closings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['payments','cash_closings']
  loop
    execute format('drop policy if exists %I_admin_all on %I', t, t);
    execute format(
      'create policy %I_admin_all on %I for all to authenticated using (is_admin()) with check (is_admin())',
      t, t
    );
  end loop;
end $$;

revoke execute on function sell_membership(uuid, uuid, integer, payment_method, date, integer) from anon;
revoke execute on function close_cash_register(text) from anon;
grant  execute on function sell_membership(uuid, uuid, integer, payment_method, date, integer) to authenticated;
grant  execute on function close_cash_register(text) to authenticated;

-- ============================================================================
-- Probalo:
--   select sell_membership('<member_id>', '<plan_id>', 8000000, 'cash');
--   select * from payments where local_date = gym_local_date(now());
--   select close_cash_register();
--   select sell_membership(...); -- ahora debería fallar: caja cerrada
-- ============================================================================
