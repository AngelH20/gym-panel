/**
 * Personalización de tema: el usuario puede pisar, a mano, los mismos
 * tokens CSS que ya usa toda la app (ver globals.css). Como quedan como
 * estilo inline en <html>, ganan siempre — sin importar si el modo es
 * claro u oscuro — y no hace falta tocar ningún componente.
 */

export type ColorToken = {
  cssVar: string;
  label: string;
  hint: string;
  default: string; // "R G B"
};

export const COLOR_TOKENS: ColorToken[] = [
  {
    cssVar: "--color-ink",
    label: "Botones oscuros",
    hint: "El relleno de los botones oscuros y del filtro elegido.",
    default: "22 24 29",
  },
  {
    cssVar: "--color-txt",
    label: "Texto principal",
    hint: "El color de las letras sobre fondos claros.",
    default: "22 24 29",
  },
  {
    cssVar: "--color-surface",
    label: "Fondo y tarjetas",
    hint: "El fondo de la pantalla, las tarjetas y los campos de carga.",
    default: "255 255 255",
  },
  {
    cssVar: "--color-surface-sunk",
    label: "Fondos suaves",
    hint: "Bloques destacados, avisos y el ítem activo del menú.",
    default: "245 246 248",
  },
  {
    cssVar: "--color-line",
    label: "Bordes",
    hint: "Separadores y contornos de los campos.",
    default: "232 234 238",
  },
  {
    cssVar: "--color-plate-blue",
    label: "Color de acento",
    hint: "Botones principales, links y estados activos.",
    default: "36 82 194",
  },
];

export const FONT_SCALE_VAR = "--app-font-scale";
export const DEFAULT_FONT_SCALE = 100;
export const CUSTOM_THEME_STORAGE_KEY = "caref:custom-theme";

export type CustomTheme = {
  colors: Record<string, string>; // cssVar -> "R G B"
  fontScale: number; // porcentaje, ej. 100
};

const EMPTY_THEME: CustomTheme = { colors: {}, fontScale: DEFAULT_FONT_SCALE };

export function loadCustomTheme(): CustomTheme {
  try {
    const raw = localStorage.getItem(CUSTOM_THEME_STORAGE_KEY);
    if (!raw) return EMPTY_THEME;
    const parsed = JSON.parse(raw);
    return {
      colors: parsed.colors ?? {},
      fontScale: parsed.fontScale ?? DEFAULT_FONT_SCALE,
    };
  } catch {
    return EMPTY_THEME;
  }
}

export function saveCustomTheme(theme: CustomTheme) {
  try {
    localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(theme));
  } catch {
    // localStorage puede fallar en privado/incógnito; no es crítico.
  }
}

export function applyCustomTheme(theme: CustomTheme) {
  const root = document.documentElement.style;
  for (const token of COLOR_TOKENS) {
    const value = theme.colors[token.cssVar];
    if (value) root.setProperty(token.cssVar, value);
    else root.removeProperty(token.cssVar);
  }
  root.setProperty(FONT_SCALE_VAR, `${theme.fontScale}%`);
}

export function clearCustomTheme() {
  try {
    localStorage.removeItem(CUSTOM_THEME_STORAGE_KEY);
  } catch {
    // no crítico
  }
  const root = document.documentElement.style;
  for (const token of COLOR_TOKENS) root.removeProperty(token.cssVar);
  root.removeProperty(FONT_SCALE_VAR);
}

/** "R G B" (0-255 cada uno) -> "#rrggbb", para el selector visual. */
export function rgbStringToHex(rgb: string): string {
  const [r, g, b] = rgb.split(/\s+/).map((n) => clamp255(parseInt(n, 10)));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/** "#rrggbb" -> "R G B", para guardar en el token CSS. */
export function hexToRgbString(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

export function clamp255(n: number): number {
  return Number.isFinite(n) ? Math.min(255, Math.max(0, Math.round(n))) : 0;
}
