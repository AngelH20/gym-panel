-- ============================================================================
-- GIMNASIO - Parche: el rol se reconoce por user_id; el email solo para
-- filas que todavía no tienen user_id
--
-- SIN APLICAR. Se puede correr más de una vez (create or replace).
-- Independiente de 42: el orden entre ambos da igual.
--
-- Qué cambia y por qué:
--
--   current_admin_role() buscaba la fila de admins por user_id O por email:
--
--     where a.user_id = auth.uid() or a.email = (auth.jwt() ->> 'email')
--
--   Si un admin cambia su email en Supabase Auth y después alguien crea una
--   cuenta con el email VIEJO, esa cuenta nueva matchea la fila por email
--   (aunque la fila ya tenga el user_id de otra persona) y hereda el rol.
--   Hoy no es explotable: el alta pública de Auth está apagada y los 3
--   admins tienen user_id con su email al día (verificado el 2026-11-06).
--   Pero la regla correcta es: si la fila ya está atada a un usuario, solo
--   ese usuario; el email sirve únicamente para filas sin user_id (una
--   cuenta cargada a mano por email antes de que exista el login).
--
--   De paso el email se compara sin distinguir mayúsculas.
--
--   is_admin, is_manager, is_superadmin e is_qr_device usan esta función,
--   así que heredan el arreglo sin tocarlas.
--
-- Verificación previa (2026-11-06, solo lectura): con la regla nueva los 3
-- admins (dueno, programador, celular) siguen teniendo el mismo rol: los 3
-- tienen user_id y su email coincide con el de auth.users.
--
-- Prueba antes de aplicar (en el SQL editor, una sola ejecución):
--   begin;
--   <este archivo>;
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     json_build_object('sub', '<user_id del dueño>', 'role', 'authenticated',
--                       'email', '<email del dueño>')::text, true);
--   select current_admin_role();          -- debe dar 'dueno'
--   select set_config('request.jwt.claims',
--     json_build_object('sub', gen_random_uuid(), 'role', 'authenticated',
--                       'email', '<email del dueño>')::text, true);
--   select current_admin_role();          -- debe dar NULL (antes daba 'dueno')
--   rollback;
--
-- Cómo revertir: volver a la definición anterior (está en este comentario):
--   create or replace function public.current_admin_role()
--   returns admin_role language sql stable security definer
--   set search_path to 'public' as $$
--     select a.role from admins a
--     where a.user_id = auth.uid() or a.email = (auth.jwt() ->> 'email')
--     order by (a.user_id = auth.uid()) desc nulls last
--     limit 1
--   $$;
-- ============================================================================

create or replace function public.current_admin_role()
returns admin_role
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.role
  from admins a
  where a.user_id = auth.uid()
     or (a.user_id is null and lower(a.email) = lower(auth.jwt() ->> 'email'))
  -- Si hubiera las dos (una atada al usuario y otra suelta con su email),
  -- gana la atada.
  order by (a.user_id = auth.uid()) desc nulls last
  limit 1
$$;
