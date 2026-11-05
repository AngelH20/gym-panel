-- ============================================================================
-- GIMNASIO - Parche: anular una renovación le devuelve al socio su pase anterior
--
-- Corré esto DESPUÉS de 33_pause_membership.sql.
-- Se puede correr más de una vez: es un "create or replace" con la misma firma
-- y los mismos permisos que la versión vigente de void_sale().
--
-- El problema (encontrado probando, 05/11/2026):
--
--   Un socio tiene el pase vigente (del 20/10 al 20/11, le quedan 6
--   entradas). En el mostrador le "renuevan" por error (se equivocaron de
--   socio, o lo cobraron dos veces). renew_membership() marca el pase viejo
--   como 'expired' y crea uno nuevo. Al darse cuenta, el dueño anula ese
--   cobro con "dar de baja el pase": el nuevo queda 'cancelled'... y el
--   viejo sigue 'expired'. Resultado: el socio, que tenía su mes pago, queda
--   SIN PASE y el check-in le dice "No tenés un pase activo". Solo se
--   arreglaba a mano corrigiendo el vencimiento del pase viejo.
--
-- Qué cambia:
--
--   1) Si el pase que se da de baja era el vigente del socio, se le devuelve
--      el pase anterior, SOLO si ese pase todavía serviría hoy: vence hoy o
--      después y le quedan entradas. Un pase anterior que ya había vencido por
--      fecha o por entradas no se toca (queda como estaba).
--      Si el pase anterior estaba pausado cuando lo renovaron, la pausa ya se
--      había cerrado (trigger memberships_close_pause) y vuelve sin pausa; los
--      días que se le sumaron por la pausa los conserva.
--
--   2) Se bloquea la fila del cobro (for update) y se controla que realmente
--      se haya anulado algo. Antes, dos anulaciones del mismo cobro al mismo
--      tiempo hacían fallar a la segunda con un error interno ("FOREACH
--      expression must not be null") en vez de "Ese cobro ya estaba anulado".
--
--   El resultado sigue siendo la cantidad de cobros anulados (integer), así
--   que la app no cambia.
-- ============================================================================

begin;

create or replace function void_sale(
  p_payment_id        uuid,
  p_reason            text,
  p_cancel_membership boolean default true
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment    payments;
  v_name       text;
  v_dates      date[];
  v_date       date;
  v_count      integer;
  v_today      date := gym_local_date(now());
  v_membership memberships;
  v_previous   uuid;
begin
  if not is_manager() then
    raise exception 'Solo un admin puede anular cobros.' using errcode = '42501';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Escribí el motivo de la anulación.';
  end if;

  -- Bloqueo el cobro: dos anulaciones al mismo tiempo no se pisan.
  select * into v_payment from payments where id = p_payment_id for update;
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

  if coalesce(v_count, 0) = 0 then
    raise exception 'Ese cobro ya estaba anulado.';
  end if;

  foreach v_date in array v_dates loop
    perform recalc_cash_closing(v_date);
  end loop;

  if p_cancel_membership and v_payment.membership_id is not null then
    select * into v_membership from memberships
     where id = v_payment.membership_id
       for update;

    if found and v_membership.status <> 'cancelled' then
      update memberships set status = 'cancelled' where id = v_membership.id;

      -- Era el pase vigente: devolverle el anterior si todavía le sirve.
      if v_membership.status = 'active' then
        select ms.id into v_previous
          from memberships ms
         where ms.member_id = v_membership.member_id
           and ms.id <> v_membership.id
           and ms.status = 'expired'
           and ms.created_at < v_membership.created_at
         order by ms.created_at desc
         limit 1
           for update;

        if v_previous is not null then
          update memberships
             set status = 'active'
           where id = v_previous
             and period_end >= v_today
             and uses_remaining > 0
             and not exists (select 1 from memberships o
                              where o.member_id = v_membership.member_id
                                and o.status = 'active');
        end if;
      end if;
    end if;
  end if;

  return v_count;
end;
$$;

revoke execute on function void_sale(uuid, text, boolean) from public, anon;
grant  execute on function void_sale(uuid, text, boolean) to authenticated;

commit;

-- ============================================================================
-- Probalo (dentro de begin; ... rollback;):
--   1. Socio con pase vigente (vence en 15 días, le quedan entradas).
--   2. sell_membership_split(...) -> el viejo queda 'expired', el nuevo 'active'.
--   3. void_sale(<cobro nuevo>, 'error', true)
--      -> el nuevo queda 'cancelled' y el viejo vuelve a 'active'.
--   4. Si el pase viejo ya estaba vencido por fecha (o sin entradas), queda
--      'expired' y el socio queda sin pase, como antes.
-- ============================================================================
