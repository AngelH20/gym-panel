-- ============================================================================
-- GIMNASIO - Parche: roles de acceso (Etapa O)
--
-- Corré esto DESPUÉS de 17_edit_membership_expiration.sql.
--
-- Hasta ahora "admin" era binario: estabas en la tabla admins o no. Esto
-- agrega tres niveles:
--
--   superadmin  El programador. Todo, incluida la gestión de cuentas
--               (crear/borrar staff, cambiar roles).
--   admin       El dueño y su pareja. Todo el uso operativo: socios, pases,
--               planes (precios), caja. No gestiona cuentas de otra gente.
--   profesor    Cajero de piso: da de alta socios, les vende/renueva el
--               pase, abre y cierra caja, opera el QR de acceso. NO puede
--               corregir el vencimiento a mano (set_membership_period_end),
--               NI borrar un socio, NI tocar precios de los planes, NI
--               gestionar cuentas.
--
-- Todo el mundo (los tres roles) sigue pudiendo entrar al panel: is_admin()
-- no cambia de significado, sigue siendo "está en la allowlist". Lo nuevo es
-- is_manager() (superadmin o admin) e is_superadmin(), que gatean lo que
-- antes solo dependía de is_admin().
--
-- OJO: después de correr esto, TODAS las cuentas existentes en admins pasan
-- a role='admin' por default. Tenés que promocionarte a superadmin a mano:
--
--   update admins set role = 'superadmin' where email = 'TU-EMAIL-DE-ADMIN';
-- ============================================================================

do $$ begin
  create type admin_role as enum ('superadmin', 'admin', 'profesor');
exception when duplicate_object then null; end $$;

alter table admins add column if not exists role admin_role not null default 'admin';

comment on column admins.role is
  'superadmin: todo, incluida la gestión de cuentas. admin: todo el uso operativo. profesor: sin corregir vencimientos, sin borrar socios, sin tocar planes ni cuentas.';


-- ---------------------------------------------------------------------------
-- Funciones de rol. Mismo patrón que is_admin(): security definer, stable,
-- leen auth.uid()/auth.jwt() así que no hace falta pasarles nada.
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
  limit 1
$$;

comment on function current_admin_role is
  'Rol del usuario autenticado actual, o null si no está en la allowlist.';

create or replace function is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_admin_role() in ('superadmin', 'admin')
$$;

comment on function is_manager is
  '¿Puede administrar? (precios de planes, borrar socios, corregir vencimientos). Excluye a profesor.';

create or replace function is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_admin_role() = 'superadmin'
$$;

comment on function is_superadmin is
  '¿Puede gestionar cuentas de otro staff? Solo el programador.';

revoke execute on function current_admin_role() from anon;
revoke execute on function is_manager()         from anon;
revoke execute on function is_superadmin()      from anon;
grant  execute on function current_admin_role() to authenticated;
grant  execute on function is_manager()         to authenticated;
grant  execute on function is_superadmin()      to authenticated;


-- ---------------------------------------------------------------------------
-- set_membership_period_end(): antes cualquier admin podía corregir un
-- vencimiento a mano. Ahora solo managers (profesor queda afuera).
-- ---------------------------------------------------------------------------
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
  if not is_manager() then
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


-- ---------------------------------------------------------------------------
-- RLS: members. Antes una sola policy "for all". La partimos para poder
-- exigir is_manager() solo en el DELETE (borrar socio); el resto sigue
-- abierto a cualquier rol logueado, profesor incluido.
-- ---------------------------------------------------------------------------
drop policy if exists members_admin_all on members;

create policy members_select on members
  for select to authenticated
  using (is_admin());

create policy members_insert on members
  for insert to authenticated
  with check (is_admin());

create policy members_update on members
  for update to authenticated
  using (is_admin())
  with check (is_admin());

create policy members_delete on members
  for delete to authenticated
  using (is_manager());


-- ---------------------------------------------------------------------------
-- RLS: plans. Cualquier rol puede leerlos (los necesita para vender un
-- pase); solo managers pueden crear/editar/borrar (precios).
-- ---------------------------------------------------------------------------
drop policy if exists plans_admin_all on plans;

create policy plans_select on plans
  for select to authenticated
  using (is_admin());

create policy plans_write on plans
  for all to authenticated
  using (is_manager())
  with check (is_manager());


-- ---------------------------------------------------------------------------
-- RLS: admins. Antes nadie podía escribir esta tabla desde la app (ni
-- siquiera un admin): el alta de cuentas se hacía a mano en el SQL Editor,
-- con la service_role, que saltea RLS. Ahora sí se puede desde el panel,
-- pero solo para superadmin: cualquiera sigue pudiendo leer su propia fila
-- (para saber su propio rol), pero ver la lista completa y dar de alta,
-- cambiar rol o borrar una cuenta es exclusivo de superadmin.
-- ---------------------------------------------------------------------------
drop policy if exists admins_self_read  on admins;

create policy admins_read on admins
  for select to authenticated
  using (user_id = auth.uid() or is_superadmin());

create policy admins_insert on admins
  for insert to authenticated
  with check (is_superadmin());

create policy admins_update on admins
  for update to authenticated
  using (is_superadmin())
  with check (is_superadmin());

create policy admins_delete on admins
  for delete to authenticated
  using (is_superadmin());

-- ============================================================================
-- No te olvides del UPDATE de tu propia cuenta a superadmin (ver arriba).
--
-- Probalo (logueado como cada rol):
--   select current_admin_role();  -- tu rol
--   select is_manager();          -- true si sos admin o superadmin
--   select is_superadmin();       -- true solo si sos superadmin
-- ============================================================================
