-- ============================================================================
-- GIMNASIO - Tope de intentos fallidos de login por IP
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
--   * 10 intentos FALLIDOS en 15 minutos desde la misma IP -> esa IP queda
--     frenada hasta que se vayan venciendo (la pantalla dice "esperá unos
--     minutos"). Un login correcto borra los fallidos de esa IP.
--   * Sin IP (no debería pasar en Vercel): un balde común con tope de 50.
--
-- La app funciona igual ANTES de aplicar esto: si las funciones no existen,
-- el login sigue sin tope propio (lo deja anotado en el log del servidor).
--
-- Qué crea (todo nuevo, no toca nada existente):
--   - tabla login_attempts (RLS activada y SIN políticas; sin permisos para
--     anon/authenticated: solo la usa la service_role desde el servidor);
--   - login_rate_limited(p_ip inet) -> boolean  (¿está frenada esta IP?)
--   - login_record_failure(p_ip inet)           (anota un fallido)
--   - login_record_success(p_ip inet)           (limpia los fallidos de la IP)
--
-- Es idempotente: se puede correr más de una vez.
--
-- Para revertir:
--   drop function if exists public.login_rate_limited(inet);
--   drop function if exists public.login_record_failure(inet);
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
  'Intentos fallidos de login por IP (sql/39). Solo la usa la service_role.';

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

create or replace function public.login_rate_limited(p_ip inet)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) >= case when p_ip is null then 50 else 10 end
    from public.login_attempts
   where ip = private.login_rate_key(p_ip)
     and attempted_at > now() - interval '15 minutes'
$$;

create or replace function public.login_record_failure(p_ip inet)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Limpieza de paso: nada de más de un día sirve para el tope.
  delete from public.login_attempts where attempted_at < now() - interval '1 day';
  insert into public.login_attempts (ip) values (private.login_rate_key(p_ip));
end;
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
revoke all on function public.login_rate_limited(inet)   from public, anon, authenticated;
revoke all on function public.login_record_failure(inet) from public, anon, authenticated;
revoke all on function public.login_record_success(inet) from public, anon, authenticated;
grant execute on function public.login_rate_limited(inet)   to service_role;
grant execute on function public.login_record_failure(inet) to service_role;
grant execute on function public.login_record_success(inet) to service_role;

commit;

-- Para verificar (en una transacción de prueba, con rollback):
--   begin;
--   select public.login_record_failure('203.0.113.7') from generate_series(1, 10);
--   select public.login_rate_limited('203.0.113.7');   -- true
--   select public.login_rate_limited('203.0.113.8');   -- false
--   select public.login_record_failure('2001:db8::1'), public.login_record_failure('2001:db8::2');
--   select ip, count(*) from public.login_attempts group by 1;  -- 2001:db8::/64 = 2
--   select public.login_record_success('203.0.113.7');
--   select public.login_rate_limited('203.0.113.7');   -- false
--   rollback;
