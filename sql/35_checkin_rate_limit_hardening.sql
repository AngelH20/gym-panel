-- ============================================================================
-- GIMNASIO - Parche: rate limit del check-in sin agujeros
-- (auditoría de seguridad del 05/11, hallazgo BAJO)
--
-- Corré esto DESPUÉS de 34_fix_role_null_bypass.sql (no depende de él).
-- Hacé un backup antes (como siempre). Es idempotente: se puede correr más
-- de una vez sin romper nada. Va todo dentro de una transacción.
--
-- Qué cambia en check_in_rate_limited() (misma firma, mismos permisos: solo
-- la usa perform_check_in_by_dni por dentro):
--
--   1) Sin IP (p_ip NULL) ya no hay barra libre. Antes devolvía "no
--      limitado" siempre: si el servidor algún día no manda la IP (cambio de
--      hosting, un proxy que no pone x-forwarded-for, un bug), el kiosco
--      queda sin límite. Ahora todos los pedidos sin IP comparten un mismo
--      balde (0.0.0.0) con un tope más alto (5 veces el normal, mínimo 60
--      cada 2 minutos), para no frenar a los socios en hora pico.
--
--   2) IPv6: se cuenta por red /64, no por dirección. Un celular o un
--      servidor con IPv6 tiene millones de direcciones dentro de su /64 y
--      podía cambiar de dirección en cada intento para no llegar nunca al
--      tope (y probar DNIs con un QR vigente). IPv4 sigue por dirección.
--
--   3) Limpieza: además de borrar los intentos viejos de la IP que entra,
--      borra los de más de un día de cualquier IP. Antes las filas de una IP
--      que no volvía quedaban para siempre (hoy son pocas, pero crecen).
-- ============================================================================

begin;

create or replace function check_in_rate_limited(
  p_ip             inet,
  p_max_attempts   integer default 12,
  p_window_seconds integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key   inet;
  v_max   integer;
  v_count integer;
begin
  if p_ip is null then
    v_key := '0.0.0.0'::inet;
    v_max := greatest(coalesce(p_max_attempts, 12) * 5, 60);
  elsif family(p_ip) = 6 then
    v_key := network(set_masklen(p_ip, 64));
    v_max := p_max_attempts;
  else
    v_key := host(p_ip)::inet;
    v_max := p_max_attempts;
  end if;

  delete from checkin_attempts
   where attempted_at < now() - interval '1 day';

  delete from checkin_attempts
   where ip = v_key
     and attempted_at < now() - (p_window_seconds || ' seconds')::interval;

  select count(*) into v_count
    from checkin_attempts
   where ip = v_key
     and attempted_at >= now() - (p_window_seconds || ' seconds')::interval;

  if v_count >= v_max then
    return true;
  end if;

  insert into checkin_attempts (ip) values (v_key);
  return false;
end;
$$;

-- Igual que antes: nadie de afuera la llama directo.
revoke all on function check_in_rate_limited(inet, integer, integer) from public, anon, authenticated;

commit;

-- Para verificar (en una transacción de prueba, con rollback):
--   begin;
--   select check_in_rate_limited(null) from generate_series(1, 61);  -- el 61 da true
--   select check_in_rate_limited('2001:db8::1'), check_in_rate_limited('2001:db8::2');
--   select ip, count(*) from checkin_attempts group by 1;            -- 2001:db8::/64 = 2
--   rollback;
