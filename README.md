# MainMath

Spec-build deal calculator by Rich Main. Free, no account. Calculations and saved deals stay in the browser; signup uses a small Cloudflare Worker and D1 database.

Open `index.html`, or visit the live page.

**What it does:** enter a lot price, home size, build cost per square foot, and sale price per square foot.
It returns the profit, the cash you need, your annual return, and the maximum lot price that still hits your margin target.

Every figure is an estimate you control. Not lending, tax, legal, or investment advice.

Run regression checks with Node 22.22.2+, Node 24.15+, or Node 26+: `npm ci --ignore-scripts`, then `npm test`.
Tests cover all four calculation engines and local DOM workflows; signup is mocked and sends nothing.

Save and Export include all four tools. Older exports restore Spec Build and reset other tools to defaults.
GC and lender comparisons read linked Spec Build inputs; overrides do not change the Spec Build budget.

Audit findings, formulas, evidence and remaining limits: [original audit](AUDIT.md) and [complete second-pass audit](AUDIT-COMPLETE.md).

Signup API: `https://math-api.therichmain.com/leads`. The app unlocks only after D1 confirms storage. Request IDs prevent duplicate writes and Google submissions on retries. Google Forms receives a secondary copy; a forwarding failure never deletes the durable lead. No deal inputs are sent. `/health` reports service availability without exposing leads.

Deploy the signup service with Wrangler: `wrangler d1 execute mainmath-leads --remote --file worker/schema.sql`, then `wrangler deploy`. GitHub Pages publishes the site from `master`. Deploy the API before publishing frontend changes that require it.

Review forwarding status privately using `wrangler d1 execute mainmath-leads --remote --command "SELECT google_status, COUNT(*) AS count FROM leads GROUP BY google_status"`. Retrieve individual leads through Cloudflare's authenticated D1 console when needed. `confirmed` means Google returned its response-recorded page; `unconfirmed` means its response did not establish receipt; `failed` means the forwarding attempt failed. A `pending` row may indicate an interrupted forwarding task. Forwarding is deliberately attempted once, because an ambiguous response could follow a successful Google write; inspect Google Forms before manually recovering a lead to avoid duplicates. This service captures leads; it does not send follow-up emails.
