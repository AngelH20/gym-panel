"use client";

import { useState } from "react";
import { formatDate } from "@/lib/labels";

export type DayCount = { date: string; label: string; count: number };

const W = 400;
const PLOT_H = 130;
const AXIS_H = 24;
const H = PLOT_H + AXIS_H;
const GAP = 8;

/**
 * Barras de una sola serie: entradas por día, últimos 7 días. Un solo hue
 * (azul de marca) porque acá la identidad no es el dato — la magnitud sí.
 * Sin leyenda: el título ya dice qué se mide (ver marks-and-anatomy.md).
 */
export function WeeklyAttendanceChart({ data }: { data: DayCount[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const max = Math.max(1, ...data.map((d) => d.count));
  const barW = Math.min(32, W / data.length - GAP);
  const step = W / data.length;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label={`Entradas por día, últimos ${data.length} días`}
      >
        {/* Línea base */}
        <line x1={0} y1={PLOT_H} x2={W} y2={PLOT_H} stroke="rgb(var(--color-line))" strokeWidth={1} />

        {data.map((d, i) => {
          const h = (d.count / max) * (PLOT_H - 10);
          const x = i * step + (step - barW) / 2;
          const y = PLOT_H - h;
          const isHover = hover === i;
          const isToday = i === data.length - 1;

          return (
            <g
              key={d.date}
              tabIndex={0}
              role="button"
              aria-label={`${formatDate(d.date)}: ${d.count} ${d.count === 1 ? "entrada" : "entradas"}`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="cursor-pointer outline-none"
            >
              {/* Hit target más grande que la barra, para hover/tap cómodos */}
              <rect x={x - 4} y={0} width={barW + 8} height={PLOT_H} fill="transparent" />

              {d.count > 0 ? (
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(3, h)}
                  rx={3}
                  className={isToday ? "fill-plate-blue" : isHover ? "fill-txt-faint" : "fill-line-strong"}
                />
              ) : (
                <rect x={x} y={PLOT_H - 2} width={barW} height={2} rx={1} fill="rgb(var(--color-line-strong))" />
              )}

              <text
                x={x + barW / 2}
                y={PLOT_H + 18}
                textAnchor="middle"
                className={`text-[12px] ${isToday ? "fill-txt font-semibold" : "fill-txt-faint"}`}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>

      {hover != null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full
                     rounded-control bg-ink px-2.5 py-1.5 text-tiny text-txt-onDark shadow-lift z-10"
          style={{
            left: `${((hover * step + step / 2) / W) * 100}%`,
            top: `${(Math.max(0, PLOT_H - (data[hover].count / max) * (PLOT_H - 10)) / H) * 100}%`,
          }}
        >
          <span className="num font-semibold">{data[hover].count}</span>{" "}
          {data[hover].count === 1 ? "entrada" : "entradas"}
          <div className="text-txt-onDarkSoft">{formatDate(data[hover].date)}</div>
        </div>
      )}
    </div>
  );
}
