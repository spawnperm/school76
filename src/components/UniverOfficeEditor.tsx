import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createUniver,
  LocaleType,
  mergeLocales,
  type FUniver,
  type IDocumentData,
  type IWorkbookData,
} from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import UniverPresetSheetsCoreRuRU from '@univerjs/preset-sheets-core/locales/ru-RU';
import '@univerjs/preset-sheets-core/lib/index.css';

import { UniverDocsCorePreset } from '@univerjs/preset-docs-core';
import UniverPresetDocsCoreRuRU from '@univerjs/preset-docs-core/locales/ru-RU';
import '@univerjs/preset-docs-core/lib/index.css';

import {
  Download,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  HardDrive,
  Plus,
  Save,
  Upload,
} from 'lucide-react';
import type {
  CommunityProject,
  CubeSatTask,
  GarageObjectMeta,
} from '../types/cubesat.ts';
import {
  arrayBufferToBase64,
  createEngineeringBudgetWorkbook,
  createEngineeringSpecDocument,
  detectOfficeKind,
  docxBufferToUniverDocument,
  isOfficeFilename,
  isSpreadsheetFilename,
  textToUniverDocument,
  univerDocumentToDocxBlob,
  univerWorkbookToXlsxArrayBuffer,
  xlsxBufferToUniverWorkbook,
  type OfficeDocKind,
} from '../utils/univerConverters.ts';
import {
  downloadTextOrBlobFile,
  uploadBinaryToS3,
  useTransientStatus,
} from '../utils/formatters.ts';

interface UniverOfficeEditorProps {
  project: CommunityProject;
  tasks: CubeSatTask[];
  s3Objects: GarageObjectMeta[];
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  authFetch: (url: string, options?: RequestInit) => Promise<any>;
  onS3Changed: () => Promise<void> | void;
  requestedS3Object?: GarageObjectMeta | null;
  onConsumeRequestedS3Object?: () => void;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const UniverOfficeEditor: React.FC<UniverOfficeEditorProps> = ({
  project,
  tasks,
  s3Objects,
  isAuthenticated,
  onRequireAuth,
  authFetch,
  onS3Changed,
  requestedS3Object,
  onConsumeRequestedS3Object,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const univerApiRef = useRef<FUniver | null>(null);

  const [docKind, setDocKind] = useState<OfficeDocKind>('sheet');
  const [fileName, setFileName] = useState<string>(`${project.forgejoRepo}-budget.xlsx`);
  const [initialPayload, setInitialPayload] = useState<
    Partial<IWorkbookData> | Partial<IDocumentData>
  >(() => createEngineeringBudgetWorkbook(project, tasks));
  const [sessionKey, setSessionKey] = useState<number>(1);

  const [saving, setSaving] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const { statusMsg, showStatus } = useTransientStatus(2600);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const officeS3Files = useMemo(
    () => s3Objects.filter((obj) => isOfficeFilename(obj.key)),
    [s3Objects]
  );

  // Reset default workspace when switching project
  useEffect(() => {
    if (requestedS3Object) return;
    setDocKind('sheet');
    setFileName(`${project.forgejoRepo}-budget.xlsx`);
    setInitialPayload(createEngineeringBudgetWorkbook(project, tasks));
    setSessionKey((k) => k + 1);
  }, [project.id]);

  // Mount Univer instance for current sessionKey + docKind
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const mountEl = document.createElement('div');
    mountEl.className = 'w-full h-full';
    host.innerHTML = '';
    host.appendChild(mountEl);

    const isSheet = docKind === 'sheet';
    const { univer, univerAPI } = createUniver({
      locale: LocaleType.RU_RU,
      locales: {
        [LocaleType.RU_RU]: mergeLocales(
          isSheet ? UniverPresetSheetsCoreRuRU : UniverPresetDocsCoreRuRU
        ),
      },
      presets: [
        isSheet
          ? UniverSheetsCorePreset({ container: mountEl })
          : UniverDocsCorePreset({ container: mountEl }),
      ],
    });

    univerApiRef.current = univerAPI;

    try {
      if (isSheet) {
        univerAPI.createWorkbook(initialPayload as Partial<IWorkbookData>);
      } else {
        univerAPI.createDocument(initialPayload as Partial<IDocumentData>);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Ошибка инициализации редактора Univer'
      );
    }

    return () => {
      univerApiRef.current = null;
      queueMicrotask(() => {
        try {
          univer.dispose();
        } catch {
          // ignore disposal noise during fast unmount
        }
        if (mountEl.parentNode === host) {
          host.removeChild(mountEl);
        }
      });
    };
  }, [sessionKey, docKind]);

  const openOfficeBuffer = useCallback(
    async (buffer: ArrayBuffer, rawName: string) => {
      setErrorMsg(null);
      setLoadingFile(true);
      try {
        const cleanName = rawName.trim() || 'document.xlsx';
        const kind = detectOfficeKind(cleanName);
        if (kind === 'sheet') {
          const wbData = xlsxBufferToUniverWorkbook(buffer, cleanName);
          setDocKind('sheet');
          setFileName(cleanName);
          setInitialPayload(wbData);
        } else {
          let docData: Partial<IDocumentData>;
          if (/\.docx?$/i.test(cleanName)) {
            docData = await docxBufferToUniverDocument(buffer, cleanName);
          } else {
            const text = new TextDecoder('utf-8').decode(buffer);
            docData = textToUniverDocument(text, cleanName);
          }
          setDocKind('doc');
          setFileName(cleanName);
          setInitialPayload(docData);
        }
        setSessionKey((k) => k + 1);
        showStatus(`Открыт в Univer: ${cleanName}`, 2500);
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? `Не удалось открыть файл ${rawName}: ${err.message}`
            : `Не удалось открыть файл ${rawName}`
        );
      } finally {
        setLoadingFile(false);
      }
    },
    [showStatus]
  );

  // Open S3 file when requested externally from Garage S3 sidebar
  useEffect(() => {
    if (!requestedS3Object) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingFile(true);
        const res = await fetch(requestedS3Object.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        if (!cancelled) {
          await openOfficeBuffer(buf, requestedS3Object.key);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(
            err instanceof Error
              ? err.message
              : `Ошибка загрузки ${requestedS3Object.key} из Garage S3`
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingFile(false);
          onConsumeRequestedS3Object?.();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestedS3Object, openOfficeBuffer, onConsumeRequestedS3Object]);

  const handleLocalImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg(null);
    try {
      const buffer = await file.arrayBuffer();
      await openOfficeBuffer(buffer, file.name);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : `Ошибка чтения файла ${file.name}`);
    }
  };

  const handleOpenFromS3 = async (obj: GarageObjectMeta) => {
    setLoadingFile(true);
    setErrorMsg(null);
    try {
      const res = await fetch(obj.url);
      if (!res.ok) throw new Error(`Не удалось скачать ${obj.key}`);
      const buffer = await res.arrayBuffer();
      await openOfficeBuffer(buffer, obj.key);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка открытия файла из S3');
      setLoadingFile(false);
    }
  };

  const handleNewBlankSheet = () => {
    const nextName = `sheet-${project.forgejoRepo}-${Date.now().toString(36).slice(-4)}.xlsx`;
    setDocKind('sheet');
    setFileName(nextName);
    setInitialPayload({
      id: `wb-${Date.now().toString(36)}`,
      name: nextName,
      locale: LocaleType.RU_RU,
      styles: {},
      sheetOrder: ['sheet-1'],
      sheets: {
        'sheet-1': {
          id: 'sheet-1',
          name: 'Лист 1',
          rowCount: 60,
          columnCount: 20,
          cellData: {},
        },
      },
    });
    setSessionKey((k) => k + 1);
  };

  const handleNewBudgetTemplate = () => {
    const nextName = `${project.forgejoRepo}-budget.xlsx`;
    setDocKind('sheet');
    setFileName(nextName);
    setInitialPayload(createEngineeringBudgetWorkbook(project, tasks));
    setSessionKey((k) => k + 1);
  };

  const handleNewReportDoc = () => {
    const nextName = `${project.forgejoRepo}-report.docx`;
    setDocKind('doc');
    setFileName(nextName);
    setInitialPayload(createEngineeringSpecDocument(project, tasks));
    setSessionKey((k) => k + 1);
  };

  const exportCurrentBinary = async (): Promise<{
    buffer: ArrayBuffer;
    mime: string;
    downloadName: string;
  }> => {
    const api = univerApiRef.current;
    if (!api) throw new Error('Экземпляр Univer ещё не готов');

    if (docKind === 'sheet') {
      const workbook = api.getActiveWorkbook();
      if (!workbook) throw new Error('Активная таблица не найдена');
      const snapshot = workbook.save();
      const buffer = univerWorkbookToXlsxArrayBuffer(snapshot);
      const base = fileName.trim() || `${project.forgejoRepo}.xlsx`;
      const downloadName = isSpreadsheetFilename(base) ? base.replace(/\.(csv|xls|ods)$/i, '.xlsx') : `${base}.xlsx`;
      return { buffer, mime: XLSX_MIME, downloadName };
    } else {
      const doc = api.getActiveDocument();
      if (!doc) throw new Error('Активный документ не найден');
      const snapshot = doc.getDocumentDataModel().getSnapshot();
      const base = fileName.trim() || `${project.forgejoRepo}.docx`;
      const downloadName = /\.docx$/i.test(base) ? base : `${base.replace(/\.[^.]+$/, '')}.docx`;
      const blob = await univerDocumentToDocxBlob(snapshot, downloadName);
      const buffer = await blob.arrayBuffer();
      return { buffer, mime: DOCX_MIME, downloadName };
    }
  };

  const handleSaveToS3 = async () => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const { buffer, mime, downloadName } = await exportCurrentBinary();
      const base64 = arrayBufferToBase64(buffer);
      await uploadBinaryToS3(authFetch, project.s3Bucket, downloadName, base64, mime);
      setFileName(downloadName);
      showStatus(`Сохранено в Garage S3: ${downloadName}`, 2800);
      await onS3Changed();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка сохранения документа в Garage S3');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadLocal = async () => {
    setErrorMsg(null);
    try {
      const { buffer, mime, downloadName } = await exportCurrentBinary();
      downloadTextOrBlobFile(buffer, downloadName, mime);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка экспорта файла');
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white">
      {/* Office Action Toolbar */}
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span
            className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded border ${
              docKind === 'sheet'
                ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                : 'text-sky-800 bg-sky-50 border-sky-200'
            }`}
          >
            {docKind === 'sheet' ? (
              <FileSpreadsheet className="w-3.5 h-3.5" />
            ) : (
              <FileText className="w-3.5 h-3.5" />
            )}
            {docKind === 'sheet' ? 'Univer Таблицы' : 'Univer Документы'}
          </span>

          <input
            type="text"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            aria-label="Имя офисного файла"
            className="w-56 sm:w-64 px-2.5 py-1 text-xs font-mono text-slate-900 bg-white border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-sky-500"
          />

          {statusMsg && (
            <span className="text-xs font-medium text-emerald-700">{statusMsg}</span>
          )}
          {errorMsg && (
            <span className="text-xs font-medium text-rose-600">{errorMsg}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleNewBudgetTemplate}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50"
            title="Создать ведомость задач и энергобюджет 1U (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Шаблон .xlsx
          </button>
          <button
            type="button"
            onClick={handleNewBlankSheet}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50"
            title="Новая пустая таблица .xlsx"
          >
            <Plus className="w-3.5 h-3.5" />
            Таблица
          </button>
          <button
            type="button"
            onClick={handleNewReportDoc}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50"
            title="Создать технический отчёт проекта в Word (.docx)"
          >
            <FileText className="w-3.5 h-3.5 text-sky-600" />
            Отчёт .docx
          </button>

          <label className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            Открыть файл
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.docx,.doc,.txt,.md"
              onChange={handleLocalImport}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={handleDownloadLocal}
            disabled={loadingFile}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Скачать
          </button>

          <button
            type="button"
            onClick={handleSaveToS3}
            disabled={saving || loadingFile}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-sky-600 rounded hover:bg-sky-700 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Сохранение...' : 'В Garage S3'}
          </button>
        </div>
      </div>

      {/* Saved Office Files Quick Strip in Garage S3 */}
      {officeS3Files.length > 0 && (
        <div className="px-4 py-1.5 border-b border-slate-200 bg-white flex items-center gap-2 overflow-x-auto text-xs">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 shrink-0">
            <HardDrive className="w-3 h-3" />
            Офисные файлы S3:
          </span>
          {officeS3Files.map((obj) => {
            const isActive = obj.key === fileName;
            const sheet = isSpreadsheetFilename(obj.key);
            return (
              <button
                key={obj.key}
                type="button"
                onClick={() => handleOpenFromS3(obj)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border font-mono text-[11px] shrink-0 transition-colors ${
                  isActive
                    ? 'bg-sky-50 border-sky-300 text-sky-900 font-semibold'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <FolderOpen className={`w-3 h-3 ${sheet ? 'text-emerald-600' : 'text-sky-600'}`} />
                {obj.key}
              </button>
            );
          })}
        </div>
      )}

      {/* Univer Canvas Container */}
      <div className="relative flex-1 min-h-[540px] w-full overflow-hidden bg-white">
        {loadingFile && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/75 text-xs font-medium text-slate-600">
            Загрузка документа в Univer...
          </div>
        )}
        <div ref={hostRef} className="w-full h-full" />
      </div>
    </div>
  );
};
