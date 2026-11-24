import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import {
  CellValueType,
  LocaleType,
  type ICellData,
  type IDocumentData,
  type IParagraph,
  type ITextRun,
  type IWorkbookData,
  type IWorksheetData,
} from '@univerjs/presets';
import type { CommunityProject, CubeSatTask } from '../types/cubesat.ts';

export type OfficeDocKind = 'sheet' | 'doc';

export function isSpreadsheetFilename(name: string): boolean {
  return /\.(xlsx|xls|csv|ods)$/i.test(name.trim());
}

export function isDocumentFilename(name: string): boolean {
  return /\.(docx|doc|txt|md)$/i.test(name.trim());
}

export function isOfficeFilename(name: string): boolean {
  return isSpreadsheetFilename(name) || isDocumentFilename(name);
}

export function detectOfficeKind(name: string): OfficeDocKind {
  return isDocumentFilename(name) && !isSpreadsheetFilename(name) ? 'doc' : 'sheet';
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function xlsxBufferToUniverWorkbook(
  buffer: ArrayBuffer,
  fileName: string
): Partial<IWorkbookData> {
  const wb = XLSX.read(buffer, {
    type: 'array',
    cellFormula: true,
    cellDates: false,
  });

  const sheetOrder: string[] = [];
  const sheets: Record<string, Partial<IWorksheetData>> = {};

  wb.SheetNames.forEach((rawName, idx) => {
    const ws = wb.Sheets[rawName];
    if (!ws) return;
    const sheetId = `sheet-${idx + 1}`;
    sheetOrder.push(sheetId);

    const ref = ws['!ref'] || 'A1:J20';
    const range = XLSX.utils.decode_range(ref);
    const cellData: Record<number, Record<number, ICellData>> = {};

    let maxRow = range.e.r;
    let maxCol = range.e.c;

    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell) continue;

        if (r > maxRow) maxRow = r;
        if (c > maxCol) maxCol = c;

        const univerCell: ICellData = {};
        if (cell.f) {
          univerCell.f = cell.f.startsWith('=') ? cell.f : `=${cell.f}`;
        }

        if (typeof cell.v === 'number') {
          univerCell.v = cell.v;
          univerCell.t = CellValueType.NUMBER;
        } else if (typeof cell.v === 'boolean') {
          univerCell.v = cell.v ? 1 : 0;
          univerCell.t = CellValueType.BOOLEAN;
        } else if (cell.v !== undefined && cell.v !== null) {
          univerCell.v = String(cell.v);
          univerCell.t = CellValueType.STRING;
        } else if (cell.w !== undefined) {
          univerCell.v = String(cell.w);
          univerCell.t = CellValueType.STRING;
        }

        if (!cellData[r]) cellData[r] = {};
        cellData[r][c] = univerCell;
      }
    }

    const mergeData = Array.isArray(ws['!merges'])
      ? ws['!merges'].map((m) => ({
          startRow: m.s.r,
          endRow: m.e.r,
          startColumn: m.s.c,
          endColumn: m.e.c,
        }))
      : [];

    const columnData: Record<number, { w: number }> = {};
    if (Array.isArray(ws['!cols'])) {
      ws['!cols'].forEach((colInfo, colIdx) => {
        if (colInfo?.wpx) {
          columnData[colIdx] = { w: Math.max(48, Math.min(420, colInfo.wpx)) };
        } else if (colInfo?.wch) {
          columnData[colIdx] = { w: Math.max(48, Math.min(420, Math.round(colInfo.wch * 8.5))) };
        }
      });
    }

    sheets[sheetId] = {
      id: sheetId,
      name: rawName.slice(0, 31) || `Лист ${idx + 1}`,
      rowCount: Math.max(50, maxRow + 20),
      columnCount: Math.max(18, maxCol + 6),
      cellData,
      mergeData,
      columnData,
    };
  });

  if (sheetOrder.length === 0) {
    sheetOrder.push('sheet-1');
    sheets['sheet-1'] = {
      id: 'sheet-1',
      name: 'Лист 1',
      rowCount: 50,
      columnCount: 18,
      cellData: {},
    };
  }

  return {
    id: `wb-${Date.now().toString(36)}`,
    name: fileName,
    locale: LocaleType.RU_RU,
    styles: {},
    sheetOrder,
    sheets,
  };
}

export function univerWorkbookToXlsxArrayBuffer(snapshot: IWorkbookData): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const order =
    Array.isArray(snapshot.sheetOrder) && snapshot.sheetOrder.length > 0
      ? snapshot.sheetOrder
      : Object.keys(snapshot.sheets || {});

  for (const sheetId of order) {
    const sheet = snapshot.sheets?.[sheetId];
    if (!sheet) continue;
    const ws: XLSX.WorkSheet = {};
    const cellData = sheet.cellData || {};

    let maxRow = 0;
    let maxCol = 0;
    let hasCells = false;

    for (const [rKey, rowObj] of Object.entries(cellData)) {
      const r = Number(rKey);
      if (!Number.isInteger(r) || !rowObj) continue;
      const rowCells = rowObj as Record<string, ICellData | null | undefined>;
      for (const [cKey, cell] of Object.entries(rowCells)) {
        const c = Number(cKey);
        if (!Number.isInteger(c) || !cell) continue;
        const hasVal = cell.v !== undefined && cell.v !== null && cell.v !== '';
        const hasFormula = typeof cell.f === 'string' && cell.f.trim().length > 0;
        if (!hasVal && !hasFormula) continue;

        hasCells = true;
        if (r > maxRow) maxRow = r;
        if (c > maxCol) maxCol = c;

        const addr = XLSX.utils.encode_cell({ r, c });
        const xlsCell: XLSX.CellObject = { t: 's', v: '' };

        if (cell.t === CellValueType.NUMBER || typeof cell.v === 'number') {
          xlsCell.t = 'n';
          xlsCell.v = Number(cell.v ?? 0);
        } else if (cell.t === CellValueType.BOOLEAN) {
          xlsCell.t = 'b';
          xlsCell.v = Boolean(cell.v);
        } else {
          xlsCell.t = 's';
          xlsCell.v = cell.v !== undefined && cell.v !== null ? String(cell.v) : '';
        }

        if (hasFormula) {
          xlsCell.f = cell.f!.startsWith('=') ? cell.f!.slice(1) : cell.f!;
        }
        ws[addr] = xlsCell;
      }
    }

    if (Array.isArray(sheet.mergeData) && sheet.mergeData.length > 0) {
      ws['!merges'] = sheet.mergeData.map((m) => ({
        s: { r: m.startRow, c: m.startColumn },
        e: { r: m.endRow, c: m.endColumn },
      }));
    }

    ws['!ref'] = hasCells
      ? XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } })
      : 'A1:A1';

    const safeSheetName = (sheet.name || sheetId).replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Sheet';
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
  }

  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['']]), 'Лист 1');
  }

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

export function buildUniverDocFromLines(
  title: string,
  lines: string[],
  headingLineIndices: Set<number> = new Set([0])
): Partial<IDocumentData> {
  const cleanLines = lines.length > 0 ? lines : [title || 'Новый документ'];
  let dataStream = '';
  const paragraphs: IParagraph[] = [];
  const textRuns: ITextRun[] = [];

  cleanLines.forEach((rawLine, idx) => {
    const line = rawLine.replace(/\r/g, '');
    const st = dataStream.length;
    dataStream += line;
    const ed = dataStream.length;

    if (ed > st) {
      const isMainTitle = idx === 0 && headingLineIndices.has(idx);
      const isHeading = headingLineIndices.has(idx);
      textRuns.push({
        st,
        ed,
        ts: isMainTitle
          ? { fs: 18, bl: 1 }
          : isHeading
            ? { fs: 13, bl: 1 }
            : { fs: 11 },
      });
    }

    const crIndex = dataStream.length;
    dataStream += '\r';
    paragraphs.push({
      startIndex: crIndex,
      paragraphId: `p-${idx + 1}`,
      paragraphStyle: {
        spaceAbove: { v: headingLineIndices.has(idx) ? 8 : 2 },
        lineSpacing: 1.35,
        spaceBelow: { v: 6 },
      },
    });
  });

  dataStream += '\n';

  return {
    id: `doc-${Date.now().toString(36)}`,
    title,
    locale: LocaleType.RU_RU,
    body: {
      dataStream,
      textRuns,
      paragraphs,
      sectionBreaks: [
        {
          sectionId: 'sec-1',
          startIndex: dataStream.length - 1,
        },
      ],
    },
    documentStyle: {
      pageSize: {
        width: 595,
        height: 842,
      },
      marginTop: 72,
      marginBottom: 72,
      marginRight: 72,
      marginLeft: 72,
    },
  };
}

export async function docxBufferToUniverDocument(
  buffer: ArrayBuffer,
  fileName: string
): Promise<Partial<IDocumentData>> {
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const rawText = (result.value || '').replace(/\r\n/g, '\n');
  const lines = rawText.split('\n');
  const trimmed = lines.filter((line, i) => line.length > 0 || (i > 0 && lines[i - 1].length > 0));
  return buildUniverDocFromLines(fileName, trimmed.length > 0 ? trimmed : [fileName], new Set([0]));
}

export function textToUniverDocument(text: string, fileName: string): Partial<IDocumentData> {
  const rawLines = text.replace(/\r\n/g, '\n').split('\n');
  const headings = new Set<number>();
  const normalizedLines = rawLines.map((line, idx) => {
    if (/^#{1,3}\s+/.test(line)) {
      headings.add(idx);
      return line.replace(/^#{1,3}\s+/, '');
    }
    return line;
  });
  return buildUniverDocFromLines(fileName, normalizedLines, headings);
}

export async function univerDocumentToDocxBlob(
  snapshot: IDocumentData,
  title: string
): Promise<Blob> {
  const body = snapshot.body;
  const rawStream = body?.dataStream || '';
  const withoutTrailingNl = rawStream.endsWith('\n') ? rawStream.slice(0, -1) : rawStream;
  const rawParagraphTexts = withoutTrailingNl.split('\r');

  const textRuns = body?.textRuns || [];
  let cursor = 0;

  const docParagraphs = rawParagraphTexts.map((text, idx) => {
    const pStart = cursor;
    const pEnd = cursor + text.length;
    cursor = pEnd + 1; // +1 for \r

    const overlappingRuns = textRuns.filter((r) => r.ed > pStart && r.st < pEnd);
    const isHeading =
      idx === 0 ||
      overlappingRuns.some((r) => Boolean(r.ts?.bl) && (r.ts?.fs ?? 11) >= 13);

    if (!text.trim()) {
      return new Paragraph({ text: '' });
    }

    if (idx === 0 && isHeading) {
      return new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text, bold: true })],
      });
    }

    if (isHeading) {
      return new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text, bold: true })],
      });
    }

    return new Paragraph({
      children: [new TextRun({ text })],
    });
  });

  const doc = new Document({
    title,
    sections: [
      {
        children: docParagraphs.length > 0 ? docParagraphs : [new Paragraph({ text: title })],
      },
    ],
  });

  return Packer.toBlob(doc);
}

export function createEngineeringBudgetWorkbook(
  project: CommunityProject,
  tasks: CubeSatTask[]
): Partial<IWorkbookData> {
  const taskCells: Record<number, Record<number, ICellData>> = {
    0: {
      0: { v: 'ID', t: CellValueType.STRING, s: 'hdr' },
      1: { v: 'Подсистема', t: CellValueType.STRING, s: 'hdr' },
      2: { v: 'Задача', t: CellValueType.STRING, s: 'hdr' },
      3: { v: 'Статус', t: CellValueType.STRING, s: 'hdr' },
      4: { v: 'Прогресс (%)', t: CellValueType.STRING, s: 'hdr' },
      5: { v: 'Исполнитель', t: CellValueType.STRING, s: 'hdr' },
      6: { v: 'Дедлайн', t: CellValueType.STRING, s: 'hdr' },
    },
  };

  tasks.forEach((task, idx) => {
    const r = idx + 1;
    const pct = task.status === 'done' ? 100 : task.progressPct ?? 0;
    taskCells[r] = {
      0: { v: task.id, t: CellValueType.STRING },
      1: { v: task.subsystem, t: CellValueType.STRING },
      2: { v: task.title, t: CellValueType.STRING },
      3: { v: task.status, t: CellValueType.STRING },
      4: { v: pct, t: CellValueType.NUMBER },
      5: { v: task.assignee, t: CellValueType.STRING },
      6: { v: task.dueDate || '—', t: CellValueType.STRING },
    };
  });

  const summaryRow = tasks.length + 2;
  const lastDataRow = Math.max(2, tasks.length + 1);
  taskCells[summaryRow] = {
    2: { v: 'Средний прогресс проекта (%):', t: CellValueType.STRING, s: 'hdr' },
    4: {
      f: tasks.length > 0 ? `=AVERAGE(E2:E${lastDataRow})` : '=0',
      v: 0,
      t: CellValueType.NUMBER,
      s: 'hdr',
    },
  };

  const budgetRows: Array<[string, number, number, string]> = [
    ['OBC (STM32F4 / ESP32-S3)', 3.3, 0.28, '=B2*C2'],
    ['COMMS (UHF 435.800 МГц RX)', 3.3, 0.12, '=B3*C3'],
    ['COMMS (AX.25 TX 20 дБм)', 5.0, 0.42, '=B4*C4'],
    ['ADCS (IMU + B-dot катушки)', 5.0, 0.24, '=B5*C5'],
    ['PAYLOAD (Камера ДЗЗ + дозиметр)', 5.0, 0.48, '=B6*C6'],
  ];

  const budgetCells: Record<number, Record<number, ICellData>> = {
    0: {
      0: { v: 'Подсистема / Режим', t: CellValueType.STRING, s: 'hdr' },
      1: { v: 'Напряжение (В)', t: CellValueType.STRING, s: 'hdr' },
      2: { v: 'Ток (А)', t: CellValueType.STRING, s: 'hdr' },
      3: { v: 'Мощность (Вт)', t: CellValueType.STRING, s: 'hdr' },
    },
  };

  budgetRows.forEach(([label, voltage, current, formula], idx) => {
    const r = idx + 1;
    budgetCells[r] = {
      0: { v: label, t: CellValueType.STRING },
      1: { v: voltage, t: CellValueType.NUMBER },
      2: { v: current, t: CellValueType.NUMBER },
      3: { f: formula, v: Number((voltage * current).toFixed(2)), t: CellValueType.NUMBER },
    };
  });

  budgetCells[budgetRows.length + 1] = {
    0: { v: 'Суммарная пиковая мощность (Вт)', t: CellValueType.STRING, s: 'hdr' },
    3: { f: `=SUM(D2:D${budgetRows.length + 1})`, v: 0, t: CellValueType.NUMBER, s: 'hdr' },
  };

  return {
    id: `wb-${project.id}`,
    name: `${project.forgejoRepo}-budget.xlsx`,
    locale: LocaleType.RU_RU,
    styles: {
      hdr: {
        bl: 1,
        bg: { rgb: '#f1f5f9' },
      },
    },
    sheetOrder: ['tasks-sheet', 'budget-sheet'],
    sheets: {
      'tasks-sheet': {
        id: 'tasks-sheet',
        name: 'Ведомость задач',
        rowCount: Math.max(50, tasks.length + 15),
        columnCount: 16,
        cellData: taskCells,
        columnData: {
          0: { w: 96 },
          1: { w: 110 },
          2: { w: 320 },
          3: { w: 110 },
          4: { w: 120 },
          5: { w: 160 },
          6: { w: 115 },
        },
      },
      'budget-sheet': {
        id: 'budget-sheet',
        name: 'Энергобюджет 1U',
        rowCount: 40,
        columnCount: 12,
        cellData: budgetCells,
        columnData: {
          0: { w: 280 },
          1: { w: 130 },
          2: { w: 110 },
          3: { w: 140 },
        },
      },
    },
  };
}

export function createEngineeringSpecDocument(
  project: CommunityProject,
  tasks: CubeSatTask[]
): Partial<IDocumentData> {
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const pct = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;

  const lines: string[] = [
    `Технический отчёт по проекту «${project.name}»`,
    `Репозиторий Forgejo: school76/${project.forgejoRepo} · Бакет S3: ${project.s3Bucket}`,
    `Дата документа: ${new Date().toISOString().slice(0, 10)}`,
    '1. Назначение и статус проекта',
    project.description || 'Описание проекта уточняется инженерной группой.',
    `Текущая готовность: выполнено ${doneCount} из ${tasks.length} задач (${pct}%).`,
    '2. Перечень ключевых задач подсистем',
    ...tasks.slice(0, 15).map(
      (t) =>
        `• [${t.id}] (${t.subsystem}) ${t.title} — статус: ${t.status}, ответственный: ${t.assignee}`
    ),
    '3. Заключение и следующие шаги',
    'Документ сформирован в офисном редакторе Univer и готов к сохранению в Garage S3 (.docx) или экспорту.',
  ];

  const headings = new Set<number>([0, 3, 6, 6 + Math.min(15, tasks.length) + 1]);
  return buildUniverDocFromLines(`${project.forgejoRepo}-report.docx`, lines, headings);
}
