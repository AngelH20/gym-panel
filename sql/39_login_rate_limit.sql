-- ============================================================================
-- GIMNASIO - Tope de intentos de login por IP
--
-- *** SIN APLICAR *** (escrito el 06/11 por la revisión de seguridad de la
-- app; correrlo a mano desde el SQL Editor de Supabase, con backup antes).
--
-- Por qué: el login (app/login/actions.ts) llama a Supabase Auth DESDE EL
-- SERVIDOR de Vercel, así que el límite de intentos que trae Supabase Auth
-- ve siempre la IP de Vercel, no la de quien está probando contraseñas. Ese
-- límite queda compartido por todos: no frena a un atacante en particular y,
-- si alguien lo agota, deja afuera al staff. Este script agrega un tope
-- propio, por IP real del cliente (la manda la app, con IPv6 agrupada por
-- /64 como el check-in):
--
--   * Cada intento se RESERVA antes de ir a Supabase Auth
--     (login_attempt_begin). Si en los últimos 15 minutos esa IP ya tiene
--     10 intentos sin éxito (los que fallaron y los que están en curso), se
--     rechaza sin probar la contraseña.
--   * La reserva es atómica: un advisory lock por IP serializa el "contar e
--     insertar", así que 50 pedidos simultáneos no pasan todos el chequeo
--     antes de que se cuente alguno (carrera que tenía la versión anterior,
--     que contaba recién DESPUÉS de que el login fallaba).
--   * Login correcto -> login_record_success borra los intentos de la IP.
--     Error que no es de credenciales (red, Supabase caído) ->
--     login_attempt_discard borra solo esa reserva: no cuenta como intento.
--   * Sin IP (no debería pasar en Vercel): un balde común con tope de 50.
--
-- La app funciona igual ANTES de aplicar esto: si las funciones no existen,
-- el login sigue sin tope propio (lo deja anotado en el log del servidor).
--
-- Qué crea (todo nuevo, no toca nada existente):
--   - tabla login_attempts (RLS activada y SIN políticas; sin permisos para
--     anon/authenticated: solo la usa la service_role desde el servidor);
--   - private.login_rate_key(inet)                 (IP -> clave del balde)
--   - login_attempt_begin(p_ip inet) -> bigint     (id de la reserva, o NULL
--                                                   si la IP está frenada)
--   - login_attempt_discard(p_id bigint)           (descarta una reserva)
--   - login_record_success(p_ip inet)              (limpia la IP)
--
-- Es idempotente: se puede correr más de una vez.
--
-- Para revertir:
--   drop function if exists public.login_attempt_begin(inet);
--   drop function if exists public.login_attempt_discard(bigint);
--   drop function if exists public.login_record_success(inet);
--   drop function if exists private.login_rate_key(inet);
--   drop table if exists public.login_attempts;
-- ============================================================================

begin;

create schema if not exists private;

create table if not exists public.login_attempts (
  id           bigint generated always as identity primary key,
  ip           inet        not null,
  attempted_at timestamptz not null default now()
);

create index if not exists login_attempts_ip_time_idx
  on public.login_attempts (ip, attempted_at desc);

alter table public.login_attempts enable row level security;
revoke all on table public.login_attempts from public, anon, authenticated;

comment on table public.login_attempts is
  'Intentos de login sin éxito (y en curso) por IP (sql/39). Solo la usa la service_role.';

-- Misma clave que check_in_rate_limited (sql/35): IPv4 tal cual, IPv6 por
-- red /64, y sin IP un balde común.
create or replace function private.login_rate_key(p_ip inet)
returns inet
language sql
immutable
set search_path = ''
as $$
  select case
    when p_ip is null then '0.0.0.0'::inet
    when family(p_ip) = 6 then network(set_masklen(p_ip, 64))
    else host(p_ip)::inet
  end
$$;

revoke all on function private.login_rate_key(inet) from public, anon, authenticated;

create or replace function public.login_attempt_begin(p_ip inet)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key   inet    := private.login_rate_key(p_ip);
  v_max   integer := case when p_ip is null then 50 else 10 end;
  v_count integer;
  v_id    bigint;
begin
  -- Un pedido por vez para la misma IP hasta el final de esta transacción:
  -- el conteo y el insert de abajo no se pueden intercalar con otro.
  perform pg_advisory_xact_lock(hashtext('login_attempts:' || v_key::text));

  select count(*) into v_count
    from public.login_attempts
   where ip = v_key
     and attempted_at > now() - interval '15 minutes';

  if v_count >= v_max then
    return null;
  end if;

  -- Limpieza de paso: nada de más de un día sirve para el tope.
  delete from public.login_attempts where attempted_at < now() - interval '1 day';

  insert into public.login_attempts (ip) values (v_key) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.login_attempt_discard(p_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.login_attempts where id = p_id
$$;

create or replace function public.login_record_success(p_ip inet)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.login_attempts where ip = private.login_rate_key(p_ip)
$$;

-- Nadie de afuera las llama directo: solo el servidor, con la service_role.
revoke all on function public.login_attempt_begin(inet)     from public, anon, authenticated;
revoke all on function public.login_attempt_discard(bigint) from public, anon, authenticated;
revoke all on function public.login_record_success(inet)    from public, anon, authenticated;
grant execute on function public.login_attempt_begin(inet)     to service_role;
grant execute on function public.login_attempt_discard(bigint) to service_role;
grant execute on function public.login_record_success(inet)    to service_role;

commit;

-- Para verificar (en una transacción de prueba, con rollback):
--   begin;
--   select public.login_attempt_begin('203.0.113.7') from generate_series(1, 11);
--     -- los 10 primeros dan un id, el 11 da NULL
--   select public.login_attempt_begin('203.0.113.8');            -- id (otra IP)
--   select public.login_attempt_begin('2001:db8::1'), public.login_attempt_begin('2001:db8::2');
--   select ip, count(*) from public.login_attempts group by 1;   -- 2001:db8::/64 = 2
--   select public.login_record_success('203.0.113.7');
--   select public.login_attempt_begin('203.0.113.7');            -- id de nuevo
--   rollback;
