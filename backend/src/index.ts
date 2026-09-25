import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pool, initDB } from './db.js';

type UserPayload = {
  id: number;
  username: string;
  role: 'operator' | 'supervisor' | 'admin';
};

type Variables = {
  user: UserPayload;
  rawToken: string;
};

const app = new Hono<{ Variables: Variables }>();
const PORT = Number(process.env.PORT) || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

// Middleware Global
app.use(
  '*',
  cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['POST', 'GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
  })
);

// Health check publik untuk monitoring/Docker
app.get('/health', (c) => c.text('OK', 200));
app.get('/api/health', (c) => c.json({ status: 'ok', uptime: process.uptime() }, 200));

// Middleware Autentikasi JWT + Blacklist Check
const authenticateToken = async (c: any, next: any) => {
  const authHeader = c.req.header('authorization');
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return c.json({ message: 'Token required' }, 401);
  }

  // Cek apakah token sudah pernah di-logout
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const revoked = await pool.query('SELECT id FROM revoked_tokens WHERE token_hash = $1', [tokenHash]);
  if (revoked.rows.length > 0) {
    return c.json({ message: 'Token has been revoked. Please log in again.' }, 401);
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as UserPayload;
    c.set('user', decoded);
    c.set('rawToken', token);
    await next();
  } catch (err) {
    return c.json({ message: 'Invalid or expired token' }, 403);
  }
};

// Middleware Guard Berbasis Role
const requireRoles = (...allowedRoles: string[]) => {
  return async (c: any, next: any) => {
    const user = c.get('user');
    if (!user || !allowedRoles.includes(user.role)) {
      return c.json({ message: 'Forbidden: Insufficient role permissions' }, 403);
    }
    await next();
  };
};

// --- AUTH ---

// Login Endpoint
app.post('/api/auth/login', async (c) => {
  const { username, password } = await c.req.json();
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];

    // Sinkronisasi dengan kolom password_hash
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return c.json({ message: 'Invalid credentials' }, 401);
    }
    if (!user.is_active) {
      return c.json({ message: 'Account is deactivated. Contact Admin.' }, 403);
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    return c.json({
      token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (err) {
    return c.json({ message: 'Server error' }, 500);
  }
});

// Logout Endpoint (Revoke Token)
app.post('/api/auth/logout', authenticateToken, async (c) => {
  const token = c.get('rawToken');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const decoded: any = c.get('user');
  const expDate = decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 8 * 3600 * 1000);

  await pool.query(
    'INSERT INTO revoked_tokens (token_hash, expires_at) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [tokenHash, expDate]
  );
  return c.json({ message: 'Successfully logged out' });
});

// --- REQUESTS ENDPOINTS ---

// View Requests: Operator hanya melihat miliknya; Supervisor & Admin melihat semua
app.get('/api/requests', authenticateToken, async (c) => {
  const user = c.get('user');
  const status = c.req.query('status');
  const priority = c.req.query('priority');

  const conditions: string[] = [];
  const params: any[] = [];

  if (user.role === 'operator') {
    params.push(user.id);
    conditions.push(`r.created_by = $${params.length}`);
  }

  if (status) {
    params.push(status);
    conditions.push(`r.status = $${params.length}`);
  }

  if (priority) {
    params.push(priority.toLowerCase());
    conditions.push(`r.priority = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const query = `
      SELECT r.*, 
             u1.username AS creator_name, 
             u2.username AS reviewer_name
      FROM maintenance_requests r
      LEFT JOIN users u1 ON r.created_by = u1.id
      LEFT JOIN users u2 ON r.reviewed_by = u2.id
      ${whereClause}
      ORDER BY r.created_at DESC
    `;
    const result = await pool.query(query, params);
    return c.json(result.rows);
  } catch (err) {
    return c.json({ message: 'Server error' }, 500);
  }
});

// Create Request
app.post('/api/requests', authenticateToken, async (c) => {
  const user = c.get('user');
  const { asset_id, description, priority } = await c.req.json();
  const normalizedPriority = priority ? priority.toLowerCase() : 'medium';

  if (!asset_id?.trim() || !description?.trim()) {
    return c.json({ message: 'asset_id and description are required' }, 400);
  }
  if (!['low', 'medium', 'high', 'critical'].includes(normalizedPriority)) {
    return c.json({ message: 'Invalid priority. Must be low, medium, high, or critical' }, 400);
  }

  try {
    const result = await pool.query(
      `INSERT INTO maintenance_requests (asset_id, description, priority, status, created_by)
       VALUES ($1, $2, $3, 'Submitted', $4) RETURNING *`,
      [asset_id.trim(), description.trim(), normalizedPriority, user.id]
    );
    return c.json(result.rows[0], 201);
  } catch (err) {
    return c.json({ message: 'Server error' }, 500);
  }
});

// Edit Request
app.put('/api/requests/:id', authenticateToken, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { asset_id, description, priority } = await c.req.json();
  const normalizedPriority = priority ? priority.toLowerCase() : undefined;

  try {
    const target = await pool.query('SELECT * FROM maintenance_requests WHERE id = $1', [id]);
    if (target.rows.length === 0) return c.json({ message: 'Request not found' }, 404);

    const record = target.rows[0];

    if (user.role !== 'admin') {
      if (record.created_by !== user.id) {
        return c.json({ message: 'Forbidden: You can only edit your own requests' }, 403);
      }
      if (record.status !== 'Submitted') {
        return c.json({ message: 'Forbidden: Cannot edit request once reviewed' }, 403);
      }
    }

    const result = await pool.query(
      `UPDATE maintenance_requests 
       SET asset_id = COALESCE($1, asset_id), 
           description = COALESCE($2, description), 
           priority = COALESCE($3, priority)
       WHERE id = $4 RETURNING *`,
      [asset_id, description, normalizedPriority, id]
    );
    return c.json(result.rows[0]);
  } catch (err) {
    return c.json({ message: 'Server error' }, 500);
  }
});

// Approve or Reject: Supervisor & Admin only
app.patch('/api/requests/:id/review', authenticateToken, requireRoles('supervisor', 'admin'), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { status } = await c.req.json();

  if (!['Approved', 'Rejected'].includes(status)) {
    return c.json({ message: 'Status must be Approved or Rejected' }, 400);
  }

  try {
    const result = await pool.query(
      `UPDATE maintenance_requests 
       SET status = $1, reviewed_by = $2, reviewed_at = NOW() 
       WHERE id = $3 RETURNING *`,
      [status, user.id, id]
    );
    if (result.rowCount === 0) return c.json({ message: 'Request not found' }, 404);
    return c.json(result.rows[0]);
  } catch (err) {
    return c.json({ message: 'Server error' }, 500);
  }
});

// Delete Request: Admin only
app.delete('/api/requests/:id', authenticateToken, requireRoles('admin'), async (c) => {
  const id = c.req.param('id');
  try {
    const result = await pool.query('DELETE FROM maintenance_requests WHERE id = $1', [id]);
    if (result.rowCount === 0) return c.json({ message: 'Request not found' }, 404);
    return c.json({ message: 'Request deleted successfully' });
  } catch (err) {
    return c.json({ message: 'Server error' }, 500);
  }
});

// --- USER MANAGEMENT (Admin Only) ---

app.get('/api/users', authenticateToken, requireRoles('admin'), async (c) => {
  try {
    const result = await pool.query('SELECT id, username, role, is_active, created_at FROM users ORDER BY id ASC');
    return c.json(result.rows);
  } catch (err) {
    return c.json({ message: 'Server error' }, 500);
  }
});

// 2. Tambah user baru
app.post('/api/users', authenticateToken, requireRoles('admin'), async (c) => {
  const { username, password, role } = await c.req.json();
  if (!username?.trim() || !password || !role) {
    return c.json({ message: 'Missing required fields' }, 400);
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role, is_active',
      [username.trim(), hash, role]
    );
    return c.json(result.rows[0], 201);
  } catch (err) {
    return c.json({ message: 'Server error or username already taken' }, 500);
  }
});

// 3. Ubah status aktif/nonaktif
app.patch('/api/users/:id/status', authenticateToken, requireRoles('admin'), async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'), 10);
  const { is_active } = await c.req.json();

  if (user.id === id) {
    return c.json({ message: 'Cannot deactivate yourself' }, 400);
  }

  try {
    const result = await pool.query(
      'UPDATE users SET is_active = $1 WHERE id = $2 RETURNING id, username, is_active',
      [is_active, id]
    );
    if (result.rowCount === 0) return c.json({ message: 'User not found' }, 404);
    return c.json(result.rows[0]);
  } catch (err) {
    return c.json({ message: 'Server error' }, 500);
  }
});

// 4. Ubah Role User (INI YANG MENYEBABKAN 404 JIKA BELUM ADA)
app.patch('/api/users/:id/role', authenticateToken, requireRoles('admin'), async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'), 10);
  const { role } = await c.req.json();

  if (!['operator', 'supervisor', 'admin'].includes(role)) {
    return c.json({ message: 'Role tidak valid. Harus operator, supervisor, atau admin' }, 400);
  }

  if (user.id === id) {
    return c.json({ message: 'Anda tidak dapat mengubah role akun Anda sendiri' }, 400);
  }

  try {
    const result = await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, role',
      [role, id]
    );
    if (result.rowCount === 0) return c.json({ message: 'User not found' }, 404);
    return c.json(result.rows[0]);
  } catch (err) {
    return c.json({ message: 'Server error' }, 500);
  }
});

// 5. Hapus User
app.delete('/api/users/:id', authenticateToken, requireRoles('admin'), async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'), 10);

  if (user.id === id) {
    return c.json({ message: 'Anda tidak dapat menghapus akun Anda sendiri' }, 400);
  }

  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
    if (result.rowCount === 0) return c.json({ message: 'User not found' }, 404);
    return c.json({ message: 'User berhasil dihapus' });
  } catch (err) {
    return c.json({ message: 'Server error' }, 500);
  }
});

// Server Initialization
initDB()
  .then(() => {
    serve({ fetch: app.fetch, port: PORT }, () => {
      console.log(`Hono server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });