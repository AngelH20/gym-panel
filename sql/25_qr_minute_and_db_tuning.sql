-- ============================================================================
-- GIMNASIO - Parche: QR de 1 minuto y ajustes de rendimiento (Etapa U)
--
-- Corré esto DESPUÉS de 24_keep_payments_and_archive.sql.
--
-- 1) El QR de acceso rota cada 60 segundos (antes 30). El anterior sigue
--    valiendo 20 segundos más después de rotar, igual que antes.
--
-- 2) Rendimiento, según el revisor de Supabase. Con 51 socios no se nota,
--    pero son cosas que empeoran a medida que se acumulan entradas:
--    * member_overview busca la última entrada de cada socio. Sin un índice
--      por socio recorría todas las entradas recientes del gimnasio para
--      cada uno.
--    * members tenía dos índices idénticos sobre qr_token.
--    * payments y plans tenían una policy "for all" que se sumaba a la de
--      select: Postgres evaluaba las dos en cada lectura.
--    * admins_read llamaba a auth.uid() una vez por fila.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. QR de 1 minuto.
-- ---------------------------------------------------------------------------
update settings set value = '60'::jsonb where key = 'qr_rotate_seconds';


-- ---------------------------------------------------------------------------
-- 2a. Índices.
-- ---------------------------------------------------------------------------
create index if not exists check_ins_member_at_idx
  on check_ins (member_id, checked_in_at desc);

-- members_qr_token_key (el del unique) se queda; este era una copia.
drop index if exists members_qr_token_idx;


-- ---------------------------------------------------------------------------
-- 2b. Policies de escritura separadas de la de lectura. Mismos permisos que
--     antes: todos los roles leen, solo manager escribe directo.
-- ---------------------------------------------------------------------------
drop policy if exists payments_write  on payments;
drop policy if exists payments_insert on payments;
drop policy if exists payments_update on payments;
drop policy if exists payments_delete on payments;

create policy payments_insert on payments
  for insert to authenticated with check (is_manager());
create policy payments_update on payments
  for update to authenticated using (is_manager()) with check (is_manager());
create policy payments_delete on payments
  for delete to authenticated using (is_manager());

drop policy if exists plans_write  on plans;
drop policy if exists plans_insert on plans;
drop policy if exists plans_update on plans;
drop policy if exists plans_delete on plans;

create policy plans_insert on plans
  for insert to authenticated with check (is_manager());
create policy plans_update on plans
  for update to authenticated using (is_manager()) with check (is_manager());
create policy plans_delete on plans
  for delete to authenticated using (is_manager());


-- ---------------------------------------------------------------------------
-- 2c. admins_read: auth.uid() envuelto en un select se evalúa una sola vez
--     por consulta, no una vez por fila.
-- ---------------------------------------------------------------------------
drop policy if exists admins_read on admins;
create policy admins_read on admins
  for select to authenticated
  using (user_id = (select auth.uid()) or is_superadmin());
