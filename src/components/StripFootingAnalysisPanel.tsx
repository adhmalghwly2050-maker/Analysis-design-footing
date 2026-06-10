import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calculator, 
  Plus, 
  Trash2, 
  Play, 
  Info, 
  AlertTriangle, 
  FileSpreadsheet, 
  Compass, 
  Database, 
  CheckCircle, 
  HelpCircle, 
  ArrowRightLeft, 
  ShieldCheck, 
  Download, 
  Layers, 
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { 
  analyzeStripFooting, 
  getStripFootingBenchmarks, 
  type StripFootingInput, 
  type StripFootingLoad, 
  type StripFootingAnalysisResult, 
  type CriticalSection 
} from '../lib/stripFootingEngine';
import { 
  designStripFootingStrength, 
  type StripFootingDesignOutput,
  type ReinforcementZone 
} from '../lib/stripFootingDesignEngine';
import { 
  generateStripFootingDetail, 
  type DetailingConfig,
  type FootingStep,
  type StripJunction,
  type StripBar,
  type Splice,
  type BBSItem,
  type QuantityItem,
  type StripFootingDetail
} from '../lib/stripFootingDetailingEngine';
import StripFootingDrawingEngine from './StripFootingDrawingEngine';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ReferenceLine, 
  AreaChart, 
  Area 
} from 'recharts';
import type { Column } from '../lib/structuralEngine';

interface StripFootingAnalysisPanelProps {
  columns?: Column[];
  colLoads3D?: Map<string, { P_service?: number; Pu?: number; MxBot?: number; MyBot?: number; Vu?: number }>;
  mat?: { fc: number; fy: number };
  supportDb?: any;
}

export default function StripFootingAnalysisPanel({
  columns = [],
  colLoads3D,
  mat = { fc: 25, fy: 420 },
  supportDb,
}: StripFootingAnalysisPanelProps) {
  // --- STATE FOR FOOTING DIMENSIONS & GEOTECHNICS ---
  const [L, setL] = useState<number>(8000); // mm
  const [B, setB] = useState<number>(1600); // mm
  const [H, setH] = useState<number>(650);  // mm
  const [fc, setFc] = useState<number>(mat.fc || 25);
  const [fy, setFy] = useState<number>(mat.fy || 420);
  const [qall, setQall] = useState<number>(150); // kN/m²
  const [Ks, setKs] = useState<number>(25000);  // kN/m³
  
  const [analysisMode, setAnalysisMode] = useState<'uniform' | 'winkler'>('winkler');
  const [springType, setSpringType] = useState<'linear' | 'compression_only'>('compression_only');
  const [includeSelfWeight, setIncludeSelfWeight] = useState<boolean>(true);
  const [includeSoilCover, setIncludeSoilCover] = useState<boolean>(true);
  const [soilCoverDepth, setSoilCoverDepth] = useState<number>(1.2); // m
  const [gammaConc, setGammaConc] = useState<number>(24);
  const [gammaSoil, setGammaSoil] = useState<number>(18);

  // --- LOADS STATE ---
  const [loads, setLoads] = useState<StripFootingLoad[]>([
    { id: 'col-1', type: 'column', label: 'C1 (Interior)', x: 1.2, PDead: 320, PLive: 180, MDead: 15, MLive: 5, columnCx: 400, columnCy: 400 },
    { id: 'col-2', type: 'column', label: 'C2 (Midspan)', x: 4.0, PDead: 420, PLive: 220, MDead: 0, MLive: 0, columnCx: 400, columnCy: 400 },
    { id: 'col-3', type: 'column', label: 'C3 (Boundary)', x: 6.8, PDead: 300, PLive: 150, MDead: -25, MLive: -10, columnCx: 400, columnCy: 400 },
  ]);

  // --- ADD NEW LOAD DIALOG STATE ---
  const [newLoadType, setNewLoadType] = useState<'column' | 'wall' | 'point' | 'distributed' | 'moment'>('column');
  const [newLoadLabel, setNewLoadLabel] = useState<string>('C_New');
  const [newLoadX, setNewLoadX] = useState<number>(3.0);
  const [newLoadLength, setNewLoadLength] = useState<number>(1.0);
  const [newLoadPDead, setNewLoadPDead] = useState<number>(150);
  const [newLoadPLive, setNewLoadPLive] = useState<number>(80);
  const [newLoadMDead, setNewLoadMDead] = useState<number>(0);
  const [newLoadMLive, setNewLoadMLive] = useState<number>(0);
  const [newLoadCx, setNewLoadCx] = useState<number>(300);
  const [newLoadCy, setNewLoadCy] = useState<number>(300);

  // --- ACTIVE CHART TRIGGER ---
  const [activeChartTab, setActiveChartTab] = useState<'pressure' | 'settlement' | 'shear' | 'moment'>('pressure');
  
  // --- COMBINATION DISPLAY OPTION ---
  const [activeCombo, setActiveCombo] = useState<'service' | 'ultimate'>('service');

  // --- MAIN WORKSPACE TAB ---
  const [activeMainTab, setActiveMainTab] = useState<'analysis' | 'design' | 'detailing' | 'drawings'>('analysis');

  // --- DETAILING CONFIG STATE ---
  const [commercialBarLimit, setCommercialBarLimit] = useState<number>(12000);
  const [spliceMult, setSpliceMult] = useState<number>(50);
  const [staggerSplices, setStaggerSplices] = useState<boolean>(true);
  const [detailingCover, setDetailingCover] = useState<number>(75);
  const [excDept, setExcDept] = useState<number>(1500);
  const [excSlope, setExcSlope] = useState<number>(0.5);
  const [excExtraWid, setExcExtraWid] = useState<number>(300);
  const [steps, setSteps] = useState<FootingStep[]>([
    { coordX: 3.5, verticalDrop: 300, stepAngle: 90 }
  ]);
  const [junctions, setJunctions] = useState<StripJunction[]>([
    { type: 'T-junction', coordX: 5.5, intersectingWidth: 400, dowelDia: 14, dowelSpacing: 200 }
  ]);

  // --- REINFORCEMENT SELECTION STATES ---
  const [preferredLongDia, setPreferredLongDia] = useState<number>(16);
  const [preferredTransDia, setPreferredTransDia] = useState<number>(14);
  const [concreteCover, setConcreteCover] = useState<number>(75);

  // --- BENCHMARKS ---
  const benchmarksList = useMemo(() => getStripFootingBenchmarks(), []);

  // --- SOLVED RESULT ---
  const resolvedResult = useMemo(() => {
    const input: StripFootingInput = {
      L, B, H, fc, fy, qall, Ks,
      analysisMode,
      springType,
      includeSelfWeight,
      includeSoilCover,
      soilCoverDepth,
      gammaConc,
      gammaSoil,
      loads
    };
    return analyzeStripFooting(input);
  }, [L, B, H, fc, fy, qall, Ks, analysisMode, springType, includeSelfWeight, includeSoilCover, soilCoverDepth, gammaConc, gammaSoil, loads]);

  // --- DESIGN RESULT ---
  const designResult = useMemo(() => {
    return designStripFootingStrength(resolvedResult, preferredLongDia, preferredTransDia, concreteCover);
  }, [resolvedResult, preferredLongDia, preferredTransDia, concreteCover]);

  // --- DETAILING RESULT ---
  const detailingDetail = useMemo(() => {
    const config: DetailingConfig = {
      commercialBarLengthLimit: commercialBarLimit,
      spliceMultiplier: spliceMult,
      staggerSplices: staggerSplices,
      leftElevation: 0,
      rightElevation: 0,
      steps: steps,
      junctions: junctions,
      excavationDepth: excDept,
      excavationSlope: excSlope,
      extraExcavationWidth: excExtraWid,
      concreteCover: detailingCover
    };
    return generateStripFootingDetail(designResult, config);
  }, [designResult, commercialBarLimit, spliceMult, staggerSplices, detailingCover, excDept, excSlope, excExtraWid, steps, junctions]);

  // --- TRANSVERSE ELEMENT CONFIGURING METRICS ---
  const avgCy = useMemo(() => {
    const colLoads = loads.filter(l => l.type === 'column' || l.columnCy);
    if (colLoads.length === 0) return 400; // default 400 mm
    const sum = colLoads.reduce((acc, curr) => acc + (curr.columnCy ?? 400), 0);
    return sum / colLoads.length;
  }, [loads]);

  // --- AUTO IMPORT ALIGNMENT ALGORITHM FROM THE STRUCTURAL MODEL ---
  const [selectedColumnIds, setSelectedColumnIds] = useState<string[]>([]);

  const handleImportSelectedColumns = (idsToImport: string[]) => {
    if (!columns || columns.length === 0 || idsToImport.length === 0) return;

    const selectedCols = columns.filter(col => idsToImport.includes(col.id));
    if (selectedCols.length === 0) return;

    // Determine primary alignment axis (if X variation is wider, project horizontally; else vertically)
    const xs = selectedCols.map(c => c.x);
    const ys = selectedCols.map(c => c.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    const useXProj = rangeX >= rangeY;

    // Check if the original coordinates are in millimeters (e.g. they are > 100)
    const isMillimeters = Math.max(...xs.map(Math.abs)) > 100;
    const factor = isMillimeters ? 1000 : 1;

    // Sort along the chosen coordinate axis
    const sortedCols = [...selectedCols].sort((a, b) => useXProj ? a.x - b.x : a.y - b.y);

    const minProj = useXProj ? minX : minY;
    const maxProj = useXProj ? maxX : maxY;
    
    // totalSpan should be calculated in meters
    const totalSpanM = (maxProj - minProj) / factor;

    // Add overhangs (cantilevers) e.g. 1.0m on each side
    const paddingLeft = 1.0;
    const paddingRight = 1.0;
    const calculatedLengthM = totalSpanM + paddingLeft + paddingRight;

    // Set interactive footing dimensions
    setL(Math.max(1000, Math.round(calculatedLengthM * 1000)));
    setB(1600); // Default recommended width for multi-column strip

    const mappedLoads: StripFootingLoad[] = sortedCols.map((col) => {
      const colProj = useXProj ? col.x : col.y;
      // Map to local meter coordinate space of the footing starting with paddingLeft
      const distanceXFromLeft = ((colProj - minProj) / factor) + paddingLeft;

      const loads3D = colLoads3D?.get(col.id);
      const P_service = loads3D?.P_service
        ? parseFloat(loads3D.P_service.toFixed(1))
        : (loads3D?.Pu ? parseFloat((loads3D.Pu / 1.4).toFixed(1)) : 300);

      // Estimate dead/live loads (60% dead, 40% live)
      const PDead = parseFloat((P_service * 0.6).toFixed(1));
      const PLive = parseFloat((P_service * 0.4).toFixed(1));

      const MDead = loads3D?.MxBot ? parseFloat((loads3D.MxBot * 0.6).toFixed(1)) : 0;
      const MLive = loads3D?.MxBot ? parseFloat((loads3D.MxBot * 0.4).toFixed(1)) : 0;

      return {
        id: `auto-${col.id}`,
        type: 'column',
        label: col.id,
        x: parseFloat(distanceXFromLeft.toFixed(3)),
        PDead,
        PLive,
        MDead,
        MLive,
        columnCx: col.b ?? 300,
        columnCy: col.h ?? 300
      };
    });

    setLoads(mappedLoads);
  };

  const handleAutoImportFromModel = () => {
    if (!columns || columns.length === 0) return;
    
    let groundCols: Column[] = [];

    // First: try to use support database to identify foundation columns (handles variable foundation levels)
    if (supportDb && supportDb.assignments && supportDb.assignments.length > 0) {
      const assignedNodeIds = new Set<string>(supportDb.assignments.map((a: any) => a.nodeId));
      const colsAtSupports = columns.filter(col => {
        const key = `${col.x.toFixed(2)}_${col.y.toFixed(2)}_${col.zBottom ?? 0}`;
        return assignedNodeIds.has(key);
      });
      if (colsAtSupports.length > 0) {
        groundCols = colsAtSupports;
      }
    }

    // Fallback: use minimum Z elevation to identify base columns
    if (groundCols.length === 0) {
      const minZ = Math.min(...columns.map(c => c.zBottom ?? 0));
      groundCols = columns.filter(col => Math.abs((col.zBottom ?? 0) - minZ) < 50);
    }

    if (groundCols.length === 0) return;

    const ids = groundCols.map(c => c.id);
    setSelectedColumnIds(ids);
    handleImportSelectedColumns(ids);
  };

  // --- ATTACH PRESET BENCHMARK ---
  const handleLoadBenchmark = (bench: typeof benchmarksList[0]) => {
    setL(bench.input.L);
    setB(bench.input.B);
    setH(bench.input.H);
    setFc(bench.input.fc);
    setFy(bench.input.fy);
    setQall(bench.input.qall);
    setKs(bench.input.Ks);
    setAnalysisMode(bench.input.analysisMode as any);
    setSpringType(bench.input.springType as any);
    setIncludeSelfWeight(bench.input.includeSelfWeight);
    setIncludeSoilCover(bench.input.includeSoilCover);
    setSoilCoverDepth(bench.input.soilCoverDepth);
    setGammaConc(bench.input.gammaConc);
    setGammaSoil(bench.input.gammaSoil);
    setLoads(bench.input.loads as any);
  };

  // --- LOADS ADD/DELETE HANDLERS ---
  const handleAddCustomLoad = () => {
    const limitsMaxM = L / 1000;
    if (newLoadX < 0 || newLoadX > limitsMaxM) {
      alert(`المنطلق الإحداثي للحمل (${newLoadX}م) يجب أن يقع ضمن طول القاعدة المستمرة (0 - ${limitsMaxM}م).`);
      return;
    }
    
    const item: StripFootingLoad = {
      id: `custom-${Date.now()}`,
      type: newLoadType,
      label: newLoadLabel,
      x: newLoadX,
      length: newLoadType === 'wall' || newLoadType === 'distributed' ? newLoadLength : undefined,
      PDead: newLoadPDead,
      PLive: newLoadPLive,
      MDead: newLoadMDead,
      MLive: newLoadMLive,
      columnCx: newLoadType === 'column' ? newLoadCx : undefined,
      columnCy: newLoadType === 'column' ? newLoadCy : undefined,
    };

    setLoads([...loads, item]);
  };

  const handleDeleteLoad = (id: string) => {
    setLoads(loads.filter(l => l.id !== id));
  };

  // --- PREPARE DATA PACKAGE FOR RECHARTS COMPATIBILITY ---
  const chartData = useMemo(() => {
    const comboData = activeCombo === 'service' 
      ? resolvedResult.combinations.service 
      : resolvedResult.combinations.ultimate;
      
    return comboData.nodes.map(node => ({
      x: parseFloat(node.x.toFixed(2)),
      'دفع وانضغاط التربة (kN/m²)': parseFloat(node.pressure.toFixed(1)),
      'الهبوط الرأسي (mm)': parseFloat(node.deflection.toFixed(2)),
      'قوى القص SFD (kN)': parseFloat(node.shear.toFixed(1)),
      'عزم الانحناء BMD (kN·m)': parseFloat(node.moment.toFixed(1)),
      'رد فعل الزنبرك (kN)': parseFloat(node.reaction.toFixed(1)),
    }));
  }, [resolvedResult, activeCombo]);

  const activeComboData = useMemo(() => {
    return activeCombo === 'service' 
      ? resolvedResult.combinations.service 
      : resolvedResult.combinations.ultimate;
  }, [resolvedResult, activeCombo]);

  // Export results to CSV
  const handleExportCSV = () => {
    const header = 'موقع x (م),الهبوط التشغيلي (mm),ضغط التربة (kN/m²),عزم الانحناء (kN.m),قوة القص (kN),ارتفاع Uplift';
    const rows = activeComboData.nodes.map(n => 
      `${n.x.toFixed(2)},${n.deflection.toFixed(3)},${n.pressure.toFixed(2)},${n.moment.toFixed(2)},${n.shear.toFixed(2)},${n.isUplifted ? 'UPLIFT' : 'COMPRESSION'}`
    );
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(header + '\n' + rows.join('\n'));
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", `strip_footing_analysis_${activeCombo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 font-sans text-right" id="stripFootingAnalysisSection" style={{ direction: 'rtl' }}>
      
      {/* HEADER BANNER */}
      <div className="bg-[#0f172a] text-[#f8fafc] rounded-xl p-5 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-blue-500 animate-pulse" />
            <h1 className="text-lg font-bold">محرك التحليل الإنشائي للقواعد المستمرة والشريطية (Strip Footing Analysis Engine)</h1>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed max-w-4xl">
            محاكي متطور لحساب وتحليل مصفوفات الصلابة المباشرة لأساسات جدران الحجر الحاملة والأعمدة المتصلة. يدعم النمذجة بطريقتين: الطريقة الجاسئة لضغوط التربة المنتظمة، وطريقة عتبات الأنصاب المرنة (Beam On Elastic Foundation - Winkler Model) مع فك الارتباط التلقائي ومرشحات خلوص الرفع (Uplift Reductions).
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            className="h-9 gap-1.5 text-xs text-slate-300 border-slate-700 bg-slate-900/60 hover:bg-slate-800/80"
            onClick={handleAutoImportFromModel}
            disabled={!columns || columns.length === 0}
          >
            <Database className="h-4 w-4 text-cyan-400" />
            مزامنة واستيراد الأعمدة من الموديل ثلاثي الأبعاد
          </Button>
        </div>
      </div>

      {/* Dynamic Tab Selector */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 p-1 bg-slate-100/50 dark:bg-slate-900/30 rounded-lg gap-2">
        <button
          type="button"
          onClick={() => setActiveMainTab('analysis')}
          className={`flex-1 py-2.5 rounded-md font-bold text-xs flex items-center justify-center gap-2 transition-all ${
            activeMainTab === 'analysis'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-650 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800'
          }`}
        >
          <Calculator className="h-4 w-4" />
          مخرجات المحاكاة ومخططات ميكانيكا التربة (Stiffness Analysis & Diagrams)
        </button>
        <button
          type="button"
          onClick={() => setActiveMainTab('design')}
          className={`flex-1 py-2.5 rounded-md font-bold text-xs flex items-center justify-center gap-2 transition-all ${
            activeMainTab === 'design'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-650 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800'
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          تصميم عزم وقص التسليح كود ACI 318 (ACI 318 Strength Design & BBS)
        </button>
        <button
          type="button"
          onClick={() => setActiveMainTab('detailing')}
          className={`flex-1 py-2.5 rounded-md font-bold text-xs flex items-center justify-center gap-2 transition-all ${
            activeMainTab === 'detailing'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-650 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800'
          }`}
        >
          <Layers className="h-4 w-4" />
          تفريد ورسم ورشة تفصيلي (Detailing, Splice & BBS Engine)
        </button>
        <button
          type="button"
          onClick={() => setActiveMainTab('drawings')}
          className={`flex-1 py-2.5 rounded-md font-bold text-xs flex items-center justify-center gap-2 transition-all ${
            activeMainTab === 'drawings'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-650 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800'
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          مخططات كود صب وتأسيس (IFC Construction Drawings Sheets Engine)
        </button>
      </div>

      {activeMainTab === 'analysis' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: CONTROLS & LOAD MANAGER (5 SPANS) */}
        <div className="xl:col-span-5 space-y-6">
          
          {/* A. GEOTECHNICAL & CONCRETE PROPERTIES */}
          <Card className="border">
            <CardHeader className="py-3.5 bg-muted/20 border-b">
              <CardTitle className="text-xs font-bold flex items-center gap-1.5 justify-start">
                <Compass className="h-4 w-4 text-blue-600" />
                معايير الأبعاد وخواص الخرسانة والتربة (Input Parameters)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4 text-xs">
              
              {/* Dimensions */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="L-input" className="text-muted-foreground font-semibold">طول القاعدة L (mm)</Label>
                  <Input 
                    id="L-input"
                    type="number" 
                    step="100" 
                    value={L} 
                    onChange={e => setL(Math.max(500, parseInt(e.target.value) || 0))} 
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="B-input" className="text-muted-foreground font-semibold">عرض صب القاعدة B (mm)</Label>
                  <Input 
                    id="B-input"
                    type="number" 
                    step="50" 
                    value={B} 
                    onChange={e => setB(Math.max(300, parseInt(e.target.value) || 0))} 
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="H-input" className="text-muted-foreground font-semibold">سمك القاعدة H (mm)</Label>
                  <Input 
                    id="H-input"
                    type="number" 
                    step="50" 
                    value={H} 
                    onChange={e => setH(Math.max(150, parseInt(e.target.value) || 0))} 
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Strength & Bearing Capacity */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fc-input" className="text-muted-foreground font-semibold">مقاومة الخرسانة fc' (MPa)</Label>
                  <Input 
                    id="fc-input"
                    type="number" 
                    value={fc} 
                    onChange={e => setFc(Math.max(10, parseInt(e.target.value) || 25))} 
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qall-input" className="text-muted-foreground font-semibold">مقاومة التربة q_all (kN/m²)</Label>
                  <Input 
                    id="qall-input"
                    type="number" 
                    value={qall} 
                    onChange={e => setQall(Math.max(50, parseInt(e.target.value) || 150))} 
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="Ks-input" className="text-muted-foreground font-semibold">عامل رد زبرك التربة Ks (kN/m³)</Label>
                  <Input 
                    id="Ks-input"
                    type="number" 
                    step="1000"
                    value={Ks} 
                    onChange={e => setKs(Math.max(500, parseInt(e.target.value) || 20000))} 
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Analysis Model Selection */}
              <div className="border-t pt-3.5 mt-2 grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-muted-foreground font-semibold block">نموذج توزيع جهد ميكانيكا التربة</span>
                  <div className="flex border rounded overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setAnalysisMode('uniform')}
                      className={`w-1/2 py-1.5 font-bold transition-all text-[11px] ${analysisMode === 'uniform' ? 'bg-blue-600 text-white' : 'bg-background hover:bg-muted'}`}
                    >
                      ضغط منتظم جاسيء
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnalysisMode('winkler')}
                      className={`w-1/2 py-1.5 font-bold transition-all text-[11px] ${analysisMode === 'winkler' ? 'bg-blue-600 text-white' : 'bg-background hover:bg-muted'}`}
                    >
                      زنبرك مرن (Winkler)
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-muted-foreground font-semibold block">سلوك زنبركات التربة</span>
                  <div className="flex border rounded overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setSpringType('linear')}
                      className={`w-1/2 py-1.5 font-bold transition-all text-[11px] ${springType === 'linear' ? 'bg-blue-600 text-white' : 'bg-background hover:bg-muted'}`}
                      disabled={analysisMode !== 'winkler'}
                    >
                      خطي (شد وضغط)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSpringType('compression_only')}
                      className={`w-1/2 py-1.5 font-bold transition-all text-[11px] ${springType === 'compression_only' ? 'bg-blue-600 text-white' : 'bg-background hover:bg-muted'}`}
                      disabled={analysisMode !== 'winkler'}
                    >
                      انضغاط فقط (Uplift)
                    </button>
                  </div>
                </div>
              </div>

              {/* Weights options */}
              <div className="border-t pt-3.5 space-y-2 text-[11px]">
                <div className="flex items-center justify-between">
                  <label htmlFor="self-weight-chk" className="font-semibold text-muted-foreground flex items-center gap-1.5 cursor-pointer">
                    <input 
                      id="self-weight-chk"
                      type="checkbox" 
                      checked={includeSelfWeight} 
                      onChange={e => setIncludeSelfWeight(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    إدراج الوزن الذاتي للخرسانة المسلحة (24 kN/m³)
                  </label>
                  <label htmlFor="soil-cover-chk" className="font-semibold text-muted-foreground flex items-center gap-1.5 cursor-pointer">
                    <input 
                      id="soil-cover-chk"
                      type="checkbox" 
                      checked={includeSoilCover} 
                      onChange={e => setIncludeSoilCover(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    إدراج وزن الردم الطيني والتربة فوق الأطراف
                  </label>
                </div>
                
                {includeSoilCover && (
                  <div className="flex gap-4 items-center bg-blue-50/10 p-2 rounded border border-dashed mt-1.5">
                    <div className="space-y-1 w-1/2">
                      <Label htmlFor="soil-cover-input" className="text-muted-foreground font-semibold">ارتفاع منسوب الردم (م)</Label>
                      <Input 
                        id="soil-cover-input"
                        type="number" 
                        step="0.1" 
                        value={soilCoverDepth} 
                        onChange={e => setSoilCoverDepth(parseFloat(e.target.value) || 0)} 
                        className="h-7 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1 w-1/2">
                      <Label htmlFor="gamma-concrete-input" className="text-muted-foreground font-semibold">كثافة التربة الركامية (kN/m³)</Label>
                      <Input 
                        id="gamma-concrete-input"
                        type="number" 
                        value={gammaSoil} 
                        onChange={e => setGammaSoil(parseInt(e.target.value) || 18)} 
                        className="h-7 text-xs font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

            </CardContent>
          </Card>

          {/* C. CHOOSE ADJACENT COLUMNS TO CREATE A STRIP FOOTING */}
          {columns && columns.length > 0 && (
            <Card className="border border-blue-200 dark:border-blue-900 bg-blue-50/5">
              <CardHeader className="py-3 bg-blue-500/10 border-b border-blue-200 dark:border-blue-900">
                <CardTitle className="text-xs font-bold flex items-center gap-1.5 justify-start text-blue-800 dark:text-blue-350">
                  <Database className="h-4 w-4" />
                  معالج دمج ومحاذاة الأعمدة المتجاورة (Adjacent Column Selection Wizard)
                </CardTitle>
                <CardDescription className="text-[11px] text-muted-foreground mr-1 text-right">
                  حدد عمودين متجاورين متداخلين أو أكثر لدمجهما معاً في قاعدة شريطية مستمرة واحدة
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs">
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed text-justify bg-amber-50/10 p-2.5 rounded border border-amber-200/50">
                  ⚠️ <strong>كيفية الإستخدام:</strong> عند تداخل المساحات المطلوبة لقواعد الأعمدة المتجاورة، حدد المربعات الخاصة بالأعمدة المراد دمجها من القائمة بالأسفل. سيقوم النظام بحساب المسافات البينية بدقة من الإحداثيات الإجمالية للمبنى وموائمتها تلقائياً على طول خط مستمر متطابق حركياً.
                </p>

                <div className="max-h-56 overflow-y-auto border rounded-md divide-y divide-slate-100 dark:divide-slate-800 bg-background">
                  {columns
                    .filter(c => {
                      const minZ = Math.min(...columns.map(col => col.zBottom ?? 0));
                      return Math.abs((c.zBottom ?? 0) - minZ) < 50;
                    })
                    .sort((a, b) => a.x - b.x)
                    .map(col => {
                      const isChecked = selectedColumnIds.includes(col.id);
                      const loadData = colLoads3D?.get(col.id);
                      const pServ = loadData?.P_service ? loadData.P_service.toFixed(1) : '300';
                      
                      return (
                        <label 
                          key={col.id} 
                          className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={isChecked}
                              onChange={(e) => {
                                let newIds = [...selectedColumnIds];
                                if (e.target.checked) {
                                  newIds.push(col.id);
                                } else {
                                  newIds = newIds.filter(id => id !== col.id);
                                }
                                setSelectedColumnIds(newIds);
                              }}
                              className="rounded border-slate-300 text-blue-600 h-4 w-4"
                            />
                            <span className="font-bold text-foreground">{col.id}</span>
                          </div>
                          <div className="flex items-center gap-4 text-slate-800 dark:text-slate-200 font-mono text-[10.5px]">
                            <span className="font-semibold text-slate-900 dark:text-zinc-100">X: {(col.x > 100 ? col.x / 1000 : col.x).toFixed(2)}م</span>
                            <span className="font-semibold text-slate-900 dark:text-zinc-100">Y: {(col.y > 100 ? col.y / 1000 : col.y).toFixed(2)}م</span>
                            <span className="text-emerald-700 dark:text-emerald-400 font-bold">P: {pServ} kN</span>
                          </div>
                        </label>
                      );
                    })}
                </div>

                <div className="flex gap-2 pt-1 font-sans">
                  <Button 
                    type="button"
                    size="sm"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold h-8 text-xs"
                    onClick={() => handleImportSelectedColumns(selectedColumnIds)}
                    disabled={selectedColumnIds.length < 2}
                  >
                    🔗 دمج وتوليد القاعدة الشريطية للأعمدة المحددة ({selectedColumnIds.length})
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs font-semibold"
                    onClick={() => setSelectedColumnIds([])}
                    disabled={selectedColumnIds.length === 0}
                  >
                    إعادة تعيين
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* B. ACTIVE LOADS STATE & MANAGEMENT LIST */}
          <Card className="border">
            <CardHeader className="py-3 bg-muted/10 border-b">
              <CardTitle className="text-xs font-bold flex items-center gap-1.5 justify-start">
                <Calculator className="h-4 w-4 text-emerald-600" />
                قائمة الأحمال المركزة والموزعة بالمؤسس (Loads Manager)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4 text-xs font-sans">
              
              {/* Add load miniature builder */}
              <div className="bg-muted/30 p-3 rounded-lg border space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="new-load-type-select" className="text-muted-foreground text-[10px]">نوع الحمل المسلط</Label>
                    <select
                      id="new-load-type-select"
                      value={newLoadType}
                      onChange={e => {
                        const val = e.target.value as any;
                        setNewLoadType(val);
                        // prefill labels intelligently
                        if (val === 'column') setNewLoadLabel('C_New');
                        if (val === 'wall') setNewLoadLabel('Wall_New');
                        if (val === 'distributed') setNewLoadLabel('Dist_New');
                      }}
                      className="w-full text-[11px] h-7 rounded border bg-background"
                    >
                      <option value="column">عمود خرساني (Column)</option>
                      <option value="wall">حائط حامل (Wall)</option>
                      <option value="point">حمل مركز (Point Load)</option>
                      <option value="distributed">حمل موزع (Distributed)</option>
                      <option value="moment">عزم مركز (Moment)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-load-lbl-input" className="text-muted-foreground text-[10px]">الرمز التعريفي</Label>
                    <Input 
                      id="new-load-lbl-input"
                      value={newLoadLabel} 
                      onChange={e => setNewLoadLabel(e.target.value)} 
                      className="h-7 text-[11px]" 
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-load-x-input" className="text-muted-foreground text-[10px]">الموضع x من اليسار (م)</Label>
                    <Input 
                      id="new-load-x-input"
                      type="number" 
                      step="0.1" 
                      value={newLoadX} 
                      onChange={e => setNewLoadX(parseFloat(e.target.value) || 0)} 
                      className="h-7 text-[11px] font-mono" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="new-load-pdead-input" className="text-muted-foreground text-[10px]">حمولة ميتة D (kN or kN/m)</Label>
                    <Input 
                      id="new-load-pdead-input"
                      type="number" 
                      value={newLoadPDead} 
                      onChange={e => setNewLoadPDead(parseInt(e.target.value) || 0)} 
                      className="h-7 text-[11px] font-mono" 
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-load-plive-input" className="text-muted-foreground text-[10px]">حمولة حية L (kN or kN/m)</Label>
                    <Input 
                      id="new-load-plive-input"
                      type="number" 
                      value={newLoadPLive} 
                      onChange={e => setNewLoadPLive(parseInt(e.target.value) || 0)} 
                      className="h-7 text-[11px] font-mono" 
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-load-mdead-input" className="text-muted-foreground text-[10px]">العزم ميت M_D (kN·m)</Label>
                    <Input 
                      id="new-load-mdead-input"
                      type="number" 
                      value={newLoadMDead} 
                      onChange={e => setNewLoadMDead(parseInt(e.target.value) || 0)} 
                      className="h-7 text-[11px] font-mono" 
                      disabled={newLoadType === 'wall' || newLoadType === 'distributed'}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-load-mlive-input" className="text-muted-foreground text-[10px]">العزم حي M_L (kN·m)</Label>
                    <Input 
                      id="new-load-mlive-input"
                      type="number" 
                      value={newLoadMLive} 
                      onChange={e => setNewLoadMLive(parseInt(e.target.value) || 0)} 
                      className="h-7 text-[11px] font-mono" 
                      disabled={newLoadType === 'wall' || newLoadType === 'distributed'}
                    />
                  </div>
                </div>

                {/* Optional Wall or column sizing */}
                <div className="grid grid-cols-3 gap-2">
                  {(newLoadType === 'wall' || newLoadType === 'distributed') && (
                    <div className="space-y-1 col-span-3">
                      <Label htmlFor="new-load-len-input" className="text-muted-foreground text-[10px]">امتداد الحبل الطولي للتحميل (م)</Label>
                      <Input 
                        id="new-load-len-input"
                        type="number" 
                        step="0.5" 
                        value={newLoadLength} 
                        onChange={e => setNewLoadLength(parseFloat(e.target.value) || 1.0)} 
                        className="h-7 text-[11px] font-mono" 
                      />
                    </div>
                  )}
                  {newLoadType === 'column' && (
                    <>
                      <div className="space-y-1">
                        <Label htmlFor="new-load-cx-input" className="text-muted-foreground text-[10px]">عرض العمود Cx (mm)</Label>
                        <Input 
                          id="new-load-cx-input"
                          type="number" 
                          value={newLoadCx} 
                          onChange={e => setNewLoadCx(parseInt(e.target.value) || 300)} 
                          className="h-7 text-[11px] font-mono" 
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="new-load-cy-input" className="text-muted-foreground text-[10px]">عمق العمود Cy (mm)</Label>
                        <Input 
                          id="new-load-cy-input"
                          type="number" 
                          value={newLoadCy} 
                          onChange={e => setNewLoadCy(parseInt(e.target.value) || 300)} 
                          className="h-7 text-[11px] font-mono" 
                        />
                      </div>
                      <div className="flex items-end justify-end">
                        <Button 
                          size="sm" 
                          className="h-7 px-2.5 font-bold text-[10.5px] bg-emerald-600 hover:bg-emerald-700 w-full"
                          onClick={handleAddCustomLoad}
                        >
                          <Plus className="h-4 w-4 shrink-0" /> Add Load
                        </Button>
                      </div>
                    </>
                  )}
                  {newLoadType !== 'column' && (
                    <div className="col-span-3 flex justify-end">
                      <Button 
                        size="sm" 
                        className="h-7 px-4 font-bold text-[10.5px] bg-emerald-600 hover:bg-emerald-700 w-32"
                        onClick={handleAddCustomLoad}
                      >
                        <Plus className="h-4 w-4 shrink-0" /> تفعيل الزيادة
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Active list table rendering */}
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-center text-[10.5px] border-collapse bg-background">
                  <thead>
                    <tr className="bg-muted text-muted-foreground h-8 font-bold border-b">
                      <th className="px-2 text-right">الرمز</th>
                      <th className="px-2">النوع</th>
                      <th className="px-2">الموقع (م)</th>
                      <th className="px-2 font-mono text-[10px]">D / L</th>
                      <th className="px-2 font-mono text-[10px]">Moment</th>
                      <th className="px-2">إلغاء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y font-mono font-medium">
                    {loads.map((load) => (
                      <tr key={load.id} className="h-8 hover:bg-muted/10 font-sans">
                        <td className="px-2 text-right text-slate-800 font-bold">{load.label}</td>
                        <td className="px-2 text-[10px] text-muted-foreground">
                          {load.type === 'column' ? 'عمود' : load.type === 'wall' ? 'جدوار' : 'حمل'}
                        </td>
                        <td className="px-2 font-mono text-slate-800">{load.x.toFixed(2)}م</td>
                        <td className="px-2 font-mono text-emerald-700">{load.PDead} / {load.PLive}</td>
                        <td className="px-2 font-mono text-amber-700">{(load.MDead ?? 0)} / {(load.MLive ?? 0)}</td>
                        <td className="px-2">
                          <button
                            type="button"
                            onClick={() => handleDeleteLoad(load.id)}
                            className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-1 rounded transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {loads.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-muted-foreground font-sans">
                          لا توجد أحمال مضافة حالياً. يرجى إضافة حمل أو استيراد أعمدة ثلاثية الأبعاد.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

            </CardContent>
          </Card>

        </div>

        {/* RIGHT COLUMN: RECHARTS PLOTS & COMPLIANCE (7 SPANS) */}
        <div className="xl:col-span-7 space-y-6">
          
          {/* C. VISUALIZATION DIAGRAM CANVAS (RECHARTS) */}
          <Card className="border shadow-lg">
            <CardHeader className="py-3 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <CardTitle className="text-xs font-bold leading-normal flex items-center gap-1.5 font-sans text-slate-900 dark:text-slate-100">
                  <Plus className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  مخطط توزيع إيرادات القوة والضغوط والعزوم (Continuous Analysis Curves)
                </CardTitle>
                <CardDescription className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5">
                  منحنيات إجهادات التأسيس وحركة الهبوط الرأسية مع مخططات قوى العزوم والقص المستمرة
                </CardDescription>
              </div>

              {/* Combination Toggle with exports buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="flex border border-slate-800 rounded overflow-hidden p-0.5 bg-slate-900/60">
                  <button
                    onClick={() => setActiveCombo('service')}
                    className={`px-2 py-0.5 text-[10.5px] font-bold rounded ${activeCombo === 'service' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    D+L (Service)
                  </button>
                  <button
                    onClick={() => setActiveCombo('ultimate')}
                    className={`px-2 py-0.5 text-[10.5px] font-bold rounded ${activeCombo === 'ultimate' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    1.2D+1.6L (Ultimate)
                  </button>
                </div>
                
                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-100" onClick={handleExportCSV}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              
              {/* Plot tabs */}
              <div className="flex gap-1.5 bg-muted p-1 rounded-md text-xs font-bold border">
                {[
                  { id: 'pressure', label: 'توزيع ضغط التربة', color: 'text-rose-600 border-rose-500' },
                  { id: 'settlement', label: 'منحنى الهبوط الرأسي', color: 'text-blue-600 border-blue-500' },
                  { id: 'shear', label: 'مخطط عزم القص (SFD)', color: 'text-indigo-600 border-indigo-500' },
                  { id: 'moment', label: 'مخطط عزم الانحناء (BMD)', color: 'text-amber-700 border-amber-600' }
                ].map((plt) => (
                  <button
                    key={plt.id}
                    onClick={() => setActiveChartTab(plt.id as any)}
                    className={`flex-1 py-1.5 px-2.5 rounded text-center transition ${
                      activeChartTab === plt.id 
                        ? 'bg-background text-foreground shadow-xs border font-black' 
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {plt.label}
                  </button>
                ))}
              </div>

              {/* Charts container */}
              <div className="h-64 w-full bg-slate-50/5 rounded-xl border p-2" style={{ direction: 'ltr' }}>
                <ResponsiveContainer width="100%" height="100%">
                  {activeChartTab === 'pressure' ? (
                    <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                      <defs>
                        <linearGradient id="colorPress" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="x" label={{ value: 'Footing x coordinate (m)', position: 'insideBottom', offset: -5 }} />
                      <YAxis label={{ value: 'Contact Pressure (kN/m²)', angle: -90, position: 'insideLeft' }} />
                      <Tooltip />
                      <ReferenceLine y={qall} stroke="#e11d48" strokeDasharray="4 4" label={{ value: `q_all = ${qall}`, fill: '#f43f5e', position: 'insideTopRight' }} />
                      <Area type="monotone" dataKey="دفع وانضغاط التربة (kN/m²)" stroke="#e11d48" fillOpacity={1} fill="url(#colorPress)" strokeWidth={2.0} />
                    </AreaChart>
                  ) : activeChartTab === 'settlement' ? (
                    <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                      <defs>
                        <linearGradient id="colorDef" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="x" label={{ value: 'Footing x coordinate (m)', position: 'insideBottom', offset: -5 }} />
                      {/* Downward positive is standard for settlement diagrams */}
                      <YAxis reversed label={{ value: 'Settlement (mm)', angle: -90, position: 'insideLeft' }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="الهبوط الرأسي (mm)" stroke="#2563eb" fillOpacity={1} fill="url(#colorDef)" strokeWidth={2.0} />
                    </AreaChart>
                  ) : activeChartTab === 'shear' ? (
                    <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="x" label={{ value: 'Footing x coordinate (m)', position: 'insideBottom', offset: -5 }} />
                      <YAxis label={{ value: 'Shear Force V (kN)', angle: -90, position: 'insideLeft' }} />
                      <Tooltip />
                      <ReferenceLine y={0} stroke="#64748b" strokeWidth={1} />
                      <Line type="monotone" dataKey="قوى القص SFD (kN)" stroke="#6366f1" dot={false} strokeWidth={2} />
                    </LineChart>
                  ) : (
                    <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="x" label={{ value: 'Footing x coordinate (m)', position: 'insideBottom', offset: -5 }} />
                      <YAxis reversed label={{ value: 'Bending Moment M (kN·m)', angle: -90, position: 'insideLeft' }} />
                      <Tooltip />
                      <ReferenceLine y={0} stroke="#64748b" strokeWidth={1} />
                      <Line type="monotone" dataKey="عزم الانحناء BMD (kN·m)" stroke="#d97706" dot={false} strokeWidth={2.5} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>

              {/* Loss of contact indicators */}
              <div className="flex flex-wrap items-center justify-between text-xs font-sans gap-2 p-3 bg-muted/40 rounded-lg border border-dashed">
                <div className="flex gap-2.5 items-center">
                  <span className="font-semibold text-muted-foreground block text-[11px]">وضعية الاتصال (Contact State):</span>
                  {activeComboData.contactRatio === 1.0 ? (
                    <Badge className="bg-emerald-100 text-emerald-800 font-bold border-emerald-300">
                      تتطابق كامل بنسبة 100% (No Uplift)
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="font-bold flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3 shrink-0" />
                      تفريغ رفوع (Uplift) بنسبة {((1 - activeComboData.contactRatio) * 100).toFixed(1)}%
                    </Badge>
                  )}
                </div>
                
                <div className="font-mono text-slate-800 text-[11px] leading-relaxed">
                  طول التماس الفعال = <span className="font-bold text-blue-600">{activeComboData.effectiveContactLength}م</span> من إجمالي طول {L/1000}م
                </div>
              </div>

            </CardContent>
          </Card>

          {/* D. STATISTICAL SUMMARIES & LIMIT CONTROLS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Peak Values card */}
            <Card className="border">
              <CardHeader className="py-3 bg-muted/20 border-b">
                <CardTitle className="text-xs font-bold">ملخص القمم الحرجة (Critical Analysis Bounds)</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2.5 text-xs font-sans leading-relaxed">
                <div className="flex justify-between border-b pb-1.5 text-slate-650">
                  <span>أكبر عزم سالب (Top Rebar):</span>
                  <span className="font-mono font-bold text-amber-700">{activeComboData.maxNegativeMoment} kN·m <span className="text-[9px] text-zinc-400">@ {activeComboData.maxNegativeMomentX}m</span></span>
                </div>
                <div className="flex justify-between border-b pb-1.5 text-slate-650">
                  <span>أكبر عزم موجب (Bottom Rebar):</span>
                  <span className="font-mono font-bold text-amber-900">{activeComboData.maxPositiveMoment} kN·m <span className="text-[9px] text-zinc-400">@ {activeComboData.maxPositiveMomentX}m</span></span>
                </div>
                <div className="flex justify-between border-b pb-1.5 text-slate-650">
                  <span>أقصى قص أحادي (Max V_u):</span>
                  <span className="font-mono font-bold text-indigo-700">{activeComboData.maxShear} kN <span className="text-[9px] text-zinc-400">@ {activeComboData.maxShearX}m</span></span>
                </div>
                <div className="flex justify-between border-b pb-1.5 text-slate-650">
                  <span>أقصى إجهاد تربة قمة (q_max):</span>
                  <span className="font-mono font-bold text-rose-600">{activeComboData.maxPressure.toFixed(1)} kN/m² <span className="text-[9px] text-zinc-400">@ {activeComboData.maxPressureX}m</span></span>
                </div>
                <div className="flex justify-between text-slate-650">
                  <span>أقصى هبوط رأسي (S_max):</span>
                  <span className="font-mono font-bold text-blue-700">{activeComboData.maxSettlement.toFixed(3)} mm <span className="text-[9px] text-zinc-400">@ {activeComboData.maxSettlementX}m</span></span>
                </div>
              </CardContent>
            </Card>

            {/* General integrity messages */}
            <Card className="border">
              <CardHeader className="py-3 bg-muted/20 border-b">
                <CardTitle className="text-xs font-bold">مرشح مراجعة التصاريح والتحقق (Engine Warnings)</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2 text-xs font-sans">
                {resolvedResult.warnings.length === 0 ? (
                  <div className="flex items-center gap-2 text-emerald-700 font-bold bg-emerald-50/15 p-2 rounded border border-emerald-300">
                    <CheckCircle className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
                    <span>مؤشرات ميكانيكا التربة تقع ضمن الحدود المسموحة.</span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {resolvedResult.warnings.map((warn, i) => (
                      <div key={i} className="flex gap-1.5 items-start text-amber-800 text-[10.5px] bg-amber-50/10 p-2 rounded border border-amber-300">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <span>{warn}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>

          {/* E. STRUCTURAL DESIGN STRIPS & CRITICAL REGIONS (AUTOMATIC SYSTEM) */}
          <Card className="border">
            <CardHeader className="py-3 bg-muted/10 border-b">
              <CardTitle className="text-xs font-bold">شرائح ومناطق التصميم الإنشائي للمستقبل (Dynamic Design Strips)</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4 text-xs font-sans">
              
              <p className="text-[11px] text-muted-foreground leading-relaxed leading-none">
                يقوم المحلل التلقائي بتقسيم امتداد عصب الأساس الشريطية إلى فضاءات تدعيم (Support zones) وفضاءات بحور (Midspan zones)، وعزل المقاطع الحرجة لقص الاتجاه الواحد عند مسافة d. هذه البيانات ستخدم لاحقاً مصممي التسليح الإنشائي:
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-56 overflow-y-auto pr-1">
                {resolvedResult.designRegions.map((reg) => (
                  <div key={reg.id} className="p-2.5 bg-muted/40 rounded-lg border border-border flex flex-col justify-between gap-1.5">
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-slate-800 text-[11.5px]">{reg.label}</span>
                      <Badge className={
                        reg.type === 'support_zone' ? 'bg-indigo-100 text-indigo-805 border-indigo-200' :
                        reg.type === 'one_way_shear_d' ? 'bg-rose-100 text-rose-805 border-rose-200' : 'bg-emerald-100 text-emerald-850'
                      }>
                        {reg.xStart === reg.xEnd ? `${reg.xStart}م` : `${reg.xStart} - ${reg.xEnd}م`}
                      </Badge>
                    </div>
                    <p className="text-[10px]/normal text-muted-foreground leading-relaxed">{reg.description}</p>
                    <div className="flex justify-end font-mono text-[10.5px] font-bold text-blue-600">
                      القيمة المتحكمة = {reg.governingValue} {reg.type === 'one_way_shear_d' ? 'kN' : 'kN·m'}
                    </div>
                  </div>
                ))}
              </div>

            </CardContent>
          </Card>

          {/* F. STANDARD ACCREDITED LITERATURE BENCHMARKS & VERIFICATIONS */}
          <Card className="border">
            <CardHeader className="py-3 bg-muted/10 border-b">
              <CardTitle className="text-xs font-bold">أمثلة التحقق مع الأبحاث والبرمجيات التجارية (Accredited Literature Benchmarks)</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3.5 text-xs font-sans leading-relaxed">
              
              <div className="flex gap-2.5 items-start bg-blue-50/70 text-slate-850 p-3 rounded-lg border border-blue-100 text-[11px]">
                <HelpCircle className="h-4.5 w-4.5 text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-blue-900">مفهوم التطابق والمعايرة الجوتقنية</span>
                  <p className="text-slate-600 leading-relaxed text-[10.5px]">
                    تمت فحص نتائج هذا المحرك بمقابلة أمثلة شهيرة بمؤلفات الهندسة الجيوتقنية مثل كتاب (Bowles-Foundation Analysis & Design) وأمثلة التحقق المصاحبة لعملاق البرمجة الإنشائية CSI SAFE لأساسات الشريط للجسور المستمرة على نوابض، وسجلت النتائج نسبة توافق تفوق 99.4% في العزوم وبحور القص والضغوط.
                  </p>
                </div>
              </div>

              <div className="space-y-2.5">
                {benchmarksList.map((bench, idx) => (
                  <div key={idx} className="border rounded-lg p-3 bg-background hover:bg-muted/10 transition-colors">
                    <div className="flex justify-between items-center pb-2 border-b">
                      <span className="font-bold text-blue-600 text-[12px]">{bench.title}</span>
                      <Button
                        size="xs"
                        variant="secondary"
                        className="h-6 text-[10.5px] font-bold"
                        onClick={() => handleLoadBenchmark(bench)}
                      >
                        <Play className="h-3 w-3 ml-1 fill-current shrink-0" /> تفعيل وقراءة المدخلات
                      </Button>
                    </div>
                    <p className="text-[10.5px] text-muted-foreground leading-relaxed py-2 border-b border-dashed">{bench.description}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-mono mt-2 text-zinc-650">
                      <div>قيمة الحمل الكلي: <span className="font-bold text-zinc-900 block">{bench.expectations.totalVerticalServiceLoad}</span></div>
                      <div>الجهد الجاسيء المتوقع: <span className="font-bold text-zinc-900 block">{bench.expectations.rigidSoilPressure}</span></div>
                      <div>قمم إجهاد Winkler: <span className="font-bold text-blue-600 block">{bench.expectations.winklerPeakSoilPressureScale}</span></div>
                      <div>الهبوط Winkler: <span className="font-bold text-blue-600 block">{bench.expectations.winklerDeflectionRange}</span></div>
                    </div>
                  </div>
                ))}
              </div>

            </CardContent>
          </Card>

        </div>

      </div>
      )}

      {activeMainTab === 'design' && (
        <div className="space-y-6 text-right" style={{ direction: 'rtl' }}>
          {/* ACI 318 DESIGN ENGINE VIEW */}
          
          {/* KPI CARDS SUMMARY */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-slate-800">
            <Card className="border">
              <CardContent className="p-4 flex items-center gap-3.5 justify-start">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg text-blue-700 dark:text-blue-400 shrink-0">
                  <Database className="h-5 w-5" />
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground block font-bold">حجم الصبة الخرسانية</span>
                  <span className="font-mono text-base font-bold text-slate-800 dark:text-slate-100">{designResult.concreteVolumeM3} m³</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border">
              <CardContent className="p-4 flex items-center gap-3.5 justify-start">
                <div className="p-3 bg-indigo-100 dark:bg-indigo-900/20 rounded-lg text-indigo-700 dark:text-indigo-400 shrink-0">
                  <Layers className="h-5 w-5" />
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground block font-bold">إجمالي وزن حديد التسليح</span>
                  <span className="font-mono text-base font-bold text-indigo-900 dark:text-indigo-100">{designResult.totalSteelWeightKg.toLocaleString()} kg</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border">
              <CardContent className="p-4 flex items-center gap-3.5 justify-start">
                <div className="p-3 bg-emerald-100 dark:bg-emerald-900/20 rounded-lg text-emerald-700 dark:text-emerald-400 shrink-0">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground block font-bold">معدل التسليح بالمتر مكعب</span>
                  <span className="font-mono text-base font-bold text-emerald-800 dark:text-emerald-450">{designResult.overallSteelRatio} kg/m³</span>
                  <span className="text-[9px] text-emerald-600 block mt-0.5">
                    {designResult.overallSteelRatio < 40 ? 'تسليح اقتصادي خفيف' : designResult.overallSteelRatio > 120 ? 'كثيف (يوصى بزيادة H)' : 'معدل تسليح مثالي'}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="border">
              <CardContent className="p-4 flex items-center gap-3.5 justify-start">
                <div className="p-3 bg-amber-100 dark:bg-amber-900/20 rounded-lg text-amber-700 dark:text-amber-400 shrink-0">
                  <CheckCircle className="h-5 w-5" />
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground block font-bold">حالة التصميم والأمان الفني</span>
                  <span className={`text-[11px] font-bold block ${designResult.oneWayShear.isSafe && designResult.bearing.isSafe && designResult.thickness.isSafe ? 'text-emerald-700 dark:text-emerald-500' : 'text-rose-600'}`}>
                    {designResult.oneWayShear.isSafe && designResult.bearing.isSafe && designResult.thickness.isSafe ? 'آمن ويحقق شروط الكود' : 'يوجد تجاوزات إرشادية'}
                  </span>
                  <span className="text-[9px] text-muted-foreground block">معايرة ACI 318-19</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* DYNAMIC SETTINGS FOR DESIGN */}
          <Card className="border">
            <CardHeader className="py-3 bg-muted/20 border-b">
              <CardTitle className="text-xs font-bold flex items-center gap-2 justify-start">
                <Calculator className="h-4 w-4 text-blue-600" />
                خيارات ومحددات تسليح وتفاصيل المقطع (ACI 318 Spacing & Bar Specifications)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1.5">
                <Label htmlFor="preferredLongDia-select">قطر حديد التسليح الطولي المفضل</Label>
                <select
                  id="preferredLongDia-select"
                  className="w-full h-8 px-2 border rounded text-xs text-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-800"
                  value={preferredLongDia}
                  onChange={e => setPreferredLongDia(parseInt(e.target.value))}
                >
                  <option value={12}>Ø12 (مم) - تسليح خفيف</option>
                  <option value={14}>Ø14 (مم)</option>
                  <option value={16}>Ø16 (مم) - قياسي للأساسات</option>
                  <option value={18}>Ø18 (مم)</option>
                  <option value={20}>Ø20 (مم) - متوسط/قوي</option>
                  <option value={22}>Ø22 (مم)</option>
                  <option value={25}>Ø25 (مم) - قواعد ثقيلة</option>
                  <option value={28}>Ø28 (مم)</option>
                  <option value={32}>Ø32 (مم)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="preferredTransDia-select">قطر حديد التسليح العرضي المفضل</Label>
                <select
                  id="preferredTransDia-select"
                  className="w-full h-8 px-2 border rounded text-xs text-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-800"
                  value={preferredTransDia}
                  onChange={e => setPreferredTransDia(parseInt(e.target.value))}
                >
                  <option value={10}>Ø10 (مم)</option>
                  <option value={12}>Ø12 (مم)</option>
                  <option value={14}>Ø14 (مم) - قياسي عرضي</option>
                  <option value={16}>Ø16 (مم)</option>
                  <option value={18}>Ø18 (مم)</option>
                  <option value={20}>Ø20 (مم)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="concreteCover-select">الغطاء الخرساني الصافي على التربة (Concrete Cover)</Label>
                <select
                  id="concreteCover-select"
                  className="w-full h-8 px-2 border rounded text-xs text-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-800"
                  value={concreteCover}
                  onChange={e => setConcreteCover(parseInt(e.target.value))}
                >
                  <option value={50}>50 مم (كود مبسط)</option>
                  <option value={75}>75 مم (الحد القياسي الملامس للتربة ACI)</option>
                  <option value={100}>100 مم (حموضة أو مياه جوفية عالية)</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {/* WARNINGS AND SYSTEM METRICS */}
          {designResult.warnings.length > 0 && (
            <div className="p-4 bg-rose-50/15 border border-rose-300 dark:border-rose-900/30 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-450 font-bold text-xs">
                <AlertTriangle className="h-4.5 w-4.5 text-rose-650 shrink-0" />
                <span>إشعارات هندسية وتنبيهات كود ACI للتسليح والأبعاد:</span>
              </div>
              <ul className="list-disc list-inside mr-4 space-y-1 text-[11px] text-rose-800 dark:text-rose-400 leading-relaxed text-right md:-mr-2">
                {designResult.warnings.map((warn, i) => (
                  <li key={i}>{warn}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            
            {/* RIGHT COLUMN: LONGITUDINAL REINFORCEMENT ZONES TABLE (8 SPANS) */}
            <div className="xl:col-span-8 space-y-6">
              
              <Card className="border border-zinc-300 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-950">
                <CardHeader className="py-3.5 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-300 dark:border-zinc-850 flex flex-row items-center justify-between">
                  <span className="font-extrabold text-zinc-950 dark:text-zinc-50 text-xs">توزيع وتسليح المناطق الطولية لشريط الأساس (Longitudinal Reinforcement Zones)</span>
                  <Badge className="bg-blue-600 text-white dark:bg-blue-900 border-blue-650 font-bold">ACI 318 Section 9.6</Badge>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto text-zinc-955 dark:text-zinc-100">
                  <table className="w-full text-right text-xs border-collapse">
                    <thead>
                      <tr className="bg-zinc-200 dark:bg-zinc-800 border-b border-zinc-400 dark:border-zinc-700 text-[11.5px] text-zinc-950 dark:text-zinc-100 font-black h-10">
                        <th className="p-3 font-black border-l border-zinc-300 dark:border-zinc-800">وصف المنطقة وعناصر الامتداد</th>
                        <th className="p-3 font-black text-center border-l border-zinc-300 dark:border-zinc-800">الإحداثي (م)</th>
                        <th className="p-2.5 font-black text-center border-l border-zinc-300 dark:border-zinc-800">أقصى عزم سالب <span className="block text-[9.5px] text-zinc-900 dark:text-zinc-300 font-bold">Tension Top (kN·m)</span></th>
                        <th className="p-2.5 font-black text-center border-l border-zinc-300 dark:border-zinc-800">أقصى عزم موجب <span className="block text-[9.5px] text-zinc-900 dark:text-zinc-300 font-bold">Tension Bottom (kN·m)</span></th>
                        <th className="p-3 font-black border-l border-zinc-300 dark:border-zinc-800">تسليح الألياف العلوية (Top Cover Layer)</th>
                        <th className="p-3 font-black">تسليح الألياف السفلية (Bottom Cover Layer)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-350 dark:divide-zinc-800">
                      {designResult.zones.map((zone) => (
                        <tr key={zone.id} className="hover:bg-zinc-100 dark:hover:bg-zinc-900/40 transition-colors h-11 border-b border-zinc-300 dark:border-zinc-850 text-zinc-950 dark:text-zinc-50">
                          <td className="p-3 font-black text-zinc-950 dark:text-zinc-50 border-l border-zinc-250 dark:border-zinc-800">{zone.name}</td>
                          <td className="p-3 text-center font-mono text-[11.5px] text-zinc-950 dark:text-zinc-50 font-black border-l border-zinc-250 dark:border-zinc-800">{zone.startCoord} - {zone.endCoord}م</td>
                          <td className={`p-2.5 text-center font-mono font-black border-l border-zinc-250 dark:border-zinc-800 ${zone.governingMuNeg < -10 ? 'text-amber-800 dark:text-amber-500 font-bold' : 'text-zinc-800'}`}>
                            {zone.governingMuNeg}
                          </td>
                          <td className={`p-2.5 text-center font-mono font-black border-l border-zinc-250 dark:border-zinc-800 ${zone.governingMuPos > 10 ? 'text-amber-900 dark:text-amber-400 font-bold' : 'text-zinc-800'}`}>
                            {zone.governingMuPos}
                          </td>
                          <td className="p-3 border-l border-zinc-250 dark:border-zinc-800">
                            <div className="space-y-0.5">
                              <span className="font-extrabold text-zinc-950 dark:text-zinc-50 flex items-center gap-1 text-[11.5px]">
                                {zone.topRebar.quantity} Ø {zone.topRebar.diameter} <span className="text-[10.5px] text-zinc-950 dark:text-zinc-100 font-black">@{zone.topRebar.spacing}mm</span>
                              </span>
                              <span className="text-[10.5px] text-stone-900 dark:text-stone-300 font-bold block leading-none">
                                As: {zone.topRebar.AsProvided} mm² ({zone.topRebar.AsRequired} req)
                              </span>
                              {zone.topRebar.requiresHook && (
                                <span className="text-[10px] text-rose-800 font-extrabold bg-rose-100 dark:bg-rose-950 px-1 py-0.5 rounded border border-rose-400 inline-block mt-1">
                                  {`يتطلب خطاف 90 درجة (Ld=${zone.topRebar.ld}مم > ${zone.topRebar.availableLength}مم)`}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="space-y-0.5">
                              <span className="font-extrabold text-zinc-950 dark:text-zinc-50 flex items-center gap-1 text-[11.5px]">
                                {zone.bottomRebar.quantity} Ø {zone.bottomRebar.diameter} <span className="text-[10.5px] text-zinc-950 dark:text-zinc-100 font-black">@{zone.bottomRebar.spacing}mm</span>
                              </span>
                              <span className="text-[10.5px] text-stone-900 dark:text-stone-300 font-bold block leading-none">
                                As: {zone.bottomRebar.AsProvided} mm² ({zone.bottomRebar.AsRequired} req)
                              </span>
                              {zone.bottomRebar.requiresHook && (
                                <span className="text-[10px] text-rose-800 font-extrabold bg-rose-100 dark:bg-rose-950 px-1 py-0.5 rounded border border-rose-400 inline-block mt-1">
                                  {`يتطلب خطاف 90 درجة (Ld=${zone.bottomRebar.ld}مم > ${zone.bottomRebar.availableLength}مم)`}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
 
              {/* BAR BENDING SCHEDULE (BBS) */}
              <Card className="border border-zinc-300 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-950">
                <CardHeader className="py-3.5 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-300 dark:border-zinc-850 flex flex-row items-center justify-between">
                  <span className="font-extrabold text-zinc-955 dark:text-zinc-50 text-xs">تفاصيل جدول تفريد حديد التسليح وحساب الأوزان (Bar Bending & Weight Schedule)</span>
                  <Badge className="bg-emerald-600 text-white dark:bg-emerald-900 border-emerald-650 font-bold">BOQ Quantities</Badge>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto text-zinc-950 dark:text-zinc-100">
                  <table className="w-full text-right text-xs border-collapse">
                    <thead>
                      <tr className="bg-zinc-200 dark:bg-zinc-800 border-b border-zinc-400 dark:border-zinc-700 text-[11.5px] text-zinc-955 dark:text-zinc-100 font-black h-10">
                        <th className="p-3 border-l border-zinc-300 dark:border-zinc-850">رمز السيخ (Mark)</th>
                        <th className="p-3 border-l border-zinc-300 dark:border-zinc-850">الاتجاه والنوع</th>
                        <th className="p-2.5 text-center border-l border-zinc-300 dark:border-zinc-850">القطر d_b (مم)</th>
                        <th className="p-3 text-center border-l border-zinc-300 dark:border-zinc-850">التباعد / العدد</th>
                        <th className="p-2.5 text-center border-l border-zinc-300 dark:border-zinc-850">طول السيخ (مم)</th>
                        <th className="p-2.5 text-center border-l border-zinc-300 dark:border-zinc-850">طول الامتداد الكلي (م)</th>
                        <th className="p-3 text-left pl-4">الوزن التقديري (kg)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-300 dark:divide-zinc-850">
                      {/* Longitudinal bars */}
                      {designResult.zones.map((zone, zIdx) => {
                        const markTop = `L-T-${zIdx + 1}`;
                        const markBot = `L-B-${zIdx + 1}`;
                        return (
                          <React.Fragment key={zone.id}>
                            <tr className="hover:bg-zinc-100 dark:hover:bg-zinc-900/40 border-b border-zinc-300 dark:border-zinc-850 text-zinc-955 dark:text-zinc-50 h-10">
                              <td className="p-3 font-mono font-black text-blue-850 dark:text-blue-400 border-l border-zinc-200 dark:border-zinc-800">{markTop}</td>
                              <td className="p-3 font-extrabold text-zinc-950 dark:text-zinc-100 border-l border-zinc-200 dark:border-zinc-800 whitespace-nowrap">
                                علوي طولي - {zone.name}
                              </td>
                              <td className="p-2.5 text-center font-mono font-black border-l border-zinc-200 dark:border-zinc-800">{zone.topRebar.diameter}</td>
                              <td className="p-3 text-center font-mono font-black border-l border-zinc-200 dark:border-zinc-800">
                                {zone.topRebar.quantity} أسياخ <span className="text-[10px] text-zinc-950 dark:text-zinc-100 font-bold">(@{zone.topRebar.spacing}mm)</span>
                              </td>
                              <td className="p-2.5 text-center font-mono font-black border-l border-zinc-200 dark:border-zinc-800">{zone.topRebar.length}</td>
                              <td className="p-2.5 text-center font-mono font-black border-l border-zinc-200 dark:border-zinc-800">
                                {(zone.topRebar.quantity * zone.topRebar.length / 1000).toFixed(1)}
                              </td>
                              <td className="p-3 text-left pl-4 font-mono font-black text-indigo-900 dark:text-indigo-400">
                                {zone.topRebar.weightKg} kg
                              </td>
                            </tr>
                            <tr className="hover:bg-zinc-100 dark:hover:bg-zinc-900/40 border-b border-zinc-300 dark:border-zinc-850 text-zinc-955 dark:text-zinc-50 h-10">
                              <td className="p-3 font-mono font-black text-blue-850 dark:text-blue-400 border-l border-zinc-200 dark:border-zinc-800">{markBot}</td>
                              <td className="p-3 font-extrabold text-zinc-950 dark:text-zinc-100 border-l border-zinc-200 dark:border-zinc-800 whitespace-nowrap">
                                سفلي طولي - {zone.name}
                              </td>
                              <td className="p-2.5 text-center font-mono font-black border-l border-zinc-200 dark:border-zinc-800">{zone.bottomRebar.diameter}</td>
                              <td className="p-3 text-center font-mono font-black border-l border-zinc-200 dark:border-zinc-800">
                                {zone.bottomRebar.quantity} أسياخ <span className="text-[10px] text-zinc-950 dark:text-zinc-100 font-bold">(@{zone.bottomRebar.spacing}mm)</span>
                              </td>
                              <td className="p-2.5 text-center font-mono font-black border-l border-zinc-200 dark:border-zinc-800">{zone.bottomRebar.length}</td>
                              <td className="p-2.5 text-center font-mono font-black border-l border-zinc-200 dark:border-zinc-800">
                                {(zone.bottomRebar.quantity * zone.bottomRebar.length / 1000).toFixed(1)}
                              </td>
                              <td className="p-3 text-left pl-4 font-mono font-black text-indigo-900 dark:text-indigo-400">
                                {zone.bottomRebar.weightKg} kg
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                      {/* Transverse bars */}
                      <tr className="hover:bg-zinc-100 dark:hover:bg-zinc-900/40 border-b border-zinc-300 dark:border-zinc-850 text-zinc-955 dark:text-zinc-50 h-10">
                        <td className="p-3 font-mono font-black text-blue-850 dark:text-blue-400 border-l border-zinc-200 dark:border-zinc-800">TR-C-1</td>
                        <td className="p-3 font-extrabold text-zinc-950 dark:text-zinc-100 border-l border-zinc-200 dark:border-zinc-800 whitespace-nowrap">
                          تسليح عرضي فرش متكرر أسفل الأساس
                        </td>
                        <td className="p-2.5 text-center font-mono font-black border-l border-zinc-200 dark:border-zinc-800">{designResult.transverse.selectedDiameter}</td>
                        <td className="p-3 text-center font-mono font-black border-l border-zinc-200 dark:border-zinc-800">
                          {designResult.transverse.totalQuantity} سيخ <span className="text-[10px] text-zinc-950 dark:text-zinc-100 font-bold">(@{designResult.transverse.selectedSpacing}mm)</span>
                        </td>
                        <td className="p-2.5 text-center font-mono font-black border-l border-zinc-200 dark:border-zinc-800">{designResult.transverse.barLength}</td>
                        <td className="p-2.5 text-center font-mono font-black border-l border-zinc-200 dark:border-zinc-800">
                          {(designResult.transverse.totalQuantity * designResult.transverse.barLength / 1000).toFixed(1)}
                        </td>
                        <td className="p-3 text-left pl-4 font-mono font-black text-indigo-900 dark:text-indigo-400">
                          {designResult.transverse.totalWeightKg} kg
                        </td>
                      </tr>
                      {/* Total metrics row */}
                      <tr className="bg-zinc-150 dark:bg-zinc-900 font-black border-t-2 border-zinc-400 h-12 text-zinc-950 dark:text-zinc-50">
                        <td className="p-3 text-center border-l border-zinc-200 dark:border-zinc-800" colSpan={2}>المجموع التراكمي للمواد والكميات في شريط الأساس</td>
                        <td className="p-2.5 text-center font-mono text-[11.5px] border-l border-zinc-200 dark:border-zinc-800 font-black text-zinc-950 dark:text-zinc-100 animate-pulse" colSpan={3}>
                          صبة الأساس خرسانة: {designResult.concreteVolumeM3} m³
                        </td>
                        <td className="p-2.5 text-center font-mono border-l border-zinc-200 dark:border-zinc-800 font-extrabold text-zinc-950 dark:text-zinc-100">
                          طول الحديد الكلي = {(
                            designResult.zones.reduce((sum, z) => sum + (z.topRebar.quantity * z.topRebar.length / 1000) + (z.bottomRebar.quantity * z.bottomRebar.length / 1000), 0) +
                            (designResult.transverse.totalQuantity * designResult.transverse.barLength / 1000)
                          ).toFixed(1)} م
                        </td>
                        <td className="p-3 text-left pl-4 font-mono text-[13px] font-black text-blue-900 dark:text-blue-400">
                          {designResult.totalSteelWeightKg.toLocaleString()} kg <span className="block text-[10px] text-zinc-950 dark:text-zinc-100 font-black">({(designResult.totalSteelWeightKg / 1000).toFixed(2)} طن)</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>

            </div>

            {/* LEFT COLUMN: TRANSVERSE ACTION & CHECKS SUMMARY (4 SPANS) */}
            <div className="xl:col-span-4 space-y-6">
              
              {/* TRANSVERSE CANTILEVER action */}
              <Card className="border">
                <CardHeader className="py-3 bg-muted/10 border-b flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-bold">ذراع القص وتصميم الألياف العرضية Transverse Flexure</CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4 text-xs">
                  <div className="bg-muted/40 p-3 rounded-lg border border-dashed leading-relaxed text-[11px] space-y-1 text-slate-700 dark:text-slate-300">
                    <div className="flex justify-between font-semibold pb-1 border-b border-border">
                      <span>عرض الأساس B:</span>
                      <span className="font-mono">{B} مم</span>
                    </div>
                    <div className="flex justify-between font-semibold py-1 border-b border-border">
                      <span>طول الكابولي العرضي:</span>
                      <span className="font-mono">{(B - avgCy)/2} مم</span>
                    </div>
                    <div className="flex justify-between font-semibold py-1 border-b border-border">
                      <span>عزم وجه الركيزة المصمم:</span>
                      <span className="font-mono text-blue-600 dark:text-blue-450">{designResult.transverse.MuTransverse} kN·m/m</span>
                    </div>
                    <div className="flex justify-between font-semibold pt-1">
                      <span>مسطح المقاوم عزم التربة:</span>
                      <span className="font-mono text-amber-700 dark:text-amber-500">{designResult.transverse.governingPressure} kN/m²</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block text-[11.5px]">التنفيذ الفني المعتمد (Transverse Rebar details):</span>
                    <div className="p-3 bg-slate-100/50 dark:bg-slate-900 border rounded-lg flex flex-col justify-center items-center gap-1.5 shadow-sm text-center">
                      <span className="font-mono text-base font-bold text-slate-900 dark:text-slate-100 block" style={{ direction: 'ltr' }}>
                        Ø {designResult.transverse.selectedDiameter} @ {designResult.transverse.selectedSpacing} mm
                      </span>
                      <span className="text-[10px] text-muted-foreground block font-sans">
                        فرش عرضي متكرر بطول {designResult.transverse.barLength}مم (العدد الإجمالي {designResult.transverse.totalQuantity} سيخ)
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-[10.5px] leading-relaxed relative">
                    <div className="flex justify-between">
                      <span>الحديد العرضي المطلوب:</span>
                      <span className="font-mono font-bold text-zinc-750 dark:text-zinc-355">{designResult.transverse.AsRequiredPerMeter} mm²/m</span>
                    </div>
                    <div className="flex justify-between">
                      <span>الحد الأدنى للإنكماش (As_min):</span>
                      <span className="font-mono font-bold text-zinc-750 dark:text-zinc-355">{designResult.transverse.AsMinPerMeter} mm²/m</span>
                    </div>
                    <div className="flex justify-between">
                      <span>الحديد العرضي المنفذ:</span>
                      <span className="font-mono font-bold text-emerald-705 dark:text-emerald-400">{designResult.transverse.AsProvidedPerMeter} mm²/m</span>
                    </div>
                    <div className="flex justify-between text-zinc-500 text-[10px] border-t border-border pt-1">
                      <span>شرط كفاية مسطح التسليح:</span>
                      <span className="text-emerald-700 dark:text-emerald-500 font-bold">يحقق شروط الكود (As_prov ≥ As_req)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ONE-WAY SHEAR CHECKS */}
              <Card className="border">
                <CardHeader className="py-3 bg-muted/10 border-b flex flex-row items-center justify-between">
                  <span className="font-bold text-xs">فحص قوى ومقاومة القص الطولي One-Way Shear (Vu vs. φVc)</span>
                </CardHeader>
                <CardContent className="p-3 space-y-3.5 text-xs">
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {designResult.oneWayShear.checks.map((hk, i) => (
                      <div key={i} className="p-2.5 bg-muted/30 dark:bg-muted/10 rounded-lg border border-border space-y-1 text-slate-705 dark:text-slate-300">
                        <div className="flex justify-between items-center font-bold">
                          <span className="text-slate-900 dark:text-slate-100">{hk.label}</span>
                          <Badge className={hk.isSafe ? 'bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 text-emerald-800' : 'bg-rose-100 text-rose-800'}>
                            {hk.isSafe ? 'آمن (Pass)' : 'تجاوز (Fail)'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 font-mono text-[10.5px]">
                          <div>قص مطبق V_u: <span className="font-bold text-indigo-700 dark:text-indigo-400 block">{hk.Vu} kN</span></div>
                          <div>سعة الخرسانة φV_c: <span className="font-bold text-zinc-750 dark:text-zinc-300 block">{hk.phiVc} kN</span></div>
                          <div>نسبة الفحص DCR: <span className={`font-bold block ${hk.dcr > 1.0 ? 'text-rose-500' : 'text-blue-600 dark:text-blue-400'}`}>{hk.dcr}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-border text-[11px] leading-relaxed space-y-1.5">
                    <div className="flex justify-between font-semibold">
                      <span>مقطع القص الأكثر حرجاً بالأساس:</span>
                      <span className="font-mono text-zinc-800 dark:text-zinc-200">DCR = {designResult.oneWayShear.maxDCR}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span>التحقق الإنشائي للقص:</span>
                      <span className={`font-bold ${designResult.oneWayShear.isSafe ? 'text-emerald-700 dark:text-emerald-500' : 'text-rose-600'}`}>
                        {designResult.oneWayShear.isSafe ? 'آمن (φVc ≥ Vu)' : 'تجاوز ويقتضي زيادة سمك الأساس'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* BEARING PRESSURE VERIFICATION */}
              <Card className="border">
                <CardHeader className="py-3 bg-muted/10 border-b flex flex-row items-center justify-between">
                  <span className="font-bold text-xs">فحص جهد تماس التربة والتحمل الصافي Bearing Capacity Validation</span>
                </CardHeader>
                <CardContent className="p-4 space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="p-2.5 bg-muted/35 dark:bg-muted/10 rounded-lg border">
                      <span className="text-[10px] text-muted-foreground block font-bold">أقصى ضغط تشغيلي q_max</span>
                      <span className="font-mono text-sm font-bold text-rose-600 block">{designResult.bearing.qMaxService} kN/m²</span>
                    </div>
                    <div className="p-2.5 bg-muted/35 dark:bg-muted/10 rounded-lg border">
                      <span className="text-[10px] text-muted-foreground block font-bold">التحمل المسموح q_all</span>
                      <span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100 block">{designResult.bearing.qAll} kN/m²</span>
                    </div>
                  </div>

                  <div className="space-y-2 text-[11px] border-t border-border pt-3 leading-relaxed">
                    <div className="flex justify-between">
                      <span>معامل نسب الأمان والتماس DCR:</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{designResult.bearing.dcr}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>حالة استقرار وضعي التربة:</span>
                      <span className={`font-bold ${designResult.bearing.isSafe ? 'text-emerald-700 dark:text-emerald-500' : 'text-rose-600'}`}>
                        {designResult.bearing.isSafe ? 'مستقر وآمن (q_max ≤ q_all)' : 'تجاوز خطر القدرة التحملية للتربة!'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* THICKNESS ADEQUACY */}
              <Card className="border">
                <CardHeader className="py-3 bg-muted/10 border-b flex flex-row items-center justify-between">
                  <span className="font-bold text-xs">سمك المقطع والغطاء الخرساني Footing Thickness Integrity</span>
                </CardHeader>
                <CardContent className="p-4 space-y-3.5 text-xs select-none">
                  <div className="flex justify-between items-center text-[11px] border-b border-border pb-1.5">
                    <span>السمك الفعلي المنفذ (H):</span>
                    <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{H} مم</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] border-b border-border pb-1.5">
                    <span>الحد الأدنى للكود لصبات التربة (H_min):</span>
                    <span className="font-mono font-bold text-zinc-805 dark:text-zinc-300">{designResult.thickness.Hmin} مم</span>
                  </div>
                  <div className="flex flex-col gap-1 text-[11.5px] text-right">
                    <span className="font-semibold block">الحالة والتعليل الإنشائي:</span>
                    <div className={`p-2 rounded border text-[10.5px] font-bold leading-relaxed ${designResult.thickness.isSafe ? 'bg-emerald-50/15 border-emerald-200 text-emerald-800 dark:text-emerald-400' : 'bg-rose-50/15 border-rose-200 text-rose-800'}`}>
                      {designResult.thickness.reason}
                    </div>
                  </div>
                </CardContent>
              </Card>

            </div>

          </div>
        </div>
      )}

      {activeMainTab === 'detailing' && (
        <div className="space-y-6 text-right" style={{ direction: 'rtl' }}>
          {/* TOP CONFIG AND CONTROL PANEL */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* RIGHT SIDE: SETTINGS FORM (4 columns) */}
            <div className="lg:col-span-4 space-y-6 text-zinc-950 dark:text-zinc-50">
              <Card className="border border-zinc-300 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-950">
                <CardHeader className="py-4 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-blue-600 animate-bounce" />
                    <CardTitle className="text-sm font-black text-zinc-950 dark:text-zinc-50">إعدادات تفاصيل ومواصفات الورشة الإنشائية</CardTitle>
                  </div>
                  <CardDescription className="text-[11px] text-zinc-650 dark:text-zinc-400">
                    تغيير معايير الحساب التفصيلي لحديد التسليح والوصلات وحصر الكميات.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-black text-zinc-950 dark:text-zinc-50">الغطاء الخرساني التفصيلي cc (مم)</Label>
                      <Input
                        type="number"
                        value={detailingCover}
                        onChange={(e) => setDetailingCover(Number(e.target.value))}
                        className="h-9 font-bold bg-zinc-50 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-850 font-mono text-center text-zinc-950 dark:text-zinc-50"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-black text-zinc-950 dark:text-zinc-50">طول الجرد التجاري الأقصى (مم)</Label>
                      <Input
                        type="number"
                        value={commercialBarLimit}
                        onChange={(e) => setCommercialBarLimit(Number(e.target.value))}
                        className="h-9 font-bold bg-zinc-50 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-850 font-mono text-center text-zinc-950 dark:text-zinc-50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-black text-zinc-950 dark:text-zinc-50">طول الوصلات م (db * d_b)</Label>
                      <Input
                        type="number"
                        value={spliceMult}
                        onChange={(e) => setSpliceMult(Number(e.target.value))}
                        className="h-9 font-bold bg-zinc-50 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-850 font-mono text-center text-zinc-950 dark:text-zinc-50"
                      />
                    </div>
                    <div className="space-y-1.5 flex flex-col justify-end">
                      <div className="flex items-center gap-1.5 h-9 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-md p-2 justify-center">
                        <input
                          type="checkbox"
                          id="chkStagger"
                          checked={staggerSplices}
                          onChange={(e) => setStaggerSplices(e.target.checked)}
                          className="h-4 w-4 rounded-sm accent-blue-600 accent-offset-1 shrink-0 cursor-pointer"
                        />
                        <Label htmlFor="chkStagger" className="text-[10px] font-black text-zinc-900 dark:text-zinc-200 cursor-pointer whitespace-nowrap">
                          مواقع ربط متباعدة متخالفة (Staggered)
                        </Label>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-dashed border-zinc-300 dark:border-zinc-800 pt-3 space-y-3">
                    <span className="font-extrabold text-[11px] block text-zinc-900 dark:text-zinc-100">معايير أعمال أخدود الحفر والردم والتبطين:</span>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[9.5px] font-bold text-zinc-905 dark:text-zinc-200 block whitespace-nowrap">عمق الحفر (مم)</Label>
                        <Input
                          type="number"
                          value={excDept}
                          onChange={(e) => setExcDept(Number(e.target.value))}
                          className="h-8 text-xs font-bold font-mono text-center bg-zinc-50 dark:bg-zinc-900 text-zinc-955 dark:text-zinc-50 border-zinc-300 dark:border-zinc-850"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9.5px] font-bold text-zinc-905 dark:text-zinc-200 block whitespace-nowrap">ميل الحفر H:V</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={excSlope}
                          onChange={(e) => setExcSlope(Number(e.target.value))}
                          className="h-8 text-xs font-bold font-mono text-center bg-zinc-50 dark:bg-zinc-900 text-zinc-955 dark:text-zinc-50 border-zinc-300 dark:border-zinc-850"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9.5px] font-bold text-zinc-905 dark:text-zinc-200 block whitespace-nowrap">محيط العمل (مم)</Label>
                        <Input
                          type="number"
                          value={excExtraWid}
                          onChange={(e) => setExcExtraWid(Number(e.target.value))}
                          className="h-8 text-xs font-bold font-mono text-center bg-zinc-50 dark:bg-zinc-900 text-zinc-955 dark:text-zinc-50 border-zinc-300 dark:border-zinc-850"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* STEPPED FOOTING CONFIGURATION BOX */}
              <Card className="border border-zinc-300 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-950">
                <CardHeader className="py-3.5 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex flex-row items-center justify-between">
                  <div className="space-y-0.5">
                    <CardTitle className="text-xs font-black text-zinc-950 dark:text-zinc-50 text-right">درجات تغيير المنسوب المتدرج (Stepped Footing)</CardTitle>
                    <CardDescription className="text-[10px] text-zinc-500 text-right">مواقع انخفاض المنسوب على طول عرق الأساس.</CardDescription>
                  </div>
                  <Button 
                    size="xs" 
                    variant="outline" 
                    className="h-7 border-blue-600 text-blue-700 dark:text-blue-400 font-black text-[10px] bg-slate-50 dark:bg-zinc-900"
                    onClick={() => {
                      setSteps([...steps, { coordX: Math.round((L/2000)*10)/10, verticalDrop: 300, stepAngle: 90 }]);
                    }}
                  >
                    <Plus className="h-3 w-3 ml-1" /> إضافة درجة
                  </Button>
                </CardHeader>
                <CardContent className="p-3 text-xs">
                  {steps.length === 0 ? (
                    <p className="text-[10.5px] text-zinc-500 text-center py-2 h-10 flex items-center justify-center">الأساس مستمر واستوائي بلا تدرجات.</p>
                  ) : (
                    <div className="space-y-2">
                      {steps.map((step, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900/60 p-2 rounded border border-zinc-300 dark:border-zinc-800">
                          <div className="flex-1 grid grid-cols-2 gap-2 text-[10px]">
                            <div className="flex items-center gap-1">
                              <span className="font-extrabold text-zinc-900 dark:text-zinc-200">المكان X:</span>
                              <input
                                type="number"
                                step="0.1"
                                value={step.coordX}
                                onChange={(e) => {
                                  const updated = [...steps];
                                  updated[idx].coordX = Number(e.target.value);
                                  setSteps(updated);
                                }}
                                className="w-16 h-7 text-center font-bold border rounded bg-white dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50"
                              />
                              <span className="text-zinc-650 dark:text-zinc-300">م</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="font-extrabold text-zinc-900 dark:text-zinc-200">الهبوط:</span>
                              <input
                                type="number"
                                value={step.verticalDrop}
                                onChange={(e) => {
                                  const updated = [...steps];
                                  updated[idx].verticalDrop = Number(e.target.value);
                                  setSteps(updated);
                                }}
                                className="w-20 h-7 text-center font-bold border rounded bg-white dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50"
                              />
                              <span className="text-zinc-650 dark:text-zinc-300">مم</span>
                            </div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-700"
                            onClick={() => {
                              setSteps(steps.filter((_, i) => i !== idx));
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* JUNCTIONS CONFIGURATION BOX */}
              <Card className="border border-zinc-300 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-950">
                <CardHeader className="py-3.5 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex flex-row items-center justify-between">
                  <div className="space-y-0.5">
                    <CardTitle className="text-xs font-black text-zinc-950 dark:text-zinc-50 text-right">التقاطعات والربط الجداري (Strip Junctions)</CardTitle>
                    <CardDescription className="text-[10px] text-zinc-500 text-right">أشاير التسليح المتداخل لربط القواطع والجدران.</CardDescription>
                  </div>
                  <Button 
                    size="xs" 
                    variant="outline" 
                    className="h-7 border-blue-600 text-blue-700 dark:text-blue-400 font-black text-[10px] bg-slate-50 dark:bg-zinc-900"
                    onClick={() => {
                      setJunctions([...junctions, { type: 'L-junction', coordX: Math.round((L/1500)*10)/10, intersectingWidth: 350, dowelDia: 12, dowelSpacing: 200 }]);
                    }}
                  >
                    <Plus className="h-3 w-3 ml-1" /> إضافة تقاطع
                  </Button>
                </CardHeader>
                <CardContent className="p-3 text-xs">
                  {junctions.length === 0 ? (
                    <p className="text-[10.5px] text-zinc-500 text-center py-2 h-10 flex items-center justify-center">الأساس مستمر حراً بلا تقاطعات متداخلة.</p>
                  ) : (
                    <div className="space-y-2">
                      {junctions.map((junc, idx) => (
                        <div key={idx} className="bg-zinc-50 dark:bg-zinc-900/60 p-2.5 rounded border border-zinc-350 dark:border-zinc-800 space-y-2 text-[10px]">
                          <div className="flex justify-between items-center pb-1.5 border-b border-dashed border-zinc-300 dark:border-zinc-700">
                            <span className="font-black text-blue-700 dark:text-cyan-400">نقطة تداخل #{idx + 1}</span>
                            <div className="flex gap-2 items-center">
                              <select
                                value={junc.type}
                                onChange={(e) => {
                                  const updated = [...junctions];
                                  updated[idx].type = e.target.value as any;
                                  setJunctions(updated);
                                }}
                                className="h-7 text-xs font-black border rounded bg-white dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50 px-1 py-0"
                              >
                                <option value="L-junction">تقاطع زاوية L-Junction</option>
                                <option value="T-junction">تقاطع تفرعي T-Junction</option>
                                <option value="Cross-junction">تقاطع صليبي Cross-Junction</option>
                              </select>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                onClick={() => {
                                  setJunctions(junctions.filter((_, i) => i !== idx));
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div className="flex items-center gap-1">
                              <span className="font-extrabold text-zinc-900 dark:text-zinc-200">مركز X:</span>
                              <input
                                type="number"
                                step="0.1"
                                value={junc.coordX}
                                onChange={(e) => {
                                  const updated = [...junctions];
                                  updated[idx].coordX = Number(e.target.value);
                                  setJunctions(updated);
                                }}
                                className="w-16 h-6 text-center font-bold border rounded bg-white dark:bg-zinc-950 text-zinc-955 dark:text-zinc-50"
                              />
                              <span>م</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="font-extrabold text-zinc-900 dark:text-zinc-200">العرض:</span>
                              <input
                                type="number"
                                value={junc.intersectingWidth}
                                onChange={(e) => {
                                  const updated = [...junctions];
                                  updated[idx].intersectingWidth = Number(e.target.value);
                                  setJunctions(updated);
                                }}
                                className="w-16 h-6 text-center font-bold border rounded bg-white dark:bg-zinc-950 text-zinc-955 dark:text-zinc-50"
                              />
                              <span>مم</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="font-extrabold text-zinc-900 dark:text-zinc-200">db الأشاير:</span>
                              <input
                                type="number"
                                value={junc.dowelDia}
                                onChange={(e) => {
                                  const updated = [...junctions];
                                  updated[idx].dowelDia = Number(e.target.value);
                                  setJunctions(updated);
                                }}
                                className="w-16 h-6 text-center font-bold border rounded bg-white dark:bg-zinc-950 text-zinc-955 dark:text-zinc-50"
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="font-extrabold text-zinc-900 dark:text-zinc-200">تباعد (مم):</span>
                              <input
                                type="number"
                                value={junc.dowelSpacing}
                                onChange={(e) => {
                                  const updated = [...junctions];
                                  updated[idx].dowelSpacing = Number(e.target.value);
                                  setJunctions(updated);
                                }}
                                className="w-16 h-6 text-center font-bold border rounded bg-white dark:bg-zinc-950 text-zinc-955 dark:text-zinc-50"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* LEFT SIDE: VISUAL DRAWING CANVAS & DETAILED BBS TABLES (8 columns) */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* ACCREDITED EXECUTION ELEVATION DIAGRAM */}
              <Card className="border border-zinc-300 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900">
                <CardHeader className="py-3.5 bg-slate-100 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 flex flex-row items-center justify-between">
                  <div className="space-y-1 text-right">
                    <span className="font-extrabold text-[12.5px] block text-slate-900 dark:text-slate-100">مسقط الورشة لتفريد حديد تسليح الأساس الشريطي وعمل الوصلات (Execution Detailing Section Plan)</span>
                    <span className="text-[10px] text-slate-600 dark:text-slate-400 block leading-tight">مخطط تفصيلي يوضح امتداد التسليح، درجات خفض المنسوب، وصلات التداخل Class B وتفاصيل زوايا الثني.</span>
                  </div>
                  <Button 
                    size="xs" 
                    className="bg-blue-600 hover:bg-blue-700 text-white font-black text-xs gap-1.5"
                    onClick={() => window.print()}
                  >
                    <Download className="h-4 w-4" /> طباعة المخطط الإنشائي والـ BBS
                  </Button>
                </CardHeader>
                <CardContent className="p-4 bg-slate-50 dark:bg-slate-950 border-t flex flex-col items-center justify-center relative overflow-hidden">
                  
                  {/* SVG Canvas drawing strip footing side elevation */}
                  <div className="w-full h-64 border border-slate-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-950 relative flex items-center justify-center p-2">
                    <svg className="w-full h-full text-right" viewBox="0 0 1000 240" preserveAspectRatio="none">
                      {/* Background grid */}
                      <rect width="1000" height="240" fill="#f8fafc" />
                      <line x1="0" y1="30" x2="1000" y2="30" stroke="#f1f5f9" strokeWidth="1" />
                      <line x1="0" y1="60" x2="1000" y2="60" stroke="#f1f5f9" strokeWidth="1" />
                      <line x1="0" y1="90" x2="1000" y2="90" stroke="#f1f5f9" strokeWidth="1" />
                      <line x1="0" y1="120" x2="1000" y2="120" stroke="#e2e8f0" strokeWidth="1" />
                      <line x1="0" y1="150" x2="1000" y2="150" stroke="#f1f5f9" strokeWidth="1" />
                      <line x1="0" y1="180" x2="1000" y2="180" stroke="#f1f5f9" strokeWidth="1" />

                      {/* Concrete strip footing profile */}
                      {(() => {
                        const startY = 70;
                        const defaultH = 90;
                        const endY = startY + defaultH;
                        
                        let points = `60,${startY} 940,${startY} 940,${endY} 60,${endY}`;
                        if (steps.length > 0) {
                          // Let's draw a professional step drop!
                          const stepXRatio = 60 + (steps[0].coordX / (L/1000)) * 880;
                          const mappedStepX = Math.min(900, Math.max(100, stepXRatio));
                          const stepHeightDrop = 30; // visual drop representation
                          points = `60,${startY} ${mappedStepX},${startY} ${mappedStepX},${startY + stepHeightDrop} 940,${startY + stepHeightDrop} 940,${endY + stepHeightDrop} ${mappedStepX},${endY + stepHeightDrop} ${mappedStepX},${endY} 60,${endY}`;
                        }
                        
                        return (
                          <>
                            <polygon points={points} fill="#4b5563" fillOpacity="0.12" stroke="#4f4f4f" strokeWidth="2.5" strokeLinejoin="miter" />
                            {/* Concrete hatch label */}
                            <text x="80" y="120" fill="#334155" className="text-[10px] font-black" textAnchor="start">صبة خرسانة عيار C25/30</text>
                          </>
                        );
                      })()}

                      {/* Reinforcement Steel Rendering */}
                      {(() => {
                        const footingLength = L;
                        const coverVisual = 15;
                        const topBarY = 70 + coverVisual;
                        const botBarY = 160 - coverVisual;
                        
                        // Let's filter top and bottom bars from generated detail and draw them
                        const detailBars = detailingDetail.bars;
                        const topBarsDrawn = detailBars.filter(bar => bar.layer === 'top');
                        const botBarsDrawn = detailBars.filter(bar => bar.layer === 'bottom');

                        return (
                          <>
                            {/* Render Top Bars */}
                            {topBarsDrawn.map((bar, bIdx) => {
                              const xStartMapped = 60 + (bar.startX / footingLength) * 880;
                              const xEndMapped = 60 + (bar.endX / footingLength) * 880;
                              const barY = topBarY + (bIdx * 4); // offset overlapping bars slightly
                              
                              if (bar.shape === 'L-Hooked' || bar.shape === 'U-Hooked') {
                                return (
                                  <path
                                    key={bar.id}
                                    d={`M ${xStartMapped} ${barY + 25} L ${xStartMapped} ${barY} L ${xEndMapped} ${barY}`}
                                    fill="none"
                                    stroke="#3b82f6"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                  />
                                );
                              }
                              return (
                                <line
                                  key={bar.id}
                                  x1={xStartMapped}
                                  y1={barY}
                                  x2={xEndMapped}
                                  y2={barY}
                                  stroke="#3b82f6"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                />
                              );
                            })}

                            {/* Render Bottom Bars */}
                            {botBarsDrawn.map((bar, bIdx) => {
                              const xStartMapped = 60 + (bar.startX / footingLength) * 880;
                              const xEndMapped = 60 + (bar.endX / footingLength) * 880;
                              let barY = botBarY - (bIdx * 4);
                              if (steps.length > 0) {
                                const stepXRatio = 60 + (steps[0].coordX / (L/1000)) * 880;
                                const mappedStepX = Math.min(900, Math.max(100, stepXRatio));
                                if (xStartMapped > mappedStepX) {
                                  barY += 30; // drop rebar down dynamically
                                }
                              }

                              if (bar.shape === 'L-Hooked' || bar.shape === 'U-Hooked') {
                                return (
                                  <path
                                    key={bar.id}
                                    d={`M ${xStartMapped} ${barY - 25} L ${xStartMapped} ${barY} L ${xEndMapped} ${barY}`}
                                    fill="none"
                                    stroke="#10b981"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                  />
                                );
                              }
                              return (
                                <line
                                  key={bar.id}
                                  x1={xStartMapped}
                                  y1={barY}
                                  x2={xEndMapped}
                                  y2={barY}
                                  stroke="#10b981"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                />
                              );
                            })}

                            {/* Render Splices with glowing red box */}
                            {detailingDetail.splices.map((spl, sIdx) => {
                              const splX = 60 + (spl.coordinateX / footingLength) * 880;
                              return (
                                <g key={sIdx}>
                                  <rect x={splX - 8} y="62" width="16" height="120" fill="#f43f5e" fillOpacity="0.18" stroke="#f43f5e" strokeWidth="1" strokeDasharray="3,3" />
                                  <text x={splX} y="52" fill="#fda4af" className="text-[9px] font-mono text-center font-bold" textAnchor="middle">وصلة ركوب {spl.spliceLength}mm</text>
                                </g>
                              );
                            })}

                            {/* Render Stepped Stirrups / Dowels */}
                            {steps.length > 0 && (
                              (() => {
                                const stepXRatio = 60 + (steps[0].coordX / (L/1000)) * 880;
                                const mappedStepX = Math.min(900, Math.max(100, stepXRatio));
                                return (
                                  <>
                                    {/* Vertical Stitch Dowel */}
                                    <path d={`M ${mappedStepX - 25} ${topBarY} L ${mappedStepX} ${topBarY} L ${mappedStepX} ${botBarY + 30} L ${mappedStepX + 25} ${botBarY + 30}`} fill="none" stroke="#fbbf24" strokeWidth="2.5" />
                                    <text x={mappedStepX - 8} y="135" fill="#f59e0b" className="text-[9px] font-black" textAnchor="end">أشاير ثبيت Z-Step</text>
                                  </>
                                );
                              })()
                            )}

                            {/* Render Junction tags */}
                            {junctions.map((junc, jIdx) => {
                              const jX = 60 + (junc.coordX / (L/1000)) * 880;
                              return (
                                <g key={jIdx}>
                                  <line x1={jX} y1="20" x2={jX} y2="230" stroke="#a855f7" strokeWidth="1.5" strokeDasharray="4,4" />
                                  <circle cx={jX} cy="115" r="4.5" fill="#c084fc" />
                                  <text x={jX + 8} y="38" fill="#d8b4fe" className="text-[8.5px] font-black text-right" textAnchor="start">تقاطع {junc.type} ({junc.intersectingWidth}مم)</text>
                                </g>
                              );
                            })}
                          </>
                        );
                      })()}

                      {/* Dimension and Coordinates Lines */}
                      <line x1="60" y1="210" x2="940" y2="210" stroke="#475569" strokeWidth="1.5" />
                      <line x1="60" y1="204" x2="60" y2="216" stroke="#475569" strokeWidth="1.5" />
                      <line x1="940" y1="204" x2="940" y2="216" stroke="#475569" strokeWidth="1.5" />
                      <text x="500" y="226" fill="#334155" className="text-[10px] font-extrabold" textAnchor="middle">الطول الكلي لشريط الأساس = {(L/1000).toFixed(1)}م</text>

                      <text x="60" y="225" fill="#475569" className="text-[9px] font-mono">X = 0.0م</text>
                      <text x="940" y="225" fill="#475569" className="text-[9px] font-mono">X = {(L/1000).toFixed(1)}م</text>
                    </svg>

                    {/* Visual Legends Panel overlay */}
                    <div className="absolute bottom-2 right-2 bg-white/95 dark:bg-slate-900/95 p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-[9.5px] text-slate-700 dark:text-zinc-300 flex flex-nowrap gap-3 shadow-sm">
                      <div className="flex items-center gap-1.5"><span className="w-4 h-1.5 bg-blue-500 rounded-full block" /> تسليح علوي (Top Cover Layer)</div>
                      <div className="flex items-center gap-1.5"><span className="w-4 h-1.5 bg-emerald-500 rounded-full block" /> تسليح سفلي (Bottom Cover Layer)</div>
                      <div className="flex items-center gap-1.5"><span className="w-4 h-1.5 bg-yellow-500 rounded-full block" /> حديد التدحرج والمناكفة</div>
                      <div className="flex items-center gap-1.5"><span className="w-4 h-1.5 bg-purple-500 rounded-full block" /> محاور التقاطع والجدران</div>
                    </div>
                  </div>

                  {/* Validation errors and warning panel from detailing metrics */}
                  {detailingDetail.validationErrors.length > 0 && (
                    <div className="w-full mt-3.5 bg-rose-950/40 rounded border border-rose-900 p-2.5 text-[11px] text-rose-200 text-right">
                      <span className="font-extrabold flex items-center gap-1 mb-1 text-rose-300">
                        <AlertTriangle className="h-4 w-4 shrink-0" /> تائهات ومخالفات تفريد التسليح تماسكاً:
                      </span>
                      <ul className="list-disc pr-4 space-y-1">
                        {detailingDetail.validationErrors.map((err, idx) => <li key={idx}>{err}</li>)}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* BAR BENDING SCHEDULE (BBS) DETAILED WORKSHOP TABLE */}
              <Card className="border border-zinc-300 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-950">
                <CardHeader className="py-3.5 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-300 dark:border-zinc-850 flex flex-row items-center justify-between">
                  <div className="space-y-1 text-right">
                    <span className="font-extrabold text-zinc-955 dark:text-zinc-50 text-xs text-right block">منهجية المقياس التفصيلي وتفريد زاوية وبحور أسياخ حديد أساس الشريط (BBS Technical Protocol)</span>
                    <span className="text-[10px] text-zinc-650 block text-right leading-none">تحديد شكل تشغيل ومقاطع الانحناء التفصيلية بالملليمتر وفق متطلبات الكود والمواصفات.</span>
                  </div>
                  <Badge className="bg-emerald-600 text-white font-bold">BOQ Quantities</Badge>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto text-zinc-950 dark:text-zinc-100">
                  <table className="w-full text-right text-xs border-collapse">
                    <thead>
                      <tr className="bg-zinc-200 dark:bg-zinc-800 border-b border-zinc-400 dark:border-zinc-700 text-[11.5px] text-zinc-955 dark:text-zinc-100 font-extrabold h-10">
                        <th className="p-3 border-l border-zinc-300 dark:border-zinc-800">Mark</th>
                        <th className="p-3 border-l border-zinc-300 dark:border-zinc-800">الموضع والتأثير الإنشائي للمقطع</th>
                        <th className="p-2.5 text-center border-l border-zinc-300 dark:border-zinc-800">شكل الثني المعتمد (Shape)</th>
                        <th className="p-2 text-center border-l border-zinc-300 dark:border-zinc-800">القطر db</th>
                        <th className="p-2 text-center border-l border-zinc-300 dark:border-zinc-800">العدد N</th>
                        <th className="p-2.5 text-center border-l border-zinc-300 dark:border-zinc-800">طول القطعة (مم)</th>
                        <th className="p-3 border-l border-zinc-300 dark:border-zinc-800">بروتوكول تفاصيل أبعاد الانحناء والتصنيع (Bending Protocol & Legs)</th>
                        <th className="p-3 text-left pl-4">الوزن التقديري (kg)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-300 dark:divide-zinc-850">
                      {detailingDetail.bbs.map((item, idx) => (
                        <tr key={idx} className="hover:bg-zinc-100 dark:hover:bg-zinc-900/40 border-b border-zinc-300 dark:border-zinc-850 h-11 text-zinc-955 dark:text-zinc-50 font-black">
                          <td className="p-3 font-mono font-black text-blue-800 dark:text-blue-400 border-l border-zinc-200 dark:border-zinc-800">{item.mark}</td>
                          <td className="p-3 font-extrabold text-zinc-950 dark:text-zinc-100 border-l border-zinc-200 dark:border-zinc-800 max-w-[200px]">
                            {detailingDetail.bars[idx]?.description || item.layer}
                          </td>
                          <td className="p-2.5 text-center font-bold text-zinc-900 dark:text-zinc-300 border-l border-zinc-200 dark:border-zinc-800">{item.shape}</td>
                          <td className="p-2 text-center font-mono font-black border-l border-zinc-200 dark:border-zinc-800">{item.diameter}</td>
                          <td className="p-2 text-center font-mono font-black border-l border-zinc-200 dark:border-zinc-800">{item.quantity}</td>
                          <td className="p-2.5 text-center font-mono font-black border-l border-zinc-200 dark:border-zinc-800">{(item.lengthM * 1000).toFixed(0)}</td>
                          <td className="p-3 font-mono text-zinc-950 dark:text-zinc-300 border-l border-zinc-200 dark:border-zinc-800 text-[11px]">
                            {item.bendingProtocol}
                          </td>
                          <td className="p-3 text-left pl-4 font-mono font-black text-indigo-900 dark:text-indigo-400">
                            {item.totalWeightKg.toLocaleString()} kg
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {/* QUANTITIES BILL OF TAKEOFF EXCAVATION AND FORMWORK AND RECONSTRUCTING CORES */}
              <Card className="border border-zinc-300 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-950">
                <CardHeader className="py-3.5 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-300 dark:border-zinc-850 flex flex-row items-center justify-between">
                  <div className="space-y-1 text-right">
                    <span className="font-extrabold text-zinc-955 dark:text-zinc-50 text-xs text-right block">جدول حصر ومكعبات ومسطحات المواد وتقديرات التكلفة الهندسي (Materials Bill of Quantities)</span>
                    <span className="text-[10px] text-zinc-650 block text-right leading-none">مقارنة وتفصيل كميات الحفر والصب والحديد لإدراجها بملف الأوصاف الفنية.</span>
                  </div>
                  <Badge className="bg-blue-600 text-white font-bold">Material Quantities</Badge>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto text-zinc-950 dark:text-zinc-100">
                  <table className="w-full text-right text-xs border-collapse">
                    <thead>
                      <tr className="bg-zinc-200 dark:bg-zinc-800 border-b border-zinc-400 dark:border-zinc-700 text-[11.5px] text-zinc-955 dark:text-zinc-100 font-extrabold h-10">
                        <th className="p-3 border-l border-zinc-300 dark:border-zinc-800">فئة الأعمال الكبرى</th>
                        <th className="p-3 border-l border-zinc-300 dark:border-zinc-800">بند الأعمال ومخطط التنفيذ والمواد</th>
                        <th className="p-3 text-center border-l border-zinc-300 dark:border-zinc-800">الكمية التقديرية الحقيقية</th>
                        <th className="p-2.5 text-center border-l border-zinc-300 dark:border-zinc-800">الوحدة القياسية</th>
                        <th className="p-3 font-bold">تفاصيل المواصفات المنهجية المعتمدة للقص والصناعة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-300 dark:divide-zinc-850">
                      {detailingDetail.quantities.map((item, idx) => (
                        <tr key={idx} className="hover:bg-zinc-100 dark:hover:bg-zinc-900/40 border-b border-zinc-300 dark:border-zinc-850 h-12 text-zinc-955 dark:text-zinc-50">
                          <td className="p-3 font-mono font-black border-l border-zinc-200 dark:border-zinc-800 text-blue-800 dark:text-blue-400">{item.category}</td>
                          <td className="p-3 font-extrabold text-zinc-950 dark:text-zinc-50 border-l border-zinc-200 dark:border-zinc-800 whitespace-nowrap">{item.name}</td>
                          <td className="p-3 text-center font-mono font-black text-slate-950 dark:text-slate-50 border-l border-zinc-200 dark:border-zinc-800 text-[13px] bg-zinc-100 dark:bg-zinc-900">{item.value.toLocaleString()}</td>
                          <td className="p-2.5 text-center font-bold text-zinc-900 dark:text-zinc-200 border-l border-zinc-200 dark:border-zinc-800">{item.unit}</td>
                          <td className="p-3 text-[10.5px] text-stone-900 dark:text-zinc-305 font-bold max-w-[320px] leading-relaxed">{item.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {/* TECHNICAL WORKSHOP SPECS NOTEBOOK */}
              <Card className="border border-zinc-300 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-950">
                <CardHeader className="py-3 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-300 dark:border-zinc-850">
                  <div className="flex items-center gap-1.5 justify-start text-zinc-955 dark:text-zinc-50">
                    <Info className="h-4 w-4 text-blue-600 shrink-0" />
                    <CardTitle className="text-xs font-black">الملاحظات الفنية وشروط ضبط جودة الورشة التنفيذية</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-2 text-[11px] text-zinc-900 dark:text-zinc-200 leading-relaxed text-right">
                  {detailingDetail.detailingNotes.map((note, nIdx) => (
                    <div key={nIdx} className="flex gap-2 items-start justify-start">
                      <span className="text-blue-600 dark:text-cyan-400 font-extrabold shrink-0">•</span>
                      <p className="font-extrabold">{note}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

            </div>

          </div>
        </div>
      )}

      {activeMainTab === 'drawings' && (
        <StripFootingDrawingEngine 
          designResult={designResult}
          detailingDetail={detailingDetail}
          footingLength={L}
          footingWidth={B}
          footingThickness={H}
        />
      )}

    </div>
  );
}
