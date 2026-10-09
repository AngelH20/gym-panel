-- ============================================================================
-- GIMNASIO - Parche: pack familiar (Etapa Q)
--
-- Corré esto DESPUÉS de 20_birthdays.sql.
--
-- El gimnasio abrió un pack familiar: a partir del TERCER integrante de una
-- familia, el pase libre sale $65.000. Los dos primeros pagan el precio
-- normal.
--
--   1) FAMILIAS. members.family_id agrupa a los socios de una misma familia.
--      No hay tabla de familias: la familia es "los socios que comparten
--      family_id". Se arma vinculando un socio con un familiar desde su
--      ficha (link_family_member) y se desarma quitándolo
--      (unlink_family_member).
--
--   2) PLANES FAMILIARES. plans.is_family marca los planes que solo se pueden
--      vender a un socio cuya familia tiene 3 integrantes o más. Lo hace
--      cumplir un trigger sobre memberships, así vale igual para la venta
--      (sell_membership_split) que para corregir el plan de un pase ya
--      vendido (set_membership_plan), sin tener que reescribirlas.
--
--   3) Se crea el plan "Pase Libre Familiar" a $65.000, con las mismas
--      entradas que el Pase Libre. El precio se edita desde Planes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Columnas
-- ---------------------------------------------------------------------------
alter table members add column if not exists family_id uuid;
create index if not exists members_family_idx on members (family_id) where family_id is not null;

comment on column members.family_id is
  'Socios con el mismo family_id son de la misma familia. Null = sin familia.';

alter table plans add column if not exists is_family boolean not null default false;

comment on column plans.is_family is
  'Plan del pack familiar: solo se vende a socios de una familia de 3 integrantes o más.';


-- ---------------------------------------------------------------------------
-- 2. family_size — cuántos integrantes tiene la familia del socio (él incluido).
--    Un socio sin familia cuenta como 1.
-- ---------------------------------------------------------------------------
create or replace function family_size(p_member_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    (select count(*)::integer
       from members f
       join members m on m.family_id = f.family_id
      where m.id = p_member_id),
    1
  )
$$;


-- ---------------------------------------------------------------------------
-- 3. link_family_member — suma a p_member_id a la familia de p_relative_id.
--    Si ninguno tenía familia, se crea una nueva con los dos. Si los dos ya
--    tenían familias distintas, se unen en una sola.
-- ---------------------------------------------------------------------------
create or replace function link_family_member(p_member_id uuid, p_relative_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_family   uuid;
  v_relative_family uuid;
  v_family          uuid;
begin
  if not is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_member_id = p_relative_id then
    raise exception 'Elegí a otro socio como familiar.';
  end if;

  select family_id into v_member_family   from members where id = p_member_id;
  if not found then raise exception 'El socio no existe'; end if;

  select family_id into v_relative_family from members where id = p_relative_id;
  if not found then raise exception 'El familiar elegido no existe'; end if;

  v_family := coalesce(v_relative_family, v_member_family, gen_random_uuid());

  -- Si el socio venía de otra familia, la familia entera se une a esta.
  if v_member_family is not null and v_member_family <> v_family then
    update members set family_id = v_family where family_id = v_member_family;
  end if;

  update members set family_id = v_family where id in (p_member_id, p_relative_id);

  return v_family;
end;
$$;


-- ---------------------------------------------------------------------------
-- 4. unlink_family_member — saca al socio de su familia. Si en la familia
--    queda uno solo, también se le borra: una familia de uno no es familia.
--    Los pases ya vendidos no se tocan.
-- ---------------------------------------------------------------------------
create or replace function unlink_family_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid;
begin
  if not is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select family_id into v_family from members where id = p_member_id;
  if v_family is null then return; end if;

  update members set family_id = null where id = p_member_id;

  if (select count(*) from members where family_id = v_family) < 2 then
    update members set family_id = null where family_id = v_family;
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- 5. Regla del pack: un plan familiar solo para familias de 3 o más.
-- ---------------------------------------------------------------------------
create or replace function check_family_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from plans where id = new.plan_id and is_family)
     and family_size(new.member_id) < 3 then
    raise exception
      'El pack familiar es a partir del tercer integrante. Vinculá primero al socio con su familia (tiene que haber 3 o más).';
  end if;
  return new;
end;
$$;

drop trigger if exists memberships_family_plan on memberships;
create trigger memberships_family_plan
  before insert or update of plan_id on memberships
  for each row execute function check_family_plan();


-- ---------------------------------------------------------------------------
-- 6. El plan del pack
-- ---------------------------------------------------------------------------
insert into plans (name, description, uses_per_period, period, period_days,
                   price_cash_cents, price_transfer_cents, is_family, sort_order)
select 'Pase Libre Familiar',
       'Pack familiar: desde el tercer integrante de la familia.',
       coalesce((select uses_per_period from plans where name = 'Pase Libre' limit 1), 25),
       'month', 30, 6500000, 6500000, true,
       coalesce((select sort_order from plans where name = 'Pase Libre' limit 1), 0)
where not exists (select 1 from plans where is_family);


-- ---------------------------------------------------------------------------
-- 7. Permisos
-- ---------------------------------------------------------------------------
-- "from public" además de anon: Postgres le da EXECUTE a PUBLIC por defecto,
-- y con solo sacárselo a anon la función seguía llamable sin sesión.
revoke execute on function family_size(uuid)                     from public, anon;
revoke execute on function link_family_member(uuid, uuid)        from public, anon;
revoke execute on function unlink_family_member(uuid)            from public, anon;
revoke execute on function check_family_plan()                   from public, anon, authenticated;
grant  execute on function family_size(uuid)                     to authenticated;
grant  execute on function link_family_member(uuid, uuid)        to authenticated;
grant  execute on function unlink_family_member(uuid)            to authenticated;

-- ============================================================================
-- Probalo:
--   select link_family_member('<hijo_1>', '<madre>');
--   select link_family_member('<hijo_2>', '<madre>');
--   select family_size('<hijo_2>');   -- 3
--   select sell_membership_split('<hijo_2>', '<plan_familiar>', 6500000, 0);
-- ============================================================================
