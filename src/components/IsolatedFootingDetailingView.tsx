/**
 * Interactive Footing Detailing & Project Foundation Layout System (ACI 318 Standard)
 * Designed by Senior Structural Detailing Software Engineer
 * 
 * Provides unified, coordinated drawing sheets matching professional Middle East construction practices.
 */

import React, { useState, useMemo } from 'react';
import { 
  Wrench, 
  Layers, 
  Trash2, 
  CheckCircle,
  AlertTriangle,
  Info,
  Scale, 
  Download,
  Check,
  FolderLock,
  Compass,
  CornerDownRight,
  Printer,
  Table,
  MapPin,
  Maximize2,
  FileSpreadsheet,
  Layers3,
  Calendar,
  Grid,
  FileText,
  Bookmark,
  ChevronRight,
  ShieldCheck,
  Search,
  BookOpen
} from 'lucide-react';
import { IsolatedFootingAnalysisResult } from '../lib/isolatedFootingEngine';
import { designIsolatedFootingStrength, IsolatedFootingDesignOutput } from '../lib/isolatedFootingDesignEngine';
import { 
  generateFootingDetailing, 
  generateProjectDetailing,
  IsolatedFootingDetailingOutput, 
  BBSItem, 
  DetailingBarGroup,
  ProjectFoundationLayoutData,
  ProjectFootingType,
  ProjectFootingLocation
} from '../lib/isolatedFootingDetailingEngine';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import type { Column } from '../lib/structuralEngine';

interface IsolatedFootingDetailingViewProps {
  analysisResult: IsolatedFootingAnalysisResult;
  fy: number;          // Steel yield limit (MPa)
  loadFactor?: number; // Load multiplier
  
  // Optional project props to run the project-wide classifier and layout plan
  columns?: Column[];
  colLoads3D?: Map<string, { P_service?: number; Pu?: number; MxBot?: number; MyBot?: number; Vu?: number }>;
  fc?: number;
  qall?: number;
  gammaConc?: number;
  gammaSoil?: number;
  soilCoverDepth?: number;
}

export default function IsolatedFootingDetailingView({
  analysisResult,
  fy = 420,
  loadFactor = 1.5,
  columns = [],
  colLoads3D,
  fc = 25,
  qall = 150,
  gammaConc = 24,
  gammaSoil = 18,
  soilCoverDepth = 1.2
}: IsolatedFootingDetailingViewProps) {
  // Navigation tabs for unified blueprint drawing package
  const [activeSheet, setActiveSheet] = useState<'S-101' | 'S-201' | 'S-301' | 'S-401' | 'S-402' | 'NOTES'>('S-101');

  // Ground level configurations in mm
  const [naturalGroundLevel, setNaturalGroundLevel] = useState<number>(1500);
  const [excavationOffset, setExcavationOffset] = useState<number>(500);

  // Drawing View properties
  const [selectedFootingTypeMark, setSelectedFootingTypeMark] = useState<string>('F1');
  const [selectedPlanLocId, setSelectedPlanLocId] = useState<string | null>(null);
  const [selectedScale, setSelectedScale] = useState<string>('auto');

  // Single footing computations (e.g. F1 fallback)
  const singleDesignResult = useMemo(() => {
    return designIsolatedFootingStrength(analysisResult, fy, loadFactor, 75);
  }, [analysisResult, fy, loadFactor]);

  const singleDetailingResult = useMemo(() => {
    return generateFootingDetailing(analysisResult, singleDesignResult, {
      naturalGroundLevel,
      excavationOffset,
      footingMark: 'F1'
    });
  }, [analysisResult, singleDesignResult, naturalGroundLevel, excavationOffset]);

  const {
    dimensions: singleDim,
    column: singleCol,
    rebarGroups: singleRebars,
    bbs: singleBBS,
    quantities: singleQuant,
    validations: singleValids
  } = singleDetailingResult;

  // Project-wide calculation context
  const projectMaterials = useMemo(() => ({
    fc,
    fy,
    qa: qall,
    cover: 75,
    gamma_conc: gammaConc,
    gamma_soil: gammaSoil,
    Df: soilCoverDepth + analysisResult.input.H / 1000
  }), [fc, fy, qall, gammaConc, gammaSoil, soilCoverDepth, analysisResult.input.H]);

  const projectData: ProjectFoundationLayoutData = useMemo(() => {
    const validCols = columns.length > 0 ? columns : [
      {
        id: analysisResult.input.Cx === 0 ? 'Col-Tmp' : 'C1',
        x: 0,
        y: 0,
        b: analysisResult.input.Cx || 300,
        h: analysisResult.input.Cy || 300,
        L: 3000,
        zBottom: 0,
        zTop: 3000
      }
    ];

    let loadsToUse = colLoads3D;
    if (!loadsToUse || loadsToUse.size === 0) {
      const map = new Map<string, any>();
      map.set('C1', { P_service: analysisResult.input.P });
      loadsToUse = map;
    }

    return generateProjectDetailing(
      validCols,
      loadsToUse,
      projectMaterials,
      {
        naturalGroundLevel,
        excavationOffset
      }
    );
  }, [columns, colLoads3D, projectMaterials, naturalGroundLevel, excavationOffset, analysisResult]);

  // Handle active footing type detail selection
  const selectedTypeData = useMemo(() => {
    const t = projectData.types.find(type => type.typeMark === selectedFootingTypeMark);
    return t || projectData.types[0] || {
      typeMark: 'F1',
      B: singleDim.B,
      L: singleDim.L,
      H: singleDim.H,
      colCx: singleCol.Cx || 300,
      colCy: singleCol.Cy || 300,
      rebarX: { diameter: singleRebars[0].diameter, quantity: singleRebars[0].quantity, spacing: singleRebars[0].spacing },
      rebarY: { diameter: singleRebars[1].diameter, quantity: singleRebars[1].quantity, spacing: singleRebars[1].spacing },
      concreteVolumeIndividual: singleQuant.concreteVolumeM3,
      steelWeightIndividual: singleQuant.steelWeightKg,
      footingCount: 1,
      bbs: singleBBS
    };
  }, [projectData, selectedFootingTypeMark, singleDim, singleCol, singleRebars, singleQuant, singleBBS]);

  // Drawing Scales
  const drawingScales = useMemo(() => {
    const scaleMap: Record<string, string> = {
      'S-101': '1:100',
      'S-201': 'N/A',
      'S-301': '1:20 (Plan), 1:25 (Sections)',
      'S-401': 'N/A',
      'S-402': 'N/A',
      'NOTES': 'N/A'
    };
    return scaleMap;
  }, []);

  const currentScaleLabel = selectedScale === 'auto' ? drawingScales[activeSheet] : selectedScale;

  // Render S-101 Plan mapping bounds
  const planSvgWidth = 600;
  const planSvgHeight = 450;
  const svgPaddingProj = 60;

  const projectBounds = useMemo(() => {
    const locs = projectData.locations;
    if (locs.length === 0) return { minX: -2, maxX: 2, minY: -2, maxY: 2, width: 4, height: 4 };
    const rawX = locs.map(l => l.x);
    const rawY = locs.map(l => l.y);
    const minX = Math.min(...rawX);
    const maxX = Math.max(...rawX);
    const minY = Math.min(...rawY);
    const maxY = Math.max(...rawY);

    return {
      minX: minX - 2.0,
      maxX: maxX + 2.0,
      minY: minY - 2.0,
      maxY: maxY + 2.0,
      width: (maxX - minX) + 4.0,
      height: (maxY - minY) + 4.0
    };
  }, [projectData]);

  const scaleProj = useMemo(() => {
    return Math.min(
      (planSvgWidth - 2 * svgPaddingProj) / projectBounds.width,
      (planSvgHeight - 2 * svgPaddingProj) / projectBounds.height
    );
  }, [projectBounds]);

  const mapX = (xVal: number) => {
    return svgPaddingProj + (xVal - projectBounds.minX) * scaleProj;
  };

  const mapY = (yVal: number) => {
    return planSvgHeight - (svgPaddingProj + (yVal - projectBounds.minY) * scaleProj);
  };

  // CSV export function for schedule
  const handleExportTypesCSV = () => {
    const header = 'رمز النموذج,عرض القاعدة B (mm),طول القاعدة L (mm),السماكة H (mm),تسليح الاتجاه X,تسليح الاتجاه Y,العدد بالمشروع,خرسانة الفردية (m3),وزن حديد الفردية (kg)';
    const rows = projectData.types.map(t => 
      `${t.typeMark},${t.B},${t.L},${t.H},${t.rebarX.quantity}Ø${t.rebarX.diameter},${t.rebarY.quantity}Ø${t.rebarY.diameter},${t.footingCount},${t.concreteVolumeIndividual},${t.steelWeightIndividual}`
    );
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(header + '\n' + rows.join('\n'));
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", "isolated_footings_schedule_S-201.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // General CSV download for BBS
  const handleExportBbsCSV = () => {
    const header = 'نوع القاعدة,رمز السيخ,القطر mm,الشكل,العدد,الطول الكلي m,الوزن الكلي kg';
    const rows: string[] = [];
    projectData.types.forEach(type => {
      type.bbs.forEach(item => {
        rows.push(`${type.typeMark},${item.barMark},${item.diameter},${item.shapeCode === 11 ? 'Hooked' : 'Straight'},${item.qty},${item.totalLengthM},${item.totalWeightKg}`);
      });
    });
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(header + '\n' + rows.join('\n'));
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", "project_bbs_table_S-401.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Overlap Detection Engine
  const overlappingColumnIds = useMemo(() => {
    const ids = new Set<string>();
    const locs = projectData.locations;
    for (let i = 0; i < locs.length; i++) {
      const locA = locs[i];
      const typeA = projectData.types.find(t => t.typeMark === locA.typeMark);
      if (!typeA) continue;
      
      const leftA = locA.x * 1000 - typeA.B / 2;
      const rightA = locA.x * 1000 + typeA.B / 2;
      const bottomA = locA.y * 1000 - typeA.L / 2;
      const topA = locA.y * 1000 + typeA.L / 2;

      for (let j = i + 1; j < locs.length; j++) {
        const locB = locs[j];
        const typeB = projectData.types.find(t => t.typeMark === locB.typeMark);
        if (!typeB) continue;

        const leftB = locB.x * 1000 - typeB.B / 2;
        const rightB = locB.x * 1000 + typeB.B / 2;
        const bottomB = locB.y * 1000 - typeB.L / 2;
        const topB = locB.y * 1000 + typeB.L / 2;

        const xOverlap = rightA > leftB && leftA < rightB;
        const yOverlap = topA > bottomB && bottomA < topB;

        if (xOverlap && yOverlap) {
          ids.add(locA.colId);
          ids.add(locB.colId);
        }
      }
    }
    return ids;
  }, [projectData]);

  // Quality Control Checks
  const qualityControlWarnings = useMemo(() => {
    const warnings: string[] = [];
    
    // Check missing dimensions or sizing anomalies
    projectData.types.forEach(type => {
      if (type.B < 600 || type.L < 600) {
        warnings.push(`تنبيه جودة الرسم: أبعاد النموذج ${type.typeMark} صغيرة جداً للحد كقاعدة إنشائية مسلحة.`);
      }
      if (type.H < 300) {
        warnings.push(`تدقيق الكود: سمك القاعدة ${type.typeMark} يقل عن 300 مم، وهو الحد الأدنى للصلابة والمقاومة للقص الثاقب.`);
      }
      const bRatio = type.B / type.L;
      if (bRatio < 0.4 || bRatio > 2.5) {
        warnings.push(`تنبيه ملاءمة هندسية: نسبة الأبعاد غير مستقرة لقاعدة ${type.typeMark}، قد يسبب تركيز إجهادات.`);
      }
    });

    // Spacing rules check
    projectData.types.forEach(type => {
      const clearX = (type.B - 150) / (type.rebarX.quantity - 1) - type.rebarX.diameter;
      const clearY = (type.L - 150) / (type.rebarY.quantity - 1) - type.rebarY.diameter;
      if (clearX < 75 || clearY < 75) {
        warnings.push(`تنبيه تعشيش (${type.typeMark}): تباعد الأسياخ الصافي في أحد الاتجاهين يقل عن 75 مم، يُنصح بزيادة القطر وتقليل العدد بالتوافق مع خلاط الموقع.`);
      }
    });

    // Overlaps detection between different footings
    const locs = projectData.locations;
    for (let i = 0; i < locs.length; i++) {
      const locA = locs[i];
      const typeA = projectData.types.find(t => t.typeMark === locA.typeMark);
      if (!typeA) continue;
      
      const leftA = locA.x * 1000 - typeA.B / 2;
      const rightA = locA.x * 1000 + typeA.B / 2;
      const bottomA = locA.y * 1000 - typeA.L / 2;
      const topA = locA.y * 1000 + typeA.L / 2;

      for (let j = i + 1; j < locs.length; j++) {
        const locB = locs[j];
        const typeB = projectData.types.find(t => t.typeMark === locB.typeMark);
        if (!typeB) continue;

        const leftB = locB.x * 1000 - typeB.B / 2;
        const rightB = locB.x * 1000 + typeB.B / 2;
        const bottomB = locB.y * 1000 - typeB.L / 2;
        const topB = locB.y * 1000 + typeB.L / 2;

        const xOverlap = rightA > leftB && leftA < rightB;
        const yOverlap = topA > bottomB && bottomA < topB;

        if (xOverlap && yOverlap) {
          const dx = Math.max(0, Math.min(rightA, rightB) - Math.max(leftA, leftB)) / 10;
          const dy = Math.max(0, Math.min(topA, topB) - Math.max(bottomA, bottomB)) / 10;
          warnings.push(`⚠️ تعارض هندسي وتداخل: نموذج القاعدة (${locA.colId} - ${locA.typeMark}) يتداخل هندسياً مع نموذج (${locB.colId} - ${locB.typeMark}) بمقدار ${dx.toFixed(1)} سم أفقي و ${dy.toFixed(1)} سم رأسي. يُوصى بدمجهما في قاعدة مشتركة (Combined Footing) أو شريطية (Strip Footing).`);
        }
      }
    }

    return warnings;
  }, [projectData]);

  // Dynamic Drawing Coordinates for Sheet S-301 Selected Concrete details
  const typicalB = selectedTypeData.B;
  const typicalL = selectedTypeData.L;
  const typicalH = selectedTypeData.H;
  const typicalCx = selectedTypeData.colCx;
  const typicalCy = selectedTypeData.colCy;

  // Draw scaled constants inside 260x220 container
  const sizeMultiplier = Math.min(180 / typicalB, 180 / typicalL);
  const detB = typicalB * sizeMultiplier;
  const detL = typicalL * sizeMultiplier;
  const detH = typicalH * sizeMultiplier;
  const detCx = typicalCx * sizeMultiplier;
  const detCy = typicalCy * sizeMultiplier;

  // Print active sheet on a separate window
  const handlePrintActiveSheet = () => {
    const rawContent = document.getElementById('print-sheet-content')?.innerHTML;
    if (!rawContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const sheetLabels: Record<string, string> = {
      'S-101': 'S-101: مخطط توزيع القواعد والمحاور العام',
      'S-201': 'S-201: جدول القواعد المعتمد',
      'S-301': 'S-301: تفاصيل التسليح والقطاعات الإنشائية',
      'S-401': 'S-401: كشف تفريد حديد التسليح (BBS)',
      'S-402': 'S-402: مذكرة إجمالي المواد والكميات',
      'NOTES': 'المواصفات العامة والملاحظات الإنشائية'
    };
    const title = sheetLabels[activeSheet] || 'مخطط إنشائي للأساسات';

    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
        <style>
          body {
            font-family: 'Cairo', 'Inter', sans-serif;
            background-color: #ffffff !important;
            color: #0f172a !important;
            padding: 30px;
          }
          .no-print-bar {
            background: #1e293b;
            color: #fff;
            padding: 14px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-radius: 8px;
            margin-bottom: 24px;
            font-family: 'Cairo', sans-serif;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
          }
          .print-btn {
            background: #2563eb;
            color: white;
            border: none;
            padding: 8px 24px;
            font-weight: bold;
            font-size: 13px;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.15s ease;
          }
          .print-btn:hover {
            background: #1d4ed8;
          }
          /* Custom overrides for printing slate-colored components */
          .bg-slate-950, .bg-zinc-950, .bg-zinc-900, .bg-[#0f172a], .bg-[#020617], .bg-card, .bg-background {
            background-color: #ffffff !important;
            color: #0d1321 !important;
            border-color: #cbd5e1 !important;
          }
          .text-zinc-400, .text-slate-400, .text-muted-foreground {
            color: #475569 !important;
          }
          .text-zinc-300, .text-slate-350, .text-slate-300, .text-zinc-200 {
            color: #1e293b !important;
          }
          .text-zinc-100, .text-slate-100, .text-slate-50 {
            color: #0f172a !important;
          }
          .border-zinc-805, .border-zinc-800, .border-slate-800, .border-zinc-700\\/60, .border-zinc-750, .border-slate-800 {
            border-color: #e2e8f0 !important;
          }
          svg text {
            fill: #000000 !important;
          }
          svg circle {
            fill: #ffffff !important;
            stroke: #000000 !important;
          }
          /* Specific SVG adjustment for premium high-contrast paper readability */
          svg {
            background: #f8fafc !important;
            border: 1.5px solid #cbd5e1 !important;
            border-radius: 8px !important;
            max-width: 600px !important;
            margin: 0 auto !important;
          }
          @media print {
            .no-print-bar {
              display: none !important;
            }
            body {
              padding: 0 !important;
            }
            .sheet-page {
              margin: 0 !important;
              box-shadow: none !important;
              background-color: transparent !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="no-print-bar">
          <div style="font-weight: bold; font-size:14px; display:flex; align-items:center; gap: 8px;">
            <span>📐 لوحة المخطط الإنشائي:</span>
            <span style="color:#60a5fa;">${title}</span>
          </div>
          <button class="print-btn" onclick="window.print()">🖨️ تأكيد وطباعة اللوحة / Print Blueprint</button>
        </div>
        <div class="sheet-page">
          ${rawContent}
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6 font-sans select-none" id="drawingEngineSection">
      
      {/* ── Engineering Control Panel Workspace ── */}
      <Card className="border shadow-xs bg-card text-card-foreground">
        <CardHeader className="p-4 border-b">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-1.5 font-sans">
                <Wrench className="h-4.5 w-4.5 text-blue-600" />
                لوحة إعدادات المخطط الإنشائي (Coordinated Drawing Control Panel)
              </CardTitle>
              <CardDescription className="text-[11px] mt-0.5 text-muted-foreground">
                قم بمزامنة منسوب التأسيس وخلوص الحفريات لتحديث المخططات ومذكرة الكميات تلقائياً
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[11px] font-mono uppercase bg-[#1e293b] text-blue-400 border-slate-705">
                مقياس اللوحة النشطة: {currentScaleLabel}
              </Badge>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 text-[11px] font-bold gap-1 text-blue-600 hover:text-blue-700 bg-blue-50/5 hover:bg-blue-50/15"
                onClick={handlePrintActiveSheet}
              >
                <Printer className="h-3.5 w-3.5" />
                طباعة اللوحة الإنشائية
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div className="space-y-1">
            <span className="font-semibold text-muted-foreground block">عمق حفريات التأسيس (NGL Depth)</span>
            <div className="flex gap-1.5 items-center">
              <input
                type="number"
                min="500"
                max="5000"
                step="100"
                value={naturalGroundLevel}
                onChange={(e) => setNaturalGroundLevel(parseInt(e.target.value) || 1500)}
                className="w-full text-xs font-mono h-8 rounded border px-2 bg-background text-foreground"
              />
              <span className="text-muted-foreground font-sans">مم</span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-none">مستوى الحفر المقاس لأسفل القاعدة</p>
          </div>

          <div className="space-y-1">
            <span className="font-semibold text-muted-foreground block">رفرفة خلوص الحفر الجانبي (Geotech Offset)</span>
            <div className="flex gap-1.5 items-center">
              <input
                type="number"
                min="100"
                max="2000"
                step="50"
                value={excavationOffset}
                onChange={(e) => setExcavationOffset(parseInt(e.target.value) || 500)}
                className="w-full text-xs font-mono h-8 rounded border px-2 bg-background text-foreground"
              />
              <span className="text-muted-foreground font-sans">مم</span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-none">مساحة عمل نجارة وطوبار القواعد</p>
          </div>

          <div className="space-y-1">
            <span className="font-semibold text-muted-foreground block">تحديد مقياس اللوحة (Plot Scale)</span>
            <select
              value={selectedScale}
              onChange={(e) => setSelectedScale(e.target.value)}
              className="w-full text-xs h-8 rounded border px-2 bg-background text-foreground"
            >
              <option value="auto">تلقائي حسب المساحة (Auto Optimize)</option>
              <option value="1:100">1:100 (مخطط عام)</option>
              <option value="1:75">1:75 (متوسط)</option>
              <option value="1:50">1:50 (تفصيلي)</option>
              <option value="1:25">1:25 (تفاصيل تسليح)</option>
              <option value="1:20">1:20 (فائق الدقة)</option>
            </select>
            <p className="text-[10px] text-muted-foreground leading-none">تكييف أبعاد خطوط الأبعاد والرموز</p>
          </div>

          <div className="space-y-1">
            <span className="font-semibold text-muted-foreground block">مزامنة تفريد نموذج التفاصيل</span>
            <select
              value={selectedFootingTypeMark}
              onChange={(e) => setSelectedFootingTypeMark(e.target.value)}
              className="w-full text-xs h-8 rounded border px-2 bg-background text-foreground font-bold font-mono text-blue-600"
            >
              {projectData.types.map(type => (
                <option key={type.typeMark} value={type.typeMark}>
                  نموذج القاعدة المعزولة {type.typeMark} ({type.B}×{type.L} mm)
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground leading-none">مزامنة لوحة تفاصيل التسليح والقطاعات</p>
          </div>
        </CardContent>
      </Card>

      {/* ── BLUEPRINT SHEET NAVIGATION SYSTEM ── */}
      <div className="flex flex-wrap gap-1.5 p-1 bg-muted rounded-lg border">
        {[
          { id: 'S-101', label: 'S-101: مخطط توزيع القواعد والمحاور', icon: Compass, color: 'text-blue-600' },
          { id: 'S-201', label: 'S-201: جدول القواعد المعتمد', icon: Table, color: 'text-emerald-600' },
          { id: 'S-301', label: 'S-301: تفاصيل التسليح والقطاعات الإنشائية', icon: Layers3, color: 'text-rose-600' },
          { id: 'S-401', label: 'S-401: كشف تفريد حديد التسليح (BBS)', icon: FileSpreadsheet, color: 'text-indigo-600' },
          { id: 'S-402', label: 'S-402: مذكرة إجمالي المواد والكميات', icon: FileText, color: 'text-amber-700' },
          { id: 'NOTES', label: 'المواصفات العامة والملاحظات الإنشائية', icon: BookOpen, color: 'text-stone-600' }
        ].map(sheet => (
          <button
            key={sheet.id}
            onClick={() => setActiveSheet(sheet.id as any)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-md transition-all ${
              activeSheet === sheet.id
                ? 'bg-background text-foreground shadow-sm border border-border'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
            }`}
          >
            <sheet.icon className={`h-4 w-4 ${sheet.color}`} />
            <span>{sheet.label}</span>
          </button>
        ))}
      </div>

      {/* ── DRAWING QUALITY CONTROL INTEGRITY BANNER ── */}
      {qualityControlWarnings.length > 0 && (
        <div className="bg-amber-100/15 border border-amber-300 text-amber-900 rounded-lg p-3 text-xs flex gap-3 items-start animate-fade-in">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="space-y-1 text-right w-full">
            <span className="font-bold block">تأكيد ومراجعة جودة تفريد المخططات (Drawing Integrity & Compliance Engine)</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-normal leading-relaxed">
              {qualityControlWarnings.map((warn, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <span className="text-amber-600 font-bold shrink-0">•</span>
                  <span>{warn}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── SHEET CONTENT RENDERINGS ── */}
      <div id="print-sheet-content" className="w-full">

      {/* 1. SHEET S-101: FOUNDATION LAYOUT PLAN */}
      {activeSheet === 'S-101' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 animate-fade-in">
          
          {/* Main Plan View Canvas inside a true drawing border layout */}
          <div className="xl:col-span-8 bg-slate-50 rounded-xl border border-slate-200 p-6 relative flex flex-col justify-between min-h-[520px]">
            
            {/* Architectural Drawing Badge Info */}
            <div className="flex justify-between items-center text-slate-500 text-xs border-b border-slate-200 pb-3 mb-4 font-mono select-none">
              <div className="flex items-center gap-2">
                <Compass className="h-4.5 w-4.5 text-blue-600" />
                <span className="font-bold text-slate-800 font-sans">FOUNDATION LAYOUT PLAN (مخطط توزيع الأساسات والمحاور العام)</span>
              </div>
              <div>SHEET NO. S-101</div>
            </div>

            {/* Scale & Compass Indicator */}
            <div className="absolute top-24 left-6 border border-slate-200 bg-white p-2.5 rounded text-[10px] font-mono text-slate-800 space-y-1.5 shadow-sm">
              <div className="flex items-center gap-1.5 justify-between">
                <span>NORTH (شمال)</span>
                <span className="font-bold text-rose-600">▲</span>
              </div>
              <div className="border-t border-slate-100 pt-1 flex justify-between gap-3">
                <span>SCALE:</span>
                <span className="font-bold text-slate-900">{currentScaleLabel}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>CONCRETE COVER:</span>
                <span className="font-bold text-slate-900 font-sans">75 mm</span>
              </div>
            </div>

            {/* Selected Footing Location Absolute Sidebar */}
            {selectedPlanLocId && (
              <div className="absolute bottom-6 right-6 bg-white/95 border border-blue-200 p-4 rounded-xl text-xs text-slate-800 shadow-xl max-w-sm animate-fade-in z-10 space-y-2.5">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-1">
                  <span className="font-bold text-blue-600 text-[12px] flex items-center gap-1.5">
                    <Bookmark className="h-4 w-4" />
                    بيان القاعدة بالمخطط: {selectedPlanLocId}
                  </span>
                  <button 
                    onClick={() => setSelectedPlanLocId(null)}
                    className="text-slate-400 hover:text-slate-755 text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
                {(() => {
                  const loc = projectData.locations.find(l => l.colId === selectedPlanLocId);
                  if (!loc) return null;
                  const type = projectData.types.find(t => t.typeMark === loc.typeMark)!;
                  return (
                    <div className="space-y-1.5 font-sans text-[11px] leading-relaxed text-slate-700">
                      <div className="flex justify-between">
                        <span className="text-slate-500">رمز نموذج القاعدة:</span>
                        <Badge className="bg-blue-50 text-blue-700 border border-blue-100 font-bold font-mono">{loc.typeMark}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">تقاطع المحاور (Grid Junction):</span>
                        <span className="font-mono font-bold text-amber-700">{loc.gridRef}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">أبعاد صبة الخرسانة B×L×H:</span>
                        <span className="font-mono text-slate-900 font-semibold">{type.B} × {type.L} × {type.H} مم</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">حديد تسليح الاتجاهين (X / Y):</span>
                        <span className="font-mono text-emerald-750 font-bold">
                          {type.rebarX.quantity}Ø{type.rebarX.diameter} / {type.rebarY.quantity}Ø{type.rebarY.diameter}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">الإحداثيات المساحية (E, N):</span>
                        <span className="font-mono text-slate-900 font-bold">({loc.x.toFixed(3)}, {loc.y.toFixed(3)}) م</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-100 pt-1.5 text-slate-500">
                        <span>منسوب صب التأسيس:</span>
                        <span className="font-mono text-red-600 font-bold">{loc.elevation} مم</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Drawing Plan SVG Canvas */}
            <div className="w-full flex justify-center items-center py-4">
              <svg
                viewBox={`0 0 ${planSvgWidth} ${planSvgHeight}`}
                className="w-full max-w-[530px] h-auto"
                style={{ direction: 'ltr' }}
              >
                {/* Site Gridlines */}
                <g stroke="#cbd5e1" strokeWidth="0.85" strokeDasharray="4 4" opacity="1.0">
                  {projectData.xGridLines.map((gl, idx) => (
                    <line
                      key={`xgl-${idx}`}
                      x1={mapX(gl.coord)}
                      y1={25}
                      x2={mapX(gl.coord)}
                      y2={planSvgHeight - 30}
                    />
                  ))}
                  {projectData.yGridLines.map((gl, idx) => (
                    <line
                      key={`ygl-${idx}`}
                      x1={25}
                      y1={mapY(gl.coord)}
                      x2={planSvgWidth - 25}
                      y2={mapY(gl.coord)}
                    />
                  ))}
                </g>

                {/* Grid line bubble labels */}
                <g className="text-slate-600 text-[9px] font-mono font-bold select-none text-center">
                  {projectData.xGridLines.map((gl, idx) => (
                    <g key={`xgl-lbl-${idx}`}>
                      <circle cx={mapX(gl.coord)} cy={18} r="8.5" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1" />
                      <text x={mapX(gl.coord)} y={21} fill="#334155" textAnchor="middle">{gl.label}</text>
                    </g>
                  ))}
                  {projectData.yGridLines.map((gl, idx) => (
                    <g key={`ygl-lbl-${idx}`}>
                      <circle cx={18} cy={mapY(gl.coord)} r="8.5" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1" />
                      <text x={18} y={mapY(gl.coord) + 3} fill="#334155" textAnchor="middle">{gl.label}</text>
                    </g>
                  ))}
                </g>

                {/* Coordinated footings rectangles & markers */}
                {projectData.locations.map((loc, idx) => {
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

                  const isSelected = selectedPlanLocId === loc.colId;

                  return (
                    <g key={`fplot-${idx}`}>
                      
                      {/* Base Concrete Footing Rectangle */}
                      <rect
                        x={fX}
                        y={fY}
                        width={footW}
                        height={footH}
                        fill={isSelected ? 'rgba(59, 130, 246, 0.15)' : (overlappingColumnIds.has(loc.colId) ? 'rgba(239, 68, 68, 0.12)' : '#f8fafc')}
                        stroke={isSelected ? '#2563eb' : (overlappingColumnIds.has(loc.colId) ? '#dc2626' : '#64748b')}
                        strokeWidth={isSelected ? 2.0 : (overlappingColumnIds.has(loc.colId) ? 1.6 : 1.1)}
                        className={`cursor-pointer transition-all hover:stroke-rose-500 ${overlappingColumnIds.has(loc.colId) ? 'animate-pulse' : ''}`}
                        onClick={() => setSelectedPlanLocId(loc.colId)}
                        rx="1"
                      />

                      {/* Solid Column Reference */}
                      <rect
                        x={cX}
                        y={cY}
                        width={colW}
                        height={colH}
                        fill="#f43f5e"
                        stroke="#fda4af"
                        strokeWidth="0.6"
                      />

                      {/* Footing Code Label Bubble (F1, F2...) */}
                      <rect 
                        x={mapX(loc.x) - 13} 
                        y={fY - 13} 
                        width="26" 
                        height="11" 
                        fill={overlappingColumnIds.has(loc.colId) ? '#fee2e2' : '#f1f5f9'} 
                        rx="1.5" 
                        stroke={overlappingColumnIds.has(loc.colId) ? '#dc2626' : '#94a3b8'} 
                        strokeWidth="0.6" 
                      />
                      <text
                        x={mapX(loc.x)}
                        y={fY - 4}
                        fill={overlappingColumnIds.has(loc.colId) ? '#991b1b' : '#0252ad'}
                        textAnchor="middle"
                        className="text-[7.5px] font-bold font-mono"
                      >
                        {loc.typeMark}
                      </text>

                      {/* Column and axis references */}
                      <text
                        x={mapX(loc.x)}
                        y={mapY(loc.y) + (colH/2) + 9}
                        fill="#475569"
                        textAnchor="middle"
                        className="text-[6.5px] font-mono select-none pointer-events-none"
                      >
                        {loc.colId}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Visual description notes */}
            <div className="text-[10px] text-slate-500 font-sans flex justify-between select-none border-t border-slate-200 pt-3.5 mt-4">
              <span>* انقر على أي قاعدة بمسار المخطط لمراجعة أبعاد نجارتها ومناسيب صب الخرسانة والتسليح</span>
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                أعمدة الدور الأرضي الخرسانية
              </span>
            </div>
          </div>

          {/* S-101 Schedule and side takeoffs */}
          <div className="xl:col-span-4 space-y-4">
            <Card className="border">
              <CardHeader className="py-3 bg-muted/20 border-b">
                <CardTitle className="text-xs font-bold">بنية تجميع نماذج المخطط</CardTitle>
                <CardDescription className="text-[10px]/normal">تجميع تلقائي للأبعاد في نماذج موحدة لمنع تعرج البناء بالموقع</CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-3.5 text-xs font-sans">
                <p className="leading-relaxed text-muted-foreground text-[11px]">
                  مدرج ومطابق بالموقع عدد <span className="font-bold text-blue-600 font-mono">{projectData.locations.length} قاعدات معزولة</span> مصنفة هندسياً في <span className="font-bold text-blue-600 font-mono">{projectData.types.length} نماذج معتمدة</span> في جداول ورشة الشغل والموقع.
                </p>
                <div className="divide-y text-[11px] border rounded overflow-hidden">
                  {projectData.types.map(type => (
                    <div 
                      key={type.typeMark} 
                      className={`p-2.5 flex justify-between items-center cursor-pointer hover:bg-muted/40 transition-colors ${
                        selectedFootingTypeMark === type.typeMark ? 'bg-blue-50/10 border-l-2 border-l-blue-600' : ''
                      }`}
                      onClick={() => setSelectedFootingTypeMark(type.typeMark)}
                    >
                      <div className="space-y-0.5">
                        <span className="font-bold text-blue-600 font-mono block text-xs">{type.typeMark} ({type.footingCount} قواعد بالمشروع)</span>
                        <span className="text-muted-foreground font-mono leading-none text-[10px]">{type.B}×{type.L}×{type.H} مم</span>
                      </div>
                      <Badge className="bg-slate-800 text-zinc-100 font-mono">
                        {type.rebarX.quantity}Ø{type.rebarX.diameter} / {type.rebarY.quantity}Ø{type.rebarY.diameter}
                      </Badge>
                    </div>
                  ))}
                </div>
                <div className="bg-blue-50/15 border border-blue-200/40 p-3 rounded-lg flex gap-2.5">
                  <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-[10.5px] leading-relaxed text-blue-900 font-normal">
                    لتحميل مخططات AutoCAD بصيغ DXF و DWG لتوزيع القواعد، يرجى التصدير واستبقاء تقاطع المحاور كقاعدة مرجعية معتمدة بالمساحة.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border">
              <CardHeader className="py-3 bg-muted/20 border-b">
                <CardTitle className="text-xs font-bold">محددات القياس والإحداثيات</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs">
                <div className="space-y-2 text-[11px] leading-relaxed text-muted-foreground">
                  <p>تم تحديد منطلق البناء العام طبقاً للمناسيب والإحداثيات الجغرافية المعتمدة بتصريح البناء:</p>
                  <div className="space-y-1.5 font-mono text-foreground bg-muted/40 p-2.5 rounded border border-dashed text-[10.5px]">
                    <div className="flex justify-between">
                      <span className="font-sans text-muted-foreground">منسوب الصفر المعماري (0.00):</span>
                      <span className="font-bold">مستوى الرصيف</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans text-muted-foreground">منسوب التأسيس المقترح لأسفل الخرسانة:</span>
                      <span className="font-bold text-red-600">-{naturalGroundLevel} مم</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans text-muted-foreground">خلوص الرفرفة في التربة الطينية/الرملية:</span>
                      <span className="font-bold">+{excavationOffset} مم لكل اتجاه</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      )}

      {/* 2. SHEET S-201: FOUNDATION SCHEDULE */}
      {activeSheet === 'S-201' && (
        <Card className="border animate-fade-in">
          <CardHeader className="py-4 bg-muted/20 border-b flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-1.5 font-sans">
                <Table className="h-4.5 w-4.5 text-emerald-600" />
                FOUNDATION SCHEDULE SHEET (جدول تفصيل وتجميع القواعد المتكافئة للصب)
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                مخطط جدولة مطابقة الأبعاد الهندسية والتسليح المظروفي تحت إشراف المكتب الاستشاري
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[11px] font-bold gap-1 mt-1 shrink-0"
              onClick={handleExportTypesCSV}
            >
              <Download className="h-4 w-4 text-emerald-600" />
              تصدير جدول القواعد CSV
            </Button>
          </CardHeader>
          <CardContent className="p-0 text-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-center border-collapse">
                <thead>
                  <tr className="bg-muted text-[11px] text-muted-foreground border-b border-border/70 select-none font-bold">
                    <th className="py-3 px-3 font-semibold text-right">رمز النموذج (Type)</th>
                    <th className="py-3 px-3">العرض B (mm)</th>
                    <th className="py-3 px-3">الطول L (mm)</th>
                    <th className="py-3 px-3">السماكة H (mm)</th>
                    <th className="py-3 px-3 font-mono">الفرش السفلي (Bottom X)</th>
                    <th className="py-3 px-3 font-mono">الغطاء السفلي (Bottom Y)</th>
                    <th className="py-3 px-3">حجم خرسانة القاعدة الفردية (m³)</th>
                    <th className="py-3 px-3">وزن حديد التسليح الفردي (kg)</th>
                    <th className="py-3 px-3 font-bold text-blue-700">الكمية بالمشروع (Pcs)</th>
                    <th className="py-3 px-3">تفاصيل النماذج النشطة</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-mono font-medium text-[11px] text-foreground">
                  {projectData.types.map((type) => (
                    <tr key={type.typeMark} className="hover:bg-muted/10 font-sans">
                      <td className="py-3.5 px-3 text-right font-bold text-blue-600 text-[12px]">{type.typeMark}</td>
                      <td className="py-3.5 px-3 font-mono text-zinc-800">{type.B}</td>
                      <td className="py-3.5 px-3 font-mono text-zinc-800">{type.L}</td>
                      <td className="py-3.5 px-3 font-mono text-zinc-800">{type.H}</td>
                      <td className="py-3.5 px-3 font-mono text-indigo-700 font-bold">{type.rebarX.quantity} Ø {type.rebarX.diameter} <span className="text-[10px] text-muted-foreground">@{type.rebarX.spacing}mm</span></td>
                      <td className="py-3.5 px-3 font-mono text-teal-700 font-bold">{type.rebarY.quantity} Ø {type.rebarY.diameter} <span className="text-[10px] text-muted-foreground">@{type.rebarY.spacing}mm</span></td>
                      <td className="py-3.5 px-3 font-mono text-stone-700">{type.concreteVolumeIndividual.toFixed(3)}</td>
                      <td className="py-3.5 px-3 font-mono text-emerald-600 font-black">{type.steelWeightIndividual.toFixed(1)}</td>
                      <td className="py-3.5 px-3 font-bold text-blue-700 text-xs font-mono">{type.footingCount}</td>
                      <td className="py-3.5 px-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10.5px] hover:text-blue-700 hover:bg-blue-50 font-bold font-sans"
                          onClick={() => {
                            setSelectedFootingTypeMark(type.typeMark);
                            setActiveSheet('S-301');
                          }}
                        >
                          استعراض القطاع التفصيلي ←
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-muted/40 border-t flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-sans">
              <p className="text-muted-foreground leading-normal max-w-2xl text-[11px]">
                * يتم استخدام حديد تسليح عالي المقاومة فئة Grade 420 (أو ما يعادله بمقاومة خضوع fy = 420 MPa) في الفرش والغطاء السفلي. جميع الأبعاد الإنشائية والسمكات بالمليمتر والكميات بالمتر المكعب والكيلوجرام.
              </p>
              <div className="flex gap-2 shrink-0">
                <Badge className="bg-[#0f172a] text-zinc-100 p-2 text-xs">خرسانة القواعد الكلية = {projectData.totalConcreteVolume} m³</Badge>
                <Badge className="bg-[#0f172a] text-zinc-100 p-2 text-xs">إجمالي حديد التسليح = {projectData.totalSteelWeight.toLocaleString()} kg</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. SHEET S-301: FOOTING DETAILS & SECTIONS */}
      {activeSheet === 'S-301' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
          
          {/* Layout detail graphics (Plan View and elevation sectional cuts) */}
          <div className="lg:col-span-8 bg-slate-50 rounded-xl border border-slate-200 p-5 relative min-h-[580px] flex flex-col justify-between">
            <div className="flex justify-between items-center text-slate-500 text-xs border-b border-slate-200 pb-3 mb-4 font-mono select-none">
              <div className="flex items-center gap-1.5 justify-start">
                <Layers3 className="h-4.5 w-4.5 text-rose-500" />
                <span className="font-bold text-slate-800 font-sans">TYPICAL FOUNDATION DETAILED VIEW (نموذج تفاصيل الحديد والقطاعات)</span>
                <Badge className="bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-50 font-bold ml-2">{selectedFootingTypeMark}</Badge>
              </div>
              <span>SHEET NO. S-301</span>
            </div>

            {/* Drawing interactive visualization split inside */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-3">
              
              {/* Plot 1: TOP PLAN VIEW */}
              <div className="bg-white rounded-lg p-3 border border-slate-200 flex flex-col justify-between items-center h-[340px]">
                <span className="text-[10.5px] font-bold text-slate-800 border-b border-slate-100 pb-1 w-full text-center">
                   TOP VIEW PLAN (لوحة المحور الأفقي)
                </span>
                
                <svg viewBox="0 0 240 220" className="w-full h-auto max-h-[220px]" style={{ direction: 'ltr' }}>
                  {/* Footing Concrete Box */}
                  <rect 
                    x={(240 - detB) / 2} 
                    y={(220 - detL) / 2} 
                    width={detB} 
                    height={detL} 
                    fill="#f8fafc" 
                    stroke="#64748b" 
                    strokeWidth="1.5" 
                    rx="3"
                  />
                  {/* Clear Cover dashed line */}
                  <rect 
                    x={(240 - detB) / 2 + 6} 
                    y={(220 - detL) / 2 + 6} 
                    width={detB - 12} 
                    height={detL - 12} 
                    fill="none" 
                    stroke="#94a3b8" 
                    strokeWidth="0.8" 
                    strokeDasharray="3 3"
                  />
                  {/* Embedded Column */}
                  <rect 
                    x={(240 - detCx) / 2} 
                    y={(220 - detCy) / 2} 
                    width={detCx} 
                    height={detCy} 
                    fill="rgba(244, 63, 94, 0.15)" 
                    stroke="#f43f5e" 
                    strokeWidth="2" 
                    rx="1"
                  />
                  {/* X Reinforcing lines (Blue) */}
                  <line 
                    x1={(240 - detB) / 2 + 6} y1={110} 
                    x2={(240 + detB) / 2 - 6} y2={110} 
                    stroke="#3b82f6" strokeWidth="2"
                  />
                  {/* Y Reinforcing lines (Green) */}
                  <line 
                    x1={120} y1={(220 - detL) / 2 + 6} 
                    x2={120} y2={(220 + detL) / 2 - 6} 
                    stroke="#10b981" strokeWidth="2.0"
                  />

                  {/* Dimensions annotations */}
                  <text x={120} y={(220 - detL) / 2 - 6} fill="#334155" textAnchor="middle" className="text-[8px] font-mono font-bold">
                    B = {typicalB}mm
                  </text>
                  <text x={(240 - detB) / 2 - 12} y={113} fill="#334155" textAnchor="middle" transform="rotate(-90, 18, 113)" className="text-[8px] font-mono font-bold">
                    L = {typicalL}mm
                  </text>
                </svg>

                <div className="text-[9.5px] text-slate-500 font-sans tracking-tight text-right w-full">
                  * سمك الغطاء الخرساني الصافي المستبقى 75 مم لجميع الاتجاهات لمنع رطوبة التربة
                </div>
              </div>

              {/* Plot 2: SECTION A-A SECTIONAL VIEW (Along X Direction) */}
              <div className="bg-white rounded-lg p-3 border border-slate-200 flex flex-col justify-between items-center h-[340px]">
                <span className="text-[10.5px] font-bold text-slate-800 border-b border-slate-100 pb-1 w-full text-center">
                  SECTION A-A (قطاع عرضي موازي لـ B)
                </span>
                
                <svg viewBox="0 0 240 220" className="w-full h-auto max-h-[220px]" style={{ direction: 'ltr' }}>
                  {/* Ground Level Hatch */}
                  <line x1={10} y1={55} x2={230} y2={55} stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 3" />
                  <text x={15} y={50} fill="#475569" className="text-[7.5px] font-mono">▽ N.G.L -0.00</text>
                  
                  {/* Excavation Bounds */}
                  <path d="M 30,55 L 30,170 M 210,55 L 210,170" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2 2" />
                  <text x={35} y={70} fill="#64748b" className="text-[7px]">حدود الحفر الفعلي</text>

                  {/* Coarse Concrete Footing Slab */}
                  <rect 
                    x={(240 - detB) / 2} 
                    y={130} 
                    width={detB} 
                    height={detH} 
                    fill="#eceef2" 
                    stroke="#64748b" 
                    strokeWidth="1.5"
                  />

                  {/* Column Starter projection */}
                  <rect 
                    x={(240 - detCx) / 2} 
                    y={55} 
                    width={detCx} 
                    height={75} 
                    fill="rgba(244, 63, 94, 0.1)" 
                    stroke="#f43f5e" 
                    strokeWidth="1.5"
                  />

                  {/* Bottom rebar with vertical hooked lines (X Layer in Blue) */}
                  <path 
                    d={`M ${(240 - detB) / 2 + 6},115 L ${(240 - detB) / 2 + 6},154 L ${(240 + detB) / 2 - 6},154 L ${(240 + detB) / 2 - 6},115`} 
                    fill="none" 
                    stroke="#3b82f6" 
                    strokeWidth="2.0"
                  />

                  {/* Cross-section circles of perpendicular Y bars (Green dots) */}
                  <circle cx={100} cy={149} r="2.2" fill="#10b981" />
                  <circle cx={120} cy={149} r="2.2" fill="#10b981" />
                  <circle cx={140} cy={149} r="2.2" fill="#10b981" />

                  {/* Detailing levels */}
                  <text x={120} y={165} fill="#3b82f6" textAnchor="middle" className="text-[8px] font-bold font-mono">
                    {selectedTypeData.rebarX.quantity}Ø{selectedTypeData.rebarX.diameter} EW T1
                  </text>
                  <text x={20} y={135} fill="#475569" className="text-[7.5px] font-mono">▽ B.O.F</text>
                  <text x={20} y={145} fill="#1e293b" className="text-[7px] font-mono">-{naturalGroundLevel}mm</text>
                </svg>

                <div className="text-[9.5px] text-slate-500 font-sans tracking-tight text-right w-full">
                  * يظهر حديد التسليح السفلي X طولي ومزود بخطاف جانبي عند عدم كفاية طول التماسك
                </div>
              </div>

              {/* Plot 3: SECTION B-B SECTIONAL VIEW (Along Y Direction) */}
              <div className="bg-white rounded-lg p-3 border border-slate-200 flex flex-col justify-between items-center h-[340px]">
                <span className="text-[10.5px] font-bold text-slate-800 border-b border-slate-100 pb-1 w-full text-center">
                  SECTION B-B (قطاع طولي موازي لـ L)
                </span>
                
                <svg viewBox="0 0 240 220" className="w-full h-auto max-h-[220px]" style={{ direction: 'ltr' }}>
                  {/* Ground Level Hatch */}
                  <line x1={10} y1={55} x2={230} y2={55} stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 3" />
                  <text x={15} y={50} fill="#475569" className="text-[7.5px] font-mono">▽ N.G.L -0.00</text>

                  {/* Coarse Concrete Footing Slab */}
                  <rect 
                    x={(240 - detL) / 2} 
                    y={130} 
                    width={detL} 
                    height={detH} 
                    fill="#eceef2" 
                    stroke="#64748b" 
                    strokeWidth="1.5"
                  />

                  {/* Column Starter projection */}
                  <rect 
                    x={(240 - detCy) / 2} 
                    y={55} 
                    width={detCy} 
                    height={75} 
                    fill="rgba(244, 63, 94, 0.1)" 
                    stroke="#f43f5e" 
                    strokeWidth="1.5"
                  />

                  {/* Bottom rebar with vertical hooked lines (Y Layer in Green) */}
                  <path 
                    d={`M ${(240 - detL) / 2 + 6},115 L ${(240 - detL) / 2 + 6},154 L ${(240 + detL) / 2 - 6},154 L ${(240 + detL) / 2 - 6},115`} 
                    fill="none" 
                    stroke="#10b981" 
                    strokeWidth="2.0"
                  />

                  {/* Cross-section circles of perpendicular X bars (Blue dots) */}
                  <circle cx={95} cy={148} r="2.2" fill="#3b82f6" />
                  <circle cx={110} cy={148} r="2.2" fill="#3b82f6" />
                  <circle cx={125} cy={148} r="2.2" fill="#3b82f6" />
                  <circle cx={140} cy={148} r="2.2" fill="#3b82f6" />

                  {/* Detailing levels */}
                  <text x={120} y={165} fill="#10b981" textAnchor="middle" className="text-[8px] font-bold font-mono">
                    {selectedTypeData.rebarY.quantity}Ø{selectedTypeData.rebarY.diameter} EW T2
                  </text>
                  <text x={20} y={135} fill="#475569" className="text-[7.5px] font-mono">▽ B.O.F</text>
                  <text x={20} y={145} fill="#1e293b" className="text-[7px] font-mono">-{naturalGroundLevel}mm</text>
                </svg>

                <div className="text-[9.5px] text-slate-500 font-sans tracking-tight text-right w-full">
                  * يركب حديد تسليح الغطاء Y بالمسار العلوي من شبكة التسليح طبقاً للتصميم النشط
                </div>
              </div>

            </div>

            {/* Instructions on Plan interaction footer */}
            <div className="text-[10px] text-slate-500 flex justify-between select-none border-t border-slate-200 pt-3.5 mt-4">
              <span>* التفاصيل مصممة ومففرة للتنفيذ السريع بالموقع بالتنسيق المباشر مع عمال صلب وتفجير حديد البناء</span>
              <span className="flex items-center gap-1.5 font-sans font-bold text-slate-600">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                طبقة الفرش الأساسية X
              </span>
            </div>
          </div>

          {/* S-301 Typical notes side */}
          <div className="lg:col-span-4 space-y-4 font-sans">
            <Card className="border">
              <CardHeader className="py-3 bg-muted/20 border-b">
                <CardTitle className="text-xs font-bold">مواصفات تماسك وتفريز الحديد للنموذج</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3.5 text-xs">
                <div className="space-y-2 text-[11px] leading-relaxed text-muted-foreground">
                  <div className="flex justify-between border-b pb-1">
                    <span>طول تماسك الشد المطلوب (ld):</span>
                    <span className="font-bold text-foreground font-mono">540 mm</span>
                  </div>
                  <div className="flex justify-between border-b pb-1">
                    <span>طول البروز المتاح من حافة العمود:</span>
                    <span className="font-bold text-foreground font-mono">
                      {((typicalB - typicalCx) / 2).toFixed(0)} mm
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-1">
                    <span>حالة تضميد نهايات السيخ:</span>
                    <span className="font-bold text-amber-600">
                      {((typicalB - typicalCx) / 2) < 540 ? 'يلزم عقف خطاف 90 درجة' : 'طول مستقيم آمن'}
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <span className="font-bold text-[11px] block text-foreground mb-1">تعليمات الورشة المعتمدة (Hook Details):</span>
                  <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                    عند الحاجة לעقف الحديد، يكون طول الخطاف القائم لا يقل عن <span className="font-bold text-foreground">12 مرة من قطر السيخ</span> (12 db) أو <span className="font-bold text-foreground">150 مم</span> كحد أدنى طبقاً لتعليمات الكود الإنشائي المعزز ACI 315.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border">
              <CardHeader className="py-3 bg-muted/20 border-b">
                <CardTitle className="text-xs font-bold">تحديد مقاسات لوحات الرسم CAD</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2.5 text-xs">
                <p className="text-muted-foreground text-[11px] leading-normal">
                  تتوافق هذه القطاعات واللوحات بمقاييس رسم مطابقة لمتطلبات مراجعة الاستشاريين للمشروع الإنشائي:
                </p>
                <div className="bg-muted p-2.5 rounded text-[10.5px] font-mono space-y-1 text-slate-700 leading-normal">
                  <div>* لوحة المسقط الأفقي (Plan): Scale 1:20</div>
                  <div>* لوحة القطاعات الإنشائية (Sections): Scale 1:25</div>
                  <div>* دقة تفاصيل عقف وصلات الصب: Scale 1:10</div>
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      )}

      {/* 4. SHEET S-401: BAR BENDING SCHEDULE */}
      {activeSheet === 'S-401' && (
        <Card className="border animate-fade-in">
          <CardHeader className="py-4 bg-muted/20 border-b flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-1.5 font-sans">
                <FileSpreadsheet className="h-4.5 w-4.5 text-indigo-600" />
                BAR BENDING SCHEDULE (سجل وجدول تفصيل وثني قضبان تسليح الحديد الكلي للفروع)
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                تفريد وحساب أطوال الأسياخ والخطافات والأوزان بالتقييس الهندسي المعياري (Standard Shape Codes)
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[11px] font-bold gap-1 mt-1 shrink-0"
              onClick={handleExportBbsCSV}
            >
              <Download className="h-4 w-4 text-indigo-600" />
              تصدير جدول BBS CSV
            </Button>
          </CardHeader>
          <CardContent className="p-0 text-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-center border-collapse">
                <thead>
                  <tr className="bg-muted text-[11px] border-b text-muted-foreground select-none font-bold">
                    <th className="py-3 px-2 text-right">رمز النموذج الإنشائي</th>
                    <th className="py-3 px-2">رمز السيخ (Mark)</th>
                    <th className="py-3 px-2">القطر (Ø mm)</th>
                    <th className="py-3 px-2">مواصفات ثني السيخ (Shape)</th>
                    <th className="py-3 px-2 font-mono">العدد في النموذج</th>
                    <th className="py-3 px-2 font-mono">طول السيخ الفردي (mm)</th>
                    <th className="py-3 px-2">أبعاد الأجزاء المفصلة (A / B)</th>
                    <th className="py-3 px-2 font-mono">مجموع العدد الكلي بالموقع</th>
                    <th className="py-3 px-2 font-mono">طول الأسياخ الإجمالي (m)</th>
                    <th className="py-3 px-2 font-mono">إجمالي الوزن لحديد الفئة (kg)</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-mono font-medium text-[11.5px] text-foreground">
                  {projectData.types.map((type) => (
                    <React.Fragment key={type.typeMark}>
                      {type.bbs.map((item, idx) => {
                        const projectTotalQty = item.qty * type.footingCount;
                        const individualBarLen = item.segments.A + (item.segments.B || 0) + (item.segments.C || 0);
                        const projectTotalLenM = (individualBarLen * projectTotalQty) / 1000;
                        const projectTotalWeightKg = projectTotalLenM * item.weightPerM;

                        return (
                          <tr key={`${type.typeMark}-${idx}`} className="hover:bg-muted/10 font-sans">
                            {idx === 0 && (
                              <td rowSpan={type.bbs.length} className="py-3 px-2 text-right font-bold text-blue-600 text-xs bg-muted/20 border-r align-middle select-none">
                                {type.typeMark} ({type.footingCount} قواعد)
                              </td>
                            )}
                            <td className="py-3 px-2 text-blue-600 font-mono text-[11px] font-bold">{item.barMark}</td>
                            <td className="py-3 px-2 font-bold font-mono">Ø {item.diameter}</td>
                            <td className="py-3 px-2 text-slate-700 text-[10.5px] text-right font-normal">
                              {item.shapeCode === 11 ? (
                                <span className="font-semibold text-amber-700">CODE 11 (مكسح عقفة قائمة)</span>
                              ) : (
                                <span className="font-normal text-slate-500">CODE 00 (قضيب مستقيم)</span>
                              )}
                            </td>
                            <td className="py-3 px-2 font-mono text-zinc-850">{item.qty} أسياخ</td>
                            <td className="py-3 px-2 font-bold font-mono text-stone-900">{individualBarLen.toFixed(0)}</td>
                            <td className="py-3 px-2 text-[10.5px] font-mono leading-relaxed text-slate-500 text-left">
                              A = {item.segments.A} mm
                              {item.segments.B && <span> , B={item.segments.B}</span>}
                            </td>
                            <td className="py-3 px-2 font-bold font-mono text-amber-700">{projectTotalQty}</td>
                            <td className="py-3 px-2 font-bold font-mono text-blue-700">{projectTotalLenM.toFixed(1)}</td>
                            <td className="py-3 px-2 font-black font-mono text-emerald-700">{projectTotalWeightKg.toFixed(1)} kg</td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                  <tr className="bg-muted/40 font-bold font-sans">
                    <td colSpan={8} className="py-3.5 px-3 uppercase text-right text-xs">إجمالي كمية حديد القواعد بالمشروع بالكامل</td>
                    <td className="py-3.5 px-2 font-mono font-black text-blue-700 text-xs">{(projectData.types.reduce((acc, curr) => {
                      const lenX = (curr.B - 150) * curr.rebarX.quantity * curr.footingCount / 1000;
                      const lenY = (curr.L - 150) * curr.rebarY.quantity * curr.footingCount / 1000;
                      return acc + lenX + lenY;
                    }, 0)).toFixed(1)} m</td>
                    <td className="py-3.5 px-2 font-mono font-black text-emerald-700 text-xs">{projectData.totalSteelWeight.toLocaleString()} kg</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 5. SHEET S-402: QUANTITY SUMMARY */}
      {activeSheet === 'S-402' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in font-sans">
          
          {/* Main takeoffs report list view grouped */}
          <div className="lg:col-span-8 space-y-6">
            <Card className="border">
              <CardHeader className="py-3 bg-muted/20 border-b">
                <CardTitle className="text-xs font-bold">حجم الكميات والمصادر التفصيلية للمشروع</CardTitle>
                <CardDescription className="text-[10px]">موزع ومقسّم تفصيلياً حسب نماذج المخطط المعتمد</CardDescription>
              </CardHeader>
              <CardContent className="p-0 text-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-center border-collapse">
                    <thead>
                      <tr className="bg-muted text-[10.5px] border-b text-muted-foreground select-none font-bold">
                        <th className="py-2.5 px-2 text-right">رمز النموذج</th>
                        <th className="py-2.5 px-2">عدد القواعد</th>
                        <th className="py-2.5 px-2">الخرسانة المسلحة (m³)</th>
                        <th className="py-2.5 px-2">حديد التسليح (kg)</th>
                        <th className="py-2.5 px-2">أعمال طوبار خشب الجوانب (m²)</th>
                        <th className="py-2.5 px-2">أعمال الحفر والترحيل (m³)</th>
                        <th className="py-2.5 px-2">أعمال إعادة الردم (m³)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y font-mono font-medium text-[11px] text-foreground">
                      {projectData.types.map((type) => {
                        const count = type.footingCount;
                        const concVol = type.concreteVolumeIndividual * count;
                        const steelWt = type.steelWeightIndividual * count;
                        const formwork = ((2 * (type.B + type.L) * type.H) / 1e6) * count;
                        
                        const excavB = type.B + 2 * excavationOffset;
                        const excavL = type.L + 2 * excavationOffset;
                        const excavation = ((excavB * excavL * naturalGroundLevel) / 1e9) * count;
                        const backfill = Math.max(0, excavation - concVol);

                        return (
                          <tr key={type.typeMark} className="hover:bg-muted/10 font-sans">
                            <td className="py-3 px-2 text-right font-bold text-blue-600 font-mono text-[11.5px]">{type.typeMark}</td>
                            <td className="py-3 px-2 font-bold font-mono">{count}</td>
                            <td className="py-3 px-2 font-mono font-bold text-zinc-800">{concVol.toFixed(2)}</td>
                            <td className="py-3 px-2 font-mono font-bold text-emerald-600">{steelWt.toFixed(1)}</td>
                            <td className="py-3 px-2 font-mono text-stone-700">{formwork.toFixed(1)}</td>
                            <td className="py-3 px-2 font-mono text-red-600">{excavation.toFixed(1)}</td>
                            <td className="py-3 px-2 font-mono text-stone-600">{backfill.toFixed(1)}</td>
                          </tr>
                        );
                      })}
                      <tr className="bg-muted/30 font-bold font-sans">
                        <td colSpan={2} className="py-3 px-2 text-right font-bold text-foreground text-xs">إجمالي المشروع الكلي</td>
                        <td className="py-3 px-2 font-mono font-black text-blue-700 text-xs">{projectData.totalConcreteVolume} m³</td>
                        <td className="py-3 px-2 font-mono font-black text-emerald-700 text-xs">{projectData.totalSteelWeight.toLocaleString()} kg</td>
                        <td className="py-3 px-2 font-mono font-black text-stone-900 text-xs">{projectData.totalFormworkArea} m²</td>
                        <td className="py-3 px-2 font-mono font-black text-red-700 text-xs">{projectData.totalExcavationVolume} m³</td>
                        <td className="py-3 px-2 font-mono font-black text-stone-700 text-xs">{projectData.totalBackfillVolume} m³</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <div className="bg-stone-50/20 p-4 border rounded-lg">
              <span className="font-bold text-[11.5px] block text-foreground mb-1.5 flex items-center gap-1">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                تحليل جدوى وتطابق مواصفات حديد التسليح
              </span>
              <p className="text-[11px] leading-relaxed text-muted-foreground font-normal">
                تم استخلاص مساحة طوبار نجارة القواعد المعتمدة من مساحة المحيط الخارجي للقواعد في سماكة القاعدة، مطروقاً خلوص الحجر. تم احتساب كميات الحفر الكلية على مبدأ حفر مسطح كامل لكل قاعدة من مسافة رفرفة حرة تبلغ {excavationOffset} مم لكل طرف لسلامة تنزيل العمال والنجارين.
              </p>
            </div>
          </div>

          {/* S-402 takeoff cards summary */}
          <div className="lg:col-span-4 space-y-4 font-sans">
            <Card className="border">
              <CardHeader className="py-3 bg-muted/20 border-b">
                <CardTitle className="text-xs font-bold">كثافة استهلاك التسليح الوسطية</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3.5 text-xs text-center">
                <div className="font-mono text-4xl font-black text-blue-600">
                  {projectData.totalConcreteVolume > 0 
                    ? (projectData.totalSteelWeight / projectData.totalConcreteVolume).toFixed(1) 
                    : 0}
                  <span className="text-xs font-sans font-bold text-muted-foreground block mt-1">كجم من الحديد لكل متر مكعب خرسانة</span>
                </div>
                <p className="text-[10.5px] text-muted-foreground leading-relaxed leading-normal text-right">
                  الاستهلاك في المعدل المتوسط الطبيعي للقواعد السكنية والمعزولة والمقاومة للأحمال منخفضة ومتوسطة الكثافة طبقاً لمتطلبات الكود الإنشائي.
                </p>
              </CardContent>
            </Card>

            <Card className="border">
              <CardHeader className="py-3 bg-muted/20 border-b">
                <CardTitle className="text-xs font-bold">باقة تصدير جداول الحصر</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2.5 text-xs">
                <Button
                  className="w-full text-[11px] font-bold gap-1.5"
                  onClick={handleExportTypesCSV}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  تحميل تقارير الكميات والمقايسة (BOM Report)
                </Button>
                <p className="text-[10px] text-muted-foreground leading-relaxed leading-normal text-right">
                  يحتوي هذا الملف المصدّر على جدول بالوزن الإجمالي لحديد التسليح بالموقع وحجم كميات الخرسانة المطلوبة لمقاول الموقع والمورّدين لطلب كميات الصب المباشر.
                </p>
              </CardContent>
            </Card>
          </div>

        </div>
      )}

      {/* 6. GENERAL NOTES */}
      {activeSheet === 'NOTES' && (
        <Card className="border animate-fade-in font-sans">
          <CardHeader className="py-4 bg-muted/20 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-1.5 justify-start">
              <BookOpen className="h-4.5 w-4.5 text-stone-600" />
              GENERAL CONCRETE & REINFORCEMENT NOTES (المواصفات الفنية والملاحظات العامة لتنفيذ خطة الأساسات)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-5 text-right text-xs leading-relaxed text-stone-700">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="space-y-3">
                <h4 className="font-bold text-[12px] text-stone-900 border-b pb-1">أولاً: مواصفات الخرسانة (Concrete Specifications)</h4>
                <ul className="space-y-1.5 list-disc list-inside">
                  <li>تكون رتبة الخرسانة المسلحة لجميع القواعد f'c = 25 MPa (أو رتبة مقاومة ضغط لا تقل عن 25 ن/مم² بعد 28 يوماً من الصب).</li>
                  <li>يتم استخدام خرسانة عادية (مقاومة منخفضة) بسمك 100 مم أسفل جميع القواعد كطبقة نظافة (مستبعدة من الحسابات الإنشائية).</li>
                  <li>يتم استخدام أسمنت مقاوم للكبريتات (Type V) لجميع الخرسانات الملامسة للتربة المباشرة لمقاومة كبريتات المياه الجوفية.</li>
                  <li>تكون نسبة ركام السن الصغير والمطالبة بركام متوسط السن 10 مم لعدم انسداد حديد التسليح الكثيف.</li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="font-bold text-[12px] text-stone-900 border-b pb-1">ثانياً: حديد التسليح والتشكيل (Reinforcement Specs)</h4>
                <ul className="space-y-1.5 list-disc list-inside">
                  <li>جميع أسياخ صلب التسليح عالية المقاومة مفروقة السطح Grade 420 بمقاومة خضوع لا تقل عن fy = 420 MPa.</li>
                  <li>تكون زوايا ثني وثني الخطافات مطابقة لدليل تشكيل حديد التسليح للكود الأمريكي ACI 315 أو نظيره البريطاني BS8666.</li>
                  <li>الحد الأدنى للغطاء الخرساني الصافي للقواعد الملامسة للأرض والتربة يبلغ 75 مم لجميع أوجه الخرسانة المباشرة للأرض.</li>
                  <li>الحد الأقصى للمسافة الصافية المعتمدة لتباعد الأسياخ يبلغ 200 مم لضمان التحكم بالتشقق ومقاومة ردة الفعل السلبية للتربة.</li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="font-bold text-[12px] text-stone-900 border-b pb-1">ثالثاً: أعمال الحفريات والتأسيس (Geotechnical Scope)</h4>
                <ul className="space-y-1.5 list-disc list-inside">
                  <li>يتم الحفر لعمق التأسيس المعتمد بالموقع بناءً على تقرير فحص التربة وتجهيز منسوب حفر طبيعي نظيف تماماً وخال من الرطوبة.</li>
                  <li>يتم التأكد من صلاحية وجودة الطبقة وتجانسها مع الأحمال التصميمية لقدرة تحمل تربة (Allowable Bearing Capacity) لا تقل عن {qall} kPa.</li>
                  <li>يتم إعادة الردم بطبقات ردم نظيفة متتالية لا تتعدى 250 مم مع الدمك الميكانيكي الفعال والترطيب بالرش والرش الكيماوي للحشرات.</li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="font-bold text-[12px] text-stone-900 border-b pb-1">رابعاً: نظام الجودة والموقع (Quality Control Logs)</h4>
                <ul className="space-y-1.5 list-disc list-inside">
                  <li>لا يسمح بفك جوانب نجارة القواعد الخشبية قبل مرور 24 ساعة كحد أدنى من انتهاء أعمال الصب المعياري للخرسانة ومكافحة التبخر.</li>
                  <li>يتم معالجة الخرسانة بالرش الدائم بالماء العذب الصافي مرتين يومياً ولمدة لا تقل عن 7 أيام متتالية بعد الفك المباشر لوقاية الرطوبة.</li>
                  <li>يتم عزل جوانب وظهر صبة خرسانة القواعد بمادة البيتين المقاوم للرطوبة والمياه الجوفية لحماية القواعد من التآكل.</li>
                </ul>
              </div>

            </div>

            <div className="bg-[#f8fafc] p-4 rounded-lg flex gap-3 text-slate-800 items-start border mt-4">
              <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold block text-stone-900">إرشادات الشغل الإضافية والإخلاء الفني المقاوم للزلازل (Seismic provisions)</span>
                <p className="text-[11px] leading-relaxed text-slate-600 font-normal leading-normal">
                  تتوافق هذه المخططات واللوحات وجداول التفريد بالكامل مع الكود العربي السوري والأردني الموحد وكذلك الكود السعودي للاشتراطات الإنشائية SBC 304 لعام 2018 للاشتراطات العامة. يرجى توثيق أي فروقات بالتربة مع مهندس الجيوتقني قبل مباشرة الحفر الفعلي للقواعد.
                </p>
              </div>
            </div>

          </CardContent>
        </Card>
      )}

      </div>
    </div>
  );
}
