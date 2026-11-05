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
import { PageHeader } from "@/components/PageHeader";

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
    <div className="space-y-6">
      <PageHeader
        title="Ajustes"
        description="Colores y tamaño de letra del panel. Se ven al toque y quedan guardados en este navegador."
      />

      <section className="card p-5 space-y-4">
        <h2 className="h3">Colores</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    className="size-9 shrink-0 rounded-control border border-line bg-surface p-0.5 cursor-pointer"
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
                  className="min-h-8 text-tiny font-medium text-txt-soft hover:text-txt underline-offset-4 hover:underline transition-colors disabled:opacity-0"
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
          <div className="border-b border-line px-4 py-3 flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-caref.svg" alt="" className="size-6 object-contain" />
            <span className="text-base font-semibold">CAREF</span>
            <span className="ml-auto inline-flex items-center gap-1.5 text-tiny font-medium text-txt-soft">
              <span className="size-1.5 rounded-full bg-plate-green" aria-hidden="true" />
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
