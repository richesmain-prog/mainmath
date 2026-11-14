# MainMath workflow and math audit — third pass

November 14, 2026 · https://math.therichmain.com/ · baseline `c3c86865bd29591c2f406d69c6117d37a441388a`

This fresh pass follows inputs through all four tabs to their intended outputs: a purchase ceiling, comparable builder prices, financing cash requirements, and a complete land-offer draft. It adds independent arithmetic and boundary checks, adversarial import workflows, and an actual Chrome save/export/import journey. Earlier coverage remains in [the original audit](AUDIT.md) and [the second-pass audit](AUDIT-COMPLETE.md). Loaded browser-qa, ai-regression-testing and Chisle skills informed this work.

## Newly corrected defects

| Finding | Fix and evidence |
|---|---|
| Fully financed decimal budgets could leave approximately $0.00000000004 of fictitious equity and report an enormous investor IRR. | Calculate financing percentages before multiplication and preserve the exact construction draw when the eligible basis is fully funded. Zero-investment cases now return zero cash required and no investor IRR. Twenty-four decimal budgets cover this boundary. |
| The annual-return purchase-price solver could skip a feasible interval immediately above an LTV limit. One $20m-sale fixture returned roughly $3.98m instead of $16,000,000.01199. | Probe immediately above financing transitions using floating-point precision instead of a fixed dollar offset. Thirty-four independent reverse equations cover small/large sale values, different partner shares and target returns. |
| Extra financing-transition probes could exceed the supported $1bn land-price limit, allowing the annual-return solver to recommend an amount the input could not accept. | Restrict solver probes to the supported interval; a near-cap financing fixture verifies that the answer stops at the input maximum. |
| Zero sale price showed a misleading “target too high” hero message. | The hero now agrees with the engine's “No Sale Price” result. |
| “All-in cost” excluded selling costs even though profit correctly deducted them. | Rename the KPI, glossary and copied summary to “Cost before selling”; clarify the per-square-foot caption. Profit arithmetic stays unchanged. |
| Large valid linked Spec inputs could be displayed in GC/Lender while smaller hidden caps were used to calculate results; converting a linked amount into an override could shrink it. LOI also capped linked sale value too low. | Align secondary engine and input bounds with the full supported Spec range. Regressions validate the displayed inputs, four GC bills, lender loan/cash and LOI land-to-value ratio at those boundaries. |
| “Bank covers the whole build” could appear while the borrower still funded demolition at closing. | Include unfunded upfront work when deciding whether to display that message. |
| A partly funded interest reserve was described as paying the interest. | Caption now explicitly says “partly paid from the reserve” when borrower interest remains. The $20,000 reserve / $28,800 interest fixture exposes the remaining $8,800. |
| A delayed file import could overwrite a newer file, loaded/reset draft, or subsequent field/checklist/mode edits; an old read error could replace newer feedback. | Sequence, draft identity and captured draft contents must still match before applying a read result or error. Tests cover newer edits across all four tabs, deal names, diligence toggles and mode. |
| A deal name accepted and exported by the app was truncated when imported. | Preserve the exported name through the round trip; existing text escaping still applies. |
| Sub-cent LOI amounts could satisfy the checklist while the letter displayed $0.00; linked and typed values could disagree with rounded legal amounts. | Normalize offer price and earnest to whole cents across calculation, typing, storage/import and linked values. Cases include $1.005 → $1.01, $10.075 → $10.08 and a sub-half-cent price becoming zero/incomplete. |
| Diligence instructions implied the two-axis sensitivity table tested delays. | Explain that delay tests use build/sale months; the table varies construction costs and sale price. |

The unused schedule branch referring to a nonexistent `r.interestMethod` property was removed. This was dead-code cleanup, not a newly discovered interest calculation defect: monthly rendered interest already came from the correct interest array.

## End-to-end math and workflow checks

| Tab / goal | Independently expected outcome |
|---|---|
| Spec: decide whether to buy and set a maximum offer | $100,000 land; 1,000 sf × $200 hard cost; 10% soft costs; 5% contingency on hard + soft; $9,000 permits gives $240,000 construction. With $2,000 closing costs, $13,000 carry, a $500,000 sale and $30,000 selling costs: cost before selling $355,000, profit $115,000, cash $355,000, and a 20%-margin land ceiling of $114,705.88. |
| Spec: timing, leverage and partner results | All 39 displayed monthly rows reconcile for cash, drawn-interest and full-loan-interest examples. Three added selling months cost exactly three additional full-draw interest and carry payments. Quick/Full preserves custom Full inputs and partner shares while changing the disclosed assumptions and sensitivity center. |
| GC: compare equivalent owner obligations | Work $209,000, contingency budget $219,450, separate design $20,000, 10% fee, 50% savings share and 20% markups produce owner bills of $249,900 cost-plus, $255,647.50 GMP, $283,340 lump sum and $287,340 design-build. Design-build is `(work contingency budget + design) × (1 + markup)`; design is not charged contingency again. |
| Lender: plan required cash and repayment | Linked $100,000 land + $240,000 build, 80% LTC, 72% LTV on a $500,000 sale, 12% drawn interest, two points, $3,000 fee, $2,000 closing, ten build + two selling months: loan $272,000, cash at closing $30,440, construction gap $48,000, interest $24,000, total cash $102,440. A 7%/30-year permanent loan payment is $1,809.62 before taxes/insurance. |
| LOI: produce a coherent offer draft | $100,000 linked offer gives $1,500 automatic earnest. February 1, 2028 plus 28 diligence days ends February 29; two 15-day extensions end March 30. Named fictional parties/property/title produce nine of nine prerequisites; all 17 diligence controls work. Deposit credits, exposure, text and calendar arithmetic are checked independently. |
| Shared: retain the whole deal | Actual Chrome download, Save → Reset → Load, Export → Reset → Import → Reload preserve all four tools. Secondary numeric fields, options and checkboxes also round-trip in DOM tests with identical outputs. |

GC and Lender are comparison tools: changing their overrides does not silently rewrite the Spec underwriting. Relink restores source cost links while preserving explicit comparison terms. A chosen builder price or loan quote must be reconciled with the Spec assumptions before using its maximum offer.

## Reproduction and coverage

Run `npm ci --ignore-scripts` and `npm test` on supported Node (see [README](README.md)). New mandatory suites are [Spec](test-third-spec.cjs), [financing](test-third-financing.cjs), and [workflow/LOI](test-third-workflows.cjs). They run in the existing PR/master regression workflow alongside all prior math, persistence and mocked signup tests.

The optional [real-browser script](audit-evidence/third-pass-browser.cjs) requires installed Playwright and Chrome; it adds no production dependency. Set `PLAYWRIGHT_MODULE` to the installed Playwright module and `CHROME_EXECUTABLE` to Chrome, then run `node audit-evidence/third-pass-browser.cjs`. Add `--live` to load published HTML and require its SHA-256 to equal the checked-out source. [Local evidence](audit-evidence/third-pass-browser.json) records the hand-calculated journeys. Every tab is checked with expanded panels at 375, 768 and 1440 pixels. The context is isolated and blocks POST requests.

Additional [financing probes](audit-evidence/third-pass-financing-probes.cjs), run with `node audit-evidence/third-pass-financing-probes.cjs`, validate every GC result across 32 input-driven scenarios, displayed lender rows/KPIs across 16 financing states, and 2,500 deterministic lender cash-ledger/interest/amortization cases. [Results](audit-evidence/third-pass-financing-probes.jsonl) record coverage including owned lots, negative equity, partial/full reserves and permanent loans. These supplemental cases are separate from the mandatory Node test-group count. Independent final review also checked 192 fully funded combinations including demolition and financed carry; differences in cash conservation stayed within floating-point precision (largest $0.000122 at $1 trillion sale value).

This pass does not replace the prior print/accessibility/security evidence with claims of new scans. It retained those regression checks, but did not run another full accessibility audit, create a matched visual-regression baseline, submit a production lead, change customer data, or redeploy the unchanged signup Worker. Real lender policies and contract terms remain user-supplied assumptions; this bounded audit cannot establish every possible input combination or external service outcome.

## Release verification

Final local validation passes **89 Node test groups**, including 21 new groups, plus the existing **600 financing scenarios** and **61-numeric-control DOM suite**. The separate 2,500-case lender probe and 32 GC / 16 lender UI matrices pass. Chrome completes the four-tab journey and all 12 tab/width combinations without page errors, horizontal overflow or POST requests. All three inline scripts parse and `git diff --check` passes.

Published build and live-source verification will be recorded after deployment. Validated application HTML SHA-256: `152db1261c717cea62e330e1fc13596cf4c7269b17f1672fa27584502b4a5358`.
