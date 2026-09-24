# AI PM Launchpad

A game-based practice platform for AI product managers, built for KNOLSKAPE. Learners hold live conversations with stakeholders played by Claude, make a decision, and get a Conversation AI assessment. Progress runs on a mission path with stars, XP, streaks, badges and a cohort league. Facilitators run cohorts and calibrate Claude's scoring against human reviewers.

- `server/`: Node.js 22 server (no framework), SQLite storage, Claude via the official Anthropic SDK.
- `public/`: learner app (`/`) and facilitator dashboard (`/admin`). Plain JavaScript, no build step, no third-party requests.
- `server/content/`: missions as JSON files. Add a mission by adding a file; the server validates it on start.
- `tests/`: unit and API tests (`npm test`) and browser plus accessibility tests (`npm run test:e2e`).
- `prototype/`: the earlier single-file claude.ai artifact, kept for reference. It is not the deployable product.

## What changed from the prototype, and why

| Issue found in testing | Fix |
| --- | --- |
| Client learners could not open the artifact (organisation-only) | Standalone web app with its own sign-in: cohort invite code plus password, or company single sign-on (OpenID Connect) |
| Claude usage was billed to each learner's own account | Claude runs on the server with KNOLSKAPE's API key, with a per-learner daily token budget |
| Scores could be faked from the browser | The server holds each conversation, calls Claude, and computes every score, XP award, badge and rank. There is no endpoint that accepts a score |
| Hidden facts and the best option were readable in the page source | Facts, keywords, option points and outcomes stay on the server until earned |
| Claude's scoring was never compared with humans | Blind review queue for facilitators (20% sample) with exact, within-one and weighted-kappa agreement, target 0.75 |
| Prompt injection into the assessor | Learner text is fenced as untrusted data; instructions stay in the system prompt; structured JSON output with a fixed schema; keyword stuffing is capped on the server |
| Streaks used UTC | All days use the learner's time zone |
| Only 5 missions | 8 missions, and new missions are content files with validation |
| No facilitator tools, export or LMS link | Facilitator dashboard, cohort CSV export (with spreadsheet-formula protection), optional xAPI statements to the client's LRS |
| Privacy and data rights | Learners can download or delete their data; transcripts are removed after `RETENTION_DAYS`; no third-party fonts or trackers |
| Accessibility | Automated axe-core audit passes WCAG 2.1 AA (no serious or critical issues) on every screen; focus moves to each new screen; live announcements for stakeholder replies |

## Run it

```bash
npm ci
cp .env.example .env   # fill in values, then export them or use your process manager
ADMIN_EMAIL=you@knolskape.com ADMIN_PASSWORD='a-long-password' ANTHROPIC_API_KEY=... npm start
```

Open `http://localhost:8080/admin`, sign in, create a cohort and share its invite code. Learners join at `http://localhost:8080/`.

Without `ANTHROPIC_API_KEY` the app still works on a scripted backup engine, and says so on screen.

Demo data: `npm run seed:demo` adds a "Demo cohort" (code `LP-DEMO0001`) with 12 sample learners. Remove them from the dashboard with "Remove all sample learners" before a real cohort.

## Deploy

Container: `docker build -t ai-pm-launchpad .` then run with a persistent volume at `/data` and the environment variables in `.env.example`. The container runs as a non-root user and exposes `/healthz`.

Checklist:

1. Put it behind HTTPS and set `PUBLIC_URL` to the HTTPS origin. This turns on Secure cookies and HSTS.
2. Set `ANTHROPIC_API_KEY` from a secrets manager. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD`, sign in once, then rotate the password.
3. Mount `/data` on a persistent volume and back up `launchpad.db` daily. SQLite in WAL mode supports one server instance; for several instances, move storage to Postgres first.
4. Optional: configure OIDC (`OIDC_*`) for the client's identity provider, and `LRS_ENDPOINT` for xAPI.
5. Run `npm test` and `npm run test:e2e` against the release build.

## Security model

- Sessions: random 256-bit tokens, stored hashed, in `HttpOnly; SameSite=Lax` cookies (`Secure` over HTTPS).
- CSRF: every state-changing API call requires a custom header that other sites cannot send.
- Passwords: scrypt. Sign-in and join are rate limited. Message sending is rate limited per learner.
- Content Security Policy: scripts, styles, fonts and connections are same-origin only; framing is denied.
- Request bodies are capped at 16 KB; message and rationale lengths are capped.
- Admin and facilitator actions are written to an audit table.

## Claude configuration

| Setting | Default | Notes |
| --- | --- | --- |
| `CLAUDE_MODEL` | `claude-opus-5` | Used for stakeholder turns, assessment and the Daily spark |
| `CLAUDE_PERSONA_EFFORT` | `low` | Keeps conversations responsive |
| `CLAUDE_ASSESS_EFFORT` | `high` | Assessment quality |
| `CLAUDE_FALLBACKS` | `default` | Server-side fallback model if Claude declines a request; the app also falls back to the scripted engine on any error |
| `DAILY_TOKEN_BUDGET` | `600000` | Per learner per UTC day |

## Mission content

Each file in `server/content/missions/` needs: an id, tier (1 core, 2 advanced, 3 boss), persona, setup, objective, opening line, exactly 3 hidden facts (text, hint, short label, keywords for the backup engine), pressure moments, 4 rubric criteria mapped to skills, and 3 options (one worth 25 points) with outcomes. `npm run validate:content` checks every file. All people and companies must be fictional.

## Known limits before a client launch

These need decisions or work outside the code:

- **Scoring validation:** run the calibration study (at least 30 reviewed conversations, weighted kappa 0.75 or more) before using scores for any formal decision. The dashboard tracks it.
- **Live Claude testing:** the automated tests use a mock of the Anthropic API. Play every mission with a real key before launch, and check response times at your expected concurrency.
- **Legal and data:** a data processing agreement with each client, the data residency decision for Claude calls, and a privacy notice.
- **Accessibility:** the automated audit passes; a manual screen-reader review is still recommended.
- **Scale:** single instance on SQLite; move to Postgres for high availability.
- **Languages:** English only.
