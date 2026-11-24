import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as Blockly from 'blockly';
import * as Ru from 'blockly/msg/ru';
import {
  Save,
  Plus,
  MessageSquare,
  Copy,
  Check,
  Download,
  Trash2,
  History,
  Pencil,
  RotateCw,
  FlaskConical,
} from 'lucide-react';
import type {
  OnboardProgram,
  ProgramVersion,
  Subsystem,
  TargetBoard,
} from '../types/cubesat.ts';
import { SUBSYSTEM_LABELS } from '../types/cubesat.ts';
import { CUBESAT_TOOLBOX, registerCubeSatBlocks } from '../mblock/cubesatBlocks.ts';
import { generateCubeSatCode } from '../mblock/generators.ts';
import {
  bindCompiledHandlers,
  createInitialTelemetry,
  createSimRuntime,
  runPreflightVerification,
  stepCubeSatPhysics,
  type CompiledHandlers,
  type CubeSatTelemetry,
  type FaultInjectionState,
  type PreflightReport,
  type SimScenarioId,
} from '../mblock/simulator.ts';
import {
  analyzeWorkspaceBlocks,
  buildPresetUnitTests,
  runSingleUnitTest,
  runUnitTestSuite,
  type UnitTestCase,
  type UnitTestSuiteReport,
} from '../mblock/unitTests.ts';
import {
  MAKEBLOCK_BOARD_PROFILES,
  buildCubeSatTelemetryFrames,
  generateCubeSatS2eExtension,
  generateSchool76CubeSatHeader,
  type MakeblockBoardProfileId,
} from '../mblock/makeblockHardware.ts';
import { OnboardSimulatorModule } from './OnboardSimulatorModule.tsx';
import { MBlockUnitTestPanel } from './MBlockUnitTestPanel.tsx';

interface MBlockStudioProps {
  projectId: string;
  programs: OnboardProgram[];
  selectedProgramId: string;
  onSelectProgram: (id: string) => void;
  onSaveProgram: (program: Omit<OnboardProgram, 'updatedAt' | 'versions'> & { saveNote?: string }) => void;
  onUpdateVersionNote: (programId: string, versionId: string, note: string) => void;
  onDeleteProgram: (id: string) => void;
  onDiscussProgram: (programId: string) => void;
  engineerName: string;
}

let localeApplied = false;

export const MBlockStudio: React.FC<MBlockStudioProps> = ({
  projectId,
  programs,
  selectedProgramId,
  onSelectProgram,
  onSaveProgram,
  onUpdateVersionNote,
  onDeleteProgram,
  onDiscussProgram,
  engineerName,
}) => {
  const activeProgram =
    programs.find((p) => p.id === selectedProgramId) || programs[0];

  const [panelMode, setPanelMode] = useState<'tests' | 'live' | 'code' | 'history'>('live');
  const [codeLang, setCodeLang] = useState<'python' | 'codey' | 'cpp' | 'bundle'>('python');
  const [boardProfile, setBoardProfile] = useState<MakeblockBoardProfileId>('auriga_stm32');
  const [bundleFile, setBundleFile] = useState<'s2e' | 'header'>('s2e');
  const [pythonCode, setPythonCode] = useState(activeProgram?.pythonCode || '');
  const [codeyCode, setCodeyCode] = useState('');
  const [cppCode, setCppCode] = useState(activeProgram?.cppCode || '');
  const [jsCode, setJsCode] = useState('');
  const [liveWorkspaceJson, setLiveWorkspaceJson] = useState<Record<string, unknown>>(
    () => activeProgram?.workspaceJson || {}
  );
  const boardProfileRef = useRef<MakeblockBoardProfileId>(boardProfile);
  boardProfileRef.current = boardProfile;
  const [copied, setCopied] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [newVersionNote, setNewVersionNote] = useState('');
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  // Create new program modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSubsystem, setNewSubsystem] = useState<Subsystem>('OBC');
  const [newBoard, setNewBoard] = useState<TargetBoard>('CyberPi / ESP32 (MicroPython)');
  const [newDesc, setNewDesc] = useState('');

  // Live CubeSat Hardware Simulator (HIL) state
  const [scenario, setScenario] = useState<SimScenarioId>('leo_nominal');
  const [isRunning, setIsRunning] = useState(false);
  const [telemetry, setTelemetry] = useState<CubeSatTelemetry>(() =>
    createInitialTelemetry('leo_nominal')
  );
  const [preflightReport, setPreflightReport] = useState<PreflightReport | null>(null);
  const [runningPreflight, setRunningPreflight] = useState(false);

  // Visual Block Unit Testing state (per program, persisted locally per project)
  const unitTestsStorageKey = `school76_mblock_unit_tests_v1_${projectId}`;
  const loadedUnitTestsKeyRef = useRef<string>(unitTestsStorageKey);
  const [unitTestsByProgram, setUnitTestsByProgram] = useState<Record<string, UnitTestCase[]>>(() => {
    try {
      const raw = window.localStorage.getItem(unitTestsStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, UnitTestCase[]>) : {};
    } catch {
      return {};
    }
  });
  const [unitReportByProgram, setUnitReportByProgram] = useState<Record<string, UnitTestSuiteReport>>({});
  const [runningUnitTests, setRunningUnitTests] = useState(false);

  useEffect(() => {
    if (loadedUnitTestsKeyRef.current !== unitTestsStorageKey) {
      loadedUnitTestsKeyRef.current = unitTestsStorageKey;
      try {
        const raw = window.localStorage.getItem(unitTestsStorageKey);
        const parsed = raw ? JSON.parse(raw) : {};
        setUnitTestsByProgram(
          parsed && typeof parsed === 'object' ? (parsed as Record<string, UnitTestCase[]>) : {}
        );
      } catch {
        setUnitTestsByProgram({});
      }
      return;
    }
    try {
      window.localStorage.setItem(unitTestsStorageKey, JSON.stringify(unitTestsByProgram));
    } catch {
      // ignore storage quota errors
    }
  }, [unitTestsByProgram, unitTestsStorageKey]);

  const blocklyHostRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const loadedProgramIdRef = useRef<string | null>(null);
  const suppressChangeRef = useRef(false);

  const telemetryRef = useRef(telemetry);
  telemetryRef.current = telemetry;
  const runningRef = useRef(isRunning);
  runningRef.current = isRunning;
  const compiledRef = useRef<CompiledHandlers | null>(null);
  const tickTimersRef = useRef<number[]>([]);
  const physicsTimerRef = useRef<number | null>(null);

  // Initialize Blockly workspace once
  useEffect(() => {
    if (!blocklyHostRef.current) return;
    if (!localeApplied) {
      Blockly.setLocale(Ru as unknown as { [key: string]: string });
      localeApplied = true;
    }
    registerCubeSatBlocks();

    const workspace = Blockly.inject(blocklyHostRef.current, {
      toolbox: CUBESAT_TOOLBOX,
      renderer: 'zelos',
      theme: Blockly.Themes.Zelos,
      grid: {
        spacing: 24,
        length: 2,
        colour: '#cbd5e1',
        snap: true,
      },
      zoom: {
        controls: true,
        wheel: true,
        startScale: 0.88,
        maxScale: 1.6,
        minScale: 0.45,
        scaleSpeed: 1.12,
      },
      trashcan: true,
      move: {
        scrollbars: true,
        drag: true,
        wheel: true,
      },
    });

    workspaceRef.current = workspace;

    const updateCode = () => {
      if (suppressChangeRef.current) return;
      const { pythonCode: py, codeyCode: codey, cppCode: cpp, jsCode: js } =
        generateCubeSatCode(workspace, boardProfileRef.current);
      setPythonCode(py);
      setCodeyCode(codey);
      setCppCode(cpp);
      setJsCode(js);
      setLiveWorkspaceJson(Blockly.serialization.workspaces.save(workspace) as Record<string, unknown>);
    };

    workspace.addChangeListener((event) => {
      if (event.isUiEvent) return;
      updateCode();
    });

    const observer = new ResizeObserver(() => {
      Blockly.svgResize(workspace);
    });
    observer.observe(blocklyHostRef.current);

    return () => {
      observer.disconnect();
      workspace.dispose();
      workspaceRef.current = null;
    };
  }, []);

  // Load selected program XML/JSON into Blockly workspace when selection changes
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace || !activeProgram) return;
    if (loadedProgramIdRef.current === activeProgram.id) return;

    suppressChangeRef.current = true;
    try {
      workspace.clear();
      if (activeProgram.workspaceJson && Object.keys(activeProgram.workspaceJson).length > 0) {
        Blockly.serialization.workspaces.load(activeProgram.workspaceJson, workspace);
      }
      loadedProgramIdRef.current = activeProgram.id;
    } finally {
      suppressChangeRef.current = false;
    }

    const { pythonCode: py, codeyCode: codey, cppCode: cpp, jsCode: js } =
      generateCubeSatCode(workspace, boardProfileRef.current);
    setPythonCode(py);
    setCodeyCode(codey);
    setCppCode(cpp);
    setJsCode(js);
    setLiveWorkspaceJson(Blockly.serialization.workspaces.save(workspace) as Record<string, unknown>);
  }, [activeProgram]);

  // Regenerate C++ code when hardware board profile toggles (Auriga/STM32 vs e-Gizmo gizDuino AVR)
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const { pythonCode: py, codeyCode: codey, cppCode: cpp, jsCode: js } =
      generateCubeSatCode(workspace, boardProfile);
    setPythonCode(py);
    setCodeyCode(codey);
    setCppCode(cpp);
    setJsCode(js);
  }, [boardProfile]);

  // Stop simulation cleanly
  const stopSimulation = useCallback(() => {
    runningRef.current = false;
    setIsRunning(false);
    for (const id of tickTimersRef.current) {
      clearInterval(id);
    }
    tickTimersRef.current = [];
    if (physicsTimerRef.current !== null) {
      clearInterval(physicsTimerRef.current);
      physicsTimerRef.current = null;
    }
    compiledRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopSimulation();
    };
  }, [stopSimulation]);

  // Start Live mBlock Simulation
  const startSimulation = useCallback(async () => {
    stopSimulation();
    const workspace = workspaceRef.current;
    const latestJs = workspace ? generateCubeSatCode(workspace).jsCode : jsCode;

    const { simApi, appendLog } = createSimRuntime(
      () => telemetryRef.current,
      (updater) => setTelemetry(updater),
      () => runningRef.current
    );

    try {
      const compiled = bindCompiledHandlers(latestJs, simApi);
      compiledRef.current = compiled;
      runningRef.current = true;
      setIsRunning(true);

      setTelemetry((prev) => ({
        ...prev,
        logs: appendLog(prev, 'OBC', `Старт mBlock-прошивки «${activeProgram?.name || 'OBC'}»`),
      }));

      // Orbital physics & power budget tick (every 500ms)
      physicsTimerRef.current = window.setInterval(() => {
        setTelemetry((prev) => stepCubeSatPhysics(prev, 0.5));
      }, 500);

      if (compiled.onBoot) {
        await compiled.onBoot();
      }

      for (const tick of compiled.ticks) {
        const ms = Math.max(400, tick.intervalSec * 1000);
        const timerId = window.setInterval(() => {
          if (runningRef.current) {
            tick.fn().catch((err) => {
              console.error('Tick runtime error:', err);
            });
          }
        }, ms);
        tickTimersRef.current.push(timerId);
      }
    } catch (err) {
      stopSimulation();
      setTelemetry((prev) => ({
        ...prev,
        logs: appendLog(
          prev,
          'OBC',
          `Ошибка выполнения: ${err instanceof Error ? err.message : 'Синтаксис блоков'}`
        ),
      }));
    }
  }, [activeProgram?.name, jsCode, stopSimulation]);

  const handleStepTick = async () => {
    const workspace = workspaceRef.current;
    const latestJs = workspace ? generateCubeSatCode(workspace).jsCode : jsCode;
    const { simApi, appendLog } = createSimRuntime(
      () => telemetryRef.current,
      (updater) => setTelemetry(updater),
      () => true,
      true
    );
    try {
      const compiled = compiledRef.current || bindCompiledHandlers(latestJs, simApi);
      if (!compiledRef.current) {
        compiledRef.current = compiled;
        if (compiled.onBoot) await compiled.onBoot();
      }
      setTelemetry((prev) => stepCubeSatPhysics(prev, 1));
      for (const tick of compiled.ticks) {
        await tick.fn();
      }
    } catch (err) {
      setTelemetry((prev) => ({
        ...prev,
        logs: appendLog(
          prev,
          'OBC',
          `Ошибка шага: ${err instanceof Error ? err.message : 'Синтаксис'}`
        ),
      }));
    }
  };

  const handleSimulateThermalBurst = async () => {
    const workspace = workspaceRef.current;
    const latestJs = workspace ? generateCubeSatCode(workspace).jsCode : jsCode;
    let simState = telemetryRef.current;

    const { simApi, appendLog } = createSimRuntime(
      () => simState,
      (updater) => {
        simState = updater(simState);
      },
      () => true,
      true
    );

    try {
      const compiled = bindCompiledHandlers(latestJs, simApi);
      if (compiled.onBoot && simState.simTimeSec === 0) {
        await compiled.onBoot();
      }
      for (let sec = 0; sec < 30; sec++) {
        simState = stepCubeSatPhysics(simState, 1);
        for (const tick of compiled.ticks) {
          if (sec % Math.max(1, tick.intervalSec) === 0) {
            await tick.fn();
          }
        }
      }
      simState = {
        ...simState,
        logs: appendLog(
          simState,
          'EPS',
          `Тепловой прогон +30с: COMMS ${simState.temps.COMMS.toFixed(1)}°C, PAYLOAD ${simState.temps.CAM.toFixed(1)}°C, EPS ${simState.temps.EPS.toFixed(1)}°C`
        ),
      };
      setTelemetry(simState);
    } catch {
      for (let sec = 0; sec < 30; sec++) {
        simState = stepCubeSatPhysics(simState, 1);
      }
      setTelemetry(simState);
    }
  };

  const handleChangeScenario = (nextScenario: SimScenarioId) => {
    stopSimulation();
    setScenario(nextScenario);
    setTelemetry(createInitialTelemetry(nextScenario));
  };

  const handleToggleFault = (key: keyof FaultInjectionState) => {
    setTelemetry((prev) => ({
      ...prev,
      faults: {
        ...prev.faults,
        [key]: !prev.faults[key],
      },
    }));
  };

  const handleRunPreflight = async () => {
    setRunningPreflight(true);
    try {
      const workspace = workspaceRef.current;
      const latestJs = workspace ? generateCubeSatCode(workspace).jsCode : jsCode;
      const report = await runPreflightVerification(
        latestJs,
        activeProgram?.name || 'mBlock OBC'
      );
      setPreflightReport(report);
    } finally {
      setRunningPreflight(false);
    }
  };

  // Visual Block Unit Testing helpers
  const activeProgId = activeProgram?.id || 'default';
  const activeUnitTests =
    unitTestsByProgram[activeProgId] || buildPresetUnitTests(liveWorkspaceJson);
  const activeUnitReport = unitReportByProgram[activeProgId] || null;
  const staticAnalysis = analyzeWorkspaceBlocks(liveWorkspaceJson);

  const getLatestCodeAndJson = () => {
    const workspace = workspaceRef.current;
    const latestJs = workspace ? generateCubeSatCode(workspace).jsCode : jsCode;
    const latestJson = workspace
      ? (Blockly.serialization.workspaces.save(workspace) as Record<string, unknown>)
      : liveWorkspaceJson;
    return { latestJs, latestJson };
  };

  const handleRunAllUnitTests = async (overrideCases?: UnitTestCase[]) => {
    setRunningUnitTests(true);
    try {
      const { latestJs, latestJson } = getLatestCodeAndJson();
      const cases = overrideCases || activeUnitTests;
      const report = await runUnitTestSuite(latestJs, latestJson, cases);
      setUnitReportByProgram((prev) => ({ ...prev, [activeProgId]: report }));
    } finally {
      setRunningUnitTests(false);
    }
  };

  const handleRunSingleUnitTest = async (testId: string) => {
    const tc = activeUnitTests.find((t) => t.id === testId);
    if (!tc) return;
    setRunningUnitTests(true);
    try {
      const { latestJs, latestJson } = getLatestCodeAndJson();
      const { result } = await runSingleUnitTest(latestJs, tc);
      const analysis = analyzeWorkspaceBlocks(latestJson);

      setUnitReportByProgram((prev) => {
        const existing = prev[activeProgId];
        const mergedResults = existing
          ? [
              ...existing.results.filter((r) => r.testId !== testId),
              result,
            ]
          : [result];
        const skippedCount = mergedResults.filter((r) => r.skipped).length;
        const passedCount = mergedResults.filter((r) => !r.skipped && r.passed).length;
        const failedCount = mergedResults.filter((r) => !r.skipped && !r.passed).length;

        return {
          ...prev,
          [activeProgId]: {
            executedAt: new Date().toISOString(),
            staticAnalysis: analysis,
            results: mergedResults,
            passedCount,
            failedCount,
            skippedCount,
            totalActive: mergedResults.length,
            coveragePct: existing?.coveragePct ?? (result.passed ? 100 : 0),
            coveredMethods: existing?.coveredMethods ?? [],
            uncoveredMethods: existing?.uncoveredMethods ?? [],
            readyForSimulator: !analysis.hasBlockingErrors && failedCount === 0 && passedCount > 0,
          },
        };
      });
    } finally {
      setRunningUnitTests(false);
    }
  };

  const handleToggleUnitTest = (testId: string) => {
    const updated = activeUnitTests.map((t) =>
      t.id === testId ? { ...t, enabled: !t.enabled } : t
    );
    setUnitTestsByProgram((prev) => ({ ...prev, [activeProgId]: updated }));
  };

  const handleAddCustomUnitTest = (custom: UnitTestCase) => {
    const updated = [...activeUnitTests, custom];
    setUnitTestsByProgram((prev) => ({ ...prev, [activeProgId]: updated }));
    void handleRunAllUnitTests(updated);
  };

  const handleUpdateUnitTest = (updatedCase: UnitTestCase) => {
    const updated = activeUnitTests.map((t) => (t.id === updatedCase.id ? updatedCase : t));
    setUnitTestsByProgram((prev) => ({ ...prev, [activeProgId]: updated }));
    void handleRunAllUnitTests(updated);
  };

  const handleDeleteUnitTest = (testId: string) => {
    const updated = activeUnitTests.filter((t) => t.id !== testId);
    setUnitTestsByProgram((prev) => ({ ...prev, [activeProgId]: updated }));
  };

  const handleResetUnitTests = () => {
    const { latestJson } = getLatestCodeAndJson();
    const fresh = buildPresetUnitTests(latestJson);
    setUnitTestsByProgram((prev) => {
      const next = { ...prev, [activeProgId]: fresh };
      return next;
    });
    setUnitReportByProgram((prev) => {
      const copy = { ...prev };
      delete copy[activeProgId];
      return copy;
    });
  };

  const handleFocusBlock = (blockId: string) => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    workspace.centerOnBlock(blockId);
    const blk = workspace.getBlockById(blockId);
    if (blk) blk.select();
  };

  const sendTelecommand = async (cmd: string) => {
    const workspace = workspaceRef.current;
    const latestJs = workspace ? generateCubeSatCode(workspace).jsCode : jsCode;
    if (!compiledRef.current) {
      const { simApi } = createSimRuntime(
        () => telemetryRef.current,
        (updater) => setTelemetry(updater),
        () => true,
        true
      );
      try {
        compiledRef.current = bindCompiledHandlers(latestJs, simApi);
      } catch {
        // ignore
      }
    }
    const handler = compiledRef.current?.commands[cmd];
    setTelemetry((prev) => ({
      ...prev,
      logs: [
        {
          id: `${Date.now()}-cmd`,
          time: new Date().toLocaleTimeString('ru-RU', { hour12: false }),
          source: 'COMMS' as const,
          text: `Принята радиокоманда Земли: ${cmd}`,
        },
        ...prev.logs,
      ].slice(0, 80),
    }));
    if (handler) {
      await handler();
    }
  };

  const handleCaptureMakeblockFrame = useCallback(() => {
    setTelemetry((prev) => {
      const frames = buildCubeSatTelemetryFrames(prev);
      const stamp = new Date().toLocaleTimeString('ru-RU', { hour12: false });
      return {
        ...prev,
        makeblockFramesCount: prev.makeblockFramesCount + frames.length,
        makeblockFrames: [...frames, ...prev.makeblockFrames].slice(0, 32),
        logs: [
          {
            id: `${Date.now()}-ff55`,
            time: stamp,
            source: 'COMMS' as const,
            text: `Снимок протокола 0xFF 0x55: передано ${frames.length} пакета (V_BAT, ω_X, Pitch, T_BAT)`,
          },
          ...prev.logs,
        ].slice(0, 80),
      };
    });
  }, []);

  const handleSaveCurrent = (customNote?: string) => {
    const workspace = workspaceRef.current;
    if (!workspace || !activeProgram) return;
    const workspaceJson = Blockly.serialization.workspaces.save(workspace) as Record<string, unknown>;
    const { pythonCode: py, cppCode: cpp } = generateCubeSatCode(workspace, boardProfile);
    onSaveProgram({
      id: activeProgram.id,
      projectId: activeProgram.projectId || projectId,
      name: activeProgram.name,
      subsystem: activeProgram.subsystem,
      targetBoard: activeProgram.targetBoard,
      author: engineerName,
      description: activeProgram.description,
      workspaceJson,
      pythonCode: py,
      cppCode: cpp,
      saveNote: customNote?.trim() || undefined,
    });
    setSaveFeedback('Сохранено');
    window.setTimeout(() => setSaveFeedback(null), 1800);
  };

  const handleLoadVersion = (version: ProgramVersion) => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    stopSimulation();
    suppressChangeRef.current = true;
    try {
      workspace.clear();
      if (version.workspaceJson && Object.keys(version.workspaceJson).length > 0) {
        Blockly.serialization.workspaces.load(version.workspaceJson, workspace);
      }
    } finally {
      suppressChangeRef.current = false;
    }
    const { pythonCode: py, codeyCode: codey, cppCode: cpp, jsCode: js } =
      generateCubeSatCode(workspace, boardProfile);
    setPythonCode(py);
    setCodeyCode(codey);
    setCppCode(cpp);
    setJsCode(js);
  };

  const handleCreateProgram = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    const id = `prog-${Date.now().toString(36)}`;
    const starterJson = {
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: 'sat_event_boot',
            id: `boot_${Date.now()}`,
            x: 40,
            y: 36,
            next: {
              block: {
                type: 'obc_set_mode',
                id: `mode_${Date.now()}`,
                fields: { MODE: 'NOMINAL' },
              },
            },
          },
        ],
      },
    };
    onSaveProgram({
      id,
      projectId,
      name: trimmed,
      subsystem: newSubsystem,
      targetBoard: newBoard,
      author: engineerName,
      description: newDesc.trim() || 'Новая бортовая программа кубсата school76',
      workspaceJson: starterJson,
      pythonCode: `from cubesat import obc\n\ndef on_boot():\n    obc.set_mode('NOMINAL')\n`,
      cppCode: `#include <School76CubeSat.h>\n\nvoid setup() {\n  CubeSat.begin();\n  obc.setMode(OBC_NOMINAL);\n}\n`,
    });
    loadedProgramIdRef.current = null;
    onSelectProgram(id);
    setNewName('');
    setNewDesc('');
    setShowCreateModal(false);
  };

  const s2eExtensionText = React.useMemo(() => generateCubeSatS2eExtension(), []);
  const headerLibraryText = React.useMemo(
    () => generateSchool76CubeSatHeader(boardProfile),
    [boardProfile]
  );

  const displayedCode =
    codeLang === 'python'
      ? pythonCode
      : codeLang === 'codey'
        ? codeyCode
        : codeLang === 'cpp'
          ? cppCode
          : bundleFile === 's2e'
            ? s2eExtensionText
            : headerLibraryText;

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(displayedCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const handleDownloadCode = () => {
    const baseName = activeProgram?.id || 'school76_obc';
    const filename =
      codeLang === 'python'
        ? `${baseName}.py`
        : codeLang === 'codey'
          ? `${baseName}_codey.py`
          : codeLang === 'cpp'
            ? `${baseName}.ino`
            : bundleFile === 's2e'
              ? 'school76_cubesat.s2e'
              : 'School76CubeSat.h';
    const blob = new Blob([displayedCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-57px)] bg-slate-50">
      {/* Studio Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-2.5 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3 min-w-0">
          <label htmlFor="mblock-program-select" className="text-xs font-medium text-slate-500 whitespace-nowrap">
            Бортовая программа
          </label>
          <select
            id="mblock-program-select"
            value={activeProgram?.id || ''}
            onChange={(e) => {
              stopSimulation();
              loadedProgramIdRef.current = null;
              onSelectProgram(e.target.value);
            }}
            className="max-w-xs px-3 py-1.5 text-sm font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            {programs.map((prog) => (
              <option key={prog.id} value={prog.id}>
                {prog.subsystem} · {prog.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Новая
          </button>

          {programs.length > 1 && activeProgram && (
            <button
              type="button"
              onClick={() => {
                stopSimulation();
                loadedProgramIdRef.current = null;
                onDeleteProgram(activeProgram.id);
              }}
              title="Удалить программу"
              className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors rounded-md"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {activeProgram && (
            <span className="hidden xl:inline text-xs text-slate-500 truncate max-w-md">
              {activeProgram.targetBoard} · Автор: {activeProgram.author}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center p-0.5 bg-slate-100 border border-slate-200 rounded-lg">
            <button
              type="button"
              onClick={() => setPanelMode('tests')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                panelMode === 'tests'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FlaskConical className="w-3.5 h-3.5 text-sky-600" />
              Модульные тесты
              {activeUnitReport && (
                <span
                  className={`font-mono text-[10px] font-bold tabular-nums ${
                    activeUnitReport.failedCount > 0 ? 'text-rose-600' : 'text-emerald-700'
                  }`}
                >
                  {activeUnitReport.passedCount}/{activeUnitReport.totalActive}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setPanelMode('live')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                panelMode === 'live'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Онлайн-стенд
            </button>
            <button
              type="button"
              onClick={() => setPanelMode('code')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                panelMode === 'code'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Код Python / C++
            </button>
            <button
              type="button"
              onClick={() => setPanelMode('history')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                panelMode === 'history'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Версии ({activeProgram?.versions?.length ?? 1})
            </button>
          </div>

          <button
            type="button"
            onClick={() => activeProgram && onDiscussProgram(activeProgram.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            В чат
          </button>

          <button
            type="button"
            onClick={() => handleSaveCurrent()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 transition-colors whitespace-nowrap shrink-0"
          >
            {saveFeedback ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {saveFeedback || 'Сохранить'}
          </button>
        </div>
      </div>

      {/* Main Split Workspace: Blockly Canvas + UnitTests/Simulator/Code */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Left: Blockly Zelos mBlock Canvas */}
        <div className="flex-1 min-h-[380px] relative school76-blockly border-b lg:border-b-0 lg:border-r border-slate-200 bg-white">
          <div ref={blocklyHostRef} className="absolute inset-0" />
        </div>

        {/* Right: Unit Tests OR Live 1U CubeSat Bench OR Python/C++ Code Panel */}
        <aside className="w-full lg:w-[460px] xl:w-[510px] flex flex-col bg-white min-h-0 overflow-y-auto">
          {panelMode === 'tests' ? (
            <MBlockUnitTestPanel
              programName={activeProgram?.name || 'mBlock OBC'}
              testCases={activeUnitTests}
              staticAnalysis={staticAnalysis}
              report={activeUnitReport}
              running={runningUnitTests}
              onRunAll={() => void handleRunAllUnitTests()}
              onRunSingle={(testId) => void handleRunSingleUnitTest(testId)}
              onToggleTest={handleToggleUnitTest}
              onAddCustomTest={handleAddCustomUnitTest}
              onUpdateTest={handleUpdateUnitTest}
              onDeleteTest={handleDeleteUnitTest}
              onResetTests={handleResetUnitTests}
              onFocusBlock={handleFocusBlock}
              onProceedToSimulator={() => setPanelMode('live')}
            />
          ) : panelMode === 'live' ? (
            <OnboardSimulatorModule
              programName={activeProgram?.name || 'mBlock OBC'}
              telemetry={telemetry}
              isRunning={isRunning}
              scenario={scenario}
              preflightReport={preflightReport}
              runningPreflight={runningPreflight}
              onChangeScenario={handleChangeScenario}
              onStart={startSimulation}
              onStop={stopSimulation}
              onStepTick={handleStepTick}
              onSimulateThermalBurst={() => void handleSimulateThermalBurst()}
              onReset={() => {
                stopSimulation();
                setTelemetry(createInitialTelemetry(scenario));
              }}
              onToggleEclipse={() =>
                setTelemetry((p) => ({ ...p, inEclipse: !p.inEclipse }))
              }
              onSpinImpulse={() =>
                setTelemetry((p) => ({
                  ...p,
                  gyro: { X: 16.4, Y: -11.2, Z: 8.7 },
                }))
              }
              onBatteryOverride={(pct) =>
                setTelemetry((p) => ({
                  ...p,
                  batteryPct: pct,
                  batteryVolt: 6.35 + (pct / 100) * 1.95,
                }))
              }
              onToggleFault={handleToggleFault}
              onSendCommand={sendTelecommand}
              onCaptureMakeblockFrame={handleCaptureMakeblockFrame}
              onClearLogs={() => setTelemetry((p) => ({ ...p, logs: [] }))}
              onRunPreflight={handleRunPreflight}
              onExportFirmware={handleDownloadCode}
            />
          ) : panelMode === 'code' ? (
            /* Upload Mode: Synchronized Python / Codey / Makeblock C++ / .s2e & .h Bundle View */
            <div className="flex flex-col h-full">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50">
                <div className="flex flex-wrap items-center p-0.5 bg-slate-200/70 rounded-md">
                  <button
                    type="button"
                    onClick={() => setCodeLang('python')}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                      codeLang === 'python'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    MicroPython
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodeLang('codey')}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                      codeLang === 'codey'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Codey / CyberPi
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodeLang('cpp')}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                      codeLang === 'cpp'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Makeblock C++
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodeLang('bundle')}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                      codeLang === 'bundle'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    .s2e / .h
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Скопировано' : 'Копия'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadCode}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Экспорт
                  </button>
                </div>
              </div>

              {(codeLang === 'cpp' || codeLang === 'bundle') && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-slate-100/70 border-b border-slate-200 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">Плата:</span>
                    <button
                      type="button"
                      onClick={() => setBoardProfile('auriga_stm32')}
                      className={`px-2 py-0.5 rounded font-medium border transition-colors ${
                        boardProfile === 'auriga_stm32'
                          ? 'bg-sky-600 text-white border-sky-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      Auriga / STM32F4
                    </button>
                    <button
                      type="button"
                      onClick={() => setBoardProfile('gizduino_avr')}
                      className={`px-2 py-0.5 rounded font-medium border transition-colors ${
                        boardProfile === 'gizduino_avr'
                          ? 'bg-sky-600 text-white border-sky-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      MeOrion / e-Gizmo AVR
                    </button>
                  </div>

                  {codeLang === 'bundle' && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setBundleFile('s2e')}
                        className={`px-2 py-0.5 rounded font-mono text-[11px] border transition-colors ${
                          bundleFile === 's2e'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        school76_cubesat.s2e
                      </button>
                      <button
                        type="button"
                        onClick={() => setBundleFile('header')}
                        className={`px-2 py-0.5 rounded font-mono text-[11px] border transition-colors ${
                          bundleFile === 'header'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        School76CubeSat.h
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="px-4 py-2 bg-white border-b border-slate-200 text-xs text-slate-500">
                {codeLang === 'python'
                  ? 'Трансляция блоков mBlock в MicroPython для бортового контроллера ESP32 / CyberPi.'
                  : codeLang === 'codey'
                    ? MAKEBLOCK_BOARD_PROFILES.codey_esp32.description
                    : codeLang === 'cpp'
                      ? MAKEBLOCK_BOARD_PROFILES[boardProfile].description
                      : bundleFile === 's2e'
                        ? 'Дескриптор расширения mBlock (.s2e JSON) для загрузки блоков кубсата 1U в Makeblock / e-Gizmo mBlock.'
                        : `Заголовок School76CubeSat.h с драйверами MeGyro (tau=0.5s), PID-стабилизацией и кадрами 0xFF 0x55 (${MAKEBLOCK_BOARD_PROFILES[boardProfile].mcu}).`}
              </div>

              <pre className="flex-1 overflow-auto p-4 bg-slate-950 text-slate-100 font-mono text-xs leading-relaxed">
                <code>{displayedCode}</code>
              </pre>
            </div>
          ) : (
            /* Version History Panel */
            <div className="flex flex-col h-full">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">
                    История версий программы
                  </span>
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    {activeProgram?.versions?.length ?? 0} сохр.
                  </span>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveCurrent(newVersionNote);
                    setNewVersionNote('');
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={newVersionNote}
                    onChange={(e) => setNewVersionNote(e.target.value)}
                    placeholder="Краткая заметка к новой итерации..."
                    maxLength={280}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 transition-colors whitespace-nowrap shrink-0"
                  >
                    Сохранить
                  </button>
                </form>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {!activeProgram?.versions || activeProgram.versions.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    Сохранённых итераций пока нет. Нажмите «Сохранить», чтобы зафиксировать первую версию.
                  </div>
                ) : (
                  activeProgram.versions.map((ver, idx) => {
                    const verNum = activeProgram.versions!.length - idx;
                    const isEditing = editingVersionId === ver.id;
                    const dateLabel = new Date(ver.savedAt).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <div key={ver.id} className="p-4 space-y-2 hover:bg-slate-50/70 transition-colors">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono font-semibold text-slate-900">
                              v{verNum}
                            </span>
                            <span className="text-slate-400" aria-hidden="true">·</span>
                            <span className="font-medium text-slate-700 truncate">
                              {ver.author}
                            </span>
                          </div>
                          <span className="font-mono tabular-nums text-[11px] text-slate-500 shrink-0">
                            {dateLabel}
                          </span>
                        </div>

                        {isEditing ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              onUpdateVersionNote(activeProgram.id, ver.id, editingNoteText.trim());
                              setEditingVersionId(null);
                            }}
                            className="space-y-2"
                          >
                            <textarea
                              rows={2}
                              value={editingNoteText}
                              onChange={(e) => setEditingNoteText(e.target.value)}
                              maxLength={280}
                              placeholder="Введите инженерную заметку к этой итерации..."
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingVersionId(null)}
                                className="px-2.5 py-1 text-xs text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50"
                              >
                                Отмена
                              </button>
                              <button
                                type="submit"
                                className="px-2.5 py-1 text-xs font-medium text-white bg-sky-600 rounded hover:bg-sky-700"
                              >
                                Сохранить заметку
                              </button>
                            </div>
                          </form>
                        ) : (
                          <p className="text-xs text-slate-700 leading-relaxed">
                            {ver.note ? (
                              ver.note
                            ) : (
                              <span className="text-slate-400">Заметка не добавлена</span>
                            )}
                          </p>
                        )}

                        {!isEditing && (
                          <div className="flex items-center justify-between pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingVersionId(ver.id);
                                setEditingNoteText(ver.note || '');
                              }}
                              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-sky-700 transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                              {ver.note ? 'Изменить заметку' : 'Добавить заметку'}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleLoadVersion(ver)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline transition-colors"
                            >
                              <RotateCw className="w-3 h-3" />
                              Загрузить блоки
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Create New mBlock Program Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleCreateProgram}
            className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-lg p-6 space-y-4"
          >
            <h3 className="text-lg font-semibold text-slate-900">
              Новая бортовая программа
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Название алгоритма
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Например: Ночной режим экономии энергии"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Подсистема
                  </label>
                  <select
                    value={newSubsystem}
                    onChange={(e) => setNewSubsystem(e.target.value as Subsystem)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  >
                    {(Object.keys(SUBSYSTEM_LABELS) as Subsystem[]).map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Целевая плата
                  </label>
                  <select
                    value={newBoard}
                    onChange={(e) => setNewBoard(e.target.value as TargetBoard)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  >
                    <option value="CyberPi / ESP32 (MicroPython)">MicroPython</option>
                    <option value="STM32F4 OBC (Arduino C++)">STM32 C++</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Назначение
                </label>
                <textarea
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Краткое описание логики для команды..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700"
              >
                Создать в mBlock
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
