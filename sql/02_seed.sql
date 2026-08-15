-- ============================================================================
-- GIMNASIO - Datos de prueba (Etapa A)
--
-- Corré esto DESPUÉS de 01_schema.sql.
-- Genera socios en todos los estados posibles para poder probar el dashboard
-- y las alertas sin esperar semanas.
--
-- Es idempotente: podés correrlo varias veces sin duplicar.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Planes
-- ---------------------------------------------------------------------------
insert into plans (id, name, description, uses_per_period, period, period_days, price_cents, sort_order)
values
  ('11111111-1111-1111-1111-111111111111',
   'Pase Libre',
   'Acceso todos los días del mes.',
   31, 'month', 30, 3500000, 1),

  ('22222222-2222-2222-2222-222222222222',
   'Pase 3x semana',
   'Doce entradas por mes, para venir tres veces por semana.',
   12, 'month', 30, 2600000, 2),

  ('33333333-3333-3333-3333-333333333333',
   'Pase 2x semana',
   'Ocho entradas por mes, para venir dos veces por semana.',
   8, 'month', 30, 2000000, 3)
on conflict (id) do update
  set name            = excluded.name,
      description     = excluded.description,
      uses_per_period = excluded.uses_per_period,
      period_days     = excluded.period_days,
      price_cents     = excluded.price_cents;


-- ---------------------------------------------------------------------------
-- 2. Socios + membresías + historial de entradas
-- ---------------------------------------------------------------------------
do $$
declare
  v_today       date := gym_local_date(now());
  v_pase_libre  uuid := '11111111-1111-1111-1111-111111111111';
  v_pase_3x     uuid := '22222222-2222-2222-2222-222222222222';
  v_pase_2x     uuid := '33333333-3333-3333-3333-333333333333';

  v_member_id   uuid;
  v_ms_id       uuid;
  v_d           date;
  v_hour        integer;

  -- nombre, teléfono, email, plan, usos_totales, usos_restantes,
  -- días desde el inicio del período, estado del socio
  v_seed record;
begin
  for v_seed in
    select * from (values
      -- Socio normal, a mitad de camino.
      ('Martina Gómez',     '11 5555-0101', 'martina@example.com',  v_pase_libre, 31, 18,  12, 'active'::member_status),
      -- A punto de quedarse sin usos -> debe disparar la alerta de usos bajos.
      ('Lucas Fernández',   '11 5555-0102', 'lucas@example.com',    v_pase_3x,    12,  2,  22, 'active'::member_status),
      -- Le queda 1 uso -> alerta.
      ('Camila Rossi',      '11 5555-0103', 'camila@example.com',   v_pase_2x,     8,  1,  20, 'active'::member_status),
      -- Se le acaba el período en 2 días -> alerta de vencimiento próximo.
      ('Diego Paz',         '11 5555-0104', 'diego@example.com',    v_pase_libre, 31, 11,  28, 'active'::member_status),
      -- Sin usos disponibles -> debe rebotar el check-in.
      ('Sofía Ledesma',     '11 5555-0105', 'sofia@example.com',    v_pase_2x,     8,  0,  25, 'active'::member_status),
      -- Recién arrancó, pase entero.
      ('Nicolás Herrera',   '11 5555-0106', 'nico@example.com',     v_pase_libre, 31, 30,   1, 'active'::member_status),
      -- Suspendido -> debe rebotar con mensaje distinto.
      ('Valentina Ortiz',   '11 5555-0107', 'valen@example.com',    v_pase_3x,    12,  9,  10, 'suspended'::member_status),
      -- Período ya vencido por fecha.
      ('Federico Castro',   '11 5555-0108', 'fede@example.com',     v_pase_3x,    12,  4,  45, 'active'::member_status),
      ('Julieta Medina',    '11 5555-0109', 'julieta@example.com',  v_pase_libre, 31, 25,   6, 'active'::member_status),
      ('Tomás Aguirre',     '11 5555-0110', 'tomas@example.com',    v_pase_2x,     8,  5,  15, 'active'::member_status)
    ) as t(full_name, phone, email, plan_id, uses_total, uses_remaining, days_in, status)
  loop

    -- Alta del socio (idempotente por email).
    insert into members (full_name, phone, email, joined_on, status, notes)
    values (
      v_seed.full_name,
      v_seed.phone,
      v_seed.email,
      v_today - (v_seed.days_in + 30),
      v_seed.status,
      null
    )
    on conflict (email) do update set full_name = excluded.full_name
    returning id into v_member_id;

    if v_member_id is null then
      select id into v_member_id from members where email = v_seed.email;
    end if;

    -- Limpiar corridas anteriores de este socio.
    delete from check_ins   where member_id = v_member_id;
    delete from memberships where member_id = v_member_id;

    -- Membresía anterior (historial de renovación).
    insert into memberships (
      member_id, plan_id, period_start, period_end,
      uses_total, uses_remaining, status
    ) values (
      v_member_id, v_seed.plan_id,
      v_today - (v_seed.days_in + 30),
      v_today - (v_seed.days_in + 1),
      v_seed.uses_total, 0, 'expired'
    );

    -- Membresía actual.
    insert into memberships (
      member_id, plan_id, period_start, period_end,
      uses_total, uses_remaining, status
    ) values (
      v_member_id, v_seed.plan_id,
      v_today - v_seed.days_in,
      v_today - v_seed.days_in + 29,
      v_seed.uses_total,
      v_seed.uses_remaining,
      (case when (v_today - v_seed.days_in + 29) < v_today then 'expired'
            when v_seed.uses_remaining = 0                then 'expired'
            else 'active' end)::membership_status
    )
    returning id into v_ms_id;

    -- Generar check-ins consistentes con los usos consumidos.
    -- Se reparten en días distintos hacia atrás, con horarios realistas
    -- (pico a la mañana temprano y a la tarde) para que el gráfico de
    -- "horarios más concurridos" tenga forma.
    for i in 1 .. (v_seed.uses_total - v_seed.uses_remaining) loop
      v_d := v_today - (i - 1);

      -- No inventar entradas antes del inicio del período.
      exit when v_d < (v_today - v_seed.days_in);

      v_hour := case (i % 4)
                  when 0 then 8
                  when 1 then 19
                  when 2 then 18
                  else 10
                end;

      insert into check_ins (member_id, membership_id, checked_in_at, local_date, source)
      values (
        v_member_id,
        v_ms_id,
        ((v_d::text || ' ' || v_hour::text || ':' ||
          lpad(((i * 7) % 60)::text, 2, '0') || ':00')::timestamp
          at time zone gym_timezone()),
        v_d,
        'qr'
      )
      on conflict (member_id, local_date) do nothing;
    end loop;

  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- 3. Verificación rápida
-- ---------------------------------------------------------------------------
select 'Planes' as tabla, count(*) as filas from plans
union all select 'Socios',       count(*) from members
union all select 'Membresías',   count(*) from memberships
union all select 'Check-ins',    count(*) from check_ins;

-- Estado de cada socio (lo que verás en el panel).
select full_name, plan_name, effective_status,
       uses_remaining || '/' || uses_total as usos,
       period_end, days_left, checked_in_today
from member_overview
order by full_name;

-- Link del QR de cada socio (reemplazá el dominio por el tuyo).
select full_name,
       'https://TU-DOMINIO.vercel.app/c/' || qr_token as link_qr
from members
order by full_name;
