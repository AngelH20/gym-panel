import type { Config } from "tailwindcss";

/**
 * Sistema de diseño.
 *
 * La paleta sale del escudo de CAREF: azul marino, rojo de los discos de
 * 25 kg, plateado del anillo. Cada color de "plate" también tiene un
 * significado funcional propio (rojo = vencido/error, azul = acción
 * primaria, ámbar = entradas disponibles, verde = al día) en lugar de ser
 * solo decoración.
 *
 * Todos los tokens salen de variables CSS (ver globals.css) para poder
 * tener modo claro y oscuro sin tocar ninguna clase en los componentes:
 * "bg-surface" resuelve a un color distinto según el tema, el nombre de la
 * clase no cambia nunca.
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
        // Cromo: barra superior, botones oscuros. Siempre azul marino
        // oscuro, en los dos temas — es la marca, no "el fondo".
        ink: {
          DEFAULT: withOpacity("--color-ink"),
          raised: withOpacity("--color-ink-raised"),
          line: withOpacity("--color-ink-line"),
        },
        // Texto
        txt: {
          DEFAULT: withOpacity("--color-txt"),
          soft: withOpacity("--color-txt-soft"),
          faint: withOpacity("--color-txt-faint"),
          onDark: withOpacity("--color-txt-onDark"),
          onDarkSoft: withOpacity("--color-txt-onDarkSoft"),
        },
        // Superficies: estas sí invierten entre tema claro y oscuro.
        surface: {
          DEFAULT: withOpacity("--color-surface"),
          sunk: withOpacity("--color-surface-sunk"),
          hover: withOpacity("--color-surface-hover"),
        },
        line: {
          DEFAULT: withOpacity("--color-line"),
          strong: withOpacity("--color-line-strong"),
        },
        // Discos de competencia, coloreados como el escudo.
        plate: {
          red: withOpacity("--color-plate-red"), // 25 kg -> vencido, error
          blue: withOpacity("--color-plate-blue"), // 20 kg -> acción primaria
          amber: withOpacity("--color-plate-amber"), // 15 kg -> entradas disponibles
          amberInk: withOpacity("--color-plate-amber-ink"), // texto legible sobre fondos ámbar
          green: withOpacity("--color-plate-green"), // 10 kg -> al día, confirmado
        },
        // Par categórico validado para gráficos con efectivo/transferencia
        // conviviendo en una misma barra. Ver comentario en globals.css.
        chart: {
          cash: withOpacity("--color-chart-cash"),
          transfer: withOpacity("--color-chart-transfer"),
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Escala explícita, con altura de línea atada a cada tamaño.
        micro: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.08em" }],
        tiny: ["0.75rem", { lineHeight: "1.125rem" }],
        base: ["0.9375rem", { lineHeight: "1.5rem" }],
        lg: ["1.0625rem", { lineHeight: "1.5rem" }],
        title: ["1.375rem", { lineHeight: "1.75rem", letterSpacing: "-0.02em" }],
        display: ["1.75rem", { lineHeight: "2rem", letterSpacing: "-0.03em" }],
        huge: ["2.5rem", { lineHeight: "2.5rem", letterSpacing: "-0.03em" }],
      },
      borderRadius: {
        control: "8px",
        card: "12px",
      },
      boxShadow: {
        // Sombras en capas: una línea de contacto y una difusa.
        card: "0 1px 2px rgba(0,0,0,0.06), 0 1px 1px rgba(0,0,0,0.05)",
        lift: "0 8px 20px -4px rgba(0,0,0,0.14), 0 3px 8px -2px rgba(0,0,0,0.08)",
        chrome: "0 1px 0 rgba(0,0,0,0.1)",
        glow: "0 0 0 1px rgb(var(--color-plate-blue) / 0.4), 0 4px 14px -2px rgb(var(--color-plate-blue) / 0.35)",
      },
      transitionDuration: { DEFAULT: "150ms" },
    },
  },
  plugins: [],
};

export default config;
