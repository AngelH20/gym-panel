-- ============================================================================
-- GIMNASIO - Parche: vencimiento fijo el día 10 de cada mes (Etapa M)
--
-- Corré esto DESPUÉS de 15_security_hardening.sql.
--
-- Pedido del cliente: el día 10 de cada mes es el plazo máximo para pagar.
-- Antes, el vencimiento de un pase era "fecha de pago + período días del
-- plan" (ej: pagás el 7/09 con un plan de 30 días -> vence el 6/10). Ahora
-- TODO pase (sin importar el plan) vence el día 10 del mes siguiente al que
-- se pagó, sin importar qué día del mes fue el pago.
--
-- Ejemplo real que motivó el cambio: pagó el 7/09, el sistema calculaba
-- vencimiento 6/10 (30 días fijos); el cliente esperaba 10/10.
--
-- Con un piso de 15 días: si pagás muy cerca de fin de mes (ej: el 27/09) el
-- 10/10 le daría solo 13 días de pase, así que en ese caso se corre un mes
-- más (10/11) para no dejar a nadie con menos de dos semanas de pase.
--
-- OJO: plans.period_days queda en la tabla (por si el día de mañana se
-- vuelve al esquema anterior) pero deja de usarse para calcular el
-- vencimiento. uses_per_period sigue siendo la cantidad de entradas del
-- pase, eso no cambia.
-- ============================================================================

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
  v_plan      plans;
  v_start     date;
  v_end       date;
  v_candidate date;
  v_new       memberships;
begin
  if not is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select * into v_plan from plans where id = p_plan_id;
  if not found then
    raise exception 'El plan indicado no existe';
  end if;

  v_start := coalesce(p_start, gym_local_date(now()));

  -- Día 10 del mes siguiente al de pago.
  v_candidate := (date_trunc('month', v_start) + interval '1 month' + interval '9 days')::date;

  -- Piso de 15 días: si el 10 del mes que viene queda muy cerca (pagos de
  -- fin de mes), se corre un mes más.
  if (v_candidate - v_start) < 15 then
    v_candidate := (date_trunc('month', v_start) + interval '2 months' + interval '9 days')::date;
  end if;

  v_end := v_candidate;

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
    v_end,
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
  'Renueva/activa un pase. El vencimiento es siempre el día 10 del mes siguiente al de pago (o un mes más si eso da menos de 15 días de pase). No usa plans.period_days.';

-- ============================================================================
-- Probalo:
--   select renew_membership('<member_id>', '<plan_id>', '2026-09-07');
--   -- period_end debería ser 2026-10-10
--
--   select renew_membership('<member_id>', '<plan_id>', '2026-09-27');
--   -- 2026-10-10 da 13 días (< 15) -> period_end debería ser 2026-11-10
--
--   select renew_membership('<member_id>', '<plan_id>', '2026-12-20');
--   -- cruza de año -> period_end debería ser 2027-01-10
-- ============================================================================
