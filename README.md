# Factory Maintenance Log System

A modern full-stack web application designed for industrial plant maintenance tracking and ticket lifecycle management. Features Role-Based Access Control (RBAC) with granular permissions for Operators, Supervisors, and Administrators.

---

## Table of Contents
1. [Setup and Run Steps](#1-setup-and-run-steps)
   - [Option A: Running with Docker Compose (Recommended)](#option-a-running-with-docker-compose-recommended)
   - [Option B: Running Locally (Manual Development Setup)](#option-b-running-locally-manual-development-setup)
2. [Seeded Login Credentials & RBAC Matrix](#2-seeded-login-credentials--rbac-matrix)
3. [Architecture & Key Design Decisions](#3-architecture--key-design-decisions)
4. [Known Limitations & Future Considerations](#4-known-limitations--future-considerations)

---

## 1. Setup and Run Steps

### Option A: Running with Docker Compose (Recommended)

The easiest way to boot the full application stack (PostgreSQL, Backend API, and Nuxt Frontend) is using Docker Compose.

#### Prerequisites
- Docker Engine (v24.0+)
- Docker Compose (v2.20+)

#### Steps
1. Clone the repository and navigate into the project directory:
   ```bash
   git clone <repository-url>
   cd maintenance-log
   ```

2. Start all services using Docker Compose:
   ```bash
   docker compose up --build -d
   ```

3. Check container status:
   ```bash
   docker compose ps
   ```

4. Access the services:
   - **Frontend UI**: [http://localhost:3000](http://localhost:3000)
   - **Backend API**: [http://localhost:4000](http://localhost:4000)
   - **Backend Health Check**: [http://localhost:4000/health](http://localhost:4000/health)
   - **PostgreSQL Database**: `localhost:5432` (`maintenance_db`)

5. View real-time application logs:
   ```bash
   docker compose logs -f
   ```

6. Stop the services:
   ```bash
   docker compose down
   # Or to completely wipe and reset database volumes:
   docker compose down -v
   ```

---

### Option B: Running Locally (Manual Development Setup)

If you prefer to run the services bare-metal without Docker:

#### Prerequisites
- Node.js (v20+ or v22+)
- `pnpm` (v9+) or `npm`
- PostgreSQL (v16+) installed and running locally

#### 1. Setup the Database
Create the database in PostgreSQL:
```bash
psql -U postgres -c "CREATE DATABASE maintenance_db;"
```

#### 2. Setup and Run Backend
1. Open a new terminal and navigate to `backend`:
   ```bash
   cd backend
   ```
2. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
3. Update `.env` with your local database credentials if needed:
   ```env
   PORT=4000
   DATABASE_URL=postgres://postgres:pass123456@localhost:5432/maintenance_db
   JWT_SECRET=factory_super_secret_jwt_2026
   ```
4. Install dependencies and start the dev server:
   ```bash
   pnpm install
   pnpm dev
   ```
   *Note: On first startup, the backend automatically initializes database tables and seeds demo users & sample maintenance requests.*

#### 3. Setup and Run Frontend
1. Open a second terminal and navigate to `frontend`:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Start the Nuxt development server:
   ```bash
   pnpm dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 2. Seeded Login Credentials & RBAC Matrix

The system automatically provisions pre-configured evaluator accounts upon first startup. All seed accounts use the default password: **`password123`**.

| Role | Username | Password | Key Permissions & Capabilities |
| :--- | :--- | :--- | :--- |
| **Operator** | `operator1` | `password123` | - Create new maintenance requests.<br>- View **only** requests created by themselves.<br>- Edit own requests while still in `Submitted` status.<br>- Cannot review tickets or access Admin panel. |
| **Supervisor** | `supervisor1` | `password123` | - Create new maintenance requests.<br>- View **all** maintenance requests across all operators.<br>- Review requests: **Approve** or **Reject** tickets.<br>- Cannot delete requests or manage user accounts. |
| **Admin** | `admin1` | `password123` | - Full system access.<br>- View, edit, review, and delete any maintenance request.<br>- **User Management**: Create users, toggle active status, change roles (`operator`, `supervisor`, `admin`), and delete other user accounts.<br>- Protected against deleting or changing role of their own account. |

---

## 3. Architecture & Key Design Decisions

```
+-----------------------------------------------------------------------+
|                             Client Browser                            |
|       Nuxt 3/4 + Vue 3 Composition API + Tailwind CSS + Vue Router    |
+-----------------------------------+-----------------------------------+
                                    | HTTP / REST (JWT Bearer Token)
                                    v
+-----------------------------------+-----------------------------------+
|                           Backend Server                              |
|       Hono Web Framework (Node.js runtime) + @hono/node-server        |
|                                                                       |
|  - JSON Structured Logger Middleware                                  |
|  - CORS & Security Headers                                            |
|  - Authentication & Token Blacklist Check                             |
|  - Real-time DB Role Re-verification                                  |
|  - Maintenance Request CRUD + Admin User RBAC                         |
+-----------------------------------+-----------------------------------+
                                    | Connection Pool (node-postgres / pg)
                                    v
+-----------------------------------+-----------------------------------+
|                        PostgreSQL 16 Engine                           |
|  - `users` (id, username, password_hash, role, is_active)             |
|  - `maintenance_requests` (asset_id, description, status, priority)  |
|  - `revoked_tokens` (token_hash, expires_at)                          |
+-----------------------------------------------------------------------+
```

### Key Decisions:

1. **Lightweight & High-Performance Hono Framework on Node.js**:
   - Built using **Hono**, providing sub-millisecond route matching, clean middleware chaining, and native Web Standards request/response handling.

2. **Real-time Database Role Verification on Every Authenticated Request**:
   - While JWTs are stateless, the `authenticate` middleware in `backend/src/index.ts` queries the `users` table on each request (`SELECT id, username, role, is_active FROM users WHERE id = $1`).
   - **Advantage**: If an administrator changes a user's role or deactivates an account, the change takes effect immediately on the next request without waiting for the 8-hour JWT expiration.

3. **Server-Side Token Revocation (Logout Blacklist)**:
   - When users click "Logout", the frontend requests `POST /api/auth/logout`.
   - The token's SHA-256 hash is inserted into the `revoked_tokens` table.
   - The `authenticate` middleware checks this table, mitigating the standard vulnerability of stateless JWTs where stolen tokens remain valid until expiry.

4. **Preservation of Audit History on User Deletion (Transaction Safety)**:
   - In industrial maintenance, ticket history must remain preserved for safety and compliance audits even if an employee account is deleted.
   - When `DELETE /api/users/:id` executes, it wraps operations in an ACID transaction (`BEGIN` ... `COMMIT`):
     ```sql
     UPDATE maintenance_requests SET created_by = NULL WHERE created_by = $1;
     UPDATE maintenance_requests SET reviewed_by = NULL WHERE reviewed_by = $1;
     DELETE FROM users WHERE id = $1;
     ```
   - The frontend gracefully displays `"Akun Terhapus"` / `"User #[id]"` for historical tickets without broken UI state or cascading data loss.

5. **Self-Action Prevention Safeguards**:
   - Hardcoded server-side checks prohibit admins from performing destructive operations on their own active session:
     - Cannot deactivate own account (`is_active = false`).
     - Cannot change own role (`PATCH /api/users/:id/role`).
     - Cannot delete own account (`DELETE /api/users/:id`).
   - The UI automatically disables the role dropdown and replaces action buttons with `"Akun aktif saat ini"`.

6. **Server-Side Filtering, Searching, and Pagination**:
   - Search queries run through SQL (`asset_id ILIKE $1 OR description ILIKE $1`) with `LIMIT` and `OFFSET` clauses, keeping database memory usage minimal and performance fast.

---

## 4. Known Limitations & Future Considerations

1. **Token Blacklist Table Cleanup**:
   - The `revoked_tokens` table stores expired token hashes with an `expires_at` column.
   - Currently, old rows are not automatically purged. In production, a scheduled cron task or pg_cron worker (`DELETE FROM revoked_tokens WHERE expires_at < NOW()`) should be added to avoid unbounded table growth over time.

2. **Client-Side Auth Storage (`localStorage`)**:
   - The frontend stores JWTs in browser `localStorage`.
   - While standard for many single-page applications, storing tokens in `httpOnly` secure cookies with CSRF protection is recommended for enterprise environments to safeguard against cross-site scripting (XSS).

3. **Single Database Node**:
   - The current setup uses a single PostgreSQL container with standard Docker volume persistence.
   - For high availability and write-heavy telemetry scenarios, connection poolers such as **PgBouncer** and read-replicas can be added.

4. **Single-Device vs. Global Session Invalidation**:
   - Logging out invalidates only the current token. If a user is logged in on multiple browsers and one is revoked, other active tokens remain valid until either the token expires or the user account is explicitly deactivated or modified in role.
