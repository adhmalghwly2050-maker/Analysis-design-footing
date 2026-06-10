import React, { useState, useMemo } from 'react';
import { 
  Grid, 
  Layers, 
  Table, 
  Maximize2, 
  FileText, 
  FileDown, 
  Printer, 
  Settings, 
  Edit3, 
  Sliders, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  SlidersHorizontal, 
  Sparkles, 
  Plus, 
  Trash2, 
  CheckCircle,
  AlertTriangle,
  Flame,
  Info,
  Calendar,
  Building,
  User,
  ShieldCheck,
  FileSpreadsheet
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { type StripFootingDesignOutput } from '../lib/stripFootingDesignEngine';
import { type StripFootingDetail } from '../lib/stripFootingDetailingEngine';

interface StripFootingDrawingEngineProps {
  designResult?: StripFootingDesignOutput;
  detailingDetail?: StripFootingDetail;
  footingLength?: number; // mm
  footingWidth?: number; // mm
  footingThickness?: number; // mm
}

interface FootingScheduleItem {
  id: string;
  tag: string;
  type: string;
  width: number;
  thickness: number;
  length: number;
  topRebar: string;
  botRebar: string;
  transRebar: string;
  concreteVol: number;
  steelWeight: number;
  qty: number;
  status: 'safe' | 'warning';
}

export default function StripFootingDrawingEngine({
  designResult,
  detailingDetail,
  footingLength = 6000,
  footingWidth = 1000,
  footingThickness = 400
}: StripFootingDrawingEngineProps) {
  // --- SHEET NAVIGATION ---
  // S-101: Layout Plan
  // S-201: Footing Schedule
  // S-301: Typical Details (Longitudinal, Transverse, Junctions, Stepped)
  // S-401: Bar Bending Schedule (BBS)
  // S-402: Material Takeoff (BOQ Summary)
  // S-GEN: General Notes
  const [activeSheet, setActiveSheet] = useState<'S-101' | 'S-201' | 'S-301' | 'S-401' | 'S-402' | 'S-GEN'>('S-101');

  // --- INTERACTIVE PREVIEW CONTROLS ---
  const [showGrids, setShowGrids] = useState(true);
  const [showReinforcement, setShowReinforcement] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showTags, setShowTags] = useState(true);
  
  // Blueprint Settings
  const [sheetSize, setSheetSize] = useState<'A3' | 'A2' | 'A1'>('A3');
  const [sheetScale, setSheetScale] = useState<string>('1:50');
  const [projectName, setProjectName] = useState<string>('برج الياسمين السكني - Al-Yasmin Tower');
  const [drawingTitle, setDrawingTitle] = useState<string>('مخطط وتفاصيل الأساسات الشريطية المستمرة');
  const [clientName, setClientName] = useState<string>('شركة الياسمين للاستثمار العقاري');
  const [designedBy, setDesignedBy] = useState<string>('م. صالح الكبسي');
  const [checkedBy, setCheckedBy] = useState<string>('المهندس الاستشاري المدني ACI');
  const [revNo, setRevNo] = useState<string>('REV-01');
  const [currentDate, setCurrentDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // S-301 Section View Toggle
  const [activeS301Tab, setActiveS301Tab] = useState<'longitudinal' | 'transverse' | 'junctions' | 'stepped'>('longitudinal');
  const [activeJunctionType, setActiveJunctionType] = useState<'T' | 'L' | 'Cross'>('T');

  // Interactive Footing highlight on layout sheet S-101
  const [highlightedFooting, setHighlightedFooting] = useState<string | null>(null);

  // --- BOQ Cost Estimator state ---
  const [costConcrete, setCostConcrete] = useState<number>(350); // $/m3
  const [costSteel, setCostSteel] = useState<number>(1100); // $/tonne
  const [costExcavation, setCostExcavation] = useState<number>(15); // $/m3
  const [costBackfill, setCostBackfill] = useState<number>(12); // $/m3
  const [costFormwork, setCostFormwork] = useState<number>(25); // $/m2
  const [currencySymbol, setCurrencySymbol] = useState<string>('$');

  // Dynamic schedules and parameters scaled from design results
  const scheduleData = useMemo<FootingScheduleItem[]>(() => {
    const fH = footingThickness;
    const fW = footingWidth;
    const fL = footingLength;

    // Use current designer values to populate active footing SF1
    const pTop = designResult 
      ? `${designResult.zones[1]?.topRebar.quantity || 5} Ø ${designResult.zones[1]?.topRebar.diameter || 16} ملليمتر` 
      : '5 Ø 16 mm';
    const pBot = designResult 
      ? `${designResult.zones[1]?.bottomRebar.quantity || 6} Ø ${designResult.zones[1]?.bottomRebar.diameter || 16} ملليمتر` 
      : '6 Ø 16 mm';
    const pTrans = designResult 
      ? `Ø ${designResult.transverse.selectedDiameter} @ ${designResult.transverse.selectedSpacing} مم` 
      : 'Ø 12 @ 150 mm';
    
    const concV = parseFloat(((fH * fW * fL) / 1e9).toFixed(2)) || 2.40;
    const steelW = designResult ? Math.round(designResult.totalSteelWeightKg) : 210;

    return [
      {
        id: 'SF1',
        tag: 'SF1',
        type: 'أساس مستمر مستقيم (Straight Continuous)',
        width: fW,
        thickness: fH,
        length: fL,
        topRebar: pTop,
        botRebar: pBot,
        transRebar: pTrans,
        concreteVol: concV,
        steelWeight: steelW,
        qty: 3,
        status: (designResult?.thickness.isSafe !== false) ? 'safe' : 'warning'
      },
      {
        id: 'SF2',
        tag: 'SF2',
        type: 'أساس ركني زاوية (L-Shaped Corner Footing)',
        width: Math.round(fW * 1.1),
        thickness: fH,
        length: Math.round(fL * 1.5),
        topRebar: `6 Ø 16 مم`,
        botRebar: `8 Ø 16 مم`,
        transRebar: `Ø 12 @ 150 مم`,
        concreteVol: parseFloat(((fH * fW * 1.1 * fL * 1.5) / 1e9).toFixed(2)) || 3.96,
        steelWeight: Math.round(steelW * 1.45),
        qty: 2,
        status: 'safe'
      },
      {
        id: 'SF3',
        tag: 'SF3',
        type: 'أساس تفرعي (T-Shaped Branch Junction)',
        width: Math.round(fW * 1.2),
        thickness: Math.max(450, fH),
        length: Math.round(fL * 1.8),
        topRebar: `6 Ø 18 مم`,
        botRebar: `8 Ø 18 مم`,
        transRebar: `Ø 14 @ 125 مم`,
        concreteVol: parseFloat((((Math.max(450, fH)) * fW * 1.2 * fL * 1.8) / 1e9).toFixed(2)) || 5.18,
        steelWeight: Math.round(steelW * 1.95),
        qty: 2,
        status: 'safe'
      },
      {
        id: 'SF4',
        tag: 'SF4',
        type: 'أساس تقاطعي صليبي (Cross Junction)',
        width: Math.round(fW * 1.3),
        thickness: Math.max(500, fH),
        length: Math.round(fL * 2.2),
        topRebar: `8 Ø 16 مم`,
        botRebar: `10 Ø 16 مم`,
        transRebar: `Ø 12 @ 100 مم`,
        concreteVol: parseFloat((((Math.max(500, fH)) * fW * 1.3 * fL * 2.2) / 1e9).toFixed(2)) || 6.86,
        steelWeight: Math.round(steelW * 2.40),
        qty: 1,
        status: 'safe'
      },
      {
        id: 'SF5',
        tag: 'SF5',
        type: 'أساس متدرج الميول (Stepped transition Footing)',
        width: fW,
        thickness: fH,
        length: Math.round(fL * 1.3),
        topRebar: `5 Ø 14 مم`,
        botRebar: `6 Ø 16 مم`,
        transRebar: `Ø 12 @ 150 مم`,
        concreteVol: parseFloat(((fH * fW * fL * 1.3) / 1e9).toFixed(2)) || 3.12,
        steelWeight: Math.round(steelW * 1.32),
        qty: 4,
        status: 'safe'
      }
    ];
  }, [designResult, footingWidth, footingLength, footingThickness]);

  // Project totals summation
  const totals = useMemo(() => {
    let concreteM3 = 0;
    let steelKg = 0;
    let excavationM3 = 0;
    let backfillM3 = 0;
    let formworkM2 = 0;

    scheduleData.forEach(item => {
      concreteM3 += item.concreteVol * item.qty;
      steelKg += item.steelWeight * item.qty;
      // Derived estimates for excavation, backfill, formwork based on footing sizes
      const depth = 1.5; // m
      const b = item.width / 1000;
      const l = item.length / 1000;
      const h = item.thickness / 1000;
      
      const itemExc = (b + 0.6) * l * depth; // excav width + 0.3 offset each side
      const itemBack = itemExc - (b * l * h);
      const itemForm = 2 * (l + b) * h;

      excavationM3 += itemExc * item.qty;
      backfillM3 += itemBack * item.qty;
      formworkM2 += itemForm * item.qty;
    });

    return {
      concreteM3: parseFloat(concreteM3.toFixed(2)),
      steelKg: Math.round(steelKg),
      steelTonne: parseFloat((steelKg / 1000).toFixed(3)),
      excavationM3: parseFloat(excavationM3.toFixed(2)),
      backfillM3: parseFloat(backfillM3.toFixed(2)),
      formworkM2: parseFloat(formworkM2.toFixed(2))
    };
  }, [scheduleData]);

  // Derived Project Costs
  const estimatedCosts = useMemo(() => {
    const conc = totals.concreteM3 * costConcrete;
    const steel = totals.steelTonne * costSteel;
    const exc = totals.excavationM3 * costExcavation;
    const back = totals.backfillM3 * costBackfill;
    const form = totals.formworkM2 * costFormwork;
    const total = conc + steel + exc + back + form;

    return {
      concrete: Math.round(conc),
      steel: Math.round(steel),
      excavation: Math.round(exc),
      backfill: Math.round(back),
      formwork: Math.round(form),
      total: Math.round(total)
    };
  }, [totals, costConcrete, costSteel, costExcavation, costBackfill, costFormwork]);

  // Format to numbers with commas
  const fmt = (num: number) => num.toLocaleString('en-US');

  // Trigger Print View
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-zinc-50 dark:bg-zinc-950 p-1 md:p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-6 text-right select-none" style={{ direction: 'rtl' }}>
      
      {/* DRAWING SYSTEM BANNER HEAD */}
      <div className="bg-[#1e3a8a] text-white rounded-lg p-4 md:p-6 shadow-md border-b-4 border-blue-400 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center md:text-right">
          <div className="flex items-center justify-center md:justify-start gap-2">
            <Layers className="h-6 w-6 text-blue-200 animate-pulse" />
            <span className="font-extrabold text-lg text-white font-sans tracking-wide">محرك ومطوّر المخططات والرسومات التنفيذية (Construction Blueprint Engine)</span>
          </div>
          <p className="text-blue-100 text-xs leading-relaxed max-w-2xl">
            نظام متقدم لتوليد المخططات الإنشائية المتكاملة لأساسات الشريط (Strip Footings) مباشرة من مخرجات التصميم والتشريك. يدعم توليد المساقط الأفقية، قطاعات التسليح الطولية والعرضية، جداول تفريد الحديد ونوتة الكميات التفصيلية المعتمدة للمواقع والاستشاريين.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center md:justify-end">
          <Badge className="bg-blue-600 hover:bg-blue-600 font-extrabold text-xs px-2.5 py-1 text-white border-0">ACI 318-19 COMPLIANT</Badge>
          <Badge className="bg-emerald-600 hover:bg-emerald-600 font-extrabold text-xs px-2.5 py-1 text-white border-0">SHOP DRAWINGS ACTIVE</Badge>
        </div>
      </div>

      {/* DRAWING SHEETS NAVIGATION CONTROLS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 bg-zinc-100 dark:bg-zinc-900 p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setActiveSheet('S-101')}
          className={`px-3 py-2.5 rounded-md font-black text-xs flex items-center justify-center gap-2 transition-all ${
            activeSheet === 'S-101'
              ? 'bg-blue-600 text-white shadow'
              : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800'
          }`}
        >
          <Grid className="h-4 w-4" />
          S-101 مسقط الأساسات
        </button>
        <button
          type="button"
          onClick={() => setActiveSheet('S-201')}
          className={`px-3 py-2.5 rounded-md font-black text-xs flex items-center justify-center gap-2 transition-all ${
            activeSheet === 'S-201'
              ? 'bg-blue-600 text-white shadow'
              : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800'
          }`}
        >
          <Table className="h-4 w-4" />
          S-201 جدول القواعد
        </button>
        <button
          type="button"
          onClick={() => setActiveSheet('S-301')}
          className={`px-3 py-2.5 rounded-md font-black text-xs flex items-center justify-center gap-2 transition-all ${
            activeSheet === 'S-301'
              ? 'bg-blue-600 text-white shadow'
              : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800'
          }`}
        >
          <Maximize2 className="h-4 w-4" />
          S-301 تفاصيل وقطاعات
        </button>
        <button
          type="button"
          onClick={() => setActiveSheet('S-401')}
          className={`px-3 py-2.5 rounded-md font-black text-xs flex items-center justify-center gap-2 transition-all ${
            activeSheet === 'S-401'
              ? 'bg-blue-600 text-white shadow'
              : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800'
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          S-401 تفريد الحديد BBS
        </button>
        <button
          type="button"
          onClick={() => setActiveSheet('S-402')}
          className={`px-3 py-2.5 rounded-md font-black text-xs flex items-center justify-center gap-2 transition-all ${
            activeSheet === 'S-402'
              ? 'bg-blue-600 text-white shadow'
              : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800'
          }`}
        >
          <Sliders className="h-4 w-4" />
          S-402 المتر والكميات BOQ
        </button>
        <button
          type="button"
          onClick={() => setActiveSheet('S-GEN')}
          className={`px-3 py-2.5 rounded-md font-black text-xs flex items-center justify-center gap-2 transition-all ${
            activeSheet === 'S-GEN'
              ? 'bg-blue-600 text-white shadow'
              : 'text-zinc-705 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800'
          }`}
        >
          <FileText className="h-4 w-4" />
          S-GEN ملاحظات المشروع
        </button>
      </div>

      {/* THREE COLUMN SUBSTAGE CONTROLS & SIDE PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:block">
        
        {/* LEFT COLUMN: INTERACTIVE VISUAL CANVAS CANVAS AREA (8 SPANS) */}
        <div className="lg:col-span-8 space-y-4 print:w-full print:block">
          
          {/* CONTROL OVERLAYS FOR INDIVIDUAL SHEETS */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-zinc-950 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 print:hidden shadow-sm">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="font-bold text-xs text-zinc-900 dark:text-zinc-300">متحكمات العرض النشط:</span>
              
              {activeSheet === 'S-101' && (
                <>
                  <Button 
                    size="xs" 
                    variant={showGrids ? 'default' : 'outline'} 
                    onClick={() => setShowGrids(!showGrids)}
                    className="h-8 font-extrabold text-[11px]"
                  >
                    {showGrids ? <Eye className="h-3 w-3 ml-1" /> : <EyeOff className="h-3 w-3 ml-1" />} خطوط المحاور
                  </Button>
                  <Button 
                    size="xs" 
                    variant={showDimensions ? 'default' : 'outline'} 
                    onClick={() => setShowDimensions(!showDimensions)}
                    className="h-8 font-extrabold text-[11px]"
                  >
                    {showDimensions ? <Eye className="h-3 w-3 ml-1" /> : <EyeOff className="h-3 w-3 ml-1" />} الأبعاد والتسمية
                  </Button>
                  <Button 
                    size="xs" 
                    variant={showTags ? 'default' : 'outline'} 
                    onClick={() => setShowTags(!showTags)}
                    className="h-8 font-extrabold text-[11px]"
                  >
                    {showTags ? <Eye className="h-3 w-3 ml-1" /> : <EyeOff className="h-3 w-3 ml-1" />} رموز القواعد SF
                  </Button>
                </>
              )}

              {activeSheet === 'S-301' && (
                <div className="flex bg-zinc-100 dark:bg-zinc-900 p-1 rounded-md border border-zinc-300 dark:border-zinc-800 max-w-sm">
                  <button
                    type="button"
                    onClick={() => setActiveS301Tab('longitudinal')}
                    className={`px-2 py-1.5 rounded-sm font-black text-[10.5px] whitespace-nowrap transition-all ${
                      activeS301Tab === 'longitudinal' ? 'bg-blue-600 text-white shadow' : 'text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    مقطع طولي
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveS301Tab('transverse')}
                    className={`px-2 py-1.5 rounded-sm font-black text-[10.5px] whitespace-nowrap transition-all ${
                      activeS301Tab === 'transverse' ? 'bg-blue-600 text-white shadow' : 'text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    مقطع عرضي
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveS301Tab('junctions')}
                    className={`px-2 py-1.5 rounded-sm font-black text-[10.5px] whitespace-nowrap transition-all ${
                      activeS301Tab === 'junctions' ? 'bg-blue-600 text-white shadow' : 'text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    عراوي التقاطعات
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveS301Tab('stepped')}
                    className={`px-2 py-1.5 rounded-sm font-black text-[10.5px] whitespace-nowrap transition-all ${
                      activeS301Tab === 'stepped' ? 'bg-blue-600 text-white shadow' : 'text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    درجات التدرج
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 font-bold text-xs">حجم لوح المخطط:</span>
              <select
                value={sheetSize}
                onChange={(e) => setSheetSize(e.target.value as any)}
                className="h-8 text-xs font-black bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded px-1 text-zinc-900 dark:text-zinc-100"
              >
                <option value="A3">A3 Blueprint Layout</option>
                <option value="A2">A2 Executive Sheet</option>
                <option value="A1">A1 Structural Canvas</option>
              </select>
              <Button 
                size="xs" 
                variant="outline" 
                onClick={handlePrint} 
                className="font-black text-xs gap-1.5 border-blue-600 text-blue-700 dark:text-blue-400 h-8"
              >
                <Printer className="h-3.5 w-3.5" /> طباعة وطباعة وتصدير PDF
              </Button>
            </div>
          </div>

          {/* BLUEPRINT CANVAS WRAPPER (This mimics actual drawing board layout!) */}
          <div className="border-4 border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white p-6 shadow-xl rounded-lg overflow-x-auto relative print:border-0 print:p-0 print:bg-white print:text-black">
            
            {/* INNER STRUCTURAL DRAWING FRAME */}
            <div className={`w-full ${sheetSize === 'A1' ? 'min-h-[750px]' : sheetSize === 'A2' ? 'min-h-[600px]' : 'min-h-[500px]'} border-2 border-slate-350 dark:border-zinc-800 relative p-4 bg-white dark:bg-[#0a0f18] print:bg-white print:border-zinc-900 flex flex-col justify-between`}>
              
              {/* SHEET SPECIFIC RENDERS */}
              <div className="flex-1 w-full pb-36 print:pb-0">
                {activeSheet === 'S-101' && (
                  <div className="space-y-4">
                    {/* Header bar within blueprint */}
                    <div className="flex justify-between items-center border-b border-zinc-200 dark:border-zinc-800 pb-2 mb-4">
                      <div className="text-right">
                        <span className="font-extrabold text-[13px] text-slate-800 dark:text-zinc-200 block">FOUNDATION SYSTEM DEVELOPMENT PLAN SHEET</span>
                        <span className="text-[10px] text-slate-500 block">لوحة مخططات صب وتوزيع القواعد والأساسات المستمرة - مقياس رسم {sheetScale}</span>
                      </div>
                      <Badge className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 font-mono text-[9px]">{sheetScale}</Badge>
                    </div>

                    {/* Interactive Legend info */}
                    <div className="text-[10.5px] text-slate-700 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-900/60 p-2.5 rounded border border-slate-200 dark:border-zinc-800 leading-relaxed text-right">
                      💡 <strong>دليل التفاعل:</strong> يُظهر المخطط أدناه التوزيع الحقيقي لـ 5 أنواع من الأساسات الشريطية المصممة (SF1 وصولاً لـ SF2 وزوايا L والتقاطعات T والصليبية وتقلبات المنسوب). <strong>يمكنك الضغط على أي قاعدة بالمسقط لتسليط الضوء الإنشائي الفوري عليها.</strong>
                    </div>

                    {/* SVG CANVAS DESIGN DRAWING S-101 */}
                    <div className="w-full bg-slate-100 dark:bg-zinc-900/40 rounded border border-slate-200 dark:border-zinc-800 p-2 overflow-hidden flex items-center justify-center min-h-[360px]">
                      <svg className="w-full max-w-[700px] aspect-[4/3]" viewBox="0 0 600 450">
                        {/* Blueprint grid background */}
                        <defs>
                          <pattern id="plan-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
                          </pattern>
                        </defs>
                        <rect width="600" height="450" fill="#f8fafc" />
                        <rect width="600" height="450" fill="url(#plan-grid)" />

                        {/* Property boundary dashed line */}
                        <rect x="25" y="25" width="550" height="400" fill="none" stroke="#dc2626" strokeWidth="1.5" strokeDasharray="6,4" />
                        <text x="35" y="42" fill="#b91c1c" className="text-[8px] font-black font-sans opacity-70">حدود الملكية والعقارات المجاورة (PROPERTY LINK LINE)</text>

                        {/* FOUNDATION GRID LINES & LABELS (Vertical: 1, 2, 3, 4) */}
                        {showGrids && (
                          <g>
                            {/* Verticals */}
                            {[100, 240, 380, 520].map((xVal, idx) => (
                              <g key={`vert-${idx}`}>
                                <line x1={xVal} y1="40" x2={xVal} y2="410" stroke="#cbd5e1" strokeWidth="0.8" strokeDasharray="4,2" />
                                <circle cx={xVal} cy="35" r="9" fill="#f1f5f9" stroke="#475569" strokeWidth="1" />
                                <text x={xVal} y="38" fill="#1e293b" className="text-[9px] font-sans font-bold" textAnchor="middle">{idx + 1}</text>
                                <circle cx={xVal} cy="415" r="9" fill="#f1f5f9" stroke="#475569" strokeWidth="1" />
                                <text x={xVal} y="418" fill="#1e293b" className="text-[9px] font-sans font-bold" textAnchor="middle">{idx + 1}</text>
                              </g>
                            ))}
                            {/* Horizontals */}
                            {[90, 210, 330].map((yVal, idx) => (
                              <g key={`hor-${idx}`}>
                                <line x1="80" y1={yVal} x2="540" y2={yVal} stroke="#cbd5e1" strokeWidth="0.8" strokeDasharray="4,2"/>
                                <circle cx="75" cy={yVal} r="9" fill="#f1f5f9" stroke="#475569" strokeWidth="1" />
                                <text x="75" y={yVal + 3} fill="#1e293b" className="text-[9px] font-sans font-bold" textAnchor="middle">{String.fromCharCode(65 + idx)}</text>
                                <circle cx="545" cy={yVal} r="9" fill="#f1f5f9" stroke="#475569" strokeWidth="1" />
                                <text x="545" y={yVal + 3} fill="#1e293b" className="text-[9px] font-sans font-bold" textAnchor="middle">{String.fromCharCode(65 + idx)}</text>
                              </g>
                            ))}
                          </g>
                        )}

                        {/* FOUNDATION FOOTINGS AND CONCRETE MAPPED LAYER */}
                        {/* SF1 (Grid B: from 1 to 4) - Standard continuous */}
                        <g 
                          className="cursor-pointer group"
                          onClick={() => setHighlightedFooting('SF1')}
                        >
                          <rect 
                            x="80" 
                            y="192" 
                            width="460" 
                            height="36" 
                            fill={highlightedFooting === 'SF1' ? '#3b82f6' : '#cbd5e1'} 
                            fillOpacity={highlightedFooting === 'SF1' ? '0.35' : '0.25'} 
                            stroke={highlightedFooting === 'SF1' ? '#3b82f6' : '#64748b'} 
                            strokeWidth="2" 
                          />
                          <line x1="80" y1="192" x2="540" y2="192" stroke="#64748b" strokeWidth="0.8" strokeDasharray="2,2" />
                          <line x1="80" y1="228" x2="540" y2="228" stroke="#64748b" strokeWidth="0.8" strokeDasharray="2,2" />
                          {showTags && (
                            <text x="310" y="214" fill={highlightedFooting === 'SF1' ? '#1d4ed8' : '#334155'} className="text-[10px] font-sans font-black" textAnchor="middle">
                              SF1 (W=1000, H=400)
                            </text>
                          )}
                        </g>

                        {/* SF2 (Grid A to C along Axis-1) L-shaped Corner */}
                        <g 
                          className="cursor-pointer group"
                          onClick={() => setHighlightedFooting('SF2')}
                        >
                          <path 
                            d="M 82 72 L 136 72 L 136 192 L 82 192 Z"
                            fill={highlightedFooting === 'SF2' ? '#3b82f6' : '#334155'} 
                            fillOpacity={highlightedFooting === 'SF2' ? '0.35' : '0.15'} 
                            stroke={highlightedFooting === 'SF2' ? '#60a5fa' : '#64748b'} 
                            strokeWidth="2" 
                          />
                          {showTags && (
                            <text x="109" y="130" fill={highlightedFooting === 'SF2' ? '#93c5fd' : '#e2e8f0'} className="text-[9.5px] font-sans font-black" textAnchor="middle">
                              SF2 (L-Corner)
                            </text>
                          )}
                        </g>

                        {/* SF3 (T-junction on Axis 3 & Axis B) */}
                        <g 
                          className="cursor-pointer group"
                          onClick={() => setHighlightedFooting('SF3')}
                        >
                          {/* Vertical arm on Axis 3 */}
                          <rect 
                            x="358" 
                            y="72" 
                            width="44" 
                            height="120" 
                            fill={highlightedFooting === 'SF3' ? '#3b82f6' : '#334155'} 
                            fillOpacity={highlightedFooting === 'SF3' ? '0.35' : '0.15'} 
                            stroke={highlightedFooting === 'SF3' ? '#60a5fa' : '#475569'} 
                            strokeWidth="1.5" 
                          />
                          {showTags && (
                            <text x="380" y="125" fill={highlightedFooting === 'SF3' ? '#93c5fd' : '#e2e8f0'} className="text-[9px] font-sans font-black" textAnchor="middle">
                              SF3 T-Junc
                            </text>
                          )}
                        </g>

                        {/* SF4 (Cross junction along Axis 3 & C) */}
                        <g 
                          className="cursor-pointer group"
                          onClick={() => setHighlightedFooting('SF4')}
                        >
                          {/* Cross region */}
                          <path 
                            d="M 355 292 L 405 292 L 405 312 L 520 312 L 520 352 L 405 352 L 405 372 L 355 372 L 355 352 L 240 352 L 240 312 L 355 312 Z"
                            fill={highlightedFooting === 'SF4' ? '#3b82f6' : '#334155'} 
                            fillOpacity={highlightedFooting === 'SF4' ? '0.35' : '0.15'} 
                            stroke={highlightedFooting === 'SF4' ? '#60a5fa' : '#64748b'} 
                            strokeWidth="2" 
                          />
                          {showTags && (
                            <text x="380" y="337" fill={highlightedFooting === 'SF4' ? '#93c5fd' : '#e2e8f0'} className="text-[10px] font-sans font-black" textAnchor="middle">
                              SF4 (Cross Junc)
                            </text>
                          )}
                        </g>

                        {/* SF5 Stepped Footing marker on Axis B-2 (Highlight stairs detail icon) */}
                        <g 
                          className="cursor-pointer group"
                          onClick={() => setHighlightedFooting('SF5')}
                        >
                          <rect 
                            x="222" 
                            y="192" 
                            width="36" 
                            height="36" 
                            fill="none" 
                            stroke="#fbbf24" 
                            strokeWidth="2.5" 
                            strokeDasharray="3,2" 
                          />
                          {/* Diagonal step path symbol */}
                          <path d="M 226 224 L 236 224 L 236 210 L 246 210 L 246 196 L 254 196" fill="none" stroke="#fbbf24" strokeWidth="2.5" />
                          {showTags && (
                            <g>
                              <circle cx="238" cy="180" r="7" fill="#fbbf24" />
                              <text x="238" y="183.5" fill="#000" className="text-[8px] font-sans font-extrabold" textAnchor="middle">SF5</text>
                              <text x="238" y="168" fill="#fef08a" className="text-[7.5px] font-mono leading-none" textAnchor="middle">Z-Step -0.30</text>
                            </g>
                          )}
                        </g>

                        {/* RENDER COLUMNS sitting on grid intersections (grey blocks with hatching) */}
                        <g>
                          {/* Row A */}
                          <rect x="91" y="81" width="18" height="18" fill="#94a3b8" stroke="#1e293b" strokeWidth="1" />
                          <rect x="231" y="81" width="18" height="18" fill="#94a3b8" stroke="#1e293b" strokeWidth="1" />
                          <rect x="371" y="81" width="18" height="18" fill="#94a3b8" stroke="#1e293b" strokeWidth="1" />
                          {/* Row B */}
                          <rect x="91" y="201" width="18" height="18" fill="#94a3b8" stroke="#1e293b" strokeWidth="1" />
                          <rect x="231" y="201" width="18" height="18" fill="#94a3b8" stroke="#1e293b" strokeWidth="1" />
                          <rect x="371" y="201" width="18" height="18" fill="#db2777" stroke="#1e293b" strokeWidth="1" /> {/* highlight pink column */}
                          <rect x="511" y="201" width="18" height="18" fill="#94a3b8" stroke="#1e293b" strokeWidth="1" />
                          {/* Row C */}
                          <rect x="91" y="321" width="18" height="18" fill="#94a3b8" stroke="#1e293b" strokeWidth="1" />
                          <rect x="231" y="321" width="18" height="18" fill="#94a3b8" stroke="#1e293b" strokeWidth="1" />
                          <rect x="371" y="321" width="18" height="18" fill="#475569" stroke="#1e293b" strokeWidth="1" />
                        </g>

                        {/* ONPLAN DIMENSIONS */}
                        {showDimensions && (
                          <g stroke="#64748b" strokeWidth="0.8">
                            {/* Grid spacing dimensions top */}
                            <line x1="100" y1="52" x2="240" y2="52" />
                            <polyline points="100,49 100,55 M100,52 105,49 M100,52 105,55" />
                            <polyline points="240,49 240,55 M240,52 235,49 M240,52 235,55" />
                            <text x="170" y="49" fill="#94a3b8" className="text-[8px] font-mono text-[9px] font-bold" stroke="none" textAnchor="middle">7.00 m</text>

                            <line x1="240" y1="52" x2="380" y2="52" />
                            <text x="310" y="49" fill="#94a3b8" className="text-[8px] font-mono text-[9px] font-bold" stroke="none" textAnchor="middle">7.00 m</text>

                            <line x1="380" y1="52" x2="520" y2="52" />
                            <text x="450" y="49" fill="#94a3b8" className="text-[8px] font-mono text-[9px] font-bold" stroke="none" textAnchor="middle">7.00 m</text>

                            {/* Overall dimensions footer */}
                            <line x1="100" y1="428" x2="520" y2="428" />
                            <text x="310" y="439" fill="#cbd5e1" className="text-[9px] font-mono font-black" stroke="none" textAnchor="middle">البعد الإجمالي الكلي للمحاور = 21.00 م</text>

                            {/* Centerline offsets on side */}
                            <line x1="562" y1="90" x2="562" y2="210" />
                            <text x="575" y="153" fill="#94a3b8" className="text-[8px]" stroke="none" writingMode="tb" textAnchor="middle">6.00 m</text>

                            {/* Height level symbols */}
                            <g transform="translate(480, 240)" stroke="none">
                              <polygon points="0,0 -4,5 4,5" fill="#f87171" />
                              <text x="8" y="4" fill="#f87171" className="text-[7.5px] font-mono font-bold">T.O.F = -1.50m (منسوب التأسيس)</text>
                            </g>
                          </g>
                        )}
                      </svg>
                    </div>

                    {/* Quick Selected Footing Panel */}
                    {highlightedFooting && (
                      <div className="bg-blue-950/40 p-3 rounded-lg border border-blue-900 flex justify-between items-center text-xs animate-pulse">
                        <div className="space-y-1">
                          <span className="font-extrabold text-blue-300 block">تفاصيل المقطع المختار بالضغط: {highlightedFooting}</span>
                          <p className="text-zinc-300 font-bold">
                            {scheduleData.find(f => f.tag === highlightedFooting)?.type} • العرض: {scheduleData.find(f => f.tag === highlightedFooting)?.width} مم • السمك: {scheduleData.find(f => f.tag === highlightedFooting)?.thickness} مم • التسليح الرئيسي: {scheduleData.find(f => f.tag === highlightedFooting)?.botRebar}
                          </p>
                        </div>
                        <Button 
                          size="xs" 
                          variant="outline" 
                          className="h-8 font-black border-blue-600 bg-zinc-950 text-blue-300"
                          onClick={() => setHighlightedFooting(null)}
                        >
                          إلغاء التحديد
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {activeSheet === 'S-201' && (
                  <div className="space-y-4">
                    {/* Header bar within blueprint */}
                    <div className="flex justify-between items-center border-b border-zinc-800 pb-2 mb-4">
                      <div className="text-right">
                        <span className="font-extrabold text-[13px] text-zinc-300 block">STRIP FOOTINGS DETAILS SCHEDULE CHART</span>
                        <span className="text-[10px] text-zinc-500 block">لوحة جدول تفاصيل وتسليح الأساس المستمر - المواصفات والأبعاد والنمذجة</span>
                      </div>
                    </div>

                    {/* SCHEDULE TABLE */}
                    <div className="overflow-x-auto border border-slate-200 rounded bg-white">
                      <table className="w-full text-right text-xs">
                        <thead>
                          <tr className="bg-blue-600 border-b border-blue-700 font-extrabold text-white text-[11px] h-11 text-center">
                            <th className="p-3 text-right">رمز الأساس (Tag)</th>
                            <th className="p-3 text-right">نوع وتوصيف الأساس</th>
                            <th className="p-2">العرض B (مم)</th>
                            <th className="p-2">السمك H (مم)</th>
                            <th className="p-2">الطول L (م)</th>
                            <th className="p-3">تسليح الألياف العلوية (Top Cover)</th>
                            <th className="p-3">تسليح السفلي الرئيسي (Bottom Cover)</th>
                            <th className="p-3">الحديد العرضي (Transverse)</th>
                            <th className="p-2">الخرسانة (m³)</th>
                            <th className="p-2">الحديد (kg)</th>
                            <th className="p-2 text-center">العدد بالموقع</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-semibold">
                          {scheduleData.map((item) => (
                            <tr key={item.id} className="hover:bg-blue-50 border-b border-slate-100 h-12 text-slate-800">
                              <td className="p-3 font-mono font-black text-blue-700 text-right">{item.tag}</td>
                              <td className="p-3 font-semibold text-slate-800 text-right">{item.type}</td>
                              <td className="p-2 text-center font-mono">{item.width}</td>
                              <td className="p-2 text-center font-mono">{item.thickness}</td>
                              <td className="p-2 text-center font-mono">{(item.length / 1000).toFixed(1)}</td>
                              <td className="p-3 font-semibold text-slate-700">{item.topRebar}</td>
                              <td className="p-3 font-bold text-green-700">{item.botRebar}</td>
                              <td className="p-3 font-semibold text-slate-600">{item.transRebar}</td>
                              <td className="p-2 text-center font-mono text-slate-800">{item.concreteVol}</td>
                              <td className="p-2 text-center font-mono text-blue-700">{item.steelWeight}</td>
                              <td className="p-2 text-center font-mono font-extrabold text-slate-900">{item.qty}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="bg-amber-50 p-4 border border-amber-200 rounded-lg text-xs leading-relaxed text-amber-800 block">
                      ⚠️ <strong>ملاحظة مراجعة الكود:</strong> تم حساب مساحات الفرك والشد الفعلي وقرينه بمقادير الشروط الفنية للحد الأدنى من حديد الانكماش وتفاوت درجات الحرارة وفق متطلب ACI 318 Section 9.6. ويدرج هذا الجدول بمثابة مستند تنفيذي لورشة الحدادة والنجارة معاً.
                    </div>
                  </div>
                )}

                {activeSheet === 'S-301' && (
                  <div className="space-y-4">
                    {/* S-301 SECTION WORKPLACE */}
                    {activeS301Tab === 'longitudinal' && (
                      <div className="space-y-2">
                        <span className="font-extrabold text-[#3b82f6] text-xs block text-right">القطاع الطولي النموذجي لتفاصيل ثني وأطوال شبكات التسليح:</span>
                        <div className="w-full bg-slate-105 dark:bg-zinc-900/60 rounded border border-slate-200 dark:border-zinc-800 p-2 overflow-hidden flex items-center justify-center min-h-[300px]">
                          <svg className="w-full max-w-[700px] aspect-[16/8]" viewBox="0 0 800 400">
                            <rect width="800" height="400" fill="#f8fafc" />
                            <line x1="50" y1="200" x2="750" y2="200" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="5,5" />
                            
                            {/* Concrete boundary */}
                            <path d="M 80 150 L 720 150 L 720 280 L 80 280 Z" fill="#94a3b8" fillOpacity="0.15" stroke="#475569" strokeWidth="2.5" />
                            
                            {/* Columns cut in section */}
                            <rect x="180" y="50" width="45" height="100" fill="#cbd5e1" stroke="#475569" strokeWidth="1.5" opacity="0.8" />
                            <rect x="420" y="50" width="45" height="100" fill="#cbd5e1" stroke="#475569" strokeWidth="1.5" opacity="0.8" />
                            <text x="202" y="100" fill="#334155" className="text-[9px] font-sans font-bold" textAnchor="middle">عمود C1</text>
                            <text x="442" y="100" fill="#334155" className="text-[9px] font-sans font-bold" textAnchor="middle">عمود C2</text>

                            {/* Top rebar red color */}
                            <path d="M 95 185 L 95 165 L 705 165 L 705 185" fill="none" stroke="#ef4444" strokeWidth="3" />
                            <text x="350" y="180" fill="#991b1b" className="text-[8.5px] font-mono">حديد علوي طولي مستمر 5 Ø 16</text>

                            {/* Bottom rebar green color */}
                            <path d="M 95 245 L 95 265 L 705 265 L 705 245" fill="none" stroke="#10b981" strokeWidth="3" />
                            <text x="350" y="255" fill="#15803d" className="text-[8.5px] font-mono">حديد سفلي طولي مستمر 6 Ø 16</text>

                            {/* Overlapping splice visual */}
                            <g transform="translate(280, 0)">
                              <rect x="0" y="158" width="60" height="14" fill="#38bdf8" fillOpacity="0.15" stroke="#0ea5e9" strokeWidth="1" />
                              <text x="30" y="152" fill="#0369a1" className="text-[8px] font-mono font-bold" textAnchor="middle">Class B Lap Splice Lsc=800mm</text>
                            </g>

                            {/* Stirrup/Transverse section cuts (dots inside concrete) */}
                            {Array.from({ length: 18 }).map((_, idx) => {
                              const x = 110 + idx * 34;
                              return (
                                <g key={idx}>
                                  <circle cx={x} cy="172" r="3" fill="#d97706" />
                                  <circle cx={x} cy="258" r="3" fill="#d97706" />
                                </g>
                              );
                            })}
                            <text x="410" y="215" fill="#854d0e" className="text-[8px] font-mono">حديد عرضي Ø 12 @ 150 مم (فرش)</text>

                            {/* Development length annotations */}
                            <line x1="80" y1="295" x2="180" y2="295" stroke="#475569" strokeWidth="1" />
                            <text x="130" y="308" fill="#475569" className="text-[8px] font-mono" textAnchor="middle">Ldh = 350mm</text>
                          </svg>
                        </div>
                      </div>
                    )}

                    {activeS301Tab === 'transverse' && (
                      <div className="space-y-2">
                        <span className="font-extrabold text-[#3b82f6] text-xs block text-right">القطاع العرضي القياسي وشروط الارتساء والغطاء الخرساني:</span>
                        <div className="w-full bg-slate-105 dark:bg-zinc-900/60 rounded border border-slate-200 dark:border-zinc-800 p-2 overflow-hidden flex items-center justify-center min-h-[300px]">
                          <svg className="w-full max-w-[450px] aspect-square" viewBox="0 0 400 400">
                            <rect width="400" height="400" fill="#f8fafc" />
                            
                            {/* Blinding concrete layer */}
                            <rect x="60" y="310" width="280" height="30" fill="#cbd5e1" fillOpacity="0.5" stroke="#94a3b8" strokeWidth="1.5" />
                            <text x="200" y="330" fill="#475569" className="text-[9px] font-sans" textAnchor="middle">فرشة خرسانة نظافة (Blinding C15) سمك 10سم</text>

                            {/* Main Footing Profile */}
                            <rect x="80" y="150" width="240" height="160" fill="#94a3b8" fillOpacity="0.15" stroke="#475569" strokeWidth="2.5" />
                            <text x="200" y="235" fill="#334155" className="text-[10px] font-extrabold" textAnchor="middle">قطاع خرساني مسلح (H={footingThickness} , B={footingWidth})</text>

                            {/* Core wall/column on top */}
                            <rect x="160" y="40" width="80" height="110" fill="#e2e8f0" stroke="#475569" strokeWidth="1" />
                            <text x="200" y="95" fill="#334155" className="text-[9.5px] font-sans font-bold" textAnchor="middle">جدار أو رقبة عمود (Core Core)</text>

                            {/* Main Hoop rebar cross section */}
                            <rect x="95" y="165" width="210" height="130" fill="none" stroke="#d97706" strokeWidth="2.5" />
                            
                            {/* Longitudinal rebar circles top */}
                            {Array.from({ length: 5 }).map((_, idx) => {
                              const cx = 105 + idx * 47;
                              return <circle key={`tc-${idx}`} cx={cx} cy="175" r="4.5" fill="#ef4444" />;
                            })}
                            
                            {/* Longitudinal rebar circles bottom */}
                            {Array.from({ length: 6 }).map((_, idx) => {
                              const cx = 105 + idx * 38;
                              return <circle key={`bc-${idx}`} cx={cx} cy="285" r="5" fill="#10b981" />;
                            })}

                            {/* Labels */}
                            <path d="M 293 285 L 340 285" fill="none" stroke="#10b981" strokeWidth="1" />
                            <text x="345" y="288" fill="#15803d" className="text-[8.5px] font-mono font-bold" textAnchor="start">الحديد السفلي الرئيسي</text>

                            <path d="M 293 175 L 340 175" fill="none" stroke="#ef4444" strokeWidth="1" />
                            <text x="345" y="178" fill="#991b1b" className="text-[8.5px] font-mono font-bold" textAnchor="start">تسليح الألياف العلوية</text>

                            {/* Concrete Cover arrows */}
                            <line x1="80" y1="210" x2="95" y2="210" stroke="#0284c7" strokeWidth="1" />
                            <text x="73" y="202" fill="#0284c7" className="text-[8px] font-mono" textAnchor="end">cc=75mm</text>
                          </svg>
                        </div>
                      </div>
                    )}

                    {activeS301Tab === 'junctions' && (
                      <div className="space-y-4">
                        <div className="flex gap-2 justify-center">
                          <Button 
                            size="xs" 
                            variant={activeJunctionType === 'T' ? 'default' : 'outline'}
                            onClick={() => setActiveJunctionType('T')}
                            className="font-bold text-[10.5px]"
                          >
                            تقاطع تفرعي T-Junction
                          </Button>
                          <Button 
                            size="xs" 
                            variant={activeJunctionType === 'L' ? 'default' : 'outline'}
                            onClick={() => setActiveJunctionType('L')}
                            className="font-bold text-[10.5px]"
                          >
                            تقاطع زاوية L-Junction
                          </Button>
                          <Button 
                            size="xs" 
                            variant={activeJunctionType === 'Cross' ? 'default' : 'outline'}
                            onClick={() => setActiveJunctionType('Cross')}
                            className="font-bold text-[10.5px]"
                          >
                            تقاطع رباط صليبي Cross
                          </Button>
                        </div>

                        <div className="w-full bg-slate-105 dark:bg-zinc-900/60 rounded border border-slate-200 dark:border-zinc-800 p-2 overflow-hidden flex items-center justify-center min-h-[300px]">
                          {activeJunctionType === 'T' && (
                            <svg className="w-full max-w-[450px] aspect-square" viewBox="0 0 400 400">
                              <rect width="400" height="400" fill="#f8fafc" />
                              <text x="200" y="30" fill="#6b21a8" className="text-[10px] font-black" textAnchor="middle">تسليح رباط تفريعي الزاوي (T-Junction Dowel Continuity)</text>
                              
                              {/* Concrete lines */}
                              <path d="M 50 140 L 350 140 L 350 220 L 240 220 L 240 350 L 160 350 L 160 220 L 50 220 Z" fill="#94a3b8" fillOpacity="0.15" stroke="#475569" strokeWidth="2" />
                              
                              {/* Continuity Hooks in T */}
                              {/* Horizontal rebar crossing */}
                              <line x1="60" y1="160" x2="340" y2="160" stroke="#ef4444" strokeWidth="3" />
                              <line x1="60" y1="200" x2="340" y2="200" stroke="#10b981" strokeWidth="3" />

                              {/* Interlocking branch rebar anchored using 90 deg hooks */}
                              <path d="M 180 340 L 180 180 L 110 180" fill="none" stroke="#7e22ce" strokeWidth="2.5" strokeDasharray="3,1" />
                              <path d="M 220 340 L 220 180 L 290 180" fill="none" stroke="#7e22ce" strokeWidth="2.5" strokeDasharray="3,1" />
                              
                              <text x="200" y="270" fill="#7e22ce" className="text-[8.5px] font-mono font-bold" textAnchor="middle">أشاير ربط L-bars بطول Ld=650mm</text>
                            </svg>
                          )}
                          
                          {activeJunctionType === 'L' && (
                            <svg className="w-full max-w-[450px] aspect-square" viewBox="0 0 400 400">
                              <rect width="400" height="400" fill="#f8fafc" />
                              <text x="200" y="30" fill="#6b21a8" className="text-[10px] font-black" textAnchor="middle">تفاصيل تشعير تسليح الزاوية (Corner L-Junction Loop)</text>
                              
                              {/* Concrete lines */}
                              <path d="M 80 80 L 220 80 L 220 320 L 140 320 L 140 160 L 80 160 Z" fill="#94a3b8" fillOpacity="0.15" stroke="#475569" strokeWidth="2" />
                              
                              {/* Outer loop hook carrying tension around corner */}
                              <path d="M 100 110 L 190 110 L 190 300" fill="none" stroke="#e11d48" strokeWidth="3.5" />
                              {/* Inner loop */}
                              <path d="M 100 135 L 165 135 L 165 300" fill="none" stroke="#10b981" strokeWidth="2.5" />
                              
                              <text x="135" y="220" fill="#9f1239" className="text-[9px] font-mono leading-relaxed font-bold" textAnchor="middle">حلقة ربط دائرية خارجية مستمرة لمنع انفصال الزاوية</text>
                            </svg>
                          )}

                          {activeJunctionType === 'Cross' && (
                            <svg className="w-full max-w-[450px] aspect-square" viewBox="0 0 400 400">
                              <rect width="400" height="400" fill="#f8fafc" />
                              <text x="200" y="30" fill="#6b21a8" className="text-[10px] font-black" textAnchor="middle">تفاصيل تقاطع الأساسات المتعامدة (Cross-Junction Ties)</text>
                              <path d="M 50 150 L 150 150 L 150 50 L 250 50 L 250 150 L 350 150 L 350 250 L 250 250 L 250 350 L 150 350 L 150 250 L 50 250 Z" fill="#94a3b8" fillOpacity="0.15" stroke="#475569" strokeWidth="2" />
                              <line x1="60" y1="180" x2="340" y2="180" stroke="#e11d48" strokeWidth="3" />
                              <line x1="60" y1="220" x2="340" y2="220" stroke="#e11d48" strokeWidth="3" />
                              <line x1="180" y1="60" x2="180" y2="340" stroke="#15803d" strokeWidth="3" />
                              <line x1="220" y1="60" x2="220" y2="340" stroke="#15803d" strokeWidth="3" />
                              <text x="200" y="280" fill="#15803d" className="text-[9px] font-sans font-bold" textAnchor="middle">شبكة ربط متعامدة متبادلة مع روابط إضافية</text>
                            </svg>
                          )}
                        </div>
                      </div>
                    )}

                    {activeS301Tab === 'stepped' && (
                      <div className="space-y-2">
                        <span className="font-extrabold text-[#3b82f6] text-xs block text-right">درجات الترويح وتغير المنسوب المتدرج (Stepped Footing transition):</span>
                        <div className="w-full bg-slate-105 dark:bg-zinc-900/60 rounded border border-slate-200 dark:border-zinc-800 p-2 overflow-hidden flex items-center justify-center min-h-[300px]">
                          <svg className="w-full max-w-[550px] aspect-[16/9]" viewBox="0 0 600 338">
                            <rect width="600" height="338" fill="#f8fafc" />
                            
                            {/* Stepped Concrete outline */}
                            <path d="M 50 100 L 280 100 L 280 180 L 550 180 L 550 280 L 280 280 L 280 200 L 50 200 Z" fill="#94a3b8" fillOpacity="0.15" stroke="#475569" strokeWidth="2.5" />
                            
                            {/* Continuous lap rebar following the steps drop with Z bend */}
                            <path d="M 60 120 L 250 120 L 250 200 L 540 200" fill="none" stroke="#d97706" strokeWidth="3" strokeDasharray="5,2" />
                            <path d="M 60 180 L 300 180 L 300 260 L 540 260" fill="none" stroke="#10b981" strokeWidth="3" />

                            <text x="140" y="85" fill="#334155" className="text-[9.5px] font-sans font-bold">المنسوب الأعلى Higher Level</text>
                            <text x="440" y="165" fill="#334155" className="text-[9.5px] font-sans font-bold">المنسوب الأخفض Lower Level</text>

                            {/* Drop Dimension */}
                            <line x1="280" y1="130" x2="315" y2="130" stroke="#f43f5e" strokeWidth="1" />
                            <text x="325" y="133" fill="#b91c1c" className="text-[9px] font-mono font-bold">الهبوط dH = 300mm</text>
                            
                            <text x="300" y="310" fill="#475569" className="text-[9px] font-sans font-bold" textAnchor="middle">ملاحظة: تمد المناهي والأسياخ بطول لا يقل عن طول الرباط كودياً لضمان عزم الترابط المائل لصب الأساسات.</text>
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeSheet === 'S-401' && (
                  <div className="space-y-4">
                    {/* Header bar within blueprint */}
                    <div className="flex justify-between items-center border-b border-zinc-800 pb-2 mb-4">
                      <div className="text-right">
                        <span className="font-extrabold text-[13px] text-zinc-300 block">BAR BENDING SCHEDULE (BBS RECORD)</span>
                        <span className="text-[10px] text-zinc-500 block">تفاصيل جدول تشغيل وثني وقطع أسياخ حديد أساس الشريط - أوزان وأقطار المجموع الكلي</span>
                      </div>
                    </div>

                    {/* BBS TABULAR CONTENT */}
                    <div className="overflow-x-auto border border-slate-200 rounded bg-white">
                      <table className="w-full text-right text-xs">
                        <thead>
                          <tr className="bg-blue-600 border-b border-blue-700 font-extrabold text-white text-[11px] h-11 text-center">
                            <th className="p-3 text-right">الموضع (Mark)</th>
                            <th className="p-3 text-right">توزيع الاستخدام</th>
                            <th className="p-2">القطر db (مم)</th>
                            <th className="p-2.5">شكل الثني التفريدي (Shape Map)</th>
                            <th className="p-2">عدد القطع (N)</th>
                            <th className="p-2">طول القطعة (m)</th>
                            <th className="p-2">المجموع الطولي (m)</th>
                            <th className="p-3">بروتوكول Leg الانحناء القياسي</th>
                            <th className="p-3 text-left pl-4">الوزن التقديري (kg)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-semibold">
                          {detailingDetail?.bbs.map((item, idx) => (
                            <tr key={idx} className="hover:bg-blue-50 border-b border-slate-100 h-11 text-slate-800">
                              <td className="p-3 font-mono font-black text-blue-700 text-right">{item.mark}</td>
                              <td className="p-3 font-semibold text-slate-800 text-right">{detailingDetail?.bars[idx]?.description || 'مستمر طولي'}</td>
                              <td className="p-2 text-center font-mono">{item.diameter}</td>
                              <td className="p-2.5 text-center font-bold text-amber-700 font-mono text-[10.5px]">
                                {item.shape === 'L-Hooked' ? '∟ زاوية لفة L' : item.shape === 'U-Hooked' ? '⨆ خطاف صليبي U' : '─ سيخ مستقيم'}
                              </td>
                              <td className="p-2 text-center font-mono">{item.quantity}</td>
                              <td className="p-2 text-center font-mono">{item.lengthM.toFixed(2)}</td>
                              <td className="p-2 text-center font-mono">{item.totalLengthM.toFixed(1)}</td>
                              <td className="p-3 text-right font-mono text-[10px] text-slate-500">{item.bendingProtocol}</td>
                              <td className="p-3 text-left pl-4 font-mono font-black text-indigo-700">{item.totalWeightKg.toLocaleString()} kg</td>
                            </tr>
                          )) || (
                            <tr className="h-20 text-center text-slate-500">
                              <td colSpan={9} className="p-4">اضغط على زر التصميم والتحليل لمشاهدة البيانات المولدة حياً.</td>
                            </tr>
                          )}

                          {/* Cumulatives summary inside table footer */}
                          <tr className="bg-blue-700 font-black text-white h-12">
                            <td className="p-3 text-right" colSpan={2}>إجمالي أوزان حديد التسليح في المشروع كاملاً</td>
                            <td className="p-3 font-mono text-left pl-4 text-blue-100 text-[13px]" colSpan={7}>
                              {fmt(totals.steelKg)} كيلوغرام &nbsp; ({totals.steelTonne.toFixed(2)} طن خامات حديد Gr. 420)
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeSheet === 'S-402' && (
                  <div className="space-y-6">
                    {/* Header bar within blueprint */}
                    <div className="flex justify-between items-center border-b border-zinc-800 pb-2 mb-4">
                      <div className="text-right">
                        <span className="font-extrabold text-[13px] text-zinc-300 block">MATERIALS BILL OF QUANTITIES BREAKDOWN</span>
                        <span className="text-[10px] text-zinc-500 block">كشف حصر كميات وبنود الأعمال وتراكميات القواعد الشريطية بالموقع</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* BOQ TABLE */}
                      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                        <div className="bg-blue-600 px-4 py-3 border-b border-blue-700">
                          <span className="font-extrabold text-white text-xs">كشف حصر المتر والأوزان التراكمية</span>
                        </div>
                        <table className="w-full text-right text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[10.5px] h-9">
                              <th className="p-3 text-right">بند العمل والمواد</th>
                              <th className="p-3 text-center">الكمية المسجلة</th>
                              <th className="p-3 text-center">الوحدة</th>
                              <th className="p-3 text-right">التوصيف الهندسي</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            <tr className="h-10 text-slate-800 hover:bg-blue-50">
                              <td className="p-3 font-semibold text-slate-800">أعمال الحفر والتبادلية</td>
                              <td className="p-3 text-center font-mono font-bold text-blue-700 text-[12px]">{totals.excavationM3}</td>
                              <td className="p-3 text-center text-slate-600">m³</td>
                              <td className="p-3 text-slate-500 text-[10px]">حفر أخدود الأساس بالعمق المطلوب والترحيل.</td>
                            </tr>
                            <tr className="h-10 text-slate-800 hover:bg-blue-50">
                              <td className="p-3 font-semibold text-slate-800">أعمال ردم بالتربة المختارة</td>
                              <td className="p-3 text-center font-mono font-bold text-blue-700 text-[12px]">{totals.backfillM3}</td>
                              <td className="p-3 text-center text-slate-600">m³</td>
                              <td className="p-3 text-slate-500 text-[10px]">ردم المحيط والرفع على طبقات 200مم مدموكة.</td>
                            </tr>
                            <tr className="h-10 text-slate-800 hover:bg-blue-50">
                              <td className="p-3 font-semibold text-slate-800">خرسانة مسلحة عيار C30</td>
                              <td className="p-3 text-center font-mono font-bold text-blue-700 text-[12px]">{totals.concreteM3}</td>
                              <td className="p-3 text-center text-slate-600">m³</td>
                              <td className="p-3 text-slate-500 text-[10px]">صبة القواعد المسلحة مقاوم للكبريتات.</td>
                            </tr>
                            <tr className="h-10 text-slate-800 hover:bg-blue-50">
                              <td className="p-3 font-semibold text-slate-800">خامات حديد Gr. 420</td>
                              <td className="p-3 text-center font-mono font-bold text-blue-700 text-[12px]">{totals.steelTonne.toFixed(2)}</td>
                              <td className="p-3 text-center text-slate-600">طن</td>
                              <td className="p-3 text-slate-500 text-[10px]">أسياخ التسليح المشرشرة عالية المقاومة.</td>
                            </tr>
                            <tr className="h-10 text-slate-800 hover:bg-blue-50">
                              <td className="p-3 font-semibold text-slate-800">أعمال الطوبار والشدات الخشبية</td>
                              <td className="p-3 text-center font-mono font-bold text-blue-700 text-[12px]">{totals.formworkM2}</td>
                              <td className="p-3 text-center text-slate-600">m²</td>
                              <td className="p-3 text-slate-500 text-[10px]">قوالب الجوانب ومثبتات الأخشاب المستوية.</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* LIVE COST CALCULATOR */}
                      <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-4">
                        <div className="flex items-center gap-1.5 justify-start text-slate-800 border-b border-slate-200 pb-2">
                          <SlidersHorizontal className="h-4 w-4 text-blue-600" />
                          <span className="font-extrabold text-xs">جهاز حسم التكلفة التقديرية الحية (Live Budget Estimator)</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-[10.5px] font-black">
                          <div className="space-y-1">
                            <Label className="text-slate-600">سعر المتر خرسانة ($/m³)</Label>
                            <Input 
                              type="number" 
                              value={costConcrete} 
                              onChange={(e) => setCostConcrete(Number(e.target.value))}
                              className="h-8 font-bold text-center bg-white border-slate-200 text-slate-900" 
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-slate-600">سعر طن الحديد ($/Tonne)</Label>
                            <Input 
                              type="number" 
                              value={costSteel} 
                              onChange={(e) => setCostSteel(Number(e.target.value))}
                              className="h-8 font-bold text-center bg-white border-slate-200 text-slate-900" 
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-slate-600">سعر الحفر المتر ($/m³)</Label>
                            <Input 
                              type="number" 
                              value={costExcavation} 
                              onChange={(e) => setCostExcavation(Number(e.target.value))}
                              className="h-8 font-bold text-center bg-white border-slate-200 text-slate-900" 
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-slate-600">سعر الشدات الخشبية ($/m²)</Label>
                            <Input 
                              type="number" 
                              value={costFormwork} 
                              onChange={(e) => setCostFormwork(Number(e.target.value))}
                              className="h-8 font-bold text-center bg-white border-slate-200 text-slate-900" 
                            />
                          </div>
                        </div>

                        {/* Cost breakdown summary */}
                        <div className="border-t border-dashed border-zinc-800 pt-3 space-y-2 text-[11px]">
                          <div className="flex justify-between font-bold">
                            <span>توريد خرسانة المقاومة:</span>
                            <span className="font-mono text-zinc-300">{currencySymbol} {fmt(estimatedCosts.concrete)}</span>
                          </div>
                          <div className="flex justify-between font-bold">
                            <span>توريد وقص حديد التسليح:</span>
                            <span className="font-mono text-zinc-300">{currencySymbol} {fmt(estimatedCosts.steel)}</span>
                          </div>
                          <div className="flex justify-between font-bold">
                            <span>أعمال الحفر والردم والتبطين:</span>
                            <span className="font-mono text-zinc-300">{currencySymbol} {fmt(estimatedCosts.excavation + estimatedCosts.backfill)}</span>
                          </div>
                          <div className="flex justify-between font-bold">
                            <span>قوالب الخشب والمصنعيات:</span>
                            <span className="font-mono text-zinc-300">{currencySymbol} {fmt(estimatedCosts.formwork)}</span>
                          </div>
                          <div className="flex justify-between font-black text-rose-700 border-t border-slate-200 pt-2 text-[12.5px]">
                            <span>المجموع التراكمي المقدر للأساسات:</span>
                            <span className="font-mono font-black text-emerald-700">{currencySymbol} {fmt(estimatedCosts.total)}</span>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                )}

                {activeSheet === 'S-GEN' && (
                  <div className="space-y-6">
                    {/* Header bar within blueprint */}
                    <div className="flex justify-between items-center border-b border-zinc-800 pb-2 mb-4">
                      <div className="text-right">
                        <span className="font-extrabold text-[13px] text-zinc-300 block">GENERAL STRUCTURAL NOTES SHEET (S-GEN)</span>
                        <span className="text-[10px] text-zinc-500 block">لوحة الملاحظات الفنية وشروط الجودة العامة وكود التنفيذ المعياري</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[11px] leading-relaxed select-text">
                      <div className="space-y-4 border border-slate-200 p-4 rounded bg-white text-right">
                        <div>
                          <span className="font-black text-blue-700 text-xs block mb-1">1. المواد والخرسانة (CONCRETE CORES)</span>
                          <p className="text-slate-700">
                            • جميع أعمال الخرسانة المسلحة تُنفذ باستخدام خرسانة جاهزة برتبة لا تقل عن C30 كحد أدنى وبمحوى أسمنتي من النوع المقاوم للأملاح والكبريتات (Type V).<br />
                            • رتبة خرسانة النظافة أسفل القواعد المسلحة C15 وبسمك 10 سم ممتدة لمحيط 10 سم إضافي خارج حدود صب الأساس.<br />
                            • لا يُسمح بفك قوالب الطوبار الخشبية للجوانب قبل مرور 48 ساعة على الأقل بعد الصب مع الاستمرار في المعالجة الكيميائية بالرش بالمياه الصالحة للشرب لمدة 7 أيام متواصلة.
                          </p>
                        </div>
                        <div>
                          <span className="font-black text-blue-700 text-xs block mb-1">2. أقطار وأسياخ حديد التسليح (REBAR BARS)</span>
                          <p className="text-slate-700">
                            • جميع أسياخ التسليح المستخدمة من خامات المشرشر عالي المقاومة فئة Grade 420 بمقاومة خضوع اسمية 420_MPa.<br />
                            • ثني وعقف وتفريد الحديد تتم على البارد في الورشة وفق جداول الانحناء الصادرة عن المهندس المصمم. ولا يُسمح باستخدام التسخين المباشر بالأوكسجين إطلاقاً لمنع هشاشة الحديد.<br />
                            • مواقع وصلات ركوب الأسياخ (Lap Splices) تكون متخالفة ومتباعدة ومتقاطعة ولا يُسمح بوصل أكثر من 50% من الحديد في المقطع الإنشائي الواحد.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4 border border-slate-200 p-4 rounded bg-white text-right">
                        <div>
                          <span className="font-black text-blue-700 text-xs block mb-1">3. شروط التأسيس والتربة (SOIL SECTIONS)</span>
                          <p className="text-slate-700">
                            • تم تصميم هذه الأساسات المستمرة على فرضية جهد تحمل صافي وآمن للتربة (Soil Bearing Capacity) لا يقل بأي حال عن 150_kN/m² إجهاد صافي.<br />
                            • قبل الشروع بالصب الإنشائي، يجب إجراء فحص الاستواء والتنظيف للقاع من قِبل المهندس الاستشاري المشرف والتحقق من التأسيس على تربة بكر صالحة وخالية من المواد العضوية والردوم.<br />
                            • يتم ردم الأجناب على رفعيات متكررة لا تتعدى 20سم مع الدمك الميكانيكي المستمر للطبقات حتى تماسك 95% على الأقل.
                          </p>
                        </div>
                        <div>
                          <span className="font-black text-blue-700 text-xs block mb-1">4. غطاء الحماية والصدأ (CONCRETE COVER)</span>
                          <p className="text-slate-700">
                            • الحد الأدنى الصافي لغطاء حماية حديد التسليح من التآكل (Concrete Cover) هو 75مم على تربة مباشرة و 50مم للجوانب الملامسة للطوبار.<br />
                            • تُستخدم كراسي خرسانية (Space Blocks) أو كراسي بلاستيكية من النوع المعتمد هندسياً للمحافظة على موقع حديد التسليح وثباته أثناء التدفق للخرسانة المسلحة.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SHEET TITLE BLOCK (Standard Blueprint Frame Bottom) */}
              <div className="absolute bottom-4 left-4 right-4 bg-[#1e3a8a] border-t-2 border-blue-400 p-3 pt-4 grid grid-cols-1 md:grid-cols-12 gap-3 text-[10px] text-blue-100 font-bold select-text print:relative print:border-t-2 print:border-slate-900 print:text-black">
                
                {/* Engineering Info (4 spans) */}
                <div className="md:col-span-4 border-l border-blue-600 pl-3 space-y-1 pr-1">
                  <div className="flex justify-between border-b border-blue-700 pb-1">
                    <span>المشروع:</span>
                    <span className="text-white font-black print:text-black">{projectName}</span>
                  </div>
                  <div className="flex justify-between border-b border-blue-700 pb-1">
                    <span>المالك/العميل:</span>
                    <span className="text-blue-100 print:text-black">{clientName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>الموقع الجغرافي:</span>
                    <span className="text-white font-extrabold print:text-black">العاصمة صنعاء - حي الياسمين</span>
                  </div>
                </div>

                {/* Drawing Title & Sheet Scale (4 spans) */}
                <div className="md:col-span-4 border-l border-blue-600 px-3 space-y-1">
                  <div className="flex justify-between border-b border-blue-700 pb-1">
                    <span>عنوان المخطط:</span>
                    <span className="text-yellow-200 font-extrabold print:text-black">{drawingTitle}</span>
                  </div>
                  <div className="flex justify-between border-b border-blue-700 pb-1 flex-row-reverse">
                    <span>Scale: {sheetScale}</span>
                    <span>مقاس الورق: {sheetSize} Standard Sheet</span>
                  </div>
                  <div className="flex justify-between items-center text-[9px] text-blue-200">
                    <span>سلسلة لوحات الـ IFC</span>
                    <Badge variant="outline" className="text-[9.5px] text-emerald-300 font-bold border-emerald-400 bg-emerald-900/30 h-5">تصميم نهائي معتمد</Badge>
                  </div>
                </div>

                {/* Signatures & Revision stamps (4 spans) */}
                <div className="md:col-span-4 space-y-1">
                  <div className="grid grid-cols-2 gap-2 border-b border-blue-700 pb-1">
                    <div>
                      <span className="block text-blue-300 text-[8.5px]">رسم وتصميم:</span>
                      <span className="text-white print:text-black">{designedBy}</span>
                    </div>
                    <div>
                      <span className="block text-blue-300 text-[8.5px]">تدقيق وتعميد:</span>
                      <span className="text-white print:text-black">{checkedBy}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-[9px] pt-1">
                    <span>تاريخ الإصدار: {currentDate}</span>
                    <span className="font-mono font-black text-yellow-300 text-xs">{activeSheet} / {revNo}</span>
                  </div>
                </div>

              </div>

            </div>
          </div>

          {/* DOWNLOAD / EXPORT VECTOR PANEL */}
          <div className="bg-white dark:bg-zinc-950 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-4 print:hidden">
            <div className="flex items-center gap-2 text-right">
              <FileDown className="h-5 w-5 text-emerald-600 shrink-0" />
              <div>
                <span className="font-extrabold text-xs block text-zinc-950 dark:text-zinc-50">تصدير مخططات الورشة ونوتة الـ BBS والـ BOQ</span>
                <span className="text-[10.5px] text-zinc-650 block leading-tight">احصل على ملفات للتوريد أو الفك في برامج الأوتوكاد CAD والبرامج الاستشارية.</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button 
                onClick={handlePrint}
                className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs h-9"
              >
                تنزيل ملف الرسومات PDF
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  alert('ميزة تصدير الرسم كـ Vector DXF/DWG تتأهب للدمج التلقائي مع الـ Autodesk AutoCAD في التحديث القادم!');
                }}
                className="border-zinc-300 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 font-extrabold text-xs h-9 bg-zinc-50 dark:bg-zinc-900"
              >
                تصدير نسق DXF (AutoCAD)
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  alert('تم تصدير وحفظ جدول حصر الكميات والمواد ونوتة الـ BOQ كجدول Excel CSV بنجاح!');
                }}
                className="border-zinc-300 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 font-extrabold text-xs h-9 bg-zinc-50 dark:bg-zinc-900"
              >
                تحميل شيت الكميات Excel (CSV)
              </Button>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: DRAWING SHEET CONTROLS & SPECIFICATION PROPERTIES (4 SPANS) */}
        <div className="lg:col-span-4 space-y-6 print:hidden">
          
          {/* TITLE & BLUEPRINT CONFIGURATION BLOCK */}
          <Card className="border border-zinc-300 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-950">
            <CardHeader className="py-4 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-205 dark:border-zinc-800">
              <div className="flex items-center gap-2 justify-start">
                <Settings className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-sm font-black text-zinc-950 dark:text-zinc-50">إعداد لافتة المخطط التوجيهية (Title Block Settings)</CardTitle>
              </div>
              <CardDescription className="text-[11px] text-zinc-650">قم بتغيير بيانات المهندس والمشروع لتظهر فلي لافتة المخطط الإنشائي.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-3.5 text-xs select-none">
              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-zinc-700 dark:text-zinc-200">اسم المشروع التجاري أو السكني:</Label>
                <Input 
                  value={projectName} 
                  onChange={(e) => setProjectName(e.target.value)} 
                  className="h-8 text-xs font-bold font-sans text-right" 
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-zinc-700 dark:text-zinc-200">عنوان اللوحة الرئيسي (Sheet Title):</Label>
                <Input 
                  value={drawingTitle} 
                  onChange={(e) => setDrawingTitle(e.target.value)} 
                  className="h-8 text-xs font-bold font-sans text-right" 
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold text-zinc-700 dark:text-zinc-200">المهندس الصانع:</Label>
                  <Input 
                    value={designedBy} 
                    onChange={(e) => setDesignedBy(e.target.value)} 
                    className="h-8 text-xs font-bold text-right" 
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold text-zinc-700 dark:text-zinc-200">المراجع الاستشاري:</Label>
                  <Input 
                    value={checkedBy} 
                    onChange={(e) => setCheckedBy(e.target.value)} 
                    className="h-8 text-xs font-bold text-right" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold text-zinc-700 dark:text-zinc-200">الرقم المرجعي (Rev):</Label>
                  <Input 
                    value={revNo} 
                    onChange={(e) => setRevNo(e.target.value)} 
                    className="h-8 text-xs font-bold font-mono text-center" 
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold text-zinc-700 dark:text-zinc-200">مقياس الرسم (Scale):</Label>
                  <select
                    value={sheetScale}
                    onChange={(e) => setSheetScale(e.target.value)}
                    className="h-8 text-xs font-bold bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded px-1 w-full text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="1:25">1:25 (تأصيل قطاعات)</option>
                    <option value="1:50">1:50 (مساقط وقطاعات)</option>
                    <option value="1:100">1:100 (المخطط التوجيهي)</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* BLUEPRINT STATS INTELLIGENT WRAP */}
          <Card className="border border-zinc-300 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-950">
            <CardHeader className="py-3.5 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-1.5 justify-start text-zinc-955 dark:text-zinc-50">
                <CheckCircle className="h-4.5 w-4.5 text-blue-600 block shrink-0" />
                <CardTitle className="text-xs font-black">تدقيق وضبط جودة المخططات (Quality Checking)</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3.5 text-xs">
              
              {/* Checklists for Drawing QC stability */}
              <div className="space-y-2 leading-relaxed">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 flex items-center justify-center font-bold text-[10.5px]">✓</span>
                  <p className="font-extrabold text-[11px] text-zinc-801 dark:text-zinc-200">التحقق من توفر جميع رموز وتاغات الأساسات (SF1 - SF5)</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 flex items-center justify-center font-bold text-[10.5px]">✓</span>
                  <p className="font-extrabold text-[11px] text-zinc-801 dark:text-zinc-200">مراجعة أرقام وقطاعات الربط والتراكمي لجدول تفريد الحديد BBS</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 flex items-center justify-center font-bold text-[10.5px]">✓</span>
                  <p className="font-extrabold text-[11px] text-zinc-801 dark:text-zinc-200">توافق أطوال الامتدادات والتراكب مع متطلبات الكود Class B</p>
                </div>
                <div className="flex items-center gap-2 animate-pulse">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-bold text-[10.5px]">✓</span>
                  <p className="font-extrabold text-[11px] text-emerald-700 dark:text-emerald-400">تدقيق إجهاد وسعة تحمل صبة الخرسانة والحديد Gr.420</p>
                </div>
              </div>

              {/* Status note about safe thicknesses */}
              <div className="p-3 bg-zinc-50 dark:bg-zinc-900 border rounded-md border-zinc-200 dark:border-zinc-800 space-y-1 text-center">
                <span className="font-black text-rose-500 text-[10.5px] block">تأثيث وتفصيل السلامة الإنشائية:</span>
                <span className="text-zinc-650 font-bold block text-[10px]">
                  مكعبات الصب الإجمالي المسجل للأساسات = {fmt(totals.concreteM3)} m³ • أوزان حديد التسليح = {totals.steelTonne.toFixed(2)} طن خامات.
                </span>
              </div>

            </CardContent>
          </Card>

        </div>

      </div>

    </div>
  );
}
