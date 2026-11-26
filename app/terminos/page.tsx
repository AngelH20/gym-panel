import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/LegalDocument";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Términos de uso",
  description: "Reglas de uso del registro de entradas por QR y del panel de gestión de CAREF.",
};

export default function TermsPage() {
  return (
    <LegalDocument title="Términos de uso">
      <p>
        Estos términos regulan el uso del sistema de <strong>{LEGAL.owner}</strong>: el registro
        de entradas por QR que usan los socios y el panel de gestión que usa el personal del
        gimnasio. Al usarlo, aceptás estas reglas.
      </p>

      <h2>Registro de entradas (socios)</h2>
      <ul>
        <li>
          Para registrar tu entrada escaneás el QR del mostrador e ingresás <strong>tu</strong>{" "}
          DNI. Cada entrada se descuenta de tu pase.
        </li>
        <li>
          El pase es personal. No está permitido registrar entradas con el DNI de otra persona.
        </li>
        <li>
          El QR del mostrador cambia cada pocos segundos y un código viejo deja de servir. No
          compartas fotos ni capturas del código.
        </li>
        <li>
          Si una entrada se registró por error o ves algo que no coincide con tu pase, avisá en
          el mostrador para que lo revisen.
        </li>
      </ul>

      <h2>Panel de gestión (personal)</h2>
      <ul>
        <li>
          El acceso es solo para el personal autorizado por {LEGAL.owner}. Tu usuario y
          contraseña son personales: no los compartas.
        </li>
        <li>
          Los datos de los socios se usan únicamente para la gestión del gimnasio, según la{" "}
          <Link href="/privacidad">política de privacidad</Link>. No está permitido copiarlos,
          exportarlos o difundirlos para otros fines.
        </li>
        <li>
          Las acciones que hacés en el panel (ventas, anulaciones, cierres de caja) quedan
          registradas con tu usuario.
        </li>
      </ul>

      <h2>Uso indebido</h2>
      <p>
        No está permitido intentar acceder a partes del sistema sin autorización, automatizar
        pedidos, sobrecargarlo ni alterar su funcionamiento. El sistema limita los intentos
        repetidos y {LEGAL.owner} puede bloquear el acceso a quien lo use de forma indebida.
      </p>

      <h2>Disponibilidad</h2>
      <p>
        Hacemos lo posible para que el sistema funcione siempre, pero puede haber cortes por
        mantenimiento o fallas de los proveedores. Si no podés registrar tu entrada, el
        personal del mostrador la registra a mano.
      </p>

      <h2>Cambios</h2>
      <p>
        Podemos actualizar estos términos. La versión vigente es la que está publicada en esta
        página, con su fecha de actualización.
      </p>

      <h2>Contacto</h2>
      <p>
        {LEGAL.address}. Email: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
      </p>
    </LegalDocument>
  );
}
