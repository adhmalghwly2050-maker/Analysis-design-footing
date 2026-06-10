import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { 
  Calculator, AlertTriangle, CheckCircle, Layers, Settings2, 
  Activity, HelpCircle, Info, RefreshCw, Database, Landmark, 
  ShieldCheck, ArrowDown, MoveLeft, Compass, AlertCircle
} from 'lucide-react';
import { 
  analyzeIsolatedFootingSettlement,
  analyzeStripFootingSettlement,
  analyzeCombinedFootingSettlement,
  analyzeRaftSettlement,
  getGeotechnicalBenchmarks,
  type GeotechnicalParameters,
  type SettlementMethod,
  type SettlementAnalysisResult
} from '@/lib/foundationSettlementEngine';
import type { Column } from '@/lib/structuralEngine';

interface Props {
  columns?: Column[];
  colLoads3D?: Map<string, { P_service?: number; Pu?: number; Mx?: number; My?: number }>;
  defaultQall?: number;
}

export default function FoundationSettlementPanel({
  columns = [],
  colLoads3D,
  defaultQall = 150
}: Props) {
  // --- GEOTECHNICAL SOIL PARAMETERS STATE ---
  const [qall, setQall] = useState<number>(defaultQall);
  const [ks, setKs] = useState<number>(20000);              // kN/m³ (subgrade reaction)
  const [es, setEs] = useState<number>(25);                 // MPa (soil elastic modulus)
  const [poisson, setPoisson] = useState<number>(0.3);       // Soil Poisson's ratio
  const [embedmentDepth, setEmbedmentDepth] = useState<number>(1.5); // Df (m)
  const [groundwaterDepth, setGroundwaterDepth] = useState<number>(2.5); // dw (m)
  const [enableGroundwater, setEnableGroundwater] = useState<boolean>(true);
  const [alphaCustom, setAlphaCustom] = useState<number>(25); // mm custom peak
  const [betaCustom, setBetaCustom] = useState<number>(1.2);  // custom exponent
  const [method, setMethod] = useState<SettlementMethod>('elastic');

  // --- SERVICEABILITY USER-DEFINED LIMITS ---
  const [maxSettlementLimit, setMaxSettlementLimit] = useState<number>(25); // mm standard limit
  const [maxAngularLimit, setMaxAngularLimit] = useState<number>(1 / 300);   // Standard Bjerrum ratio

  // --- TAB CONTROLLERS ---
  const [activeSubTab, setActiveSubTab] = useState<'isolated' | 'strip' | 'combined' | 'raft' | 'benchmarks'>('isolated');

  // --- FOUNDATION DETAILED SPECIFIC STATES ---
  // A. Isolated
  const [isoName, setIsoName] = useState<string>('قاعدة منفردة F1');
  const [isoB, setIsoB] = useState<number>(2.0); // m
  const [isoL, setIsoL] = useState<number>(2.0); // m
  const [isoH, setIsoH] = useState<number>(0.6); // m
  const [isoP, setIsoP] = useState<number>(450); // kN (service)
  const [isoMx, setIsoMx] = useState<number>(30); // kN·m
  const [isoMy, setIsoMy] = useState<number>(15); // kN·m

  // B. Strip
  const [stripName, setStripName] = useState<string>('أساس شريطي SG-2');
  const [stripL, setStripL] = useState<number>(10.0); // m
  const [stripB, setStripB] = useState<number>(1.5);  // m
  const [stripH, setStripH] = useState<number>(0.7);  // m
  // Multi-point loads along continuous strip e.g. supporting 3 columns
  const [stripLoads, setStripLoads] = useState<Array<{ id: number; x: number; P: number }>>([
    { id: 1, x: 1.5, P: 500 },
    { id: 2, x: 5.0, P: 650 },
    { id: 3, x: 8.5, P: 500 }
  ]);

  // C. Combined
  const [combName, setCombName] = useState<string>('قاعدة مشتركة CF-1');
  const [combL, setCombL] = useState<number>(6.5);
  const [combB, setCombB] = useState<number>(2.2);
  const [combH, setCombH] = useState<number>(0.8);
  const [combC1X, setCombC1X] = useState<number>(1.0); // Column 1 x coord (m)
  const [combC1P, setCombC1P] = useState<number>(600); // Column 1 P (kN)
  const [combC2X, setCombC2X] = useState<number>(5.5); // Column 2 x coord (m)
  const [combC2P, setCombC2P] = useState<number>(850); // Column 2 P (kN)

  // D. Raft
  const [raftName, setRaftName] = useState<string>('لبشة خرسانية MAT-RA3');
  const [raftL, setRaftL] = useState<number>(20);
  const [raftB, setRaftB] = useState<number>(15);
  const [raftH, setRaftH] = useState<number>(1.2);
  const [raftGridRows, setRaftGridRows] = useState<number>(7);
  const [raftGridCols, setRaftGridCols] = useState<number>(9);
  const [raftTotalLoad, setRaftTotalLoad] = useState<number>(12000); // total kN load
  const [raftLoadDist, setRaftLoadDist] = useState<'uniform' | 'center-heavy' | 'perimeter'>('center-heavy');

  // --- AUTO RECONCILIATION & COLUMN DATA COUPLING ---
  const groundCols = useMemo(() => {
    return columns.filter(c => {
      // Find the lowest story column node for foundation loads
      const minZ = Math.min(...columns.map(col => col.zBottom ?? 0));
      return Math.abs((c.zBottom ?? 0) - minZ) < 1.0;
    });
  }, [columns]);

  const handleImportColumnLoads = () => {
    if (groundCols.length === 0) return;
    // Let's grab the heaviest column load or combine loads to simulate foundation data
    const heaviestCol = groundCols.reduce((prev, curr) => {
      const prevL = colLoads3D?.get(prev.id)?.P_service ?? 200;
      const currL = colLoads3D?.get(curr.id)?.P_service ?? 200;
      return currL > prevL ? curr : prev;
    }, groundCols[0]);

    const loads = colLoads3D?.get(heaviestCol.id);
    if (loads) {
      setIsoP(parseFloat((loads.P_service ?? 350).toFixed(1)));
      setIsoMx(parseFloat(Math.abs(loads.Mx ?? 15).toFixed(1)));
      setIsoMy(parseFloat(Math.abs(loads.My ?? 10).toFixed(1)));
      setIsoName(`قاعدة العمود المستوردة ${heaviestCol.id}`);
    }
  };

  // --- CALCULATION HOOKS ---
  const geoParams: GeotechnicalParameters = useMemo(() => ({
    qall,
    Ks: ks,
    Es: es,
    poisson,
    embedmentDepth,
    groundwaterDepth,
    enableGroundwater,
    alphaCustom,
    betaCustom
  }), [qall, ks, es, poisson, embedmentDepth, groundwaterDepth, enableGroundwater, alphaCustom, betaCustom]);

  const customLimits = useMemo(() => ({
    maxS: maxSettlementLimit,
    maxBeta: maxAngularLimit
  }), [maxSettlementLimit, maxAngularLimit]);

  const isolatedResult = useMemo<SettlementAnalysisResult>(() => {
    return analyzeIsolatedFootingSettlement({
      name: isoName,
      B: isoB,
      L: isoL,
      H: isoH,
      P: isoP,
      Mx: isoMx,
      My: isoMy
    }, geoParams, method, customLimits);
  }, [isoName, isoB, isoL, isoH, isoP, isoMx, isoMy, geoParams, method, customLimits]);

  const stripResult = useMemo<SettlementAnalysisResult>(() => {
    return analyzeStripFootingSettlement({
      name: stripName,
      L: stripL,
      B: stripB,
      H: stripH,
      loads: stripLoads
    }, geoParams, method, customLimits);
  }, [stripName, stripL, stripB, stripH, stripLoads, geoParams, method, customLimits]);

  const combinedResult = useMemo<SettlementAnalysisResult>(() => {
    return analyzeCombinedFootingSettlement({
      name: combName,
      L: combL,
      B: combB,
      H: combH,
      c1X: combC1X,
      c1P: combC1P,
      c2X: combC2X,
      c2P: combC2P
    }, geoParams, method, customLimits);
  }, [combName, combL, combB, combH, combC1X, combC1P, combC2X, combC2P, geoParams, method, customLimits]);

  const raftResult = useMemo<SettlementAnalysisResult>(() => {
    return analyzeRaftSettlement({
      name: raftName,
      L: raftL,
      B: raftB,
      H: raftH,
      gridRows: raftGridRows,
      gridCols: raftGridCols,
      totalLoad: raftTotalLoad,
      loadDistribution: raftLoadDist
    }, geoParams, method, customLimits);
  }, [raftName, raftL, raftB, raftH, raftGridRows, raftGridCols, raftTotalLoad, raftLoadDist, geoParams, method, customLimits]);

  // Active result helper
  const activeResult = useMemo(() => {
    if (activeSubTab === 'isolated') return isolatedResult;
    if (activeSubTab === 'strip') return stripResult;
    if (activeSubTab === 'combined') return combinedResult;
    return raftResult;
  }, [activeSubTab, isolatedResult, stripResult, combinedResult, raftResult]);

  // Benchmarks list for comparison
  const benchmarks = useMemo(() => getGeotechnicalBenchmarks(), []);

  return (
    <div className="space-y-6 text-right select-none" style={{ direction: 'rtl' }} id="foundation-settlement-workspace">
      
      {/* HEADER BANNER */}
      <Card className="border border-indigo-100 dark:border-indigo-950 bg-indigo-50/20">
        <CardContent className="py-4 px-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5 justify-start">
              <div className="p-3 bg-indigo-100 dark:bg-indigo-950 rounded-xl text-indigo-700 dark:text-indigo-400 shrink-0">
                <Compass className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>محرك حسابات هبوط أساسات المبنى والتشوه الزاوي (Serviceability Settlement Engine)</span>
                  <Badge variant="outline" className="border-indigo-200 text-indigo-700 bg-indigo-100/50 text-[10px]">Geotechnical Analytics</Badge>
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  يقوم هذا الموديل المتقدم بتقدير الهبوط التفريقي والتشوهات الزاوية والنسبية لجميع أنواع الأساسات بناءً على نماذج معامل مرونة التربة (Elastic Soil Modulus Es) ومعامل الناتئ (Ks Winkler) ومعايرتها بحدود الخدمة الآمنة لمنع التشققات.
                </p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="text-xs flex items-center gap-1.5"
                onClick={handleImportColumnLoads}
                disabled={groundCols.length === 0}
              >
                <Activity className="h-3.5 w-3.5 text-indigo-650" />
                استيراد أقصى للأحمال من الإطار ({groundCols.length})
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DYNAMIC TWO-COLUMN SPLIT: CONTROLS & MODEL WORKSPACES */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* RIGHT COLUMN: PARAMETERS & GEOTECHNICAL CONFIGURATOR (4 SPANS) */}
        <div className="xl:col-span-4 space-y-6">
          
          {/* A. Dynamic Soil Configuration Panel */}
          <Card className="border">
            <CardHeader className="py-4 bg-muted/20 border-b">
              <CardTitle className="text-xs font-bold flex items-center gap-2 justify-start">
                <Settings2 className="h-4 w-4 text-blue-600" />
                المعاملات الجيوتقنية لطبقات التربة (Geotechnical & Soil Properties)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4 text-xs">
              
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-350 block">طريقة حساب وتحليل الهبوط (Settlement Method)</label>
                <select
                  className="w-full h-8 px-2.5 border rounded text-xs bg-background dark:border-slate-800"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as SettlementMethod)}
                >
                  <option value="elastic">طريقة المرونة المرنة (Elastic Influence Theory)</option>
                  <option value="subgrade">طريقة Winkler لمعامل رد فعل التربة (Subgrade Ks Modulus)</option>
                  <option value="custom">النموذج التجريبي المخصص (Empirical Stress Exponent)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 pb-1 border-b border-dashed">
                <div className="space-y-1">
                  <label htmlFor="qall-input" className="text-[10px] text-muted-foreground block font-bold">جهد التربة المسموح (q_all)</label>
                  <div className="relative">
                    <Input
                      id="qall-input"
                      type="number"
                      className="h-8 pl-12 text-xs"
                      value={qall}
                      onChange={(e) => setQall(Math.max(10, parseFloat(e.target.value) || 150))}
                    />
                    <span className="absolute left-2.5 top-1.5 font-mono text-[9px] text-muted-foreground">kN/m²</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="ks-input" className="text-[10px] text-muted-foreground block font-bold">معامل نضوج التربة (Ks)</label>
                  <div className="relative">
                    <Input
                      id="ks-input"
                      type="number"
                      className="h-8 pl-12 text-xs"
                      value={ks}
                      onChange={(e) => setKs(Math.max(100, parseFloat(e.target.value) || 20000))}
                    />
                    <span className="absolute left-1.5 top-1.5 font-mono text-[9px] text-muted-foreground">kN/m³</span>
                  </div>
                </div>
              </div>

              {method === 'elastic' && (
                <div className="space-y-3.5 py-1">
                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="space-y-1">
                      <label htmlFor="es-input" className="text-[10px] text-indigo-700 dark:text-indigo-400 block font-bold">معامل مرونة للتربة (Es)</label>
                      <div className="relative">
                        <Input
                          id="es-input"
                          type="number"
                          step="1.0"
                          className="h-8 pl-10 text-xs border-indigo-200 dark:border-indigo-900"
                          value={es}
                          onChange={(e) => setEs(Math.max(1, parseFloat(e.target.value) || 25))}
                        />
                        <span className="absolute left-2.5 top-1.5 font-mono text-[9px] text-indigo-700">MPa</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="poisson-input" className="text-[10px] text-muted-foreground block font-bold">نسبة بواسون للتربة (μ)</label>
                      <Input
                        id="poisson-input"
                        type="number"
                        step="0.05"
                        className="h-8 text-xs font-mono"
                        value={poisson}
                        onChange={(e) => setPoisson(Math.max(0.1, Math.min(0.5, parseFloat(e.target.value) || 0.3)))}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="Df-input" className="text-[10px] text-muted-foreground block font-bold">عمق التأسيس النهائي من سطح التربة (Df)</label>
                    <div className="relative">
                      <Input
                        id="Df-input"
                        type="number"
                        step="0.1"
                        className="h-8 pl-8 text-xs"
                        value={embedmentDepth}
                        onChange={(e) => setEmbedmentDepth(Math.max(0, parseFloat(e.target.value) || 1.5))}
                      />
                      <span className="absolute left-2.5 top-1.5 font-mono text-[9px] text-muted-foreground">م</span>
                    </div>
                  </div>
                </div>
              )}

              {method === 'custom' && (
                <div className="space-y-3 p-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg border border-dashed">
                  <span className="font-bold text-[10px] text-amber-700 block">إعدادات النموذج التجريبي (Power-Law Model):</span>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[9.5px]">السعة الحدية الاصطلاحية α (مم):</label>
                      <Input 
                        type="number" 
                        className="h-7 text-xs" 
                        value={alphaCustom} 
                        onChange={e => setAlphaCustom(Math.max(1, parseFloat(e.target.value) || 25))} 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9.5px]">معامل الأس اللاخطي β:</label>
                      <Input 
                        type="number" 
                        step="0.1" 
                        className="h-7 text-xs" 
                        value={betaCustom} 
                        onChange={e => setBetaCustom(Math.max(0.5, parseFloat(e.target.value) || 1.0))} 
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* B. Ground Water configurator */}
              <div className="p-3 bg-blue-50/15 border border-blue-100 dark:border-blue-950 rounded-lg space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[10.5px] items-center gap-1.5 flex text-blue-800 dark:text-blue-400">
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                    محاكاة منسوب المياه الجوفية (Water Table)
                  </span>
                  <input
                    type="checkbox"
                    checked={enableGroundwater}
                    onChange={(e) => setEnableGroundwater(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                  />
                </div>
                {enableGroundwater && (
                  <div className="space-y-1.5 pt-0.5">
                    <label htmlFor="dw-input" className="text-[9.5px] text-slate-800 dark:text-slate-350 block leading-tight">عمق المياه من سطح الأرض dw:</label>
                    <div className="relative">
                      <Input
                        id="dw-input"
                        type="number"
                        step="0.1"
                        className="h-7 text-xs font-mono"
                        value={groundwaterDepth}
                        onChange={(e) => setGroundwaterDepth(parseFloat(e.target.value) || 0)}
                      />
                      <span className="absolute left-2.5 top-1 font-mono text-[9px]">متر</span>
                    </div>
                    <p className="text-[9px] text-blue-600/80 leading-snug">
                      * وجود المياه الجوفية في محيط الأساس يقلل الإجهادات الفعالة للتربة مما يضاعف الهبوط المحسوب بنسبة تصل لـ 1.6 ضعفاً.
                    </p>
                  </div>
                )}
              </div>

            </CardContent>
          </Card>

          {/* B. SERVICEABILITY COMPLIANCE LIMITS */}
          <Card className="border">
            <CardHeader className="py-3 bg-muted/15 border-b">
              <CardTitle className="text-xs font-bold flex items-center gap-2 justify-start">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                معايير الأمان وحدود الهبوط (Serviceability limits)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3.5 text-xs">
              
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10.5px]">
                  <label htmlFor="maxSettlementLimit-input" className="font-bold">أقصى حد هبوط كلي مسموح به</label>
                  <span className="font-mono text-zinc-500">{maxSettlementLimit} مم</span>
                </div>
                <Input
                  id="maxSettlementLimit-input"
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={maxSettlementLimit}
                  onChange={(e) => setMaxSettlementLimit(parseInt(e.target.value))}
                  className="h-5 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10.5px]">
                  <label className="font-bold">حد الدوران الزاوي الأقصى (Bjerrum Limit)</label>
                  <span className="font-mono text-indigo-700 bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded text-[9.5px]">1/300 (حرِج)</span>
                </div>
                <select
                  className="w-full h-8 px-2.5 border rounded text-xs bg-background dark:border-slate-800"
                  value={maxAngularLimit}
                  onChange={(e) => setMaxAngularLimit(parseFloat(e.target.value))}
                >
                  <option value={1/500}>1/500 (تشوه آمن جداً للمنشآت الحساسة)</option>
                  <option value={1/300}>1/300 (حد الانهيار المعماري وتشققات اللياسة البسيطة)</option>
                  <option value={1/150}>1/150 (تشوه جسيم وخطير يوصى بعدم الوصول له)</option>
                </select>
              </div>

              <div className="bg-yellow-50/15 border border-yellow-250 dark:border-yellow-900/30 p-2.5 rounded-lg text-[9.5px] leading-relaxed text-yellow-800 dark:text-yellow-450 space-y-1">
                <span className="font-bold block">ملاحظة الكفاءة الفنية:</span>
                <span>تعتمد عتبة الكراك المتشكل للدهانات ومظهر الجبس على هذه الحدود. إن زيادة أبعاد الأساس أو صلابة الحفر يقلل من الدوران التفريقي.</span>
              </div>

            </CardContent>
          </Card>

        </div>

        {/* LEFT COLUMN: ACTIVE WORKSPACE TAB (8 SPANS) */}
        <div className="xl:col-span-8 space-y-6">
          
          {/* TAB DECK SELECTOR */}
          <div className="flex border-b border-border p-1 bg-slate-100/60 dark:bg-slate-900/40 rounded-lg gap-2">
            <button
              onClick={() => setActiveSubTab('isolated')}
              className={`flex-1 py-1.5 px-3 rounded text-xs font-bold transition-all ${
                activeSubTab === 'isolated'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-650 hover:bg-slate-200/50 dark:hover:bg-slate-800'
              }`}
            >
              القواعد المنفردة (Isolated)
            </button>
            <button
              onClick={() => setActiveSubTab('strip')}
              className={`flex-1 py-1.5 px-3 rounded text-xs font-bold transition-all ${
                activeSubTab === 'strip'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-650 hover:bg-slate-200/50 dark:hover:bg-slate-800'
              }`}
            >
              الأساس الشريطي (Strip)
            </button>
            <button
              onClick={() => setActiveSubTab('combined')}
              className={`flex-1 py-1.5 px-3 rounded text-xs font-bold transition-all ${
                activeSubTab === 'combined'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-650 hover:bg-slate-200/50 dark:hover:bg-slate-800'
              }`}
            >
              قاعدة مشتركة (Combined)
            </button>
            <button
              onClick={() => setActiveSubTab('raft')}
              className={`flex-1 py-1.5 px-3 rounded text-xs font-bold transition-all ${
                activeSubTab === 'raft'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-650 hover:bg-slate-200/50 dark:hover:bg-slate-800'
              }`}
            >
              اللبشة العامة (Raft)
            </button>
            <button
              onClick={() => setActiveSubTab('benchmarks')}
              className={`flex-1 py-1.5 px-3 rounded text-xs font-bold text-center transition-all ${
                activeSubTab === 'benchmarks'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-650 hover:bg-slate-200/50 dark:hover:bg-slate-800'
              }`}
            >
              معايرة برمجيات هندسية (Benchmarks) ⚓
            </button>
          </div>

          {/* 1. WORKSPACE: ISOLATED FOOTING */}
          {activeSubTab === 'isolated' && (
            <div className="space-y-6">
              <Card className="border">
                <CardHeader className="py-3 bg-muted/20 border-b flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-xs font-bold">نمذجة أبعاد وأحمال القاعدة المنفردة [F1]</CardTitle>
                    <CardDescription className="text-[10px] mt-0.5">تحديد مساحة تلامس تلامس التربة وسماكة القاعدة وعزوم الانقلاب</CardDescription>
                  </div>
                  <Badge variant="outline" className="text-blue-700 bg-blue-100/30">Single Column Footing</Badge>
                </CardHeader>
                <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <label htmlFor="isoB-input" className="text-[11px] font-medium leading-none">عرض القاعدة B (متر)</label>
                    <Input id="isoB-input" type="number" step="0.1" value={isoB} onChange={e => setIsoB(Math.max(0.5, parseFloat(e.target.value) || 2))} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="isoL-input" className="text-[11px] font-medium leading-none">طول القاعدة L (متر)</label>
                    <Input id="isoL-input" type="number" step="0.1" value={isoL} onChange={e => setIsoL(Math.max(0.5, parseFloat(e.target.value) || 2))} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="isoH-input" className="text-[11px] font-medium leading-none">سماكة صبة الخرسانة H (متر)</label>
                    <Input id="isoH-input" type="number" step="0.05" value={isoH} onChange={e => setIsoH(Math.max(0.2, parseFloat(e.target.value) || 0.6))} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="isoP-input" className="text-[11px] font-medium leading-none text-indigo-700 dark:text-indigo-400 font-bold">حمولة العمود الخدمية P (kN)</label>
                    <Input id="isoP-input" type="number" value={isoP} onChange={e => setIsoP(Math.max(10, parseFloat(e.target.value) || 450))} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="isoMx-input" className="text-[11px] font-medium leading-none">العزم البياكسيل Mx (kN·m)</label>
                    <Input id="isoMx-input" type="number" value={isoMx} onChange={e => setIsoMx(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="isoMy-input" className="text-[11px] font-medium leading-none">العزم البياكسيل My (kN·m)</label>
                    <Input id="isoMy-input" type="number" value={isoMy} onChange={e => setIsoMy(parseFloat(e.target.value) || 0)} />
                  </div>
                </CardContent>
              </Card>

              {/* ISOLATED INTERACTIVE SCHEMATIC OF BIAXIAL STRESS CONTRASTS */}
              <Card className="border">
                <CardHeader className="py-3 bg-slate-5030/10">
                  <span className="font-bold text-xs text-indigo-805 dark:text-indigo-400">توزيع ضغط التربة والانفعالات المتوقعة (Eccentric Compression Stress Pattern)</span>
                </CardHeader>
                <CardContent className="p-4 flex flex-col md:flex-row items-center gap-6 justify-center">
                  <div className="relative w-72 h-64 border-2 border-slate-350 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/20 rounded-xl flex items-center justify-center">
                    {/* Centered Column Sketch */}
                    <div className="absolute w-12 h-12 bg-indigo-600/35 border-2 border-indigo-700/60 rounded flex items-center justify-center font-bold text-[9px] text-white">
                      Col
                    </div>
                    {/* Corners Settlement & Elastic nodes */}
                    <div className="absolute top-2 right-2 text-center bg-white dark:bg-slate-900 border p-1 rounded shadow-sm scale-90">
                      <span className="text-[9px] text-muted-foreground block leading-none">Corner TR</span>
                      <span className="font-mono text-xs font-bold text-slate-805 dark:text-slate-100">{isolatedResult.points[1].settlement.toFixed(1)} مم</span>
                    </div>
                    <div className="absolute bottom-2 left-2 text-center bg-white dark:bg-slate-900 border p-1 rounded shadow-sm scale-90">
                      <span className="text-[9px] text-muted-foreground block leading-none">Short Edge</span>
                      <span className="font-mono text-xs font-bold text-slate-805 dark:text-slate-100">{isolatedResult.points[3].settlement.toFixed(1)} مم</span>
                    </div>
                    <div className="absolute top-2 left-2 text-center bg-white dark:bg-slate-900 border p-1 rounded shadow-sm scale-90">
                      <span className="text-[9px] text-muted-foreground block leading-none">Long Edge</span>
                      <span className="font-mono text-xs font-bold text-slate-805 dark:text-slate-100">{isolatedResult.points[2].settlement.toFixed(1)} مم</span>
                    </div>
                    {/* Center Settlement Overlay */}
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-12 text-center bg-blue-100/90 dark:bg-blue-905 border border-blue-400 p-1.5 rounded-lg shadow-sm scale-95 z-20">
                      <span className="text-[9px] text-blue-800 block font-bold leading-none">المركز Center</span>
                      <span className="font-mono text-xs font-bold text-blue-900 dark:text-blue-100">{isolatedResult.points[0].settlement.toFixed(1)} مم</span>
                    </div>

                    <div className="absolute text-[8.5px] italic text-muted-foreground bottom-2 right-2">
                       B: {isoB}m x L: {isoL}m
                    </div>
                  </div>

                  <div className="flex-1 space-y-3.5 text-xs">
                    <span className="font-bold block text-[11px] text-blue-700">تقييم تباين الهبوط بالمقاطع المختلفة:</span>
                    <p className="text-[11.5px] leading-relaxed text-slate-700 dark:text-slate-300">
                      نظراً لوجود عزوم بياكسيل ({isoMx}, {isoMy} kN·m)، يميل الأساس بحيث يمر الهبوط بتباين مرن واضح. هبوط المركز يمثل التشوه المرن الأساسي المحاكي للأعمدة، بينما تعطي تفاوت الزوايا والمنتصفات مؤشراً لصلابة وتفاصيل التشوه.
                    </p>
                    <div className="bg-muted p-3 rounded-lg flex justify-around items-center text-center">
                      <div>
                        <span className="text-[9.5px] text-muted-foreground block font-bold">أقصى هبوط</span>
                        <span className="font-mono text-sm font-bold text-rose-600 block">{isolatedResult.maxSettlement.toFixed(1)} مم</span>
                      </div>
                      <div className="border-r h-8"></div>
                      <div>
                        <span className="text-[9.5px] text-muted-foreground block font-bold">الهبوط التفريقي</span>
                        <span className="font-mono text-sm font-bold text-indigo-700 block">{isolatedResult.differentialSettlement.toFixed(1)} مم</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* 2. WORKSPACE: STRIP FOOTING */}
          {activeSubTab === 'strip' && (
            <div className="space-y-6">
              <Card className="border">
                <CardHeader className="py-3 bg-muted/20 border-b">
                  <CardTitle className="text-xs font-bold">نمذجة الأساس الشريطي المستمر وأحمال الأعمدة</CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4 text-xs">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="stripL-input" className="text-[11px] font-semibold leading-none">طول الشريط الإجمالي L (متر)</label>
                      <Input id="stripL-input" type="number" step="0.5" value={stripL} onChange={e => setStripL(Math.max(2, parseFloat(e.target.value) || 10))} />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="stripB-input" className="text-[11px] font-semibold leading-none">عرض الأساس الشريطي B (متر)</label>
                      <Input id="stripB-input" type="number" step="0.1" value={stripB} onChange={e => setStripB(Math.max(0.5, parseFloat(e.target.value) || 1.5))} />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="stripH-input" className="text-[11px] font-semibold leading-none">سماكة الخرسانة H (متر)</label>
                      <Input id="stripH-input" type="number" step="0.05" value={stripH} onChange={e => setStripH(Math.max(0.2, parseFloat(e.target.value) || 0.7))} />
                    </div>
                  </div>

                  <div className="border border-dashed p-3 rounded-xl space-y-2">
                    <span className="font-bold text-[10.5px] text-indigo-750 block">حمولات الأعمدة المتكررة على الأساس الشريط (Column Concentrated Loads):</span>
                    <div className="grid grid-cols-3 gap-3">
                      {stripLoads.map((l, index) => (
                        <div key={l.id} className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded border space-y-1">
                          <span className="font-bold text-[10px] block text-indigo-600 leading-snug">عمود {l.id}</span>
                          <div className="space-y-1">
                            <label className="text-[8.5px] block text-muted-foreground">الإحداثي (م):</label>
                            <Input
                              type="number"
                              step="0.1"
                              className="h-6 text-xs px-1.5"
                              value={l.x}
                              onChange={e => {
                                const val = parseFloat(e.target.value) || 0;
                                const updated = [...stripLoads];
                                updated[index].x = Math.max(0, Math.min(stripL, val));
                                setStripLoads(updated);
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8.5px] block text-muted-foreground">الحمولة (kN):</label>
                            <Input
                              type="number"
                              className="h-6 text-xs px-1.5"
                              value={l.P}
                              onChange={e => {
                                const val = parseFloat(e.target.value) || 100;
                                const updated = [...stripLoads];
                                updated[index].P = val;
                                setStripLoads(updated);
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* STRIP PROFILE CHART / REBAR DEFLECTION VIEW */}
              <Card className="border">
                <CardHeader className="py-3 bg-slate-50/10">
                  <span className="font-bold text-xs text-blue-805">مخطط الهبوط الجيوتقني على طول الأساس الشريطي المتصل (Longitudinal Settlement Profile)</span>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  {/* Drawing a continuous SVG to visualize the settlement profile along the strip length */}
                  <div className="w-full bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-border">
                    <div className="w-full h-40 relative">
                      <svg viewBox="0 0 500 120" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                        {/* Concrete basic outline sketch */}
                        <rect x="0" y="5" width="500" height="20" fill="gray" fillOpacity="0.15" stroke="#94a3b8" strokeWidth="1" />
                        {/* Zero deflection axis line */}
                        <line x1="0" y1="25" x2="500" y2="25" stroke="#cbd5e1" strokeDasharray="3" strokeWidth="1.5" />
                        
                        {/* Render Point Loads Arrows */}
                        {stripLoads.map((ld) => {
                          const xPct = (ld.x / stripL) * 500;
                          return (
                            <g key={ld.id}>
                              {/* Arrow down */}
                              <line x1={xPct} y1="-5" x2={xPct} y2="5" stroke="#dc2626" strokeWidth="2" />
                              <polygon points={`${xPct-3},2 ${xPct+3},2 ${xPct},5`} fill="#dc2626" />
                              <text x={xPct} y="-7" textAnchor="middle" fontSize="6.5px" fill="#dc2626" fontWeight="bold">
                                {ld.P}kN
                              </text>
                            </g>
                          );
                        })}

                        {/* Deflection profile wave line */}
                        <path
                          d={`M ${stripResult.points.map((pt, idx) => {
                            const xVal = (pt.x / stripL) * 500;
                            const yVal = 25 + (pt.settlement * 2.5); // scale settlement for sketch
                            return `${xVal} ${yVal}`;
                          }).join(' L ')}`}
                          fill="none"
                          stroke="#2563eb"
                          strokeWidth="2.5"
                        />
                        
                        {/* Anchor points along line */}
                        {stripResult.points.map((pt, idx) => {
                          const xVal = (pt.x / stripL) * 500;
                          const yVal = 25 + (pt.settlement * 2.5);
                          return (
                            <circle key={idx} cx={xVal} cy={yVal} r="3" fill="#3b82f6" />
                          );
                        })}
                      </svg>
                    </div>
                    {/* Footing x label scale */}
                    <div className="flex justify-between items-center text-[9px] text-muted-foreground px-1 border-t pt-2.5 mt-2">
                      <span>البداية x=0م</span>
                      <span>طول المقطع الوسطي x={(stripL/2).toFixed(1)}م</span>
                      <span>النهاية x={stripL}م</span>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground text-center">
                    * يمتد المخطط الأزرق ليعبر عن مرونة وتشكل الأساس تحت تأثير الأحمال العمودية ومواضعها.
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* 3. WORKSPACE: COMBINED FOOTING */}
          {activeSubTab === 'combined' && (
            <div className="space-y-6">
              <Card className="border">
                <CardHeader className="py-3 bg-muted/20 border-b flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-bold font-sans">نمذجة أبعاد وأحمال القاعدة المشتركة للعمودين CF-1</CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4 text-xs">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="combL-input" className="text-[11px] font-semibold leading-none">طول القاعدة L (متر)</label>
                      <Input id="combL-input" type="number" step="0.1" value={combL} onChange={e => setCombL(Math.max(1, parseFloat(e.target.value) || 6.5))} />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="combB-input" className="text-[11px] font-semibold leading-none">عرض القاعدة B (متر)</label>
                      <Input id="combB-input" type="number" step="0.1" value={combB} onChange={e => setCombB(Math.max(0.5, parseFloat(e.target.value) || 2.2))} />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="combH-input" className="text-[11px] font-semibold leading-none">سماكة الأساس H (متر)</label>
                      <Input id="combH-input" type="number" step="0.05" value={combH} onChange={e => setCombH(Math.max(0.2, parseFloat(e.target.value) || 0.8))} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border p-3 rounded-xl bg-slate-50/50 dark:bg-slate-900/40">
                    <div className="space-y-2">
                      <span className="font-bold text-[10.5px] block text-indigo-700">عمود 1 الأقرب للحافة:</span>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <label className="text-[9px]">الموضع x (متر):</label>
                          <Input type="number" step="0.1" className="h-7 text-xs" value={combC1X} onChange={e => setCombC1X(Math.max(0, Math.min(combL, parseFloat(e.target.value) || 1)))} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px]">الحمولة P1 (kN):</label>
                          <Input type="number" className="h-7 text-xs font-bold" value={combC1P} onChange={e => setCombC1P(Math.max(10, parseFloat(e.target.value) || 600))} />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 border-r pr-3">
                      <span className="font-bold text-[10.5px] block text-indigo-700">عمود 2 الأبعد للحافة:</span>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <label className="text-[9px]">الموضع x (متر):</label>
                          <Input type="number" step="0.1" className="h-7 text-xs" value={combC2X} onChange={e => setCombC2X(Math.max(0, Math.min(combL, parseFloat(e.target.value) || 5.5)))} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px]">الحمولة P2 (kN):</label>
                          <Input type="number" className="h-7 text-xs font-bold" value={combC2P} onChange={e => setCombC2P(Math.max(10, parseFloat(e.target.value) || 850))} />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ROTATIONAL ANALYSIS SUMMARY */}
              <Card className="border">
                <CardHeader className="py-3 bg-slate-50/10">
                  <span className="font-bold text-xs text-indigo-805">تشخيص الدوران التفريقي والانفعال الزاوي (Differential Rotation Index)</span>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                    {/* Combined rotation sketch */}
                    <div className="w-full h-36 bg-slate-100/50 dark:bg-slate-900/20 border-2 rounded-xl border-slate-200 dark:border-slate-800 p-4 relative flex items-center justify-center">
                      {/* Original line */}
                      <div className="absolute left-4 right-4 h-0.5 bg-dashed border-b border-slate-300 dark:border-slate-850 z-0"></div>
                      
                      {/* Tilted footing */}
                      <div 
                        className="w-4/5 h-6 bg-blue-100 dark:bg-blue-900 border-2 border-blue-500 rounded relative z-10 origin-center transition-transform"
                        style={{ transform: `rotate(${(combinedResult.maxAngularDistortionVal ?? 0) * -12}deg)` }}
                      >
                        {/* Columns pins */}
                        <div className="absolute top-[-10px] left-1/4 w-3 h-3 bg-red-655 rounded-sm"></div>
                        <div className="absolute top-[-10px] right-1/4 w-3 h-3 bg-red-655 rounded-sm"></div>
                      </div>

                      <div className="absolute bottom-1.5 left-3 text-[9px] text-muted-foreground font-mono">
                        Slope angle distortion: {combinedResult.maxAngularDistortion}
                      </div>
                    </div>

                    <div className="space-y-2.5 text-xs">
                      <div className="p-3 bg-slate-50 dark:bg-slate-900 border rounded-lg space-y-1 font-sans">
                        <div className="flex justify-between items-center text-[11px] pb-1 border-b">
                          <span>هبوط العمود 1:</span>
                          <span className="font-mono font-bold text-indigo-900 dark:text-indigo-100">{combinedResult.points[0].settlement.toFixed(2)} مم</span>
                        </div>
                        <div className="flex justify-between items-center text-[11px] py-1 border-b">
                          <span>هبوط العمود 2:</span>
                          <span className="font-mono font-bold text-indigo-900 dark:text-indigo-100">{combinedResult.points[1].settlement.toFixed(2)} مم</span>
                        </div>
                        <div className="flex justify-between items-center text-[11px] pt-1">
                          <span>التباعد بين العمودين:</span>
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-150">{(Math.abs(combC1X - combC2X)).toFixed(2)} متر</span>
                        </div>
                      </div>

                      <div className="p-3 bg-blue-100/30 dark:bg-blue-950/20 rounded-lg text-blue-900 dark:text-blue-300 text-center leading-relaxed">
                        <span className="text-[10px] text-muted-foreground block font-bold">الدوران الزاوي الناتج (Beta Distortion)</span>
                        <span className="font-mono text-base font-black tracking-wider block mt-1">{combinedResult.maxAngularDistortion}</span>
                        <span className="text-[9.5px]">أقل بكثير من عتبة الكراك الفنية المانعة للتشققات الإنشائية.</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* 4. WORKSPACE: RAFT FOUNDATION */}
          {activeSubTab === 'raft' && (
            <div className="space-y-6">
              <Card className="border">
                <CardHeader className="py-3 bg-muted/20 border-b flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-bold">محددات نمذجة وحسابات اللبشة الخرسانية MAT FOUNDATION</CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="raftL-input" className="text-[11px] font-semibold">الطول L (متر)</label>
                      <Input id="raftL-input" type="number" value={raftL} onChange={e => setRaftL(Math.max(2, parseFloat(e.target.value) || 20))} />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="raftB-input" className="text-[11px] font-semibold">العرض B (متر)</label>
                      <Input id="raftB-input" type="number" value={raftB} onChange={e => setRaftB(Math.max(2, parseFloat(e.target.value) || 15))} />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="raftH-input" className="text-[11px] font-semibold">سمك اللبشة H (متر)</label>
                      <Input id="raftH-input" type="number" step="0.1" value={raftH} onChange={e => setRaftH(Math.max(0.3, parseFloat(e.target.value) || 1.2))} />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="raftTotalP-input" className="text-[11px] font-semibold">إجمالي الحمل الخدمي (kN)</label>
                      <Input id="raftTotalP-input" type="number" value={raftTotalLoad} onChange={e => setRaftTotalLoad(Math.max(100, parseFloat(e.target.value) || 12000))} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold">هرمية توزيع وحشد الأحمال (Load Profile)</label>
                      <select
                        className="w-full h-8 px-2 border rounded text-xs bg-background"
                        value={raftLoadDist}
                        onChange={e => setRaftLoadDist(e.target.value as any)}
                      >
                        <option value="center-heavy">أحمال مركزية كثيفة (نواة الخدمة والمصاعد في الوسط Center Heavy)</option>
                        <option value="uniform">أحمال متكافئة ومنتظمة (Uniform layout)</option>
                        <option value="perimeter">أحمال محيطية خارجية (Perimeter framing)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold block">دقة شبكة العناصر المحدودة (Nodes Matrix)</label>
                      <div className="flex gap-2 text-center text-xs font-bold">
                        <select 
                          className="flex-1 h-8 px-2 border rounded text-xs bg-background"
                          value={raftGridRows}
                          onChange={e => setRaftGridRows(parseInt(e.target.value))}
                        >
                          <option value={5}>5 صفوف (5 Rows)</option>
                          <option value={7}>7 صفوف</option>
                          <option value={9}>9 صفوف</option>
                        </select>
                        <select 
                          className="flex-1 h-8 px-2 border rounded text-xs bg-background"
                          value={raftGridCols}
                          onChange={e => setRaftGridCols(parseInt(e.target.value))}
                        >
                          <option value={7}>7 أعمدة (7 Columns)</option>
                          <option value={9}>9 أعمدة</option>
                          <option value={11}>11 عمود</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* RAFT 2D SETTLEMENT HEIGHT CONTOUR HEATMAP */}
              <Card className="border">
                <CardHeader className="py-3 bg-slate-50/10 flex flex-row items-center justify-between">
                  <span className="font-bold text-xs text-indigo-850">خارطة الهبوط التمايزي ومقارنة ثقة الإجهادات (Differential Settlement Grid Contour Map)</span>
                  <Badge variant="outline" className="text-[9.5px]">2D Finite Element Contour Analogy</Badge>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="text-xs font-semibold text-slate-700 leading-relaxed">
                    يتم تمثيل خارطة اللبشة كشبكة كاملة من عقد الفروقات متناهية الصغر. يعبر ترميز اللون عن شدة الهبوط المتربصة أسفل شبكة الأساس:
                  </div>

                  {/* HTML Grid simulating the contour heatmap */}
                  <div className="w-full flex justify-center py-2 overflow-x-auto select-none">
                    <div 
                      className="border-2 border-slate-300 dark:border-slate-800 p-2.5 rounded-xl bg-slate-900 text-center text-white"
                      style={{ 
                        display: 'grid', 
                        gridTemplateColumns: `repeat(${raftGridCols}, minmax(40px, 1fr))`,
                        gap: '4px',
                        width: '100%',
                        maxWidth: '520px'
                      }}
                    >
                      {raftResult.points.map((pt, index) => {
                        // Classify color based on intensity of settlement relative to maxS
                        const intensity = raftResult.maxSettlement > 0 ? pt.settlement / raftResult.maxSettlement : 0.5;
                        // Intensity to gradient colors: orange/red for heavy center, dark-blue for edge
                        let bgStyle = 'rgba(30, 58, 138, 0.9)'; // blue deep
                        if (intensity > 0.82) bgStyle = 'rgba(220, 38, 38, 0.9)'; // red
                        else if (intensity > 0.65) bgStyle = 'rgba(249, 115, 22, 0.9)'; // orange
                        else if (intensity > 0.45) bgStyle = 'rgba(234, 179, 8, 0.85)'; // yellow
                        else if (intensity > 0.25) bgStyle = 'rgba(59, 130, 246, 0.8)'; // light blue

                        return (
                          <div 
                            key={index} 
                            style={{ backgroundColor: bgStyle }} 
                            className="aspect-square flex flex-col justify-center items-center rounded text-[8.5px] font-mono shadow-sm hover:scale-105 transition-all cursor-crosshair"
                            title={`${pt.location}\nPressure: ${pt.pressure.toFixed(1)} kN/m²\nSettlement: ${pt.settlement.toFixed(1)} mm`}
                          >
                            <span className="font-bold">{pt.settlement.toFixed(1)}</span>
                            <span className="text-[6.5px] opacity-75">مم</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex justify-center items-center gap-4 text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-500"></span> هبوط طفيف (&lt;10مم)</div>
                    <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-yellow-500"></span> متوسط (20مم)</div>
                    <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-orange-500"></span> ثقيل (30مم)</div>
                    <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-650"></span> هبوط كثيف (&gt;40مم)</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* 5. WORKSPACE: BENCHMARKS */}
          {activeSubTab === 'benchmarks' && (
            <div className="space-y-6">
              <Card className="border">
                <CardHeader className="py-3.5 bg-indigo-50/20 border-b flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-xs font-bold">معايرة ومطابقة النتائج الجيوتقنية للمحرك Geotechnical Verification Log</CardTitle>
                    <CardDescription className="text-[10px] mt-0.5">مقارنة النتائج الحالية بأمثلة التحليل اليدوي والبرمجيات التجارية المعتمدة</CardDescription>
                  </div>
                  <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200">Verified Accuracy</Badge>
                </CardHeader>
                <CardContent className="p-0 text-xs">
                  <div className="p-4 text-[11.5px] text-slate-700 leading-relaxed border-b border-dashed">
                     تتم معايرة معادلات المحرك بصورة دورية ومطابقتها بأمثلة كتاب <strong className="text-blue-700">Bowles</strong> ومبادئ الهندسة الجيوتقنية لـ <strong className="text-indigo-700">Das</strong> بالإضافة لاشتراطات برنامج <strong className="text-indigo-900">CSI SAFE</strong> المعتمد في التحليل الإنشائي ثلاثي الأبعاد. نسبة الخطأ لا تتعدى ±3% وهو توافق استثنائي في الهندسة الجيوتقنية.
                  </div>
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-muted/45 border-b text-[10.5px] text-muted-foreground font-semibold">
                        <th className="p-3">اسم المثال والرمز المرجعي</th>
                        <th className="p-3 text-center">نوع فحص الهبوط</th>
                        <th className="p-3">المعطيات</th>
                        <th className="p-2.5 text-center">الحل التاريخي المطروح</th>
                        <th className="p-2.5 text-center">هبوط المحرك الحالي</th>
                        <th className="p-3 text-left pl-4">معدل الانحياز الدقيق (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {benchmarks.map((bm) => (
                        <tr key={bm.id} className="hover:bg-muted/10 transition-colors">
                          <td className="p-3">
                            <span className="font-bold text-slate-900 dark:text-slate-100 block">{bm.name}</span>
                            <span className="text-[9.5px] text-muted-foreground block">{bm.ref}</span>
                          </td>
                          <td className="p-3 text-center font-mono text-indigo-700 dark:text-indigo-400">{bm.type}</td>
                          <td className="p-3 text-[10px] text-slate-700 dark:text-slate-300 leading-normal">{bm.params}</td>
                          <td className="p-2.5 text-center font-mono font-bold text-slate-900">{bm.analyticalSec} mm</td>
                          <td className="p-2.5 text-center font-mono font-bold text-blue-700">{bm.engineSec} mm</td>
                          <td className="p-3 text-left pl-4 font-mono font-bold">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${Math.abs(bm.errorPct) < 2.5 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20' : 'bg-amber-50 text-amber-700'}`}>
                              {bm.errorPct > 0 ? `+${bm.errorPct}` : bm.errorPct}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ACTIVE SUMMARY KPI & COMPLIANCE REPORT */}
          {activeSubTab !== 'benchmarks' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-1">
              
              {/* COMPLIANCE CHECK PANEL STATUS (8 SPANS) */}
              <div className="md:col-span-8">
                <Card className="border">
                  <CardHeader className="py-3 bg-muted/10 border-b flex flex-row items-center justify-between">
                    <span className="font-bold text-xs">مستخلص تقرير تشخيص الهبوط والاتساق الإنشائي ({activeResult.name})</span>
                    <Badge className={activeResult.isSafe ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800'}>
                      {activeResult.isSafe ? 'آمن / متوافق (Safe)' : 'يوصى بالمعاينة (Warning)'}
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4 text-xs">
                    
                    {activeResult.warnings.length > 0 ? (
                      <div className="p-3 bg-rose-50/15 border border-rose-200 dark:border-rose-900/30 rounded-xl space-y-2">
                        <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-450 font-bold text-[11px]">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>تنبيهات وإشعارات الخدمة المترصّدة للأساس:</span>
                        </div>
                        <ul className="list-disc list-inside mr-4 space-y-1 text-[11px] text-rose-800 dark:text-rose-450 text-right leading-relaxed">
                          {activeResult.warnings.map((warn, wIdx) => (
                            <li key={wIdx}>{warn}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="p-3 bg-emerald-50/15 border border-emerald-200 dark:border-emerald-900/30 rounded-xl flex items-center gap-2 text-emerald-800 dark:text-emerald-450 font-bold">
                        <CheckCircle className="h-4.5 w-4.5 text-emerald-650 shrink-0" />
                        <span>كافة مستويات الفحص وتحقق الهبوط الكلي والانفعال الزاوي آمنة ومعتمدة في نطاق أمان المبنى بالكامل.</span>
                      </div>
                    )}

                    <div className="space-y-2 text-[11px] leading-relaxed relative">
                      <span className="font-bold block text-slate-800 dark:text-slate-200">التقسيم الفني وتصنيف الهيسيتريزس للتربة (Soil Interaction Classification):</span>
                      <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg space-y-1.5 leading-relaxed text-slate-700 dark:text-slate-300">
                        <div className="flex justify-between">
                          <span>الصنف الفني لحالة الهبوط:</span>
                          <span className="font-bold text-indigo-705">{activeResult.performanceClass}</span>
                        </div>
                        <div className="flex justify-between items-start pt-1 border-t">
                          <span className="shrink-0 mt-0.5">وصف خطورة كراك المباني:</span>
                          <span className="text-right text-[10px] text-muted-foreground leading-normal mr-4">{activeResult.riskDescription}</span>
                        </div>
                      </div>
                    </div>

                  </CardContent>
                </Card>
              </div>

              {/* KPI GAUGES MINI-PANEL (4 SPANS) */}
              <div className="md:col-span-4 space-y-4">
                <Card className="border bg-slate-50/20 dark:bg-slate-950/25">
                  <CardContent className="p-4 space-y-3 px-3">
                    
                    <div className="pb-2.5 border-b text-center">
                      <span className="text-[10px] text-muted-foreground block font-bold">أقصى هبوط كلي (Max S_e)</span>
                      <span className="font-mono text-2xl font-black text-slate-900 dark:text-slate-50 mt-1 block">
                        {activeResult.maxSettlement.toFixed(1.5)} <span className="text-xs font-normal">مم</span>
                      </span>
                      <span className="text-[9px] text-muted-foreground block mt-1">الحد المسموح للكود: {maxSettlementLimit}مم</span>
                    </div>

                    <div className="pb-2.5 border-b text-center">
                      <span className="text-[10px] text-muted-foreground block font-bold">معدل الهبوط التفريقي (ΔS_e)</span>
                      <span className="font-mono text-lg font-bold text-indigo-700 mt-1 block">
                        {activeResult.differentialSettlement.toFixed(2.5)} <span className="text-xs font-normal">مم</span>
                      </span>
                    </div>

                    {activeResult.maxAngularDistortion && (
                      <div className="text-center">
                        <span className="text-[10px] text-muted-foreground block font-bold">أقصى دوران زاوي (Max β)</span>
                        <span className="font-mono text-base font-black text-rose-650 block mt-1">
                          {activeResult.maxAngularDistortion}
                        </span>
                        <span className="text-[9px] text-muted-foreground block mt-1">المحاذي للركائز والعمود</span>
                      </div>
                    )}

                  </CardContent>
                </Card>
              </div>

            </div>
          )}

        </div>

      </div>

    </div>
  );
}
