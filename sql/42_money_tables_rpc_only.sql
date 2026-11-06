-- ============================================================================
-- GIMNASIO - Parche: la plata y las entradas solo se escriben por funciones
--
-- SIN APLICAR y SIN PROBAR contra producción (ver "Prueba" abajo).
-- Corré esto DESPUÉS de 50 y de 41.
-- Se puede correr más de una vez (revoke y "drop policy if exists" no fallan
-- si ya está hecho). Va en una transacción: entra entero o no entra nada.
--
-- Qué cambia y por qué:
--
--   La app NUNCA escribe directo en payments, cash_movements, cash_openings,
--   cash_closings, check_ins, memberships ni settings: todo pasa por las
--   funciones SECURITY DEFINER (sell_membership_split, void_sale,
--   add_cash_movement, open/close_cash_register, pause_membership,
--   perform_check_in_by_dni, etc.), que validan rol, montos y estado de la
--   caja, y dejan quién y por qué (voided_by, void_reason, ...).
--
--   Pero la RLS seguía dejando al dueño/programador hacer INSERT, UPDATE y
--   DELETE directo por la API REST (/rest/v1/payments, ...). Con una sesión
--   de dueño robada (o un error de la app) se podía:
--     * borrar un cobro en vez de anularlo: desaparece sin rastro y el cierre
--       de caja de ese día queda descuadrado. Ya pasó una vez: el cierre del
--       06/10 dice 3 cobros / $150.000 y hoy hay 2 / $100.000 (fue antes de
--       que existiera "anular", pero nada impedía repetirlo);
--     * cambiar el monto de un cobro o de un cierre ya hecho;
--     * insertar cobros, entradas o pases "a mano", sin las validaciones;
--     * poner access_mode = 'off' en settings (check-in sin QR).
--
--   Ahora authenticated solo puede LEER esas tablas (con la misma RLS de
--   siempre). Las funciones corren como el dueño de las tablas (postgres),
--   así que siguen andando igual; el check-in usa la service_role, que
--   tampoco se ve afectada. El dueño de la base sigue pudiendo corregir a
--   mano desde el SQL editor de Supabase (corre como postgres).
--
--   No se toca: members, plans y admins (la app sí escribe directo ahí, con
--   su RLS: members = staff, plans = dueño, admins = reglas de roles).
--
--   member_overview: es una vista de solo lectura (tiene joins, Postgres no
--   la deja actualizar igual), pero tenía permisos de INSERT/UPDATE/DELETE
--   "de regalo". Se dejan solo los de lectura, por prolijidad.
--
-- Si algún día la app necesita escribir directo en alguna de estas tablas,
-- lo correcto es hacer una función nueva que valide, no reabrir el permiso.
--
-- Cómo revertir (todo o la tabla que haga falta):
--   grant insert, update, delete on <tabla> to authenticated;
--   create policy <tabla>_insert on <tabla> for insert to authenticated with check (is_manager());
--   create policy <tabla>_update on <tabla> for update to authenticated using (is_manager()) with check (is_manager());
--   create policy <tabla>_delete on <tabla> for delete to authenticated using (is_manager());
--   (member_overview: grant insert, update, delete on member_overview to authenticated;)
--
-- Prueba: PENDIENTE. La prueba con begin/rollback no se pudo correr de noche
-- (la herramienta pidió confirmación manual y nadie estaba para darla).
-- Antes de aplicarlo, correr en el SQL editor, en UNA sola ejecución:
--   begin; <cuerpo de este archivo sin begin/commit>; <pruebas>; rollback;
-- y verificar:
--   * como dueño (set local role authenticated + request.jwt.claims con su
--     sub): INSERT/UPDATE/DELETE directo en las 7 tablas -> "permission
--     denied"; SELECT sigue viendo todo.
--   * como dueño: open_cash_register, sell_membership_split,
--     add_cash_movement, void_cash_movement, pause/resume_membership,
--     set_membership_period_end/plan, void_sale, close_cash_register,
--     archive_member -> todas OK (corren como postgres, no deberían cambiar).
--   * como profesor: sell_membership_split OK.
--   * como programador: borrar un socio (cascada a pases/entradas, cobros con
--     member_id null) y borrar un plan sin pases -> OK (las acciones de FK
--     corren como dueño de la tabla, no como authenticated).
--   * perform_check_in_by_dni como service_role -> OK.
-- ============================================================================

begin;

do $$
declare
  t text;
begin
  foreach t in array array[
    'payments', 'cash_movements', 'cash_openings', 'cash_closings',
    'check_ins', 'memberships', 'settings'
  ] loop
    -- Permisos: solo lectura para el panel. anon y public ya no tenían
    -- nada (26_lock_down_anon / 29_security_audit); se reafirma.
    execute format('revoke insert, update, delete, truncate on %I from public, anon, authenticated', t);

    -- Las policies de escritura ya no sirven (sin permiso, la RLS ni se
    -- evalúa), pero las sacamos para que nadie crea que hay un camino.
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format('drop policy if exists %I on %I', t || '_delete', t);
  end loop;
end $$;

revoke insert, update, delete, truncate on member_overview from public, anon, authenticated;

commit;
