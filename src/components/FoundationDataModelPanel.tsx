import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Database, Layers, Plus, Trash2, Edit2, Play, AlertTriangle, CheckCircle,
  HelpCircle, Sparkles, Sliders, ArrowLeftRight, UserCheck, HardHat, RefreshCw, FileSpreadsheet
} from 'lucide-react';
import {
  FoundationDatabase,
  GetFoundationByID,
  GetFoundationLoads,
  ValidateFoundationDatabase,
  autoGenerateFoundations
} from '@/structural/foundation/foundationEngine';
import {
  Foundation,
  FoundationType,
  FoundationGeometry,
  FoundationAssignment,
  SoilAssignment,
  FoundationGroup
} from '@/structural/foundation/foundationTypes';
import type { Column } from '@/lib/structuralEngine';
import type { SupportDatabase } from '@/lib/structuralSupportSystem';

interface FoundationDataModelPanelProps {
  columns: Column[];
  colLoads3D?: Map<string, any>;
  etabsReactions?: any[];
  foundationDb: FoundationDatabase;
  onFoundationDbChange: (db: FoundationDatabase) => void;
  supportDb?: SupportDatabase;
}

type TableTab = 'foundations' | 'geometries' | 'assignments' | 'levels' | 'soils' | 'groups' | 'validation' | 'etabs-mapping';

export default function FoundationDataModelPanel({
  columns = [],
  colLoads3D,
  etabsReactions = [],
  foundationDb: incomingFoundationDb,
  onFoundationDbChange,
  supportDb,
}: FoundationDataModelPanelProps) {
  const foundationDb = useMemo(() => {
    return {
      foundations: [],
      geometries: [],
      assignments: [],
      levels: [],
      soils: [],
      groups: [],
      ...incomingFoundationDb
    };
  }, [incomingFoundationDb]);

  const [activeTableTab, setActiveTableTab] = useState<TableTab>('foundations');

  // Dialog states for Add / Edit Foundations
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [editingFdn, setEditingFdn] = useState<Partial<Foundation> | null>(null);

  // Assignment interactive states
  const [targetColumnId, setTargetColumnId] = useState('');
  const [targetFoundationId, setTargetFoundationId] = useState('');

  // Geometry quick edit overrides
  const [geomWidth, setGeomWidth] = useState(1500);
  const [geomLength, setGeomLength] = useState(1500);
  const [geomThickness, setGeomThickness] = useState(400);

  // Group quick add
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');

  // Auto-run validation
  const validationIssues = useMemo(() => {
    return ValidateFoundationDatabase(foundationDb, columns);
  }, [foundationDb, columns]);

  // Bottom-most columns (concocted at support nodes or lower level)
  const bottomColumns = useMemo(() => {
    const active = columns.filter(c => !c.isRemoved);
    if (active.length === 0) return [];

    if (supportDb && supportDb.assignments && supportDb.assignments.length > 0) {
      const assignedNodeIds = new Set(supportDb.assignments.map(a => a.nodeId));
      const colsAtSupports = active.filter(col => {
        const key = `${col.x.toFixed(2)}_${col.y.toFixed(2)}_${col.zBottom ?? 0}`;
        return assignedNodeIds.has(key);
      });
      if (colsAtSupports.length > 0) {
        return colsAtSupports;
      }
    }

    const minZ = Math.min(...active.map(c => c.zBottom ?? 0));
    return active.filter(col => Math.abs((col.zBottom ?? 0) - minZ) < 50);
  }, [columns, supportDb]);

  const handleAutoSeed = () => {
    const defaultFc = 25;
    const defaultFy = 420;
    const defaultQall = 150;
    const generatedDb = autoGenerateFoundations(columns, defaultFc, defaultFy, defaultQall, supportDb);
    onFoundationDbChange(generatedDb);
    setActiveTableTab('foundations');
  };

  const handleClearDb = () => {
    if (window.confirm("هل أنت متأكد من رغبتك في إفراغ قاعدة بيانات التأسيس بالكامل؟")) {
      onFoundationDbChange({
        foundations: [],
        geometries: [],
        assignments: [],
        levels: [],
        soils: [],
        groups: []
      });
    }
  };

  // --- Foundation CRUD Operations ---
  const handleOpenAddDialog = () => {
    setEditingFdn({
      id: `FDN_CUSTOM_${Math.floor(Math.random() * 1000)}`,
      name: `F_Custom`,
      type: FoundationType.Isolated,
      materialFc: 25,
      materialFy: 420
    });
    setIsAddEditOpen(true);
  };

  const handleOpenEditDialog = (fdn: Foundation) => {
    setEditingFdn(fdn);
    setIsAddEditOpen(true);
  };

  const handleSaveFoundation = () => {
    if (!editingFdn || !editingFdn.id || !editingFdn.name) return;

    const exists = foundationDb.foundations.some(f => f.id === editingFdn.id);
    let updatedFoundations = [...foundationDb.foundations];

    if (exists) {
      updatedFoundations = updatedFoundations.map(f => f.id === editingFdn.id ? (editingFdn as Foundation) : f);
    } else {
      updatedFoundations.push(editingFdn as Foundation);
    }

    // Ensure they have default geometry
    let updatedGeometries = [...foundationDb.geometries];
    if (!updatedGeometries.some(g => g.foundationId === editingFdn.id)) {
      updatedGeometries.push({
        foundationId: editingFdn.id!,
        shape: "rectangular",
        width: 1800,
        length: 1800,
        thickness: 500,
        offsetX: 0,
        offsetY: 0,
        elevation: bottomColumns[0]?.zBottom ?? 0
      });
    }

    // Ensure they have default soil params
    let updatedSoils = [...foundationDb.soils];
    if (!updatedSoils.some(s => s.foundationId === editingFdn.id)) {
      updatedSoils.push({
        foundationId: editingFdn.id!,
        qall: 150,
        modulusSubgrade: 18000,
        settlementLimit: 25
      });
    }

    onFoundationDbChange({
      ...foundationDb,
      foundations: updatedFoundations,
      geometries: updatedGeometries,
      soils: updatedSoils
    });

    setIsAddEditOpen(false);
    setEditingFdn(null);
  };

  const handleDeleteFoundation = (id: string) => {
    onFoundationDbChange({
      ...foundationDb,
      foundations: foundationDb.foundations.filter(f => f.id !== id),
      geometries: foundationDb.geometries.filter(g => g.foundationId !== id),
      assignments: foundationDb.assignments.filter(a => a.foundationId !== id),
      soils: foundationDb.soils.filter(s => s.foundationId !== id)
    });
  };

  // --- Assignment Handler ---
  const handleAddAssignment = () => {
    if (!targetColumnId || !targetFoundationId) return;

    // Remove any previous assignments for this column first (one footing per column constraint)
    const filteredAssignments = foundationDb.assignments.filter(a => a.supportedId !== targetColumnId);

    const newAssign: FoundationAssignment = {
      id: `ASGN_${targetColumnId}_${Math.floor(Math.random()*1000)}`,
      foundationId: targetFoundationId,
      supportedId: targetColumnId,
      supportedType: "column"
    };

    onFoundationDbChange({
      ...foundationDb,
      assignments: [...filteredAssignments, newAssign]
    });

    setTargetColumnId('');
  };

  const handleRemoveAssignment = (id: string) => {
    onFoundationDbChange({
      ...foundationDb,
      assignments: foundationDb.assignments.filter(a => a.id !== id)
    });
  };

  // --- Geometry Updater ---
  const handleUpdateGeometry = (foundationId: string, field: keyof FoundationGeometry, value: any) => {
    const updatedGeometries = foundationDb.geometries.map(geom => {
      if (geom.foundationId === foundationId) {
        return { ...geom, [field]: value };
      }
      return geom;
    });

    onFoundationDbChange({
      ...foundationDb,
      geometries: updatedGeometries
    });
  };

  // --- Soil Properties Updater ---
  const handleUpdateSoil = (foundationId: string, field: keyof SoilAssignment, value: any) => {
    const updatedSoils = foundationDb.soils.map(soil => {
      if (soil.foundationId === foundationId) {
        return { ...soil, [field]: value };
      }
      return soil;
    });

    onFoundationDbChange({
      ...foundationDb,
      soils: updatedSoils
    });
  };

  // --- Group Handler ---
  const handleAddGroup = () => {
    if (!newGroupName) return;
    const newGroup: FoundationGroup = {
      id: `GRP_${Date.now()}`,
      name: newGroupName,
      description: newGroupDesc
    };
    onFoundationDbChange({
      ...foundationDb,
      groups: [...foundationDb.groups, newGroup]
    });
    setNewGroupName('');
    setNewGroupDesc('');
  };

  const handleDeleteGroup = (id: string) => {
    onFoundationDbChange({
      ...foundationDb,
      groups: foundationDb.groups.filter(g => g.id !== id),
      // Set foundations in this group back to undefined group
      foundations: foundationDb.foundations.map(f => f.groupId === id ? { ...f, groupId: undefined } : f)
    });
  };

  // Quick fix validation issues
  const handleQuickFixIssue = (issue: typeof validationIssues[0]) => {
    if (issue.type === "col_without_foundation") {
      const colId = issue.objectId;
      // Auto-create individual footing
      const fdnId = `FDN_${colId}`;
      const newFdn: Foundation = {
        id: fdnId,
        name: `F_${colId}`,
        type: FoundationType.Isolated,
        materialFc: 25,
        materialFy: 420,
        description: `قاعدة تم تعيينها تلقائياً لإرساء معضل معلق`
      };
      const newGeom: FoundationGeometry = {
        foundationId: fdnId,
        shape: "square",
        width: 1500,
        length: 1500,
        thickness: 400,
        offsetX: 0,
        offsetY: 0,
        elevation: bottomColumns.find(c => c.id === colId)?.zBottom ?? 0
      };
      const newAssign: FoundationAssignment = {
        id: `ASGN_${colId}_${Date.now()}`,
        foundationId: fdnId,
        supportedId: colId,
        supportedType: "column"
      };
      const newSoil: SoilAssignment = {
        foundationId: fdnId,
        qall: 150,
        modulusSubgrade: 18000,
        settlementLimit: 25
      };

      onFoundationDbChange({
        ...foundationDb,
        foundations: [...foundationDb.foundations, newFdn],
        geometries: [...foundationDb.geometries, newGeom],
        assignments: [...foundationDb.assignments, newAssign],
        soils: [...foundationDb.soils, newSoil]
      });
    } else if (issue.type === "missing_geometry") {
      const fdnId = issue.objectId;
      const newGeom: FoundationGeometry = {
        foundationId: fdnId,
        shape: "square",
        width: 1500,
        length: 1500,
        thickness: 400,
        offsetX: 0,
        offsetY: 0,
        elevation: 0
      };
      onFoundationDbChange({
        ...foundationDb,
        geometries: [...foundationDb.geometries, newGeom]
      });
    } else if (issue.type === "missing_soil") {
      const fdnId = issue.objectId;
      const newSoil: SoilAssignment = {
        foundationId: fdnId,
        qall: 150,
        modulusSubgrade: 18000,
        settlementLimit: 25
      };
      onFoundationDbChange({
        ...foundationDb,
        soils: [...foundationDb.soils, newSoil]
      });
    } else if (issue.type === "foundation_without_supported") {
      // Prompt user to link
      setActiveTableTab('assignments');
      setTargetFoundationId(issue.objectId);
    }
  };

  const activeTabLabels: Record<TableTab, string> = {
    foundations: 'جدول القواعد (Foundations)',
    geometries: 'الصفات الهندسية (Geometry)',
    assignments: 'تعيين الأعمدة (Assignments)',
    levels: 'مناسيب التأسيس (Levels)',
    soils: 'ميكانيكا التربة (Soil & Subgrade)',
    groups: 'مجموعات العناصر (Groups)',
    validation: 'التحقق والمطابقة (Validation)',
    'etabs-mapping': 'مطابقة ETABS (ETABS Mapping)'
  };

  return (
    <div className="space-y-6" id="foundation-modeler-workspace">
      
      {/* ── Visual Banner ── */}
      <div className="bg-gradient-to-r from-slate-100 to-indigo-50 border border-indigo-100 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
              <Database className="h-3 w-3" />
              Source of Truth (محرك الجداول الهيكلية)
            </span>
            <h1 className="text-lg font-bold text-slate-900">محرك العلاقات الهيكلية وبيانات القواعد</h1>
            <p className="text-xs text-slate-600 max-w-3xl leading-relaxed">
              تدار القواعد في هذا الموديل ككائنات صريحة مخزنة في جداول قاعدة بيانات مركزية ولا تُستنتج عشوائياً. تقرأ وحدات التصميم، التحليل، الرسوم التفصيلية، وحساب الكميات قيمها مباشرة من هذه المخططات المعرفة أدناه.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearDb}
              disabled={foundationDb.foundations.length === 0}
              className="text-red-600 border-red-200 hover:bg-red-50 text-xs"
            >
              <Trash2 className="h-3.5 w-3.5 ml-1" />
              تصفير الجداول
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleAutoSeed}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs shadow"
            >
              <Sparkles className="h-3.5 w-3.5 ml-1 animate-pulse" />
              توليد القواعد التلقائي
            </Button>
          </div>
        </div>
      </div>

      {foundationDb.foundations.length === 0 ? (
        <Card className="text-center py-16 border-dashed border-2 border-slate-200">
          <CardContent className="space-y-4 max-w-sm mx-auto">
            <div className="p-4 bg-indigo-50 rounded-full w-fit mx-auto text-indigo-600">
              <Database className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-slate-800">جداول التأسيس فارغة حالياً</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                لم يتم إيجاد كائنات تأسيس مسجلة. اضغط على الزر أدناه لتأسيس تلقائي فوري لأعمدة المشروع النشطة وإسناد الخواص الهندسية والجيوتقنية.
              </p>
            </div>
            <Button onClick={handleAutoSeed} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs w-full">
              تأسيس تلقائي لكافة أعمدة القبو ✓
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          
          {/* Left: Tab Selectors & Diagnostics */}
          <div className="xl:col-span-1 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-slate-800">بيانات التأسيس (Tables)</CardTitle>
                <CardDescription className="text-[10px]">تصفح وتلقيم المدخلات الهيكلية لقواعد المبنى</CardDescription>
              </CardHeader>
              <CardContent className="p-2 space-y-1">
                {(Object.keys(activeTabLabels) as TableTab[]).map((tabKey) => {
                  const isActive = activeTableTab === tabKey;
                  let count = 0;
                  let badgeColor = "bg-slate-100 text-slate-700";

                  if (tabKey === 'foundations') {
                    count = foundationDb.foundations.length;
                    badgeColor = "bg-blue-100 text-blue-700";
                  } else if (tabKey === 'assignments') {
                    count = foundationDb.assignments.length;
                    badgeColor = "bg-green-100 text-green-700";
                  } else if (tabKey === 'validation') {
                    count = validationIssues.length;
                    badgeColor = count > 0 ? "bg-red-100 text-red-700 animate-pulse" : "bg-emerald-100 text-emerald-700";
                  } else if (tabKey === 'groups') {
                    count = foundationDb.groups.length;
                    badgeColor = "bg-amber-100 text-amber-700";
                  } else if (tabKey === 'etabs-mapping') {
                    count = etabsReactions.length;
                    badgeColor = "bg-purple-100 text-purple-700";
                  }

                  return (
                    <button
                      key={tabKey}
                      onClick={() => setActiveTableTab(tabKey)}
                      className={`w-full flex items-center justify-between text-right px-3 py-2 rounded-lg text-xs transition-all ${
                        isActive
                          ? 'bg-slate-900 text-white font-bold'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                      }`}
                    >
                      <span>{activeTabLabels[tabKey]}</span>
                      {count > 0 && (
                        <Badge className={`${badgeColor} border-0 text-[10px] scale-90 px-1.5 h-4 flex items-center justify-center font-mono`}>
                          {tabKey === 'validation' && count === 0 ? "سليم" : count}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            {/* Quick Metrics */}
            <Card className="bg-slate-950 text-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-slate-400">إحصاءات هيكلية فورية</CardTitle>
              </CardHeader>
              <CardContent className="py-2 text-[11px] space-y-1.5 font-mono">
                <div className="flex justify-between border-b border-slate-800 pb-1">
                  <span className="text-slate-500">مجموع القواعد (Foundations)</span>
                  <span className="font-bold text-blue-400">{foundationDb.foundations.length}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-1">
                  <span className="text-slate-500">أعمدة مأهولة (Supported Cols)</span>
                  <span className="font-bold text-green-400">{foundationDb.assignments.filter(a => a.supportedType === 'column').length} / {bottomColumns.length}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-1">
                  <span className="text-slate-500">متوسط الأبعاد المقدرة (Average B)</span>
                  <span className="font-bold text-amber-400">
                    {(foundationDb.geometries.reduce((sum, g) => sum + g.width, 0) / (foundationDb.geometries.length || 1)).toFixed(0)} مم
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">حجم بيتون الأساسات المقدر</span>
                  <span className="font-bold text-emerald-400">
                    {(foundationDb.geometries.reduce((sum, g) => sum + (g.width * g.length * g.thickness) / 1e9, 0)).toFixed(1)} م³
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right: Central Workspace for Active Tab */}
          <div className="xl:col-span-4 space-y-4">
            
            {/* TAB: FOUNDATIONS */}
            {activeTableTab === 'foundations' && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <div>
                    <CardTitle className="text-sm font-bold">جدول تعريفات القواعد (Foundations Table)</CardTitle>
                    <CardDescription className="text-xs">جدول تصريح كائنات الأساس بأسماء مستقلة ونظام محدد</CardDescription>
                  </div>
                  <Button size="sm" onClick={handleOpenAddDialog} className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">
                    <Plus className="h-3.5 w-3.5 ml-1" />
                    إضافة قاعدة جديدة
                  </Button>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="text-xs">المعرّف الكودي (ID)</TableHead>
                        <TableHead className="text-xs">الاسم التعريفي (Name)</TableHead>
                        <TableHead className="text-xs">النوع (Type)</TableHead>
                        <TableHead className="text-xs">f'c (MPa)</TableHead>
                        <TableHead className="text-xs">fy (MPa)</TableHead>
                        <TableHead className="text-xs">مجموعة التأسيس (Group)</TableHead>
                        <TableHead className="text-xs text-left">التحكم</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {foundationDb.foundations.map((fdn) => {
                        const gp = foundationDb.groups.find(g => g.id === fdn.groupId);
                        return (
                          <TableRow key={fdn.id}>
                            <TableCell className="font-mono text-xs font-bold text-slate-800">{fdn.id}</TableCell>
                            <TableCell className="font-mono text-xs font-bold">{fdn.name}</TableCell>
                            <TableCell className="text-xs">
                              <Badge variant="outline" className="text-blue-700 border-blue-200 bg-blue-50">
                                {fdn.type === FoundationType.Isolated ? "منفردة Isolated" :
                                 fdn.type === FoundationType.Wall ? "شريطية Wall" :
                                 fdn.type === FoundationType.Raft ? "لبشة Raft" :
                                 fdn.type === FoundationType.Pile ? "خازوقية Pile" : fdn.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{fdn.materialFc} MPa</TableCell>
                            <TableCell className="font-mono text-xs">{fdn.materialFy} MPa</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{gp ? gp.name : "غير محدد"}</TableCell>
                            <TableCell className="text-left py-1">
                              <div className="flex justify-end gap-1.5">
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600" onClick={() => handleOpenEditDialog(fdn)}>
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => handleDeleteFoundation(fdn.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
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

            {/* TAB: GEOMETRIES */}
            {activeTableTab === 'geometries' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-bold">جدول الأبعاد الهندسية (Foundation Geometry Table)</CardTitle>
                  <CardDescription className="text-xs">جميع أبعاد القواعد وسماكاتها الهندسية مقروءة بالمليمتر (mm)</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="text-xs">القاعدة (Foundation)</TableHead>
                        <TableHead className="text-xs">الشكل (Shape)</TableHead>
                        <TableHead className="text-xs">العرض B (mm)</TableHead>
                        <TableHead className="text-xs">الطول L (mm)</TableHead>
                        <TableHead className="text-xs font-bold text-red-700">السماكة H (mm)</TableHead>
                        <TableHead className="text-xs">سهم الانزياح X (mm)</TableHead>
                        <TableHead className="text-xs">سهم الانزياح Y (mm)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {foundationDb.geometries.map((geom) => {
                        const fdnName = GetFoundationByID(foundationDb, geom.foundationId)?.name || geom.foundationId;
                        return (
                          <TableRow key={geom.foundationId}>
                            <TableCell className="font-bold text-xs">{fdnName}</TableCell>
                            <TableCell className="text-xs">
                              <select
                                value={geom.shape}
                                onChange={(e) => handleUpdateGeometry(geom.foundationId, 'shape', e.target.value)}
                                className="h-7 rounded border border-input text-[11px] bg-background px-1"
                              >
                                <option value="rectangular">مستطيل Rectangular</option>
                                <option value="square">مربع Square</option>
                                <option value="circle">دائري Circular</option>
                              </select>
                            </TableCell>
                            <TableCell className="p-2">
                              <Input
                                type="number"
                                value={geom.width}
                                onChange={(e) => handleUpdateGeometry(geom.foundationId, 'width', parseFloat(e.target.value) || 0)}
                                className="h-7 w-20 font-mono text-xs text-center"
                              />
                            </TableCell>
                            <TableCell className="p-2">
                              <Input
                                type="number"
                                value={geom.length}
                                onChange={(e) => handleUpdateGeometry(geom.foundationId, 'length', parseFloat(e.target.value) || 0)}
                                className="h-7 w-20 font-mono text-xs text-center"
                              />
                            </TableCell>
                            <TableCell className="p-2">
                              <Input
                                type="number"
                                value={geom.thickness}
                                onChange={(e) => handleUpdateGeometry(geom.foundationId, 'thickness', parseFloat(e.target.value) || 0)}
                                className="h-7 w-20 font-mono text-xs text-center font-bold text-red-700 bg-red-50/50"
                              />
                            </TableCell>
                            <TableCell className="p-2">
                              <Input
                                type="number"
                                value={geom.offsetX}
                                onChange={(e) => handleUpdateGeometry(geom.foundationId, 'offsetX', parseFloat(e.target.value) || 0)}
                                className="h-7 w-16 font-mono text-xs text-center"
                              />
                            </TableCell>
                            <TableCell className="p-2">
                              <Input
                                type="number"
                                value={geom.offsetY}
                                onChange={(e) => handleUpdateGeometry(geom.foundationId, 'offsetY', parseFloat(e.target.value) || 0)}
                                className="h-7 w-16 font-mono text-xs text-center"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* TAB: ASSIGNMENTS */}
            {activeTableTab === 'assignments' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-bold">جدول روابط التعيين (Foundation Assignment Table)</CardTitle>
                  <CardDescription className="text-xs">ربط الأعمدة الحقيقية بالأساس الصريح المعرف في جدول القواعد</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  
                  {/* Action row to assign */}
                  <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/20 border border-border rounded-lg">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-700">اختر العمود / الجدار المستهدف:</label>
                      <select
                        value={targetColumnId}
                        onChange={(e) => setTargetColumnId(e.target.value)}
                        className="w-48 h-8 rounded border border-input text-xs bg-background px-2"
                      >
                        <option value="">-- اختر من القائمة --</option>
                        {bottomColumns.map(col => {
                          const hasAssign = foundationDb.assignments.some(a => a.supportedId === col.id);
                          return (
                            <option key={col.id} value={col.id}>
                              {col.id} {hasAssign ? '✓ (مرتبط حراً)' : '✗ (معلق بلا إسناد)'}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-700">اختر القاعدة المراد ربطه بها:</label>
                      <select
                        value={targetFoundationId}
                        onChange={(e) => setTargetFoundationId(e.target.value)}
                        className="w-48 h-8 rounded border border-input text-xs bg-background px-2"
                      >
                        <option value="">-- اختر من الجداول --</option>
                        {foundationDb.foundations.map(fdn => (
                          <option key={fdn.id} value={fdn.id}>
                            {fdn.name} [{fdn.id}]
                          </option>
                        ))}
                      </select>
                    </div>

                    <Button size="sm" onClick={handleAddAssignment} disabled={!targetColumnId || !targetFoundationId} className="bg-green-600 hover:bg-green-700 text-white text-xs h-8">
                      إسناد القاعدة للعمود ✓
                    </Button>
                  </div>

                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="text-xs">كود التعيين (Assign ID)</TableHead>
                        <TableHead className="text-xs">العمود المستهدف (Column ID)</TableHead>
                        <TableHead className="text-xs text-blue-700">القاعدة المربوطة (Assigned Footing)</TableHead>
                        <TableHead className="text-xs text-left">حذف</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {foundationDb.assignments.map((assign) => {
                        const fdn = GetFoundationByID(foundationDb, assign.foundationId);
                        return (
                          <TableRow key={assign.id}>
                            <TableCell className="font-mono text-xs text-muted-foreground">{assign.id}</TableCell>
                            <TableCell className="font-mono text-xs font-bold text-slate-900">{assign.supportedId}</TableCell>
                            <TableCell className="font-mono text-xs font-bold text-blue-700">{fdn ? `${fdn.name} (${fdn.id})` : assign.foundationId}</TableCell>
                            <TableCell className="text-left py-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => handleRemoveAssignment(assign.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* TAB: SOIL MECHANICAL SPECIFICATIONS */}
            {activeTableTab === 'soils' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-bold">جدول ميكانيكا التربة ومعامل التأسيس (Soil Assignment Table)</CardTitle>
                  <CardDescription className="text-xs">تطوير مواصفات قدرة التحمل القصوى والمسموحة لكل قاعدة على حدة</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="text-xs">القاعدة (Foundation)</TableHead>
                        <TableHead className="text-xs font-bold text-emerald-800">قوة تحمل التربة q_all (kN/m²)</TableHead>
                        <TableHead className="text-xs">معامل رد فعل التربة ks (kN/m³)</TableHead>
                        <TableHead className="text-xs">حد الهبوط الجيوتقني المسموح (mm)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {foundationDb.soils.map((soil) => {
                        const fdnName = GetFoundationByID(foundationDb, soil.foundationId)?.name || soil.foundationId;
                        return (
                          <TableRow key={soil.foundationId}>
                            <TableCell className="font-bold text-xs">{fdnName}</TableCell>
                            <TableCell className="p-2">
                              <Input
                                type="number"
                                value={soil.qall}
                                onChange={(e) => handleUpdateSoil(soil.foundationId, 'qall', parseFloat(e.target.value) || 0)}
                                className="h-7 w-28 font-mono text-xs text-center font-bold text-emerald-700 bg-emerald-50/50"
                              />
                            </TableCell>
                            <TableCell className="p-2">
                              <Input
                                type="number"
                                value={soil.modulusSubgrade || 18000}
                                onChange={(e) => handleUpdateSoil(soil.foundationId, 'modulusSubgrade', parseFloat(e.target.value) || 0)}
                                className="h-7 w-28 font-mono text-xs text-center"
                              />
                            </TableCell>
                            <TableCell className="p-2">
                              <Input
                                type="number"
                                value={soil.settlementLimit || 25}
                                onChange={(e) => handleUpdateSoil(soil.foundationId, 'settlementLimit', parseFloat(e.target.value) || 0)}
                                className="h-7 w-24 font-mono text-xs text-center"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* TAB: LEVELS */}
            {activeTableTab === 'levels' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-bold">جدول مناسيب التأسيس (Foundation Levels Table)</CardTitle>
                  <CardDescription className="text-xs">مستويات صب بيتون النظافة والتأسيس بالمشروع مقاسة من الصفر الإنشائي</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="text-xs">كود المنسوب</TableHead>
                        <TableHead className="text-xs">الطبقة الإنشائية</TableHead>
                        <TableHead className="text-xs">الارتفاع المنسوبي (Z in mm)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {foundationDb.levels.map((lvl) => (
                        <TableRow key={lvl.id}>
                          <TableCell className="font-mono text-xs text-muted-foreground">{lvl.id}</TableCell>
                          <TableCell className="text-xs font-bold">{lvl.name}</TableCell>
                          <TableCell className="font-mono text-xs text-red-600 font-bold">{lvl.elevation} mm</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* TAB: GROUPS */}
            {activeTableTab === 'groups' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-bold">جدول مجموعات التأسيس (Groups Table)</CardTitle>
                  <CardDescription className="text-xs">تصنيف وتوحيد أبعاد القواعد وتفريد حديدها لتسهيل العمل بالموقع وسرعة الهيكل</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  
                  {/* Action group builder */}
                  <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/20 border border-border rounded-lg">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-700">عنوان المجموعة التعريفي:</label>
                      <Input
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="مثل: قواعد الأعمدة الداخلية الجبارة"
                        className="h-8 text-xs w-64 bg-background"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-700">شرح موجز (اختياري):</label>
                      <Input
                        value={newGroupDesc}
                        onChange={(e) => setNewGroupDesc(e.target.value)}
                        placeholder="لحمل الحمولات فوق 800 كيلو نيوتن"
                        className="h-8 text-xs w-80 bg-background"
                      />
                    </div>
                    <Button size="sm" onClick={handleAddGroup} disabled={!newGroupName} className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-8">
                      إضافة فئة تصنيف جديدة ✓
                    </Button>
                  </div>

                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="text-xs">المعرّف الكودي (Group ID)</TableHead>
                        <TableHead className="text-xs">اسم الفئة</TableHead>
                        <TableHead className="text-xs">الوصف الفني</TableHead>
                        <TableHead className="text-xs">العناصر المنضوية</TableHead>
                        <TableHead className="text-xs text-left">التحكم</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {foundationDb.groups.map((g) => {
                        const members = foundationDb.foundations.filter(f => f.groupId === g.id).map(f => f.name).join(", ");
                        return (
                          <TableRow key={g.id}>
                            <TableCell className="font-mono text-xs font-bold text-amber-700">{g.id}</TableCell>
                            <TableCell className="text-xs font-bold">{g.name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{g.description || "—"}</TableCell>
                            <TableCell className="text-xs text-blue-600">{members || "لا توجد عناصر مضافة حالياً"}</TableCell>
                            <TableCell className="text-left py-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => handleDeleteGroup(g.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* TAB: VALIDATION DIAGNOSTICS */}
            {activeTableTab === 'validation' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-bold flex items-center justify-between">
                    <span>فحص المطابقة والتحقق التلقائي لقاعدة البيانات (Compliance Registry)</span>
                    <Badge variant={validationIssues.length === 0 ? "outline" : "destructive"}>
                      {validationIssues.length === 0 ? "سليم ومكتمل بنسبة 100%" : `${validationIssues.length} مشكلة معلقة`}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">يقوم بفحص ومراقبة العلاقات بين جداول القواعد ومطابقتها هندسياً لمقاييس السلامة الإنشائية</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  
                  {validationIssues.length === 0 ? (
                    <div className="p-8 text-center bg-emerald-50 border border-emerald-200 rounded-lg space-y-2">
                      <CheckCircle className="h-10 w-10 text-emerald-600 mx-auto" />
                      <h4 className="font-bold text-emerald-800">نهانينا! قاعدة البيات سليمة تماماً</h4>
                      <p className="text-xs text-emerald-700 max-w-md mx-auto">
                        لا توجد انقطاعات في الإسناد أو بيانات هندسية أو معطيات تربة مفقودة. جودة البيانات الحالية مطابقة للشروط الهندسية.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {validationIssues.map((issue) => (
                        <div key={issue.id} className={`flex items-start justify-between p-4 rounded-lg border text-right transition-all duration-300 ${
                          issue.severity === 'error'
                            ? 'bg-red-50/50 border-red-200 text-red-800'
                            : 'bg-amber-50/50 border-amber-200 text-amber-800'
                        }`}>
                          <div className="flex gap-3">
                            {issue.severity === 'error' ? (
                              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                            )}
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-extrabold tracking-wider uppercase px-1.5 py-0.5 rounded ${
                                  issue.severity === 'error' ? 'bg-red-200 text-red-900' : 'bg-amber-200 text-amber-900'
                                }`}>
                                  {issue.severity === 'error' ? 'مرفوض كوداً' : 'تحذير توحيد'}
                                </span>
                                <h4 className="text-xs font-bold leading-none">{issue.message}</h4>
                              </div>
                              <p className="text-[11px] text-slate-500 font-mono">ID المسبب للمشكلة: {issue.objectId}</p>
                            </div>
                          </div>
                          
                          <Button size="sm" onClick={() => handleQuickFixIssue(issue)} className="bg-slate-900 hover:bg-slate-800 text-white text-[10px] h-7 px-2.5 shrink-0 ml-4 font-bold">
                            إصلاح المشكلة تلقائياً ⚡
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* TAB: ETABS MAPPING IMPORT WORKFLOW */}
            {activeTableTab === 'etabs-mapping' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-bold flex items-center justify-between">
                    <span>محرك استيراد وتوطين مخطط تحليلات ETABS (Integration Studio)</span>
                    <Badge variant="outline" className="text-purple-700 bg-purple-50 border-purple-200">
                      ETABS Connected ✓
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">مطابقة الأعمدة وردود الأفعال المستوردة من النموذج التحليلي بـ ETABS مع جداول البيانات الصريحة ومجموعات العناصر</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  
                  {etabsReactions.length === 0 ? (
                    <div className="p-8 text-center bg-purple-50/50 border border-purple-100 rounded-lg space-y-2">
                      <ArrowLeftRight className="h-10 w-10 text-purple-500 mx-auto" />
                      <h4 className="font-bold text-purple-900 text-xs">لا يوجد قراءة مدخلات لمطابقة رد أفعال ETABS</h4>
                      <p className="text-xs text-purple-700 max-w-md mx-auto leading-relaxed">
                        يرجى الذهاب أولاً لتبويب "استيراد ETABS" والقيام بوضع ورفع مسار ردود الأفعال الصادر من برنامج التحليل الإنشائي لتفعيل المعايرة المباشرة وتوطيد جداول الأفعال.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="border border-purple-100 bg-purple-50 rounded-lg p-4 text-xs leading-relaxed text-purple-800">
                        <strong>بروتوكول تفويض الأفعال والتربيعات الهيكلية:</strong> تم التعرف على <strong>{etabsReactions.length} رد فعل تفصيلي</strong> مستورد بجودة عالية. تعرض الأداة أدناه الحمولات الخدمية وأعصاب التأسيس المدخلة بناء على جداول الربط مع القواعد.
                      </div>

                      <Table>
                        <TableHeader className="bg-purple-100/30">
                          <TableRow>
                            <TableHead className="text-xs">الموقع (ETABS Joint)</TableHead>
                            <TableHead className="text-xs">الحمل المحوري الفعلي Fz (kN)</TableHead>
                            <TableHead className="text-xs">العزم المحلي Mz (kN.m)</TableHead>
                            <TableHead className="text-xs text-blue-800">القاعدة التأسيسية المربوطة</TableHead>
                            <TableHead className="text-xs">حالة المطابقة مع القواعد</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {etabsReactions.slice(0, 15).map((react) => {
                            // Find assigned foundation
                            const assign = foundationDb.assignments.find(a => a.supportedId === react.pointId);
                            const fdn = assign ? GetFoundationByID(foundationDb, assign.foundationId) : null;
                            const geom = fdn ? foundationDb.geometries.find(g => g.foundationId === fdn.id) : null;

                            return (
                              <TableRow key={react.pointId}>
                                <TableCell className="font-mono text-xs font-bold text-purple-950">{react.pointId || react.pointLabel}</TableCell>
                                <TableCell className="font-mono text-xs text-indigo-700 font-bold">{react.Fz ? Math.abs(react.Fz).toFixed(1) : react.Fz} kN</TableCell>
                                <TableCell className="font-mono text-xs">{react.Mz ? Math.abs(react.Mz).toFixed(2) : '0'} kN-m</TableCell>
                                <TableCell className="text-xs">
                                  {fdn ? (
                                    <Badge variant="outline" className="text-blue-700 bg-blue-50">
                                      {fdn.name} ({geom ? `${geom.width}×${geom.length}` : 'بلا أبعاد'})
                                    </Badge>
                                  ) : (
                                    <span className="text-red-600 font-bold">بقايا عمود معلق ✗</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs">
                                  {fdn ? (
                                    <span className="text-green-700 flex items-center gap-1">
                                      <CheckCircle className="h-3 w-3" />
                                      مرتبط ومحسوب ✓
                                    </span>
                                  ) : (
                                    <span className="text-amber-600 font-semibold flex items-center gap-1">
                                      <AlertTriangle className="h-3 w-3" />
                                      بانتظار الإسناد الحر
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      {etabsReactions.length > 15 && (
                        <div className="text-center text-[11px] text-muted-foreground font-mono">
                          ... وتوجد {etabsReactions.length - 15} صفوف أفعال أخرى تم تحميل مصفوفاتها الكودية ...
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

          </div>
        </div>
      )}

      {/* ── Dialog for Add/Edit Foundation ── */}
      <Dialog open={isAddEditOpen} onOpenChange={setIsAddEditOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-slate-800">
              {editingFdn?.id && foundationDb.foundations.some(f => f.id === editingFdn.id) ? 'تعديل بيانات القاعدة' : 'إضافة كائن قاعدة جديد'}
            </DialogTitle>
          </DialogHeader>
          {editingFdn && (
            <div className="space-y-4 py-4 text-right">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">كود المعرّف (ID - فريد وغير مكرر)</label>
                <Input
                  value={editingFdn.id || ''}
                  disabled={foundationDb.foundations.some(f => f.id === editingFdn.id)}
                  onChange={(e) => setEditingFdn({ ...editingFdn, id: e.target.value })}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">الاسم الرمزي بالمخطط (e.g., F1, F2)</label>
                <Input
                  value={editingFdn.name || ''}
                  onChange={(e) => setEditingFdn({ ...editingFdn, name: e.target.value })}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">نظام القاعدة الإنشائي (Foundation Mode)</label>
                <select
                  value={editingFdn.type || FoundationType.Isolated}
                  onChange={(e) => setEditingFdn({ ...editingFdn, type: e.target.value as FoundationType })}
                  className="w-full h-9 rounded border border-input text-xs bg-background px-2"
                >
                  <option value={FoundationType.Isolated}>منفردة Isolated Footing</option>
                  <option value={FoundationType.Wall}>شريطية Wall Footing</option>
                  <option value={FoundationType.Raft}>لبشة Raft Foundation</option>
                  <option value={FoundationType.Pile}>خازوقية Pile Cap</option>
                  <option value={FoundationType.Strap}>قاعدة جدار جار Strap Footing</option>
                  <option value={FoundationType.Combined}>مشتركة Combined Footing</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">f'c الخرسانة (MPa)</label>
                  <Input
                    type="number"
                    value={editingFdn.materialFc || 25}
                    onChange={(e) => setEditingFdn({ ...editingFdn, materialFc: parseFloat(e.target.value) || 25 })}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">fy التسليح (MPa)</label>
                  <Input
                    type="number"
                    value={editingFdn.materialFy || 420}
                    onChange={(e) => setEditingFdn({ ...editingFdn, materialFy: parseFloat(e.target.value) || 420 })}
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">مجموعة التأسيس المشتركة</label>
                <select
                  value={editingFdn.groupId || ''}
                  onChange={(e) => setEditingFdn({ ...editingFdn, groupId: e.target.value || undefined })}
                  className="w-full h-9 rounded border border-input text-xs bg-background px-2"
                >
                  <option value="">-- بدون مجموعة مشتركة --</option>
                  {foundationDb.groups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsAddEditOpen(false)}>إلغاء</Button>
            <Button variant="default" size="sm" onClick={handleSaveFoundation} className="bg-blue-600 hover:bg-blue-700 text-white">
              حفظ القاعدة ومواءمة الجداول ✓
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
