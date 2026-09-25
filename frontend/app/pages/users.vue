<script setup lang="ts">
definePageMeta({ middleware: 'auth' });

const { user, isAdmin } = useAuth();
const { fetchWithAuth } = useApi();

const usersList = ref<any[]>([]);
const errorMsg = ref('');
const successMsg = ref('');

const newUser = ref({
  username: '',
  password: '',
  role: 'operator',
});

const loadUsers = async () => {
  try {
    usersList.value = await fetchWithAuth('/api/users');
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memuat pengguna';
  }
};

const createUser = async () => {
  errorMsg.value = '';
  successMsg.value = '';
  try {
    await fetchWithAuth('/api/users', {
      method: 'POST',
      body: newUser.value,
    });
    successMsg.value = `Pengguna ${newUser.value.username} berhasil didaftarkan.`;
    newUser.value = { username: '', password: '', role: 'operator' };
    await loadUsers();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal membuat pengguna baru';
  }
};

const toggleUserStatus = async (targetUser: any) => {
  errorMsg.value = '';
  successMsg.value = '';
  const nextStatus = !targetUser.is_active;
  try {
    await fetchWithAuth(`/api/users/${targetUser.id}/status`, {
      method: 'PATCH',
      body: { is_active: nextStatus },
    });
    targetUser.is_active = nextStatus;
    successMsg.value = `Status ${targetUser.username} diubah menjadi ${nextStatus ? 'Aktif' : 'Nonaktif'}.`;
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memperbarui status pengguna';
  }
};

onMounted(async () => {
  // Pengecekan admin yang mendukung computed property maupun method function
  const checkAdmin = typeof isAdmin === 'function' ? (isAdmin as Function)() : unref(isAdmin);
  if (!checkAdmin) {
    await navigateTo('/');
    return;
  }
  await loadUsers();
});
</script>

<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <div class="max-w-5xl mx-auto space-y-6">
      <div class="flex justify-between items-center bg-white p-4 rounded shadow">
        <div>
          <h1 class="text-xl font-bold text-gray-800">Manajemen Pengguna Pabrik</h1>
          <p class="text-xs text-gray-500">Akses Khusus Administrator</p>
        </div>
        <NuxtLink to="/" class="text-blue-600 hover:underline text-sm font-medium">← Kembali ke Dashboard</NuxtLink>
      </div>

      <div v-if="errorMsg" class="bg-red-100 text-red-700 p-3 rounded text-sm">{{ errorMsg }}</div>
      <div v-if="successMsg" class="bg-green-100 text-green-700 p-3 rounded text-sm">{{ successMsg }}</div>

      <!-- Form Tambah User Baru -->
      <section class="bg-white p-5 rounded shadow">
        <h2 class="font-bold text-gray-800 mb-3 text-sm">Tambah Pengguna Baru</h2>
        <form @submit.prevent="createUser" class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input v-model="newUser.username" placeholder="Username" required class="border p-2 rounded text-sm outline-none focus:ring focus:ring-blue-200" />
          <input v-model="newUser.password" type="password" placeholder="Password" required class="border p-2 rounded text-sm outline-none focus:ring focus:ring-blue-200" />
          <select v-model="newUser.role" class="border p-2 rounded text-sm outline-none focus:ring focus:ring-blue-200">
            <option value="operator">Operator</option>
            <option value="supervisor">Supervisor</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" class="bg-green-600 text-white font-semibold py-2 px-4 rounded text-sm hover:bg-green-700 transition">
            Tambah User
          </button>
        </form>
      </section>

      <!-- Tabel Daftar User -->
      <section class="bg-white p-5 rounded shadow">
        <table class="w-full text-left border-collapse border text-sm">
          <thead>
            <tr class="bg-gray-100 text-gray-700">
              <th class="border p-3">ID</th>
              <th class="border p-3">Username</th>
              <th class="border p-3">Role</th>
              <th class="border p-3">Status</th>
              <th class="border p-3 text-center">Tindakan</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in usersList" :key="u.id" class="hover:bg-gray-50">
              <td class="border p-3">{{ u.id }}</td>
              <td class="border p-3 font-semibold">{{ u.username }}</td>
              <td class="border p-3 capitalize">{{ u.role }}</td>
              <td class="border p-3">
                <span :class="u.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'" class="px-2 py-1 rounded text-xs font-bold">
                  {{ u.is_active ? 'Aktif' : 'Nonaktif' }}
                </span>
              </td>
              <td class="border p-3 text-center">
                <button
                  v-if="u.id !== user?.id"
                  @click="toggleUserStatus(u)"
                  :class="u.is_active ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-600 hover:bg-green-700'"
                  class="text-white px-3 py-1 rounded text-xs transition"
                >
                  {{ u.is_active ? 'Nonaktifkan' : 'Aktifkan' }}
                </button>
                <span v-else class="text-xs text-gray-400 italic">Akun Anda</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </div>
</template>