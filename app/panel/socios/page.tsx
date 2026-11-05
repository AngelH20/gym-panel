import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { MemberOverview } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { UsesTally } from "@/components/UsesTally";
import { EmptyState } from "@/components/Form";
import { StatCard } from "@/components/StatCard";
import { IconPeople, IconCheck, IconAlert, IconPersonMinus } from "@/components/icons";
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

  let members = all;
  if (f === "al-dia") {
    members = activos;
  } else if (f === "vencidos") {
    members = vencidos;
  } else if (f === "por-vencer") {
    members = porVencer;
  }

  const entraronHoy = all.filter((m) => m.checked_in_today).length;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="h1">Socios</h1>
          <p className="mt-2 text-tiny sm:text-base text-txt-soft">
            Gestioná los socios de tu gimnasio
            {entraronHoy > 0 && (
              <>
                {" · "}
                <span className="font-mono font-bold text-plate-green">
                  {entraronHoy}
                </span>{" "}
                {entraronHoy === 1 ? "entró" : "entraron"} hoy
              </>
            )}
          </p>
        </div>

        <Link href="/panel/socios/nuevo" className="btn-primary shrink-0">
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nuevo socio
        </Link>
      </div>

      {!showArchived && (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total" value={all.length} accent="blue" icon={<IconPeople />} />
        <StatCard label="Al día" value={activos.length} accent="green" icon={<IconCheck />} />
        <StatCard
          label="Por vencer"
          value={porVencer.length}
          accent="amber"
          icon={<IconAlert />}
        />
        <StatCard
          label="Vencidos"
          value={vencidos.length}
          accent="red"
          icon={<IconPersonMinus />}
        />
      </div>
      )}

      <SearchBox defaultValue={q} />

      <div className="flex items-center gap-3">
        <div className="flex gap-2 overflow-x-auto no-scrollbar -ml-4 pl-4 sm:ml-0 sm:pl-0 flex-1">
          {FILTERS.map((filter) => {
            const active = f === filter.key;
            const count =
              filter.key === "por-vencer" && porVencer.length > 0
                ? porVencer.length
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
                    className={[
                      "font-mono text-micro font-bold rounded-full px-1.5 min-w-5 text-center",
                      active ? "bg-ink-raised" : "bg-plate-amber/30 text-plate-amberInk",
                    ].join(" ")}
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
        <ul className="card divide-y divide-line overflow-hidden">
          {members.map((m) => (
            <li key={m.id}>
              <Link
                href={`/panel/socios/${m.id}`}
                className="flex items-center gap-3 px-4 py-2.5 min-h-14 hover:bg-surface-hover transition-colors"
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

                <span className="min-w-0 flex-1 truncate font-semibold">{m.full_name}</span>

                <StatusBadge status={m.effective_status} />

                <span className="hidden sm:block w-32 shrink-0 truncate text-tiny text-txt-faint">
                  {m.plan_name ?? "Sin plan"}
                </span>

                {m.uses_total != null && m.uses_remaining != null ? (
                  <span className="hidden md:block w-24 shrink-0 font-mono text-tiny text-txt-soft text-right">
                    {m.uses_remaining}/{m.uses_total}
                  </span>
                ) : (
                  <span className="hidden md:block w-24 shrink-0" />
                )}

                <span className="hidden lg:block w-24 shrink-0 text-right font-mono text-tiny text-txt-faint">
                  {m.period_end ? formatDate(m.period_end) : "—"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {members.map((m) => (
            <li key={m.id}>
              <Link href={`/panel/socios/${m.id}`} className="card-link h-full p-4">
                <div className="flex items-center gap-3.5">
                  <div className="relative shrink-0">
                    <Avatar name={m.full_name} url={m.photo_url} />
                    {m.checked_in_today && (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full
                                   bg-plate-green ring-2 ring-surface"
                        title="Entró hoy"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-lg leading-tight font-semibold truncate">{m.full_name}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <StatusBadge status={m.effective_status} />
                      <span className="text-tiny text-txt-faint truncate">
                        {m.plan_name ?? "Sin plan"}
                      </span>
                    </div>
                  </div>

                  {m.uses_total != null && m.uses_remaining != null && (
                    <div className="w-24 sm:w-32 shrink-0">
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
