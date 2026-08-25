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
- **Reference & Documentation Only**: The `dreamdex-bot-kit` folder and `hackathon.md` are STRICTLY read-only reference documentation. Never edit, modify, add to workspaces, or import code directly from `dreamdex-bot-kit`. Production dependencies must come strictly from official packages like `@somnia-chain/markets-sdk`.
- **No Emojis Rule**: Never use raw emojis in any frontend code or UI components. Always use React icons (e.g., `lucide-react` or `react-icons`) for clean, professional iconography.

## Verification & Quality Invariants
- **Mandatory Verification**: Always run `npm run verify` from the repository root to verify everything (typecheck, tests, and production builds) and make sure nothing is broken after you're done with a task, only run this if you feel like it's necessary, don't just run it all the time, for example just fixing the docs, don't run it, if you just did some refactoring touching some actual code, run it.
- **Autonomously Fix Errors**: If `npm run verify` reports any errors (even if it's not by your work), type mismatches, or test failures, fix the errors yourself until the entire suite passes cleanly with zero errors.
- When you're done, use Powershell to play a sound to signal completition.