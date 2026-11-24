import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Cpu,
  ListChecks,
  Maximize2,
  Network,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  CubeSatTask,
  OnboardProgram,
  Subsystem,
} from '../types/cubesat.ts';

interface SubsystemArchitectureGraphProps {
  projectName: string;
  tasks: CubeSatTask[];
  programs: OnboardProgram[];
  onOpenSubsystemTasks: (subsystem: Subsystem) => void;
  onOpenSubsystemMBlock: (subsystem: Subsystem) => void;
}

type LinkKind = 'power' | 'data' | 'rf' | 'task';
type LinkFilter = 'all' | LinkKind;
type GraphLayoutMode = 'schematic' | 'force';

interface SubsystemNodeSpec {
  id: Subsystem;
  title: string;
  shortTitle: string;
  role: string;
  hardware: string;
  bus: string;
  powerSpec: string;
  accent: string;
  schematicX: number;
  schematicY: number;
}

interface ArchEdgeSpec {
  id: string;
  source: Subsystem;
  target: Subsystem;
  kind: LinkKind;
  label: string;
  protocol: string;
  bidirectional?: boolean;
  taskRefs?: string[];
}

interface SimNode extends d3.SimulationNodeDatum {
  id: Subsystem;
  spec: SubsystemNodeSpec;
  totalTasks: number;
  doneTasks: number;
  inProgressTasks: number;
  reviewTasks: number;
  readinessPct: number;
  programsCount: number;
  x: number;
  y: number;
}

interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  id: string;
  kind: LinkKind;
  label: string;
  protocol: string;
  bidirectional?: boolean;
  taskRefs?: string[];
  curveOffset: number;
}

const CANVAS_W = 820;
const CANVAS_H = 440;

const SUBSYSTEM_NODES: SubsystemNodeSpec[] = [
  {
    id: 'EPS',
    title: 'Система энергопитания',
    shortTitle: 'Энергопитание',
    role: 'Генерация MPPT, АКБ 2S Li-Ion и коммутация шин 3.3В / 5В',
    hardware: '2S Li-Ion 5200 мАч · 5× фотопанелей GaAs · INA219',
    bus: 'I2C телеметрия · 3 управляемых ключа нагрузки',
    powerSpec: '7.4 В номин. · до 2.6 Вт',
    accent: '#d97706',
    schematicX: 140,
    schematicY: 220,
  },
  {
    id: 'OBC',
    title: 'Бортовой компьютер',
    shortTitle: 'Бортовой ПК',
    role: 'Центральный контроллер режимов, FreeRTOS/mBlock и Watchdog',
    hardware: 'STM32F405 / ESP32-S3 · FRAM журнал',
    bus: 'SPI · I2C · UART · CAN · GPIO',
    powerSpec: '3.3 В · ~180 мА номин.',
    accent: '#0284c7',
    schematicX: 390,
    schematicY: 220,
  },
  {
    id: 'ADCS',
    title: 'Ориентация и стабилизация',
    shortTitle: 'ADCS B-dot',
    role: 'Измерение угловой скорости IMU и демпфирование катушками',
    hardware: 'IMU 9-DOF · 6× солнечных датчиков · 3× МТК',
    bus: 'I2C (IMU) · 3× H-Bridge ШИМ',
    powerSpec: '5.0 В (ADCS_5V) · до 240 мА',
    accent: '#7c3aed',
    schematicX: 390,
    schematicY: 82,
  },
  {
    id: 'PAYLOAD',
    title: 'Полезная нагрузка',
    shortTitle: 'Камера ДЗЗ',
    role: 'Съёмка Земли по команде и сцинтилляционный дозиметр',
    hardware: 'Камера 1280×720 · Счётчик частиц · SD-буфер',
    bus: 'DCMI / SPI · Питание по порогу SoC > 45%',
    powerSpec: '5.0 В (PAYLOAD_5V) · 360 мА пик',
    accent: '#e11d48',
    schematicX: 390,
    schematicY: 358,
  },
  {
    id: 'COMMS',
    title: 'Командная радиолиния',
    shortTitle: 'Радио UHF',
    role: 'Приём радиокоманд с Земли и передача маяков AX.25',
    hardware: 'Трансивер 435.800 МГц · Диполь · УМ 10/20/27 дБм',
    bus: 'SPI / UART (AX.25 пакеты)',
    powerSpec: '3.3 В (COMMS_3V3) · пик 480 мА',
    accent: '#059669',
    schematicX: 590,
    schematicY: 220,
  },
  {
    id: 'GROUND',
    title: 'Наземный сегмент',
    shortTitle: 'Станция SDR',
    role: 'Приём телеметрии на Яги, декодер и отправка команд ТК',
    hardware: 'UHF-SDR приёмник · Поворотное устройство Яги',
    bus: 'UHF 435.800 МГц · TLE орбитальный трекинг',
    powerSpec: 'Наземное питание 220 В / 12 В',
    accent: '#475569',
    schematicX: 735,
    schematicY: 220,
  },
];

const STATIC_ARCH_EDGES: ArchEdgeSpec[] = [
  {
    id: 'e-eps-obc',
    source: 'EPS',
    target: 'OBC',
    kind: 'power',
    label: 'Питание 3.3В',
    protocol: 'DC-DC LDO 3.3 В + контроль brownout',
  },
  {
    id: 'e-eps-adcs',
    source: 'EPS',
    target: 'ADCS',
    kind: 'power',
    label: 'ADCS_5V',
    protocol: 'Силовая шина 5.0 В для драйверов катушек',
  },
  {
    id: 'e-eps-payload',
    source: 'EPS',
    target: 'PAYLOAD',
    kind: 'power',
    label: 'PAYLOAD_5V',
    protocol: 'Ключ питания камеры (откл. в SAFE)',
  },
  {
    id: 'e-eps-comms',
    source: 'EPS',
    target: 'COMMS',
    kind: 'power',
    label: 'COMMS_3V3',
    protocol: 'Шина 3.3 В трансивера AX.25',
  },
  {
    id: 'e-obc-eps',
    source: 'OBC',
    target: 'EPS',
    kind: 'data',
    label: 'I2C / Ключи шин',
    protocol: 'Опрос INA219 (SoC, В, мА) и setRail/setHeater',
  },
  {
    id: 'e-obc-adcs',
    source: 'OBC',
    target: 'ADCS',
    kind: 'data',
    label: 'I2C + ШИМ B-dot',
    protocol: 'Чтение IMU/Солнца и управление магнитными катушками',
    bidirectional: true,
  },
  {
    id: 'e-obc-payload',
    source: 'OBC',
    target: 'PAYLOAD',
    kind: 'data',
    label: 'DCMI / SPI ДЗЗ',
    protocol: 'Команда CAPTURE и чтение дозиметра/температуры',
    bidirectional: true,
  },
  {
    id: 'e-obc-comms',
    source: 'OBC',
    target: 'COMMS',
    kind: 'data',
    label: 'SPI / UART TLM',
    protocol: 'Отправка маяка/TLM и обработка входящих ТК',
    bidirectional: true,
  },
  {
    id: 'e-comms-ground',
    source: 'COMMS',
    target: 'GROUND',
    kind: 'rf',
    label: 'UHF 435.8 МГц',
    protocol: 'Радиоканал AX.25 (телеметрия вниз / команды вверх)',
    bidirectional: true,
  },
];

const LINK_STYLE: Record<LinkKind, { stroke: string; dash: string; label: string }> = {
  power: { stroke: '#d97706', dash: '6,3', label: 'Питание EPS' },
  data: { stroke: '#0284c7', dash: 'none', label: 'Шины данных OBC' },
  rf: { stroke: '#059669', dash: 'none', label: 'Радиоканал RF' },
  task: { stroke: '#7c3aed', dash: '3,3', label: 'Блокеры задач' },
};

export const SubsystemArchitectureGraph: React.FC<SubsystemArchitectureGraphProps> = ({
  projectName,
  tasks,
  programs,
  onOpenSubsystemTasks,
  onOpenSubsystemMBlock,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const [selectedId, setSelectedId] = useState<Subsystem>('OBC');
  const [hoveredId, setHoveredId] = useState<Subsystem | null>(null);
  const [layoutMode, setLayoutMode] = useState<GraphLayoutMode>('schematic');
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all');

  // Build subsystem statistics + cross-subsystem task dependency edges
  const { nodeStatsMap, allEdges } = useMemo(() => {
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const statsMap = new Map<
      Subsystem,
      {
        total: number;
        done: number;
        inProgress: number;
        review: number;
        pct: number;
        programsCount: number;
      }
    >();

    for (const spec of SUBSYSTEM_NODES) {
      const subTasks = tasks.filter((t) => t.subsystem === spec.id);
      const total = subTasks.length;
      const done = subTasks.filter((t) => t.status === 'done').length;
      const inProgress = subTasks.filter((t) => t.status === 'in_progress').length;
      const review = subTasks.filter((t) => t.status === 'review').length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const programsCount = programs.filter((p) => p.subsystem === spec.id).length;
      statsMap.set(spec.id, { total, done, inProgress, review, pct, programsCount });
    }

    // Group task.dependsOn across different subsystems
    const taskDepPairs = new Map<string, { source: Subsystem; target: Subsystem; refs: string[] }>();
    for (const task of tasks) {
      if (!task.dependsOn || task.dependsOn.length === 0) continue;
      for (const depId of task.dependsOn) {
        const prereq = taskById.get(depId);
        if (!prereq || prereq.subsystem === task.subsystem) continue;
        const key = `${prereq.subsystem}->${task.subsystem}`;
        const existing = taskDepPairs.get(key);
        const refLabel = `${prereq.id} → ${task.id}`;
        if (existing) {
          existing.refs.push(refLabel);
        } else {
          taskDepPairs.set(key, {
            source: prereq.subsystem,
            target: task.subsystem,
            refs: [refLabel],
          });
        }
      }
    }

    const dynamicTaskEdges: ArchEdgeSpec[] = Array.from(taskDepPairs.entries()).map(
      ([key, info]) => ({
        id: `taskdep-${key}`,
        source: info.source,
        target: info.target,
        kind: 'task',
        label: info.refs.length === 1 ? info.refs[0] : `${info.refs.length} блок. задач`,
        protocol: `Зависимость выполнения задач: ${info.refs.join(', ')}`,
        taskRefs: info.refs,
      })
    );

    return {
      nodeStatsMap: statsMap,
      allEdges: [...STATIC_ARCH_EDGES, ...dynamicTaskEdges],
    };
  }, [tasks, programs]);

  const visibleEdges = useMemo(
    () =>
      linkFilter === 'all'
        ? allEdges
        : allEdges.filter((e) => e.kind === linkFilter),
    [allEdges, linkFilter]
  );

  // D3 rendering & simulation effect
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    // Defs: grid pattern & directional arrowheads per link kind
    const defs = svg.append('defs');

    const grid = defs
      .append('pattern')
      .attr('id', 'cubesat-arch-grid')
      .attr('width', 24)
      .attr('height', 24)
      .attr('patternUnits', 'userSpaceOnUse');
    grid
      .append('circle')
      .attr('cx', 12)
      .attr('cy', 12)
      .attr('r', 0.9)
      .attr('fill', '#cbd5e1');

    (Object.keys(LINK_STYLE) as LinkKind[]).forEach((kind) => {
      defs
        .append('marker')
        .attr('id', `arch-arrow-${kind}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 8)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-4.5L9,0L0,4.5Z')
        .attr('fill', LINK_STYLE[kind].stroke);
    });

    // Background grid rect
    svg
      .append('rect')
      .attr('width', CANVAS_W)
      .attr('height', CANVAS_H)
      .attr('fill', '#f8fafc');
    svg
      .append('rect')
      .attr('width', CANVAS_W)
      .attr('height', CANVAS_H)
      .attr('fill', 'url(#cubesat-arch-grid)');

    const viewport = svg.append('g').attr('class', 'arch-viewport');

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.65, 2.2])
      .on('zoom', (event) => {
        viewport.attr('transform', event.transform.toString());
      });
    zoomBehaviorRef.current = zoom;
    svg.call(zoom);

    const nodes: SimNode[] = SUBSYSTEM_NODES.map((spec) => {
      const st = nodeStatsMap.get(spec.id);
      return {
        id: spec.id,
        spec,
        totalTasks: st?.total ?? 0,
        doneTasks: st?.done ?? 0,
        inProgressTasks: st?.inProgress ?? 0,
        reviewTasks: st?.review ?? 0,
        readinessPct: st?.pct ?? 0,
        programsCount: st?.programsCount ?? 0,
        x: spec.schematicX,
        y: spec.schematicY,
      };
    });

    // Compute subtle curve offsets for parallel / opposing edges between the same pair
    const pairCount = new Map<string, number>();
    const edges: SimEdge[] = visibleEdges.map((e) => {
      const pairKey = [e.source, e.target].sort().join('::');
      const idx = pairCount.get(pairKey) || 0;
      pairCount.set(pairKey, idx + 1);
      const offsetPattern = [0, 26, -26, 46, -46];
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        kind: e.kind,
        label: e.label,
        protocol: e.protocol,
        bidirectional: e.bidirectional,
        taskRefs: e.taskRefs,
        curveOffset: offsetPattern[idx % offsetPattern.length],
      };
    });

    const nodeRadius = 38;

    const linkGroup = viewport.append('g').attr('class', 'arch-links');
    const linkItems = linkGroup
      .selectAll<SVGGElement, SimEdge>('g.arch-link')
      .data(edges, (d) => d.id)
      .join('g')
      .attr('class', 'arch-link');

    const linkPaths = linkItems
      .append('path')
      .attr('fill', 'none')
      .attr('stroke', (d) => LINK_STYLE[d.kind].stroke)
      .attr('stroke-width', (d) => (d.kind === 'task' ? 1.8 : 2))
      .attr('stroke-dasharray', (d) => LINK_STYLE[d.kind].dash)
      .attr('marker-end', (d) => `url(#arch-arrow-${d.kind})`);

    linkItems.append('title').text((d) => `${d.label}: ${d.protocol}`);

    const linkLabels = linkItems
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', -4)
      .attr('font-size', '9.5px')
      .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace')
      .attr('fill', '#475569')
      .attr('paint-order', 'stroke')
      .attr('stroke', '#f8fafc')
      .attr('stroke-width', 3.5)
      .text((d) => d.label);

    const nodeGroup = viewport.append('g').attr('class', 'arch-nodes');
    const nodeItems = nodeGroup
      .selectAll<SVGGElement, SimNode>('g.arch-node')
      .data(nodes, (d) => d.id)
      .join('g')
      .attr('class', 'arch-node')
      .style('cursor', layoutMode === 'force' ? 'grab' : 'pointer');

    // Outer focus ring when selected
    nodeItems
      .append('circle')
      .attr('class', 'node-focus-ring')
      .attr('r', nodeRadius + 7)
      .attr('fill', 'none')
      .attr('stroke', (d) => d.spec.accent)
      .attr('stroke-width', 1.8)
      .attr('stroke-dasharray', '4,3')
      .attr('opacity', 0);

    // Base node plate
    nodeItems
      .append('circle')
      .attr('r', nodeRadius)
      .attr('fill', '#ffffff')
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 1.5);

    // Track ring for readiness
    const bgArc = d3
      .arc<{ startAngle: number; endAngle: number }>()
      .innerRadius(nodeRadius - 5)
      .outerRadius(nodeRadius - 1)
      .startAngle(0)
      .endAngle(Math.PI * 2);

    nodeItems
      .append('path')
      .attr('d', bgArc({ startAngle: 0, endAngle: Math.PI * 2 }) || '')
      .attr('fill', '#e2e8f0');

    // D3 progress arc based on subsystem task completion %
    const progArc = d3
      .arc<SimNode>()
      .innerRadius(nodeRadius - 5)
      .outerRadius(nodeRadius - 1)
      .startAngle(0)
      .endAngle((d) => (d.readinessPct / 100) * Math.PI * 2);

    nodeItems
      .append('path')
      .attr('d', (d) => progArc(d) || '')
      .attr('fill', (d) => (d.readinessPct === 100 ? '#059669' : d.spec.accent));

    // Subsystem ID badge inside circle
    nodeItems
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('y', -3)
      .attr('font-size', '12px')
      .attr('font-weight', '700')
      .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace')
      .attr('fill', '#0f172a')
      .text((d) => d.id);

    // Task readiness label inside circle
    nodeItems
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('y', 13)
      .attr('font-size', '10px')
      .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace')
      .attr('fill', '#64748b')
      .text((d) => `${d.doneTasks}/${d.totalTasks}`);

    // Subsystem Russian label below node
    nodeItems
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('y', nodeRadius + 16)
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('fill', '#1e293b')
      .attr('paint-order', 'stroke')
      .attr('stroke', '#f8fafc')
      .attr('stroke-width', 3.5)
      .text((d) => d.spec.shortTitle);

    nodeItems
      .on('click', (_event, d) => {
        setSelectedId(d.id);
      })
      .on('mouseenter', (_event, d) => {
        setHoveredId(d.id);
      })
      .on('mouseleave', () => {
        setHoveredId(null);
      });

    const updatePositions = () => {
      linkPaths.attr('d', (d) => {
        const s = typeof d.source === 'object' ? d.source : nodes.find((n) => n.id === d.source)!;
        const t = typeof d.target === 'object' ? d.target : nodes.find((n) => n.id === d.target)!;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = -dy / dist;
        const ny = dx / dist;

        const pad = nodeRadius + 6;
        const sx = s.x + (dx / dist) * pad;
        const sy = s.y + (dy / dist) * pad;
        const tx = t.x - (dx / dist) * (pad + 3);
        const ty = t.y - (dy / dist) * (pad + 3);

        const cx = (sx + tx) / 2 + nx * d.curveOffset;
        const cy = (sy + ty) / 2 + ny * d.curveOffset;

        return `M${sx.toFixed(1)},${sy.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)}`;
      });

      linkLabels.attr('x', (d) => {
        const s = typeof d.source === 'object' ? d.source : nodes.find((n) => n.id === d.source)!;
        const t = typeof d.target === 'object' ? d.target : nodes.find((n) => n.id === d.target)!;
        const dy = t.y - s.y;
        const dx = t.x - s.x;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = -dy / dist;
        return ((s.x + t.x) / 2 + nx * (d.curveOffset * 0.65)).toFixed(1);
      });

      linkLabels.attr('y', (d) => {
        const s = typeof d.source === 'object' ? d.source : nodes.find((n) => n.id === d.source)!;
        const t = typeof d.target === 'object' ? d.target : nodes.find((n) => n.id === d.target)!;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.hypot(dx, dy) || 1;
        const ny = dx / dist;
        return ((s.y + t.y) / 2 + ny * (d.curveOffset * 0.65)).toFixed(1);
      });

      nodeItems.attr('transform', (d) => `translate(${d.x.toFixed(1)},${d.y.toFixed(1)})`);
    };

    let simulation: d3.Simulation<SimNode, SimEdge> | null = null;

    if (layoutMode === 'force') {
      simulation = d3
        .forceSimulation<SimNode>(nodes)
        .force(
          'link',
          d3
            .forceLink<SimNode, SimEdge>(edges)
            .id((d) => d.id)
            .distance(170)
            .strength(0.55)
        )
        .force('charge', d3.forceManyBody().strength(-760))
        .force('center', d3.forceCenter(CANVAS_W / 2, CANVAS_H / 2))
        .force('collide', d3.forceCollide<SimNode>().radius(74))
        .on('tick', () => {
          nodes.forEach((n) => {
            n.x = Math.max(60, Math.min(CANVAS_W - 60, n.x));
            n.y = Math.max(54, Math.min(CANVAS_H - 60, n.y));
          });
          updatePositions();
        });

      const dragBehavior = d3
        .drag<SVGGElement, SimNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation?.alphaTarget(0.28).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = Math.max(60, Math.min(CANVAS_W - 60, event.x));
          d.fy = Math.max(54, Math.min(CANVAS_H - 60, event.y));
        })
        .on('end', (event, d) => {
          if (!event.active) simulation?.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        });

      nodeItems.call(dragBehavior);
    } else {
      updatePositions();
    }

    return () => {
      simulation?.stop();
      svg.on('.zoom', null);
    };
  }, [nodeStatsMap, visibleEdges, layoutMode]);

  // Lightweight highlight update on selection / hover without rebuilding force simulation
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const svg = d3.select(svgEl);
    const activeFocus = hoveredId || selectedId;

    const connectedNodes = new Set<Subsystem>([activeFocus]);
    for (const e of visibleEdges) {
      if (e.source === activeFocus) connectedNodes.add(e.target);
      if (e.target === activeFocus) connectedNodes.add(e.source);
    }

    svg
      .selectAll<SVGGElement, SimNode>('g.arch-node')
      .transition()
      .duration(150)
      .style('opacity', (d) => (connectedNodes.has(d.id) ? 1 : 0.35));

    svg
      .selectAll<SVGGElement, SimNode>('g.arch-node')
      .select<SVGCircleElement>('circle.node-focus-ring')
      .transition()
      .duration(150)
      .attr('opacity', (d) => (d.id === selectedId ? 1 : 0));

    svg
      .selectAll<SVGGElement, SimEdge>('g.arch-link')
      .transition()
      .duration(150)
      .style('opacity', (d) => {
        const sId = typeof d.source === 'object' ? d.source.id : d.source;
        const tId = typeof d.target === 'object' ? d.target.id : d.target;
        return sId === activeFocus || tId === activeFocus ? 1 : 0.18;
      });
  }, [selectedId, hoveredId, visibleEdges]);

  const handleZoomStep = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(200)
      .call(zoomBehaviorRef.current.scaleBy, factor);
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(220)
      .call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
  };

  const selectedSpec =
    SUBSYSTEM_NODES.find((n) => n.id === selectedId) || SUBSYSTEM_NODES[1];
  const selectedStats = nodeStatsMap.get(selectedSpec.id) || {
    total: 0,
    done: 0,
    inProgress: 0,
    review: 0,
    pct: 0,
    programsCount: 0,
  };

  const incomingDeps = allEdges.filter(
    (e) => e.target === selectedSpec.id || (e.bidirectional && e.source === selectedSpec.id)
  );
  const outgoingDeps = allEdges.filter(
    (e) => e.source === selectedSpec.id || (e.bidirectional && e.target === selectedSpec.id)
  );

  return (
    <section
      aria-label="Схема архитектуры и зависимостей подсистем кубсата"
      className="bg-white border border-slate-200 rounded-lg overflow-hidden"
    >
      {/* Toolbar */}
      <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-sky-600 shrink-0" />
            <h2 className="text-sm font-bold text-slate-900">
              Архитектура и зависимости подсистем · {projectName}
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Интерактивная D3-схема энергошин, интерфейсов OBC/COMMS и зависимостей задач. Нажмите на узел для инспекции.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Layer Filter */}
          <div className="flex items-center p-0.5 bg-slate-100 border border-slate-200 rounded-md text-[11px]">
            {(
              [
                ['all', 'Все связи'],
                ['power', 'Питание'],
                ['data', 'Данные'],
                ['rf', 'RF'],
                ['task', 'Задачи'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setLinkFilter(k)}
                className={`px-2.5 py-1 font-medium rounded transition-colors whitespace-nowrap ${
                  linkFilter === k
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Layout Switch */}
          <div className="flex items-center p-0.5 bg-slate-100 border border-slate-200 rounded-md text-[11px]">
            <button
              type="button"
              onClick={() => setLayoutMode('schematic')}
              className={`px-2.5 py-1 font-medium rounded transition-colors whitespace-nowrap ${
                layoutMode === 'schematic'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Схема шин
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('force')}
              className={`px-2.5 py-1 font-medium rounded transition-colors whitespace-nowrap ${
                layoutMode === 'force'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Силовой граф
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center border border-slate-200 rounded-md bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => handleZoomStep(1.2)}
              title="Приблизить схему"
              className="p-1.5 text-slate-600 hover:bg-slate-50 border-r border-slate-200"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleZoomStep(0.84)}
              title="Отдалить схему"
              className="p-1.5 text-slate-600 hover:bg-slate-50 border-r border-slate-200"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              title="Сбросить масштаб"
              className="p-1.5 text-slate-600 hover:bg-slate-50"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Split Stage: D3 SVG Canvas + Subsystem Dependency Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        {/* Left: D3 Graph Canvas */}
        <div className="lg:col-span-8 flex flex-col bg-slate-50">
          <div className="relative w-full overflow-hidden">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
              className="w-full h-[360px] sm:h-[420px] select-none block"
              role="img"
              aria-label="Диаграмма зависимостей подсистем кубсата 1U"
            />
          </div>

          {/* Legend */}
          <div className="px-4 py-2.5 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-600">
            <div className="flex flex-wrap items-center gap-4">
              {(Object.keys(LINK_STYLE) as LinkKind[]).map((kind) => (
                <div key={kind} className="inline-flex items-center gap-1.5">
                  <svg width="22" height="8" aria-hidden="true">
                    <line
                      x1="0"
                      y1="4"
                      x2="22"
                      y2="4"
                      stroke={LINK_STYLE[kind].stroke}
                      strokeWidth="2"
                      strokeDasharray={
                        LINK_STYLE[kind].dash === 'none' ? undefined : LINK_STYLE[kind].dash
                      }
                    />
                  </svg>
                  <span>{LINK_STYLE[kind].label}</span>
                </div>
              ))}
            </div>
            <span className="font-mono text-[10px] text-slate-400">
              {layoutMode === 'force'
                ? 'Узлы можно перетаскивать мышью'
                : 'Кольцо вокруг узла = % выполненных задач'}
            </span>
          </div>
        </div>

        {/* Right: Selected Subsystem Dependency Inspector */}
        <aside className="lg:col-span-4 p-5 bg-white flex flex-col justify-between gap-4">
          <div className="space-y-4">
            {/* Subsystem Quick Selector */}
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
                  <span
                    className="font-bold"
                    style={{ color: selectedSpec.accent }}
                  >
                    {selectedSpec.id}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    Готовность {selectedStats.pct}%
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  {selectedSpec.title}
                </h3>
              </div>
              <div className="text-right font-mono tabular-nums shrink-0">
                <div className="text-lg font-bold text-slate-900">
                  {selectedStats.done}/{selectedStats.total}
                </div>
                <div className="text-[10px] text-slate-500">задач</div>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {selectedSpec.role}
            </p>

            {/* Hardware Spec */}
            <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-1.5 text-[11px]">
              <div>
                <span className="text-slate-500">Аппаратура: </span>
                <span className="text-slate-800 font-medium">{selectedSpec.hardware}</span>
              </div>
              <div>
                <span className="text-slate-500">Интерфейсы: </span>
                <span className="font-mono text-slate-800">{selectedSpec.bus}</span>
              </div>
              <div>
                <span className="text-slate-500">Питание: </span>
                <span className="font-mono text-slate-800">{selectedSpec.powerSpec}</span>
              </div>
            </div>

            {/* Incoming Dependencies */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                <ArrowDownLeft className="w-3.5 h-3.5 text-amber-600" />
                Зависит от ({incomingDeps.length})
              </div>
              {incomingDeps.length === 0 ? (
                <div className="text-[11px] text-slate-400">
                  Прямых входящих зависимостей нет.
                </div>
              ) : (
                <div className="space-y-1">
                  {incomingDeps.map((dep) => {
                    const peer =
                      dep.source === selectedSpec.id ? dep.target : dep.source;
                    return (
                      <button
                        key={`in-${dep.id}`}
                        type="button"
                        onClick={() => setSelectedId(peer)}
                        className="w-full text-left px-2.5 py-1.5 rounded border border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-between gap-2 text-[11px]"
                      >
                        <span className="min-w-0 truncate">
                          <span className="font-mono font-bold text-slate-800 mr-1.5">
                            {peer}
                          </span>
                          <span className="text-slate-600">{dep.label}</span>
                        </span>
                        <span
                          className="font-mono text-[10px] shrink-0"
                          style={{ color: LINK_STYLE[dep.kind].stroke }}
                        >
                          {dep.kind === 'power'
                            ? 'PWR'
                            : dep.kind === 'rf'
                              ? 'UHF'
                              : dep.kind === 'task'
                                ? 'TASK'
                                : 'BUS'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Outgoing Dependents */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                <ArrowUpRight className="w-3.5 h-3.5 text-sky-600" />
                Обеспечивает / Влияет на ({outgoingDeps.length})
              </div>
              {outgoingDeps.length === 0 ? (
                <div className="text-[11px] text-slate-400">
                  Исходящих зависимостей нет.
                </div>
              ) : (
                <div className="space-y-1">
                  {outgoingDeps.map((dep) => {
                    const peer =
                      dep.source === selectedSpec.id ? dep.target : dep.source;
                    return (
                      <button
                        key={`out-${dep.id}`}
                        type="button"
                        onClick={() => setSelectedId(peer)}
                        className="w-full text-left px-2.5 py-1.5 rounded border border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-between gap-2 text-[11px]"
                      >
                        <span className="min-w-0 truncate">
                          <span className="font-mono font-bold text-slate-800 mr-1.5">
                            {peer}
                          </span>
                          <span className="text-slate-600">{dep.label}</span>
                        </span>
                        <span
                          className="font-mono text-[10px] shrink-0"
                          style={{ color: LINK_STYLE[dep.kind].stroke }}
                        >
                          {dep.kind === 'power'
                            ? 'PWR'
                            : dep.kind === 'rf'
                              ? 'UHF'
                              : dep.kind === 'task'
                                ? 'TASK'
                                : 'BUS'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="pt-3 border-t border-slate-200 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onOpenSubsystemTasks(selectedSpec.id)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 transition-colors whitespace-nowrap"
            >
              <ListChecks className="w-3.5 h-3.5" />
              Задачи {selectedSpec.id}
            </button>
            {selectedSpec.id !== 'GROUND' && (
              <button
                type="button"
                onClick={() => onOpenSubsystemMBlock(selectedSpec.id)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <Cpu className="w-3.5 h-3.5 text-sky-600" />
                mBlock ({selectedStats.programsCount})
              </button>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
};
