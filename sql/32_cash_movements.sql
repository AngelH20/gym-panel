-- ============================================================================
-- GIMNASIO - Parche: gastos e ingresos de caja + cerrar una caja que quedó
-- abierta de un día anterior (Etapa AB)
--
-- Corré esto DESPUÉS de 31_cobrado_por.sql (no depende de nada de ese
-- archivo: se puede correr antes o después, pero respetá el orden).
-- Hacé un backup antes (como siempre). Es idempotente: se puede correr más de
-- una vez sin romper nada. Va todo dentro de una transacción.
--
-- Qué agrega:
--
--   1) cash_movements: plata que entra o sale de la caja y que NO es la venta
--      de un pase. Ejemplos: "Pagué la limpieza" (gasto en efectivo), "Venta
--      de una botella de agua" (ingreso). Igual que los cobros, NUNCA se
--      borran: se anulan con quién, cuándo y por qué.
--
--   2) add_cash_movement(): cualquier staff (también el profesor, que es el
--      que está en la sala y paga la limpieza) registra un gasto o ingreso
--      en la caja de HOY, que tiene que estar abierta y sin cerrar.
--
--   3) void_cash_movement(): solo dueño o programador. Pide motivo. Si la
--      caja de ese día ya estaba cerrada, se recalculan sus totales.
--
--   4) El efectivo esperado del cierre pasa a ser:
--
--        apertura + cobros en efectivo + ingresos en efectivo − gastos en efectivo
--
--      cash_closings suma 4 columnas (ingresos y gastos, por medio de pago).
--      total_cash_cents / total_transfer_cents / payments_count siguen
--      siendo SOLO los cobros de pases (mismo significado que antes).
--      Los cierres viejos no cambian: las columnas nuevas nacen en 0 y este
--      archivo no recalcula nada. Con cero movimientos, close_cash_register()
--      y recalc_cash_closing() dan exactamente lo mismo que antes.
--
--   5) close_past_cash_register(fecha, contado, notas): cerrar la caja de un
--      día ANTERIOR que quedó abierta (close_cash_register() solo cierra la
--      de hoy). Solo un día con apertura y sin cierre. Lo puede hacer el
--      profesor: cerrar no borra nada. El efectivo contado es opcional (al
--      día siguiente puede que ya no se pueda contar lo de ese día): si no
--      se manda, el cierre queda sin diferencia.
--
-- Funciones vigentes que se reescriben (partiendo de su versión en la base,
-- después de 28/29/30): close_cash_register(integer, text) y
-- recalc_cash_closing(date). Mismas firmas y mismos permisos: void_sale()
-- las sigue usando igual.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Tabla de gastos e ingresos.
--    created_by_name / voided_by_name: snapshot del nombre (como en
--    payments.voided_by_name): si la cuenta se borra, el historial igual
--    dice quién fue.
-- ---------------------------------------------------------------------------
create table if not exists cash_movements (
  id              uuid primary key default gen_random_uuid(),
  local_date      date not null default gym_local_date(now()),
  kind            text not null,
  amount_cents    integer not null,
  method          payment_method not null default 'cash',
  reason          text not null,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,
  created_by_name text,
  voided_at       timestamptz,
  voided_by       uuid references auth.users(id) on delete set null,
  voided_by_name  text,
  void_reason     text,
  constraint cash_movements_kind_check
    check (kind in ('expense', 'income')),
  -- Tope: $ 10.000.000 por movimiento (en centavos). Lejos de cualquier gasto
  -- real del gimnasio y lejos del máximo de un integer.
  constraint cash_movements_amount_check
    check (amount_cents > 0 and amount_cents <= 1000000000),
  constraint cash_movements_reason_check
    check (char_length(btrim(reason)) between 1 and 200),
  constraint cash_movements_void_reason_check
    check (void_reason is null or char_length(void_reason) <= 500),
  -- Anulado = tiene fecha de anulación Y motivo. Nunca uno sin el otro.
  constraint cash_movements_void_complete_check
    check ((voided_at is null) = (void_reason is null))
);

create index if not exists cash_movements_local_date_idx on cash_movements (local_date);

comment on table cash_movements is
  'Gastos (expense) e ingresos (income) de la caja que no son cobros de pases. No se borran: se anulan (voided_at).';
comment on column cash_movements.voided_at is
  'Si no es null, el movimiento fue anulado: se sigue mostrando (tachado) pero no suma en la caja.';


-- ---------------------------------------------------------------------------
-- 2. RLS y permisos: igual que las otras tablas de caja. Leer, cualquier
--    staff. Escribir directo, solo dueño/programador (la app escribe por las
--    funciones de abajo). anon, nada.
-- ---------------------------------------------------------------------------
alter table cash_movements enable row level security;

drop policy if exists cash_movements_select on cash_movements;
drop policy if exists cash_movements_insert on cash_movements;
drop policy if exists cash_movements_update on cash_movements;
drop policy if exists cash_movements_delete on cash_movements;

create policy cash_movements_select on cash_movements
  for select to authenticated using ((select is_admin()));
create policy cash_movements_insert on cash_movements
  for insert to authenticated with check (is_manager());
create policy cash_movements_update on cash_movements
  for update to authenticated using (is_manager()) with check (is_manager());
create policy cash_movements_delete on cash_movements
  for delete to authenticated using (is_manager());

revoke all on cash_movements from public, anon;
revoke truncate, references, trigger on cash_movements from authenticated;
grant select, insert, update, delete on cash_movements to authenticated;


-- ---------------------------------------------------------------------------
-- 3. Columnas nuevas del cierre. Nacen en 0: los cierres de antes no tenían
--    gastos ni ingresos, así que 0 es exactamente lo que tuvieron.
-- ---------------------------------------------------------------------------
alter table cash_closings add column if not exists income_cash_cents      integer not null default 0;
alter table cash_closings add column if not exists income_transfer_cents  integer not null default 0;
alter table cash_closings add column if not exists expense_cash_cents     integer not null default 0;
alter table cash_closings add column if not exists expense_transfer_cents integer not null default 0;

comment on column cash_closings.total_cash_cents is
  'Cobros de pases en efectivo (sin gastos ni ingresos de caja, que van en income_*/expense_*).';
comment on column cash_closings.expected_cash_cents is
  'starting_cash_cents + total_cash_cents + income_cash_cents - expense_cash_cents.';


-- ---------------------------------------------------------------------------
-- 4. Totales de un día (vigentes, sin anulados). Una sola cuenta para el
--    cierre, el recálculo y el control de gastos. Interna: no se expone.
-- ---------------------------------------------------------------------------
create or replace function cash_day_totals(p_date date)
returns table (
  cash             integer,
  transfer         integer,
  cnt              integer,
  income_cash      integer,
  income_transfer  integer,
  expense_cash     integer,
  expense_transfer integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.cash, p.transfer, p.cnt,
    m.income_cash, m.income_transfer, m.expense_cash, m.expense_transfer
  from (
    select
      coalesce(sum(amount_cents) filter (where method = 'cash'), 0)::integer     as cash,
      coalesce(sum(amount_cents) filter (where method = 'transfer'), 0)::integer as transfer,
      count(*)::integer                                                          as cnt
    from payments
    where local_date = p_date and voided_at is null
  ) p
  cross join (
    select
      coalesce(sum(amount_cents) filter (where kind = 'income'  and method = 'cash'), 0)::integer     as income_cash,
      coalesce(sum(amount_cents) filter (where kind = 'income'  and method = 'transfer'), 0)::integer as income_transfer,
      coalesce(sum(amount_cents) filter (where kind = 'expense' and method = 'cash'), 0)::integer     as expense_cash,
      coalesce(sum(amount_cents) filter (where kind = 'expense' and method = 'transfer'), 0)::integer as expense_transfer
    from cash_movements
    where local_date = p_date and voided_at is null
  ) m
$$;

revoke execute on function cash_day_totals(date) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 5. recalc_cash_closing — misma firma. Antes: esperado = apertura + cobros
--    en efectivo. Ahora suma ingresos y resta gastos en efectivo. Con cero
--    movimientos da lo mismo que antes. Los cierres sin apertura registrada
--    (de antes de la conciliación) conservan su esperado y su diferencia.
-- ---------------------------------------------------------------------------
create or replace function recalc_cash_closing(p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update cash_closings c
     set total_cash_cents       = t.cash,
         total_transfer_cents   = t.transfer,
         payments_count         = t.cnt,
         income_cash_cents      = t.income_cash,
         income_transfer_cents  = t.income_transfer,
         expense_cash_cents     = t.expense_cash,
         expense_transfer_cents = t.expense_transfer,
         expected_cash_cents    = case when c.starting_cash_cents is null then c.expected_cash_cents
                                       else c.starting_cash_cents + t.cash + t.income_cash - t.expense_cash end,
         difference_cents       = case when c.starting_cash_cents is null or c.counted_cash_cents is null
                                       then c.difference_cents
                                       else c.counted_cash_cents
                                            - (c.starting_cash_cents + t.cash + t.income_cash - t.expense_cash) end
    from cash_day_totals(p_date) t
   where c.closing_date = p_date;
end;
$$;

revoke execute on function recalc_cash_closing(date) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 6. Cierre de un día cualquiera (interna). La usan close_cash_register()
--    (hoy) y close_past_cash_register() (un día anterior). No chequea rol:
--    eso lo hacen las dos de afuera.
-- ---------------------------------------------------------------------------
create or replace function close_cash_register_for(
  p_date               date,
  p_counted_cash_cents integer,
  p_notes              text
)
returns cash_closings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_today boolean := p_date = gym_local_date(now());
  v_opening  cash_openings;
  v_t        record;
  v_expected integer;
  v_row      cash_closings;
begin
  if exists (select 1 from cash_closings where closing_date = p_date) then
    if v_is_today then
      raise exception 'La caja de hoy ya está cerrada.';
    end if;
    raise exception 'La caja del % ya está cerrada.', to_char(p_date, 'DD/MM');
  end if;

  select * into v_opening from cash_openings where opening_date = p_date;
  if not found then
    if v_is_today then
      raise exception 'Todavía no abriste la caja hoy.';
    end if;
    raise exception 'La caja del % no se abrió: no hay nada que cerrar.', to_char(p_date, 'DD/MM');
  end if;

  if p_counted_cash_cents is not null and p_counted_cash_cents < 0 then
    raise exception 'El efectivo contado no puede ser negativo.';
  end if;

  select * into v_t from cash_day_totals(p_date);

  v_expected := v_opening.starting_cash_cents + v_t.cash + v_t.income_cash - v_t.expense_cash;

  insert into cash_closings (
    closing_date, closed_by,
    starting_cash_cents, total_cash_cents, total_transfer_cents,
    income_cash_cents, income_transfer_cents, expense_cash_cents, expense_transfer_cents,
    expected_cash_cents, counted_cash_cents, difference_cents,
    payments_count, notes
  )
  values (
    p_date, auth.uid(),
    v_opening.starting_cash_cents, v_t.cash, v_t.transfer,
    v_t.income_cash, v_t.income_transfer, v_t.expense_cash, v_t.expense_transfer,
    v_expected, p_counted_cash_cents, p_counted_cash_cents - v_expected,
    v_t.cnt, p_notes
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function close_cash_register_for(date, integer, text) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 7. close_cash_register — misma firma y mismos mensajes. Cambia solo el
--    esperado (ahora con gastos e ingresos) y que guarda las columnas nuevas.
--    El efectivo contado sigue siendo obligatorio para la caja de hoy.
-- ---------------------------------------------------------------------------
create or replace function close_cash_register(
  p_counted_cash_cents integer,
  p_notes              text default null
)
returns cash_closings
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  -- Mismo orden de chequeos que la versión anterior: primero "ya cerrada",
  -- después "sin abrir", y recién ahí el monto contado (obligatorio hoy).
  if exists (select 1 from cash_closings where closing_date = gym_local_date(now())) then
    raise exception 'La caja de hoy ya está cerrada.';
  end if;
  if not exists (select 1 from cash_openings where opening_date = gym_local_date(now())) then
    raise exception 'Todavía no abriste la caja hoy.';
  end if;
  if p_counted_cash_cents is null or p_counted_cash_cents < 0 then
    raise exception 'El efectivo contado no puede ser negativo.';
  end if;

  return close_cash_register_for(gym_local_date(now()), p_counted_cash_cents, p_notes);
end;
$$;

revoke execute on function close_cash_register(integer, text) from public, anon;
grant  execute on function close_cash_register(integer, text) to authenticated;


-- ---------------------------------------------------------------------------
-- 8. close_past_cash_register — cerrar la caja de un día anterior que quedó
--    abierta. Cualquier staff (cerrar no borra nada). Solo días pasados con
--    apertura y sin cierre. El contado es opcional.
--    Ojo: el cierre queda con closed_at = ahora (cuándo se cerró de verdad),
--    no con la fecha de ese día.
-- ---------------------------------------------------------------------------
create or replace function close_past_cash_register(
  p_date               date,
  p_counted_cash_cents integer default null,
  p_notes              text default null
)
returns cash_closings
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_date is null or p_date >= gym_local_date(now()) then
    raise exception 'Esto es para cerrar la caja de un día anterior. La de hoy se cierra con Cerrar caja.';
  end if;

  return close_cash_register_for(p_date, p_counted_cash_cents, p_notes);
end;
$$;

revoke execute on function close_past_cash_register(date, integer, text) from public, anon;
grant  execute on function close_past_cash_register(date, integer, text) to authenticated;


-- ---------------------------------------------------------------------------
-- 9. add_cash_movement — registrar un gasto o un ingreso en la caja de hoy.
-- ---------------------------------------------------------------------------
create or replace function add_cash_movement(
  p_kind         text,
  p_amount_cents integer,
  p_method       payment_method,
  p_reason       text
)
returns cash_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today  date := gym_local_date(now());
  v_reason text := btrim(coalesce(p_reason, ''));
  v_name   text;
  v_open   cash_openings;
  v_t      record;
  v_row    cash_movements;
begin
  if not is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_kind is null or p_kind not in ('expense', 'income') then
    raise exception 'Elegí si es un gasto o un ingreso.';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'El monto tiene que ser mayor a cero.';
  end if;
  if p_amount_cents > 1000000000 then
    raise exception 'El monto es demasiado grande. Revisalo.';
  end if;
  if p_method is null then
    raise exception 'Elegí si fue en efectivo o por transferencia.';
  end if;
  if v_reason = '' then
    raise exception 'Escribí el motivo (ej: pago de la limpieza).';
  end if;
  if char_length(v_reason) > 200 then
    raise exception 'El motivo no puede pasar de 200 caracteres.';
  end if;

  select * into v_open from cash_openings where opening_date = v_today;
  if not found then
    raise exception 'Abrí la caja antes de registrar gastos o ingresos.';
  end if;
  if exists (select 1 from cash_closings where closing_date = v_today) then
    raise exception 'La caja de hoy ya está cerrada. No se pueden registrar más movimientos.';
  end if;

  -- Un gasto en efectivo sale del cajón: no puede ser más de lo que hay.
  if p_kind = 'expense' and p_method = 'cash' then
    select * into v_t from cash_day_totals(v_today);
    if p_amount_cents > v_open.starting_cash_cents + v_t.cash + v_t.income_cash - v_t.expense_cash then
      raise exception 'No hay tanto efectivo en la caja. Revisá el monto o si fue por transferencia.';
    end if;
  end if;

  select coalesce(nullif(btrim(a.full_name), ''), a.email) into v_name
  from admins a
  where a.user_id = auth.uid() or a.email = (auth.jwt() ->> 'email')
  limit 1;

  insert into cash_movements (local_date, kind, amount_cents, method, reason, created_by, created_by_name)
  values (v_today, p_kind, p_amount_cents, p_method, v_reason, auth.uid(), v_name)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function add_cash_movement(text, integer, payment_method, text) from public, anon;
grant  execute on function add_cash_movement(text, integer, payment_method, text) to authenticated;


-- ---------------------------------------------------------------------------
-- 10. void_cash_movement — anular un gasto o ingreso (dueño o programador).
--     No se borra: queda tachado con quién, cuándo y por qué. Si la caja de
--     ese día ya estaba cerrada, se recalcula el cierre.
-- ---------------------------------------------------------------------------
create or replace function void_cash_movement(p_id uuid, p_reason text)
returns cash_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_mov    cash_movements;
  v_name   text;
begin
  if not is_manager() then
    raise exception 'Solo el dueño puede anular gastos o ingresos.' using errcode = '42501';
  end if;

  if v_reason = '' then
    raise exception 'Escribí el motivo de la anulación.';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'El motivo no puede pasar de 500 caracteres.';
  end if;

  select * into v_mov from cash_movements where id = p_id for update;
  if not found then
    raise exception 'El movimiento indicado no existe.';
  end if;
  if v_mov.voided_at is not null then
    raise exception 'Ese movimiento ya estaba anulado.';
  end if;

  select coalesce(nullif(btrim(a.full_name), ''), a.email) into v_name
  from admins a
  where a.user_id = auth.uid() or a.email = (auth.jwt() ->> 'email')
  limit 1;

  update cash_movements
     set voided_at      = now(),
         voided_by      = auth.uid(),
         voided_by_name = v_name,
         void_reason    = v_reason
   where id = p_id
  returning * into v_mov;

  perform recalc_cash_closing(v_mov.local_date);

  return v_mov;
end;
$$;

revoke execute on function void_cash_movement(uuid, text) from public, anon;
grant  execute on function void_cash_movement(uuid, text) to authenticated;

commit;

-- ============================================================================
-- Probalo (con el SQL editor, que corre como postgres):
--
--   -- Los cierres viejos no cambiaron (todas las columnas nuevas en 0):
--   select count(*) from cash_closings
--    where income_cash_cents + income_transfer_cents
--        + expense_cash_cents + expense_transfer_cents <> 0;      -- 0
--
--   -- Recalcular un cierre viejo da lo mismo que tenía:
--   select closing_date, expected_cash_cents, difference_cents
--     from cash_closings order by closing_date desc limit 3;
--   -- (anotalo, corré recalc_cash_closing('AAAA-MM-DD') sobre uno de esos
--   --  días dentro de un begin; ... rollback; y compará)
--
--   -- anon no ve la tabla:
--   set local role anon;
--   select count(*) from cash_movements;   -- ERROR: permission denied
--   reset role;
--
--   -- Cajas de días anteriores que quedaron abiertas:
--   select o.opening_date
--     from cash_openings o
--     left join cash_closings c on c.closing_date = o.opening_date
--    where c.id is null and o.opening_date < gym_local_date(now())
--    order by 1 desc;
-- ============================================================================
