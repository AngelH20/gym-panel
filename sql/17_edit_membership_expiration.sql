-- ============================================================================
-- GIMNASIO - Parche: corregir a mano el vencimiento de un pase (Etapa N)
--
-- Corré esto DESPUÉS de 16_renewal_deadline_day10.sql.
--
-- Para cuando el vencimiento calculado no es el que corresponde (un dato
-- cargado mal, una excepción puntual que pide el gimnasio) o para "reactivar"
-- un pase que quedó marcado como vencido porque el socio intentó entrar
-- después de la fecha límite (perform_check_in lo pasa a 'expired' en ese
-- momento) y no hace falta rehacer toda la venta para arreglarlo.
--
-- No toca uses_remaining ni registra ningún cobro: solo corrige la fecha.
-- ============================================================================

create or replace function set_membership_period_end(
  p_membership_id uuid,
  p_period_end    date
)
returns memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership memberships;
  v_new        memberships;
begin
  if not is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select * into v_membership from memberships where id = p_membership_id;
  if not found then
    raise exception 'El pase indicado no existe';
  end if;

  if p_period_end < v_membership.period_start then
    raise exception 'La fecha de vencimiento no puede ser anterior al inicio del pase (%).',
      to_char(v_membership.period_start, 'DD/MM/YYYY');
  end if;

  -- Si este pase no estaba activo (ej: quedó 'expired' tras un check-in
  -- rechazado), lo volvemos a poner como el vigente del socio. Primero
  -- cerramos cualquier otro pase activo que tuviera (no debería haber
  -- ninguno, pero el índice único de "un activo por socio" no perdona).
  if v_membership.status <> 'active' then
    update memberships
       set status = 'expired'
     where member_id = v_membership.member_id
       and status = 'active'
       and id <> p_membership_id;
  end if;

  update memberships
     set period_end = p_period_end,
         status = 'active'
   where id = p_membership_id
  returning * into v_new;

  return v_new;
end;
$$;

comment on function set_membership_period_end is
  'Corrige a mano el vencimiento de un pase puntual. No toca uses_remaining ni registra cobros.';

revoke execute on function set_membership_period_end(uuid, date) from anon;
grant  execute on function set_membership_period_end(uuid, date) to authenticated;

-- ============================================================================
-- Probalo:
--   select set_membership_period_end('<membership_id>', '2026-10-20');
-- ============================================================================
