<!-- SPECKIT START -->
Active Implementation Plan: [specs/001-dreampulse-ai/plan.md](file:///d:/DreamPulse/specs/001-dreampulse-ai/plan.md)
Frontend: React + Vite + TypeScript (Vercel)
Backend: Node.js + Express.js + WebSocket + TypeScript (Heroku)
Database: Supabase PostgreSQL (Realtime + RLS)
LLM: Gemini (OpenAI SDK format via GEMINI_BASE_URL, GEMINI_API_KEY, GEMINI_MODEL)
Blockchain: Somnia Shannon Testnet (Chain ID 50312), DreamDEX Event Contracts
<!-- SPECKIT END -->

## Git Branching Rules
- **Main Branch Only**: All development, specifications, plans, and implementations MUST be performed directly on the `main` branch.
- **No Feature Branches**: Never create or checkout feature branches.

## Coding Rules
- Do not use mock code, fake code or hardcode, everything must be real and production ready, unless really necessary.
- When touching UI code, make sure the design stays consistent with other parts of the website, it's recommended to use the impeccable design skill.
- For relevant docs, i suggest looking at the dreamdex-bot-kit folder and hackathon.md