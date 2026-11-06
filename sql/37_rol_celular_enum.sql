-- ============================================================================
-- GIMNASIO - Rol "celular" (1 de 2): el valor nuevo del enum
--
-- Corré esto ANTES de 38_rol_celular.sql, y en su propia transacción:
-- Postgres no deja usar un valor nuevo de un enum en la misma transacción
-- en la que se agregó. Por eso son dos archivos.
--
-- Agregar el valor no cambia nada por sí solo: ninguna cuenta lo tiene
-- hasta que alguien la cree desde Usuarios (después de correr el 38).
-- ============================================================================

alter type admin_role add value if not exists 'celular';
