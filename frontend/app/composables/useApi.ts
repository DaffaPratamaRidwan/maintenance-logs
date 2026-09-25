export const useApi = () => {
  const config = useRuntimeConfig();
  // Di Nuxt 4, useCookie dapat diakses langsung secara universal (SSR & Client)
  const token = useCookie('auth_token');
  const apiBase = (config.public.apiBase as string) || 'http://localhost:4000';

  /**
   * Wrapper $fetch terotentikasi yang kompatibel dengan Nuxt 4 dan Hono backend.
   * Otomatis menyematkan Authorization Bearer token dan menangani parsing error Hono.
   */
  const fetchWithAuth = async (
    endpoint: string,
    options: Parameters[1] = {}
  ): Promise => {
    const headers: Record = {
      ...(options.headers as Record || {}),
    };

    if (token.value) {
      headers['Authorization'] = `Bearer ${token.value}`;
    }

    try {
      return await $fetch(endpoint, {
        baseURL: apiBase,
        ...options,
        headers,
      });
    } catch (err: any) {
      // Backend Hono mengirimkan error payload { message: '...' }
      const serverMessage = err.data?.message || err.data?.error || err.message;
      throw new Error(serverMessage || `Request failed with status ${err.status || 500}`);
    }
  };

  return {
    fetchWithAuth,
    fetchApi: fetchWithAuth, // Alias agar kode yang memanggil fetchApi maupun fetchWithAuth tetap berjalan
    apiBase,
  };
};