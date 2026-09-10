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

const FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "al-dia", label: "Al día" },
  { key: "por-vencer", label: "Por vencer" },
  { key: "vencidos", label: "Vencidos" },
] as const;

export default async function SociosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; f?: string }>;
}) {
  const { q = "", f = "todos" } = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("member_overview").select("*").order("full_name");
  if (q.trim()) {
    const term = q.trim();
    const dniTerm = term.replace(/\D/g, "");
    query = dniTerm
      ? query.or(`full_name.ilike.%${term}%,dni.ilike.%${dniTerm}%`)
      : query.ilike("full_name", `%${term}%`);
  }

  const { data } = await query;
  const all = (data ?? []) as MemberOverview[];

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="h1">Socios</h1>
          <p className="mt-1 text-tiny text-txt-soft">
            Gestioná los socios de tu gimnasio
            {entraronHoy > 0 && (
              <>
                {" · "}
                <span className="font-mono font-medium text-plate-green">
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

      <SearchBox defaultValue={q} />

      <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-4 px-4">
        {FILTERS.map((filter) => {
          const active = f === filter.key;
          const count =
            filter.key === "por-vencer" && porVencer.length > 0
              ? porVencer.length
              : null;

          return (
            <Link
              key={filter.key}
              href={`/panel/socios?f=${filter.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={[
                "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5",
                "text-tiny font-medium transition-colors",
                active
                  ? "bg-ink text-txt-onDark border-ink"
                  : "bg-surface border-line text-txt-soft hover:border-line-strong hover:text-txt",
              ].join(" ")}
            >
              {filter.label}
              {count && (
                <span
                  className={[
                    "font-mono text-[10px] rounded-full px-1.5",
                    active ? "bg-ink-raised" : "bg-plate-amber/25 text-plate-amberInk",
                  ].join(" ")}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {members.length === 0 ? (
        <EmptyState
          title={q ? "Ningún socio coincide" : "Todavía no hay socios"}
          description={
            q
              ? "Probá con otro nombre o revisá la ortografía."
              : "Cargá el primero y en el mismo paso le activás el pase."
          }
        >
          {!q && (
            <Link href="/panel/socios/nuevo" className="btn-primary">
              Cargar socio
            </Link>
          )}
        </EmptyState>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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
                    <p className="font-medium truncate">{m.full_name}</p>
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
