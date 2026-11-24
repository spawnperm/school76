import { useCallback, useEffect, useRef, useState } from 'react';
import type { GarageObjectMeta } from '../types/cubesat.ts';

export function formatDateTimeRu(iso?: string | null): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimeRu(iso?: string | null): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDateRu(d: Date): string {
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
  });
}

export function formatDurationSec(sec?: number | null): string {
  if (sec === undefined || sec === null || Number.isNaN(sec)) return '';
  if (sec < 60) return `${sec} с`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} м ${s} с`;
}

export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned || `file_${Date.now()}`;
}

export function downloadTextOrBlobFile(
  content: BlobPart,
  filename: string,
  mimeType = 'text/plain;charset=utf-8'
): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Ошибка чтения локального файла'));
    reader.readAsDataURL(file);
  });
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

export async function uploadBinaryToS3(
  authFetch: (url: string, options?: RequestInit) => Promise<any>,
  bucket: string,
  key: string,
  base64Data: string,
  contentType: string
): Promise<GarageObjectMeta | null> {
  const safeKey = sanitizeFilename(key);
  const res = await authFetch(
    `/api/s3/${encodeURIComponent(bucket)}/${encodeURIComponent(safeKey)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ base64Data, contentType }),
    }
  );
  return (res?.object as GarageObjectMeta) || null;
}

export async function uploadFileToS3(
  authFetch: (url: string, options?: RequestInit) => Promise<any>,
  bucket: string,
  file: File,
  keyOverride?: string
): Promise<GarageObjectMeta | null> {
  const dataUrl = await readFileAsDataUrl(file);
  const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const targetKey = keyOverride ? sanitizeFilename(keyOverride) : sanitizeFilename(file.name);
  return uploadBinaryToS3(
    authFetch,
    bucket,
    targetKey,
    base64Data,
    file.type || 'application/octet-stream'
  );
}

export function useTransientStatus(defaultDurationMs = 3500): {
  statusMsg: string | null;
  showStatus: (msg: string | null, durationMs?: number) => void;
  clearStatus: () => void;
} {
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const clearStatus = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setStatusMsg(null);
  }, []);

  const showStatus = useCallback(
    (msg: string | null, durationMs = defaultDurationMs) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setStatusMsg(msg);
      if (msg && durationMs > 0) {
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          setStatusMsg(null);
        }, durationMs);
      }
    },
    [defaultDurationMs]
  );

  return { statusMsg, showStatus, clearStatus };
}

export function useCopyFeedback(durationMs = 2000): {
  copiedKey: string | null;
  copyText: (key: string, text: string) => Promise<boolean>;
} {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const copyText = useCallback(
    async (key: string, text: string): Promise<boolean> => {
      if (!text) return false;
      try {
        await navigator.clipboard.writeText(text);
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
        }
        setCopiedKey(key);
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          setCopiedKey((cur) => (cur === key ? null : cur));
        }, durationMs);
        return true;
      } catch {
        return false;
      }
    },
    [durationMs]
  );

  return { copiedKey, copyText };
}
