import React, { useState } from 'react';
import { Heart, MessageSquare } from 'lucide-react';
import type { SocialPost } from '../../types/cubesat.ts';
import { formatDateTimeRu, formatTimeRu } from '../../utils/formatters.ts';
import { isSafeImageSrc, renderInlineTokens } from '../../utils/markdown.tsx';

interface SocialPostCardProps {
  post: SocialPost;
  projectName?: string;
  currentUserId: string | null;
  onToggleLike: (postId: string) => Promise<void>;
  onComment: (postId: string, text: string) => Promise<void>;
  onRequireAuth: () => void;
  onOpenWikiLink?: (target: string) => void;
}

export const SocialPostCard: React.FC<SocialPostCardProps> = ({
  post,
  projectName,
  currentUserId,
  onToggleLike,
  onComment,
  onRequireAuth,
  onOpenWikiLink,
}) => {
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  const isLiked = currentUserId ? post.likes.includes(currentUserId) : false;
  const dateStr = formatDateTimeRu(post.createdAt);

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId) {
      onRequireAuth();
      return;
    }
    if (!commentText.trim()) return;
    setSendingComment(true);
    try {
      await onComment(post.id, commentText.trim());
      setCommentText('');
    } finally {
      setSendingComment(false);
    }
  };

  return (
    <article className="bg-white border border-slate-200 rounded-lg p-5 space-y-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-semibold text-slate-900">{post.authorName}</span>
          <span className="text-xs font-mono text-slate-500">{post.authorHandle}</span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span className="text-xs text-slate-500">{post.authorRole}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {projectName && <span className="text-sky-700 font-medium">{projectName}</span>}
          <span className="font-mono tabular-nums">{dateStr}</span>
        </div>
      </div>

      {post.text && (
        <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
          {renderInlineTokens(post.text, onOpenWikiLink)}
        </p>
      )}

      {post.mediaUrls.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {post.mediaUrls.filter(isSafeImageSrc).map((url, idx) => (
            <div
              key={`${post.id}-media-${idx}`}
              className="border border-slate-200 rounded-md overflow-hidden bg-slate-50"
            >
              <img
                src={url}
                alt={`Вложение сообщества от ${post.authorName}`}
                className="w-full max-h-72 object-cover"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-5 pt-2 border-t border-slate-100 text-xs text-slate-600">
        <button
          type="button"
          onClick={() => {
            if (!currentUserId) {
              onRequireAuth();
              return;
            }
            onToggleLike(post.id);
          }}
          className={`inline-flex items-center gap-1.5 font-medium transition-colors ${
            isLiked ? 'text-rose-600' : 'text-slate-600 hover:text-rose-600'
          }`}
        >
          <Heart className={`w-4 h-4 ${isLiked ? 'fill-rose-600' : ''}`} />
          <span className="font-mono tabular-nums">{post.likes.length}</span>
        </button>

        <span className="inline-flex items-center gap-1.5 text-slate-500">
          <MessageSquare className="w-3.5 h-3.5" />
          <span className="font-mono tabular-nums">{post.comments.length}</span>
        </span>
      </div>

      {post.comments.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          {post.comments.map((c) => (
            <div key={c.id} className="text-xs bg-slate-50 rounded-md px-3 py-2 space-y-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-slate-800">{c.authorName}</span>
                <span className="font-mono text-[11px] text-slate-400">
                  {formatTimeRu(c.createdAt)}
                </span>
              </div>
              <p className="text-slate-700">{c.text}</p>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleCommentSubmit} className="flex items-center gap-2 pt-1">
        <input
          type="text"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder={
            currentUserId
              ? 'Добавить комментарий...'
              : 'Войдите, чтобы оставить комментарий...'
          }
          className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
        <button
          type="submit"
          disabled={sendingComment}
          className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
        >
          Ответить
        </button>
      </form>
    </article>
  );
};
