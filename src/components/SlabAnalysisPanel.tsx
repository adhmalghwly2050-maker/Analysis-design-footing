/**
 * تبويب تحليل البلاطات المستمرة — ACI 318-19
 * يعرض نتائج التحليل بطريقة الشريحة (1م) في اتجاه X و Y
 */
import React, { useMemo, useState, type ReactElement } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Calculator, ArrowRight, Layers, HelpCircle, AlertTriangle, CheckCircle2, TrendingUp, Info } from 'lucide-react';
import type { Slab, SlabProps, MatProps, Column, Beam } from '@/lib/structuralEngine';
import { analyzeAllContinuousSlabs, type ContinuousSlabResult } from '@/lib/continuousSlabAnalysis';
import { analyzeOneWayRibbedSystem, type RibbedSlabAnalysisResult, type AnalyticalRib } from '@/lib/ribbedSlabSolver';

interface SlabAnalysisPanelProps {
  slabs: Slab[];
  slabProps: SlabProps;
  mat: MatProps;
  ribbedSlabProps?: any;
  columns?: Column[];
  beams?: Beam[];
}

export default function SlabAnalysisPanel({ slabs, slabProps, mat, ribbedSlabProps, columns, beams }: SlabAnalysisPanelProps) {
  const [results, setResults] = useState<ContinuousSlabResult[] | null>(null);
  const [selectedStrip, setSelectedStrip] = useState<string | null>(null);
  
  // Destructure ribbed slab parameters with safe defaults
  const {
    bw = 100,
    hb = 200,
    tf = 70,
    s = 400,
    fillerType = 'block'
  } = ribbedSlabProps || {};
  
  // Tab control states for the ribbed joist force diagrams
  const [selectedRibId, setSelectedRibId] = useState<string | null>(null);
  const [diagramType, setDiagramType] = useState<'moment' | 'shear' | 'deflection'>('moment');

  const runAnalysis = () => {
    const r = analyzeAllContinuousSlabs(slabs, slabProps, mat);
    setResults(r);
    if (r.length > 0) setSelectedStrip(r[0].stripId);
  };

  // Real-time calculation of One-Way Ribbed Slab System
  const ribbedResult = useMemo(() => {
    return analyzeOneWayRibbedSystem(slabs, slabProps, mat, ribbedSlabProps);
  }, [slabs, slabProps, mat, ribbedSlabProps]);

  const hasRibbedSlabs = slabs.some(s => s.slabType === 'one_way_ribbed');

  // Set default active rib when ribs change
  React.useEffect(() => {
    if (ribbedResult.ribs.length > 0 && !selectedRibId) {
      // Default to controlling rib
      setSelectedRibId(ribbedResult.controllingRib?.id || ribbedResult.ribs[0].id);
    }
  }, [ribbedResult, selectedRibId]);

  const activeRib = ribbedResult.ribs.find(r => r.id === selectedRibId);

  const xStrips = results?.filter(r => r.direction === 'X') || [];
  const yStrips = results?.filter(r => r.direction === 'Y') || [];
  const activeResult = results?.find(r => r.stripId === selectedStrip);

  if (slabs.length < 2 && !hasRibbedSlabs) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Layers size={32} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            يجب إدخال بلاطتين متجاورتين على الأقل لتحليل البلاطات المستمرة
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <Card className="border-teal-200 dark:border-teal-800 bg-teal-500/5">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Calculator size={16} className="text-teal-600" />
              <span className="text-sm font-semibold">تحليل البلاطات المستمرة — ACI 318-19 §6.5</span>
            </div>
            <Button onClick={runAnalysis} size="sm" className="min-h-[36px] bg-teal-600 hover:bg-teal-700">
              <Calculator size={14} className="mr-1" />
              تشغيل التحليل
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            طريقة الشريحة (عرض 1 متر) باستخدام معاملات العزم التقريبية — ACI 318-19 Table 6.5.2
          </p>
        </CardContent>
      </Card>

      {results && results.length === 0 && !hasRibbedSlabs && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            لم يتم اكتشاف بلاطات مستمرة (متجاورة). تأكد من أن البلاطات متصلة ببعضها.
          </CardContent>
        </Card>
      )}

      {((results && results.length > 0) || hasRibbedSlabs) && (
        <Tabs defaultValue={hasRibbedSlabs && (!results || results.length === 0) ? "ribbed-analysis" : "strips"} className="space-y-2">
          <TabsList className="w-full justify-start overflow-x-auto">
            {results && results.length > 0 && (
              <>
                <TabsTrigger value="strips" className="text-xs">الشرائط المكتشفة</TabsTrigger>
                <TabsTrigger value="details" className="text-xs">تفاصيل النتائج</TabsTrigger>
              </>
            )}
            {hasRibbedSlabs && (
              <TabsTrigger value="ribbed-analysis" className="text-xs text-purple-700 dark:text-purple-400 bg-purple-500/5 dark:bg-purple-900/15 font-semibold gap-1.5 border border-purple-200/50">
                <Layers size={13} className="text-purple-600 dark:text-purple-400" />
                تحليل الأعصاب الهوردي
              </TabsTrigger>
            )}
            {results && results.length > 0 && (
              <TabsTrigger value="summary" className="text-xs">ملخص</TabsTrigger>
            )}
          </TabsList>

          {/* ── قائمة الشرائط ── */}
          <TabsContent value="strips" className="space-y-3">
            {xStrips.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ArrowRight size={14} className="text-blue-500" />
                    شرائط اتجاه X ({xStrips.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {xStrips.map(s => (
                      <div
                        key={s.stripId}
                        onClick={() => setSelectedStrip(s.stripId)}
                        className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                          selectedStrip === s.stripId
                            ? 'border-teal-400 bg-teal-500/10'
                            : 'border-border hover:border-teal-300 hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{s.stripId}</Badge>
                            <span className="text-xs">Y = {s.fixedCoord.toFixed(1)}m</span>
                            <span className="text-[10px] text-muted-foreground">
                              ({s.spans.length} بحرات)
                            </span>
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground">
                            M⁺={s.maxPositiveMoment.toFixed(1)} | M⁻={s.maxNegativeMoment.toFixed(1)} kN.m
                          </div>
                        </div>
                        <div className="flex gap-1 mt-1">
                          {s.spans.map((sp, i) => (
                            <React.Fragment key={i}>
                              {i > 0 && <div className="w-px bg-foreground/30 self-stretch" />}
                              <div className="text-[9px] text-center flex-1 px-1 py-0.5 rounded bg-muted/50">
                                {sp.slabId} ({sp.spanLength.toFixed(1)}m)
                              </div>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {yStrips.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ArrowRight size={14} className="text-purple-500 rotate-90" />
                    شرائط اتجاه Y ({yStrips.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {yStrips.map(s => (
                      <div
                        key={s.stripId}
                        onClick={() => setSelectedStrip(s.stripId)}
                        className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                          selectedStrip === s.stripId
                            ? 'border-teal-400 bg-teal-500/10'
                            : 'border-border hover:border-teal-300 hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{s.stripId}</Badge>
                            <span className="text-xs">X = {s.fixedCoord.toFixed(1)}m</span>
                            <span className="text-[10px] text-muted-foreground">
                              ({s.spans.length} بحرات)
                            </span>
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground">
                            M⁺={s.maxPositiveMoment.toFixed(1)} | M⁻={s.maxNegativeMoment.toFixed(1)} kN.m
                          </div>
                        </div>
                        <div className="flex gap-1 mt-1">
                          {s.spans.map((sp, i) => (
                            <React.Fragment key={i}>
                              {i > 0 && <div className="w-px bg-foreground/30 self-stretch" />}
                              <div className="text-[9px] text-center flex-1 px-1 py-0.5 rounded bg-muted/50">
                                {sp.slabId} ({sp.spanLength.toFixed(1)}m)
                              </div>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── تفاصيل النتائج ── */}
          <TabsContent value="details" className="space-y-3">
            {activeResult ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Badge className="bg-teal-500">{activeResult.stripId}</Badge>
                    شريحة {activeResult.direction} — 
                    {activeResult.direction === 'X' ? `Y = ${activeResult.fixedCoord.toFixed(1)}m` : `X = ${activeResult.fixedCoord.toFixed(1)}m`}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* معلومات الأحمال */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-muted/50 p-2">
                      <div className="text-[10px] text-muted-foreground">Wu (kN/m²)</div>
                      <div className="text-sm font-bold font-mono">{activeResult.Wu.toFixed(2)}</div>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <div className="text-[10px] text-muted-foreground">wu/m (kN/m)</div>
                      <div className="text-sm font-bold font-mono">{activeResult.wuPerMeter.toFixed(2)}</div>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <div className="text-[10px] text-muted-foreground">عدد البحرات</div>
                      <div className="text-sm font-bold font-mono">{activeResult.spans.length}</div>
                    </div>
                  </div>

                  {activeResult.isRibbed && (
                    <div className="mb-3 p-3 text-xs bg-purple-500/10 border border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-200 rounded-lg">
                      <div className="font-bold mb-1">📢 شريحة بلاطة مضلعة (One-Way Ribbed Slab):</div>
                      <div>تم تحليل شريحة بعرض 1.0 متر تحتوي على عصبين (2 Ribs). القاطعات في الجدول توضح العزم والقص الإجمالي للشريحة، وتحتها بين القوسين <strong>(...)</strong> القيم المخصصة للعصب المنفرد الواحد للتصميم المباشر!</div>
                    </div>
                  )}

                  {/* BMD Diagram */}
                  <StripBMDiagram result={activeResult} />

                  {/* جدول النتائج */}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] w-16">البلاطة</TableHead>
                          <TableHead className="text-[10px] text-center">Ln (m)</TableHead>
                          <TableHead className="text-[10px] text-center">M⁻ يسار</TableHead>
                          <TableHead className="text-[10px] text-center">M⁺</TableHead>
                          <TableHead className="text-[10px] text-center">M⁻ يمين</TableHead>
                          <TableHead className="text-[10px] text-center">Vu يسار</TableHead>
                          <TableHead className="text-[10px] text-center">Vu يمين</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeResult.spans.map((sp, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-[10px] font-mono">{sp.slabId}</TableCell>
                            <TableCell className="text-[10px] text-center font-mono">{sp.spanLength.toFixed(2)}</TableCell>
                            <TableCell className="text-[10px] text-center font-mono text-red-600">
                              <div>{sp.Mneg_left.toFixed(2)}</div>
                              {sp.isRibbed && sp.Mneg_left_per_rib !== undefined && (
                                <div className="text-[9px] text-purple-700 dark:text-purple-400 font-sans">
                                  ({sp.Mneg_left_per_rib.toFixed(2)} / عصب)
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-[10px] text-center font-mono text-blue-600">
                              <div>{sp.Mpos.toFixed(2)}</div>
                              {sp.isRibbed && sp.Mpos_per_rib !== undefined && (
                                <div className="text-[9px] text-purple-700 dark:text-purple-400 font-sans">
                                  ({sp.Mpos_per_rib.toFixed(2)} / عصب)
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-[10px] text-center font-mono text-red-600">
                              <div>{sp.Mneg_right.toFixed(2)}</div>
                              {sp.isRibbed && sp.Mneg_right_per_rib !== undefined && (
                                <div className="text-[9px] text-purple-700 dark:text-purple-400 font-sans">
                                  ({sp.Mneg_right_per_rib.toFixed(2)} / عصب)
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-[10px] text-center font-mono text-slate-700 dark:text-slate-300">
                              <div>{sp.Vu_left.toFixed(2)}</div>
                              {sp.isRibbed && sp.Vu_left_per_rib !== undefined && (
                                <div className="text-[9px] text-purple-700 dark:text-purple-400 font-sans">
                                  ({sp.Vu_left_per_rib.toFixed(2)} / عصب)
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-[10px] text-center font-mono text-slate-700 dark:text-slate-300">
                              <div>{sp.Vu_right.toFixed(2)}</div>
                              {sp.isRibbed && sp.Vu_right_per_rib !== undefined && (
                                <div className="text-[9px] text-purple-700 dark:text-purple-400 font-sans">
                                  ({sp.Vu_right_per_rib.toFixed(2)} / عصب)
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* جدول التسليح */}
                  <div className="overflow-x-auto">
                    <p className="text-xs font-semibold mb-1">تسليح شرائح البلاطة المقترح والحد الأدنى (مبني على Φ{slabProps.phiSlab || 12} مم):</p>
                    {(() => {
                      const dia = slabProps.phiSlab || 12;
                      const formatRebar = (As: number) => {
                        const abar = (Math.PI / 4) * dia * dia;
                        const spacingRaw = (abar / Math.max(As, 1)) * 1000;
                        const spacing = Math.max(100, Math.min(200, Math.round(spacingRaw / 25) * 25));
                        const nPerM = Math.max(5, Math.round(1000 / spacing));
                        return `${nPerM}Φ${dia}/m`;
                      };
                      const formatRibRebar = (AsRib: number) => {
                        const abar = (Math.PI / 4) * dia * dia;
                        const nBars = Math.max(1, Math.ceil(AsRib / abar));
                        return `${nBars}Φ${dia}`;
                      };
                      return (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-[10px] w-16">البلاطة</TableHead>
                              <TableHead className="text-[10px] text-center">التسليح يسار As⁻</TableHead>
                              <TableHead className="text-[10px] text-center">التسليح وسط As⁺</TableHead>
                              <TableHead className="text-[10px] text-center">التسليح يمين As⁻</TableHead>
                              <TableHead className="text-[10px] text-center">الحد الأدنى As,min</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {activeResult.spans.map((sp, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-[10px] font-mono font-semibold">{sp.slabId}</TableCell>
                                <TableCell className="text-[10px] text-center font-mono">
                                  <div className="font-bold text-red-600">{formatRebar(sp.As_neg_left)}</div>
                                  <div className="text-[9px] text-muted-foreground">({sp.As_neg_left.toFixed(0)} mm²/m)</div>
                                  {sp.isRibbed && sp.As_neg_left_per_rib !== undefined && (
                                    <div className="text-[9px] text-purple-700 dark:text-purple-400 font-sans font-bold">
                                      ({formatRibRebar(sp.As_neg_left_per_rib)} / عصب)
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-[10px] text-center font-mono">
                                  <div className="font-bold text-blue-600">{formatRebar(sp.As_pos)}</div>
                                  <div className="text-[9px] text-muted-foreground">({sp.As_pos.toFixed(0)} mm²/m)</div>
                                  {sp.isRibbed && sp.As_pos_per_rib !== undefined && (
                                    <div className="text-[9px] text-purple-700 dark:text-purple-400 font-sans font-bold">
                                      ({formatRibRebar(sp.As_pos_per_rib)} / عصب)
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-[10px] text-center font-mono">
                                  <div className="font-bold text-red-600">{formatRebar(sp.As_neg_right)}</div>
                                  <div className="text-[9px] text-muted-foreground">({sp.As_neg_right.toFixed(0)} mm²/m)</div>
                                  {sp.isRibbed && sp.As_neg_right_per_rib !== undefined && (
                                    <div className="text-[9px] text-purple-700 dark:text-purple-400 font-sans font-bold">
                                      ({formatRibRebar(sp.As_neg_right_per_rib)} / عصب)
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-[10px] text-center font-mono">
                                  <div className="font-bold text-muted-foreground">{formatRebar(sp.As_min)}</div>
                                  <div className="text-[9px] text-muted-foreground">({sp.As_min.toFixed(0)} mm²/m)</div>
                                  {sp.isRibbed && sp.As_min_per_rib !== undefined && (
                                    <div className="text-[9px] text-purple-700 dark:text-purple-400 font-sans">
                                      {sp.As_min_per_rib.toFixed(0)} mm² للعصب
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  اختر شريحة من تبويب "الشرائط المكتشفة" لعرض تفاصيلها
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── ملخص ── */}
          <TabsContent value="summary" className="space-y-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">ملخص التحليل</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-blue-500/10 border border-blue-200 dark:border-blue-800 p-3">
                    <div className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">اتجاه X</div>
                    <div className="text-[10px] space-y-0.5">
                      <div>عدد الشرائط: <span className="font-mono">{xStrips.length}</span></div>
                      {xStrips.length > 0 && (
                        <>
                          <div>أقصى M⁺: <span className="font-mono text-blue-600">{Math.max(...xStrips.map(s => s.maxPositiveMoment)).toFixed(2)} kN.m</span></div>
                          <div>أقصى M⁻: <span className="font-mono text-red-600">{Math.max(...xStrips.map(s => s.maxNegativeMoment)).toFixed(2)} kN.m</span></div>
                          <div>أقصى Vu: <span className="font-mono">{Math.max(...xStrips.map(s => s.maxShear)).toFixed(2)} kN</span></div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg bg-purple-500/10 border border-purple-200 dark:border-purple-800 p-3">
                    <div className="text-xs font-semibold text-purple-700 dark:text-purple-400 mb-1">اتجاه Y</div>
                    <div className="text-[10px] space-y-0.5">
                      <div>عدد الشرائط: <span className="font-mono">{yStrips.length}</span></div>
                      {yStrips.length > 0 && (
                        <>
                          <div>أقصى M⁺: <span className="font-mono text-blue-600">{Math.max(...yStrips.map(s => s.maxPositiveMoment)).toFixed(2)} kN.m</span></div>
                          <div>أقصى M⁻: <span className="font-mono text-red-600">{Math.max(...yStrips.map(s => s.maxNegativeMoment)).toFixed(2)} kN.m</span></div>
                          <div>أقصى Vu: <span className="font-mono">{Math.max(...yStrips.map(s => s.maxShear)).toFixed(2)} kN</span></div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-3 p-2 rounded bg-muted/50 text-[10px] text-muted-foreground">
                  <p className="font-semibold mb-1">ملاحظات:</p>
                  <ul className="space-y-0.5 list-disc list-inside">
                    <li>التحليل باستخدام معاملات ACI 318-19 Table 6.5.2</li>
                    <li>شريحة بعرض 1 متر في كل اتجاه</li>
                    <li>العزوم بوحدة kN.m/m والتسليح بوحدة mm²/m</li>
                    <li>الشروط: أحمال موزعة، نسبة البحرات ≤ 1.2، LL ≤ 3×DL</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── تبويب تحليل الأعصاب الهوردي ── */}
          {hasRibbedSlabs && (
            <TabsContent value="ribbed-analysis" className="space-y-4">
              {/* 1. التحقق من اشتراطات الكود الأمريكي (ACI Checks) */}
              <Card className="border-purple-200 dark:border-purple-800">
                <CardHeader className="pb-2 bg-purple-500/5">
                  <CardTitle className="text-sm flex items-center gap-1.5 text-purple-950 dark:text-purple-100">
                    <CheckCircle2 size={16} className="text-purple-600 dark:text-purple-400" />
                    التحقق من المحددات الإنشائية (ACI 318-19 §9.8)
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-3 space-y-3">
                  {/* Warning Box */}
                  {ribbedResult.validation.warnings.length > 0 ? (
                    <div className="p-3 bg-red-500/10 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-400 space-y-1.5 animate-pulse-once">
                      <div className="font-bold flex items-center gap-1.5">
                        <AlertTriangle size={14} />
                        توجد مخالفات لمتطلبات الكود للإبعاد الدنيا الجائزة:
                      </div>
                      <ul className="list-disc list-inside space-y-1">
                        {ribbedResult.validation.warnings.map((w, idx) => (
                          <li key={idx} className="leading-relaxed">{w}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="p-3 bg-green-500/10 border border-green-200 dark:border-green-900/50 rounded-lg text-xs text-green-700 dark:text-green-400 font-medium flex items-center gap-2">
                      <CheckCircle2 size={15} />
                      تتوافق الأبعاد الهندسية الحالية بالكامل مع المحددات القياسية للكود الأمريكي ACI 318-19 Table 9.8!
                    </div>
                  )}

                  {/* Grid of details */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                    <div className="border border-border rounded-lg p-2 bg-muted/20">
                      <div className="text-[10px] text-muted-foreground">عرض العصب bw</div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-sm font-bold font-mono">{ribbedSlabProps?.bw ?? 100} مم</span>
                        <Badge className={(ribbedSlabProps?.bw ?? 100) >= 100 ? "bg-green-500 text-[9px] h-4 px-1" : "bg-red-500 text-[9px] h-4 px-1"}>
                          {(ribbedSlabProps?.bw ?? 100) >= 100 ? "آمن >= 100" : "مخالف < 100"}
                        </Badge>
                      </div>
                    </div>
                    <div className="border border-border rounded-lg p-2 bg-muted/20">
                      <div className="text-[10px] text-muted-foreground">تباعد الأعصاب صافي s</div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-sm font-bold font-mono">{ribbedSlabProps?.s ?? 400} مم</span>
                        <Badge className={(ribbedSlabProps?.s ?? 400) <= 762 ? "bg-green-500 text-[9px] h-4 px-1" : "bg-red-500 text-[9px] h-4 px-1"}>
                          {(ribbedSlabProps?.s ?? 400) <= 762 ? "آمن <= 762" : "مخالف > 762"}
                        </Badge>
                      </div>
                    </div>
                    <div className="border border-border rounded-lg p-2 bg-muted/20">
                      <div className="text-[10px] text-muted-foreground">الارتفاع النسبي hb/(bw)</div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-sm font-bold font-mono">{(((ribbedSlabProps?.tf ?? 70) + (ribbedSlabProps?.hb ?? 200)) / (ribbedSlabProps?.bw ?? 100)).toFixed(2)}</span>
                        <Badge className={((ribbedSlabProps?.tf ?? 70) + (ribbedSlabProps?.hb ?? 200)) <= 3.5 * (ribbedSlabProps?.bw ?? 100) ? "bg-green-500 text-[9px] h-4 px-1" : "bg-red-500 text-[9px] h-4 px-1"}>
                          {((ribbedSlabProps?.tf ?? 70) + (ribbedSlabProps?.hb ?? 200)) <= 3.5 * (ribbedSlabProps?.bw ?? 100) ? "آمن <= 3.5" : "مخالف > 3.5"}
                        </Badge>
                      </div>
                    </div>
                    <div className="border border-border rounded-lg p-2 bg-muted/20">
                      <div className="text-[10px] text-muted-foreground">بلاطة التغطية tf</div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-sm font-bold font-mono">{ribbedSlabProps?.tf ?? 70} مم</span>
                        <Badge className={(ribbedSlabProps?.tf ?? 70) >= Math.max(50, (ribbedSlabProps?.s ?? 400) / 12) ? "bg-green-500 text-[9px] h-4 px-1" : "bg-red-500 text-[9px] h-4 px-1"}>
                          {(ribbedSlabProps?.tf ?? 70) >= Math.max(50, (ribbedSlabProps?.s ?? 400) / 12) ? "آمن" : "مخالف"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 2. مخطط توزيع الأعصاب والمساحات الرافدة (CAD Dynamic view) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-7 space-y-3">
                  {/* تفاعلي CAD Map */}
                  <div className="border border-border rounded-lg bg-card p-3 relative flex flex-col items-center shadow-sm">
                    <div className="flex items-center justify-between w-full mb-2">
                      <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                        <Layers size={14} className="text-purple-600" />
                        رسم مخطط الأعصاب وعرض المساحة الرافدة (Tributary Area)
                      </span>
                      <span className="text-[9px] bg-muted px-1.5 py-0.5 text-muted-foreground font-mono rounded">أبعاد فعلية</span>
                    </div>

                    <div className="w-full text-[10px] text-center mb-1 bg-muted/35 py-1 px-2 rounded text-muted-foreground leading-relaxed">
                      انقر على أي عصب (أو شريطه الملون) في الرسم لتفعيله وعرض مخططات العزم والقص والترخيم المفصلة له بالأسفل.
                    </div>

                    <div className="w-full h-fit flex justify-center py-2 relative bg-slate-950/5 dark:bg-slate-950/40 rounded border border-dashed border-border">
                      <svg width="100%" height="240" viewBox="0 0 500 240" className="w-full h-auto" style={{ maxWidth: 500 }}>
                        {(() => {
                          const xCoords = slabs.flatMap(s => [s.x1, s.x2]);
                          const yCoords = slabs.flatMap(s => [s.y1, s.y2]);
                          
                          const xMin = xCoords.length > 0 ? Math.min(...xCoords) : 0;
                          const xMax = xCoords.length > 0 ? Math.max(...xCoords) : 10;
                          const yMin = yCoords.length > 0 ? Math.min(...yCoords) : 0;
                          const yMax = yCoords.length > 0 ? Math.max(...yCoords) : 10;

                          const localW = xMax - xMin || 1;
                          const localH = yMax - yMin || 1;
                          const padding = 25;
                          const scale = Math.min((500 - 2 * padding) / localW, (240 - 2 * padding) / localH);

                          const toSvgX = (x: number) => padding + (x - xMin) * scale;
                          const toSvgY = (y: number) => 240 - padding - (y - yMin) * scale;

                          return (
                            <>
                              {/* Background Grids */}
                              <pattern id="grid-pattern" width="10" height="10" patternUnits="userSpaceOnUse">
                                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.1" opacity="0.15" />
                              </pattern>
                              <rect width="500" height="240" fill="url(#grid-pattern)" opacity="0.3" />

                              {/* 1. Slabs background bounding */}
                              {slabs.map((s) => {
                                const x0 = toSvgX(Math.min(s.x1, s.x2));
                                const x1 = toSvgX(Math.max(s.x1, s.x2));
                                const y0 = toSvgY(Math.max(s.y1, s.y2));
                                const y1 = toSvgY(Math.min(s.y1, s.y2));
                                const w = x1 - x0;
                                const h = y1 - y0;
                                const isCurrentRibbed = s.slabType === 'one_way_ribbed';
                                return (
                                  <rect
                                    key={s.id}
                                    x={x0}
                                    y={y0}
                                    width={w}
                                    height={h}
                                    fill={isCurrentRibbed ? "rgba(168, 85, 247, 0.02)" : "rgba(148, 163, 184, 0.04)"}
                                    stroke={isCurrentRibbed ? "rgba(168, 85, 247, 0.15)" : "rgba(148, 163, 184, 0.1)"}
                                    strokeWidth="1"
                                    rx="2"
                                  />
                                );
                              })}

                              {/* 2. Tributary Width Backgrounds & Arrows for Ribs */}
                              {ribbedResult.ribs.map(rib => {
                                const spans = rib.spans;
                                if (spans.length === 0) return null;
                                const firstSpan = spans[0];
                                const lastSpan = spans[spans.length - 1];

                                const isSelected = rib.id === selectedRibId;
                                const isCritical = rib.id === ribbedResult.controllingRib?.id;

                                const fillCol = isSelected ? "rgba(139, 92, 246, 0.08)" : "rgba(148, 163, 184, 0.02)";
                                const strokeCol = isSelected ? "rgba(139, 92, 246, 0.25)" : "rgba(148, 163, 184, 0.08)";

                                if (rib.direction === 'X') {
                                  // Horizontal lines, tributary height along Y
                                  const x0 = toSvgX(firstSpan.startCoord);
                                  const x1 = toSvgX(lastSpan.endCoord);
                                  const yMid = toSvgY(rib.coordinate);
                                  const halfTrib = (rib.tributaryWidth * scale) / 2;
                                  
                                  const yTop = yMid - halfTrib;
                                  const yBot = yMid + halfTrib;

                                  return (
                                    <g key={`trib-${rib.id}`}>
                                      {/* Tributary block */}
                                      <rect
                                        x={x0}
                                        y={yTop}
                                        width={x1 - x0}
                                        height={yBot - yTop}
                                        fill={fillCol}
                                        stroke={strokeCol}
                                        strokeWidth="0.5"
                                        onClick={() => setSelectedRibId(rib.id)}
                                        className="cursor-pointer transition-colors"
                                      />
                                      {/* Load direction arrows */}
                                      {isSelected && (
                                        <>
                                          <line x1={(x0+x1)/2 - 15} y1={yTop + 2} x2={(x0+x1)/2 - 15} y2={yMid - 2} stroke="#a78bfa" strokeWidth="0.8" markerEnd="url(#arrow)" />
                                          <line x1={(x0+x1)/2 + 15} y1={yBot - 2} x2={(x0+x1)/2 + 15} y2={yMid + 2} stroke="#a78bfa" strokeWidth="0.8" markerEnd="url(#arrow)" />
                                        </>
                                      )}
                                    </g>
                                  );
                                } else {
                                  // Vertical lines, tributary width along X
                                  const y0 = toSvgY(lastSpan.endCoord);
                                  const y1 = toSvgY(firstSpan.startCoord);
                                  const xMid = toSvgX(rib.coordinate);
                                  const halfTrib = (rib.tributaryWidth * scale) / 2;

                                  const xLeft = xMid - halfTrib;
                                  const xRight = xMid + halfTrib;

                                  return (
                                    <g key={`trib-${rib.id}`}>
                                      {/* Tributary block */}
                                      <rect
                                        x={xLeft}
                                        y={y0}
                                        width={xRight - xLeft}
                                        height={y1 - y0}
                                        fill={fillCol}
                                        stroke={strokeCol}
                                        strokeWidth="0.5"
                                        onClick={() => setSelectedRibId(rib.id)}
                                        className="cursor-pointer transition-colors"
                                      />
                                      {/* Load direction arrows */}
                                      {isSelected && (
                                        <>
                                          <line x1={xLeft + 2} y1={(y0+y1)/2 - 15} x2={xMid - 2} y2={(y0+y1)/2 - 15} stroke="#a78bfa" strokeWidth="0.8" markerEnd="url(#arrow)" />
                                          <line x1={xRight - 2} y1={(y0+y1)/2 + 15} x2={xMid + 2} y2={(y0+y1)/2 + 15} stroke="#a78bfa" strokeWidth="0.8" markerEnd="url(#arrow)" />
                                        </>
                                      )}
                                    </g>
                                  );
                                }
                              })}

                              {/* 3. Beams map */}
                              {beams?.map(b => (
                                <line
                                  key={b.id}
                                  x1={toSvgX(b.x1)}
                                  y1={toSvgY(b.y1)}
                                  x2={toSvgX(b.x2)}
                                  y2={toSvgY(b.y2)}
                                  stroke="#cbd5e1"
                                  strokeWidth="3.5"
                                  opacity="0.5"
                                />
                              ))}

                              {/* 4. Active Rib Lines Drafting */}
                              {ribbedResult.ribs.map(rib => {
                                const spans = rib.spans;
                                if (spans.length === 0) return null;
                                const firstSpan = spans[0];
                                const lastSpan = spans[spans.length - 1];

                                const isSelected = rib.id === selectedRibId;
                                const isCritical = rib.id === ribbedResult.controllingRib?.id;

                                let stroke = "#94a3b8";
                                let strokeW = "1.5";
                                let dash = "3,3";

                                if (isSelected) {
                                  stroke = "#a855f7"; // Glowing selection marker
                                  strokeW = "2.8";
                                  dash = "";
                                } else if (isCritical) {
                                  stroke = "#ec4899"; // Critical highlight
                                  strokeW = "2.2";
                                  dash = "6,2";
                                }

                                if (rib.direction === 'X') {
                                  const x0 = toSvgX(firstSpan.startCoord);
                                  const x1 = toSvgX(lastSpan.endCoord);
                                  const y = toSvgY(rib.coordinate);
                                  return (
                                    <g key={`rib-line-${rib.id}`}>
                                      <line
                                        x1={x0}
                                        y1={y}
                                        x2={x1}
                                        y2={y}
                                        stroke={stroke}
                                        strokeWidth={strokeW}
                                        strokeDasharray={dash}
                                        className="cursor-pointer hover:stroke-purple-400 transition-colors"
                                        onClick={() => setSelectedRibId(rib.id)}
                                      />
                                      {/* Text tag */}
                                      <text
                                        x={x0 - 15}
                                        y={y}
                                        alignmentBaseline="middle"
                                        textAnchor="end"
                                        fontSize="6.5"
                                        className={`font-mono font-bold ${isSelected ? "fill-purple-600 dark:fill-purple-400 scale-105" : "fill-muted-foreground"}`}
                                      >
                                        {rib.id}
                                      </text>
                                    </g>
                                  );
                                } else {
                                  const y0 = toSvgY(lastSpan.endCoord);
                                  const y1 = toSvgY(firstSpan.startCoord);
                                  const x = toSvgX(rib.coordinate);
                                  return (
                                    <g key={`rib-line-${rib.id}`}>
                                      <line
                                        x1={x}
                                        y1={y0}
                                        x2={x}
                                        y2={y1}
                                        stroke={stroke}
                                        strokeWidth={strokeW}
                                        strokeDasharray={dash}
                                        className="cursor-pointer hover:stroke-purple-400 transition-colors"
                                        onClick={() => setSelectedRibId(rib.id)}
                                      />
                                      {/* Text tag */}
                                      <text
                                        x={x}
                                        y={y1 + 10}
                                        textAnchor="middle"
                                        fontSize="6.5"
                                        className={`font-mono font-bold ${isSelected ? "fill-purple-600 dark:fill-purple-300" : "fill-muted-foreground"}`}
                                      >
                                        {rib.id}
                                      </text>
                                    </g>
                                  );
                                }
                              })}

                              {/* 5. Columns dots */}
                              {columns?.map(col => {
                                const sizeX = Math.max(5, (col.b / 1000) * scale);
                                const sizeY = Math.max(5, (col.h / 1000) * scale);
                                return (
                                  <rect
                                    key={col.id}
                                    x={toSvgX(col.x) - sizeX/2}
                                    y={toSvgY(col.y) - sizeY/2}
                                    width={sizeX}
                                    height={sizeY}
                                    fill="#475569"
                                    rx="0.5"
                                  />
                                );
                              })}

                              {/* Arrow Marker Definitions */}
                              <defs>
                                <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                                  <path d="M 0 2 L 5 5 L 0 8 z" fill="#a78bfa" />
                                </marker>
                              </defs>
                            </>
                          );
                        })()}
                      </svg>
                    </div>

                    {/* Legend keys */}
                    <div className="flex items-center gap-4 flex-wrap mt-2 text-[10px]">
                      <div className="flex items-center gap-1">
                        <span className="w-4 h-0.5 border-t border-purple-500 block"></span>
                        <span>العصب النشط (المحدد)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-4 h-0.5 border-t border-dashed border-pink-500 block"></span>
                        <span>العصب الحرج (الأكبر عزماً)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-4 h-0.5 border-t border-dotted border-slate-400 block"></span>
                        <span>أعصاب هندسية مستمرة</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-3.5 h-2 bg-purple-500/10 border border-purple-400/20 rounded block"></span>
                        <span>العرض الرافد (Tributary Area)</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. ملخص الإحصائيات والأعصاب الحرجة */}
                <div className="lg:col-span-5 space-y-3">
                  <Card className="h-full border-pink-200 dark:border-pink-900 bg-pink-500/5">
                    <CardHeader className="pb-1.5 pt-3">
                      <CardTitle className="text-xs flex items-center gap-1.5 text-pink-900 dark:text-pink-200 uppercase font-mono">
                        <TrendingUp size={13} className="text-pink-600" />
                        العصب الحرج المتحكم (Controlling Joist)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs">
                      {ribbedResult.controllingRib ? (
                        <>
                          <div className="flex justify-between items-center bg-background/50 p-2 rounded border border-pink-100 dark:border-pink-950">
                            <div>
                              <div className="font-bold text-sm text-pink-700 dark:text-pink-400 flex items-center gap-1 font-mono">
                                {ribbedResult.controllingRib.id}
                                <Badge className="bg-pink-600 text-[9px] px-1 h-4">الأكثر إجهاداً</Badge>
                              </div>
                              <span className="text-[10px] text-muted-foreground block mt-0.5">
                                الموقع الفعلي: {ribbedResult.controllingRib.direction === 'X' ? 'أفقي' : 'رأسي'} عند {ribbedResult.controllingRib.direction === 'X' ? 'Y' : 'X'} = {ribbedResult.controllingRib.coordinate.toFixed(3)}م
                              </span>
                            </div>
                            <Button size="sm" variant="outline" className="text-[10px] h-7 border-purple-200" onClick={() => setSelectedRibId(ribbedResult.controllingRib!.id)}>
                              تفعيل العصب
                            </Button>
                          </div>

                          <div className="space-y-1.5 pt-1">
                            <p className="font-semibold text-muted-foreground text-[10.5px]">قيم التصميم الحرجة (للأعضاء الهوردي):</p>
                            
                            <div className="grid grid-cols-2 gap-2 text-center text-[11px]">
                              <div className="bg-background/80 dark:bg-card border rounded p-1.5">
                                <div className="text-[9px] text-muted-foreground">أقصى عزم موجب M⁺</div>
                                <div className="font-bold text-blue-600 font-mono mt-0.5">{ribbedResult.stats.maxMpos.toFixed(2)} kN.m</div>
                              </div>
                              <div className="bg-background/80 dark:bg-card border rounded p-1.5">
                                <div className="text-[9px] text-muted-foreground">أقصى عزم سالب M⁻</div>
                                <div className="font-bold text-red-600 font-mono mt-0.5">{ribbedResult.stats.maxMneg.toFixed(2)} kN.m</div>
                              </div>
                              <div className="bg-background/80 dark:bg-card border rounded p-1.5">
                                <div className="text-[9px] text-muted-foreground font-sans">قوة القص العظمى Vu</div>
                                <div className="font-bold text-indigo-700 dark:text-indigo-400 font-mono mt-0.5">{ribbedResult.stats.maxVu.toFixed(2)} kN</div>
                              </div>
                              <div className="bg-background/80 dark:bg-card border rounded p-1.5">
                                <div className="text-[9px] text-muted-foreground">الترخيم الأكثر دقة Δ</div>
                                <div className="font-bold text-teal-600 font-mono mt-0.5">{ribbedResult.stats.maxDelta.toFixed(3)} مم</div>
                              </div>
                            </div>

                            <div className="p-2 border rounded bg-background/30 text-[10px] leading-relaxed text-muted-foreground">
                              💡 <strong>ملاحظة إرشادية:</strong> يتم تمثيل العصب كعضو T-Beam بصلابة مرونة EI كاملة مدعومة بمساند مفصلية. تم حل العزوم والقص وهابط الترخيم بدقة متناهية عبر <strong>طريقة توزيع العزوم المباشرة (Hardy Cross Moment Distribution)</strong>، مستبعدين التبسيطات الخرسانية التقليدية لتقديم تحليل أكثر مطابقة للواقع الميكانيكي.
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="text-muted-foreground text-center py-4">لا توجد بلاطات هوردي كافية لحساب العصب الحرج</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* 4. تفاصيل العصب المحدد ومخططات القوى المستمرة */}
              {activeRib ? (
                <div className="space-y-3">
                  <Card className="border-purple-200 dark:border-purple-800">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between bg-purple-500/5 py-3">
                      <div className="space-y-0.5">
                        <CardTitle className="text-sm flex items-center gap-1.5 text-purple-950 dark:text-purple-100">
                          <Badge className="bg-purple-600 font-mono">{activeRib.id}</Badge>
                          تفاصيل التحليل والمخططات الهندسية للأعصاب
                        </CardTitle>
                        <p className="text-[10px] text-muted-foreground leading-none">
                          عصب {activeRib.type === 'edge' ? 'طرفي' : 'داخلي'} يمتد في اتجاه {activeRib.direction} ({activeRib.spans.length} بحرات) • العرض الرافد: {(activeRib.tributaryWidth * 1000).toFixed(0)} مم
                        </p>
                      </div>

                      {/* Diagram Type selectors */}
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant={diagramType === 'moment' ? 'default' : 'outline'}
                          className="h-8 text-[10px] px-2.5"
                          onClick={() => setDiagramType('moment')}
                        >
                          العزوم BMD
                        </Button>
                        <Button
                          size="sm"
                          variant={diagramType === 'shear' ? 'default' : 'outline'}
                          className="h-8 text-[10px] px-2.5"
                          onClick={() => setDiagramType('shear')}
                        >
                          القص SFD
                        </Button>
                        <Button
                          size="sm"
                          variant={diagramType === 'deflection' ? 'default' : 'outline'}
                          className="h-8 text-[10px] px-2.5"
                          onClick={() => setDiagramType('deflection')}
                        >
                          الترخيم Δ
                        </Button>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="pt-3 space-y-4">
                      {/* Diagram representation SVG */}
                      <RibForceDiagram rib={activeRib} type={diagramType} />

                      {/* Load details summary */}
                      <div className="p-3 border rounded-lg bg-muted/20 text-xs">
                        <p className="font-semibold mb-2 flex items-center gap-1"><Info size={13} className="text-blue-500" /> توزيع الأحمال الدقيق للعصب (Load Distribution):</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px] leading-relaxed">
                          <div className="p-1">
                            <span className="text-muted-foreground text-[9px] block">الوزن الذاتي للبلاطة والجزوع</span>
                            <span className="font-bold font-mono">{(activeRib.toppingWeight + activeRib.ribConcreteWeight).toFixed(2)} kN/m²</span>
                          </div>
                          <div className="p-1">
                            <span className="text-muted-foreground text-[9px] block">وزن طوب الحشو ({ribbedSlabProps?.fillerType === 'block' ? 'أسمنتي' : 'فوم'})</span>
                            <span className="font-bold font-mono">{activeRib.fillerWeight.toFixed(2)} kN/m²</span>
                          </div>
                          <div className="p-1">
                            <span className="text-muted-foreground text-[9px] block">الأحمال الإجمالية الموزعة (DL / LL)</span>
                            <span className="font-bold font-mono text-slate-700 dark:text-slate-300">DL: {activeRib.wDL.toFixed(2)} | LL: {activeRib.wLL.toFixed(2)} kN/m²</span>
                          </div>
                          <div className="p-1 rounded bg-purple-500/10 font-bold border border-purple-100 dark:border-purple-950">
                            <span className="text-purple-700 dark:text-purple-300 text-[9px] block">الحمل الموزع التصميمي للعصب wu</span>
                            <span className="text-purple-900 dark:text-purple-100 font-mono text-xs">{activeRib.wu.toFixed(2)} kN/m</span>
                          </div>
                        </div>
                      </div>

                      {/* Tabular details per span */}
                      <div className="overflow-x-auto border rounded-md">
                        <Table>
                          <TableHeader className="bg-muted/10">
                            <TableRow>
                              <TableHead className="text-[10px] w-14">البحرة</TableHead>
                              <TableHead className="text-[10px] text-center">الطول Ln (م)</TableHead>
                              <TableHead className="text-[10px] text-center text-red-600">العزم الأيسر (kN.m)</TableHead>
                              <TableHead className="text-[10px] text-center text-blue-600">عزم النصف M⁺ (kN.m)</TableHead>
                              <TableHead className="text-[10px] text-center text-red-600">العزم الأيمن (kN.m)</TableHead>
                              <TableHead className="text-[10px] text-center font-sans">قص يسار (kN)</TableHead>
                              <TableHead className="text-[10px] text-center font-sans">قص يمين (kN)</TableHead>
                              <TableHead className="text-[10px] text-center text-teal-600">الترخيم (مم)</TableHead>
                              <TableHead className="text-[10px] text-center text-purple-700 dark:text-purple-400">التسليح المقترح (As)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody className="text-[11px] font-mono">
                            {activeRib.spanResults.map((sr, idx) => {
                              const dia = slabProps.phiSlab || 12;
                              const barArea = (Math.PI / 4) * dia * dia;
                              
                              // Quick flexure sizing for ribs based on T-section and rectangular widths
                              const d = (tf + hb) - (slabProps.cover ?? 20) - dia/2;
                              const calcAsSingleRib = (Mu: number, bWidth: number) => {
                                const AsMin = Math.max((0.25 * Math.sqrt(mat.fc)) / mat.fy, 1.4 / mat.fy) * bw * d;
                                if (Mu <= 0.05) return AsMin;
                                const Mu_Nmm = Math.abs(Mu) * 1e6;
                                const RuValue = Mu_Nmm / (bWidth * d * d);
                                let rhoValue = 0.85 * mat.fc / mat.fy * (1 - Math.sqrt(1 - 2 * RuValue / (0.9 * 0.85 * mat.fc)));
                                if (isNaN(rhoValue) || rhoValue < 0) rhoValue = 0;
                                return Math.max(rhoValue * bWidth * d, AsMin);
                              };

                              const AsPos = calcAsSingleRib(sr.Mpos, activeRib.sectionProperties.beff);
                              const AsNegLeft = calcAsSingleRib(sr.Mneg_left, bw);
                              const AsNegRight = calcAsSingleRib(sr.Mneg_right, bw);

                              const formatRibRebarText = (areaSteel: number) => {
                                const nb = Math.max(2, Math.ceil(areaSteel / barArea));
                                return `${nb}Φ${dia}`;
                              };

                              return (
                                <TableRow key={idx}>
                                  <TableCell className="font-sans font-semibold">{sr.slabId}</TableCell>
                                  <TableCell className="text-center">{sr.L.toFixed(2)}</TableCell>
                                  <TableCell className="text-center text-red-600">{sr.Mneg_left.toFixed(2)}</TableCell>
                                  <TableCell className="text-center text-blue-600">{sr.Mpos.toFixed(2)}</TableCell>
                                  <TableCell className="text-center text-red-600">{sr.Mneg_right.toFixed(2)}</TableCell>
                                  <TableCell className="text-center text-slate-500">{sr.Vu_left.toFixed(1)}</TableCell>
                                  <TableCell className="text-center text-slate-500">{sr.Vu_right.toFixed(1)}</TableCell>
                                  <TableCell className="text-center text-teal-600">{sr.maxDeflection.toFixed(3)}</TableCell>
                                  <TableCell className="text-center text-purple-700 dark:text-purple-400 font-sans font-bold leading-relaxed py-1">
                                    <div className="flex flex-col text-[10px]">
                                      <span>يسار: {formatRibRebarText(AsNegLeft)}</span>
                                      <span className="text-blue-600">وسط: {formatRibRebarText(AsPos)}</span>
                                      <span>يمين: {formatRibRebarText(AsNegRight)}</span>
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
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-muted-foreground bg-muted/10 border border-dashed rounded-lg">
                  اختر عصبًا لعرض مخططات التحليل والتسليح التفصيلي الخاص به
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

/** رسم مخطط العزوم (BMD) للشريحة */
function StripBMDiagram({ result }: { result: ContinuousSlabResult }) {
  const totalLength = result.spans.reduce((s, sp) => s + sp.spanLength, 0);
  const W = 320;
  const H = 120;
  const padX = 20;
  const padY = 15;
  const drawW = W - 2 * padX;
  const drawH = H - 2 * padY;

  const allMoments = result.spans.flatMap(sp => [sp.Mneg_left, sp.Mpos, sp.Mneg_right]);
  const maxM = Math.max(...allMoments.map(Math.abs), 0.1);

  const toX = (dist: number) => padX + (dist / totalLength) * drawW;
  const midY = padY + drawH / 2;
  const toY = (m: number) => midY - (m / maxM) * (drawH / 2) * 0.85;

  // Build path points
  const points: string[] = [];
  let cumDist = 0;

  for (let i = 0; i < result.spans.length; i++) {
    const sp = result.spans[i];
    const x0 = cumDist;
    const xMid = cumDist + sp.spanLength / 2;
    const x1 = cumDist + sp.spanLength;

    // سالب يسار (فوق الخط = قيمة سالبة مرسومة لأعلى)
    points.push(`${toX(x0).toFixed(1)},${toY(-sp.Mneg_left).toFixed(1)}`);
    // موجب وسط (تحت الخط)
    points.push(`${toX(xMid).toFixed(1)},${toY(sp.Mpos).toFixed(1)}`);
    // سالب يمين
    points.push(`${toX(x1).toFixed(1)},${toY(-sp.Mneg_right).toFixed(1)}`);

    cumDist = x1;
  }

  return (
    <div className="rounded border border-border bg-muted/20 p-2">
      <p className="text-[10px] font-semibold mb-1 text-center">مخطط العزوم (BMD)</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ maxHeight: 140 }}>
        {/* baseline */}
        <line x1={padX} y1={midY} x2={W - padX} y2={midY} stroke="currentColor" strokeWidth="0.5" opacity={0.3} />
        
        {/* supports */}
        {(() => {
          let d = 0;
          const sups: number[] = [0];
          for (const sp of result.spans) { d += sp.spanLength; sups.push(d); }
          return sups.map((s, i) => (
            <g key={i}>
              <line x1={toX(s)} y1={midY - 4} x2={toX(s)} y2={midY + 4} stroke="currentColor" strokeWidth="1.5" />
              <polygon
                points={`${toX(s)},${midY + 4} ${toX(s) - 4},${midY + 10} ${toX(s) + 4},${midY + 10}`}
                fill="currentColor" opacity={0.4}
              />
            </g>
          ));
        })()}

        {/* BMD fill */}
        {(() => {
          let cumD = 0;
          return result.spans.map((sp, i) => {
            const x0 = cumD;
            const xM = cumD + sp.spanLength / 2;
            const x1 = cumD + sp.spanLength;
            cumD = x1;

            const path = `M${toX(x0).toFixed(1)},${midY} 
              L${toX(x0).toFixed(1)},${toY(-sp.Mneg_left).toFixed(1)} 
              Q${toX(xM).toFixed(1)},${toY(sp.Mpos).toFixed(1)} ${toX(x1).toFixed(1)},${toY(-sp.Mneg_right).toFixed(1)} 
              L${toX(x1).toFixed(1)},${midY} Z`;

            return (
              <path key={i} d={path} fill="hsl(200 80% 50% / 0.15)" stroke="hsl(200 80% 50%)" strokeWidth="1.5" />
            );
          });
        })()}

        {/* moment values */}
        {(() => {
          let cumD = 0;
          const labels: ReactElement[] = [];
          for (let i = 0; i < result.spans.length; i++) {
            const sp = result.spans[i];
            const x0 = cumD;
            const xM = cumD + sp.spanLength / 2;
            const x1 = cumD + sp.spanLength;

            // negative left (only for first span or if different from prev right)
            if (i === 0) {
              labels.push(
                <text key={`nl${i}`} x={toX(x0)} y={toY(-sp.Mneg_left) - 4} textAnchor="middle"
                  fontSize="7" fill="hsl(0 70% 50%)" fontFamily="monospace">{sp.Mneg_left.toFixed(1)}</text>
              );
            }
            // positive mid
            labels.push(
              <text key={`p${i}`} x={toX(xM)} y={toY(sp.Mpos) + 10} textAnchor="middle"
                fontSize="7" fill="hsl(210 70% 50%)" fontFamily="monospace">{sp.Mpos.toFixed(1)}</text>
            );
            // negative right
            labels.push(
              <text key={`nr${i}`} x={toX(x1)} y={toY(-sp.Mneg_right) - 4} textAnchor="middle"
                fontSize="7" fill="hsl(0 70% 50%)" fontFamily="monospace">{sp.Mneg_right.toFixed(1)}</text>
            );

            cumD = x1;
          }
          return labels;
        })()}

        {/* units */}
        <text x={W - padX} y={H - 2} textAnchor="end" fontSize="7" fill="currentColor" opacity={0.5}>kN.m/m</text>
      </svg>
    </div>
  );
}

/** رسم مخطط القوى المفصلة للعصب الهوردي المتصل (BMD, SFD, deflection) */
function RibForceDiagram({ rib, type }: { rib: AnalyticalRib; type: 'moment' | 'shear' | 'deflection' }) {
  const totalLength = rib.spans.reduce((s, sp) => s + sp.spanLength, 0);
  const W = 450;
  const H = 140;
  const padX = 35;
  const padY = 20;
  const drawW = W - 2 * padX;
  const drawH = H - 2 * padY;
  const midY = padY + drawH / 2;

  interface PlottedPoint {
    x: number; // Global coordinate in meters along continuous rib member
    val: number; // Force or displacement value with sign
  }

  const plottedPoints: PlottedPoint[] = [];
  let cumLength = 0;

  for (const sr of rib.spanResults) {
    const pts = sr.diagram || [];
    for (const pt of pts) {
      let val = 0;
      if (type === 'moment') val = pt.moment;
      else if (type === 'shear') val = pt.shear;
      else if (type === 'deflection') val = pt.deflection;

      plottedPoints.push({
        x: cumLength + pt.x,
        val: val
      });
    }
    cumLength += sr.L;
  }

  const values = plottedPoints.map(p => p.val);
  const maxVal = Math.max(...values.map(Math.abs), 0.01);

  const toX = (x: number) => padX + (x / totalLength) * drawW;
  
  // Custom coordinate projections
  const toY = (val: number) => {
    if (type === 'moment') {
      // Hogging (negative values) drawn above the line (smaller SVG Y coordinate)
      // Sagging (positive values) drawn below the line (larger SVG Y coordinate)
      return midY + (val / maxVal) * (drawH / 2) * 0.85;
    } else if (type === 'shear') {
      // Positive shear above (smaller SVG Y), negative below (larger SVG Y)
      return midY - (val / maxVal) * (drawH / 2) * 0.85;
    } else {
      // Deflections plotted downward (larger SVG Y)
      return midY + (Math.abs(val) / maxVal) * (drawH / 2) * 0.85;
    }
  };

  // 1. Continuous curve outline path
  let pathD = "";
  if (plottedPoints.length > 0) {
    pathD = `M ${toX(plottedPoints[0].x).toFixed(1)} ${toY(plottedPoints[0].val).toFixed(1)}`;
    for (let i = 1; i < plottedPoints.length; i++) {
      pathD += ` L ${toX(plottedPoints[i].x).toFixed(1)} ${toY(plottedPoints[i].val).toFixed(1)}`;
    }
  }

  // 2. Closed filled path with baseline boundary
  let fillD = "";
  if (plottedPoints.length > 0) {
    fillD = `M ${toX(plottedPoints[0].x).toFixed(1)} ${midY.toFixed(1)}`;
    for (const pt of plottedPoints) {
      fillD += ` L ${toX(pt.x).toFixed(1)} ${toY(pt.val).toFixed(1)}`;
    }
    fillD += ` L ${toX(plottedPoints[plottedPoints.length - 1].x).toFixed(1)} ${midY.toFixed(1)} Z`;
  }

  const strokeColor = type === 'moment' ? 'hsl(271 91% 65%)' : type === 'shear' ? 'hsl(142 71% 45%)' : 'hsl(200 95% 55%)';
  const fillColor = type === 'moment' ? 'rgba(139, 92, 246, 0.08)' : type === 'shear' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(14, 165, 233, 0.08)';
  const unitText = type === 'moment' ? 'kN.m' : type === 'shear' ? 'kN' : 'مم';

  return (
    <div className="rounded-lg border border-border bg-muted/15 p-2 px-3 relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ maxHeight: 155 }}>
        {/* Baseline */}
        <line x1={padX} y1={midY} x2={W - padX} y2={midY} stroke="currentColor" strokeWidth="0.5" opacity={0.35} />

        {/* Support markers */}
        {(() => {
          let d = 0;
          const sups = [0];
          for (const sp of rib.spans) {
            d += sp.spanLength;
            sups.push(d);
          }
          return sups.map((s, i) => (
            <g key={i}>
              <line x1={toX(s)} y1={midY - 4} x2={toX(s)} y2={midY + 4} stroke="currentColor" strokeWidth="1.2" />
              <polygon
                points={`${toX(s)},${midY + 4} ${toX(s) - 3.5},${midY + 9} ${toX(s) + 3.5},${midY + 9}`}
                fill="currentColor"
                opacity={0.35}
              />
            </g>
          ));
        })()}

        {/* Filled polygon block */}
        {fillD && <path d={fillD} fill={fillColor} />}

        {/* Main continuous stroke */}
        {pathD && (
          <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* Quantitative labels */}
        {(() => {
          const labelsList: ReactElement[] = [];
          let currentD = 0;
          rib.spanResults.map((sr, idx) => {
            const midpointX = currentD + sr.L / 2;
            const endX = currentD + sr.L;

            if (type === 'moment') {
              // Left hook moment
              if (idx === 0 && sr.Mneg_left > 0.05) {
                labelsList.push(
                  <text key={`ml_${idx}`} x={toX(currentD)} y={toY(-sr.Mneg_left) - 5}
                    textAnchor="middle" fontSize="6.5" fill="#e11d48" className="font-mono font-bold">
                    {sr.Mneg_left.toFixed(1)}
                  </text>
                );
              }
              // Center positive span moment
              labelsList.push(
                <text key={`mp_${idx}`} x={toX(midpointX)} y={toY(sr.Mpos) + 9}
                  textAnchor="middle" fontSize="6.5" fill="#2563eb" className="font-mono font-bold">
                  {sr.Mpos.toFixed(1)}
                </text>
              );
              // Right support negative moment
              if (sr.Mneg_right > 0.05) {
                labelsList.push(
                  <text key={`mr_${idx}`} x={toX(endX)} y={toY(-sr.Mneg_right) - 5}
                    textAnchor="middle" fontSize="6.5" fill="#e11d48" className="font-mono font-bold">
                    {sr.Mneg_right.toFixed(1)}
                  </text>
                );
              }
            } else if (type === 'shear') {
              // Discrete shears
              labelsList.push(
                <text key={`vl_${idx}`} x={toX(currentD) + 12} y={midY - 7}
                  textAnchor="middle" fontSize="6" fill="#166534" className="font-mono">
                  {sr.Vu_left.toFixed(1)}
                </text>
              );
              labelsList.push(
                <text key={`vr_${idx}`} x={toX(endX) - 12} y={midY + 9}
                  textAnchor="middle" fontSize="6" fill="#166534" className="font-mono">
                  {sr.Vu_right.toFixed(1)}
                </text>
              );
            } else {
              // Mid deflection
              labelsList.push(
                <text key={`dl_${idx}`} x={toX(midpointX)} y={toY(sr.maxDeflection) + 9}
                  textAnchor="middle" fontSize="6.5" fill="#0284c7" className="font-mono font-bold">
                  {sr.maxDeflection.toFixed(2)}
                </text>
              );
            }

            currentD += sr.L;
          });
          return labelsList;
        })()}

        {/* Axis unit key */}
        <text x={W - padX} y={H - 3} textAnchor="end" fontSize="7" fill="currentColor" opacity={0.5} className="font-mono">
          {unitText}
        </text>
      </svg>
    </div>
  );
}
