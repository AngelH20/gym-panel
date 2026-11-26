import type { Metadata } from "next";
import { LegalDocument } from "@/components/LegalDocument";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Qué datos personales guarda CAREF de sus socios, para qué los usa y cómo pedir verlos, corregirlos o borrarlos.",
};

export default function PrivacyPage() {
  return (
    <LegalDocument title="Política de privacidad">
      <p>
        Esta política explica qué datos personales guarda <strong>{LEGAL.owner}</strong> sobre
        sus socios y sobre el personal que usa el sistema de gestión del gimnasio, para qué los
        usa y qué derechos tenés sobre ellos. Se rige por la Ley 25.326 de Protección de los
        Datos Personales de la República Argentina.
      </p>

      <h2>Responsable de los datos</h2>
      <p>
        {LEGAL.owner}, con domicilio en {LEGAL.address}. Contacto:{" "}
        <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
      </p>

      <h2>Qué datos guardamos</h2>
      <p>
        <strong>De los socios</strong>, los que se cargan al darte de alta en el mostrador:
      </p>
      <ul>
        <li>Nombre y apellido, DNI y fecha de nacimiento.</li>
        <li>Teléfono y email, si los diste.</li>
        <li>Foto, si aceptaste que te la saquen.</li>
        <li>El plan que contrataste, sus fechas de vigencia y las entradas que te quedan.</li>
        <li>El registro de cada ingreso al gimnasio (día y hora).</li>
        <li>Los pagos registrados: monto, fecha y medio de pago. No guardamos datos de tarjetas.</li>
        <li>Notas internas que el personal agregue a tu ficha.</li>
      </ul>
      <p>
        <strong>Del personal</strong> que usa el panel: nombre, email y el rol que tiene en el
        sistema.
      </p>
      <p>
        <strong>Datos técnicos:</strong> cuando alguien registra una entrada desde el QR o intenta
        entrar al panel, guardamos por poco tiempo la dirección IP desde la que lo hizo. Sirve
        solo para frenar intentos repetidos o abusivos y se borra automáticamente.
      </p>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Identificarte al entrar al gimnasio y descontar la entrada de tu pase.</li>
        <li>Llevar el control de pases, vencimientos y pagos.</li>
        <li>Contactarte por temas de tu pase (por ejemplo, un vencimiento), por WhatsApp, teléfono o email.</li>
        <li>Ver estadísticas internas de asistencia y caja del gimnasio.</li>
        <li>Proteger el sistema contra accesos no autorizados.</li>
      </ul>
      <p>
        No vendemos ni cedemos tus datos a terceros, y no los usamos para publicidad.
      </p>

      <h2>Dónde se guardan</h2>
      <p>
        El sistema funciona sobre servicios de terceros que actúan como proveedores de
        infraestructura: <strong>Supabase</strong> (base de datos y archivos, con servidores en
        San Pablo, Brasil) y <strong>Vercel</strong> (alojamiento del sitio). Solo tratan los
        datos para hacer funcionar el sistema. El acceso dentro del gimnasio está limitado al
        personal autorizado, con usuario y contraseña, y cada rol ve solo lo que necesita.
      </p>

      <h2>Cookies y almacenamiento local</h2>
      <p>
        Usamos solo lo indispensable para que el sistema funcione: una cookie de sesión para
        que el personal se mantenga logueado en el panel, y el almacenamiento local del
        navegador para recordar el tema claro u oscuro. No usamos cookies de publicidad ni de
        analítica, ni herramientas de seguimiento de terceros.
      </p>

      <h2>Cuánto tiempo los conservamos</h2>
      <p>
        Mientras seas socio. Si dejás de serlo, conservamos tus datos durante{" "}
        {LEGAL.retention} y después los borramos, salvo que una obligación legal (por ejemplo,
        contable) nos exija guardar algún registro por más tiempo.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Podés pedir en cualquier momento ver qué datos tenemos tuyos, corregirlos,
        actualizarlos o que los borremos. Escribinos a{" "}
        <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> o pedilo en el mostrador. Te
        respondemos dentro de los plazos de la Ley 25.326: 10 días corridos para el acceso y 5
        días hábiles para la corrección o el borrado.
      </p>
      <p>
        La Agencia de Acceso a la Información Pública, en su carácter de órgano de control de
        la Ley 25.326, tiene la atribución de atender las denuncias y reclamos que se
        interpongan con relación al incumplimiento de las normas sobre protección de datos
        personales.
      </p>

      <h2>Cambios en esta política</h2>
      <p>
        Si cambiamos esta política, publicamos la versión nueva en esta misma página con su
        fecha de actualización.
      </p>
    </LegalDocument>
  );
}
