# Privacy & Data Protection Analysis

The Extreme Minimalism AI Coach processes lifestyle journals, coaching notes, and progress telemetry that are inherently personal. This assessment catalogs the privacy risks surfaced so far and maps them to the safeguards we have implemented (or scheduled) to keep the service compliant with GDPR-grade expectations.

## Identified Privacy Concerns

### Personal lifestyle data sensitivity
- **Risk:** The vault stores possession counts, motivations, and wellbeing reflections that can reveal socio-economic status or mental health triggers.
- **Impact:** Unauthorized disclosure could cause reputational damage or bias in future profiling.
- **Current posture:** Vaults are encrypted at rest with per-user AES-256-GCM keys derived from the user’s password; authentication is mandatory for every access request.

### Conversation history storage risks
- **Risk:** Long-form chat transcripts may capture sensitive emotions or household details. If retained indefinitely, they increase breach blast radius.
- **Current posture:** Conversations live inside the encrypted vault and can be wiped via `DELETE /api/account/conversations`. Admin dashboards aggregate milestones only—no raw transcripts are exposed.
- **Next step:** Surface a one-click “Clear conversation history” action in the client to call the new API routinely.

### User profiling privacy implications
- **Risk:** Assessment answers, goals, and computed phases form a profile that could be misused for automated decision-making.
- **Current posture:** Profiles remain local to each user’s vault. Admin summaries expose anonymized counts (phase distribution, total milestones) without identifiers. Prompt templates avoid storing computed persona traits outside the vault.
- **Mitigation roadmap:** Introduce transparency copy explaining what profiling occurs and offer opt-out toggles for algorithmic recommendations.

### Third-party AI model data handling
- **Risk:** Sending transcripts to external LLM providers could create uncontrolled replication across jurisdictions.
- **Current posture:** GPT4All runs on-device/locally; no personal data leaves the deployment boundary. Only aggregated telemetry is sent to the browser client already under session control.
- **Ongoing checks:** Document a review checklist whenever swapping the local model or enabling remote inference to ensure data-processing agreements are in place.

### Cross-border data transfers
- **Risk:** Cloud-hosted models often replicate data to multiple regions, complicating adequacy decisions.
- **Current posture:** Computation happens within the host environment—GPT4All is bundled locally—so no cross-border transfers occur by default. If the app is deployed to multi-region infrastructure, encryption at rest and TLS in transit remain mandatory safeguards.

## Privacy Solutions

### Technical controls
- **Local-first storage:** All vault content is persisted in `data/vaults/<userId>.json`, encrypted client-specifically. GPT4All inference executes locally, keeping PII inside the tenant’s infrastructure.
- **Data anonymization:** The `/api/admin/progress-summary` endpoint only returns aggregate counts and phase distributions. No email, name, or free-text content is surfaced, meeting the “data minimization” requirement.
- **User retention controls:** Users can export their vault (`POST /api/account/export`), clear conversation history (`DELETE /api/account/conversations`), or invoke right-to-be-forgotten deletion (`DELETE /api/account` with password confirmation). Front-end helpers in `public/auth.js` expose these actions.
- **Conversation export/delete:** Export delivers a timestamped JSON bundle; deletion wipes the `conversationHistory` array from the encrypted vault, immediately syncing listeners.
- **Encryption of sensitive profiles:** Vault payloads (profile, progress, goals, stories, history) are encrypted with PBKDF2-derived AES-256-GCM keys. Session-bound keys never touch disk, and failed decryption triggers vault reinitialization.

### Legal & governance measures
- **Privacy policy:** Draft/update a dedicated privacy notice clarifying purpose limitation, categories of data processed, retention horizons, and contact for Data Subject Access Requests (DSARs). Link it from onboarding.
- **User consent mechanisms:** Ensure registration flow includes explicit acceptance of the privacy policy and terms, with audit-friendly timestamps stored alongside the user record.
- **Data retention policies:** Default retention equals “user controlled.” Provide guidance in product copy and operational runbooks specifying how long inactive accounts remain before secure purge.
- **Right to be forgotten:** The new account deletion endpoint removes credentials (`users.json`) and vault files (`data/vaults/`) after password re-authentication. Sessions and tokens are revoked to prevent post-deletion access.
- **GDPR alignment:** Maintain records of processing activities, support data portability through the export feature, and add Data Protection Impact Assessments when integrating new data processors. Explicitly document the lawful basis (likely consent) for storing coaching data.

## Next Activities
- Build UI affordances that surface the new retention/export/delete APIs so end users can manage their data without contacting support.
- Automate erasure for stale accounts (e.g., 90 days of inactivity) after notifying the data subject.
- Add unit tests covering vault wipe & account deletion flows to guard against regressions.
- Collaborate with legal counsel to finalize the privacy notice and consent text before public launch.
