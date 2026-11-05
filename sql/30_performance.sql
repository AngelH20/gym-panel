-- ============================================================================
-- GIMNASIO - Parche: rendimiento de lecturas (Etapa Z)
--
-- Corré esto DESPUÉS de 29_... (el parche anterior a este).
--
-- No cambia QUIÉN puede hacer QUÉ: las policies quedan con exactamente las
-- mismas condiciones, solo escritas de forma que Postgres las evalúe una vez
-- por consulta en vez de una vez por fila. Ojo: si 29_... rehízo alguna de
-- las policies de lectura de abajo, revisá que la condición siga siendo la
-- misma antes de correr esto (ALTER POLICY reemplaza la condición entera).
--
-- 1) Policies de lectura con la función envuelta en un select.
--    is_admin() / is_manager() son SECURITY DEFINER, así que Postgres no las
--    puede "abrir" y las llama en CADA fila que lee. member_overview es una
--    vista security_invoker que cruza members, memberships, plans y
--    check_ins: con 64 socios eran cientos de llamadas por cada carga del
--    panel o de Socios (EXPLAIN: "Filter: is_admin()" en cada tabla y en
--    cada subconsulta por socio). Métricas con "Todo" leía las 613 entradas
--    y llamaba is_admin() 613 veces (~13 ms solo en eso). Con
--    (select is_admin()) pasa a ser un InitPlan: se calcula una sola vez por
--    consulta y el costo deja de crecer con la cantidad de filas.
--    Las policies de escritura no se tocan: escriben de a una fila y casi
--    todo pasa por funciones SECURITY DEFINER.
--
-- 2) Índices que faltaban, según el revisor de Supabase y los EXPLAIN de la
--    vista. Todos "if not exists": se puede correr más de una vez.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Policies de lectura: misma condición, evaluada una vez por consulta.
-- ---------------------------------------------------------------------------
alter policy members_select       on members       using ((select is_admin()));
alter policy memberships_select   on memberships   using ((select is_admin()));
alter policy plans_select         on plans         using ((select is_admin()));
alter policy check_ins_select     on check_ins     using ((select is_admin()));
alter policy payments_select      on payments      using ((select is_admin()));
alter policy settings_select      on settings      using ((select is_admin()));
alter policy cash_openings_select on cash_openings using ((select is_admin()));
alter policy cash_closings_select on cash_closings using ((select is_admin()));

-- auth.uid() ya estaba envuelto (ver 25_...); faltaba is_manager().
alter policy admins_read on admins
  using (user_id = (select auth.uid()) or (select is_manager()));


-- ---------------------------------------------------------------------------
-- 2a. check_ins por socio y día.
--     member_overview calcula "entró hoy" y "visitas de hoy" para cada socio.
--     Hoy lo resuelve recorriendo todas las entradas del día con
--     check_ins_local_date_idx y filtrando por socio (socios x entradas de
--     hoy). Con este índice va directo a las del socio en esa fecha.
--     check_ins_one_charged_per_day_idx tiene las mismas columnas pero es
--     parcial (where charged): no sirve para contar reingresos.
-- ---------------------------------------------------------------------------
create index if not exists check_ins_member_date_idx
  on check_ins (member_id, local_date);


-- ---------------------------------------------------------------------------
-- 2b. Claves foráneas sin índice (revisor de Supabase, "unindexed foreign
--     keys"). Sin índice, borrar o desactivar un plan o un pase obliga a
--     Postgres a recorrer la tabla entera para chequear la clave foránea.
--     Las de created_by / voided_by / closed_by / opened_by se dejan sin
--     índice a propósito: solo se usan al borrar una cuenta, algo que pasa
--     muy de vez en cuando, y cada índice suma costo a cada cobro.
-- ---------------------------------------------------------------------------
create index if not exists memberships_plan_idx    on memberships (plan_id);
create index if not exists payments_plan_idx       on payments (plan_id);
create index if not exists payments_membership_idx on payments (membership_id);


-- ---------------------------------------------------------------------------
-- 2c. Índices sin uso (revisor de Supabase, "unused index"). La búsqueda
--     de socios usa ilike '%texto%' y ordena por full_name tal cual, así que
--     members_name_idx (sobre lower(full_name)) nunca se usa; members_status_idx
--     tiene dos valores posibles y Postgres prefiere recorrer la tabla. Se
--     dejan comentados: con esta cantidad de socios no molestan, y conviene
--     confirmar en pg_stat_user_indexes que siguen en 0 antes de borrarlos.
-- ---------------------------------------------------------------------------
-- drop index if exists members_name_idx;
-- drop index if exists members_status_idx;


-- ============================================================================
-- Probalo (logueado como admin, o con set local role authenticated + claims):
--   explain analyze select * from member_overview where archived_at is null;
--     -> tiene que aparecer "InitPlan" con is_admin() una sola vez, y ya no
--        "Filter: is_admin()" dentro de cada Index Scan.
--   select policyname, qual from pg_policies
--    where schemaname = 'public' and cmd = 'SELECT';
--     -> todas con (SELECT is_admin() ...) envuelto.
-- ============================================================================
