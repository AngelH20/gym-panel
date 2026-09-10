"use client";

import { useEffect, useState } from "react";
import { Field } from "@/components/Form";
import {
  COLOR_TOKENS,
  DEFAULT_FONT_SCALE,
  applyCustomTheme,
  clearCustomTheme,
  clamp255,
  hexToRgbString,
  loadCustomTheme,
  rgbStringToHex,
  saveCustomTheme,
  type CustomTheme,
} from "@/lib/customTheme";

export default function SettingsPage() {
  const [theme, setTheme] = useState<CustomTheme>({ colors: {}, fontScale: DEFAULT_FONT_SCALE });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTheme(loadCustomTheme());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    applyCustomTheme(theme);
    saveCustomTheme(theme);
  }, [ready, theme]);

  function setColor(cssVar: string, rgb: string) {
    setTheme((prev) => ({ ...prev, colors: { ...prev.colors, [cssVar]: rgb } }));
  }

  function resetColor(cssVar: string) {
    setTheme((prev) => {
      const colors = { ...prev.colors };
      delete colors[cssVar];
      return { ...prev, colors };
    });
  }

  function resetAll() {
    clearCustomTheme();
    setTheme({ colors: {}, fontScale: DEFAULT_FONT_SCALE });
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="h1">Personalización</h1>
        <p className="mt-1.5 text-base text-txt-soft max-w-prose">
          Ajustá los colores y el tamaño de letra de todo el panel. Los cambios se ven al
          instante y quedan guardados en este navegador.
        </p>
      </div>

      <section className="card p-5 space-y-4">
        <h2 className="h3">Colores</h2>

        <div className="grid sm:grid-cols-2 gap-3">
          {COLOR_TOKENS.map((token) => {
            const value = theme.colors[token.cssVar] ?? token.default;
            const [r, g, b] = value.split(/\s+/).map(Number);
            const customized = Boolean(theme.colors[token.cssVar]);

            return (
              <div key={token.cssVar} className="rounded-control border border-line p-3.5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-tiny font-medium">{token.label}</p>
                    <p className="text-tiny text-txt-faint">{token.hint}</p>
                  </div>
                  <input
                    type="color"
                    value={rgbStringToHex(value)}
                    onChange={(e) => setColor(token.cssVar, hexToRgbString(e.target.value))}
                    className="size-9 shrink-0 rounded-control border border-line cursor-pointer"
                    aria-label={`Elegir color para ${token.label}`}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(["R", "G", "B"] as const).map((channel, i) => (
                    <label key={channel} className="block">
                      <span className="block mb-1 text-micro text-txt-faint">{channel}</span>
                      <input
                        type="number"
                        min={0}
                        max={255}
                        value={[r, g, b][i]}
                        onChange={(e) => {
                          const parts = [r, g, b];
                          parts[i] = clamp255(Number(e.target.value));
                          setColor(token.cssVar, parts.join(" "));
                        }}
                        className="field font-mono text-tiny px-2 py-1.5"
                      />
                    </label>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => resetColor(token.cssVar)}
                  disabled={!customized}
                  className="text-tiny text-txt-faint hover:text-txt transition-colors disabled:opacity-0"
                >
                  Restablecer
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="h3">Tamaño de letra</h2>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={85}
            max={130}
            step={5}
            value={theme.fontScale}
            onChange={(e) => setTheme((prev) => ({ ...prev, fontScale: Number(e.target.value) }))}
            className="w-full accent-plate-blue"
          />
          <span className="font-mono text-tiny text-txt-soft w-12 text-right shrink-0">
            {theme.fontScale}%
          </span>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="h3">Previsualización</h2>
        <div className="card overflow-hidden">
          <div className="bg-ink text-txt-onDark px-4 py-3 flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-caref.svg" alt="" className="size-6 object-contain" />
            <span className="font-display text-base font-semibold">CAREF</span>
            <span className="ml-auto badge border-plate-blue/35 bg-plate-blue/15 text-plate-blue">
              Al día
            </span>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <p className="text-base font-medium">Martina Gómez</p>
              <p className="text-tiny text-txt-faint">Pase Libre · vence en 12 días</p>
            </div>

            <Field label="Nombre y apellido">
              <input className="field" defaultValue="Martina Gómez" readOnly />
            </Field>

            <button type="button" className="btn-primary w-full">
              Guardar cambios
            </button>
          </div>
        </div>
      </section>

      <button type="button" onClick={resetAll} className="btn-ghost">
        Restablecer todo
      </button>
    </div>
  );
}
