import React from 'react';

export function isSafeImageSrc(src: string): boolean {
  return src.startsWith('/api/s3/') || src.startsWith('https://');
}

export function renderInlineTokens(
  text: string,
  onOpenWikiLink?: (docPath: string) => void
): React.ReactNode[] {
  const tokens = text.split(/(\[\[[^\]]+\]\]|`[^`]+`|\*\*[^*]+\*\*)/g);
  return tokens.map((tok, idx) => {
    if (tok.startsWith('[[') && tok.endsWith(']]')) {
      const inner = tok.slice(2, -2);
      const [target, alias] = inner.split('|');
      const cleanTarget = target.trim().replace(/\.md$/, '');
      if (onOpenWikiLink) {
        return (
          <button
            key={idx}
            type="button"
            onClick={() => onOpenWikiLink(`${cleanTarget}.md`)}
            className="text-sky-700 font-medium underline decoration-sky-300 underline-offset-2 hover:text-sky-900 px-0.5"
          >
            {alias || cleanTarget}
          </button>
        );
      }
      return (
        <span key={idx} className="font-mono text-xs text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded">
          {alias || cleanTarget}
        </span>
      );
    }
    if (tok.startsWith('`') && tok.endsWith('`') && tok.length >= 2) {
      return (
        <code
          key={idx}
          className="px-1 py-0.5 text-xs font-mono bg-slate-100 text-slate-800 rounded"
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    if (tok.startsWith('**') && tok.endsWith('**') && tok.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{tok}</React.Fragment>;
  });
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith('|') && t.includes('|', 1);
}

function isTableSeparator(line: string): boolean {
  const cells = line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|');
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c.trim()));
}

function parseTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

interface SafeMarkdownViewProps {
  content: string;
  onOpenWikiLink?: (docPath: string) => void;
  className?: string;
}

export const SafeMarkdownView: React.FC<SafeMarkdownViewProps> = ({
  content,
  onOpenWikiLink,
  className = 'space-y-2',
}) => {
  const lines = content.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      nodes.push(
        <div key={`code-${i}`} className="my-2 rounded-md border border-slate-200 overflow-hidden">
          {lang && (
            <div className="px-3 py-1 text-[10px] font-mono uppercase text-slate-500 bg-slate-100 border-b border-slate-200">
              {lang}
            </div>
          )}
          <pre className="p-3 bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto leading-relaxed">
            {codeLines.join('\n')}
          </pre>
        </div>
      );
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = parseTableCells(line);
      const bodyRows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) {
        bodyRows.push(parseTableCells(lines[i]));
        i += 1;
      }
      nodes.push(
        <div key={`tbl-${i}`} className="my-2 overflow-x-auto border border-slate-200 rounded-md">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
                {headers.map((h, hi) => (
                  <th key={hi} className="px-3 py-2 border-r border-slate-200 last:border-r-0">
                    {renderInlineTokens(h, onOpenWikiLink)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bodyRows.map((row, ri) => (
                <tr key={ri} className="hover:bg-slate-50/70">
                  {headers.map((_, ci) => (
                    <td
                      key={ci}
                      className="px-3 py-2 text-slate-700 border-r border-slate-100 last:border-r-0"
                    >
                      {renderInlineTokens(row[ci] ?? '', onOpenWikiLink)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (line.startsWith('# ')) {
      nodes.push(
        <h1 key={i} className="text-xl font-bold text-slate-900 pt-1 pb-2 border-b border-slate-200">
          {renderInlineTokens(line.slice(2), onOpenWikiLink)}
        </h1>
      );
      i += 1;
      continue;
    }

    if (line.startsWith('## ')) {
      nodes.push(
        <h2 key={i} className="text-base font-bold text-slate-900 pt-4">
          {renderInlineTokens(line.slice(3), onOpenWikiLink)}
        </h2>
      );
      i += 1;
      continue;
    }

    if (line.startsWith('### ')) {
      nodes.push(
        <h3 key={i} className="text-sm font-semibold text-slate-800 pt-2">
          {renderInlineTokens(line.slice(4), onOpenWikiLink)}
        </h3>
      );
      i += 1;
      continue;
    }

    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch && isSafeImageSrc(imgMatch[2])) {
      nodes.push(
        <figure key={i} className="my-3 border border-slate-200 rounded-md overflow-hidden bg-slate-50">
          <img
            src={imgMatch[2]}
            alt={imgMatch[1] || 'Изображение документа'}
            className="max-h-80 w-full object-contain bg-white"
          />
          {imgMatch[1] && (
            <figcaption className="px-3 py-1.5 text-xs text-slate-500 border-t border-slate-200">
              {imgMatch[1]}
            </figcaption>
          )}
        </figure>
      );
      i += 1;
      continue;
    }

    if (line.startsWith('> ')) {
      nodes.push(
        <blockquote
          key={i}
          className="border-l-2 border-sky-500 pl-3 py-1 text-sm text-slate-600 bg-slate-50 rounded-r"
        >
          {renderInlineTokens(line.slice(2), onOpenWikiLink)}
        </blockquote>
      );
      i += 1;
      continue;
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      nodes.push(
        <div key={i} className="flex items-start gap-2 text-sm text-slate-700 pl-2">
          <span className="text-slate-400 select-none">•</span>
          <div className="flex-1">{renderInlineTokens(line.slice(2), onOpenWikiLink)}</div>
        </div>
      );
      i += 1;
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      nodes.push(
        <div key={i} className="text-sm text-slate-700 pl-2">
          {renderInlineTokens(line, onOpenWikiLink)}
        </div>
      );
      i += 1;
      continue;
    }

    if (trimmed === '') {
      nodes.push(<div key={i} className="h-2" />);
      i += 1;
      continue;
    }

    nodes.push(
      <p key={i} className="text-sm text-slate-700 leading-relaxed">
        {renderInlineTokens(line, onOpenWikiLink)}
      </p>
    );
    i += 1;
  }

  return <div className={className}>{nodes}</div>;
};
