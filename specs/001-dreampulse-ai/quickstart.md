# Quickstart & Deployment Guide: DreamPulse AI

**Feature Directory**: `specs/001-dreampulse-ai`  
**Date**: 2026-08-25  

---

## 1. Prerequisites

- **Node.js**: `v20.x` or higher
- **Package Manager**: `npm` or `pnpm`
- **Database**: Supabase account (free or pro tier)
- **LLM Access**: Google Gemini API key
- **Deployment**: Heroku CLI & Vercel CLI (or GitHub integration)
- **Web3**: Somnia Shannon Testnet funds (STT from faucet)

---

## 2. Environment Variables Configuration

### 2.1 Backend (`backend/.env`)
```bash
# Server & Port
PORT=5000
NODE_ENV=development

# Supabase
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Gemini LLM (OpenAI-compatible format)
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
GEMINI_API_KEY=<your-gemini-api-key>
GEMINI_MODEL=gemini-2.5-flash

# Somnia Blockchain
SOMNIA_RPC_URL=https://dream-rpc.somnia.network
SOMNIA_CHAIN_ID=50312
OPERATOR_PRIVATE_KEY=0x<your-agent-operator-private-key>

# DreamDEX Contracts
DREAMDEX_REGISTRY_ADDRESS=0x...
```

### 2.2 Frontend (`frontend/.env`)
```bash
# Backend URLs
VITE_BACKEND_HTTP_URL=http://localhost:5000/api/v1
VITE_BACKEND_WS_URL=ws://localhost:5000/ws/telemetry

# Supabase Public Keys
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>

# Somnia Chain Configuration
VITE_SOMNIA_CHAIN_ID=50312
VITE_SOMNIA_RPC_URL=https://dream-rpc.somnia.network
```

---

## 3. Database Setup (Supabase)

1. Open your Supabase project dashboard -> **SQL Editor**.
2. Run the migration script from [data-model.md](file:///d:/DreamPulse/specs/001-dreampulse-ai/data-model.md#1-relational-database-schema-supabase-postgresql).
3. Enable Realtime on the `markets`, `orders`, `sweeps`, and `agent_logs` tables.

---

## 4. Local Development

```bash
# 1. Install Backend Dependencies & Start
cd backend
npm install
npm run dev

# 2. In a separate terminal, install Frontend Dependencies & Start
cd ../frontend
npm install
npm run dev
```
Open `http://localhost:5173` to access the DreamPulse AI Cyber-Terminal.

---

## 5. Deployment Guide

### 5.1 Backend Deployment to Heroku
1. Create Heroku App:
   ```bash
   heroku create dreampulse-backend
   ```
2. Set Environment Variables:
   ```bash
   heroku config:set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... GEMINI_BASE_URL=... GEMINI_API_KEY=... GEMINI_MODEL=... SOMNIA_RPC_URL=... OPERATOR_PRIVATE_KEY=...
   ```
3. Deploy via Git:
   ```bash
   git subtree push --prefix backend heroku main
   ```
4. Verify `Procfile`:
   ```text
   web: node dist/index.js
   worker: node dist/agents/swarm-runner.js
   ```

### 5.2 Frontend Deployment to Vercel
1. In the `frontend` directory:
   ```bash
   vercel
   ```
2. Configure Environment Variables in the Vercel Dashboard (`VITE_BACKEND_HTTP_URL`, `VITE_BACKEND_WS_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
3. Deploy to production:
   ```bash
   vercel --prod
   ```
