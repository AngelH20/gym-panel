-- ============================================================================
-- GIMNASIO - Parche: la clave anon no puede hacer nada (Etapa V)
--
-- Corré esto DESPUÉS de 25_qr_minute_and_db_tuning.sql.
--
-- Las migraciones anteriores hacían "revoke execute ... from anon", pero
-- Postgres le da EXECUTE a PUBLIC (todo el mundo) al crear cada función, y
-- anon lo heredaba igual. Con solo la clave anon (sin iniciar sesión) se
-- podía:
--   * leer member_overview entera: nombre, DNI, teléfono y mail de todos
--     los socios. La vista corría con los permisos de su dueño y salteaba
--     la RLS de las tablas.
--   * pedir el QR y el código de acceso vigentes (entrar sin estar en el
--     gimnasio).
--   * abrir o cerrar la caja del día (reabrir borra el cierre).
--
-- Hoy la clave anon no llega al navegador (todo pasa por el servidor), pero
-- Supabase la considera pública: la seguridad no puede depender de eso.
--
-- Nadie del lado de la app usa el rol anon:
--   * el panel entra con sesión (authenticated);
--   * el check-in público (/c) usa la service_role desde el servidor.
-- Así que anon se queda sin nada, y authenticated / service_role conservan
-- los permisos explícitos que ya tenían.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Funciones SECURITY DEFINER: fuera PUBLIC y anon.
-- ---------------------------------------------------------------------------
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end $$;

-- Las funciones nuevas que se creen de acá en adelante ya nacen sin
-- EXECUTE para PUBLIC ni anon: no depende de acordarse en cada migración.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;

-- El trigger que completa member_name no lo llama nadie a mano.
revoke execute on function payments_fill_member_name() from authenticated;


-- ---------------------------------------------------------------------------
-- 2. member_overview respeta la RLS de quien consulta, y anon no la ve.
--    Los admins (los tres roles) siguen viendo todo por las policies de
--    members, memberships, plans y check_ins.
-- ---------------------------------------------------------------------------
alter view member_overview set (security_invoker = true);
revoke all on member_overview from public, anon;


-- ---------------------------------------------------------------------------
-- 3. Abrir y cerrar caja: además del permiso, chequean que sea staff. Mismo
--    cuerpo que en 12_reopen_fix.sql y 23_void_payments.sql, con el chequeo
--    al principio.
-- ---------------------------------------------------------------------------
create or replace function open_cash_register(
  p_starting_cash_cents integer,
  p_notes               text default null
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

create or replace function close_cash_register(
  p_counted_cash_cents integer,
  p_notes              text default null
)
returns cash_closings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today    date := gym_local_date(now());
  v_opening  cash_openings;
  v_cash     integer;
  v_transfer integer;
  v_count    integer;
  v_expected integer;
  v_row      cash_closings;
begin
  if not is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if exists (select 1 from cash_closings where closing_date = v_today) then
    raise exception 'La caja de hoy ya está cerrada.';
  end if;

  select * into v_opening from cash_openings where opening_date = v_today;
  if not found then
    raise exception 'Todavía no abriste la caja hoy.';
  end if;

  if p_counted_cash_cents is null or p_counted_cash_cents < 0 then
    raise exception 'El efectivo contado no puede ser negativo.';
  end if;

  select
    coalesce(sum(amount_cents) filter (where method = 'cash'), 0),
    coalesce(sum(amount_cents) filter (where method = 'transfer'), 0),
    count(*)
  into v_cash, v_transfer, v_count
  from payments
  where local_date = v_today and voided_at is null;

  v_expected := v_opening.starting_cash_cents + v_cash;

  insert into cash_closings (
    closing_date, closed_by,
    starting_cash_cents, total_cash_cents, total_transfer_cents,
    expected_cash_cents, counted_cash_cents, difference_cents,
    payments_count, notes
  )
  values (
    v_today, auth.uid(),
    v_opening.starting_cash_cents, v_cash, v_transfer,
    v_expected, p_counted_cash_cents, p_counted_cash_cents - v_expected,
    v_count, p_notes
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- create or replace conserva los permisos, pero por las dudas:
revoke execute on function open_cash_register(integer, text)  from public, anon;
revoke execute on function close_cash_register(integer, text) from public, anon;
grant  execute on function open_cash_register(integer, text)  to authenticated;
grant  execute on function close_cash_register(integer, text) to authenticated;

-- ============================================================================
-- Probalo:
--   set role anon;
--   select count(*) from member_overview;   -- permission denied
--   select current_qr_token(0);             -- permission denied
--   reset role;
-- ============================================================================
