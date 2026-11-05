import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MemberOverview, Membership, Plan } from "@/lib/types";
import { isManagerRole } from "@/lib/roles";
import { formatDate, formatDateTime, todayLocal } from "@/lib/labels";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { UsesTally } from "@/components/UsesTally";
import { MemberActions } from "./MemberActions";
import { ArchivedBanner } from "./ArchivedBanner";
import { EditMemberForm } from "./EditMemberForm";
import { FamilyCard, type FamilyCandidate, type FamilyMember } from "./FamilyCard";

export default async function SocioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Todo junto, el socio incluido: son viajes independientes a Supabase.
  // Antes el socio iba primero y el resto esperaba a que volviera.
  const [
    { data: member },
    { data: plans },
    { data: history },
    { data: checkIns },
    { data: role },
    { data: allMembers },
  ] = await Promise.all([
      supabase.from("member_overview").select("*").eq("id", id).maybeSingle(),
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
      // Para el pack familiar: quién es familia de quién, y a quién se lo
      // puede vincular.
      supabase
        .from("members")
        .select("id, full_name, family_id")
        .is("archived_at", null)
        .order("full_name"),
    ]);

  if (!member) notFound();
  const m = member as MemberOverview;

  const members = (allMembers ?? []) as FamilyCandidate[];
  const familyId = members.find((x) => x.id === id)?.family_id ?? null;
  const familyIds = familyId
    ? members.filter((x) => x.family_id === familyId && x.id !== id).map((x) => x.id)
    : [];
  const { data: family } = familyIds.length
    ? await supabase
        .from("member_overview")
        .select("id, full_name, plan_name, effective_status")
        .in("id", familyIds)
        .order("full_name")
    : { data: [] };
  // El socio cuenta: una familia de 2 más él son 3, y ahí ya va el pack.
  const familySize = familyId ? familyIds.length + 1 : 1;
  const sellablePlans = ((plans ?? []) as Plan[]).filter(
    (p) => !p.is_family || familySize >= 3
  );

  return (
    <div className="mx-auto w-full max-w-[1700px] space-y-4">
      <Link
        href="/panel/socios"
        className="-ml-1 inline-flex min-h-10 items-center gap-1.5 rounded-control px-1 text-tiny font-semibold text-txt-soft hover:text-txt transition-colors"
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
        Dos columnas anchas y parejas en escritorio (una en celular), con un
        tope de ancho para que no se estire infinito y los márgenes queden
        iguales a los dos lados. La izquierda es lo que se viene a hacer
        (ver entradas, renovar el pase); la derecha, de consulta (datos,
        últimas entradas, historial). Las dos quedan de alto parecido.
      */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        <div className="space-y-5 min-w-0">
          {/* Cabecera: quién es y si puede entrar */}
          <section className="card overflow-hidden">
            <div className="p-5 flex items-center gap-4">
              <Avatar name={m.full_name} url={m.photo_url} size={64} />

              <div className="min-w-0 flex-1">
                <h1 className="font-display text-[1.875rem] leading-[1.05] font-extrabold break-words">
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
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <span className="eyebrow">Entradas restantes</span>
                    <span className="text-tiny font-medium text-txt-soft truncate">{m.plan_name}</span>
                  </div>
                  <UsesTally total={m.uses_total} remaining={m.uses_remaining} size="lg" />
                </div>

                <dl className="grid grid-cols-2 divide-x divide-line">
                  <div className="p-4">
                    <dt className="eyebrow">Vence</dt>
                    <dd className="mt-1 font-mono text-lg font-semibold">
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
                    <dd className="mt-1 font-mono text-lg font-semibold">
                      {formatDateTime(m.last_check_in_at)}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <div className="px-5 pb-5">
                <p className="note">
                  Este socio no tiene un pase activo. Activale uno abajo para que pueda entrar.
                </p>
              </div>
            )}
          </section>

          {m.archived_at ? (
            <ArchivedBanner
              memberId={m.id}
              archivedAt={m.archived_at}
              archivedByName={m.archived_by_name}
              canReactivate={isManagerRole(role)}
            />
          ) : (
            <MemberActions
              member={m}
              plans={sellablePlans}
              today={todayLocal()}
              latestMembership={(history?.[0] as Membership | undefined) ?? null}
              role={role}
              familySize={familySize}
            />
          )}
        </div>

        {/* Columna 2 (consulta): datos, familia, últimas entradas e historial */}
        <div className="space-y-5 min-w-0">
          <EditMemberForm member={m} />

          {!m.archived_at && (
            <FamilyCard
              memberId={id}
              family={(family ?? []) as FamilyMember[]}
              candidates={members.filter(
                (x) => x.id !== id && (!familyId || x.family_id !== familyId)
              )}
            />
          )}

          {/* Últimas entradas */}
          <section className="card p-5">
            <h2 className="h3 mb-3">Últimas entradas</h2>

            {(checkIns ?? []).length === 0 ? (
              <p className="text-base text-txt-soft">
                Todavía no registró ninguna entrada.
              </p>
            ) : (
              <ul className="datalist sm:grid sm:grid-cols-2 sm:gap-x-6 sm:divide-y-0">
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
                      <span className="text-micro text-txt-faint">
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
                      <p className="font-mono text-micro text-txt-faint mt-0.5">
                        {formatDate(h.period_start)} → {formatDate(h.period_end)}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <span className="font-display text-title leading-none font-extrabold">
                        {h.uses_total - h.uses_remaining}
                      </span>
                      <span className="font-mono text-tiny text-txt-faint">
                        /{h.uses_total}
                      </span>
                      <p className="text-micro text-txt-faint">usadas</p>
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
