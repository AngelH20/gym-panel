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
import { formatDate } from "@/lib/labels";

// Solo las columnas que usa la lista. member_overview calcula cada columna
// por socio (cumpleaños, última entrada, entradas de hoy...) y con select("*")
// se calculaban y viajaban todas, incluidas las que acá no se muestran.
const LIST_COLUMNS =
  "id, full_name, photo_url, effective_status, plan_name, uses_total, uses_remaining, " +
  "days_left, period_end, checked_in_today";

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
  | "period_end"
  | "checked_in_today"
>;

const FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "al-dia", label: "Al día" },
  { key: "por-vencer", label: "Por vencer" },
  { key: "vencidos", label: "Vencidos" },
  // Solo aparece si hay alguno (o si es el filtro elegido): ver abajo.
  { key: "pausados", label: "Pausados" },
  { key: "baja", label: "Dados de baja" },
] as const;

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
  if (q.trim()) {
    const term = q.trim();
    const dniTerm = term.replace(/\D/g, "");
    query = dniTerm
      ? query.or(`full_name.ilike.%${term}%,dni.ilike.%${dniTerm}%`)
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

  let members = all;
  if (f === "al-dia") {
    members = activos;
  } else if (f === "vencidos") {
    members = vencidos;
  } else if (f === "por-vencer") {
    members = porVencer;
  } else if (f === "pausados") {
    members = pausados;
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
                : "Todavía no hay socios"
          }
          description={
            q
              ? "Probá con otro nombre o revisá la ortografía."
              : showArchived
                ? "Cuando des de baja a alguien desde su ficha, aparece acá y lo podés reactivar."
                : "Cargá el primero y en el mismo paso le activás el pase."
          }
        >
          {!q && !showArchived && (
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
