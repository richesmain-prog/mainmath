# GC agreement templates

Added November 25, 2026 to the **How do I pay my builder?** tab at https://math.therichmain.com/.

Choose **Use agreement template** on any comparison card, or choose a model in **3 · Start with an agreement template**. The preview uses the current estimate, selected GC terms and deal name. **Copy template** supports clipboard fallback; **Download .txt** creates an editable text document; **Print / Save PDF** prints only the selected agreement. Templates regenerate from the calculator; edit a copied/downloaded document in a document editor. Saved deals, reloads and JSON export/import preserve the selected template and existing terms.

## Matching the four pricing models

| Template | Pricing terms |
|---|---|
| Cost-plus | Documented allowable work cost plus the stated percentage fee. Base estimate is disclosed without creating a cap. Design is owner-paid and separate. |
| GMP with shared savings | The manual cap, or automatic cap from budget plus fee, includes both fee and any savings award. Final payment is capped; the selected GC percentage applies to savings after actual work cost and fee. Design remains outside the cap. |
| Lump sum | Fixed construction amount from budget including contingency and lump-sum markup. Savings/overruns belong to GC for unchanged scope. Design is separate. |
| Fixed-price design-build | Fixed amount from construction budget plus design, then design-build markup. Design is included once. This is one pricing form of design-build, not a definition that all design-build contracts must be fixed-price. |

The “what-if” cost variation affects the comparison only; it never changes a template's base estimate, fixed price or cap. Generated dollars use whole cents, with an explicit reconciliation instruction. The comparison now labels the **GC billing limit** separately from the owner-paid design estimate, avoiding a false guarantee of outside design cost. Main calculation-engine formulas are unchanged.

Each original draft includes sections for parties/project, scope and schedules, compensation, time, payment, changes, insurance/closeout, notices/default/disputes, and signatures. Unknown terms remain explicit blanks: legal names, project address, dates, tax treatment, deposit/progress payments, insurance, warranties, local notices and dispute procedures. The app does not silently choose arbitration, liability waivers or indemnity terms.

## Research and limits

These are original MainMath working templates, not AIA forms and not jurisdiction-certified or attorney-reviewed agreements. They are marked **DRAFT TEMPLATE — NOT READY TO SIGN**, including in copied/downloaded/printed output. Complete the blanks and attachments and obtain project-specific review before execution.

The pricing categories were checked against [AIA's agreement descriptions](https://learn.aiacontracts.com/contract-doc-pages/71126-a-series-ownercontractor-agreements/) and [design-build instructions](https://help.aiacontracts.com/hc/en-us/articles/33847709164819-Instructions-A141-2024-Agreement-Between-Owner-and-Design-Builder-for-a-Traditional-Design-Build-Project); proprietary form language was not incorporated. [Arizona ROC guidance](https://roc.az.gov/before-hire) supports documenting scope, permit responsibility, payment schedules and changes.

Local requirements cannot be filled from calculator figures alone. For example, covered Arizona contracts require specific price, payment, completion and complaint-notice information, including notice formatting. The draft leaves these for completion, and warns that plain-text copying does not preserve mandatory formatting. It does not invent a guaranteed price for cost-plus. See [A.R.S. §32-1158](https://www.azleg.gov/ars/32/01158.htm). Payment and lien-release procedures also need project-specific treatment; see [§32-1182](https://www.azleg.gov/ars/32/01182.htm) and [§33-1008](https://www.azleg.gov/ars/33/01008.htm).

## Verification

`npm test` includes [test-gc-agreements.cjs](test-gc-agreements.cjs), alongside all previous math, workflow and mocked API tests. The new checks independently calculate all four prices and GMP savings; exercise custom caps, cents, zeros and stress invariance; validate selection persistence, old exports, rejected import races, literal untrusted text, clipboard fallback, downloads and print cleanup. Two independent source/math reviews found no release blockers.

The optional [Chrome reproduction script](audit-evidence/gc-templates-browser.cjs) uses an isolated context and blocks POSTs. Set `PLAYWRIGHT_MODULE` and `CHROME_EXECUTABLE`, then run `node audit-evidence/gc-templates-browser.cjs`; add `--live` after publication to require a source-hash match. It checks all four card actions, focus, expected amounts, actual text downloads, print-only PDFs, reload, export/import and 375/768/1440px layouts. Clipboard and print-dialog calls use isolated test sinks; downloaded text and Chrome PDF rendering are real. PDF/screenshots are written to the system temporary directory under `mainmath-gc-templates`. This is focused feature verification, not a fresh full accessibility audit or matched visual-regression certification.

Local verification passes **100 Node test groups**, the existing **600 financing scenarios**, and **61-numeric-control DOM checks**. The supplemental 32 GC / 16 lender UI scenarios and 2,500 lender ledgers also pass after the billing-limit clarification. [Chrome evidence](audit-evidence/gc-templates-local.json) records four exact-text downloads, four print-only PDFs, saved/exported selection, and three responsive widths without page errors or POST requests. All four Letter-size PDFs have two pages, both signature blocks and no blank pages; [PDF text checks](audit-evidence/gc-templates-pdf.json) record the results. Print-only body padding was removed after it produced an empty trailing page during verification. The calculator's normal print mode remains separate.

[PR #6](https://github.com/richesmain-prog/mainmath/pull/6) merged as `3b079d8fc66d9fb08f700d3b92d65d33114e7700` after regression CI, Cursor Approval, Cursor Security and Bugbot all passed. [PR CI](https://github.com/richesmain-prog/mainmath/actions/runs/45678115243), [merged-master CI](https://github.com/richesmain-prog/mainmath/actions/runs/45679097174) and [Pages deployment](https://github.com/richesmain-prog/mainmath/actions/runs/45679097709) succeeded.

[Live Chrome verification](audit-evidence/gc-templates-live.json) repeated all four downloads, print-only PDFs, selection persistence, JSON round-trip and responsive checks successfully, without page errors or POST requests. Chrome and a separate HTTPS fetch both matched published HTML to source SHA-256 `c86a2ed24edcb703856848b91b6ddca17ca6a497de7cb2cfd0c979307f150d68`. Signup/API code was unchanged. The follow-up evidence commit also updates the existing tutorial with current billing-limit wording and template instructions.
