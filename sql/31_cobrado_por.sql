-- ============================================================================
-- GIMNASIO - Parche: quién cobró cada movimiento de caja
--
-- Corré esto DESPUÉS de 30_performance.sql.
--
-- payments.created_by guarda el uuid de quien vendió el pase, pero en la
-- Caja no se podía mostrar el nombre: un profesor no puede leer las filas de
-- otros en admins (RLS de admins_read), así que el cruce le volvía vacío.
-- Igual que member_name y voided_by_name, el nombre se guarda en el propio
-- cobro al momento de la venta:
--
-- 1) Columna payments.created_by_name (texto, puede ser null).
-- 2) Trigger BEFORE INSERT que la completa con el nombre (o el email, si no
--    tiene nombre cargado) del admin logueado, con la misma búsqueda que usa
--    void_sale() para voided_by_name.
-- 3) Backfill de los cobros que ya existen, a partir de created_by.
--
-- Es una foto del momento: si después le cambian el nombre a la cuenta, los
-- cobros viejos siguen diciendo el nombre de entonces (como la anulación).
--
-- Se puede correr más de una vez: "if not exists", "create or replace",
-- "drop trigger if exists" y el backfill solo toca filas sin nombre.
--
-- El panel ya está preparado: muestra "Cobró: ..." solo si la columna existe
-- y tiene valor (lee payments con select *), así que el orden entre este SQL
-- y el deploy del código no importa.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. La columna.
-- ---------------------------------------------------------------------------
alter table payments add column if not exists created_by_name text;

comment on column payments.created_by_name is
  'Nombre (o email) del admin que hizo el cobro, guardado al insertar. Ver sql/31_cobrado_por.sql.';


-- ---------------------------------------------------------------------------
-- 2. El trigger.
--
--    SECURITY DEFINER para poder leer admins aunque quien cobra sea un
--    profesor (la RLS de admins solo le deja ver su propia fila; acá igual
--    se busca solo la suya, pero por las dudas de que la policy cambie).
--    search_path fijo: una función SECURITY DEFINER no puede depender del
--    search_path de quien la dispara.
--
--    - Con sesión (el caso normal: sell_membership_split desde el panel):
--      SIEMPRE se pisa con el nombre del que está logueado, aunque el insert
--      traiga otro valor. Nadie puede anotar un cobro a nombre de otro.
--    - Sin sesión (SQL editor, service role): si no vino un nombre, se busca
--      por created_by; si tampoco hay, queda null.
-- ---------------------------------------------------------------------------
create or replace function payments_fill_created_by_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text;
begin
  if v_uid is not null then
    select coalesce(nullif(trim(a.full_name), ''), a.email) into v_name
      from admins a
     where a.user_id = v_uid or a.email = (auth.jwt() ->> 'email')
     -- Si hubiera dos filas (una por uuid y otra por email), gana la del uuid.
     order by (a.user_id = v_uid) desc nulls last
     limit 1;
    new.created_by_name := v_name;
  elsif new.created_by_name is null and new.created_by is not null then
    select coalesce(nullif(trim(a.full_name), ''), a.email) into v_name
      from admins a
     where a.user_id = new.created_by
     limit 1;
    new.created_by_name := v_name;
  end if;
  return new;
end;
$$;

-- Los triggers corren en orden alfabético: este va antes que
-- payments_fill_member_name, y no dependen uno del otro.
drop trigger if exists payments_fill_created_by_name on payments;
create trigger payments_fill_created_by_name
  before insert on payments
  for each row execute function payments_fill_created_by_name();

-- Nadie la llama a mano (igual que payments_fill_member_name en 26_...).
-- Revocar EXECUTE no impide que el trigger se dispare.
revoke execute on function payments_fill_created_by_name() from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. Backfill: los cobros que ya existen, por created_by. Los que no tienen
--    created_by (o cuya cuenta ya no está en admins) quedan en null y el
--    panel simplemente no muestra "Cobró".
-- ---------------------------------------------------------------------------
update payments p
   set created_by_name = coalesce(nullif(trim(a.full_name), ''), a.email)
  from admins a
 where a.user_id = p.created_by
   and p.created_by_name is null;

commit;


-- ---------------------------------------------------------------------------
-- Para revisar después de correrlo (solo lectura):
--
--   select created_by_name, count(*) from payments group by 1 order by 2 desc;
--
--   select tgname from pg_trigger
--    where tgrelid = 'payments'::regclass and not tgisinternal;
-- ---------------------------------------------------------------------------
