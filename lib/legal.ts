/**
 * Datos del responsable que aparecen en /privacidad y /terminos. Están
 * juntos acá para que actualizar el domicilio o el contacto sea un solo
 * cambio, sin tocar los textos.
 */
export const LEGAL = {
  /** Nombre con el que se presenta el responsable. Si se agrega la razón
   *  social o el CUIT, sumarlos acá. */
  owner: "CAREF",
  address: "Las Palomas 219, Neuquén Capital, Neuquén, Argentina",
  email: "centrocarefpp@gmail.com",
  /** Fecha de la última revisión de los textos (se muestra al pie). */
  updatedOn: "25 de noviembre de 2026",
  /** Cuánto se conservan los datos de alguien que deja de ser socio. */
  retention: "2 años desde la última actividad",
} as const;
