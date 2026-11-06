"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addDaysLocal, todayLocal } from "@/lib/labels";
import {
  GENERIC_ERROR,
  dbErrorMessage,
  isIsoDate,
  isUuid,
  parsePesosToCents,
  requireRole,
} from "@/lib/actionGuard";

type Result = { error?: string };

const BAD_AMOUNT = "Revisá el monto: tiene que ser un número en pesos, sin puntos.";
const NOT_FOUND = "No se encontró el socio o el pase. Recargá la página.";

/** Precio en pesos (input del form) -> centavos. Vacío = 0 (pase sin
 *  cargo); cualquier otra cosa que no sea un monto válido (negativo, texto,
 *  o más que el tope) -> null, y la acción corta con un error en vez de
 *  registrar el cobro en $0 sin avisar, como pasaba antes. */
function parseAmountCents(raw: FormDataEntryValue | null): number | null {
  if (String(raw ?? "").trim() === "") return 0;
  return parsePesosToCents(raw);
}

/** Cómo se repartió el cobro entre los dos medios.
 *
 *  El form manda "mode": todo efectivo, todo transferencia, o mixto (un pase
 *  de $100.000 pagado con $60.000 por transferencia y $40.000 en efectivo).
 *  En mixto vienen los dos montos por separado; en los otros dos, uno solo.
 *  Cada medio con monto mayor a cero termina siendo su propio movimiento en
 *  la caja del día (ver sell_membership_split en 19_split_payment_and_plan_fix.sql).
 *  null = algún monto no es válido. */
function parsePaymentSplit(formData: FormData): { cash: number; transfer: number } | null {
  // "method" es el nombre viejo del campo: se sigue aceptando por si quedó
  // alguna pantalla sin actualizar.
  const mode = String(formData.get("mode") ?? formData.get("method") ?? "cash");

  if (mode === "split") {
    const cash = parseAmountCents(formData.get("amount_cash"));
    const transfer = parseAmountCents(formData.get("amount_transfer"));
    return cash == null || transfer == null ? null : { cash, transfer };
  }

  const amount = parseAmountCents(formData.get("amount"));
  if (amount == null) return null;
  return mode === "transfer" ? { cash: 0, transfer: amount } : { cash: amount, transfer: 0 };
}

/** Fecha de inicio del pase, para poder cargar un pago con fecha retroactiva
 *  (ej: cobrado en efectivo sin sistema un día, cargado recién al día
 *  siguiente). Si viene vacía, mal formada o futura, se ignora y
 *  sell_membership arranca el período hoy (su default). */
function parseStartDate(raw: FormDataEntryValue | null): string | undefined {
  const value = String(raw ?? "").trim();
  if (!isIsoDate(value)) return undefined;
  return value <= todayLocal() ? value : undefined;
}

/** DNI: exactamente 8 dígitos numéricos, sin puntos ni espacios. Es lo único
 *  que acepta la base (ver members_dni_format en 07_dni_strict.sql), así que
 *  se valida acá también para dar un error legible antes de pegarle a la DB. */
function parseDni(raw: FormDataEntryValue | null): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return /^\d{8}$/.test(digits) ? digits : null;
}

/** Fecha de nacimiento: opcional. Si viene vacía, mal formada, de un día que
 *  no existe ("2000-02-30") o fuera de rango (futura o antes de 1900), se
 *  guarda null en vez de cortar el alta/edición por un campo que no es
 *  obligatorio. Antes un día inexistente llegaba a la base y volvía como
 *  error crudo de Postgres. */
function parseBirthDate(raw: FormDataEntryValue | null): string | null {
  const value = String(raw ?? "").trim();
  return isIsoDate(value) && value >= "1900-01-01" && value <= todayLocal() ? value : null;
}

/** Topes de largo de los campos de texto libre del socio. No hay nada en la
 *  base que los limite, y el mensaje de bienvenida y la foto se muestran en
 *  la pantalla pública del check-in. */
const MAX_LEN = {
  full_name: 120,
  phone: 40,
  email: 254,
  photo_url: 500,
  notes: 2000,
  welcome_message: 300,
} as const;

type MemberTextField = keyof typeof MAX_LEN;

const FIELD_LABEL: Record<MemberTextField, string> = {
  full_name: "nombre",
  phone: "teléfono",
  email: "email",
  photo_url: "foto",
  notes: "notas",
  welcome_message: "mensaje de bienvenida",
};

function readText(formData: FormData, field: MemberTextField): string | null {
  return String(formData.get(field) ?? "").trim() || null;
}

/** Valida los textos del socio: largos y que la foto sea una URL https
 *  (no "javascript:", "data:" ni http plano, que el navegador además
 *  bloquearía por el CSP y dejaría la foto rota). */
function memberTextError(values: Partial<Record<MemberTextField, string | null>>): string | null {
  for (const [field, value] of Object.entries(values) as [MemberTextField, string | null][]) {
    if (value && value.length > MAX_LEN[field]) {
      return `El campo ${FIELD_LABEL[field]} es demasiado largo (máximo ${MAX_LEN[field]} caracteres).`;
    }
  }
  const photo = values.photo_url;
  if (photo) {
    let ok = false;
    try {
      ok = new URL(photo).protocol === "https:";
    } catch {
      ok = false;
    }
    if (!ok) return "La foto tiene que ser un link que empiece con https://";
  }
  return null;
}

/** Tope de entradas de un pase cargado a mano: ningún plan real se le
 *  acerca, y evita que un número gigante llegue a la columna integer. */
const MAX_USES = 1000;

export async function createMember(_prev: unknown, formData: FormData): Promise<Result> {
  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return { error: "El socio necesita un nombre." };

  const dni = parseDni(formData.get("dni"));
  if (!dni) return { error: "El DNI tiene que tener 8 dígitos numéricos." };

  const texts = {
    full_name,
    phone: readText(formData, "phone"),
    email: readText(formData, "email"),
    photo_url: readText(formData, "photo_url"),
    notes: readText(formData, "notes"),
  };
  const textError = memberTextError(texts);
  if (textError) return { error: textError };

  // Familiar y plan son opcionales, pero si vienen tienen que ser ids. Se
  // valida todo ANTES de crear el socio, para no dejarlo a medias.
  const relative_id = String(formData.get("relative_id") ?? "");
  const plan_id = String(formData.get("plan_id") ?? "");
  if ((relative_id && !isUuid(relative_id)) || (plan_id && !isUuid(plan_id))) {
    return { error: "Revisá el familiar o el plan elegido y probá de nuevo." };
  }
  const split = plan_id ? parsePaymentSplit(formData) : null;
  if (plan_id && !split) return { error: BAD_AMOUNT };

  const guard = await requireRole("staff");
  if (!guard.ok) return { error: guard.error };
  const { supabase } = guard;

  const { data: member, error } = await supabase
    .from("members")
    .insert({
      ...texts,
      dni,
      birth_date: parseBirthDate(formData.get("birth_date")),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505" && error.message.includes("dni")) {
      return {
        error:
          "Ya hay un socio con ese DNI. Si estaba dado de baja, buscalo en Socios → Dados de baja y reactivalo.",
      };
    }
    if (error.code === "23505" || error.message.includes("duplicate")) {
      return { error: "Ya hay un socio con ese email." };
    }
    console.error("[socios] Error al crear socio:", error);
    return { error: "No se pudo crear el socio. Probá de nuevo en un momento." };
  }

  // Si es familiar de otro socio, lo vinculamos antes de vender: el pack
  // familiar solo se puede vender si la familia ya tiene 3 integrantes.
  if (relative_id) {
    const { error: linkError } = await supabase.rpc("link_family_member", {
      p_member_id: member.id,
      p_relative_id: relative_id,
    });
    if (linkError) console.error("[socios] Error al vincular familiar:", linkError);
  }

  // Si eligió un plan en el alta, le activamos el pase y registramos el cobro.
  if (plan_id && split) {
    const { error: sellError } = await supabase.rpc("sell_membership_split", {
      p_member_id: member.id,
      p_plan_id: plan_id,
      p_cash_cents: split.cash,
      p_transfer_cents: split.transfer,
      p_start: parseStartDate(formData.get("start_date")),
    });
    if (sellError) {
      console.error("[socios] Error al cobrar el pase del alta:", sellError);
      revalidatePath("/panel/socios");
      redirect(`/panel/socios/${member.id}?aviso=pase_no_activado`);
    }
  }

  revalidatePath("/panel/socios");
  redirect(`/panel/socios/${member.id}`);
}

export async function updateMember(_prev: unknown, formData: FormData): Promise<Result> {
  const id = String(formData.get("id"));
  if (!isUuid(id)) return { error: NOT_FOUND };

  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return { error: "El socio necesita un nombre." };

  const dni = parseDni(formData.get("dni"));
  if (!dni) return { error: "El DNI tiene que tener 8 dígitos numéricos." };

  const texts = {
    full_name,
    phone: readText(formData, "phone"),
    email: readText(formData, "email"),
    photo_url: readText(formData, "photo_url"),
    notes: readText(formData, "notes"),
    welcome_message: readText(formData, "welcome_message"),
  };
  const textError = memberTextError(texts);
  if (textError) return { error: textError };

  const guard = await requireRole("staff");
  if (!guard.ok) return { error: guard.error };

  const { error, count } = await guard.supabase
    .from("members")
    .update(
      {
        ...texts,
        dni,
        birth_date: parseBirthDate(formData.get("birth_date")),
      },
      { count: "exact" }
    )
    .eq("id", id);

  if (error) {
    if (error.code === "23505" && error.message.includes("dni")) {
      return { error: "Ya hay otro socio con ese DNI." };
    }
    console.error("[socios] Error al actualizar socio:", error);
    return { error: GENERIC_ERROR };
  }
  // Un UPDATE que no encuentra la fila (o que la RLS filtra) no da error:
  // sin esto la pantalla decía "guardado" sin haber guardado nada.
  if (!count) return { error: NOT_FOUND };

  revalidatePath("/panel/socios");
  revalidatePath(`/panel/socios/${id}`);
  return {};
}

/** Suspender / reactivar. Es el único estado que se toca a mano. */
export async function setMemberStatus(_prev: unknown, formData: FormData): Promise<Result> {
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!isUuid(id)) return { error: NOT_FOUND };
  if (status !== "active" && status !== "suspended") return { error: "Estado inválido." };

  const guard = await requireRole("staff");
  if (!guard.ok) return { error: guard.error };
  const { error, count } = await guard.supabase
    .from("members")
    .update({ status }, { count: "exact" })
    .eq("id", id);

  if (error) {
    console.error("[socios] Error al cambiar el estado del socio:", error);
    return { error: "No se pudo guardar el cambio. Probá de nuevo en un momento." };
  }
  if (!count) {
    return { error: "No se pudo aplicar el cambio: no tenés permiso o el socio ya no existe." };
  }

  revalidatePath("/panel/socios");
  revalidatePath(`/panel/socios/${id}`);
  return {};
}

/** Renovar el pase y registrar el cobro: cierra el período anterior, abre uno
 *  nuevo y anota la venta en caja. Todo en una sola transacción del lado SQL. */
export async function sellMembership(_prev: unknown, formData: FormData): Promise<Result> {
  const member_id = String(formData.get("member_id"));
  const plan_id = String(formData.get("plan_id"));
  if (!isUuid(member_id)) return { error: NOT_FOUND };
  if (!isUuid(plan_id)) return { error: "Elegí un plan." };
  const split = parsePaymentSplit(formData);
  if (!split) return { error: BAD_AMOUNT };

  const guard = await requireRole("staff");
  if (!guard.ok) return { error: guard.error };
  const { error } = await guard.supabase.rpc("sell_membership_split", {
    p_member_id: member_id,
    p_plan_id: plan_id,
    p_cash_cents: split.cash,
    p_transfer_cents: split.transfer,
    p_start: parseStartDate(formData.get("start_date")),
  });

  revalidatePath("/panel/socios");
  revalidatePath(`/panel/socios/${member_id}`);
  revalidatePath("/panel/caja");

  if (error) {
    return { error: dbErrorMessage("socios", error, "No se pudo registrar el cobro. Probá de nuevo.") };
  }
  return {};
}

/** Corrige a mano el vencimiento de un pase puntual: para arreglar un
 *  cálculo raro, o para reactivar un pase que quedó marcado vencido después
 *  de un check-in rechazado, sin tener que rehacer toda la venta. */
export async function updateMembershipEnd(_prev: unknown, formData: FormData): Promise<Result> {
  const membership_id = String(formData.get("membership_id"));
  const member_id = String(formData.get("member_id"));
  const period_end = String(formData.get("period_end") ?? "").trim();

  if (!isUuid(membership_id) || !isUuid(member_id)) return { error: NOT_FOUND };
  if (!isIsoDate(period_end)) {
    return { error: "Elegí una fecha válida." };
  }

  const guard = await requireRole("manager");
  if (!guard.ok) return { error: guard.error };
  const { error } = await guard.supabase.rpc("set_membership_period_end", {
    p_membership_id: membership_id,
    p_period_end: period_end,
  });

  revalidatePath("/panel/socios");
  revalidatePath(`/panel/socios/${member_id}`);

  if (error) return { error: dbErrorMessage("socios", error, GENERIC_ERROR) };
  return {};
}

/** Corrige el plan de un pase ya vendido: para cuando se le cargó el plan
 *  equivocado al socio. NO registra ningún cobro — el movimiento que ya está
 *  en la caja queda como está, no se duplica ni se infla el total del día.
 *  Si el pase tiene entradas ya usadas, se respetan. */
export async function updateMembershipPlan(_prev: unknown, formData: FormData): Promise<Result> {
  const membership_id = String(formData.get("membership_id"));
  const member_id = String(formData.get("member_id"));
  const plan_id = String(formData.get("plan_id") ?? "");

  if (!isUuid(membership_id) || !isUuid(member_id)) return { error: NOT_FOUND };
  if (!isUuid(plan_id)) return { error: "Elegí un plan." };

  // Entradas: vacío = las que traiga el plan elegido. Se puede pisar a mano
  // para el caso en que el socio ya gastó más entradas de las que trae el
  // plan nuevo, que si no quedaría bloqueado.
  const rawUses = String(formData.get("uses_total") ?? "").trim();
  const uses = Number(rawUses);
  if (rawUses && (!Number.isInteger(uses) || uses < 1 || uses > MAX_USES)) {
    return { error: `Las entradas tienen que ser un número entero entre 1 y ${MAX_USES}.` };
  }

  const guard = await requireRole("manager");
  if (!guard.ok) return { error: guard.error };
  const { error } = await guard.supabase.rpc("set_membership_plan", {
    p_membership_id: membership_id,
    p_plan_id: plan_id,
    p_uses_override: rawUses ? uses : null,
  });

  revalidatePath("/panel/socios");
  revalidatePath(`/panel/socios/${member_id}`);

  if (error) return { error: dbErrorMessage("socios", error, GENERIC_ERROR) };
  return {};
}

/** Tope de una pausa, en días. El mismo que pone pause_membership en la base. */
const MAX_PAUSE_DAYS = 90;

/** Mensaje legible si la base todavía no tiene sql/33_pause_membership.sql. */
function pauseRpcError(error: { code?: string; message: string }): string {
  if (error.code === "PGRST202" || error.code === "42883") {
    return "Falta aplicar la actualización de la base para pausar pases (sql/33).";
  }
  return dbErrorMessage("socios", error, GENERIC_ERROR);
}

/** Pausa el pase vigente hasta una fecha de vuelta. Los días de pausa se le
 *  suman al vencimiento. Solo dueño o programador (lo controla la base). */
export async function pauseMembership(_prev: unknown, formData: FormData): Promise<Result> {
  const membership_id = String(formData.get("membership_id") ?? "");
  const until = String(formData.get("until") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!isUuid(membership_id)) return { error: "No se encontró el pase." };
  if (!isIsoDate(until)) return { error: "Elegí la fecha de vuelta." };

  const today = todayLocal();
  if (until <= today) return { error: "La fecha de vuelta tiene que ser posterior a hoy." };
  if (until > addDaysLocal(today, MAX_PAUSE_DAYS)) {
    return { error: `La pausa puede durar como mucho ${MAX_PAUSE_DAYS} días.` };
  }
  if (reason.length > 300) {
    return { error: "El motivo es demasiado largo (máximo 300 caracteres)." };
  }

  const guard = await requireRole("manager");
  if (!guard.ok) return { error: guard.error };
  const { error } = await guard.supabase.rpc("pause_membership", {
    p_membership_id: membership_id,
    p_until: until,
    p_reason: reason || null,
  });

  // Cambia el estado del socio en Inicio, Socios y la ficha.
  revalidatePath("/panel", "layout");
  if (error) return { error: pauseRpcError(error) };
  return {};
}

/** Reanuda un pase pausado antes de la fecha de vuelta: los días que no usó
 *  se le restan del vencimiento. */
export async function resumeMembership(_prev: unknown, formData: FormData): Promise<Result> {
  const membership_id = String(formData.get("membership_id") ?? "");
  if (!isUuid(membership_id)) return { error: "No se encontró el pase." };

  const guard = await requireRole("manager");
  if (!guard.ok) return { error: guard.error };
  const { error } = await guard.supabase.rpc("resume_membership", {
    p_membership_id: membership_id,
  });

  revalidatePath("/panel", "layout");
  if (error) return { error: pauseRpcError(error) };
  return {};
}

/** Suma al socio a la familia de otro (pack familiar). Si ninguno tenía
 *  familia, se arma una nueva con los dos. */
export async function linkFamily(_prev: unknown, formData: FormData): Promise<Result> {
  const member_id = String(formData.get("member_id"));
  const relative_id = String(formData.get("relative_id") ?? "");
  if (!isUuid(member_id)) return { error: NOT_FOUND };
  if (!isUuid(relative_id)) return { error: "Elegí al familiar." };

  const guard = await requireRole("staff");
  if (!guard.ok) return { error: guard.error };
  const { error } = await guard.supabase.rpc("link_family_member", {
    p_member_id: member_id,
    p_relative_id: relative_id,
  });

  revalidatePath("/panel/socios", "layout");
  if (error) return { error: dbErrorMessage("socios", error, GENERIC_ERROR) };
  return {};
}

/** Saca al socio de su familia. Los pases ya vendidos no se tocan. */
export async function unlinkFamily(_prev: unknown, formData: FormData): Promise<Result> {
  const member_id = String(formData.get("member_id"));
  if (!isUuid(member_id)) return { error: NOT_FOUND };

  const guard = await requireRole("staff");
  if (!guard.ok) return { error: guard.error };
  const { error } = await guard.supabase.rpc("unlink_family_member", { p_member_id: member_id });

  revalidatePath("/panel/socios", "layout");
  if (error) return { error: dbErrorMessage("socios", error, GENERIC_ERROR) };
  return {};
}

/** Dar de baja: no borra nada. Le cancela el pase vigente (así no puede
 *  entrar), lo saca de su familia y lo oculta de las listas. */
export async function archiveMember(_prev: unknown, formData: FormData): Promise<Result> {
  const id = String(formData.get("id"));
  if (!isUuid(id)) return { error: NOT_FOUND };

  const guard = await requireRole("manager");
  if (!guard.ok) return { error: guard.error };
  const { error } = await guard.supabase.rpc("archive_member", { p_member_id: id });

  if (error) return { error: dbErrorMessage("socios", error, GENERIC_ERROR) };

  revalidatePath("/panel", "layout");
  return {};
}

/** Vuelve a las listas. Para que pueda entrar, se le vende un pase. */
export async function unarchiveMember(_prev: unknown, formData: FormData): Promise<Result> {
  const id = String(formData.get("id"));
  if (!isUuid(id)) return { error: NOT_FOUND };

  const guard = await requireRole("manager");
  if (!guard.ok) return { error: guard.error };
  const { error } = await guard.supabase.rpc("unarchive_member", { p_member_id: id });

  if (error) return { error: dbErrorMessage("socios", error, GENERIC_ERROR) };

  revalidatePath("/panel", "layout");
  return {};
}

/** Borrado definitivo, solo programador: para errores de carga (duplicados).
 *  Los cobros quedan en la caja con el nombre del socio. */
export async function deleteMember(_prev: unknown, formData: FormData): Promise<Result> {
  const id = String(formData.get("id"));
  if (!isUuid(id)) return { error: NOT_FOUND };

  const guard = await requireRole("programador");
  if (!guard.ok) return { error: guard.error };
  const { error, count } = await guard.supabase
    .from("members")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    console.error("[socios] Error al borrar socio:", error);
    return { error: "No se pudo borrar. Probá de nuevo en un momento." };
  }
  if (!count) {
    return { error: "No se pudo borrar: no tenés permiso o el socio ya no existe." };
  }

  revalidatePath("/panel/socios");
  redirect("/panel/socios");
}
