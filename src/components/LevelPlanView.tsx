/**
 * Level Plan View - Shows structural elements at a selected elevation.
 * Styled like ModelCanvas with pan, zoom, element selection, and long-press editing.
 */
import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { Column, Beam, Slab, Story } from '@/lib/structuralEngine';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';

export interface SupportRestraints {
  ux: boolean; uy: boolean; uz: boolean;
  rx: boolean; ry: boolean; rz: boolean;
}

interface LevelPlanViewProps {
  columns: Column[];
  beams: Beam[];
  slabs: Slab[];
  stories: Story[];
  selectedElevation: number;
  onColumnSupportChange: (colId: string, x: number, y: number, zBottom: number, endType: 'top' | 'bottom', value: 'F' | 'P') => void;
  onSupportRestraintsChange?: (posKeys: string[], restraints: SupportRestraints) => void;
  supportRestraints?: Record<string, SupportRestraints>;
  onElementLongPress?: (type: 'beam' | 'column' | 'slab', id: string) => void;
  onEditBeamProperties?: (beamId: string) => void;
  onDeleteElement?: (type: 'beam' | 'column' | 'slab', id: string) => void;
  slabProps?: any;
  ribbedSlabProps?: any;
  supportDb?: any;
  selectedLoadCase?: string;
  visibleTypes?: { nodes?: boolean; beams?: boolean; columns?: boolean; slabs?: boolean };
}

interface SelectedElement {
  type: 'beam' | 'column' | 'slab';
  id: string;
}

interface EndReleaseDOF {
  ux: boolean; uy: boolean; uz: boolean;
  rx: boolean; ry: boolean; rz: boolean;
}

interface ElementEditDialog {
  open: boolean;
  type: 'beam' | 'column' | 'slab' | '';
  id: string;
  label: string;
  b: number;
  h: number;
  length: number;
  thickness: number;
  topEnd: 'F' | 'P';
  bottomEnd: 'F' | 'P';
  x: number;
  y: number;
  releaseI: EndReleaseDOF;
  releaseJ: EndReleaseDOF;
  orientAngle: number;
}

interface SupportDialogState {
  open: boolean;
  colId: string;
  colLabel: string;
  x: number;
  y: number;
  restraints: SupportRestraints;
  applyToAll: boolean;
}

export default function LevelPlanView({
  columns, beams, slabs, stories, selectedElevation, onColumnSupportChange, onSupportRestraintsChange, supportRestraints, onElementLongPress, onEditBeamProperties, onDeleteElement, onSaveElementProps, supportDb, selectedLoadCase = '1.0D+1.0L',
  visibleTypes = { nodes: true, beams: true, columns: true, slabs: true },
}: LevelPlanViewProps & {
  onSaveElementProps?: (type: 'beam' | 'column' | 'slab', id: string, props: {
    b?: number; h?: number; thickness?: number;
    applyToUpperFloors?: boolean;
    topEnd?: 'F' | 'P'; bottomEnd?: 'F' | 'P';
    releaseI?: EndReleaseDOF; releaseJ?: EndReleaseDOF;
    orientAngle?: number;
  }) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewBox, setViewBox] = useState({ x: -2, y: -2, w: 16, h: 18 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number; vbx: number; vby: number } | null>(null);
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const defaultRelease: EndReleaseDOF = { ux: false, uy: false, uz: false, rx: false, ry: false, rz: false };
  const [editDialog, setEditDialog] = useState<ElementEditDialog>({
    open: false, type: '', id: '', label: '', b: 200, h: 400, length: 0,
    thickness: 160, topEnd: 'F', bottomEnd: 'F', x: 0, y: 0,
    releaseI: { ...defaultRelease }, releaseJ: { ...defaultRelease },
    orientAngle: 0,
  });
  const [applyToUpperFloors, setApplyToUpperFloors] = useState(false);
  const [supportDialog, setSupportDialog] = useState<SupportDialogState>({
    open: false, colId: '', colLabel: '', x: 0, y: 0,
    restraints: { ux: true, uy: true, uz: true, rx: true, ry: true, rz: true },
    applyToAll: false,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const minStoryElev = stories.length > 0 ? Math.min(...stories.map(s => s.elevation ?? 0)) : 0;
  const isGroundLevel = Math.abs(selectedElevation - minStoryElev) <= 10;
  const tolerance = 100;

  // Filter elements at this elevation.
  // Convention: a column "belongs" to the floor level where its TOP is.
  //   e.g. at elevation 4000 mm → show story-1 columns (zTop ≈ 4000)
  //        at elevation 8000 mm → show story-2 columns (zTop ≈ 8000)
  // At ground / foundation level we show support conditions: columns
  // whose BOTTOM is at the lowest registered elevation.
  const colsAtLevel = columns.filter(c => {
    if (c.isRemoved) return false;
    const zBot = c.zBottom ?? 0;
    const zTop = c.zTop ?? (zBot + c.L);
    if (isGroundLevel) return Math.abs(zBot - minStoryElev) <= tolerance;
    return Math.abs(zTop - selectedElevation) <= tolerance;
  });

  const uniqueColPositions = new Map<string, Column[]>();
  for (const c of colsAtLevel) {
    const key = `${c.x.toFixed(2)}_${c.y.toFixed(2)}`;
    if (!uniqueColPositions.has(key)) uniqueColPositions.set(key, []);
    uniqueColPositions.get(key)!.push(c);
  }

  const beamsAtLevel = beams.filter(b => {
    const bz = b.z ?? 0;
    return Math.abs(bz - selectedElevation) <= tolerance;
  });

  const slabsAtLevel = slabs.filter(s => {
    const story = stories.find(st => st.id === s.storyId);
    if (!story) return false;
    const slabElev = (story.elevation ?? 0) + story.height;
    return Math.abs(slabElev - selectedElevation) <= tolerance;
  });

  // Auto-fit viewbox
  useEffect(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const c of colsAtLevel) { xs.push(c.x); ys.push(c.y); }
    for (const b of beamsAtLevel) { xs.push(b.x1, b.x2); ys.push(b.y1, b.y2); }
    for (const s of slabsAtLevel) { xs.push(s.x1, s.x2); ys.push(s.y1, s.y2); }
    if (xs.length === 0) return;
    const pad = 2;
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;
    // Flip Y: viewBox Y goes from -maxY to -minY
    setViewBox({
      x: minX,
      y: -maxY,
      w: maxX - minX,
      h: maxY - minY,
    });
  }, [colsAtLevel.length, beamsAtLevel.length, slabsAtLevel.length, selectedElevation]);

  // SVG coordinate conversion
  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = viewBox.w / rect.width;
    const scaleY = viewBox.h / rect.height;
    return {
      x: (clientX - rect.left) * scaleX + viewBox.x,
      y: -((clientY - rect.top) * scaleY + viewBox.y), // flip Y
    };
  }, [viewBox]);

  // Pan & Zoom handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 0 || e.button === 1) {
      setPanStart({ x: e.clientX, y: e.clientY, vbx: viewBox.x, vby: viewBox.y });
      setIsPanning(true);
    }
  }, [viewBox]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (isPanning && panStart) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = (e.clientX - panStart.x) * viewBox.w / rect.width;
      const dy = (e.clientY - panStart.y) * viewBox.h / rect.height;
      setViewBox(vb => ({ ...vb, x: panStart.vbx - dx, y: panStart.vby - dy }));
    }
  }, [isPanning, panStart, viewBox]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setPanStart(null);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY);
    setViewBox(vb => ({
      x: wx - (wx - vb.x) * zoomFactor,
      y: wy - (wy - vb.y) * zoomFactor,
      w: vb.w * zoomFactor,
      h: vb.h * zoomFactor,
    }));
  }, [screenToWorld]);

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setPanStart({ x: touch.clientX, y: touch.clientY, vbx: viewBox.x, vby: viewBox.y });
      setIsPanning(true);
    }
  }, [viewBox]);

  const handleTouchMove = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.sqrt((t2.clientX - t1.clientX) ** 2 + (t2.clientY - t1.clientY) ** 2);
      const zoomFactor = dist > 100 ? 0.98 : 1.02;
      setViewBox(vb => ({
        x: vb.x + vb.w * (1 - zoomFactor) / 2,
        y: vb.y + vb.h * (1 - zoomFactor) / 2,
        w: vb.w * zoomFactor,
        h: vb.h * zoomFactor,
      }));
    } else if (e.touches.length === 1 && isPanning && panStart) {
      const touch = e.touches[0];
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = (touch.clientX - panStart.x) * viewBox.w / rect.width;
      const dy = (touch.clientY - panStart.y) * viewBox.h / rect.height;
      setViewBox(vb => ({ ...vb, x: panStart.vbx - dx, y: panStart.vby - dy }));
    }
  }, [isPanning, panStart, viewBox]);

  const handleTouchEnd = useCallback(() => {
    setIsPanning(false);
    setPanStart(null);
  }, []);

  const openElementLocalDialog = useCallback((type: 'beam' | 'column' | 'slab', id: string) => {
    if (type === 'beam') {
      const beam = beamsAtLevel.find(b => b.id === id);
      if (beam) {
        setEditDialog({
          open: true, type: 'beam', id, label: id,
          b: beam.b ?? 200, h: beam.h ?? 400, length: beam.length ?? 0,
          thickness: 0,
          topEnd: 'F', bottomEnd: 'F',
          x: (beam.x1 + beam.x2) / 2, y: (beam.y1 + beam.y2) / 2,
          releaseI: beam.releaseI ? { ...beam.releaseI } : { ...defaultRelease },
          releaseJ: beam.releaseJ ? { ...beam.releaseJ } : { ...defaultRelease },
          orientAngle: 0,
        });
      }
    } else if (type === 'column') {
      const col = colsAtLevel.find(c => c.id === id);
      if (col) {
        if (isGroundLevel) {
          const sKey = `${col.x.toFixed(2)}_${col.y.toFixed(2)}_${col.zBottom ?? 0}`;
          const restraints = supportRestraints?.[sKey]
            || (col.bottomEndCondition === 'F'
              ? { ux: true, uy: true, uz: true, rx: true, ry: true, rz: true }
              : { ux: true, uy: true, uz: true, rx: false, ry: false, rz: false });
          setSupportDialog({
            open: true, colId: col.id, colLabel: col.id,
            x: col.x, y: col.y,
            restraints: { ...restraints }, applyToAll: false,
          });
        } else {
          setApplyToUpperFloors(false);
          setEditDialog({
            open: true, type: 'column', id, label: id,
            b: col.b ?? 300, h: col.h ?? 400, length: col.L ?? 0,
            thickness: 0,
            topEnd: col.topEndCondition || 'F',
            bottomEnd: col.bottomEndCondition || 'F',
            x: col.x, y: col.y,
            releaseI: col.releaseI ? { ...col.releaseI } : { ...defaultRelease },
            releaseJ: col.releaseJ ? { ...col.releaseJ } : { ...defaultRelease },
            orientAngle: col.orientAngle ?? 0,
          });
        }
      }
    } else if (type === 'slab') {
      const slab = slabsAtLevel.find(s => s.id === id);
      if (slab) {
        setEditDialog({
          open: true, type: 'slab', id, label: id,
          b: 0, h: 0,
          length: 0, thickness: 160,
          topEnd: 'F', bottomEnd: 'F',
          x: (slab.x1 + slab.x2) / 2, y: (slab.y1 + slab.y2) / 2,
          releaseI: { ...defaultRelease }, releaseJ: { ...defaultRelease },
          orientAngle: 0,
        });
      }
    }
  }, [beamsAtLevel, colsAtLevel, slabsAtLevel, isGroundLevel, supportRestraints]);

  // Long-press handling
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const handleElementPointerDown = useCallback((type: 'beam' | 'column' | 'slab', id: string, e: React.PointerEvent) => {
    e.stopPropagation();
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      openElementLocalDialog(type, id);
    }, 500);
  }, [openElementLocalDialog]);

  const handleElementPointerUp = useCallback((type: 'beam' | 'column' | 'slab', id: string, e: React.PointerEvent) => {
    e.stopPropagation();
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    // Short click = select
    if (!longPressTriggered.current) {
      if (isGroundLevel && type === 'column') {
        const col = colsAtLevel.find(c => c.id === id);
        if (col) {
          const sKey = `${col.x.toFixed(2)}_${col.y.toFixed(2)}_${col.zBottom ?? 0}`;
          const cur = supportRestraints?.[sKey]
            || (col.bottomEndCondition === 'F'
              ? { ux: true, uy: true, uz: true, rx: true, ry: true, rz: true }
              : { ux: true, uy: true, uz: true, rx: false, ry: false, rz: false });
          setSupportDialog({
            open: true, colId: col.id, colLabel: col.id,
            x: col.x, y: col.y,
            restraints: { ...cur }, applyToAll: false,
          });
        }
      } else {
        setSelectedElement(prev =>
          prev?.type === type && prev?.id === id ? null : { type, id }
        );
      }
    }
  }, [isGroundLevel, colsAtLevel]);

  const handleElementPointerLeave = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleSupportSave = () => {
    const { restraints, applyToAll, x, y } = supportDialog;
    if (applyToAll) {
      const posKeys = Array.from(uniqueColPositions.entries()).map(([_, cols]) => {
        const c = cols[0];
        return `${c.x.toFixed(2)}_${c.y.toFixed(2)}_${c.zBottom ?? 0}`;
      });
      onSupportRestraintsChange?.(posKeys, restraints);
    } else {
      const key = `${x.toFixed(2)}_${y.toFixed(2)}_${selectedElevation}`;
      onSupportRestraintsChange?.([key], restraints);
    }
    setSupportDialog(prev => ({ ...prev, open: false }));
  };

  const handleEditSave = () => {
    if (editDialog.type === 'column' || editDialog.type === 'beam') {
      onSaveElementProps?.(editDialog.type, editDialog.id, {
        b: editDialog.b,
        h: editDialog.h,
        applyToUpperFloors: editDialog.type === 'column' ? applyToUpperFloors : undefined,
        topEnd: editDialog.type === 'column' ? editDialog.topEnd : undefined,
        bottomEnd: editDialog.type === 'column' ? editDialog.bottomEnd : undefined,
        releaseI: editDialog.releaseI,
        releaseJ: editDialog.releaseJ,
        orientAngle: editDialog.type === 'column' ? editDialog.orientAngle : undefined,
      });
    } else if (editDialog.type === 'slab') {
      onSaveElementProps?.('slab', editDialog.id, { thickness: editDialog.thickness });
    }
    setConfirmDelete(false);
    setEditDialog(prev => ({ ...prev, open: false }));
  };

  const handleDeleteClick = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (editDialog.type && onDeleteElement) {
      onDeleteElement(editDialog.type as 'beam' | 'column' | 'slab', editDialog.id);
    }
    setConfirmDelete(false);
    setEditDialog(prev => ({ ...prev, open: false }));
  };

  const handleEditDialogClose = (open: boolean) => {
    if (!open) setConfirmDelete(false);
    setEditDialog(prev => ({ ...prev, open }));
  };

  // Compute grid line scale
  const gridStep = viewBox.w > 30 ? 5 : viewBox.w > 15 ? 2 : 1;

  return (
    <div className="relative w-full h-full min-h-[300px] touch-none bg-background">
      <svg
        ref={svgRef}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        className="w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      >
        {/* Background */}
        <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h}
          fill="hsl(var(--background))" />

        {/* Grid lines */}
        {Array.from({ length: Math.ceil(viewBox.w / gridStep) + 2 }, (_, i) => {
          const x = Math.floor(viewBox.x / gridStep) * gridStep + i * gridStep;
          return <line key={`gx${x}`} x1={x} y1={viewBox.y} x2={x} y2={viewBox.y + viewBox.h}
            stroke="hsl(var(--border))" strokeWidth={0.015} opacity={0.4} />;
        })}
        {Array.from({ length: Math.ceil(viewBox.h / gridStep) + 2 }, (_, i) => {
          const y = Math.floor(viewBox.y / gridStep) * gridStep + i * gridStep;
          return <line key={`gy${y}`} x1={viewBox.x} y1={y} x2={viewBox.x + viewBox.w} y2={y}
            stroke="hsl(var(--border))" strokeWidth={0.015} opacity={0.4} />;
        })}

        {/* Axis lines */}
        <line x1={0} y1={viewBox.y} x2={0} y2={viewBox.y + viewBox.h}
          stroke="hsl(var(--muted-foreground))" strokeWidth={0.03} opacity={0.3} />
        <line x1={viewBox.x} y1={0} x2={viewBox.x + viewBox.w} y2={0}
          stroke="hsl(var(--muted-foreground))" strokeWidth={0.03} opacity={0.3} />

        {/* Slabs - Y negated for bottom-left origin */}
        {visibleTypes?.slabs !== false && slabsAtLevel.map(s => {
          const isSelected = selectedElement?.type === 'slab' && selectedElement.id === s.id;
          const sy1 = -Math.max(s.y1, s.y2);
          const sheight = Math.abs(s.y2 - s.y1);
          const sx = Math.min(s.x1, s.x2);
          const swidth = Math.abs(s.x2 - s.x1);
          const cy = -(s.y1 + s.y2) / 2;
          return (
            <g key={s.id}>
              <rect
                x={sx} y={sy1}
                width={swidth} height={sheight}
                fill={isSelected ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--primary) / 0.06)'}
                stroke={isSelected ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.25)'}
                strokeWidth={isSelected ? 0.06 : 0.02}
                rx={0.03}
                style={{ cursor: 'pointer' }}
                onPointerDown={(e) => handleElementPointerDown('slab', s.id, e)}
                onPointerUp={(e) => handleElementPointerUp('slab', s.id, e)}
                onPointerLeave={handleElementPointerLeave}
              />
              <line x1={sx + 0.1} y1={cy}
                x2={sx + swidth - 0.1} y2={cy}
                stroke="hsl(var(--primary) / 0.12)" strokeWidth={0.01} strokeDasharray="0.15 0.1" />
              <text x={(s.x1 + s.x2) / 2} y={cy + 0.05}
                textAnchor="middle" dominantBaseline="middle"
                fill={isSelected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                fontSize={0.22} fontFamily="monospace" fontWeight={isSelected ? 'bold' : 'normal'}>
                {s.id}
              </text>
              <text x={(s.x1 + s.x2) / 2} y={cy + 0.35}
                textAnchor="middle" dominantBaseline="middle"
                fill="hsl(var(--muted-foreground))" fontSize={0.13} fontFamily="monospace" opacity={0.6}>
                {swidth.toFixed(1)}×{sheight.toFixed(1)}م
              </text>
            </g>
          );
        })}

        {/* Beams - Y negated */}
        {visibleTypes?.beams !== false && beamsAtLevel.map(b => {
          const isSelected = selectedElement?.type === 'beam' && selectedElement.id === b.id;
          const beamLen = Math.sqrt((b.x2 - b.x1) ** 2 + (b.y2 - b.y1) ** 2);
          const ny1 = -b.y1;
          const ny2 = -b.y2;
          const angle = Math.atan2(ny2 - ny1, b.x2 - b.x1);
          const perpX = -Math.sin(angle) * 0.2;
          const perpY = Math.cos(angle) * 0.2;

          return (
            <g key={b.id} style={{ cursor: 'pointer' }}
              onPointerDown={(e) => handleElementPointerDown('beam', b.id, e)}
              onPointerUp={(e) => handleElementPointerUp('beam', b.id, e)}
              onPointerLeave={handleElementPointerLeave}
            >
              <line x1={b.x1} y1={ny1} x2={b.x2} y2={ny2}
                stroke={isSelected ? 'hsl(var(--primary))' : 'hsl(210 70% 45%)'}
                strokeWidth={isSelected ? 0.12 : 0.08}
                strokeLinecap="round"
                opacity={isSelected ? 1 : 0.85}
              />
              <line x1={b.x1} y1={ny1} x2={b.x2} y2={ny2}
                stroke="transparent" strokeWidth={0.4} strokeLinecap="round" />
              <text
                x={(b.x1 + b.x2) / 2 + perpX * 0.7}
                y={(ny1 + ny2) / 2 + perpY * 0.7}
                textAnchor="middle" dominantBaseline="middle"
                fill={isSelected ? 'hsl(var(--primary))' : 'hsl(210 70% 45%)'}
                fontSize={0.18} fontFamily="monospace"
                fontWeight={isSelected ? 'bold' : 'normal'}
              >
                {b.id}
              </text>
              {isSelected && (
                <text
                  x={(b.x1 + b.x2) / 2 + perpX * 1.5}
                  y={(ny1 + ny2) / 2 + perpY * 1.5}
                  textAnchor="middle" dominantBaseline="middle"
                  fill="hsl(var(--muted-foreground))" fontSize={0.12} fontFamily="monospace"
                >
                  L={beamLen.toFixed(2)}م | {b.b ?? 200}×{b.h ?? 400}
                </text>
              )}
              <circle cx={b.x1} cy={ny1} r={0.06}
                fill={isSelected ? 'hsl(var(--primary))' : 'hsl(210 70% 45%)'} />
              <circle cx={b.x2} cy={ny2} r={0.06}
                fill={isSelected ? 'hsl(var(--primary))' : 'hsl(210 70% 45%)'} />
            </g>
          );
        })}

        {/* Columns - Y negated — drawn with actual B×H dimensions */}
        {visibleTypes?.columns !== false && Array.from(uniqueColPositions.entries()).map(([key, cols]) => {
          const col = cols[0];
          const endCond = col.bottomEndCondition || 'F';
          const isFixed = endCond === 'F';
          const isSelected = selectedElement?.type === 'column' && selectedElement.id === col.id;
          // Use actual column dimensions (in meters) for display
          // orientAngle: 0=default (b→X, h→Y), 90=rotated (h→X, b→Y)
          const angle = col.orientAngle ?? 0;
          const isRotated = Math.round(Math.abs(angle) % 180) >= 45 && Math.round(Math.abs(angle) % 180) < 135;
          const colBm = ((isRotated ? col.h : col.b) ?? 300) / 1000; // mm to m
          const colHm = ((isRotated ? col.b : col.h) ?? 400) / 1000;
          const colW = Math.max(colBm, 0.15); // minimum display size
          const colHt = Math.max(colHm, 0.15);
          const ny = -col.y;

          return (
            <g key={key} style={{ cursor: 'pointer' }}
              onPointerDown={(e) => handleElementPointerDown('column', col.id, e)}
              onPointerUp={(e) => handleElementPointerUp('column', col.id, e)}
              onPointerLeave={handleElementPointerLeave}
            >
              {isSelected && (
                <rect
                  x={col.x - colW / 2 - 0.06} y={ny - colHt / 2 - 0.06}
                  width={colW + 0.12} height={colHt + 0.12}
                  fill="none" stroke="hsl(var(--primary))" strokeWidth={0.04}
                  strokeDasharray="0.08 0.04" rx={0.04}
                />
              )}

              <rect
                x={col.x - colW / 2} y={ny - colHt / 2}
                width={colW} height={colHt}
                fill={isGroundLevel
                  ? (isFixed ? 'hsl(217 91% 60%)' : 'hsl(38 92% 50%)')
                  : isSelected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'
                }
                stroke={isSelected ? 'hsl(var(--primary))' : 'hsl(var(--foreground))'}
                strokeWidth={isSelected ? 0.04 : 0.025}
                rx={0.02}
              />

              {/* Cross lines inside column */}
              <line x1={col.x - colW / 2 + 0.02} y1={ny - colHt / 2 + 0.02}
                x2={col.x + colW / 2 - 0.02} y2={ny + colHt / 2 - 0.02}
                stroke={isGroundLevel ? 'white' : isSelected ? 'hsl(var(--primary-foreground))' : 'hsl(var(--background))'}
                strokeWidth={0.015} opacity={0.5} />
              <line x1={col.x + colW / 2 - 0.02} y1={ny - colHt / 2 + 0.02}
                x2={col.x - colW / 2 + 0.02} y2={ny + colHt / 2 - 0.02}
                stroke={isGroundLevel ? 'white' : isSelected ? 'hsl(var(--primary-foreground))' : 'hsl(var(--background))'}
                strokeWidth={0.015} opacity={0.5} />

              {/* Support symbols at ground level */}
              {(() => {
                if (!isGroundLevel) return null;
                const nodeId = `${col.x.toFixed(2)}_${col.y.toFixed(2)}_${col.zBottom ?? 0}`;
                const assignment = supportDb && Array.isArray(supportDb.assignments)
                  ? supportDb.assignments.find((a: any) => a.nodeId === nodeId)
                  : null;

                let supType: string = isFixed ? 'Fixed' : 'Pinned';
                let hasSpring = false;

                if (assignment) {
                  const sDef = supportDb.supports.find((s: any) => s.id === assignment.supportId);
                  if (sDef) {
                    supType = sDef.type;
                    const spr = supportDb.springs[sDef.id];
                    if (spr && (spr.kx > 0 || spr.ky > 0 || spr.kz > 0 || spr.krx > 0 || spr.kry > 0 || spr.krz > 0)) {
                      hasSpring = true;
                    }
                  }
                }

                // Graphical render based on type
                if (supType === 'Fixed') {
                  return (
                    <g opacity="0.85">
                      <rect x={col.x - 0.22} y={ny + colHt / 2 + 0.03} width={0.44} height={0.06}
                        fill="hsl(217 91% 60%)" rx={0.01} />
                      {[-0.16, -0.08, 0, 0.08, 0.16].map(dx => (
                        <line key={dx}
                          x1={col.x + dx} y1={ny + colHt / 2 + 0.09}
                          x2={col.x + dx - 0.04} y2={ny + colHt / 2 + 0.18}
                          stroke="hsl(217 91% 60%)" strokeWidth={0.02} />
                      ))}
                    </g>
                  );
                } else if (supType === 'Pinned') {
                  return (
                    <g opacity="0.85">
                      <polygon
                        points={`${col.x},${ny + colHt / 2 + 0.03} ${col.x - 0.14},${ny + colHt / 2 + 0.2} ${col.x + 0.14},${ny + colHt / 2 + 0.2}`}
                        fill="none" stroke="hsl(38 92% 50%)" strokeWidth={0.025} />
                      <circle cx={col.x} cy={ny + colHt / 2 + 0.05} r={0.025} fill="hsl(38 92% 50%)" />
                      <line x1={col.x - 0.18} y1={ny + colHt / 2 + 0.22} x2={col.x + 0.18} y2={ny + colHt / 2 + 0.22}
                        stroke="hsl(38 92% 50%)" strokeWidth={0.02} />
                    </g>
                  );
                } else if (supType.startsWith('Roller')) {
                  return (
                    <g opacity="0.85">
                      <polygon
                        points={`${col.x},${ny + colHt / 2 + 0.03} ${col.x - 0.12},${ny + colHt / 2 + 0.18} ${col.x + 0.12},${ny + colHt / 2 + 0.18}`}
                        fill="none" stroke="hsl(142 71% 45%)" strokeWidth={0.025} />
                      {/* Roller wheels */}
                      <circle cx={col.x - 0.06} cy={ny + colHt / 2 + 0.22} r={0.03} fill="hsl(142 71% 45%)" />
                      <circle cx={col.x + 0.06} cy={ny + colHt / 2 + 0.22} r={0.03} fill="hsl(142 71% 45%)" />
                      <line x1={col.x - 0.16} y1={ny + colHt / 2 + 0.26} x2={col.x + 0.16} y2={ny + colHt / 2 + 0.26}
                        stroke="hsl(142 71% 45%)" strokeWidth={0.02} />
                    </g>
                  );
                } else if (hasSpring || supType === 'Spring' || supType === 'Elastic') {
                  return (
                    <g opacity="0.85">
                      {/* Zigzag spring graphic */}
                      <path
                        d={`M ${col.x} ${ny + colHt / 2} 
                           L ${col.x - 0.08} ${ny + colHt / 2 + 0.05} 
                           L ${col.x + 0.08} ${ny + colHt / 2 + 0.1} 
                           L ${col.x - 0.08} ${ny + colHt / 2 + 0.15} 
                           L ${col.x + 0.08} ${ny + colHt / 2 + 0.2} 
                           L ${col.x} ${ny + colHt / 2 + 0.25}`}
                        fill="none" stroke="hsl(346 84% 50%)" strokeWidth={0.025} strokeLinejoin="round" />
                      <rect x={col.x - 0.14} y={ny + colHt / 2 + 0.25} width={0.28} height={0.04}
                        fill="hsl(346 84% 50%)" />
                    </g>
                  );
                } else {
                  // Custom / User Defined
                  return (
                    <g opacity="0.85">
                      <polygon
                        points={`${col.x - 0.12},${ny + colHt / 2 + 0.03} 
                                ${col.x + 0.12},${ny + colHt / 2 + 0.03} 
                                ${col.x + 0.18},${ny + colHt / 2 + 0.15} 
                                ${col.x + 0.08},${ny + colHt / 2 + 0.23} 
                                ${col.x - 0.08},${ny + colHt / 2 + 0.23} 
                                ${col.x - 0.18},${ny + colHt / 2 + 0.15}`}
                        fill="none" stroke="hsl(271 91% 65%)" strokeWidth={0.025} />
                      <circle cx={col.x} cy={ny + colHt / 2 + 0.13} r={0.04} fill="hsl(271 91% 65%)" />
                    </g>
                  );
                }
              })()}

              {/* Graphical Support reactions (Vertical arrow and values label) */}
              {(() => {
                if (!isGroundLevel) return null;
                const nodeId = `${col.x.toFixed(2)}_${col.y.toFixed(2)}_${col.zBottom ?? 0}`;
                const reaction = supportDb && Array.isArray(supportDb.reactions)
                  ? supportDb.reactions.find((r: any) => r.nodeId === nodeId && (selectedLoadCase === 'all' || r.loadCase === selectedLoadCase))
                  : null;

                if (!reaction || Math.abs(reaction.fz) < 0.1) return null;

                const magFz = reaction.fz; // Vertical reaction in kN
                const isCompression = magFz > 0; // standard convention is upward reaction counteracts downward frame load

                // Draw realistic upward vector arrow next to node
                return (
                  <g key={`rx-${nodeId}`} className="select-none pointer-events-none">
                    {/* Reaction Vector Arrow */}
                    <path
                      d={isCompression 
                        ? `M ${col.x - 0.25} ${ny + 0.4} 
                           L ${col.x - 0.25} ${ny - 0.2} 
                           M ${col.x - 0.25} ${ny - 0.2} 
                           L ${col.x - 0.32} ${ny - 0.05} 
                           M ${col.x - 0.25} ${ny - 0.2} 
                           L ${col.x - 0.18} ${ny - 0.05}`
                        : `M ${col.x - 0.25} ${ny - 0.2} 
                           L ${col.x - 0.25} ${ny + 0.4} 
                           M ${col.x - 0.25} ${ny + 0.4} 
                           L ${col.x - 0.32} ${ny + 0.25} 
                           M ${col.x - 0.25} ${ny + 0.4} 
                           L ${col.x - 0.18} ${ny + 0.25}`
                      }
                      fill="none"
                      stroke="hsl(190 95% 45%)"
                      strokeWidth={0.035}
                    />

                    {/* Background capsule for legibility */}
                    <rect
                      x={col.x - 0.85} y={ny + 0.45} width={1.2} height={0.34}
                      fill="hsl(var(--card))" stroke="hsl(190 95% 45%)" strokeWidth={0.015} rx={0.06}
                    />

                    {/* Forces Reaction Text */}
                    <text x={col.x - 0.25} y={ny + 0.6} textAnchor="middle"
                      fill="hsl(190 95% 45%)" fontSize={0.15} fontFamily="monospace" fontWeight="bold">
                      Fz: {magFz.toFixed(1)} ك.ن
                    </text>
                  </g>
                );
              })()}

              {/* Column label */}
              <text x={col.x} y={ny - colHt / 2 - 0.12} textAnchor="middle"
                fill={isSelected ? 'hsl(var(--primary))' : 'hsl(var(--foreground))'}
                fontSize={0.2} fontFamily="monospace" fontWeight="bold">
                {col.id}
              </text>

              {/* Always show dimensions to indicate orientation */}
              <text x={col.x} y={ny + colHt / 2 + (isGroundLevel ? 0.42 : 0.2)} textAnchor="middle"
                fill="hsl(var(--muted-foreground))" fontSize={0.12} fontFamily="monospace">
                {col.b ?? 300}×{col.h ?? 400}
              </text>

              {/* Orange rotation indicator — shows when column is physically rotated 90° */}
              {!isGroundLevel && isRotated && (
                <>
                  <rect
                    x={col.x - colW / 2 - 0.03} y={ny - colHt / 2 - 0.03}
                    width={colW + 0.06} height={colHt + 0.06}
                    fill="none" stroke="hsl(25 95% 53%)" strokeWidth={0.035} rx={0.03}
                  />
                  <text x={col.x + colW / 2 + 0.05} y={ny - colHt / 2 - 0.02}
                    fill="hsl(25 95% 53%)" fontSize={0.13} fontFamily="sans-serif" fontWeight="bold">
                    ↻
                  </text>
                </>
              )}

              {isGroundLevel && (
                <text x={col.x} y={ny + colHt / 2 + (isFixed ? 0.28 : 0.32)} textAnchor="middle"
                  fill={isFixed ? 'hsl(217 91% 60%)' : 'hsl(38 92% 50%)'} fontSize={0.14} fontFamily="sans-serif">
                  {isFixed ? 'ثابت' : 'مفصلي'}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes (joints) — rendered at all beam endpoints + column centres */}
        {visibleTypes?.nodes !== false && (() => {
          const nodePositions = new Map<string, { x: number; y: number; idx: number }>();
          let idx = 1;
          // collect column centres
          for (const [, cols] of uniqueColPositions.entries()) {
            const c = cols[0];
            const k = `${c.x.toFixed(3)}_${c.y.toFixed(3)}`;
            if (!nodePositions.has(k)) nodePositions.set(k, { x: c.x, y: c.y, idx: idx++ });
          }
          // collect beam endpoints
          for (const b of beamsAtLevel) {
            const k1 = `${b.x1.toFixed(3)}_${b.y1.toFixed(3)}`;
            const k2 = `${b.x2.toFixed(3)}_${b.y2.toFixed(3)}`;
            if (!nodePositions.has(k1)) nodePositions.set(k1, { x: b.x1, y: b.y1, idx: idx++ });
            if (!nodePositions.has(k2)) nodePositions.set(k2, { x: b.x2, y: b.y2, idx: idx++ });
          }

          return Array.from(nodePositions.values()).map(({ x, y, idx: ni }) => {
            const ny = -y;
            const nodeLabel = `N${ni}`;
            // at ground level: clicking opens the support dialog for that column (if one exists at this position)
            const colAtPos = colsAtLevel.find(c => Math.abs(c.x - x) < 0.01 && Math.abs(c.y - y) < 0.01);
            const handleNodeClick = () => {
              if (isGroundLevel && colAtPos) {
                const sKey = `${colAtPos.x.toFixed(2)}_${colAtPos.y.toFixed(2)}_${colAtPos.zBottom ?? 0}`;
                const cur = supportRestraints?.[sKey]
                  || (colAtPos.bottomEndCondition === 'F'
                    ? { ux: true, uy: true, uz: true, rx: true, ry: true, rz: true }
                    : { ux: true, uy: true, uz: true, rx: false, ry: false, rz: false });
                setSupportDialog({
                  open: true, colId: colAtPos.id, colLabel: colAtPos.id,
                  x: colAtPos.x, y: colAtPos.y,
                  restraints: { ...cur }, applyToAll: false,
                });
              }
            };
            return (
              <g key={nodeLabel} onClick={handleNodeClick} style={{ cursor: isGroundLevel && colAtPos ? 'pointer' : 'default' }}>
                {/* Outer glow ring */}
                <circle cx={x} cy={ny} r={0.14}
                  fill="hsl(217 91% 60% / 0.18)"
                  stroke="hsl(217 91% 60% / 0.4)"
                  strokeWidth={0.02} />
                {/* Node dot */}
                <circle cx={x} cy={ny} r={0.09}
                  fill="hsl(217 91% 60%)"
                  stroke="hsl(var(--background))"
                  strokeWidth={0.03} />
                {/* Node label */}
                <text x={x + 0.18} y={ny - 0.12}
                  textAnchor="start" dominantBaseline="middle"
                  fill="hsl(217 91% 55%)"
                  fontSize={0.18} fontFamily="monospace" fontWeight="bold">
                  {nodeLabel}
                </text>
                {/* Ground-level support indicator hint */}
                {isGroundLevel && colAtPos && (
                  <circle cx={x} cy={ny} r={0.05}
                    fill="hsl(var(--background))" />
                )}
              </g>
            );
          });
        })()}

        {/* Grid axis labels */}
        {Array.from({ length: Math.ceil(viewBox.w / gridStep) + 2 }, (_, i) => {
          const x = Math.floor(viewBox.x / gridStep) * gridStep + i * gridStep;
          if (x % gridStep !== 0) return null;
          return (
            <text key={`lx${x}`} x={x} y={viewBox.y + viewBox.h - 0.15}
              textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={0.15}
              fontFamily="monospace" opacity={0.5}>
              {x}
            </text>
          );
        })}
        {Array.from({ length: Math.ceil(viewBox.h / gridStep) + 2 }, (_, i) => {
          const svgY = Math.floor(viewBox.y / gridStep) * gridStep + i * gridStep;
          if (svgY % gridStep !== 0) return null;
          const worldY = -svgY; // convert back to world Y
          return (
            <text key={`ly${svgY}`} x={viewBox.x + 0.15} y={svgY + 0.05}
              textAnchor="start" fill="hsl(var(--muted-foreground))" fontSize={0.15}
              fontFamily="monospace" opacity={0.5}>
              {worldY}
            </text>
          );
        })}
      </svg>

      {/* Selected element info panel */}
      {selectedElement && !isGroundLevel && (
        <div className="absolute bottom-2 right-2 bg-card/95 backdrop-blur-sm border border-border rounded-lg p-3 text-xs shadow-md" dir="rtl">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-[10px]">
              {selectedElement.type === 'beam' ? 'جسر' : selectedElement.type === 'column' ? 'عمود' : 'بلاطة'}
            </Badge>
            <span className="font-bold font-mono">{selectedElement.id}</span>
          </div>
          {selectedElement.type === 'beam' && (() => {
            const b = beamsAtLevel.find(bm => bm.id === selectedElement.id);
            if (!b) return null;
            return (
              <div className="text-[10px] text-muted-foreground mt-1 space-y-0.5 font-mono">
                <div>من: ({b.x1.toFixed(2)}, {b.y1.toFixed(2)}) → ({b.x2.toFixed(2)}, {b.y2.toFixed(2)})</div>
                <div>الأبعاد: {b.b}×{b.h} مم | طول: {Math.sqrt((b.x2-b.x1)**2+(b.y2-b.y1)**2).toFixed(2)} م</div>
              </div>
            );
          })()}
          <Button size="sm" variant="outline" className="h-7 text-[10px] mt-2 w-full"
            onClick={() => {
              openElementLocalDialog(selectedElement.type, selectedElement.id);
            }}>
            عرض/تعديل الخصائص
          </Button>
        </div>
      )}

      {/* Element properties dialog */}
      <Dialog open={editDialog.open} onOpenChange={handleEditDialogClose}>
        <DialogContent className="max-w-sm w-[calc(100%-16px)] max-h-[82dvh] flex flex-col overflow-hidden" dir="rtl">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              خصائص {editDialog.type === 'beam' ? 'الجسر' : editDialog.type === 'column' ? 'العمود' : 'البلاطة'} {editDialog.label}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              تعديل خصائص وأبعاد العنصر
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 overflow-y-auto flex-1 min-h-0">
            {(editDialog.type === 'beam' || editDialog.type === 'column') && (
              <>
                <div className="text-sm font-semibold">الأبعاد (مم)</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">العرض b</label>
                    <Input type="number" value={editDialog.b}
                      onChange={e => setEditDialog(prev => ({ ...prev, b: Number(e.target.value) }))}
                      className="h-9 font-mono text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">الارتفاع h</label>
                    <Input type="number" value={editDialog.h}
                      onChange={e => setEditDialog(prev => ({ ...prev, h: Number(e.target.value) }))}
                      className="h-9 font-mono text-sm" />
                  </div>
                </div>
                {editDialog.type === 'beam' && (
                  <div className="text-xs text-muted-foreground">
                    الطول: <span className="font-mono">{editDialog.length.toFixed(2)} م</span>
                  </div>
                )}
                {editDialog.type === 'column' && editDialog.b !== editDialog.h && (
                  <div className="pt-1">
                    <button
                      type="button"
                      className={`w-full flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors min-h-[40px] ${
                        (((editDialog.orientAngle % 360) + 360) % 360) >= 45 && (((editDialog.orientAngle % 360) + 360) % 360) < 135
                          ? 'border-orange-400 bg-orange-500 text-white hover:bg-orange-600'
                          : 'border-border hover:bg-accent/30'
                      }`}
                      onClick={() => {
                        const cur = editDialog.orientAngle ?? 0;
                        const isNow90 = (((cur % 360) + 360) % 360) >= 45 && (((cur % 360) + 360) % 360) < 135;
                        setEditDialog(prev => ({ ...prev, orientAngle: isNow90 ? 0 : 90 }));
                      }}
                    >
                      🔄 {(((editDialog.orientAngle % 360) + 360) % 360) >= 45 && (((editDialog.orientAngle % 360) + 360) % 360) < 135
                        ? `مدوَّر 90° — اضغط للإلغاء (فعلي: ${editDialog.h}×${editDialog.b} مم)`
                        : `تدوير العمود 90° (فعلي: ${editDialog.b}×${editDialog.h} مم)`
                      }
                    </button>
                  </div>
                )}
                {editDialog.type === 'column' && stories.length > 1 && (
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox
                      id="applyToUpperFloors"
                      checked={applyToUpperFloors}
                      onCheckedChange={v => setApplyToUpperFloors(!!v)}
                    />
                    <label htmlFor="applyToUpperFloors" className="text-xs text-muted-foreground cursor-pointer">
                      تطبيق الأبعاد على نفس الموقع في جميع الأدوار
                    </label>
                  </div>
                )}
              </>
            )}
            {editDialog.type === 'slab' && (
              <div className="space-y-2">
                <div className="text-sm font-semibold">خصائص البلاطة</div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">السماكة (مم)</label>
                  <Input type="number" value={editDialog.thickness}
                    onChange={e => setEditDialog(prev => ({ ...prev, thickness: Number(e.target.value) }))}
                    className="h-9 font-mono text-sm" />
                </div>
              </div>
            )}
            {editDialog.type === 'column' && (
              <div className="space-y-2">
                <div className="text-sm font-semibold">شروط الأطراف</div>
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">أسفل العمود</label>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 h-8 text-xs"
                        variant={editDialog.bottomEnd === 'F' ? 'default' : 'outline'}
                        onClick={() => setEditDialog(prev => ({ ...prev, bottomEnd: 'F' }))}>
                        🔒 ثابت
                      </Button>
                      <Button size="sm" className="flex-1 h-8 text-xs"
                        variant={editDialog.bottomEnd === 'P' ? 'default' : 'outline'}
                        onClick={() => setEditDialog(prev => ({ ...prev, bottomEnd: 'P' }))}>
                        📌 مفصلي
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">أعلى العمود</label>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 h-8 text-xs"
                        variant={editDialog.topEnd === 'F' ? 'default' : 'outline'}
                        onClick={() => setEditDialog(prev => ({ ...prev, topEnd: 'F' }))}>
                        🔒 ثابت
                      </Button>
                      <Button size="sm" className="flex-1 h-8 text-xs"
                        variant={editDialog.topEnd === 'P' ? 'default' : 'outline'}
                        onClick={() => setEditDialog(prev => ({ ...prev, topEnd: 'P' }))}>
                        📌 مفصلي
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* DOF Release toggles for beams and columns */}
            {(editDialog.type === 'beam' || editDialog.type === 'column') && (
              <>
                <div className="space-y-2 mt-3">
                  <div className="text-sm font-semibold">درجات تحرير الطرف I</div>
                  <div className="grid grid-cols-3 gap-2 bg-muted/50 rounded-lg p-3">
                    {(['ux', 'uy', 'uz', 'rx', 'ry', 'rz'] as const).map(dof => (
                      <div key={`i-${dof}`} className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono">{dof.toUpperCase()}</span>
                        <Switch
                          checked={editDialog.releaseI[dof]}
                          onCheckedChange={v => setEditDialog(prev => ({
                            ...prev,
                            releaseI: { ...prev.releaseI, [dof]: v }
                          }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold">درجات تحرير الطرف J</div>
                  <div className="grid grid-cols-3 gap-2 bg-muted/50 rounded-lg p-3">
                    {(['ux', 'uy', 'uz', 'rx', 'ry', 'rz'] as const).map(dof => (
                      <div key={`j-${dof}`} className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono">{dof.toUpperCase()}</span>
                        <Switch
                          checked={editDialog.releaseJ[dof]}
                          onCheckedChange={v => setEditDialog(prev => ({
                            ...prev,
                            releaseJ: { ...prev.releaseJ, [dof]: v }
                          }))}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    تشغيل = مقيد (Restrained) • إيقاف = حر (Free)
                  </p>
                </div>
              </>
            )}
          </div>

          {confirmDelete && (
            <div className="bg-destructive/10 border border-destructive/40 rounded-lg p-3 mx-0 mb-2">
              <p className="text-sm text-destructive font-medium text-center">
                ⚠️ هل أنت متأكد من حذف {editDialog.type === 'beam' ? 'الجسر' : editDialog.type === 'column' ? 'العمود' : 'البلاطة'} {editDialog.label}؟
              </p>
              <p className="text-xs text-muted-foreground text-center mt-1">اضغط زر الحذف مرة أخرى للتأكيد</p>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 shrink-0 border-t pt-3 mt-1">
            {onDeleteElement && (
              <Button
                variant={confirmDelete ? 'destructive' : 'outline'}
                size="sm"
                className={`w-full min-h-[44px] ${confirmDelete ? '' : 'border-destructive/50 text-destructive hover:bg-destructive/10'}`}
                onClick={handleDeleteClick}
              >
                {confirmDelete ? '⚠️ تأكيد الحذف' : '🗑️ حذف العنصر'}
              </Button>
            )}
            <div className="flex gap-2 w-full">
              <Button variant="outline" size="sm" className="flex-1 min-h-[44px]" onClick={() => { setConfirmDelete(false); setEditDialog(prev => ({ ...prev, open: false })); }}>
                إلغاء
              </Button>
              <Button size="sm" className="flex-1 min-h-[44px]" onClick={handleEditSave}>
                حفظ التغييرات
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Support change dialog (ground level) */}
      <Dialog open={supportDialog.open} onOpenChange={open => setSupportDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-sm w-[calc(100%-16px)] max-h-[82dvh] flex flex-col overflow-hidden" dir="rtl">
          <DialogHeader className="shrink-0">
            <DialogTitle>خصائص الركيزة - {supportDialog.colLabel}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              الموقع ({supportDialog.x.toFixed(1)}, {supportDialog.y.toFixed(1)}) - تعديل درجات الحرية
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1 min-h-0">
            {/* Quick presets */}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 text-xs h-9"
                onClick={() => setSupportDialog(prev => ({
                  ...prev,
                  restraints: { ux: true, uy: true, uz: true, rx: true, ry: true, rz: true }
                }))}>
                🔒 ثابت (Fixed)
              </Button>
              <Button size="sm" variant="outline" className="flex-1 text-xs h-9"
                onClick={() => setSupportDialog(prev => ({
                  ...prev,
                  restraints: { ux: true, uy: true, uz: true, rx: false, ry: false, rz: false }
                }))}>
                📌 مفصلي (Pinned)
              </Button>
            </div>

            {/* Per-DOF toggles */}
            <div className="space-y-2">
              <label className="text-sm font-medium">درجات الحرية (الركيزة)</label>
              <div className="grid grid-cols-3 gap-2 bg-muted/50 rounded-lg p-3">
                {(['ux', 'uy', 'uz', 'rx', 'ry', 'rz'] as const).map(dof => (
                  <div key={dof} className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono">{dof.toUpperCase()}</span>
                    <Switch
                      checked={supportDialog.restraints[dof]}
                      onCheckedChange={v => setSupportDialog(prev => ({
                        ...prev,
                        restraints: { ...prev.restraints, [dof]: v }
                      }))}
                    />
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                تشغيل = مقيد (Restrained) • إيقاف = حر (Free)
              </p>
            </div>

            {/* Apply to all checkbox */}
            <div className="flex items-center gap-2 border-t pt-3 border-border">
              <Checkbox
                id="apply-all-supports"
                checked={supportDialog.applyToAll}
                onCheckedChange={(v) => setSupportDialog(prev => ({ ...prev, applyToAll: !!v }))}
              />
              <label htmlFor="apply-all-supports" className="text-xs cursor-pointer">
                تعميم على جميع الركائز عند هذا المنسوب
              </label>
            </div>

            {/* Summary */}
            <div className="border rounded p-2 bg-muted/50 text-xs space-y-1 border-border">
              <div className="font-medium">ملخص الركيزة:</div>
              <div>
                {supportDialog.restraints.ux && supportDialog.restraints.uy && supportDialog.restraints.uz &&
                 supportDialog.restraints.rx && supportDialog.restraints.ry && supportDialog.restraints.rz
                  ? <Badge variant="default">ثابت (Fixed) - جميع DOFs مقيدة</Badge>
                  : supportDialog.restraints.ux && supportDialog.restraints.uy && supportDialog.restraints.uz &&
                    !supportDialog.restraints.rx && !supportDialog.restraints.ry && !supportDialog.restraints.rz
                  ? <Badge variant="secondary">مفصلي (Pinned) - الإزاحات مقيدة</Badge>
                  : <Badge variant="outline">مخصص (Custom)</Badge>
                }
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 shrink-0 border-t pt-3 mt-1">
            <Button variant="outline" size="sm" className="flex-1 min-h-[44px]" onClick={() => setSupportDialog(prev => ({ ...prev, open: false }))}>
              إلغاء
            </Button>
            <Button size="sm" className="flex-1 min-h-[44px]" onClick={handleSupportSave}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
