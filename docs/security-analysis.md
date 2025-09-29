# Security Analysis

## Data injection vulnerabilities
- **Threat:** Unvalidated request bodies can be abused to inject malicious payloads that pollute user profiles, coerce prompt templates, or cause persistent cross-site scripting once echoed in the UI.
- **Countermeasures:** Server endpoints now normalize and validate numeric inputs (`/api/assessment`, `/api/progress`) and cap text payload sizes (chat + Socket.IO). User records are stored with least information required, and password hashes are generated with `bcryptjs`.
- **Next steps:** Introduce schema validation (e.g., `zod`/`Joi`) and escape all user-supplied fields on render paths to harden against residual injection risks.

## Session hijacking prevention
- **Threat:** Stolen cookies or replayed JWTs could let attackers impersonate users or steal progress data.
- **Countermeasures:** Sessions use HTTP-only, same-site cookies with 1-hour expiry, and JWTs embed user roles plus issuer/audience checks. Logout explicitly revokes tokens and clears session data. Admin-only APIs enforce role checks.
- **Next steps:** Enable secure cookies in production (`NODE_ENV=production`) and rotate `JWT_SECRET`/`SESSION_SECRET` regularly. Consider device fingerprinting or refresh-token rotation as usage grows.

## API rate limiting needs
- **Threat:** Unbounded chat/API calls can lead to denial-of-service or brute-force probing.
- **Countermeasures:** `/api/chat` is protected by `express-rate-limit`, throttling bursts with useful error feedback. Socket messages mirror the same length limits to block spam payloads. Additional strategic rate limits can be layered per route if abuse is detected.

## Personal data exposure risks
- **Threat:** Email addresses, hashed credentials, and progress logs represent personal data subject to GDPR.
- **Countermeasures:** User store persists only hashes, role, and optional display name. Aggregated admin views expose metrics without personal identifiers. Sanitisation removes password hashes from API responses, and data access requires authentication. Local persistence resides inside `data/users.json`; ensure encrypted storage or managed secrets in production.
- **Next steps:** Define a data-retention policy, add subject erasure workflows, and encrypt at-rest data (disk encryption or per-record crypto) for cloud deployments.

## Implemented safeguards
- **Input validation:** All user-facing endpoints check required fields, normalise strings, and constrain numeric ranges to reduce injection surface.
- **Rate limiting:** Chat endpoint throttled (configurable window + max requests) to defend against bots and abusive automation.
- **Secure session management:** HTTP-only cookies, token revocation, and session cleanup on logout minimise hijacking impact.
- **HTTPS guidance:** Run the service behind HTTPS-terminating infrastructure (reverse proxy or hosting provider). Redirect HTTP to HTTPS in production and set HSTS headers once TLS is enforced. Use modern TLS configurations and monitor certificates for expiry.
