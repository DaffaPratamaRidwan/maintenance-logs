import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { pool, initDB } from './db.js';

dotenv.config();

type Variables = {
  user: {
    id: number;
    username: string;
    role: 'operator' | 'supervisor' | 'admin';
    is_active: boolean;
  };
  token: string;
};

const app = new Hono<{ Variables: Variables }>();

// 1. Structured JSON Logging Middleware
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration_ms: Date.now() - start,
  }));
});

// 2. CORS Middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Inisialisasi Database
initDB();

const JWT_SECRET = process.env.JWT_SECRET || 'factory_super_secret_jwt_2026';

// Helper Validasi Input
const isValidString = (val: any, min = 1, max = 255): boolean => {
  return typeof val === 'string' && val.trim().length >= min && val.trim().length <= max;
};

// Helper Hash Token untuk Blacklist
const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// ----------------------------------------------------
// AUTHENTICATION & RBAC MIDDLEWARES
// ----------------------------------------------------
const authenticate = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized: Missing authentication token' }, 401);
  }

  const token = authHeader.split(' ')[1];
  const tokenHashed = hashToken(token);

  // Periksa apakah token sudah dicabut melalui logout
  const revoked = await pool.query('SELECT 1 FROM revoked_tokens WHERE token_hash = $1', [tokenHashed]);
  if (revoked.rowCount && revoked.rowCount > 0) {
    return c.json({ error: 'Unauthorized: Token has been revoked (logged out)' }, 401);
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: number; username: string; role: string };
    
    // Pastikan user masih ada dan aktif di database
    const res = await pool.query('SELECT id, username, role, is_active FROM users WHERE id = $1', [payload.id]);
    if (res.rowCount === 0 || !res.rows[0].is_active) {
      return c.json({ error: 'Forbidden: Account inactive or disabled' }, 403);
    }

    c.set('user', res.rows[0]);
    c.set('token', token);
    await next();
  } catch (err) {
    return c.json({ error: 'Unauthorized: Invalid or expired token' }, 401);
  }
};

const requireRole = (allowedRoles: string[]) => {
  return async (c: any, next: any) => {
    const user = c.get('user');
    if (!allowedRoles.includes(user.role)) {
      return c.json({ error: `Forbidden: Requires one of [${allowedRoles.join(', ')}] roles` }, 403);
    }
    await next();
  };
};

// ----------------------------------------------------
// 1. AUTH ROUTES
// ----------------------------------------------------
app.post('/api/auth/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON body' }, 400);

  const { username, password } = body;
  if (!isValidString(username, 3, 50) || !isValidString(password, 6, 100)) {
    return c.json({ error: 'Validation failed: Invalid username or password format' }, 400);
  }

  const res = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
  if (res.rowCount === 0) return c.json({ error: 'Invalid username or password' }, 401);

  const user = res.rows[0];
  if (!user.is_active) return c.json({ error: 'Account is deactivated' }, 403);

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) return c.json({ error: 'Invalid username or password' }, 401);

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  return c.json({
    message: 'Login successful',
    token,
    user: { id: user.id, username: user.username, role: user.role },
  });
});

app.post('/api/auth/logout', authenticate, async (c) => {
  const token = c.get('token');
  const tokenHashed = hashToken(token);
  const expiresAt = new Date(Date.now() + 8 * 3600 * 1000);

  await pool.query(
    'INSERT INTO revoked_tokens (token_hash, expires_at) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [tokenHashed, expiresAt]
  );

  return c.json({ message: 'Token successfully revoked on server' });
});

// ----------------------------------------------------
// 2. MAINTENANCE REQUESTS CRUD (RBAC + PAGINATION + SEARCH)
// ----------------------------------------------------
app.get('/api/requests', authenticate, async (c) => {
  const user = c.get('user');
  const queryParam = c.req.query();

  const page = Math.max(1, parseInt(queryParam.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(queryParam.limit || '10', 10)));
  const offset = (page - 1) * limit;

  const { status, priority, search } = queryParam;

  let whereClauses: string[] = ['1=1'];
  const params: any[] = [];

  // Isolasi role Operator: Hanya melihat miliknya sendiri
  if (user.role === 'operator') {
    params.push(user.id);
    whereClauses.push(`r.created_by = $${params.length}`);
  }

  // Filter Status
  if (status && ['Submitted', 'Approved', 'Rejected'].includes(status)) {
    params.push(status);
    whereClauses.push(`r.status = $${params.length}`);
  }

  // Filter Priority
  if (priority && ['low', 'medium', 'high', 'critical'].includes(priority)) {
    params.push(priority);
    whereClauses.push(`r.priority = $${params.length}`);
  }

  // Server-Side Search (asset_id atau description)
  if (search && search.trim() !== '') {
    params.push(`%${search.trim()}%`);
    whereClauses.push(`(r.asset_id ILIKE $${params.length} OR r.description ILIKE $${params.length})`);
  }

  const whereSQL = whereClauses.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM maintenance_requests r WHERE ${whereSQL}`,
    params
  );
  const totalRecords = parseInt(countResult.rows[0].count, 10);
  const totalPages = Math.ceil(totalRecords / limit);

  const dataParams = [...params, limit, offset];
  const querySQL = `
    SELECT r.id, r.asset_id, r.description, r.priority, r.status, r.created_at, r.reviewed_at,
           r.created_by, r.reviewed_by,
           u_creator.username AS created_by_username,
           u_reviewer.username AS reviewed_by_username
    FROM maintenance_requests r
    LEFT JOIN users u_creator ON r.created_by = u_creator.id
    LEFT JOIN users u_reviewer ON r.reviewed_by = u_reviewer.id
    WHERE ${whereSQL}
    ORDER BY r.created_at DESC
    LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
  `;

  const dataResult = await pool.query(querySQL, dataParams);

  return c.json({
    data: dataResult.rows,
    meta: {
      total: totalRecords,
      page,
      limit,
      total_pages: totalPages,
    },
  });
});

app.post('/api/requests', authenticate, async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON body' }, 400);

  const { asset_id, description, priority } = body;
  if (!isValidString(asset_id, 2, 50) || !isValidString(description, 5, 1000)) {
    return c.json({ error: 'asset_id (2-50 chars) and description (5-1000 chars) are required' }, 400);
  }

  const validPriorities = ['low', 'medium', 'high', 'critical'];
  const reqPriority = validPriorities.includes(priority) ? priority : 'medium';

  const result = await pool.query(
    `INSERT INTO maintenance_requests (asset_id, description, priority, status, created_by)
     VALUES ($1, $2, $3, 'Submitted', $4)
     RETURNING *`,
    [asset_id.trim(), description.trim(), reqPriority, user.id]
  );

  return c.json(result.rows[0], 201);
});

app.put('/api/requests/:id', authenticate, async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON body' }, 400);

  const { asset_id, description, priority } = body;

  const reqCheck = await pool.query('SELECT * FROM maintenance_requests WHERE id = $1', [id]);
  if (reqCheck.rowCount === 0) return c.json({ error: 'Request not found' }, 404);

  const existing = reqCheck.rows[0];

  // RBAC Enforcement: Operator/Supervisor hanya boleh edit request miliknya sendiri dan berstatus Submitted
  if (user.role !== 'admin') {
    if (existing.created_by !== user.id) {
      return c.json({ error: 'Forbidden: You can only edit your own requests' }, 403);
    }
    if (existing.status !== 'Submitted') {
      return c.json({ error: 'Forbidden: Request cannot be edited once reviewed' }, 403);
    }
  }

  const newAsset = isValidString(asset_id, 2, 50) ? asset_id.trim() : existing.asset_id;
  const newDesc = isValidString(description, 5, 1000) ? description.trim() : existing.description;
  const validPriorities = ['low', 'medium', 'high', 'critical'];
  const newPrio = validPriorities.includes(priority) ? priority : existing.priority;

  const updated = await pool.query(
    `UPDATE maintenance_requests 
     SET asset_id = $1, description = $2, priority = $3
     WHERE id = $4
     RETURNING *`,
    [newAsset, newDesc, newPrio, id]
  );

  return c.json(updated.rows[0]);
});

app.patch('/api/requests/:id/review', authenticate, requireRole(['supervisor', 'admin']), async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const body = await c.req.json().catch(() => null);
  const status = body?.status;

  if (!['Approved', 'Rejected'].includes(status)) {
    return c.json({ error: 'Status must be Approved or Rejected' }, 400);
  }

  const result = await pool.query(
    `UPDATE maintenance_requests 
     SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP
     WHERE id = $3
     RETURNING *`,
    [status, user.id, id]
  );

  if (result.rowCount === 0) return c.json({ error: 'Request not found' }, 404);
  return c.json(result.rows[0]);
});

app.delete('/api/requests/:id', authenticate, requireRole(['admin']), async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const result = await pool.query('DELETE FROM maintenance_requests WHERE id = $1 RETURNING id', [id]);
  if (result.rowCount === 0) return c.json({ error: 'Request not found' }, 404);

  return c.json({ message: 'Request deleted successfully', id });
});

// ----------------------------------------------------
// 3. ADMIN USER MANAGEMENT
// ----------------------------------------------------
app.get('/api/users', authenticate, requireRole(['admin']), async (c) => {
  const res = await pool.query('SELECT id, username, role, is_active, created_at FROM users ORDER BY id ASC');
  return c.json(res.rows);
});

app.post('/api/users', authenticate, requireRole(['admin']), async (c) => {
  const body = await c.req.json().catch(() => null);
  const { username, password, role } = body || {};

  if (!isValidString(username, 3, 30) || !isValidString(password, 6, 100)) {
    return c.json({ error: 'Valid username (3-30) and password (min 6) required' }, 400);
  }
  if (!['operator', 'supervisor', 'admin'].includes(role)) {
    return c.json({ error: 'Invalid role' }, 400);
  }

  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);

  try {
    const res = await pool.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role, is_active',
      [username.trim(), hash, role]
    );
    return c.json(res.rows[0], 201);
  } catch (err: any) {
    if (err.code === '23505') return c.json({ error: 'Username already exists' }, 409);
    return c.json({ error: 'Failed to create user' }, 500);
  }
});

app.patch('/api/users/:id/status', authenticate, requireRole(['admin']), async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'), 10);
  const body = await c.req.json().catch(() => null);
  const is_active = body?.is_active;

  if (typeof is_active !== 'boolean') return c.json({ error: 'is_active must be boolean' }, 400);
  if (id === user.id && !is_active) return c.json({ error: 'Cannot deactivate your own active session' }, 400);

  const res = await pool.query(
    'UPDATE users SET is_active = $1 WHERE id = $2 RETURNING id, username, role, is_active',
    [is_active, id]
  );
  if (res.rowCount === 0) return c.json({ error: 'User not found' }, 404);

  return c.json(res.rows[0]);
});

// Health check endpoint untuk Docker & Jenkins
app.get('/health', (c) => c.text('OK'));

const port = Number(process.env.PORT) || 4000;

serve({
  fetch: app.fetch,
  port,
}, (info) => {
  console.log(`Server Hono is running on http://localhost:${info.port}`);
});