-- ============================================================================
-- GIMNASIO - Parche: reabrir caja después de cerrada (Etapa L)
--
-- Corré esto DESPUÉS de 11_cash_open_close.sql.
--
-- Bug: open_cash_register() chequeaba "¿existe una fila de apertura para
-- hoy?", pero esa fila queda para siempre (aunque después se haya cerrado
-- la caja). Entonces "Abrir caja" decía "ya está abierta" incluso con la
-- caja cerrada, y no había forma de reabrir.
--
-- El chequeo correcto es "¿está abierta Y TODAVÍA NO cerrada?" — eso es
-- estar realmente abierta en este momento. Si está cerrada, abrir de nuevo
-- borra el cierre viejo y arranca una apertura nueva con el fondo que se
-- cargue. Los pagos ya registrados no se tocan, solo se pierde el registro
-- del cierre anterior (los totales se recalculan igual desde payments).
-- ============================================================================

create or replace function open_cash_register(
  p_starting_cash_cents integer,
  p_notes               text default null
)
returns cash_openings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := gym_local_date(now());
  v_row   cash_openings;
begin
  if exists (select 1 from cash_openings where opening_date = v_today)
     and not exists (select 1 from cash_closings where closing_date = v_today)
  then
    raise exception 'La caja de hoy ya está abierta.';
  end if;

  if p_starting_cash_cents is null or p_starting_cash_cents < 0 then
    raise exception 'El fondo inicial no puede ser negativo.';
  end if;

  -- Reabrir: si había un cierre de hoy, se saca (junto con la apertura
  -- vieja) para poder declarar un fondo nuevo y seguir vendiendo.
  delete from cash_closings where closing_date = v_today;
  delete from cash_openings where opening_date = v_today;

  insert into cash_openings (opening_date, opened_by, starting_cash_cents, notes)
  values (v_today, auth.uid(), p_starting_cash_cents, p_notes)
  returning * into v_row;

  return v_row;
end;
$$;

comment on function open_cash_register is
  'Abre (o reabre, si estaba cerrada) la caja de hoy con un fondo inicial nuevo.';

-- ============================================================================
-- Probalo:
--   select open_cash_register(1000000);   -- abre
--   select open_cash_register(1000000);   -- error: ya está abierta
--   select close_cash_register(1000000);  -- cierra
--   select open_cash_register(500000);    -- ahora sí reabre, con fondo nuevo
-- ============================================================================
