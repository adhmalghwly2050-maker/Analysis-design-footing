/**
 * IsolatedFootingVisualizer
 * Professional engineering drawing output in the style of SAFE / STA4CAD
 * Three coordinated views:
 *   1. Plan View (مسقط أفقي) – top view with reinforcement grid & dimensions
 *   2. Cross-Section A-A   – elevation with soil, footing, column stub & rebar
 *   3. Summary Card        – key results, checks & reinforcement selection
 */

import React from 'react';
import type { IsolatedFootingAnalysisResult } from '@/lib/isolatedFootingEngine';

interface Props {
  result: IsolatedFootingAnalysisResult;
}

/* ── helpers ─────────────────────────────────────────────────── */
function Hatch({ x, y, w, h, spacing = 8, angle = 45, color = '#9ca3af', opacity = 0.55 }: {
  x: number; y: number; w: number; h: number;
  spacing?: number; angle?: number; color?: string; opacity?: number;
}) {
  const id = `hatch-${Math.round(x)}-${Math.round(y)}-${Math.round(w)}`;
  return (
    <g>
      <defs>
        <pattern id={id} patternUnits="userSpaceOnUse" width={spacing} height={spacing}
          patternTransform={`rotate(${angle})`}>
          <line x1="0" y1="0" x2="0" y2={spacing} stroke={color} strokeWidth="0.7" opacity={opacity} />
        </pattern>
      </defs>
      <rect x={x} y={y} width={w} height={h} fill={`url(#${id})`} />
    </g>
  );
}

function DimLine({ x1, y1, x2, y2, label, offset = 12, color = '#1e3a8a' }: {
  x1: number; y1: number; x2: number; y2: number;
  label: string; offset?: number; color?: string;
}) {
  const isHoriz = Math.abs(y2 - y1) < Math.abs(x2 - x1);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="0.8" markerStart="url(#arr)" markerEnd="url(#arr)" />
      {isHoriz ? (
        <>
          <line x1={x1} y1={y1} x2={x1} y2={y1 - offset * 0.6} stroke={color} strokeWidth="0.6" strokeDasharray="2,2" />
          <line x1={x2} y1={y2} x2={x2} y2={y2 - offset * 0.6} stroke={color} strokeWidth="0.6" strokeDasharray="2,2" />
        </>
      ) : (
        <>
          <line x1={x1} y1={y1} x2={x1 - offset * 0.6} y2={y1} stroke={color} strokeWidth="0.6" strokeDasharray="2,2" />
          <line x1={x2} y1={y2} x2={x2 - offset * 0.6} y2={y2} stroke={color} strokeWidth="0.6" strokeDasharray="2,2" />
        </>
      )}
      <rect x={mx - 18} y={my - 6} width={36} height={12} fill="white" opacity="0.85" rx="2" />
      <text x={mx} y={my + 4} textAnchor="middle" fontSize="7.5" fontWeight="bold" fill={color} fontFamily="Arial,sans-serif">
        {label}
      </text>
    </g>
  );
}

/* ── main component ──────────────────────────────────────────── */
export default function IsolatedFootingVisualizer({ result }: Props) {
  const { input, soilPressure, criticalSections } = result;
  const { B, L, Cx, Cy, H } = input;
  const { qmax, qmin, ex, ey, contactAreaRatio } = soilPressure;
  const { punching_b0 } = criticalSections;

  const d = Math.max(50, H - 75 - 12);

  // ── VIEW 1: Plan (top view) ──────────────────────────────────
  const planW = 320;
  const planH = 280;
  const planPad = 45;
  const scale = Math.min((planW - 2 * planPad) / B, (planH - 2 * planPad) / L);
  const footW = B * scale;
  const footH = L * scale;
  const colW = Cx * scale;
  const colH = Cy * scale;
  const pcx = planW / 2;
  const pcy = planH / 2;
  const fx1 = pcx - footW / 2;  const fx2 = pcx + footW / 2;
  const fy1 = pcy - footH / 2;  const fy2 = pcy + footH / 2;
  const ccx1 = pcx - colW / 2;  const ccx2 = pcx + colW / 2;
  const ccy1 = pcy - colH / 2;  const ccy2 = pcy + colH / 2;

  // rebar spacing in plan
  const barSpacingB = Math.max(100, Math.round((B - 150) / Math.max(1, Math.round((B - 150) / 200))));
  const barCountB = Math.round((B - 150) / barSpacingB) + 1;
  const barSpacingL = Math.max(100, Math.round((L - 150) / Math.max(1, Math.round((L - 150) / 200))));
  const barCountL = Math.round((L - 150) / barSpacingL) + 1;

  const barsB = Array.from({ length: barCountB }, (_, i) => {
    const x = fx1 + (75 * scale) + i * barSpacingB * scale;
    return x;
  }).filter(x => x >= fx1 + 2 && x <= fx2 - 2);

  const barsL = Array.from({ length: barCountL }, (_, i) => {
    const y = fy1 + (75 * scale) + i * barSpacingL * scale;
    return y;
  }).filter(y => y >= fy1 + 2 && y <= fy2 - 2);

  // punching perimeter in plan
  const pd_s = d * scale;
  const punchX1 = ccx1 - pd_s / 2;
  const punchX2 = ccx2 + pd_s / 2;
  const punchY1 = ccy1 - pd_s / 2;
  const punchY2 = ccy2 + pd_s / 2;

  // ── VIEW 2: Section A-A ──────────────────────────────────────
  const secW = 320;
  const secH = 280;
  const secPadX = 50;
  const secPadY = 30;
  const secScale = Math.min((secW - 2 * secPadX) / B, (secH - secPadY - 60) / (H + 600));
  const sFootW = B * secScale;
  const sH = H * secScale;
  const sColW = Cx * secScale;
  const sColStub = Math.min(100 * secScale, 40);
  const sCoverPx = 75 * secScale;
  const sDpx = d * secScale;
  const sx0 = secW / 2 - sFootW / 2;  // left edge of footing
  const sx1 = secW / 2 + sFootW / 2;  // right edge
  const syTop = secPadY + 30;           // top of column stub
  const syColBot = syTop + sColStub;    // bottom of column stub (= top of footing)
  const syFootTop = syColBot;
  const syFootBot = syFootTop + sH;
  const syGround = syFootBot + 30;      // ground level line below footing

  // soil pressure diagram
  const qmaxPx = Math.min(40, qmax / 5);
  const qminPx = Math.max(0, Math.min(40, qmin / 5)) * (qmin > 0 ? 1 : 0);
  const pressLeft = qminPx;   // left edge (could be min or max depending on eccentricity)
  const pressRight = qmaxPx;

  // horizontal bars in section
  const barLayerY = syFootBot - sCoverPx;

  // ── Summary checks ───────────────────────────────────────────
  const bearingOk = soilPressure.qmax <= input.qall;
  const upliftOk = contactAreaRatio >= 0.75;
  const eccOk = Math.abs(ex) <= B / 6 && Math.abs(ey) <= L / 6;

  // nice bar diameter estimate
  const est_As_mm2 = Math.max(0.0018 * B * d, (1.0 * input.P * 1000 * (B / 2 - Cx / 2)) / (0.9 * 420 * 0.9 * d));
  const barDia = est_As_mm2 > 2500 ? 20 : est_As_mm2 > 1500 ? 18 : 16;
  const barArea = Math.PI * (barDia / 2) ** 2;
  const nBars = Math.max(5, Math.ceil(est_As_mm2 / barArea));

  return (
    <div className="space-y-1">

      {/* Drawing title strip */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1e3a8a] rounded-t-md">
        <span className="text-white text-[11px] font-bold tracking-wide">
          تفاصيل القاعدة المفصلة – ACI 318 / SBC 304
        </span>
        <span className="text-blue-200 text-[10px] font-mono">
          B={B}mm × L={L}mm × H={H}mm
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-[#1e3a8a] rounded-b-md overflow-hidden bg-white">

        {/* ══ PANEL 1: Plan View ══════════════════════════════════ */}
        <div className="border-r border-[#94a3b8] flex flex-col">
          <div className="bg-[#e8edf5] px-3 py-1 flex items-center justify-between border-b border-[#94a3b8]">
            <span className="text-[11px] font-bold text-[#1e3a8a]">مسقط أفقي (Plan View)</span>
            <span className="text-[9px] text-slate-500 font-mono">المقياس: تقريبي</span>
          </div>

          <div className="flex-1 bg-white flex items-center justify-center py-2">
            <svg width={planW} height={planH} viewBox={`0 0 ${planW} ${planH}`} className="w-full h-auto max-h-[260px]">
              <defs>
                <marker id="arr" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto">
                  <polygon points="0 0, 5 2.5, 0 5" fill="#1e3a8a" />
                </marker>
              </defs>

              {/* Center lines */}
              <line x1={pcx} y1={fy1 - 12} x2={pcx} y2={fy2 + 12}
                stroke="#6b7280" strokeWidth="0.6" strokeDasharray="5,3" />
              <line x1={fx1 - 12} y1={pcy} x2={fx2 + 12} y2={pcy}
                stroke="#6b7280" strokeWidth="0.6" strokeDasharray="5,3" />

              {/* Footing outline */}
              <rect x={fx1} y={fy1} width={footW} height={footH}
                fill="#f1f5f9" stroke="#1e293b" strokeWidth="2" />
              <Hatch x={fx1} y={fy1} w={footW} h={footH} spacing={10} angle={45} color="#94a3b8" opacity={0.3} />

              {/* Reinforcement bars – direction B (horizontal) */}
              {barsB.map((bx, i) => (
                <line key={`b${i}`} x1={bx} y1={fy1 + 4} x2={bx} y2={fy2 - 4}
                  stroke="#b91c1c" strokeWidth="1.3" opacity={0.85} />
              ))}
              {/* Reinforcement bars – direction L (vertical) */}
              {barsL.map((by, i) => (
                <line key={`l${i}`} x1={fx1 + 4} y1={by} x2={fx2 - 4} y2={by}
                  stroke="#1d4ed8" strokeWidth="1.3" opacity={0.85} />
              ))}

              {/* Column cross-section */}
              <rect x={ccx1} y={ccy1} width={colW} height={colH}
                fill="#475569" stroke="#1e293b" strokeWidth="1.5" />
              <Hatch x={ccx1} y={ccy1} w={colW} h={colH} spacing={6} angle={45} color="white" opacity={0.4} />
              <Hatch x={ccx1} y={ccy1} w={colW} h={colH} spacing={6} angle={-45} color="white" opacity={0.4} />

              {/* Section cut line A-A */}
              <line x1={fx1 - 14} y1={pcy} x2={fx1 - 6} y2={pcy}
                stroke="#cc0000" strokeWidth="1.5" />
              <text x={fx1 - 14} y={pcy - 4} fontSize="8" fill="#cc0000" fontWeight="bold">A</text>
              <line x1={fx2 + 6} y1={pcy} x2={fx2 + 14} y2={pcy}
                stroke="#cc0000" strokeWidth="1.5" />
              <text x={fx2 + 8} y={pcy - 4} fontSize="8" fill="#cc0000" fontWeight="bold">A</text>

              {/* Punching perimeter (d/2) */}
              <rect x={Math.max(punchX1, fx1)} y={Math.max(punchY1, fy1)}
                width={Math.min(punchX2, fx2) - Math.max(punchX1, fx1)}
                height={Math.min(punchY2, fy2) - Math.max(punchY1, fy1)}
                fill="none" stroke="#ef4444" strokeWidth="1" strokeDasharray="4,2" />

              {/* Bending critical section lines */}
              <line x1={ccx1} y1={fy1} x2={ccx1} y2={fy2} stroke="#2563eb" strokeWidth="0.8" strokeDasharray="3,2" />
              <line x1={ccx2} y1={fy1} x2={ccx2} y2={fy2} stroke="#2563eb" strokeWidth="0.8" strokeDasharray="3,2" />
              <line x1={fx1} y1={ccy1} x2={fx2} y2={ccy1} stroke="#2563eb" strokeWidth="0.8" strokeDasharray="3,2" />
              <line x1={fx1} y1={ccy2} x2={fx2} y2={ccy2} stroke="#2563eb" strokeWidth="0.8" strokeDasharray="3,2" />

              {/* Dimension – B */}
              <DimLine x1={fx1} y1={fy1 - 20} x2={fx2} y2={fy1 - 20} label={`B=${B}`} offset={14} />
              {/* Dimension – L */}
              <DimLine x1={fx2 + 22} y1={fy1} x2={fx2 + 22} y2={fy2} label={`L=${L}`} offset={14} />

              {/* Legend */}
              <line x1={fx1} y1={fy2 + 12} x2={fx1 + 12} y2={fy2 + 12} stroke="#b91c1c" strokeWidth="1.5" />
              <text x={fx1 + 14} y={fy2 + 16} fontSize="7" fill="#b91c1c">تسليح X</text>
              <line x1={fx1 + 50} y1={fy2 + 12} x2={fx1 + 62} y2={fy2 + 12} stroke="#1d4ed8" strokeWidth="1.5" />
              <text x={fx1 + 64} y={fy2 + 16} fontSize="7" fill="#1d4ed8">تسليح Y</text>
            </svg>
          </div>

          <div className="px-2 pb-1 flex gap-3 text-[9px] text-slate-600 flex-wrap">
            <span>🔴 تسليح X: {nBars}Ø{barDia}</span>
            <span>🔵 تسليح Y: {nBars}Ø{barDia}</span>
            <span>⬜ محيط الثقب b₀={punching_b0.toFixed(0)}mm</span>
          </div>
        </div>

        {/* ══ PANEL 2: Cross-Section A-A ══════════════════════════ */}
        <div className="border-r border-[#94a3b8] flex flex-col">
          <div className="bg-[#e8edf5] px-3 py-1 flex items-center justify-between border-b border-[#94a3b8]">
            <span className="text-[11px] font-bold text-[#1e3a8a]">قطاع A-A (Section A-A)</span>
            <span className="text-[9px] text-slate-500 font-mono">قطاع طولي</span>
          </div>

          <div className="flex-1 bg-white flex items-center justify-center py-2">
            <svg width={secW} height={secH} viewBox={`0 0 ${secW} ${secH}`} className="w-full h-auto max-h-[260px]">
              <defs>
                <marker id="arr2" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto">
                  <polygon points="0 0, 5 2.5, 0 5" fill="#1e3a8a" />
                </marker>
                <pattern id="soil-pat" patternUnits="userSpaceOnUse" width="8" height="8">
                  <rect width="8" height="8" fill="#d4a96a" opacity="0.3" />
                  <circle cx="2" cy="2" r="1" fill="#92400e" opacity="0.5" />
                  <circle cx="6" cy="6" r="1" fill="#92400e" opacity="0.5" />
                </pattern>
              </defs>

              {/* Ground surface */}
              <line x1={20} y1={syGround} x2={secW - 20} y2={syGround}
                stroke="#15803d" strokeWidth="1.5" />
              {/* Ground hatch */}
              {Array.from({ length: 10 }, (_, i) => (
                <line key={i}
                  x1={25 + i * 27} y1={syGround}
                  x2={20 + i * 27} y2={syGround + 8}
                  stroke="#15803d" strokeWidth="1" />
              ))}

              {/* Soil fill under footing */}
              <rect x={sx0} y={syFootBot} width={sFootW} height={30}
                fill="url(#soil-pat)" stroke="none" />

              {/* Footing concrete */}
              <rect x={sx0} y={syFootTop} width={sFootW} height={sH}
                fill="#e2e8f0" stroke="#1e293b" strokeWidth="2" />
              <Hatch x={sx0} y={syFootTop} w={sFootW} h={sH} spacing={9} angle={45} color="#94a3b8" opacity={0.4} />

              {/* Column stub */}
              <rect x={secW / 2 - sColW / 2} y={syTop} width={sColW} height={sColStub}
                fill="#64748b" stroke="#1e293b" strokeWidth="1.5" />
              <Hatch x={secW / 2 - sColW / 2} y={syTop} w={sColW} h={sColStub} spacing={6} angle={45} color="white" opacity={0.45} />
              <Hatch x={secW / 2 - sColW / 2} y={syTop} w={sColW} h={sColStub} spacing={6} angle={-45} color="white" opacity={0.45} />

              {/* Column label */}
              <text x={secW / 2} y={syTop - 4} textAnchor="middle" fontSize="8" fill="#334155" fontWeight="bold">
                عمود {Cx}×{Cy}
              </text>

              {/* Cover dimension */}
              <line x1={sx0 + 2} y1={syFootBot - 2} x2={sx0 + 2} y2={syFootBot - sCoverPx + 2}
                stroke="#ef4444" strokeWidth="0.8" strokeDasharray="2,2" />
              <text x={sx0 + 5} y={syFootBot - sCoverPx / 2 + 4} fontSize="7" fill="#ef4444">c=75</text>

              {/* Rebar – bottom horizontal (main) */}
              <line x1={sx0 + sCoverPx} y1={barLayerY}
                x2={sx1 - sCoverPx} y2={barLayerY}
                stroke="#b91c1c" strokeWidth="3" strokeLinecap="round" />
              {/* Hook left */}
              <path d={`M ${sx0 + sCoverPx} ${barLayerY} Q ${sx0 + sCoverPx - 3} ${barLayerY - 8} ${sx0 + sCoverPx} ${barLayerY - 14}`}
                fill="none" stroke="#b91c1c" strokeWidth="2.5" />
              {/* Hook right */}
              <path d={`M ${sx1 - sCoverPx} ${barLayerY} Q ${sx1 - sCoverPx + 3} ${barLayerY - 8} ${sx1 - sCoverPx} ${barLayerY - 14}`}
                fill="none" stroke="#b91c1c" strokeWidth="2.5" />

              {/* Rebar dots (transverse bars) */}
              {Array.from({ length: Math.min(barCountL, 8) }, (_, i) => {
                const bx = sx0 + sCoverPx + i * ((sFootW - 2 * sCoverPx) / Math.max(1, Math.min(barCountL, 8) - 1));
                return <circle key={i} cx={bx} cy={barLayerY - 6} r="3" fill="#1d4ed8" stroke="white" strokeWidth="0.8" />;
              })}

              {/* effective depth d */}
              <line x1={sx1 + 14} y1={syFootTop + sCoverPx} x2={sx1 + 14} y2={barLayerY}
                stroke="#7c3aed" strokeWidth="0.8" markerStart="url(#arr2)" markerEnd="url(#arr2)" />
              <text x={sx1 + 16} y={(syFootTop + sCoverPx + barLayerY) / 2 + 4} fontSize="7.5" fill="#7c3aed" fontWeight="bold">
                d={d.toFixed(0)}
              </text>

              {/* Soil pressure diagram */}
              <polygon
                points={`${sx0},${syFootBot} ${sx1},${syFootBot} ${sx1},${syFootBot + pressRight} ${sx0},${syFootBot + pressLeft}`}
                fill="#fbbf24" opacity="0.35" />
              <line x1={sx0} y1={syFootBot} x2={sx0} y2={syFootBot + pressLeft}
                stroke="#d97706" strokeWidth="1.2" />
              <line x1={sx1} y1={syFootBot} x2={sx1} y2={syFootBot + pressRight}
                stroke="#d97706" strokeWidth="1.2" />
              <text x={sx0 + 2} y={syFootBot + pressLeft + 8} fontSize="7" fill="#92400e">q={qmin.toFixed(0)}</text>
              <text x={sx1 - 2} y={syFootBot + pressRight + 8} textAnchor="end" fontSize="7" fill="#92400e">q={qmax.toFixed(0)}</text>

              {/* Dimension H */}
              <DimLine x1={sx0 - 24} y1={syFootTop} x2={sx0 - 24} y2={syFootBot}
                label={`H=${H}`} offset={16} color="#1e3a8a" />

              {/* Dimension B */}
              <DimLine x1={sx0} y1={syGround + 16} x2={sx1} y2={syGround + 16}
                label={`B=${B}`} offset={12} color="#1e3a8a" />

              {/* Section label */}
              <text x={20} y={syTop + 10} fontSize="10" fill="#cc0000" fontWeight="bold">A</text>
              <text x={secW - 20} y={syTop + 10} textAnchor="end" fontSize="10" fill="#cc0000" fontWeight="bold">A</text>
            </svg>
          </div>

          <div className="px-2 pb-1 flex gap-3 text-[9px] text-slate-600 flex-wrap">
            <span>🔴 تسليح X (سفلي)</span>
            <span>🔵 تسليح Y (منظور)</span>
            <span>🟡 ضغط التربة (kN/m²)</span>
          </div>
        </div>

        {/* ══ PANEL 3: Results Summary Card ═══════════════════════ */}
        <div className="flex flex-col">
          <div className="bg-[#e8edf5] px-3 py-1 flex items-center justify-between border-b border-[#94a3b8]">
            <span className="text-[11px] font-bold text-[#1e3a8a]">ملخص النتائج والتحقق</span>
            <span className="text-[9px] text-slate-500">ACI 318-19</span>
          </div>

          <div className="flex-1 p-2 space-y-2 overflow-auto text-right" dir="rtl">

            {/* Soil pressure */}
            <div>
              <div className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded mb-1">ضغط التربة</div>
              <table className="w-full text-[10px] border-collapse">
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-0.5 pr-1 text-slate-600">الحد المسموح q<sub>all</sub></td>
                    <td className="py-0.5 text-center font-mono font-bold text-slate-800">{input.qall.toFixed(0)} kN/m²</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-0.5 pr-1 text-slate-600">أقصى ضغط q<sub>max</sub></td>
                    <td className={`py-0.5 text-center font-mono font-bold ${bearingOk ? 'text-green-700' : 'text-red-600'}`}>
                      {qmax.toFixed(1)} kN/m² {bearingOk ? '✓' : '✗'}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-0.5 pr-1 text-slate-600">أدنى ضغط q<sub>min</sub></td>
                    <td className="py-0.5 text-center font-mono font-bold text-slate-700">{qmin.toFixed(1)} kN/m²</td>
                  </tr>
                  <tr>
                    <td className="py-0.5 pr-1 text-slate-600">نسبة التماس</td>
                    <td className={`py-0.5 text-center font-mono font-bold ${upliftOk ? 'text-green-700' : 'text-orange-600'}`}>
                      {(contactAreaRatio * 100).toFixed(0)}% {upliftOk ? '✓' : '⚠'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Eccentricity */}
            <div>
              <div className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded mb-1">اللامركزية</div>
              <table className="w-full text-[10px] border-collapse">
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-0.5 pr-1 text-slate-600">e<sub>x</sub></td>
                    <td className="py-0.5 text-center font-mono">{ex.toFixed(1)} mm</td>
                    <td className="py-0.5 text-center">
                      <span className={`text-[9px] font-bold ${Math.abs(ex) <= B / 6 ? 'text-green-700' : 'text-red-600'}`}>
                        {Math.abs(ex) <= B / 6 ? 'داخل النواة ✓' : 'خارج النواة ✗'}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-0.5 pr-1 text-slate-600">e<sub>y</sub></td>
                    <td className="py-0.5 text-center font-mono">{ey.toFixed(1)} mm</td>
                    <td className="py-0.5 text-center">
                      <span className={`text-[9px] font-bold ${Math.abs(ey) <= L / 6 ? 'text-green-700' : 'text-red-600'}`}>
                        {Math.abs(ey) <= L / 6 ? 'داخل النواة ✓' : 'خارج النواة ✗'}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Geometry */}
            <div>
              <div className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded mb-1">هندسة القاعدة</div>
              <table className="w-full text-[10px] border-collapse">
                <tbody>
                  {[
                    ['العرض B', `${B} mm`],
                    ['الطول L', `${L} mm`],
                    ['السماكة H', `${H} mm`],
                    ['الارتفاع الفعال d', `${d.toFixed(0)} mm`],
                    ['الغطاء الصافي', '75 mm'],
                    ['محيط الثقب b₀', `${punching_b0.toFixed(0)} mm`],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-b border-slate-100">
                      <td className="py-0.5 pr-1 text-slate-600">{k}</td>
                      <td className="py-0.5 text-center font-mono font-bold text-slate-800">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Estimated reinforcement */}
            <div>
              <div className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded mb-1">تقدير التسليح</div>
              <div className="text-[10px] text-slate-700 space-y-0.5 px-1">
                <div className="flex justify-between">
                  <span>الاتجاه X (B):</span>
                  <span className="font-mono font-bold text-red-700">{nBars} Ø {barDia} mm</span>
                </div>
                <div className="flex justify-between">
                  <span>الاتجاه Y (L):</span>
                  <span className="font-mono font-bold text-blue-700">{nBars} Ø {barDia} mm</span>
                </div>
                <div className="flex justify-between">
                  <span>التباعد التقريبي:</span>
                  <span className="font-mono text-slate-600">{barSpacingB} mm</span>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
