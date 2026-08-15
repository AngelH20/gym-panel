-- ============================================================================
-- GIMNASIO - Parche: reset de socios + DNI de 8 dígitos obligatorio (Etapa G)
--
-- Corré esto DESPUÉS de 06_qr_rotating.sql.
--
-- !!! OJO — ESTO BORRA DATOS !!!
-- La sección 1 borra TODOS los socios (los de prueba del seed y cualquier
-- otro que hayas cargado desde el panel). Por las foreign keys con
-- "on delete cascade", se van con ellos: sus membresías, check-ins y pagos.
-- Los planes y los cierres de caja NO se tocan.
--
-- Si tenés socios reales cargados que querés conservar, NO corras la
-- sección 1 — corré solo la sección 2 en adelante.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Vaciar socios (irreversible).
-- ---------------------------------------------------------------------------
delete from members;


-- ---------------------------------------------------------------------------
-- 2. DNI pasa a ser obligatorio y con formato fijo: exactamente 8 dígitos
--    numéricos. Antes era nullable (para poder cargar socios viejos sin
--    DNI de a poco); como la sección 1 ya dejó la tabla vacía, no hay fila
--    existente que pueda romper el NOT NULL.
--
--    Si tenés socios reales y saltaste la sección 1, esto va a fallar con
--    "column contains null values" (si a alguno le falta el DNI) o con
--    "check constraint violated" (si alguno no tiene 8 dígitos). En ese
--    caso, completá o corregí esos DNI antes de correr esta sección.
-- ---------------------------------------------------------------------------
alter table members alter column dni set not null;

alter table members add constraint members_dni_format
  check (dni ~ '^[0-9]{8}$');

comment on column members.dni is
  'DNI del socio: exactamente 8 dígitos numéricos, obligatorio y único. Es la credencial del kiosco /c.';

-- El índice ya no necesita el "where dni is not null": ahora dni nunca es
-- null, así que un índice único común alcanza.
drop index if exists members_dni_idx;
create unique index if not exists members_dni_idx on members (dni);

-- ============================================================================
-- Probalo:
--   insert into members (full_name, dni) values ('Prueba', '123');        -- falla: formato
--   insert into members (full_name, dni) values ('Prueba', '30111222');   -- ok
--   insert into members (full_name) values ('Sin DNI');                   -- falla: not null
-- ============================================================================
