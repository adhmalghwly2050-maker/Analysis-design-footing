import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import {
  Settings, Layers, RefreshCw, BarChart3, ListChecks, HelpCircle,
  TrendingUp, CheckCircle, AlertTriangle, Hammer, Grid3X3, Copy, Scale, Plus, Trash2, Edit
} from 'lucide-react';
import {
  type FoundationInstance,
  type FoundationType,
  type GroupingTolerances,
  type FoundationSystemType,
  classifyAndGroupFoundations,
  calculateProjectFoundationStats,
  validateFoundationDatabase,
  generateSampleFoundations,
  calculateConcreteVolume,
  calculateSteelWeight
} from '@/lib/foundationClassificationEngine';

interface FoundationGroupEnginePanelProps {
  initialBatchResults?: any[];
  onConfigApplied?: (types: FoundationType[]) => void;
}

export default function FoundationGroupEnginePanel({
  initialBatchResults = [],
  onConfigApplied
}: FoundationGroupEnginePanelProps) {
  
  // --- 1. State Managers ---
  const [instances, setInstances] = useState<FoundationInstance[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('all');
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  
  // Custom grouping tolerances state
  const [tolerances, setTolerances] = useState<GroupingTolerances>({
    lengthTolerance: 100,      // mm
    widthTolerance: 100,       // mm
    thicknessTolerance: 50,    // mm
    loadTolerance: 0.20,       // 20%
    matchReinforcementExact: false,
    forceSameSystem: true
  });

  // Custom Tag Overrides database (Map: core geometric key -> user tag)
  const [userTagOverrides, setUserTagOverrides] = useState<Record<string, string>>({});

  // Feedback notifications
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'info' | 'warn'; text: string } | null>(null);

  // New custom foundation builder states
  const [isAddingCustom, setIsAddingCustom] = useState<boolean>(false);
  const [newInst, setNewInst] = useState<{
    name: string;
    systemType: FoundationSystemType;
    x: number;
    y: number;
    B: number;
    L: number;
    t: number;
    cols: string;
    diaX: number;
    cntX: number;
    diaY: number;
    cntY: number;
    P: number;
  }>({
    name: 'قاعدة جديدة',
    systemType: 'isolated',
    x: 2.0,
    y: 2.0,
    B: 1800,
    L: 1800,
    t: 500,
    cols: 'C10',
    diaX: 14,
    cntX: 10,
    diaY: 14,
    cntY: 10,
    P: 350
  });

  // --- 2. Seed Initialization ---
  // Seed with sample foundations (Isolated, Strip, Combined, Raft) OR convert from Batch Results on load
  useEffect(() => {
    if (initialBatchResults && initialBatchResults.length > 0) {
      // Convert batch results to standard classification schemas
      const converted: FoundationInstance[] = initialBatchResults.map((br, idx) => ({
        id: br.colId ? `F_${br.colId}` : `F_B_${idx}`,
        name: `قاعدة ممتازة للعمود ${br.colId || idx}`,
        systemType: 'isolated',
        x: br.x ?? (idx * 3.5),
        y: br.y ?? (idx % 2 === 0 ? 0 : 4.0),
        B: br.B ?? 1800,
        L: br.L ?? 1800,
        t: br.t ?? 500,
        columnIds: br.colId ? [br.colId] : [`C${idx}`],
        rebarX: { barDia: br.dia_x ?? 14, count: br.bars_x ?? 10, spacing: br.spacing_x ?? 180 },
        rebarY: { barDia: br.dia_y ?? 14, count: br.bars_y ?? 10, spacing: br.spacing_y ?? 180 },
        serviceLoad: { P: br.P_service ?? 280, Mx: 5, My: 5 }
      }));
      
      // Inject a strip and combined footing to make sure other types are visible/supported even from building import
      converted.push({
        id: 'SF_AUTO_W1',
        name: 'أساس شريطي للجدار SF1',
        systemType: 'strip',
        x: -4.0,
        y: 2.0,
        B: 1200,
        L: 6000,
        t: 450,
        columnIds: ['W1', 'W2'],
        rebarX: { barDia: 12, count: 8, spacing: 150 },
        rebarY: { barDia: 12, count: 30, spacing: 200 },
        serviceLoad: { P: 320, Mx: 0, My: 0 }
      });

      setInstances(converted);
      triggerBanner('info', 'تم بنجاح تحميل وتوليد مصفوفة القواعد الموطنة من التحليل الثلاثي الأبعاد للبناء الحقيقي!');
    } else {
      // Use default multi-system sample database
      setInstances(generateSampleFoundations());
    }
  }, [initialBatchResults]);

  // Helper inside toast helper
  const triggerBanner = (type: 'success' | 'info' | 'warn', text: string) => {
    setAlertMessage({ type, text });
    setTimeout(() => {
      setAlertMessage(null);
    }, 5000);
  };

  // --- 3. Dynamic Calculation Engine Core ---
  // Calculates live classifications, grouping matrices, statistics and validation errors on every trigger change or state update
  const engineResults = useMemo(() => {
    // Phase A: Run classification & grouping
    let { types, groupedInstances, groups } = classifyAndGroupFoundations(instances, tolerances);

    // Phase B: Incorporate custom tags stability overrides
    types = types.map(t => {
      // A unique key is derived from standard properties to bind user preferences
      const key = `${t.systemType}_B${t.B}_L${t.L}_t${t.t}`;
      const overTag = userTagOverrides[key];
      if (overTag) {
        return { ...t, tag: overTag, userOverriddenTag: overTag };
      }
      return t;
    });

    // Re-bind stable tags back to instances
    const finalInstances = groupedInstances.map(inst => {
      const typeOfInst = types.find(t => t.id === inst.typeId);
      return {
        ...inst,
        tag: typeOfInst ? typeOfInst.tag : (inst.tag ?? 'F_UNK')
      };
    });

    // Recalculate global project quantities & metrics
    const stats = calculateProjectFoundationStats(finalInstances, types);

    // Perform validation audits
    const validation = validateFoundationDatabase(finalInstances, types);

    if (onConfigApplied) {
      onConfigApplied(types);
    }

    return {
      types,
      instances: finalInstances,
      groups,
      stats,
      validation
    };
  }, [instances, tolerances, userTagOverrides]);

  // Destructure reactive values
  const { types, instances: classifiedInstances, stats, validation } = engineResults;

  // --- 4. Interactive Layout Visual Coordinates Plotter ---
  // Computes the maximum boundary of coordinates to dynamically scale CAD-viewer
  const visualExtent = useMemo(() => {
    if (classifiedInstances.length === 0) return { minX: 0, maxX: 10, minY: 0, maxY: 10 };
    const xs = classifiedInstances.map(i => i.x);
    const ys = classifiedInstances.map(i => i.y);
    return {
      minX: Math.min(...xs) - 2.5,
      maxX: Math.max(...xs) + 2.5,
      minY: Math.min(...ys) - 2.5,
      maxY: Math.max(...ys) + 2.5
    };
  }, [classifiedInstances]);

  // Helper to color codes foundations differently depending on their classification tags for awesome bento design
  const getTagColor = (tag: string, system: FoundationSystemType): { bg: string; stroke: string; light: string } => {
    if (tag.startsWith('F1') || tag === 'F1') return { bg: 'rgba(59, 130, 246, 0.1)', stroke: '#3b82f6', light: 'bg-blue-500/10 text-blue-500 border-blue-500/20' };
    if (tag.startsWith('F2') || tag === 'F2') return { bg: 'rgba(16, 185, 129, 0.1)', stroke: '#10b981', light: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' };
    if (tag.startsWith('F')) return { bg: 'rgba(14, 165, 233, 0.1)', stroke: '#0ea5e9', light: 'bg-sky-500/10 text-sky-500 border-sky-500/20' };
    if (tag.startsWith('SF')) return { bg: 'rgba(249, 115, 22, 0.1)', stroke: '#f97316', light: 'bg-orange-500/10 text-orange-500 border-orange-500/20' };
    if (tag.startsWith('CF')) return { bg: 'rgba(139, 92, 246, 0.1)', stroke: '#8b5cf6', light: 'bg-violet-500/10 text-violet-500 border-violet-500/20' };
    if (tag.startsWith('RF')) return { bg: 'rgba(236, 72, 153, 0.1)', stroke: '#ec4899', light: 'bg-pink-500/10 text-pink-500 border-pink-500/20' };
    return { bg: 'rgba(107, 114, 128, 0.1)', stroke: '#6b7280', light: 'bg-gray-500/10 text-gray-500 border-gray-500/20' };
  };

  // --- 5. Handlers & Actions ---
  // Edit instance properties inline
  const handleInstanceDimensionChange = (id: string, field: 'B' | 'L' | 't', value: number) => {
    setInstances(prev => prev.map(inst => {
      if (inst.id === id) {
        return { ...inst, [field]: value, hasManualOverride: true };
      }
      return inst;
    }));
  };

  // Change custom tags
  const handleTagOverrideChange = (type: FoundationType, value: string) => {
    const key = `${type.systemType}_B${type.B}_L${type.L}_t${type.t}`;
    setUserTagOverrides(prev => ({
      ...prev,
      [key]: value
    }));
    triggerBanner('success', `تم تغيير وسم النموذج بنجاح من (${type.tag}) إلى (${value}) وتثبيته بالمخطط والمطابقات!`);
  };

  // Delete foundation instance
  const handleDeleteInstance = (id: string) => {
    setInstances(prev => prev.filter(i => i.id !== id));
    triggerBanner('warn', `تم مسح العنصر الأساسي ذو المعرف (${id}) من قاعدة البيانات.`);
  };

  // Add customized foundation instance
  const handleAddCustomFoundation = () => {
    if (!newInst.cols || newInst.B <= 0 || newInst.L <= 0) {
      triggerBanner('warn', 'يرجى إدخال بيانات صحيحة للأبعاد والمسمى.');
      return;
    }

    const added: FoundationInstance = {
      id: `CUST_${Date.now()}`,
      name: newInst.name,
      systemType: newInst.systemType,
      x: Number(newInst.x),
      y: Number(newInst.y),
      B: Number(newInst.B),
      L: Number(newInst.L),
      t: Number(newInst.t),
      columnIds: newInst.cols.split(',').map(s => s.trim()),
      rebarX: { barDia: Number(newInst.diaX), count: Number(newInst.cntX), spacing: 150 },
      rebarY: { barDia: Number(newInst.diaY), count: Number(newInst.cntY), spacing: 150 },
      serviceLoad: { P: Number(newInst.P), Mx: 10, My: 10 }
    };

    setInstances(prev => [...prev, added]);
    setIsAddingCustom(false);
    triggerBanner('success', `تمت إضافة القاعدة المستهدفة (${newInst.name}) وإعادة تصنيف وتوحيد المجموعات تلقائياً!`);
  };

  // Filter instances lists depending on selected type
  const sortedAndFilteredInstances = useMemo(() => {
    if (selectedTypeId === 'all') return classifiedInstances;
    return classifiedInstances.filter(i => i.typeId === selectedTypeId);
  }, [classifiedInstances, selectedTypeId]);

  // Concrete dynamic pricing assumption (Standard regional average: $110/m3 inclusive work)
  const CONCRETE_UNIT_COST = 110; 
  // High-tensile reinforcement steel pricing assumption ($1,150 per metric ton)
  const STEEL_UNIT_COST = 1.15; // per kg

  return (
    <div id="foundation-type-group-engine-main" className="space-y-6 text-right" dir="rtl">
      
      {/* ── Toast Success / Feedback ── */}
      {alertMessage && (
        <div className={`fixed bottom-6 left-6 z-50 rounded-xl px-5 py-3 border shadow-lg flex items-center gap-3 transition-all animate-bounce ${
          alertMessage.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-100 border-emerald-500/30' :
          alertMessage.type === 'warn' ? 'bg-amber-50 dark:bg-amber-950/90 text-amber-800 dark:text-amber-100 border-amber-500/30' :
          'bg-blue-50 dark:bg-blue-950/90 text-blue-800 dark:text-blue-100 border-blue-500/30'
        }`}>
          {alertMessage.type === 'success' && <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />}
          {alertMessage.type === 'warn' && <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />}
          {alertMessage.type === 'info' && <RefreshCw className="h-5 w-5 text-blue-500 shrink-0" />}
          <span className="text-xs font-semibold">{alertMessage.text}</span>
        </div>
      )}

      {/* ── Dashboard Key Metrics Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        
        {/* Metric 1: Total Foundations */}
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-4 flex items-center justify-between pb-4">
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground block">إجمالي القواعد المنفذة</span>
              <span className="text-2xl font-black text-foreground font-mono">{stats.totalCount}</span>
              <span className="text-[10px] text-muted-foreground block">قاعدة مستقلة / مشتركة / مستمرة</span>
            </div>
            <div className="h-10 w-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500">
              <Grid3X3 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Metric 2: Total Distinct Types */}
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-4 flex items-center justify-between pb-4">
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground block">عدد النماذج الفريدة (Types)</span>
              <span className="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono">{stats.totalTypes}</span>
              <span className="text-[10px] text-muted-foreground block">نماذج معيارية متميزة</span>
            </div>
            <div className="h-10 w-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-500">
              <Layers className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Metric 3: Optimization / Unification Ratio */}
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-4 flex items-center justify-between pb-4">
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground block">معامل توحيد وتكرار القوالب</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                  {stats.unificationRatio.toFixed(1)}
                </span>
                <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/15 border-none text-[10px]">
                  مستوى عالي
                </Badge>
              </div>
              <span className="text-[10px] text-muted-foreground block">قاعدة لكل نموذج (النموذج الأعلى أفضل للموقع)</span>
            </div>
            <div className="h-10 w-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
              <TrendingUp className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Metric 4: Concrete Quantities */}
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-4 flex items-center justify-between pb-4">
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground block">إجمالي كمية الخرسانة (Concrete)</span>
              <span className="text-2xl font-black text-amber-600 font-mono">{stats.totalConcreteVolume.toFixed(1)} <sub className="text-xs uppercase">m³</sub></span>
              <span className="text-[10px] text-muted-foreground block">حجم الصب الصافي لكافة القواعد</span>
            </div>
            <div className="h-10 w-10 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500">
              <Scale className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Metric 5: Reinforcement Weight */}
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-4 flex items-center justify-between pb-4">
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground block">إجمالي وزن حديد التسليح (Steel)</span>
              <span className="text-2xl font-black text-rose-600  font-mono">{(stats.totalSteelWeight / 1000).toFixed(2)} <sub className="text-xs uppercase">Ton</sub></span>
              <span className="text-[10px] text-muted-foreground block">تساوي {stats.totalSteelWeight.toLocaleString(undefined, { maximumFractionDigits: 0 })} كجم</span>
            </div>
            <div className="h-10 w-10 bg-rose-500/10 rounded-xl flex items-center justify-center text-rose-500">
              <Hammer className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

      </div>

      {/* ── TWO-COLUMN WORKSPACE: Config & Visual Plotter ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Tolerances Controls */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Settings className="h-4 w-4 text-blue-600" />
                    معايير تصنيف وضبط المجموعات
                  </CardTitle>
                  <CardDescription className="text-[11px] text-muted-foreground">
                    قم بضبط قيم التفاوت المسموح بها لتكرار القواعد المتطابقة جغرافياً وإنشائياً للحد من النماذج
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              
              {/* Width Tolerance */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="font-semibold text-foreground">تفاوت العرض (Width Tolerance) :</span>
                  <span className="font-bold text-blue-600 font-mono">± {tolerances.widthTolerance} mm</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="500"
                  step="25"
                  value={tolerances.widthTolerance}
                  onChange={(e) => setTolerances(prev => ({ ...prev, widthTolerance: Number(e.target.value) }))}
                  className="w-full text-blue-600 accent-blue-600"
                />
              </div>

              {/* Length Tolerance */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="font-semibold text-foreground">تفاوت الطول (Length Tolerance) :</span>
                  <span className="font-bold text-blue-600 font-mono">± {tolerances.lengthTolerance} mm</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="500"
                  step="25"
                  value={tolerances.lengthTolerance}
                  onChange={(e) => setTolerances(prev => ({ ...prev, lengthTolerance: Number(e.target.value) }))}
                  className="w-full text-blue-600 accent-blue-600"
                />
              </div>

              {/* Thickness Tolerance */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="font-semibold text-foreground">تفاوت السمك (Thickness Tolerance) :</span>
                  <span className="font-bold text-blue-600 font-mono">± {tolerances.thicknessTolerance} mm</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="200"
                  step="10"
                  value={tolerances.thicknessTolerance}
                  onChange={(e) => setTolerances(prev => ({ ...prev, thicknessTolerance: Number(e.target.value) }))}
                  className="w-full text-blue-600 accent-blue-600"
                />
              </div>

              {/* Load Capacity Tolerance */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="font-semibold text-foreground">حد التفاوت في الأحمال الخدمية (Loads) :</span>
                  <span className="font-bold text-blue-600 font-mono">± {(tolerances.loadTolerance * 100).toFixed(0)} %</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="5"
                  value={tolerances.loadTolerance * 100}
                  onChange={(e) => setTolerances(prev => ({ ...prev, loadTolerance: Number(e.target.value) / 100 }))}
                  className="w-full text-blue-600 accent-blue-600"
                />
              </div>

              {/* Switch exact reinforcement alignment */}
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="font-semibold text-foreground text-[11px]">اشتراط مطابقة حديد التسليح تماماً (Rebar)</span>
                <input
                  type="checkbox"
                  checked={tolerances.matchReinforcementExact}
                  onChange={(e) => setTolerances(prev => ({ ...prev, matchReinforcementExact: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </div>

              {/* Force Same Foundation System Type */}
              <div className="flex items-center justify-between pt-1">
                <span className="font-semibold text-foreground text-[11px]">عزل الأنظمة الإنشائية تلقائياً</span>
                <Badge className="bg-blue-600 text-white font-semibold text-[10px]">مفعل دائماً</Badge>
              </div>

              <div className="bg-blue-500/5 p-3 rounded-lg border border-blue-500/10 text-muted-foreground text-[11px] leading-relaxed">
                <strong>💡 مبدأ التصاميم الحاكمة للمعايير:</strong>
                <p className="mt-1">
                  عند دمج عدة قواعد غير متطابقة تحت نموذج واحد (مثلاً F1)، يقوم النظام بحساب <strong>الأبعاد القصوى وكميات التسليح الأغزر</strong> لتمثيل النموذج تلافياً للقصور الإنشائي بمواقع القواعد المدمجة.
                </p>
              </div>

            </CardContent>
          </Card>
        </div>

        {/* Right Side: Interactive Layout Diagram Plotter */}
        <div id="interactive-layout-grid-diagram" className="lg:col-span-2 space-y-4">
          <Card className="h-full border-border flex flex-col justify-between">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Grid3X3 className="h-4 w-4 text-blue-600" />
                    مخطط توزيع القواعد والتحليلات البصرية (Interactive Layout Map)
                  </CardTitle>
                  <CardDescription className="text-[11px] text-muted-foreground">
                    عرض تفاعلي ثنائي الأبعاد لمخطط الأساسات. انقر فوق أي قاعدة لتحديدها وعرض تفاصيل تسليحها ومطابقة نموذجها بالمجموعات المصنفة.
                  </CardDescription>
                </div>
                {selectedInstanceId && (
                  <Button variant="outline" size="xs" className="h-7 text-[10px]" onClick={() => setSelectedInstanceId(null)}>
                    إلغاء التحديد البصري
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center items-center py-4 min-h-[300px]">
              {classifiedInstances.length === 0 ? (
                <div className="text-center text-muted-foreground py-10 text-xs">لا تتوفر أي قواعد حالياً بالمخطط الإنشائي.</div>
              ) : (
                <div className="w-full relative flex items-center justify-center">
                  
                  {/* SVG Canvas Plotter */}
                  <svg
                    viewBox="0 0 650 320"
                    className="w-full max-h-[320px] bg-muted/20 dark:bg-muted/5 rounded-xl border border-border overflow-visible"
                  >
                    {/* Grid Background */}
                    <defs>
                      <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
                        <path d="M 25 0 L 0 0 0 25" fill="none" stroke="rgba(148, 163, 184, 0.08)" strokeWidth="1" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />

                    {/* Plotter elements */}
                    {classifiedInstances.map(inst => {
                      // Project physical coordinate coordinates (m) to SVG Canvas space
                      const svgW = 650;
                      const svgH = 320;
                      
                      const rangeX = visualExtent.maxX - visualExtent.minX || 1;
                      const rangeY = visualExtent.maxY - visualExtent.minY || 1;

                      const mapX = (x: number) => ((x - visualExtent.minX) / rangeX) * (svgW - 80) + 40;
                      const mapY = (y: number) => svgH - (((y - visualExtent.minY) / rangeY) * (svgH - 60) + 30); // inverted y coordinate for cartesian space

                      const cx = mapX(inst.x);
                      const cy = mapY(inst.y);

                      // Width and Height scaled down accordingly (meters * scale ratio)
                      const sizeScale = Math.min(
                        (svgW - 80) / rangeX / 1000,
                        (svgH - 60) / rangeY / 1000
                      ) * 0.9;

                      const wSvg = inst.B * sizeScale;
                      const lSvg = inst.L * sizeScale;

                      const colors = getTagColor(inst.tag ?? '', inst.systemType);
                      const isSelected = selectedInstanceId === inst.id;
                      
                      // Highlight all of the same type when an instance is selected!
                      const targetInst = classifiedInstances.find(f => f.id === selectedInstanceId);
                      const isSameType = targetInst ? inst.typeId === targetInst.typeId : false;

                      return (
                        <g
                          key={inst.id}
                          className="cursor-pointer transition-all duration-300"
                          onClick={() => setSelectedInstanceId(inst.id === selectedInstanceId ? null : inst.id)}
                        >
                          {/* Main Footing Outline */}
                          <rect
                            x={cx - wSvg / 2}
                            y={cy - lSvg / 2}
                            width={wSvg}
                            height={lSvg}
                            rx={inst.systemType === 'raft' ? 8 : 4}
                            fill={colors.bg}
                            stroke={isSelected ? '#3b82f6' : isSameType ? '#e11d48' : colors.stroke}
                            strokeWidth={isSelected ? 3.5 : isSameType ? 2.5 : 1.5}
                            strokeDasharray={inst.systemType === 'strip' ? '4,4' : undefined}
                            className="transition-all hover:opacity-80"
                          />

                          {/* Column Outline Sitting in Center */}
                          {inst.columnIds.length > 0 && (
                            <rect
                              x={cx - 5}
                              y={cy - 5}
                              width={10}
                              height={10}
                              fill="#475569"
                              stroke="#1e293b"
                              strokeWidth="1"
                            />
                          )}

                          {/* Footing Tag Mark Label */}
                          <text
                            x={cx}
                            y={cy - (lSvg / 2) - 6}
                            fontSize="9"
                            fontWeight="bold"
                            fill={isSelected ? '#2563eb' : isSameType ? '#be123c' : '#334155'}
                            textAnchor="middle"
                            fontFamily="monospace"
                          >
                            {inst.tag}-{inst.id.replace('F_', '').replace('CUST_', 'C')}
                          </text>

                          {/* Render Dimensions Tag inside rectangle if wide enough */}
                          {wSvg > 38 && (
                            <text
                              x={cx}
                              y={cy + 3}
                              fontSize="7.5"
                              fill="#64748b"
                              textAnchor="middle"
                            >
                              {inst.B / 1000}×{inst.L / 1000}
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* Scale legend label at bottom bottom */}
                    <text x="50" y="300" fontSize="9" fill="#94a3b8" fontWeight="bold">المقياس بـ أمتار الموقع متمحور - Scale (meters)</text>
                  </svg>

                </div>
              )}
            </CardContent>
            {selectedInstanceId && (() => {
              const inst = classifiedInstances.find(i => i.id === selectedInstanceId);
              if (!inst) return null;
              const matchesTypeCount = classifiedInstances.filter(i => i.typeId === inst.typeId).length;
              return (
                <div className="bg-blue-500/5 p-3 rounded-b-xl border-t border-border flex items-center justify-between text-xs">
                  <div className="flex gap-4">
                    <span>اسم القاعدة: <strong>{inst.name}</strong></span>
                    <span>النوع: <strong className="font-mono text-blue-600">{inst.tag}</strong></span>
                    <span>الأبعاد: <strong>{inst.B} × {inst.L} × {inst.t} مم</strong></span>
                    <span>أعمدة مسندة: <strong>{inst.columnIds.join(', ')}</strong></span>
                  </div>
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                    مجموعة تضم {matchesTypeCount} نماذج متماثلة
                  </Badge>
                </div>
              );
            })()}
          </Card>
        </div>

      </div>

      {/* ── ALERTS / RE-EVALUATION WARNINGS ── */}
      {validation.warnings.length > 0 && (
        <Card className="border-rose-500/20 bg-rose-500/5">
          <CardContent className="py-3 px-4 flex items-start gap-2 text-rose-700 dark:text-rose-100 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold block">تحذيرات التشخيص البرمجية (Validation Engine Logs):</span>
              <ul className="list-disc pr-4 space-y-0.5 mt-1 text-[11px]">
                {validation.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── SECTION A: GOVERNED FOUNDATION TYPE SCHEDULES (Central Source for Schedule & Draw) ── */}
      <Card className="border-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-emerald-600" />
              جدول تصنيف ونمذجة الأساسات المعتمد (Governed Foundation Types Schedule)
            </CardTitle>
            <CardDescription className="text-[11px] text-muted-foreground">
              الجدول التراكمي الموحد لتصدير المخططات والتسليح. يعتمد القيم الموحدة القصوى (الأسوأ إنشائياً) لضمان متطلبات المتانة ومقاومة قوى القص والاختراق.
            </CardDescription>
          </div>
          <select
            value={selectedTypeId}
            onChange={(e) => setSelectedTypeId(e.target.value)}
            className="w-40 h-8 px-2 rounded border border-input text-xs bg-background"
          >
            <option value="all">عرض كافة النماذج</option>
            {types.map(t => (
              <option key={t.id} value={t.id}>{t.tag} ({t.systemType.toUpperCase()})</option>
            ))}
          </select>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/10">
              <TableRow>
                <TableHead className="text-right text-xs">نموذج القواعد</TableHead>
                <TableHead className="text-right text-xs">نظام الأساس</TableHead>
                <TableHead className="text-right text-xs">العرض B (مم)</TableHead>
                <TableHead className="text-right text-xs">الطول L (مم)</TableHead>
                <TableHead className="text-right text-xs">السمك t (مم)</TableHead>
                <TableHead className="text-right text-xs">تسليح الاتجاه العريض (X)</TableHead>
                <TableHead className="text-right text-xs">تسليح الاتجاه الموازي (Y)</TableHead>
                <TableHead className="text-right text-xs font-mono">الحمل الحاكم P (kN)</TableHead>
                <TableHead className="text-right text-xs">خرسانة م³</TableHead>
                <TableHead className="text-right text-xs">وزن الحديد كجم</TableHead>
                <TableHead className="text-center text-xs w-48">تعديل وسم اللوحة (Custom Tag)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground py-6 text-xs">
                    لا تتوفر موديلات تم توليدها.
                  </TableCell>
                </TableRow>
              ) : (
                types
                  .filter(t => selectedTypeId === 'all' || t.id === selectedTypeId)
                  .map(type => {
                    const tagStyle = getTagColor(type.tag, type.systemType).light;
                    return (
                      <TableRow key={type.id} className="hover:bg-muted/5">
                        <TableCell className="font-bold">
                          <span className={`px-2 py-0.5 rounded border text-[10px] font-mono leading-none ${tagStyle}`}>
                            {type.tag}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-semibold">
                          {type.systemType === 'isolated' && 'منفرد (Isolated)'}
                          {type.systemType === 'strip' && 'شريطي (Strip)'}
                          {type.systemType === 'combined' && 'مشترك (Combined)'}
                          {type.systemType === 'raft' && 'لبشة (Raft)'}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold text-foreground">{type.B}</TableCell>
                        <TableCell className="font-mono text-xs font-bold text-foreground">{type.L}</TableCell>
                        <TableCell className="font-mono text-xs font-bold text-foreground">{type.t}</TableCell>
                        <TableCell className="text-xs">
                          {type.rebarX.count} ɸ {type.rebarX.barDia}
                        </TableCell>
                        <TableCell className="text-xs">
                          {type.rebarY.count} ɸ {type.rebarY.barDia}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold text-cyan-700 dark:text-cyan-400">
                          {type.designLoads.P.toFixed(1)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-amber-700 dark:text-amber-400">
                          {type.concreteVolume.toFixed(2)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-rose-700 dark:text-rose-400">
                          {type.steelWeight.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center items-center gap-2">
                            <Input
                              type="text"
                              value={type.userOverriddenTag || ''}
                              placeholder="أدخل وسم مخصص (C-T)"
                              className="h-7 text-[11px] w-28 text-center"
                              onChange={(e) => handleTagOverrideChange(type, e.target.value)}
                            />
                            {type.userOverriddenTag && (
                              <Button
                                size="xs"
                                variant="ghost"
                                className="h-7 w-7 text-rose-500"
                                onClick={() => handleTagOverrideChange(type, '')}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── SECTION B: DETAILED INSTANCE LISTINGS & REAL-TIME CHANGE MANAGEMENT ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Column 1 & 2: Full editable instances database lists */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-blue-600" />
                  جرد وإحصاء القواعد وتعيين النماذج (Instances & Tag Assigner)
                </CardTitle>
                <CardDescription className="text-[11px] text-muted-foreground">
                  جرد ومسح لكافة العناصر بالموقع. يتيح لك تعديل الأبعاد يدويًا، حيث سيقوم محرك التجميع تلقائيًا بمطابقة وإعادة تعيين نموذج اللوحة وضبط الوزن والمجموعات بالتزامن.
                </CardDescription>
              </div>
              <Button size="xs" className="h-8 gap-1.5" onClick={() => setIsAddingCustom(true)}>
                <Plus className="h-3.5 w-3.5" />
                إضافة قاعدة مخصصة
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/10">
                  <TableRow>
                    <TableHead className="text-right text-xs">العنصر</TableHead>
                    <TableHead className="text-right text-xs">أعمدة ممررة</TableHead>
                    <TableHead className="text-right text-xs font-mono">الإحداثيات (x, y)</TableHead>
                    <TableHead className="text-right text-xs">النموذج الملحق</TableHead>
                    <TableHead className="text-right text-xs w-28">العرض B (مم)</TableHead>
                    <TableHead className="text-right text-xs w-28">الطول L (مم)</TableHead>
                    <TableHead className="text-right text-xs w-24">السمك t (مم)</TableHead>
                    <TableHead className="text-center text-xs w-20">الخيارات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedAndFilteredInstances.map(inst => {
                    const tagStyle = getTagColor(inst.tag ?? '', inst.systemType).light;
                    const isSelected = selectedInstanceId === inst.id;
                    return (
                      <TableRow
                        key={inst.id}
                        className={`hover:bg-muted/5 transition-colors ${isSelected ? 'bg-blue-500/5 border-l-2 border-l-blue-500' : ''}`}
                      >
                        <TableCell className="font-bold text-xs">
                          <button
                            onClick={() => setSelectedInstanceId(inst.id === selectedInstanceId ? null : inst.id)}
                            className="hover:underline text-blue-600 dark:text-blue-400 block text-right"
                          >
                            {inst.name}
                          </button>
                          {inst.hasManualOverride && (
                            <Badge className="bg-amber-500/10 text-amber-500 text-[9px] hover:bg-amber-500/15 border-none leading-none scale-90 origin-right">
                              تعديل مخصص
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{inst.columnIds.join(', ')}</TableCell>
                        <TableCell className="text-xs font-mono">({inst.x.toFixed(1)}, {inst.y.toFixed(1)})</TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold leading-none ${tagStyle}`}>
                            {inst.tag}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="50"
                            value={inst.B}
                            className="h-7 text-xs font-mono w-24"
                            onChange={(e) => handleInstanceDimensionChange(inst.id, 'B', Number(e.target.value))}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="50"
                            value={inst.L}
                            className="h-7 text-xs font-mono w-24"
                            onChange={(e) => handleInstanceDimensionChange(inst.id, 'L', Number(e.target.value))}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="50"
                            value={inst.t}
                            className="h-7 text-xs font-mono w-20"
                            onChange={(e) => handleInstanceDimensionChange(inst.id, 't', Number(e.target.value))}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="xs"
                            variant="ghost"
                            className="h-7 w-7 text-rose-500 hover:text-rose-600"
                            onClick={() => handleDeleteInstance(inst.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Column 3: Bill of Quantities & Material cost projection cards */}
        <div id="boq-cost-projection-cards" className="lg:col-span-1 space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-amber-600" />
                تقرير وجدول حساب الكميات الفني (BOQ Reports)
              </CardTitle>
              <CardDescription className="text-[11px]">
                تقديرات استهلاكية دقيقة ومحسوبة بالاعتماد الكلي على خصائص النماذج الحاكمة الحالية بمشروعك ومعدل الأسعار التقديري.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4 text-xs">
              
              {/* Detailed Materials Item Details */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[11px] pb-1 border-b border-border">
                  <span className="font-bold text-foreground">بند الأعمال ومواد التشييد</span>
                  <span className="font-bold text-foreground">الكمية المقدرة</span>
                </div>

                <div className="flex justify-between items-center">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-foreground">1. خرسانة مسلحة عيار C30 (قواعد)</span>
                    <span className="text-[10px] text-muted-foreground block">مكعبات الصب شاملة أعمال الهياكل</span>
                  </div>
                  <span className="font-black text-muted-foreground font-mono bg-muted/30 px-2 py-1 rounded">
                    {stats.totalConcreteVolume.toFixed(2)} م³
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-foreground">2. حديد تسليح عالي الضغط Φ14/Φ16</span>
                    <span className="text-[10px] text-muted-foreground block">عزوم وقص وربط القواعد الخدمية</span>
                  </div>
                  <span className="font-black text-muted-foreground font-mono bg-muted/30 px-2 py-1 rounded">
                    {stats.totalSteelWeight.toLocaleString(undefined, { maximumFractionDigits: 0 })} كجم
                  </span>
                </div>
              </div>

              {/* Live Cost Estimation Model */}
              <div className="p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/15 space-y-3">
                <span className="font-bold text-emerald-800 dark:text-emerald-300 block text-[11px]">التقدير المالي الأولي للعمليات (Preliminary Valuation)</span>
                
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">تكلفة الخرسانة التقريبية :</span>
                    <span className="font-bold font-mono text-emerald-700 dark:text-emerald-400">
                      $ {(stats.totalConcreteVolume * CONCRETE_UNIT_COST).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">تكلفة حديد التسليح التقريبية :</span>
                    <span className="font-bold font-mono text-emerald-700 dark:text-emerald-400">
                      $ {(stats.totalSteelWeight * STEEL_UNIT_COST).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="border-t border-emerald-500/10 pt-2 flex justify-between font-bold text-emerald-900 dark:text-white text-xs">
                    <span>إجمالي تكلفة الأساسات المتوقعة :</span>
                    <span className="font-mono">
                      $ {((stats.totalConcreteVolume * CONCRETE_UNIT_COST) + (stats.totalSteelWeight * STEEL_UNIT_COST)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quantities per Concrete Type */}
              <div className="space-y-1.5">
                <span className="font-bold text-foreground block text-[11px]">توزيع النماذج المسجلة (Distribution):</span>
                <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                  {types.map(t => (
                    <div key={t.id} className="bg-muted/20 p-2 rounded flex justify-between items-center font-mono">
                      <span className="font-bold">{t.tag}</span>
                      <span className="bg-blue-600 text-white font-bold rounded-full px-1.5 h-4 min-w-4 flex items-center justify-center leading-none text-[8.5px]">
                        {stats.typeDistribution[t.tag] || 0}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </CardContent>
          </Card>
        </div>

      </div>

      {/* ── MODAL / INLINE CARD FOR CREATING NEW EXTREME FOUNDATIONS ── */}
      {isAddingCustom && (
        <Card className="border-blue-600/30 bg-blue-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-bold flex items-center gap-2 text-blue-800 dark:text-blue-300">
              <Plus className="h-4 w-4" />
              أداة إدخال وتخطيط قاعدة أساسية مخصصة
            </CardTitle>
            <CardDescription className="text-[11px]">
              يتيح لك هذا النموذج إضافة أساس مخصص بنظام شريطي، منفرد، مشترك، أو لبشة في أي إحداثي ترغبه وإخضاعه لنظم التجميع الفوري.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Type selector */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">نوع الأساس المستهدف</label>
                <select
                  value={newInst.systemType}
                  onChange={(e) => setNewInst(prev => ({ ...prev, systemType: e.target.value as FoundationSystemType }))}
                  className="w-full h-8 px-2 rounded border border-input text-xs bg-background"
                >
                  <option value="isolated">منفرد (Isolated)</option>
                  <option value="strip">شريطي (Strip)</option>
                  <option value="combined">مشترك (Combined)</option>
                  <option value="raft">لبشة (Raft)</option>
                </select>
              </div>

              {/* Name */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">اسم القاعدة (المسمى)</label>
                <Input
                  type="text"
                  value={newInst.name}
                  className="h-8"
                  onChange={(e) => setNewInst(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              {/* X coordinate */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">الإحداثي السيني X (متر)</label>
                <Input
                  type="number"
                  value={newInst.x}
                  className="h-8 font-mono"
                  onChange={(e) => setNewInst(prev => ({ ...prev, x: Number(e.target.value) }))}
                />
              </div>

              {/* Y coordinate */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">الإحداثي الصادي Y (متر)</label>
                <Input
                  type="number"
                  value={newInst.y}
                  className="h-8 font-mono"
                  onChange={(e) => setNewInst(prev => ({ ...prev, y: Number(e.target.value) }))}
                />
              </div>

              {/* Width B */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">العرض B (مم)</label>
                <Input
                  type="number"
                  step="100"
                  value={newInst.B}
                  className="h-8 font-mono"
                  onChange={(e) => setNewInst(prev => ({ ...prev, B: Number(e.target.value) }))}
                />
              </div>

              {/* Length L */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">الطول L (مم)</label>
                <Input
                  type="number"
                  step="100"
                  value={newInst.L}
                  className="h-8 font-mono"
                  onChange={(e) => setNewInst(prev => ({ ...prev, L: Number(e.target.value) }))}
                />
              </div>

              {/* Thickness t */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">السمك t (مم)</label>
                <Input
                  type="number"
                  step="50"
                  value={newInst.t}
                  className="h-8 font-mono"
                  onChange={(e) => setNewInst(prev => ({ ...prev, t: Number(e.target.value) }))}
                />
              </div>

              {/* Columns sitter list */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">الأعمدة الحاملة (فاصلة تفصل)</label>
                <Input
                  type="text"
                  value={newInst.cols}
                  placeholder="مثال: C1, C2"
                  className="h-8 font-mono"
                  onChange={(e) => setNewInst(prev => ({ ...prev, cols: e.target.value }))}
                />
              </div>

              {/* Bar Diameter X */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">قطر حديد التسليح (X)</label>
                <Input
                  type="number"
                  value={newInst.diaX}
                  className="h-8 font-mono"
                  onChange={(e) => setNewInst(prev => ({ ...prev, diaX: Number(e.target.value) }))}
                />
              </div>

              {/* Bar Count X */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">عدد الأسياخ (X)</label>
                <Input
                  type="number"
                  value={newInst.cntX}
                  className="h-8 font-mono"
                  onChange={(e) => setNewInst(prev => ({ ...prev, cntX: Number(e.target.value) }))}
                />
              </div>

              {/* Load P */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">حمل التشغيل المطبق P (kN)</label>
                <Input
                  type="number"
                  value={newInst.P}
                  className="h-8 font-mono"
                  onChange={(e) => setNewInst(prev => ({ ...prev, P: Number(e.target.value) }))}
                />
              </div>

            </div>

            <div className="flex gap-2 justify-end border-t border-blue-200/20 pt-3">
              <Button size="sm" variant="outline" onClick={() => setIsAddingCustom(false)}>إلغاء</Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleAddCustomFoundation}>إضافة الأساس وعرض النتيجة</Button>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
