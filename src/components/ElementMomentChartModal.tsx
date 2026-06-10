import React, { useMemo, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, Legend,
} from 'recharts';
import { Download, Save, AlertTriangle, CheckCircle } from 'lucide-react';
import { calculateDeflection } from '@/lib/structuralEngine';
import type { Beam, Column, Slab, FrameResult } from '@/lib/structuralEngine';

interface Props {
  open: boolean;
  onClose: () => void;
  elementType: 'beam' | 'column' | 'slab';
  elementId: string;
  beams: Beam[];
  columns: Column[];
  slabs: Slab[];
  frameResults: FrameResult[];
  beamDesigns?: { beamId: string; flexLeft: any; flexMid: any; flexRight: any; deflection?: any }[];
  colDesigns?: { id: string; b: number; h: number; Pu: number; design: any }[];
  onSaveBeamProperties?: (beamId: string, props: { name: string; b: number; h: number }) => void;
}

/**
 * Bending-moment and deflection diagrams along the length of the selected element,
 * with editable dimensions and live updates.
 */
export default function ElementMomentChartModal({
  open, onClose, elementType, elementId,
  beams, columns, slabs, frameResults, beamDesigns, colDesigns,
  onSaveBeamProperties,
}: Props) {

  const [activeTab, setActiveTab] = useState<string>('moment');

  // Input states for editing beam
  const currentBeam = useMemo(() => {
    if (elementType === 'beam') {
      return beams.find(b => b.id === elementId);
    }
    return null;
  }, [elementType, elementId, beams]);

  const [editName, setEditName] = useState('');
  const [editB, setEditB] = useState('');
  const [editH, setEditH] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (currentBeam) {
      setEditName(currentBeam.name ?? currentBeam.id);
      setEditB(String(currentBeam.b));
      setEditH(String(currentBeam.h));
      setIsSaved(false);
    }
  }, [currentBeam, elementId, open]);

  const handleSave = () => {
    if (onSaveBeamProperties && currentBeam) {
      onSaveBeamProperties(currentBeam.id, {
        name: editName.trim() || currentBeam.id,
        b: Number(editB) || currentBeam.b,
        h: Number(editH) || currentBeam.h,
      });
      setIsSaved(true);
      setTimeout(() => {
        setIsSaved(false);
      }, 1500);
    }
  };

  const data = useMemo(() => {
    if (elementType === 'beam') {
      const beam = beams.find(b => b.id === elementId);
      if (!beam) return null;
      // Find frame result for this beam
      let Mleft = 0, Mmid = 0, Mright = 0, Vu = 0;
      let stations: number[] | undefined;
      for (const fr of frameResults) {
        const br = fr.beams.find(bb => bb.beamId === elementId);
        if (br) {
          Mleft = br.Mleft;
          Mmid = br.Mmid;
          Mright = br.Mright;
          Vu = (br as any).Vu ?? 0;
          stations = br.momentStations;
          break;
        }
      }
      const L = beam.length;
      let points;
      if (stations && stations.length >= 2) {
        points = stations.map((val, i) => {
          const t = i / (stations!.length - 1);
          const x = +(t * L).toFixed(3);
          const M = +val.toFixed(2);
          return { x, M };
        });
      } else {
        // Parabolic interpolation matching the 3 control points (fallback)
        const a = Mleft;
        const b = -3 * Mleft + 4 * Mmid - Mright;
        const c = 2 * Mleft - 4 * Mmid + 2 * Mright;
        const N = 41;
        points = Array.from({ length: N }, (_, i) => {
          const t = i / (N - 1);
          const x = +(t * L).toFixed(3);
          const M = +(a + b * t + c * t * t).toFixed(2);
          return { x, M };
        });
      }
      return {
        title: `الجسر ${editName || elementId} — مخطط العزم والقوى للتحليل`,
        subtitle: `الطول = ${L.toFixed(2)} م · M⁻ يسار = ${Mleft.toFixed(1)} · M⁺ منتصف = ${Mmid.toFixed(1)} · M⁻ يمين = ${Mright.toFixed(1)} (kN·m)`,
        xLabel: 'المسافة على طول الجسر x (م)',
        Vu,
        points,
      };
    }
    if (elementType === 'column') {
      const col = colDesigns?.find(c => c.id === elementId);
      if (!col) return null;
      const Pu = col.Pu ?? 0;
      const Mtop = (col.design && (col.design.Mtop ?? col.design.M ?? 0)) || 0;
      const Mbot = (col.design && (col.design.Mbot ?? -Mtop)) || 0;
      const H = (((col as any).L ?? (col as any).length ?? 3000) as number) / 1000;
      const N = 21;
      const points = Array.from({ length: N }, (_, i) => {
        const t = i / (N - 1);
        const z = +(t * H).toFixed(3);
        const M = +(Mbot + (Mtop - Mbot) * t).toFixed(2);
        return { x: z, M };
      });
      return {
        title: `العمود ${elementId} — مخطط العزم على ارتفاع العمود`,
        subtitle: `الارتفاع = ${H.toFixed(2)} م · Pu = ${Pu.toFixed(0)} kN · Mأعلى = ${Mtop.toFixed(1)} · Mأسفل = ${Mbot.toFixed(1)} (kN·m)`,
        xLabel: 'الارتفاع z (م)',
        Vu: 0,
        points,
      };
    }
    if (elementType === 'slab') {
      const slab = slabs.find(s => s.id === elementId);
      if (!slab) return null;
      const Lx = Math.abs(slab.x2 - slab.x1);
      const Ly = Math.abs(slab.y2 - slab.y1);
      const L = Math.min(Lx, Ly);
      const w = ((slab as any).load ?? (slab as any).w ?? 6);
      const Mmax = w * L * L / 8;
      const N = 31;
      const points = Array.from({ length: N }, (_, i) => {
        const t = i / (N - 1);
        const x = +(t * L).toFixed(3);
        const M = +(4 * Mmax * t * (1 - t)).toFixed(2);
        return { x, M };
      });
      return {
        title: `البلاطة ${elementId} — مخطط العزم في الاتجاه القصير`,
        subtitle: `Lx = ${Lx.toFixed(2)} م · Ly = ${Ly.toFixed(2)} م · w ≈ ${w.toFixed(1)} kN/m² · Mmax ≈ ${Mmax.toFixed(2)} kN·m/m`,
        xLabel: 'المسافة على عرض البلاطة (م)',
        Vu: 0,
        points,
      };
    }
    return null;
  }, [elementType, elementId, beams, columns, slabs, frameResults, beamDesigns, colDesigns, editName]);

  // Deflection curve computing
  const deflectionData = useMemo(() => {
    if (elementType !== 'beam' || !currentBeam) return [];
    const parentId = elementId.includes('-') ? elementId.split('-')[0] : elementId;
    const design = beamDesigns?.find(d => d.beamId === elementId || d.beamId === parentId);
    const dMax = design?.deflection?.deflection ?? 0;
    const L = currentBeam.length;
    const N = 41;
    return Array.from({ length: N }, (_, i) => {
      const t = i / (N - 1);
      const x = +(t * L).toFixed(3);
      const value = +(dMax * 4 * t * (1 - t)).toFixed(4);
      return { x, deflection: value };
    });
  }, [elementType, elementId, currentBeam, beamDesigns]);

  if (!data) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md" dir="rtl" onPointerDownOutside={onClose} onInteractOutside={onClose}>
          <DialogTitle>لا توجد بيانات تحليل</DialogTitle>
          <p className="text-sm text-muted-foreground">شغّل التحليل أولاً ثم اضغط على العنصر مرة أخرى.</p>
        </DialogContent>
      </Dialog>
    );
  }

  const Mmax = Math.max(...data.points.map(p => Math.abs(p.M)), 0.001);

  // Retrieve deflection metadata
  const parentId = elementId.includes('-') ? elementId.split('-')[0] : elementId;
  const design = beamDesigns?.find(d => d.beamId === elementId || d.beamId === parentId);
  const allowableDeflection = design?.deflection?.allowableDeflection ?? (currentBeam ? (currentBeam.length * 1000) / 240 : 1);
  const actualMaxDeflection = design?.deflection?.deflection ?? 0;
  const isDeflectionExceeded = design?.deflection ? !design.deflection.isServiceable : false;
  const calculatedSuggestedH = useMemo(() => {
    if (!currentBeam || !design) return 0;
    const bw = currentBeam.b;
    const wD = currentBeam.deadLoad || 0;
    const wL = currentBeam.liveLoad || 0;
    const span = currentBeam.length / 1000;
    const allowableDefl = allowableDeflection;
    const testAs = design.flexMid?.As || 0;
    
    for (let hTry = Math.ceil((currentBeam.h + 50) / 50) * 50; hTry <= 2500; hTry += 50) {
      const testDefl = calculateDeflection(span, bw, hTry, 25, wD, wL, testAs, 'both-ends', 'B', testAs * 0.3, 1.0, 60);
      if (testDefl.deflection <= allowableDefl || testDefl.isServiceable) {
        return hTry;
      }
    }
    return Math.max(currentBeam.h + 50, Math.ceil((currentBeam.h * Math.pow(actualMaxDeflection / allowableDeflection, 0.33)) / 50) * 50);
  }, [currentBeam, design, allowableDeflection, actualMaxDeflection]);

  const suggestedH = isDeflectionExceeded ? calculatedSuggestedH : currentBeam?.h ?? 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" dir="rtl" onPointerDownOutside={onClose} onInteractOutside={onClose}>
        <DialogHeader className="space-y-0.5">
          <DialogTitle className="text-base font-bold flex items-center justify-between">
            <span>{data.title}</span>
            {isDeflectionExceeded && (
              <Badge variant="destructive" className="animate-pulse gap-1 text-[11px] px-2 py-0.5 font-bold">
                <AlertTriangle size={12} /> الترخيم زائد!
              </Badge>
            )}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{data.subtitle}</p>
        </DialogHeader>

        {elementType === 'beam' && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-2">
            <TabsList className="grid grid-cols-3 w-full max-w-sm mb-3">
              <TabsTrigger value="moment" className="text-xs">المخطط الإنشائي</TabsTrigger>
              <TabsTrigger value="deflection" className="text-xs">مخطط الترخيم</TabsTrigger>
              <TabsTrigger value="properties" className="text-xs">تعديل الأبعاد</TabsTrigger>
            </TabsList>

            {/* ── Tab: Moment Diagram ── */}
            <TabsContent value="moment" className="mt-0">
              <div className="w-full h-[260px] bg-card border border-border rounded-lg p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.points} margin={{ top: 12, right: 16, left: 8, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="x"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      tick={{ fontSize: 9 }}
                      label={{ value: data.xLabel, position: 'insideBottom', offset: -5, fontSize: 10 }}
                    />
                    <YAxis
                      tick={{ fontSize: 9 }}
                      domain={[-Mmax * 1.1, Mmax * 1.1]}
                      label={{ value: 'العزم M (kN·m)', angle: -90, position: 'insideLeft', fontSize: 10, offset: 0 }}
                    />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', fontSize: 11 }}
                      formatter={(v: number) => [`${v.toFixed(2)} kN·m`, 'العزم M']}
                      labelFormatter={(x: number) => `x = ${Number(x).toFixed(2)} م`}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeWidth={1} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Area
                      type="monotone"
                      dataKey="M"
                      fill="hsl(var(--primary) / 0.12)"
                      stroke="none"
                      name="مساحة مخطط العزوم"
                    />
                    <Line
                      type="monotone"
                      dataKey="M"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                      name="العزم M(x)"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 text-[10px] text-muted-foreground bg-muted/40 rounded p-2.5 leading-relaxed space-y-0.5">
                <div>• القيم الموجبة = <b>عزم موجب M⁺</b> (شد سفلي).</div>
                <div>• القيم السالبة = <b>عزم سالب M⁻</b> (شد علوي).</div>
              </div>
            </TabsContent>

            {/* ── Tab: Deflection Diagram ── */}
            <TabsContent value="deflection" className="mt-0">
              <div className="w-full h-[260px] bg-card border border-border rounded-lg p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={deflectionData} margin={{ top: 12, right: 16, left: 8, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="x"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      tick={{ fontSize: 9 }}
                      label={{ value: 'المسافة على طول الجسر x (م)', position: 'insideBottom', offset: -5, fontSize: 10 }}
                    />
                    <YAxis
                      tick={{ fontSize: 9 }}
                      domain={[0, Math.max(allowableDeflection, actualMaxDeflection) * 1.25]}
                      reversed
                      label={{ value: 'الترخيم والتشوه δ (مم)', angle: -90, position: 'insideLeft', fontSize: 10, offset: 0 }}
                    />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', fontSize: 11 }}
                      formatter={(v: number) => [`${v.toFixed(2)} mm`, 'الترخيم δ']}
                      labelFormatter={(x: number) => `x = ${Number(x).toFixed(2)} م`}
                    />
                    <ReferenceLine
                      y={allowableDeflection}
                      stroke="rgb(239, 68, 68)"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{
                        value: `الحد الأقصى المسموح (${allowableDeflection.toFixed(1)} مم)`,
                        fill: 'rgb(239, 68, 68)',
                        fontSize: 9,
                        position: 'insideBottomRight'
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="deflection"
                      stroke="rgb(249, 115, 22)"
                      strokeWidth={2.5}
                      dot={false}
                      name="الترخيم الفعلي δ(x)"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Suggestions Panel */}
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="text-[11px] bg-muted/40 rounded-lg p-3 space-y-1">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    سلوك الترخيم والأمن الإنشائي
                  </div>
                  <div>• الترخيم الأقصى المحسوب: <span className="font-mono font-bold text-orange-500">{actualMaxDeflection.toFixed(2)} مم</span></div>
                  <div>• الترخيم المسموح به (L/240): <span className="font-mono font-bold">{allowableDeflection.toFixed(2)} مم</span></div>
                  <div>• السلوك العام للترخيم: <span className={`font-semibold ${isDeflectionExceeded ? 'text-destructive' : 'text-emerald-600'}`}>
                    {isDeflectionExceeded ? 'غير محقق للمواصفات (مرفوض!)' : 'آمن ومحقق للمواصفات'}
                  </span></div>
                </div>

                {isDeflectionExceeded && (
                  <div className="text-[11px] bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 rounded-lg p-3 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-amber-600">
                      <AlertTriangle size={13} /> اقتراح تعديل الارتفاع:
                    </div>
                    <p className="leading-relaxed">
                      بما أن الترخيم الحالي أكبر من الحد الأقصى المسموح به، نقترح زيادة الارتفاع الكلي للجسر h ليصبح لا يقل عن <span className="font-mono font-bold underline text-base text-amber-600">{suggestedH} مم</span> لتلبية متطلبات شروط التشوه بدقة.
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Tab: Edit Properties ── */}
            <TabsContent value="properties" className="mt-0">
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4">
                <div className="font-bold text-sm text-foreground">تعديل اسم وأبعاد الجسر المباشرة</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">اسم الجسر الإنشائي</label>
                    <Input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="G1"
                      className="h-9 min-h-[36px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">عرض الجسر b (مم)</label>
                    <Input
                      type="number"
                      value={editB}
                      onChange={(e) => setEditB(e.target.value)}
                      placeholder="200"
                      className="h-9 min-h-[36px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">الارتفاع الكلي h (مم)</label>
                    <Input
                      type="number"
                      value={editH}
                      onChange={(e) => setEditH(e.target.value)}
                      placeholder="400"
                      className="h-9 min-h-[36px]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <p className="text-[10px] text-muted-foreground max-w-md">
                    * عند حفظ الأبعاد والاسم الإنشائي الجديد سيتم تعديل نموذج المبنى وإعادة التحغيل والتحليل والتصميم الفوري بجميع نوافذ وعوارض التحليل والمخرجات الإنشائية في ذات اللحظة.
                  </p>
                  <Button
                    onClick={handleSave}
                    size="sm"
                    className={`gap-1.5 font-bold text-xs transition-all duration-300 ${
                      isSaved
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 dark:text-white'
                        : ''
                    }`}
                    disabled={!editB || !editH}
                  >
                    {isSaved ? (
                      <>
                        <CheckCircle size={14} className="text-white fill-emerald-100/20" />
                        تم الحفظ
                      </>
                    ) : (
                      <>
                        <Save size={14} />
                        حفظ
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {elementType !== 'beam' && (
          <>
            <div className="w-full h-[340px] bg-card border border-border rounded-lg p-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.points} margin={{ top: 12, right: 16, left: 8, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="x"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tick={{ fontSize: 10 }}
                    label={{ value: data.xLabel, position: 'insideBottom', offset: -10, fontSize: 11 }}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    domain={[-Mmax * 1.1, Mmax * 1.1]}
                    label={{ value: 'العزم M (kN·m)', angle: -90, position: 'insideLeft', fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', fontSize: 11 }}
                    formatter={(v: number) => [`${v.toFixed(2)} kN·m`, 'M']}
                    labelFormatter={(x: number) => `x = ${Number(x).toFixed(2)} م`}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeWidth={1} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area
                    type="monotone"
                    dataKey="M"
                    fill="hsl(var(--primary) / 0.12)"
                    stroke="none"
                    name="مساحة المخطط"
                  />
                  <Line
                    type="monotone"
                    dataKey="M"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    name="العزم M(x)"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground bg-muted/50 rounded p-2 leading-relaxed">
              <div>• القيم الموجبة = <b>عزم موجب M⁺</b> (شد سفلي).</div>
              <div>• القيم السالبة = <b>عزم سالب M⁻</b> (شد علوي).</div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border mt-2">
          <Button variant="outline" size="sm" onClick={onClose} className="min-h-[44px]">إغلاق</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
