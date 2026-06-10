import React, { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Calculator,
  Layers,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Info,
  SlidersHorizontal,
  ChevronRight,
  BookOpen,
  Boxes,
  Database,
  ArrowRight,
  Sparkles,
  Search,
  FileSpreadsheet
} from 'lucide-react';
import type { Slab, SlabProps, MatProps, Column, Beam } from '@/lib/structuralEngine';
import { analyzeOneWayRibbedSystem } from '@/lib/ribbedSlabSolver';
import { designOneWayRibbedSystem, type RibDesignResult, type SpanDesignResult, type RibBarDetail } from '@/lib/ribbedSlabDesignEngine';

interface SlabDesignPanelProps {
  slabs: Slab[];
  slabProps: SlabProps;
  mat: MatProps;
  ribbedSlabProps?: any;
  columns?: Column[];
  beams?: Beam[];
}

export default function SlabDesignPanel({
  slabs,
  slabProps,
  mat,
  ribbedSlabProps,
  columns,
  beams
}: SlabDesignPanelProps) {
  const tf = ribbedSlabProps?.tf ?? 70;
  const hb = ribbedSlabProps?.hb ?? 200;
  const h = tf + hb;

  // 1. Run Structural Analysis of Ribs
  const ribbedAnalysis = useMemo(() => {
    return analyzeOneWayRibbedSystem(slabs, slabProps, mat, ribbedSlabProps);
  }, [slabs, slabProps, mat, ribbedSlabProps]);

  // 2. Perform ACI 318-19 Design Calculations
  const designResult = useMemo(() => {
    if (!ribbedAnalysis || ribbedAnalysis.ribs.length === 0) return null;
    return designOneWayRibbedSystem(ribbedAnalysis, slabProps, mat, ribbedSlabProps);
  }, [ribbedAnalysis, slabProps, mat, ribbedSlabProps]);

  const hasRibbedSlabs = slabs.some((s) => s.slabType === 'one_way_ribbed');

  // Filters State
  const [selectedRibId, setSelectedRibId] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<string>('overview');

  // Set default filter if needed
  React.useEffect(() => {
    if (designResult && designResult.ribs.length > 0 && selectedRibId === 'ALL') {
      // Default filter can stay ALL or choose first
    }
  }, [designResult, selectedRibId]);

  if (!hasRibbedSlabs) {
    return (
      <Card className="border-purple-200 dark:border-purple-800">
        <CardContent className="py-12 text-center space-y-3">
          <Layers className="mx-auto text-purple-400" size={40} />
          <h3 className="text-base font-bold text-lg">لم يتم تحديد بلاطات هوردي (One-Way Ribbed)</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            يرجى إدخال بلاطة واحدة على الأقل بنوع <strong>بلاطة هوردي (ذات اتجاه واحد)</strong> من تبويب الإدخال ونمذجتها لتشغيل تصميم الأعصاب الهوردي وتسليح جفت التغطية طبقا للكود الأمريكي ACI 318-19.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!designResult || designResult.ribs.length === 0) {
    return (
      <Card className="border-purple-200 dark:border-purple-900 bg-purple-500/5">
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          يرجى تشغيل محرك التحليل الانشائي للبلاطات أولاً لاستخراج قوى القص والعزوم اللازمة لبدء دورة التصميم الإنشائي وتفريد الحديد المقاوم.
        </CardContent>
      </Card>
    );
  }

  // Apply filters
  const filteredRibs = designResult.ribs.filter((r) => {
    if (selectedRibId !== 'ALL' && r.ribId !== selectedRibId) return false;
    if (selectedStatus !== 'ALL' && r.status !== selectedStatus) return false;
    return true;
  });

  const uniqueRibIds = designResult.ribs.map((r) => r.ribId);

  return (
    <div className="space-y-4">
      {/* ── HEADER & SPEC CONCISE CARD ── */}
      <Card className="border-purple-200 dark:border-purple-800 bg-purple-500/5">
        <CardContent className="py-4 px-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-purple-950 dark:text-purple-100">
                <BoxIcon variant="purple" />
                <span className="text-sm font-bold font-sans">
                  تصميم البلاطات المضلعة (Slab Design - One Way Ribbed) — ACI 318-19
                </span>
                <Badge className="bg-purple-600 text-[10px] h-5">ACI 318-19</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                يقوم هذا النظام التفاعلي بحساب تسليح الجذوع (الإنحناء والقص) للأعصاب الهوردي وتحرير شبكة بلاطة التغطية العلوية ومطابقتها مع محددات الأبعاد لكود الخرسانة الأمريكي لإنتاج جداول تفريد حديد تفصيلية ومستندات الحصر الكمي.
              </p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="text-[10px] gap-1 font-mono hover:bg-purple-100 dark:hover:bg-purple-950">
                <BookOpen size={12} />
                محددات ACI 318
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── INTERACTIVE DESIGN TAB CONTROLLER ── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* Sidebar Filters */}
        <div className="md:col-span-3 space-y-3">
          <Card>
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-xs flex items-center gap-1.5">
                <SlidersHorizontal size={13} className="text-purple-600" />
                فلترة وتوجيه التصميم
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pb-3 text-xs">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground block font-bold">العصب المحدد:</label>
                <select
                  value={selectedRibId}
                  onChange={(e) => setSelectedRibId(e.target.value)}
                  className="w-full h-8 px-2 py-1 text-xs border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-purple-600 font-mono"
                >
                  <option value="ALL">جميع الأعصاب ({uniqueRibIds.length})</option>
                  {uniqueRibIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground block font-bold">حالة التصميم كودياً:</label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full h-8 px-2 py-1 text-xs border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-purple-600"
                >
                  <option value="ALL">جميع الحالات</option>
                  <option value="SAFE">آمن (SAFE)</option>
                  <option value="WARNING">ملاحظات (WARNING)</option>
                  <option value="CRITICAL">غير محقق (CRITICAL)</option>
                </select>
              </div>

              <div className="border-t pt-2.5 mt-1 space-y-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-500 block"></span>
                  <span className="font-sans">آمن ومحقق شروط الليونة والترخيم</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-amber-500 block"></span>
                  <span className="font-sans">يتجاوز حدود الترخيم التقريبية (يلزم مراجعة)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-red-500 block"></span>
                  <span className="font-sans">خرق حرج لقيم القص أو اجهاد تسليح مفرط</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Specifications list */}
          <Card className="bg-muted/10">
            <CardHeader className="pb-1 pt-3">
              <CardTitle className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                هيكل ومواد البلاطة الهوردي
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-[11px] leading-relaxed">
              <div className="flex justify-between font-mono">
                <span className="text-muted-foreground">وعاء العصب bw:</span>
                <span className="font-bold">{ribbedSlabProps?.bw ?? 100} مم</span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-muted-foreground">ارتفاع البلوك hb:</span>
                <span className="font-bold">{ribbedSlabProps?.hb ?? 200} مم</span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-muted-foreground">بلاطة التغطية tf:</span>
                <span className="font-bold">{ribbedSlabProps?.tf ?? 70} مم</span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-muted-foreground">تباعد المحاور s:</span>
                <span className="font-bold">{(ribbedSlabProps?.s ?? 400) + (ribbedSlabProps?.bw ?? 100)} مم</span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-muted-foreground">قوة الخرسانة fc':</span>
                <span className="font-bold">{mat.fc ?? 25} MPa</span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-muted-foreground">إجهاد الخضوع fy:</span>
                <span className="font-bold">{mat.fy ?? 420} MPa</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabbed Layout Panel */}
        <div className="md:col-span-9 space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
            <TabsList className="w-full justify-start overflow-x-auto h-9">
              <TabsTrigger value="overview" className="text-xs">
                الملخص الإنشائي
              </TabsTrigger>
              <TabsTrigger value="rib-design" className="text-xs">
                تصميم الأعصاب (الانحناء)
              </TabsTrigger>
              <TabsTrigger value="shear-design" className="text-xs">
                تصميم القص والتسليح العرضي
              </TabsTrigger>
              <TabsTrigger value="deflection" className="text-xs">
                الترخيم وسهم التشوه
              </TabsTrigger>
              <TabsTrigger value="topping-slab" className="text-xs">
                تسليح بلاطة التغطية
              </TabsTrigger>
              <TabsTrigger value="rebar-db" className="text-xs text-purple-700 dark:text-purple-400 font-bold gap-1">
                <Database size={13} />
                قاعدة بيانات التفريد (BBS)
              </TabsTrigger>
            </TabsList>

            {/* 1. OVERVIEW TAB */}
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Card className="border-pink-200 dark:border-pink-900 bg-pink-500/5">
                  <CardHeader className="pb-1 pt-3">
                    <CardDescription className="text-[10px] text-pink-700 dark:text-pink-400 font-bold uppercase font-sans">
                      العصب الحرج الحاكم (Max stress)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pb-3 text-xs">
                    <span className="text-lg font-black font-mono text-pink-800 dark:text-pink-300">
                      {designResult.summary.controllingRibId}
                    </span>
                    <span className="block text-[10px] text-muted-foreground mt-1">
                      العصب الأكثر طلباً وتوزيعاً للعزوم في المنشأ بأكمله.
                    </span>
                  </CardContent>
                </Card>

                <Card className="border-blue-200 dark:border-blue-900 bg-blue-500/5">
                  <CardHeader className="pb-1 pt-3">
                    <CardDescription className="text-[10px] text-blue-700 dark:text-blue-400 font-bold uppercase font-sans">
                      أقصى عزم تصميمي للأعصاب
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pb-3 text-xs">
                    <span className="text-lg font-black font-mono text-blue-800 dark:text-blue-300">
                      {designResult.summary.maxMoment.toFixed(2)} kN.m
                    </span>
                    <span className="block text-[10px] text-muted-foreground mt-1">
                      يتحكم في تحديد قطر وعدد حديد التسليح الرئيسي السفلي والعلوي.
                    </span>
                  </CardContent>
                </Card>

                <Card className="border-teal-200 dark:border-teal-900 bg-teal-500/5">
                  <CardHeader className="pb-1 pt-3">
                    <CardDescription className="text-[10px] text-teal-700 dark:text-teal-400 font-bold uppercase font-sans">
                      حجم وكثافة التسليح المقاوم
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pb-3 text-xs">
                    <span className="text-lg font-black font-mono text-teal-800 dark:text-teal-300">
                      {designResult.summary.weightDensity.toFixed(2)} كجم/م²
                    </span>
                    <span className="block text-[10px] text-muted-foreground mt-1">
                      إجمالي كميات الحديد المصممة شاملة الأعصاب وبلاطة التغطية العلوي: {designResult.summary.totalRebarWeight.toFixed(1)} كجم.
                    </span>
                  </CardContent>
                </Card>
              </div>

              {/* Warning Messages list if any */}
              {designResult.warnings.length > 0 && (
                <Card className="border-red-200 dark:border-red-900 bg-red-500/5">
                  <CardHeader className="pb-1 py-3">
                    <CardTitle className="text-xs text-red-800 dark:text-red-300 font-bold flex items-center gap-1.5">
                      <AlertTriangle size={15} />
                      تحذيرات هندسية هامة (ACI Warnings)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3 text-xs leading-relaxed space-y-1">
                    <ul className="list-disc list-inside text-red-700 dark:text-red-400 space-y-1 text-[11px]">
                      {designResult.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Multi-span detailed summary list */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs flex items-center gap-1.5">
                    <TrendingUp size={14} className="text-purple-600" />
                    مؤشرات تحقيق الأكواد لتوزيع الأعصاب الهوردي
                  </CardTitle>
                  <CardDescription className="text-[10px]">
                    قائمة بجميع الأعصاب الموزعة بالبلاطات وحالتها الهندسية المعتمدة
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/10">
                        <TableHead className="text-[10px] w-24">رمز العصب</TableHead>
                        <TableHead className="text-[10px] text-center">النوع</TableHead>
                        <TableHead className="text-[10px] text-center">الاتجاه</TableHead>
                        <TableHead className="text-[10px] text-center">أقصى عزم (kN.m)</TableHead>
                        <TableHead className="text-[10px] text-center">أقصى قص (kN)</TableHead>
                        <TableHead className="text-[10px] text-center">سهْم الترخيم (مم)</TableHead>
                        <TableHead className="text-[10px] text-center">الحالة الإنشائية</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-[11px]">
                      {filteredRibs.map((r, i) => (
                        <TableRow key={i} className="hover:bg-muted/30">
                          <TableCell className="font-bold font-mono">{r.ribId}</TableCell>
                          <TableCell className="text-center">
                            {r.type === 'interior' ? 'داخلي' : 'طرفي'}
                          </TableCell>
                          <TableCell className="text-center font-mono font-bold text-slate-600 dark:text-slate-400">
                            {r.direction}
                          </TableCell>
                          <TableCell className="text-center font-mono text-blue-600 font-bold">
                            {Math.max(r.maxMomentPos, r.maxMomentNeg).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center font-mono text-purple-600">
                            {r.maxShear.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center font-mono text-teal-600">
                            {r.maxDeflection.toFixed(3)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              className={
                                r.status === 'SAFE'
                                  ? 'bg-green-600 text-[10px]'
                                  : r.status === 'WARNING'
                                  ? 'bg-amber-500 text-[10px]'
                                  : 'bg-red-600 text-[10px]'
                              }
                            >
                              {r.status === 'SAFE'
                                ? 'آمن محقق'
                                : r.status === 'WARNING'
                                ? 'تحذير ترخيم'
                                : 'مخالف للكود'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 2. RIB FLEXURAL DESIGN TAB */}
            <TabsContent value="rib-design" className="space-y-4">
              <Card className="border-purple-200 dark:border-purple-800 bg-purple-500/5">
                <CardContent className="py-3 px-4 flex items-start gap-2.5 text-xs text-purple-900 dark:text-purple-200 leading-relaxed">
                  <Info size={15} className="text-purple-600 mt-0.5 shrink-0" />
                  <div>
                    <strong>فلسفة تصميم الانحناء للأعصاب T-Beams (ACI 318-19 §9.8):</strong> تعمل البلاطة المضلعة ذات الاتجاه الواحد كمجموعة من الجسور المتصلة ذات المقطع T-Section. تكون بلاطة التغطية العلوية بمثابة الشفة (Flange) التي تعزز مقاومة الانضغاط لعزوم وسط البحر الموجبة (Positive Moments)، في حين تقلب مقاومة الضغط بالدعامة (Negative Supports) لتقتصر فقط على مقطع الجذع (Web width bw) ذو المستطيل الصغير.
                  </div>
                </CardContent>
              </Card>

              {filteredRibs.map((rib, idx) => (
                <Card key={idx} className="border-border">
                  <CardHeader className="py-2.5 px-4 bg-muted/10 flex flex-row items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-xs font-mono font-bold flex items-center gap-1 text-purple-950 dark:text-purple-100">
                        <span>{rib.ribId}</span>
                        <Badge variant="outline" className="text-[9px] font-sans">
                          {rib.type === 'interior' ? 'عصب داخلي مكرر' : 'عصب طرفي خارجي'}
                        </Badge>
                      </CardTitle>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      موقع التنسيق: {rib.direction === 'X' ? 'Y' : 'X'} = {rib.coordinate.toFixed(3)} م
                    </span>
                  </CardHeader>
                  <CardContent className="p-3">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px] w-20">البحرة</TableHead>
                            <TableHead className="text-[10px] text-center">العزم الموجب Mu⁺ (kN.m)</TableHead>
                            <TableHead className="text-[10px] text-center">حالة الـ T-Beam</TableHead>
                            <TableHead className="text-[10px] text-center">عزم المساند Mu⁻ (kN.m)</TableHead>
                            <TableHead className="text-[10px] text-center">الحديد المطلوب As (mm²)</TableHead>
                            <TableHead className="text-[10px] text-center">الحد الأدنى As_min</TableHead>
                            <TableHead className="text-[10px] text-center">انفعال الليونة εt</TableHead>
                            <TableHead className="text-[10px] text-center text-purple-700 dark:text-purple-400 font-bold">التسليح الموفر (Provided)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-[11px] font-mono">
                          {rib.spans.map((span, sIdx) => (
                            <TableRow key={sIdx}>
                              <TableCell className="font-sans font-semibold text-slate-700 dark:text-slate-300">
                                {span.slabId}
                              </TableCell>
                              <TableCell className="text-center font-bold text-blue-600">
                                {span.Mpos.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-center text-[10.5px] font-sans">
                                {span.Mpos < 0.1 ? (
                                  <span className="text-muted-foreground">-</span>
                                ) : span.midspanCase === 'A' ? (
                                  <Badge className="bg-blue-600 text-[9px] h-4">Case A (NA ⊆ tf)</Badge>
                                ) : (
                                  <Badge className="bg-orange-600 text-[9px] h-4">Case B (NA &gt; tf)</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-center text-red-600 font-semibold leading-relaxed">
                                <div className="flex flex-col text-[10px]">
                                  <span>يسار: {span.Mneg_left.toFixed(2)}</span>
                                  <span>يمين: {span.Mneg_right.toFixed(2)}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex flex-col text-[10px] text-slate-600 dark:text-slate-400 font-bold">
                                  <span>يسار: {span.As_req_left.toFixed(1)}</span>
                                  <span className="text-blue-600">وسط: {span.As_req_mid.toFixed(1)}</span>
                                  <span>يمين: {span.As_req_right.toFixed(1)}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <span className="font-bold text-[10px] text-muted-foreground">
                                  {span.As_min_mid.toFixed(1)} مم²
                                </span>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  className={
                                    span.strain_mid >= 0.005
                                      ? 'bg-green-600 text-[9px] font-bold h-4 font-mono'
                                      : 'bg-red-500 text-[9px] font-bold h-4 font-mono'
                                  }
                                >
                                  {span.strain_mid.toFixed(4)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center py-1 font-sans text-[10px]">
                                <div className="flex flex-col gap-0.5 leading-tight font-bold text-purple-700 dark:text-purple-300">
                                  <span>يسار: {span.bars_left} ({span.As_prov_left} مم²)</span>
                                  <span className="text-blue-600 font-bold">وسط: {span.bars_mid} ({span.As_prov_mid} مم²)</span>
                                  <span>يمين: {span.bars_right} ({span.As_prov_right} مم²)</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            {/* 3. SHEAR DESIGN TAB */}
            <TabsContent value="shear-design" className="space-y-4">
              <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-500/5">
                <CardContent className="py-3 px-4 flex items-start gap-2.5 text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed">
                  <Info size={15} className="text-emerald-600 mt-0.5 shrink-0" />
                  <div>
                    <strong>اشتراطات القص للأعصاب المضلعة (ACI 318-19 §9.8.1.5):</strong> يسمح الكود الأمريكي بزيادة مقاومة القص للخرسانة الخالية من الكانات بنسبة <strong>10%</strong> للأعصاب الهوردي بفضل مرونة توزيع القوى وقرب المسافات، بحيث تصبح قدرة التحمل الاسمية للخرسانة: Vc = 1.10 * 0.17 * phi * sqrt(fc') * bw * d. لا يشترط الكود تسليح كانات دنيا عندما تكون قوى القص المسلطة أقل من تحمل الخرسانة الشامل Vu &lt;= phi * Vc.
                  </div>
                </CardContent>
              </Card>

              {filteredRibs.map((rib, idx) => (
                <Card key={idx} className="border-border">
                  <CardHeader className="py-2.5 px-4 bg-muted/10-0/10 py-2">
                    <CardTitle className="text-xs font-mono font-bold text-emerald-950 dark:text-emerald-100 flex items-center gap-1.5">
                      <span>{rib.ribId}</span>
                      <span className="text-[10px] text-muted-foreground font-sans">
                        تحمل الخرسانة التصميمي للقص 𝜙Vc = {rib.spans[0]?.Vc.toFixed(1)} kN (شاملة زيادة الـ 10%)
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px] w-20">البحرة</TableHead>
                            <TableHead className="text-[10px] text-center">القص المسلط يسار Vu_left (kN)</TableHead>
                            <TableHead className="text-[10px] text-center">القص المسلط يمين Vu_right (kN)</TableHead>
                            <TableHead className="text-[10px] text-center">الخرسانة كافية؟</TableHead>
                            <TableHead className="text-[10px] text-center">حديد القص المطلوب Vs (kN)</TableHead>
                            <TableHead className="text-[10px] text-center text-emerald-700 dark:text-emerald-300 font-bold">تفاصيل الكانات المقترحة (Stirrup Details)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-[11px] font-mono">
                          {rib.spans.map((span, sIdx) => {
                            const isLSafe = Math.abs(span.Vu_left) <= 0.75 * span.Vc;
                            const isRSafe = Math.abs(span.Vu_right) <= 0.75 * span.Vc;
                            return (
                              <TableRow key={sIdx}>
                                <TableCell className="font-sans font-semibold text-slate-700 dark:text-slate-300">
                                  {span.slabId}
                                </TableCell>
                                <TableCell className="text-center text-slate-800 dark:text-slate-200">
                                  {Math.abs(span.Vu_left).toFixed(2)}
                                </TableCell>
                                <TableCell className="text-center text-slate-800 dark:text-slate-200">
                                  {Math.abs(span.Vu_right).toFixed(2)}
                                </TableCell>
                                <TableCell className="text-center">
                                  {isLSafe && isRSafe ? (
                                    <Badge className="bg-emerald-600 text-[10px] h-4">نعم (آمنة بمفردها)</Badge>
                                  ) : (
                                    <Badge className="bg-red-500 text-[10px] h-4">يلزم حديد تسليح</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-center text-slate-500">
                                  <div className="flex flex-col text-[10px]">
                                    <span>يسار: {span.Vs_left.toFixed(2)}</span>
                                    <span>يمين: {span.Vs_right.toFixed(2)}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center py-1 font-sans text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">
                                  <div className="flex flex-col text-[10px] leading-tight font-bold">
                                    <span>يسار: {span.stirrups_left}</span>
                                    <span>يمين: {span.stirrups_right}</span>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            {/* 4. DEFLECTION CHECKS */}
            <TabsContent value="deflection" className="space-y-4">
              <Card className="border-teal-200 dark:border-teal-800 bg-teal-500/5">
                <CardContent className="py-3 px-4 flex items-start gap-2.5 text-xs text-teal-900 dark:text-teal-200 leading-relaxed">
                  <Info size={15} className="text-teal-600 mt-0.5 shrink-0" />
                  <div>
                    <strong>صلابة ومقاومة الترخيم (ACI 318-19 §24.2):</strong> يتطلب تصميم الأسقف تلبية حدود الارتفاعات الدنيا (Thickness Limits) لحماية الأعضاء غير الإنشائية الهشة من التشوه. يمنع الكود الترخيم طويل الأجل وقصير الأجل من تجاوز الحدود الموصى بها والتي تكون $L/360$ بالنسبة للأحمال الحية الفورية.
                  </div>
                </CardContent>
              </Card>

              {filteredRibs.map((rib, idx) => (
                <Card key={idx} className="border-border">
                  <CardHeader className="py-2.5 px-4 bg-muted/10-0/10 py-2">
                    <CardTitle className="text-xs font-mono font-bold text-teal-950 dark:text-teal-100 flex items-center gap-1.5">
                      <span>{rib.ribId}</span>
                      <span className="text-[10px] text-teal-600 font-sans">
                        أقصى سهم ترخيم كلي مرصود: {rib.maxDeflection.toFixed(3)} مم
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px] w-20">البحرة</TableHead>
                            <TableHead className="text-[10px] text-center">طول الفضاء Ln (م)</TableHead>
                            <TableHead className="text-[10px] text-center">الارتفاع الموفر (h)</TableHead>
                            <TableHead className="text-[10px] text-center">سمك الكود المقترح</TableHead>
                            <TableHead className="text-[10px] text-center">تحقق السمك الأدنى</TableHead>
                            <TableHead className="text-[10px] text-center">تحديد سهم الترخيم المسموح L/360</TableHead>
                            <TableHead className="text-[10px] text-center">الترخيم الفعلي (mm)</TableHead>
                            <TableHead className="text-[10px] text-center">حالة التشوه</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-[11px] font-mono">
                          {rib.spans.map((span, sIdx) => (
                            <TableRow key={sIdx}>
                              <TableCell className="font-sans font-semibold text-slate-700 dark:text-slate-300">
                                {span.slabId}
                              </TableCell>
                              <TableCell className="text-center">{span.L.toFixed(2)}</TableCell>
                              <TableCell className="text-center">{h} مم</TableCell>
                              <TableCell className="text-center font-bold">
                                {(span.minRequiredDepth * 1000).toFixed(0)} مم
                              </TableCell>
                              <TableCell className="text-center">
                                {span.isDepthAdequate ? (
                                  <Badge className="bg-emerald-600 text-[9px] h-4">آمن (h ≥ h_min)</Badge>
                                ) : (
                                  <Badge className="bg-amber-500 text-[9px] h-4">أصغر من تقريب الكود</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-center text-slate-500">
                                {span.deflectionLimit.toFixed(1)} مم
                              </TableCell>
                              <TableCell className="text-center font-bold text-teal-600">
                                {span.actualDeflection.toFixed(3)}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  className={
                                    span.deflectionStatus === 'PASS'
                                      ? 'bg-green-600 text-[10px] font-bold h-4 font-sans'
                                      : 'bg-red-500 text-[10px] font-bold h-4 font-sans'
                                  }
                                >
                                  {span.deflectionStatus === 'PASS' ? 'محقق (PASS)' : 'مخالف (FAIL)'}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            {/* 5. TOPPING SLAB DESIGN */}
            <TabsContent value="topping-slab" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xs flex items-center gap-1.5 text-purple-950 dark:text-purple-100">
                      <Sparkles size={14} className="text-purple-600" />
                      بلاطة التغطية العلوية (Topping Slab Solid Cover)
                    </CardTitle>
                    <CardDescription className="text-[10px]">
                      محددات تسليح الانكماش والتغيرات الحرارية وطرق توزيع حديد التسليح
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-xs">
                    <div className="p-3 bg-muted/20 border rounded-lg space-y-2.5">
                      <div className="flex justify-between font-mono">
                        <span className="text-muted-foreground">سمك بلاطة التغطية tf:</span>
                        <span className="font-bold">{designResult.topping.thickness} مم</span>
                      </div>
                      <div className="flex justify-between font-mono">
                        <span className="text-muted-foreground">نسبة التسليح المطلوبة (𝝆_ts):</span>
                        <span className="font-bold">0.0018 (كود ACI)</span>
                      </div>
                      <div className="flex justify-between font-mono">
                        <span className="text-muted-foreground">المساحة المطلوبة للحديد As:</span>
                        <span className="font-bold text-purple-700">
                          {designResult.topping.AsRequired.toFixed(1)} مم² / م عرضي
                        </span>
                      </div>
                      <div className="flex justify-between font-mono">
                        <span className="text-muted-foreground">التسليح المكتمل للتغطية:</span>
                        <span className="font-bold text-emerald-600">
                          {designResult.topping.rebarGrid}
                        </span>
                      </div>
                      <div className="flex justify-between font-mono">
                        <span className="text-muted-foreground">تباعد الحدود القصوى المسموح:</span>
                        <span className="font-bold">{designResult.topping.spacingLimit.toFixed(0)} مم</span>
                      </div>
                    </div>

                    <div className="text-[11px] leading-relaxed text-muted-foreground bg-purple-500/5 p-2 rounded border border-purple-100 dark:border-purple-900">
                      💡 <strong>إرشاد فني للتنفيذ:</strong> يتم وضع التسليح الشبكي للبلاطة العلوية في الثلث العلوي من سمك بلاطة التغطية للسيطرة الفعالة على شروخ الإجهاد والانكماش، مع ضمان تغطية خرسانية صافية لا تقل عن 20 مم. يتم استخدام مرابط بلاستيكية لتثبيت الشبكة بالارتفاع المطلوب.
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-purple-200 dark:border-purple-900 bg-purple-500/5 flex flex-col justify-between">
                  <CardHeader>
                    <CardTitle className="text-xs flex items-center gap-1.5">
                      <Boxes size={14} className="text-purple-600" />
                      توزيع كميات حديد بلاطة التغطية
                    </CardTitle>
                    <CardDescription className="text-[10px]">
                      تفاصيل الحصر الكمي والوزن المقدر لحديد التغطية المنكمش بالكامل
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 flex-1 flex flex-col justify-between text-xs">
                    <div className="space-y-2">
                      <p className="leading-relaxed">
                        بناء على مساحة السقف الإجمالي المرصودة بالتطبيق وهي واجهة تقريبية <strong>{designResult.summary.totalSlabArea.toFixed(1)} م²</strong>:
                      </p>
                      
                      <div className="p-3 border rounded-lg bg-background/50 space-y-2 font-mono">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">وزن شبكة الحديد الذاتية:</span>
                          <span className="font-bold">{designResult.topping.weightPerSqm.toFixed(2)} كجم/م²</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">إجمالي كمية حديد التغطية:</span>
                          <span className="font-bold text-purple-600">
                            {(designResult.topping.weightPerSqm * designResult.summary.totalSlabArea).toFixed(1)} كجم
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] leading-relaxed text-muted-foreground">
                      {designResult.topping.barsInfo}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* 6. REBAR DETAILS DATABASE TAB */}
            <TabsContent value="rebar-db" className="space-y-4">
              <Card className="border-purple-200 dark:border-purple-800 bg-purple-500/5">
                <CardContent className="py-3 px-4 flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Database className="text-purple-600" size={16} />
                    <span className="font-bold">مستند جدول تفريد وبطاقات تسليح الأعصاب (Bar Bending Schedule - BBS)</span>
                  </div>
                  <Badge variant="outline" className="bg-background text-[10px] text-purple-700 border-purple-400">كميات خالية من الهدر</Badge>
                </CardContent>
              </Card>

              {/* Table list of all schedules */}
              <Card>
                <CardHeader className="pb-1.5 pt-3 flex flex-row items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-xs">بطاقات الحصر والتفريد القياسي للبلاطة</CardTitle>
                    <CardDescription className="text-[10px]">
                      تفاصيل أطوال الحديد والكميات والأوزان اللازمة للتواصل المباشر مع المصنع والحدادين.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/10">
                        <TableHead className="text-[10px] w-20">علامة السيخ (Mark)</TableHead>
                        <TableHead className="text-[10px] text-center">نوع التسليح</TableHead>
                        <TableHead className="text-[10px] font-bold text-center">العضو والموقع</TableHead>
                        <TableHead className="text-[10px] text-center">القطر (مم)</TableHead>
                        <TableHead className="text-[10px] text-center">العدد بالمتر/العصب</TableHead>
                        <TableHead className="text-[10px] text-center">طول السيخ (م)</TableHead>
                        <TableHead className="text-[10px] text-center">إجمالي الوزن (kg)</TableHead>
                        <TableHead className="text-[10px] font-sans">التوصيف الفني للتفريد (BBS Specification)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-[11px] font-mono">
                      {/* Gather and render rebar for active rib or all */}
                      {(() => {
                        let combinedRebars: RibBarDetail[] = [];
                        designResult.ribs.forEach((r) => {
                          if (selectedRibId === 'ALL' || r.ribId === selectedRibId) {
                            combinedRebars.push(...r.rebarSchedule);
                          }
                        });

                        // fallback if empty
                        if (combinedRebars.length === 0) {
                          return (
                            <TableRow>
                              <TableCell colSpan={8} className="text-center py-6 text-muted-foreground text-xs font-sans">
                                لا توجد بيانات تفريد مطابقة لمعايير الفلترة الحالية.
                              </TableCell>
                            </TableRow>
                          );
                        }

                        return combinedRebars.map((b, idx) => (
                          <TableRow key={idx} className="hover:bg-muted/30">
                            <TableCell className="font-bold text-slate-800 dark:text-slate-100">{b.barMark}</TableCell>
                            <TableCell className="text-center font-sans">
                              {b.type === 'BOT_CONT' ? (
                                <Badge className="bg-blue-600 text-[9px] h-4">سفلي مستمر</Badge>
                              ) : b.type === 'TOP_SUPPORT' ? (
                                <Badge className="bg-red-500 text-[9px] h-4">علوي سالب</Badge>
                              ) : (
                                <Badge className="bg-purple-600 text-[9px] h-4">كانة قناة</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-center font-sans font-bold">
                              {b.memberId}
                            </TableCell>
                            <TableCell className="text-center font-bold">
                              Φ{b.diameter}
                            </TableCell>
                            <TableCell className="text-center">
                              {b.count}
                            </TableCell>
                            <TableCell className="text-center font-bold">
                              {b.length.toFixed(2)} م
                            </TableCell>
                            <TableCell className="text-center font-bold text-teal-600">
                              {b.weight.toFixed(2)}
                            </TableCell>
                            <TableCell className="font-sans text-[10px] leading-relaxed text-muted-foreground">
                              {b.description}
                            </TableCell>
                          </TableRow>
                        ));
                      })()}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function BoxIcon({ variant }: { variant: 'purple' | 'teal' }) {
  return (
    <span className={`inline-block w-4 h-4 rounded border flex items-center justify-center font-bold text-[9px] mr-1 ${variant === 'purple' ? 'border-purple-600 text-purple-600' : 'border-teal-600 text-teal-600'}`}>
      𐃏
    </span>
  );
}
