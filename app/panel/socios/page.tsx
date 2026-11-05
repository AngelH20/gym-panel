import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { MemberOverview } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { UsesTally } from "@/components/UsesTally";
import { EmptyState } from "@/components/Form";
import { PageHeader } from "@/components/PageHeader";
import { SearchBox } from "./SearchBox";
import { ViewToggle, type SociosView } from "./ViewToggle";
import { formatDate, todayLocal } from "@/lib/labels";
import { daysWithoutComing, INACTIVE_DAYS, isInactive } from "@/lib/inactive";

// Solo las columnas que usa la lista. member_overview calcula cada columna
// por socio (cumpleaños, última entrada, entradas de hoy...) y con select("*")
// se calculaban y viajaban todas, incluidas las que acá no se muestran.
// last_check_in_at y period_start son para el filtro "Inactivos".
const LIST_COLUMNS =
  "id, full_name, photo_url, effective_status, plan_name, uses_total, uses_remaining, " +
  "days_left, period_start, period_end, checked_in_today, last_check_in_at";

type ListMember = Pick<
  MemberOverview,
  | "id"
  | "full_name"
  | "photo_url"
  | "effective_status"
  | "plan_name"
  | "uses_total"
  | "uses_remaining"
  | "days_left"
  | "period_start"
  | "period_end"
  | "checked_in_today"
  | "last_check_in_at"
>;

const FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "al-dia", label: "Al día" },
  { key: "por-vencer", label: "Por vencer" },
  { key: "vencidos", label: "Vencidos" },
  { key: "inactivos", label: "Inactivos" },
  // Solo aparece si hay alguno (o si es el filtro elegido): ver abajo.
  { key: "pausados", label: "Pausados" },
  { key: "baja", label: "Dados de baja" },
] as const;

/**
 * Texto del buscador listo para meter en un filtro .or() de PostgREST.
 *
 * El .or() es un string: una coma o un paréntesis del usuario lo cortaban
 * (error) o le agregaban condiciones propias. Se sacan los caracteres con
 * significado ahí (coma, paréntesis, comillas, barra invertida y el
 * comodín *) y los comodines de LIKE (% y _), que no tienen sentido en una
 * búsqueda por nombre o número.
 */
function sanitizeSearch(raw: string): string {
  return raw
    .replace(/[,()"\\*%_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export default async function SociosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; f?: string; view?: string }>;
}) {
  const { q = "", f = "todos", view: viewParam } = await searchParams;
  const view: SociosView = viewParam === "list" ? "list" : "grid";
  const supabase = await createClient();

  // Los dados de baja no cuentan en nada (totales, vencidos, entraron hoy):
  // solo aparecen en su propio filtro.
  const showArchived = f === "baja";
  let query = supabase.from("member_overview").select(LIST_COLUMNS).order("full_name");
  query = showArchived
    ? query.not("archived_at", "is", null)
    : query.is("archived_at", null);
  const term = sanitizeSearch(q);
  if (term) {
    // Con dígitos se busca también por DNI y por teléfono ("30.123", "299 412").
    const digits = term.replace(/\D/g, "");
    query = digits
      ? query.or(`full_name.ilike.%${term}%,dni.ilike.%${digits}%,phone.ilike.%${digits}%`)
      : query.ilike("full_name", `%${term}%`);
  }

  const [{ data }, { count: archivedCount }] = await Promise.all([
    query,
    supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .not("archived_at", "is", null),
  ]);
  const all = (data ?? []) as unknown as ListMember[];

  const porVencer = all.filter(
    (m) =>
      m.effective_status === "active" &&
      ((m.uses_remaining ?? 99) <= 2 || (m.days_left ?? 99) <= 3)
  );

  const activos = all.filter((m) => m.effective_status === "active");
  const vencidos = all.filter(
    (m) => m.effective_status === "expired" || m.effective_status === "exhausted"
  );
  // Pase pausado (sql/33): no está al día, ni por vencer, ni vencido.
  const pausados = all.filter((m) => m.effective_status === "paused");
  // Pase al día pero no vienen hace rato (la regla vive en lib/inactive.ts).
  const today = todayLocal();
  const inactivos = all.filter((m) => isInactive(m, today));

  let members = all;
  if (f === "al-dia") {
    members = activos;
  } else if (f === "vencidos") {
    members = vencidos;
  } else if (f === "por-vencer") {
    members = porVencer;
  } else if (f === "pausados") {
    members = pausados;
  } else if (f === "inactivos") {
    // Los que hace más que no vienen, primero.
    members = inactivos
      .map((m) => ({ m, days: daysWithoutComing(m, today) ?? 0 }))
      .sort((a, b) => b.days - a.days)
      .map((x) => x.m);
  }

  const entraronHoy = all.filter((m) => m.checked_in_today).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Socios"
        description={
          <>
            Gestioná los socios de tu gimnasio
            {entraronHoy > 0 && (
              <>
                {". "}
                <span className="num font-medium text-txt">{entraronHoy}</span>{" "}
                {entraronHoy === 1 ? "entró" : "entraron"} hoy.
              </>
            )}
          </>
        }
        actions={
          <Link href="/panel/socios/nuevo" className="btn-primary">
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nuevo socio
          </Link>
        }
      />

      {/* Buscar primero: es a lo que se viene */}
      <div className="space-y-3">
        <SearchBox defaultValue={q} />

        <div className="flex items-center gap-3">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -ml-4 pl-4 sm:ml-0 sm:pl-0 flex-1">
          {FILTERS.map((filter) => {
            const active = f === filter.key;
            if (filter.key === "pausados" && pausados.length === 0 && !active) return null;
            const count =
              filter.key === "por-vencer" && porVencer.length > 0
                ? porVencer.length
                : filter.key === "pausados" && pausados.length > 0
                  ? pausados.length
                  : filter.key === "inactivos" && inactivos.length > 0
                    ? inactivos.length
                    : filter.key === "baja" && archivedCount
                      ? archivedCount
                      : null;
            const qs = [
              `f=${filter.key}`,
              q ? `q=${encodeURIComponent(q)}` : "",
              view === "list" ? "view=list" : "",
            ]
              .filter(Boolean)
              .join("&");

            return (
              <Link
                key={filter.key}
                href={`/panel/socios?${qs}`}
                aria-current={active ? "page" : undefined}
                className={active ? "chip chip-on" : "chip"}
              >
                {filter.label}
                {count && (
                  <span
                    className={`num text-micro ${active ? "text-txt-onDarkSoft" : "text-txt-faint"}`}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
          </div>

          <ViewToggle value={view} />
        </div>
      </div>

      {!showArchived && (
        <dl className="grid grid-cols-4 divide-x divide-line border-y border-line">
          {[
            { label: "Total", value: all.length, dot: null },
            { label: "Al día", value: activos.length, dot: "bg-plate-green" },
            { label: "Por vencer", value: porVencer.length, dot: "bg-plate-amber" },
            { label: "Vencidos", value: vencidos.length, dot: "bg-plate-red" },
          ].map((stat) => (
            <div key={stat.label} className="px-2 sm:px-4 py-2.5 first:pl-0 min-w-0">
              <dt className="flex items-center gap-1.5 text-micro sm:text-tiny text-txt-faint truncate">
                {stat.dot && <span className={`size-1.5 rounded-full shrink-0 ${stat.dot}`} aria-hidden="true" />}
                {stat.label}
              </dt>
              <dd className="num text-lg sm:text-title font-semibold">{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {members.length === 0 ? (
        <EmptyState
          title={
            q
              ? "Ningún socio coincide"
              : showArchived
                ? "No hay socios dados de baja"
                : f === "inactivos"
                  ? "Nadie inactivo"
                  : "Todavía no hay socios"
          }
          description={
            q
              ? "Probá con otro nombre, DNI o teléfono, o revisá la ortografía."
              : showArchived
                ? "Cuando des de baja a alguien desde su ficha, aparece acá y lo podés reactivar."
                : f === "inactivos"
                  ? `Todos los que tienen el pase al día vinieron en los últimos ${INACTIVE_DAYS} días.`
                  : "Cargá el primero y en el mismo paso le activás el pase."
          }
        >
          {!q && !showArchived && f !== "inactivos" && (
            <Link href="/panel/socios/nuevo" className="btn-primary">
              Cargar socio
            </Link>
          )}
        </EmptyState>
      ) : view === "list" ? (
        <ul className="border-y border-line divide-y divide-line">
          {members.map((m) => (
            <li key={m.id}>
              <Link
                href={`/panel/socios/${m.id}`}
                className="flex items-center gap-3 px-1 py-2.5 min-h-14 hover:bg-surface-hover transition-colors"
              >
                <div className="relative shrink-0">
                  <Avatar name={m.full_name} url={m.photo_url} size={32} />
                  {m.checked_in_today && (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full
                                 bg-plate-green ring-2 ring-surface"
                      title="Entró hoy"
                    />
                  )}
                </div>

                <span className="min-w-0 flex-1 truncate font-medium">{m.full_name}</span>

                <StatusBadge status={m.effective_status} />

                <span className="hidden sm:block w-32 shrink-0 truncate text-tiny text-txt-faint">
                  {m.plan_name ?? "Sin plan"}
                </span>

                {m.uses_total != null && m.uses_remaining != null ? (
                  <span className="hidden md:block w-24 shrink-0 num text-tiny text-txt-soft text-right">
                    {m.uses_remaining}/{m.uses_total}
                  </span>
                ) : (
                  <span className="hidden md:block w-24 shrink-0" />
                )}

                <span className="hidden lg:block w-24 shrink-0 text-right num text-tiny text-txt-faint">
                  {m.period_end ? formatDate(m.period_end) : "—"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {members.map((m) => (
            <li key={m.id}>
              <Link href={`/panel/socios/${m.id}`} className="card-link h-full px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <Avatar name={m.full_name} url={m.photo_url} />
                    {m.checked_in_today && (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full
                                   bg-plate-green ring-2 ring-surface"
                        title="Entró hoy"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-base leading-tight font-medium truncate">{m.full_name}</p>
                    <div className="mt-1 flex items-center gap-2 min-w-0">
                      <StatusBadge status={m.effective_status} />
                      <span className="text-tiny text-txt-faint truncate">
                        {m.plan_name ?? "Sin plan"}
                      </span>
                    </div>
                  </div>

                  {m.uses_total != null && m.uses_remaining != null && (
                    <div className="w-20 sm:w-28 shrink-0">
                      <UsesTally
                        total={m.uses_total}
                        remaining={m.uses_remaining}
                        size="sm"
                      />
                    </div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
