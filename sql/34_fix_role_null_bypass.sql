-- ============================================================================
-- GIMNASIO - Parche: is_manager() / is_superadmin() nunca devuelven NULL
-- (auditoría de seguridad del 05/11, hallazgo CRÍTICO)
--
-- Corré esto DESPUÉS de 33_pause_membership.sql.
-- Hacé un backup antes (como siempre). Es idempotente: se puede correr más
-- de una vez sin romper nada. Va todo dentro de una transacción.
--
-- El problema:
--
--   is_manager() era `select current_admin_role() in ('programador','dueno')`.
--   Para un usuario logueado en Supabase Auth que NO tiene fila en admins,
--   current_admin_role() da NULL, y `NULL in (...)` también da NULL (no
--   false). Las funciones solo-dueño se protegen con
--
--       if not is_manager() then raise exception ...
--
--   y `not NULL` es NULL, que plpgsql trata como "no se cumple": NO tira el
--   error y la función sigue como si fuera el dueño. Lo mismo con
--   is_superadmin().
--
--   Funciones que quedaban abiertas a cualquier cuenta de Auth sin rol
--   (probado en producción con begin/rollback, ver el informe):
--     * void_sale()                 -> anular cobros (la plata "desaparece"
--                                      del esperado de la caja)
--     * void_cash_movement()        -> anular gastos/ingresos
--     * set_membership_period_end() -> poner vencimiento 2099
--     * set_membership_plan()       -> 999 entradas
--     * pause_membership() / resume_membership()
--     * unarchive_member()          -> reactivar socios dados de baja
--     (archive_member() fallaba de casualidad porque adentro llama a
--      unlink_family_member(), que usa is_admin()).
--
--   ¿Quién tiene una cuenta de Auth sin fila en admins? Hoy nadie, pero el
--   alta pública de Supabase Auth está PRENDIDA (disable_signup = false en
--   /auth/v1/settings): cualquiera con un email puede registrarse con la
--   clave pública que viaja en el navegador. Un profesor que se arma una
--   segunda cuenta (o un ex profesor que se vuelve a registrar) ve los ids
--   desde el panel y puede anular cobros en efectivo. Además de este
--   parche, APAGÁ el alta pública en el dashboard:
--   Authentication -> Sign In / Providers -> "Allow new users to sign up".
--
-- Qué cambia:
--
--   1) is_manager() e is_superadmin() devuelven siempre true o false
--      (coalesce a false). Así todas las funciones y policies que ya los
--      usan quedan bien sin tener que reescribir ninguna. En las policies
--      de RLS no cambia nada: NULL y false ya se trataban igual ahí.
--
--   2) current_admin_role(): si una sesión coincide con dos filas de admins
--      (una por user_id y otra por email), gana siempre la del user_id. Antes
--      era `limit 1` sin orden: el rol podía salir distinto en cada llamada.
--
-- Mismas firmas, mismos permisos (create or replace conserva los GRANT).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Rol actual: primero la fila que coincide por user_id.
-- ---------------------------------------------------------------------------
create or replace function current_admin_role()
returns admin_role
language sql
stable
security definer
set search_path = public
as $$
  select a.role
  from admins a
  where a.user_id = auth.uid() or a.email = (auth.jwt() ->> 'email')
  order by (a.user_id = auth.uid()) desc nulls last
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- 2. Nunca NULL: sin fila en admins, la respuesta es false.
-- ---------------------------------------------------------------------------
create or replace function is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_admin_role() in ('programador', 'dueno'), false)
$$;

comment on function is_manager is
  '¿Dueño o programador? (precios, anular cobros, corregir vencimientos, reabrir caja). Excluye a profesor. Nunca devuelve NULL (ver 34_fix_role_null_bypass.sql).';

create or replace function is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_admin_role() = 'programador', false)
$$;

comment on function is_superadmin is
  '¿Programador? Cambiar roles, cuentas de dueño/programador, borrar socios para siempre. Nunca devuelve NULL (ver 34_fix_role_null_bypass.sql).';

-- ---------------------------------------------------------------------------
-- 3. Control: con una sesión inventada (sin fila en admins) los tres
--    chequeos tienen que dar false, no NULL. Si no, se deshace todo.
-- ---------------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000aa","email":"nadie@ejemplo.invalid","role":"authenticated"}',
    true);
  if is_admin() is distinct from false
     or is_manager() is distinct from false
     or is_superadmin() is distinct from false then
    raise exception 'is_admin/is_manager/is_superadmin deberían dar false para alguien sin rol';
  end if;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

commit;

-- Para verificar a mano después (como dueño o programador, desde el panel):
--   select current_admin_role(), is_manager(), is_superadmin();
-- Y como alguien sin rol, en una transacción de prueba:
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     '{"sub":"00000000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);
--   select is_manager(), is_superadmin();   -- false, false (antes: NULL, NULL)
--   rollback;
