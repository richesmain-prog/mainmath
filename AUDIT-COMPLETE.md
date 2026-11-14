# MainMath complete audit — second pass

Date: November 14, 2026. Application: https://math.therichmain.com/. Repository: `richesmain-prog/mainmath`, local `mainmath-app`. Baseline: `c5458e4661c095f4258748e6f2740b1acc3ac060`.

**Application audit and fixes complete; release evidence is recorded in the final section.** This report covers the fresh second pass. [AUDIT.md](AUDIT.md) records the earlier financial corrections and original backend deployment; its historical live submission is not a new submission in this audit.

The second pass found additional saved-deal data-loss risks, misleading output text, input/display mismatches, copy failure handling, and expanded mobile/accessibility defects. Those findings produced targeted fixes and regression tests. No new exploitable security vulnerability was validated in the reviewed source and mock API tests. This is a bounded application audit, not a full penetration test or a guarantee that every possible input, browser, contract, or lender policy works.

## Scope and evidence

Work combined independent financial formula checks, adversarial DOM workflows, source security review, read-only deployment checks, and browser inspection. The loaded application-security-testing, api-security-testing, and find-security-vulnerabilities-in-code skill checklists informed security coverage; browser and regression work followed the team's loaded QA skills and Chisle guidance.

No production attack scan, new lead submission, customer-record query, real message, paid scanner run, or branch-protection change occurred during this second pass. API tests use mocked D1, rate limiting, and Google responses. Browser previews exercise the changed HTML without claiming the published site already contains it.

| Area | Coverage and evidence |
|---|---|
| Control inventory | [control-inventory.json](audit-evidence/control-inventory.json): 213 captured controls, one contact link, zero external scripts. Inventory is a map, not proof that every possible interaction combination was exercised. |
| Spec Build | Loan/cash/teardown/full-loan/drawn-interest branches, costs, profit, partner allocations, equity peaks, IRR, margin, max-land solvers, break-even, sensitivity, target/stress controls, Quick/Full mode. |
| GC Contracts | Cost-plus, GMP/shared savings, lump sum and design-build; fee, design, contingency, cap, overrun and savings allocation; linked costs versus explicit terms. |
| Lender Terms | Acquired/owned land, existing debt, LTC/LTV limits, land advance, upfront demolition, later draws, reserve on/off, full-loan/drawn interest, construction-to-permanent payment. |
| LOI / diligence | Price/deposit credits and exposure, costs, calendar dates/extensions, parties/property text, contingencies, checklist, letter output, copy and print paths. |
| Shared workflows | Navigation/help, 61 numeric boxes, six keyboard switches, 27 contingency/checklist controls; save/load/delete, reload, import/export, reset/relink, stale modal, concurrent save coordination, blocked storage and clipboard. |
| Lead API | Durable acknowledgment, validation, CORS, rate/body limits, retries/concurrency, SQL binding, error privacy, downstream failures and confirmation classification. |
| Browser preview | All 16 expanded tab/width combinations pass overflow and axe checks; additional Full/teardown/partner and owned-land/permanent/reserve/full-interest states pass at 375px. Real two-tab saves and stale deletion, keyboard scrolling and long saved names verified. |
| Deployment | Read-only GitHub Pages/build/protection metadata, dependency audit, scoped tracked-secret patterns, and new regression workflow. |

## Corrections from this pass

| Finding / reproducer | Corrected behavior | Regression evidence |
|---|---|---|
| Two unnamed deals saved on the same date shared a generated name and overwrote one another. | Automatic names receive unused suffixes; the generated name populates the draft so later Save updates that deal. Explicit same-name updates retain their intended behavior. | `test-audit-workflows.cjs` automatic-name/update tests. |
| Saved modal used list positions after another tab changed storage. Load/Delete could target a different deal. | Actions match the displayed name and timestamp, re-read current storage, and refuse stale changed records. | Prepend and changed-record tests for both Load and Delete. |
| Two-tab read/modify/write could discard another save; a queued unnamed save could rename a newly reset draft and cause its next Save to overwrite the original. | Web Locks serialize supported-browser writes; storage is re-read inside the lock. Save captures the clicked draft before waiting and only updates the name if the same draft is still open. Lock/storage failure is reported. | Queued-save, draft replacement, lock failure and quota tests. Older browsers without Web Locks retain a best-effort fallback. |
| Invalid nonempty text in a linked box silently restored linkage on blur. | Invalid text retains the last explicit value. An empty linked box intentionally relinks; GMP zero retains its documented automatic behavior. | Invalid-versus-empty linked-input tests. |
| Secondary input precision could exceed the four decimal places displayed. | Typed/imported secondary values use the same four-decimal precision shown; whole-unit fields remain integers. | Precision and imported-value tests. |
| Non-Latin/emoji-only names exported as `.json`. | Filename uses `mainmath.json` when sanitizing leaves no usable basename. | Export-name tests. |
| Saved-modal close/backdrop/rapid dismissal could strand focus. | All dismissal paths return focus to Saved; delayed focus does not enter a closed modal. | Close/backdrop/Escape/tab-wrap/rapid-close tests. |
| Clipboard denial left summary text offscreen; LOI fallback depended on page selection. | Shared native dialog exposes visible, focused, selectable text for either output. No HTML is interpreted. | Denied clipboard/reuse tests; preview confirmed selected summary text and LOI reuse. |
| Lost signup receipt followed by reload generated another UUID. | Pending identity is saved in sessionStorage before POST and reused after same-tab reload; matching acknowledgment clears it. | Lost-receipt/reload and confirmed-receipt tests. |
| Server validation failures offered only a generic retry message. | Invalid name/email responses request correction while preserving inputs; an edited retry can succeed. | Passing server-rejected-email regression, including a non-JSON error body and successful corrected retry. |
| Lender explanation said the bank covered the whole job when only construction was funded. | Copy distinguishes the overall cap from actual land/work/reserve advances. For $400k land, $100k build and 0% land advance, it correctly accompanies a $100k loan and $400k borrower cash. | Independent rendered lender counterexample. |
| Exact zero profit was labeled “Loses Money.” | Exact zero margin is labeled “Breaks Even”; negative profit remains a loss. | Zero-profit fixture. |
| Dates in years 1–99 displayed as 1901–1999. | ISO dates retain their actual year when formatted. | Years 0001/0004/0099/0100 render tests plus timeline cases. |
| LOI price/deposit text rounded cents away. | The letter preserves cents; whole-dollar amounts remain concise. | $100.49/$1.49, $100/$1 and $0.01 examples. |
| Manual earnest above purchase price or calendar overflow still appeared checklist-complete. | Checklist flags excessive deposits and unsupported projected deadlines while preserving the explicit draft for correction. | $200k deposit on $100k price; date `9999-12-31`; recovery to valid leap day. |
| Expanded Spec tables caused horizontal overflow at 320/375px; scrollable schedules lacked keyboard access. | Grid children can shrink; sensitivity and schedule regions have keyboard focus and accessible names. | [Baseline](audit-evidence/baseline-mobile-expanded.png) and [corrected mobile screenshot](audit-evidence/mobile-expanded-fixed.png); all [16 corrected combinations](audit-evidence/responsive-accessibility.json) have no page overflow or axe violations. ArrowRight scrolls the focused schedule horizontally. |
| A 250-character unbroken saved name expanded a 320px layout to 2305px. | Saved-deal layout permits shrinking and long-name wrapping. | Corrected browser result: viewport 320px, document scroll width 320px with the same long name. |
| Signup content exceeded a short mobile viewport. | Dialog content has viewport-bounded height and internal scrolling. | 667×375 preview confirmed reachable submit control. |
| Every printed tool started with a page containing only the report heading. | Report cards may break across printed pages instead of pushing all content onto page two. | Actual Chrome PDFs: Spec/GC/Lender reduced from three pages to two, LOI from four to three; every first page now contains report content. |

## Mathematical verification

The additional 599 deterministic cases use separate algebra, cash conservation and date differences rather than restating the implementation. They supplement the existing 600 financing cases and underwriting tests.

| New cases | Independent check |
|---:|---|
| 320 financing cases | Sum of monthly loan balances, interest, profit, cash needed and zero present value at the computed IRR; includes cash/loan, draw/full interest, teardown, zero sale and losses. |
| 48 reverse solutions | All-cash max-land answers against direct target-margin and two-cash-flow IRR algebra, including small/large amounts and negative/positive targets. |
| 162 contract cases | Owner bill minus actual construction/design cost equals builder profit; caps and savings shares reconcile across overruns and fee extremes. |
| 36 reserve cases | Geometric-series drawn interest and borrowing-cap algebra, zero/nonzero rates, short/long construction and hold periods. Loan plus borrower cash reconciles to cost plus interest. |
| 24 date cases | Exact elapsed UTC days across leap years and centuries; extension count × days and closing lag remain consistent. |
| 9 owned-land permanent cases | Existing debt payoff, lot equity, upfront work, draws, cash and conversion principal/interest payment reconcile. |

Units remain USD, whole percentage inputs (`10.5` means 10.5%), integer durations/counts and calendar days for modeled deadlines. The tests preserve the earlier model's conventions: ordinary Spec interest is paid monthly; loan capacity obeys LTC and LTV; demolition is upfront when linked; earnest credits purchase price rather than becoming a second acquisition cost; financed reserves are borrowed money and affect interest; mortgage principal/interest approaches principal divided by payment count at zero rate. See [AUDIT.md](AUDIT.md) for full workflow/formula reconstruction and concrete base fixtures.

These checks validate the stated model, not a lender quote or contract interpretation. Uniform draws, closing-month carry, reserve priority, owned-land valuation, fixed design scope under overruns and partner loss allocation are assumptions. Lender cash omits some Spec carrying costs. GC/lender/LOI edits do not automatically rewrite Spec profit. Grade and land-value bands are screening heuristics; contract terms, approvals and actual signed dates control the real transaction.

## Security, privacy and operations

Worker code was unchanged in this pass. Seventeen API/security test groups now verify exact-origin CORS, JSON-only input, UUID/name/email allowlisting, rejection of extra/prototype properties, 4096-byte streamed request limits, malformed UTF-8/JSON rejection, rate denial/failure handling, and parameterized SQL. A SQL-shaped name remains a bound value; response bodies contain neither contact details nor private database errors. Input-to-HTML injection fixtures also pass for saved names, print headings and LOI text.

D1 insert completes before success is acknowledged. Same-ID matching retries do not forward twice; conflicting details receive 409. The fixed Google endpoint has manual redirects, an eight-second timeout and a 256 KiB response bound. HTTP 200 alone is insufficient: reflected, escaped, hidden and inert success phrases remain unconfirmed. Failed forwarding preserves D1 records; no automatic ambiguous retry occurs. These are local/mock results, not a new production delivery test.

The privacy notice identifies Cloudflare storage and Google Forms forwarding. Only identity/contact fields are submitted; saved deals and financial calculations stay in browser storage. There is no public lead-list endpoint or account-based saved-deal service. Pending/failed/unconfirmed Google status needs owner review; `/health` checks Worker liveness, not D1 or Google readiness. Follow-up email delivery is outside this application and was not tested.

`npm audit` reported zero known vulnerabilities; the app has no runtime npm packages and uses jsdom as a development dependency. Scoped tracked-file credential patterns found no matches. This does not establish absence of all possible secrets. Cloudflare/Google IAM, form-sharing permissions, platform logs, retention/deletion policy and restore capability were not verified.

Exact Origin protects browser access patterns, not against arbitrary bots. Cloudflare's 10/minute/IP binding is approximate and local to each Cloudflare location; shared networks can also encounter the limit. [Cloudflare rate-limit documentation](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) supports this limitation. [D1 prepared-statement documentation](https://developers.cloudflare.com/d1/worker-api/prepared-statements/) supports the bound-parameter approach. Cross-session or changed-contact signup deduplication is not promised; denied sessionStorage can prevent pending-ID persistence.

Strix 1.7.0 was present, but configured for an external model and without an available Docker daemon. No paid scanner or full pentest was run. Manual source/mock review proceeded without claiming scanner coverage.

## Accessibility and performance

Baseline browser inspection expanded all details on four tabs at 320, 375, 768 and 1440px: 16 combinations. It found Spec horizontal overflow at the two narrow widths and keyboard-scroll issues for the schedule. The corrected matrix passes all 16 combinations with **no page overflow and zero axe violations**; results are recorded in [responsive-accessibility.json](audit-evidence/responsive-accessibility.json). Tests used isolated hosted Chromium, the latest local HTML preview on the production origin, axe 4.10.3, WCAG 2 A/AA, 2.1 AA, 2.2 AA and best-practice rules, with all visible detail panels expanded.

Additional 375px states also have no overflow or axe violations: Full Spec with teardown and a partner; and construction-to-permanent with owned land, financed reserve and full-loan/Dutch interest. With focus on the 285px-wide schedule region containing 330px of content, ArrowRight increased scrollLeft to 40px. In a 375px viewport, the 250-character saved-name row now has matching 320px client/scroll widths, down from 2305px of overflowing content. Short-height signup at 667×375 scrolls to its submit control. Saved-modal focus and the manual-copy dialog also have local regression coverage.

Real simultaneous saves in two browser tabs preserved both A and B. With a stale Saved modal, deleting the displayed B removed B while preserving A and a row added in the other tab. These browser results support the lock and displayed-record regressions; they do not promise atomic writes in browsers lacking Web Locks.

Native Chrome 157 downloaded a 3377-byte JSON export containing the exact $123,456.78 input and all four tools. Selecting that file through the actual file chooser restored the full draft; malformed and unrelated JSON preserved existing values. All four tools produced PDFs, the Print button fired the browser print event, and rendered Spec/LOI pages were visually checked for readable text and horizontal clipping. The LOI PDF retains $100.49 purchase price, $1.49 earnest and the seller signature. [Browser results](audit-evidence/local-chrome-results.json), [PDF text checks](audit-evidence/local-print-content.json), and the optional [reproduction script](audit-evidence/local-chrome-audit.cjs) capture the evidence. The hosted browser canceled downloads, so this path was independently verified in isolated local Chrome. No page errors, console errors or POST requests occurred in that local run.

Automated axe checks are not a screen-reader session or a blanket WCAG certification. No physical mobile-device, full browser-engine matrix, historical screenshot comparison or physical printer test is claimed.

Single baseline Chromium lab observation: TTFB 64.1 ms, DOMContentLoaded 112.2 ms, load 118.4 ms, transfer 195,474 bytes, LCP 136 ms, CLS 0, no observed tasks over 50 ms, and observed event durations 24–32 ms. No additional resource loads or page errors were observed in that run. These are one-session lab measurements, not official INP, field Core Web Vitals, slow-network/mobile benchmarks or a performance service-level guarantee. Final-build measurements have not yet replaced that baseline.

## Regression and deployment status

The latest full `npm test` run passes **68 Node tests**: 24 new workflow tests, 10 new math tests, 17 API/security tests and 17 underwriting tests. The **600-case existing financing suite** and **61-numeric-control DOM suite** also pass; `git diff --check` is clean. The 599 new mathematical scenarios are contained within the new math test groups, not 599 additional Node test cases.

Reproduce with Node 22.23.2:

```sh
npm ci --ignore-scripts
npm test
git diff --check
```

`package.json` includes both fresh audit suites. [.github/workflows/test.yml](.github/workflows/test.yml) runs clean installation and `npm test` for pull requests and pushes to master, with read-only contents permission and no persisted checkout credentials. Official [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) and [setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0) are pinned to full commit SHAs verified through GitHub's API. An isolated local clean-install replay succeeded. Hosted PR and merged-master CI also passed; links are recorded below.

Read-only baseline GitHub metadata showed HTTPS enforced, Pages built from master root, and a successful deployment at `c5458e4`. Master was unprotected. New regression CI does not itself prevent Pages from publishing a failed master push; requiring that check before merge remains repository-policy hardening. Branch protection was not changed.

## Release verification

Source and browser verification are complete: 68 passing Node tests, 600 existing financing scenarios, 599 new independent mathematical cases, the 61-field DOM suite, all 16 expanded responsive/axe combinations, conditional loan/partner states, multi-tab persistence, native downloads/uploads and four printable reports. Worker `/health` returned HTTP 200 with `{"ok":true}`. Worker source is unchanged, so no backend redeployment is required.

[PR #2](https://github.com/richesmain-prog/mainmath/pull/2) merged at 21:59:56 UTC as `faa050727eafd013632056d91d74569ce2e058c5`. [Final PR CI](https://github.com/richesmain-prog/mainmath/actions/runs/43645633916), [merged-master CI](https://github.com/richesmain-prog/mainmath/actions/runs/43645714199), and [GitHub Pages publication](https://github.com/richesmain-prog/mainmath/actions/runs/43645714084) all succeeded.

At 22:00 UTC, live HTML returned HTTP 200 and matched the tested source byte-for-byte: SHA-256 `c0f73d82358f827e5dc50e6084e6c2a3b02f09651ee1062a9f3411b9d5fde4f1`. Isolated Chrome loaded the actual published site without replacing its HTML. All 16 expanded tab/width states remained free of horizontal overflow; exact LOI cents, separate unnamed saves, a real downloaded JSON file and focused/selected manual-copy fallback passed. No page exceptions or POST requests occurred. [Live smoke evidence](audit-evidence/live-smoke.json) records the results.

Final review also reproduced and fixed a queued-save/reset race before merging. An independently repeated native Web Lock test verifies that the original $100k save cannot rename a new $200k draft; both deals remain distinct. The updated browser results record that check separately with the final source hash. The earlier PDF/screenshot artifacts predate this two-line save guard; print/layout code did not change afterward.
