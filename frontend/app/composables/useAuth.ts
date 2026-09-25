export const useAuth = () => {
  // Sesi 8 jam sesuai masa berlaku JWT backend
  const token = useCookie('auth_token', { maxAge: 60 * 60 * 8 });
  const user = useCookie('auth_user', { maxAge: 60 * 60 * 8 });
  const config = useRuntimeConfig();
  const apiBase = (config.public.apiBase as string) || 'http://localhost:4000';

  const setAuth = (newToken: string, userData: any) => {
    token.value = newToken;
    user.value = userData;
  };

  /**
   * Logout dengan memanggil backend agar token dimasukkan ke revoked_tokens,
   * lalu membersihkan cookie lokal dan redirect ke login.
   */
  const logout = async () => {
    if (token.value) {
      try {
        await $fetch('/api/auth/logout', {
          baseURL: apiBase,
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token.value}`,
          },
        });
      } catch (err) {
        // Tetap lanjutkan pembersihan lokal meskipun backend merespons error
        console.warn('Backend logout revocation notice:', err);
      }
    }

    token.value = null;
    user.value = null;
    await navigateTo('/login');
  };

  return {
    token,
    user,
    setAuth,
    logout,
    // Helper status & peran
    isAuthenticated: computed(() => !!token.value),
    isAdmin: computed(() => user.value?.role === 'admin'),
    isSupervisor: computed(() => user.value?.role === 'supervisor'),
    isOperator: computed(() => user.value?.role === 'operator'),
    canReview: computed(() => ['supervisor', 'admin'].includes(user.value?.role)),
  };
};