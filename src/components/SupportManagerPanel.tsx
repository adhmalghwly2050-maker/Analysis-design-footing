import React, { useState, useMemo } from 'react';
import type { Column, Beam, Story } from '@/lib/structuralEngine';
import type { SupportDatabase, SupportEntity, SupportAssignmentEntity, SupportRestraintEntity, SupportSpringEntity, SupportReactionEntity } from '@/lib/structuralSupportSystem';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, Plus, Trash2, Copy, Edit2, ShieldAlert, ArrowUp, RefreshCcw, Check, ZoomIn } from 'lucide-react';

interface SupportManagerPanelProps {
  columns: Column[];
  beams: Beam[];
  stories: Story[];
  supportDb: SupportDatabase;
  analyzed: boolean;
  onUpdateSupportDb: (db: SupportDatabase) => void;
  triggerAnalysis: () => void;
}

export default function SupportManagerPanel({
  columns,
  beams,
  stories,
  supportDb,
  analyzed,
  onUpdateSupportDb,
  triggerAnalysis,
}: SupportManagerPanelProps) {
  const [activeTab, setActiveTab] = useState<'definitions' | 'assignments' | 'reactions'>('definitions');
  const [selectedLoadCase, setSelectedLoadCase] = useState<string>('all');
  const [elevationFilter, setElevationFilter] = useState<string>('all');

  // Dialog State
  const [definitionDialog, setDefinitionDialog] = useState<{
    open: boolean;
    isEdit: boolean;
    supportId: string;
    name: string;
    type: SupportEntity['type'];
    description: string;
    restraints: { ux: boolean; uy: boolean; uz: boolean; rx: boolean; ry: boolean; rz: boolean };
    springs: { kx: number; ky: number; kz: number; krx: number; kry: number; krz: number };
  }>({
    open: false,
    isEdit: false,
    supportId: '',
    name: '',
    type: 'Custom',
    description: '',
    restraints: { ux: false, uy: false, uz: false, rx: false, ry: false, rz: false },
    springs: { kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 },
  });

  // Collect all unique physical nodes in the project with connected elements list
  const nodesPool = useMemo(() => {
    const nodeMap = new Map<string, { id: string; x: number; y: number; z: number; elements: string[] }>();
    const tol = 0.001; // m tolerance
    const getKey = (x: number, y: number, z: number) =>
      `${Math.round(x / tol) * tol},${Math.round(y / tol) * tol},${Math.round(z / tol) * tol}`;

    // Add nodes from active columns
    columns.filter(cc => !cc.isRemoved).forEach(c => {
      const zTop = ((c.zTop ?? 0) / 1000);
      const zBot = ((c.zBottom ?? 0) / 1000);
      const keyTop = getKey(c.x, c.y, zTop);
      const keyBot = getKey(c.x, c.y, zBot);
      
      if (!nodeMap.has(keyTop)) {
        nodeMap.set(keyTop, { id: '', x: c.x, y: c.y, z: zTop, elements: [] });
      }
      if (!nodeMap.get(keyTop)!.elements.includes(c.id)) {
        nodeMap.get(keyTop)!.elements.push(c.id);
      }
      
      if (!nodeMap.has(keyBot)) {
        nodeMap.set(keyBot, { id: '', x: c.x, y: c.y, z: zBot, elements: [] });
      }
      if (!nodeMap.get(keyBot)!.elements.includes(c.id)) {
        nodeMap.get(keyBot)!.elements.push(c.id);
      }
    });

    // Add nodes from active beams
    beams.forEach(b => {
      const bz = ((b.z ?? 0) / 1000);
      const key1 = getKey(b.x1, b.y1, bz);
      const key2 = getKey(b.x2, b.y2, bz);
      
      if (!nodeMap.has(key1)) {
        nodeMap.set(key1, { id: '', x: b.x1, y: b.y1, z: bz, elements: [] });
      }
      if (!nodeMap.get(key1)!.elements.includes(b.id)) {
        nodeMap.get(key1)!.elements.push(b.id);
      }
      
      if (!nodeMap.has(key2)) {
        nodeMap.set(key2, { id: '', x: b.x2, y: b.y2, z: bz, elements: [] });
      }
      if (!nodeMap.get(key2)!.elements.includes(b.id)) {
        nodeMap.get(key2)!.elements.push(b.id);
      }
    });

    const modelNodes = [...nodeMap.values()];
    // Re-number nodes to match N1, N2, N3... numbering format exactly
    modelNodes.forEach((n, i) => {
      n.id = `N${i + 1}`;
    });

    // Match original sorted output: sorted by isBase, then by Z, X, Y
    const mappedNodes = modelNodes.map(n => {
      let isBase = false;
      const zMm = Math.round(n.z * 1000);
      
      // Is it a column base (bottom-most node of a column stack)
      const matchingCols = columns.filter(c => !c.isRemoved && Math.abs(c.x - n.x) < 0.05 && Math.abs(c.y - n.y) < 0.05);
      if (matchingCols.length > 0) {
        const lowestZBot = Math.min(...matchingCols.map(c => c.zBottom ?? 0));
        if (Math.abs(zMm - lowestZBot) < 10) {
          isBase = true;
        }
      } else {
        isBase = n.z === 0;
      }

      // Generate coordinate key (e.g., "1.20_3.00_0") for assignments matching
      const id = `${n.x.toFixed(2)}_${n.y.toFixed(2)}_${zMm}`;
      
      // Generate readable elements label (e.g., Column, Beam IDs)
      const label = `العناصر المتصلة: ${n.elements.join(', ')}`;

      return {
        id, // Search coordinate key (e.g. "x.xx_y.yy_z")
        name: n.id, // Display name (N1, N2, N3...)
        x: n.x,
        y: n.y,
        z: n.z, // In meters!
        label,
        isBase,
        elements: n.elements,
      };
    });

    return mappedNodes.sort((a, b) => {
      if (a.isBase !== b.isBase) return a.isBase ? -1 : 1;
      if (a.z !== b.z) return a.z - b.z;
      if (Math.abs(a.x - b.x) > 0.01) return a.x - b.x;
      return a.y - b.y;
    });
  }, [columns, beams]);

  // Unique elevations derived from nodesPool
  const uniqueElevations = useMemo(() => {
    const elevs = new Set<number>();
    nodesPool.forEach(node => {
      elevs.add(node.z);
    });
    return Array.from(elevs).sort((a, b) => a - b);
  }, [nodesPool]);

  // Filtered nodes pool by elevation
  const filteredNodesPool = useMemo(() => {
    if (elevationFilter === 'all') return nodesPool;
    const targetZ = parseFloat(elevationFilter);
    return nodesPool.filter(node => Math.abs(node.z - targetZ) < 0.01);
  }, [nodesPool, elevationFilter]);

  // Unique load cases captured in reactions
  const loadCases = useMemo(() => {
    if (!supportDb.reactions || supportDb.reactions.length === 0) return ['1.0D+1.0L'];
    const cases = new Set<string>();
    supportDb.reactions.forEach(r => cases.add(r.loadCase));
    return Array.from(cases);
  }, [supportDb.reactions]);

  // Support CRUD operations
  const handleOpenCreateDefinition = () => {
    setDefinitionDialog({
      open: true,
      isEdit: false,
      supportId: `sup_${Date.now()}`,
      name: 'مسند مخصص جديد (New Support)',
      type: 'Custom',
      description: 'مسند مخصص لتقييد حركات ونوابض معينة',
      restraints: { ux: true, uy: true, uz: true, rx: false, ry: false, rz: false },
      springs: { kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 },
    });
  };

  const handleOpenEditDefinition = (sup: SupportEntity) => {
    const rest = supportDb.restraints[sup.id] || { ux: false, uy: false, uz: false, rx: false, ry: false, rz: false };
    const spr = supportDb.springs[sup.id] || { kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 };
    setDefinitionDialog({
      open: true,
      isEdit: true,
      supportId: sup.id,
      name: sup.name,
      type: sup.type,
      description: sup.description,
      restraints: { ...rest },
      springs: { ...spr },
    });
  };

  const handleDuplicateDefinition = (sup: SupportEntity) => {
    const newId = `sup_${Date.now()}`;
    const rest = supportDb.restraints[sup.id] || { ux: false, uy: false, uz: false, rx: false, ry: false, rz: false };
    const spr = supportDb.springs[sup.id] || { kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 };
    
    const duplicateSupport: SupportEntity = {
      id: newId,
      name: `${sup.name} (نسخة)`,
      type: sup.type,
      description: sup.description + ' - نسخة مكررة',
      createdDate: new Date().toISOString(),
      modifiedDate: new Date().toISOString(),
    };

    onUpdateSupportDb({
      ...supportDb,
      supports: [...supportDb.supports, duplicateSupport],
      restraints: { ...supportDb.restraints, [newId]: { ...rest, supportId: newId } },
      springs: { ...supportDb.springs, [newId]: { ...spr, supportId: newId } },
    });
  };

  const handleDeleteDefinition = (supId: string) => {
    if (supId === 'sup_fixed' || supId === 'sup_pinned' || supId.startsWith('sup_roller')) {
      alert('لا يمكن حذف الممساند الافتراضية للنظام لتحقيق الاستقرار.');
      return;
    }

    // Filter supports, restraints, springs
    const supports = supportDb.supports.filter(s => s.id !== supId);
    const restraints = { ...supportDb.restraints };
    delete restraints[supId];
    const springs = { ...supportDb.springs };
    delete springs[supId];

    // Remove assignments that map to this support
    const assignments = supportDb.assignments.filter(a => a.supportId !== supId);

    onUpdateSupportDb({
      ...supportDb,
      supports,
      restraints,
      springs,
      assignments,
    });
  };

  const handleSaveDefinition = () => {
    const sup: SupportEntity = {
      id: definitionDialog.supportId,
      name: definitionDialog.name,
      type: definitionDialog.type,
      description: definitionDialog.description,
      createdDate: new Date().toISOString(),
      modifiedDate: new Date().toISOString(),
    };

    const rest: SupportRestraintEntity = {
      supportId: definitionDialog.supportId,
      ...definitionDialog.restraints,
    };

    const spr: SupportSpringEntity = {
      supportId: definitionDialog.supportId,
      ...definitionDialog.springs,
    };

    let updatedSupports = [...supportDb.supports];
    if (definitionDialog.isEdit) {
      updatedSupports = updatedSupports.map(s => s.id === sup.id ? sup : s);
    } else {
      updatedSupports.push(sup);
    }

    onUpdateSupportDb({
      ...supportDb,
      supports: updatedSupports,
      restraints: { ...supportDb.restraints, [sup.id]: rest },
      springs: { ...supportDb.springs, [sup.id]: spr },
    });

    setDefinitionDialog(prev => ({ ...prev, open: false }));
  };

  // Node Assignment operations
  const handleAssignSupport = (nodeId: string, supportId: string) => {
    let assignments = [...supportDb.assignments];
    // Filter existing for this nodeId
    assignments = assignments.filter(a => a.nodeId !== nodeId);

    if (supportId !== 'none') {
      assignments.push({
        id: `asg_${Date.now()}_${nodeId.replace(/\./g, '_')}`,
        supportId,
        nodeId,
      });
    }

    onUpdateSupportDb({
      ...supportDb,
      assignments,
    });
  };

  const handleBatchAssign = (type: 'all_base_fixed' | 'all_base_pinned' | 'clear_all') => {
    let assignments = [...supportDb.assignments];
    
    if (type === 'clear_all') {
      assignments = [];
    } else {
      const targetSupportId = type === 'all_base_fixed' ? 'sup_fixed' : 'sup_pinned';
      nodesPool.forEach(node => {
        if (node.isBase) {
          assignments = assignments.filter(a => a.nodeId !== node.id);
          assignments.push({
            id: `asg_batch_${Date.now()}_${node.id.replace(/\./g, '_')}`,
            supportId: targetSupportId,
            nodeId: node.id,
          });
        }
      });
    }

    onUpdateSupportDb({
      ...supportDb,
      assignments,
    });
  };

  // Export Reactions
  const handleExportReactions = () => {
    if (!supportDb.reactions || supportDb.reactions.length === 0) return;
    
    const filtered = selectedLoadCase === 'all'
      ? supportDb.reactions
      : supportDb.reactions.filter(r => r.loadCase === selectedLoadCase);
      
    let csv = '\ufeff'; // Add UTF-8 BOM for Arabic excel compatibility
    csv += 'قيمة العقدة (NodeID),حالة التحميل (LoadCase),القوة Fx (kN),القوة Fy (kN),القوة Fz (kN),العزم Mx (kN.m),العزم My (kN.m),العزم Mz (kN.m)\n';
    
    filtered.forEach(r => {
      csv += `"${r.nodeId}","${r.loadCase}",${r.fx.toFixed(3)},${r.fy.toFixed(3)},${r.fz.toFixed(3)},${r.mx.toFixed(3)},${r.my.toFixed(3)},${r.mz.toFixed(3)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `support_reactions_${selectedLoadCase}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4" id="supports-manager-module">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-card p-3 rounded-lg border border-border gap-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">نظـام المساند الهيكلية الموحد (Structural Support System)</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">تحديد الركائز ككيانات مستقلة، وتعيين حركات مقيدة ونوابض لجميع عقد المنشأ.</p>
        </div>
        <div className="flex items-center gap-1.5 self-stretch sm:self-auto shrink-0">
          <Button
            size="sm"
            variant={activeTab === 'definitions' ? 'default' : 'outline'}
            className="text-xs h-8 flex-1 sm:flex-none"
            onClick={() => setActiveTab('definitions')}
          >
            📋 أنواع المساند
          </Button>
          <Button
            size="sm"
            variant={activeTab === 'assignments' ? 'default' : 'outline'}
            className="text-xs h-8 flex-1 sm:flex-none"
            onClick={() => setActiveTab('assignments')}
          >
            📍 تعيين العقد
          </Button>
          <Button
            size="sm"
            variant={activeTab === 'reactions' ? 'default' : 'outline'}
            className="text-xs h-8 flex-1 sm:flex-none"
            disabled={!analyzed}
            onClick={() => setActiveTab('reactions')}
          >
            ⚡ ردود الأفعال
          </Button>
        </div>
      </div>

      {/* DEFINITIONS TAB */}
      {activeTab === 'definitions' && (
        <Card>
          <CardHeader className="pb-3 flex-row justify-between items-center space-y-0">
            <div>
              <CardTitle className="text-xs">مستودع أنواع المساند (Support Library)</CardTitle>
              <CardDescription className="text-[10px]">قائمة المساند المسجلة بالمشروع بدرجات حريتها.</CardDescription>
            </div>
            <Button size="sm" onClick={handleOpenCreateDefinition} className="text-xs h-8 gap-1">
              <Plus size={13} /> إضافة مسند مخصص
            </Button>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-right text-[11px] font-bold w-[20%]">اسم المسند</TableHead>
                  <TableHead className="text-right text-[11px] font-bold w-[12%]">النوع</TableHead>
                  <TableHead className="text-right text-[11px] font-bold w-[30%]">درجات الحرية المقيدة (UX/UY/UZ - RX/RY/RZ)</TableHead>
                  <TableHead className="text-right text-[11px] font-bold w-[20%]">النوابض المرنة (Springs)</TableHead>
                  <TableHead className="text-left text-[11px] font-bold w-[18%]">خيارات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supportDb.supports.map(sup => {
                  const rest = supportDb.restraints[sup.id] || { ux: false, uy: false, uz: false, rx: false, ry: false, rz: false };
                  const spr = supportDb.springs[sup.id] || { kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 };
                  const isSystemDefault = sup.id === 'sup_fixed' || sup.id === 'sup_pinned' || sup.id.startsWith('sup_roller');

                  const hasSprings = spr.kx > 0 || spr.ky > 0 || spr.kz > 0 || spr.krx > 0 || spr.kry > 0 || spr.krz > 0;

                  return (
                    <TableRow key={sup.id} className="hover:bg-muted/20">
                      <TableCell className="font-medium text-xs">
                        <div className="flex flex-col">
                          <span className="font-bold">{sup.name}</span>
                          <span className="text-[10px] text-muted-foreground mt-0.5">{sup.description || 'لا يوجد وصف'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-[10px] h-5">{sup.type}</Badge>
                      </TableCell>
                      <TableCell className="text-[11px] font-mono">
                        <div className="flex gap-1.5 flex-wrap">
                          {['ux', 'uy', 'uz', 'rx', 'ry', 'rz'].map(dof => {
                            const isRestrained = rest[dof as keyof typeof rest] === true;
                            return (
                              <Badge
                                key={dof}
                                variant={isRestrained ? 'default' : 'secondary'}
                                className={`text-[9px] px-1.5 h-4 font-mono font-bold ${
                                  isRestrained ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {dof.toUpperCase()}
                              </Badge>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell className="text-[11px]">
                        {hasSprings ? (
                          <div className="space-y-0.5 font-mono text-[9px] text-amber-600 dark:text-amber-400">
                            {spr.kx > 0 && <div>Kx: {spr.kx} kN/m</div>}
                            {spr.ky > 0 && <div>Ky: {spr.ky} kN/m</div>}
                            {spr.kz > 0 && <div>Kz: {spr.kz} kN/m</div>}
                            {spr.krx > 0 && <div>Krx: {spr.krx} kN.m/rad</div>}
                            {spr.kry > 0 && <div>Kry: {spr.kry} kN.m/rad</div>}
                            {spr.krz > 0 && <div>Krz: {spr.krz} kN.m/rad</div>}
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">جساءة لا نهائية صلبة</span>
                        )}
                      </TableCell>
                      <TableCell className="text-left">
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="تعديل"
                            className="h-7 w-7 rounded border border-border"
                            onClick={() => handleOpenEditDefinition(sup)}
                          >
                            <Edit2 size={11} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="تكرار"
                            className="h-7 w-7 rounded border border-border"
                            onClick={() => handleDuplicateDefinition(sup)}
                          >
                            <Copy size={11} />
                          </Button>
                          {!isSystemDefault && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="حذف"
                              className="h-7 w-7 rounded border border-red-500/30 text-red-500 hover:bg-red-50"
                              onClick={() => handleDeleteDefinition(sup.id)}
                            >
                              <Trash2 size={11} />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ASSIGNMENTS TAB */}
      {activeTab === 'assignments' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3 flex flex-col md:flex-row justify-between items-start md:items-center space-y-0 gap-3">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div>
                  <CardTitle className="text-xs font-bold">تعيين المساند للعقد الإنشائية (Node Support Assignment)</CardTitle>
                  <CardDescription className="text-[10px]">قم بتوزيع الركائز والمساند المناسبة على العقد المعرفة بموضعها وإحداثياتها.</CardDescription>
                </div>
                {/* Elevation Filter */}
                <div className="flex items-center gap-2 bg-muted/60 px-3 py-1.5 rounded-lg border border-border text-xs">
                  <span className="font-bold text-foreground">تصفية حسب المنسوب:</span>
                  <select
                    className="bg-transparent border-none p-0 focus:ring-0 text-xs font-bold text-primary outline-none cursor-pointer"
                    value={elevationFilter}
                    onChange={(e) => setElevationFilter(e.target.value)}
                  >
                    <option value="all">الكل (جميع المناسيب)</option>
                    {uniqueElevations.map(elev => {
                      const matchedStory = stories.find(s => Math.abs(s.elevation - elev * 1000) < 10);
                      const storyLabel = matchedStory ? matchedStory.label : (elev === 0 ? 'القواعد التأسيسية' : `منسوب ${elev.toFixed(2)} م`);
                      return (
                        <option key={elev} value={elev.toString()}>
                          {storyLabel} | {elev.toFixed(2)} م ({(elev * 1000).toFixed(0)} مم)
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 self-stretch md:self-auto shrink-0">
                <Button size="sm" variant="outline" className="text-[10px] h-7 px-2.5" onClick={() => handleBatchAssign('all_base_fixed')}>
                  🔒 تأسيس وثاقة للجميع (Fixed Base)
                </Button>
                <Button size="sm" variant="outline" className="text-[10px] h-7 px-2.5" onClick={() => handleBatchAssign('all_base_pinned')}>
                  📌 تأسيس مفصلي للجميع (Pinned Base)
                </Button>
                <Button size="sm" variant="outline" className="text-[10px] h-7 px-2.5 text-red-500 border-red-500/20 hover:bg-red-50" onClick={() => handleBatchAssign('clear_all')}>
                  🗑️ مسح الكل (Unassign)
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto max-h-[500px]">
              <Table>
                <TableHeader className="bg-muted/40 sticky top-0 z-10">
                  <TableRow>
                     <TableHead className="text-right text-[11px] font-bold w-[45%]">موقع العقدة وتسميتها (Node Name & Coordinates)</TableHead>
                    <TableHead className="text-right text-[11px] font-bold w-[13%]">المنسوب (Z)</TableHead>
                    <TableHead className="text-right text-[11px] font-bold w-[12%]">النوع</TableHead>
                    <TableHead className="text-right text-[11px] font-bold w-[20%]">المسند المعين (Assigned Support)</TableHead>
                    <TableHead className="text-left text-[11px] font-bold w-[10%]">حالة التقييد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredNodesPool.map(node => {
                    const assigned = supportDb.assignments.find(a => a.nodeId === node.id);
                    const supportId = assigned ? assigned.supportId : 'none';
                    const activeSupport = supportId !== 'none' ? supportDb.supports.find(s => s.id === supportId) : null;

                    return (
                      <TableRow key={node.id} className="hover:bg-muted/20">
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-bold font-mono text-[11px] border-primary/30 text-primary py-0.5 px-2 bg-primary/5">
                              {node.name}
                            </Badge>
                            <div className="flex flex-col">
                              <span className="font-bold text-foreground">
                                الإحداثيات: (X= {node.x.toFixed(2)} م, Y= {node.y.toFixed(2)} م)
                              </span>
                              <span className="text-[10px] text-muted-foreground mt-0.5 font-sans">
                                {node.label}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono font-bold text-muted-foreground">
                          {node.z.toFixed(2)} م ({(node.z * 1000).toFixed(0)} مم)
                        </TableCell>
                        <TableCell className="text-xs">
                          {node.isBase ? (
                            <Badge className="bg-emerald-500/20 text-emerald-600 border border-emerald-450/40 text-[9px] font-bold">قاعدة (Base)</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[9px]">عقدة علوية</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <select
                            className="h-8 rounded border border-input bg-background px-2 text-[11px] w-full"
                            value={supportId}
                            onChange={(e) => handleAssignSupport(node.id, e.target.value)}
                          >
                            <option value="none">حر (أو مستند مرونة الأعمدة) - Free</option>
                            {supportDb.supports.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell className="text-left text-xs font-mono font-bold">
                          {activeSupport ? (
                            <Badge className="bg-primary text-primary-foreground text-[9px]">{activeSupport.type}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">مرن بدون كشف</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <div className="border border-amber-450 bg-amber-50 dark:bg-amber-950/20 text-[11px] p-3 rounded-lg flex items-center gap-2 text-amber-800 dark:text-amber-400 font-medium">
            <ShieldAlert size={14} className="shrink-0" />
            <span>⚠️ تنبيه: تعيين المساند يؤثر مباشرة على جساءة النظام وحساب مصفوفات الصلابة العالمية. انقر فوق زر <strong>تشغيل التحليل</strong> في تبويب التحليل الرئيسي لتنعكس هذه التعيينات على المخططات الهندسية للأحمال وردود الأفعال.</span>
          </div>
        </div>
      )}

      {/* REACTIONS TAB */}
      {activeTab === 'reactions' && (
        <Card>
          <CardHeader className="pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-0 gap-3">
            <div>
              <CardTitle className="text-xs font-bold">ردود أفعال المساند ومراقبة الاستقرار (Support Reaction Engine)</CardTitle>
              <CardDescription className="text-[10px]">استخلاص كافة القوى الشاقولية والجانبية وعزوم الدوران الناتجة من رد فعل الركائز.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto shrink-0">
              <select
                className="h-8 rounded border border-input bg-background px-2 text-xs text-foreground font-semibold"
                value={selectedLoadCase}
                onChange={(e) => setSelectedLoadCase(e.target.value)}
              >
                <option value="all">كل حالات التحميل المتاحة (All Cases)</option>
                {loadCases.map(lc => (
                  <option key={lc} value={lc}>{lc}</option>
                ))}
              </select>
              <Button size="sm" variant="outline" className="text-xs h-8 gap-1" onClick={handleExportReactions}>
                <Download size={13} /> تصدير CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto max-h-[500px]">
            {supportDb.reactions && supportDb.reactions.length > 0 ? (
              <Table>
                <TableHeader className="bg-muted/40 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="text-right text-[11px] font-bold">تسمية العقدة (Node Name)</TableHead>
                    <TableHead className="text-right text-[11px] font-bold">حالة التحميل</TableHead>
                    <TableHead className="text-right text-[11px] font-bold text-blue-600 dark:text-blue-450">القوة Fz (Vertical) (kN)</TableHead>
                    <TableHead className="text-right text-[11px] font-bold">القوة الأفقية Fx (kN)</TableHead>
                    <TableHead className="text-right text-[11px] font-bold">القوة الأفقية Fy (kN)</TableHead>
                    <TableHead className="text-right text-[11px] font-bold">العزم Mx (kN.m)</TableHead>
                    <TableHead className="text-right text-[11px] font-bold">العزم My (kN.m)</TableHead>
                    <TableHead className="text-right text-[11px] font-bold">العزم Mz (Torsion) (kN.m)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supportDb.reactions
                    .filter(r => selectedLoadCase === 'all' || r.loadCase === selectedLoadCase)
                    .map((r, idx) => {
                      const matchedNode = nodesPool.find(n => n.id === r.nodeId);
                      const nodeLabel = matchedNode 
                        ? `${matchedNode.name} (X=${matchedNode.x.toFixed(2)}م, Y=${matchedNode.y.toFixed(2)}م, Z=${matchedNode.z.toFixed(2)}م)`
                        : r.nodeId;
                      return (
                        <TableRow key={`${r.nodeId}-${r.loadCase}-${idx}`} className="hover:bg-muted/20 font-mono text-[11px]">
                          <TableCell className="font-bold text-right text-xs font-sans flex items-center gap-1.5 py-2.5">
                            {matchedNode && (
                              <Badge variant="outline" className="px-1.5 text-[10px] font-bold font-mono">
                                {matchedNode.name}
                              </Badge>
                            )}
                            <span className="text-muted-foreground text-[10px]">{nodeLabel}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary" className="text-[9px] font-bold font-sans">
                              {r.loadCase}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-bold text-blue-600 dark:text-blue-400 font-mono text-xs">
                            {r.fz.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">{r.fx.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{r.fy.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{r.mx.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{r.my.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{r.mz.toFixed(2)}</TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            ) : (
              <div className="py-12 text-center text-muted-foreground text-xs font-medium bg-muted/10">
                ⚠️ لا توجد ردود أفعال متاحة. يرجى تفعيل وتشغيل التحليل لحساب وتوليد ردود أفعال المساند.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* DEFINITION CREATE/EDIT DIALOG */}
      <Dialog open={definitionDialog.open} onOpenChange={open => setDefinitionDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-md bg-card border border-border" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-right">
              {definitionDialog.isEdit ? 'تعديل خصائص المسند' : 'إضافة نوع مسند جديد'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-right">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold">اسم المسند (Support Name)</label>
              <Input
                value={definitionDialog.name}
                onChange={e => setDefinitionDialog(prev => ({ ...prev, name: e.target.value }))}
                className="text-xs h-8"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold">النوع (Type)</label>
                <select
                  value={definitionDialog.type}
                  onChange={e => {
                    const type = e.target.value as SupportEntity['type'];
                    // Automatically preset default restraints
                    let restraints = { ux: true, uy: true, uz: true, rx: false, ry: false, rz: false };
                    if (type === 'Fixed') {
                      restraints = { ux: true, uy: true, uz: true, rx: true, ry: true, rz: true };
                    } else if (type === 'Roller-Z') {
                      restraints = { ux: false, uy: false, uz: true, rx: false, ry: false, rz: false };
                    } else if (type === 'Roller-X') {
                      restraints = { ux: true, uy: false, uz: false, rx: false, ry: false, rz: false };
                    } else if (type === 'Roller-Y') {
                      restraints = { ux: false, uy: true, uz: false, rx: false, ry: false, rz: false };
                    }
                    setDefinitionDialog(prev => ({ ...prev, type, restraints }));
                  }}
                  className="h-8 rounded border border-input bg-background px-2 text-xs w-full"
                >
                  <option value="Fixed">ثابت (Fixed)</option>
                  <option value="Pinned">مفصلي (Pinned)</option>
                  <option value="Roller-Z">رولر رأسي (Roller-Z)</option>
                  <option value="Roller-X">رولر أفقي X (Roller-X)</option>
                  <option value="Roller-Y">رولر أفقي Y (Roller-Y)</option>
                  <option value="Spring">نابض شاقولي (Spring Support)</option>
                  <option value="Custom">مخصص (Custom)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold">وصف توضيحي</label>
                <Input
                  value={definitionDialog.description}
                  onChange={e => setDefinitionDialog(prev => ({ ...prev, description: e.target.value }))}
                  className="text-xs h-8"
                  placeholder="الوصف أو الغرض الإنشائي"
                />
              </div>
            </div>

            {/* Restraints configuration */}
            <div className="space-y-1.5 border border-border bg-muted/10 p-3 rounded-lg">
              <h3 className="text-[11px] font-bold text-foreground">تقييد درجات الحرية (Boundary Restraints)</h3>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {(['ux', 'uy', 'uz', 'rx', 'ry', 'rz'] as const).map(dof => (
                  <div key={dof} className="flex items-center gap-1.5 min-h-[36px]">
                    <Checkbox
                      id={`dlg-${dof}`}
                      checked={definitionDialog.restraints[dof]}
                      onCheckedChange={(checked) => {
                        setDefinitionDialog(prev => ({
                          ...prev,
                          restraints: { ...prev.restraints, [dof]: !!checked }
                        }));
                      }}
                    />
                    <label htmlFor={`dlg-${dof}`} className="text-xs cursor-pointer font-bold font-mono">
                      {dof.toUpperCase()}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Elastic Springs configuration */}
            <div className="space-y-1.5 border border-border bg-muted/10 p-3 rounded-lg">
              <h3 className="text-[11px] font-bold text-foreground">الثوابت المرنة والنوابض (Elastic Springs Stiffness)</h3>
              <div className="grid grid-cols-3 gap-2 mt-2 text-right">
                {(['kx', 'ky', 'kz'] as const).map(sk => (
                  <div key={sk} className="space-y-1">
                    <label className="text-[10px] font-semibold font-mono">{sk.toUpperCase()} (kN/m)</label>
                    <Input
                      type="number"
                      disabled={definitionDialog.restraints[sk.replace('k', 'u') as 'ux' | 'uy' | 'uz']}
                      value={definitionDialog.springs[sk]}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setDefinitionDialog(prev => ({
                          ...prev,
                          springs: { ...prev.springs, [sk]: val }
                        }));
                      }}
                      className="text-xs h-7 font-mono p-1"
                    />
                  </div>
                ))}
                {(['krx', 'kry', 'krz'] as const).map(sr => (
                  <div key={sr} className="space-y-1">
                    <label className="text-[10px] font-semibold font-mono">{sr.toUpperCase()} (kN.m/rad)</label>
                    <Input
                      type="number"
                      disabled={definitionDialog.restraints[sr.replace('k', 'r') as 'rx' | 'ry' | 'rz']}
                      value={definitionDialog.springs[sr]}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setDefinitionDialog(prev => ({
                          ...prev,
                          springs: { ...prev.springs, [sr]: val }
                        }));
                      }}
                      className="text-xs h-7 font-mono p-1"
                    />
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-muted-foreground mt-1">
                * ملاحظة: يتم تفعيل قيمة الثابت المرن (Spring) فقط إذا كانت درجة الحرية المقابلة له مفتوحة (غير مشدودة).
              </p>
            </div>
          </div>
          <DialogFooter className="gap-1 flex justify-start pl-2">
            <Button size="sm" onClick={handleSaveDefinition} className="text-xs">
              💾 حفظ البيانات
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDefinitionDialog(prev => ({ ...prev, open: false }))} className="text-xs">
              إلغاء الأمر
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
