import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { MemberOverview } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { formatDayMonth, ageOnNextBirthday } from "@/lib/labels";

/**
 * Listado de cumpleaños ordenado por el más cercano. La idea es que
 * recepción lo chequee al abrir y sepa a quién saludar hoy; el saludo
 * automático en el kiosco (ver perform_check_in_by_dni) hace el resto
 * cuando esa persona escanea su entrada.
 */
export default async function CumpleañosPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("member_overview")
    .select(
      "id, full_name, photo_url, birth_date, next_birthday, days_to_birthday, is_birthday_today"
    )
    .not("birth_date", "is", null)
    .is("archived_at", null)
    .order("days_to_birthday", { ascending: true });

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

  const { count: sinFecha } = await supabase
    .from("members")
    .select("id", { count: "exact", head: true })
    .is("birth_date", null)
    .is("archived_at", null);

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-5">
      <h1 className="h1">Cumpleaños</h1>

      {hoy.length > 0 && (
        <section className="card p-5 border-2 border-plate-amber/40 bg-plate-amber/5">
          <h2 className="h3 mb-3">🎂 Hoy cumplen años</h2>
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {hoy.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/panel/socios/${m.id}`}
                  className="py-2 flex items-center gap-3 group"
                >
                  <Avatar name={m.full_name} url={m.photo_url} size={40} />
                  <span className="flex-1 min-w-0 truncate text-base font-medium group-hover:text-plate-blue transition-colors">
                    {m.full_name}
                  </span>
                  <span className="text-tiny text-plate-amberInk font-medium shrink-0">
                    Cumple {ageOnNextBirthday(m.birth_date, m.next_birthday)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-5">
        <h2 className="h3 mb-1">Próximos cumpleaños</h2>
        <p className="mb-3 text-tiny text-txt-faint">
          De más cercano a más lejano. El saludo sale solo, el día que escanean.
        </p>

        {proximos.length === 0 ? (
          <p className="text-base text-txt-soft">No hay más cumpleaños cargados.</p>
        ) : (
          <ul className="datalist">
            {proximos.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/panel/socios/${m.id}`}
                  className="py-2.5 flex items-center gap-3 group"
                >
                  <Avatar name={m.full_name} url={m.photo_url} size={36} />
                  <span className="flex-1 min-w-0 truncate text-base font-medium group-hover:text-plate-blue transition-colors">
                    {m.full_name}
                  </span>
                  <span className="font-mono text-tiny text-txt-soft shrink-0">
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
        <p className="text-tiny text-txt-faint text-center">
          {sinFecha === 1
            ? "1 socio no tiene fecha de nacimiento."
            : `${sinFecha} socios no tienen fecha de nacimiento.`}{" "}
          Cargala en su ficha para que aparezcan acá.
        </p>
      )}
    </div>
  );
}
