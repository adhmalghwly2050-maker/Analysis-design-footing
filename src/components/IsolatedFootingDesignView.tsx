/**
 * Isolated Footing Structural Design View - ACI 318 Standard
 * Designed by Senior Structural Foundation Software Engineer
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Layers, 
  TrendingUp, 
  Scissors, 
  Zap, 
  TrendingDown, 
  Scale, 
  HelpCircle,
  FileCheck,
  AlertTriangle,
  Flame,
  Wrench,
  ChevronDown,
  Info
} from 'lucide-react';
import { IsolatedFootingAnalysisResult } from '../lib/isolatedFootingEngine';
import { designIsolatedFootingStrength, IsolatedFootingDesignOutput, FootingBar } from '../lib/isolatedFootingDesignEngine';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from './ui/card';
import { Badge } from './ui/badge';

interface IsolatedFootingDesignViewProps {
  analysisResult: IsolatedFootingAnalysisResult;
  fy: number;      // steel yield strength (MPa)
  loadFactor?: number; // strength design ultimate factor (default 1.5)
}

export default function IsolatedFootingDesignView({
  analysisResult,
  fy = 420,
  loadFactor = 1.5
}: IsolatedFootingDesignViewProps) {
  const [subTab, setSubTab] = useState<'summary' | 'flexure' | 'shear' | 'punching' | 'rebar' | 'quantities'>('summary');

  const designResult: IsolatedFootingDesignOutput = useMemo(() => {
    return designIsolatedFootingStrength(analysisResult, fy, loadFactor, 75);
  }, [analysisResult, fy, loadFactor]);

  const {
    summary,
    flexureX,
    flexureY,
    shearX,
    shearY,
    punching,
    developmentX,
    developmentY,
    spacingX,
    spacingY,
    warnings,
    totalSteelWeightKg,
    concreteVolumeM3
  } = designResult;

  const { B, L, H } = analysisResult.input;

  // DCR Progress bar color helper
  const getDCRColorClass = (dcr: number) => {
    if (dcr >= 1.0) return 'bg-red-600';
    if (dcr >= 0.85) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const getDCRBadgeVariant = (dcr: number) => {
    if (dcr >= 1.0) return 'destructive';
    if (dcr >= 0.85) return 'secondary';
    return 'outline';
  };

  const getStatusBadge = (status: 'pass' | 'fail') => {
    return status === 'pass' ? (
      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">أمن ✓ Pass</Badge>
    ) : (
      <Badge className="bg-red-50 text-red-700 border-red-200" variant="destructive">غير آمن ✗ Fail</Badge>
    );
  };

  return (
    <div className="space-y-6" id="isolatedFootingDesignSection">
      {/* ── Sub Navigation Tabs ── */}
      <div className="flex flex-wrap gap-1 bg-muted p-1 rounded-md border border-border">
        <button
          onClick={() => setSubTab('summary')}
          className={`flex-1 min-w-[120px] text-center py-1.5 px-3 text-xs font-semibold rounded-sm transition-all ${
            subTab === 'summary' 
              ? 'bg-background text-foreground shadow-xs' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          ملخص التصميم (Summary)
        </button>
        <button
          onClick={() => setSubTab('flexure')}
          className={`flex-1 min-w-[120px] text-center py-1.5 px-3 text-xs font-semibold rounded-sm transition-all ${
            subTab === 'flexure' 
              ? 'bg-background text-foreground shadow-xs' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          تصميم الانحناء (Flexural Design)
        </button>
        <button
          onClick={() => setSubTab('shear')}
          className={`flex-1 min-w-[120px] text-center py-1.5 px-3 text-xs font-semibold rounded-sm transition-all ${
            subTab === 'shear' 
              ? 'bg-background text-foreground shadow-xs' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          قص عريض (One-Way Shear)
        </button>
        <button
          onClick={() => setSubTab('punching')}
          className={`flex-1 min-w-[120px] text-center py-1.5 px-3 text-xs font-semibold rounded-sm transition-all ${
            subTab === 'punching' 
              ? 'bg-background text-foreground shadow-xs' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          قص اختراق (Punching Shear)
        </button>
        <button
          onClick={() => setSubTab('rebar')}
          className={`flex-1 min-w-[120px] text-center py-1.5 px-3 text-xs font-semibold rounded-sm transition-all ${
            subTab === 'rebar' 
              ? 'bg-background text-foreground shadow-xs' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          مسار التفريد (Reinforcement Layout)
        </button>
        <button
          onClick={() => setSubTab('quantities')}
          className={`flex-1 min-w-[120px] text-center py-1.5 px-3 text-xs font-semibold rounded-sm transition-all ${
            subTab === 'quantities' 
              ? 'bg-background text-foreground shadow-xs' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          حساب الكميات (Quantities)
        </button>
      </div>

      {/* ── Engineering Design Warnings ── */}
      {warnings.length > 0 && (
        <div className="border border-red-200 bg-red-500/5 rounded-lg p-4 space-y-2">
          <h4 className="text-xs font-bold text-red-800 flex items-center gap-1.5">
            <ShieldAlert className="h-4.5 w-4.5 text-red-600" />
            تنبيهات وتوصيات تصميم الخرسانة المسلحة والمقاومة القصوى (ACI 318):
          </h4>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-red-700 list-inside">
            {warnings.map((w, idx) => (
              <li key={idx} className="flex gap-1.5 items-start bg-red-50/50 p-1.5 rounded border border-red-100/40">
                <span className="text-red-500 shrink-0 select-none">•</span>
                <span className="leading-tight">{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Content Panes ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={subTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.15 }}
          className="space-y-6"
        >
          {/* ─────── 1. DESIGN SUMMARY VIEW ─────── */}
          {subTab === 'summary' && (
            <div className="space-y-6">
              {/* Bento indicators */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border border-border/80">
                  <CardContent className="p-4 flex flex-col justify-between h-28">
                    <span className="text-[11px] font-medium text-muted-foreground">حالة التصميم الكلي (Design Status)</span>
                    <div className="flex items-center gap-2 mt-1">
                      {summary.overallStatus === 'pass' ? (
                        <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                      ) : (
                        <div className="h-3 w-3 rounded-full bg-red-600 animate-bounce" />
                      )}
                      <span className="text-lg font-black">{summary.overallStatus === 'pass' ? 'آمن تماماً ✓' : 'تصميم مرفوض ✗'}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">ACI 318-19 Strength requirements</span>
                  </CardContent>
                </Card>

                <Card className="border border-border/80">
                  <CardContent className="p-4 flex flex-col justify-between h-28">
                    <span className="text-[11px] font-medium text-muted-foreground">أبعاد الخرسانة المعتمدة (Dimensions)</span>
                    <div className="flex flex-col mt-1">
                      <span className="text-lg font-black font-mono">{summary.footingB} × {summary.footingL} mm</span>
                      <span className="text-xs font-semibold text-blue-600 font-mono">السمك: {summary.footingH} mm</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">حجم الخرسانة: {concreteVolumeM3.toFixed(2)} m³</span>
                  </CardContent>
                </Card>

                <Card className="border border-border/80">
                  <CardContent className="p-4 flex flex-col justify-between h-28">
                    <span className="text-[11px] font-medium text-muted-foreground">كمية حديد التسليح (Provided Rebar)</span>
                    <div className="flex flex-col mt-1">
                      <span className="text-sm font-bold text-foreground">اتجاه X: <span className="font-mono text-emerald-600">{flexureX.selectedQuantity}Ø{flexureX.selectedDiameter}</span></span>
                      <span className="text-sm font-bold text-foreground">اتجاه Y: <span className="font-mono text-emerald-600">{flexureY.selectedQuantity}Ø{flexureY.selectedDiameter}</span></span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">إجمالي وزن الصلب: {totalSteelWeightKg} kg</span>
                  </CardContent>
                </Card>

                <Card className="border border-border/80">
                  <CardContent className="p-4 flex flex-col justify-between h-28">
                    <span className="text-[11px] font-medium text-muted-foreground">عزوم الانحناء القصوى Mu</span>
                    <div className="flex flex-col mt-1">
                      <span className="text-xs text-muted-foreground">X: <span className="font-mono text-blue-600 font-bold">{summary.governingMomentX.toFixed(1)} kN·m/m</span></span>
                      <span className="text-xs text-muted-foreground">Y: <span className="font-mono text-blue-600 font-bold">{summary.governingMomentY.toFixed(1)} kN·m/m</span></span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">مضروباً في عامل المقاومة {loadFactor}</span>
                  </CardContent>
                </Card>
              </div>

              {/* Checks parameters detailed grid */}
              <Card className="border-border">
                <CardHeader className="py-4 bg-muted/20">
                  <CardTitle className="text-xs font-bold leading-normal">
                    جدول مراجعة التحقق الفني الفارق لقاعدة الأساس (Structural Design Compliance Log)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 text-xs">
                  <div className="divide-y divide-border">
                    <div className="grid grid-cols-12 gap-2 p-3 font-bold bg-muted/10 text-muted-foreground select-none">
                      <div className="col-span-5">البند والتحقق الفني (Compliance Item)</div>
                      <div className="col-span-3 text-center">المطلوب / المعياري (Limit)</div>
                      <div className="col-span-2 text-center">الفعلي المحقق (Actual)</div>
                      <div className="col-span-2 text-center">التقييم (Result)</div>
                    </div>

                    <div className="grid grid-cols-12 gap-2 p-3 items-center">
                      <div className="col-span-5 font-semibold text-foreground">الانحناء الإنشائي بالاتجاه X (Flexure Y-face)</div>
                      <div className="col-span-3 text-center font-mono text-muted-foreground">As ≥ {flexureX.AsRequiredTotal.toFixed(0)} mm²</div>
                      <div className="col-span-2 text-center font-mono text-emerald-600 font-bold">{flexureX.AsProvided.toFixed(0)} mm²</div>
                      <div className="col-span-2 text-center">{getStatusBadge(flexureX.isSafe ? 'pass' : 'fail')}</div>
                    </div>

                    <div className="grid grid-cols-12 gap-2 p-3 items-center col-span-12">
                      <div className="col-span-5 font-semibold text-foreground">الانحناء الإنشائي بالاتجاه Y (Flexure X-face)</div>
                      <div className="col-span-3 text-center font-mono text-muted-foreground">As ≥ {flexureY.AsRequiredTotal.toFixed(0)} mm²</div>
                      <div className="col-span-2 text-center font-mono text-emerald-600 font-bold">{flexureY.AsProvided.toFixed(0)} mm²</div>
                      <div className="col-span-2 text-center">{getStatusBadge(flexureY.isSafe ? 'pass' : 'fail')}</div>
                    </div>

                    <div className="grid grid-cols-12 gap-2 p-3 items-center">
                      <div className="col-span-5 font-semibold text-foreground">مقاومة القص لـ عريض الجذع بالاتجاه X (One-way Shear X)</div>
                      <div className="col-span-3 text-center font-mono text-muted-foreground">Vu ≤ {shearX.phiVc.toFixed(0)} kN</div>
                      <div className="col-span-2 text-center font-mono text-red-600 font-bold">{shearX.Vu.toFixed(0)} kN</div>
                      <div className="col-span-2 text-center">{getStatusBadge(shearX.isSafe ? 'pass' : 'fail')}</div>
                    </div>

                    <div className="grid grid-cols-12 gap-2 p-3 items-center">
                      <div className="col-span-5 font-semibold text-foreground">مقاومة القص لـ عريض الجذع بالاتجاه Y (One-way Shear Y)</div>
                      <div className="col-span-3 text-center font-mono text-muted-foreground">Vu ≤ {shearY.phiVc.toFixed(0)} kN</div>
                      <div className="col-span-2 text-center font-mono text-red-600 font-bold">{shearY.Vu.toFixed(0)} kN</div>
                      <div className="col-span-2 text-center">{getStatusBadge(shearY.isSafe ? 'pass' : 'fail')}</div>
                    </div>

                    <div className="grid grid-cols-12 gap-2 p-3 items-center">
                      <div className="col-span-5 font-semibold text-foreground">إجهاد مقاومة قص الاختراق للعمود (Punching Shear)</div>
                      <div className="col-span-3 text-center font-mono text-muted-foreground">vu ≤ {punching.phiVcStress.toFixed(3)} MPa</div>
                      <div className="col-span-2 text-center font-mono text-red-600 font-bold">{punching.stressVu.toFixed(3)} MPa</div>
                      <div className="col-span-2 text-center">{getStatusBadge(punching.isSafe ? 'pass' : 'fail')}</div>
                    </div>

                    <div className="grid grid-cols-12 gap-2 p-3 items-center font-normal">
                      <div className="col-span-5 font-semibold text-foreground">مسار طول التماسك والترسية للحديد (Development Length)</div>
                      <div className="col-span-3 text-center text-muted-foreground">Straight ld | Hooks check</div>
                      <div className="col-span-2 text-center font-mono font-bold text-foreground">
                        {developmentX.requiresHook || developmentY.requiresHook ? 'Hooks Req.' : 'Straight OK'}
                      </div>
                      <div className="col-span-2 text-center">
                        {getStatusBadge((developmentX.isSafe && developmentY.isSafe) ? 'pass' : 'fail')}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ─────── 2. FLEXURAL DESIGN VIEW ─────── */}
          {subTab === 'flexure' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* X Direction Card */}
              <Card className="border border-border shadow-sm">
                <CardHeader className="bg-muted/10 border-b border-border/60 py-3">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-xs font-bold font-sans">تسليح الاتجاه X (Reinforcement under B-axis)</CardTitle>
                    {getStatusBadge(flexureX.isSafe ? 'pass' : 'fail')}
                  </div>
                  <CardDescription className="text-[10px]">
                    الحديد الطولي المقاوم للعزم المتولد عن الجزء الكابولي بالاتجاه X
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-4 space-y-4 text-xs">
                  <div className="flex justify-between border-b border-border pb-1.5 font-mono">
                    <span className="text-muted-foreground font-sans">العزم الاسمي عند وجه العمود المنسق:</span>
                    <span>{analysisResult.criticalSections.designMomentY.toFixed(1)} kN·m/m</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-1.5 font-mono">
                    <span className="text-muted-foreground font-sans text-red-600">العزم الأقصى المعادلة التصميمية Mu:</span>
                    <span className="font-bold text-red-600">{(flexureX.MuPerMeter).toFixed(1)} kN·m/m</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-1.5 font-mono">
                    <span className="text-muted-foreground font-sans">إجمالي العزم الكلي المتولد للمقطع Mu_total:</span>
                    <span>{flexureX.Mu.toFixed(1)} kN·m</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-1.5 font-mono">
                    <span className="text-muted-foreground font-sans">المساحة المطلوبة للتسليح بالترسية As,req:</span>
                    <span className="font-bold text-blue-600">{flexureX.AsRequiredPerMeter.toFixed(1)} mm²/m</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-1.5 font-mono">
                    <span className="text-muted-foreground font-sans">حد مساحة حديد المينيموم للمقاومة الحرارية As,min:</span>
                    <span className="text-amber-600 font-semibold">{flexureX.AsMinPerMeter.toFixed(1)} mm²/m</span>
                  </div>
                  <div className="bg-muted/30 p-2.5 rounded text-[10.5px]">
                    <div className="font-semibold text-foreground flex items-center gap-1">
                      <Info className="h-3.5 w-3.5 text-blue-600" />
                      محددات ACI 318 لـ الحد الإنشائي الأدنى governs:
                    </div>
                    <p className="text-muted-foreground leading-normal mt-1">
                      {flexureX.governingType === 'minimum' 
                        ? 'تسليح القواعد المنفردة يخضع لمتطلبات حديد الانكماش والحرارة لعدم كفاية العزم لكسر الخرسانة.' 
                        : 'تم تخطي حديد الانكماش الأدنى بناءً على متطلبات عزم الانحناء الخارجي الأقصى المُسلط.'}
                    </p>
                  </div>
                  <div className="flex justify-between items-center py-2 bg-blue-50/50 px-3 rounded border border-blue-100 font-mono">
                    <span className="text-blue-800 font-bold font-sans">مقاومة الانقطاع لحديد المقطع ϕMn:</span>
                    <span className="font-bold text-blue-800">{flexureX.phiMn} kN·m</span>
                  </div>
                </CardContent>
              </Card>

              {/* Y Direction Card */}
              <Card className="border border-border shadow-sm">
                <CardHeader className="bg-muted/10 border-b border-border/60 py-3">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-xs font-bold font-sans">تسليح الاتجاه Y (Reinforcement under L-axis)</CardTitle>
                    {getStatusBadge(flexureY.isSafe ? 'pass' : 'fail')}
                  </div>
                  <CardDescription className="text-[10px]">
                    الحديد الطولي المقاوم للعزم المتولد عن الجزء الكابولي بالاتجاه Y
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-4 space-y-4 text-xs">
                  <div className="flex justify-between border-b border-border pb-1.5 font-mono">
                    <span className="text-muted-foreground font-sans">العزم الاسمي عند وجه العمود المنسق:</span>
                    <span>{analysisResult.criticalSections.designMomentX.toFixed(1)} kN·m/m</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-1.5 font-mono">
                    <span className="text-muted-foreground font-sans text-red-600">العزم الأقصى المعادلة التصميمية Mu:</span>
                    <span className="font-bold text-red-600">{(flexureY.MuPerMeter).toFixed(1)} kN·m/m</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-1.5 font-mono">
                    <span className="text-muted-foreground font-sans">إجمالي العزم الكلي المتولد للمقطع Mu_total:</span>
                    <span>{flexureY.Mu.toFixed(1)} kN·m</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-1.5 font-mono">
                    <span className="text-muted-foreground font-sans">المساحة المطلوبة للتسليح بالترسية As,req:</span>
                    <span className="font-bold text-blue-600">{flexureY.AsRequiredPerMeter.toFixed(1)} mm²/m</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-1.5 font-mono">
                    <span className="text-muted-foreground font-sans">حد مساحة حديد المينيموم للمقاومة الحرارية As,min:</span>
                    <span className="text-amber-600 font-semibold">{flexureY.AsMinPerMeter.toFixed(1)} mm²/m</span>
                  </div>
                  <div className="bg-muted/30 p-2.5 rounded text-[10.5px]">
                    <div className="font-semibold text-foreground flex items-center gap-1">
                      <Info className="h-3.5 w-3.5 text-blue-600" />
                      محددات ACI 318 لـ الحد الإنشائي الأدنى governs:
                    </div>
                    <p className="text-muted-foreground leading-normal mt-1">
                      {flexureY.governingType === 'minimum' 
                        ? 'تسليح القواعد المنفردة يخضع لمتطلبات حديد الانكماش والحرارة لعدم كفاية العزم لكسر الخرسانة.' 
                        : 'تم تخطي حديد الانكماش الأدنى بناءً على متطلبات عزم الانحناء الخارجي الأقصى المُسلط.'}
                    </p>
                  </div>
                  <div className="flex justify-between items-center py-2 bg-blue-50/50 px-3 rounded border border-blue-100 font-mono">
                    <span className="text-blue-800 font-bold font-sans">مقاومة الانقطاع لحديد المقطع ϕMn:</span>
                    <span className="font-bold text-blue-800">{flexureY.phiMn} kN·m</span>
                  </div>
                </CardContent>
              </Card>

            </div>
          )}

          {/* ─────── 3. ONE-WAY SHEAR VIEW ─────── */}
          {subTab === 'shear' && (
            <div className="space-y-6">
              <Card className="border border-border">
                <CardHeader className="py-3 bg-muted/20">
                  <CardTitle className="text-xs font-bold leading-normal">
                    دراسة مراجعة قوى القص العريض ذو الجذع المفرد (One-Way Shear Verification Log)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-6 text-xs">
                  <p className="text-muted-foreground leading-normal text-xs mb-3">
                    * وفق الكود الفني المقاومة القصوى (ACI 318)، يتم حساب المقطع الحرج على مسافة <span className="font-bold font-mono">d</span> من وجه العمود الخرساني. لا يُسمح بحديد تسليح للقص في الأساسات السطحية، لذا يجب أن تكون مقاومة الخرسانة ϕVc أكبر من القوى المُسلطة Vu بالاتجاهين بشكل كامل.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Shear X */}
                    <div className="border border-border/80 rounded-lg p-4 space-y-3 bg-muted/5">
                      <div className="flex justify-between items-center mb-1 border-b border-border pb-1">
                        <span className="font-bold text-foreground">قص الاتجاه X (One-way Shear plane along L)</span>
                        {getStatusBadge(shearX.isSafe ? 'pass' : 'fail')}
                      </div>
                      <div className="flex justify-between font-mono">
                        <span className="text-muted-foreground font-sans">قوة القص الخارجي التصميمي القصوى Vu:</span>
                        <span className="font-bold text-red-600">{shearX.Vu.toFixed(1)} kN</span>
                      </div>
                      <div className="flex justify-between font-mono">
                        <span className="text-muted-foreground font-sans">الاسمية للخرسانة بالقص Vc (0.17√f'c * L * d):</span>
                        <span>{shearX.Vc.toFixed(1)} kN</span>
                      </div>
                      <div className="flex justify-between font-mono">
                        <span className="text-muted-foreground font-sans text-emerald-600 font-semibold">مقاومة الخرسانة التصميمية المعتمدة ϕVc (ϕ=0.75):</span>
                        <span className="font-bold text-emerald-600">{shearX.phiVc.toFixed(1)} kN</span>
                      </div>
                      <div className="pt-2 border-t border-border">
                        <div className="flex justify-between items-center mb-1 font-mono">
                          <span className="text-muted-foreground font-sans">نسبة استغلال السعة الإنشائية DCR:</span>
                          <Badge variant={getDCRBadgeVariant(shearX.dcr)} className="font-bold">
                            {(shearX.dcr * 100).toFixed(1)}%
                          </Badge>
                        </div>
                        <div className="w-full bg-muted/65 rounded-sm h-1.5 overflow-hidden">
                          <div className={`h-full ${getDCRColorClass(shearX.dcr)}`} style={{ width: `${Math.min(100, shearX.dcr * 100)}%` }} />
                        </div>
                      </div>
                    </div>

                    {/* Shear Y */}
                    <div className="border border-border/80 rounded-lg p-4 space-y-3 bg-muted/5">
                      <div className="flex justify-between items-center mb-1 border-b border-border pb-1">
                        <span className="font-bold text-foreground">قص الاتجاه Y (One-way Shear plane along B)</span>
                        {getStatusBadge(shearY.isSafe ? 'pass' : 'fail')}
                      </div>
                      <div className="flex justify-between font-mono">
                        <span className="text-muted-foreground font-sans">قوة القص الخارجي التصميمي القصوى Vu:</span>
                        <span className="font-bold text-red-600">{shearY.Vu.toFixed(1)} kN</span>
                      </div>
                      <div className="flex justify-between font-mono">
                        <span className="text-muted-foreground font-sans">الاسمية للخرسانة بالقص Vc (0.17√f'c * B * d):</span>
                        <span>{shearY.Vc.toFixed(1)} kN</span>
                      </div>
                      <div className="flex justify-between font-mono">
                        <span className="text-muted-foreground font-sans text-emerald-600 font-semibold">مقاومة الخرسانة التصميمية المعتمدة ϕVc (ϕ=0.75):</span>
                        <span className="font-bold text-emerald-600">{shearY.phiVc.toFixed(1)} kN</span>
                      </div>
                      <div className="pt-2 border-t border-border">
                        <div className="flex justify-between items-center mb-1 font-mono">
                          <span className="text-muted-foreground font-sans">نسبة استغلال السعة الإنشائية DCR:</span>
                          <Badge variant={getDCRBadgeVariant(shearY.dcr)} className="font-bold">
                            {(shearY.dcr * 100).toFixed(1)}%
                          </Badge>
                        </div>
                        <div className="w-full bg-muted/65 rounded-sm h-1.5 overflow-hidden">
                          <div className={`h-full ${getDCRColorClass(shearY.dcr)}`} style={{ width: `${Math.min(100, shearY.dcr * 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ─────── 4. PUNCHING SHEAR VIEW ─────── */}
          {subTab === 'punching' && (
            <div className="space-y-6">
              <Card className="border border-border">
                <CardHeader className="py-3 bg-muted/20">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-xs font-bold leading-normal">
                      دراسة مراجعة قوى قص اختراق العمود للمقطع الحرج (Punching Shear Verification Log)
                    </CardTitle>
                    {getStatusBadge(punching.isSafe ? 'pass' : 'fail')}
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-4 text-xs font-mono">
                  <p className="text-muted-foreground text-xs leading-normal font-sans mb-3">
                    * يتم تقييم قص الاختراق على محيط حرج يقع على مسافة <span className="font-bold">d/2</span> من حواف العمود. يقارن الكود إجهاد القص الأقصى ν_u بـ مقاومة الاختراق ϕν_c المحسوبة بأدنى ثلاث معادلات شهيرة في الكود ومستندة لقرب محيط التماس والأبعاد النسبية للعمود وعمقه الفعال.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <div className="flex justify-between border-b border-border pb-1">
                        <span className="font-sans text-muted-foreground">محيط مقطع الاختراق الحرج للعمود b0:</span>
                        <span className="font-bold text-foreground">{punching.b0.toFixed(0)} mm</span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-1">
                        <span className="font-sans text-muted-foreground">المساحة المقاومة للثقب الحرج Area:</span>
                        <span className="font-bold">{punching.Area.toFixed(0)} mm²</span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-1">
                        <span className="font-sans text-muted-foreground">قوة قمع الثقب الكلية المُسلطة Vu:</span>
                        <span className="font-bold text-red-600">{punching.Vu.toFixed(0)} kN</span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-1">
                        <span className="font-sans text-muted-foreground text-red-600 font-bold">إجهاد قمع الثقب الكلي المسلط ν_u:</span>
                        <span className="font-bold text-red-600">{punching.stressVu.toFixed(3)} MPa</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between border-b border-border pb-1">
                        <span className="font-sans text-muted-foreground">الإجهاد الاسمي بـ معادلة الاستطالة Eq (1):</span>
                        <span>{punching.Vc1.toFixed(3)} MPa</span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-1">
                        <span className="font-sans text-muted-foreground">الإجهاد الاسمي بـ معادلة المحيط الحرج Eq (2):</span>
                        <span>{punching.Vc2.toFixed(3)} MPa</span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-1">
                        <span className="font-sans text-muted-foreground">الإجهاد الاسمي بمعادلة المقاومة العامة Eq (3):</span>
                        <span>{punching.Vc3.toFixed(3)} MPa</span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-1 text-emerald-600 font-bold">
                        <span className="font-sans text-emerald-600 font-bold">الإجهاد الحاكم للتصميم لـ مقاومة الخرسانة ϕν_c:</span>
                        <span>{punching.phiVcStress.toFixed(3)} MPa</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-emerald-500/5 border border-emerald-100 rounded-lg p-3 text-xs font-sans text-foreground">
                    <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      المعادلة الحاكمة لتحديد سعة مقاومة الخرسانة (Governing Equation):
                    </div>
                    <p className="text-muted-foreground text-xs leading-normal mt-1 text-emerald-700">
                      {punching.governingConditionLabel}
                    </p>
                  </div>

                  <div className="pt-2">
                    <div className="flex justify-between items-center mb-1 font-mono">
                      <span className="text-muted-foreground font-sans">نسبة استغلال الثقب لـ العمود بقاعدة التأسيس DCR:</span>
                      <Badge variant={getDCRBadgeVariant(punching.dcr)} className="font-bold text-xs">
                        {(punching.dcr * 100).toFixed(1)}%
                      </Badge>
                    </div>
                    <div className="w-full bg-muted rounded-sm h-2 overflow-hidden">
                      <div className={`h-full ${getDCRColorClass(punching.dcr)}`} style={{ width: `${Math.min(100, punching.dcr * 100)}%` }} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ─────── 5. REINFORCEMENT DETAILS VIEW ─────── */}
          {subTab === 'rebar' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                {/* Rebar X Layout details */}
                <Card className="border border-border">
                  <CardHeader className="py-3 bg-muted/20 border-b border-border/50">
                    <CardTitle className="text-xs font-bold font-sans">توزيع وترتيب حديد الاتجاه X (X-Rebar arrangement details)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center gap-3 bg-blue-50/40 p-2 border border-blue-100 rounded">
                      <Layers className="h-5 w-5 text-blue-600" />
                      <div>
                        <div className="font-bold text-blue-900 font-mono text-xs">
                          {flexureX.selectedQuantity} Ø {flexureX.selectedDiameter} @ {flexureX.selectedSpacing} mm
                        </div>
                        <div className="text-[10px] text-muted-foreground font-sans mt-0.5">
                          توزيع على طول القاعدة في اتجاه L البالغ {L} مم
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 font-mono">
                      <div className="flex justify-between border-b border-border pb-1.5">
                        <span className="font-sans text-muted-foreground">اسم المجموعة ورمز التعرف (Bar Mark):</span>
                        <span className="font-bold">{flexureX.barsLayout.barMark}</span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-1.5">
                        <span className="font-sans text-muted-foreground">قطر القضيب المستعمل (Bar Diameter):</span>
                        <span>Ø {flexureX.selectedDiameter} mm</span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-1.5">
                        <span className="font-sans text-muted-foreground">عدد الأسياخ الكلي المستعمل (Quantity):</span>
                        <span className="font-bold">{flexureX.selectedQuantity} قضبان</span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-1.5">
                        <span className="font-sans text-muted-foreground">مسار التباعد الصافي (Spacing):</span>
                        <span>{flexureX.selectedSpacing} mm</span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-1.5">
                        <span className="font-sans text-muted-foreground">الغطاء الخرساني السفلي للقاعدة (Cover):</span>
                        <span>75 mm</span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-1.5">
                        <span className="font-sans text-muted-foreground">طول قضيب المقطع الصافي (Bar Length):</span>
                        <span className="font-bold text-blue-600">{flexureX.barsLayout.length} mm</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-border">
                      <div className="font-bold text-foreground mb-1 font-sans">التحقق من تماسك وتضميد الحديد (Development Integrity):</div>
                      <div className="flex justify-between items-center border-b border-border pb-2 font-mono">
                        <span className="font-sans text-muted-foreground">مسار التضميد المستقيم الأدنى ld:</span>
                        <span>{developmentX.ld} mm</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-border pb-2 font-mono">
                        <span className="font-sans text-muted-foreground">طول التضميد المتوفر في القاعدة:</span>
                        <span className="font-bold text-blue-600">{developmentX.availableLength} mm</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground font-sans mt-2 leading-relaxed">
                        {developmentX.requiresHook ? (
                          <span className="text-amber-700 font-medium flex gap-1 items-start">
                            <span className="text-base leading-none">⚠️</span>
                            مسار التضميد المستقيم ضيق وغير كاف بموجب ACI. يلزم تمديد خطاطيف 90 درجة معيارية بنهايات حديد التسليح لترسية التماسك تماماً.
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-medium flex gap-1 items-start">
                            <span className="text-base leading-none">✓</span>
                            مستقيم مسار التداخل والتماسك كافٍ تماما لتطوير قوى الشد دون الحاجة لخطاف ميكانيكي بموافقة ACI 318.
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Rebar Y Layout details */}
                <Card className="border border-border">
                  <CardHeader className="py-3 bg-muted/20 border-b border-border/50">
                    <CardTitle className="text-xs font-bold font-sans">توزيع وترتيب حديد الاتجاه Y (Y-Rebar arrangement details)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center gap-3 bg-blue-50/40 p-2 border border-blue-100 rounded">
                      <Layers className="h-5 w-5 text-blue-600" />
                      <div>
                        <div className="font-bold text-blue-900 font-mono text-xs">
                          {flexureY.selectedQuantity} Ø {flexureY.selectedDiameter} @ {flexureY.selectedSpacing} mm
                        </div>
                        <div className="text-[10px] text-muted-foreground font-sans mt-0.5">
                          توزيع على طول القاعدة في اتجاه B البالغ {B} مم
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 font-mono">
                      <div className="flex justify-between border-b border-border pb-1.5">
                        <span className="font-sans text-muted-foreground">اسم المجموعة ورمز التعرف (Bar Mark):</span>
                        <span className="font-bold">{flexureY.barsLayout.barMark}</span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-1.5">
                        <span className="font-sans text-muted-foreground">قطر القضيب المستعمل (Bar Diameter):</span>
                        <span>Ø {flexureY.selectedDiameter} mm</span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-1.5">
                        <span className="font-sans text-muted-foreground">عدد الأسياخ الكلي المستعمل (Quantity):</span>
                        <span className="font-bold">{flexureY.selectedQuantity} قضبان</span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-1.5">
                        <span className="font-sans text-muted-foreground">مسار التباعد الصافي (Spacing):</span>
                        <span>{flexureY.selectedSpacing} mm</span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-1.5">
                        <span className="font-sans text-muted-foreground">الغطاء الخرساني السفلي للقاعدة (Cover):</span>
                        <span>75 mm</span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-1.5">
                        <span className="font-sans text-muted-foreground">طول قضيب المقطع الصافي (Bar Length):</span>
                        <span className="font-bold text-blue-600">{flexureY.barsLayout.length} mm</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-border">
                      <div className="font-bold text-foreground mb-1 font-sans">التحقق من تماسك وتضميد الحديد (Development Integrity):</div>
                      <div className="flex justify-between items-center border-b border-border pb-2 font-mono">
                        <span className="font-sans text-muted-foreground">مسار التضميد المستقيم الأدنى ld:</span>
                        <span>{developmentY.ld} mm</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-border pb-2 font-mono">
                        <span className="font-sans text-muted-foreground">طول التضميد المتوفر في القاعدة:</span>
                        <span className="font-bold text-blue-600">{developmentY.availableLength} mm</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground font-sans mt-2 leading-relaxed">
                        {developmentY.requiresHook ? (
                          <span className="text-amber-700 font-medium flex gap-1 items-start">
                            <span className="text-base leading-none">⚠️</span>
                            مسار التضميد المستقيم ضيق وغير كاف بموجب ACI. يلزم تمديد خطاطيف 90 درجة معيارية بنهايات حديد التسليح لترسية التماسك تماماً.
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-medium flex gap-1 items-start">
                            <span className="text-base leading-none">✓</span>
                            مستقيم مسار التداخل والتماسك كافٍ تماما لتطوير قوى الشد دون الحاجة لخطاف ميكانيكي بموافقة ACI 318.
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

              </div>
            </div>
          )}

          {/* ─────── 6. QUANTITIES VIEW ─────── */}
          {subTab === 'quantities' && (
            <div className="space-y-6">
              <Card className="border border-border">
                <CardHeader className="py-3 bg-muted/20">
                  <CardTitle className="text-xs font-bold leading-normal">
                    تقرير كميات المواد والمذكرة الفنية للتفريد (Footing Bill of Materials - BOM)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4 text-xs font-mono">
                  <p className="text-muted-foreground text-xs font-sans leading-normal mb-3">
                    * جدول حسابات كميات حديد التسليح والخرسانة المسلحة الصب للقاعدة المختارة بناءً على متطلبات التباعد الهندسي والرمز التعريفي لحديد التسليح.
                  </p>

                  <table className="w-full text-center border divide-y divide-border border-border">
                    <thead>
                      <tr className="bg-muted text-muted-foreground text-[11px] font-bold font-sans select-none">
                        <th className="py-2.5 px-2">رمز السيخ (Mark)</th>
                        <th className="py-2.5 px-2">الاتجاه (Dir)</th>
                        <th className="py-2.5 px-2">القطر (Dia)</th>
                        <th className="py-2.5 px-2">العدد (Qty)</th>
                        <th className="py-2.5 px-2">الطول (Length)</th>
                        <th className="py-2.5 px-2">الوزن الفردي (kg/m)</th>
                        <th className="py-2.5 px-2">الوزن الكلي (kg)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <tr className="hover:bg-muted/10 font-bold">
                        <td className="py-2 px-1 text-blue-600 font-sans">T1-X</td>
                        <td className="py-2 px-1 font-sans">أفقي X</td>
                        <td className="py-2 px-1">Ø {flexureX.selectedDiameter}</td>
                        <td className="py-2 px-1">{flexureX.selectedQuantity}</td>
                        <td className="py-2 px-1">{flexureX.barsLayout.length} mm</td>
                        <td className="py-2 px-1">
                          {((Math.PI * flexureX.selectedDiameter * flexureX.selectedDiameter * 7850) / 4e6).toFixed(3)}
                        </td>
                        <td className="py-2 px-1 text-emerald-600">{flexureX.barsLayout.weight.toFixed(1)}</td>
                      </tr>
                      <tr className="hover:bg-muted/10 font-bold col-span-12">
                        <td className="py-2 px-1 text-blue-600 font-sans">T2-Y</td>
                        <td className="py-2 px-1 font-sans">رأسي Y</td>
                        <td className="py-2 px-1">Ø {flexureY.selectedDiameter}</td>
                        <td className="py-2 px-1">{flexureY.selectedQuantity}</td>
                        <td className="py-2 px-1">{flexureY.barsLayout.length} mm</td>
                        <td className="py-2 px-1">
                          {((Math.PI * flexureY.selectedDiameter * flexureY.selectedDiameter * 7850) / 4e6).toFixed(3)}
                        </td>
                        <td className="py-2 px-1 text-emerald-600">{flexureY.barsLayout.weight.toFixed(1)}</td>
                      </tr>
                      <tr className="bg-muted/30 font-bold font-sans">
                        <td colSpan={6} className="py-3 px-2 text-right">إجمالي وزن حديد التسليح الفولاذي للقاعدة (Total Steel Heavy Weight):</td>
                        <td className="py-3 px-2 font-mono text-emerald-700 text-sm text-center">{totalSteelWeightKg} kg</td>
                      </tr>
                      <tr className="bg-muted/40 font-bold font-sans">
                        <td colSpan={6} className="py-3 px-2 text-right">حجم الخرسانة المسلحة الإجمالي المطلوبة للصب (Total Concrete Volume):</td>
                        <td className="py-3 px-2 font-mono text-blue-700 text-sm text-center">{concreteVolumeM3.toFixed(3)} m³</td>
                      </tr>
                    </tbody>
                  </table>

                  <p className="text-[10px] text-muted-foreground font-sans leading-relaxed pt-2">
                    * الحسابات تستند بانتظام على كثافة الصلب الحديدي القياسية المقدرة بـ <span className="font-bold">7850 kg/m³</span>. تعكس الأطوال المسافات الصافية لغطاء القواعد الخرسانية 75 مم من الجوانب والوجه الخارجي.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
