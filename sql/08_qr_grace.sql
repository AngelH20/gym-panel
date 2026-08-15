-- ============================================================================
-- GIMNASIO - Parche: QR rotativo con margen de gracia (Etapa H)
--
-- Corré esto DESPUÉS de 07_dni_strict.sql.
--
-- Volvemos a activar la validación de presencia (la habíamos apagado con
-- access_mode='off' para simplificar mientras probábamos). Ahora el QR de
-- /panel/acceso rota cada 30 segundos, y el anterior sigue sirviendo 20
-- segundos más después de rotar — así, si lo escaneaste justo antes de que
-- cambiara, todavía te alcanza para escribir el DNI sin que te diga
-- "QR inválido".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Configuración.
-- ---------------------------------------------------------------------------
insert into settings (key, value) values
  ('qr_grace_seconds', '20'::jsonb)
on conflict (key) do nothing;

update settings set value = '30'::jsonb where key = 'qr_rotate_seconds';
update settings set value = '20'::jsonb where key = 'qr_grace_seconds';

-- Vuelve a exigir el QR vigente en el check-in (lo habíamos apagado).
update settings set value = '"rotating"'::jsonb where key = 'access_mode';


-- ---------------------------------------------------------------------------
-- 2. verify_qr_token — el token de la ventana ACTUAL siempre vale. El de la
--    ventana ANTERIOR vale solo durante los primeros qr_grace_seconds de la
--    ventana nueva: no es "N ventanas para atrás", es un margen fijo en
--    segundos medido desde que rotó, para que la duración extra sea siempre
--    la misma sin importar qr_rotate_seconds.
--
--    Vida útil de un QR: mínimo qr_grace_seconds (si lo escanearon un
--    instante antes de rotar), máximo qr_rotate_seconds + qr_grace_seconds
--    (si lo escanearon apenas apareció). Asume qr_grace_seconds <=
--    qr_rotate_seconds; con los valores por defecto (30 y 20) se cumple.
-- ---------------------------------------------------------------------------
create or replace function verify_qr_token(p_token text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_seconds integer;
  v_grace   integer;
  v_elapsed integer;
begin
  if p_token is null or p_token = '' then
    return false;
  end if;

  if p_token = current_qr_token(0) then
    return true;
  end if;

  select (value #>> '{}')::integer into v_seconds from settings where key = 'qr_rotate_seconds';
  v_seconds := greatest(coalesce(v_seconds, 30), 5);

  select (value #>> '{}')::integer into v_grace from settings where key = 'qr_grace_seconds';
  v_grace := greatest(coalesce(v_grace, 20), 0);

  -- Segundos transcurridos desde que arrancó la ventana actual.
  v_elapsed := floor(extract(epoch from now()))::integer % v_seconds;

  return v_elapsed <= v_grace and p_token = current_qr_token(-1);
end;
$$;

comment on function verify_qr_token is
  'Token vigente: siempre vale. Token anterior: vale solo los primeros qr_grace_seconds de la ventana nueva.';

-- ============================================================================
-- Probalo (esperá a que cambie de ventana para el segundo select):
--   select current_qr_token() as vigente;
--   select verify_qr_token(current_qr_token());  -- true, siempre
--   -- token de la ventana anterior, recién rotada -> true; pasados los
--   -- 20s de gracia -> false
-- ============================================================================
