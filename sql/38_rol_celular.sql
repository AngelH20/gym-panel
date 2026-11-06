-- ============================================================================
-- GIMNASIO - Rol "celular" (2 de 2): una cuenta que SOLO muestra el QR
--
-- Corré esto DESPUÉS de 37_rol_celular_enum.sql (en otra transacción).
-- Se puede correr más de una vez: todo es "create or replace" / "drop if
-- exists" + "create".
--
-- Para qué:
--   Un celular apoyado en el mostrador con el QR rotativo de la entrada. Antes
--   había que dejarlo logueado con una cuenta de staff, y cualquiera que
--   agarrara el teléfono podía salir de /qr-movil e iniciar sesión de nuevo...
--   o peor, con esa sesión leer socios y caja desde la API. La cuenta
--   "celular" no puede hacer NADA salvo pedir el QR.
--
-- Cómo:
--   1) is_admin() ("es del staff") deja afuera a 'celular'. is_admin() es lo
--      que habilita leer socios, pases, cobros, caja, entradas y settings
--      (RLS) y lo que piden casi todas las funciones del panel. Con esto el
--      celular, aunque tenga sesión, ve 0 filas y recibe "No autorizado" en
--      todo. Para programador, dueño y profesor no cambia nada.
--      Además usa current_admin_role(), así que si alguien coincidiera con dos
--      filas (por user_id y por email) manda la del user_id, igual que el rol.
--
--   2) is_qr_device(): ¿la sesión es la de un celular del mostrador?
--
--   3) current_qr_token(): lo pueden pedir el staff (como siempre) o el
--      celular. Es lo único que el celular puede hacer.
--
--   4) qr_rotate_seconds(): cada cuántos segundos cambia el QR. Antes
--      /qr-movil lo leía directo de settings, que el celular ya no puede leer
--      (y no tiene por qué: settings tiene más cosas).
--
--   5) Cuentas: el dueño puede crear y borrar cuentas de profesor y de
--      celular (antes solo profesor). El programador, todas, como siempre.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Staff = cualquier rol del panel menos el celular.
-- ---------------------------------------------------------------------------
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_admin_role() <> 'celular', false)
$$;

comment on function is_admin is
  '¿Es del staff (programador, dueño o profesor)? El rol celular NO cuenta: solo puede pedir el QR (ver 38_rol_celular.sql). Nunca devuelve NULL.';


-- ---------------------------------------------------------------------------
-- 2. ¿Es el celular del mostrador?
-- ---------------------------------------------------------------------------
create or replace function is_qr_device()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_admin_role() = 'celular', false)
$$;

comment on function is_qr_device is
  '¿La sesión es la de un celular del mostrador (rol celular)? Solo sirve para mostrar el QR.';

revoke execute on function is_qr_device() from public, anon;
grant  execute on function is_qr_device() to authenticated;


-- ---------------------------------------------------------------------------
-- 3. El QR: staff o celular.
-- ---------------------------------------------------------------------------
create or replace function current_qr_token(p_window_offset integer default 0)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not (is_admin() or is_qr_device()) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if coalesce(p_window_offset, 0) not in (0, 1) then
    raise exception 'Ventana de QR inválida.' using errcode = '22023';
  end if;
  return private.qr_token_for_window(coalesce(p_window_offset, 0));
end;
$$;


-- ---------------------------------------------------------------------------
-- 4. Cada cuántos segundos rota el QR (mismo default que
--    qr_token_seconds_left). No es secreto, pero tampoco hace falta abrirle
--    settings entera al celular.
-- ---------------------------------------------------------------------------
create or replace function qr_rotate_seconds()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(coalesce((select (value #>> '{}')::integer
                              from settings where key = 'qr_rotate_seconds'), 40), 5)
$$;

revoke execute on function qr_rotate_seconds() from public, anon;
grant  execute on function qr_rotate_seconds() to authenticated;


-- ---------------------------------------------------------------------------
-- 5. Cuentas: el dueño maneja profesores y celulares.
-- ---------------------------------------------------------------------------
drop policy if exists admins_insert on admins;
create policy admins_insert on admins
  for insert to authenticated
  with check (is_superadmin() or (is_manager() and role in ('profesor', 'celular')));

drop policy if exists admins_delete on admins;
create policy admins_delete on admins
  for delete to authenticated
  using (is_superadmin() or (is_manager() and role in ('profesor', 'celular')));

commit;

-- ============================================================================
-- Probalo (dentro de begin; ... rollback;), con una fila de admins de rol
-- 'celular' y su sesión simulada (set local role authenticated +
-- request.jwt.claims):
--   select is_admin(), is_qr_device();          -- false, true
--   select current_qr_token() is not null;      -- true
--   select count(*) from members;               -- 0 (RLS)
--   select count(*) from payments;              -- 0
--   select add_cash_movement('income', 100, 'cash', 'x');   -- No autorizado
-- Y como profesor/dueño/programador: is_admin() = true, como siempre.
-- ============================================================================
