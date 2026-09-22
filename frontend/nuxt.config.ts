// frontend/nuxt.config.ts
export default defineNuxtConfig({
  ssr: false, // Tetap gunakan SPA agar tidak ada konflik localStorage
  modules: ['@nuxtjs/tailwindcss'],
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:4000',
    },
  },
  // Memastikan kompatibilitas runtime penuh Nuxt 4
  compatibilityDate: '2026-01-01',
});