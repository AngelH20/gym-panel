import { initials } from "@/lib/labels";

/**
 * Las iniciales toman un color estable derivado del nombre. No es decoración:
 * en una lista larga, el color ayuda a reencontrar a la misma persona.
 */
const palettes = [
  "bg-plate-blue/12 text-plate-blue",
  "bg-plate-green/12 text-plate-green",
  "bg-plate-amber/20 text-plate-amberInk",
  "bg-plate-red/12 text-plate-red",
  "bg-ink/8 text-txt-soft",
];

function paletteFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return palettes[hash % palettes.length];
}

export function Avatar({
  name,
  url,
  size = 42,
}: {
  name: string;
  url?: string | null;
  size?: number;
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        // Las listas de socios pueden traer decenas de fotos: que el
        // navegador baje solo las que están a la vista y no frene el render.
        loading="lazy"
        decoding="async"
        className="rounded-full object-cover shrink-0 ring-1 ring-line"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={`rounded-full shrink-0 flex items-center justify-center font-display font-semibold ${paletteFor(name)}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  );
}
