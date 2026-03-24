# MonkFlow — Web Deployment Guide

This guide walks you through deploying MonkFlow from a local development setup to a live production environment. Each step includes an explanation of *why* it matters and how the pieces connect, so you understand the full picture — not just the commands.

---

## Architecture Overview

MonkFlow is a two-tier web application:

```
┌─────────────────────┐        ┌─────────────────────┐        ┌──────────────┐
│   Frontend (Vercel)  │──API──▶│  Backend (Railway)   │──SQL──▶│  PostgreSQL   │
│  index.html, app.js  │  calls │  Express + Node.js   │        │  (Railway)    │
│  styles.css, logo.svg│◀─JSON──│  16 dependencies     │◀───────│  10 tables    │
└─────────────────────┘        └─────────────────────┘        └──────────────┘
                                        │
                                        ├──▶ Anthropic API (AI agent execution)
                                        └──▶ Resend API (transactional email)
```

The **frontend** is a static single-page application — plain HTML, CSS, and vanilla JavaScript. There is no build step, no bundler, no framework. Vercel serves these files as-is and proxies any `/api/*` requests to your backend.

The **backend** is a Node.js/Express REST API. It handles authentication (JWT-based), workflow management, AI agent orchestration, email delivery, and all database operations. It connects to PostgreSQL for persistent storage.

This separation means you can deploy, scale, and debug each layer independently.

---

## Step 1 — Install Node.js

### What Node.js is and why you need it

Node.js is a JavaScript runtime that lets you run JavaScript outside of a web browser. Your backend server is written in JavaScript, so Node.js is what actually executes it. npm (Node Package Manager) comes bundled with Node.js and handles installing the libraries your backend depends on.

### What to do

Go to [nodejs.org](https://nodejs.org) and download the **LTS** (Long Term Support) version, which should be v20 or higher. LTS means it receives security patches and bug fixes for years — production servers should always run LTS, not the "Current" release which may have unstable features.

After installation, verify both tools are available:

```bash
node --version   # should show v20.x.x or higher
npm --version    # should show 10.x.x or higher
```

If either command isn't found, your system PATH wasn't updated during installation. On macOS, closing and reopening your terminal usually fixes this. On Windows, you may need to restart your computer.

---

## Step 2 — Install Backend Dependencies

### What dependencies are

Your backend doesn't exist in isolation — it relies on 16 external packages (libraries) that provide functionality you'd otherwise have to write from scratch. These are listed in `server/package.json` under `"dependencies"`. Here's what each one does:

| Package | Purpose |
|---------|---------|
| **express** | The web framework — handles HTTP routing, request parsing, response sending |
| **pg** | PostgreSQL client — lets Node.js talk to your database |
| **bcryptjs** | Password hashing — converts plain-text passwords into irreversible hashes |
| **jsonwebtoken** | JWT creation/verification — the mechanism for stateless authentication |
| **zod** | Input validation — ensures API requests contain the right data shapes |
| **helmet** | Security headers — automatically sets HTTP headers that prevent common attacks |
| **cors** | Cross-Origin Resource Sharing — controls which domains can call your API |
| **morgan** | HTTP logging — prints every incoming request to the console for debugging |
| **express-rate-limit** | Throttling — prevents abuse by limiting requests per IP address |
| **dotenv** | Environment config — loads `.env` file values into `process.env` |
| **node-cron** | Scheduled tasks — runs workflow jobs on recurring schedules |
| **@anthropic-ai/sdk** | Anthropic's official SDK — sends prompts to Claude and receives responses |
| **resend** | Email delivery SDK — sends transactional emails (notifications, password resets) |
| **pino** | Structured logging — high-performance JSON logging for production |
| **uuid** | Unique IDs — generates universally unique identifiers for database records |
| **expr-eval** | Expression parser — safely evaluates mathematical/logical expressions in workflows |

### What to do

```bash
cd /Users/nathanlinder/Desktop/MonkFlowUI/server
npm install
```

This reads `package.json`, downloads every package (and all their sub-dependencies) into a `node_modules/` folder, and creates a `package-lock.json` that locks exact versions. The lock file ensures that every machine running `npm install` gets identical dependency trees — critical for reproducibility.

---

## Step 3 — Set Up PostgreSQL

### Why PostgreSQL

PostgreSQL (often called "Postgres") is a relational database. It stores all of MonkFlow's persistent data — user accounts, workflows, agents, execution logs, team memberships, and more — in structured tables with enforced relationships between them. Unlike a file or in-memory store, Postgres survives server restarts, handles concurrent access safely, and supports complex queries.

MonkFlow uses 10 tables (one per migration file in `server/migrations/`), and they reference each other through foreign keys. For example, a workflow belongs to a user, and an execution log belongs to a workflow. Postgres enforces these relationships so you can't accidentally create orphaned records.

### Option A — Local PostgreSQL (for development)

A local database is ideal for development because it's fast (no network latency), free, and you can wipe and recreate it instantly.

**Postgres.app** is the simplest option on macOS — it's a self-contained application that runs a full Postgres server with zero configuration:

1. Download from [postgresapp.com](https://postgresapp.com)
2. Open the app and click "Start"
3. Create your database:

```bash
psql postgres -c "CREATE DATABASE monkflow;"
```

This creates an empty database called `monkflow`. Your connection string will be:

```
postgresql://localhost:5432/monkflow
```

Note there's no username or password here — local Postgres on macOS trusts connections from `localhost` by default (this is called "peer authentication"). This is fine for development but would never be acceptable in production.

### Option B — Railway PostgreSQL (for production, or if you want to skip local setup)

Railway is a cloud platform that gives you a fully managed Postgres instance. "Managed" means Railway handles backups, security patches, connection pooling, and uptime — you just use it.

1. Sign up at [railway.app](https://railway.app)
2. Create a new project
3. Click "Add Service" → PostgreSQL
4. Railway provisions a database and gives you a connection string:

```
postgresql://postgres:PASSWORD@HOST:PORT/railway
```

This string encodes everything the `pg` library needs to connect: the username (`postgres`), password, host address, port number, and database name. You'll paste this into your `.env` file next.

**Why not just use local Postgres in production?** Because your laptop turns off, restarts, and isn't accessible from the internet. A cloud database runs 24/7 on infrastructure designed for reliability.

---

## Step 4 — Configure Environment Variables

### What environment variables are and why they matter

Environment variables are key-value pairs that configure your application *without being written into your source code*. This separation is critical for two reasons:

1. **Security** — secrets like database passwords, API keys, and JWT signing keys should never appear in code that gets committed to Git. If your repo is ever public (or breached), those secrets are exposed.

2. **Flexibility** — the same codebase runs in development and production with different configurations. Your local database URL differs from Railway's, your CORS origin changes from `localhost` to your real domain, etc.

The `dotenv` package reads a file called `.env` in your server directory and loads each line as a `process.env.SOMETHING` value. The application's `config/env.js` file then reads these and makes them available throughout the codebase.

### What to do

```bash
cd /Users/nathanlinder/Desktop/MonkFlowUI/server
cp .env.example .env
```

Open `.env` in a text editor and fill it in:

```env
NODE_ENV=development
PORT=8080

# Database connection (paste your Railway URL or local one)
DATABASE_URL=postgresql://postgres:password@localhost:5432/monkflow

# JWT signing secret — MUST be random, MUST be kept secret
JWT_SECRET=paste-64-char-hex-here

# Token lifetimes
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=30

# Which domain can call the API (prevents other sites from making requests)
CORS_ORIGIN=http://localhost:3000

# Email — leave blank to use console logging in dev
RESEND_API_KEY=

# AI — leave blank for mock responses in dev
ANTHROPIC_API_KEY=

FRONTEND_URL=http://localhost:3000
```

### Understanding the key values

**DATABASE_URL** — a standard connection string format. The `pg` library parses this to know where and how to connect: `protocol://user:password@host:port/database`.

**JWT_SECRET** — this is the cryptographic key used to sign and verify JSON Web Tokens. JWTs are how MonkFlow's authentication works: when a user logs in, the server creates a token signed with this secret. On every subsequent request, the server verifies the token's signature. If anyone changes the token or guesses the secret, they could forge authentication. That's why it must be long, random, and never shared.

Generate one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

This produces 64 hex characters (256 bits of entropy) — effectively unguessable.

**JWT_EXPIRES_IN** — access tokens expire after 15 minutes by default. This limits the damage if a token is intercepted. The companion **REFRESH_TOKEN_EXPIRES_DAYS** (30 days) controls how long a user stays "remembered" — the frontend silently refreshes expired access tokens using a longer-lived refresh token stored in the database.

**CORS_ORIGIN** — Cross-Origin Resource Sharing is a browser security mechanism. When your frontend at `localhost:3000` makes an API call to `localhost:8080`, the browser considers this a "cross-origin" request (different ports = different origins). The server must explicitly list which origins are allowed. In production, this will be your Vercel domain.

**RESEND_API_KEY** and **ANTHROPIC_API_KEY** — when blank, the backend falls back to safe development behavior: emails are logged to the console instead of sent, and AI agent calls return mock responses. This means you can develop and test the full application flow without paying for API usage.

---

## Step 5 — Run Migrations and Seed Data

### What migrations are

Migrations are versioned SQL scripts that build your database schema incrementally. Instead of one giant SQL file that creates everything at once, migrations apply changes one at a time in order: `001-users.sql` creates the users table, `002-teams.sql` creates the teams table (which references users), and so on through all 10 files.

The migration runner (`server/migrations/migrate.js`) also creates a `_migrations` tracking table that records which migrations have already been applied. This is what makes migrations safe to re-run — if you run `npm run migrate` twice, it won't try to create tables that already exist. It only applies new, unapplied migrations.

This pattern matters because as your application evolves, you'll add new migrations (say, `011-audit-log.sql`) and run the migrator again. It will skip 001 through 010 and only apply 011.

### What seeding is

Seeding populates the database with initial data so you have something to work with immediately. The seed script creates a demo user account, sample workflows, sample agents, notifications, and team data. Think of it as "lorem ipsum" for your database — meaningful enough to test with, disposable enough to delete later.

### What to do

```bash
cd /Users/nathanlinder/Desktop/MonkFlowUI/server

# Apply all 10 migration files to create the database schema
npm run migrate

# Insert demo data
npm run seed
```

You should see output confirming each migration was applied:

```
✔ 001-users.sql applied
✔ 002-teams.sql applied
✔ 003-workflows.sql applied
✔ 004-agents.sql applied
✔ 005-appointments.sql applied
✔ 006-notifications.sql applied
✔ 007-api-keys.sql applied
✔ 008-execution-logs.sql applied
✔ 009-refresh-tokens.sql applied
✔ 010-contact-messages.sql applied
Migrations complete. 10 new migration(s) applied.
```

And seeding output:

```
Seeding database...
  User: demo@monkflow.io (password: demo1234)
  6 workflows created
  6 agents created
```

Save those demo credentials — you'll use them to test login in the next step.

---

## Step 6 — Start the Backend Locally

### What happens when the server starts

When you run the start command, Node.js executes `src/index.js`, which does four things in sequence:

1. **Loads configuration** — reads `.env` values through `config/env.js` and validates that required variables exist (in production mode, it will throw an error if `DATABASE_URL` or `JWT_SECRET` is missing).

2. **Builds the Express app** — `src/app.js` assembles the middleware stack (Helmet for security headers, CORS for cross-origin control, Morgan for request logging, rate limiter for throttling) and mounts all 12 route groups under `/api/v1/`.

3. **Starts listening** — the HTTP server binds to the configured port (default 8080) and begins accepting connections.

4. **Registers shutdown handlers** — `SIGTERM` and `SIGINT` signals (sent when you press Ctrl+C or when a cloud platform wants to stop the process) trigger a graceful shutdown: the server stops accepting new connections, drains existing ones, closes the database pool, and stops any cron jobs.

### What to do

```bash
npm run dev
```

This uses `nodemon` (a development tool) instead of plain `node`. Nodemon watches your source files and automatically restarts the server when you make changes — essential for development.

You should see:

```
MonkFlow API running on port 8080 [development]
```

### Verify it works

Test the health endpoint (a simple "is the server alive?" check that doesn't require authentication):

```bash
curl http://localhost:8080/api/v1/health
# → {"status":"ok","timestamp":"..."}
```

Test authentication with the seeded demo account:

```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@monkflow.io","password":"demo1234"}'
```

This should return a JSON object containing the user profile, an access token (a JWT), and a refresh token. The access token is what you'd include as a `Bearer` token in the `Authorization` header of subsequent requests.

---

## Step 7 — Connect Frontend to Local Backend

### Understanding the proxy problem

Your frontend and backend run on different ports during development: the frontend on port 3000 (or wherever you serve `index.html`), the backend on port 8080. The frontend's JavaScript makes API calls to paths like `/api/v1/auth/login`.

In production, Vercel's `vercel.json` rewrites handle this — any request to `/api/*` is transparently forwarded to your Railway backend URL. But locally, there's no Vercel in the middle. When `app.js` tries to fetch `/api/v1/health`, the browser sends that request to the same origin serving the HTML, which doesn't have an API.

### The simplest local solution

Temporarily change the API base URL in the frontend's `app.js` to point directly at your local backend:

```js
// Near the top of app.js — change for local testing:
const API_BASE = 'http://localhost:8080/api/v1';
```

This makes every `fetch()` call go directly to `localhost:8080` instead of using a relative path. The CORS configuration you set in `.env` (`CORS_ORIGIN=http://localhost:3000`) explicitly permits this cross-origin communication.

**Important:** revert this change before deploying. In production, the frontend should use relative paths (`/api/v1/...`) so that Vercel's rewrite rules handle the routing. You can also use a pattern like this for a more permanent solution:

```js
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8080/api/v1'
  : '/api/v1';
```

This automatically uses the direct URL in development and relative paths in production.

---

## Step 8 — Get Real API Keys (Optional but Recommended)

### Why these services exist

MonkFlow's two external integrations — Anthropic and Resend — are optional during development but essential for a production deployment.

### Anthropic (AI Agent Execution)

MonkFlow's AI agents use Claude to process natural language, make decisions, and execute workflow steps. Without an API key, the `agent.executor.js` service returns mock responses — useful for testing the UI and workflow logic, but the agents won't actually "think."

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an account and generate an API key
3. Add to `.env`: `ANTHROPIC_API_KEY=sk-ant-...`

Anthropic charges per token (input and output). During development, usage is typically minimal — a few cents per day of active testing. In production, costs depend on how many agents your users run and how complex the prompts are.

### Resend (Transactional Email)

Resend handles sending emails — password reset links, workflow notifications, team invitations. Without an API key, the `email.service.js` logs email content to the console (so you can see what *would* have been sent).

1. Go to [resend.com](https://resend.com) and sign up (free tier: 3,000 emails/month)
2. Create an API key
3. Add to `.env`: `RESEND_API_KEY=re_...`
4. Either verify your own sending domain or use their sandbox domain for testing
5. Update `EMAIL_FROM=noreply@yourdomain.com` to match your verified domain

**Why not just use Gmail's SMTP?** Services like Resend handle deliverability (SPF, DKIM, DMARC records), bounce handling, and rate limiting — things that are surprisingly complex to do correctly with raw SMTP. They also provide delivery analytics.

---

## Step 9 — Deploy Backend to Railway

### What "deploying" means

Deploying means taking your local code and running it on a remote server that's accessible from the internet 24/7. Railway is a Platform-as-a-Service (PaaS) — you give it your code and configuration, and it handles provisioning servers, installing dependencies, starting your process, restarting it if it crashes, providing a public URL, and managing SSL certificates.

### How Railway builds your app

When you connect a GitHub repository, Railway detects it's a Node.js project (via `package.json`), runs `npm install` to install dependencies, and then runs your configured start command (`npm start`, which executes `node src/index.js`). Every time you push to your connected branch, Railway automatically rebuilds and redeploys.

### What to do

1. Push your `MonkFlowUI/` directory to GitHub if it isn't already
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
3. Select your repository
4. Set the **root directory** to `server/` — this tells Railway to look for `package.json` inside the `server` folder, not the project root
5. Set the **start command** to `npm start`
6. Add environment variables in Railway's dashboard. These are the same variables from your `.env`, but with production values:

| Variable | Production Value |
|----------|-----------------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Click your Postgres service in Railway → copy the connection string |
| `JWT_SECRET` | Generate a fresh one — do not reuse your development secret |
| `CORS_ORIGIN` | `https://your-vercel-domain.vercel.app` (update after Step 11) |
| `FRONTEND_URL` | `https://your-vercel-domain.vercel.app` |
| `ANTHROPIC_API_KEY` | Your production key |
| `RESEND_API_KEY` | Your production key |
| `EMAIL_FROM` | `noreply@yourdomain.com` |

### Why a separate JWT_SECRET for production

If your development secret leaked (through a Git commit, shared `.env` file, etc.), an attacker could forge tokens for your production system. Using a separate secret means your production environment is compartmentalized from development.

### Run migrations on Railway

Your production database is empty — it needs the same schema your local database has. In Railway's dashboard, find your server service and open the Shell tab, then run:

```bash
npm run migrate
npm run seed
```

The seed step is optional in production — you might prefer to create real user accounts instead of demo data.

Railway assigns a public URL like `https://monkflow-api.up.railway.app`. Save this — you need it for the next step.

---

## Step 10 — Update Vercel Proxy Config

### What the rewrite rule does

Vercel serves your static frontend files (HTML, CSS, JS). But when the browser requests `/api/v1/health`, Vercel doesn't have an API — it only has static files. The rewrite rule in `vercel.json` intercepts any request matching `/api/*` and forwards it to your Railway backend, then returns Railway's response to the browser.

From the browser's perspective, it looks like the API lives on the same domain as the frontend. This avoids CORS issues entirely in production and simplifies the frontend code (it can use relative paths like `/api/v1/...`).

### What to do

Open `vercel.json` in the project root and ensure it points to your Railway URL:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://monkflow-api.up.railway.app/api/:path*"
    }
  ]
}
```

Replace `monkflow-api.up.railway.app` with whatever URL Railway assigned to your backend service.

The `:path*` syntax is a wildcard — it captures everything after `/api/` and appends it to the destination. So `/api/v1/auth/login` becomes `https://monkflow-api.up.railway.app/api/v1/auth/login`.

---

## Step 11 — Deploy Frontend to Vercel

### Why Vercel for the frontend

Vercel is optimized for static sites and frontend frameworks. For MonkFlow's static frontend (no build step, no SSR), Vercel simply distributes your files across a global CDN (Content Delivery Network). This means a user in Tokyo and a user in New York both load your site from a server geographically close to them — resulting in fast load times everywhere.

Vercel also provides: automatic HTTPS (via Let's Encrypt), preview deployments for pull requests, instant rollbacks, and the rewrite rules that proxy your API.

### What to do

1. Go to [vercel.com](https://vercel.com) → New Project → Import your GitHub repository
2. Set the **root directory** to `/` (the project root, which contains `index.html`, `app.js`, etc.)
3. **Framework preset**: select "Other" — there's no framework to detect
4. **Build command**: leave empty (nothing to build)
5. **Output directory**: leave as default
6. Click Deploy

Vercel gives you a URL like `https://your-project.vercel.app`. This is your live site.

### Update Railway to know about the frontend

Now that you have your Vercel domain, go back to Railway and update two environment variables:

```
CORS_ORIGIN=https://your-project.vercel.app
FRONTEND_URL=https://your-project.vercel.app
```

`CORS_ORIGIN` ensures the backend accepts requests from your frontend's domain. `FRONTEND_URL` is used by the backend for things like password reset links — the email needs to link back to your frontend, not to `localhost`.

Railway will automatically redeploy when you change environment variables.

---

## Step 12 — Custom Domain (Optional)

### What a custom domain does

By default your site lives at `your-project.vercel.app`. A custom domain (like `monkflow.io`) gives you a branded, memorable URL. Behind the scenes, it means configuring DNS records to point your domain to Vercel's servers.

### What to do

1. In Vercel → your project → Settings → Domains
2. Add your domain (e.g., `monkflow.io`)
3. Vercel shows you DNS records to add at your registrar (wherever you bought the domain)
4. Typically you'll add an `A` record pointing to Vercel's IP, or a `CNAME` record pointing to `cname.vercel-dns.com`
5. Propagation usually takes 5–15 minutes

After the domain is live, update Railway's `CORS_ORIGIN` and `FRONTEND_URL` to use the custom domain instead of the `.vercel.app` URL.

---

## Quick Cost Reference

| Service | Cost | What it provides |
|---------|------|-----------------|
| Railway | ~$5/mo | Backend API server + managed PostgreSQL |
| Vercel | Free | Static frontend hosting + CDN + SSL + rewrites |
| Resend | Free (3k emails/mo) | Transactional email delivery |
| Anthropic | Pay per token | Claude AI for agent execution |

---

## Deployment Verification Checklist

Work through these in order. Each step depends on the previous one succeeding:

1. **Migrations succeed** — `npm run migrate` completes without errors, confirming your database is reachable and the schema is valid.

2. **Server starts** — `npm run dev` prints the startup message without crashing, confirming all dependencies are installed and configuration is loaded.

3. **Health check passes** — `curl /api/v1/health` returns `{"status":"ok"}`, confirming the server is accepting HTTP requests and responding.

4. **Authentication works** — Logging in with `demo@monkflow.io` / `demo1234` returns a token, confirming the database has seeded data, password hashing is working, and JWT signing is configured.

5. **Frontend reaches API** — The frontend can call `/api/v1/health` and get a response, confirming the proxy (Vercel rewrites or local proxy) is routing correctly.

6. **UI login works** — Signing in from the browser navigates to the dashboard, confirming the full authentication flow (frontend → proxy → backend → database → JWT → frontend) is functional.

7. **Railway stays green** — Your deployed backend on Railway starts and remains running, confirming production environment variables are correct and the database is accessible.

8. **Vercel goes live** — Your frontend is accessible at the Vercel domain and can communicate with the Railway backend, confirming the full production stack is operational.
