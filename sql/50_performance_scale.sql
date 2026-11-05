-- ============================================================================
-- GIMNASIO - Parche: rendimiento a escala (Etapa AA)
--
-- Corré esto DESPUÉS de 33_pause_membership.sql (y de 30_performance.sql).
-- Se puede correr más de una vez: todo es "create or replace".
--
-- No cambia QUIÉN puede ver QUÉ ni lo que se muestra: mismos resultados,
-- calculados más barato. Pensado para cuando haya miles de socios y un par
-- de años de entradas (hoy, con 64 socios y ~600 entradas, no se nota).
-- Medido con una copia sintética de 5.000 socios y 438.000 entradas en
-- tablas temporales, dentro de begin/rollback.
--
-- 1) gym_next_birthday() sin bloques de excepción.
--    Cada "begin ... exception ... end" de plpgsql abre una subtransacción
--    en CADA llamada, aunque no salte ningún error. member_overview la llama
--    por socio (Inicio 1 vez por fila, Cumpleaños 3: next_birthday,
--    days_to_birthday e is_birthday_today). Con 5.000 socios:
--      Inicio:      61 ms -> 20 ms
--      Cumpleaños: 195 ms -> 57 ms
--    El 29 de febrero se resuelve con la regla de bisiesto en vez de
--    atrapando el error de make_date: mismo resultado (comparado fecha por
--    fecha contra la versión actual en 5.000 fechas, 29/2 y nulos incluidos:
--    0 diferencias).
--
-- 2) member_overview: las entradas de HOY se cuentan una sola vez.
--    Antes, "entró hoy" y "visitas de hoy" eran dos subconsultas por socio
--    sobre check_ins. Ahora es un solo LEFT JOIN contra las entradas de hoy
--    agrupadas por socio. Además de ahorrar una subconsulta por fila, no
--    depende de que el planificador estime bien cuántas entradas hay "hoy"
--    (una fecha nueva que todavía no está en las estadísticas: con la
--    estimación baja elige recorrer TODAS las entradas del día por cada
--    socio). Con 5.000 socios y 600 entradas en el día: 183 ms -> 146 ms en
--    caliente. La ficha de un socio (where id = ...) sigue yendo directo por
--    índice: Postgres empuja el id adentro del agrupado.
--    Mismas columnas, mismo orden, mismos tipos (visits_today sigue bigint),
--    y sigue siendo security_invoker (OJO: create or replace view sin el
--    "with (security_invoker = true)" lo saca y la vista pasaría a leer con
--    los permisos del dueño, salteando la RLS).
--
-- 3) checkin_stats(desde): Métricas e Inicio cuentan en la base.
--    Métricas traía TODAS las entradas del período (con "Todo", la historia
--    entera) para contarlas en el servidor de Next. Eso es lento y además
--    la API de Supabase corta en un máximo de filas (1000 por defecto): con
--    ~10 entradas por día, "Todo" pasa de 1000 a mediados de diciembre de
--    2026 y desde ahí los números salen cortos sin avisar. Con 600 entradas
--    por día, "30 días" son 18.000 filas (~200 ms en la base más el
--    viaje). Ahora devuelve un JSON chico con los totales y los conteos por
--    hora, día de la semana y fecha. Es security invoker: corre con la RLS
--    del que llama (check_ins_select = is_admin()).
--    La app la usa si existe y, si todavía no se corrió este archivo, cae
--    sola a la forma vieja (ver lib/checkInStats.ts).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. gym_next_birthday sin subtransacciones.
-- ---------------------------------------------------------------------------
create or replace function gym_next_birthday(p_birth_date date)
returns date
language plpgsql
stable
set search_path = public
as $$
declare
  v_today     date := gym_local_date(now());
  v_year      int  := extract(year from v_today)::int;
  v_month     int;
  v_day       int;
  v_candidate date;
begin
  if p_birth_date is null then
    return null;
  end if;

  v_month := extract(month from p_birth_date)::int;
  v_day   := extract(day from p_birth_date)::int;

  -- 29 de febrero en un año no bisiesto: lo corremos al 28.
  if v_month = 2 and v_day = 29
     and not ((v_year % 4 = 0 and v_year % 100 <> 0) or v_year % 400 = 0) then
    v_candidate := make_date(v_year, 2, 28);
  else
    v_candidate := make_date(v_year, v_month, v_day);
  end if;

  if v_candidate < v_today then
    v_year := v_year + 1;
    if v_month = 2 and v_day = 29
       and not ((v_year % 4 = 0 and v_year % 100 <> 0) or v_year % 400 = 0) then
      v_candidate := make_date(v_year, 2, 28);
    else
      v_candidate := make_date(v_year, v_month, v_day);
    end if;
  end if;

  return v_candidate;
end;
$$;


-- ---------------------------------------------------------------------------
-- 2. member_overview: entradas de hoy agrupadas una sola vez.
--    Igual a la de 33_pause_membership.sql salvo checked_in_today y
--    visits_today (y el LEFT JOIN "hoy" del final).
-- ---------------------------------------------------------------------------
create or replace view member_overview
with (security_invoker = true)
as
 SELECT m.id,
    m.full_name,
    m.phone,
    m.email,
    m.photo_url,
    m.joined_on,
    m.status AS member_status,
    m.qr_token,
    ms.id AS membership_id,
    p.id AS plan_id,
    p.name AS plan_name,
    ms.period_start,
    ms.period_end,
    ms.uses_total,
    ms.uses_remaining,
        CASE
            WHEN m.status = 'suspended'::member_status THEN 'suspended'::text
            WHEN ms.id IS NULL THEN 'no_membership'::text
            WHEN ms.paused_until > gym_local_date(now()) THEN 'paused'::text
            WHEN ms.period_end < gym_local_date(now()) THEN 'expired'::text
            WHEN ms.uses_remaining = 0 THEN 'exhausted'::text
            ELSE 'active'::text
        END AS effective_status,
    ms.period_end - gym_local_date(now()) AS days_left,
    (hoy.visits IS NOT NULL) AS checked_in_today,
    ( SELECT max(ci.checked_in_at) AS max
           FROM check_ins ci
          WHERE ci.member_id = m.id) AS last_check_in_at,
    m.dni,
    COALESCE(hoy.visits, 0::bigint) AS visits_today,
    m.welcome_message,
    m.birth_date,
    gym_next_birthday(m.birth_date) AS next_birthday,
    gym_next_birthday(m.birth_date) - gym_local_date(now()) AS days_to_birthday,
    gym_next_birthday(m.birth_date) = gym_local_date(now()) AS is_birthday_today,
    m.archived_at,
    m.archived_by_name,
    ms.paused_until,
    coalesce(ms.paused_until > gym_local_date(now()), false) AS is_paused
   FROM members m
     LEFT JOIN memberships ms ON ms.member_id = m.id AND ms.status = 'active'::membership_status
     LEFT JOIN plans p ON p.id = ms.plan_id
     LEFT JOIN ( SELECT ci.member_id, count(*) AS visits
           FROM check_ins ci
          WHERE ci.local_date = gym_local_date(now())
          GROUP BY ci.member_id) hoy ON hoy.member_id = m.id;


-- ---------------------------------------------------------------------------
-- 3. checkin_stats(desde): totales de entradas para Métricas e Inicio.
--    p_from null = toda la historia. Devuelve:
--      { total, unique_members, earliest,
--        by_hour:    [24 enteros, 0h..23h, hora de Buenos Aires],
--        by_weekday: [7 enteros, lunes..domingo],
--        by_day:     { "AAAA-MM-DD": n, ... } (solo días con entradas) }
--    Mismas cuentas que hacía app/panel/metricas/page.tsx en JavaScript.
-- ---------------------------------------------------------------------------
create or replace function checkin_stats(p_from date default null)
returns json
language sql
stable
set search_path = public
as $$
  with ci as materialized (
    select member_id,
           local_date,
           extract(hour from checked_in_at at time zone gym_timezone())::int as h,
           extract(isodow from local_date)::int - 1 as wd
      from check_ins
     where local_date >= coalesce(p_from, '-infinity'::date)
  )
  select json_build_object(
    'total',          (select count(*) from ci),
    'unique_members', (select count(distinct member_id) from ci),
    'earliest',       (select min(local_date) from ci),
    'by_hour', (
      select json_agg(coalesce(x.n, 0) order by g.h)
        from generate_series(0, 23) g(h)
        left join (select h, count(*) n from ci group by h) x on x.h = g.h),
    'by_weekday', (
      select json_agg(coalesce(x.n, 0) order by g.wd)
        from generate_series(0, 6) g(wd)
        left join (select wd, count(*) n from ci group by wd) x on x.wd = g.wd),
    'by_day', (
      select coalesce(json_object_agg(local_date, n), '{}'::json)
        from (select local_date, count(*) n from ci group by local_date) d)
  )
$$;

revoke execute on function checkin_stats(date) from public, anon;
grant  execute on function checkin_stats(date) to authenticated;


-- ============================================================================
-- Probalo:
--   select pg_get_viewdef('member_overview');        -> con el join "hoy"
--   select reloptions from pg_class where relname = 'member_overview';
--     -> {security_invoker=true}   (si no aparece, CORREGIR ya: ver arriba)
--   select checkin_stats(current_date - 29);         -> como admin logueado
--   select gym_next_birthday('2000-02-29');          -> 28/2 o 29/2 según el año
-- ============================================================================
