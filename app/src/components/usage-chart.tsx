import { useEffect, useRef, useState } from "react";

export interface LineChartProps {
  values: number[];
  xLabels: (string | null)[];
  tooltips: string[];
  caption?: string;
}

// Layout
const PL = 46;   // left  — Y labels
const PR = 8;    // right
const PT = 8;    // top
const PB = 22;   // bottom — X labels
const CW = 500;  // plot width
const CH = 110;  // plot height
const VW = PL + CW + PR;
const VH = PT + CH + PB;

const SVG_NS = "http://www.w3.org/2000/svg";

function mk(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  if (f <= 1) return exp;
  if (f <= 2) return 2 * exp;
  if (f <= 5) return 5 * exp;
  return 10 * exp;
}

function fmtTick(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1)}K`;
  return String(v);
}

function catmullRom(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function draw(
  svg: SVGSVGElement,
  values: number[],
  xLabels: (string | null)[],
  tooltips: string[],
  hover: number | null,
  fgColor: string,
  mutedColor: string,
) {
  // clear
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const n = values.length;
  if (n === 0) return;

  const rawMax = Math.max(...values, 0);
  const ticks = (() => {
    const nice = niceMax(rawMax);
    const step = nice / 4;
    return Array.from({ length: 5 }, (_, i) => i * step);
  })();
  const maxTick = ticks[ticks.length - 1];

  const toX = (i: number) => PL + (n > 1 ? (i / (n - 1)) * CW : CW / 2);
  const toY = (v: number) => PT + (1 - v / maxTick) * CH;
  const pts: [number, number][] = values.map((v, i) => [toX(i), toY(v)]);

  // Y gridlines + labels
  for (const tick of ticks) {
    const y = toY(tick);
    const line = mk("line", {
      x1: PL, y1: y, x2: PL + CW, y2: y,
      stroke: fgColor,
      "stroke-opacity": tick === 0 ? "0.15" : "0.07",
      "stroke-width": "1",
      "stroke-dasharray": tick === 0 ? "" : "3 3",
    });
    svg.appendChild(line);

    const label = mk("text", {
      x: PL - 5, y,
      "text-anchor": "end",
      "dominant-baseline": "middle",
      "font-size": "9",
      fill: mutedColor,
    });
    label.textContent = fmtTick(tick);
    svg.appendChild(label);
  }

  // Area fill + line (or single dot if only one point)
  if (pts.length === 1) {
    const [px, py] = pts[0];
    svg.appendChild(mk("circle", { cx: px, cy: py, r: "5", fill: fgColor, "fill-opacity": "0.15" }));
    svg.appendChild(mk("circle", { cx: px, cy: py, r: "3", fill: fgColor }));
  } else if (pts.length >= 2) {
    const linePath = catmullRom(pts);
    const areaD = `${linePath} L ${pts[pts.length - 1][0]},${toY(0)} L ${pts[0][0]},${toY(0)} Z`;
    svg.appendChild(mk("path", { d: areaD, fill: fgColor, "fill-opacity": "0.07" }));
    svg.appendChild(mk("path", {
      d: linePath,
      fill: "none",
      stroke: fgColor,
      "stroke-width": "1.8",
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    }));
  }

  // X labels
  for (let i = 0; i < n; i++) {
    const lbl = xLabels[i];
    if (!lbl) continue;
    const t = mk("text", {
      x: toX(i), y: PT + CH + 14,
      "text-anchor": "middle",
      "font-size": "9",
      fill: mutedColor,
    });
    t.textContent = lbl;
    svg.appendChild(t);
  }

  // Hover: crosshair + dot + tooltip
  if (hover !== null) {
    const hx = toX(hover);
    const hy = toY(values[hover]);

    // crosshair
    svg.appendChild(mk("line", {
      x1: hx, y1: PT, x2: hx, y2: PT + CH,
      stroke: fgColor, "stroke-opacity": "0.2",
      "stroke-width": "1", "stroke-dasharray": "3 3",
    }));

    // dot halo
    svg.appendChild(mk("circle", {
      cx: hx, cy: hy, r: "7",
      fill: fgColor, "fill-opacity": "0.12",
    }));
    svg.appendChild(mk("circle", {
      cx: hx, cy: hy, r: "3.5",
      fill: fgColor,
    }));

    // tooltip bubble (background rect + text)
    const tip = tooltips[hover];
    const bw = Math.max(tip.length * 5.6 + 16, 60);
    const bh = 20;
    const bx = Math.min(Math.max(hx - bw / 2, PL), PL + CW - bw);
    const by = Math.max(hy - bh - 10, PT);

    svg.appendChild(mk("rect", {
      x: bx, y: by, width: bw, height: bh, rx: "4",
      fill: fgColor, "fill-opacity": "0.88",
    }));

    const tipText = mk("text", {
      x: bx + bw / 2, y: by + bh / 2,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      "font-size": "9.5",
      fill: "white",
    });
    tipText.textContent = tip;
    svg.appendChild(tipText);
  }
}

export function LineChart({ values, xLabels, tooltips, caption }: LineChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  // Read CSS colors once from the container element
  function getFgColor(): string {
    return getComputedStyle(containerRef.current ?? document.body).color || "#fff";
  }
  function getMutedColor(): string {
    const tmp = document.createElement("span");
    tmp.className = "text-muted-foreground";
    tmp.style.position = "fixed";
    tmp.style.opacity = "0";
    tmp.style.pointerEvents = "none";
    document.body.appendChild(tmp);
    const c = getComputedStyle(tmp).color || "#888";
    document.body.removeChild(tmp);
    return c;
  }

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    draw(svg, values, xLabels, tooltips, hover, getFgColor(), getMutedColor());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, xLabels, tooltips, hover]);

  const colWidth = values.length > 1 ? CW / values.length : CW;

  return (
    <div ref={containerRef} className="space-y-1">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        className="w-full"
        style={{ height: "148px" }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const svgX = ((e.clientX - rect.left) / rect.width) * VW;
          const plotX = svgX - PL;
          const idx = Math.round((plotX / CW) * (values.length - 1));
          const clamped = Math.max(0, Math.min(values.length - 1, idx));
          // only hover if within the hit zone of a column
          const cx = PL + (values.length > 1 ? (clamped / (values.length - 1)) * CW : CW / 2);
          if (Math.abs(svgX - cx) < colWidth / 2 + 2) {
            setHover(clamped);
          } else {
            setHover(null);
          }
        }}
      />
      {caption && <p className="text-xs text-muted-foreground text-center">{caption}</p>}
    </div>
  );
}
