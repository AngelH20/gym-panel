import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { MemberOverview } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { formatDayMonth, ageOnNextBirthday } from "@/lib/labels";
import { PageHeader } from "@/components/PageHeader";

/**
 * Listado de cumpleaños ordenado por el más cercano. La idea es que
 * recepción lo chequee al abrir y sepa a quién saludar hoy; el saludo
 * automático en el kiosco (ver perform_check_in_by_dni) hace el resto
 * cuando esa persona escanea su entrada.
 */
export default async function CumpleañosPage() {
  const supabase = await createClient();

  // Las dos consultas son independientes: salen juntas.
  const [{ data }, { count: sinFecha }] = await Promise.all([
    supabase
      .from("member_overview")
      .select(
        "id, full_name, photo_url, birth_date, next_birthday, days_to_birthday, is_birthday_today"
      )
      .not("birth_date", "is", null)
      .is("archived_at", null)
      .order("days_to_birthday", { ascending: true }),
    supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .is("birth_date", null)
      .is("archived_at", null),
  ]);

  const all = (data ?? []) as Pick<
    MemberOverview,
    | "id"
    | "full_name"
    | "photo_url"
    | "birth_date"
    | "next_birthday"
    | "days_to_birthday"
    | "is_birthday_today"
  >[];

  const hoy = all.filter((m) => m.is_birthday_today);
  const proximos = all.filter((m) => !m.is_birthday_today);

  return (
    <div className="w-full space-y-8">
      <PageHeader
        title="Cumpleaños"
        description="De más cercano a más lejano. El saludo sale solo, el día que escanean."
      />

      {hoy.length > 0 && (
        <section>
          <h2 className="h3 pb-3 border-b border-line">Hoy cumplen años 🎂</h2>
          <ul className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {hoy.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/panel/socios/${m.id}`}
                  className="py-2.5 flex items-center gap-3 border-b border-line group"
                >
                  <Avatar name={m.full_name} url={m.photo_url} size={36} />
                  <span className="flex-1 min-w-0 truncate text-base font-medium group-hover:text-plate-blue transition-colors">
                    {m.full_name}
                  </span>
                  <span className="text-tiny text-txt-soft shrink-0">
                    Cumple {ageOnNextBirthday(m.birth_date, m.next_birthday)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="h3 pb-3 border-b border-line">Próximos cumpleaños</h2>

        {proximos.length === 0 ? (
          <p className="py-4 text-tiny text-txt-faint">No hay más cumpleaños cargados.</p>
        ) : (
          <ul className="datalist">
            {proximos.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/panel/socios/${m.id}`}
                  className="py-2.5 flex items-center gap-3 group"
                >
                  <Avatar name={m.full_name} url={m.photo_url} size={32} />
                  <span className="flex-1 min-w-0 truncate text-base group-hover:text-plate-blue transition-colors">
                    {m.full_name}
                  </span>
                  <span className="num text-tiny font-medium text-txt shrink-0">
                    {formatDayMonth(m.next_birthday)}
                  </span>
                  <span className="text-tiny text-txt-faint shrink-0 w-16 text-right">
                    {m.days_to_birthday === 1 ? "en 1 día" : `en ${m.days_to_birthday} días`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!!sinFecha && sinFecha > 0 && (
        <p className="text-tiny text-txt-faint">
          {sinFecha === 1
            ? "1 socio no tiene fecha de nacimiento."
            : `${sinFecha} socios no tienen fecha de nacimiento.`}{" "}
          Cargala en su ficha para que aparezcan acá.
        </p>
      )}
    </div>
  );
}
