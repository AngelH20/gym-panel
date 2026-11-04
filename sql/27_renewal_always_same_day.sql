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
-- Los pases activos se recalcularon aparte el 04/11/2026 (27 pases, ver
-- abajo). Antes se guardó una copia en backups.memberships_20261104.
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

-- ---------------------------------------------------------------------------
-- Recalcular los pases activos con la regla nueva (corrido el 04/11/2026).
-- Primero, copia de seguridad en un esquema que la API no expone.
-- Se excluye un pase cuya fecha se había corregido a mano.
-- ---------------------------------------------------------------------------
-- create schema if not exists backups;
-- revoke all on schema backups from public, anon, authenticated;
-- create table backups.memberships_20261104 as select * from public.memberships;
-- revoke all on backups.memberships_20261104 from public, anon, authenticated;
--
-- update public.memberships m
--    set period_end = membership_end_for(m.period_start)
--  where m.status = 'active'
--    and m.period_end <> membership_end_for(m.period_start)
--    and m.id <> 'f9b98374-0500-4aa3-8e72-af30374121f7';
--
-- Para deshacer:
-- update public.memberships m set period_end = b.period_end
--   from backups.memberships_20261104 b
--  where b.id = m.id and b.period_end <> m.period_end;

-- ============================================================================
-- Probalo:
--   select membership_end_for('2026-09-05');  -- 2026-10-05
--   select membership_end_for('2026-09-10');  -- 2026-10-10
--   select membership_end_for('2026-09-20');  -- 2026-10-20
--   select membership_end_for('2027-01-31');  -- 2027-02-28
--   select membership_end_for('2026-12-15');  -- 2027-01-15
-- ============================================================================
