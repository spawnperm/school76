import React, { useCallback, useEffect, useState } from 'react';
import {
  FileText,
  GitCommit,
  HardDrive,
  Upload,
  Plus,
  Check,
  Copy,
  Trash2,
  Sparkles,
  CheckCircle2,
  Save,
} from 'lucide-react';
import type {
  CommunityProject,
  ForgejoCommit,
  ForgejoFileEntry,
  GarageObjectMeta,
} from '../types/cubesat.ts';

interface WikiKnowledgeBaseProps {
  project: CommunityProject;
  isAuthenticated: boolean;
  initialDocPath?: string | null;
  onConsumeInitialDocPath?: () => void;
  onRequireAuth: () => void;
  authFetch: (url: string, options?: RequestInit) => Promise<any>;
}

function isSafeImageSrc(src: string): boolean {
  return src.startsWith('/api/s3/') || src.startsWith('https://');
}

function renderInlineTokens(
  text: string,
  onOpenWikiLink: (target: string) => void
): React.ReactNode[] {
  // Tokenize [[wikilinks]], `inline code`, and **bold** safely without dangerouslySetInnerHTML
  const pattern = /(\[\[[^\]]+\]\]|`[^`]+`|\*\*[^*]+\*\*)/g;
  const parts = text.split(pattern);
  return parts.map((part, idx) => {
    if (part.startsWith('[[') && part.endsWith(']]')) {
      const inner = part.slice(2, -2);
      const [target, alias] = inner.split('|');
      const cleanTarget = target.trim().replace(/\.md$/, '');
      return (
        <button
          key={idx}
          type="button"
          onClick={() => onOpenWikiLink(`${cleanTarget}.md`)}
          className="font-mono text-xs text-sky-700 bg-sky-50 hover:bg-sky-100 px-1.5 py-0.5 rounded transition-colors"
        >
          {alias || cleanTarget}
        </button>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={idx} className="font-mono text-xs bg-slate-100 text-slate-800 px-1 py-0.5 rounded">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

const SafeMarkdownView: React.FC<{
  content: string;
  onOpenWikiLink: (path: string) => void;
}> = ({ content, onOpenWikiLink }) => {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trim().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre
          key={`code-${i}`}
          className="bg-slate-950 text-slate-100 font-mono text-xs p-3.5 rounded-md overflow-x-auto my-3"
        >
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      i++;
      continue;
    }

    // Image ![alt](src)
    const imgMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch && isSafeImageSrc(imgMatch[2])) {
      elements.push(
        <figure key={`img-${i}`} className="my-4 border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
          <img
            src={imgMatch[2]}
            alt={imgMatch[1]}
            referrerPolicy="no-referrer"
            className="w-full max-h-[380px] object-contain bg-white"
          />
          {imgMatch[1] && (
            <figcaption className="px-3 py-2 text-xs text-slate-500 border-t border-slate-200">
              {imgMatch[1]}
            </figcaption>
          )}
        </figure>
      );
      i++;
      continue;
    }

    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={`h1-${i}`} className="text-2xl font-bold text-slate-900 mt-1 mb-3">
          {renderInlineTokens(line.slice(2), onOpenWikiLink)}
        </h1>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={`h2-${i}`} className="text-lg font-semibold text-slate-900 mt-6 mb-2 border-b border-slate-200 pb-1">
          {renderInlineTokens(line.slice(3), onOpenWikiLink)}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={`h3-${i}`} className="text-base font-semibold text-slate-800 mt-4 mb-1.5">
          {renderInlineTokens(line.slice(4), onOpenWikiLink)}
        </h3>
      );
    } else if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={`bq-${i}`} className="my-3 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-700">
          {renderInlineTokens(line.slice(2), onOpenWikiLink)}
        </blockquote>
      );
    } else if (/^[-*]\s+/.test(line)) {
      elements.push(
        <div key={`li-${i}`} className="flex items-start gap-2 text-sm text-slate-800 my-1 pl-2">
          <span className="text-slate-400 select-none">•</span>
          <span>{renderInlineTokens(line.replace(/^[-*]\s+/, ''), onOpenWikiLink)}</span>
        </div>
      );
    } else if (/^\d+\.\s+/.test(line)) {
      const num = line.match(/^(\d+)\.\s+/)?.[1];
      elements.push(
        <div key={`ol-${i}`} className="flex items-start gap-2 text-sm text-slate-800 my-1 pl-2">
          <span className="font-mono text-xs text-slate-500 mt-0.5">{num}.</span>
          <span>{renderInlineTokens(line.replace(/^\d+\.\s+/, ''), onOpenWikiLink)}</span>
        </div>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={`sp-${i}`} className="h-2" />);
    } else {
      elements.push(
        <p key={`p-${i}`} className="text-sm text-slate-800 leading-relaxed my-1.5">
          {renderInlineTokens(line, onOpenWikiLink)}
        </p>
      );
    }
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
};

export const WikiKnowledgeBase: React.FC<WikiKnowledgeBaseProps> = ({
  project,
  isAuthenticated,
  initialDocPath,
  onConsumeInitialDocPath,
  onRequireAuth,
  authFetch,
}) => {
  const [tree, setTree] = useState<ForgejoFileEntry[]>([]);
  const [commits, setCommits] = useState<ForgejoCommit[]>([]);
  const [s3Objects, setS3Objects] = useState<GarageObjectMeta[]>([]);
  const [selectedPath, setSelectedPath] = useState('index.md');
  const [fileContent, setFileContent] = useState('');
  const [fileSha, setFileSha] = useState('');
  const [editorMode, setEditorMode] = useState<'read' | 'edit'>('read');
  const [commitMessage, setCommitMessage] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals: New Markdown file / Ingest to LLM-Wiki
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFilePath, setNewFilePath] = useState('concepts/new-note.md');
  const [showIngestModal, setShowIngestModal] = useState(false);
  const [ingestTitle, setIngestTitle] = useState('');
  const [ingestCategory, setIngestCategory] = useState<'concepts' | 'subsystems' | 'sources'>('concepts');
  const [ingestRaw, setIngestRaw] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [copiedS3Key, setCopiedS3Key] = useState<string | null>(null);

  const loadRepoData = useCallback(
    async (targetPath?: string) => {
      try {
        const [treeRes, commitsRes, s3Res] = await Promise.all([
          fetch(`/api/v1/repos/school76/${encodeURIComponent(project.forgejoRepo)}/git/trees/main`).then(
            (r) => r.json()
          ),
          fetch(`/api/v1/repos/school76/${encodeURIComponent(project.forgejoRepo)}/commits`).then((r) =>
            r.json()
          ),
          fetch(`/api/s3/${encodeURIComponent(project.s3Bucket)}`).then((r) => r.json()),
        ]);
        if (Array.isArray(treeRes.tree)) setTree(treeRes.tree);
        if (Array.isArray(commitsRes.commits)) setCommits(commitsRes.commits);
        if (Array.isArray(s3Res.objects)) setS3Objects(s3Res.objects);

        const pathToRead = targetPath || selectedPath;
        const fileRes = await fetch(
          `/api/v1/repos/school76/${encodeURIComponent(project.forgejoRepo)}/contents/${pathToRead}`
        );
        if (fileRes.ok) {
          const data = await fileRes.json();
          setSelectedPath(data.path);
          setFileContent(data.rawContent || '');
          setFileSha(data.sha || '');
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Ошибка загрузки Forgejo/Garage S3');
      }
    },
    [project.forgejoRepo, project.s3Bucket, selectedPath]
  );

  useEffect(() => {
    const startDoc = initialDocPath || 'index.md';
    setSelectedPath(startDoc);
    loadRepoData(startDoc);
    if (initialDocPath && onConsumeInitialDocPath) {
      onConsumeInitialDocPath();
    }
  }, [project.id, initialDocPath]);

  const openFile = async (filepath: string) => {
    setErrorMsg(null);
    const res = await fetch(
      `/api/v1/repos/school76/${encodeURIComponent(project.forgejoRepo)}/contents/${filepath}`
    );
    if (!res.ok) {
      setErrorMsg(`Страница ${filepath} не найдена в Forgejo`);
      return;
    }
    const data = await res.json();
    setSelectedPath(data.path);
    setFileContent(data.rawContent || '');
    setFileSha(data.sha || '');
    setEditorMode('read');
  };

  const handleSaveToForgejo = async () => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setErrorMsg(null);
    try {
      await authFetch(
        `/api/v1/repos/school76/${encodeURIComponent(project.forgejoRepo)}/contents/${selectedPath}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            rawContent: fileContent,
            message: commitMessage.trim() || `Update ${selectedPath}`,
          }),
        }
      );
      setCommitMessage('');
      setEditorMode('read');
      setStatusMsg('Коммит сохранён в Forgejo');
      window.setTimeout(() => setStatusMsg(null), 2200);
      await loadRepoData(selectedPath);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Не удалось сохранить файл');
    }
  };

  const handleCreateMarkdownFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    const clean = newFilePath.trim().replace(/^\/+/, '');
    const withExt = clean.endsWith('.md') ? clean : `${clean}.md`;
    try {
      await authFetch(
        `/api/v1/repos/school76/${encodeURIComponent(project.forgejoRepo)}/contents/${withExt}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            rawContent: `# ${withExt.replace(/\.md$/, '')}\n\nОписание раздела базы знаний llm-wiki.\n\nСм. также: [[index]]\n`,
            message: `Create ${withExt}`,
          }),
        }
      );
      setShowNewFileModal(false);
      await loadRepoData(withExt);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка создания файла');
    }
  };

  const handleDeleteFile = async () => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    try {
      await authFetch(
        `/api/v1/repos/school76/${encodeURIComponent(project.forgejoRepo)}/contents/${selectedPath}`,
        { method: 'DELETE' }
      );
      await loadRepoData('index.md');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Нельзя удалить базовый файл');
    }
  };

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setIngesting(true);
    setErrorMsg(null);
    try {
      const res = await authFetch(`/api/wiki/${encodeURIComponent(project.forgejoRepo)}/ingest`, {
        method: 'POST',
        body: JSON.stringify({
          title: ingestTitle,
          category: ingestCategory,
          rawContent: ingestRaw,
        }),
      });
      setShowIngestModal(false);
      setIngestTitle('');
      setIngestRaw('');
      setStatusMsg(`Скомпилировано в ${res.wikiPath} и добавлено в index.md`);
      window.setTimeout(() => setStatusMsg(null), 3000);
      await loadRepoData(res.wikiPath);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка индексации llm-wiki');
    } finally {
      setIngesting(false);
    }
  };

  const handleLintWiki = async () => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    try {
      const res = await authFetch(`/api/wiki/${encodeURIComponent(project.forgejoRepo)}/lint`, {
        method: 'POST',
      });
      setStatusMsg(
        res.brokenLinks.length === 0
          ? `Lint: ${res.totalFiles} файлов проверено, битых ссылок нет`
          : `Lint: найдено ${res.brokenLinks.length} битых ссылок (записано в log.md)`
      );
      window.setTimeout(() => setStatusMsg(null), 3500);
      await loadRepoData('log.md');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка проверки ссылок');
    }
  };

  const handleUploadS3 = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = String(reader.result || '');
        await authFetch(
          `/api/s3/${encodeURIComponent(project.s3Bucket)}/${encodeURIComponent(file.name)}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              base64,
              contentType: file.type || 'application/octet-stream',
            }),
          }
        );
        setStatusMsg(`Загружено в Garage S3: ${file.name}`);
        window.setTimeout(() => setStatusMsg(null), 2500);
        await loadRepoData();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Ошибка загрузки в Garage S3');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteS3 = async (key: string) => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    try {
      await authFetch(`/api/s3/${encodeURIComponent(project.s3Bucket)}/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
      await loadRepoData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка удаления из S3');
    }
  };

  const copyMarkdownEmbed = (obj: GarageObjectMeta) => {
    const md = obj.contentType.startsWith('image/')
      ? `![${obj.key}](${obj.url})`
      : `[${obj.key}](${obj.url})`;
    navigator.clipboard?.writeText(md);
    setCopiedS3Key(obj.key);
    if (editorMode === 'edit') {
      setFileContent((prev) => prev.trimEnd() + `\n\n${md}\n`);
    }
    window.setTimeout(() => setCopiedS3Key(null), 1600);
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-57px)] bg-slate-50">
      {/* Left Rail: Forgejo Markdown Tree & Garage S3 Media Bucket */}
      <aside className="w-full lg:w-72 shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col overflow-y-auto">
        {/* Forgejo Files */}
        <div className="p-4 border-b border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Forgejo · llm-wiki
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                school76/{project.forgejoRepo}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowNewFileModal(true)}
              title="Новый Markdown файл"
              className="p-1.5 text-slate-600 hover:text-sky-700 border border-slate-200 rounded-md"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setShowIngestModal(true)}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Ingest
            </button>
            <button
              type="button"
              onClick={handleLintWiki}
              className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Lint
            </button>
          </div>

          <nav className="space-y-0.5 max-h-64 overflow-y-auto">
            {tree.map((entry) => {
              const active = entry.path === selectedPath;
              return (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => openFile(entry.path)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-md text-left transition-colors ${
                    active
                      ? 'bg-sky-50 text-sky-900 font-semibold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  <span className="font-mono truncate">{entry.path}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Garage S3 Media Bucket */}
        <div className="p-4 space-y-3 flex-1">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <HardDrive className="w-3.5 h-3.5" />
                Garage S3
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                bucket: {project.s3Bucket}
              </div>
            </div>

            <label className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              Загрузить
              <input type="file" onChange={handleUploadS3} className="hidden" />
            </label>
          </div>

          <div className="space-y-2">
            {s3Objects.length === 0 ? (
              <div className="text-xs text-slate-400">
                Бакет пуст. Загрузите схему, фото платы или файл.
              </div>
            ) : (
              s3Objects.map((obj) => (
                <div
                  key={obj.key}
                  className="p-2 border border-slate-200 rounded-md bg-slate-50/70 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-medium text-slate-800 truncate">
                      {obj.key}
                    </span>
                    <span className="font-mono tabular-nums text-[10px] text-slate-500 shrink-0">
                      {(obj.size / 1024).toFixed(1)} КБ
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <button
                      type="button"
                      onClick={() => copyMarkdownEmbed(obj)}
                      className="inline-flex items-center gap-1 text-sky-700 hover:underline"
                    >
                      {copiedS3Key === obj.key ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      {copiedS3Key === obj.key
                        ? 'Скопировано'
                        : editorMode === 'edit'
                          ? 'Вставить в MD'
                          : 'Копия MD'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteS3(obj.key)}
                      className="text-slate-400 hover:text-rose-600"
                      title="Удалить из S3"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* Main Markdown Reader / Editor + Forgejo Commit Log */}
      <main className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-sm font-semibold text-slate-900 truncate">
              {selectedPath}
            </span>
            {fileSha && (
              <span className="font-mono text-xs text-slate-400">
                sha:{fileSha.slice(0, 7)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {statusMsg && (
              <span className="text-xs font-medium text-emerald-700">{statusMsg}</span>
            )}
            {errorMsg && (
              <span className="text-xs font-medium text-rose-600">{errorMsg}</span>
            )}

            <div className="flex items-center p-0.5 bg-slate-200/70 rounded-md">
              <button
                type="button"
                onClick={() => setEditorMode('read')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  editorMode === 'read' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Чтение
              </button>
              <button
                type="button"
                onClick={() => setEditorMode('edit')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  editorMode === 'edit' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Markdown
              </button>
            </div>

            {selectedPath !== 'index.md' && selectedPath !== 'log.md' && selectedPath !== 'schema.md' && (
              <button
                type="button"
                onClick={handleDeleteFile}
                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md"
                title="Удалить страницу"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Reader / Editor Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {editorMode === 'read' ? (
            <div className="max-w-3xl">
              <SafeMarkdownView content={fileContent} onOpenWikiLink={openFile} />
            </div>
          ) : (
            <div className="max-w-4xl space-y-3 h-full flex flex-col">
              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                rows={18}
                className="flex-1 w-full p-4 font-mono text-xs leading-relaxed bg-slate-950 text-slate-100 rounded-md border border-slate-800 focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder={`Сообщение коммита Forgejo (по умолчанию: Update ${selectedPath})`}
                  className="flex-1 px-3 py-2 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <button
                  type="button"
                  onClick={handleSaveToForgejo}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 whitespace-nowrap"
                >
                  <Save className="w-3.5 h-3.5" />
                  Коммит в Forgejo
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Forgejo Commit History */}
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 max-h-40 overflow-y-auto">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-2">
            <GitCommit className="w-3.5 h-3.5" />
            История коммитов Forgejo ({project.forgejoRepo})
          </div>
          <div className="space-y-1">
            {commits.slice(0, 6).map((c) => (
              <div key={c.sha + c.timestamp} className="flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-sky-700 shrink-0">{c.sha.slice(0, 7)}</span>
                  <span className="text-slate-800 truncate">{c.message}</span>
                  <span className="text-slate-400 font-mono text-[11px] truncate hidden sm:inline">
                    {c.path}
                  </span>
                </div>
                <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
                  {c.author} · {new Date(c.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* New Markdown Page Modal */}
      {showNewFileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleCreateMarkdownFile}
            className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-lg p-6 space-y-4"
          >
            <h3 className="text-lg font-semibold text-slate-900">
              Новая страница Markdown в Forgejo
            </h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Путь к файлу (.md)
              </label>
              <input
                type="text"
                required
                value={newFilePath}
                onChange={(e) => setNewFilePath(e.target.value)}
                placeholder="concepts/telemetry-protocol.md"
                className="w-full px-3 py-2 font-mono text-xs border border-slate-200 rounded-md"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewFileModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-md"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700"
              >
                Создать в Forgejo
              </button>
            </div>
          </form>
        </div>
      )}

      {/* LLM-Wiki Ingest Modal */}
      {showIngestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleIngest}
            className="w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-lg p-6 space-y-4"
          >
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Загрузка источника в LLM-Wiki (Ingest)
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Исходный материал сохранится в raw/, скомпилируется в структурированную статью с перекрёстными ссылками, обновит index.md и запишет событие в log.md.
              </p>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Заголовок статьи
                  </label>
                  <input
                    type="text"
                    required
                    value={ingestTitle}
                    onChange={(e) => setIngestTitle(e.target.value)}
                    placeholder="Например: Протокол телеметрии AX.25"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Раздел
                  </label>
                  <select
                    value={ingestCategory}
                    onChange={(e) =>
                      setIngestCategory(e.target.value as 'concepts' | 'subsystems' | 'sources')
                    }
                    className="w-full px-2.5 py-2 text-sm border border-slate-200 rounded-md bg-white"
                  >
                    <option value="concepts">concepts</option>
                    <option value="subsystems">subsystems</option>
                    <option value="sources">sources</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Исходные заметки / протокол испытаний
                </label>
                <textarea
                  required
                  rows={5}
                  value={ingestRaw}
                  onChange={(e) => setIngestRaw(e.target.value)}
                  placeholder="Вставьте черновик спецификации, результаты замеров или описание протокола..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowIngestModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-md"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={ingesting}
                className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-60"
              >
                {ingesting ? 'Индексация...' : 'Скомпилировать в Wiki'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
