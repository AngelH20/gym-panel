-- ============================================================================
-- GIMNASIO - Parche: pago mixto y corrección de pase sin tocar la caja (Etapa P)
--
-- Corré esto DESPUÉS de 18_roles.sql.
--
-- Dos cosas que faltaban, las dos alrededor de la caja:
--
--   1) PAGO MIXTO. Hasta ahora una venta era 100% efectivo o 100%
--      transferencia. En el mostrador pasa seguido que un pase de $100.000 se
--      pague con $60.000 por transferencia y $40.000 en efectivo. Ahora
--      sell_membership_split() acepta los dos montos y deja UN MOVIMIENTO POR
--      MEDIO en la caja del día: es lo que realmente entró por cada lado, y
--      así los totales por medio (y el arqueo del efectivo al cerrar) siguen
--      saliendo solos, sin tocar close_cash_register() ni la vista de caja.
--
--   2) CORREGIR EL PASE SIN AFECTAR LA CAJA. Si le cargaste el plan
--      equivocado a un socio, hoy la única salida era volver a venderle el
--      pase correcto: eso registraba un segundo cobro y la caja del día
--      quedaba inflada. set_membership_plan() cambia el plan del pase ya
--      vendido (y recalcula las entradas) sin registrar ningún cobro nuevo.
--      El cobro que ya está en la caja queda intacto: no se duplica, no se
--      borra, no cambia de monto.
--
-- Igual que set_membership_period_end(), corregir el plan a mano es de
-- manager (superadmin o admin): el profesor vende y renueva, no corrige.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. sell_membership_split — la venta, ahora con pago dividido.
--    Reemplaza en la práctica a sell_membership(); esa queda como envoltorio
--    (ver punto 2) para no romper nada que la llame con el modelo viejo.
-- ---------------------------------------------------------------------------
create or replace function sell_membership_split(
  p_member_id      uuid,
  p_plan_id        uuid,
  p_cash_cents     integer default 0,
  p_transfer_cents integer default 0,
  p_start          date default null,
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
  if v_cash < 0 or v_transfer < 0 then
    raise exception 'Los montos cobrados no pueden ser negativos.';
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

  -- Una fila por medio de pago. Las dos apuntan a la misma membership_id, así
  -- que la venta se puede reconstruir entera si algún día hace falta.
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

  -- Pase bonificado / de cortesía: no entró plata, pero la venta igual queda
  -- registrada. Es el mismo comportamiento que tenía sell_membership() con
  -- monto 0, y sirve para que el movimiento aparezca en la caja del día.
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
    'payment_id',    v_ids[1],          -- compatibilidad con el formato viejo
    'payment_ids',   to_jsonb(v_ids)
  );
end;
$$;

comment on function sell_membership_split is
  'Renueva el pase y registra el cobro, que puede repartirse entre efectivo y transferencia. Un movimiento de caja por cada medio con monto mayor a cero.';


-- ---------------------------------------------------------------------------
-- 2. sell_membership — mismo nombre y firma de siempre, pero ahora delega.
--    Una sola implementación de la venta, así no se desincronizan.
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
language sql
security definer
set search_path = public
as $$
  select sell_membership_split(
    p_member_id,
    p_plan_id,
    case when p_method = 'cash'     then coalesce(p_amount_cents, 0) else 0 end,
    case when p_method = 'transfer' then coalesce(p_amount_cents, 0) else 0 end,
    p_start,
    p_uses_override
  )
$$;

comment on function sell_membership is
  'Venta de un solo medio de pago. Envoltorio de sell_membership_split().';


-- ---------------------------------------------------------------------------
-- 3. set_membership_plan — corregir el plan de un pase ya vendido.
--
--    NO toca payments: el cobro que ya está en la caja queda como está. Solo
--    cambia a qué plan corresponde el pase y cuántas entradas tiene.
--
--    Las entradas ya usadas se respetan: si el socio entró 3 veces, sigue
--    teniendo 3 usadas con el plan nuevo. Si el plan nuevo tiene menos
--    entradas que las que ya gastó, la función corta con un error legible en
--    vez de dejar el contador en un estado imposible.
--
--    Tampoco toca el estado ni las fechas del pase: para el vencimiento ya
--    está set_membership_period_end() (ver 17_edit_membership_expiration.sql).
-- ---------------------------------------------------------------------------
create or replace function set_membership_plan(
  p_membership_id uuid,
  p_plan_id       uuid,
  p_uses_override integer default null
)
returns memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership memberships;
  v_plan       plans;
  v_used       integer;
  v_total      integer;
  v_new        memberships;
begin
  if not is_manager() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select * into v_membership from memberships where id = p_membership_id;
  if not found then
    raise exception 'El pase indicado no existe';
  end if;

  select * into v_plan from plans where id = p_plan_id;
  if not found then
    raise exception 'El plan indicado no existe';
  end if;

  v_used  := v_membership.uses_total - v_membership.uses_remaining;
  v_total := coalesce(p_uses_override, v_plan.uses_per_period);

  if v_total <= 0 then
    raise exception 'El pase tiene que tener al menos una entrada.';
  end if;

  if v_total < v_used then
    raise exception
      'El socio ya usó % entradas de este pase y el plan elegido trae %. Poné a mano una cantidad de entradas de % o más.',
      v_used, v_total, v_used;
  end if;

  update memberships
     set plan_id        = p_plan_id,
         uses_total     = v_total,
         uses_remaining = v_total - v_used
   where id = p_membership_id
  returning * into v_new;

  return v_new;
end;
$$;

comment on function set_membership_plan is
  'Corrige el plan (y las entradas) de un pase ya vendido, sin registrar ningún cobro: la caja no se toca. Solo manager.';


-- ---------------------------------------------------------------------------
-- 4. Permisos. Mismo patrón que el resto: nada para anon.
-- ---------------------------------------------------------------------------
revoke execute on function sell_membership_split(uuid, uuid, integer, integer, date, integer) from anon;
revoke execute on function set_membership_plan(uuid, uuid, integer)                           from anon;
grant  execute on function sell_membership_split(uuid, uuid, integer, integer, date, integer) to authenticated;
grant  execute on function set_membership_plan(uuid, uuid, integer)                           to authenticated;

-- ============================================================================
-- Probalo:
--   select open_cash_register(1000000);
--
--   -- Pase de $100.000: $40.000 efectivo + $60.000 transferencia
--   select sell_membership_split('<member_id>', '<plan_id>', 4000000, 6000000);
--   select method, amount_cents from payments where local_date = gym_local_date(now());
--   -- dos filas: cash 4000000 y transfer 6000000
--
--   -- Le cargaste el plan equivocado: corregilo sin tocar la caja
--   select set_membership_plan('<membership_id>', '<plan_id_correcto>');
--   select count(*) from payments where local_date = gym_local_date(now());
--   -- sigue siendo 2: no se agregó ningún cobro
-- ============================================================================
