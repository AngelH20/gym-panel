import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAdminRole } from "@/lib/supabase/role";
import type { MemberOverview, Membership, Plan } from "@/lib/types";
import { isManagerRole } from "@/lib/roles";
import { formatDate, formatDateTime, todayLocal } from "@/lib/labels";
import { Avatar } from "@/components/Avatar";
import { BackLink } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { UsesTally } from "@/components/UsesTally";
import { WhatsAppLink } from "@/components/WhatsAppLink";
import { getGymName } from "@/lib/gym";
import { suggestedMessage } from "@/lib/whatsapp";
import { MemberActions } from "./MemberActions";
import { ArchivedBanner } from "./ArchivedBanner";
import { EditMemberForm } from "./EditMemberForm";
import { FamilyCard, type FamilyCandidate, type FamilyMember } from "./FamilyCard";
import { PausePass } from "./PausePass";

/** Columnas explícitas, sin qr_token: la fila termina serializada en
 *  componentes cliente (MemberActions, EditMemberForm) y ese token viejo
 *  por socio no tiene por qué llegar al navegador. */
const MEMBER_DETAIL_COLUMNS =
  "id, full_name, phone, email, dni, photo_url, joined_on, member_status, membership_id, plan_id, plan_name, period_start, period_end, uses_total, uses_remaining, effective_status, days_left, checked_in_today, visits_today, last_check_in_at, welcome_message, birth_date, next_birthday, days_to_birthday, is_birthday_today, archived_at, archived_by_name";

export default async function SocioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Para el pack familiar: quién es familia de quién, y a quién se lo puede
  // vincular. La consulta de la familia depende de esta lista, así que se
  // encadena SOLO a ella: arranca apenas vuelve la lista, sin esperar al
  // resto de las consultas de abajo.
  const familyPromise = supabase
    .from("members")
    .select("id, full_name, family_id")
    .is("archived_at", null)
    .order("full_name")
    .then(async ({ data: allMembers }) => {
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
      return { members, familyId, familyIds, family };
    });

  // Todo junto, el socio incluido: son viajes independientes a Supabase.
  // Antes el socio iba primero y el resto esperaba a que volviera.
  const [
    { data: member },
    { data: plans },
    { data: history },
    { data: checkIns },
    role,
    { members, familyId, familyIds, family },
    gymName,
  ] = await Promise.all([
      supabase.from("member_overview").select(MEMBER_DETAIL_COLUMNS).eq("id", id).maybeSingle(),
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
      // Cacheado por request: el layout ya lo pidió, no es otro viaje.
      getCurrentAdminRole(),
      familyPromise,
      // Para el mensaje de WhatsApp. Cacheado: el layout ya lo pidió.
      getGymName(),
    ]);

  if (!member) notFound();
  const m = member as MemberOverview;

  // Pausa del pase vigente. Sale de memberships (select "*", ya pedido para
  // el historial) y no de la vista: así la ficha anda igual aunque la base
  // todavía no tenga las columnas de sql/33 (quedan undefined).
  const today = todayLocal();
  const activeMembership =
    ((history ?? []) as Membership[]).find((h) => h.id === m.membership_id) ?? null;
  const pausedUntil =
    activeMembership?.paused_until && activeMembership.paused_until > today
      ? activeMembership.paused_until
      : null;

  // El socio cuenta: una familia de 2 más él son 3, y ahí ya va el pack.
  const familySize = familyId ? familyIds.length + 1 : 1;
  const sellablePlans = ((plans ?? []) as Plan[]).filter(
    (p) => !p.is_family || familySize >= 3
  );

  return (
    <div className="w-full space-y-6">
      {/* Quién es y si puede entrar */}
      <div className="space-y-3">
        <BackLink href="/panel/socios" label="Socios" />
        <div className="flex items-center gap-4">
          <Avatar name={m.full_name} url={m.photo_url} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="h1 break-words">{m.full_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              <StatusBadge status={m.effective_status} />
              {m.checked_in_today && (
                <span className="inline-flex items-center gap-1.5 text-tiny text-txt-soft">
                  <span className="size-1.5 rounded-full bg-plate-green" aria-hidden="true" />
                  {m.visits_today > 1 ? `Entró ${m.visits_today} veces hoy` : "Entró hoy"}
                </span>
              )}
            </div>
          </div>
          {/* El mensaje se elige según cómo está: cumpleaños, vencido, por
              vencer, no viene hace rato o un saludo (ver lib/whatsapp.ts). */}
          <WhatsAppLink
            phone={m.phone}
            name={m.full_name}
            label="WhatsApp"
            message={suggestedMessage(m, gymName, todayLocal())}
            className="shrink-0"
          />
        </div>
      </div>

      {/*
        Dos columnas en escritorio (una en celular). La izquierda es lo que
        se viene a hacer (ver el pase, renovarlo); la derecha, de consulta
        (datos, familia, últimas entradas, historial).
      */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6 min-w-0">
          <section className="card">
            {m.uses_total != null && m.uses_remaining != null ? (
              <>
                {/* El contador, con el mayor peso de la pantalla */}
                <div className="p-5">
                  <div className="flex items-baseline justify-between gap-3 mb-3">
                    <span className="eyebrow">Entradas restantes</span>
                    <span className="text-tiny font-medium text-txt-soft truncate">{m.plan_name}</span>
                  </div>
                  <UsesTally total={m.uses_total} remaining={m.uses_remaining} size="lg" />
                </div>

                <dl className="grid grid-cols-2 divide-x divide-line border-t border-line">
                  <div className="px-5 py-4">
                    <dt className="eyebrow">Vence</dt>
                    <dd className="mt-0.5 num text-base font-medium">
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
                  <div className="px-5 py-4">
                    <dt className="eyebrow">Última entrada</dt>
                    <dd className="mt-0.5 num text-base font-medium">
                      {formatDateTime(m.last_check_in_at)}
                    </dd>
                  </div>
                </dl>

                {activeMembership && m.period_end && (
                  <PausePass
                    membershipId={activeMembership.id}
                    periodEnd={m.period_end}
                    today={today}
                    pausedUntil={pausedUntil}
                    pausedAt={activeMembership.paused_at}
                    pausedByName={activeMembership.paused_by_name}
                    pauseReason={activeMembership.pause_reason}
                    canPause={
                      // "paused_until" in ...: la base ya tiene sql/33.
                      "paused_until" in activeMembership &&
                      m.period_end >= today &&
                      m.uses_remaining > 0
                    }
                    canManage={isManagerRole(role)}
                  />
                )}
              </>
            ) : (
              <p className="p-5 text-tiny text-txt-soft">
                Este socio no tiene un pase activo. Activale uno abajo para que pueda entrar.
              </p>
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
              today={today}
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
            <h2 className="h3 mb-2">Últimas entradas</h2>

            {(checkIns ?? []).length === 0 ? (
              <p className="text-tiny text-txt-faint">
                Todavía no registró ninguna entrada.
              </p>
            ) : (
              <ul className="datalist sm:grid sm:grid-cols-2 sm:gap-x-6 sm:divide-y-0">
                {(checkIns ?? []).map((c) => (
                  <li key={c.id} className="py-2.5 flex items-center gap-2.5">
                    <span
                      className={`size-1.5 rounded-full shrink-0 ${
                        c.charged ? "bg-txt-soft" : "bg-line-strong"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="num text-tiny text-txt-soft">
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
                      <p className="text-base truncate">
                        {h.plans?.name ?? "Plan eliminado"}
                      </p>
                      <p className="num text-micro text-txt-faint mt-0.5">
                        {formatDate(h.period_start)} → {formatDate(h.period_end)}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <span className="num text-base font-semibold">
                        {h.uses_total - h.uses_remaining}
                      </span>
                      <span className="num text-tiny text-txt-faint">
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
