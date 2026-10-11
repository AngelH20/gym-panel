-- ============================================================================
-- GIMNASIO - Parche: la caja no se toca al borrar un socio + dar de baja
--               (archivar) en vez de borrar (Etapa T)
--
-- Corré esto DESPUÉS de 23_void_payments.sql.
--
-- 1) COBROS QUE NO SE BORRAN. Hasta ahora payments tenía "on delete cascade"
--    contra members y memberships: borrar un socio borraba sus cobros, y una
--    caja ya cerrada dejaba de cuadrar con sus movimientos (pasó el 06/10).
--    Ahora el cobro sobrevive: queda sin socio ni pase vinculados, con el
--    nombre del socio guardado en el propio cobro (member_name).
--
-- 2) DAR DE BAJA. La gente se va y vuelve. archive_member() no borra nada:
--    cancela el pase vigente (así no puede entrar), lo saca de su familia y
--    lo oculta de las listas. unarchive_member() lo devuelve; para que vuelva
--    a entrar se le vende un pase como siempre. Borrar de verdad queda solo
--    para errores de carga, y solo para superadmin.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1a. payments: los FK pasan de cascade a set null.
-- ---------------------------------------------------------------------------
alter table payments alter column member_id     drop not null;
alter table payments alter column membership_id drop not null;

alter table payments drop constraint if exists payments_member_id_fkey;
alter table payments add  constraint payments_member_id_fkey
  foreign key (member_id) references members(id) on delete set null;

alter table payments drop constraint if exists payments_membership_id_fkey;
alter table payments add  constraint payments_membership_id_fkey
  foreign key (membership_id) references memberships(id) on delete set null;


-- ---------------------------------------------------------------------------
-- 1b. Nombre del socio guardado en el cobro, igual que plan_name: si el
--     socio se borra, la caja sigue diciendo de quién era la venta.
-- ---------------------------------------------------------------------------
alter table payments add column if not exists member_name text;

update payments p
   set member_name = m.full_name
  from members m
 where m.id = p.member_id and p.member_name is null;

create or replace function payments_fill_member_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.member_name is null and new.member_id is not null then
    select full_name into new.member_name from members where id = new.member_id;
  end if;
  return new;
end;
$$;

drop trigger if exists payments_fill_member_name on payments;
create trigger payments_fill_member_name
  before insert on payments
  for each row execute function payments_fill_member_name();


-- ---------------------------------------------------------------------------
-- 1c. void_sale: un cobro cuyo pase se borró ya no tiene membership_id, así
--     que se anula solo esa fila (no se puede saber cuál era su pareja).
-- ---------------------------------------------------------------------------
create or replace function void_sale(
  p_payment_id    uuid,
  p_reason        text,
  p_cancel_membership boolean default true
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments;
  v_name    text;
  v_dates   date[];
  v_date    date;
  v_count   integer;
begin
  if not is_manager() then
    raise exception 'Solo un admin puede anular cobros.' using errcode = '42501';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Escribí el motivo de la anulación.';
  end if;

  select * into v_payment from payments where id = p_payment_id;
  if not found then
    raise exception 'El cobro indicado no existe.';
  end if;
  if v_payment.voided_at is not null then
    raise exception 'Ese cobro ya estaba anulado.';
  end if;

  select coalesce(nullif(trim(a.full_name), ''), a.email) into v_name
  from admins a
  where a.user_id = auth.uid() or a.email = (auth.jwt() ->> 'email')
  limit 1;

  with voided as (
    update payments
       set voided_at      = now(),
           voided_by      = auth.uid(),
           voided_by_name = v_name,
           void_reason    = trim(p_reason)
     where voided_at is null
       and (id = p_payment_id
            or (v_payment.membership_id is not null
                and membership_id = v_payment.membership_id))
    returning local_date
  )
  select array_agg(distinct local_date), count(*) into v_dates, v_count from voided;

  foreach v_date in array v_dates loop
    perform recalc_cash_closing(v_date);
  end loop;

  if p_cancel_membership and v_payment.membership_id is not null then
    update memberships set status = 'cancelled' where id = v_payment.membership_id;
  end if;

  return v_count;
end;
$$;


-- ---------------------------------------------------------------------------
-- 2a. Socios dados de baja.
-- ---------------------------------------------------------------------------
alter table members add column if not exists archived_at      timestamptz;
alter table members add column if not exists archived_by_name text;

comment on column members.archived_at is
  'Si no es null, el socio está dado de baja: no aparece en las listas y no tiene pase vigente. Se reactiva con unarchive_member().';


-- ---------------------------------------------------------------------------
-- 2b. member_overview: misma vista, con archived_at al final.
-- ---------------------------------------------------------------------------
create or replace view member_overview as
 select m.id,
    m.full_name,
    m.phone,
    m.email,
    m.photo_url,
    m.joined_on,
    m.status as member_status,
    m.qr_token,
    ms.id as membership_id,
    p.id as plan_id,
    p.name as plan_name,
    ms.period_start,
    ms.period_end,
    ms.uses_total,
    ms.uses_remaining,
        case
            when (m.status = 'suspended'::member_status) then 'suspended'::text
            when (ms.id is null) then 'no_membership'::text
            when (ms.period_end < gym_local_date(now())) then 'expired'::text
            when (ms.uses_remaining = 0) then 'exhausted'::text
            else 'active'::text
        end as effective_status,
    (ms.period_end - gym_local_date(now())) as days_left,
    (exists ( select 1
           from check_ins ci
          where ((ci.member_id = m.id) and (ci.local_date = gym_local_date(now()))))) as checked_in_today,
    ( select max(ci.checked_in_at) as max
           from check_ins ci
          where (ci.member_id = m.id)) as last_check_in_at,
    m.dni,
    ( select count(*) as count
           from check_ins ci
          where ((ci.member_id = m.id) and (ci.local_date = gym_local_date(now())))) as visits_today,
    m.welcome_message,
    m.birth_date,
    gym_next_birthday(m.birth_date) as next_birthday,
    (gym_next_birthday(m.birth_date) - gym_local_date(now())) as days_to_birthday,
    (gym_next_birthday(m.birth_date) = gym_local_date(now())) as is_birthday_today,
    m.archived_at,
    m.archived_by_name
   from ((members m
     left join memberships ms on (((ms.member_id = m.id) and (ms.status = 'active'::membership_status))))
     left join plans p on ((p.id = ms.plan_id)));


-- ---------------------------------------------------------------------------
-- 2c. archive_member / unarchive_member. Solo manager, igual que borrar.
-- ---------------------------------------------------------------------------
create or replace function archive_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not is_manager() then
    raise exception 'Solo un admin puede dar de baja socios.' using errcode = '42501';
  end if;

  if not exists (select 1 from members where id = p_member_id) then
    raise exception 'El socio no existe.';
  end if;

  select coalesce(nullif(trim(a.full_name), ''), a.email) into v_name
  from admins a
  where a.user_id = auth.uid() or a.email = (auth.jwt() ->> 'email')
  limit 1;

  -- Sin pase vigente no puede entrar: no hace falta tocar el check-in.
  update memberships set status = 'cancelled'
   where member_id = p_member_id and status = 'active';

  perform unlink_family_member(p_member_id);

  update members
     set archived_at = now(), archived_by_name = v_name
   where id = p_member_id;
end;
$$;

create or replace function unarchive_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_manager() then
    raise exception 'Solo un admin puede reactivar socios.' using errcode = '42501';
  end if;

  update members
     set archived_at = null, archived_by_name = null
   where id = p_member_id;
end;
$$;

revoke execute on function archive_member(uuid)   from anon;
revoke execute on function unarchive_member(uuid) from anon;
grant  execute on function archive_member(uuid)   to authenticated;
grant  execute on function unarchive_member(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 2d. Borrar de verdad: solo superadmin (errores de carga).
-- ---------------------------------------------------------------------------
drop policy if exists members_delete on members;
create policy members_delete on members
  for delete to authenticated
  using (is_superadmin());

-- ============================================================================
-- Probalo (logueado como admin):
--   select archive_member('<member_id>');
--   select archived_at, effective_status from member_overview where id = '<member_id>';
--   select unarchive_member('<member_id>');
--
--   -- Borrar un socio ya no toca la caja:
--   delete from members where id = '<member_id>';   -- como superadmin
--   select member_id, member_name, amount_cents from payments where member_name = '<nombre>';
-- ============================================================================
