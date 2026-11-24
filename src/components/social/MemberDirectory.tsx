import React, { useMemo, useState } from 'react';
import { Search, UserCheck, UserPlus } from 'lucide-react';
import type { UserProfile } from '../../types/cubesat.ts';

interface MemberDirectoryProps {
  users: UserProfile[];
  currentUser: UserProfile | null;
  searchable?: boolean;
  showProjectCount?: boolean;
  columnsClassName?: string;
  onToggleFollow: (userId: string) => Promise<void>;
  onRequireAuth: () => void;
}

export const MemberDirectory: React.FC<MemberDirectoryProps> = ({
  users,
  currentUser,
  searchable = false,
  showProjectCount = false,
  columnsClassName = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4',
  onToggleFollow,
  onRequireAuth,
}) => {
  const [query, setQuery] = useState('');

  const filteredUsers = useMemo(() => {
    if (!searchable) return users;
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        u.subsystem.toLowerCase().includes(q)
    );
  }, [users, query, searchable]);

  return (
    <div className="space-y-4">
      {searchable && (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск инженера по имени, логину, роли или подсистеме..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      )}

      {filteredUsers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-xs text-slate-500">
          Участники по вашему запросу не найдены.
        </div>
      ) : (
        <div className={columnsClassName}>
          {filteredUsers.map((member) => {
            const isSelf = currentUser?.id === member.id;
            const isFollowing = currentUser ? currentUser.following.includes(member.id) : false;

            return (
              <div
                key={member.id}
                className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {member.displayName}
                    </span>
                    <span className="font-mono text-xs text-slate-400">@{member.username}</span>
                  </div>
                  <div className="text-xs text-sky-700 font-medium">
                    {member.subsystem} · {member.role}
                  </div>
                  {member.bio && (
                    <p className="text-xs text-slate-600 leading-relaxed">{member.bio}</p>
                  )}
                  {member.skills.length > 0 && (
                    <div className="text-[11px] font-mono text-slate-500 pt-1">
                      {member.skills.join(' · ')}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className="text-slate-500 font-mono tabular-nums">
                    Подписчиков: {member.followers.length}
                    {showProjectCount ? ` · Проектов: ${member.joinedProjectIds.length}` : ''}
                  </span>
                  {isSelf ? (
                    <span className="text-slate-400">Это вы</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!currentUser) {
                          onRequireAuth();
                          return;
                        }
                        onToggleFollow(member.id);
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border font-medium transition-colors whitespace-nowrap shrink-0 ${
                        isFollowing
                          ? 'text-slate-700 border-slate-200 bg-slate-50'
                          : 'text-sky-700 border-sky-200 bg-sky-50 hover:bg-sky-100'
                      }`}
                    >
                      {isFollowing ? (
                        <>
                          <UserCheck className="w-3.5 h-3.5" />
                          Вы подписаны
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" />
                          Подписаться
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
