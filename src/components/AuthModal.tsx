import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { Subsystem, UserProfile } from '../types/cubesat.ts';
import { SUBSYSTEM_LABELS } from '../types/cubesat.ts';

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (username: string, password: string) => Promise<UserProfile>;
  onRegister: (payload: {
    username: string;
    displayName: string;
    password: string;
    role: string;
    subsystem: Subsystem;
    bio?: string;
  }) => Promise<UserProfile>;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLogin,
  onRegister,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('Инженер-разработчик');
  const [subsystem, setSubsystem] = useState<Subsystem>('OBC');
  const [bio, setBio] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await onLogin(username.trim(), password);
      } else {
        await onRegister({
          username: username.trim(),
          displayName: displayName.trim(),
          password,
          role: role.trim() || 'Инженер-разработчик',
          subsystem,
          bio: bio.trim(),
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка авторизации');
    } finally {
      setSubmitting(false);
    }
  };

  const quickFillDemo = (demoUser: string) => {
    setMode('login');
    setUsername(demoUser);
    setPassword('school76');
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">
            Личный кабинет инженера school76
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pt-4 flex gap-4 border-b border-slate-200 text-sm">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`pb-2.5 font-medium border-b-2 transition-colors ${
              mode === 'login'
                ? 'border-sky-600 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Вход в аккаунт
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`pb-2.5 font-medium border-b-2 transition-colors ${
              mode === 'register'
                ? 'border-sky-600 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Регистрация
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-3 py-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Логин (латиница, цифры, _ или -)
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="artem"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Имя и фамилия
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Артём Соколов"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Инженерная роль
                  </label>
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Подсистема
                  </label>
                  <select
                    value={subsystem}
                    onChange={(e) => setSubsystem(e.target.value as Subsystem)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
                  >
                    {(Object.keys(SUBSYSTEM_LABELS) as Subsystem[]).map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  О себе и специализация
                </label>
                <textarea
                  rows={2}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="STM32, MicroPython, энергобюджет 1U..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Пароль
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {mode === 'login' && (
            <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2">
              <div className="text-[11px] text-slate-500">
                Быстрый вход для проверки (пароль <span className="font-mono text-slate-700">school76</span>):
              </div>
              <div className="flex flex-wrap gap-2">
                {['artem', 'maria', 'dmitry'].map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => quickFillDemo(u)}
                    className="px-2.5 py-1 text-xs font-mono text-sky-700 bg-white border border-slate-200 rounded hover:border-sky-400 transition-colors"
                  >
                    @{u}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-50"
            >
              {submitting
                ? 'Выполняется...'
                : mode === 'login'
                  ? 'Войти'
                  : 'Создать аккаунт'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
