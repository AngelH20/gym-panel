import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Plan } from "@/lib/types";
import { todayLocal } from "@/lib/labels";
import { NewMemberForm, type Relative } from "./NewMemberForm";

export default async function NuevoSocioPage() {
  const supabase = await createClient();
  const today = todayLocal();

  const [{ data: plans }, { data: opening }, { data: closing }, { data: members }] =
    await Promise.all([
      supabase.from("plans").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("cash_openings").select("id").eq("opening_date", today).maybeSingle(),
      supabase.from("cash_closings").select("id").eq("closing_date", today).maybeSingle(),
      // Para "Es familiar de…" (pack familiar).
      supabase.from("members").select("id, full_name, family_id").order("full_name"),
    ]);

  const cajaAbierta = Boolean(opening) && !closing;

  return (
    <div className="space-y-4">
      <Link
        href="/panel/socios"
        className="inline-flex items-center gap-1.5 text-tiny text-txt-soft hover:text-txt transition-colors"
      >
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 19l-7-7 7-7" />
        </svg>
        Socios
      </Link>

      <h1 className="h1">Nuevo socio</h1>

      <NewMemberForm
        plans={(plans ?? []) as Plan[]}
        members={(members ?? []) as Relative[]}
        cajaAbierta={cajaAbierta}
        today={today}
      />
    </div>
  );
}
