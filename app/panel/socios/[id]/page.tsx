import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MemberOverview, Membership, Plan } from "@/lib/types";
import { formatDate, formatDateTime, todayLocal } from "@/lib/labels";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { UsesTally } from "@/components/UsesTally";
import { MemberActions } from "./MemberActions";
import { EditMemberForm } from "./EditMemberForm";

export default async function SocioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: member } = await supabase
    .from("member_overview")
    .select("*")
    .eq("id", id)
    .single();

  if (!member) notFound();
  const m = member as MemberOverview;

  const [{ data: plans }, { data: history }, { data: checkIns }, { data: role }] =
    await Promise.all([
      supabase.from("plans").select("*").eq("is_active", true).order("sort_order"),
      supabase
        .from("memberships")
        .select("*, plans(name)")
        .eq("member_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("check_ins")
        .select("id, checked_in_at, local_date, charged")
        .eq("member_id", id)
        .order("checked_in_at", { ascending: false })
        .limit(10),
      supabase.rpc("current_admin_role"),
    ]);

  return (
    <div className="space-y-4">
      <Link
        href="/panel/socios"
        className="inline-flex items-center gap-1.5 text-tiny text-txt-soft hover:text-txt transition-colors"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M15 19l-7-7 7-7" />
        </svg>
        Socios
      </Link>

      {/*
        A la izquierda, en una columna de ancho acotado (para que el
        formulario no quede gigante), va lo que se viene a hacer: ver cuántas
        entradas quedan y renovar el pase. A la derecha, ocupando TODO el
        resto del ancho, las tarjetas de consulta (datos, últimas entradas,
        historial) repartidas en varias columnas según entre la pantalla.
        En celular es una sola columna apilada.
      */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-4 min-w-0">
          {/* Cabecera: quién es y si puede entrar */}
          <section className="card overflow-hidden">
            <div className="p-5 flex items-start gap-4">
              <Avatar name={m.full_name} url={m.photo_url} size={60} />

              <div className="min-w-0 flex-1">
                <h1 className="font-display text-title font-semibold leading-tight truncate">
                  {m.full_name}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={m.effective_status} />
                  {m.checked_in_today && (
                    <span className="badge border-plate-green/30 bg-plate-green/10 text-plate-green">
                      {m.visits_today > 1 ? `Entró ${m.visits_today} veces hoy` : "Entró hoy"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {m.uses_total != null && m.uses_remaining != null ? (
              <>
                {/* El contador, con el mayor peso visual de la pantalla */}
                <div className="px-5 py-5 bg-surface-sunk border-y border-line">
                  <div className="flex items-baseline justify-between gap-3 mb-3">
                    <span className="eyebrow">Entradas restantes</span>
                    <span className="text-tiny text-txt-soft">{m.plan_name}</span>
                  </div>
                  <UsesTally total={m.uses_total} remaining={m.uses_remaining} size="lg" />
                </div>

                <dl className="grid grid-cols-2 divide-x divide-line">
                  <div className="p-4">
                    <dt className="eyebrow">Vence</dt>
                    <dd className="mt-1 font-mono text-base">
                      {formatDate(m.period_end)}
                      {m.days_left != null && m.days_left >= 0 && (
                        <span
                          className={
                            m.days_left <= 3 ? "text-plate-red ml-1.5" : "text-txt-faint ml-1.5"
                          }
                        >
                          {m.days_left}d
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="p-4">
                    <dt className="eyebrow">Última entrada</dt>
                    <dd className="mt-1 font-mono text-base">
                      {formatDateTime(m.last_check_in_at)}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <div className="px-5 pb-5">
                <p className="rounded-control bg-surface-sunk border border-line px-4 py-3 text-tiny text-txt-soft">
                  Este socio no tiene un pase activo. Activale uno abajo para que pueda entrar.
                </p>
              </div>
            )}
          </section>

          <MemberActions
            member={m}
            plans={(plans ?? []) as Plan[]}
            today={todayLocal()}
            latestMembership={(history?.[0] as Membership | undefined) ?? null}
            role={role}
          />
        </div>

        {/*
          Consulta: ocupa todo el ancho que sobra y reparte las tarjetas en
          1 / 2 / 3 columnas según el tamaño de pantalla, para no dejar la
          mitad derecha vacía en un monitor ancho.
        */}
        <div className="grid gap-4 items-start content-start sm:grid-cols-2 2xl:grid-cols-3">
          <EditMemberForm member={m} />

          {/* Últimas entradas */}
          <section className="card p-5">
            <h2 className="h3 mb-3">Últimas entradas</h2>

            {(checkIns ?? []).length === 0 ? (
              <p className="text-base text-txt-soft">
                Todavía no registró ninguna entrada.
              </p>
            ) : (
              <ul className="datalist">
                {(checkIns ?? []).map((c) => (
                  <li key={c.id} className="py-2.5 flex items-center gap-2.5">
                    <span
                      className={`size-1.5 rounded-full shrink-0 ${
                        c.charged ? "bg-plate-green" : "bg-plate-blue"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="font-mono text-tiny text-txt-soft">
                      {formatDateTime(c.checked_in_at)}
                    </span>
                    {!c.charged && (
                      <span className="text-[10px] text-txt-faint">
                        reingreso, no descontó pase
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Historial de pases */}
          <section className="card p-5">
            <h2 className="h3 mb-1">Historial de pases</h2>
            <p className="text-tiny text-txt-faint mb-3">
              Cada renovación queda registrada. Nada se sobreescribe.
            </p>

            <ul className="datalist">
              {((history ?? []) as (Membership & { plans: { name: string } | null })[]).map(
                (h) => (
                  <li key={h.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-medium truncate">
                        {h.plans?.name ?? "Plan eliminado"}
                      </p>
                      <p className="font-mono text-[11px] text-txt-faint mt-0.5">
                        {formatDate(h.period_start)} → {formatDate(h.period_end)}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <span className="font-mono text-base font-medium">
                        {h.uses_total - h.uses_remaining}
                      </span>
                      <span className="font-mono text-tiny text-txt-faint">
                        /{h.uses_total}
                      </span>
                      <p className="text-[10px] text-txt-faint">usadas</p>
                    </div>
                  </li>
                )
              )}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
