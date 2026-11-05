-- ============================================================================
-- GIMNASIO - Parche: controles al cobrar un pase (doble cobro, fecha de pago
-- equivocada, socio dado de baja)
--
-- Corré esto DESPUÉS de 40_void_sale_restore_previous.sql (no depende de él,
-- pero respetá el orden). Se puede correr más de una vez: es un
-- "create or replace" con la misma firma y los mismos permisos que la versión
-- vigente de sell_membership_split(). La app no cambia.
--
-- Problemas encontrados probando (05/11/2026), todos con la caja abierta y
-- un usuario del staff:
--
--   1) DOBLE COBRO. Cobrar dos veces seguidas el mismo pase al mismo socio
--      (doble clic, o la recepcionista que no vio que ya se había cargado)
--      registraba DOS cobros en la caja: el primer pase quedaba 'expired' sin
--      usar y el segundo 'active'. La caja esperaba el doble de efectivo
--      (diferencia negativa al cerrar) y el socio no ganaba nada.
--      Ahora: si el socio ya tiene vigente un pase del MISMO plan, que
--      arranca el MISMO día y se cobró hoy (cobro sin anular), no se cobra de
--      nuevo. Si el primero estaba mal, se anula y se vuelve a cobrar.
--      Además se bloquea la fila del socio: dos cobros simultáneos ya no
--      terminan en un error interno de clave duplicada, el segundo espera al
--      primero y recibe este mismo aviso.
--
--   2) FECHA DE PAGO EQUIVOCADA. La "fecha de pago" (retroactiva) no tenía
--      tope hacia atrás. Con 05/11/2025 en vez de 05/11/2026 (un error de
--      tipeo en el año) se cobraba, el pase vigente del socio se daba por
--      terminado y el nuevo nacía YA VENCIDO (05/11/2025 -> 05/12/2025): el
--      socio pagó y no podía entrar. Ahora se rechaza una fecha de pago con la
--      que el pase ya estaría vencido hoy.
--
--   3) SOCIO DADO DE BAJA. Se le podía cobrar un pase a un socio archivado (el
--      panel no muestra el botón, pero la función lo aceptaba) y con ese pase
--      entraba por el QR aunque estuviera dado de baja. Ahora pide reactivarlo
--      primero.
-- ============================================================================

begin;

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
  v_start      date := coalesce(p_start, gym_local_date(now()));
  v_plan       plans;
  v_member     members;
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
  if p_start is not null and p_start > v_today then
    raise exception 'El pase no puede arrancar en una fecha futura.';
  end if;
  -- Nuevo: con esa fecha de pago, el pase tiene que servir por lo menos hoy.
  if membership_end_for(v_start) < v_today then
    raise exception 'Con esa fecha de pago (%) el pase ya estaría vencido (el %). Revisá la fecha.',
      to_char(v_start, 'DD/MM/YYYY'), to_char(membership_end_for(v_start), 'DD/MM/YYYY');
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

  -- Nuevo: bloqueo al socio. Dos cobros al mismo socio al mismo tiempo van
  -- uno detrás del otro, y el segundo ve el pase que dejó el primero.
  select * into v_member from members where id = p_member_id for update;
  if not found then
    raise exception 'El socio no existe.';
  end if;
  if v_member.archived_at is not null then
    raise exception 'El socio está dado de baja. Reactivalo antes de cobrarle un pase.';
  end if;

  -- Nuevo: el mismo pase ya cobrado hoy = doble cobro.
  if exists (
    select 1
      from memberships ms
     where ms.member_id    = p_member_id
       and ms.status       = 'active'
       and ms.plan_id      = p_plan_id
       and ms.period_start = v_start
       and gym_local_date(ms.created_at) = v_today
       and exists (select 1 from payments p
                    where p.membership_id = ms.id
                      and p.voided_at is null)
  ) then
    raise exception 'A este socio ya se le cobró hoy el plan "%" con la misma fecha de pago. Para no cobrarlo dos veces, no se registró. Si el cobro anterior estaba mal, anulalo desde Caja y volvé a cobrar.',
      v_plan.name;
  end if;

  select * into v_membership
  from renew_membership(p_member_id, p_plan_id, p_start, p_uses_override);
  if v_cash > 0 then
    insert into payments (member_id, membership_id, plan_id, plan_name, amount_cents, method, local_date, created_by)
    values (p_member_id, v_membership.id, p_plan_id, v_plan.name, v_cash, 'cash', v_today, auth.uid())
    returning id into v_id;
    v_ids := v_ids || v_id;
  end if;
  if v_transfer > 0 then
    insert into payments (member_id, membership_id, plan_id, plan_name, amount_cents, method, local_date, created_by)
    values (p_member_id, v_membership.id, p_plan_id, v_plan.name, v_transfer, 'transfer', v_today, auth.uid())
    returning id into v_id;
    v_ids := v_ids || v_id;
  end if;
  if v_cash = 0 and v_transfer = 0 then
    insert into payments (member_id, membership_id, plan_id, plan_name, amount_cents, method, local_date, created_by)
    values (p_member_id, v_membership.id, p_plan_id, v_plan.name, 0, 'cash', v_today, auth.uid())
    returning id into v_id;
    v_ids := v_ids || v_id;
  end if;
  return jsonb_build_object('membership_id', v_membership.id, 'payment_id', v_ids[1], 'payment_ids', to_jsonb(v_ids));
end;
$$;

revoke execute on function sell_membership_split(uuid, uuid, integer, integer, date, integer) from public, anon;
grant  execute on function sell_membership_split(uuid, uuid, integer, integer, date, integer) to authenticated;

commit;

-- ============================================================================
-- Probalo (dentro de begin; ... rollback;, con la caja de hoy abierta):
--   * Cobrar dos veces seguidas el mismo plan al mismo socio: el segundo da
--     "A este socio ya se le cobró hoy...". Anulando el primero, se puede.
--   * Fecha de pago 05/11/2025 (hoy 05/11/2026): "el pase ya estaría vencido".
--     Fecha de pago de hace un mes justo (05/10/2026): se acepta, vence hoy.
--   * Socio archivado: "Reactivalo antes de cobrarle un pase".
-- ============================================================================
