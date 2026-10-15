const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type RequestOptions = RequestInit & { authenticated?: boolean };

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { authenticated = true, headers: suppliedHeaders, ...init } = options;
  const headers = new Headers(suppliedHeaders);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    const url = /^https?:\/\//i.test(path) ? path : `${API_BASE_URL}${path}`;
    response = await fetch(url, { ...init, headers, credentials: init.credentials || 'include' });
  } catch {
    throw new ApiError('Cannot connect to CineMate. Check that the API server is running.', 0);
  }

  if (response.status === 401 && authenticated) {
    localStorage.removeItem('token');
    window.dispatchEvent(new CustomEvent('cinemate:unauthorized'));
  }

  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : { message: await response.text().catch(() => '') };
  if (!response.ok) {
    throw new ApiError(payload?.message || `Request failed (${response.status}).`, response.status);
  }
  return payload as T;
}
