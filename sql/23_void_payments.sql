-- ============================================================================
-- GIMNASIO - Parche: anular cobros con historial (Etapa S)
--
-- Corré esto DESPUÉS de 22_renewal_same_day.sql.
--
-- Caso: le cargaste el pase a alguien por adelantado, vino un par de días y
-- nunca pagó. Ese cobro está en la caja de un día (quizás ya cerrado) y hace
-- que el efectivo esperado no coincida con el contado.
--
-- void_sale() ANULA la venta, no la borra:
--   * Los movimientos quedan en payments, marcados con quién y cuándo los
--     anuló y por qué. La caja los muestra tachados y deja de sumarlos.
--   * Si la caja de ese día ya estaba cerrada, se recalculan sus totales, el
--     efectivo esperado y la diferencia con lo contado. El conteo físico no
--     se toca: es lo que de verdad había en el cajón.
--   * Opcionalmente da de baja el pase (status = 'cancelled'), para que el
--     socio no siga entrando con un pase que nadie pagó.
--
-- Solo manager (superadmin o admin). El profesor cobra, no anula.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Columnas de anulación. Nombre del que anuló guardado como snapshot: la
--    tabla admins solo la lee entera el superadmin, y si la cuenta se borra
--    el historial igual tiene que decir quién fue.
-- ---------------------------------------------------------------------------
alter table payments add column if not exists voided_at       timestamptz;
alter table payments add column if not exists voided_by       uuid references auth.users(id) on delete set null;
alter table payments add column if not exists voided_by_name  text;
alter table payments add column if not exists void_reason     text;

create index if not exists payments_voided_at_idx on payments (voided_at desc)
  where voided_at is not null;

comment on column payments.voided_at is
  'Si no es null, el cobro fue anulado: se sigue mostrando (tachado) pero no suma en la caja.';


-- ---------------------------------------------------------------------------
-- 2. Recalcular un cierre ya hecho a partir de los cobros vigentes.
-- ---------------------------------------------------------------------------
create or replace function recalc_cash_closing(p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update cash_closings c
     set total_cash_cents     = s.cash,
         total_transfer_cents = s.transfer,
         payments_count       = s.cnt,
         expected_cash_cents  = case when c.starting_cash_cents is null then c.expected_cash_cents
                                     else c.starting_cash_cents + s.cash end,
         difference_cents     = case when c.starting_cash_cents is null or c.counted_cash_cents is null
                                     then c.difference_cents
                                     else c.counted_cash_cents - (c.starting_cash_cents + s.cash) end
    from (
      select
        coalesce(sum(amount_cents) filter (where method = 'cash'), 0)::integer     as cash,
        coalesce(sum(amount_cents) filter (where method = 'transfer'), 0)::integer as transfer,
        count(*)::integer                                                          as cnt
      from payments
      where local_date = p_date and voided_at is null
    ) s
   where c.closing_date = p_date;
end;
$$;

revoke execute on function recalc_cash_closing(date) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. void_sale — anula todos los movimientos de la venta (efectivo y
--    transferencia de un pago mixto van juntos: son el mismo pase).
-- ---------------------------------------------------------------------------
create or replace function void_sale(
  p_payment_id    uuid,
  p_reason        text,
  p_cancel_membership boolean default true
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments;
  v_name    text;
  v_dates   date[];
  v_date    date;
  v_count   integer;
begin
  if not is_manager() then
    raise exception 'Solo un admin puede anular cobros.' using errcode = '42501';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Escribí el motivo de la anulación.';
  end if;

  select * into v_payment from payments where id = p_payment_id;
  if not found then
    raise exception 'El cobro indicado no existe.';
  end if;
  if v_payment.voided_at is not null then
    raise exception 'Ese cobro ya estaba anulado.';
  end if;

  select coalesce(nullif(trim(a.full_name), ''), a.email) into v_name
  from admins a
  where a.user_id = auth.uid() or a.email = (auth.jwt() ->> 'email')
  limit 1;

  with voided as (
    update payments
       set voided_at      = now(),
           voided_by      = auth.uid(),
           voided_by_name = v_name,
           void_reason    = trim(p_reason)
     where membership_id = v_payment.membership_id
       and voided_at is null
    returning local_date
  )
  select array_agg(distinct local_date), count(*) into v_dates, v_count from voided;

  foreach v_date in array v_dates loop
    perform recalc_cash_closing(v_date);
  end loop;

  if p_cancel_membership then
    update memberships set status = 'cancelled' where id = v_payment.membership_id;
  end if;

  return v_count;
end;
$$;

comment on function void_sale is
  'Anula una venta (todos sus movimientos), recalcula el cierre de ese día si estaba cerrado y, opcionalmente, da de baja el pase. Deja registro de quién, cuándo y por qué. Solo manager.';

revoke execute on function void_sale(uuid, text, boolean) from anon;
grant  execute on function void_sale(uuid, text, boolean) to authenticated;


-- ---------------------------------------------------------------------------
-- 4. close_cash_register — igual que en 11, pero sin contar lo anulado.
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
  where local_date = v_today and voided_at is null;

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


-- ---------------------------------------------------------------------------
-- 5. RLS de payments: antes "for all" para cualquier rol, o sea que un
--    profesor podía tocar la tabla directo y saltearse void_sale(). Ahora
--    todos leen; escribir directo queda para managers (las ventas entran
--    por sell_membership_split(), que es security definer).
-- ---------------------------------------------------------------------------
drop policy if exists payments_admin_all on payments;
drop policy if exists payments_select    on payments;
drop policy if exists payments_write     on payments;

create policy payments_select on payments
  for select to authenticated
  using (is_admin());

create policy payments_write on payments
  for all to authenticated
  using (is_manager())
  with check (is_manager());

-- ============================================================================
-- Probalo (logueado como admin):
--   select void_sale('<payment_id>', 'No pagó, se cargó por adelantado');
--   select voided_at, voided_by_name, void_reason from payments where id = '<payment_id>';
--   select * from cash_closings where closing_date = '<fecha del cobro>';  -- totales recalculados
-- ============================================================================
