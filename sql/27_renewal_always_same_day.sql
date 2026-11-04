-- ============================================================================
-- GIMNASIO - Parche: siempre vence el mismo día del mes siguiente (Etapa W)
--
-- Corré esto DESPUÉS de 26_lock_down_anon.sql.
--
-- Saca la excepción del día 10 de 22_renewal_same_day.sql. Ya no hay plazo
-- fijo a principio de mes: cada pase vence el mismo día del mes siguiente al
-- que se pagó, sin importar qué día sea.
--   pagó 5/09  -> vence 5/10
--   pagó 20/09 -> vence 20/10
--   pagó 31/01 -> vence 28/02 (si ese día no existe, el último del mes)
--
-- renew_membership() no cambia: ya llama a membership_end_for().
--
-- Los pases que ya están activos NO se recalculan. A quien pagó del 1 al 9
-- se le había dado hasta el 10, y con la regla nueva se le acortarían días
-- ya cobrados. La regla nueva corre desde el próximo cobro de cada uno.
-- ============================================================================

create or replace function membership_end_for(p_start date)
returns date
language sql
immutable
set search_path = public
as $$
  -- date + interval '1 month' ya recorta al último día del mes si hace falta.
  select (p_start + interval '1 month')::date
$$;

comment on function membership_end_for is
  'Vencimiento de un pase pagado en p_start: el mismo día del mes siguiente (o el último día, si ese mes es más corto).';

revoke execute on function membership_end_for(date) from public, anon;
grant  execute on function membership_end_for(date) to authenticated;

-- ============================================================================
-- Probalo:
--   select membership_end_for('2026-09-05');  -- 2026-10-05
--   select membership_end_for('2026-09-10');  -- 2026-10-10
--   select membership_end_for('2026-09-20');  -- 2026-10-20
--   select membership_end_for('2027-01-31');  -- 2027-02-28
--   select membership_end_for('2026-12-15');  -- 2027-01-15
-- ============================================================================
