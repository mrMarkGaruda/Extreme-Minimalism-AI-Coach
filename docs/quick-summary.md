# Extreme Minimalism AI Coach — Quick Summary

## Project Snapshot
- **Purpose:** Coach users toward owning fewer than 50 items via adaptive AI guidance.
- **Backend:** Node.js/Express with JWT + session auth, encrypted vault storage, GPT4All orchestration.
- **Frontend:** Minimalist interfaces for chat, assessment, and dashboard views that all subscribe to the shared Auth overlay.
- **AI Model:** GPT4All `orca-mini-3b-gguf2-q4_0.gguf`, executed locally to avoid third-party data exposure.

## Key Deliverables
- **Security:** AES-256-GCM vault encryption, PBKDF2 key derivation, rate limiting, secure session cookies (`server.js`).
- **Privacy:** Export/erase controls, conversation wiping, privacy analysis & documentation (`docs/privacy-analysis.md`).
- **Innovation:** Market research, innovation claims, technical uniqueness summary (`docs/innovation-research.md`, `docs/A-innovation.docx`).
- **Architecture:** System diagrams, API catalog, data schema (`docs/technical-architecture.md`).
- **Reflection:** Challenges, decisions, lessons, future improvements (`docs/development-reflection.md`).
- **GenAI Usage:** Prompting log for compliance (`docs/GenAI-log.docx`).

## How to Run
1. `cd gpt4all`
2. `npm install`
3. `npm start` (default port 3000)
4. Visit `http://localhost:3000` and log in via the overlay.

## API Essentials
- `/api/register`, `/api/login`, `/api/logout`
- `/api/account/vault` (GET/PUT), `/api/account` (DELETE), `/api/account/export`
- `/api/assessment`, `/api/progress`, `/api/chat`
- `/api/admin/progress-summary` (admin only)

## Release & Tracking
- GitHub Project: `https://github.com/users/mrMarkGaruda/projects/1`
- Phase issues: #3 (Privacy), #4 (Innovation), #5 (Organization)
- Tags: `v0.5.0-privacy`, `v0.6.0-innovation`, `v0.7.0-organization`, `v1.0.0`

## Next Steps
- Surface conversation deletion & account erasure controls directly in the UI.
- Migrate JSON persistence to a managed database when scaling beyond prototype.
- Expand test coverage (vault lifecycle, privacy endpoints, prompt orchestrations).
- Share documentation bundle with instructor (ensure GitHub collaborator access granted).
