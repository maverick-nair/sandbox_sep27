# Launchpad tests

Browser tests run with Playwright against a local copy of the page wrapped in a minimal HTML skeleton (`page.html`).

- `play.cjs`: plays all five missions as an AI PM in scripted mode, plus one deliberately poor run; writes `play-log.json`.
- `live.cjs`: live-mode contract with a mock Claude, shared store and user service; error paths (consent denied, rate limited, malformed JSON); adversarial checks (XSS, keyword stuffing, prompt fencing, score tampering, time zone, screen-reader region, 360px layout).

Known open failure: `integrity` (scores are computed in the browser, so a learner can publish fake scores). This needs server-side scoring.
