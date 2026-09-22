export const useApi = () => {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;

  const fetchApi = async (endpoint: string, options: any = {}) => {
    const token = process.client ? localStorage.getItem('auth_token') : null;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${apiBase}${endpoint}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error! Status: ${res.status}`);
    }

    return res.json();
  };

  return { fetchApi, apiBase };
};