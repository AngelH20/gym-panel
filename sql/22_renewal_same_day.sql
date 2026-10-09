-- ============================================================================
-- GIMNASIO - Parche: vencimiento el mismo día del mes siguiente (Etapa R)
--
-- Corré esto DESPUÉS de 21_family_pack.sql.
--
-- Reemplaza la regla de 16_renewal_deadline_day10.sql. El día 10 no era un
-- vencimiento para todos: es el plazo para los que pagan a principio de mes.
-- Con la regla vieja, alguien que pagaba el 20/09 vencía el 10/10 (veinte
-- días de pase) y el panel lo mostraba para cobrar junto con todos los demás.
--
-- Regla nueva, según el día del mes en que se pagó:
--   * del 1 al 10   -> vence el 10 del mes siguiente  (pagó 5/09  -> 10/10)
--   * del 11 en más -> el mismo día del mes siguiente (pagó 20/09 -> 20/10)
--     Si ese día no existe (pagó 31/01), el último día del mes (28/02).
--
-- Al vencer se sigue bloqueando la entrada, como antes. Lo que cambia es
-- cuándo vence cada uno, y con eso, cuándo aparece en "Hay que cobrarles".
--
-- También recalcula los pases activos que todavía no vencieron, para que
-- nadie que pagó a mitad de septiembre quede cortado el 10/10. Solo toca los
-- que tienen exactamente la fecha que les había puesto la regla vieja (si
-- alguien corrigió un vencimiento a mano, se respeta), y solo para alargar.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La regla, en un solo lugar.
-- ---------------------------------------------------------------------------
create or replace function membership_end_for(p_start date)
returns date
language sql
immutable
set search_path = public
as $$
  select case
    when extract(day from p_start) <= 10
      then (date_trunc('month', p_start) + interval '1 month' + interval '9 days')::date
    -- date + interval '1 month' ya recorta al último día del mes si hace falta.
    else (p_start + interval '1 month')::date
  end
$$;

comment on function membership_end_for is
  'Vencimiento de un pase pagado en p_start: del 1 al 10 vence el 10 del mes siguiente; del 11 en adelante, el mismo día del mes siguiente.';


-- ---------------------------------------------------------------------------
-- 2. renew_membership con la regla nueva. Todo lo demás, igual que en 16.
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
  if not is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

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
    membership_end_for(v_start),
    coalesce(p_uses_override, v_plan.uses_per_period),
    coalesce(p_uses_override, v_plan.uses_per_period),
    'active',
    auth.uid()
  )
  returning * into v_new;

  return v_new;
end;
$$;

comment on function renew_membership is
  'Renueva/activa un pase. Vencimiento: ver membership_end_for(). No usa plans.period_days.';


-- ---------------------------------------------------------------------------
-- 3. Recalcular los pases vigentes que tienen la fecha de la regla vieja.
-- ---------------------------------------------------------------------------
update memberships m
   set period_end = membership_end_for(m.period_start)
 where m.status = 'active'
   and m.period_end >= gym_local_date(now())
   and m.period_end = (
     -- Regla vieja (16): el 10 del mes siguiente, o un mes más si daba < 15 días.
     case
       when (date_trunc('month', m.period_start) + interval '1 month' + interval '9 days')::date
            - m.period_start < 15
         then (date_trunc('month', m.period_start) + interval '2 months' + interval '9 days')::date
       else (date_trunc('month', m.period_start) + interval '1 month' + interval '9 days')::date
     end
   )
   -- Solo alargar: a nadie se le acortan días que ya se le habían dado (ej:
   -- pagó el 28/09, tenía hasta el 10/11; con la regla nueva sería el 28/10).
   and membership_end_for(m.period_start) > m.period_end;

revoke execute on function membership_end_for(date) from public, anon;
grant  execute on function membership_end_for(date) to authenticated;

-- ============================================================================
-- Probalo:
--   select membership_end_for('2026-09-05');  -- 2026-10-10
--   select membership_end_for('2026-09-10');  -- 2026-10-10
--   select membership_end_for('2026-09-20');  -- 2026-10-20
--   select membership_end_for('2027-01-31');  -- 2027-02-28
--   select membership_end_for('2026-12-15');  -- 2027-01-15
-- ============================================================================
