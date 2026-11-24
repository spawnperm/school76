import React, { useCallback, useEffect, useState } from 'react';
import { FileEdit, GitCommitHorizontal, Plus, Save } from 'lucide-react';
import type { AuthFetchFn } from '../providers/refineDataProvider.ts';
import type { TinaDoc } from '../schemas/missionSchemas.ts';
import type { Subsystem } from '../types/cubesat.ts';

interface TinaCollection {
  id: TinaDoc['collection'];
  label: string;
  folder: string;
  description: string;
}

interface TinaCmsStudioProps {
  authFetch: AuthFetchFn;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  projectRepo: string;
}

const SUBSYSTEMS: Subsystem[] = ['OBC', 'EPS', 'ADCS', 'COMMS', 'PAYLOAD', 'GROUND'];

export const TinaCmsStudio: React.FC<TinaCmsStudioProps> = ({
  authFetch,
  isAuthenticated,
  onRequireAuth,
  projectRepo,
}) => {
  const [collections, setCollections] = useState<TinaCollection[]>([]);
  const [docs, setDocs] = useState<TinaDoc[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [draft, setDraft] = useState<Omit<TinaDoc, 'path' | 'updatedAt'>>({
    collection: 'mission-briefs',
    slug: 'cubesat-1u-charter',
    title: '',
    subsystem: 'OBC',
    status: 'published',
    author: 'Артём Соколов',
    summary: '',
    tags: [],
    body: '',
  });
  const [tagsText, setTagsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    const res = await fetch(`/api/tinacms/documents?repo=${encodeURIComponent(projectRepo)}`);
    if (!res.ok) return;
    const data = await res.json();
    setCollections(Array.isArray(data.collections) ? data.collections : []);
    const list: TinaDoc[] = Array.isArray(data.documents) ? data.documents : [];
    setDocs(list);
    if (list.length > 0 && !selectedPath) {
      selectDoc(list[0]);
    }
  }, [projectRepo, selectedPath]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  const selectDoc = (doc: TinaDoc) => {
    setSelectedPath(doc.path);
    setDraft({
      collection: doc.collection,
      slug: doc.slug,
      title: doc.title,
      subsystem: doc.subsystem,
      status: doc.status,
      author: doc.author,
      summary: doc.summary || '',
      tags: doc.tags || [],
      body: doc.body,
    });
    setTagsText((doc.tags || []).join(', '));
    setNotice(null);
  };

  const handleNewDoc = () => {
    setSelectedPath('');
    setDraft({
      collection: 'mission-briefs',
      slug: `note-${Date.now().toString(36)}`,
      title: 'Новый инженерный документ',
      subsystem: 'OBC',
      status: 'draft',
      author: 'Артём Соколов',
      summary: 'Краткая аннотация для TinaCMS & Forgejo Git',
      tags: ['1U', 'TinaCMS'],
      body: '# Заголовок документа\n\nОпишите параметры бортовой системы и ссылки на задачи.',
    });
    setTagsText('1U, TinaCMS');
    setNotice(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const tags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await authFetch('/api/tinacms/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo: projectRepo,
          ...draft,
          tags,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice(json.error || 'Ошибка сохранения документа');
        return;
      }
      setNotice(`Сохранено и зафиксировано в Forgejo Git (${json.document?.path}, sha ${json.document?.sha?.slice(0, 7)})`);
      setSelectedPath(json.document?.path || '');
      await loadDocs();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Left: TinaCMS Collections & Docs */}
      <div className="lg:col-span-4 space-y-3">
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileEdit className="w-4 h-4 text-orange-600" />
              <span className="text-xs font-bold text-slate-900">TinaCMS Git Collections</span>
            </div>
            <button
              type="button"
              onClick={handleNewDoc}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-slate-900 rounded hover:bg-slate-800"
            >
              <Plus className="w-3 h-3" />
              Создать
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Визуальное редактирование схем frontmatter + Markdown с автоматическим коммитом в репозиторий Forgejo ({projectRepo}).
          </p>

          <div className="space-y-3 pt-1">
            {collections.map((col) => {
              const colDocs = docs.filter((d) => d.collection === col.id);
              return (
                <div key={col.id} className="space-y-1">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    {col.label} ({colDocs.length})
                  </div>
                  {colDocs.map((d) => (
                    <button
                      key={d.path}
                      type="button"
                      onClick={() => selectDoc(d)}
                      className={`w-full text-left px-3 py-2 rounded-md border text-xs transition-colors ${
                        selectedPath === d.path
                          ? 'bg-orange-50 border-orange-200 text-slate-900 font-semibold'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                      }`}
                    >
                      <div className="truncate">{d.title}</div>
                      <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between mt-0.5">
                        <span>{d.path}</span>
                        <span>{d.status}</span>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right: Structured Frontmatter + Visual Split Editor */}
      <form onSubmit={handleSave} className="lg:col-span-8 space-y-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Редактор схемы документа TinaCMS
              </h3>
              <p className="text-[11px] font-mono text-slate-500">
                {selectedPath || `${draft.collection}/${draft.slug}.md (новый файл)`}
              </p>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-50"
            >
              {saving ? <Save className="w-3.5 h-3.5 animate-pulse" /> : <GitCommitHorizontal className="w-3.5 h-3.5" />}
              Commit в Forgejo Git
            </button>
          </div>

          {notice && (
            <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              {notice}
            </div>
          )}

          {/* Frontmatter Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Заголовок</label>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Коллекция</label>
              <select
                value={draft.collection}
                onChange={(e) =>
                  setDraft({ ...draft, collection: e.target.value as TinaDoc['collection'] })
                }
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
              >
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Slug</label>
              <input
                value={draft.slug}
                onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Подсистема</label>
              <select
                value={draft.subsystem}
                onChange={(e) => setDraft({ ...draft, subsystem: e.target.value as Subsystem })}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
              >
                {SUBSYSTEMS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Статус</label>
              <select
                value={draft.status}
                onChange={(e) =>
                  setDraft({ ...draft, status: e.target.value as TinaDoc['status'] })
                }
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
              >
                <option value="draft">draft</option>
                <option value="review">review</option>
                <option value="published">published</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Теги (через запятую)
              </label>
              <input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md font-mono"
              />
            </div>
          </div>

          {/* Split Markdown & Visual Preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Markdown Body
              </label>
              <textarea
                rows={12}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                className="w-full p-3 text-xs font-mono border border-slate-200 rounded-md bg-slate-50 focus:bg-white focus:outline-none focus:border-orange-500"
                required
              />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-600 mb-1">
                Live Preview (Frontmatter + Content)
              </div>
              <div className="h-[268px] overflow-y-auto p-3.5 border border-slate-200 rounded-md bg-slate-50 space-y-2">
                <div className="pb-2 border-b border-slate-200">
                  <div className="text-sm font-bold text-slate-900">{draft.title || 'Без названия'}</div>
                  <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                    {draft.subsystem} · {draft.status} · {tagsText}
                  </div>
                </div>
                <pre className="whitespace-pre-wrap text-xs text-slate-700 font-sans leading-relaxed">
                  {draft.body}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
