import React, { useState } from 'react';
import { Image as ImageIcon, Send, Upload, X } from 'lucide-react';
import type { GarageObjectMeta, SocialPost } from '../../types/cubesat.ts';
import { uploadFileToS3 } from '../../utils/formatters.ts';

interface PostComposerProps {
  projectId?: string;
  s3Bucket: string;
  isAuthenticated: boolean;
  authFetch: (url: string, options?: RequestInit) => Promise<any>;
  onCreatePost: (payload: {
    text: string;
    projectId?: string;
    mediaUrls?: string[];
  }) => Promise<SocialPost>;
  onRequireAuth: () => void;
  placeholder?: string;
}

export const PostComposer: React.FC<PostComposerProps> = ({
  projectId,
  s3Bucket,
  isAuthenticated,
  authFetch,
  onCreatePost,
  onRequireAuth,
  placeholder = 'Поделитесь ходом работ, схемой или заметкой [[subsystems/obc]]...',
}) => {
  const [text, setText] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<string[]>([]);
  const [showS3Picker, setShowS3Picker] = useState(false);
  const [s3Objects, setS3Objects] = useState<GarageObjectMeta[]>([]);
  const [loadingS3, setLoadingS3] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadS3 = async () => {
    setLoadingS3(true);
    try {
      const res = await fetch(`/api/s3/${encodeURIComponent(s3Bucket)}`);
      if (res.ok) {
        const data = await res.json();
        setS3Objects(
          (data.objects || []).filter((o: GarageObjectMeta) =>
            o.contentType.startsWith('image/')
          )
        );
      }
    } finally {
      setLoadingS3(false);
    }
  };

  const handleTogglePicker = () => {
    const next = !showS3Picker;
    setShowS3Picker(next);
    if (next) void loadS3();
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadFileToS3(authFetch, s3Bucket, file);
      if (uploaded?.url) {
        setSelectedMedia((prev) =>
          prev.includes(uploaded.url) ? prev : [...prev, uploaded.url].slice(0, 4)
        );
        await loadS3();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки в Garage S3');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    if (!text.trim() && selectedMedia.length === 0) return;
    setPublishing(true);
    setError(null);
    try {
      await onCreatePost({
        text: text.trim(),
        projectId,
        mediaUrls: selectedMedia,
      });
      setText('');
      setSelectedMedia([]);
      setShowS3Picker(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось опубликовать запись');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-slate-200 rounded-lg p-4 space-y-3"
    >
      {error && (
        <div className="px-3 py-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded">
          {error}
        </div>
      )}

      <textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
      />

      {selectedMedia.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedMedia.map((url) => (
            <div
              key={url}
              className="relative w-20 h-20 border border-slate-200 rounded overflow-hidden bg-slate-50"
            >
              <img src={url} alt="Превью медиа" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setSelectedMedia((prev) => prev.filter((u) => u !== url))}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-900/75 text-white flex items-center justify-center"
                aria-label="Удалить вложение"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showS3Picker && (
        <div className="border border-slate-200 rounded-md p-3 bg-slate-50 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>Выберите изображение из Garage S3 ({s3Bucket})</span>
            <label className="inline-flex items-center gap-1 text-sky-700 font-medium cursor-pointer hover:underline">
              <Upload className="w-3.5 h-3.5" />
              {uploading ? 'Загрузка...' : 'Загрузить файл'}
              <input
                type="file"
                accept="image/*"
                onChange={handleUploadImage}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>
          {loadingS3 ? (
            <div className="text-xs text-slate-500 py-2">Чтение бакета Garage S3...</div>
          ) : s3Objects.length === 0 ? (
            <div className="text-xs text-slate-500 py-2">В бакете пока нет изображений.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {s3Objects.map((obj) => {
                const chosen = selectedMedia.includes(obj.url);
                return (
                  <button
                    key={obj.key}
                    type="button"
                    onClick={() =>
                      setSelectedMedia((prev) =>
                        chosen
                          ? prev.filter((u) => u !== obj.url)
                          : [...prev, obj.url].slice(0, 4)
                      )
                    }
                    className={`w-16 h-16 rounded border overflow-hidden transition-all ${
                      chosen ? 'border-sky-600 ring-2 ring-sky-200' : 'border-slate-200'
                    }`}
                    title={obj.key}
                  >
                    <img src={obj.url} alt={obj.key} className="w-full h-full object-cover" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleTogglePicker}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100"
        >
          <ImageIcon className="w-3.5 h-3.5 text-sky-600" />
          Медиа из Garage S3
        </button>

        <button
          type="submit"
          disabled={publishing}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
          {publishing ? 'Публикация...' : 'Опубликовать'}
        </button>
      </div>
    </form>
  );
};
