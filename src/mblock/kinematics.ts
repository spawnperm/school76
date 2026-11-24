/**
 * Ground-Station Yagi Azimuth/Elevation Rotor & ADCS Scan Trajectory Planner
 * Ported from Makeblock-official/mDrawBot (ScaraRobot.py inverse kinematics,
 * SvgParser.py Bezier sampling, XYRobot/EggBot G1/M5 stepper G-code emitter).
 */

export type TrajectoryModeId = 'zenith_pass' | 'low_pass' | 'raster_scan';

export interface TrajectoryWaypoint {
  index: number;
  tSec: number;
  azimuthDeg: number; // X axis (0..360 deg)
  elevationDeg: number; // Y axis (0..90 deg)
  scaraTheta1Deg: number; // Joint 1 angle (deg) from ScaraRobot IK
  scaraTheta2Deg: number; // Joint 2 angle (deg) from ScaraRobot IK
  gcode: string;
}

export interface TrajectoryPlan {
  mode: TrajectoryModeId;
  title: string;
  description: string;
  durationSec: number;
  maxElevationDeg: number;
  waypoints: TrajectoryWaypoint[];
  gcodeProgram: string;
  stepperPython: string;
}

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Port of SvgParser.py buildBezierSegment() — samples a cubic Bezier curve
 * with minimum Euclidean step spacing.
 */
export function sampleCubicBezier(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  steps = 24
): Point2D[] {
  const out: Point2D[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x00 = p0.x + (p1.x - p0.x) * t;
    const y00 = p0.y + (p1.y - p0.y) * t;
    const x01 = p1.x + (p2.x - p1.x) * t;
    const y01 = p1.y + (p2.y - p1.y) * t;
    const x02 = p2.x + (p3.x - p2.x) * t;
    const y02 = p2.y + (p3.y - p2.y) * t;
    const x10 = (x01 - x00) * t + x00;
    const y10 = (y01 - y00) * t + y00;
    const x11 = (x02 - x01) * t + x01;
    const y11 = (y02 - y01) * t + y01;
    const x20 = (x11 - x10) * t + x10;
    const y20 = (y11 - y10) * t + y10;
    out.push({ x: x20, y: y20 });
  }
  return out;
}

/**
 * Port of ScaraRobot.py scaraInverseKinect(x, y, L1, L2).
 * Computes 2-DOF joint angles (deg) for planar projection (normalized to arm workspace L1=168mm, L2=206mm).
 */
export function computeScaraInverseKinematics(
  xMm: number,
  yMm: number,
  L1 = 168,
  L2 = 206
): { theta1Deg: number; theta2Deg: number } {
  const r = Math.hypot(xMm, yMm);
  const maxR = L1 + L2 - 4;
  const minR = Math.abs(L1 - L2) + 4;
  const scale = r > maxR ? maxR / r : r < minR && r > 0.001 ? minR / r : 1;
  const x = xMm * scale;
  const y = yMm * scale;

  const rSq = x * x + y * y;
  const cosT2 = Math.max(-1, Math.min(1, (rSq - L1 * L1 - L2 * L2) / (2 * L1 * L2)));
  const th2Rad = Math.acos(cosT2);
  const k1 = L1 + L2 * Math.cos(th2Rad);
  const k2 = L2 * Math.sin(th2Rad);
  const th1Rad = Math.atan2(y, x) - Math.atan2(k2, k1);

  return {
    theta1Deg: Number(((th1Rad * 180) / Math.PI).toFixed(1)),
    theta2Deg: Number(((th2Rad * 180) / Math.PI).toFixed(1)),
  };
}

export function generateTrajectoryPlan(mode: TrajectoryModeId): TrajectoryPlan {
  const waypoints: TrajectoryWaypoint[] = [];
  let title = '';
  let description = '';
  let durationSec = 420;
  let maxElevationDeg = 76;

  if (mode === 'zenith_pass') {
    title = 'Проход SCHOOL76-1U через зенит (AOS 312° → LOS 138°)';
    description =
      'Кривая Безье сопровождения Yagi Az/El ротора на шаговых двигателях Makeblock MeStepper.';
    durationSec = 480;
    maxElevationDeg = 78;
    const pts = sampleCubicBezier(
      { x: 312, y: 5 },
      { x: 268, y: 82 },
      { x: 185, y: 86 },
      { x: 138, y: 5 },
      18
    );
    pts.forEach((p, idx) => {
      const az = ((p.x % 360) + 360) % 360;
      const el = Math.max(0, Math.min(90, p.y));
      // Project polar sky coordinates (r proportional to 90-El) into SCARA arm workspace
      const skyR = ((90 - el) / 90) * 240 + 60;
      const rad = (az * Math.PI) / 180;
      const ik = computeScaraInverseKinematics(skyR * Math.sin(rad), skyR * Math.cos(rad));
      waypoints.push({
        index: idx,
        tSec: Math.round((idx / (pts.length - 1)) * durationSec),
        azimuthDeg: Number(az.toFixed(1)),
        elevationDeg: Number(el.toFixed(1)),
        scaraTheta1Deg: ik.theta1Deg,
        scaraTheta2Deg: ik.theta2Deg,
        gcode: `G1 X${az.toFixed(2)} Y${el.toFixed(2)}`,
      });
    });
  } else if (mode === 'low_pass') {
    title = 'Восточный низкий проход (AOS 24° → LOS 162°, El 34°)';
    description =
      'Экономичный трекинг радиоокна AX.25 435.800 МГц с пониженной угловой скоростью ротора.';
    durationSec = 340;
    maxElevationDeg = 34;
    const pts = sampleCubicBezier(
      { x: 24, y: 6 },
      { x: 65, y: 38 },
      { x: 122, y: 40 },
      { x: 162, y: 6 },
      16
    );
    pts.forEach((p, idx) => {
      const az = ((p.x % 360) + 360) % 360;
      const el = Math.max(0, Math.min(90, p.y));
      const skyR = ((90 - el) / 90) * 240 + 60;
      const rad = (az * Math.PI) / 180;
      const ik = computeScaraInverseKinematics(skyR * Math.sin(rad), skyR * Math.cos(rad));
      waypoints.push({
        index: idx,
        tSec: Math.round((idx / (pts.length - 1)) * durationSec),
        azimuthDeg: Number(az.toFixed(1)),
        elevationDeg: Number(el.toFixed(1)),
        scaraTheta1Deg: ik.theta1Deg,
        scaraTheta2Deg: ik.theta2Deg,
        gcode: `G1 X${az.toFixed(2)} Y${el.toFixed(2)}`,
      });
    });
  } else {
    title = 'Растровое сканирование ДЗЗ (ADCS / оптический стенд)';
    description =
      'Прямолинейная траектория наведения камеры полезной нагрузки по сетке кадров mDrawBot XY.';
    durationSec = 180;
    maxElevationDeg = 60;
    const rows = [15, 30, 45, 60];
    let idx = 0;
    rows.forEach((el, rIdx) => {
      const azStart = rIdx % 2 === 0 ? 120 : 240;
      const azEnd = rIdx % 2 === 0 ? 240 : 120;
      const steps = 3;
      for (let s = 0; s <= steps; s++) {
        const az = azStart + ((azEnd - azStart) * s) / steps;
        const skyR = ((90 - el) / 90) * 220 + 70;
        const rad = (az * Math.PI) / 180;
        const ik = computeScaraInverseKinematics(skyR * Math.sin(rad), skyR * Math.cos(rad));
        waypoints.push({
          index: idx,
          tSec: idx * 12,
          azimuthDeg: Number(az.toFixed(1)),
          elevationDeg: Number(el.toFixed(1)),
          scaraTheta1Deg: ik.theta1Deg,
          scaraTheta2Deg: ik.theta2Deg,
          gcode: `G1 X${az.toFixed(2)} Y${el.toFixed(2)}`,
        });
        idx++;
      }
    });
  }

  const gcodeLines = [
    `; School76 Ground Station / ADCS Trajectory (${mode})`,
    `; Format: Makeblock mDrawBot G-code (X=Azimuth deg, Y=Elevation deg)`,
    'M5 A0 B0 H90 W360 S65',
    'G28',
    ...waypoints.map((w) => `${w.gcode} ; T+${w.tSec}s (th1=${w.scaraTheta1Deg}, th2=${w.scaraTheta2Deg})`),
    'M4 0',
  ];

  const stepperPython = [
    'from cubesat import ground_rotor',
    'import time',
    '',
    `# ${title}`,
    'WAYPOINTS = [',
    ...waypoints.slice(0, 8).map((w) => `    (${w.azimuthDeg}, ${w.elevationDeg}, ${w.tSec}),`),
    ']',
    '',
    'def track_pass():',
    '    for az, el, t_sec in WAYPOINTS:',
    '        ground_rotor.move_az_el(az, el)',
    '        time.sleep(1)',
  ].join('\n');

  return {
    mode,
    title,
    description,
    durationSec,
    maxElevationDeg,
    waypoints,
    gcodeProgram: gcodeLines.join('\n'),
    stepperPython,
  };
}
