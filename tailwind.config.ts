import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

/**
 * Sistema de diseño: neutro y minimalista.
 *
 * Blancos y grises fríos, texto casi negro y UN solo acento (azul sobrio)
 * para acciones y el ítem activo. Los colores de estado (al día, por vencer,
 * vencido) aparecen solo como puntos o rótulos chicos, nunca como bloques.
 *
 * Todos los colores salen de variables CSS (ver globals.css) para tener modo
 * claro y oscuro sin tocar ninguna clase. Los nombres de los tokens se
 * conservan del sistema anterior ("plate-*", "ink") para no romper ningún
 * componente: cambió el valor, no el nombre.
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
        // "ink": relleno de máximo contraste (botón oscuro, filtro activo,
        // tooltip). Casi negro en claro; se invierte en oscuro.
        ink: {
          DEFAULT: withOpacity("--color-ink"),
          raised: withOpacity("--color-ink-raised"),
          line: withOpacity("--color-ink-line"),
        },
        txt: {
          DEFAULT: withOpacity("--color-txt"),
          soft: withOpacity("--color-txt-soft"),
          faint: withOpacity("--color-txt-faint"),
          // Texto sobre "ink".
          onDark: withOpacity("--color-txt-onDark"),
          onDarkSoft: withOpacity("--color-txt-onDarkSoft"),
          // Texto sobre el acento (botón principal).
          onAccent: withOpacity("--color-txt-onAccent"),
        },
        surface: {
          DEFAULT: withOpacity("--color-surface"),
          sunk: withOpacity("--color-surface-sunk"),
          hover: withOpacity("--color-surface-hover"),
        },
        line: {
          DEFAULT: withOpacity("--color-line"),
          strong: withOpacity("--color-line-strong"),
        },
        // Acento único (plate-blue) y los tres colores de estado.
        plate: {
          red: withOpacity("--color-plate-red"),
          blue: withOpacity("--color-plate-blue"),
          amber: withOpacity("--color-plate-amber"),
          amberInk: withOpacity("--color-plate-amber-ink"),
          green: withOpacity("--color-plate-green"),
        },
        accent: withOpacity("--color-plate-blue"),
        // Par categórico validado para efectivo/transferencia en una misma
        // barra apilada. Ver comentario en globals.css.
        chart: {
          cash: withOpacity("--color-chart-cash"),
          transfer: withOpacity("--color-chart-transfer"),
        },
      },
      fontFamily: {
        // Una sola familia, Geist. "display" y "mono" quedan como alias para
        // no tocar cada componente que los usa: "mono" ya no es
        // monoespaciada, son cifras tabulares (ver globals.css).
        sans: ["var(--font-geist)", "system-ui", "sans-serif"],
        display: ["var(--font-geist)", "system-ui", "sans-serif"],
        mono: [
          ["var(--font-geist)", "system-ui", "sans-serif"],
          { fontFeatureSettings: '"tnum"' },
        ],
      },
      fontSize: {
        micro: ["0.6875rem", { lineHeight: "1rem" }],
        tiny: ["0.8125rem", { lineHeight: "1.25rem" }],
        base: ["0.9375rem", { lineHeight: "1.5rem" }],
        lg: ["1.0625rem", { lineHeight: "1.625rem" }],
        title: ["1.25rem", { lineHeight: "1.75rem", letterSpacing: "-0.01em" }],
        display: ["1.625rem", { lineHeight: "2rem", letterSpacing: "-0.02em" }],
        huge: ["2rem", { lineHeight: "2.25rem", letterSpacing: "-0.025em" }],
      },
      borderRadius: {
        control: "8px",
        card: "12px",
      },
      boxShadow: {
        // Casi sin sombras: las superficies se separan con bordes finos.
        // Solo lo que flota (menú "Más", tooltips) lleva sombra.
        card: "none",
        lift: "0 12px 32px -12px rgb(0 0 0 / 0.18), 0 2px 6px -2px rgb(0 0 0 / 0.08)",
        chrome: "none",
        glow: "0 0 0 3px rgb(var(--color-plate-blue) / 0.18)",
      },
      // Pasos chicos de opacidad (bg-plate-red/12, bg-plate-blue/6…). Sin
      // esto Tailwind no genera esas clases y el fondo queda transparente.
      opacity: { 4: "0.04", 6: "0.06", 8: "0.08", 12: "0.12" },
      transitionDuration: { DEFAULT: "150ms" },
    },
  },
  plugins: [
    // "coarse:" = pantalla táctil (celular, tablet). Para agrandar a 44px los
    // botones de solo ícono sin cambiar cómo se ven con mouse.
    plugin(({ addVariant }) => {
      addVariant("coarse", "@media (pointer: coarse)");
    }),
  ],
};

export default config;
