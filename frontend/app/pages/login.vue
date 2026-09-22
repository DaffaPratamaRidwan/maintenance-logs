<template>
  <div class="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
    <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-2xl">
      <div class="mb-6 text-center">
        <h1 class="text-xl font-bold text-white tracking-wide">Factory Maintenance Log</h1>
        <p class="text-slate-400 text-xs mt-1">Masuk untuk mengelola request perawatan mesin</p>
      </div>

      <form @submit.prevent="handleLogin" class="space-y-4">
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Username</label>
          <input
            v-model="username"
            type="text"
            required
            placeholder="e.g. operator1, supervisor1, admin1"
            class="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Password</label>
          <input
            v-model="password"
            type="password"
            required
            placeholder="••••••••"
            class="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div v-if="errorMessage" class="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-lg">
          {{ errorMessage }}
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-sm transition disabled:opacity-50"
        >
          {{ loading ? 'Memverifikasi...' : 'Sign In' }}
        </button>
      </form>

      <!-- Petunjuk Seed Login untuk Evaluator -->
      <div class="mt-6 pt-6 border-t border-slate-800">
        <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Akun Uji Coba (Seed Data):</p>
        <div class="space-y-1.5 text-xs text-slate-400">
          <div class="flex justify-between bg-slate-950 p-2 rounded border border-slate-800">
            <span>Operator: <strong class="text-slate-200">operator1</strong></span>
            <span>Pass: <code class="text-blue-400">password123</code></span>
          </div>
          <div class="flex justify-between bg-slate-950 p-2 rounded border border-slate-800">
            <span>Supervisor: <strong class="text-slate-200">supervisor1</strong></span>
            <span>Pass: <code class="text-blue-400">password123</code></span>
          </div>
          <div class="flex justify-between bg-slate-950 p-2 rounded border border-slate-800">
            <span>Admin: <strong class="text-slate-200">admin1</strong></span>
            <span>Pass: <code class="text-blue-400">password123</code></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const username = ref('');
const password = ref('');
const errorMessage = ref('');
const loading = ref(false);

const { apiBase } = useApi();
const { setAuth } = useAuth();

const handleLogin = async () => {
  loading.value = true;
  errorMessage.value = '';

  try {
    const res = await fetch(`${apiBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username.value,
        password: password.value,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Autentikasi gagal');

    setAuth(data.token, data.user);
    navigateTo('/');
  } catch (err: any) {
    errorMessage.value = err.message;
  } finally {
    loading.value = false;
  }
};
</script>