import type { DataProvider } from '@refinedev/core';

export type AuthFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export function createSchool76RefineDataProvider(authFetch: AuthFetchFn): DataProvider {
  const apiUrl = '/api/refine';

  return {
    getApiUrl: () => apiUrl,

    getList: async ({ resource, filters }) => {
      const params = new URLSearchParams();
      if (filters && filters.length > 0) {
        for (const f of filters) {
          if ('field' in f && f.field === 'q' && typeof f.value === 'string' && f.value.trim()) {
            params.set('q', f.value.trim());
          }
        }
      }
      const qs = params.toString();
      const res = await authFetch(`${apiUrl}/${encodeURIComponent(resource)}${qs ? `?${qs}` : ''}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Refine getList failed (${res.status})`);
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      const total = Number(res.headers.get('X-Total-Count') || list.length);
      return { data: list, total };
    },

    getOne: async ({ resource, id }) => {
      const res = await authFetch(`${apiUrl}/${encodeURIComponent(resource)}/${encodeURIComponent(String(id))}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Refine getOne failed (${res.status})`);
      }
      const data = await res.json();
      return { data };
    },

    create: async ({ resource, variables }) => {
      const res = await authFetch(`${apiUrl}/${encodeURIComponent(resource)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(variables),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Refine create failed (${res.status})`);
      }
      return { data };
    },

    update: async ({ resource, id, variables }) => {
      const res = await authFetch(
        `${apiUrl}/${encodeURIComponent(resource)}/${encodeURIComponent(String(id))}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(variables),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Refine update failed (${res.status})`);
      }
      return { data };
    },

    deleteOne: async ({ resource, id }) => {
      const res = await authFetch(
        `${apiUrl}/${encodeURIComponent(resource)}/${encodeURIComponent(String(id))}`,
        { method: 'DELETE' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Refine delete failed (${res.status})`);
      }
      return { data };
    },
  };
}
