-- ============================================================================
-- GIMNASIO - Parche: roles programador / dueño / profesor (Etapa X)
--
-- Corré esto DESPUÉS de 27_renewal_always_same_day.sql.
--
-- Reemplaza los roles de 18_roles.sql (superadmin / admin / profesor):
--
--   programador  (era superadmin) Control total. Lo único que el dueño no
--                puede hacer: cambiar roles, crear o borrar cuentas de dueño
--                o programador, y borrar un socio para siempre.
--   dueno        (era admin) Todo el gimnasio: precios, anular cobros,
--                corregir vencimientos, dar de baja socios, reabrir la caja,
--                y dar de alta o borrar cuentas de profesor.
--   profesor     El que está en la sala: socios, cobrar pases, abrir y
--                cerrar la caja, QR. NO reabre una caja cerrada, NO anula ni
--                modifica cobros, NO toca tablas de caja/pases/entradas por
--                fuera de las funciones, NO ve precios ni cuentas.
--
-- Los nombres de las funciones quedan como estaban para no tocar todas las
-- que ya las usan:
--   is_manager()     = dueño o programador
--   is_superadmin()  = programador
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Renombrar los roles. Las filas existentes cambian solas.
-- ---------------------------------------------------------------------------
alter type admin_role rename value 'superadmin' to 'programador';
alter type admin_role rename value 'admin'      to 'dueno';

alter table admins alter column role set default 'profesor';

comment on column admins.role is
  'programador: control total. dueno: todo el gimnasio y cuentas de profesor. profesor: la sala, sin tocar la caja cerrada ni los cobros.';

-- Las funciones comparan contra el nombre del rol: hay que rehacerlas.
create or replace function is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_admin_role() in ('programador', 'dueno')
$$;

comment on function is_manager is
  '¿Dueño o programador? (precios, anular cobros, corregir vencimientos, reabrir caja). Excluye a profesor.';

create or replace function is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_admin_role() = 'programador'
$$;

comment on function is_superadmin is
  '¿Programador? Cambiar roles, cuentas de dueño/programador, borrar socios para siempre.';


-- ---------------------------------------------------------------------------
-- 2. Cuentas: el dueño ve la lista y maneja solo las de profesor.
-- ---------------------------------------------------------------------------
drop policy if exists admins_read   on admins;
drop policy if exists admins_insert on admins;
drop policy if exists admins_update on admins;
drop policy if exists admins_delete on admins;

create policy admins_read on admins
  for select to authenticated
  using (user_id = (select auth.uid()) or is_manager());

create policy admins_insert on admins
  for insert to authenticated
  with check (is_superadmin() or (is_manager() and role = 'profesor'));

-- Cambiar un rol es solo del programador (el dueño no puede ascender a nadie).
create policy admins_update on admins
  for update to authenticated
  using (is_superadmin())
  with check (is_superadmin());

create policy admins_delete on admins
  for delete to authenticated
  using (is_superadmin() or (is_manager() and role = 'profesor'));


-- ---------------------------------------------------------------------------
-- 3. Caja: abrir sí, reabrir una caja ya cerrada no (borra el cierre).
-- ---------------------------------------------------------------------------
create or replace function open_cash_register(
  p_starting_cash_cents integer,
  p_notes text default null
)
returns cash_openings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := gym_local_date(now());
  v_row   cash_openings;
begin
  if not is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if exists (select 1 from cash_openings where opening_date = v_today)
     and not exists (select 1 from cash_closings where closing_date = v_today)
  then
    raise exception 'La caja de hoy ya está abierta.';
  end if;

  if exists (select 1 from cash_closings where closing_date = v_today)
     and not is_manager()
  then
    raise exception 'La caja de hoy ya está cerrada. Solo el dueño puede reabrirla.'
      using errcode = '42501';
  end if;

  if p_starting_cash_cents is null or p_starting_cash_cents < 0 then
    raise exception 'El fondo inicial no puede ser negativo.';
  end if;

  delete from cash_closings where closing_date = v_today;
  delete from cash_openings where opening_date = v_today;

  insert into cash_openings (opening_date, opened_by, starting_cash_cents, notes)
  values (v_today, auth.uid(), p_starting_cash_cents, p_notes)
  returning * into v_row;

  return v_row;
end;
$$;


-- ---------------------------------------------------------------------------
-- 4. Tablas que la app solo escribe a través de funciones: cualquiera las
--    lee, pero escribirlas directo (saltándose las reglas de las funciones)
--    queda para dueño y programador. Así un profesor no puede, por ejemplo,
--    cambiar el cierre de caja o alargarle un pase a alguien a mano.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['cash_openings', 'cash_closings', 'memberships', 'check_ins', 'settings'] loop
    execute format('drop policy if exists %I on %I', t || '_admin_all', t);
    execute format('drop policy if exists %I on %I', t || '_select',    t);
    execute format('drop policy if exists %I on %I', t || '_insert',    t);
    execute format('drop policy if exists %I on %I', t || '_update',    t);
    execute format('drop policy if exists %I on %I', t || '_delete',    t);

    execute format('create policy %I on %I for select to authenticated using (is_admin())',
                   t || '_select', t);
    execute format('create policy %I on %I for insert to authenticated with check (is_manager())',
                   t || '_insert', t);
    execute format('create policy %I on %I for update to authenticated using (is_manager()) with check (is_manager())',
                   t || '_update', t);
    execute format('create policy %I on %I for delete to authenticated using (is_manager())',
                   t || '_delete', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- 5. Cuentas actuales.
-- ---------------------------------------------------------------------------
-- ciancioangel16@gmail.com ya pasa sola de superadmin a programador.
update admins set role = 'dueno' where email = 'maximiliano.poblete@hotmail.com';

-- ============================================================================
-- Probalo:
--   select email, role from admins;
--   select current_admin_role(), is_manager(), is_superadmin();
-- ============================================================================
