import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as Blockly from 'blockly';
import * as Ru from 'blockly/msg/ru';
import {
  Play,
  Square,
  RotateCcw,
  Save,
  Plus,
  MessageSquare,
  Copy,
  Check,
  Download,
  Sun,
  Moon,
  Zap,
  Trash2,
  History,
  Pencil,
  RotateCw,
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
  type CompiledHandlers,
  type CubeSatTelemetry,
} from '../mblock/simulator.ts';

interface MBlockStudioProps {
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

  const [panelMode, setPanelMode] = useState<'live' | 'code' | 'history'>('live');
  const [codeLang, setCodeLang] = useState<'python' | 'cpp'>('python');
  const [pythonCode, setPythonCode] = useState(activeProgram?.pythonCode || '');
  const [cppCode, setCppCode] = useState(activeProgram?.cppCode || '');
  const [jsCode, setJsCode] = useState('');
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

  // Live CubeSat Hardware Simulator state
  const [isRunning, setIsRunning] = useState(false);
  const [telemetry, setTelemetry] = useState<CubeSatTelemetry>(createInitialTelemetry);

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
      const { pythonCode: py, cppCode: cpp, jsCode: js } = generateCubeSatCode(workspace);
      setPythonCode(py);
      setCppCode(cpp);
      setJsCode(js);
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

    const { pythonCode: py, cppCode: cpp, jsCode: js } = generateCubeSatCode(workspace);
    setPythonCode(py);
    setCppCode(cpp);
    setJsCode(js);
  }, [activeProgram]);

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
        setTelemetry((prev) => {
          const solarInputW = prev.inEclipse
            ? 0
            : (prev.solarMa['X+'] + prev.solarMa['Y+'] + prev.solarMa['Z+']) * 0.005;
          const loadW =
            1.1 +
            (prev.rails.COMMS_3V3 ? 0.8 : 0) +
            (prev.rails.ADCS_5V ? 1.2 : 0) +
            (prev.rails.PAYLOAD_5V ? 2.4 : 0) +
            (prev.heaterOn ? 1.5 : 0);
          const netDeltaPct = (solarInputW - loadW) * 0.14;
          const nextBat = Math.max(0, Math.min(100, prev.batteryPct + netDeltaPct));
          const nextVolt = 6.4 + (nextBat / 100) * 1.9;
          const nextBatTemp = prev.inEclipse
            ? Math.max(-12, prev.temps.BAT - (prev.heaterOn ? -0.18 : 0.14))
            : Math.min(34, prev.temps.BAT + (prev.heaterOn ? 0.25 : 0.08));

          return {
            ...prev,
            batteryPct: nextBat,
            batteryVolt: nextVolt,
            watchdogAgeSec: prev.watchdogAgeSec + 0.5,
            temps: {
              ...prev.temps,
              BAT: nextBatTemp,
              OBC: prev.inEclipse ? Math.max(4, prev.temps.OBC - 0.06) : Math.min(38, prev.temps.OBC + 0.05),
            },
          };
        });
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

  const sendTelecommand = async (cmd: string) => {
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
      ].slice(0, 60),
    }));
    if (handler && runningRef.current) {
      await handler();
    }
  };

  const handleSaveCurrent = (customNote?: string) => {
    const workspace = workspaceRef.current;
    if (!workspace || !activeProgram) return;
    const workspaceJson = Blockly.serialization.workspaces.save(workspace) as Record<string, unknown>;
    const { pythonCode: py, cppCode: cpp } = generateCubeSatCode(workspace);
    onSaveProgram({
      id: activeProgram.id,
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
    const { pythonCode: py, cppCode: cpp, jsCode: js } = generateCubeSatCode(workspace);
    setPythonCode(py);
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

  const displayedCode = codeLang === 'python' ? pythonCode : cppCode;

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(displayedCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const handleDownloadCode = () => {
    const ext = codeLang === 'python' ? 'py' : 'ino';
    const blob = new Blob([displayedCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeProgram?.id || 'school76_obc'}.${ext}`;
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

      {/* Main Split Workspace: Blockly Canvas + Simulator/Code */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Left: Blockly Zelos mBlock Canvas */}
        <div className="flex-1 min-h-[380px] relative school76-blockly border-b lg:border-b-0 lg:border-r border-slate-200 bg-white">
          <div ref={blocklyHostRef} className="absolute inset-0" />
        </div>

        {/* Right: Live 1U CubeSat Bench OR Python/C++ Code Panel */}
        <aside className="w-full lg:w-[440px] xl:w-[470px] flex flex-col bg-white min-h-0 overflow-y-auto">
          {panelMode === 'live' ? (
            <div className="flex flex-col h-full">
              {/* Execution Bar */}
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2">
                  {!isRunning ? (
                    <button
                      type="button"
                      onClick={startSimulation}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 transition-colors whitespace-nowrap"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Запустить стенд
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopSimulation}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 rounded-md hover:bg-rose-700 transition-colors whitespace-nowrap"
                    >
                      <Square className="w-3.5 h-3.5" />
                      Остановить
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      stopSimulation();
                      setTelemetry(createInitialTelemetry());
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Сброс
                  </button>
                </div>

                <span
                  className={`text-xs font-mono font-medium ${
                    isRunning ? 'text-emerald-700' : 'text-slate-500'
                  }`}
                >
                  {isRunning ? '● OBC активен' : '○ Остановлен'}
                </span>
              </div>

              {/* Orbital Condition & Fault Injection Controls */}
              <div className="px-4 py-3 border-b border-slate-200 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setTelemetry((p) => ({ ...p, inEclipse: !p.inEclipse }))
                    }
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      telemetry.inEclipse
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {telemetry.inEclipse ? (
                      <Moon className="w-3.5 h-3.5" />
                    ) : (
                      <Sun className="w-3.5 h-3.5" />
                    )}
                    {telemetry.inEclipse ? 'Орбита: Тень Земли' : 'Орбита: Освещение'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setTelemetry((p) => ({
                        ...p,
                        gyro: { X: 16.4, Y: -11.2, Z: 8.7 },
                      }))
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Импульс вращения
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <label
                    htmlFor="sim-battery-slider"
                    className="text-xs text-slate-600 whitespace-nowrap"
                  >
                    Тест АКБ
                  </label>
                  <input
                    id="sim-battery-slider"
                    type="range"
                    min={5}
                    max={100}
                    step={1}
                    value={Math.round(telemetry.batteryPct)}
                    onChange={(e) => {
                      const pct = Number(e.target.value);
                      setTelemetry((p) => ({
                        ...p,
                        batteryPct: pct,
                        batteryVolt: 6.4 + (pct / 100) * 1.9,
                      }));
                    }}
                    className="flex-1 accent-sky-600"
                  />
                  <span className="text-xs font-mono tabular-nums text-slate-800 w-10 text-right">
                    {telemetry.batteryPct.toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Ground Telecommands */}
              <div className="px-4 py-2.5 border-b border-slate-200">
                <div className="text-xs font-medium text-slate-500 mb-2">
                  Команды наземной станции (UHF 435.800 МГц)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {['PING', 'CAPTURE', 'NOMINAL', 'SAFE', 'DETUMBLE'].map((cmd) => (
                    <button
                      key={cmd}
                      type="button"
                      onClick={() => sendTelecommand(cmd)}
                      className="px-2.5 py-1 text-xs font-mono font-medium text-slate-700 bg-slate-100 hover:bg-sky-50 hover:text-sky-700 border border-slate-200 rounded transition-colors"
                    >
                      {cmd}
                    </button>
                  ))}
                </div>
              </div>

              {/* Telemetry Readout Grid */}
              <div className="px-4 py-3 border-b border-slate-200 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                <div>
                  <div className="text-slate-500">Режим OBC</div>
                  <div className="font-mono font-semibold text-sm text-slate-900 mt-0.5">
                    {telemetry.mode}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Батарея EPS</div>
                  <div className="font-mono font-semibold text-sm text-slate-900 tabular-nums mt-0.5">
                    {telemetry.batteryPct.toFixed(1)}% · {telemetry.batteryVolt.toFixed(2)} В
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Гироскоп X/Y/Z (°/с)</div>
                  <div className="font-mono font-medium text-slate-900 tabular-nums mt-0.5">
                    {telemetry.gyro.X.toFixed(1)} / {telemetry.gyro.Y.toFixed(1)} / {telemetry.gyro.Z.toFixed(1)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Темп. OBC / АКБ</div>
                  <div className="font-mono font-medium text-slate-900 tabular-nums mt-0.5">
                    {telemetry.temps.OBC.toFixed(1)}°C / {telemetry.temps.BAT.toFixed(1)}°C
                  </div>
                </div>
                <div className="col-span-2 pt-1 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-slate-500">Шины питания</span>
                  <span className="font-mono text-[11px] text-slate-800">
                    COMMS {telemetry.rails.COMMS_3V3 ? 'ВКЛ' : 'ВЫКЛ'} · ADCS {telemetry.rails.ADCS_5V ? 'ВКЛ' : 'ВЫКЛ'} · PAY {telemetry.rails.PAYLOAD_5V ? 'ВКЛ' : 'ВЫКЛ'}
                  </span>
                </div>
                <div className="col-span-2 flex items-center justify-between">
                  <span className="text-slate-500">Счётчики связи и ДЗЗ</span>
                  <span className="font-mono text-[11px] tabular-nums text-slate-800">
                    Маяки: {telemetry.beaconsSent} · TLM: {telemetry.packetsSent} · Кадры: {telemetry.imagesCaptured}
                  </span>
                </div>
              </div>

              {/* Live OBC Serial Console */}
              <div className="flex-1 flex flex-col min-h-[160px] bg-slate-950 text-slate-100">
                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 text-xs text-slate-400">
                  <span>Бортовой журнал UART / AX.25</span>
                  <button
                    type="button"
                    onClick={() => setTelemetry((p) => ({ ...p, logs: [] }))}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    Очистить
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed space-y-1">
                  {telemetry.logs.length === 0 ? (
                    <div className="text-slate-500">
                      Нажмите «Запустить стенд», чтобы выполнить блоки mBlock на модели кубсата 1U.
                    </div>
                  ) : (
                    telemetry.logs.map((log) => (
                      <div key={log.id} className="flex gap-2">
                        <span className="text-slate-500 shrink-0">{log.time}</span>
                        <span className="text-sky-400 shrink-0 w-14">[{log.source}]</span>
                        <span className="text-slate-200 break-words">{log.text}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : panelMode === 'code' ? (
            /* Upload Mode: Synchronized Python / C++ Transpiler View */
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
                <div className="flex items-center p-0.5 bg-slate-200/70 rounded-md">
                  <button
                    type="button"
                    onClick={() => setCodeLang('python')}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                      codeLang === 'python'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    MicroPython
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodeLang('cpp')}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                      codeLang === 'cpp'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Arduino / STM32 C++
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

              <div className="px-4 py-2 bg-white border-b border-slate-200 text-xs text-slate-500">
                {codeLang === 'python'
                  ? 'Трансляция блоков mBlock в MicroPython для бортового контроллера ESP32 / CyberPi.'
                  : 'Генерация прошивки C++ для STM32F4 / Arduino OBC в режиме загрузки.'}
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
