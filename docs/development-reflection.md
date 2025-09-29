# Development Reflection

## Challenges & Solutions
- **Secure vault architecture** – Storing encrypted coaching data locally required PBKDF2-derived AES keys and careful session handling. We introduced helper utilities to load, save, and recover vaults per request, falling back to default templates if decryption fails.
- **Front-end migration to authenticated overlay** – Replacing legacy `localStorage` logic with `Auth` event streams introduced race conditions between module boot order and login prompts. Solution: load `auth.js` first, expose `Auth.ensureReady`, and refactor modules to react to `vault:updated` broadcasts.
- **Conversation context management** – GPT4All prompts ballooned when carrying entire history. Implemented `updateSessionContext` to keep a single summarized exchange, balancing personalization and latency.
- **Privacy controls** – Adding right-to-be-forgotten and selective conversation deletion needed new backend helpers and front-end affordances without breaking vault integrity. Resolved by factoring `removeUserById`, `deleteUserVaultFile`, and state reset routines.

## Key Technical Decisions
- **Local-first AI** – GPT4All chosen to keep personal data on device, avoiding cloud transfer risks and simplifying compliance.
- **JSON persistence** – Lightweight storage (users/vaults directories) deemed sufficient for prototype; encrypted vaults mitigate plaintext exposure, with a migration path to databases when scaling.
- **Event-driven UI** – Central `Auth` module dispatching DOM events allowed decoupled dashboards/assessment/chat modules while enforcing authentication gates.
- **Role-based access middleware** – `authorizeRoles` provides granular admin gating without duplicating logic across routes.

## Time Management Insights
- Sequenced work in security → privacy → innovation documentation to reduce rework (each phase built on prior deliverables).
- Batched frontend refactors (auth overlay, vault syncing) before introducing privacy endpoints to avoid double integration cycles.
- Documentation milestones scheduled after major feature completions, ensuring accurate retroactive capture rather than speculative plans.

## Learning Outcomes
- Implementing encrypted per-user vaults in Node reinforced the importance of key lifecycle management and session hygiene.
- Designing adaptive coaching prompts highlighted the need for emotionally intelligent fallbacks and crisis detection heuristics.
- Coordinating docs with code changes proved vital for stakeholder trust and audit readiness.

## Future Improvements
- **Database upgrade**: Move users/vaults into a structured store with migration scripts and automated backups.
- **UI controls**: Surface conversation deletion/account erasure in the dashboard with confirmation flows and analytics opt-ins.
- **Testing coverage**: Add unit/integration tests for vault transformations, auth lifecycle, and privacy endpoints.
- **Observability**: Introduce structured logging/metrics (with anonymization) to monitor AI response quality and rate limiting.
- **Accessibility audit**: Evaluate the login overlay and coaching interface for assistive technology compatibility.
