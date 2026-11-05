import { whatsappLink } from "@/lib/whatsapp";
import { IconWhatsApp } from "@/components/icons";

/**
 * Botón discreto para escribirle a un socio por WhatsApp con el mensaje ya
 * armado. Si el teléfono no se puede pasar al formato de wa.me (o no hay),
 * no se muestra nada.
 *
 * Es un link común: va como hermano del link a la ficha, nunca adentro
 * (un <a> dentro de otro no es HTML válido).
 */
export function WhatsAppLink({
  phone,
  message,
  name,
  label,
  className = "",
}: {
  phone: string | null | undefined;
  message: string;
  /** Para el aria-label: "Escribirle por WhatsApp a ...". */
  name: string;
  /** Con texto al lado del ícono (ficha). Sin esto, solo el ícono. */
  label?: string;
  className?: string;
}) {
  const href = whatsappLink(phone, message);
  if (!href) return null;
  const title = `Escribirle por WhatsApp a ${name}`;

  if (label) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
        className={`btn-ghost btn-sm gap-1.5 ${className}`}
      >
        <IconWhatsApp className="size-4" />
        {label}
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
      className={`flex size-9 shrink-0 items-center justify-center rounded-control text-txt-faint hover:text-plate-green hover:bg-surface-hover transition-colors ${className}`}
    >
      <IconWhatsApp className="size-[18px]" />
    </a>
  );
}
