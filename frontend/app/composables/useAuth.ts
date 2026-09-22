import { ref } from 'vue';

export interface AuthUser {
  id: number;
  username: string;
  role: 'operator' | 'supervisor' | 'admin';
}

export const useAuth = () => {
  const user = useState<AuthUser | null>('auth_user', () => null);

  const initAuth = () => {
    if (process.client) {
      const storedUser = localStorage.getItem('auth_user');
      if (storedUser) {
        try {
          user.value = JSON.parse(storedUser);
        } catch {
          user.value = null;
        }
      }
    }
  };

  const setAuth = (token: string, userData: AuthUser) => {
    if (process.client) {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(userData));
      user.value = userData;
    }
  };

  const logout = () => {
    if (process.client) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      user.value = null;
      navigateTo('/login');
    }
  };

  return {
    user,
    initAuth,
    setAuth,
    logout,
  };
};