import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgres://postgres:pass123456@localhost:5432/maintenancedb',
  max: 15,
  idleTimeoutMillis: 30000,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function initDB(retries = 10, delay = 2000) {
  // Retry loop untuk mencegah crash saat kontainer database sedang booting
  while (retries > 0) {
    try {
      await pool.query('SELECT 1');
      console.log('PostgreSQL connected successfully.');
      break;
    } catch (err) {
      retries -= 1;
      console.warn(`PostgreSQL connecting... (${retries} retries left)`);
      if (retries === 0) {
        console.error('Fatal: Failed to connect to PostgreSQL.');
        process.exit(1);
      }
      await sleep(delay);
    }
  }

  try {
    // 1. Tabel Users (3 Role, is_active flag)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('operator', 'supervisor', 'admin')),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Tabel Maintenance Requests + Indexes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS maintenance_requests (
        id SERIAL PRIMARY KEY,
        asset_id VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
        status VARCHAR(20) NOT NULL DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Approved', 'Rejected')),
        created_by INT REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_by INT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMP NULL
      );

      CREATE INDEX IF NOT EXISTS idx_requests_status ON maintenance_requests(status);
      CREATE INDEX IF NOT EXISTS idx_requests_priority ON maintenance_requests(priority);
      CREATE INDEX IF NOT EXISTS idx_requests_created_by ON maintenance_requests(created_by);
    `);

    // 3. Tabel Token Revocation (Logout Guard)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS revoked_tokens (
        id SERIAL PRIMARY KEY,
        token_hash VARCHAR(64) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_revoked_tokens_hash ON revoked_tokens(token_hash);
    `);

    // 4. Auto Seeding Data Siap Uji Evaluator (1 akun per role)
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(userCount.rows[0].count, 10) === 0) {
      console.log('Seeding initial data for evaluators...');
      const salt = await bcrypt.genSalt(10);
      const defaultPasswordHash = await bcrypt.hash('password123', salt);

      // Seed 3 akun role standar
      const seededUsers = await pool.query(`
        INSERT INTO users (username, password_hash, role) VALUES
        ('operator1', $1, 'operator'),
        ('supervisor1', $1, 'supervisor'),
        ('admin', $1, 'admin')
        RETURNING id, username, role;
      `, [defaultPasswordHash]);

      const opId = seededUsers.rows.find((u) => u.role === 'operator').id;
      const supId = seededUsers.rows.find((u) => u.role === 'supervisor').id;

      // Seed variasi status request (Submitted, Approved, Rejected)
      await pool.query(`
        INSERT INTO maintenance_requests (asset_id, description, priority, status, created_by, reviewed_by, reviewed_at) VALUES
        ('CNC-MILL-01', 'Spindle mengalami panas berlebih saat cycle run', 'high', 'Submitted', $1, NULL, NULL),
        ('CONVEYOR-LINE-A', 'Sensor proximity jalur keluar macet', 'medium', 'Approved', $1, $2, NOW()),
        ('BOILER-MAIN-03', 'Tekanan uap turun di bawah 3 bar secara tiba-tiba', 'critical', 'Submitted', $2, NULL, NULL),
        ('ROBOTIC-ARM-02', 'Motor joint 3 bergetar di atas threshold', 'medium', 'Submitted', $1, NULL, NULL),
        ('AIR-COMPRESSOR-1', 'Filter oli tersumbat partikel gram besi', 'low', 'Rejected', $1, $2, NOW());
      `, [opId, supId]);

      console.log('Database initialized with seed users & records.');
    }
  } catch (error) {
    console.error('Error creating database schema:', error);
  }
}