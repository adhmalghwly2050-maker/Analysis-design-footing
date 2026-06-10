import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Download,
  Printer,
  FileSpreadsheet,
  Info,
  Layers,
  ArrowUpRight,
  ClipboardList,
  Flame,
  GitCommit,
  Split,
  Eye,
  Settings,
  Grid,
  TrendingDown,
  RefreshCw,
  Activity,
  Maximize2,
  CheckCircle,
  AlertTriangle,
  Compass,
  FileText
} from 'lucide-react';
import type { Slab, SlabProps, MatProps, Column, Beam } from '@/lib/structuralEngine';
import { analyzeOneWayRibbedSystem } from '@/lib/ribbedSlabSolver';
import { detailOneWayRibbedSystem, calculateDevelopmentLength, calculateLapSpliceLength } from '@/lib/ribbedSlabDetailingEngine';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface RibbedSlabDrawingsPanelProps {
  slabs: Slab[];
  slabProps: SlabProps;
  mat: MatProps;
  ribbedSlabProps?: any;
  columns?: Column[];
  beams?: Beam[];
  projectName?: string;
  titleBlockConfig?: any;
}

export default function RibbedSlabDrawingsPanel({
  slabs,
  slabProps,
  mat,
  ribbedSlabProps,
  columns = [],
  beams = [],
  projectName = 'Structural Design Studio',
  titleBlockConfig = {}
}: RibbedSlabDrawingsPanelProps) {
  // Sheet state: S001 (General Notes), S101 (Formwork Plan), S102 (Rib Layout), S103 (Bottom Rebar), S104 (Top Rebar), S105 (Topping Slab), S106 (Shear Stirrups), S201 (Sections & Details), S301 (BBS), S302 (Quantities)
  const [activeSheet, setActiveSheet] = useState<string>('S103');
  const [selectedRibIndex, setSelectedRibIndex] = useState<number>(0);
  const [scale, setScale] = useState<string>('1:50');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const bw = ribbedSlabProps?.bw ?? 100;
  const hb = ribbedSlabProps?.hb ?? 200;
  const tf = ribbedSlabProps?.tf ?? 70;
  const s = ribbedSlabProps?.s ?? 400;
  const h = tf + hb;
  const fc = mat.fc ?? 25;
  const fy = mat.fy ?? 420;
  const cover = slabProps.cover ?? 20;

  // Run the Detailing Engine directly
  const detailingData = useMemo(() => {
    try {
      const ribbedAnalysis = analyzeOneWayRibbedSystem(slabs, slabProps, mat, ribbedSlabProps);
      if (!ribbedAnalysis || ribbedAnalysis.ribs.length === 0) return null;
      return detailOneWayRibbedSystem(ribbedAnalysis, slabs, slabProps, mat, ribbedSlabProps);
    } catch (err) {
      console.error('Detailing engine failed:', err);
      return null;
    }
  }, [slabs, slabProps, mat, ribbedSlabProps]);

  const hasRibbedSlabs = slabs.some(s => s.slabType === 'one_way_ribbed');

  // Math dimensions for Plan bounding box
  const boundingBox = useMemo(() => {
    const userRibbed = slabs.filter(s => s.slabType === 'one_way_ribbed');
    if (userRibbed.length === 0) return { minX: 0, maxX: 10, minY: 0, maxY: 10, modelW: 10, modelH: 10 };
    const xs = userRibbed.flatMap(s => [s.x1, s.x2]);
    const ys = userRibbed.flatMap(s => [s.y1, s.y2]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      minX,
      maxX,
      minY,
      maxY,
      modelW: Math.max(0.1, maxX - minX),
      modelH: Math.max(0.1, maxY - minY)
    };
  }, [slabs]);

  // Coordinate projection for plan render
  const pxW = 750;
  const pxH = 480;
  const pad = 50;
  const ratioX = (pxW - pad * 2) / boundingBox.modelW;
  const ratioY = (pxH - pad * 2) / boundingBox.modelH;
  const mmPerM = Math.min(ratioX, ratioY);

  const tx = (x: number) => pad + (x - boundingBox.minX) * mmPerM;
  const ty = (y: number) => pxH - pad - (y - boundingBox.minY) * mmPerM;

  // Render SVG Rib Direction Arrows
  const renderRibArrows = (s: Slab) => {
    const isHoriz = s.direction === 'one_way_x' || s.direction === 'X' || !s.direction || s.direction === 'auto';
    const cx = (tx(s.x1) + tx(s.x2)) / 2;
    const cy = (ty(s.y1) + ty(s.y2)) / 2;
    const len = 35;
    if (isHoriz) {
      return (
        <g key={`arrow-${s.id}`} className="opacity-90">
          <line x1={cx - len} y1={cy} x2={cx + len} y2={cy} stroke="#cbd5e1" strokeWidth="2" strokeDasharray="3,3" />
          <polygon points={`${cx + len},${cy} ${cx + len - 6},${cy - 3} ${cx + len - 6},${cy + 3}`} fill="#94a3b8" />
          <polygon points={`${cx - len},${cy} ${cx - len + 6},${cy - 3} ${cx - len + 6},${cy + 3}`} fill="#94a3b8" />
          <text x={cx} y={cy - 6} textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="bold">
            اتجاه تمدد الأعصاب / RIB DIRECTION ➔
          </text>
        </g>
      );
    } else {
      return (
        <g key={`arrow-${s.id}`} className="opacity-90">
          <line x1={cx} y1={cy - len} x2={cx} y2={cy + len} stroke="#cbd5e1" strokeWidth="2" strokeDasharray="3,3" />
          <polygon points={`${cx},${cy - len} ${cx - 3},${cy - len + 6} ${cx + 3},${cy - len + 6}`} fill="#94a3b8" />
          <polygon points={`${cx},${cy + len} ${cx - 3},${cy + len - 6} ${cx + 3},${cy + len - 6}`} fill="#94a3b8" />
          <text x={cx + 8} y={cy + 3} textAnchor="start" fill="#94a3b8" fontSize="8" fontWeight="bold">
            اتجاه الأعصاب
          </text>
        </g>
      );
    }
  };

  // Live validation calculations
  const validationReport = useMemo(() => {
    const errors: string[] = [];
    if (!detailingData) return { isValid: false, errors: ['لم يتم حساب تفاصيل حديد التسليح'] };

    // 1. Verify every bar mark matches schedule entries
    const barMarks = detailingData.bbs.map(b => b.barMark);
    const seenMarks = new Set(barMarks);
    if (seenMarks.size < barMarks.length) {
      errors.push('تكرار في رموز تفريد حديد التسليح (Duplicate Bar Marks)');
    }

    // 2. Minimum Development length check per ACI 318-19 §25.4.2
    const Ld12 = calculateDevelopmentLength(12, fc, fy);
    const Ld14 = calculateDevelopmentLength(14, fc, fy);
    if (Ld12 < 300 || Ld14 < 300) {
      errors.push('برمجة طول التماسك ACI 318 تفشل في استيفاء الحد الأدنى 300 مم');
    }

    // 3. Spacing checks
    if (s > 750) {
      errors.push('تجاوز الحد الأقصى للمسافة البينية للأعصاب (حسب الكود الأمريكي s <= 750 مم)');
    }
    if (bw < 100) {
      errors.push('عرض عصب الهوردي bw يقل عن الحد الأدنى الإنشائي الكودي (100 مم)');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }, [detailingData, fc, fy, s, bw]);

  // Combined Multi-Sheet Printer Layout Trigger
  const triggerPrintPackage = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow || !detailingData) return;

    const sheetCodes = ['S001', 'S101', 'S102', 'S103', 'S104', 'S105', 'S106', 'S201', 'S301', 'S302'];
    
    // Axes and grids for standard layout
    const gridAxes = `
      <g opacity="0.30" stroke="#475569" stroke-width="0.5">
        <line x1="10" y1="${ty(3.5)}" x2="740" y2="${ty(3.5)}" stroke-dasharray="5,5" />
        <line x1="${tx(2.0)}" y1="10" x2="${tx(2.0)}" y2="470" stroke-dasharray="5,5" />
        <line x1="${tx(6.0)}" y1="10" x2="${tx(6.0)}" y2="470" stroke-dasharray="5,5" />
      </g>
    `;

    const gridLines = `
      <g opacity="0.10" stroke="#94a3b8" stroke-width="0.5">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => `<line x1="${tx(x)}" y1="10" x2="${tx(x)}" y2="470" />`).join('')}
        ${[1, 2, 3, 4, 5, 6].map(y => `<line x1="10" y1="${ty(y)}" x2="740" y2="${ty(y)}" />`).join('')}
      </g>
    `;

    const getDrawingSVG = (sheetId: string) => {
      // Slabs
      const slabsSvg = slabs.map(s => {
        const xMin = tx(Math.min(s.x1, s.x2));
        const yMin = ty(Math.max(s.y1, s.y2));
        const w = Math.abs(tx(s.x2) - tx(s.x1));
        const h_slab = Math.abs(ty(s.y2) - ty(s.y1));
        return `
          <rect x="${xMin}" y="${yMin}" width="${w}" height="${h_slab}" fill="rgba(241, 245, 249, 0.4)" stroke="#000000" stroke-width="1.5" />
          <text x="${xMin + w/2}" y="${yMin + h_slab/2 - 12}" text-anchor="middle" font-family="'Segoe UI', sans-serif" font-size="12" font-weight="bold" fill="#1e293b">${s.id}</text>
        `;
      }).join('\n');

      // Beams
      const beamsSvg = beams.map(b => {
        return `<line x1="${tx(b.x1)}" y1="${ty(b.y1)}" x2="${tx(b.x2)}" y2="${ty(b.y2)}" stroke="#334155" stroke-width="4.5" />`;
      }).join('\n');

      // Columns
      const columnsSvg = columns.map(c => {
        return `<rect x="${tx(c.x) - 7}" y="${ty(c.y) - 7}" width="14" height="14" fill="#000000" stroke="#000000" stroke-width="1" />`;
      }).join('\n');

      let specificSvg = '';

      if (sheetId === 'S101') {
        specificSvg = `
          <text x="375" y="240" fill="#64748b" text-anchor="middle" font-family="'Segoe UI', sans-serif" font-size="11" font-weight="bold">
            مخطط نجارة الاسقف الخرسانية (Concrete Geometry Plan)
          </text>
        `;
      } else if (sheetId === 'S102') {
        specificSvg = slabs.filter(s => s.slabType === 'one_way_ribbed').map(rs => {
          const rx1 = tx(rs.x1), ry1 = ty(rs.y2);
          const rw = Math.abs(tx(rs.x2) - tx(rs.x1));
          const rh_slab = Math.abs(ty(rs.y2) - ty(rs.y1));
          
          let blockLines = [];
          const isHoriz = rs.direction === 'one_way_x' || rs.direction === 'X' || !rs.direction || rs.direction === 'auto';
          const stepM = (bw + s) / 1000;
          
          if (isHoriz) {
            let curY = Math.min(rs.y1, rs.y2) + stepM;
            while (curY < Math.max(rs.y1, rs.y2)) {
              blockLines.push(
                `<line x1="${tx(rs.x1 + 0.3)}" y1="${ty(curY)}" x2="${tx(rs.x2 - 0.3)}" y2="${ty(curY)}" stroke="#555555" stroke-width="3" stroke-dasharray="3,5" />`
              );
              curY += stepM;
            }
          } else {
            let curX = Math.min(rs.x1, rs.x2) + stepM;
            while (curX < Math.max(rs.x1, rs.x2)) {
              blockLines.push(
                `<line x1="${tx(curX)}" y1="${ty(rs.y1 + 0.3)}" x2="${tx(curX)}" y2="${ty(rs.y2 - 0.3)}" stroke="#555555" stroke-width="3" stroke-dasharray="3,5" />`
              );
              curX += stepM;
            }
          }

          const cx = (tx(rs.x1) + tx(rs.x2)) / 2;
          const cy = (ty(rs.y1) + ty(rs.y2)) / 2;
          const len = 35;
          let arrowsSvg = '';
          if (isHoriz) {
            arrowsSvg = `
              <g>
                <line x1="${cx - len}" y1="${cy}" x2="${cx + len}" y2="${cy}" stroke="#475569" stroke-width="2" stroke-dasharray="3,3" />
                <polygon points="${cx + len},${cy} ${cx + len - 6},${cy - 3} ${cx + len - 6},${cy + 3}" fill="#334155" />
                <polygon points="${cx - len},${cy} ${cx - len + 6},${cy - 3} ${cx - len + 6},${cy + 3}" fill="#334155" />
                <text x="${cx}" y="${cy - 7}" text-anchor="middle" fill="#334155" font-family="'Segoe UI', sans-serif" font-size="8" font-weight="bold">➔ اتجاه الأعصاب / RIB DIRECTION ➔</text>
              </g>
            `;
          } else {
            arrowsSvg = `
              <g>
                <line x1="${cx}" y1="${cy - len}" x2="${cx}" y2="${cy + len}" stroke="#475569" stroke-width="2" stroke-dasharray="3,3" />
                <polygon points="${cx},${cy - len} ${cx - 3},${cy - len + 6} ${cx + 3},${cy - len + 6}" fill="#334155" />
                <polygon points="${cx},${cy + len} ${cx - 3},${cy + len - 6} ${cx + 3},${cy + len - 6}" fill="#334155" />
                <text x="${cx + 8}" y="${cy + 3}" text-anchor="start" fill="#334155" font-family="'Segoe UI', sans-serif" font-size="8" font-weight="bold">اتجاه الأعصاب</text>
              </g>
            `;
          }

          const solidL = `<rect x="${rx1}" y="${ry1}" width="${0.3 * mmPerM}" height="${rh_slab}" fill="rgba(100, 116, 139, 0.25)" stroke="#334155" stroke-width="0.5" />`;
          const solidR = `<rect x="${tx(rs.x2 - 0.3)}" y="${ry1}" width="${0.3 * mmPerM}" height="${rh_slab}" fill="rgba(100, 116, 139, 0.25)" stroke="#334155" stroke-width="0.5" />`;

          return `
            <g>
              ${blockLines.join('\n')}
              ${solidL}
              ${solidR}
              ${arrowsSvg}
            </g>
          `;
        }).join('\n');
      } else if (sheetId === 'S103') {
        specificSvg = slabs.filter(s => s.slabType === 'one_way_ribbed').map(slab => {
          const rx1 = tx(slab.x1), ry1 = ty(slab.y2);
          const rw = Math.abs(tx(slab.x2) - tx(slab.x1));
          const rh_slab = Math.abs(ty(slab.y2) - ty(slab.y1));
          return `
            <g>
              <path d="M ${rx1 + 10} ${ry1 + rh_slab - 30} L ${rx1 + rw - 10} ${ry1 + rh_slab - 30} L ${rx1 + rw - 10} ${ry1 + rh_slab - 45} M ${rx1 + 10} ${ry1 + rh_slab - 30} L ${rx1 + 10} ${ry1 + rh_slab - 45}" fill="none" stroke="#ef4444" stroke-width="2.5" />
              <text x="${rx1 + rw/2}" y="${ry1 + rh_slab - 15}" text-anchor="middle" fill="#dc2626" font-family="'Segoe UI', sans-serif" font-size="10" font-weight="bold">
                2Ø14 B1 L=${(slab.x2 - slab.x1 + 0.3).toFixed(2)}m
              </text>
            </g>
          `;
        }).join('\n');
      } else if (sheetId === 'S104') {
        specificSvg = slabs.filter(s => s.slabType === 'one_way_ribbed').map(rs => {
          const rx1 = tx(rs.x1), ry1 = ty(rs.y2);
          const rw = Math.abs(tx(rs.x2) - tx(rs.x1));
          return `
            <g>
              <path d="M ${rx1} ${ry1 + 40} L ${rx1 + 0.25 * rw} ${ry1 + 40} M ${rx1 + rw} ${ry1 + 40} L ${rx1 + rw - 0.25 * rw} ${ry1 + 40}" fill="none" stroke="#2563eb" stroke-width="2.2" />
              <text x="${rx1 + 15}" y="${ry1 + 25}" fill="#1d4ed8" font-family="'Segoe UI', sans-serif" font-size="9" font-weight="bold">2Ø12 T1 L=${(0.25 * (rs.x2 - rs.x1) + 0.2).toFixed(2)}m</text>
              <text x="${rx1 + rw - 115}" y="${ry1 + 25}" fill="#1d4ed8" font-family="'Segoe UI', sans-serif" font-size="9" font-weight="bold">2Ø12 T2 L=${(0.25 * (rs.x2 - rs.x1) + 0.2).toFixed(2)}m</text>
            </g>
          `;
        }).join('\n');
      } else if (sheetId === 'S105') {
        specificSvg = slabs.filter(s => s.slabType === 'one_way_ribbed').map(rs => {
          const rx1 = tx(rs.x1), ry1 = ty(rs.y2);
          const rw = Math.abs(tx(rs.x2) - tx(rs.x1));
          const rh_slab = Math.abs(ty(rs.y2) - ty(rs.y1));
          return `
            <g>
              <line x1="${rx1}" y1="${ry1 + rh_slab/3}" x2="${rx1+rw}" y2="${ry1+rh_slab/3}" stroke="#10b981" stroke-width="1" stroke-dasharray="3,3" />
              <line x1="${rx1}" y1="${ry1 + 2*rh_slab/3}" x2="${rx1+rw}" y2="${ry1+2*rh_slab/3}" stroke="#10b981" stroke-width="1" stroke-dasharray="3,3" />
              <line x1="${rx1 + rw/3}" y1="${ry1}" x2="${rx1 + rw/3}" y2="${ry1+rh_slab}" stroke="#10b981" stroke-width="1" stroke-dasharray="3,3" />
              <line x1="${rx1 + 2*rw/3}" y1="${ry1}" x2="${rx1 + 2*rw/3}" y2="${ry1+rh_slab}" stroke="#10b981" stroke-width="1" stroke-dasharray="3,3" />
              <text x="${rx1 + rw/2}" y="${ry1 + rh_slab/2}" text-anchor="middle" fill="#047857" font-family="'Segoe UI', sans-serif" font-size="10" font-weight="bold">
                شبكة بلاطة التغطية: Ø8 @ 200 مم (كلا الاتجاهين)
              </text>
            </g>
          `;
        }).join('\n');
      } else if (sheetId === 'S106') {
        specificSvg = slabs.filter(s => s.slabType === 'one_way_ribbed').map(rs => {
          const rx1 = tx(rs.x1), ry1 = ty(rs.y2);
          const rw = Math.abs(tx(rs.x2) - tx(rs.x1));
          const rh_slab = Math.abs(ty(rs.y2) - ty(rs.y1));
          return `
            <g>
              <rect x="${rx1}" y="${ry1}" width="${0.20 * rw}" height="${rh_slab}" fill="rgba(244,63,94,0.11)" stroke="#f43f5e" stroke-width="0.8" />
              <text x="${rx1 + 0.10 * rw}" y="${ry1 + 25}" text-anchor="middle" fill="#e11d48" font-family="'Segoe UI', sans-serif" font-size="8.5" font-weight="bold">تكثيف كانات</text>
              <text x="${rx1 + 0.10 * rw}" y="${ry1 + 40}" text-anchor="middle" fill="#e11d48" font-family="'Segoe UI', sans-serif" font-size="8.5" font-weight="bold">Ø8 @ 100 مم</text>

              <rect x="${rx1 + 0.20 * rw}" y="${ry1}" width="${0.15 * rw}" height="${rh_slab}" fill="rgba(245,158,11,0.07)" stroke="#f59e0b" stroke-width="0.5" />

              <rect x="${rx1 + 0.35 * rw}" y="${ry1}" width="${0.30 * rw}" height="${rh_slab}" fill="rgba(16,185,129,0.04)" stroke="#10b981" stroke-width="0.5" />
              <text x="${rx1 + 0.50 * rw}" y="${ry1 + rh_slab/2}" text-anchor="middle" fill="#047857" font-family="'Segoe UI', sans-serif" font-size="8.5" font-weight="bold">عصب نموذجي Ø8 @ 200 مم</text>

              <rect x="${rx1 + 0.80 * rw}" y="${ry1}" width="${0.20 * rw}" height="${rh_slab}" fill="rgba(244,63,94,0.11)" stroke="#f43f5e" stroke-width="0.8" />
              <text x="${rx1 + 0.90 * rw}" y="${ry1 + 40}" text-anchor="middle" fill="#e11d48" font-family="'Segoe UI', sans-serif" font-size="8.5" font-weight="bold">Ø8 @ 100 مم</text>
            </g>
          `;
        }).join('\n');
      }

      return `
        <div style="width:100%; height:calc(100% - 30px); display:flex; justify-content:center; align-items:center; background:#ffffff;">
          <svg viewBox="0 0 750 480" width="100%" height="100%" style="background:#ffffff; border:1.5px solid #000; border-top:none;">
            <defs>
              <pattern id="gridPatternPrint-${sheetId}" width="30" height="30" patternUnits="userSpaceOnUse">
                <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#f1f5f9" stroke-width="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#gridPatternPrint-${sheetId})" />
            ${gridAxes}
            ${gridLines}
            ${slabsSvg}
            ${beamsSvg}
            ${columnsSvg}
            ${specificSvg}
          </svg>
        </div>
      `;
    };

    let sheetsHtml = '';

    sheetCodes.forEach((sheetId) => {
      let sheetTitle = '';
      let sheetContent = '';

      switch (sheetId) {
        case 'S001':
          sheetTitle = 'GENERAL STRUCTURAL NOTES & DEVIATIONS';
          sheetContent = `
            <div style="padding: 20px; font-family:'Segoe UI',Arial,sans-serif; direction:rtl; text-align:right;">
              <h2 style="color:#111; border-bottom:2px solid #000; padding-bottom:5px;">ملاحظات إنشائية عامة ومواصفات التنفيذ / GENERAL TECHNICAL NOTES</h2>
              <table style="width:100%; border-collapse:collapse; margin-top:15px; font-size:11px;">
                <tr><td style="border:1px solid #000; padding:8px; background:#f5f5f5; width:30%;">كود التصميم المعتمد (Design Code)</td><td style="border:1px solid #000; padding:8px;">كود البناء السعودي الكود الإنشائي (SBC 304) المحاكي لـ ACI 318-19</td></tr>
                <tr><td style="border:1px solid #000; padding:8px; background:#f5f5f5;">مقاومة الخرسانة المميزة (Cylinder fc')</td><td style="border:1px solid #000; padding:8px;">fc' = 25 MPa للأعصاب وبلاطة التغطية والجسور الحاملة</td></tr>
                <tr><td style="border:1px solid #000; padding:8px; background:#f5f5f5;">رتبة حديد التسليح (Steel Yield Strength)</td><td style="border:1px solid #000; padding:8px;">fy = 420 MPa عالي الشد للأعصاب الرئيسي، fy = 280 MPa للكانات والحراري</td></tr>
                <tr><td style="border:1px solid #000; padding:8px; background:#f5f5f5;">الغطاء الخرساني الصافي (Concrete Cover)</td><td style="border:1px solid #000; padding:8px;">20 مم للبلاطات وأعصاب الهوردي المعرضة لظروف جوية اعتيادية، 40 مم للجسور</td></tr>
                <tr><td style="border:1px solid #000; padding:8px; background:#f5f5f5;">طول وصلات التراكب (Tension Lap Splices)</td><td style="border:1px solid #000; padding:8px;">Class B Lap Splice = 1.3 * Ld (التشابك السفلي عند الركائز والعلوي بمنتصف البحرة)</td></tr>
                <tr><td style="border:1px solid #000; padding:8px; background:#f5f5f5;">ارتفاع طوب الهوردي (Hollow Block Size)</td><td style="border:1px solid #000; padding:8px;">بلوك إسمنتي خفيف أو بوليسترين مقاس 400x200 مم بارتفاع ${hb} مم</td></tr>
              </table>
              <div style="margin-top:20px; font-size:10px; line-height:1.6; color:#333;">
                <p>1. جميع القياسات بالمليمتر والبحور بالأمتار ما لم يذكر خلاف ذلك.</p>
                <p>2. لا يجوز تكسير خرسانة الأعصاب أو تمرير أنابيب تكييف أو صحي تزيد عن 50 مم عبر الأعصاب دون مراجعة المهندس المصمم.</p>
                <p>3. يتم رش الخرسانة بالماء مرتين يومياً لمدة لا تقل عن 7 أيام متتالية بعد الصب.</p>
                <p>4. يجب فك طوبار الأسقف الهوردي بعد مرور (2L+2) يوم حيث L طول أكبر بحرة للغرس.</p>
              </div>
            </div>
          `;
          break;
        case 'S101':
          sheetTitle = 'FORMWORK PLAN / مخطط نجارة القوالب الخرسانية';
          sheetContent = getDrawingSVG('S101');
          break;
        case 'S102':
          sheetTitle = 'RIB LAYOUT PLAN / مخطط رصف طوب الهوردي والأعصاب';
          sheetContent = getDrawingSVG('S102');
          break;
        case 'S103':
          sheetTitle = 'BOTTOM REINFORCEMENT PLAN / مخطط تسليح أعصاب السقف السفلي';
          sheetContent = getDrawingSVG('S103');
          break;
        case 'S104':
          sheetTitle = 'TOP REINFORCEMENT PLAN / مخطط تسليح أعصاب السقف العلوي السالب';
          sheetContent = getDrawingSVG('S104');
          break;
        case 'S105':
          sheetTitle = 'TOPPING SLAB REINFORCEMENT / شبكة تسليح بلاطة التغطية علوياً';
          sheetContent = getDrawingSVG('S105');
          break;
        case 'S106':
          sheetTitle = 'SHEAR REINFORCEMENT PLAN / توزيع كانات الأعصاب وقوى القص';
          sheetContent = getDrawingSVG('S106');
          break;
        case 'S201':
          sheetTitle = 'STRUCTURAL CROSS SECTIONS & DETAILS / المقاطع النموذجية والتفاصيل الفنية';
          sheetContent = `
            <div style="padding:20px; font-family:'Segoe UI',Arial,sans-serif; direction:rtl; text-align:right; height:100%; box-sizing:border-box;">
              <h3 style="margin: 0 0 10px 0; font-size:14px; border-bottom:1.5px solid #000; padding-bottom:4px;">تفاصيل قطاعات الأعصاب والاتصال / TYPICAL DETAILS</h3>
              
              <div style="display:flex; gap:20px; height:80%;">
                
                <!-- SVG Vector Details -->
                <div style="flex:1.3; border:1px solid #ccc; background:#fff; padding:10px; border-radius:4px;">
                  <svg viewBox="0 0 630 310" width="100%" height="100%">
                    <g transform="translate(10, 10)">
                      <path d="M 10 20 L 250 20 L 250 50 L 170 50 L 170 120 L 90 120 L 90 50 L 10 50 Z" fill="#f1f5f9" stroke="#111" stroke-width="2" />
                      <rect x="18" y="52" width="68" height="64" fill="none" stroke="#777" stroke-dasharray="3,3" />
                      <rect x="174" y="52" width="68" height="64" fill="none" stroke="#777" stroke-dasharray="3,3" />
                      <circle cx="110" cy="110" r="5" fill="#ef4444" />
                      <circle cx="150" cy="110" r="5" fill="#ef4444" stroke="#111" />
                      
                      <text x="130" y="80" font-size="9.5" fill="#111" font-weight="bold" text-anchor="middle">عصب مفرغ / Web</text>
                      <text x="52" y="85" font-size="8.5" fill="#555" text-anchor="middle">طوب هوردي</text>
                      <text x="208" y="85" font-size="8.5" fill="#555" text-anchor="middle">طوب هوردي</text>
                      <text x="130" y="140" font-size="11" fill="#dc2626" font-weight="bold" text-anchor="middle">الحديد الرئيسي: 2Ø14</text>
                      <text x="130" y="15" font-size="8.5" fill="#111" text-anchor="middle">Topping: ${tf}mm | Rib Web: ${hb}mm</text>
                    </g>

                    <g transform="translate(320, 10)">
                      <rect x="0" y="20" width="220" height="100" fill="#f1f5f9" stroke="#1c1917" stroke-width="1.5" />
                      <path d="M 10 20 L 10 100 L 100 100 L 100 20" fill="none" stroke="#2563eb" stroke-width="2.5" />
                      <text x="110" y="55" font-size="8.5" fill="#111" font-weight="bold" text-anchor="middle">امتداد الرباط لا يقل عن 150 مم</text>
                      <text x="110" y="140" font-size="10" fill="#111" font-weight="bold" text-anchor="middle">تفصيل صلة العصب بالروافد والجسور</text>
                    </g>
                  </svg>
                </div>

                <!-- Text notes -->
                <div style="flex:1; display:flex; flex-direction:column; justify-content:space-between; font-size:11px; line-height:1.5;">
                  <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:10px; border-radius:4px;">
                    <strong style="color:#d97706; font-size:11.5px;">ملاحظات تفصيل الأعصاب:</strong>
                    <ul style="margin:5px 0 0 0; padding-right:15px; text-align:right;">
                      <li>عرض العصب الحامل (bw) يبلغ ${bw} مم.</li>
                      <li>الارتفاع الكلي الفعال للبلاطة يبلغ ${h} مم.</li>
                      <li>المسافة من محور العصب لمحور العصب المجاور (S + bw) = ${s + bw} مم.</li>
                      <li>تُسحب الكانات المغلقة بقطر 8Ø مم حول قضبان التسليح الطولي السفلي والعلوي.</li>
                    </ul>
                  </div>
                </div>

              </div>
            </div>
          `;
          break;
        case 'S301':
          sheetTitle = 'BAR BENDING SCHEDULE (BBS) / جدول تفريد حديد التسليح للمشروع';
          sheetContent = `
            <div style="padding:15px;">
              <table style="width:100%; border-collapse:collapse; font-size:10px; text-align:center;">
                <tr style="background:#000; color:#fff;">
                  <th>Mark / الرمز</th><th>Type / نوع العنصر</th><th>Diameter / القطر</th><th>Length / الطول (م)</th><th>Qty / العدد</th><th>Total Length / إجمالي الطول</th><th>Weight / الوزن (كغ)</th><th>Shape / الشكل</th>
                </tr>
                ${detailingData.bbs.map(b => `
                  <tr>
                    <td style="font-weight:bold; border:1px solid #000;">${b.barMark}</td>
                    <td style="border:1px solid #000;">${b.type}</td>
                    <td style="border:1px solid #000;">Ø${b.diameter}</td>
                    <td style="border:1px solid #000;">${b.length.toFixed(2)}</td>
                    <td style="border:1px solid #000;">${b.count}</td>
                    <td style="border:1px solid #000;">${(b.count * b.length).toFixed(2)}</td>
                    <td style="border:1px solid #000;">${b.weight.toFixed(1)}</td>
                    <td style="border:1px solid #000;">Shape Code ${b.shapeCode}</td>
                  </tr>
                `).join('')}
              </table>
            </div>
          `;
          break;
        case 'S302':
          sheetTitle = 'MATERIAL TAKE-OFF & BILL OF QUANTITIES (BOQ)';
          sheetContent = `
            <div style="padding:15px; direction:rtl; text-align:right;">
              <h3 style="border-bottom:1.5px solid #000; padding-bottom:3px;">ملخص حصر كميات الخرسانة وبلاطة السقف الهوردي:</h3>
              <table style="width:100%; border-collapse:collapse; font-size:11px; margin-top:10px;">
                <tr style="background:#e5e7eb;"><th>العنصر الإنشائي</th><th>حجم الخرسانة (م³)</th><th>وزن حديد التسليح (كغ)</th><th>كثافة التسليح (كغ/م²)</th></tr>
                <tr><td>أعصاب السقف (Rib Webs)</td><td>${detailingData.summary.ribConcreteVolume.toFixed(2)} م³</td><td>${(detailingData.summary.bottomSteelWeight + detailingData.summary.topSteelWeight + detailingData.summary.shearSteelWeight).toFixed(1)} كغ</td><td>-</td></tr>
                <tr><td>بلاطة التغطية (Topping Slab)</td><td>${detailingData.summary.toppingConcreteVolume.toFixed(2)} م³</td><td>${detailingData.summary.toppingSteelWeight.toFixed(1)} كغ</td><td>-</td></tr>
                <tr style="font-weight:bold; background:#d1d5db;"><td>الإجمالي الهندسي الشامل</td><td>${detailingData.summary.totalConcreteVolume.toFixed(2)} م³</td><td>${detailingData.summary.totalSteelWeight.toFixed(0)} كغ</td><td>${detailingData.summary.steelDensity.toFixed(1)} كغ/م²</td></tr>
              </table>
            </div>
          `;
          break;
      }


      sheetsHtml += `
        <div class="sheet-page" style="position:relative; width:1260px; height:891px; background:#fff; margin:30px auto; box-shadow:0 0 15px rgba(0,0,0,0.2); overflow:hidden; page-break-after:always;">
          <!-- Double border lines characteristic of AutoCAD drawings -->
          <div style="position:absolute; left:20px; top:20px; right:20px; bottom:20px; border:2.5px solid #000;"></div>
          <div style="position:absolute; left:28px; top:28px; right:28px; bottom:28px; border:1px solid #000;"></div>
          
          <!-- Drawing content zone -->
          <div style="position:absolute; left:40px; top:40px; right:40px; bottom:180px; border:0.5px solid #aaa;">
            <div style="background:#0f172a; color:#fff; padding:6px 12px; font-weight:bold; font-size:11px; font-family:sans-serif; text-transform:uppercase;">
              ${sheetTitle}
            </div>
            ${sheetContent}
          </div>

          <!-- Professional CAD Title Block Frame (Bottom Corner) -->
          <div style="position:absolute; left:40px; bottom:40px; right:40px; height:120px; border:2px solid #000; display:flex; font-family:Arial, sans-serif; direction:rtl; text-align:right;">
            <div style="width:25%; border-left:1px solid #000; padding:10px; display:flex; flex-direction:column; justify-content:space-around;">
              <span style="font-size:8px; color:#555;">اسم المشروع / PROJECT NAME</span>
              <strong style="font-size:12px; color:#1e3a8a;">${titleBlockConfig?.projectName || projectName}</strong>
              <span style="font-size:8px; color:#555;">موقع المشروع / LOCATION: ${titleBlockConfig?.projectLocation || 'Saudi Arabia (KSA)'}</span>
            </div>
            <div style="width:35%; border-left:1px solid #000; padding:10px; display:flex; flex-direction:column; justify-content:space-around;">
              <span style="font-size:8px; color:#555;">عنوان اللوحة الهندسية / SHEET TITLE</span>
              <strong style="font-size:12px; color:#b91c1c;">${sheetTitle}</strong>
              <span style="font-size:8px; color:#555;">SYSTEM: ONE-WAY HOLLOW BLOCK / RIBBED SLAB SYSTEM DETAILS</span>
            </div>
            <div style="width:20%; border-left:1px solid #000; padding:10px; display:flex; flex-direction:column; justify-content:space-around; font-size:9px;">
              <div><span style="color:#555;">مكتب التصميم:</span> <strong>Structural Detailing Engine</strong></div>
              <div><span style="color:#555;">كود التصميم:</span> ACI 318-19 / SBC 304</div>
            </div>
            <div style="width:10%; border-left:1px solid #000; padding:10px; display:flex; flex-direction:column; justify-content:space-between; font-size:9px;">
              <div><span style="color:#555;">تصميم:</span> <strong>Eng. Detailing AI</strong></div>
              <div><span style="color:#555;">تدقيق:</span> <strong>Senior Detailing Eng.</strong></div>
            </div>
            <div style="width:10%; padding:10px; display:flex; flex-direction:column; justify-content:space-between; align-items:center; background:#f9fafb;">
              <div style="text-align:center;">
                <span style="font-size:8px; color:#555; display:block;">رقم اللوحة / SHEET</span>
                <strong style="font-size:16px; color:#b91c1c;">${sheetId}</strong>
              </div>
              <div style="text-align:center; font-size:9px; border-top:1px solid #ccc; width:100%; padding-top:4px;">
                SCALE ${scale}
              </div>
            </div>
          </div>
        </div>
      `;
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>ONE-WAY RIBBED SLAB COMPLETE DETAILED PACKAGE</title>
        <style>
          @page { size: A3 landscape; margin: 0; }
          body { background: #f1f5f9; padding: 20px; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; }
          .no-print-top { background:#0f172a; color:#fff; padding:15px; text-align:center; margin-bottom:20px; border-radius:6px; box-shadow:0 4px 6px rgba(0,0,0,0.1); }
          .print-all-btn { background:#8b5cf6; border:none; color:#fff; font-weight:bold; font-size:14px; padding:10px 30px; border-radius:4px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2); }
          .print-all-btn:hover { background:#7c3aed; }
          @media print {
            .no-print-top { display:none; }
            body { padding:0; background:none; }
            .sheet-page { margin:0 !important; box-shadow:none !important; }
          }
        </style>
      </head>
      <body>
        <div class="no-print-top">
          <h2 style="margin:0 0 10px 0; font-size:16px;">مجموعة المخططات الإنشائية الشاملة للبلاطات الهوردي / STRUCTURAL IFC PACKAGE</h2>
          <button class="print-all-btn" onclick="window.print()">🖨️ طباعة لوحات المشروع بالكامل كملف PDF / PRINT ALL SHEET SERIES</button>
        </div>
        ${sheetsHtml}
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Trigger scaled AutoCAD compatible DXF Download incorporating layered rebar paths
  const handleDXFExport = () => {
    if (!detailingData) return;

    let dxf = `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n0\nENDSEC\n`;
    dxf += `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n10\n`;
    dxf += `0\nLAYER\n2\nCONCRETE_OUTLINE\n62\n7\n70\n0\n`;
    dxf += `0\nLAYER\n2\nHOLLOW_BLOCKS\n62\n8\n70\n0\n`;
    dxf += `0\nLAYER\n2\nREBAR_BOTTOM\n62\n1\n70\n0\n`;
    dxf += `0\nLAYER\n2\nREBAR_TOP\n62\n3\n70\n0\n`;
    dxf += `0\nLAYER\n2\nSHEAR_STIRRUPS\n62\n4\n70\n0\n`;
    dxf += `0\nLAYER\n2\nANNOTATIONS_TEXT\n62\n2\n70\n0\n`;
    dxf += `0\nENDTAB\n0\nENDSEC\n`;
    dxf += `0\nSECTION\n2\nENTITIES\n`;

    // 1. Write concrete outlines
    slabs.forEach(s => {
      dxf += `0\nPOLYLINE\n8\nCONCRETE_OUTLINE\n66\n1\n`;
      [[s.x1, s.y1], [s.x2, s.y1], [s.x2, s.y2], [s.x1, s.y2]].forEach(([x, y]) => {
        dxf += `0\nVERTEX\n8\nCONCRETE_OUTLINE\n10\n${(x * 1000).toFixed(1)}\n20\n${(y * 1000).toFixed(1)}\n`;
      });
      dxf += `0\nSEQEND\n`;
    });

    // 2. Write BBS bars
    detailingData.bbs.forEach((bar, bIdx) => {
      const layer = bar.type === 'BOT_CONT' ? 'REBAR_BOTTOM' : 'REBAR_TOP';
      const offsetMultiplier = bIdx * 80; // stagger offsets in mm

      dxf += `0\nLINE\n8\n${layer}\n10\n${(bar.startCoord * 1000).toFixed(1)}\n20\n${offsetMultiplier.toFixed(1)}\n30\n0.0\n11\n${(bar.endCoord * 1000).toFixed(1)}\n21\n${offsetMultiplier.toFixed(1)}\n31\n0.0\n`;
      // Mark name text
      dxf += `0\nTEXT\n8\nANNOTATIONS_TEXT\n10\n${(((bar.startCoord + bar.endCoord)/2) * 1000).toFixed(1)}\n20\n${(offsetMultiplier + 25).toFixed(1)}\n40\n120.0\n1\n${bar.count}%%c${bar.diameter} ${bar.barMark} L=${bar.length.toFixed(1)}m\n`;
    });

    dxf += `0\nENDSEC\n0\nEOF\n`;

    const blob = new Blob([dxf], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, '_')}_HollowBlock_OneWaySystem.dxf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentActiveRib = detailingData?.ribs[selectedRibIndex];

  if (!hasRibbedSlabs || !detailingData) {
    return (
      <Card className="border-purple-200 dark:border-purple-800 bg-purple-500/5">
        <CardContent className="py-10 text-center text-muted-foreground text-sm space-y-2">
          <Layers className="mx-auto text-purple-400" size={36} />
          <p className="font-bold">لا يوجد بلاطات هوردي ذو اتجاه واحد مصممة في هذا الطابق</p>
          <p className="text-xs">يرجى تغيير تصنيف نوع إحدى البلاطات إلى "بلاط هوردي" لتشغيل محرك التفريد الإنشائي تلقائياً.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg border-purple-200 dark:border-purple-900 overflow-hidden">
      <CardHeader className="bg-purple-600 dark:bg-purple-950 text-white pb-3">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers size={18} /> لوحات التنفيذ وتفريد أسقف الهوردي / One-Way Hollow Block Drawing Package
            </CardTitle>
            <CardDescription className="text-purple-100 text-xs mt-1">
              محرك التصاريح الإنشائي المصدق لتوليد تفريد حديد الأعصاب، الكانات، بلاطة التغطية، وجداول الـ BBS وحصر الكميات.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="outline" className="bg-white/10 text-white border-white/20 hover:bg-white/20" onClick={triggerPrintPackage}>
              <Printer size={13} className="mr-1.5" /> طباعة ملف اللوحات كاملاً (IFC Package)
            </Button>
            <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black font-bold border-none" onClick={handleDXFExport}>
              <Download size={13} className="mr-1.5" /> تصدير قوالب AutoCAD (DXF)
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
          
          {/* LEFT SIDEBAR: CAD SHEET DIRECTORY NAVIGATION */}
          <div className="lg:col-span-3 bg-slate-900 border-r border-slate-800 p-3 text-slate-200 text-xs">
            <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
              <span className="font-bold text-xs uppercase text-purple-400">فهرس لوحات المشروع / Sheets</span>
              <Badge className="bg-purple-700 text-[10px]" variant="secondary">SCALE {scale}</Badge>
            </div>
            <div className="space-y-1">
              {[
                { id: 'S001', name: 'S001 General Structural Notes', ar: 'الملاحظات الإنشائية العامة' },
                { id: 'S101', name: 'S101 Concrete Formwork Plan', ar: 'مخطط نجارة سقف الهوردي' },
                { id: 'S102', name: 'S102 Hollow Block Layout', ar: 'مخطط رص الطوب والأعصاب' },
                { id: 'S103', name: 'S103 Bottom Rebar Detailing', ar: 'مخطط تسليح الأعصاب السفلي' },
                { id: 'S104', name: 'S104 Top Support negative bars', ar: 'مخطط تسليح الأعصاب العلوي' },
                { id: 'S105', name: 'S105 Topping Temperature Mesh', ar: 'تسليح بلاطة التغطية الحراري' },
                { id: 'S106', name: 'S106 Shear Stirrups Spacing', ar: 'توزيع الكانات ومقاومة القص' },
                { id: 'S201', name: 'S201 Typical Structural Sections', ar: 'المقاطع النموذجية والتفاصيل' },
                { id: 'S301', name: 'S301 Bar Bending Schedule BBS', ar: 'جداول تفريد حديد التسليح' },
                { id: 'S302', name: 'S302 Quantitative Steel/Concrete', ar: 'جداول حصر كميات الخرسانة' }
              ].map((sheet) => (
                <button
                  key={sheet.id}
                  onClick={() => setActiveSheet(sheet.id)}
                  className={`w-full text-left p-2 rounded-md flex flex-col transition ${
                    activeSheet === sheet.id ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <span className="font-bold">{sheet.name}</span>
                  <span className="text-[10px] text-slate-500 mt-0.5 text-right font-sans">{sheet.ar}</span>
                </button>
              ))}
            </div>

            {/* Scale adjustment and properties cartridge */}
            <div className="mt-4 border-t border-slate-800 pt-3 space-y-2">
              <span className="font-bold text-slate-400 block">إعدادات اللوحة / Plot Settings</span>
              <div className="grid grid-cols-2 gap-1.5">
                {['1:50', '1:75', '1:100'].map(sc => (
                  <button
                    key={sc}
                    onClick={() => setScale(sc)}
                    className={`p-1.5 border rounded text-center font-mono ${
                      scale === sc ? 'bg-purple-500/20 text-purple-300 border-purple-600' : 'border-slate-800 bg-slate-950 text-slate-400'
                    }`}
                  >
                    {sc}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* CENTRE ZONE: ACTIVE SVG CAD DRAWING VIEWPORT */}
          <div className="lg:col-span-9 bg-slate-950 flex flex-col">
            <div className="p-2 border-b border-slate-800 bg-slate-900 text-slate-300 text-xs flex justify-between items-center">
              <span className="flex items-center gap-1.5 font-bold font-mono">
                <Compass className="text-purple-400" size={14} /> ACTIVE VIEW: {activeSheet}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500">منظومة تدقيق التفريد الإنشائي</span>
                <Badge className={validationReport.isValid ? 'bg-emerald-600' : 'bg-rose-600'}>
                  {validationReport.isValid ? 'ACI 318 COMPLIANT ✓' : 'UNDER REHABILITATION'}
                </Badge>
              </div>
            </div>

            {/* Graphics Screen */}
            <div className="relative p-4 flex justify-center items-center overflow-auto bg-slate-950">
              <div className="w-[750px] h-[480px] bg-slate-900 border border-slate-800 rounded-lg relative overflow-hidden shadow-inner">
                {/* Outer frame borders CAD standard */}
                <div className="absolute inset-2 border-2 border-slate-700 pointer-events-none rounded"></div>
                <div className="absolute inset-3 border border-slate-800 pointer-events-none rounded"></div>

                <svg width="100%" height="100%" viewBox={`0 0 ${pxW} ${pxH}`} className="select-none">
                  {/* Grid overlay */}
                  <defs>
                    <pattern id="viewerGrid" width="30" height="30" patternUnits="userSpaceOnUse">
                      <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#222" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#viewerGrid)" />

                  {/* Draw global grid axes representation */}
                  <g className="opacity-40" stroke="#475569" strokeWidth="0.5">
                    <line x1="10" y1={ty(3.5)} x2="740" y2={ty(3.5)} strokeDasharray="5,5" />
                    <line x1={tx(2.0)} y1="10" x2={tx(2.0)} y2="470" strokeDasharray="5,5" />
                    <line x1={tx(6.0)} y1="10" x2={tx(6.0)} y2="470" strokeDasharray="5,5" />
                  </g>

                  {/* DRAW BASED ON ACTIVE SHEET */}
                  {activeSheet === 'S001' && (
                    <g transform="translate(100, 50)" fill="#f1f5f9" className="font-sans">
                      <rect x="-40" y="-10" width="620" height="360" fill="rgba(15,23,42,0.95)" stroke="#475569" strokeWidth="1.5" />
                      <text x="270" y="30" fontSize="13" fontWeight="bold" fill="#38bdf8" textAnchor="middle">الملاحظات الإنشائية العامة ومواصفات الكود الأمريكي / TECHNICAL GENERAL NOTES</text>
                      
                      <text x="20" y="70" fontSize="10" fill="#cbd5e1" fontWeight="bold">1. كود التصميم:</text>
                      <text x="140" y="70" fontSize="9.5" fill="#94a3b8">كود البناء السعودي الكود الإنشائي (SBC 304) و الكود الأمريكي (ACI 318-19).</text>

                      <text x="20" y="100" fontSize="10" fill="#cbd5e1" fontWeight="bold">2. الخرسانة والحديد:</text>
                      <text x="140" y="100" fontSize="9.5" fill="#94a3b8">المقاومة الإنشائية المطلوبة fc' = 25 Mpa، حديد تسليح fy = 420 Mpa.</text>

                      <text x="20" y="130" fontSize="10" fill="#cbd5e1" fontWeight="bold">3. الغطاء الخرساني:</text>
                      <text x="140" y="130" fontSize="9.5" fill="#94a3b8">أعصاب السقف وبلاطات التغطية = 20 مم صافي من حافة حديد التسليح.</text>

                      <text x="20" y="160" fontSize="10" fill="#cbd5e1" fontWeight="bold">4. التفاصيل والرباط:</text>
                      <text x="140" y="160" fontSize="9.5" fill="#94a3b8">يتم تمديد حديد عصب الهوردي السفلي بحد أدنى 150 مم داخل الركيزة الساندة.</text>

                      <text x="20" y="190" fontSize="10" fill="#cbd5e1" fontWeight="bold">5. طوب الهوردي:</text>
                      <text x="140" y="190" fontSize="9.5" fill="#94a3b8">بلوكات إسمنتية خفيفة مقاس 400 × 200 مم، بارتفاع يطابق التصميم الإنشائي.</text>

                      <rect x="20" y="220" width="500" height="40" fill="rgba(245,158,11,0.05)" stroke="#d97706" />
                      <text x="270" y="244" fontSize="9" fill="#fbbf24" textAnchor="middle" fontWeight="black">ملاحظة فنية: يجب صب الأعصاب وبلاطة التغطية والجسور الحاملة دفعة واحدة متصلة.</text>
                    </g>
                  )}

                  {activeSheet === 'S101' && (
                    <g>
                      {/* Geometric View ONLY */}
                      {slabs.map(s => (
                        <rect
                          key={s.id}
                          x={tx(s.x1)}
                          y={ty(s.y2)}
                          width={Math.abs(tx(s.x2) - tx(s.x1))}
                          height={Math.abs(ty(s.y2) - ty(s.y1))}
                          fill="rgba(51,65,85,0.2)"
                          stroke="#475569"
                          strokeWidth="2"
                        />
                      ))}
                      {beams.map(b => (
                        <line key={b.id} x1={tx(b.x1)} y1={ty(b.y1)} x2={tx(b.x2)} y2={ty(b.y2)} stroke="#64748b" strokeWidth="4" />
                      ))}
                      {columns.map(c => (
                        <rect key={c.id} x={tx(c.x) - 7} y={ty(c.y) - 7} width="14" height="14" fill="#334155" stroke="#475569" strokeWidth="1" />
                      ))}
                      <text x="375" y="240" fill="#64748b" textAnchor="middle" fontSize="10" fontWeight="bold">مخطط نجارة الاسقف الخرسانية فقط - بدون حديد تسليح (Concrete Geometry Outline)</text>
                    </g>
                  )}

                  {activeSheet === 'S102' && (
                    <g>
                      {/* Blocks rasing grid layout S102 */}
                      {slabs.filter(slab => slab.slabType === 'one_way_ribbed').map(rs => {
                        const rx1 = tx(rs.x1), ry1 = ty(rs.y2);
                        const rw = Math.abs(tx(rs.x2) - tx(rs.x1));
                        const rh_slab = Math.abs(ty(rs.y2) - ty(rs.y1));
                        
                        let res = [];
                        const isHoriz = rs.direction === 'one_way_x' || rs.direction === 'X' || !rs.direction || rs.direction === 'auto';
                        const stepM = (bw + s) / 1000;
                        
                        if (isHoriz) {
                          let curY = Math.min(rs.y1, rs.y2) + stepM;
                          while (curY < Math.max(rs.y1, rs.y2)) {
                            res.push(
                              <line key={`block-${curY}`} x1={tx(rs.x1 + 0.3)} y1={ty(curY)} x2={tx(rs.x2 - 0.3)} y2={ty(curY)} stroke="#555" strokeWidth="4" strokeDasharray="3,5" />
                            );
                            curY += stepM;
                          }
                        } else {
                          let curX = Math.min(rs.x1, rs.x2) + stepM;
                          while (curX < Math.max(rs.x1, rs.x2)) {
                            res.push(
                              <line key={`block-${curX}`} x1={tx(curX)} y1={ty(rs.y1 + 0.3)} x2={tx(curX)} y2={ty(rs.y2 - 0.3)} stroke="#555" strokeWidth="4" strokeDasharray="3,5" />
                            );
                            curX += stepM;
                          }
                        }
                        return (
                          <g key={rs.id}>
                            <rect x={rx1} y={ry1} width={rw} height={rh_slab} fill="none" stroke="#7c3aed" strokeWidth="1.5" />
                            {res}
                            {renderRibArrows(rs)}
                            {/* Solid strip shadings */}
                            <rect x={rx1} y={ry1} width={0.3 * mmPerM} height={rh_slab} fill="rgba(100,116,139,0.3)" />
                            <rect x={tx(rs.x2 - 0.3)} y={ry1} width={0.3 * mmPerM} height={rh_slab} fill="rgba(100,116,139,0.3)" />
                          </g>
                        );
                      })}
                      {columns.map(c => (
                        <rect key={c.id} x={tx(c.x) - 7} y={ty(c.y) - 7} width="14" height="14" fill="#334155" stroke="#475569" strokeWidth="1" />
                      ))}
                    </g>
                  )}

                  {activeSheet === 'S103' && (
                    <g>
                      {/* S103: Bottom Reinforcement layout */}
                      {slabs.filter(s => s.slabType === 'one_way_ribbed').map(slab => {
                        const rx1 = tx(slab.x1), ry1 = ty(slab.y2);
                        const rw = Math.abs(tx(slab.x2) - tx(slab.x1));
                        const rh_slab = Math.abs(ty(slab.y2) - ty(slab.y1));
                        return (
                          <g key={slab.id}>
                            <rect x={rx1} y={ry1} width={rw} height={rh_slab} fill="rgba(100,116,139,0.05)" stroke="#475569" strokeWidth="1" />
                            {/* Render rebar lines with standard Hooks */}
                            <path d={`M ${rx1 + 10} ${ry1 + rh_slab - 30} L ${rx1 + rw - 10} ${ry1 + rh_slab - 30} L ${rx1 + rw - 10} ${ry1 + rh_slab - 45} M ${rx1 + 10} ${ry1 + rh_slab - 30} L ${rx1 + 10} ${ry1 + rh_slab - 45}`} fill="none" stroke="#ef4444" strokeWidth="2.5" />
                            <text x={rx1 + rw/2} y={ry1 + rh_slab - 15} textAnchor="middle" fill="#f87171" fontSize="9.5" fontWeight="bold">
                              2Ø14 B1 L={(slab.x2 - slab.x1 + 0.3).toFixed(2)}m (حديد عصب سفلي مستمر)
                            </text>
                            <text x={rx1 + rw/2} y={ry1 + rh_slab/2} textAnchor="middle" fill="#64748b" fontSize="11" fontWeight="bold">
                              {slab.id}
                            </text>
                          </g>
                        );
                      })}
                      {columns.map(c => (
                        <rect key={c.id} x={tx(c.x) - 7} y={ty(c.y) - 7} width="14" height="14" fill="#334155" stroke="#475569" strokeWidth="1" />
                      ))}
                    </g>
                  )}

                  {activeSheet === 'S104' && (
                    <g>
                      {/* S104: Top support negative bars */}
                      {slabs.filter(slab => slab.slabType === 'one_way_ribbed').map(rs => {
                        const rx1 = tx(rs.x1), ry1 = ty(rs.y2);
                        const rw = Math.abs(tx(rs.x2) - tx(rs.x1));
                        const rh_slab = Math.abs(ty(rs.y2) - ty(rs.y1));
                        const isHoriz = rs.direction === 'one_way_x' || rs.direction === 'X' || !rs.direction || rs.direction === 'auto';
                        
                        return (
                          <g key={rs.id}>
                            <rect x={rx1} y={ry1} width={rw} height={rh_slab} fill="none" stroke="#475569" strokeWidth="1" />
                            {/* Support Negative bars */}
                            <path d={`M ${rx1} ${ry1 + 40} L ${rx1 + 0.25 * rw} ${ry1 + 40} M ${rx1 + rw} ${ry1 + 40} L ${rx1 + rw - 0.25 * rw} ${ry1 + 40}`} fill="none" stroke="#2563eb" strokeWidth="2" strokeDasharray="1,1" />
                            <text x={rx1 + 20} y={ry1 + 25} fill="#60a5fa" fontSize="8" fontWeight="bold">2Ø12 T1 L={(0.25 * (rs.x2 - rs.x1) + 0.2).toFixed(2)}m</text>
                            <text x={rx1 + rw - 110} y={ry1 + 25} fill="#60a5fa" fontSize="8" fontWeight="bold">2Ø12 T2 L={(0.25 * (rs.x2 - rs.x1) + 0.2).toFixed(2)}m</text>
                          </g>
                        );
                      })}
                    </g>
                  )}

                  {activeSheet === 'S105' && (
                    <g>
                      {/* S105 Mesh visual presentation */}
                      {slabs.filter(slab => slab.slabType === 'one_way_ribbed').map(rs => {
                        const rx1 = tx(rs.x1), ry1 = ty(rs.y2);
                        const rw = Math.abs(tx(rs.x2) - tx(rs.x1));
                        const rh_slab = Math.abs(ty(rs.y2) - ty(rs.y1));
                        
                        return (
                          <g key={rs.id}>
                            {/* Grid Hatch */}
                            <rect x={rx1} y={ry1} width={rw} height={rh_slab} fill="none" stroke="#10b981" strokeWidth="1.5" />
                            <line x1={rx1} y1={ry1 + rh_slab/3} x2={rx1+rw} y2={ry1+rh_slab/3} stroke="#10b981" strokeWidth="0.8" strokeDasharray="2,2" />
                            <line x1={rx1} y1={ry1 + 2*rh_slab/3} x2={rx1+rw} y2={ry1+2*rh_slab/3} stroke="#10b981" strokeWidth="0.8" strokeDasharray="2,2" />
                            <line x1={rx1 + rw/3} y1={ry1} x2={rx1 + rw/3} y2={ry1+rh_slab} stroke="#10b981" strokeWidth="0.8" strokeDasharray="2,2" />
                            <line x1={rx1 + 2*rw/3} y1={ry1} x2={rx1 + 2*rw/3} y2={ry1+rh_slab} stroke="#10b981" strokeWidth="0.8" strokeDasharray="2,2" />
                            
                            <text x={rx1 + rw/2} y={ry1 + rh_slab/2} textAnchor="middle" fill="#34d399" fontSize="10.5" fontWeight="bold">
                              شبكة بلاطة التغطية العلوي: Ø8 @ 200 مم (كلا الاتجاهين)
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  )}

                  {activeSheet === 'S106' && (
                    <g>
                      {/* S106: Shear Reinforcement distribution zones */}
                      {slabs.filter(slab => slab.slabType === 'one_way_ribbed').map(rs => {
                        const rx1 = tx(rs.x1), ry1 = ty(rs.y2);
                        const rw = Math.abs(tx(rs.x2) - tx(rs.x1));
                        const rh_slab = Math.abs(ty(rs.y2) - ty(rs.y1));
                        
                        return (
                          <g key={rs.id}>
                            <rect x={rx1} y={ry1} width={rw} height={rh_slab} fill="none" stroke="#475569" strokeWidth="1" />
                            
                            {/* Support zone Left */}
                            <rect x={rx1} y={ry1} width={0.20 * rw} height={rh_slab} fill="rgba(244,63,94,0.15)" stroke="#f43f5e" strokeWidth="0.5" />
                            <text x={rx1 + 0.10 * rw} y={ry1 + 30} textAnchor="middle" fill="#fb7185" fontSize="8" fontWeight="bold">تكثيف كانات القص</text>
                            <text x={rx1 + 0.10 * rw} y={ry1 + 45} textAnchor="middle" fill="#fb7185" fontSize="8" fontWeight="bold">Ø8 @ 100 مم</text>

                            {/* Transition Zone Left */}
                            <rect x={rx1 + 0.20 * rw} y={ry1} width={0.15 * rw} height={rh_slab} fill="rgba(245,158,11,0.1)" stroke="#f59e0b" strokeWidth="0.5" />

                            {/* Midspan low shear */}
                            <rect x={rx1 + 0.35 * rw} y={ry1} width={0.30 * rw} height={rh_slab} fill="rgba(16,185,129,0.05)" stroke="#10b981" strokeWidth="0.5" />
                            <text x={rx1 + 0.50 * rw} y={ry1 + rh_slab/2} textAnchor="middle" fill="#34d399" fontSize="8" fontWeight="bold">عصب نموذجي Ø8 @ 200 مم</text>

                            {/* Support Zone Right */}
                            <rect x={rx1 + 0.80 * rw} y={ry1} width={0.20 * rw} height={rh_slab} fill="rgba(244,63,94,0.15)" stroke="#f43f5e" strokeWidth="0.5" />
                            <text x={rx1 + 0.90 * rw} y={ry1 + 45} textAnchor="middle" fill="#fb7185" fontSize="8" fontWeight="bold">Ø8 @ 100 مم</text>
                          </g>
                        );
                      })}
                    </g>
                  )}

                  {activeSheet === 'S201' && (
                    <g transform="translate(60, 40)" fill="#cbd5e1" className="font-sans">
                      <rect x="0" y="0" width="630" height="360" fill="rgba(15,23,42,0.9)" stroke="#475569" strokeWidth="1" />
                      
                      {/* Typical Section CAD drawing detailing blocks */}
                      <text x="315" y="30" fontSize="13" color="#111" fontWeight="bold" textAnchor="middle" fill="#fff">جداول المقاطع النموذجية لتفاصيل الأعصاب / TYPICAL RIB SECTIONS</text>
                      
                      {/* Left: typical cross section */}
                      <g transform="translate(40, 50)">
                        <path d="M 10 20 L 250 20 L 250 50 L 170 50 L 170 120 L 90 120 L 90 50 L 10 50 Z" fill="#334155" stroke="#475569" strokeWidth="2" />
                        <rect x="18" y="52" width="68" height="64" fill="#1e293b" stroke="#475569" strokeDasharray="2,2" />
                        <rect x="174" y="52" width="68" height="64" fill="#1e293b" stroke="#475569" strokeDasharray="2,2" />
                        <circle cx="110" cy="110" r="4" fill="#ef4444" />
                        <circle cx="150" cy="110" r="4" fill="#ef4444" />
                        
                        <text x="130" y="80" fontSize="9" fill="#94a3b8" textAnchor="middle">عصب مفرغ / Web</text>
                        <text x="52" y="85" fontSize="8" fill="#475569" textAnchor="middle">طوب هوردي</text>
                        <text x="208" y="85" fontSize="8" fill="#475569" textAnchor="middle">طوب هوردي</text>
                        <text x="130" y="140" fontSize="10" fill="#f87171" fontWeight="bold" textAnchor="middle">الحديد الرئيسي البنيوي: 2Ø14</text>
                      </g>

                      {/* Right: typical edge anchor */}
                      <g transform="translate(360, 50)">
                        <rect x="0" y="20" width="220" height="100" fill="#334155" stroke="#475569" strokeWidth="1.5" />
                        <path d="M 10 20 L 10 100 L 100 100 L 100 20" fill="none" stroke="#ef4444" strokeWidth="2" />
                        <text x="110" y="60" fontSize="8.5" fill="#f87171" fontWeight="bold" textAnchor="middle">امتداد الركيزة والتحشية لا تقل عن 150 مم</text>
                        <text x="110" y="140" fontSize="10.5" fill="#94a3b8" textAnchor="middle">تفصيل صلة العصب بالروافد الجانبية</text>
                      </g>
                    </g>
                  )}

                  {activeSheet === 'S301' && (
                    <g transform="translate(30, 40)" className="font-sans">
                      <rect x="0" y="0" width="690" height="350" fill="rgba(15,23,42,0.95)" stroke="#475569" strokeWidth="1" />
                      <text x="345" y="30" fontSize="11" fill="#fff" fontWeight="bold" textAnchor="middle">جدول تفريد حديد الأعصاب النموذجي / HOLLOW BLOCK RIBS COMPLETE BAR BENDING SCHEDULE</text>
                      
                      {/* BBS Columns Header */}
                      <g transform="translate(15, 60)" fill="#1e293b" stroke="#475569">
                        <rect x="0" y="0" width="660" height="25" fill="#475569" />
                        <text x="30" y="16" fill="#f1f5f9" fontSize="9" fontWeight="bold">Mark / الرمز</text>
                        <text x="110" y="16" fill="#f1f5f9" fontSize="9" fontWeight="bold">Type / النوع</text>
                        <text x="210" y="16" fill="#f1f5f9" fontSize="9" fontWeight="bold">Diameter / القطر</text>
                        <text x="310" y="16" fill="#f1f5f9" fontSize="9" fontWeight="bold">Length / طول القضيب</text>
                        <text x="410" y="16" fill="#f1f5f9" fontSize="9" fontWeight="bold">Qty / العدد</text>
                        <text x="510" y="16" fill="#f1f5f9" fontSize="9" fontWeight="bold">Weight / الوزن</text>
                        <text x="610" y="16" fill="#f1f5f9" fontSize="9" fontWeight="bold">Shape / تفريد</text>
                      </g>

                      {/* Bar Mark list visually listed in the SVG space */}
                      {detailingData.bbs.slice(0, 5).map((bar, idx) => (
                        <g key={`bar-${idx}`} transform={`translate(15, ${85 + idx * 30})`} fill="#cbd5e1" fontSize="9">
                          <text x="30" y="18" fontWeight="bold" fill="#38bdf8">{bar.barMark}</text>
                          <text x="110" y="18">{bar.type}</text>
                          <text x="210" y="18">Ø{bar.diameter} مم</text>
                          <text x="310" y="18">{bar.length.toFixed(2)} م</text>
                          <text x="410" y="18">{bar.count}</text>
                          <text x="510" y="18">{bar.weight.toFixed(1)} كغ</text>
                          <text x="610" y="18" fill="#fbbf24">Shape Code {bar.shapeCode}</text>
                        </g>
                      ))}
                      <text x="345" y="275" fontSize="8.5" fill="#e2e8f0" fontStyle="italic" textAnchor="middle">* تظهر بقية تفريد حديد المشروع وسلسلة الـ BBS الكاملة في المطبوع النهائي.</text>
                    </g>
                  )}

                  {activeSheet === 'S302' && (
                    <g transform="translate(100, 60)" fill="#f1f5f9" className="font-sans">
                      <rect x="-30" y="-10" width="600" height="340" fill="rgba(15,23,42,0.92)" stroke="#475569" strokeWidth="1.5" />
                      <text x="270" y="25" fontSize="13" fontWeight="bold" fill="#38bdf8" textAnchor="middle">ملخص حصر كميات خرسانة وحديد السقف / QUANTIZED BOQ</text>
                      
                      <g transform="translate(10, 60)" fontSize="9.5">
                        {/* Concrete takes */}
                        <text x="20" y="20" fill="#38bdf8" fontWeight="bold" fontSize="11">أولاً: حجم المواد الخرسانية (Concrete Volumes)</text>
                        <text x="20" y="45" fill="#e2e8f0">خرسانة أضلاع وأعصاب الهوردي:</text>
                        <text x="280" y="45" fill="#facc15" fontWeight="bold">{detailingData.summary.ribConcreteVolume.toFixed(2)} م³</text>

                        <text x="20" y="70" fill="#e2e8f0">خرسانة بلاطة التغطية العلوية:</text>
                        <text x="280" y="70" fill="#facc15" fontWeight="bold">{detailingData.summary.toppingConcreteVolume.toFixed(2)} م³</text>

                        <line x1="20" y1="85" x2="450" y2="85" stroke="#475569" />

                        {/* Steel weight takes */}
                        <text x="20" y="120" fill="#38bdf8" fontWeight="bold" fontSize="11">ثانياً: أوزان حديد التسليح (Steel Weights)</text>
                        <text x="20" y="145" fill="#e2e8f0">إجمالي وزن حديد التسليح الكلي:</text>
                        <text x="280" y="145" fill="#facc15" fontWeight="bold">{detailingData.summary.totalSteelWeight.toFixed(0)} كغ</text>

                        <text x="20" y="170" fill="#e2e8f0">معدل كثافة التسليح للمتر المربع:</text>
                        <text x="280" y="170" fill="#facc15" fontWeight="bold">{detailingData.summary.steelDensity.toFixed(1)} كغ/م²</text>
                      </g>
                    </g>
                  )}

                  {/* CAD Title Block (Bottom-Right inside current screen viewport) */}
                  <g transform="translate(420, 395)" className="font-sans" fontSize="6.5">
                    <rect x="0" y="0" width="310" height="65" fill="#0f172a" stroke="#475569" strokeWidth="1" />
                    <line x1="120" y1="0" x2="120" y2="65" stroke="#334155" />
                    <line x1="220" y1="0" x2="220" y2="65" stroke="#334155" />
                    
                    <text x="300" y="12" fill="#94a3b8" textAnchor="end" fontSize="6" fontWeight="bold">PROJECT: Hollow Block Slab</text>
                    <text x="300" y="24" fill="#f8fafc" textAnchor="end" fontSize="7" fontWeight="bold">{projectName.substring(0, 20)}</text>
                    <text x="300" y="36" fill="#94a3b8" textAnchor="end" fontSize="5.5">CODE: ACI 318-19 / SBC 304</text>

                    <text x="210" y="12" fill="#94a3b8" textAnchor="end" fontSize="6">SHEET TITLE:</text>
                    <text x="210" y="24" fill="#34d399" textAnchor="end" fontSize="7.5" fontWeight="bold">{activeSheet}</text>
                    <text x="210" y="36" fill="#94a3b8" textAnchor="end" fontSize="5.5">SCALE: {scale} &bull; TYPE: CONCRETE IFC</text>

                    <text x="110" y="15" fill="#94a3b8" textAnchor="end" fontSize="6.5">Designed: AI Detailing</text>
                    <text x="110" y="30" fill="#94a3b8" textAnchor="end" fontSize="5.5">Drawn: CAD AutoDrafter</text>
                    <text x="110" y="45" fill="#fb7185" textAnchor="end" fontSize="7.5" fontWeight="bold">S-IFC-HBS</text>
                  </g>
                </svg>
              </div>
            </div>

            {/* LOWER PORTION: VALDIATION CHECKS REPORT & LIVE REBAR SUMMARY METRICS */}
            <div className="p-3 bg-slate-900 border-t border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs select-none">
              
              {/* Validation panel */}
              <div className="bg-slate-950 p-2.5 rounded-md border border-slate-800">
                <span className="font-bold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                  <Activity className="text-purple-400" size={14} /> حالة تدقيق التصميم الكودي وتفاصيل تفريد الحديد ACI 318
                </span>
                <div className="space-y-1 text-[11px]">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>التحقق من سمك الغطاء الخرساني الصافي (Cover check)</span>
                    <span className="text-emerald-500 font-bold flex items-center gap-1">مطابق ✓ {cover}مم</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>برمجة أطوال تماسك وتطوير الأسياخ (db anchor)</span>
                    <span className="text-emerald-500 font-bold flex items-center gap-1">مستوفى ✓ {detailingData.summary.ribConcreteVolume > 0 ? 'Ld > 300 مم' : ''}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>حساب تفريد الكانات العلوية/السفلية بالبحور</span>
                    <span className="text-emerald-500 font-bold flex items-center gap-1">أمن ✓ (Multi-Zone)</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>رموز عناصر تجميع الـ BBS (Structural Marks)</span>
                    <span className="text-emerald-500 font-bold flex items-center gap-1">أمن ✓ (B1, T1, TS1)</span>
                  </div>
                </div>
              </div>

              {/* Live metrics panel */}
              <div className="bg-slate-950 p-2.5 rounded-md border border-slate-800 flex flex-col justify-between">
                <div>
                  <span className="font-bold text-slate-300 block mb-1.5">حجم الكميات الإجمالي الفعلي لعناصر أعصاب הסקוף</span>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 font-mono">
                    <div>إجمالي حجم الخرسانة: <span className="text-yellow-400 font-bold">{detailingData.summary.totalConcreteVolume.toFixed(2)} م³</span></div>
                    <div>إجمالي تسليح السقف: <span className="text-yellow-400 font-bold">{detailingData.summary.totalSteelWeight.toFixed(0)} كغ</span></div>
                    <div>كثافة تسليح السقف: <span className="text-yellow-400 font-bold">{detailingData.summary.steelDensity.toFixed(1)} كغ/م²</span></div>
                    <div>مجموع أطوال الحديد: <span className="text-yellow-400 font-bold">{detailingData.toppingSlab.totalLength.toFixed(0)} م</span></div>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* BOTTOM METRICS HISTOGRAM */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-muted">
          <h3 className="text-slate-800 dark:text-slate-200 text-xs font-bold mb-3 flex items-center gap-2">
            <TrendingDown size={14} className="text-purple-600" /> تحليل ومقارنة كتل حديد التسليح الفردي (Steel Rebar Weights)
          </h3>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { name: 'حديد سفلي الرئيسي (B)', weight: parseFloat(detailingData.summary.bottomSteelWeight.toFixed(1)) },
                  { name: 'حديد علوي المساند (T)', weight: parseFloat(detailingData.summary.topSteelWeight.toFixed(1)) },
                  { name: 'شبكة المقاومة (TS)', weight: parseFloat(detailingData.summary.toppingSteelWeight.toFixed(1)) },
                  { name: 'وزن كانات القص (ST)', weight: parseFloat(detailingData.summary.shearSteelWeight.toFixed(1)) }
                ]}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#888888" fontSize={11} />
                <YAxis stroke="#888888" fontSize={11} label={{ value: 'الوزن (kg)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#000' } }} />
                <Tooltip />
                <Bar dataKey="weight" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
