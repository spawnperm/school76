import type {
  CommunityProject,
  CubeSatTask,
  MissionLifecycleStage,
  OnboardProgram,
} from '../types/cubesat.ts';
import { MISSION_STAGE_LABELS } from '../types/cubesat.ts';

export interface LifecycleStageInfo {
  id: MissionLifecycleStage;
  index: number;
  label: string;
  shortDesc: string;
}

export const MISSION_LIFECYCLE_STAGES: LifecycleStageInfo[] = [
  {
    id: 'design',
    index: 0,
    label: MISSION_STAGE_LABELS.design,
    shortDesc: 'ТЗ, схемы подсистем и планирование задач',
  },
  {
    id: 'assembly',
    index: 1,
    label: MISSION_STAGE_LABELS.assembly,
    shortDesc: 'Сборка плат, макетирование и разработка ПО',
  },
  {
    id: 'testing',
    index: 2,
    label: MISSION_STAGE_LABELS.testing,
    shortDesc: 'HIL-стенд, модульные и термовакуумные тесты',
  },
  {
    id: 'launch',
    index: 3,
    label: MISSION_STAGE_LABELS.launch,
    shortDesc: 'Предстартовая готовность и орбитальный запуск',
  },
];

export interface ProjectLifecycleSummary {
  stage: MissionLifecycleStage;
  stageIndex: number;
  label: string;
  shortDesc: string;
  isManual: boolean;
  progressPct: number;
  totalTasks: number;
  doneTasks: number;
  reviewTasks: number;
  inProgressTasks: number;
  programsCount: number;
}

function getTaskWeight(t: CubeSatTask): number {
  if (typeof t.progressPct === 'number' && !Number.isNaN(t.progressPct)) {
    return Math.max(0, Math.min(100, t.progressPct));
  }
  switch (t.status) {
    case 'done':
      return 100;
    case 'review':
      return 85;
    case 'in_progress':
      return 45;
    default:
      return 0;
  }
}

export function computeMissionLifecycle(
  project: CommunityProject,
  allTasks: CubeSatTask[],
  allPrograms: OnboardProgram[]
): ProjectLifecycleSummary {
  const projectTasks = allTasks.filter(
    (t) => (t.projectId || 'school76-1u') === project.id
  );
  const projectPrograms = allPrograms.filter(
    (p) => !p.projectId || p.projectId === project.id
  );

  const totalTasks = projectTasks.length;
  const doneTasks = projectTasks.filter((t) => t.status === 'done').length;
  const reviewTasks = projectTasks.filter((t) => t.status === 'review').length;
  const inProgressTasks = projectTasks.filter((t) => t.status === 'in_progress').length;

  const progressPct =
    totalTasks > 0
      ? Math.round(
          projectTasks.reduce((sum, task) => sum + getTaskWeight(task), 0) / totalTasks
        )
      : 0;

  let derivedStage: MissionLifecycleStage = 'design';
  if (totalTasks === 0) {
    derivedStage = 'design';
  } else if (progressPct >= 95 || doneTasks === totalTasks) {
    derivedStage = 'launch';
  } else if (
    progressPct >= 60 ||
    (reviewTasks >= 2 && doneTasks + reviewTasks >= Math.ceil(totalTasks * 0.6))
  ) {
    derivedStage = 'testing';
  } else if (progressPct >= 25 || inProgressTasks > 0 || doneTasks > 0) {
    derivedStage = 'assembly';
  } else {
    derivedStage = 'design';
  }

  const stage: MissionLifecycleStage = project.lifecycleStage || derivedStage;
  const info =
    MISSION_LIFECYCLE_STAGES.find((s) => s.id === stage) || MISSION_LIFECYCLE_STAGES[0];

  return {
    stage,
    stageIndex: info.index,
    label: info.label,
    shortDesc: info.shortDesc,
    isManual: Boolean(project.lifecycleStage),
    progressPct,
    totalTasks,
    doneTasks,
    reviewTasks,
    inProgressTasks,
    programsCount: projectPrograms.length,
  };
}
