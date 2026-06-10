/**
 * HTML-based Construction Drawing Generator — ISO 7200 / ACI 315-99 Compliant
 * Generates construction sheets as HTML with full Arabic text support,
 * matching the jsPDF-based constructionSheets.ts layout exactly.
 * 
 * Uses html2canvas to convert to images for PDF export or opens print dialog.
 */

import type { Slab, Column, Beam, FlexureResult, ShearResult, ColumnResult, SlabDesignResult, MatProps, SlabProps } from '@/lib/structuralEngine';
import { getFloorCode, makeDrawingNumber, type TitleBlockConfig, type ExportOptions, type DevelopmentLengths } from './drawingStandards';
import { analyzeAllContinuousSlabs, type ContinuousSlabResult, type SpanResult } from '@/lib/continuousSlabAnalysis';
import { generateProjectDetailing } from '@/lib/isolatedFootingDetailingEngine';

interface BeamDesignData {
  beamId: string;
  flexLeft: FlexureResult;
  flexMid: FlexureResult;
  flexRight: FlexureResult;
  shear: ShearResult;
  /** IDs of the individual beam segments that were merged into this design (carrier/multi-segment beams) */
  mergedCarrierIds?: string[];
  /** Total design span in metres (for merged carrier beams this equals sum of all segments) */
  span?: number;
}

// ─── Reinforcement group label helpers ───

function getCanonicalBeamId(id: string): string {
  const m = id.match(/^(.+)-(\d+)$/);
  return m ? m[1] : id;
}

/** Build a map of beamId → Arabic group label (ج-1, ج-2, …) by identical reinforcement pattern */
function buildBeamGroupLabels(beamDesigns: BeamDesignData[], bentUpResults?: any[]): Map<string, string> {
  const keyToLabel = new Map<string, string>();
  const result = new Map<string, string>();
  let counter = 1;
  for (const d of beamDesigns) {
    let bent: any = null;
    if (bentUpResults) {
      const canonId = getCanonicalBeamId(d.beamId);
      for (const fr of bentUpResults) {
        if (!fr) continue;
        const bResult = fr.beams?.find((bb: any) => bb.beamId === d.beamId || bb.beamId === canonId);
        if (bResult) {
          bent = bResult;
          break;
        }
      }
    }

    const totalBot = d.flexMid.bars;
    const isShort = (d.span ?? 0) <= 2.0;
    const hasBent = !isShort && totalBot >= 3;

    const bentCount = bent ? bent.bentUp.bentBarsCount : (hasBent ? Math.floor(totalBot / 2) : 0);
    const straightBot = bent ? bent.bentUp.remainingBottomBars : (totalBot - bentCount);

    const topLeftBars = bent ? Math.max(bent.additionalTopLeft, 2) : d.flexLeft.bars;
    const topRightBars = bent ? Math.max(bent.additionalTopRight, 2) : d.flexRight.bars;
    const netTop = bent ? bent.finalTopBars : Math.max(2, Math.max(topLeftBars, topRightBars) - bentCount);

    const actualBotDia = bent ? bent.bottomDia : d.flexMid.dia;
    const actualTopDia = bent ? bent.topDia : Math.max(d.flexLeft.dia, d.flexRight.dia);

    const key = `${straightBot}φ${actualBotDia}|${bentCount}φ${actualBotDia}|${netTop}φ${actualTopDia}|${d.shear.stirrups}`;
    if (!keyToLabel.has(key)) {
      keyToLabel.set(key, `ج-${counter++}`);
    }
    result.set(d.beamId, keyToLabel.get(key)!);
  }
  return result;
}

/** Build a map of colId → Arabic group label (ع-1, ع-2, …) by identical reinforcement pattern */
function buildColGroupLabels(colDesigns: ColDesignData[]): Map<string, string> {
  const keyToLabel = new Map<string, string>();
  const result = new Map<string, string>();
  let counter = 1;
  for (const c of colDesigns) {
    const key = `${c.b}x${c.h}|${c.design.bars}φ${c.design.dia}|${c.design.stirrups}`;
    if (!keyToLabel.has(key)) {
      keyToLabel.set(key, `ع-${counter++}`);
    }
    result.set(c.id, keyToLabel.get(key)!);
  }
  return result;
}

/** Build a map of slabId → Arabic group label (ب-1, ب-2, …) by identical reinforcement pattern */
function buildSlabGroupLabels(slabDesigns: SlabDesignData[]): Map<string, string> {
  const keyToLabel = new Map<string, string>();
  const result = new Map<string, string>();
  let counter = 1;
  for (const s of slabDesigns) {
    const key = `h${s.design.hUsed}|${s.design.shortDir.bars}φ${s.design.shortDir.dia}@${s.design.shortDir.spacing}|${s.design.longDir.bars}φ${s.design.longDir.dia}@${s.design.longDir.spacing}`;
    if (!keyToLabel.has(key)) {
      keyToLabel.set(key, `ب-${counter++}`);
    }
    result.set(s.id, keyToLabel.get(key)!);
  }
  return result;
}

interface ColDesignData {
  id: string;
  b: number; h: number;
  design: ColumnResult;
}

interface SlabDesignData {
  id: string;
  design: SlabDesignResult;
}

// ─── Paper size handling (auto + landscape, drawing fills the page) ───
type PaperSize = 'A4' | 'A3' | 'A1' | 'auto';
const PAPER_DIMS_MM: Record<Exclude<PaperSize, 'auto'>, [number, number]> = {
  A4: [297, 210],
  A3: [420, 297],
  A1: [841, 594],
};
const PX_PER_MM = 3;
function pickAutoPaper(modelW: number, modelH: number): Exclude<PaperSize, 'auto'> {
  const maxDim = Math.max(modelW, modelH);
  if (maxDim > 20) return 'A1';
  if (maxDim > 8) return 'A3';
  return 'A4';
}
function getPaperPx(paperSize: PaperSize, modelW: number, modelH: number) {
  const ps = paperSize === 'auto' ? pickAutoPaper(modelW, modelH) : paperSize;
  const [mmW, mmH] = PAPER_DIMS_MM[ps];
  return { sheetW: Math.round(mmW * PX_PER_MM), sheetH: Math.round(mmH * PX_PER_MM), cssSize: ps };
}
let _SHEET_W = 1260;
let _SHEET_H = 891;
let _CSS_PAPER: Exclude<PaperSize, 'auto'> = 'A3';

// ─── SVG helpers for drawing zone ───

function svgGridSystem(
  gridX: number[], gridY: number[],
  tx: (x: number) => number, ty: (y: number) => number,
  minX: number, maxX: number, minY: number, maxY: number,
): string {
  const xLabels = gridX.map((_, i) => String.fromCharCode(65 + i));
  const yLabels = gridY.map((_, i) => (i + 1).toString());
  let svg = '';
  
  // Grid lines
  for (let i = 0; i < gridX.length; i++) {
    const x = tx(gridX[i]);
    svg += `<line x1="${x}" y1="${ty(minY - 0.3)}" x2="${x}" y2="${ty(maxY + 0.3)}" stroke="#FFA03C" stroke-width="0.3" />`;
    // Grid bubble
    const by = ty(maxY + 0.3) - 30;
    svg += `<circle cx="${x}" cy="${by}" r="14" fill="white" stroke="black" stroke-width="1" />`;
    svg += `<text x="${x}" y="${by + 4}" text-anchor="middle" font-size="10" font-weight="bold" font-family="Arial">${xLabels[i]}</text>`;
  }
  for (let i = 0; i < gridY.length; i++) {
    const y = ty(gridY[i]);
    svg += `<line x1="${tx(minX - 0.3)}" y1="${y}" x2="${tx(maxX + 0.3)}" y2="${y}" stroke="#FFA03C" stroke-width="0.3" />`;
    const bx = tx(minX - 0.3) - 30;
    svg += `<circle cx="${bx}" cy="${y}" r="14" fill="white" stroke="black" stroke-width="1" />`;
    svg += `<text x="${bx}" y="${y + 4}" text-anchor="middle" font-size="10" font-weight="bold" font-family="Arial">${yLabels[i]}</text>`;
  }
  return svg;
}

function svgColumns(
  columns: Column[], tx: (x: number) => number, ty: (y: number) => number, mmPerM: number,
  filled: boolean = true, showLabels: boolean = false,
  groupLabels?: Map<string, string>,
): string {
  let svg = '';
  for (const c of columns) {
    if ((c as any).isRemoved) continue;

    // دعم التدوير: orientAngle ~90° يعني تبديل b و h في الرسم
    const angle = (c as any).orientAngle ?? 0;
    const isRotated = Math.round(Math.abs(angle) % 180) >= 45 && Math.round(Math.abs(angle) % 180) < 135;
    // الأبعاد المرئية على المسقط الأفقي
    const visualW = isRotated ? c.h : c.b; // البُعد على محور X
    const visualH = isRotated ? c.b : c.h; // البُعد على محور Y

    const hw = (visualW / 1000) * mmPerM / 2;
    const hh = (visualH / 1000) * mmPerM / 2;
    const cx = tx(c.x) - hw;
    const cy = ty(c.y) - hh;
    const fill = filled ? '#3C3C3C' : '#000';
    svg += `<rect x="${cx}" y="${cy}" width="${hw * 2}" height="${hh * 2}" fill="${fill}" stroke="black" stroke-width="1" />`;
    if (showLabels) {
      const groupLabel = groupLabels?.get(c.id);
      // السطر الأول: رمز المجموعة + رقم العمود
      const line1 = groupLabel ? `${groupLabel}(${c.id})` : c.id;
      // السطر الثاني: الأبعاد + مؤشر التدوير إن وجد
      const line2 = `${c.b}×${c.h}${isRotated ? ' ®' : ''}`;
      svg += `<text x="${tx(c.x) + hw + 5}" y="${ty(c.y) - 2}" font-size="7" font-weight="bold" font-family="Arial" fill="#000">${line1}</text>`;
      svg += `<text x="${tx(c.x) + hw + 5}" y="${ty(c.y) + 9}" font-size="5.5" font-family="Arial" fill="#444">${line2}</text>`;
    }
  }
  return svg;
}

function svgBeamsOnPlan(
  beams: Beam[], columns: Column[],
  tx: (x: number) => number, ty: (y: number) => number, mmPerM: number,
  groupLabels?: Map<string, string>,
  hideLabels?: boolean,
): string {
  let svg = '';

  // ── اكتشاف مجموعات الأجزاء (مثل 67-1, 67-2, 67-3 ← جسر واحد "67") ──
  const segGroupMap = new Map<string, Beam[]>();
  for (const b of beams) {
    const m = b.id.match(/^(.+)-(\d+)$/);
    if (m) {
      const baseId = m[1];
      if (!segGroupMap.has(baseId)) segGroupMap.set(baseId, []);
      segGroupMap.get(baseId)!.push(b);
    }
  }
  // احتفظ فقط بالمجموعات ذات جزأين أو أكثر
  for (const [k, parts] of segGroupMap) {
    if (parts.length < 2) segGroupMap.delete(k);
  }
  const segmentPartIds = new Set<string>();
  for (const [, parts] of segGroupMap) {
    for (const p of parts) segmentPartIds.add(p.id);
  }

  // ── الجولة الأولى: رسم مستطيلات الجسور ──
  for (const b of beams) {
    const isHoriz = Math.abs(b.y1 - b.y2) < 0.01;
    const beamThickPx = Math.max((b.b / 1000) * mmPerM, 6);

    let bx1 = tx(b.x1), by1 = ty(b.y1), bx2 = tx(b.x2), by2 = ty(b.y2);

    const fromCol = columns.find(c => c.id === (b as any).fromCol || (Math.abs(c.x - b.x1) < 0.01 && Math.abs(c.y - b.y1) < 0.01));
    const toCol = columns.find(c => c.id === (b as any).toCol || (Math.abs(c.x - b.x2) < 0.01 && Math.abs(c.y - b.y2) < 0.01));

    // Half-column extent in beam direction accounting for orientAngle
    const _colHalfPx = (col: typeof fromCol, horiz: boolean) => {
      if (!col) return 0;
      const θ = ((col.orientAngle ?? 0) * Math.PI) / 180;
      const bH = (col.b / 1000) * mmPerM / 2;
      const hH = (col.h / 1000) * mmPerM / 2;
      return horiz
        ? Math.abs(bH * Math.cos(θ)) + Math.abs(hH * Math.sin(θ))
        : Math.abs(bH * Math.sin(θ)) + Math.abs(hH * Math.cos(θ));
    };
    if (fromCol) {
      if (isHoriz) bx1 += _colHalfPx(fromCol, true);
      else by1 -= _colHalfPx(fromCol, false);
    }
    if (toCol) {
      if (isHoriz) bx2 -= _colHalfPx(toCol, true);
      else by2 += _colHalfPx(toCol, false);
    }

    if (isHoriz) {
      svg += `<rect x="${Math.min(bx1, bx2)}" y="${by1 - beamThickPx / 2}" width="${Math.abs(bx2 - bx1)}" height="${beamThickPx}" fill="#B4D2B4" stroke="#006400" stroke-width="1" />`;
    } else {
      svg += `<rect x="${bx1 - beamThickPx / 2}" y="${Math.min(by1, by2)}" width="${beamThickPx}" height="${Math.abs(by2 - by1)}" fill="#B4D2B4" stroke="#006400" stroke-width="1" />`;
    }

    // ── التسمية: فقط للجسور المستقلة (غير الأجزاء المقسّمة) ──
    if (!hideLabels && !segmentPartIds.has(b.id)) {
      const mx = (bx1 + bx2) / 2;
      const my = (by1 + by2) / 2;
      const labelOffset = isHoriz ? -beamThickPx / 2 - 10 : beamThickPx / 2 + 5;
      const groupLabel = groupLabels?.get(b.id);
      let displayLabel = groupLabel ?? b.name ?? b.id;
      if (!groupLabel) {
        const m = b.id.match(/^(.+)-(\d+)$/);
        if (m) {
          const baseId = m[1];
          const existingPartsCount = beams.filter(x => x.id.match(new RegExp(`^${baseId}-\\d+$`))).length;
          if (existingPartsCount === 1) {
            displayLabel = b.name ? b.name.replace(/-\d+$/, '') : baseId;
          }
        }
      }
      if (isHoriz) {
        svg += `<text x="${mx}" y="${my + labelOffset}" font-size="6.5" font-weight="bold" fill="#005000" font-family="Arial" text-anchor="middle">${displayLabel}</text>`;
      } else {
        svg += `<text x="${mx + labelOffset}" y="${my}" font-size="6.5" font-weight="bold" fill="#005000" font-family="Arial">${displayLabel}</text>`;
      }
    }
  }

  // ── الجولة الثانية: تسمية مجموعات الأجزاء بتسمية واحدة عند منتصف الجسر الكامل ──
  if (!hideLabels) {
    for (const [baseId, parts] of segGroupMap) {
      const first = parts[0];
      const isHoriz = Math.abs(first.y1 - first.y2) < 0.01;
      const beamThickPx = Math.max((first.b / 1000) * mmPerM, 6);
      const namedPart = parts.find(p => p.name);
      const customBaseName = namedPart && namedPart.name ? namedPart.name.replace(/-\d+$/, '') : baseId;
      const groupLabel = groupLabels?.get(baseId);
      const displayLabel = groupLabel ? `${groupLabel}(${customBaseName})` : customBaseName;

      if (isHoriz) {
        const allX = parts.flatMap(p => {
          let bx1 = tx(p.x1), bx2 = tx(p.x2);
          const fc = columns.find(c => Math.abs(c.x - p.x1) < 0.01 && Math.abs(c.y - p.y1) < 0.01);
          const tc = columns.find(c => Math.abs(c.x - p.x2) < 0.01 && Math.abs(c.y - p.y2) < 0.01);
          if (fc) bx1 += (fc.b / 1000) * mmPerM / 2;
          if (tc) bx2 -= (tc.b / 1000) * mmPerM / 2;
          return [bx1, bx2];
        });
        const midX = (Math.min(...allX) + Math.max(...allX)) / 2;
        const midY = ty(first.y1);
        svg += `<text x="${midX}" y="${midY - beamThickPx / 2 - 10}" font-size="6.5" font-weight="bold" fill="#005000" font-family="Arial" text-anchor="middle">${displayLabel}</text>`;
      } else {
        const allY = parts.flatMap(p => {
          let by1 = ty(p.y1), by2 = ty(p.y2);
          const fc = columns.find(c => Math.abs(c.x - p.x1) < 0.01 && Math.abs(c.y - p.y1) < 0.01);
          const tc = columns.find(c => Math.abs(c.x - p.x2) < 0.01 && Math.abs(c.y - p.y2) < 0.01);
          if (fc) by1 -= (fc.h / 1000) * mmPerM / 2;
          if (tc) by2 += (tc.h / 1000) * mmPerM / 2;
          return [by1, by2];
        });
        const midY = (Math.min(...allY) + Math.max(...allY)) / 2;
        const midX = tx(first.x1);
        svg += `<text x="${midX + beamThickPx / 2 + 5}" y="${midY}" font-size="6.5" font-weight="bold" fill="#005000" font-family="Arial">${displayLabel}</text>`;
      }
    }
  }

  return svg;
}

function svgSlabsOnPlan(
  slabs: Slab[], slabDesigns: SlabDesignData[],
  tx: (x: number) => number, ty: (y: number) => number, mmPerM: number,
  groupLabels?: Map<string, string>,
): string {
  let svg = '';
  for (const s of slabs) {
    const svgX = tx(s.x1);
    const svgY = ty(s.y2);
    const svgW = (s.x2 - s.x1) * mmPerM;
    const svgH_slab = (s.y2 - s.y1) * mmPerM;
    svg += `<rect x="${svgX}" y="${svgY}" width="${svgW}" height="${svgH_slab}" fill="rgba(220,235,255,0.25)" stroke="#000096" stroke-width="0.7" />`;
    const cx = tx((s.x1 + s.x2) / 2);
    const cy = ty((s.y1 + s.y2) / 2);

    const sd = slabDesigns.find(d => d.id === s.id);
    if (!sd) continue;

    // تحديد أي الاتجاهين هو X (الأفقي)
    const lx = s.x2 - s.x1;
    const ly = s.y2 - s.y1;
    const xIsShort = lx <= ly;
    const xDir = xIsShort ? sd.design.shortDir : sd.design.longDir;
    const yDir = xIsShort ? sd.design.longDir : sd.design.shortDir;

    const formattedX = `${xDir.bars}Φ${xDir.dia}/m`;
    const formattedY = `${yDir.bars}Φ${yDir.dia}/m`;

    // 1. اسم البلاطة بخط واضح وحجم مناسب وفي مكان مناسب في وسط البلاطة تماماً
    svg += `<text x="${cx}" y="${cy - 11}" text-anchor="middle" font-size="9" font-weight="black" fill="#004000" font-family="'Segoe UI', Arial, sans-serif" letter-spacing="0.5">${s.id}</text>`;

    // 2. حديد اتجاه X - أفقي
    svg += `<text x="${cx}" y="${cy + 3}" text-anchor="middle" font-size="7.5" font-weight="bold" fill="#1a3a5c" font-family="Arial">X: ${formattedX}</text>`;

    // 3. حديد اتجاه Y - أفقي
    svg += `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="7.5" font-weight="bold" fill="#7b1a00" font-family="Arial">Y: ${formattedY}</text>`;
  }
  return svg;
}

function svgScaleBar(x: number, y: number, scale: number): string {
  const barUnitPx = 1000 / scale * 3;
  const totalW = 4 * barUnitPx + 32;
  let svg = `<rect x="${x - 4}" y="${y - 4}" width="${totalW}" height="32" fill="white" stroke="#999" stroke-width="0.5" opacity="0.93" rx="2"/>`;
  svg += `<text x="${x}" y="${y + 5}" font-size="5.5" font-weight="bold" font-family="Arial">Scale 1:${scale}</text>`;
  for (let i = 0; i < 4; i++) {
    const rx = x + i * barUnitPx;
    const fill = i % 2 === 0 ? '#000' : '#fff';
    svg += `<rect x="${rx}" y="${y + 8}" width="${barUnitPx}" height="8" fill="${fill}" stroke="black" stroke-width="0.5" />`;
  }
  svg += `<text x="${x}" y="${y + 25}" font-size="5" font-family="Arial">0</text>`;
  for (let i = 1; i <= 4; i++) {
    svg += `<text x="${x + i * barUnitPx - 5}" y="${y + 25}" font-size="5" font-family="Arial">${i}m</text>`;
  }
  return svg;
}

/** شريط مقياس الرسم كـ HTML (يوضع في منطقة الجدول أسفل اللوحة) */
function htmlScaleBarBlock(scale: number): string {
  const barUnitPx = Math.min(60, Math.max(20, 1000 / scale * 2.5));
  const totalW = 4 * barUnitPx + 4;
  let barSvg = '';
  for (let i = 0; i < 4; i++) {
    const rx = i * barUnitPx;
    const fill = i % 2 === 0 ? '#000' : '#fff';
    barSvg += `<rect x="${rx}" y="0" width="${barUnitPx}" height="7" fill="${fill}" stroke="black" stroke-width="0.5"/>`;
  }
  barSvg += `<text x="0" y="17" font-size="6" font-family="Arial">0</text>`;
  for (let i = 1; i <= 4; i++) {
    barSvg += `<text x="${i * barUnitPx - 4}" y="17" font-size="6" font-family="Arial">${i}m</text>`;
  }
  return `
  <div style="margin-top:8px; padding:5px 6px; border-top:1px dashed #bbb; display:flex; align-items:center; gap:8px; font-family:Arial; direction:ltr;">
    <div>
      <div style="font-size:8px; font-weight:bold; margin-bottom:3px; color:#333;">مقياس الرسم / Scale</div>
      <svg width="${totalW}" height="20" xmlns="http://www.w3.org/2000/svg">${barSvg}</svg>
    </div>
    <div style="font-size:9px; font-weight:bold; color:#333; letter-spacing:0.5px;">1 : ${scale}</div>
  </div>`;
}

function svgLegendBox(x: number, y: number): string {
  const w = 160;
  const h = 110;
  let svg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white" stroke="black" stroke-width="1" />`;
  svg += `<text x="${x + 25}" y="${y + 14}" font-size="7" font-weight="bold" font-family="Arial">LEGEND / SYMBOLS</text>`;
  svg += `<line x1="${x}" y1="${y + 18}" x2="${x + w}" y2="${y + 18}" stroke="black" stroke-width="0.5" />`;
  
  const items = [
    ['■', 'Column (RC)'],
    ['══', 'Beam (RC) — width × depth'],
    ['□', 'Slab panel'],
    ['←→', 'Dimension line'],
    ['●', 'Rebar (filled circle)'],
    ['Φ', 'Bar diameter'],
    ['@', 'Spacing (center-to-center)'],
  ];
  items.forEach(([sym, desc], i) => {
    svg += `<text x="${x + 8}" y="${y + 32 + i * 12}" font-size="6" font-family="Arial">${sym}</text>`;
    svg += `<text x="${x + 30}" y="${y + 32 + i * 12}" font-size="6" font-family="Arial">${desc}</text>`;
  });
  return svg;
}

// ─── Title Block (ISO 7200) as HTML ───

function htmlTitleBlock(config: Partial<TitleBlockConfig>): string {
  return `
  <div style="position:absolute; bottom:36px; right:36px; width:600px; height:135px; border:1.5px solid #000; font-family:Arial,sans-serif; font-size:9px; display:grid; grid-template-rows:1fr 1fr 1fr; grid-template-columns:360px 240px;">
    <!-- Row 1 Left -->
    <div style="border-bottom:1px solid #000; border-right:1px solid #000; padding:3px 6px;">
      <div style="font-weight:bold; font-size:10px;">${config.firmName || 'Structural Design Studio'}</div>
      <div>PROJECT: ${config.projectName || ''}</div>
      <div>LOCATION: ${config.projectLocation || ''}</div>
      <div>CLIENT: ${config.clientName || ''}</div>
    </div>
    <!-- Row 1 Right -->
    <div style="border-bottom:1px solid #000; padding:3px 6px; text-align:center;">
      <div style="font-weight:bold; margin-top:8px;">[STAMP / SEAL]</div>
      ${config.registrationNo ? `<div>REG. NO.: ${config.registrationNo}</div>` : ''}
    </div>
    <!-- Row 2 Left -->
    <div style="border-bottom:1px solid #000; border-right:1px solid #000; padding:3px 6px;">
      <div style="font-weight:bold; font-size:11px;">${config.drawingTitle || ''}</div>
      <div>${config.drawingSubTitle || ''}</div>
      <div>SCALE: ${config.scale || 'N.T.S.'}   SHEET: ${config.sheetNo || '1'}</div>
    </div>
    <!-- Row 2 Right -->
    <div style="border-bottom:1px solid #000; padding:3px 6px;">
      <div style="font-weight:bold;">DWG NO: ${config.drawingNumber || ''}</div>
      <div>REVISION: ${config.revision || 'R0'}</div>
      <div>DATE: ${config.date || new Date().toLocaleDateString()}</div>
    </div>
    <!-- Row 3 Left -->
    <div style="border-right:1px solid #000; padding:3px 6px; font-size:8px;">
      <div>DESIGNED: ${config.designedBy || 'ENG.'}    CHECKED: ${config.checkedBy || '-'}</div>
      <div>DRAWN: ${config.drawnBy || 'ENG.'}    APPROVED: ${config.approvedBy || '-'}</div>
    </div>
    <!-- Row 3 Right -->
    <div style="padding:3px 6px;">
      <div style="font-weight:bold;">CODE: ${config.designCode || 'ACI 318-19'}</div>
      <div>f'c=${config.fc || 28}MPa  fy=${config.fy || 420}MPa</div>
    </div>
  </div>`;
}

// ─── Sheet border ───

function htmlSheetBorder(): string {
  return `
    <div style="position:absolute; top:15px; left:15px; right:15px; bottom:15px; border:3px solid #000;"></div>
    <div style="position:absolute; top:30px; left:30px; right:30px; bottom:30px; border:1px solid #000;"></div>`;
}

// ─── Schedule tables (Arabic headers) ───

function fmtRebar(bars: number, dia: number): string { return `${bars}Φ${dia}`; }

function htmlBeamScheduleTable(beams: Beam[], beamDesigns: BeamDesignData[], bentUpResults?: any[]): string {
  const groupLabels = buildBeamGroupLabels(beamDesigns, bentUpResults);

  // ── تجميع حسب رمز المجموعة (جسور بنفس التسليح = مجموعة واحدة) ──
  const groups = new Map<string, { designs: BeamDesignData[]; memberIds: string[] }>();
  for (const d of beamDesigns) {
    const label = groupLabels.get(d.beamId) ?? d.beamId;
    if (!groups.has(label)) groups.set(label, { designs: [], memberIds: [] });
    groups.get(label)!.designs.push(d);
    const mergedIds = (d as any).mergedCarrierIds as string[] | undefined;
    if (mergedIds && mergedIds.length > 0) {
      groups.get(label)!.memberIds.push(...mergedIds);
    } else {
      groups.get(label)!.memberIds.push(d.beamId);
    }
  }

  let rows = '';
  for (const [groupLabel, { designs, memberIds }] of groups) {
    const d = designs[0]; // التسليح متطابق لجميع أعضاء المجموعة
    let b_dim: number | undefined;
    let h_dim: number | undefined;
    const spans: number[] = [];

    for (const design of designs) {
      let beam = beams.find(b => b.id === design.beamId);
      if (!beam && (design as any).mergedCarrierIds) {
        const parts = ((design as any).mergedCarrierIds as string[])
          .map(id => beams.find(b => b.id === id)).filter(Boolean) as Beam[];
        if (parts.length > 0) {
          const largest = parts.reduce((best, b) => b.b * b.h >= best.b * best.h ? b : best, parts[0]);
          if (b_dim === undefined) { b_dim = largest.b; h_dim = largest.h; }
        }
      } else if (beam) {
        if (b_dim === undefined) { b_dim = beam.b; h_dim = beam.h; }
      }
      if (design.span !== undefined && design.span > 0) spans.push(design.span);
    }

    const minSpan = spans.length > 0 ? Math.min(...spans) : 0;
    const maxSpan = spans.length > 0 ? Math.max(...spans) : 0;
    const spanText = spans.length === 0 ? '—'
      : minSpan === maxSpan ? minSpan.toFixed(2)
      : `${minSpan.toFixed(2)}~${maxSpan.toFixed(2)}`;

    const totalBot = d.flexMid.bars;
    const isShort = maxSpan <= 2.0;
    const hasBent = !isShort && totalBot >= 3;

    // البحث عن نتائج تكسيح الحديد للجسر داخل المجموعة (باستخدام ID المعين أو الـ Canonical ID للجسر المجزأ)
    let bent: any = null;
    if (bentUpResults) {
      for (const id of memberIds) {
        const canonId = getCanonicalBeamId(id);
        for (const fr of bentUpResults) {
          if (!fr) continue;
          const bResult = fr.beams?.find((bb: any) => bb.beamId === id || bb.beamId === canonId);
          if (bResult) {
            bent = bResult;
            break;
          }
        }
        if (bent) break;
      }
    }

    const bentCount = bent ? bent.bentUp.bentBarsCount : (hasBent ? Math.floor(totalBot / 2) : 0);
    const straightBot = bent ? bent.bentUp.remainingBottomBars : (totalBot - bentCount);

    const topDia = bent ? bent.topDia : Math.max(d.flexLeft.dia, d.flexRight.dia);
    const netTop = bent ? bent.finalTopBars : Math.max(2, Math.max(d.flexLeft.bars, d.flexRight.bars) - bentCount);

    const actualBotDia = bent ? bent.bottomDia : d.flexMid.dia;
    const actualTopDia = bent ? bent.topDia : topDia;

    const uniqueIds = [...new Set(memberIds)].sort((a, b) => {
      const na = parseFloat(a.replace(/[^0-9.]/g, ''));
      const nb = parseFloat(b.replace(/[^0-9.]/g, ''));
      return isNaN(na) || isNaN(nb) ? a.localeCompare(b) : na - nb;
    });

    // دمج أسماء الأجزاء المجزأة كـ جسر موحد (مثلاً 165-1، 165-2 تصبح 165)
    const canonToParts = new Map<string, string[]>();
    for (const id of uniqueIds) {
      const canon = getCanonicalBeamId(id);
      if (!canonToParts.has(canon)) canonToParts.set(canon, []);
      canonToParts.get(canon)!.push(id);
    }

    const uniqueNames: string[] = [];
    for (const [canon, parts] of canonToParts.entries()) {
      let nameToUse = '';
      for (const pId of parts) {
        const bObj = beams.find(x => x.id === pId);
        if (bObj && bObj.name) {
          nameToUse = bObj.name.replace(/-\d+$/, '');
          break;
        }
      }
      if (!nameToUse) {
        const bObjFirst = beams.find(x => x.id === parts[0]);
        if (bObjFirst && bObjFirst.name) {
          nameToUse = bObjFirst.name.replace(/-\d+$/, '');
        } else {
          nameToUse = canon;
        }
      }
      uniqueNames.push(nameToUse);
    }

    rows += `<tr>
      <td style="background:#f0f8ff; font-weight:bold; color:#1a3a5c; text-align:center; padding:3px;">${groupLabel}</td>
      <td style="font-size:6.5px; color:#444; word-break:break-all;">${uniqueNames.join(', ')}</td>
      <td>${b_dim ?? ''}</td>
      <td>${h_dim ?? ''}</td>
      <td>${spanText}</td>
      <td>${fmtRebar(straightBot, actualBotDia)}</td>
      <td>${bentCount > 0 ? fmtRebar(bentCount, actualBotDia) : '—'}</td>
      <td>${netTop > 0 ? fmtRebar(netTop, actualTopDia) : '—'}</td>
      <td style="font-size:7px; white-space:nowrap;">${d.shear.stirrups}</td>
    </tr>`;
  }

  // ───สร้าง SVG Typical cross sections สำหรับทุกกลุ่มของ الجسور ───
  let beamSectionsSvg = '';
  const groupEntries = Array.from(groups.entries());
  const bSecW = 115;
  const bSecH = 120;
  const bColsPerRow = 2;
  let bSecIdx = 0;

  for (const [groupLabel, { designs, memberIds }] of groupEntries) {
    const d = designs[0];
    let b_dim = 300;
    let h_dim = 500;
    for (const design of designs) {
      let beam = beams.find(b => b.id === design.beamId);
      if (!beam && (design as any).mergedCarrierIds) {
        const parts = ((design as any).mergedCarrierIds as string[])
          .map(id => beams.find(b => b.id === id)).filter(Boolean) as Beam[];
        if (parts.length > 0) {
          const largest = parts.reduce((best, b) => b.b * b.h >= best.b * best.h ? b : best, parts[0]);
          b_dim = largest.b; h_dim = largest.h;
        }
      } else if (beam) {
        b_dim = beam.b; h_dim = beam.h;
      }
    }

    let bent: any = null;
    if (bentUpResults) {
      for (const id of memberIds) {
        const canonId = getCanonicalBeamId(id);
        for (const fr of bentUpResults) {
          if (!fr) continue;
          const bResult = fr.beams?.find((bb: any) => bb.beamId === id || bb.beamId === canonId);
          if (bResult) {
            bent = bResult;
            break;
          }
        }
        if (bent) break;
      }
    }

    const totalBot = d.flexMid.bars;
    const isShort = d.span <= 2.0;
    const hasBent = !isShort && totalBot >= 3;

    const bentCount = bent ? bent.bentUp.bentBarsCount : (hasBent ? Math.floor(totalBot / 2) : 0);
    const straightBot = bent ? bent.bentUp.remainingBottomBars : (totalBot - bentCount);

    const topDia = bent ? bent.topDia : Math.max(d.flexLeft.dia, d.flexRight.dia);
    const netTop = bent ? bent.finalTopBars : Math.max(2, Math.max(d.flexLeft.bars, d.flexRight.bars) - bentCount);
    const actualBotDia = bent ? bent.bottomDia : d.flexMid.dia;
    const actualTopDia = bent ? bent.topDia : topDia;

    const row = Math.floor(bSecIdx / bColsPerRow);
    const col = bSecIdx % bColsPerRow;
    const sx = col * bSecW;
    const sy = row * (bSecH + 15);

    const title = `${groupLabel} (MID-SPAN)`;
    beamSectionsSvg += _svgCrossSection(
      sx, sy, bSecW, bSecH,
      b_dim, h_dim, 40, 10,
      netTop, actualTopDia, totalBot, actualBotDia,
      title, bentCount, actualBotDia, false
    );
    bSecIdx++;
  }

  const beamSecSvgH = Math.ceil(bSecIdx / bColsPerRow) * (bSecH + 15);

  return `
  <div style="font-weight:bold; font-size:11px; margin-bottom:4px; font-family:Arial;">BEAM SCHEDULE / جدول الجسور</div>
  <table style="width:100%; border-collapse:collapse; font-size:8px; font-family:'Segoe UI',Arial,Tahoma,sans-serif;">
    <thead>
      <tr>
        <th rowspan="2" style="border:1px solid #000; background:#1a3a5c; color:#fff; padding:3px;">رمز</th>
        <th rowspan="2" style="border:1px solid #000; background:#1a3a5c; color:#fff; padding:3px;">الأعضاء</th>
        <th rowspan="2" style="border:1px solid #000; background:#1a3a5c; color:#fff; padding:3px;">B</th>
        <th rowspan="2" style="border:1px solid #000; background:#1a3a5c; color:#fff; padding:3px;">H</th>
        <th rowspan="2" style="border:1px solid #000; background:#1a3a5c; color:#fff; padding:3px;">L (m)</th>
        <th colspan="2" style="border:1px solid #000; background:#1a3a5c; color:#fff; padding:3px;">سفلي</th>
        <th rowspan="2" style="border:1px solid #000; background:#1a3a5c; color:#fff; padding:3px;">علوي صافي*</th>
        <th rowspan="2" style="border:1px solid #000; background:#1a3a5c; color:#fff; padding:3px;">الكانات</th>
      </tr>
      <tr>
        <th style="border:1px solid #000; background:#2a4a6c; color:#fff; padding:2px; font-size:7px;">مستقيم</th>
        <th style="border:1px solid #000; background:#2a4a6c; color:#fff; padding:2px; font-size:7px;">مكسح</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="font-size:7px; color:#555; margin-top:3px;">* علوي صافي = الحديد العلوي المطلوب للركيزة بعد خصم مساهمة حديد التكسيح المكسح عند الركائز</div>
  <div style="font-size:7px; color:#1a3a5c; margin-top:2px;">رمز: مجموعة جسور ذات تسليح متطابق — الأعضاء: أرقام الجسور في المجموعة</div>`;
}

function htmlColumnScheduleTable(colDesigns: ColDesignData[]): string {
  const groupLabels = buildColGroupLabels(colDesigns);

  // ── تجميع حسب رمز المجموعة ──
  const groups = new Map<string, ColDesignData[]>();
  for (const c of colDesigns) {
    const label = groupLabels.get(c.id) ?? c.id;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(c);
  }

  let rows = '';
  for (const [groupLabel, cols] of groups) {
    const c = cols[0]; // ممثل المجموعة
    const memberIds = cols.map(col => col.id).sort((a, b) => {
      const na = parseFloat(a.replace(/[^0-9.]/g, ''));
      const nb = parseFloat(b.replace(/[^0-9.]/g, ''));
      return isNaN(na) || isNaN(nb) ? a.localeCompare(b) : na - nb;
    });

    rows += `<tr>
      <td style="background:#fff8f0; font-weight:bold; color:#5c1a00; text-align:center; padding:3px;">${groupLabel}</td>
      <td style="font-size:6.5px; color:#444; word-break:break-all;">${memberIds.join(', ')}</td>
      <td>${c.b}</td>
      <td>${c.h}</td>
      <td>${fmtRebar(c.design.bars, c.design.dia)}</td>
      <td>${c.design.stirrups}</td>
    </tr>`;
  }

  return `
  <div style="font-weight:bold; font-size:11px; margin-bottom:4px; font-family:Arial;">COLUMN SCHEDULE / جدول الأعمدة</div>
  <table style="width:100%; border-collapse:collapse; font-size:9px; font-family:'Segoe UI',Arial,Tahoma,sans-serif;">
    <thead>
      <tr>
        <th style="border:1px solid #000; background:#000; color:#fff; padding:3px;">رمز</th>
        <th style="border:1px solid #000; background:#000; color:#fff; padding:3px;">الأعمدة</th>
        <th style="border:1px solid #000; background:#000; color:#fff; padding:3px;">B mm</th>
        <th style="border:1px solid #000; background:#000; color:#fff; padding:3px;">H mm</th>
        <th style="border:1px solid #000; background:#000; color:#fff; padding:3px;">التسليح</th>
        <th style="border:1px solid #000; background:#000; color:#fff; padding:3px;">الكانات</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="font-size:7px; color:#5c1a00; margin-top:2px;">رمز: مجموعة أعمدة ذات تسليح متطابق — الأعمدة: أرقام الأعمدة في المجموعة</div>`;
}

/** تحويل مساحة As (mm²/m) إلى تنسيق عدد الأسياخ للمتر مثل 5Φ10/m — الحد الأدنى 5 أسياخ/م */
function fmtAs(As: number, dia: number): string {
  const abar = Math.PI / 4 * dia * dia;
  const spacingRaw = abar / Math.max(As, 1) * 1000;
  const spacing = Math.max(100, Math.min(200, Math.round(spacingRaw / 25) * 25));
  const nPerM = Math.max(5, Math.round(1000 / spacing));
  return `${nPerM}Φ${dia}/m`;
}

/** حساب التسليح السالب الصافي — يُخصم تسليح العزم الموجب من البحرتين المجاورتين */
function computeNetNegAs(
  spans: SpanResult[],
  AsMin: number,
): Array<{ supportIdx: number; As_neg_req: number; deduction: number; As_neg_net: number }> {
  const supports: Array<{ supportIdx: number; As_neg_req: number; deduction: number; As_neg_net: number }> = [];
  for (let i = 0; i < spans.length - 1; i++) {
    const left = spans[i];
    const right = spans[i + 1];
    const As_neg_req = Math.max(left.As_neg_right, right.As_neg_left);
    // الحديد الموجب من البحرة اليسرى يمتد L/5 نحو الركيزة (= As_pos_left)
    // والحديد الموجب من البحرة اليمنى يمتد L/5 نحو الركيزة (= As_pos_right)
    const deduction = left.As_pos + right.As_pos;
    const As_neg_net = Math.max(As_neg_req - deduction, AsMin);
    supports.push({ supportIdx: i + 1, As_neg_req, deduction, As_neg_net });
  }
  return supports;
}

/** جدول تسليح البلاطات بطريقة الشرائح ACI 318-19 §6.5 */
function htmlSlabStripTable(results: ContinuousSlabResult[], slabProps: SlabProps, mat: MatProps): string {
  if (results.length === 0) {
    return '<p style="font-size:9px; color:#666; font-family:Arial;">لا توجد شرائح مستمرة (يلزم بلاطتان متجاورتان أو أكثر)</p>';
  }

  const shrinkageRatio = mat.fy >= 420 ? 0.0018 : 0.0020;
  const AsMin = shrinkageRatio * 1000 * slabProps.thickness;
  const dia = slabProps.phiSlab || 12;
  const xResults = results.filter(r => r.direction === 'X');
  const yResults = results.filter(r => r.direction === 'Y');

  let html = `
  <div style="font-weight:bold; font-size:11px; margin-bottom:4px; font-family:Arial; border-bottom:2px solid #004000; padding-bottom:3px;">
    SLAB STRIP SCHEDULE / جدول تسليح شرائح البلاطات (ACI 318-19 §6.5)
  </div>
  <div style="font-size:7px; color:#555; margin-bottom:6px; font-family:Arial; direction:rtl;">
    Wu = 1.2DL + 1.6LL — h=${slabProps.thickness}mm — تغطية=${slabProps.cover}mm — Φ${dia}mm — AsMin=${AsMin.toFixed(0)} mm²/m
  </div>`;

  for (const [dir, strips] of [['X', xResults], ['Y', yResults]] as [string, ContinuousSlabResult[]][]) {
    if (strips.length === 0) continue;
    const dirLabel = dir === 'X' ? 'X (شرائح أفقية — حديد يسير في اتجاه X)' : 'Y (شرائح رأسية — حديد يسير في اتجاه Y)';
    html += `<div style="font-weight:bold; font-size:9px; color:#004000; background:#f0fff0; padding:2px 4px; margin-top:6px; margin-bottom:3px; font-family:Arial;">
      اتجاه ${dirLabel}
    </div>`;

    for (const strip of strips) {
      const netNegs = computeNetNegAs(strip.spans, AsMin);

      // بناء صفوف الجدول: كل بحرة + ركيزة بعدها
      let headerCells = '';
      let valueCells = '';
      let negCells = '';
      for (let i = 0; i < strip.spans.length; i++) {
        const sp = strip.spans[i];
        headerCells += `<th style="border:1px solid #aaa; background:#e8f5e9; padding:2px; font-size:7px; min-width:55px;">بحرة: ${sp.slabId}<br>L=${sp.spanLength.toFixed(2)}م</th>`;
        valueCells += `<td style="border:1px solid #ccc; padding:2px; font-size:7px; text-align:center;">
          <div style="color:#004000; font-weight:bold;">As+=${sp.As_pos.toFixed(0)}</div>
          <div style="color:#006000;">${fmtAs(sp.As_pos, dia)}</div>
          <div style="color:#888; font-size:6px;">L/5=${(sp.spanLength/5).toFixed(2)}م↔</div>
        </td>`;
        // ركيزة بعد هذه البحرة
        if (i < netNegs.length) {
          const sup = netNegs[i];
          const isCovered = sup.As_neg_req <= sup.deduction;
          headerCells += `<th style="border:1px solid #aaa; background:${isCovered ? '#e8f5e9' : '#ffeee8'}; padding:2px; font-size:7px; min-width:45px;">ركيزة ${sup.supportIdx}</th>`;
          if (isCovered) {
            valueCells += `<td style="border:1px solid #ccc; padding:2px; font-size:7px; text-align:center; background:#f0fff0;">
              <div style="color:#007000; font-weight:bold;">مغطى ✓</div>
              <div style="color:#888; font-size:6px;">As−=${sup.As_neg_req.toFixed(0)}</div>
              <div style="color:#888; font-size:6px;">امتداد L/5 يغطي</div>
            </td>`;
          } else {
            valueCells += `<td style="border:1px solid #ccc; padding:2px; font-size:7px; text-align:center; background:#fff5f0;">
              <div style="color:#800000;">As−=${sup.As_neg_req.toFixed(0)}</div>
              <div style="color:#999; font-size:6px;">−${sup.deduction.toFixed(0)}</div>
              <div style="color:#c00000; font-weight:bold;">إضافي=${sup.As_neg_net.toFixed(0)}</div>
              <div style="color:#a00000;">${fmtAs(sup.As_neg_net, dia)}</div>
            </td>`;
          }
        }
      }

      html += `<table style="width:100%; border-collapse:collapse; margin-bottom:4px; font-family:'Segoe UI',Arial,sans-serif;">
        <thead>
          <tr>
            <th style="border:1px solid #666; background:#004000; color:#fff; padding:2px 4px; font-size:7.5px; text-align:right;" colspan="1">
              ${strip.stripId} — Wu=${strip.Wu.toFixed(1)} kN/m²
            </th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border:1px solid #ccc; padding:2px; font-size:7px; background:#f9f9f9; font-weight:bold; color:#444;">As (mm²/m)<br>Φmm@mm</td>
            ${valueCells}
          </tr>
        </tbody>
      </table>`;
    }
  }

  html += `<div style="font-size:6.5px; color:#555; margin-top:6px; font-family:Arial; direction:rtl; border-top:1px solid #ccc; padding-top:3px;">
    • As+: حديد العزم الموجب (منتصف البحرة) — يمتد مسافة L/5 من البحرة داخل البحرة المجاورة عند كل طرف<br>
    • As− صافي: الحديد المطلوب للعزم السالب بعد خصم ما يمتد من As+ من البحرتين اليمنى واليسرى<br>
    • الحد الأدنى AsMin = ${AsMin.toFixed(0)} mm²/m (ρ=${shrinkageRatio}) وفق ACI 318-19 §7.6.1<br>
    • الوزن الذاتي مُدرج: γ×h = ${mat.gamma}×${(slabProps.thickness/1000).toFixed(3)} = ${(mat.gamma*slabProps.thickness/1000).toFixed(2)} kN/m²
  </div>`;

  return html;
}

function htmlSlabScheduleTable(slabDesigns: SlabDesignData[], slabs: Slab[]): string {
  const slabById = new Map(slabs.map(s => [s.id, s]));
  let rows = '';
  for (const s of slabDesigns) {
    const longDir = s.design.longDir;
    const shortDir = s.design.shortDir;

    const slab = slabById.get(s.id);
    let xIsShort = true;
    if (slab) {
      const dx = Math.abs(slab.x2 - slab.x1);
      const dy = Math.abs(slab.y2 - slab.y1);
      xIsShort = dx <= dy;
    }

    const xDir = xIsShort ? shortDir : longDir;
    const yDir = xIsShort ? longDir : shortDir;

    const formattedX = `${xDir.bars}Φ${xDir.dia}/m`;
    const formattedY = `${yDir.bars}Φ${yDir.dia}/m`;

    rows += `<tr>
      <td style="background:#f5fff5; font-weight:bold; color:#004000; text-align:center; border:1px solid #ccc; padding:4px;">${s.id}</td>
      <td style="text-align:center; border:1px solid #ccc; padding:4px;">${s.design.hUsed} mm</td>
      <td style="text-align:center; color:#1a3a5c; border:1px solid #ccc; padding:4px; font-weight:bold;">${formattedX}</td>
      <td style="text-align:center; color:#7b1a00; border:1px solid #ccc; padding:4px; font-weight:bold;">${formattedY}</td>
    </tr>`;
  }

  return `
  <div style="font-weight:bold; font-size:11px; margin-bottom:4px; font-family:Arial;">SLAB SCHEDULE / جدول البلاطات</div>
  <table style="width:100%; border-collapse:collapse; font-size:9px; font-family:'Segoe UI',Arial,Tahoma,sans-serif; border:1px solid #000;">
    <thead>
      <tr>
        <th style="border:1px solid #000; background:#004000; color:#fff; padding:5px 4px;">اسم البلاطة</th>
        <th style="border:1px solid #000; background:#004000; color:#fff; padding:5px 4px;">سماكة البلاطة</th>
        <th style="border:1px solid #000; background:#1a3a5c; color:#fff; padding:5px 4px;">التسليح في الاتجاه x</th>
        <th style="border:1px solid #000; background:#7b1a00; color:#fff; padding:5px 4px;">التسليح في الاتجاه y</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="font-size:7.5px; color:#1a3a5c; margin-top:3px;">
    القيم: تسليح المتر الطولي للبلاطة (مثال: 5Φ10/m)
  </div>`;
}

// ─── Column cross-section SVG ───

function svgColumnCrossSection(cd: ColDesignData, x: number, y: number, w: number, h: number, groupLabel: string, memberIds: string[]): string {
  const scl = Math.min((w - 20) / cd.b, (h - 40) / cd.h);
  const rectW = cd.b * scl;
  const rectH = cd.h * scl;
  const rx = x + (w - rectW) / 2;
  const ry = y + 32;
  
  let svg = '';
  // Outer rectangle (concrete boundary)
  svg += `<rect x="${rx}" y="${ry}" width="${rectW}" height="${rectH}" fill="#fafafa" stroke="black" stroke-width="1.2" />`;
  
  // Stirrup outline
  const cover = 40 * scl;
  svg += `<rect x="${rx + cover}" y="${ry + cover}" width="${rectW - 2 * cover}" height="${rectH - 2 * cover}" fill="none" stroke="#222" stroke-width="0.8" />`;
  
  // Rebar dots
  const nBars = cd.design.bars;
  const barR = Math.max(cd.design.dia * scl / 2, 2.2);
  const positions: [number, number][] = [];
  
  const nBarsToUse = Math.max(4, nBars % 2 === 0 ? nBars : nBars + 1);
  let bestNx = 2;
  let bestNy = Math.round(nBarsToUse / 2) + 2 - 2;
  if (bestNy < 2) bestNy = 2;

  let bestDiff = Infinity;
  const sum = Math.round(nBarsToUse / 2) + 2;
  for (let nx = 2; nx <= sum - 2; nx++) {
    const ny = sum - nx;
    const ratio = (nx - 1) / Math.max(1, ny - 1);
    const diff = Math.abs(ratio - (cd.b / cd.h));
    if (diff < bestDiff) {
      bestDiff = diff;
      bestNx = nx;
      bestNy = ny;
    }
  }

  const innerX1 = rx + cover + barR;
  const innerX2 = rx + rectW - cover - barR;
  const innerY1 = ry + cover + barR;
  const innerY2 = ry + rectH - cover - barR;

  // Top Side
  for (let i = 0; i < bestNx; i++) {
    const t = bestNx > 1 ? i / (bestNx - 1) : 0.5;
    positions.push([innerX1 + t * (innerX2 - innerX1), innerY1]);
  }
  // Bottom Side
  for (let i = 0; i < bestNx; i++) {
    const t = bestNx > 1 ? i / (bestNx - 1) : 0.5;
    positions.push([innerX1 + t * (innerX2 - innerX1), innerY2]);
  }
  // Left Side (between corners)
  for (let j = 1; j < bestNy - 1; j++) {
    const t = bestNy > 1 ? j / (bestNy - 1) : 0.5;
    positions.push([innerX1, innerY1 + t * (innerY2 - innerY1)]);
  }
  // Right Side (between corners)
  for (let j = 1; j < bestNy - 1; j++) {
    const t = bestNy > 1 ? j / (bestNy - 1) : 0.5;
    positions.push([innerX2, innerY1 + t * (innerY2 - innerY1)]);
  }
  
  for (const [px, py] of positions.slice(0, nBars)) {
    svg += `<circle cx="${px}" cy="${py}" r="${barR}" fill="black" />`;
  }
  
  // Display Group Label (ع-1) and member names
  const cleanMemberText = memberIds.join(', ');
  svg += `<text x="${x + w/2}" y="${y + 11}" text-anchor="middle" font-size="7.5" font-weight="bold" font-family="'Segoe UI', Arial, sans-serif" fill="#5c1a00">${groupLabel}</text>`;
  svg += `<text x="${x + w/2}" y="${y + 20}" text-anchor="middle" font-size="5.5" font-family="'Segoe UI', Arial, sans-serif" fill="#444">الأعضاء: ${cleanMemberText}</text>`;
  svg += `<text x="${x + w/2}" y="${y + 28}" text-anchor="middle" font-size="5.5" font-family="'Segoe UI', Arial, sans-serif" fill="#111" font-weight="bold">${cd.b}×${cd.h} mm | ${cd.design.bars}Φ${cd.design.dia}</text>`;
  svg += `<text x="${x + w/2}" y="${ry + rectH + 10}" text-anchor="middle" font-size="5.5" font-weight="bold" font-family="'Segoe UI', Arial, sans-serif" fill="#0000a0">كانات: ${cd.design.stirrups}</text>`;
  
  return svg;
}

// ─── Main sheet generator ───

function generateSheetHTML(
  sheetContent: string,
  svgDrawingZone: string,
  svgDrawW: number,
  svgDrawH: number,
  tableContent: string,
  titleBlockConfig: Partial<TitleBlockConfig>,
  extraSvgBottom?: string,
): string {
  // Arabic structural drawing convention:
  // Plan (مسقط) occupies left 62% of sheet; rebar schedule table sits on the RIGHT 36% — same sheet, landscape.
  // If there is no table, the plan expands to full width.
  const sheetW = _SHEET_W;
  const sheetH = _SHEET_H;
  const titleBlockH = 135 + 36 + 10;
  const contentH = sheetH - 45 - titleBlockH;
  const innerW = sheetW - 90;   // full content zone width (between borders)

  const hasTable = tableContent && tableContent.trim().length > 0;

  // Widths: plan 72%, divider 2%, table 26%  (of innerW)
  const planW  = hasTable ? Math.round(innerW * 0.72) : innerW;
  const tableW = hasTable ? Math.round(innerW * 0.26) : 0;
  const tableLeft = 45 + planW + Math.round(innerW * 0.02);  // left position of table zone

  // Vertical separator between plan and table
  const separatorX = 45 + planW + Math.round(innerW * 0.01);
  const separator = hasTable
    ? `<div style="position:absolute; top:45px; left:${separatorX}px; width:1px; height:${contentH}px; background:#ccc;"></div>`
    : '';

  // Right-side table label (rotated — appears as vertical heading on separator)
  const tableLabel = hasTable
    ? `<div style="position:absolute; top:${45 + contentH / 2 - 60}px; left:${separatorX + 3}px; width:12px; height:120px; display:flex; align-items:center; justify-content:center;">
         <span style="writing-mode:vertical-lr; font-size:7px; color:#888; font-family:Arial; letter-spacing:1px; transform:rotate(180deg);">جدول التسليح</span>
       </div>`
    : '';

  const combinedPage = `
  <div class="sheet-page" style="position:relative; width:${sheetW}px; height:${sheetH}px; background:white; overflow:hidden; page-break-after:always; font-family:'Segoe UI',Arial,Tahoma,sans-serif;">
    ${htmlSheetBorder()}
    <!-- Plan zone (right-to-left: plan is the main content on the left) -->
    <div style="position:absolute; top:45px; left:45px; width:${planW}px; height:${contentH}px; overflow:hidden; border:0.5px solid #ccc;">
      <svg viewBox="0 0 ${svgDrawW} ${svgDrawH}" width="${planW}" height="${contentH}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        ${svgDrawingZone}
      </svg>
    </div>
    ${separator}
    ${tableLabel}
    ${hasTable ? `
    <!-- Schedule table zone (right side — Arabic drawing standard) -->
    <div style="position:absolute; top:45px; left:${tableLeft}px; width:${tableW}px; height:${contentH}px; overflow:hidden; direction:rtl; padding:5px 4px;">
      ${tableContent}
    </div>` : ''}
    ${extraSvgBottom || ''}
    ${htmlTitleBlock(titleBlockConfig)}
  </div>`;

  return combinedPage;
}

// ─── Beam Elevation Sheet (HTML/SVG) ───

// ── Helpers ──

function _isEndSupport(beam: Beam, side: 'left' | 'right', allBeams: Beam[]): boolean {
  const colId = side === 'left' ? (beam as any).fromCol : (beam as any).toCol;
  const others = allBeams.filter(b => b.id !== beam.id && ((b as any).fromCol === colId || (b as any).toCol === colId));
  return !others.some(b => (b as any).direction === (beam as any).direction);
}

function _svgDimH(x1: number, x2: number, y: number, text: string, color = '#3c3c3c', fsz = 5.5): string {
  if (Math.abs(x2 - x1) < 1) return '';
  const mid = (x1 + x2) / 2;
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="0.4"/>
    <line x1="${x1}" y1="${y - 2.5}" x2="${x1}" y2="${y + 2.5}" stroke="${color}" stroke-width="0.4"/>
    <line x1="${x2}" y1="${y - 2.5}" x2="${x2}" y2="${y + 2.5}" stroke="${color}" stroke-width="0.4"/>
    <text x="${mid}" y="${y - 2}" text-anchor="middle" font-size="${fsz}" fill="${color}" font-family="Arial">${text}</text>`;
}

function _svgDimV(x: number, y1: number, y2: number, text: string, color = '#3c3c3c', fsz = 5.5): string {
  if (Math.abs(y2 - y1) < 1) return '';
  const mid = (y1 + y2) / 2;
  return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${color}" stroke-width="0.4"/>
    <line x1="${x - 2.5}" y1="${y1}" x2="${x + 2.5}" y2="${y1}" stroke="${color}" stroke-width="0.4"/>
    <line x1="${x - 2.5}" y1="${y2}" x2="${x + 2.5}" y2="${y2}" stroke="${color}" stroke-width="0.4"/>
    <text x="${x + 3}" y="${mid + 2}" font-size="${fsz}" fill="${color}" font-family="Arial">${text}</text>`;
}

function _svgDash(x1: number, y1: number, x2: number, y2: number, color = '#999', sw = 0.5): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${sw}" stroke-dasharray="3,2"/>`;
}

function _svgCrossSection(
  x: number, y: number, w: number, h: number,
  bMm: number, hMm: number, coverMm: number, stirDiaMm: number,
  nTop: number, topDia: number, nBot: number, botDia: number, title: string,
  nBent = 0, bentDia = 12, isSupport = false
): string {
  const isMini = h < 50;
  
  // Choose scale reduction to leave space for text labels if not mini
  const scl = Math.min((w - (isMini ? 4 : 20)) / bMm, (h - (isMini ? 16 : 44)) / hMm);
  const sW = bMm * scl; const sH = hMm * scl;
  const sx = x + (w - sW) / 2;
  const sy = y + (isMini ? 14 : 22);

  let s = `<rect x="${sx}" y="${sy}" width="${sW}" height="${sH}" fill="#f5f5f5" stroke="#333" stroke-width="0.8"/>`;
  const stC = coverMm * scl; const stD = stirDiaMm * scl;
  s += `<rect x="${sx + stC}" y="${sy + stC}" width="${sW - 2*stC}" height="${sH - 2*stC}" fill="none" stroke="#555" stroke-width="0.5"/>`;

  // Draw Top Rebar
  const topR = Math.max((topDia * scl) / 2, 1.2);
  let nTopLayer2 = 0;
  let nTopLayer1 = nTop;
  if (nTop > 1) {
    const b_avail = bMm - 2 * (coverMm + stirDiaMm);
    const min_spacing = Math.max(25, topDia);
    const maxInLayer = Math.floor((b_avail + min_spacing) / (topDia + min_spacing));
    if (nTop > maxInLayer) {
      nTopLayer2 = nTop - maxInLayer;
      nTopLayer1 = maxInLayer;
    }
  }

  if (nTopLayer1 > 0) {
    const tY1 = sy + stC + stD + topR;
    const tAv1 = sW - 2*stC - 2*stD - 2*topR;
    const tSp1 = nTopLayer1 > 1 ? tAv1 / (nTopLayer1 - 1) : 0;
    for (let i = 0; i < nTopLayer1; i++) {
      s += `<circle cx="${sx + stC + stD + topR + i * tSp1}" cy="${tY1}" r="${topR}" fill="#000000"/>`;
    }
  }
  if (nTopLayer2 > 0) {
    const min_spacing_top = 0;
    const tY2 = sy + stC + stD + topR + (min_spacing_top * scl) + 2 * topR;
    const tAv2 = sW - 2*stC - 2*stD - 2*topR;
    const tSp2 = nTopLayer2 > 1 ? tAv2 / (nTopLayer2 - 1) : 0;
    for (let i = 0; i < nTopLayer2; i++) {
      s += `<circle cx="${sx + stC + stD + topR + i * tSp2}" cy="${tY2}" r="${topR}" fill="#000000"/>`;
    }
  }

  // Draw Bottom Rebar
  const botR = Math.max((botDia * scl) / 2, 1.2);
  let nBotLayer2 = 0;
  let nBotLayer1 = nBot;
  if (nBot > 1) {
    const b_avail = bMm - 2 * (coverMm + stirDiaMm);
    const min_spacing = Math.max(25, botDia);
    const maxInLayer = Math.floor((b_avail + min_spacing) / (botDia + min_spacing));
    if (nBot > maxInLayer) {
      nBotLayer2 = nBot - maxInLayer;
      nBotLayer1 = maxInLayer;
    }
  }

  if (nBotLayer1 > 0) {
    const bY1 = sy + sH - stC - stD - botR;
    const bAv1 = sW - 2*stC - 2*stD - 2*botR;
    const bSp1 = nBotLayer1 > 1 ? bAv1 / (nBotLayer1 - 1) : 0;
    for (let i = 0; i < nBotLayer1; i++) {
      s += `<circle cx="${sx + stC + stD + botR + i * bSp1}" cy="${bY1}" r="${botR}" fill="#000000"/>`;
    }
  }
  if (nBotLayer2 > 0) {
    const min_spacing_bot = 0;
    const bY2 = sy + sH - stC - stD - botR - (min_spacing_bot * scl) - 2 * botR;
    const bAv2 = sW - 2*stC - 2*stD - 2*botR;
    const bSp2 = nBotLayer2 > 1 ? bAv2 / (nBotLayer2 - 1) : 0;
    for (let i = 0; i < nBotLayer2; i++) {
      s += `<circle cx="${sx + stC + stD + botR + i * bSp2}" cy="${bY2}" r="${botR}" fill="#000000"/>`;
    }
  }

  // Text title
  s += `<text x="${x + w/2}" y="${y + (isMini ? 9 : 10)}" text-anchor="middle" font-size="${isMini ? 5.5 : 7.5}" font-weight="bold" fill="#1a3a5c" font-family="'Segoe UI', Arial, sans-serif">${title}</text>`;

  if (!isMini) {
    // Top steel text label (ar/en)
    let topText = '';
    const topLayerSuffix = nTopLayer2 > 0 ? ' (طبقتين)' : '';
    if (isSupport) {
      if (nBent > 0) {
        topText = `علوي: ${nTop}Φ${topDia} (مستقيم + مكسح)${topLayerSuffix}`;
      } else {
        topText = `علوي: ${nTop}Φ${topDia} (مستقيم)${topLayerSuffix}`;
      }
    } else {
      topText = `علوي: ${nTop}Φ${topDia} (تعليق)${topLayerSuffix}`;
    }
    s += `<text x="${x + w/2}" y="${y + 19}" text-anchor="middle" font-size="6.5" font-weight="bold" fill="#222" font-family="'Segoe UI', Arial, sans-serif">${topText}</text>`;

    // Bottom steel text label (ar/en)
    let botText = '';
    const botLayerSuffix = nBotLayer2 > 0 ? ' (طبقتين)' : '';
    if (isSupport) {
      botText = `سفلي: ${nBot}Φ${botDia} (مستقيم)${botLayerSuffix}`;
    } else {
      if (nBent > 0) {
        botText = `سفلي: ${nBot}Φ${botDia} (مستقيم + مكسح)${botLayerSuffix}`;
      } else {
        botText = `سفلي: ${nBot}Φ${botDia} (مستقيم)${botLayerSuffix}`;
      }
    }
    s += `<text x="${x + w/2}" y="${sy + sH + 10}" text-anchor="middle" font-size="6.5" font-weight="bold" fill="#222" font-family="'Segoe UI', Arial, sans-serif">${botText}</text>`;

    // Dimensions Text label
    s += `<text x="${sx + sW/2}" y="${sy + sH + 19}" text-anchor="middle" font-size="5.5" fill="#333" font-family="'Segoe UI', Arial, sans-serif">${bMm}×${hMm} mm</text>`;
  } else {
    s += `<text x="${sx + sW/2}" y="${sy + sH + 8}" text-anchor="middle" font-size="4.5" fill="#666" font-family="Arial">${bMm}×${hMm} mm</text>`;
  }

  s += `<text x="${sx - 2}" y="${sy + sH/2 + 2}" text-anchor="end" font-size="4" fill="#999" font-family="Arial">c=${coverMm}</text>`;
  return s;
}

function _svgColFaceMarkers(lfx: number, rfx: number, topY: number, botY: number): string {
  return `<line x1="${lfx}" y1="${topY - 3}" x2="${lfx}" y2="${botY + 3}" stroke="#777" stroke-width="0.4" stroke-dasharray="2,2"/>
    <line x1="${rfx}" y1="${topY - 3}" x2="${rfx}" y2="${botY + 3}" stroke="#777" stroke-width="0.4" stroke-dasharray="2,2"/>
    <text x="${lfx}" y="${topY - 4}" text-anchor="middle" font-size="4" fill="#777" font-family="Arial">CF</text>
    <text x="${rfx}" y="${topY - 4}" text-anchor="middle" font-size="4" fill="#777" font-family="Arial">CF</text>`;
}

function svgBeamElevationDetailed(
  beam: Beam, design: BeamDesignData,
  x: number, y: number, drawW: number, drawH: number,
  devLengths: DevelopmentLengths[], allBeams: Beam[],
): string {
  const spanMm  = beam.length * 1000;
  const bH      = beam.h;
  const bB      = beam.b;
  const coverMm = 40;
  const stirDMm = 10;
  const topDia  = Math.max(design.flexLeft.dia, design.flexRight.dia);
  const botDia  = design.flexMid.dia;
  const uTop    = Math.max(design.flexLeft.bars, design.flexRight.bars);
  const d_eff   = bH - coverMm - stirDMm - botDia / 2;

  const dlTop = devLengths.find(d => d.dia === topDia) ?? { ld_straight: Math.round(0.6 * topDia * 420 / Math.sqrt(28)), ldh_standard_hook: Math.max(Math.round(0.24 * topDia * 420 / Math.sqrt(28)), 8 * topDia, 150), dia: topDia } as DevelopmentLengths;
  const dlBot = devLengths.find(d => d.dia === botDia) ?? { ld_straight: Math.round(0.6 * botDia * 420 / Math.sqrt(28)), ldh_standard_hook: Math.max(Math.round(0.24 * botDia * 420 / Math.sqrt(28)), 8 * botDia, 150), dia: botDia } as DevelopmentLengths;

  const leftIsEnd  = _isEndSupport(beam, 'left', allBeams);
  const rightIsEnd = _isEndSupport(beam, 'right', allBeams);
  const adjExtMm   = Math.max(dlTop.ld_straight, spanMm / 5);
  const leftExtMm  = leftIsEnd  ? 0 : adjExtMm;
  const rightExtMm = rightIsEnd ? 0 : adjExtMm;
  const hookBot    = Math.max(12 * botDia, 150);
  const hookTop    = Math.max(12 * topDia, 150);
  const colWMm     = 400;

  const totBot   = design.flexMid.bars;
  const hasBent  = totBot >= 3;
  const nBent    = hasBent ? Math.floor(totBot / 2) : 0;
  const nStraight = totBot - nBent;

  // ── Layout ──
  const secPanelW = 88;
  const mainW  = drawW - secPanelW - 6;
  const elevH  = drawH * 0.50;
  const detH   = drawH * 0.45;
  const detY   = y + elevH + 8;

  // ── Scale ──
  const leftRes  = Math.max(leftExtMm + colWMm, colWMm * 1.1);
  const rightRes = Math.max(rightExtMm + colWMm, colWMm * 1.1);
  const totMm    = leftRes + spanMm + rightRes;
  const mX = 4;
  const avW = mainW - mX * 2;
  const avH = elevH - 30;
  const scl   = Math.min(avW / totMm, avH / (bH * 2.2), 0.16);
  const beamW = spanMm * scl;
  const beamH = bH * scl;
  const colW  = colWMm * scl;
  const ox = x + mX + (avW - totMm * scl) / 2 + leftRes * scl;
  const oy = y + 18 + (avH - beamH) / 2;
  const cov    = coverMm * scl;
  const stirD  = stirDMm  * scl;
  const topBarY = oy + cov + stirD + (topDia * scl) / 2;
  const botBarY = oy + beamH - cov - stirD - (botDia * scl) / 2;

  let s = '';

  // ── Header ──
  s += `<text x="${x}" y="${y + 7}" font-size="7" font-weight="bold" fill="#000" font-family="Arial">BEAM ${beam.id}  ·  b=${bB} × h=${bH} mm  ·  L=${beam.length.toFixed(2)} m</text>`;
  s += `<text x="${x}" y="${y + 14}" font-size="5" fill="#666" font-family="Arial">f'c=28 MPa   fy=420 MPa   cover=${coverMm} mm   d_eff=${Math.round(d_eff)} mm</text>`;

  // ── Column dashed outlines ──
  s += _svgDash(ox - colW, oy, ox, oy); s += _svgDash(ox - colW, oy + beamH, ox, oy + beamH); s += _svgDash(ox - colW, oy, ox - colW, oy + beamH);
  s += _svgDash(ox + beamW, oy, ox + beamW + colW, oy); s += _svgDash(ox + beamW, oy + beamH, ox + beamW + colW, oy + beamH); s += _svgDash(ox + beamW + colW, oy, ox + beamW + colW, oy + beamH);

  // ── Column centrelines ──
  s += _svgDash(ox - colW / 2, oy - 8, ox - colW / 2, oy + beamH + 6, '#bbb', 0.4);
  s += _svgDash(ox + beamW + colW / 2, oy - 8, ox + beamW + colW / 2, oy + beamH + 6, '#bbb', 0.4);

  // ── Adjacent beam stubs ──
  if (!leftIsEnd) {
    const ap = leftExtMm * scl;
    s += _svgDash(ox - colW - ap, oy, ox - colW, oy, '#ccc'); s += _svgDash(ox - colW - ap, oy + beamH, ox - colW, oy + beamH, '#ccc'); s += _svgDash(ox - colW - ap, oy, ox - colW - ap, oy + beamH, '#ccc');
  }
  if (!rightIsEnd) {
    const ap = rightExtMm * scl;
    s += _svgDash(ox + beamW + colW, oy, ox + beamW + colW + ap, oy, '#ccc'); s += _svgDash(ox + beamW + colW, oy + beamH, ox + beamW + colW + ap, oy + beamH, '#ccc'); s += _svgDash(ox + beamW + colW + ap, oy, ox + beamW + colW + ap, oy + beamH, '#ccc');
  }

  // ── Beam outline ──
  s += `<rect x="${ox}" y="${oy}" width="${beamW}" height="${beamH}" fill="#f0f8f0" stroke="#000" stroke-width="1.2"/>`;

  // ── Unified top bar ──
  const tStartX = leftIsEnd  ? ox - Math.min(hookTop * 0.5 * scl, colW * 0.7) : ox - colW - leftExtMm * scl;
  const tEndX   = rightIsEnd ? ox + beamW + Math.min(hookTop * 0.5 * scl, colW * 0.7) : ox + beamW + colW + rightExtMm * scl;
  if (leftIsEnd)  s += `<line x1="${tStartX}" y1="${topBarY - hookTop * scl * 0.3}" x2="${tStartX + hookTop * scl * 0.15}" y2="${topBarY}" stroke="#8b0000" stroke-width="1.2"/>`;
  s += `<line x1="${leftIsEnd ? tStartX + hookTop * scl * 0.15 : tStartX}" y1="${topBarY}" x2="${rightIsEnd ? tEndX - hookTop * scl * 0.15 : tEndX}" y2="${topBarY}" stroke="#8b0000" stroke-width="1.2"/>`;
  if (rightIsEnd) s += `<line x1="${tEndX - hookTop * scl * 0.15}" y1="${topBarY}" x2="${tEndX}" y2="${topBarY - hookTop * scl * 0.3}" stroke="#8b0000" stroke-width="1.2"/>`;

  // ── Bottom bar ──
  const bStartX = leftIsEnd  ? ox - hookBot * scl * 0.5 : ox - colW * 0.65;
  const bEndX   = rightIsEnd ? ox + beamW + hookBot * scl * 0.5 : ox + beamW + colW * 0.65;
  if (leftIsEnd)  s += `<line x1="${bStartX}" y1="${botBarY + hookBot * scl * 0.5}" x2="${bStartX + hookBot * scl * 0.2}" y2="${botBarY}" stroke="#1a56db" stroke-width="1.2"/>`;
  s += `<line x1="${leftIsEnd ? bStartX + hookBot * scl * 0.2 : bStartX}" y1="${botBarY}" x2="${rightIsEnd ? bEndX - hookBot * scl * 0.2 : bEndX}" y2="${botBarY}" stroke="#1a56db" stroke-width="1.2"/>`;
  if (rightIsEnd) s += `<line x1="${bEndX - hookBot * scl * 0.2}" y1="${botBarY}" x2="${bEndX}" y2="${botBarY + hookBot * scl * 0.5}" stroke="#1a56db" stroke-width="1.2"/>`;

  // ── Bent bars ──
  let bSeg1 = 0, bDiag = 0, bSeg3 = 0, bSeg5 = 0, bTotal = 0;
  if (hasBent && nBent > 0) {
    const bTY = topBarY + stirD * 0.3; const bBY = botBarY - stirD * 0.3;
    const rise = bBY - bTY; const riseMm = rise / scl; const horiz = riseMm; const diagMm = Math.sqrt(2) * riseMm;
    const dnSt = ox + spanMm * 0.22 * scl; const dnEnd = dnSt + horiz * scl;
    const upEnd = ox + spanMm * 0.78 * scl; const upSt = upEnd - horiz * scl;
    const bLSt = leftIsEnd  ? ox + 2 : ox - colW - leftExtMm * scl;
    const bREn = rightIsEnd ? ox + beamW - 2 : ox + beamW + colW + rightExtMm * scl;
    for (let bi = 0; bi < nBent; bi++) {
      const yo = bi * 2;
      s += `<polyline points="${bLSt},${bTY+yo} ${dnSt},${bTY+yo} ${dnEnd},${bBY+yo} ${upSt},${bBY+yo} ${upEnd},${bTY+yo} ${bREn},${bTY+yo}" fill="none" stroke="#dc6400" stroke-width="1"/>`;
    }
    const lExtB = leftIsEnd  ? 0 : colWMm * 0.5 + leftExtMm;
    const rExtB = rightIsEnd ? 0 : colWMm * 0.5 + rightExtMm;
    bSeg1 = spanMm * 0.22 + lExtB; bDiag = diagMm; bSeg3 = spanMm * (0.78 - 0.22) - 2 * horiz; bSeg5 = spanMm * (1 - 0.78) + rExtB;
    bTotal = bSeg1 + bDiag + bSeg3 + bDiag + bSeg5;
  }

  // ── Stirrups ──
  const stM = design.shear.stirrups.match(/(\d+)Φ(\d+)@(\d+)/);
  const stSp = stM ? parseInt(stM[3]) : 150; const stDv = stM ? parseInt(stM[2]) : 10;
  const z1Sp = Math.max(Math.floor(stSp * 0.6 / 25) * 25, 75);
  const z1L = d_eff * scl; const z1Px = z1Sp * scl; const z2Px = stSp * scl; const fstPx = 50 * scl;
  for (let sx = ox + fstPx; sx <= ox + z1L; sx += z1Px) s += `<line x1="${sx}" y1="${oy+1}" x2="${sx}" y2="${oy+beamH-1}" stroke="#0000b4" stroke-width="0.3"/>`;
  for (let sx = ox + beamW - fstPx; sx >= ox + beamW - z1L; sx -= z1Px) s += `<line x1="${sx}" y1="${oy+1}" x2="${sx}" y2="${oy+beamH-1}" stroke="#0000b4" stroke-width="0.3"/>`;
  for (let sx = ox + z1L + z2Px; sx < ox + beamW - z1L; sx += z2Px) s += `<line x1="${sx}" y1="${oy+1}" x2="${sx}" y2="${oy+beamH-1}" stroke="#0000b4" stroke-width="0.3"/>`;

  // ── Beam dimensions ──
  s += _svgDimV(ox - 14, oy, oy + beamH, `h=${bH}`, '#000');
  s += _svgDimH(ox, ox + beamW, oy + beamH + 10, `Ln = ${beam.length.toFixed(2)} m`, '#000');
  s += `<text x="${ox + beamW/2}" y="${oy + beamH - 2}" text-anchor="middle" font-size="5" fill="#777" font-family="Arial">b=${bB}</text>`;

  // ── Bar info (right of beam) ──
  const inX = ox + beamW + colW + 6; const inY = oy + 8;
  s += `<text x="${inX}" y="${inY}"    font-size="6.5" font-weight="bold" fill="#8b0000" font-family="Arial">حديد علوي: ${uTop}Φ${topDia}</text>`;
  s += `<text x="${inX}" y="${inY+9}"  font-size="6.5" font-weight="bold" fill="#1a56db" font-family="Arial">حديد سفلي: ${nStraight}Φ${botDia}</text>`;
  if (nBent > 0) s += `<text x="${inX}" y="${inY+18}" font-size="6.5" font-weight="bold" fill="#dc6400" font-family="Arial">مكسح: ${nBent}Φ${botDia}</text>`;
  s += `<text x="${inX}" y="${inY+27}" font-size="6.5" font-weight="bold" fill="#0000a0" font-family="Arial">كانات: Φ${stDv}@${z1Sp}/${stSp}</text>`;

  // ── Section cut marks A-A, B-B, C-C ──
  const secPos: [number, string][] = [[ox + colW * 0.1, 'A'], [ox + beamW / 2, 'B'], [ox + beamW - colW * 0.1, 'C']];
  for (const [sx, lb] of secPos) {
    s += `<line x1="${sx-3}" y1="${oy-8}" x2="${sx+3}" y2="${oy-8}" stroke="#000" stroke-width="0.8"/>`;
    s += `<line x1="${sx}" y1="${oy-8}" x2="${sx}" y2="${oy}" stroke="#000" stroke-width="0.8"/>`;
    s += `<line x1="${sx}" y1="${oy+beamH}" x2="${sx}" y2="${oy+beamH+5}" stroke="#000" stroke-width="0.8"/>`;
    s += `<text x="${sx}" y="${oy-10}" text-anchor="middle" font-size="6" font-weight="bold" fill="#000" font-family="Arial">${lb}-${lb}</text>`;
  }

  // ── Cross-sections right panel ──
  const spX = x + mainW + 4; const spH = (elevH - 12) / 3;
  s += _svgCrossSection(spX, y+2,        secPanelW-4, spH-2, bB, bH, coverMm, stirDMm, uTop + nBent,    topDia, nStraight,                    botDia, 'SEC A-A (LEFT)', nBent, botDia, true);
  s += _svgCrossSection(spX, y+spH+2,    secPanelW-4, spH-2, bB, bH, coverMm, stirDMm, uTop,            topDia, totBot,                       botDia, 'SEC B-B (MID)',  nBent, botDia, false);
  s += _svgCrossSection(spX, y+2*spH+2,  secPanelW-4, spH-2, bB, bH, coverMm, stirDMm, uTop + nBent,    topDia, nStraight,                    botDia, 'SEC C-C (RIGHT)', nBent, botDia, true);

  // ═══════════════════════════════════════════════════════
  // PART 2: BAR DETAILING — تفريد الحديد
  // ═══════════════════════════════════════════════════════
  s += `<line x1="${x}" y1="${detY - 6}" x2="${x + drawW}" y2="${detY - 6}" stroke="#000" stroke-width="0.5"/>`;
  s += `<text x="${x}" y="${detY + 1}" font-size="7" font-weight="bold" fill="#000" font-family="Arial">تفريد الحديد — BAR DETAILING</text>`;

  // Bar schedule table
  const topTot = (leftIsEnd ? hookTop : leftExtMm + colWMm/2) + spanMm + (rightIsEnd ? hookTop : rightExtMm + colWMm/2);
  const botTot = (leftIsEnd ? hookBot : colWMm * 0.65) + spanMm + (rightIsEnd ? hookBot : colWMm * 0.65);
  const schX = x + mainW - 72; const schY = detY + 4; const schW = 72; const schRowH = 6;
  const schRows = hasBent && nBent > 0 ? 3 : 2;
  s += `<rect x="${schX}" y="${schY}" width="${schW}" height="${schRowH*(schRows+1)}" fill="white" stroke="#000" stroke-width="0.4"/>`;
  s += `<rect x="${schX}" y="${schY}" width="${schW}" height="${schRowH}" fill="#d0d8f0" stroke="#000" stroke-width="0.4"/>`;
  const cs = [schX+2, schX+12, schX+22, schX+32, schX+52];
  ['رقم','القطر','العدد','الطول mm','البيان'].forEach((h, i) => { s += `<text x="${cs[i]}" y="${schY+schRowH-1}" font-size="4.5" font-weight="bold" fill="#000" font-family="Arial">${h}</text>`; });
  [cs[0]+8, cs[1]+8, cs[2]+8, cs[3]+18].forEach(cx => { s += `<line x1="${cx}" y1="${schY}" x2="${cx}" y2="${schY+schRowH*(schRows+1)}" stroke="#000" stroke-width="0.3"/>`; });
  for (let ri = 1; ri <= schRows; ri++) s += `<line x1="${schX}" y1="${schY+ri*schRowH}" x2="${schX+schW}" y2="${schY+ri*schRowH}" stroke="#000" stroke-width="0.3"/>`;
  const schData = [['1',`Φ${topDia}`,`${uTop}`,`${Math.round(topTot)}`,'علوي'],['2',`Φ${botDia}`,`${nStraight}`,`${Math.round(botTot)}`,'سفلي'],...(hasBent&&nBent>0?[['3',`Φ${botDia}`,`${nBent}`,`${Math.round(bTotal)}`,'مكسح']]:[])] as string[][];
  schData.forEach(([n,d,c,l,b],i) => {
    const ry = schY+(i+1)*schRowH+schRowH-1;
    [n,d,c,l,b].forEach((v,j) => { s += `<text x="${cs[j]}" y="${ry}" font-size="4.5" fill="#000" font-family="Arial">${v}</text>`; });
  });

  // Detail rows layout
  const dSt = detY + 8; const rowCount = hasBent && nBent > 0 ? 3 : 2;
  const bRowH = (detH - 16) / rowCount;
  const dMarg = 8; const dW = mainW - dMarg * 2 - 80;
  const maxL = Math.max(topTot, botTot, bTotal || 0);
  const dScl = (dW - 10) / maxL;
  const dOx = x + dMarg + 8;

  // ROW TOP: Top straight bar
  const r3Y = dSt + bRowH / 2;
  const tELP = leftIsEnd  ? hookTop * dScl * 0.3 : (leftExtMm + colWMm/2) * dScl;
  const tERP = rightIsEnd ? hookTop * dScl * 0.3 : (rightExtMm + colWMm/2) * dScl;
  const tSpP = spanMm * dScl;
  const tx1 = dOx; const tx2 = tx1 + tELP + tSpP + tERP;
  const tCFL = tx1 + tELP; const tCFR = tx1 + tELP + tSpP;
  if (leftIsEnd) {
    s += `<line x1="${tx1}" y1="${r3Y - hookTop*dScl*0.15}" x2="${tx1+hookTop*dScl*0.1}" y2="${r3Y}" stroke="#0000c8" stroke-width="1"/>`;
    s += `<line x1="${tx1+hookTop*dScl*0.1}" y1="${r3Y}" x2="${tx2}" y2="${r3Y}" stroke="#0000c8" stroke-width="1"/>`;
  } else {
    s += `<line x1="${tx1}" y1="${r3Y}" x2="${tCFL}" y2="${r3Y}" stroke="#0000c8" stroke-width="0.5" stroke-dasharray="3,2"/>`;
    s += `<line x1="${tCFL}" y1="${r3Y}" x2="${tx2}" y2="${r3Y}" stroke="#0000c8" stroke-width="1"/>`;
  }
  if (rightIsEnd) s += `<line x1="${tx2-hookTop*dScl*0.1}" y1="${r3Y}" x2="${tx2}" y2="${r3Y-hookTop*dScl*0.15}" stroke="#0000c8" stroke-width="1"/>`;
  else { s += `<line x1="${tCFR}" y1="${r3Y}" x2="${tx2}" y2="${r3Y}" stroke="#0000c8" stroke-width="0.5" stroke-dasharray="3,2"/>`; }
  s += _svgColFaceMarkers(tCFL, tCFR, r3Y-3, r3Y+3);
  if (!leftIsEnd)  s += `<text x="${(tx1+tCFL)/2}" y="${r3Y-7}" text-anchor="middle" font-size="4.5" fill="#0000b4" font-family="Arial">امتداد ${Math.round(leftExtMm)}mm</text>`;
  if (!rightIsEnd) s += `<text x="${(tCFR+tx2)/2}" y="${r3Y-7}" text-anchor="middle" font-size="4.5" fill="#0000b4" font-family="Arial">امتداد ${Math.round(rightExtMm)}mm</text>`;
  s += `<text x="${dOx}" y="${r3Y-bRowH/2+5}" font-size="6" font-weight="bold" fill="#0000a0" font-family="Arial">① حديد علوي: ${uTop}Φ${topDia}</text>`;
  const dTY = r3Y + 8;
  if (!leftIsEnd) s += _svgDimH(tx1, tCFL, dTY, `Ld=${Math.round(leftExtMm+colWMm/2)}`, '#0000b4');
  else            s += _svgDimH(tx1, tx1+hookTop*dScl*0.1, dTY, `hook=${hookTop}`, '#0000b4');
  s += _svgDimH(tCFL, tCFR, dTY, `Ln=${Math.round(spanMm)}`, '#0000b4');
  if (!rightIsEnd) s += _svgDimH(tCFR, tx2, dTY, `Ld=${Math.round(rightExtMm+colWMm/2)}`, '#0000b4');
  else             s += _svgDimH(tx2-hookTop*dScl*0.1, tx2, dTY, `hook=${hookTop}`, '#0000b4');
  s += _svgDimH(tx1, tx2, dTY+8, `إجمالي = ${Math.round(topTot)} mm`, '#b40000');

  // ROW MID: Bent bar
  if (hasBent && nBent > 0) {
    const r2Y = dSt + bRowH + bRowH/2;
    const s1P = bSeg1*dScl; const dP = bDiag*dScl*0.5; const s3P = bSeg3*dScl; const s5P = bSeg5*dScl;
    const rH  = bRowH * 0.4;
    const mx1=dOx; const mx2=mx1+s1P; const mx3=mx2+dP; const mx4=mx3+s3P; const mx5=mx4+dP; const mx6=mx5+s5P;
    if (!leftIsEnd)  s += `<line x1="${mx1}" y1="${r2Y-rH/2}" x2="${tCFL}" y2="${r2Y-rH/2}" stroke="#dc6400" stroke-width="0.5" stroke-dasharray="3,2"/>`;
    if (!rightIsEnd) s += `<line x1="${tCFR}" y1="${r2Y-rH/2}" x2="${mx6}" y2="${r2Y-rH/2}" stroke="#dc6400" stroke-width="0.5" stroke-dasharray="3,2"/>`;
    s += `<polyline points="${leftIsEnd?mx1:tCFL},${r2Y-rH/2} ${mx2},${r2Y-rH/2} ${mx3},${r2Y+rH/2} ${mx4},${r2Y+rH/2} ${mx5},${r2Y-rH/2} ${rightIsEnd?mx6:tCFR},${r2Y-rH/2}" fill="none" stroke="#dc6400" stroke-width="1.2"/>`;
    s += _svgColFaceMarkers(tCFL, tCFR, r2Y-rH/2-3, r2Y+rH/2+3);
    s += `<text x="${dOx}" y="${r2Y-bRowH/2+5}" font-size="6" font-weight="bold" fill="#b45a00" font-family="Arial">② حديد مكسح: ${nBent}Φ${botDia}</text>`;
    const dBA = r2Y-rH/2-7; const dBB = r2Y+rH/2+7;
    s += _svgDimH(mx1, mx2, dBA, `L1=${Math.round(bSeg1)}`, '#b45a00');
    s += _svgDimH(mx2, mx3, dBB, `D=${Math.round(bDiag)}`, '#b45a00');
    s += _svgDimH(mx3, mx4, dBB, `L2=${Math.round(bSeg3)}`, '#b45a00');
    s += _svgDimH(mx4, mx5, dBB, `D=${Math.round(bDiag)}`, '#b45a00');
    s += _svgDimH(mx5, mx6, dBA, `L3=${Math.round(bSeg5)}`, '#b45a00');
    s += _svgDimH(mx1, mx6, dBB+8, `إجمالي ≈ ${Math.round(bTotal)} mm`, '#b40000');
  }

  // ROW BOTTOM: Straight bottom bar
  const r1Y = dSt + bRowH*(rowCount-1) + bRowH/2;
  const bHP = hookBot*dScl; const bSP = spanMm*dScl;
  const bELP = leftIsEnd  ? bHP*0.15 : colWMm*0.65*dScl;
  const bERP = rightIsEnd ? bHP*0.15 : colWMm*0.65*dScl;
  const bbx1=dOx; const bCFL=bbx1+(leftIsEnd?bHP*0.15:bELP); const bCFR=bCFL+bSP; const bbx2=bCFR+(rightIsEnd?bHP*0.15:bERP);
  if (leftIsEnd) s += `<line x1="${bbx1}" y1="${r1Y+bHP*0.4}" x2="${bbx1+bHP*0.15}" y2="${r1Y}" stroke="#006400" stroke-width="1.2"/>`;
  s += `<line x1="${leftIsEnd?bbx1+bHP*0.15:bbx1}" y1="${r1Y}" x2="${rightIsEnd?bbx2-bHP*0.15:bbx2}" y2="${r1Y}" stroke="#006400" stroke-width="1.2"/>`;
  if (rightIsEnd) s += `<line x1="${bbx2-bHP*0.15}" y1="${r1Y}" x2="${bbx2}" y2="${r1Y+bHP*0.4}" stroke="#006400" stroke-width="1.2"/>`;
  s += _svgColFaceMarkers(bCFL, bCFR, r1Y-3, r1Y+3);
  s += `<text x="${dOx}" y="${r1Y-bRowH/2+5}" font-size="6" font-weight="bold" fill="#006400" font-family="Arial">③ حديد سفلي: ${nStraight}Φ${botDia}</text>`;
  const dR1 = r1Y+8;
  if (leftIsEnd)  s += _svgDimH(bbx1, bCFL, dR1, `hook=${hookBot}`, '#006400');
  s += _svgDimH(bCFL, bCFR, dR1, `Ln=${Math.round(spanMm)}`, '#006400');
  if (rightIsEnd) s += _svgDimH(bCFR, bbx2, dR1, `hook=${hookBot}`, '#006400');
  s += _svgDimH(bbx1, bbx2, dR1+8, `إجمالي = ${Math.round(botTot)} mm`, '#b40000');

  return s;
}

function htmlBeamElevationSheet(
  beams: Beam[], beamDesigns: BeamDesignData[],
  tbBase: Partial<TitleBlockConfig>, floorCode: string, startSheetNo: number,
  devLengths: DevelopmentLengths[],
  bentUpResults?: any[],
): string {
  const sheetW = _SHEET_W, sheetH = _SHEET_H;
  const titleH = 135 + 36 + 10;
  const contentH = sheetH - 45 - titleH;

  let sheets = '';
  let sheetNo = startSheetNo;

  const elevGroupLabels = buildBeamGroupLabels(beamDesigns, bentUpResults);
  for (let i = 0; i < beamDesigns.length; i++) {
    const d = beamDesigns[i];
    let beam = beams.find(b => b.id === d.beamId);

    // Handle merged carrier beams (e.g. "67" whose segments are "67-1","67-2","67-3")
    if (!beam && d.mergedCarrierIds && d.mergedCarrierIds.length > 0) {
      const parts = d.mergedCarrierIds.map(id => beams.find(b => b.id === id)).filter((b): b is Beam => !!b);
      if (parts.length > 0) {
        const largest = parts.reduce((best, b) => b.b * b.h >= best.b * best.h ? b : best, parts[0]);
        const totalLength = d.span ?? parts.reduce((s, b) => s + b.length, 0);
        // Synthesise a single beam record spanning the full girder
        beam = { ...largest, id: d.beamId, length: totalLength };
      }
    }
    if (!beam) continue;

    let displayedBeamId = beam.id;
    const m = beam.id.match(/^(.+)-(\d+)$/);
    if (m) {
      const baseId = m[1];
      const existingPartsCount = beams.filter(b => b.id.match(new RegExp(`^${baseId}-\\d+$`))).length;
      if (existingPartsCount === 1) {
        displayedBeamId = beam.name ? beam.name.replace(/-\d+$/, '') : baseId;
      }
    }

    const groupLabel = elevGroupLabels.get(d.beamId);
    const titlePrefix = groupLabel ? `${groupLabel} — BEAM ${displayedBeamId}` : `BEAM ${displayedBeamId}`;
    const svgContent = svgBeamElevationDetailed(beam, d, 0, 0, sheetW - 90, contentH, devLengths, beams);
    const svgZone = `<svg viewBox="0 0 ${sheetW - 90} ${contentH}" width="${sheetW - 90}" height="${contentH}" xmlns="http://www.w3.org/2000/svg">${svgContent}</svg>`;

    sheets += `
  <div class="sheet-page" style="position:relative; width:${sheetW}px; height:${sheetH}px; background:white; overflow:hidden; page-break-after:always; font-family:'Segoe UI',Arial,Tahoma,sans-serif;">
    ${htmlSheetBorder()}
    <div style="position:absolute; top:42px; left:45px; right:45px; height:${contentH}px; overflow:hidden; border:0.5px solid #ccc;">
      ${svgZone}
    </div>
    <div style="position:absolute; bottom:${titleH - 10}px; left:50px; font-size:7px; color:#333; font-family:Arial;">
      <span style="color:#8b0000;">━━</span> حديد علوي &nbsp;
      <span style="color:#1a56db;">━━</span> حديد سفلي &nbsp;
      <span style="color:#dc6400;">━━</span> حديد مكسح &nbsp;
      <span style="color:#0000b4;">━━</span> كانات
    </div>
    ${htmlTitleBlock({ ...tbBase, drawingTitle: `${titlePrefix} — LONGITUDINAL SECTION`, drawingSubTitle: `${beam.b}×${beam.h}mm, Span ${beam.length.toFixed(2)}m`, drawingNumber: makeDrawingNumber(floorCode, 'SE', i + 1), sheetNo: sheetNo.toString(), scale: 'N.T.S.' })}
  </div>`;
    sheetNo++;
  }
  return sheets;
}

export function openBeamElevationForPrint(
  beams: Beam[],
  beamDesigns: BeamDesignData[],
  projectName: string = 'Structural Design Studio',
  options?: ExportOptions,
  paperSize: PaperSize = 'A3',
): void {
  if (beamDesigns.length === 0) return;

  const floorCode  = options?.floorCode || 'GF';
  const storyLabel = options?.storyLabel || '';
  const fc = options?.titleBlockConfig?.fc || 28;
  const fy = options?.titleBlockConfig?.fy || 420;
  const devLengths = (options as any)?.devLengths as DevelopmentLengths[] || [];

  const _paper = getPaperPx(paperSize, 20, 10);
  _SHEET_W = _paper.sheetW; _SHEET_H = _paper.sheetH; _CSS_PAPER = _paper.cssSize;

  const tbBase: Partial<TitleBlockConfig> = {
    firmName: 'Structural Design Studio',
    projectName, projectLocation: '', clientName: '',
    drawingSubTitle: storyLabel, revision: 'R0',
    designedBy: 'ENG.', drawnBy: 'ENG.', checkedBy: '-', approvedBy: '-',
    designCode: 'ACI 318-19',
    ...options?.titleBlockConfig,
    date: new Date().toLocaleDateString(), fc, fy,
  };

  const bentUpResults = (options as any)?.bentUpResults || [];
  const sheetsHTML = htmlBeamElevationSheet(beams, beamDesigns, tbBase, floorCode, 1, devLengths, bentUpResults);

  const htmlContent = `<!DOCTYPE html>
<html lang="ar">
<head>
  <meta charset="utf-8">
  <title>${projectName} - ${floorCode} - مقاطع الجسور الطولية</title>
  <style>
    @page { size: ${_CSS_PAPER} landscape; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #e0e0e0; font-family: 'Segoe UI', Arial, Tahoma, sans-serif; }
    .sheet-page { margin: 10px auto; box-shadow: 0 2px 10px rgba(0,0,0,0.3); }
    @media print {
      body { background: white; }
      .sheet-page { margin: 0; box-shadow: none; page-break-after: always; }
    }
  </style>
</head>
<body>
  ${sheetsHTML}
</body>
</html>`;

  import('@/lib/capacitorDownload').then(({ openHTMLForPrint }) =>
    openHTMLForPrint(htmlContent)
  );
}

// ─── BBS HTML Sheet ───

function htmlBBSSheet(
  beams: Beam[], beamDesigns: BeamDesignData[], colDesigns: ColDesignData[], slabDesigns: SlabDesignData[],
  tbBase: Partial<TitleBlockConfig>, floorCode: string, startSheetNo: number,
): string {
  // Build entries inline (simplified weights)
  const barW = (dia: number, lenM: number) => (dia * dia / 162.2) * lenM;
  const hook = (dia: number) => Math.max(12 * dia / 1000, 0.15);

  interface SimpleEntry { mark: string; member: string; type: string; dia: number; len: number; qty: number; wt: number; }
  const entries: SimpleEntry[] = [];
  let mk = 1;

  for (const d of beamDesigns) {
    const beam = beams.find(b => b.id === d.beamId);
    if (!beam) continue;
    const L = beam.length;
    const isShort = L <= 2.0;
    const totalBot = d.flexMid.bars;
    const bentCount = (!isShort && totalBot >= 3) ? Math.floor(totalBot / 2) : 0;
    const straightBot = totalBot - bentCount;
    const topLenL = L * 0.30 + hook(d.flexLeft.dia);
    const topLenR = L * 0.30 + hook(d.flexRight.dia);
    const botLen = L + 2 * hook(d.flexMid.dia);
    entries.push({ mark: `T${mk}L`, member: d.beamId, type: 'جسر-علوي', dia: d.flexLeft.dia, len: parseFloat(topLenL.toFixed(2)), qty: d.flexLeft.bars, wt: parseFloat((barW(d.flexLeft.dia, d.flexLeft.bars * topLenL) * 1.05).toFixed(1)) });
    entries.push({ mark: `T${mk}R`, member: d.beamId, type: 'جسر-علوي', dia: d.flexRight.dia, len: parseFloat(topLenR.toFixed(2)), qty: d.flexRight.bars, wt: parseFloat((barW(d.flexRight.dia, d.flexRight.bars * topLenR) * 1.05).toFixed(1)) });
    entries.push({ mark: `B${mk}`, member: d.beamId, type: 'جسر-سفلي', dia: d.flexMid.dia, len: parseFloat(botLen.toFixed(2)), qty: straightBot, wt: parseFloat((barW(d.flexMid.dia, straightBot * botLen) * 1.05).toFixed(1)) });
    if (bentCount > 0) {
      const bL = L * 0.6 + 2 * hook(d.flexMid.dia);
      entries.push({ mark: `BK${mk}`, member: d.beamId, type: 'جسر-مكسح', dia: d.flexMid.dia, len: parseFloat(bL.toFixed(2)), qty: bentCount, wt: parseFloat((barW(d.flexMid.dia, bentCount * bL) * 1.05).toFixed(1)) });
    }
    const sm = d.shear.stirrups.match(/(\d+)Φ(\d+)@(\d+)/);
    if (sm) {
      const sDia = parseInt(sm[2]); const sSp = parseInt(sm[3]);
      const nS = Math.ceil((L * 1000) / sSp);
      const sLen = parseFloat((2 * ((beam.b - 80) / 1000 + (beam.h - 80) / 1000) + 2 * hook(sDia)).toFixed(2));
      entries.push({ mark: `S${mk}`, member: d.beamId, type: 'كانات-جسر', dia: sDia, len: sLen, qty: nS, wt: parseFloat((barW(sDia, nS * sLen) * 1.05).toFixed(1)) });
    }
    mk++;
  }
  for (const c of colDesigns) {
    const lap = 40 * c.design.dia / 1000;
    const len = parseFloat((3.0 + lap).toFixed(2));
    entries.push({ mark: `C${mk}`, member: c.id, type: 'عمود', dia: c.design.dia, len, qty: c.design.bars, wt: parseFloat((barW(c.design.dia, c.design.bars * len) * 1.03).toFixed(1)) });
    mk++;
  }
  for (const s of slabDesigns) {
    entries.push({ mark: `SL${mk}S`, member: s.id, type: 'بلاطة', dia: s.design.shortDir.dia, len: parseFloat((s.design.lx + 0.3).toFixed(2)), qty: Math.ceil(s.design.ly * 1000 / s.design.shortDir.spacing), wt: 0 });
    entries.push({ mark: `SL${mk}L`, member: s.id, type: 'بلاطة', dia: s.design.longDir.dia, len: parseFloat((s.design.ly + 0.3).toFixed(2)), qty: Math.ceil(s.design.lx * 1000 / s.design.longDir.spacing), wt: 0 });
    mk++;
  }

  const totalWt = entries.reduce((s, e) => s + e.wt, 0);
  const diaSummary = new Map<number, number>();
  for (const e of entries) diaSummary.set(e.dia, (diaSummary.get(e.dia) || 0) + e.wt);

  let tableRows = entries.map(e =>
    `<tr><td>${e.mark}</td><td>${e.member}</td><td>${e.type}</td><td>Φ${e.dia}</td><td>${e.len.toFixed(2)}</td><td>${e.qty}</td><td>${(e.qty * e.len).toFixed(2)}</td><td>${e.wt.toFixed(1)}</td></tr>`
  ).join('');

  let sumRows = [...diaSummary.entries()].sort((a, b) => a[0] - b[0]).map(([d, w]) =>
    `<tr><td>Φ${d}</td><td>${w.toFixed(1)} kg</td></tr>`
  ).join('');

  const sheetW = _SHEET_W, sheetH = _SHEET_H;
  const titleH = 135 + 36 + 10;
  const contentH = sheetH - 45 - titleH;

  return `
  <div class="sheet-page" style="position:relative; width:${sheetW}px; height:${sheetH}px; background:white; overflow:hidden; page-break-after:always; font-family:'Segoe UI',Arial,Tahoma,sans-serif;">
    ${htmlSheetBorder()}
    <div style="position:absolute; top:45px; left:45px; right:45px; height:${contentH}px; overflow:hidden; direction:rtl; padding:6px;">
      <div style="font-size:13px; font-weight:bold; border-bottom:2px solid #1a3a5c; padding-bottom:4px; margin-bottom:6px; color:#1a3a5c;">جدول حصر الحديد — BAR BENDING SCHEDULE</div>
      <div style="display:flex; gap:16px; height:calc(100% - 30px); overflow:hidden;">
        <div style="flex:1; overflow:hidden;">
          <table style="width:100%; border-collapse:collapse; font-size:8px; font-family:'Segoe UI',Arial,Tahoma,sans-serif;">
            <thead>
              <tr>
                <th style="border:1px solid #000; background:#1a3a5c; color:#fff; padding:3px;">الرقم</th>
                <th style="border:1px solid #000; background:#1a3a5c; color:#fff; padding:3px;">العنصر</th>
                <th style="border:1px solid #000; background:#1a3a5c; color:#fff; padding:3px;">النوع</th>
                <th style="border:1px solid #000; background:#1a3a5c; color:#fff; padding:3px;">القطر</th>
                <th style="border:1px solid #000; background:#1a3a5c; color:#fff; padding:3px;">الطول (م)</th>
                <th style="border:1px solid #000; background:#1a3a5c; color:#fff; padding:3px;">العدد</th>
                <th style="border:1px solid #000; background:#1a3a5c; color:#fff; padding:3px;">إجمالي طول (م)</th>
                <th style="border:1px solid #000; background:#1a3a5c; color:#fff; padding:3px;">الوزن (كغ)</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
            <tfoot>
              <tr><td colspan="7" style="border:1px solid #000; background:#eee; font-weight:bold; padding:3px; text-align:right;">إجمالي الوزن</td>
              <td style="border:1px solid #000; background:#eee; font-weight:bold; padding:3px;">${totalWt.toFixed(1)}</td></tr>
            </tfoot>
          </table>
        </div>
        <div style="width:160px; flex-shrink:0;">
          <div style="font-weight:bold; font-size:9px; margin-bottom:4px; color:#1a3a5c;">ملخص بحسب القطر</div>
          <table style="width:100%; border-collapse:collapse; font-size:8px;">
            <thead><tr>
              <th style="border:1px solid #000; background:#1a3a5c; color:#fff; padding:3px;">القطر</th>
              <th style="border:1px solid #000; background:#1a3a5c; color:#fff; padding:3px;">الوزن (كغ)</th>
            </tr></thead>
            <tbody>${sumRows}</tbody>
          </table>
          <div style="margin-top:10px; font-size:7.5px; color:#555; line-height:1.6;">
            <div>• الأوزان تشمل هدر 5% للجسور</div>
            <div>• 3% للأعمدة، 8% للبلاطات</div>
            <div>• الطول بالمتر، الوزن بالكيلوغرام</div>
            <div>• حديد التسليح: fy=${tbBase.fy || 420} MPa</div>
          </div>
        </div>
      </div>
    </div>
    ${htmlTitleBlock({ ...tbBase, drawingTitle: 'BAR BENDING SCHEDULE / جدول حصر الحديد', drawingSubTitle: tbBase.drawingSubTitle || 'All Floors', drawingNumber: makeDrawingNumber(floorCode, 'BBS', 1), sheetNo: startSheetNo.toString(), scale: 'N.T.S.' })}
  </div>`;
}

function svgTypicalContinuousBeam(): string {
  let s = `<g stroke="#000" stroke-width="0.8">`;
  // Columns (supports)
  // Left Support
  s += `<rect x="65" y="80" width="30" height="50" fill="#eaeaea" stroke="#555" stroke-width="0.8" />`;
  s += `<rect x="65" y="10" width="30" height="30" fill="#eaeaea" stroke="#555" stroke-dasharray="2,2" stroke-width="0.5" />`;
  // Mid Support
  s += `<rect x="380" y="80" width="40" height="50" fill="#eaeaea" stroke="#555" stroke-width="0.8" />`;
  s += `<rect x="380" y="10" width="40" height="30" fill="#eaeaea" stroke="#555" stroke-dasharray="2,2" stroke-width="0.5" />`;
  // Right Support
  s += `<rect x="705" y="80" width="30" height="50" fill="#eaeaea" stroke="#555" stroke-width="0.8" />`;
  s += `<rect x="705" y="10" width="30" height="30" fill="#eaeaea" stroke="#555" stroke-dasharray="2,2" stroke-width="0.5" />`;

  // Beam Concrete
  s += `<rect x="25" y="40" width="750" height="40" fill="none" stroke="#222" stroke-width="1.2" />`;
  s += `</g>`;

  // Reinforcement Bars
  // Top continuous/hanger bars (blue/dark)
  s += `<path d="M 40,75 L 40,46 Q 43,45 45,45 L 755,45 Q 757,45 760,46 L 760,75" fill="none" stroke="#1d4ed8" stroke-width="1.5" />`;
  
  // Bottom straight reinforcement (green, running straight through the whole bottom of the beam)
  s += `<path d="M 40,74 Q 44,75 46,75 L 754,75 Q 756,75 760,74" fill="none" stroke="#16a34a" stroke-width="1.6" />`;

  // Bent-up Reinforcement (Red bars, bending at 45 degrees at L/5 from column faces and going to top support zones)
  // Bent-up bar 1 (Span 1): hook at left, straight bottom, bend up at 152 to 122 LHS, bend up at 323 to 353 RHS, goes over mid support to 477 (L/5 of Span 2)
  s += `<path d="M 43,58 L 43,47 L 122,47 L 152,73 L 323,73 L 353,47 L 477,47" fill="none" stroke="#dc2626" stroke-width="1.8" stroke-linejoin="round" />`;
  
  // Bent-up bar 2 (Span 2): starts at 323 (L/5 of Span 1), goes over mid support, bend up at 477 to 447 LHS, bend up at 648 to 678 RHS, goes over right support and hooks down at right end
  s += `<path d="M 323,47 L 447,47 L 477,73 L 648,73 L 678,47 L 757,47 L 757,58" fill="none" stroke="#dc2626" stroke-width="1.8" stroke-linejoin="round" />`;

  // Support top reinforcement (Red, additional top straight reinforcement for negative moment peaks)
  s += `<line x1="45" y1="49" x2="160" y2="49" stroke="#b91c1c" stroke-width="1.8" stroke-dasharray="3,1" />`; // over left support
  s += `<line x1="280" y1="49" x2="520" y2="49" stroke="#b91c1c" stroke-width="1.8" stroke-dasharray="3,1" />`; // over mid support
  s += `<line x1="640" y1="49" x2="755" y2="49" stroke="#b91c1c" stroke-width="1.8" stroke-dasharray="3,1" />`; // over right support

  // Legend box showing multi-color reinforcement keys (highly readable design in vacant top-center zone of SVG)
  s += `<g transform="translate(145, 12)" font-family="'Segoe UI', Arial, sans-serif" font-size="6">
    <rect x="-5" y="-5" width="500" height="15" fill="#fcfcfc" stroke="#ccc" stroke-width="0.5" rx="3" />
    
    <line x1="5" y1="5" x2="20" y2="5" stroke="#1d4ed8" stroke-width="1.5" />
    <text x="24" y="7" fill="#1d4ed8" font-weight="bold">أسياخ تعليق الكانات (Hangers)</text>
    
    <line x1="130" y1="5" x2="145" y2="5" stroke="#16a34a" stroke-width="1.6" />
    <text x="149" y="7" fill="#16a34a" font-weight="bold">سفلي مستقيم (Straight Bot.)</text>
    
    <line x1="260" y1="5" x2="275" y2="5" stroke="#dc2626" stroke-width="1.8" />
    <text x="279" y="7" fill="#dc2626" font-weight="bold">حديد مكسح (Bent-up at 45°)</text>

    <line x1="390" y1="5" x2="405" y2="5" stroke="#b91c1c" stroke-width="1.8" stroke-dasharray="3,1" />
    <text x="409" y="7" fill="#b91c1c" font-weight="bold">علوي إضافي للركب (Support Top)</text>
  </g>`;

  // Stirrup zones (symbolic ticks)
  for (let x = 95; x < 375; x += 12) {
    const sw = (x < 160 || x > 310) ? 0.6 : 0.4;
    const col = (x < 160 || x > 310) ? '#cc6600' : '#888';
    s += `<line x1="${x}" y1="42" x2="${x}" y2="78" stroke="${col}" stroke-width="${sw}" />`;
  }
  for (let x = 425; x < 695; x += 12) {
    const sw = (x < 490 || x > 630) ? 0.6 : 0.4;
    const col = (x < 490 || x > 630) ? '#cc6600' : '#888';
    s += `<line x1="${x}" y1="42" x2="${x}" y2="78" stroke="${col}" stroke-width="${sw}" />`;
  }

  // Section cuts lines A-A, B-B, C-C
  const drawCut = (x: number, label: string) => {
    return `<g stroke="#000" stroke-width="0.8">
      <line x1="${x - 5}" y1="30" x2="${x + 5}" y2="30" />
      <line x1="${x}" y1="30" x2="${x}" y2="90" stroke-dasharray="4,3" />
      <line x1="${x - 5}" y1="90" x2="${x + 5}" y2="90" />
      <path d="M ${x-5},30 L ${x-5},35 M ${x-5},90 L ${x-5},85" />
      <text x="${x}" y="24" text-anchor="middle" font-size="7" font-weight="bold" fill="#000">${label}-${label}</text>
    </g>`;
  };
  s += drawCut(130, 'A'); // Left Support (A-A)
  s += drawCut(230, 'B'); // Mid Span (B-B)
  s += drawCut(330, 'C'); // Left support right side (C-C) (let's say right support start)

  // Label names
  s += `<text x="80" y="115" text-anchor="middle" font-size="7" font-family="'Segoe UI', Arial, sans-serif" font-weight="bold" fill="#555">ركيزة طرفية Beam Col-End</text>`;
  s += `<text x="400" y="115" text-anchor="middle" font-size="7" font-family="'Segoe UI', Arial, sans-serif" font-weight="bold" fill="#555">ركيزة وسطية Mid Support</text>`;
  s += `<text x="720" y="115" text-anchor="middle" font-size="7" font-family="'Segoe UI', Arial, sans-serif" font-weight="bold" fill="#555">ركيزة طرفية Beam Col-End</text>`;
  
  s += `<text x="130" y="98" text-anchor="middle" font-size="5.5" font-family="'Segoe UI', Arial, sans-serif" fill="#b91c1c">موقع مقطع أ-أ (عند الركيزة / تكسيح علوي)</text>`;
  s += `<text x="230" y="98" text-anchor="middle" font-size="5.5" font-family="'Segoe UI', Arial, sans-serif" fill="#15803d">موقع مقطع ب-ب (وسط البحر / عزم موجب)</text>`;
  s += `<text x="330" y="98" text-anchor="middle" font-size="5.5" font-family="'Segoe UI', Arial, sans-serif" fill="#b91c1c">موقع مقطع ج-ج (عند الركيزة / تكسيح علوي)</text>`;

  return s;
}

// ─── Main export function ───

export function generateHTMLConstructionSheets(
  slabs: Slab[],
  beams: Beam[],
  columns: Column[],
  beamDesigns: BeamDesignData[],
  colDesigns: ColDesignData[],
  slabDesigns: SlabDesignData[],
  projectName: string = 'Structural Design Studio',
  options?: ExportOptions,
  paperSize: PaperSize = 'auto',
  slabProps?: SlabProps,
  mat?: MatProps,
  ribbedSlabProps?: any,
): string {
  const floorCode = options?.floorCode || 'GF';
  const storyLabel = options?.storyLabel || '';
  const fc = options?.titleBlockConfig?.fc || 28;
  const fy = options?.titleBlockConfig?.fy || 420;
  const date = new Date().toLocaleDateString();

  const tbBase: Partial<TitleBlockConfig> = {
    firmName: 'Structural Design Studio',
    projectName,
    projectLocation: '',
    clientName: '',
    drawingSubTitle: '',
    revision: 'R0',
    designedBy: 'ENG.',
    drawnBy: 'ENG.',
    checkedBy: '-',
    approvedBy: '-',
    designCode: 'ACI 318-19',
    ...options?.titleBlockConfig,
    date,
    fc, fy,
  };

  // Compute plan extents
  const allX = slabs.flatMap(s => [s.x1, s.x2]);
  const allY = slabs.flatMap(s => [s.y1, s.y2]);
  if (allX.length === 0) return '<p>لا توجد بيانات للتصدير</p>';

  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);
  const modelW = maxX - minX;
  const modelH = maxY - minY;

  // Determine paper size (auto picks A4/A3/A1 based on plan extent) — always landscape
  const _paper = getPaperPx(paperSize, modelW, modelH);
  _SHEET_W = _paper.sheetW;
  _SHEET_H = _paper.sheetH;
  _CSS_PAPER = _paper.cssSize;

  // SVG viewbox for plan zone — the plan occupies 62% of the sheet width (rest is schedule table)
  // We compute mmPerM based on the plan zone to ensure the drawing fills the available area.
  const titleBlockH = 135 + 36 + 10;
  const svgW = _SHEET_W - 90;   // full inner sheet width
  const svgH = _SHEET_H - 45 - titleBlockH;
  // Plan display zone = 72% of inner width (matches generateSheetHTML planW calculation)
  const planZoneW = Math.round(svgW * 0.72);
  const mmPerM = Math.min((planZoneW - 20) / modelW, (svgH - 20) / modelH);
  const planOffsetX = 10 + ((planZoneW - 20) - modelW * mmPerM) / 2;
  const planOffsetY = 10 + ((svgH - 20) - modelH * mmPerM) / 2;
  const tx = (x: number) => (x - minX) * mmPerM + planOffsetX;
  const ty = (y: number) => (maxY - y) * mmPerM + planOffsetY;

  const gridX = Array.from(new Set(allX)).sort((a, b) => a - b);
  const gridY = Array.from(new Set(allY)).sort((a, b) => a - b);
  const scaleVal = Math.round(1000 / mmPerM);
  const scaleText = `1:${scaleVal}`;

  // Build group label maps for plan SVG labels
  const beamGroupLabels = buildBeamGroupLabels(beamDesigns, options?.bentUpResults);
  const colGroupLabels = buildColGroupLabels(colDesigns);
  const slabGroupLabels = buildSlabGroupLabels(slabDesigns);

  const gridSvg = svgGridSystem(gridX, gridY, tx, ty, minX, maxX, minY, maxY);

  let sheetsHTML = '';

  // ═══════════════════════════════════════════════════
  // SHEET 1: BEAM LAYOUT PLAN
  // ═══════════════════════════════════════════════════
  const bsDwg = makeDrawingNumber(floorCode, 'BS', 1);
  const beamPlanSvg = gridSvg
    + svgColumns(columns, tx, ty, mmPerM, true, false)
    + svgBeamsOnPlan(beams, columns, tx, ty, mmPerM, beamGroupLabels);

  sheetsHTML += generateSheetHTML(
    'beam-layout',
    beamPlanSvg,
    planZoneW, svgH,
    htmlScaleBarBlock(scaleVal) + htmlBeamScheduleTable(beams, beamDesigns, options?.bentUpResults),
    {
      ...tbBase,
      drawingTitle: 'BEAM LAYOUT PLAN / مخطط الجسور',
      drawingSubTitle: storyLabel || 'All Floors',
      drawingNumber: bsDwg,
      sheetNo: '1',
      scale: scaleText,
    },
  );

  // ═══════════════════════════════════════════════════
  // SHEET 2: BEAM DETAILED CROSS SECTIONS (Dynamic Pagination)
  // ═══════════════════════════════════════════════════
  const bGroupsForSec = new Map<string, { designs: BeamDesignData[]; memberIds: string[] }>();
  for (const d of beamDesigns) {
    const label = beamGroupLabels.get(d.beamId) ?? d.beamId;
    if (!bGroupsForSec.has(label)) bGroupsForSec.set(label, { designs: [], memberIds: [] });
    bGroupsForSec.get(label)!.designs.push(d);
    const mergedIds = (d as any).mergedCarrierIds as string[] | undefined;
    if (mergedIds && mergedIds.length > 0) {
      bGroupsForSec.get(label)!.memberIds.push(...mergedIds);
    } else {
      bGroupsForSec.get(label)!.memberIds.push(d.beamId);
    }
  }

  const bGroupEntries = Array.from(bGroupsForSec.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ar'));
  
  // Set constraints: page 1 can fit 2 groups (due to typical elevation), subsequent can fit 3
  const groupsPerPage = 2;
  const groupsPerPageSubsequent = 3;

  const bSectionPages: Array<typeof bGroupEntries> = [];
  let currentGroupBatch: typeof bGroupEntries = [];
  
  for (let i = 0; i < bGroupEntries.length; i++) {
    currentGroupBatch.push(bGroupEntries[i]);
    const isFirstPage = bSectionPages.length === 0;
    const limit = isFirstPage ? groupsPerPage : groupsPerPageSubsequent;
    if (currentGroupBatch.length === limit || i === bGroupEntries.length - 1) {
      bSectionPages.push(currentGroupBatch);
      currentGroupBatch = [];
    }
  }

  const beamSecSheetsCount = Math.max(1, bSectionPages.length);
  let beamSecSheetIdx = 1;

  for (const pageGroups of bSectionPages) {
    const sectionDwg = makeDrawingNumber(floorCode, 'BS', 1 + beamSecSheetIdx);
    let pageHtml = '';
    
    if (beamSecSheetIdx === 1) {
      pageHtml += `
      <div style="width: 100%; border: 1.5px solid #1a3a5c; border-radius: 6px; padding: 10px 15px; background: #fff; margin-bottom: 12px;">
        <div style="font-weight: bold; font-size: 11px; color: #1a56db; margin-bottom: 8px; font-family: Arial, sans-serif; border-bottom: 2px dashed #eaeaea; padding-bottom: 4px; text-align: right;">TYPICAL CONTINUOUS BEAM REINFORCEMENT &amp; SECTION CUTS / التفاصيل النموذجية لتسليح الجسور ومواقع المقاطع العرضية</div>
        <svg viewBox="0 0 800 135" width="100%" height="135" xmlns="http://www.w3.org/2000/svg" style="background:#fff;">
          ${svgTypicalContinuousBeam()}
        </svg>
      </div>`;
    } else {
      pageHtml += `<div style="font-weight: bold; font-size: 11px; color: #1a3a5c; margin-bottom: 12px; font-family: Arial, sans-serif; border-bottom: 2px solid #1a3a5c; padding-bottom: 4px; text-align: right;">BEAM DETAILED CROSS SECTIONS (CONTINUED) / قطاعات تفصيلية للجسور (تابع)</div>`;
    }

    for (const [groupLabel, { designs, memberIds }] of pageGroups) {
      const d = designs[0];
      let b_dim = 300;
      let h_dim = 500;
      for (const design of designs) {
        let beam = beams.find(b => b.id === design.beamId);
        if (!beam && (design as any).mergedCarrierIds) {
          const parts = ((design as any).mergedCarrierIds as string[])
            .map(id => beams.find(b => b.id === id)).filter(Boolean) as Beam[];
          if (parts.length > 0) {
            const largest = parts.reduce((best, b) => b.b * b.h >= best.b * best.h ? b : best, parts[0]);
            b_dim = largest.b; h_dim = largest.h;
          }
        } else if (beam) {
          b_dim = beam.b; h_dim = beam.h;
        }
      }

      let bent: any = null;
      if (options?.bentUpResults) {
        for (const id of memberIds) {
          const canonId = getCanonicalBeamId(id);
          for (const fr of options.bentUpResults) {
            if (!fr) continue;
            const bResult = fr.beams?.find((bb: any) => bb.beamId === id || bb.beamId === canonId);
            if (bResult) {
              bent = bResult;
              break;
            }
          }
          if (bent) break;
        }
      }

      const totalBot = d.flexMid.bars;
      const isShort = d.span <= 2.0;
      const hasBent = !isShort && totalBot >= 3;
      const bentCount = bent ? bent.bentUp.bentBarsCount : (hasBent ? Math.floor(totalBot / 2) : 0);
      const straightBot = bent ? bent.bentUp.remainingBottomBars : (totalBot - bentCount);

      const topDia = bent ? bent.topDia : Math.max(d.flexLeft.dia, d.flexRight.dia);
      const netTop = bent ? bent.finalTopBars : Math.max(2, Math.max(d.flexLeft.bars, d.flexRight.bars) - bentCount);
      const actualBotDia = bent ? bent.bottomDia : d.flexMid.dia;
      const actualTopDia = bent ? bent.topDia : topDia;

      const sm = d.shear.stirrups.match(/Φ(\d+)/);
      const stirDMm = sm ? parseInt(sm[1]) : 10;

      const uniqueIds = [...new Set(memberIds)].sort((a, b) => {
        const na = parseFloat(a.replace(/[^0-9.]/g, ''));
        const nb = parseFloat(b.replace(/[^0-9.]/g, ''));
        return isNaN(na) || isNaN(nb) ? a.localeCompare(b) : na - nb;
      });

      const canonToParts = new Map<string, string[]>();
      for (const id of uniqueIds) {
        const canon = getCanonicalBeamId(id);
        if (!canonToParts.has(canon)) canonToParts.set(canon, []);
        canonToParts.get(canon)!.push(id);
      }

      const uniqueNames: string[] = [];
      for (const [canon, parts] of canonToParts.entries()) {
        let nameToUse = '';
        for (const pId of parts) {
          const bObj = beams.find(x => x.id === pId);
          if (bObj && bObj.name) {
            nameToUse = bObj.name.replace(/-\d+$/, '');
            break;
          }
        }
        if (!nameToUse) {
          const bObjFirst = beams.find(x => x.id === parts[0]);
          if (bObjFirst && bObjFirst.name) {
            nameToUse = bObjFirst.name.replace(/-\d+$/, '');
          } else {
            nameToUse = canon;
          }
        }
        uniqueNames.push(nameToUse);
      }

      pageHtml += `
      <div style="border: 1.5px solid #2a4a6c; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; background: #fafafa; direction: rtl; font-family:'Segoe UI',Arial,Tahoma,sans-serif;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2a4a6c; padding-bottom: 4px; margin-bottom: 8px;">
          <div style="font-weight: bold; font-size: 10px; color: #1a3a5c;">مجموعة الجسور: <span style="background: #1a3a5c; color: #fff; padding: 1px 6px; border-radius: 4px; font-size: 9px; margin-right: 4px;">${groupLabel}</span></div>
          <div style="font-size: 8px; color: #555; font-weight: 500;">أرقام الجسور في المسقط: <span style="color:#000; font-weight:bold;">${uniqueNames.join(', ')}</span></div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
          <div style="background: #fff; border: 1px solid #ddd; border-radius: 4px; padding: 4px 0; display:flex; flex-direction:column; align-items:center;">
            <svg viewBox="0 0 150 150" width="100%" height="115" xmlns="http://www.w3.org/2000/svg">
              ${_svgCrossSection(0, 0, 150, 150, b_dim, h_dim, 40, stirDMm, netTop + bentCount, actualTopDia, straightBot, actualBotDia, 'SEC A-A (START / عند البداية)', bentCount, actualBotDia, true)}
            </svg>
            <div style="font-size: 7.5px; font-weight: bold; color: #8b0000; margin-top: 1px;">ركيزة البداية اليسرى (عزم سالب)</div>
          </div>
          <div style="background: #fff; border: 1px solid #ddd; border-radius: 4px; padding: 4px 0; display:flex; flex-direction:column; align-items:center;">
            <svg viewBox="0 0 150 150" width="100%" height="115" xmlns="http://www.w3.org/2000/svg">
              ${_svgCrossSection(0, 0, 150, 150, b_dim, h_dim, 40, stirDMm, netTop, actualTopDia, totalBot, actualBotDia, 'SEC B-B (MID-SPAN / وسط البحر)', bentCount, actualBotDia, false)}
            </svg>
            <div style="font-size: 7.5px; font-weight: bold; color: #1a56db; margin-top: 1px;">منتصف البحر (عزم موجب رئيسي)</div>
          </div>
          <div style="background: #fff; border: 1px solid #ddd; border-radius: 4px; padding: 4px 0; display:flex; flex-direction:column; align-items:center;">
            <svg viewBox="0 0 150 150" width="100%" height="115" xmlns="http://www.w3.org/2000/svg">
              ${_svgCrossSection(0, 0, 150, 150, b_dim, h_dim, 40, stirDMm, netTop + bentCount, actualTopDia, straightBot, actualBotDia, 'SEC C-C (END / عند النهاية)', bentCount, actualBotDia, true)}
            </svg>
            <div style="font-size: 7.5px; font-weight: bold; color: #8b0000; margin-top: 1px;">ركيزة النهاية اليمنى (عزم سالب)</div>
          </div>
        </div>
      </div>`;
    }

    const activeSheetNo = (1 + beamSecSheetIdx).toString();
    sheetsHTML += `
    <div class="sheet-page" style="position:relative; width:${_SHEET_W}px; height:${_SHEET_H}px; background:white; overflow:hidden; page-break-after:always; font-family:'Segoe UI',Arial,Tahoma,sans-serif; direction:rtl;">
      ${htmlSheetBorder()}
      <div style="position:absolute; top:45px; left:45px; right:45px; height:${svgH}px; overflow:hidden; padding:12px; background:#fff; border:1px solid #ccc;">
        ${pageHtml}
      </div>
      ${htmlTitleBlock({
        ...tbBase,
        drawingTitle: `BEAM CROSS SECTIONS &amp; DETAILS ${bSectionPages.length > 1 ? `(${beamSecSheetIdx})` : ''} / قطاعات تفصيلية للجسور`,
        drawingSubTitle: storyLabel || 'All Floors',
        drawingNumber: sectionDwg,
        sheetNo: activeSheetNo,
        scale: '1:10 / 1:25',
      })}
    </div>`;

    beamSecSheetIdx++;
  }

  // ═══════════════════════════════════════════════════
  // SHEET 3 (COLUMN LAYOUT PLAN)
  // ═══════════════════════════════════════════════════
  const csDwg = makeDrawingNumber(floorCode, 'CS', 1);
  const colPlanSvg = gridSvg
    + svgColumns(columns, tx, ty, mmPerM, true, true, colGroupLabels);

  // Column cross-sections SVG grouped by Arabic group label (ع-1, ع-2)
  const colGroups = new Map<string, ColDesignData[]>();
  for (const cd of colDesigns) {
    const label = colGroupLabels.get(cd.id) ?? cd.id;
    if (!colGroups.has(label)) colGroups.set(label, []);
    colGroups.get(label)!.push(cd);
  }

  let colSectionsSvg = '';
  const groupEntries = Array.from(colGroups.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ar'));
  const secW = 140;
  const secH = 150;
  const colsPerRow = 3;
  let secIdx = 0;
  for (const [label, groupCols] of groupEntries) {
    const rep = groupCols[0];
    const memberIds = groupCols.map(col => col.id).sort((a, b) => {
      const na = parseFloat(a.replace(/[^0-9.]/g, ''));
      const nb = parseFloat(b.replace(/[^0-9.]/g, ''));
      return isNaN(na) || isNaN(nb) ? a.localeCompare(b) : na - nb;
    });

    const row = Math.floor(secIdx / colsPerRow);
    const col = secIdx % colsPerRow;
    const sx = col * secW;
    const sy = row * (secH + 15);
    colSectionsSvg += svgColumnCrossSection(rep, sx, sy, secW, secH, label, memberIds);
    secIdx++;
  }

  const colSecSvgH = Math.ceil(groupEntries.length / colsPerRow) * (secH + 15);
  const colTableAndSections = htmlScaleBarBlock(scaleVal)
    + htmlColumnScheduleTable(colDesigns)
    + `<div style="margin-top:12px;">
        <div style="font-weight:bold; font-size:10px; margin-bottom:4px; font-family:Arial;">COLUMN SECTIONS / مقاطع الأعمدة</div>
        <svg viewBox="0 0 ${colsPerRow * secW} ${colSecSvgH}" width="100%" height="${Math.min(colSecSvgH, 350)}px" xmlns="http://www.w3.org/2000/svg">
          ${colSectionsSvg}
        </svg>
      </div>`;

  sheetsHTML += generateSheetHTML(
    'column-layout',
    colPlanSvg,
    planZoneW, svgH,
    colTableAndSections,
    {
      ...tbBase,
      drawingTitle: 'COLUMN LAYOUT PLAN / مخطط الأعمدة',
      drawingSubTitle: storyLabel || 'All Floors',
      drawingNumber: csDwg,
      sheetNo: (2 + beamSecSheetsCount).toString(),
      scale: scaleText,
    },
  );

  // ═══════════════════════════════════════════════════
  // SHEET 4 (SLAB REINFORCEMENT PLAN)
  // ═══════════════════════════════════════════════════
  const slDwg = makeDrawingNumber(floorCode, 'SL', 1);

  // تحليل الشرائح المستمرة إذا توفرت slabProps وmat
  let stripResults: ContinuousSlabResult[] = [];
  if (slabProps && mat && slabs.length >= 2) {
    try {
      stripResults = analyzeAllContinuousSlabs(slabs, slabProps, mat);
    } catch (_) {
      stripResults = [];
    }
  }

  const slabPlanSvg = gridSvg
    + svgSlabsOnPlan(
        slabs, slabDesigns, tx, ty, mmPerM,
        slabGroupLabels,
      )
    + svgBeamsOnPlan(beams, columns, tx, ty, mmPerM, undefined, true)
    + svgColumns(columns, tx, ty, mmPerM, true, false);

  const slabTableHTML = htmlScaleBarBlock(scaleVal) + htmlSlabScheduleTable(slabDesigns, slabs);

  sheetsHTML += generateSheetHTML(
    'slab-plan',
    slabPlanSvg,
    planZoneW, svgH,
    slabTableHTML,
    {
      ...tbBase,
      drawingTitle: 'SLAB REINFORCEMENT PLAN / مخطط تسليح البلاطات (طريقة الشرائح)',
      drawingSubTitle: storyLabel || 'All Floors',
      drawingNumber: slDwg,
      sheetNo: (3 + beamSecSheetsCount).toString(),
      scale: scaleText,
    },
  );

  // ═══════════════════════════════════════════════════
  // SHEET 5 (GENERAL NOTES)
  // ═══════════════════════════════════════════════════
  const ntDwg = makeDrawingNumber(floorCode, 'NT', 1);
  const devLengths = options?.devLengths || [];
  
  let devLengthRows = '';
  for (const dl of devLengths) {
    devLengthRows += `<tr>
      <td>${dl.dia}</td>
      <td>${dl.ld_straight}</td>
      <td>${dl.ldh_standard_hook}</td>
      <td>${dl.ld_compression}</td>
      <td>${dl.lap_classA}</td>
      <td>${dl.lap_classB}</td>
      <td>${dl.lap_column}</td>
    </tr>`;
  }

  const _gnContentH = _SHEET_H - 45 - (135 + 36 + 10);
  const generalNotesHTML = `
  <div class="sheet-page" style="position:relative; width:${_SHEET_W}px; height:${_SHEET_H}px; background:white; overflow:hidden; page-break-after:always; font-family:'Segoe UI',Arial,Tahoma,sans-serif; direction:rtl;">
    ${htmlSheetBorder()}
    
    <div style="position:absolute; top:45px; left:45px; right:45px; height:${_gnContentH}px; overflow:hidden; padding:10px;">
      <h2 style="text-align:center; font-size:16px; border-bottom:2px solid #000; padding-bottom:6px; margin-bottom:12px;">ملاحظات عامة — GENERAL NOTES</h2>
      
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; font-size:10px;">
        <div>
          <h3 style="font-size:12px; color:#1a56db; border-right:3px solid #1a56db; padding-right:6px;">مواد البناء</h3>
          <ul style="list-style:disc; padding-right:20px; line-height:1.8;">
            <li>مقاومة الخرسانة المميزة f'c = ${fc} ميغاباسكال</li>
            <li>إجهاد خضوع حديد التسليح fy = ${fy} ميغاباسكال</li>
            <li>إجهاد خضوع حديد الكانات fyt = ${fy} ميغاباسكال</li>
            <li>الغطاء الخرساني: 40 مم للجسور والأعمدة، ${options?.titleBlockConfig?.fc ? '20' : '20'} مم للبلاطات</li>
            <li>جميع الأبعاد بالمليمتر ما لم يذكر خلاف ذلك</li>
          </ul>
          
          <h3 style="font-size:12px; color:#1a56db; border-right:3px solid #1a56db; padding-right:6px; margin-top:12px;">معايير التصميم</h3>
          <ul style="list-style:disc; padding-right:20px; line-height:1.8;">
            <li>التصميم وفق الكود الأمريكي ACI 318-19</li>
            <li>الرسومات وفق معيار ACI 315-99</li>
            <li>لوحة العنوان وفق معيار ISO 7200</li>
            <li>حالات التحميل: 1.2D + 1.6L (حرجة) | 1.4D | 0.9D + 1.0E</li>
          </ul>
        </div>
        
        <div>
          <h3 style="font-size:12px; color:#1a56db; border-right:3px solid #1a56db; padding-right:6px;">ملاحظات التنفيذ</h3>
          <ul style="list-style:disc; padding-right:20px; line-height:1.8;">
            <li>يجب التحقق من أطوال التماسك والوصلات حسب الكود</li>
            <li>يجب توفير أكبر إقصاء ممكن لعناصر الأعمدة في المناطق الحرجة</li>
            <li>لا يجوز قطع أكثر من نصف حديد التسليح عند نفس المقطع</li>
            <li>يجب أن تكون مسافة الوصل لا تقل عن ld حسب الجدول أدناه</li>
            <li>يجب فحص الخرسانة بعد 7 أيام و 28 يوماً</li>
            <li>البلاطات: تسليح أدنى في الاتجاه الرئيسي والثانوي</li>
            <li>أقصى مسافة بين الكانات في المنطقة الحرجة: d/4 أو 8db أو 300 مم (الأقل)</li>
          </ul>
        </div>
      </div>
      
      ${devLengths.length > 0 ? `
      <div style="margin-top:16px;">
        <h3 style="font-size:12px; color:#1a56db; border-right:3px solid #1a56db; padding-right:6px;">جدول أطوال التماسك (مم) — Development Lengths</h3>
        <table style="width:100%; border-collapse:collapse; font-size:9px; margin-top:6px;">
          <thead>
            <tr>
              <th style="border:1px solid #000; background:#000; color:#fff; padding:4px;">القطر Φ</th>
              <th style="border:1px solid #000; background:#000; color:#fff; padding:4px;">ld مستقيم</th>
              <th style="border:1px solid #000; background:#000; color:#fff; padding:4px;">ldh خطاف</th>
              <th style="border:1px solid #000; background:#000; color:#fff; padding:4px;">ld ضغط</th>
              <th style="border:1px solid #000; background:#000; color:#fff; padding:4px;">وصل A</th>
              <th style="border:1px solid #000; background:#000; color:#fff; padding:4px;">وصل B</th>
              <th style="border:1px solid #000; background:#000; color:#fff; padding:4px;">وصل عمود</th>
            </tr>
          </thead>
          <tbody>${devLengthRows}</tbody>
        </table>
      </div>` : ''}
    </div>
    
    ${htmlTitleBlock({
      ...tbBase,
      drawingTitle: 'GENERAL NOTES / ملاحظات عامة',
      drawingSubTitle: storyLabel || 'All Floors',
      drawingNumber: ntDwg,
      sheetNo: (4 + beamSecSheetsCount).toString(),
      scale: 'N.T.S.',
    })}
  </div>`;

  sheetsHTML += generalNotesHTML;

  // ═══════════════════════════════════════════════════
  // SHEET 6+: BBS (Bar Bending Schedule)
  // ═══════════════════════════════════════════════════
  if (beamDesigns.length > 0 || colDesigns.length > 0) {
    const bbsSheetNo = 5 + beamSecSheetsCount;
    sheetsHTML += htmlBBSSheet(beams, beamDesigns, colDesigns, slabDesigns, { ...tbBase, drawingSubTitle: storyLabel || 'All Floors' }, floorCode, bbsSheetNo);
  }

  // Wrap everything in a printable HTML document
  // ═══════════════════════════════════════════════════
  // FOUNDATION BLUEPRINT SHEETS (IFC Package)
  // ═══════════════════════════════════════════════════
  const optAny = options as any;
  if (optAny?.foundationResults && optAny.foundationResults.length > 0) {
    const fndTypes = optAny.drawingTypes || {};
    
    // Check if any foundation sheet is selected
    const hasAnyFnd = fndTypes.foundationPlan || fndTypes.fndSchedule || fndTypes.fndDetails || fndTypes.fndBbs || fndTypes.fndTakeoff || fndTypes.fndNotes;
    
    if (hasAnyFnd) {
      // Setup foundation projection/data
      const fndCols = optAny.columns || columns;
      const minZ = Math.min(...fndCols.map((c: any) => c.zBottom ?? 0));
      const groundCols = fndCols.filter((col: any) => Math.abs((col.zBottom ?? 0) - minZ) < 1);
      const validCols = groundCols.length > 0 ? groundCols : fndCols;

      let loadsToUse = optAny.colLoads3D;
      if (!loadsToUse || loadsToUse.size === 0) {
        const map = new Map<string, any>();
        map.set('C1', { P_service: 250 });
        loadsToUse = map;
      }

      const finalLoadsMap = new Map<string, any>();
      validCols.forEach((c: any) => {
        const load = loadsToUse?.get(c.id);
        if (load) {
          finalLoadsMap.set(c.id, {
            P_service: load.P_service ?? (load.Pu ? load.Pu / 1.2 : 250),
            Pu: load.Pu ?? (load.P_service ? load.P_service * 1.4 : 350),
            MxBot: load.MxBot ?? load.Mx ?? 0,
            MyBot: load.MyBot ?? load.My ?? 0,
            Vu: load.Vu ?? 0
          });
        } else {
          finalLoadsMap.set(c.id, { P_service: 250, Pu: 350, MxBot: 0, MyBot: 0, Vu: 0 });
        }
      });

      const fcValue = optAny.fc || tbBase.fc || 25;
      const fyValue = optAny.fy || tbBase.fy || 420;

      const projectMaterials = {
        fc: fcValue,
        fy: fyValue,
        qa: 150,
        cover: 75,
        gamma_conc: 24,
        gamma_soil: 18,
        Df: 1.2 + 0.5
      };

      const projectData = generateProjectDetailing(
        validCols,
        finalLoadsMap,
        projectMaterials,
        {
          naturalGroundLevel: 1500,
          excavationOffset: 500
        }
      );

      // Boundaries & scales for S-101 Map
      const planSvgWidth = 600;
      const planSvgHeight = 450;
      const svgPaddingProj = 60;

      const locs = projectData.locations;
      const rawX = locs.map(l => l.x);
      const rawY = locs.map(l => l.y);
      const minX_fnd = locs.length > 0 ? Math.min(...rawX) : -2;
      const maxX_fnd = locs.length > 0 ? Math.max(...rawX) : 2;
      const minY_fnd = locs.length > 0 ? Math.min(...rawY) : -2;
      const maxY_fnd = locs.length > 0 ? Math.max(...rawY) : 2;

      const projectBounds = {
        minX: minX_fnd - 2.0,
        maxX: maxX_fnd + 2.0,
        minY: minY_fnd - 2.0,
        maxY: maxY_fnd + 2.0,
        width: (maxX_fnd - minX_fnd) + 4.0,
        height: (maxY_fnd - minY_fnd) + 4.0
      };

      const scaleProj = Math.min(
        (planSvgWidth - 2 * svgPaddingProj) / projectBounds.width,
        (planSvgHeight - 2 * svgPaddingProj) / projectBounds.height
      );

      const mapX = (xVal: number) => svgPaddingProj + (xVal - projectBounds.minX) * scaleProj;
      const mapY = (yVal: number) => svgPaddingProj + (projectBounds.maxY - yVal) * scaleProj; // Flip geom axes

      // Now generate selected sheets
      const fndSheets = [
        { id: 'S-101', enabled: fndTypes.foundationPlan, title: 'FOUNDATION LAYOUT & PLAN', arabicTitle: 'مخطط توزيع الأساسات والمحاور العام' },
        { id: 'S-201', enabled: fndTypes.fndSchedule, title: 'APPROVED FOOTINGS SCHEDULE', arabicTitle: 'جدول نماذج القواعد المعتمد' },
        { id: 'S-301', enabled: fndTypes.fndDetails, title: 'TYPICAL REBAR DETAILS & SECTIONS', arabicTitle: 'تفاصيل تسليح وقطاعات إنشائية' },
        { id: 'S-401', enabled: fndTypes.fndBbs, title: 'BAR BENDING SCHEDULE (BBS)', arabicTitle: 'كشف تفريد حديد تسليح القواعد' },
        { id: 'S-402', enabled: fndTypes.fndTakeoff, title: 'MATERIALS & TAKE-OFF MEMO', arabicTitle: 'بيان مساحات ومذكرة كميات المواد' },
        { id: 'NOTES', enabled: fndTypes.fndNotes, title: 'GENERAL SPECIFICATIONS', arabicTitle: 'الملاحظات الإنشائية واشتراطات التنفيذ' },
      ];

      fndSheets.forEach((fSheet) => {
        if (!fSheet.enabled) return;

        let typedContent = '';
        const typicalH = projectData.types[0]?.H || 500;

        switch (fSheet.id) {
          case 'S-101':
            typedContent = `
              <div style="width:100%; height:100%; display:flex; justify-content:center; align-items:center; background:#ffffff; padding:15px; box-sizing:border-box;">
                <div style="text-align:center; width:100%;">
                  <h3 style="margin:5px 0; font-size:14px; font-weight:bold; color:#1e293b;">مخطط أساسات مشروع: ${projectName}</h3>
                  <div style="border:1.5px solid #cbd5e1; border-radius:8px; overflow:hidden; background:#f8fafc; padding:20px; max-width:600px; margin:0 auto;">
                    <svg viewBox="0 0 600 450" width="100%" height="auto" style="display:block; margin:0 auto; background:#ffffff;">
                      <g stroke="#cbd5e1" stroke-width="0.8" stroke-dasharray="4 4">
                        ${projectData.xGridLines.map(gl => `<line x1="${mapX(gl.coord)}" y1="25" x2="${mapX(gl.coord)}" y2="${planSvgHeight - 30}" />`).join('')}
                        ${projectData.yGridLines.map(gl => `<line x1="25" y1="${mapY(gl.coord)}" x2="${planSvgWidth - 25}" y2="${mapY(gl.coord)}" />`).join('')}
                      </g>
                      <g font-size="9" font-family="Cairo, sans-serif" font-weight="bold" fill="#334155">
                        ${projectData.xGridLines.map(gl => `
                          <circle cx="${mapX(gl.coord)}" cy="15" r="8" fill="#f8fafc" stroke="#64748b" stroke-width="1" />
                          <text x="${mapX(gl.coord)}" y="18" text-anchor="middle" font-size="8">${gl.label}</text>
                        `).join('')}
                        ${projectData.yGridLines.map(gl => `
                          <circle cx="15" cy="${mapY(gl.coord)}" r="8" fill="#f8fafc" stroke="#64748b" stroke-width="1" />
                          <text x="15" y="${mapY(gl.coord) + 3}" text-anchor="middle" font-size="8">${gl.label}</text>
                        `).join('')}
                      </g>
                      ${projectData.locations.map(loc => {
                        const type = projectData.types.find(t => t.typeMark === loc.typeMark)!;
                        const w_m = type.B / 1000;
                        const l_m = type.L / 1000;
                        const footW = w_m * scaleProj;
                        const footH = l_m * scaleProj;
                        const fX = mapX(loc.x) - footW / 2;
                        const fY = mapY(loc.y) - footH / 2;

                        const colW = (loc.colB / 1000) * scaleProj;
                        const colH = (loc.colH / 1000) * scaleProj;
                        const cX = mapX(loc.x) - colW / 2;
                        const cY = mapY(loc.y) - colH / 2;

                        return `
                          <g>
                            <rect x="${fX}" y="${fY}" width="${footW}" height="${footH}" fill="rgba(30,41,59,0.05)" stroke="#475569" stroke-width="1.2" rx="2" />
                            <rect x="${cX}" y="${cY}" width="${colW}" height="${colH}" fill="#e11d48" stroke="#be123c" stroke-width="0.8" />
                            <rect x="${mapX(loc.x) - 12}" y="${fY - 12}" width="24" height="10" fill="#0f172a" rx="2" />
                            <text x="${mapX(loc.x)}" y="${fY - 4}" fill="#06b6d4" text-anchor="middle" font-size="7" font-weight="bold">${loc.typeMark}</text>
                            <text x="${mapX(loc.x)}" y="${mapY(loc.y) + (colH/2) + 11}" fill="#64748b" text-anchor="middle" font-size="6.5" font-family="monospace">${loc.colId}</text>
                          </g>
                        `;
                      }).join('')}
                    </svg>
                  </div>
                </div>
              </div>
            `;
            break;
          case 'S-201':
            typedContent = `
              <div style="padding: 20px; font-family:'Cairo', 'Segoe UI', sans-serif; direction:rtl; text-align:right;">
                <table style="width:100%; border-collapse:collapse; font-size:11px; margin-top:10px;">
                  <thead>
                    <tr style="background:#0f172a; color:#ffffff;">
                      <th style="border:1px solid #cbd5e1; padding:8px; border:1px solid black;">رمز النموذج</th>
                      <th style="border:1px solid #cbd5e1; padding:8px; border:1px solid black;">العرض B (mm)</th>
                      <th style="border:1px solid #cbd5e1; padding:8px; border:1px solid black;">الطول L (mm)</th>
                      <th style="border:1px solid #cbd5e1; padding:8px; border:1px solid black;">السماكة H (mm)</th>
                      <th style="border:1px solid #cbd5e1; padding:8px; border:1px solid black;">الغطاء الصافي (mm)</th>
                      <th style="border:1px solid #cbd5e1; padding:8px; border:1px solid black;">حديد التسليح الاتجاه X</th>
                      <th style="border:1px solid #cbd5e1; padding:8px; border:1px solid black;">حديد التسليح الاتجاه Y</th>
                      <th style="border:1px solid #cbd5e1; padding:8px; border:1px solid black;">العدد بالمشروع</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${projectData.types.map(t => `
                      <tr>
                        <td style="border:1px solid #cbd5e1; padding:8px; border:1px solid black; font-weight:bold; background:#f8fafc;">${t.typeMark}</td>
                        <td style="border:1px solid #cbd5e1; padding:8px; border:1px solid black; font-family:monospace; text-align:center;">${t.B}</td>
                        <td style="border:1px solid #cbd5e1; padding:8px; border:1px solid black; font-family:monospace; text-align:center;">${t.L}</td>
                        <td style="border:1px solid #cbd5e1; padding:8px; border:1px solid black; font-family:monospace; text-align:center;">${t.H}</td>
                        <td style="border:1px solid #cbd5e1; padding:8px; border:1px solid black; font-family:monospace; text-align:center;">75</td>
                        <td style="border:1px solid #cbd5e1; padding:8px; border:1px solid black; font-weight:bold; text-align:center; color:#1e3a8a;">${t.rebarX.quantity} Ø ${t.rebarX.diameter}</td>
                        <td style="border:1px solid #cbd5e1; padding:8px; border:1px solid black; font-weight:bold; text-align:center; color:#1e3a8a;">${t.rebarY.quantity} Ø ${t.rebarY.diameter}</td>
                        <td style="border:1px solid #cbd5e1; padding:8px; border:1px solid black; font-weight:bold; text-align:center; font-family:monospace; background:#f1f5f9;">${t.footingCount}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `;
            break;
          case 'S-301':
            typedContent = `
              <div style="padding: 20px; font-family:'Cairo', 'Segoe UI', sans-serif; direction:rtl; text-align:right;">
                <div style="display:flex; gap:20px; justify-content:center; align-items:center;">
                  <div style="border:1px solid #cbd5e1; padding:15px; border-radius:6px; background:#fff; text-align:center; width:48%;">
                    <h4 style="margin:0 0 10px 0; font-size:11px; font-weight:bold; color:#0f172a;">تفاصيل فرشة وحصيرة التسليح (مسقط أفقي نموذجي)</h4>
                    <svg viewBox="0 0 260 220" width="100%" height="auto" style="border:1px solid #e2e8f0; background:#f8fafc; display:block; margin:0 auto;">
                      <rect x="40" y="20" width="180" height="180" fill="rgba(30,41,59,0.02)" stroke="#1e293b" stroke-width="1.5" />
                      <rect x="115" y="95" width="30" height="30" fill="#f43f5e" stroke="#fda4af" stroke-width="0.8" />
                      <g stroke="#10b981" stroke-width="1" opacity="0.8">
                        ${[35, 53, 71, 89, 107, 125, 143, 161, 179].map(x => `<line x1="${x + 20}" y1="20" x2="${x + 20}" y2="200" />`).join('')}
                        ${[35, 53, 71, 89, 107, 125, 143, 161, 179].map(y => `<line x1="40" y1="${y + 10}" x2="220" y2="${y + 10}" />`).join('')}
                      </g>
                      <text x="130" y="15" fill="#1e3a8a" font-size="8" font-weight="bold" text-anchor="middle">الاتجاه القصير X (تسليح سفلي فرش)</text>
                      <text x="235" y="110" fill="#1e3a8a" font-size="8" font-weight="bold" transform="rotate(90 235 110)" text-anchor="middle">الاتجاه الطويل Y (غطاء)</text>
                    </svg>
                  </div>
                  <div style="border:1px solid #cbd5e1; padding:15px; border-radius:6px; background:#fff; text-align:center; width:48%;">
                    <h4 style="margin:0 0 10px 0; font-size:11px; font-weight:bold; color:#0f172a;">قطاع رأسي نموذجي لصب الأساس والعمود (Section A-A)</h4>
                    <svg viewBox="0 0 260 220" width="100%" height="auto" style="border:1px solid #e2e8f0; background:#f8fafc; display:block; margin:0 auto;">
                      <path d="M 30 190 L 30 130 L 230 130 L 230 190 Z" fill="rgba(30,41,59,0.03)" stroke="#1e293b" stroke-width="1.5" />
                      <rect x="115" y="30" width="30" height="100" fill="rgba(30,41,59,0.06)" stroke="#1e293b" stroke-width="1.2" />
                      <path d="M 40 180 L 220 180 M 40 180 L 40 160 M 220 180 L 220 160" fill="none" stroke="#e11d48" stroke-width="2" />
                      <path d="M 120 180 L 120 70 M 140 180 L 140 70" fill="none" stroke="#2563eb" stroke-width="1.5" />
                      <text x="130" y="212" fill="#475569" font-size="8" font-weight="bold" text-anchor="middle">سمك الأساس الإجمالي H = ${typicalH} مم</text>
                      <text x="130" y="150" fill="#e11d48" font-size="8" font-weight="bold" text-anchor="middle">حديد شبكة القاع (Hooked Rebar)</text>
                    </svg>
                  </div>
                </div>
              </div>
            `;
            break;
          case 'S-401':
            typedContent = `
              <div style="padding: 20px; font-family:'Cairo', 'Segoe UI', sans-serif; direction:rtl; text-align:right;">
                <table style="width:100%; border-collapse:collapse; font-size:11px; margin-top:10px; text-align:center;">
                  <thead>
                    <tr style="background:#020617; color:#ffffff;">
                      <th style="border:1px solid #cbd5e1; padding:8px; border:1px solid black;">رمز النموذج</th>
                      <th style="border:1px solid #cbd5e1; padding:8px; border:1px solid black;">السيخ</th>
                      <th style="border:1px solid #cbd5e1; padding:8px; border:1px solid black;">القطر mm</th>
                      <th style="border:1px solid #cbd5e1; padding:8px; border:1px solid black;">الشكل المعياري</th>
                      <th style="border:1px solid #cbd5e1; padding:8px; border:1px solid black;">العدد الكلي بالمشروع</th>
                      <th style="border:1px solid #cbd5e1; padding:8px; border:1px solid black;">الطول المفرد (م)</th>
                      <th style="border:1px solid #cbd5e1; padding:8px; border:1px solid black;">الوزن الشامل (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${projectData.types.flatMap((type) => 
                      type.bbs.map((b, bidx) => `
                        <tr>
                          ${bidx === 0 ? `<td style="border:1px solid #cbd5e1; padding:8px; border:1px solid black; font-weight:bold; background:#f8fafc;" rowspan="${type.bbs.length}">${type.typeMark}</td>` : ''}
                          <td style="border:1px solid #cbd5e1; padding:8px; border:1px solid black; font-family:monospace; font-weight:bold;">${b.barMark}</td>
                          <td style="border:1px solid #cbd5e1; padding:8px; border:1px solid black; font-family:monospace;">Ø${b.diameter}</td>
                          <td style="border:1px solid #cbd5e1; padding:8px; border:1px solid black; color:#475569;">${b.shapeCode === 11 ? 'سيخ عاكف بزاوية (Hooked)' : 'سيخ مفرود (Straight)'}</td>
                          <td style="border:1px solid #cbd5e1; padding:8px; border:1px solid black; font-family:monospace;">${b.qty}</td>
                          <td style="border:1px solid #cbd5e1; padding:8px; border:1px solid black; font-family:monospace; font-weight:bold; color:#1e3a8a;">${b.totalLengthM.toFixed(2)}</td>
                          <td style="border:1px solid #cbd5e1; padding:8px; border:1px solid black; font-family:monospace; font-weight:bold; color:#047857;">${b.totalWeightKg.toFixed(1)} كغ</td>
                        </tr>
                      `)
                    ).join('')}
                  </tbody>
                </table>
              </div>
            `;
            break;
          case 'S-402':
            const totalConc = projectData.types.reduce((acc, t) => acc + (t.concreteVolumeIndividual * t.footingCount), 0);
            const totalSteel = projectData.types.reduce((acc, t) => acc + (t.steelWeightIndividual * t.footingCount), 0);
            typedContent = `
              <div style="padding: 20px; font-family:'Cairo', 'Segoe UI', sans-serif; direction:rtl; text-align:right; max-width:800px; margin:0 auto;">
                <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:20px; border-radius:8px;">
                  <h4 style="margin:0 0 15px 0; font-size:14px; font-weight:bold; color:#0f172a; border-bottom:2px solid #581c87; padding-bottom:5px;">بيان موازنة وكميات الأساسات بالمشروع الكامل:</h4>
                  <ul style="list-style-type:none; padding:0; margin:0 0 20px 0; font-size:12px; line-height:2.2;">
                    <li style="border-bottom:1px dashed #cbd5e1; padding:5px 0;"><span style="color:#475569; display:inline-block; width:220px;">الخرسانة المسلحة الشاملة بالقواعد:</span> <strong style="font-size:13px; color:#1e3a8a;">${totalConc.toFixed(2)} متر مكعب (m³)</strong></li>
                    <li style="border-bottom:1px dashed #cbd5e1; padding:5px 0;"><span style="color:#475569; display:inline-block; width:220px;">الوزن الإجمالي لحديد التسليح:</span> <strong style="font-size:13px; color:#047857;">${totalSteel.toFixed(0)} كيلوغرام (kg)</strong></li>
                    <li style="border-bottom:1px dashed #cbd5e1; padding:5px 0;"><span style="color:#475569; display:inline-block; width:220px;">كثافة حديد التسليح لكل دور تأسيس:</span> <strong style="font-size:13px; color:#b45309;">${(totalSteel / Math.max(1, totalConc)).toFixed(1)} كغ / م³</strong></li>
                  </ul>
                  <div style="background:#ffedd5; border:1px solid #fed7aa; padding:15px; border-radius:6px; font-size:11px; text-align:right; color:#7c2d12; line-height:1.6;">
                    <strong>💡 تنبيه حصر الكميات للموقع:</strong>
                    <p style="margin:5px 0 0 0;">تم إدراج نسبة 5% للهدر الإضافي لحديد التسليح بالموقع مع افتراض 75 مم خلوص جانبي طبقاً للمعاير الاستشارية الدقيقة.</p>
                  </div>
                </div>
              </div>
            `;
            break;
          case 'NOTES':
            typedContent = `
              <div style="padding: 20px; font-family:'Cairo', 'Segoe UI', sans-serif; direction:rtl; text-align:right; font-size:11px; line-height:1.8;">
                <h4 style="font-size:13px; font-weight:bold; border-bottom:2px solid #000; padding-bottom:4px; color:#1e293b;">ملاحظات وشروط تنفيذ الأساسات الخرسانية (General Concrete Rules)</h4>
                <ol style="margin-top:10px; padding-right:20px;">
                  <li>كود التصميم الإنشائي الجيوتقني المتبع هو كود البناء السعودي SBC 304 المعد لمنشآت الخرسانة المسلحة والمكافئ لـ ACI 318 الأمريكي.</li>
                  <li>مقاومة الخرسانة المميزة للكسر بعد 28 يوماً للأسطوانات fc' = 25 MPa، والحديد المستخدم ذو رتبة fy = 420 MPa عالي الشد.</li>
                  <li>الغطاء الخرساني الصافي لحديد تسليح القواعد الملامس للتربة يبلغ 75 مم لمنع تآكل أو تغلغل صدأ الرطوبة للشبكة.</li>
                  <li>تجهّز التربة بالحفر لمنسوب التأسيس المعتمد في السبر (-1500 مم) ثم ترش الخرسانة العادية (النظافة) بسمك 10 سم قبل تركيب طوبار الحديد والنجارة الشغل.</li>
                  <li>تحفظ القواعد الخرسانية بالرش بالماء العذب مرتين يومياً لمدة 7 أيام متتالية تبدأ بعد 24 ساعة من انتهاء الصب.</li>
                </ol>
              </div>
            `;
            break;
        }

        // Add AutoCAD frame around foundation drawings
        sheetsHTML += `
        <div class="sheet-page" style="position:relative; width:1200px; height:840px; background:#fff; margin:30px auto; box-shadow:0 0 15px rgba(0,0,0,0.2); overflow:hidden; page-break-after:always; box-sizing:border-box; padding:40px;">
          <div style="position:absolute; left:20px; top:20px; right:20px; bottom:20px; border:2.5px solid #000;"></div>
          <div style="position:absolute; left:28px; top:28px; right:28px; bottom:28px; border:1px solid #000;"></div>
          
          <div style="position:absolute; left:40px; top:40px; right:40px; bottom:180px; border:0.5px solid #aaa; overflow:auto; background:#ffffff;">
            <div style="background:#0f172a; color:#fff; padding:6px 12px; font-weight:bold; font-size:11px; font-family:sans-serif; text-transform:uppercase; text-align:right;">
              ${fSheet.arabicTitle} [${fSheet.id}]
            </div>
            ${typedContent}
          </div>

          <div style="position:absolute; left:40px; bottom:40px; right:40px; height:120px; border:2px solid #000; display:flex; font-family:Arial, sans-serif; direction:rtl; text-align:right;">
            <div style="width:25%; border-left:1px solid #000; padding:10px; display:flex; flex-direction:column; justify-content:space-around;">
              <span style="font-size:8px; color:#555;">اسم المشروع / PROJECT NAME</span>
              <strong style="font-size:11px; color:#1e3a8a;">${projectName}</strong>
              <span style="font-size:8px; color:#555;">موقع المشروع / LOCATION: ${tbBase.projectLocation || 'Saudi Arabia (KSA)'}</span>
            </div>
            <div style="width:35%; border-left:1px solid #000; padding:10px; display:flex; flex-direction:column; justify-content:space-around;">
              <span style="font-size:8px; color:#555;">عنوان اللوحة الهندسية / SHEET TITLE</span>
              <strong style="font-size:11px; color:#b91c1c;">${fSheet.arabicTitle}</strong>
              <span style="font-size:8px; color:#555;">SYSTEM: INTEGRATED PROPORTIONAL FOUNDATIONS BLUEPRINT</span>
            </div>
            <div style="width:20%; border-left:1px solid #000; padding:10px; display:flex; flex-direction:column; justify-content:space-around; font-size:9px;">
              <div><span style="color:#555;">مكتب التصميم:</span> <strong>Blueprint Detailing Studio</strong></div>
              <div><span style="color:#555;">كود التصميم:</span> ACI 318-19 / SBC 304</div>
            </div>
            <div style="width:10%; border-left:1px solid #000; padding:10px; display:flex; flex-direction:column; justify-content:space-between; font-size:9px;">
              <div><span style="color:#555;">تصميم:</span> <strong>Eng. Detailing AI</strong></div>
              <div><span style="color:#555;">تدقيق:</span> <strong>Senior Detailing Eng.</strong></div>
            </div>
            <div style="width:10%; padding:10px; display:flex; flex-direction:column; justify-content:space-between; align-items:center; background:#f9fafb;">
              <div style="text-align:center;">
                <span style="font-size:8px; color:#555; display:block;">رقم اللوحة / SHEET</span>
                <strong style="font-size:14px; color:#b91c1c;">${fSheet.id}</strong>
              </div>
              <div style="text-align:center; font-size:9px; border-top:1px solid #ccc; width:100%; padding-top:4px;">
                SCALE 1:50
              </div>
            </div>
          </div>
        </div>
        `;
      });
    }
  }

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>${projectName} - ${floorCode} - لوحات إنشائية</title>
  <style>
    @page { size: ${_CSS_PAPER} landscape; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #e0e0e0; font-family: 'Segoe UI', 'Arial', 'Tahoma', sans-serif; direction: ltr; }
    .sheet-page { margin: 10px auto; box-shadow: 0 2px 10px rgba(0,0,0,0.3); }
    table td, table th { border: 1px solid #333; padding: 3px 5px; text-align: center; }
    @media print {
      body { background: white; }
      .sheet-page { margin: 0; box-shadow: none; page-break-after: always; }
    }
  </style>
</head>
<body>
  ${sheetsHTML}
</body>
</html>`;
}

// ─── Open in new window for printing ───

export function openHTMLSheetsForPrint(
  slabs: Slab[],
  beams: Beam[],
  columns: Column[],
  beamDesigns: BeamDesignData[],
  colDesigns: ColDesignData[],
  slabDesigns: SlabDesignData[],
  projectName: string,
  options?: ExportOptions,
  paperSize: 'A1' | 'A3' | 'A4' | 'auto' = 'auto',
  slabProps?: SlabProps,
  mat?: MatProps,
  ribbedSlabProps?: any,
): void {
  const htmlContent = generateHTMLConstructionSheets(
    slabs, beams, columns, beamDesigns, colDesigns, slabDesigns,
    projectName, options, paperSize, slabProps, mat, ribbedSlabProps
  );
  
  import('@/lib/capacitorDownload').then(({ openHTMLForPrint }) =>
    openHTMLForPrint(htmlContent)
  );
}
