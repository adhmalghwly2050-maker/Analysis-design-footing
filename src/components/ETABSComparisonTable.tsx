/**
 * مقارنة نتائج التحليل بين الطريقة 2D و 3D مع إمكانية استيراد نتائج ETABS
 * وتوفير لوحة تقييم معقدة لمؤشرات جودة التطابق والتحقق الهندسي المتبادل.
 */

import React, { useState, useMemo, useCallback, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Upload, Download, CheckCircle2, AlertTriangle, Lightbulb, TrendingUp, Sparkles, Building } from 'lucide-react';
import type {
  Beam, Column, Frame, FrameResult, Story,
} from '@/lib/structuralEngine';

interface ColLoad {
  Pu: number;
  Mx: number;
  My: number;
  MxTop?: number;
  MxBot?: number;
  MyTop?: number;
  MyBot?: number;
}

interface ETABSBeamData {
  beamId: string;
  story?: string;
  Mleft: number;
  Mmid: number;
  Mright: number;
}

interface Props {
  frames: Frame[];
  beams: Beam[];
  columns: Column[];
  stories: Story[];
  frameResults3D: FrameResult[];
  frameResults2D: FrameResult[];
  frameResultsGF?: FrameResult[];
  frameResultsUC?: FrameResult[];
  colLoads3D: Map<string, ColLoad>;
  colLoads2D: Map<string, ColLoad>;
  etabsBeamData?: ETABSBeamData[];
  onEtabsDataChange?: (data: ETABSBeamData[]) => void;
}

interface BeamCompRow {
  beamId: string;
  frameId: string;
  storyLabel: string;
  span: number;
  m2d_left: number; m2d_mid: number; m2d_right: number; v2d: number;
  m3d_left: number; m3d_mid: number; m3d_right: number; v3d: number;
  mgf_left: number; mgf_mid: number; mgf_right: number; vgf: number;
  muc_left: number; muc_mid: number; muc_right: number; vuc: number;
}

interface ColCompRow {
  colId: string;
  bxh: string;
  storyLabel: string;
  pu2d: number; mx2d: number; my2d: number;
  pu3d: number; mx3d: number; my3d: number;
}

/** Parse ETABS CSV: expects columns Beam, Mleft, Mmid, Mright (or Station-based with 3 stations per beam) */
function parseEtabsBeamCSV(text: string): ETABSBeamData[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headerCols = lines[0].split(/[,\t;]/).map(c => c.trim().toLowerCase().replace(/['"]/g, ''));
  
  // Try format: Beam, Mleft, Mmid, Mright
  const beamCol = headerCols.findIndex(c => c === 'beam' || c === 'beamname' || c === 'beam name' || c === 'id' || c === 'label');
  const mlCol = headerCols.findIndex(c => c === 'mleft' || c === 'm_left' || c === 'ml');
  const mmCol = headerCols.findIndex(c => c === 'mmid' || c === 'm_mid' || c === 'mm' || c === 'mmidspan');
  const mrCol = headerCols.findIndex(c => c === 'mright' || c === 'm_right' || c === 'mr');
  const storyCol = headerCols.findIndex(c => c === 'story' || c === 'level' || c === 'storyid');

  if (beamCol >= 0 && mlCol >= 0 && mmCol >= 0 && mrCol >= 0) {
    const result: ETABSBeamData[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(/[,\t;]/).map(c => c.trim().replace(/['"]/g, ''));
      const beamId = cols[beamCol];
      const Mleft = parseFloat(cols[mlCol]);
      const Mmid = parseFloat(cols[mmCol]);
      const Mright = parseFloat(cols[mrCol]);
      const story = storyCol >= 0 ? cols[storyCol] : undefined;
      if (beamId && !isNaN(Mleft) && !isNaN(Mmid) && !isNaN(Mright)) {
        result.push({ beamId, Mleft, Mmid, Mright, story });
      }
    }
    return result;
  }

  // Try station-based format: Beam, Station, M3
  const sCol = headerCols.findIndex(c => c.includes('station') || c === 'loc' || c === 'location');
  const m3Col = headerCols.findIndex(c => c === 'm3' || c === 'moment' || c === 'm' || c === 'm33' || c.startsWith('m3'));

  if (beamCol >= 0 && sCol >= 0 && m3Col >= 0) {
    // Group by beam, take first/mid/last station
    const byBeam = new Map<string, { station: number; m3: number; story?: string }[]>();
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(/[,\t;]/).map(c => c.trim().replace(/['"]/g, ''));
      const beamId = cols[beamCol];
      const station = parseFloat(cols[sCol]);
      const m3 = parseFloat(cols[m3Col]);
      const story = storyCol >= 0 ? cols[storyCol] : undefined;
      if (!beamId || isNaN(station) || isNaN(m3)) continue;
      if (!byBeam.has(beamId)) byBeam.set(beamId, []);
      byBeam.get(beamId)!.push({ station, m3, story });
    }
    const result: ETABSBeamData[] = [];
    for (const [beamId, stations] of byBeam) {
      stations.sort((a, b) => a.station - b.station);
      if (stations.length < 2) continue;
      const first = stations[0];
      const last = stations[stations.length - 1];
      // Find midpoint station
      const midStation = (first.station + last.station) / 2;
      let mid = stations[0];
      let minDist = Infinity;
      for (const s of stations) {
        const d = Math.abs(s.station - midStation);
        if (d < minDist) { minDist = d; mid = s; }
      }
      result.push({ beamId, Mleft: first.m3, Mmid: mid.m3, Mright: last.m3, story: first.story });
    }
    return result;
  }

  return [];
}

const ETABSComparisonTable: React.FC<Props> = ({
  frames, beams, columns, stories,
  frameResults3D, frameResults2D, frameResultsGF, frameResultsUC,
  colLoads3D, colLoads2D,
  etabsBeamData: externalEtabsData,
  onEtabsDataChange,
}) => {
  const [localEtabsData, setLocalEtabsData] = useState<ETABSBeamData[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<string>('comparison-table');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use external data if provided (for persistence), otherwise local
  const etabsData = externalEtabsData ?? localEtabsData;
  const setEtabsData = useCallback((data: ETABSBeamData[]) => {
    if (onEtabsDataChange) onEtabsDataChange(data);
    else setLocalEtabsData(data);
  }, [onEtabsDataChange]);

  const getBeamDisplayName = useCallback((beamId: string) => {
    const beamObj = beams.find(b => b.id === beamId);
    if (beamObj && beamObj.name) {
      return beamObj.name.replace(/-\d+$/, '');
    }
    return beamId;
  }, [beams]);

  // Build reverse merge map: oldBeamId → mergedBeamId
  const mergeReverseMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of beams) {
      if (b.mergedFrom && b.mergedFrom.length > 0) {
        for (const oldId of b.mergedFrom) {
          m.set(oldId, b.id);
        }
      }
    }
    return m;
  }, [beams]);

  // Map raw ETABS story labels onto App story IDs
  const etabsStoryMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const ed of etabsData) {
      if (!ed.story) continue;
      if (m.has(ed.story)) continue;
      const storyForED = stories.find(s =>
        s.label === ed.story ||
        s.label.toLowerCase() === ed.story.toLowerCase() ||
        s.label.replace(/\s+/g, '').toLowerCase() === ed.story.replace(/\s+/g, '').toLowerCase()
      ) || (() => {
        const match = ed.story.match(/(\d+)$/);
        if (!match) return undefined;
        const idx = parseInt(match[1]) - 1;
        return idx >= 0 && idx < stories.length ? stories[idx] : undefined;
      })();
      if (storyForED) {
        m.set(ed.story, storyForED.id);
      }
    }
    return m;
  }, [etabsData, stories]);

  // Map ETABS raw beam labels based on ID, split prefixes, merge maps, and story matching rules
  const etabsMap = useMemo(() => {
    const m = new Map<string, ETABSBeamData>();
    if (!etabsData || etabsData.length === 0) return m;

    for (const b of beams) {
      // Find a matching ETABS data point according to multi-story matches
      let match = etabsData.find(ed => {
        const appStoryId = ed.story ? etabsStoryMap.get(ed.story) : undefined;
        const isMatchedId = ed.beamId === b.id || ed.beamId === b.name;
        const isMatchedStory = !appStoryId || appStoryId === b.storyId;
        return isMatchedId && isMatchedStory;
      });

      // Split parts search: e.g. b.id is "B1-1" and ETABS is "B1"
      if (!match) {
        match = etabsData.find(ed => {
          const appStoryId = ed.story ? etabsStoryMap.get(ed.story) : undefined;
          const isMatchedStory = !appStoryId || appStoryId === b.storyId;
          if (!isMatchedStory) return false;
          
          const parsePrefix = (id: string) => {
            const spl = id.match(/^(.+)-(\d+)$/);
            return spl ? spl[1] : id;
          };
          const bPrefix = parsePrefix(b.id);
          const namePrefix = b.name ? parsePrefix(b.name) : '';
          return ed.beamId === bPrefix || (namePrefix && ed.beamId === namePrefix);
        });
      }

      // Merged source search
      if (!match && b.mergedFrom && b.mergedFrom.length > 0) {
        match = etabsData.find(ed => {
          const appStoryId = ed.story ? etabsStoryMap.get(ed.story) : undefined;
          const isMatchedStory = !appStoryId || appStoryId === b.storyId;
          return isMatchedStory && b.mergedFrom?.includes(ed.beamId);
        });
      }

      if (match) {
        m.set(b.id, {
          beamId: match.beamId,
          story: match.story,
          Mleft: match.Mleft,
          Mmid: match.Mmid,
          Mright: match.Mright,
        });
      }
    }
    return m;
  }, [etabsData, beams, etabsStoryMap]);

  const hasEtabs = etabsData.length > 0;

  const beamsMap = useMemo(() => new Map(beams.map(b => [b.id, b])), [beams]);

  const beam3DMap = useMemo(() => {
    const map = new Map<string, FrameResult['beams'][number] & { frameId: string }>();
    for (const fr of frameResults3D) {
      for (const br of fr.beams) {
        map.set(br.beamId, { ...br, frameId: fr.frameId });
      }
    }
    return map;
  }, [frameResults3D]);

  const beam2DMap = useMemo(() => {
    const map = new Map<string, FrameResult['beams'][number]>();
    for (const fr of frameResults2D) {
      for (const br of fr.beams) {
        map.set(br.beamId, br);
      }
    }
    return map;
  }, [frameResults2D]);

  const beamGFMap = useMemo(() => {
    const map = new Map<string, FrameResult['beams'][number]>();
    if (frameResultsGF) {
      for (const fr of frameResultsGF) {
        for (const br of fr.beams) {
          map.set(br.beamId, br);
        }
      }
    }
    return map;
  }, [frameResultsGF]);

  const beamUCMap = useMemo(() => {
    const map = new Map<string, FrameResult['beams'][number]>();
    if (frameResultsUC) {
      for (const fr of frameResultsUC) {
        for (const br of fr.beams) {
          map.set(br.beamId, br);
        }
      }
    }
    return map;
  }, [frameResultsUC]);

  const hasGF = frameResultsGF && frameResultsGF.length > 0;
  const hasUC = frameResultsUC && frameResultsUC.length > 0;

  const beamRows = useMemo<BeamCompRow[]>(() => {
    const rows: BeamCompRow[] = [];
    for (const frame of frames) {
      for (const beamId of frame.beamIds) {
        const beam = beamsMap.get(beamId);
        if (!beam) continue;
        const r3 = beam3DMap.get(beamId);
        const r2 = beam2DMap.get(beamId);
        const rg = beamGFMap.get(beamId);
        const ru = beamUCMap.get(beamId);
        const storyLabel = stories.find(s => s.id === beam.storyId)?.label ?? '';
        rows.push({
          beamId,
          frameId: frame.id,
          storyLabel,
          span: r3?.span ?? r2?.span ?? beam.length,
          m2d_left: r2?.Mleft ?? 0, m2d_mid: r2?.Mmid ?? 0, m2d_right: r2?.Mright ?? 0, v2d: r2?.Vu ?? 0,
          m3d_left: r3?.Mleft ?? 0, m3d_mid: r3?.Mmid ?? 0, m3d_right: r3?.Mright ?? 0, v3d: r3?.Vu ?? 0,
          mgf_left: rg?.Mleft ?? 0, mgf_mid: rg?.Mmid ?? 0, mgf_right: rg?.Mright ?? 0, vgf: rg?.Vu ?? 0,
          muc_left: ru?.Mleft ?? 0, muc_mid: ru?.Mmid ?? 0, muc_right: ru?.Mright ?? 0, vuc: ru?.Vu ?? 0,
        });
      }
    }
    return rows;
  }, [frames, beamsMap, beam3DMap, beam2DMap, beamGFMap, beamUCMap, stories]);

  const colRows = useMemo<ColCompRow[]>(() => {
    return columns
      .filter(c => !c.isRemoved)
      .map(c => {
        const l3 = colLoads3D.get(c.id);
        const l2 = colLoads2D.get(c.id);
        const storyLabel = stories.find(s => s.id === c.storyId)?.label ?? '';
        return {
          colId: c.id, bxh: `${c.b}×${c.h}`, storyLabel,
          pu2d: l2?.Pu ?? 0, mx2d: l2?.Mx ?? 0, my2d: l2?.My ?? 0,
          pu3d: l3?.Pu ?? 0, mx3d: l3?.Mx ?? 0, my3d: l3?.My ?? 0,
        };
      });
  }, [columns, colLoads3D, colLoads2D, stories]);

  /** Compute (2D - ETABS) / ETABS as percentage */
  const etabsDiffPctNum = (engine: number, etabs: number): number | null => {
    if (Math.abs(etabs) < 0.01) return null;
    return ((Math.abs(engine) - Math.abs(etabs)) / Math.abs(etabs)) * 100;
  };

  const etabsDiffPct = (engine: number, etabs: number): string => {
    const v = etabsDiffPctNum(engine, etabs);
    return v === null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  };

  const etabsDiffColor = (engine: number, etabs: number): string | undefined => {
    const pct = etabsDiffPctNum(engine, etabs);
    if (pct === null) return undefined;
    const absPct = Math.abs(pct);
    if (absPct < 5) return 'hsl(142 71% 45%)';
    if (absPct < 15) return 'hsl(45 93% 47%)';
    return 'hsl(0 84.2% 60.2%)';
  };

  const diffPctNum = (a: number, b: number): number | null => {
    if (Math.abs(a) < 0.01 && Math.abs(b) < 0.01) return null;
    const base = Math.max(Math.abs(a), Math.abs(b));
    return (Math.abs(Math.abs(b) - Math.abs(a)) / base) * 100;
  };

  const diffPct = (a: number, b: number): string => {
    const v = diffPctNum(a, b);
    return v === null ? '—' : v.toFixed(1) + '%';
  };

  const diffColor = (a: number, b: number): string | undefined => {
    const pct = diffPctNum(a, b);
    if (pct === null) return undefined;
    if (pct < 5) return 'hsl(142 71% 45%)';
    if (pct < 15) return 'hsl(45 93% 47%)';
    return 'hsl(0 84.2% 60.2%)';
  };

  // Average differences between ETABS and engines using |((engine - ETABS) / ETABS)|
  const avgDiffs = useMemo(() => {
    if (!hasEtabs) return null;
    const diffs2d: number[] = [];
    const diffs3d: number[] = [];
    const diffsGF: number[] = [];
    const diffsUC: number[] = [];
    for (const r of beamRows) {
      const etabs = etabsMap.get(r.beamId);
      if (!etabs) continue;
      for (const [eng, et] of [
        [r.m2d_left, etabs.Mleft], [r.m2d_mid, etabs.Mmid], [r.m2d_right, etabs.Mright],
      ]) {
        const d = etabsDiffPctNum(eng, et);
        if (d !== null) diffs2d.push(Math.abs(d));
      }
      for (const [eng, et] of [
        [r.m3d_left, etabs.Mleft], [r.m3d_mid, etabs.Mmid], [r.m3d_right, etabs.Mright],
      ]) {
        const d = etabsDiffPctNum(eng, et);
        if (d !== null) diffs3d.push(Math.abs(d));
      }
      if (hasGF) {
        for (const [eng, et] of [
          [r.mgf_left, etabs.Mleft], [r.mgf_mid, etabs.Mmid], [r.mgf_right, etabs.Mright],
        ]) {
          const d = etabsDiffPctNum(eng, et);
          if (d !== null) diffsGF.push(Math.abs(d));
        }
      }
      if (hasUC) {
        for (const [eng, et] of [
          [r.muc_left, etabs.Mleft], [r.muc_mid, etabs.Mmid], [r.muc_right, etabs.Mright],
        ]) {
          const d = etabsDiffPctNum(eng, et);
          if (d !== null) diffsUC.push(Math.abs(d));
        }
      }
    }
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    return {
      avg2d: avg(diffs2d), avg3d: avg(diffs3d), avgGF: avg(diffsGF), avgUC: avg(diffsUC),
      count2d: diffs2d.length, count3d: diffs3d.length, countGF: diffsGF.length, countUC: diffsUC.length,
    };
  }, [beamRows, etabsMap, hasEtabs, hasGF, hasUC]);

  // Handle spreadsheet import via standard HTML file reader
  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const parsed = parseEtabsBeamCSV(text);
      if (parsed.length > 0) setEtabsData(parsed);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  }, [setEtabsData]);

  // ========== Rigorous Validation Math & Metrics Dashboard ==========
  const validationMetrics = useMemo(() => {
    if (!hasEtabs) return null;

    let totalScoreSum = 0;
    let matchedBeamCount = 0;
    const rows: Array<{
      beamId: string;
      storyLabel: string;
      rmse: number;
      shapeSimilarity: number; // Pearson r
      posPeakError: number;
      negPeakError: number;
      score: number;
    }> = [];

    for (const r of beamRows) {
      const et = etabsMap.get(r.beamId);
      if (!et) continue;

      // Engine moments (use 3D as baseline)
      const E = [r.m3d_left, r.m3d_mid, r.m3d_right];
      const K = [et.Mleft, et.Mmid, et.Mright];

      // 1. Normalized RMSE
      const rmse = Math.sqrt(((E[0] - K[0]) ** 2 + (E[1] - K[1]) ** 2 + (E[2] - K[2]) ** 2) / 3);
      const maxAbsK = Math.max(Math.abs(K[0]), Math.abs(K[1]), Math.abs(K[2]), 1.0);
      const nrmse = rmse / maxAbsK;

      // 2. Shape Similarity (Pearson correlation r)
      const meanE = (E[0] + E[1] + E[2]) / 3;
      const meanK = (K[0] + K[1] + K[2]) / 3;
      const num = ((E[0] - meanE) * (K[0] - meanK)) + ((E[1] - meanE) * (K[1] - meanK)) + ((E[2] - meanE) * (K[2] - meanK));
      const den = Math.sqrt(
        (((E[0] - meanE) ** 2) + ((E[1] - meanE) ** 2) + ((E[2] - meanE) ** 2)) *
        (((K[0] - meanK) ** 2) + (((K[1] - meanK) ** 2)) + ((K[2] - meanK) ** 2))
      );
      
      let rPearson = 0;
      if (den === 0) {
        const isAllEZero = E.every(val => Math.abs(val) < 0.1);
        const isAllKZero = K.every(val => Math.abs(val) < 0.1);
        rPearson = (isAllEZero && isAllKZero) ? 1.0 : 0.0;
      } else {
        rPearson = num / den;
      }

      // 3. Positive Peak Error
      const posPeakError = Math.abs(K[1]) > 0.1 ? ((E[1] - K[1]) / Math.abs(K[1])) * 100 : 0;

      // 4. Negative Peak Error
      const negE = Math.min(E[0], E[2]);
      const negK = Math.min(K[0], K[2]);
      const negPeakError = Math.abs(negK) > 0.1 ? ((negE - negK) / Math.abs(negK)) * 100 : 0;

      // 5. Beam Quality Match Score (0 - 100%)
      const nrmseScore = Math.max(0, 1 - nrmse) * 100;
      const shapeScore = Math.max(0, (rPearson + 1) / 2) * 100; // -1..1 -> 0..100%
      const peakScore = Math.max(0, 1 - (Math.abs(posPeakError) + Math.abs(negPeakError)) / 200) * 100;
      
      // Weighted combination
      const score = Math.round(0.4 * nrmseScore + 0.4 * shapeScore + 0.2 * peakScore);

      totalScoreSum += score;
      matchedBeamCount++;

      rows.push({
        beamId: r.beamId,
        storyLabel: r.storyLabel,
        rmse: nrmse,
        shapeSimilarity: rPearson,
        posPeakError,
        negPeakError,
        score,
      });
    }

    const projectScore = matchedBeamCount > 0 ? Math.round(totalScoreSum / matchedBeamCount) : 0;

    // Badge configuration for Project Score
    let statusText = 'مجهول';
    let statusColor = 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    let detailedTips = '';

    if (projectScore >= 90) {
      statusText = 'توأم إنشائي متطابق (Structural Twin)';
      statusColor = 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border-emerald-500/30';
      detailedTips = 'ممتاز! النموذج الحالي متطابق بالكامل ودقيق بنسبة ممتازة مع برنامج ETABS. تم موازنة الجساءات وظروف المساند بنجاح كبير.';
    } else if (projectScore >= 70) {
      statusText = 'مقبول ومتوافق (Compliant with minor offsets)';
      statusColor = 'bg-sky-500/10 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300 border-sky-500/30';
      detailedTips = 'التطابق جيد جداً مع فروقات طفيفة بسبب فروق معامل تكسير الخرسانة (Cracking Modifiers) أو مرونة العقد المشتركة.';
    } else if (projectScore >= 50) {
      statusText = 'غير متحاذٍ ومتباعد (Unaligned)';
      statusColor = 'bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 border-amber-500/30';
      detailedTips = 'انتباه: هناك بعض الاختلافات في مخطط العزوم أو أماكن الركائز. تأكد من تطابق معاملات صلابة المقاطع المتشققة (Inertia Modifiers) وعرض المساند.';
    } else {
      statusText = 'تباين حرج وغير متطابق (Critical Mismatch)';
      statusColor = 'bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive-foreground border-destructive/30';
      detailedTips = 'تحذير هندسي: التباين مرتفع جداً! تحقق من سلامة النموذج الإنشائي، والأحمال المسلطة، واتجاه المحاور المحلية، وشروط تحرير أطراف العناصر الإنشائية (End Releases).';
    }

    return {
      projectScore,
      statusText,
      statusColor,
      detailedTips,
      rows,
    };
  }, [beamRows, etabsMap, hasEtabs]);

  if (beamRows.length === 0 && colRows.length === 0) return null;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Description and Import Headers */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-muted/20 border border-border/80 rounded-xl p-4">
        <div className="space-y-1">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <Building className="w-4 h-4 text-primary" />
            التدقيق المتبادل ومقارنة نتائج ETABS
          </h2>
          <p className="text-xs text-muted-foreground">
            قارن القوى الداخلية ومخططات العزوم المحسوبة مباشرة بالتطابق الإنشائي المتقدم مع برمجيات التحليل الحرفية كـ ETABS.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-center">
          {hasEtabs && (
            <Badge className="text-[10px] bg-green-505/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 border gap-1 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              نشط: تم استيراد {etabsData.length} جسر متطابق
            </Badge>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={handleFileImport}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs font-bold"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={13} />
            {hasEtabs ? 'تحديث ملف النتائج (CSV)' : 'تحميل جدول ETABS المستخرج'}
          </Button>
        </div>
      </div>

      {hasEtabs ? (
        <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full">
          <TabsList className="grid grid-cols-2 w-full max-w-md h-10 mb-4 bg-muted/40 p-1 rounded-xl">
            <TabsTrigger value="comparison-table" className="text-xs font-semibold gap-1.5 rounded-lg">
              <TrendingUp className="w-3.5 h-3.5" />
              جداول القوى الفردية المستمرة
            </TabsTrigger>
            <TabsTrigger value="validation-dashboard" className="text-xs font-semibold gap-1.5 rounded-lg">
              <Sparkles className="w-3.5 h-3.5" />
              لوحة جودة المطابقة (Validation Panel)
            </TabsTrigger>
          </TabsList>

          {/* ─────── TAB: Validation Dashboard ─────── */}
          <TabsContent value="validation-dashboard" className="space-y-4 focus-visible:outline-none focus-visible:ring-0">
            {validationMetrics && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Score Circular Metric */}
                <Card className="md:col-span-1 shadow-sm border border-border/80">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground font-semibold">مؤشر التقارب الإجمالي</CardTitle>
                    <CardDescription className="text-[10px]">مستوى التطابق الإنشائي العام مع ETABS</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center justify-center py-6 text-center">
                    <div className="relative flex items-center justify-center w-28 h-28 rounded-full border-4 border-dashed border-primary/20 bg-muted/30">
                      <div className="flex flex-col items-center justify-center">
                        <span className="text-4xl font-extrabold tracking-tight font-mono text-primary">
                          {validationMetrics.projectScore}%
                        </span>
                        <span className="text-[10px] text-muted-foreground font-semibold mt-1">نسبة الدقة</span>
                      </div>
                    </div>
                    
                    <div className="mt-4 w-full">
                      <Badge className={`w-full py-1 text-[11px] justify-center font-bold border ${validationMetrics.statusColor}`}>
                        {validationMetrics.statusText}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                {/* Analytical Tips & Recommendations */}
                <Card className="md:col-span-2 shadow-sm border border-border/80 justify-between flex flex-col">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                      التشخيص الهندسي والتوصيات
                    </CardTitle>
                    <CardDescription className="text-[10px]">قراءة فنية لمسببات الاختلاف بالاعتماد على درجات الدقة</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 flex-1 flex flex-col justify-between">
                    <p className="text-xs text-foreground/80 leading-relaxed font-medium bg-muted/40 p-3.5 rounded-lg border border-border/40">
                      {validationMetrics.detailedTips}
                    </p>
                    
                    <div className="text-[11px] text-muted-foreground space-y-1 border-t pt-3 border-border/50">
                      <div className="font-semibold text-foreground mb-1">💡 لزيادة جودة التطابق وتحقيق التوائم الإنشائي الرقمي:</div>
                      <div>• تحقق من ضبط معامل تكسير صلابة الجسور الخرسانية على <code className="font-mono bg-muted px-1 py-0.5 rounded text-primary">0.35 * Ig</code> وعامل الأعمدة على <code className="font-mono bg-muted px-1 py-0.5 rounded text-primary">0.70 * Ig</code>.</div>
                      <div>• تأكد من أن ظروف ركائز الأعمدة في القاعدة السفلى مضبوطة على مفاصل ثابتة (Fixed Supports) مطابقة لنموذج الـ ETABS الخاص بك.</div>
                    </div>
                  </CardContent>
                </Card>

                {/* Detailed Table for Beam Evaluation Metrics */}
                <Card className="md:col-span-3 shadow-sm border border-border/80">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold text-foreground">بيانات جودة المطابقة الفردية للجسور (Beam-by-Beam Calibration)</CardTitle>
                    <CardDescription className="text-[10px]">مصفوفة التقارب الرياضية لتقييم جودة مخطط تشوهات العزوم</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto p-0 md:p-6 md:pt-0">
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow>
                          <TableHead className="text-xs text-right">الدور</TableHead>
                          <TableHead className="text-xs text-right">الجسر</TableHead>
                          <TableHead className="text-xs text-center">التباين الموحد (NRMSE)</TableHead>
                          <TableHead className="text-xs text-center">معامل تماثل الشكل (Pearson r)</TableHead>
                          <TableHead className="text-xs text-center">خطأ ذروة العزم الموجب M⁺</TableHead>
                          <TableHead className="text-xs text-center font-bold">خطأ ذروة العزم السالب M⁻</TableHead>
                          <TableHead className="text-xs text-center font-bold text-primary">درجة التطابق</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {validationMetrics.rows.map(row => {
                          let rowBadgeColor = 'text-emerald-700 bg-emerald-500/10 border-emerald-400/30';
                          let rowInterpretation = 'تطابق تام 🌟';
                          if (row.score < 50) {
                            rowBadgeColor = 'text-destructive bg-destructive/15 border-destructive/20';
                            rowInterpretation = 'تباين حرج 🚨';
                          } else if (row.score < 75) {
                            rowBadgeColor = 'text-amber-700 bg-amber-500/15 border-amber-400/30';
                            rowInterpretation = 'تفاوت طفيف ⚠️';
                          } else if (row.score < 90) {
                            rowBadgeColor = 'text-sky-700 bg-sky-500/15 border-sky-400/30';
                            rowInterpretation = 'تقارب ممتاز 👍';
                          }

                          return (
                            <TableRow key={row.beamId} className="hover:bg-muted/20">
                              <TableCell className="text-xs font-semibold">{row.storyLabel}</TableCell>
                              <TableCell className="font-mono text-xs font-bold">{row.beamId}</TableCell>
                              <TableCell className="font-mono text-xs text-center">
                                <span className={row.rmse > 0.25 ? 'text-destructive font-bold' : row.rmse > 0.08 ? 'text-amber-600' : 'text-emerald-600'}>
                                  {row.rmse.toFixed(3)}
                                </span>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-center">
                                <span className={row.shapeSimilarity < 0.6 ? 'text-destructive font-bold' : row.shapeSimilarity < 0.9 ? 'text-amber-600' : 'text-emerald-600'}>
                                  {row.shapeSimilarity.toFixed(3)}
                                </span>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-center">
                                <span className={Math.abs(row.posPeakError) > 20 ? 'text-red-500 font-bold' : 'text-foreground/80'}>
                                  {Math.abs(row.posPeakError) < 0.1 ? '0.0%' : `${row.posPeakError > 0 ? '+' : ''}${row.posPeakError.toFixed(1)}%`}
                                </span>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-center font-medium">
                                <span className={Math.abs(row.negPeakError) > 20 ? 'text-red-500 font-bold' : 'text-foreground/80'}>
                                  {Math.abs(row.negPeakError) < 0.1 ? '0.0%' : `${row.negPeakError > 0 ? '+' : ''}${row.negPeakError.toFixed(1)}%`}
                                </span>
                              </TableCell>
                              <TableCell className="text-center font-bold text-xs">
                                <Badge variant="outline" className={`font-bold text-[10px] gap-1 py-0.5 px-2 ${rowBadgeColor}`}>
                                  {row.score}% — {rowInterpretation}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ─────── TAB: Direct Moments Comparison Table ─────── */}
          <TabsContent value="comparison-table" className="focus-visible:outline-none focus-visible:ring-0">
            <Card className="shadow-sm border border-border/80">
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="text-xs text-right">الدور</TableHead>
                      <TableHead className="text-xs text-right col-span-1">الجسر</TableHead>
                      <TableHead className="text-xs text-right">البحر</TableHead>
                      <TableHead className="text-xs text-center" colSpan={4}>M_left (kN·m)</TableHead>
                      <TableHead className="text-xs text-center" colSpan={4}>M_mid (kN·m)</TableHead>
                      <TableHead className="text-xs text-center" colSpan={4}>M_right (kN·m)</TableHead>
                    </TableRow>
                    <TableRow>
                      <TableHead /><TableHead /><TableHead />
                      {/* Left */}
                      {['2D','3D',hasGF && 'GF',hasUC && 'UC','ETABS'].filter(Boolean).map((h, idx) => (
                        <TableHead key={`l-${idx}`} className="text-[10px] text-center px-1 font-bold">{h as string}</TableHead>
                      ))}
                      {/* Mid */}
                      {['2D','3D',hasGF && 'GF',hasUC && 'UC','ETABS'].filter(Boolean).map((h, idx) => (
                        <TableHead key={`m-${idx}`} className="text-[10px] text-center px-1 font-bold">{h as string}</TableHead>
                      ))}
                      {/* Right */}
                      {['2D','3D',hasGF && 'GF',hasUC && 'UC','ETABS'].filter(Boolean).map((h, idx) => (
                        <TableHead key={`r-${idx}`} className="text-[10px] text-center px-1 font-bold">{h as string}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {beamRows.map(r => {
                      const etabs = etabsMap.get(r.beamId);
                      return (
                        <TableRow key={r.beamId} className="hover:bg-muted/10">
                          <TableCell className="text-xs text-muted-foreground">{r.storyLabel}</TableCell>
                          <TableCell className="font-mono text-xs font-bold">{getBeamDisplayName(r.beamId)}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{(r.span / 1000).toFixed(2)}م</TableCell>
                          
                          {/* ── MOMENT LEFT ── */}
                          <TableCell className="font-mono text-xs text-center px-1 text-blue-600 dark:text-blue-400">{r.m2d_left.toFixed(1)}</TableCell>
                          <TableCell className="font-mono text-xs text-center px-1 text-emerald-600 dark:text-emerald-400">{r.m3d_left.toFixed(1)}</TableCell>
                          {hasGF && <TableCell className="font-mono text-xs text-center px-1 text-amber-600">{r.mgf_left.toFixed(1)}</TableCell>}
                          {hasUC && <TableCell className="font-mono text-xs text-center px-1 text-purple-600">{r.muc_left.toFixed(1)}</TableCell>}
                          <TableCell className="font-mono text-xs text-center px-1 text-orange-600 dark:text-orange-400 bg-orange-500/5 font-bold">
                            {etabs ? etabs.Mleft.toFixed(1) : '—'}
                          </TableCell>

                          {/* ── MOMENT MIDSPAN ── */}
                          <TableCell className="font-mono text-xs text-center px-1 text-blue-600 dark:text-blue-400">{r.m2d_mid.toFixed(1)}</TableCell>
                          <TableCell className="font-mono text-xs text-center px-1 text-emerald-600 dark:text-emerald-400">{r.m3d_mid.toFixed(1)}</TableCell>
                          {hasGF && <TableCell className="font-mono text-xs text-center px-1 text-amber-600">{r.mgf_mid.toFixed(1)}</TableCell>}
                          {hasUC && <TableCell className="font-mono text-xs text-center px-1 text-purple-600">{r.muc_mid.toFixed(1)}</TableCell>}
                          <TableCell className="font-mono text-xs text-center px-1 text-orange-600 dark:text-orange-400 bg-orange-500/5 font-bold">
                            {etabs ? etabs.Mmid.toFixed(1) : '—'}
                          </TableCell>

                          {/* ── MOMENT RIGHT ── */}
                          <TableCell className="font-mono text-xs text-center px-1 text-blue-600 dark:text-blue-400">{r.m2d_right.toFixed(1)}</TableCell>
                          <TableCell className="font-mono text-xs text-center px-1 text-emerald-600 dark:text-emerald-400">{r.m3d_right.toFixed(1)}</TableCell>
                          {hasGF && <TableCell className="font-mono text-xs text-center px-1 text-amber-600">{r.mgf_right.toFixed(1)}</TableCell>}
                          {hasUC && <TableCell className="font-mono text-xs text-center px-1 text-purple-600">{r.muc_right.toFixed(1)}</TableCell>}
                          <TableCell className="font-mono text-xs text-center px-1 text-orange-600 dark:text-orange-400 bg-orange-500/5 font-bold">
                            {etabs ? etabs.Mright.toFixed(1) : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        /* If no ETABS is loaded, fall back to the standard beautiful Moment comparison table between the internal engines */
        <Card className="shadow-sm border border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">جدول مقارنة القوى والعزوم للجسور</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="text-xs text-right">الدور</TableHead>
                  <TableHead className="text-xs text-right">الجسر</TableHead>
                  <TableHead className="text-xs text-right">البهر</TableHead>
                  <TableHead className="text-xs text-center" colSpan={hasGF ? 3 : 2}>M_left (kN·m)</TableHead>
                  <TableHead className="text-xs text-center" colSpan={hasGF ? 3 : 2}>M_mid (kN·m)</TableHead>
                  <TableHead className="text-xs text-center" colSpan={hasGF ? 3 : 2}>M_right (kN·m)</TableHead>
                </TableRow>
                <TableRow>
                  <TableHead /><TableHead /><TableHead />
                  {['2D','3D',hasGF && 'GF'].filter(Boolean).map((h, i) => <TableHead key={`lh-${i}`} className="text-[10px] text-center font-bold px-1">{h as string}</TableHead>)}
                  {['2D','3D',hasGF && 'GF'].filter(Boolean).map((h, i) => <TableHead key={`mh-${i}`} className="text-[10px] text-center font-bold px-1">{h as string}</TableHead>)}
                  {['2D','3D',hasGF && 'GF'].filter(Boolean).map((h, i) => <TableHead key={`rh-${i}`} className="text-[10px] text-center font-bold px-1">{h as string}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {beamRows.map(r => (
                  <TableRow key={r.beamId} className="hover:bg-muted/10">
                    <TableCell className="text-xs text-muted-foreground">{r.storyLabel}</TableCell>
                    <TableCell className="font-mono text-xs font-bold">{getBeamDisplayName(r.beamId)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{(r.span / 1000).toFixed(2)}م</TableCell>
                    
                    <TableCell className="font-mono text-xs text-center text-blue-600 dark:text-blue-400">{r.m2d_left.toFixed(1)}</TableCell>
                    <TableCell className="font-mono text-xs text-center text-emerald-600 dark:text-emerald-400">{r.m3d_left.toFixed(1)}</TableCell>
                    {hasGF && <TableCell className="font-mono text-xs text-center text-amber-600">{r.mgf_left.toFixed(1)}</TableCell>}
                    
                    <TableCell className="font-mono text-xs text-center text-blue-600 dark:text-blue-400">{r.m2d_mid.toFixed(1)}</TableCell>
                    <TableCell className="font-mono text-xs text-center text-emerald-600 dark:text-emerald-400">{r.m3d_mid.toFixed(1)}</TableCell>
                    {hasGF && <TableCell className="font-mono text-xs text-center text-amber-600">{r.mgf_mid.toFixed(1)}</TableCell>}
                    
                    <TableCell className="font-mono text-xs text-center text-blue-600 dark:text-blue-400">{r.m2d_right.toFixed(1)}</TableCell>
                    <TableCell className="font-mono text-xs text-center text-emerald-600 dark:text-emerald-400">{r.m3d_right.toFixed(1)}</TableCell>
                    {hasGF && <TableCell className="font-mono text-xs text-center text-amber-600">{r.mgf_right.toFixed(1)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ─────── TABLE: Columns Comparison ─────── */}
      {colRows.length > 0 && (
        <Card className="shadow-sm border border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold flex items-center gap-2">
              <Building className="w-4 h-4 text-primary" />
              مقارنة القوى الداخلية للأعمدة
              <Badge variant="outline" className="text-[10px]">2D مقابل 3D</Badge>
            </CardTitle>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              2D = توزيع العزوم بنسبة الجساءة (من ردود أفعال الجسور) · 3D = تحليل مباشر بالإطار الفراغي ثلاثي الأبعاد
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0 md:p-6 md:pt-0">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="text-xs">الدور</TableHead>
                  <TableHead className="text-xs">العمود</TableHead>
                  <TableHead className="text-xs">المقطع</TableHead>
                  <TableHead className="text-[10px] text-center" colSpan={3}>Pu (kN)</TableHead>
                  <TableHead className="text-[10px] text-center" colSpan={3}>Mx (kN·m)</TableHead>
                  <TableHead className="text-[10px] text-center" colSpan={3}>My (kN·m)</TableHead>
                </TableRow>
                <TableRow>
                  <TableHead /><TableHead /><TableHead />
                  {['2D','3D','Δ%','2D','3D','Δ%','2D','3D','Δ%'].map((h, i) => (
                    <TableHead key={i} className="text-[10px] text-center px-1 font-bold">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {colRows.map(r => (
                  <TableRow key={r.colId} className="hover:bg-muted/10">
                    <TableCell className="text-xs text-muted-foreground">{r.storyLabel}</TableCell>
                    <TableCell className="font-mono text-xs font-bold">{r.colId}</TableCell>
                    <TableCell className="font-mono text-xs">{r.bxh}</TableCell>
                    
                    <TableCell className="font-mono text-xs text-center px-1 text-blue-600 dark:text-blue-400">{r.pu2d.toFixed(1)}</TableCell>
                    <TableCell className="font-mono text-xs text-center px-1 text-emerald-600 dark:text-emerald-400">{r.pu3d.toFixed(1)}</TableCell>
                    <TableCell className="font-mono text-xs text-center px-1 font-bold" style={{ color: diffColor(r.pu2d, r.pu3d) }}>{diffPct(r.pu2d, r.pu3d)}</TableCell>
                    
                    <TableCell className="font-mono text-xs text-center px-1 text-blue-600 dark:text-blue-400">{r.mx2d.toFixed(1)}</TableCell>
                    <TableCell className="font-mono text-xs text-center px-1 text-emerald-600 dark:text-emerald-400">{r.mx3d.toFixed(1)}</TableCell>
                    <TableCell className="font-mono text-xs text-center px-1 font-bold" style={{ color: diffColor(r.mx2d, r.mx3d) }}>{diffPct(r.mx2d, r.mx3d)}</TableCell>
                    
                    <TableCell className="font-mono text-xs text-center px-1 text-blue-600 dark:text-blue-400">{r.my2d.toFixed(1)}</TableCell>
                    <TableCell className="font-mono text-xs text-center px-1 text-emerald-600 dark:text-emerald-400">{r.my3d.toFixed(1)}</TableCell>
                    <TableCell className="font-mono text-xs text-center px-1 font-bold" style={{ color: diffColor(r.my2d, r.my3d) }}>{diffPct(r.my2d, r.my3d)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Color Guides / Legends footer */}
      <Card className="shadow-none bg-muted/20 border-border/60">
        <CardContent className="py-2.5">
          <div className="flex gap-5 text-[10px] flex-wrap leading-relaxed justify-center md:justify-start">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-blue-500 opacity-80" />
              قيم 2D (Matrix Stiffness)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500 opacity-80" />
              قيم 3D (المعتمدة في التصميم)
            </span>
            {hasGF && (
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-amber-500 opacity-80" />
                قيم GF (Global Frame)
              </span>
            )}
            {hasEtabs && (
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-orange-500 opacity-80" />
                قيم ETABS (المستوردة)
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: 'hsl(142 71% 45%)' }} />
              فرق متناهي مقنع (&lt; 5%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: 'hsl(45 93% 47%)' }} />
              فرق مقبول هندسياً (5%-15%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: 'hsl(0 84.2% 60.2%)' }} />
              فروقات جديرة بالتحقق (&gt; 15%)
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ETABSComparisonTable;
