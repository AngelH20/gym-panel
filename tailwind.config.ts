import type { Config } from "tailwindcss";

/**
 * Sistema de diseño: "tablero de sala".
 *
 * La paleta sale del escudo de CAREF: azul marino de cromo, y los colores de
 * los discos de competencia como semántica (rojo 25 kg = vencido/error,
 * azul 20 kg = acción primaria, amarillo 15 kg = por vencer, verde 10 kg =
 * al día). Nada de color decorativo: si algo es rojo, es porque no entra.
 *
 * Tipografía: una sola familia (Archivo, variable con eje de ancho). El
 * cuerpo va a ancho normal; títulos y números grandes van condensados y
 * pesados, como el marcador de un reloj de sala. Ver globals.css.
 *
 * Todos los colores salen de variables CSS para tener modo claro y oscuro
 * sin tocar ninguna clase: "bg-surface" resuelve a un color distinto según
 * el tema, el nombre de la clase no cambia nunca.
 */
function withOpacity(variable: string) {
  return `rgb(var(${variable}) / <alpha-value>)`;
}

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Cromo: barra lateral, botones oscuros, tooltips. Azul marino del
        // escudo en los dos temas: es la marca, no "el fondo".
        ink: {
          DEFAULT: withOpacity("--color-ink"),
          raised: withOpacity("--color-ink-raised"),
          line: withOpacity("--color-ink-line"),
        },
        txt: {
          DEFAULT: withOpacity("--color-txt"),
          soft: withOpacity("--color-txt-soft"),
          faint: withOpacity("--color-txt-faint"),
          onDark: withOpacity("--color-txt-onDark"),
          onDarkSoft: withOpacity("--color-txt-onDarkSoft"),
          // Texto sobre un relleno de color (botón azul, verde): blanco en
          // claro, casi negro en oscuro, donde los rellenos se aclaran.
          onAccent: withOpacity("--color-txt-onAccent"),
        },
        // Superficies: estas sí invierten entre claro y oscuro.
        surface: {
          DEFAULT: withOpacity("--color-surface"),
          sunk: withOpacity("--color-surface-sunk"),
          hover: withOpacity("--color-surface-hover"),
        },
        line: {
          DEFAULT: withOpacity("--color-line"),
          strong: withOpacity("--color-line-strong"),
        },
        // Discos de competencia: color = significado.
        plate: {
          red: withOpacity("--color-plate-red"),
          blue: withOpacity("--color-plate-blue"),
          amber: withOpacity("--color-plate-amber"),
          amberInk: withOpacity("--color-plate-amber-ink"),
          green: withOpacity("--color-plate-green"),
        },
        // Par categórico validado para efectivo/transferencia en una misma
        // barra apilada. Ver comentario en globals.css.
        chart: {
          cash: withOpacity("--color-chart-cash"),
          transfer: withOpacity("--color-chart-transfer"),
        },
      },
      fontFamily: {
        // Misma familia en los tres roles; cambia el ancho.
        display: [
          ["var(--font-archivo)", "system-ui", "sans-serif"],
          { fontVariationSettings: '"wdth" 70' },
        ],
        sans: ["var(--font-archivo)", "system-ui", "sans-serif"],
        // "mono" ya no es monoespaciada: son cifras tabulares, un poco
        // angostas, para que las columnas de números no bailen. Se mantiene
        // el nombre para no tocar cada componente que lo usa.
        mono: [
          ["var(--font-archivo)", "system-ui", "sans-serif"],
          { fontFeatureSettings: '"tnum"', fontVariationSettings: '"wdth" 88' },
        ],
      },
      fontSize: {
        micro: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.01em" }],
        tiny: ["0.8125rem", { lineHeight: "1.25rem" }],
        base: ["0.9375rem", { lineHeight: "1.5rem" }],
        lg: ["1.0625rem", { lineHeight: "1.5rem" }],
        title: ["1.5rem", { lineHeight: "1.75rem", letterSpacing: "-0.01em" }],
        display: ["2.25rem", { lineHeight: "2.25rem", letterSpacing: "-0.015em" }],
        huge: ["3rem", { lineHeight: "2.75rem", letterSpacing: "-0.02em" }],
      },
      borderRadius: {
        control: "7px",
        card: "12px",
      },
      boxShadow: {
        // La tarjeta apoya: una línea de contacto abajo, como el canto de
        // una placa de goma sobre el piso. Sin sombras difusas por default.
        card: "0 1px 0 0 rgb(var(--color-line-strong) / 0.55)",
        lift: "0 10px 24px -8px rgb(var(--color-ink) / 0.28), 0 2px 6px -2px rgb(var(--color-ink) / 0.16)",
        chrome: "0 1px 0 rgb(0 0 0 / 0.25)",
        glow: "0 0 0 1px rgb(var(--color-plate-blue) / 0.4), 0 4px 14px -2px rgb(var(--color-plate-blue) / 0.35)",
      },
      // Pasos chicos de opacidad para los tintes de los discos (bg-plate-red/12,
      // bg-plate-blue/6…). Sin esto Tailwind no genera esas clases y el
      // fondo quedaba transparente sin avisar.
      opacity: { 4: "0.04", 6: "0.06", 8: "0.08", 12: "0.12" },
      transitionDuration: { DEFAULT: "150ms" },
    },
  },
  plugins: [],
};

export default config;
