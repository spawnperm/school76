import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, Cpu, ListChecks, RotateCcw } from 'lucide-react';
import type { CubeSatTask, Subsystem } from '../types/cubesat.ts';
import { SUBSYSTEM_LABELS } from '../types/cubesat.ts';

interface CubeSat3DViewerProps {
  projectName: string;
  tasks: CubeSatTask[];
  onOpenSubsystemTasks: (subsystem: Subsystem) => void;
  onOpenSubsystemMBlock?: (subsystem: Subsystem) => void;
}

interface SubsystemReadiness {
  subsystem: Subsystem;
  total: number;
  done: number;
  inProgress: number;
  review: number;
  backlog: number;
  pct: number;
  statusKey: 'done' | 'active' | 'early' | 'backlog' | 'empty';
  statusLabel: string;
  hexColor: number;
  cssColor: string;
}

const SUBSYSTEM_ORDER: Subsystem[] = ['OBC', 'EPS', 'ADCS', 'COMMS', 'PAYLOAD', 'GROUND'];

// Reusable module-scope math helpers (zero GC inside render loop)
const _pointer = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _targetFocus = new THREE.Vector3();

function computeSubsystemReadiness(tasks: CubeSatTask[]): Record<Subsystem, SubsystemReadiness> {
  const map = {} as Record<Subsystem, SubsystemReadiness>;

  for (const sub of SUBSYSTEM_ORDER) {
    const subTasks = tasks.filter((t) => t.subsystem === sub);
    const total = subTasks.length;
    const done = subTasks.filter((t) => t.status === 'done').length;
    const review = subTasks.filter((t) => t.status === 'review').length;
    const inProgress = subTasks.filter((t) => t.status === 'in_progress').length;
    const backlog = subTasks.filter((t) => t.status === 'backlog').length;

    const weighted = subTasks.reduce((acc, t) => {
      if (t.status === 'done') return acc + 100;
      if (typeof t.progressPct === 'number') return acc + t.progressPct;
      if (t.status === 'review') return acc + 80;
      if (t.status === 'in_progress') return acc + 45;
      return acc;
    }, 0);

    const pct = total > 0 ? Math.round(weighted / total) : 0;

    let statusKey: SubsystemReadiness['statusKey'] = 'empty';
    let statusLabel = 'Нет задач';
    let hexColor = 0x64748b;
    let cssColor = '#64748b';

    if (total > 0) {
      if (done === total) {
        statusKey = 'done';
        statusLabel = 'Готово';
        hexColor = 0x10b981;
        cssColor = '#10b981';
      } else if (pct >= 50 || review > 0) {
        statusKey = 'active';
        statusLabel = 'В работе / проверка';
        hexColor = 0x0ea5e9;
        cssColor = '#0ea5e9';
      } else if (inProgress > 0 || pct > 0) {
        statusKey = 'early';
        statusLabel = 'Начато';
        hexColor = 0xf59e0b;
        cssColor = '#f59e0b';
      } else {
        statusKey = 'backlog';
        statusLabel = 'В бэклоге';
        hexColor = 0xef4444;
        cssColor = '#ef4444';
      }
    }

    map[sub] = {
      subsystem: sub,
      total,
      done,
      inProgress,
      review,
      backlog,
      pct,
      statusKey,
      statusLabel,
      hexColor,
      cssColor,
    };
  }

  return map;
}

function createSolarCellTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 512);

    // Photovoltaic GaAs cells (2x4 grid)
    const cols = 2;
    const rows = 4;
    const pad = 18;
    const cellW = (512 - pad * (cols + 1)) / cols;
    const cellH = (512 - pad * (rows + 1)) / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = pad + c * (cellW + pad);
        const y = pad + r * (cellH + pad);
        const grad = ctx.createLinearGradient(x, y, x + cellW, y + cellH);
        grad.addColorStop(0, '#172554');
        grad.addColorStop(1, '#1e3a8a');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, cellW, cellH);

        // Fine silver finger busbars
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.lineWidth = 1.5;
        for (let k = 1; k < 6; k++) {
          const fy = y + (cellH / 6) * k;
          ctx.beginPath();
          ctx.moveTo(x + 4, fy);
          ctx.lineTo(x + cellW - 4, fy);
          ctx.stroke();
        }
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, cellW, cellH);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createPcbTexture(baseColor: string, traceColor: string, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = traceColor;
    ctx.lineWidth = 2;
    for (let i = 20; i < 240; i += 24) {
      ctx.beginPath();
      ctx.moveTo(20, i);
      ctx.lineTo(100, i);
      ctx.lineTo(130, Math.min(236, i + 14));
      ctx.lineTo(236, Math.min(236, i + 14));
      ctx.stroke();
    }
    ctx.fillStyle = '#facc15';
    for (let i = 28; i < 230; i += 22) {
      ctx.beginPath();
      ctx.arc(i, 24, 3, 0, Math.PI * 2);
      ctx.arc(i, 232, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function detectSoftwareGl(): boolean {
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param) || '');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export const CubeSat3DViewer: React.FC<CubeSat3DViewerProps> = ({
  projectName,
  tasks,
  onOpenSubsystemTasks,
  onOpenSubsystemMBlock,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const readiness = useMemo(() => computeSubsystemReadiness(tasks), [tasks]);

  const [selectedSub, setSelectedSub] = useState<Subsystem>('OBC');
  const [explodeFactor, setExplodeFactor] = useState(0.25);
  const [dockCollapsed, setDockCollapsed] = useState(false);

  // Refs synced to Three.js render loop without tearing down WebGL context
  const readinessRef = useRef(readiness);
  readinessRef.current = readiness;
  const selectedSubRef = useRef<Subsystem>(selectedSub);
  selectedSubRef.current = selectedSub;
  const explodeTargetRef = useRef(explodeFactor);
  explodeTargetRef.current = explodeFactor;

  const triggerRenderRef = useRef<(() => void) | null>(null);
  const resetCameraRef = useRef<(() => void) | null>(null);
  const focusSubsystemRef = useRef<((sub: Subsystem) => void) | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    const width = container.clientWidth || 720;
    const height = container.clientHeight || 420;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    scene.fog = new THREE.Fog(0xf1f5f9, 7, 18);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 40);
    camera.position.set(2.35, 1.85, 2.55);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.minDistance = 1.6;
    controls.maxDistance = 6.2;
    controls.target.set(0, 0.58, 0);

    // 3-Point Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x94a3b8, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.8);
    keyLight.position.set(3.5, 5.2, 3.2);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 14;
    keyLight.shadow.camera.left = -2.2;
    keyLight.shadow.camera.right = 2.2;
    keyLight.shadow.camera.top = 2.2;
    keyLight.shadow.camera.bottom = -2.2;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xbae6fd, 0.75);
    rimLight.position.set(-3.2, 2.5, -3.5);
    scene.add(rimLight);

    // Ground Pedestal & Soft Contact Shadow (y = 0)
    const stageGroup = new THREE.Group();
    const pedestalGeo = new THREE.CylinderGeometry(1.15, 1.25, 0.06, 48);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.2,
      roughness: 0.75,
    });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.y = -0.03;
    pedestal.receiveShadow = true;
    stageGroup.add(pedestal);

    const ringGeo = new THREE.RingGeometry(0.95, 1.0, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.004;
    stageGroup.add(ring);
    scene.add(stageGroup);

    // ==========================================
    // 1U CUBESAT COMPOSITE PROCEDURAL ASSEMBLY
    // ==========================================
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const solarTex = createSolarCellTexture(maxAniso);
    const pcbTex = createPcbTexture('#0f5132', '#34d399', maxAniso);

    const satRoot = new THREE.Group();
    satRoot.position.y = 0.05; // sits flush above pedestal top
    scene.add(satRoot);

    const disposables: { dispose: () => void }[] = [
      pedestalGeo,
      pedestalMat,
      ringGeo,
      ringMat,
      solarTex,
      pcbTex,
      envTarget,
    ];

    const subMaterials: Record<Subsystem, THREE.MeshStandardMaterial[]> = {
      OBC: [],
      EPS: [],
      ADCS: [],
      COMMS: [],
      PAYLOAD: [],
      GROUND: [],
    };
    const subAnchors: Record<Subsystem, { group: THREE.Group; baseY: number; explodeY: number }> = {
      GROUND: { group: new THREE.Group(), baseY: 0, explodeY: 0 },
      EPS: { group: new THREE.Group(), baseY: 0.24, explodeY: -0.18 },
      OBC: { group: new THREE.Group(), baseY: 0.48, explodeY: 0.02 },
      ADCS: { group: new THREE.Group(), baseY: 0.72, explodeY: 0.24 },
      COMMS: { group: new THREE.Group(), baseY: 0.94, explodeY: 0.46 },
      PAYLOAD: { group: new THREE.Group(), baseY: 1.08, explodeY: 0.68 },
    };

    const pickables: THREE.Object3D[] = [];
    const registerPickable = (obj: THREE.Object3D, sub: Subsystem) => {
      obj.userData.subsystem = sub;
      obj.layers.enable(1);
      pickables.push(obj);
    };

    // 1) GROUND / Mechanical Frame (4 anodized corner rails + bottom/top plates + M3 fasteners InstancedMesh)
    const groundGroup = subAnchors.GROUND.group;
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.85,
      roughness: 0.28,
      emissive: 0x000000,
      emissiveIntensity: 0.35,
    });
    subMaterials.GROUND.push(frameMat);
    disposables.push(frameMat);

    const railGeo = new THREE.BoxGeometry(0.085, 1.135, 0.085);
    disposables.push(railGeo);
    const railOffsets = [
      [-0.46, -0.46],
      [0.46, -0.46],
      [-0.46, 0.46],
      [0.46, 0.46],
    ];
    for (const [rx, rz] of railOffsets) {
      const rail = new THREE.Mesh(railGeo, frameMat);
      rail.position.set(rx, 0.5675, rz);
      rail.castShadow = true;
      rail.receiveShadow = true;
      registerPickable(rail, 'GROUND');
      groundGroup.add(rail);
    }

    const plateGeo = new THREE.BoxGeometry(0.96, 0.03, 0.96);
    disposables.push(plateGeo);
    const bottomPlate = new THREE.Mesh(plateGeo, frameMat);
    bottomPlate.position.set(0, 0.015, 0);
    bottomPlate.castShadow = true;
    registerPickable(bottomPlate, 'GROUND');
    groundGroup.add(bottomPlate);

    // 24 M3 Standoff Fasteners via InstancedMesh
    const screwGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.025, 10);
    const screwMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      metalness: 0.92,
      roughness: 0.2,
    });
    const screwInst = new THREE.InstancedMesh(screwGeo, screwMat, 24);
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let layer = 0; layer < 6; layer++) {
      const sy = 0.1 + layer * 0.19;
      for (const [rx, rz] of railOffsets) {
        dummy.position.set(rx * 0.92, sy, rz * 0.92);
        dummy.updateMatrix();
        screwInst.setMatrixAt(idx++, dummy.matrix);
      }
    }
    screwInst.instanceMatrix.needsUpdate = true;
    screwInst.computeBoundingSphere();
    groundGroup.add(screwInst);
    disposables.push(screwGeo, screwMat);
    satRoot.add(groundGroup);

    // 2) EPS Subsystem (Battery Pack + MPPT PCB + Deployable Solar Wings)
    const epsGroup = subAnchors.EPS.group;
    epsGroup.position.y = subAnchors.EPS.baseY;
    const epsGlowMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.35,
      roughness: 0.55,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.45,
    });
    const epsPcbMat = new THREE.MeshStandardMaterial({
      map: pcbTex,
      roughness: 0.65,
      metalness: 0.1,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.22,
    });
    const solarPanelMat = new THREE.MeshStandardMaterial({
      map: solarTex,
      metalness: 0.25,
      roughness: 0.22,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.18,
    });
    subMaterials.EPS.push(epsGlowMat, epsPcbMat, solarPanelMat);
    disposables.push(epsGlowMat, epsPcbMat, solarPanelMat);

    const pcbGeo = new THREE.BoxGeometry(0.82, 0.025, 0.82);
    const epsBoard = new THREE.Mesh(pcbGeo, epsPcbMat);
    epsBoard.castShadow = true;
    registerPickable(epsBoard, 'EPS');
    epsGroup.add(epsBoard);

    const cellGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.52, 20);
    cellGeo.rotateZ(Math.PI / 2);
    const cellA = new THREE.Mesh(cellGeo, epsGlowMat);
    cellA.position.set(0, 0.09, -0.12);
    const cellB = new THREE.Mesh(cellGeo, epsGlowMat);
    cellB.position.set(0, 0.09, 0.12);
    registerPickable(cellA, 'EPS');
    registerPickable(cellB, 'EPS');
    epsGroup.add(cellA, cellB);

    // Side Solar Wings (hinged along +/- X so they tilt open on Explode)
    const solarGeo = new THREE.BoxGeometry(0.025, 0.94, 0.82);
    const wingLeft = new THREE.Group();
    wingLeft.position.set(-0.5, 0.32, 0);
    const panelLeft = new THREE.Mesh(solarGeo, solarPanelMat);
    registerPickable(panelLeft, 'EPS');
    wingLeft.add(panelLeft);

    const wingRight = new THREE.Group();
    wingRight.position.set(0.5, 0.32, 0);
    const panelRight = new THREE.Mesh(solarGeo, solarPanelMat);
    registerPickable(panelRight, 'EPS');
    wingRight.add(panelRight);
    epsGroup.add(wingLeft, wingRight);
    disposables.push(pcbGeo, cellGeo, solarGeo);
    satRoot.add(epsGroup);

    // 3) OBC Subsystem (STM32/ESP32 PCB + MCU + Status Bar)
    const obcGroup = subAnchors.OBC.group;
    obcGroup.position.y = subAnchors.OBC.baseY;
    const obcMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.4,
      roughness: 0.45,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.45,
    });
    const obcBoardMat = new THREE.MeshStandardMaterial({
      map: pcbTex,
      roughness: 0.6,
      metalness: 0.15,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.25,
    });
    subMaterials.OBC.push(obcMat, obcBoardMat);
    disposables.push(obcMat, obcBoardMat);

    const obcBoard = new THREE.Mesh(pcbGeo, obcBoardMat);
    obcBoard.castShadow = true;
    registerPickable(obcBoard, 'OBC');
    obcGroup.add(obcBoard);

    const mcuGeo = new THREE.BoxGeometry(0.24, 0.04, 0.24);
    const mcu = new THREE.Mesh(mcuGeo, obcMat);
    mcu.position.set(0, 0.032, 0);
    registerPickable(mcu, 'OBC');
    obcGroup.add(mcu);

    const headerGeo = new THREE.BoxGeometry(0.62, 0.045, 0.07);
    const gpioHeader = new THREE.Mesh(headerGeo, screwMat);
    gpioHeader.position.set(0, 0.032, 0.3);
    registerPickable(gpioHeader, 'OBC');
    obcGroup.add(gpioHeader);
    disposables.push(mcuGeo, headerGeo);
    satRoot.add(obcGroup);

    // 4) ADCS Subsystem (Copper Magnetorquer Coils + IMU + Sun Sensor)
    const adcsGroup = subAnchors.ADCS.group;
    adcsGroup.position.y = subAnchors.ADCS.baseY;
    const adcsMat = new THREE.MeshStandardMaterial({
      color: 0xb45309,
      metalness: 0.88,
      roughness: 0.28,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.4,
    });
    const adcsBoardMat = new THREE.MeshStandardMaterial({
      map: pcbTex,
      roughness: 0.58,
      metalness: 0.15,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.22,
    });
    subMaterials.ADCS.push(adcsMat, adcsBoardMat);
    disposables.push(adcsMat, adcsBoardMat);

    const adcsBoard = new THREE.Mesh(pcbGeo, adcsBoardMat);
    registerPickable(adcsBoard, 'ADCS');
    adcsGroup.add(adcsBoard);

    const coilGeo = new THREE.TorusGeometry(0.24, 0.032, 12, 32);
    coilGeo.rotateX(Math.PI / 2);
    const zCoil = new THREE.Mesh(coilGeo, adcsMat);
    zCoil.position.set(0, 0.045, 0);
    registerPickable(zCoil, 'ADCS');
    adcsGroup.add(zCoil);

    const rodCoilGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.56, 16);
    rodCoilGeo.rotateZ(Math.PI / 2);
    const xCoil = new THREE.Mesh(rodCoilGeo, adcsMat);
    xCoil.position.set(0, 0.055, -0.28);
    registerPickable(xCoil, 'ADCS');
    adcsGroup.add(xCoil);
    disposables.push(coilGeo, rodCoilGeo);
    satRoot.add(adcsGroup);

    // 5) COMMS Subsystem (RF Shield + SMA + Dual Deployable Dipole Antennas)
    const commsGroup = subAnchors.COMMS.group;
    commsGroup.position.y = subAnchors.COMMS.baseY;
    const commsMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.82,
      roughness: 0.26,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.42,
    });
    subMaterials.COMMS.push(commsMat);
    disposables.push(commsMat);

    const rfShieldGeo = new THREE.BoxGeometry(0.46, 0.07, 0.36);
    const rfShield = new THREE.Mesh(rfShieldGeo, commsMat);
    rfShield.position.set(-0.14, 0.035, 0);
    registerPickable(rfShield, 'COMMS');
    commsGroup.add(rfShield);

    const antGeo = new THREE.CylinderGeometry(0.011, 0.008, 0.88, 10);
    const ant1 = new THREE.Mesh(antGeo, commsMat);
    ant1.position.set(0.32, 0.38, 0.25);
    ant1.rotation.z = -0.45;
    ant1.rotation.x = 0.25;
    const ant2 = new THREE.Mesh(antGeo, commsMat);
    ant2.position.set(-0.32, 0.38, -0.25);
    ant2.rotation.z = 0.45;
    ant2.rotation.x = -0.25;
    registerPickable(ant1, 'COMMS');
    registerPickable(ant2, 'COMMS');
    commsGroup.add(ant1, ant2);
    disposables.push(rfShieldGeo, antGeo);
    satRoot.add(commsGroup);

    // 6) PAYLOAD Subsystem (Earth Observation Camera Barrel + Optical Lens + Dosimeter)
    const payloadGroup = subAnchors.PAYLOAD.group;
    payloadGroup.position.y = subAnchors.PAYLOAD.baseY;
    const payloadMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.72,
      roughness: 0.32,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.45,
    });
    const lensMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      metalness: 0,
      roughness: 0.06,
      transmission: isSoftwareGl ? 0 : 0.85,
      transparent: true,
      opacity: isSoftwareGl ? 0.45 : 1,
      ior: 1.55,
      thickness: 0.3,
      clearcoat: 1.0,
    });
    subMaterials.PAYLOAD.push(payloadMat);
    disposables.push(payloadMat, lensMat);

    const topLid = new THREE.Mesh(plateGeo, frameMat);
    registerPickable(topLid, 'GROUND');
    payloadGroup.add(topLid);

    const barrelGeo = new THREE.CylinderGeometry(0.18, 0.2, 0.14, 28);
    const barrel = new THREE.Mesh(barrelGeo, payloadMat);
    barrel.position.set(0.14, 0.07, 0.12);
    registerPickable(barrel, 'PAYLOAD');
    payloadGroup.add(barrel);

    const lensGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.025, 28);
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.position.set(0.14, 0.14, 0.12);
    registerPickable(lens, 'PAYLOAD');
    payloadGroup.add(lens);

    const dosimeterGeo = new THREE.BoxGeometry(0.26, 0.09, 0.24);
    const dosimeter = new THREE.Mesh(dosimeterGeo, payloadMat);
    dosimeter.position.set(-0.22, 0.055, -0.18);
    registerPickable(dosimeter, 'PAYLOAD');
    payloadGroup.add(dosimeter);
    disposables.push(barrelGeo, lensGeo, dosimeterGeo);
    satRoot.add(payloadGroup);

    // Pre-warm shaders on GPU devices
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // ==========================================
    // RENDER-ON-DEMAND & DAMPING LOOP
    // ==========================================
    let currentExplode = explodeTargetRef.current;
    let currentFocusY = 0.58;
    let targetFocusY = 0.58;
    let disposed = false;
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTickMs = performance.now();

    function applySubsystemColors() {
      const activeReadiness = readinessRef.current;
      const activeSub = selectedSubRef.current;
      for (const sub of SUBSYSTEM_ORDER) {
        const info = activeReadiness[sub];
        const isSel = sub === activeSub;
        const intensity = isSel ? 0.8 : 0.28;
        for (const mat of subMaterials[sub]) {
          mat.emissive.setHex(info.hexColor);
          mat.emissiveIntensity = intensity;
        }
      }
    }

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;

        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0.001, (now - lastTickMs) / 1000));
        lastTickMs = now;

        // Smooth damping for exploded view & focus target
        currentExplode = THREE.MathUtils.damp(currentExplode, explodeTargetRef.current, 7, dt);
        currentFocusY = THREE.MathUtils.damp(currentFocusY, targetFocusY, 6, dt);

        for (const sub of SUBSYSTEM_ORDER) {
          const item = subAnchors[sub];
          item.group.position.y = item.baseY + item.explodeY * currentExplode;
        }
        // Tilt outer solar wings gently when exploded
        wingLeft.rotation.z = currentExplode * 0.42;
        wingLeft.position.x = -0.5 - currentExplode * 0.22;
        wingRight.rotation.z = -currentExplode * 0.42;
        wingRight.position.x = 0.5 + currentExplode * 0.22;

        controls.target.y = currentFocusY;
        controls.update();
        applySubsystemColors();
        renderer.render(scene, camera);

        const needsMoreFrames =
          Math.abs(currentExplode - explodeTargetRef.current) > 0.002 ||
          Math.abs(currentFocusY - targetFocusY) > 0.002;

        const done = () => {
          renderBusy = false;
          if (!disposed && (renderDirty || needsMoreFrames)) {
            requestRender();
          }
        };

        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    triggerRenderRef.current = requestRender;
    resetCameraRef.current = () => {
      camera.position.set(2.35, 1.85, 2.55);
      targetFocusY = 0.58;
      _targetFocus.set(0, 0.58, 0);
      controls.target.copy(_targetFocus);
      requestRender();
    };
    focusSubsystemRef.current = (sub: Subsystem) => {
      const anchor = subAnchors[sub];
      targetFocusY = anchor.baseY + anchor.explodeY * explodeTargetRef.current;
      requestRender();
    };

    const onControlChange = () => requestRender();
    controls.addEventListener('change', onControlChange);

    // Click Raycasting on layer 1
    _raycaster.layers.set(1);
    let pointerDownPos = { x: 0, y: 0 };
    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 6) return; // drag orbit, not click
      const rect = renderer.domElement.getBoundingClientRect();
      _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_pointer, camera);
      const hits = _raycaster.intersectObjects(pickables, false);
      if (hits.length > 0) {
        const sub = hits[0].object.userData.subsystem as Subsystem | undefined;
        if (sub) {
          setSelectedSub(sub);
          focusSubsystemRef.current?.(sub);
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const resizeObserver = new ResizeObserver(() => {
      if (!container || disposed) return;
      const w = container.clientWidth || 720;
      const h = container.clientHeight || 420;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    });
    resizeObserver.observe(container);

    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('change', onControlChange);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      for (const item of disposables) {
        item.dispose();
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Trigger re-render when task readiness, selection, or explode factor changes
  useEffect(() => {
    triggerRenderRef.current?.();
  }, [readiness, selectedSub, explodeFactor]);

  const activeInfo = readiness[selectedSub];

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="relative h-[460px] lg:h-[520px] bg-slate-100 select-none">
        {/* Dedicated isolated WebGL canvas container */}
        <div ref={mountRef} className="absolute inset-0" />

        {/* Minimal Top-Left Spec Overlay (no backdrop-blur over WebGL) */}
        <div className="absolute top-4 left-4 z-10 bg-white/95 border border-slate-200 rounded-md px-3.5 py-2.5 max-w-xs space-y-1 shadow-xs">
          <div className="text-[11px] font-mono text-slate-500">
            3D ЦИФРОВОЙ ДВОЙНИК · {projectName.toUpperCase()}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-slate-900">
              {SUBSYSTEM_LABELS[selectedSub]}
            </span>
            <span
              className="font-mono text-xs font-bold tabular-nums"
              style={{ color: activeInfo.cssColor }}
            >
              {activeInfo.pct}%
            </span>
          </div>
          <div className="text-xs text-slate-600 flex items-center gap-2">
            <span>{activeInfo.statusLabel}</span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="font-mono tabular-nums">
              Задач: {activeInfo.done}/{activeInfo.total}
            </span>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => onOpenSubsystemTasks(selectedSub)}
              className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline"
            >
              <ListChecks className="w-3.5 h-3.5" />
              Задачи {selectedSub}
            </button>
            {onOpenSubsystemMBlock && selectedSub !== 'GROUND' && (
              <>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => onOpenSubsystemMBlock(selectedSub)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-sky-700"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  mBlock ПО
                </button>
              </>
            )}
          </div>
        </div>

        {/* Readiness Color Legend (Top-Right compact bar, solid surface) */}
        <div className="hidden sm:flex absolute top-4 right-4 z-10 bg-white/95 border border-slate-200 rounded-md px-3 py-1.5 items-center gap-3 text-[11px] text-slate-600 shadow-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
            100%
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-sky-500" />
            ≥50%
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" />
            В работе
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" />
            Бэклог
          </span>
        </div>

        {/* Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 w-[min(940px,95%)] flex flex-col items-center">
          <button
            type="button"
            onClick={() => setDockCollapsed((v) => !v)}
            className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-medium text-slate-700 bg-white border border-b-0 border-slate-200 rounded-t-md hover:bg-slate-50"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Показать панель 3D
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                Скрыть панель
              </>
            )}
          </button>

          {!dockCollapsed && (
            <div className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
              {/* Subsystem Readiness Selector */}
              <div className="flex flex-wrap items-center gap-1.5">
                {SUBSYSTEM_ORDER.map((sub) => {
                  const info = readiness[sub];
                  const isSel = selectedSub === sub;
                  return (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => {
                        setSelectedSub(sub);
                        focusSubsystemRef.current?.(sub);
                      }}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors ${
                        isSel
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: info.cssColor }}
                      />
                      <span className="font-medium">{sub}</span>
                      <span className="font-mono tabular-nums opacity-80">{info.pct}%</span>
                    </button>
                  );
                })}
              </div>

              {/* Exploded View & Reset Camera */}
              <div className="flex items-center gap-3 ml-auto">
                <div className="flex items-center gap-2">
                  <label htmlFor="cubesat-explode" className="text-xs text-slate-600 whitespace-nowrap">
                    Разборка
                  </label>
                  <input
                    id="cubesat-explode"
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(explodeFactor * 100)}
                    onChange={(e) => setExplodeFactor(Number(e.target.value) / 100)}
                    className="w-24 accent-sky-600"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setExplodeFactor(0.25);
                    resetCameraRef.current?.();
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                  title="Сбросить ракурс"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Сброс
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
