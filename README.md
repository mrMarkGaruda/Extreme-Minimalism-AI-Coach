# Extreme Minimalism AI Coach

An encrypted coaching companion that helps people reach and sustain an extreme minimalism lifestyle (owning fewer than 50 belongings) through adaptive AI conversations, progressive reduction plans, and privacy-first data handling.

## Features at a Glance
- 🔐 **Secure vaults** – user data is AES-256-GCM encrypted with keys derived from user passwords.
- 🧠 **Context-aware AI coaching** – GPT4All runs locally, combining assessment data, emotional cues, and progress history.
- 📈 **Phase-based progression** – tracks phases from initial reduction to maintenance with tailored recommendations.
- 🧾 **GDPR-aligned controls** – export, conversation wipe, and right-to-be-forgotten endpoints exposed to the UI.
- 🗂️ **Comprehensive documentation** – security, privacy, innovation research, architecture, and development reflections.

## Project Structure

```
├── gpt4all/                # Node.js/Express backend + public front-end assets
│   ├── server.js           # API, auth, vault encryption, GPT4All orchestration
│   ├── public/             # Front-end modules (auth overlay, dashboard, chat, assessment)
│   ├── prompts/            # GPT4All prompt templates
│   └── package.json        # Backend dependencies & start script
└── docs/                   # Coursework documentation (security, privacy, innovation, etc.)
```

## Prerequisites
- **Node.js 18+** (LTS recommended)
- **npm 9+**
- **GPT4All model** placed at `gpt4all/orca-mini-3b-gguf2-q4_0.gguf`
- Optional: configure environment variables (see below)

## Environment Configuration
Create a `.env` file inside `gpt4all/` (or export variables before starting) to override defaults:

```
JWT_SECRET=replace-with-strong-secret
SESSION_SECRET=replace-with-strong-secret
PBKDF2_ITERATIONS=150000
CHAT_RATE_LIMIT=45
CHAT_RATE_WINDOW_MS=60000
ADMIN_EMAILS=teacher@example.edu
```

> By default, the first registered user (or any email listed in `ADMIN_EMAILS`) receives the `admin` role.

## Setup & Run
```powershell
cd "C:\Projects\Semester 4 project\Extreme-Minimalism-AI-Coach\gpt4all"
npm install
npm start
```

The server starts on **http://localhost:3000**. Visit `public/index.html`, `dashboard.html`, or `assessment.html` to interact with the coach (the auth overlay enforces login/registration first).

## Key Commands
```powershell
# Syntax check the backend
node --check server.js

# Regenerate documentation assets (manual scripts)
# - docs/A-innovation.docx is generated via PowerShell script (see repo history)
```

## Documentation Checklist
| Artifact | Location |
|----------|----------|
| Innovation analysis (DOCX) | `docs/A-innovation.docx` |
| Innovation research (Markdown) | `docs/innovation-research.md` |
| Privacy analysis | `docs/privacy-analysis.md` |
| Security analysis | `docs/security-analysis.md` |
| GenAI usage log | `docs/GenAI-log.docx` |
| Technical architecture | `docs/technical-architecture.md` |
| Development reflection | `docs/development-reflection.md` |
| Quick summary | `docs/quick-summary.md` |

## API Overview (Highlights)
- `POST /api/register` – Create account, derive encryption keys, bootstrap vault
- `POST /api/login` – Authenticate (JWT + session) and decrypt vault
- `GET/PUT /api/account/vault` – Retrieve or update encrypted vault content
- `DELETE /api/account` – Right-to-be-forgotten (deletes vault + user record)
- `POST /api/chat` – Context-aware AI coaching via GPT4All
- `POST /api/assessment`, `POST /api/progress` – Capture assessment data and milestones
- `GET /api/admin/progress-summary` – Admin-only aggregate analytics

See `gpt4all/server.js` and `docs/technical-architecture.md` for full route details.

## Project Management
- GitHub Project board: `https://github.com/users/mrMarkGaruda/projects/1`
- Phase issues: #3 (Privacy), #4 (Innovation), #5 (Project Organization)
- Release tags: `v0.5.0-privacy`, `v0.6.0-innovation`, `v0.7.0-organization` (final delivery tag below)

## Teacher Access
Add your instructor as a collaborator via GitHub settings (**Settings → Collaborators & teams → Add collaborator**). They require at least “Write” permissions to review the code and documentation.

## Final Release
The course-ready build is tagged as **v1.0.0** (see `git tag --list`). If you continue development, bump the tag accordingly.

## Troubleshooting
- GPT4All model missing → download the `orca-mini-3b-gguf2-q4_0.gguf` model from the GPT4All releases page and place it in `gpt4all/`.
- Login overlay stuck → clear `sessionStorage` for `minimalism_auth_token` and reload.
- Rate limit errors → adjust `CHAT_RATE_LIMIT` and `CHAT_RATE_WINDOW_MS` in env vars.

## License
ISC
