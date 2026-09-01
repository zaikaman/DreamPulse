# 🚀 DreamPulse Production Deployment Guide

This guide provides end-to-end instructions for deploying **DreamPulse** to production:
- **Backend (Daemon, REST API, WebSocket & Swarm Engine)**: Deployed on **Heroku**
- **Frontend (Vite + React + Three.js UI Dashboard)**: Deployed on **Vercel**
- **Database & Realtime Subscriptions**: Hosted on **Supabase**
- **Blockchain Execution**: Somnia Shannon Testnet (Chain ID `50312`)

---

## 🏗️ Architecture Overview

```
[ User Browser ]
       │
       ├── HTTPS ──────► [ Vercel: React Frontend ]
       │
       ├── HTTPS REST ──► [ Heroku Dyno: Express API ] ──► [ Supabase DB / Realtime ]
       │                                                      │
       └── WSS Stream ──► [ Heroku Dyno: WS Server ]          ▼
                                  │                  [ Somnia Shannon RPC / Contracts ]
                                  └── Multi-Agent Swarm
                                      (Volt, Oracle, Titan, Sweeper)
```

---

## 🟢 Part 1: Deploying Backend to Heroku

The backend runs an Express HTTP server, WebSocket telemetry stream, and autonomous multi-agent quantitative swarm engine.

### Method A: Heroku Dashboard (Recommended)

1. **Log in to Heroku**: Go to [dashboard.heroku.com](https://dashboard.heroku.com).
2. **Create New App**:
   - Click **New** > **Create new app**.
   - App name: `dreampulse-backend` (or your preferred unique name).
   - Region: `United States` or `Europe`.
3. **Connect to GitHub**:
   - In the **Deploy** tab, select **GitHub** under Deployment method.
   - Search for and connect your repository: `DreamPulse`.
4. **Configure Environment Variables (Config Vars)**:
   - Navigate to **Settings** > **Config Vars** > Click **Reveal Config Vars**.
   - Enter the following variables:

| Key | Example Value | Description |
|---|---|---|
| `NODE_ENV` | `production` | Production environment mode |
| `NPM_CONFIG_PRODUCTION` | `false` | Ensures `typescript` compiles during `heroku-postbuild` |
| `FRONTEND_ORIGIN` | `*` (or `https://dreampulse-ai.vercel.app`) | Allowed CORS origin(s) for frontend dashboard |
| `SUPABASE_URL` | `https://<your-project>.supabase.co` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOi...` | Supabase Service Role Key (Backend writes & RLS bypass) |
| `SUPABASE_ANON_KEY` | `eyJhbGciOi...` | Supabase Anon Key (Public discovery reads) |
| `SUPABASE_JWT_SECRET` | `your-supabase-jwt-secret` | Supabase JWT Secret (Dashboard > Settings > API > JWT Secret, HS256) — required for wallet EIP-712 auth and minting user JWTs for Supabase Realtime RLS subscriptions |
| `SUPABASE_JWT_EXPIRY_SECONDS` | `86400` | (Optional) Supabase wallet-JWT lifetime in seconds (default: 86400 = 24h) |
| `OPERATOR_PRIVATE_KEY` | `0x...` | Somnia Operator Wallet Private Key (Funded with STT) |
| `OPERATOR_ADMIN_SECRET` | `your-secure-secret-token` | Secret for protected admin management endpoints |
| `GROQ_API_KEY` | `gsk_...` | Primary Groq LLM API Key (Fast 27B inference) |
| `GROQ_API_KEY_2` | `gsk_...` | (Optional) Secondary Groq key for round-robin pool |
| `GEMINI_API_KEY` | `AIzaSy...` | (Optional) Google Gemini API Key for backup reasoning |
| `NETWORK` | `testnet` | Target network |
| `SOMNIA_RPC_URL` | `https://dream-rpc.somnia.network` | Somnia Shannon Testnet RPC |
| `SOMNIA_WS_URL` | `wss://api.infra.testnet.somnia.network/ws` | Somnia Shannon WebSocket RPC |
| `INDEXER_URL` | `https://dev.smk.somnia.host/v1/graphql` | DreamDEX Subgraph / Indexer |
| `SOMNIA_CHAIN_ID` | `50312` | Shannon Testnet Chain ID |
| `DREAMDEX_REGISTRY_ADDRESS` | `0x3ecC694Cef705358864a646142ac17A90E29e388` | DreamDEX Registry Contract |
| `OPERATOR_PERMISSIONS_REGISTRY_ADDRESS` | `0x15C7e8CE38F021c5b45d098AaD788f63090bF20A` | Operator Permissions Registry |
| `DREAMDEX_VENUE_ID` | `0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c` | DreamDEX Venue ID |

5. **Deploy Branch**:
   - In the **Deploy** tab, choose the `main` branch.
   - Click **Deploy Branch** (or enable **Automatic Deploys** from `main`).
6. **Ensure Dyno is Active**:
   - In the **Resources** tab, verify that `web: node backend/dist/index.js` is turned ON (1 Dyno).

---

### Method B: Heroku CLI

```bash
# 1. Log in to Heroku CLI
heroku login

# 2. Create the Heroku app
heroku create dreampulse-backend

# 3. Set Buildpack
heroku buildpacks:set heroku/nodejs

# 4. Set Environment Config Vars
heroku config:set NODE_ENV=production
heroku config:set NPM_CONFIG_PRODUCTION=false
heroku config:set SUPABASE_URL=https://<your-project>.supabase.co
heroku config:set SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
heroku config:set SUPABASE_ANON_KEY=<your-anon-key>
heroku config:set SUPABASE_JWT_SECRET=<your-supabase-jwt-secret>
heroku config:set SUPABASE_JWT_EXPIRY_SECONDS=86400
heroku config:set OPERATOR_PRIVATE_KEY=0x<your-private-key>
heroku config:set OPERATOR_ADMIN_SECRET=<your-admin-secret>
heroku config:set GROQ_API_KEY=gsk_<your-groq-key>
heroku config:set SOMNIA_RPC_URL=https://dream-rpc.somnia.network
heroku config:set INDEXER_URL=https://dev.smk.somnia.host/v1/graphql
heroku config:set SOMNIA_CHAIN_ID=50312

# 5. Push code to Heroku
git push heroku main

# 6. Scale web dyno
heroku ps:scale web=1

# 7. Check runtime logs
heroku logs --tail
```

### ✅ Backend Verification
Once deployed, open your backend URL in browser or terminal:
```bash
curl https://dreampulse-backend.herokuapp.com/api/health
```
Expected response:
```json
{
  "status": "ok",
  "service": "DreamPulse Engine",
  "version": "1.0.0",
  "timestamp": "..."
}
```

---

## ⚡ Part 2: Deploying Frontend to Vercel

The frontend is a high-performance React + Vite single-page application configured with client-side routing rewrites and security headers.

### Method A: Vercel Dashboard (Recommended)

1. **Log in to Vercel**: Visit [vercel.com](https://vercel.com) and click **Add New...** > **Project**.
2. **Import Repository**: Select your GitHub repository (`DreamPulse`).
3. **Configure Project Settings**:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Select `frontend` (or click *Edit* and select `frontend`).
     *(Note: If left as root `./`, the root `vercel.json` will automatically execute `npm run build:frontend` and target `frontend/dist`).*
   - **Build Command**: `npm run build` (or default)
   - **Output Directory**: `dist` (or default)
4. **Configure Environment Variables**:
   In the **Environment Variables** section, add the following:

| Variable Name | Value | Description |
|---|---|---|
| `VITE_BACKEND_HTTP_URL` | `https://dreampulse-backend.herokuapp.com/api/v1` | Heroku Backend API URL |
| `VITE_BACKEND_WS_URL` | `wss://dreampulse-backend.herokuapp.com/ws/telemetry` | Heroku WebSocket Stream |
| `VITE_SUPABASE_URL` | `https://<your-project>.supabase.co` | Supabase URL (same as backend) |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOi...` | Supabase Public Anon Key |
| `VITE_SOMNIA_CHAIN_ID` | `50312` | Somnia Shannon Testnet Chain ID |
| `VITE_SOMNIA_RPC_URL` | `https://dream-rpc.somnia.network` | Somnia Shannon RPC URL |
| `VITE_SOMNIA_EXPLORER_URL` | `https://shannon-explorer.somnia.network` | Somnia Block Explorer |

5. **Deploy**:
   - Click **Deploy**. Vercel will build and assign your production domain (e.g., `https://dreampulse.vercel.app`).

---

### Method B: Vercel CLI

```bash
# 1. Install / Run Vercel CLI from project root
cd frontend
npx vercel

# Follow the interactive prompts:
# ? Set up and deploy "~/DreamPulse/frontend"? [Y/n] y
# ? Which scope do you want to deploy to? <your-team-or-account>
# ? Link to existing project? [y/N] n
# ? What's your project's name? dreampulse-frontend
# ? In which directory is your code located? ./
# ? Want to modify these settings? [y/N] n

# 2. Add Environment Variables via CLI:
npx vercel env add VITE_BACKEND_HTTP_URL production
npx vercel env add VITE_BACKEND_WS_URL production
npx vercel env add VITE_SUPABASE_URL production
npx vercel env add VITE_SUPABASE_ANON_KEY production

# 3. Deploy to Production:
npx vercel --prod
```

---

## 🔄 Part 3: Connecting Frontend to Backend & WebSocket

The frontend client is engineered to automatically handle URLs resiliently:
- If you enter `https://dreampulse-backend.herokuapp.com` for `VITE_BACKEND_HTTP_URL`, it automatically resolves `/api/v1` without double-slash issues.
- If `VITE_BACKEND_WS_URL` is omitted, the frontend automatically derives the WebSocket stream from `VITE_BACKEND_HTTP_URL` by transforming `https://` to `wss://` and targeting `/ws/telemetry`.
- All CORS origins are allowed by the backend Express server, enabling smooth communication from `https://*.vercel.app` or custom domains.

---

## 🔍 Part 4: Post-Deployment Verification Checklist

1. **Backend Health Check**:
   ```bash
   curl https://<your-heroku-app>.herokuapp.com/api/health
   curl https://<your-heroku-app>.herokuapp.com/api/v1/markets
   ```
2. **WebSocket Telemetry Stream**:
   Open browser DevTools on your Vercel URL (`https://<your-app>.vercel.app`) > Network tab > Filter by **WS**.
   - Confirm connection to `wss://<your-heroku-app>.herokuapp.com/ws/telemetry` with status `101 Switching Protocols`.
   - You should see real-time market ticks, order book depth updates, and agent thought streams flowing.
3. **Database Connectivity**:
   - Check the **Overview** dashboard in your frontend; verify that 24h volume, active markets, and live agent cards display without errors.
4. **Session Delegation & Trading**:
   - Connect a Web3 wallet (MetaMask / Rabby) switched to **Somnia Shannon Testnet** (`Chain ID: 50312`).
   - Open **Session Key Management** to authorize non-custodial agent trading guardrails.

---

## 🛠️ Troubleshooting

- **Heroku Dyno crashes on startup (`Error R10 Boot timeout`)**:
  Ensure `PORT` is not hardcoded and the server listens on `0.0.0.0`. DreamPulse already handles dynamic `PORT` coercion and binds to `0.0.0.0`.
- **TypeScript build error on Heroku (`tsc: not found`)**:
  Make sure `NPM_CONFIG_PRODUCTION=false` is set in Heroku Config Vars so devDependencies are available during build. `typescript` is also included directly in `dependencies` for maximum reliability.
- **WebSocket fails to connect (`403 / Connection Refused`)**:
  Verify the protocol is `wss://` (secure WebSocket) on production URLs. Vercel runs exclusively on HTTPS, requiring `wss://`.
- **Supabase Realtime not receiving events**:
  Run migration `supabase/migrations/015_enable_supabase_realtime.sql` (or ensure `backend/src/config/schema.sql` Section 12 was executed). You can also verify that Realtime is enabled for tables in the Supabase Dashboard (`Database` > `Replication`).