"use client";

import { useState } from "react";
import { formatDate, formatMoney } from "@/lib/labels";

export type DayRevenue = { date: string; label: string; cash: number; transfer: number };

const W = 400;
const PLOT_H = 130;
const AXIS_H = 24;
const H = PLOT_H + AXIS_H;
const GAP = 8;
const SEGMENT_GAP = 2;

/**
 * Barra apilada de 2 series (efectivo/transferencia): acá la identidad SÍ es
 * el dato, por eso categórico + leyenda. Colores validados con
 * scripts/validate_palette.js contra los tokens de marca (azul/verde) en
 * los dos modos — ver el chequeo en la conversación, no a ojo.
 */
export function WeeklyRevenueChart({ data }: { data: DayRevenue[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const max = Math.max(1, ...data.map((d) => d.cash + d.transfer));
  const barW = Math.min(24, W / data.length - GAP);
  const step = W / data.length;
  const scale = (PLOT_H - 10) / max;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label={`Facturación por día, últimos ${data.length} días, efectivo y transferencia`}
      >
        <line x1={0} y1={PLOT_H} x2={W} y2={PLOT_H} stroke="rgb(var(--color-line))" strokeWidth={1} />

        {data.map((d, i) => {
          const total = d.cash + d.transfer;
          const cashH = d.cash * scale;
          const transferH = Math.max(0, d.transfer * scale - (d.cash > 0 ? SEGMENT_GAP : 0));
          const x = i * step + (step - barW) / 2;
          const isHover = hover === i;
          const isToday = i === data.length - 1;
          const op = isHover ? 1 : isToday ? 0.95 : 0.75;

          return (
            <g
              key={d.date}
              tabIndex={0}
              role="button"
              aria-label={`${formatDate(d.date)}: ${formatMoney(total * 100)} — efectivo ${formatMoney(
                d.cash * 100
              )}, transferencia ${formatMoney(d.transfer * 100)}`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="cursor-pointer outline-none"
            >
              <rect x={x - 4} y={0} width={barW + 8} height={PLOT_H} fill="transparent" />

              {total > 0 ? (
                <>
                  {/* Transferencia arriba */}
                  {d.transfer > 0 && (
                    <rect
                      x={x}
                      y={PLOT_H - cashH - (d.cash > 0 ? SEGMENT_GAP : 0) - transferH}
                      width={barW}
                      height={transferH}
                      rx={4}
                      className="fill-chart-transfer"
                      opacity={op}
                    />
                  )}
                  {/* Efectivo abajo, pegado a la base */}
                  {d.cash > 0 && (
                    <rect
                      x={x}
                      y={PLOT_H - cashH}
                      width={barW}
                      height={cashH}
                      rx={4}
                      className="fill-chart-cash"
                      opacity={op}
                    />
                  )}
                </>
              ) : (
                <rect x={x} y={PLOT_H - 2} width={barW} height={2} rx={1} fill="rgb(var(--color-line-strong))" />
              )}

              <text
                x={x + barW / 2}
                y={PLOT_H + 16}
                textAnchor="middle"
                className={`text-[9px] font-mono ${isToday ? "fill-txt font-semibold" : "fill-txt-faint"}`}
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
                     rounded-control bg-ink px-2.5 py-1.5 text-tiny text-txt-onDark shadow-lift z-10 whitespace-nowrap"
          style={{
            left: `${((hover * step + step / 2) / W) * 100}%`,
            top: `${(Math.max(0, PLOT_H - (data[hover].cash + data[hover].transfer) * scale) / H) * 100}%`,
          }}
        >
          <div className="font-mono font-semibold">
            {formatMoney((data[hover].cash + data[hover].transfer) * 100)}
          </div>
          <div className="flex items-center gap-1.5 text-txt-onDarkSoft">
            <span className="size-1.5 rounded-full bg-chart-cash shrink-0" />
            Efvo. {formatMoney(data[hover].cash * 100)}
          </div>
          <div className="flex items-center gap-1.5 text-txt-onDarkSoft">
            <span className="size-1.5 rounded-full bg-chart-transfer shrink-0" />
            Transf. {formatMoney(data[hover].transfer * 100)}
          </div>
          <div className="mt-0.5 text-txt-onDarkSoft">{formatDate(data[hover].date)}</div>
        </div>
      )}

      <div className="mt-2 flex items-center justify-center gap-4 text-tiny text-txt-soft">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-chart-cash shrink-0" aria-hidden="true" />
          Efectivo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-chart-transfer shrink-0" aria-hidden="true" />
          Transferencia
        </span>
      </div>
    </div>
  );
}
