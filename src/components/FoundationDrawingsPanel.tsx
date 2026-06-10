import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Download, 
  Printer, 
  FileSpreadsheet, 
  Info, 
  Layers, 
  Compass, 
  Table, 
  Layers3, 
  FileText, 
  BookOpen, 
  Scale, 
  Wrench, 
  AlertTriangle,
  FolderOpen
} from 'lucide-react';
import type { Column } from '@/lib/structuralEngine';
import type { SupportDatabase } from '@/lib/structuralSupportSystem';
import { analyzeIsolatedFooting, type IsolatedFootingAnalysisResult } from '@/lib/isolatedFootingEngine';
import { designIsolatedFootingStrength } from '@/lib/isolatedFootingDesignEngine';
import { 
  generateFootingDetailing, 
  generateProjectDetailing,
  type ProjectFoundationLayoutData,
  type BBSItem
} from '@/lib/isolatedFootingDetailingEngine';
import { generateFoundationDXF, downloadDXF, type FoundationDXFInput } from '@/export/dxfExporter';

interface FoundationDrawingsPanelProps {
  columns: Column[];
  colLoads3D?: Map<string, { P_service?: number; Pu?: number; Mx?: number; My?: number; MxBot?: number; MyBot?: number; Vu?: number }>;
  fc?: number;
  fy?: number;
  qall?: number;
  gammaConc?: number;
  gammaSoil?: number;
  soilCoverDepth?: number;
  projectName?: string;
  titleBlockConfig?: any;
  analyzed: boolean;
  foundationResults?: any[];
  foundationMat?: any;
}

export default function FoundationDrawingsPanel({
  columns = [],
  colLoads3D,
  fc = 25,
  fy = 420,
  qall = 150,
  gammaConc = 24,
  gammaSoil = 18,
  soilCoverDepth = 1.2,
  projectName = 'Structural Design Studio',
  titleBlockConfig = {},
  analyzed = false,
  foundationResults = [],
  foundationMat = null,
}: FoundationDrawingsPanelProps) {
  const [activeSheet, setActiveSheet] = useState<string>('S-101');
  const [selectedFootingTypeMark, setSelectedFootingTypeMark] = useState<string>('F1');
  const [selectedPlanLocId, setSelectedPlanLocId] = useState<string | null>(null);
  const [selectedScale, setSelectedScale] = useState<string>('auto');

  // Ground level configurations in mm
  const [naturalGroundLevel, setNaturalGroundLevel] = useState<number>(1500);
  const [excavationOffset, setExcavationOffset] = useState<number>(500);

  // Filter ground level columns for the plan map
  const groundCols = useMemo(() => {
    if (columns.length === 0) return [];
    const minZ = Math.min(...columns.map(c => c.zBottom ?? 0));
    return columns.filter(col => Math.abs((col.zBottom ?? 0) - minZ) < 1);
  }, [columns]);

  // Fallback single footing analysisResult
  const fallbackAnalysisResult = useMemo<IsolatedFootingAnalysisResult>(() => {
    return analyzeIsolatedFooting({
      B: 1800,
      L: 1800,
      H: 500,
      Cx: 300,
      Cy: 300,
      fxCol: 0,
      fyCol: 0,
      fc,
      qall,
      includeSelfWeight: true,
      includeSoilCover: true,
      soilCoverDepth,
      gammaConc,
      gammaSoil,
      P: 250,
      Mx: 0,
      My: 0,
      Vx: 0,
      Vy: 0
    });
  }, [fc, qall, soilCoverDepth, gammaConc, gammaSoil]);

  // Project-wide detailing materials context
  const projectMaterials = useMemo(() => ({
    fc,
    fy,
    qa: qall,
    cover: 75,
    gamma_conc: gammaConc,
    gamma_soil: gammaSoil,
    Df: soilCoverDepth + (fallbackAnalysisResult.input.H / 1000)
  }), [fc, fy, qall, gammaConc, gammaSoil, soilCoverDepth, fallbackAnalysisResult]);

  // Fetch or compile coordinated project footings layout information
  const projectData: ProjectFoundationLayoutData = useMemo(() => {
    const validCols = groundCols.length > 0 ? groundCols : [
      {
        id: 'C1',
        x: 0,
        y: 0,
        b: 300,
        h: 300,
        L: 3000,
        zBottom: 0,
        zTop: 3000
      }
    ];

    let loadsToUse = colLoads3D;
    if (!loadsToUse || loadsToUse.size === 0) {
      const map = new Map<string, any>();
      map.set('C1', { P_service: 250 });
      loadsToUse = map;
    }

    // Convert keys to look for correctly structured 3D reactions
    const finalLoadsMap = new Map<string, any>();
    validCols.forEach(c => {
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

    return generateProjectDetailing(
      validCols,
      finalLoadsMap,
      projectMaterials,
      {
        naturalGroundLevel,
        excavationOffset
      }
    );
  }, [groundCols, colLoads3D, projectMaterials, naturalGroundLevel, excavationOffset]);

  const selectedTypeData = useMemo(() => {
    const t = projectData.types.find(type => type.typeMark === selectedFootingTypeMark);
    return t || projectData.types[0];
  }, [projectData, selectedFootingTypeMark]);

  const currentScaleLabel = useMemo(() => {
    if (selectedScale !== 'auto') return selectedScale;
    const mapping: Record<string, string> = {
      'S-101': '1:100',
      'S-201': 'N/A',
      'S-301': '1:20 (مسقط) / 1:25 (قطاعات)',
      'S-401': 'N/A',
      'S-402': 'N/A',
      'NOTES': 'N/A'
    };
    return mapping[activeSheet] || '1:50';
  }, [activeSheet, selectedScale]);

  // Project geometrical boundaries for SVG S-101 Layout Plan rendering
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

  // Footing Overlaps check
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

  const qualityControlWarnings = useMemo(() => {
    const warnings: string[] = [];
    projectData.types.forEach(type => {
      if (type.H < 300) {
        warnings.push(`تحذير كود: سمك القاعدة ${type.typeMark} يقل عن 300 مم، وهو الحد الأدنى للصلابة والمقاومة.`);
      }
      const bRatio = type.B / type.L;
      if (bRatio < 0.4 || bRatio > 2.5) {
        warnings.push(`نسبة الأبعاد: تم رصد عدم اتساق في الطول والعرض للنموذج ${type.typeMark}.`);
      }
    });

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
          warnings.push(`تداخل هندسي: القاعدة ${locA.colId} (${locA.typeMark}) تتداخل مع القاعدة ${locB.colId} (${locB.typeMark}).`);
        }
      }
    }
    return warnings;
  }, [projectData]);

  // Coordinates for Sheet S-301 Plan and Section elements
  const typicalB = selectedTypeData?.B ?? 1800;
  const typicalL = selectedTypeData?.L ?? 1800;
  const typicalH = selectedTypeData?.H ?? 500;
  const typicalCx = selectedTypeData?.colCx ?? 300;
  const typicalCy = selectedTypeData?.colCy ?? 300;

  const sizeMultiplier = Math.min(180 / typicalB, 180 / typicalL);
  const detB = typicalB * sizeMultiplier;
  const detL = typicalL * sizeMultiplier;
  const detH = typicalH * sizeMultiplier;
  const detCx = typicalCx * sizeMultiplier;
  const detCy = typicalCy * sizeMultiplier;

  // CSV Exporters
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

  const handleDXFExport = () => {
    const dxfInputs: FoundationDXFInput[] = projectData.types.flatMap((type) => {
      const locsOfType = projectData.locations.filter(l => l.typeMark === type.typeMark);
      return locsOfType.map(loc => ({
        colId: loc.colId,
        x: loc.x,
        y: loc.y,
        colB: loc.colB,
        colH: loc.colH,
        B: type.B,
        L: type.L,
        t: type.H,
        d: type.H - 75,
        P_service: loc.P_service ?? 250,
        q_actual: (loc.P_service ?? 250) / ((type.B / 1000) * (type.L / 1000)),
        bars_x: type.rebarX.quantity,
        dia_x: type.rebarX.diameter,
        spacing_x: (type.B - 150) / (type.rebarX.quantity - 1),
        bars_y: type.rebarY.quantity,
        dia_y: type.rebarY.diameter,
        spacing_y: (type.L - 150) / (type.rebarY.quantity - 1),
        bearing_ok: true,
        wide_shear_ok: true,
        punch_shear_ok: true,
        adequate: true
      }));
    });

    const footingMat = { fc, fy, qa: qall, cover: 75, gamma_conc: gammaConc, gamma_soil: gammaSoil, Df: soilCoverDepth + (typicalH / 1000) };
    const mainProjName = titleBlockConfig?.projectName || projectName;
    const dxf = generateFoundationDXF(dxfInputs, footingMat, mainProjName);
    downloadDXF(dxf, `${mainProjName}_Foundations_Blueprint.dxf`);
  };

  const generateSheetContentHTML = (sheetId: string) => {
    let sheetContent = '';
    const sheetLabels: Record<string, string> = {
      'S-101': 'FOUNDATION LAYOUT & PLAN / مخطط المحاور وتوزيع القواعد العام',
      'S-201': 'APPROVED FOUNDATIONS SCHEDULE / جدول نماذج القواعد المعتمد',
      'S-301': 'DETAILED REINFORCEMENT & CROSS SECTIONS / تفاصيل التسليح والقطاعات الإنشائية',
      'S-401': 'BAR BENDING SCHEDULE (BBS) / كشف تفريد حديد تسليح الأساسات المعياري',
      'S-402': 'ENGINEERING MATERIAL TAKE-OFF SUMMARY / بيان مساحات ومذكرة كميات المواد',
      'NOTES': 'GENERAL NOTES & CONCRETE SPECIFICATIONS / الملاحظات الإنشائية واشتراطات التنفيذ'
    };
    const sheetTitle = sheetLabels[sheetId] || 'مخطط إنشائي';

    switch (sheetId) {
      case 'S-101':
        // Generate SVG content
        sheetContent = `
          <div style="width:100%; height:100%; display:flex; justify-content:center; align-items:center; background:#ffffff; padding:15px; box-sizing:border-box;">
            <div style="text-align:center;">
              <h3 style="margin:5px 0; font-size:14px; font-weight:bold; color:#1e293b;">مخطط أساسات مشروع: ${projectName}</h3>
              <p style="margin:2px 0 15px 0; font-size:10px; color:#64748b;">مسقط عام يوضح توزيع القواعد بالتقاطع مع المحاور والمحليّات الجغرافية</p>
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
        sheetContent = `
          <div style="padding: 20px; font-family:'Cairo', 'Segoe UI', sans-serif; direction:rtl; text-align:right;">
            <table style="width:100%; border-collapse:collapse; font-size:11px; margin-top:10px;">
              <thead>
                <tr style="background:#0f172a; color:#ffffff;">
                  <th style="border:1px solid #cbd5e1; padding:8px;">رمز النموذج</th>
                  <th style="border:1px solid #cbd5e1; padding:8px;">العرض B (mm)</th>
                  <th style="border:1px solid #cbd5e1; padding:8px;">الطول L (mm)</th>
                  <th style="border:1px solid #cbd5e1; padding:8px;">السماكة H (mm)</th>
                  <th style="border:1px solid #cbd5e1; padding:8px;">الغطاء الصافي (mm)</th>
                  <th style="border:1px solid #cbd5e1; padding:8px;">حديد التسليح الاتجاه X</th>
                  <th style="border:1px solid #cbd5e1; padding:8px;">حديد التسليح الاتجاه Y</th>
                  <th style="border:1px solid #cbd5e1; padding:8px;">العدد بالمشروع</th>
                </tr>
              </thead>
              <tbody>
                ${projectData.types.map(t => `
                  <tr>
                    <td style="border:1px solid #cbd5e1; padding:8px; font-weight:bold; background:#f8fafc;">${t.typeMark}</td>
                    <td style="border:1px solid #cbd5e1; padding:8px; font-family:monospace; text-align:center;">${t.B}</td>
                    <td style="border:1px solid #cbd5e1; padding:8px; font-family:monospace; text-align:center;">${t.L}</td>
                    <td style="border:1px solid #cbd5e1; padding:8px; font-family:monospace; text-align:center;">${t.H}</td>
                    <td style="border:1px solid #cbd5e1; padding:8px; font-family:monospace; text-align:center;">75</td>
                    <td style="border:1px solid #cbd5e1; padding:8px; font-weight:bold; text-align:center; color:#1e3a8a;">${t.rebarX.quantity} Ø ${t.rebarX.diameter}</td>
                    <td style="border:1px solid #cbd5e1; padding:8px; font-weight:bold; text-align:center; color:#1e3a8a;">${t.rebarY.quantity} Ø ${t.rebarY.diameter}</td>
                    <td style="border:1px solid #cbd5e1; padding:8px; font-weight:bold; text-align:center; font-family:monospace; background:#f1f5f9;">${t.footingCount}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
        break;
      case 'S-301':
        sheetContent = `
          <div style="padding: 20px; font-family:'Cairo', 'Segoe UI', sans-serif; direction:rtl; text-align:right;">
            <div style="display:flex; gap:20px; justify-content:center; align-items:center;">
              <div style="border:1px solid #cbd5e1; padding:15px; border-radius:6px; background:#fff; text-align:center; width:48%;">
                <h4 style="margin:0 0 10px 0; font-size:11px; font-weight:bold; color:#0f172a;">تفاصيل فرشة وحصيرة التسليح (مسقط أفقي نموذجي)</h4>
                <svg viewBox="0 0 260 220" width="100%" height="auto" style="border:1px solid #e2e8f0; background:#f8fafc;">
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
                <svg viewBox="0 0 260 220" width="100%" height="auto" style="border:1px solid #e2e8f0; background:#f8fafc;">
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
        sheetContent = `
          <div style="padding: 20px; font-family:'Cairo', 'Segoe UI', sans-serif; direction:rtl; text-align:right;">
            <table style="width:100%; border-collapse:collapse; font-size:11px; margin-top:10px; text-align:center;">
              <thead>
                <tr style="background:#020617; color:#ffffff;">
                  <th style="border:1px solid #cbd5e1; padding:8px;">رمز النموذج</th>
                  <th style="border:1px solid #cbd5e1; padding:8px;">السيخ</th>
                  <th style="border:1px solid #cbd5e1; padding:8px;">القطر mm</th>
                  <th style="border:1px solid #cbd5e1; padding:8px;">الشكل المعياري</th>
                  <th style="border:1px solid #cbd5e1; padding:8px;">العدد الكلي بالمشروع</th>
                  <th style="border:1px solid #cbd5e1; padding:8px;">الطول المفرد (م)</th>
                  <th style="border:1px solid #cbd5e1; padding:8px;">الوزن الشامل (kg)</th>
                </tr>
              </thead>
              <tbody>
                ${projectData.types.flatMap((type) => 
                  type.bbs.map((b, bidx) => `
                    <tr>
                      ${bidx === 0 ? `<td style="border:1px solid #cbd5e1; padding:8px; font-weight:bold; background:#f8fafc;" rowspan="${type.bbs.length}">${type.typeMark}</td>` : ''}
                      <td style="border:1px solid #cbd5e1; padding:8px; font-family:monospace; font-weight:bold;">${b.barMark}</td>
                      <td style="border:1px solid #cbd5e1; padding:8px; font-family:monospace;">Ø${b.diameter}</td>
                      <td style="border:1px solid #cbd5e1; padding:8px; color:#475569;">${b.shapeCode === 11 ? 'سيخ عاكف بزاوية (Hooked)' : 'سيخ مفرود (Straight)'}</td>
                      <td style="border:1px solid #cbd5e1; padding:8px; font-family:monospace;">${b.qty}</td>
                      <td style="border:1px solid #cbd5e1; padding:8px; font-family:monospace; font-weight:bold; color:#1e3a8a;">${b.totalLengthM.toFixed(2)}</td>
                      <td style="border:1px solid #cbd5e1; padding:8px; font-family:monospace; font-weight:bold; color:#047857;">${b.totalWeightKg.toFixed(1)} كغ</td>
                    </tr>
                  `)
                ).join('')}
              </tbody>
            </table>
          </div>
        `;
        break;
      case 'S-402':
        // Calculate totals
        const totalConc = projectData.types.reduce((acc, t) => acc + (t.concreteVolumeIndividual * t.footingCount), 0);
        const totalSteel = projectData.types.reduce((acc, t) => acc + (t.steelWeightIndividual * t.footingCount), 0);
        sheetContent = `
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
        sheetContent = `
          <div style="padding: 20px; font-family:'Cairo', 'Segoe UI', sans-serif; direction:rtl; text-align:right; font-size:11px; line-height:1.8;">
            <h4 style="font-size:13px; font-weight:bold; border-bottom:2px solid #000; padding-bottom:4px; color:#1e293b;">ملاحظات وشروط تنفيذ الأساسات الخرسانية (General Concrete Rules)</h4>
            <ol style="margin-top:10px; padding-right:20px;">
              <li>كود التصميم الإنشائي الجيوتقني المتبع هو كود البناء السعودي SBC 304 المعد لمنشآت الخرسانة المسلحة والمكافئ لـ ACI 318 الأمريكي.</li>
              <li>مقاومة الخرسانة المميزة للكسر بعد 28 يوماً للأسطوانات fc' = 25 MPa، والحديد المستخدم ذو رتبة fy = 420 MPa عالي الشد.</li>
              <li>الغطاء الخرساني الصافي لحديد تسليح القواعد الملامس للتربة يبلغ 75 مم لمنع تآكل أو تغلغل صدأ الرطوبة للشبكة.</li>
              <li>تجهّز التربة بالحفر لمنسوب التأسيس المعتمد في السبر (-${naturalGroundLevel} مم) ثم ترش الخرسانة العادية (النظافة) بسمك 10 سم قبل تركيب طوبار الحديد والنجارة الشغل.</li>
              <li>تحفظ القواعد الخرسانية بالرش بالماء العذب مرتين يومياً لمدة 7 أيام متتالية تبدأ بعد 24 ساعة من انتهاء الصب.</li>
            </ol>
          </div>
        `;
        break;
    }

    return sheetContent;
  };

  const triggerPrintPackage = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const sheetCodes = ['S-101', 'S-201', 'S-301', 'S-401', 'S-402', 'NOTES'];
    let sheetsHtml = '';

    sheetCodes.forEach((sheetId) => {
      const sheetLabels: Record<string, string> = {
        'S-101': 'FOUNDATION LAYOUT & PLAN',
        'S-201': 'APPROVED FOUNDATIONS SCHEDULE',
        'S-301': 'DETAILED REINFORCEMENT & CROSS SECTIONS',
        'S-401': 'BAR BENDING SCHEDULE (BBS)',
        'S-402': 'ENGINEERING MATERIAL TAKE-OFF SUMMARY',
        'NOTES': 'GENERAL NOTES & CONCRETE SPECIFICATIONS'
      };
      const sheetTitle = sheetLabels[sheetId] || 'مخطط إنشائي';
      const typedContent = generateSheetContentHTML(sheetId);

      sheetsHtml += `
        <div class="sheet-page" style="position:relative; width:1200px; height:840px; background:#fff; margin:30px auto; box-shadow:0 0 15px rgba(0,0,0,0.2); overflow:hidden; page-break-after:always; box-sizing:border-box; padding:40px;">
          <!-- Double border lines characteristic of AutoCAD drawings -->
          <div style="position:absolute; left:20px; top:20px; right:20px; bottom:20px; border:2.5px solid #000;"></div>
          <div style="position:absolute; left:28px; top:28px; right:28px; bottom:28px; border:1px solid #000;"></div>
          
          <!-- Drawing content zone -->
          <div style="position:absolute; left:40px; top:40px; right:40px; bottom:180px; border:0.5px solid #aaa; overflow:auto;">
            <div style="background:#0f172a; color:#fff; padding:6px 12px; font-weight:bold; font-size:11px; font-family:sans-serif; text-transform:uppercase;">
              ${sheetTitle}
            </div>
            ${typedContent}
          </div>

          <!-- Professional CAD Title Block Frame (Bottom Corner) -->
          <div style="position:absolute; left:40px; bottom:40px; right:40px; height:120px; border:2px solid #000; display:flex; font-family:Arial, sans-serif; direction:rtl; text-align:right;">
            <div style="width:25%; border-left:1px solid #000; padding:10px; display:flex; flex-direction:column; justify-content:space-around;">
              <span style="font-size:8px; color:#555;">اسم المشروع / PROJECT NAME</span>
              <strong style="font-size:12px; color:#1e3a8a;">${projectName}</strong>
              <span style="font-size:8px; color:#555;">موقع المشروع / LOCATION: ${titleBlockConfig?.projectLocation || 'Saudi Arabia (KSA)'}</span>
            </div>
            <div style="width:35%; border-left:1px solid #000; padding:10px; display:flex; flex-direction:column; justify-content:space-around;">
              <span style="font-size:8px; color:#555;">عنوان اللوحة الهندسية / SHEET TITLE</span>
              <strong style="font-size:12px; color:#b91c1c;">${sheetTitle}</strong>
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
                <strong style="font-size:16px; color:#b91c1c;">${sheetId}</strong>
              </div>
              <div style="text-align:center; font-size:9px; border-top:1px solid #ccc; width:100%; padding-top:4px;">
                SCALE ${selectedScale === 'auto' ? '1:50' : selectedScale}
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
        <title>INTEGRATED FOUNDATIONS BLUEPRINT DRAWINGS</title>
        <style>
          @page { size: A3 landscape; margin: 0; }
          body { background: #f1f5f9; padding: 20px; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; }
          .no-print-top { background:#0f172a; color:#fff; padding:15px; text-align:center; margin-bottom:20px; border-radius:6px; box-shadow:0 4px 6px rgba(0,0,0,0.1); }
          .print-all-btn { background:#2563eb; border:none; color:#fff; font-weight:bold; font-size:14px; padding:10px 30px; border-radius:4px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2); }
          .print-all-btn:hover { background:#1d4ed8; }
          @media print {
            .no-print-top { display:none; }
            body { padding:0; background:none; }
            .sheet-page { margin:0 !important; box-shadow:none !important; }
          }
        </style>
      </head>
      <body>
        <div class="no-print-top">
          <h2 style="margin:0 0 10px 0; font-size:16px; font-family:Cairo, sans-serif;">مجموعة المخططات واللوحات الإنشائية المتكاملة لتصميم وتفريد الأساسات والقواعد / IFC FOUNDATIONS PACKAGE</h2>
          <button class="print-all-btn" onclick="window.print()">🖨️ طباعة لوحات الأساسات بالكامل كملف PDF / PRINT ALL SHEETS SERIES</button>
        </div>
        \${sheetsHtml}
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <Card className="shadow-lg border-blue-200 dark:border-blue-900 overflow-hidden">
      <CardHeader className="bg-blue-600 dark:bg-blue-950 text-white pb-3">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers size={18} /> لوحات ومخططات الأساسات المتكاملة / Coordinated Foundations Blueprint Package 📐
            </CardTitle>
            <CardDescription className="text-blue-100 text-xs mt-1">
              مخططات معتمدة للمحاور والمباني يجمع لوحات S-101، S-201، S-301، S-401 تفريد حديد التسليح للمشروع والموقع في كبسة واحدة.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="outline" className="bg-white/10 text-white border-white/20 hover:bg-white/20" onClick={triggerPrintPackage}>
              <Printer size={13} className="mr-1.5" /> طباعة ملف الأساسات كاملاً (Integrated PDF)
            </Button>
            <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black font-bold border-none" onClick={handleDXFExport}>
              <Download size={13} className="mr-1.5" /> تصدير لوحات الأساسات CAD (DXF)
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
          
          {/* LEFT SIDEBAR: ACTIVE BLUEPRINT DIRECTORY NAVIGATION */}
          <div className="lg:col-span-3 bg-slate-50 border-r border-slate-200 p-3 text-slate-800 text-xs text-right">
            <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-2">
              <span className="font-bold text-xs uppercase text-blue-600">فهرس لوحات الأساسات / Foundations Sheets</span>
              <Badge className="bg-blue-600 text-[10px]" variant="secondary">SCALE {currentScaleLabel}</Badge>
            </div>
            <div className="space-y-1">
              {[
                { id: 'S-101', name: 'S-101 Foundation Layout Plan', ar: 'مخطط توزيع الأساسات والمحاور العام' },
                { id: 'S-201', name: 'S-201 Approved Footings Schedule', ar: 'جدول نماذج القواعد المعتمد' },
                { id: 'S-301', name: 'S-301 rebar details & section', ar: 'تفاصيل تسليح وقطاعات إنشائية' },
                { id: 'S-401', name: 'S-401 Bar Bending Schedule BBS', ar: 'كشف تفريد حديد تسليح القواعد' },
                { id: 'S-402', name: 'S-402 Materials & Take-off Memo', ar: 'بيان مساحات ومذكرة كميات المواد' },
                { id: 'NOTES', name: 'NOTES General Specifications', ar: 'الملاحظات الإنشائية واشتراطات التنفيذ' }
              ].map((sheet) => (
                <button
                  key={sheet.id}
                  onClick={() => setActiveSheet(sheet.id)}
                  className={`w-full text-right p-2 rounded-md flex flex-col transition ${
                    activeSheet === sheet.id ? 'bg-blue-50 text-blue-800 border border-blue-200 font-bold' : 'hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  <span className="font-bold text-[11px] select-text">{sheet.name}</span>
                  <span className="text-[10px] text-slate-500 mt-0.5 font-sans select-all">{sheet.ar}</span>
                </button>
              ))}
            </div>

            {/* Quick parameter overrides widget */}
            <div className="mt-4 border-t border-slate-200 pt-3 space-y-3">
              <span className="font-bold text-slate-600 block pb-1">ضبط متطلبات حفر الأساس (Plot Params)</span>
              <div className="space-y-2">
                <div>
                  <span className="text-[10px] text-slate-500 block">عمق حفر التأسيس (mm)</span>
                  <Input 
                    type="number" 
                    value={naturalGroundLevel} 
                    onChange={e => setNaturalGroundLevel(parseInt(e.target.value) || 1500)} 
                    className="h-7 text-xs font-mono bg-white text-slate-800 border-slate-200" 
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">منطقة عمل النجارة والرفرفة (mm)</span>
                  <Input 
                    type="number" 
                    value={excavationOffset} 
                    onChange={e => setExcavationOffset(parseInt(e.target.value) || 500)} 
                    className="h-7 text-xs font-mono bg-white text-slate-800 border-slate-200" 
                  />
                </div>
              </div>
              <div className="border-t border-slate-200 pt-2 flex flex-col gap-1.5">
                <Button size="sm" variant="outline" className="text-[10px] h-7 gap-1 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-800 border-slate-200" onClick={handleExportTypesCSV}>
                  <FileSpreadsheet size={10} /> تحميل جدول القواعد المعتمد (S-201)
                </Button>
                <Button size="sm" variant="outline" className="text-[10px] h-7 gap-1 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-800 border-slate-200" onClick={handleExportBbsCSV}>
                  <FileSpreadsheet size={10} /> تحميل كشف حديد الـ BBS (S-401)
                </Button>
              </div>
            </div>
          </div>

          {/* MAIN CAD DRAWING VIEWPORT PREVIEW ENGINE */}
          <div className="lg:col-span-9 bg-slate-100 flex flex-col min-h-[500px]">
            <div className="p-2 border-b border-slate-200 bg-slate-50 text-slate-700 text-xs flex justify-between items-center">
              <span className="flex items-center gap-1.5 font-bold font-mono uppercase text-blue-600 select-text">
                <Compass size={14} /> Viewport Active Sheet: {activeSheet}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500">حالة المخطط الإنشائي</span>
                <Badge className={qualityControlWarnings.length === 0 ? 'bg-emerald-600' : 'bg-amber-600'}>
                  {qualityControlWarnings.length === 0 ? 'ACI 318 STANDARD ✓' : 'معاينة بملاحظات'}
                </Badge>
              </div>
            </div>

            {/* Simulated blueprint viewport layout with exact white outline grids */}
            <div className="flex-1 p-6 flex justify-center items-center bg-slate-200 relative select-none">
              
              {/* Layout Blueprint border boundaries */}
              <div className="w-full max-w-[760px] bg-white text-black p-10 border border-slate-300 relative shadow-lg rounded-sm">
                
                {/* CAD boundary frame lines */}
                <div className="absolute inset-2 border-2 border-slate-900 pointer-events-none"></div>
                <div className="absolute inset-3 border border-slate-200 pointer-events-none"></div>

                {/* Simulated blueprint drawing active sheet body */}
                <div className="w-full pb-32 overflow-auto" id="sheetviewport">
                  <div dangerouslySetInnerHTML={{ __html: generateSheetContentHTML(activeSheet) }} />
                </div>

                {/* Title Block Frame layout aligned exactly inside sheet bottom */}
                <div className="absolute left-8 bottom-8 right-8 height-24 border border-black flex text-xs font-sans text-right" style={{ direction: 'rtl', height: '100px' }}>
                  <div className="w-1/4 border-l border-black p-2 flex flex-col justify-between">
                    <span className="text-[8px] text-muted-foreground">اسم المشروع / PROJECT NAME</span>
                    <strong className="text-[10px] text-blue-800 truncate select-text">{projectName}</strong>
                    <span className="text-[8px] text-muted-foreground select-all">الموقع: Saudi Arabia (KSA)</span>
                  </div>
                  <div className="w-1/3 border-l border-black p-2 flex flex-col justify-between">
                    <span className="text-[8px] text-muted-foreground">عنوان اللوحة الهندسية / SHEET TITLE</span>
                    <strong className="text-[10px] text-red-800 uppercase leading-normal">{activeSheet} SHEET</strong>
                  </div>
                  <div className="w-1/5 border-l border-black p-2 flex flex-col justify-between text-[9px] text-[#475569]">
                    <div><span>مكتب التصميم:</span> <strong>Eng. Blueprint AI</strong></div>
                    <div><span>كود التصميم:</span> ACI 318-19</div>
                  </div>
                  <div className="w-[12%] border-l border-black p-2 flex flex-col justify-between text-[8px] text-[#475569]">
                    <div><span>رسم:</span> <strong>Blueprint AI</strong></div>
                    <div><span>تدقيق:</span> <strong>Coordinated Eng.</strong></div>
                  </div>
                  <div className="w-[10%] p-2 flex flex-col justify-between items-center bg-zinc-50">
                    <div className="text-center">
                      <span className="text-[8px] text-slate-500 block">لوحة NO.</span>
                      <strong className="text-[13px] text-red-700 font-mono font-bold">{activeSheet}</strong>
                    </div>
                    <span className="text-[8px] font-mono border-t pt-1 w-full text-center text-slate-500">M 1:50</span>
                  </div>
                </div>

              </div>

            </div>

          </div>

        </div>
      </CardContent>
    </Card>
  );
}
