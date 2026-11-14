# MainMath

Spec-build deal calculator by Rich Main. Free, no account, runs entirely in the browser.

Open `index.html`, or visit the live page.

**What it does:** enter a lot price, home size, build cost per square foot, and sale price per square foot.
It returns the profit, the cash you need, your annual return, and the maximum lot price that still hits your margin target.

Every figure is an estimate you control. Not lending, tax, legal, or investment advice.

Run regression checks with Node 22.22.2+, Node 24.15+, or Node 26+: `npm ci --ignore-scripts`, then `npm test`.
Tests cover all four calculation engines and local DOM workflows; signup is mocked and sends nothing.

Save and Export include all four tools. Older exports restore Spec Build and reset other tools to defaults.
GC and lender comparisons read linked Spec Build inputs; overrides do not change the Spec Build budget.

Audit findings, formulas, evidence and remaining limits: [AUDIT.md](AUDIT.md).
