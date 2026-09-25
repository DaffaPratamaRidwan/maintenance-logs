export default defineNuxtRouteMiddleware((to) => {
  const { isAuthenticated } = useAuth();

  const isAuthPage = to.path === '/login';

  // 1. Jika belum login dan mencoba membuka halaman privat, arahkan ke /login
  if (!isAuthenticated.value && !isAuthPage) {
    return navigateTo('/login');
  }

  // 2. Jika sudah login dan mencoba membuka /login kembali, arahkan ke dashboard
  if (isAuthenticated.value && isAuthPage) {
    return navigateTo('/');
  }
});