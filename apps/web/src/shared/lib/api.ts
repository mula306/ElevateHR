interface ApiErrorShape {
  error?: {
    message?: string;
  };
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
let authHeaderProvider: null | (() => Promise<Record<string, string>> | Record<string, string>) = null;

export function setApiAuthHeaderProvider(provider: typeof authHeaderProvider) {
  authHeaderProvider = provider;
}

export function buildQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, fallbackMessage = 'Unable to complete the request.') {
  const authHeaders = authHeaderProvider ? await authHeaderProvider() : {};
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(init.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = fallbackMessage;

    try {
      const payload = await response.json() as ApiErrorShape;
      message = payload.error?.message ?? message;
    } catch {
      // Keep fallback message when the body is not JSON.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json() as { success?: true } & T;
  return payload;
}
