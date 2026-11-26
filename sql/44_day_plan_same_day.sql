-- =============================================================================
-- 44 · Los planes por día vencen el mismo día (no a fin de mes)
-- =============================================================================
--
-- membership_end_for() suma un mes a la fecha de pago para TODOS los planes
-- (ver sql/27). Con el plan "Día" (1 entrada, period = 'day') eso dejaba la
-- entrada usable cualquier día del mes siguiente.
--
-- Ahora el vencimiento depende del plan:
--   - period = 'day'  -> fecha de pago + (period_days - 1). Con period_days = 1
--                        vence el mismo día: entra hasta las 23:59 (el check-in
--                        rechaza solo si period_end < hoy).
--   - el resto        -> membership_end_for(), igual que antes.
--
-- Cambia solo dónde se calcula el vencimiento al vender:
--   - renew_membership():       period_end del pase nuevo.
--   - sell_membership_split():  el chequeo de "con esa fecha de pago el pase
--                               ya estaría vencido" (pago cargado con fecha
--                               anterior).
-- Nada más de las dos funciones cambia. Los pases ya vendidos no se tocan.
--
-- Respaldo previo de las dos funciones: backups.functions_20261126.
-- Volver atrás: ejecutar el "def" de cada fila de ese respaldo y
--   drop function public.membership_end_for_plan(date, uuid);
-- =============================================================================

-- Respaldo de las definiciones actuales (una sola vez).
create table if not exists backups.functions_20261126 as
select p.proname::text as proname, pg_get_functiondef(p.oid) as def, now() as saved_at
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('renew_membership', 'sell_membership_split');


create or replace function public.membership_end_for_plan(p_start date, p_plan_id uuid)
returns date
language sql
stable
set search_path = public
as $$
  select case
           when p.period = 'day' then p_start + (greatest(p.period_days, 1) - 1)
           else membership_end_for(p_start)
         end
    from plans p
   where p.id = p_plan_id
$$;

comment on function public.membership_end_for_plan(date, uuid) is
  'Vencimiento de un pase según su plan: los planes por día vencen a los period_days - 1 días (el mismo día con 1); el resto, membership_end_for(). Ver sql/44.';

revoke all on function public.membership_end_for_plan(date, uuid) from public, anon;
grant execute on function public.membership_end_for_plan(date, uuid) to authenticated, service_role;


create or replace function public.renew_membership(p_member_id uuid, p_plan_id uuid, p_start date default null::date, p_uses_override integer default null::integer)
 returns memberships
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_plan  plans;
  v_start date;
  v_new   memberships;
begin
  if not is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select * into v_plan from plans where id = p_plan_id;
  if not found then
    raise exception 'El plan indicado no existe';
  end if;

  v_start := coalesce(p_start, gym_local_date(now()));

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
    membership_end_for_plan(v_start, p_plan_id),
    coalesce(p_uses_override, v_plan.uses_per_period),
    coalesce(p_uses_override, v_plan.uses_per_period),
    'active',
    auth.uid()
  )
  returning * into v_new;

  return v_new;
end;
$function$;


create or replace function public.sell_membership_split(p_member_id uuid, p_plan_id uuid, p_cash_cents integer default 0, p_transfer_cents integer default 0, p_start date default null::date, p_uses_override integer default null::integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  if membership_end_for_plan(v_start, p_plan_id) < v_today then
    raise exception 'Con esa fecha de pago (%) el pase ya estaría vencido (el %). Revisá la fecha.',
      to_char(v_start, 'DD/MM/YYYY'), to_char(membership_end_for_plan(v_start, p_plan_id), 'DD/MM/YYYY');
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

  select * into v_member from members where id = p_member_id for update;
  if not found then
    raise exception 'El socio no existe.';
  end if;
  if v_member.archived_at is not null then
    raise exception 'El socio está dado de baja. Reactivalo antes de cobrarle un pase.';
  end if;

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
$function$;
