<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 pb-16">
    <!-- Toast Notification -->
    <div v-if="toast.show" class="fixed bottom-5 right-5 z-50 transition-all transform duration-300">
      <div 
        :class="toast.type === 'success' ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-rose-600 text-white border-rose-500'"
        class="flex items-center space-x-3 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium"
      >
        <span>{{ toast.message }}</span>
        <button @click="toast.show = false" class="text-white/70 hover:text-white">&times;</button>
      </div>
    </div>

    <!-- Header Navbar -->
    <header class="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-20 px-6 py-3.5 flex justify-between items-center">
      <div class="flex items-center space-x-3">
        <div class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
        <h1 class="font-bold text-white text-base tracking-wide">Factory Maintenance System</h1>
      </div>
      <div class="flex items-center space-x-4" v-if="user">
        <div class="text-right">
          <div class="text-sm font-semibold text-white">{{ user.username }}</div>
          <span 
            :class="{
              'bg-blue-500/10 text-blue-400 border-blue-500/30': user.role === 'operator',
              'bg-amber-500/10 text-amber-400 border-amber-500/30': user.role === 'supervisor',
              'bg-purple-500/10 text-purple-400 border-purple-500/30': user.role === 'admin'
            }"
            class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border"
          >
            {{ user.role }}
          </span>
        </div>
        <button
          @click="handleLogout"
          class="text-xs bg-slate-800 hover:bg-rose-600/20 hover:text-rose-400 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700 transition duration-200"
        >
          Logout
        </button>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-6 pt-6 space-y-6">
      <!-- 1. Form Create Request -->
      <section class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <h2 class="text-sm font-semibold text-white uppercase tracking-wider mb-3">Buat Maintenance Request Baru</h2>
        <form @submit.prevent="createRequest" class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            v-model="newReq.asset_id"
            required
            placeholder="Asset / Machine ID (e.g. CNC-01)"
            class="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
          <select
            v-model="newReq.priority"
            class="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
          >
            <option value="low">Priority: Low</option>
            <option value="medium">Priority: Medium</option>
            <option value="high">Priority: High</option>
            <option value="critical">Priority: Critical</option>
          </select>
          <div class="md:col-span-2">
            <input
              v-model="newReq.description"
              required
              placeholder="Deskripsi masalah mesin..."
              class="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div class="md:col-span-4 flex justify-end">
            <button
              type="submit"
              :disabled="submitting"
              class="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-lg transition"
            >
              {{ submitting ? 'Mengirim...' : '+ Ajukan Request' }}
            </button>
          </div>
        </form>
      </section>

      <!-- 2. Search, Filter & List Table -->
      <section class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div class="p-4 border-b border-slate-800 flex flex-wrap justify-between items-center gap-3">
          <div class="w-full md:w-72">
            <input
              v-model="searchQuery"
              @input="debounceSearch"
              placeholder="Cari asset ID / deskripsi..."
              class="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 text-xs text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div class="flex items-center space-x-3">
            <select
              v-model="filterStatus"
              @change="applyFilter"
              class="bg-slate-950 border border-slate-700 text-xs text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none"
            >
              <option value="">Semua Status</option>
              <option value="Submitted">Submitted</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>

            <select
              v-model="filterPriority"
              @change="applyFilter"
              class="bg-slate-950 border border-slate-700 text-xs text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none"
            >
              <option value="">Semua Prioritas</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs text-slate-300">
            <thead class="bg-slate-950/70 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th class="p-3.5">ID & Mesin</th>
                <th class="p-3.5">Deskripsi</th>
                <th class="p-3.5">Prioritas</th>
                <th class="p-3.5">Status</th>
                <th class="p-3.5">Pelapor</th>
                <th class="p-3.5">Reviewer</th>
                <th class="p-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800">
              <tr v-for="req in requests" :key="req.id" class="hover:bg-slate-800/30">
                <td class="p-3.5">
                  <div class="font-bold text-white">{{ req.asset_id }}</div>
                  <div class="text-[10px] text-slate-500">Req #{{ req.id }}</div>
                </td>
                <td class="p-3.5 max-w-xs text-slate-300 truncate">{{ req.description }}</td>
                <td class="p-3.5">
                  <span
                    :class="{
                      'text-rose-400 bg-rose-500/10 border-rose-500/20': req.priority === 'critical' || req.priority === 'high',
                      'text-amber-400 bg-amber-500/10 border-amber-500/20': req.priority === 'medium',
                      'text-slate-400 bg-slate-800 border-slate-700': req.priority === 'low'
                    }"
                    class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border"
                  >
                    {{ req.priority }}
                  </span>
                </td>
                <td class="p-3.5">
                  <span
                    :class="{
                      'text-blue-400 bg-blue-500/10 border-blue-500/20': req.status === 'Submitted',
                      'text-emerald-400 bg-emerald-500/10 border-emerald-500/20': req.status === 'Approved',
                      'text-rose-400 bg-rose-500/10 border-rose-500/20': req.status === 'Rejected'
                    }"
                    class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border"
                  >
                    {{ req.status }}
                  </span>
                </td>
                <td class="p-3.5">
                  <span class="text-white font-medium">{{ req.created_by_username || (req.created_by ? 'User #' + req.created_by : 'Akun Terhapus') }}</span>
                  <div class="text-[10px] text-slate-500">{{ new Date(req.created_at).toLocaleDateString() }}</div>
                </td>
                <td class="p-3.5">
                  <div v-if="req.reviewed_by_username">
                    <span class="text-slate-200">{{ req.reviewed_by_username }}</span>
                    <div class="text-[10px] text-slate-500">{{ new Date(req.reviewed_at).toLocaleDateString() }}</div>
                  </div>
                  <div v-else-if="req.reviewed_at">
                    <span class="text-slate-400 italic">Akun Terhapus</span>
                    <div class="text-[10px] text-slate-500">{{ new Date(req.reviewed_at).toLocaleDateString() }}</div>
                  </div>
                  <span v-else class="text-slate-600 italic">Belum direview</span>
                </td>

                <td class="p-3.5 text-right space-x-2">
                  <button
                    v-if="(user?.role === 'admin') || (req.created_by === user?.id && req.status === 'Submitted')"
                    @click="openEditModal(req)"
                    class="text-blue-400 hover:text-blue-300 font-medium"
                  >
                    Edit
                  </button>

                  <template v-if="user?.role === 'supervisor' || user?.role === 'admin'">
                    <button
                      v-if="req.status !== 'Approved'"
                      @click="reviewRequest(req.id, 'Approved')"
                      class="text-emerald-400 hover:text-emerald-300 font-medium"
                    >
                      Approve
                    </button>
                    <button
                      v-if="req.status !== 'Rejected'"
                      @click="reviewRequest(req.id, 'Rejected')"
                      class="text-amber-400 hover:text-amber-300 font-medium"
                    >
                      Reject
                    </button>
                  </template>

                  <button
                    v-if="user?.role === 'admin'"
                    @click="deleteRequest(req.id)"
                    class="text-rose-400 hover:text-rose-300 font-medium"
                  >
                    Delete
                  </button>
                </td>
              </tr>
              <tr v-if="requests.length === 0">
                <td colspan="7" class="p-8 text-center text-slate-500">Tidak ada catatan request yang sesuai.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination Controls -->
        <div class="p-4 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
          <div>
            Halaman <span class="text-white font-semibold">{{ pagination.page }}</span> dari <span class="text-white font-semibold">{{ pagination.total_pages || 1 }}</span> 
            (Total {{ pagination.total }} records)
          </div>
          <div class="space-x-2">
            <button
              :disabled="pagination.page <= 1"
              @click="changePage(pagination.page - 1)"
              class="px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-300 hover:bg-slate-800 disabled:opacity-30"
            >
              &larr; Prev
            </button>
            <button
              :disabled="pagination.page >= pagination.total_pages"
              @click="changePage(pagination.page + 1)"
              class="px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-300 hover:bg-slate-800 disabled:opacity-30"
            >
              Next &rarr;
            </button>
          </div>
        </div>
      </section>

      <!-- 3. Panel Khusus Admin -->
      <section v-if="user?.role === 'admin'" class="bg-slate-900 border border-purple-900/40 rounded-xl p-5 shadow-sm space-y-4">
        <h2 class="text-sm font-semibold text-purple-400 uppercase tracking-wider">Admin Panel: Manajemen Pengguna</h2>
        <form @submit.prevent="createUser" class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input v-model="newUser.username" required placeholder="Username baru" class="px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white" />
          <input v-model="newUser.password" type="password" required placeholder="Password baru" class="px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white" />
          <select v-model="newUser.role" class="px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white">
            <option value="operator">Operator</option>
            <option value="supervisor">Supervisor</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" class="py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs rounded-lg transition">+ Tambah Akun</button>
        </form>

        <div class="overflow-x-auto border border-slate-800 rounded-lg mt-3">
          <table class="w-full text-left text-xs text-slate-300">
            <thead class="bg-slate-950 text-[10px] uppercase text-slate-400">
              <tr>
                <th class="p-3">ID</th>
                <th class="p-3">Username</th>
                <th class="p-3">Role</th>
                <th class="p-3">Status</th>
                <th class="p-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800">
              <tr v-for="u in usersList" :key="u.id">
                <td class="p-3 text-slate-500 font-mono">#{{ u.id }}</td>
                <td class="p-3 text-white font-medium">
                  {{ u.username }}
                  <span v-if="user && u.id === user.id" class="ml-1 text-[10px] text-purple-400 font-normal">(Anda)</span>
                </td>
                <td class="p-3">
                  <!-- Dropdown Ubah Role -->
                  <select
                    :value="u.role"
                    :disabled="user && u.id === user.id"
                    @change="updateUserRole(u.id, u.username, ($event.target as HTMLSelectElement).value)"
                    class="bg-slate-950 border border-slate-700 text-xs text-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <option value="operator">Operator</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td class="p-3">
                  <span :class="u.is_active ? 'text-emerald-400' : 'text-rose-400'">{{ u.is_active ? 'Aktif' : 'Non-aktif' }}</span>
                </td>
                <td class="p-3 text-right space-x-2">
                  <template v-if="user && u.id !== user.id">
                    <button 
                      @click="toggleUserActive(u.id, !u.is_active)" 
                      class="text-xs hover:underline" 
                      :class="u.is_active ? 'text-rose-400' : 'text-emerald-400'"
                    >
                      {{ u.is_active ? 'Deactivate' : 'Activate' }}
                    </button>
                    <button
                      @click="deleteUser(u.id, u.username)"
                      class="text-xs text-rose-400 hover:text-rose-300 font-semibold hover:underline"
                    >
                      Delete
                    </button>
                  </template>
                  <span v-else class="text-xs text-slate-600 italic">Akun aktif saat ini</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>

    <!-- Modal Edit Request -->
    <div v-if="editingReq" class="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md space-y-4">
        <h3 class="font-bold text-white text-base">Edit Request Maintenance #{{ editingReq.id }}</h3>
        <div class="space-y-3">
          <div>
            <label class="text-xs text-slate-400 block mb-1">Asset ID</label>
            <input v-model="editingReq.asset_id" class="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white" />
          </div>
          <div>
            <label class="text-xs text-slate-400 block mb-1">Priority</label>
            <select v-model="editingReq.priority" class="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white">
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-slate-400 block mb-1">Deskripsi Masalah</label>
            <textarea v-model="editingReq.description" rows="3" class="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white"></textarea>
          </div>
        </div>
        <div class="flex justify-end space-x-2 pt-2">
          <button @click="editingReq = null" class="px-4 py-2 bg-slate-800 rounded text-xs">Batal</button>
          <button @click="saveEditRequest" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium">Simpan</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

definePageMeta({ middleware: 'auth' });

const { fetchApi } = useApi();
const { user, initAuth, logout } = useAuth();

const requests = ref<any[]>([]);
const usersList = ref<any[]>([]);
const filterStatus = ref('');
const filterPriority = ref('');
const searchQuery = ref('');
const submitting = ref(false);
const editingReq = ref<any | null>(null);

let searchTimeout: any = null;

const toast = ref({ show: false, message: '', type: 'success' });
const notify = (message: string, type: 'success' | 'error' = 'success') => {
  toast.value = { show: true, message, type };
  setTimeout(() => { toast.value.show = false; }, 3500);
};

const pagination = ref({ page: 1, limit: 10, total: 0, total_pages: 1 });

const newReq = ref({ asset_id: '', description: '', priority: 'medium' });
const newUser = ref({ username: '', password: '', role: 'operator' });

const loadRequests = async () => {
  try {
    let query = `?page=${pagination.value.page}&limit=${pagination.value.limit}&`;
    if (filterStatus.value) query += `status=${filterStatus.value}&`;
    if (filterPriority.value) query += `priority=${filterPriority.value}&`;
    if (searchQuery.value.trim()) query += `search=${encodeURIComponent(searchQuery.value.trim())}&`;

    const res = await fetchApi(`/api/requests${query}`);
    requests.value = res.data;
    pagination.value = res.meta;
  } catch (err: any) {
    notify('Gagal memuat requests: ' + err.message, 'error');
  }
};

const debounceSearch = () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    pagination.value.page = 1;
    loadRequests();
  }, 350);
};

const applyFilter = () => {
  pagination.value.page = 1;
  loadRequests();
};

const changePage = (newPage: number) => {
  pagination.value.page = newPage;
  loadRequests();
};

const createRequest = async () => {
  submitting.value = true;
  try {
    await fetchApi('/api/requests', {
      method: 'POST',
      body: JSON.stringify(newReq.value),
    });
    newReq.value = { asset_id: '', description: '', priority: 'medium' };
    notify('Request maintenance berhasil diajukan');
    await loadRequests();
  } catch (err: any) {
    notify(err.message, 'error');
  } finally {
    submitting.value = false;
  }
};

const openEditModal = (req: any) => {
  editingReq.value = { ...req };
};

const saveEditRequest = async () => {
  if (!editingReq.value) return;
  try {
    await fetchApi(`/api/requests/${editingReq.value.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        asset_id: editingReq.value.asset_id,
        description: editingReq.value.description,
        priority: editingReq.value.priority,
      }),
    });
    editingReq.value = null;
    notify('Perubahan tiket berhasil disimpan');
    await loadRequests();
  } catch (err: any) {
    notify(err.message, 'error');
  }
};

const reviewRequest = async (id: number, status: 'Approved' | 'Rejected') => {
  try {
    await fetchApi(`/api/requests/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    notify(`Status tiket diubah menjadi ${status}`);
    await loadRequests();
  } catch (err: any) {
    notify(err.message, 'error');
  }
};

const deleteRequest = async (id: number) => {
  if (!confirm('Hapus request ini secara permanen?')) return;
  try {
    await fetchApi(`/api/requests/${id}`, { method: 'DELETE' });
    notify('Request berhasil dihapus');
    await loadRequests();
  } catch (err: any) {
    notify(err.message, 'error');
  }
};

const handleLogout = async () => {
  try {
    await fetchApi('/api/auth/logout', { method: 'POST' });
  } catch {
    // Abaikan jika token kedaluwarsa
  } finally {
    logout();
  }
};

// Admin Panel Methods
const loadUsers = async () => {
  if (user.value?.role !== 'admin') return;
  try {
    usersList.value = await fetchApi('/api/users');
  } catch (err: any) {
    notify('Gagal memuat user: ' + err.message, 'error');
  }
};

const createUser = async () => {
  try {
    await fetchApi('/api/users', { method: 'POST', body: JSON.stringify(newUser.value) });
    newUser.value = { username: '', password: '', role: 'operator' };
    notify('Pengguna baru berhasil dibuat');
    await loadUsers();
  } catch (err: any) {
    notify(err.message, 'error');
  }
};

const toggleUserActive = async (id: number, is_active: boolean) => {
  try {
    await fetchApi(`/api/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ is_active }) });
    notify('Status user berhasil diubah');
    await loadUsers();
  } catch (err: any) {
    notify(err.message, 'error');
  }
};

const updateUserRole = async (id: number, username: string, newRole: string) => {
  if (!confirm(`Ubah role pengguna "${username}" menjadi ${newRole}?`)) {
    await loadUsers();
    return;
  }
  try {
    await fetchApi(`/api/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role: newRole }),
    });
    notify(`Role pengguna "${username}" berhasil diubah menjadi ${newRole}`);
    await loadUsers();
  } catch (err: any) {
    notify('Gagal mengubah role: ' + err.message, 'error');
    await loadUsers();
  }
};

const deleteUser = async (id: number, username: string) => {
  if (!confirm(`Hapus user "${username}" secara permanen? Riwayat tiket perawatan yang terkait akan tetap tersimpan.`)) return;
  try {
    await fetchApi(`/api/users/${id}`, {
      method: 'DELETE',
    });
    notify(`Pengguna "${username}" berhasil dihapus`);
    await loadUsers();
    await loadRequests();
  } catch (err: any) {
    notify('Gagal menghapus pengguna: ' + err.message, 'error');
  }
};

onMounted(() => {
  initAuth();
  loadRequests();
  if (user.value?.role === 'admin') loadUsers();
});
</script>