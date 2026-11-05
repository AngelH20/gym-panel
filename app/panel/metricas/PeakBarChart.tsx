"use client";

import { useState } from "react";

export type Bin = { label: string; value: number };

const W = 400;
const PLOT_H = 110;
const AXIS_H = 22;
const H = PLOT_H + AXIS_H;
const GAP = 3;

/**
 * Barras de una sola serie con el pico destacado: es justo lo que se pidió
 * ("quiero saber los picos máximos de personas por día y hora"), así que en
 * vez de dejar que el lector lo busque en el gráfico, la barra más alta se
 * pinta distinto y arriba queda un callout con el valor exacto.
 */
export function PeakBarChart({
  data,
  labelEvery = 1,
  unit = "entradas",
}: {
  data: Bin[];
  labelEvery?: number;
  unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const max = Math.max(1, ...data.map((d) => d.value));
  const peakIndex = data.reduce(
    (best, d, i) => (d.value > data[best].value ? i : best),
    0
  );
  const hasData = data.some((d) => d.value > 0);
  const barW = Math.max(2, W / data.length - GAP);
  const step = W / data.length;

  return (
    <div>
      {hasData ? (
        <p className="mb-4 text-tiny text-txt-soft">
          Pico:{" "}
          <span className="font-medium text-txt">{data[peakIndex].label}</span>
          {" · "}
          <span className="num font-semibold text-txt">
            {data[peakIndex].value}
          </span>{" "}
          {unit}
        </p>
      ) : (
        <p className="mb-3 text-tiny text-txt-faint">Todavía no hay datos en este período.</p>
      )}

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto overflow-visible"
          role="img"
          aria-label={`Distribución con pico en ${data[peakIndex].label}, ${data[peakIndex].value} ${unit}`}
        >
          <line x1={0} y1={PLOT_H} x2={W} y2={PLOT_H} stroke="rgb(var(--color-line))" strokeWidth={1} />

          {data.map((d, i) => {
            const h = (d.value / max) * (PLOT_H - 8);
            const x = i * step + (step - barW) / 2;
            const y = PLOT_H - h;
            const isHover = hover === i;
            const isPeak = hasData && i === peakIndex;
            const showLabel = i % labelEvery === 0;

            return (
              <g
                key={d.label}
                tabIndex={0}
                role="button"
                aria-label={`${d.label}: ${d.value} ${unit}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="cursor-pointer outline-none"
              >
                <rect x={x - 2} y={0} width={barW + 4} height={PLOT_H} fill="transparent" />

                {d.value > 0 ? (
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(2, h)}
                    rx={Math.min(3, barW / 2)}
                    className={isPeak ? "fill-plate-blue" : isHover ? "fill-txt-faint" : "fill-line-strong"}
                  />
                ) : (
                  <rect x={x} y={PLOT_H - 1.5} width={barW} height={1.5} fill="rgb(var(--color-line-strong))" />
                )}

                {showLabel && (
                  <text
                    x={x + barW / 2}
                    y={PLOT_H + 16}
                    textAnchor="middle"
                    className={`text-[11px] ${isPeak ? "fill-txt font-semibold" : "fill-txt-faint"}`}
                  >
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {hover != null && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full
                       rounded-control bg-ink px-2.5 py-1.5 text-tiny text-txt-onDark shadow-lift z-10 whitespace-nowrap"
            style={{
              left: `${((hover * step + step / 2) / W) * 100}%`,
              top: `${(Math.max(0, PLOT_H - (data[hover].value / max) * (PLOT_H - 8)) / H) * 100}%`,
            }}
          >
            <span className="num font-semibold">{data[hover].value}</span> {unit}
            <div className="text-txt-onDarkSoft">{data[hover].label}</div>
          </div>
        )}
      </div>
    </div>
  );
}
