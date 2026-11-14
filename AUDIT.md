# MainMath workflow and calculation audit

Date: November 14, 2026. Target: https://math.therichmain.com/. Baseline: `813537e`.
Source: `richesmain-prog/mainmath`, sibling folder `mainmath-app`; the starting `mainmath` workspace contains a separate sales funnel.

Verdict: production had material financial and workflow defects. Fixes are implemented and tested in this checkout. Production deployment is a separate step; browser preview verification used request interception and did not publish files.

Skills used: browser-qa, ai-regression-testing, and Chisle efficiency guidance. Three independent agents checked deal math, contract/lender/offer math, and UI workflows. No production lead submissions, emails, purchases, or customer data changes occurred.

## Corrected defects

| Severity | Defect | Evidence and correction |
|---|---|---|
| High | Full-loan interest deferred to sale in cash flows | A hand-calculated fixture returned 80.6502% annual IRR instead of 64.5326%. Interest is now paid monthly; $148,344 profit is unchanged. |
| High | Lender reserve iteration oscillated | $400k land / $1M build / $2M ARV, 85% LTC, 70% LTV/land advance, 30% rate, 40+18 months produced a $1.12M reserve against $892,579 interest. Cost and reserve disagreed by $227,421. Bounded solution now produces $1,035,577 reserve/interest and $84,423 later construction draws within a $1.4M loan. |
| High | Exit cash shortfall omitted | Fully financed $100k purchase/resale with 6% selling costs showed $0 cash needed. Correct result is $6,000. |
| High | Partner loss obligations omitted | A $53k loss with 10% capital/90% profit-and-loss allocation showed $10k personal cash. Correct requirement is $47,700. Help now discloses loss allocation. |
| High | Saved deals mixed unrelated projects | Save/Export omitted GC terms, lender overrides, LOI parties and diligence checks. Load A could retain B's buyer and financing. Version-2 snapshots include all four tools; legacy files reset other tabs to defaults. Reset clears all four tools. |
| High | Teardown costs disagreed across tools | GC comparison omitted demolition. Lender spread demolition over later draws although Spec funded it at closing. Both now include the work and its timing. Test fixture now agrees at $85,980 interest, previously $84,180 in Lender. |
| Medium | Near-zero mortgage rates produced wrong/infinite payments | Stable payment formula now approaches principal / number of payments, including 1e-20% rates. |
| Medium | Date rollover and contradictory LOI deadlines | February 31 silently became March. Invalid calendar dates now reject; blank entry restores the date in use. Expiration counts from LOI date; diligence/closing dates are clearly projections from purchase-agreement signing, subject to contingencies. |
| Medium | Displayed values differed from math | Whole-number months, years, days, units and extensions now match engine rounding. Dollar boxes preserve cents. GMP zero consistently restores automatic cap. |
| Medium | Automatic deposit could exceed price | $100 purchase produced $1,000 earnest. Automatic earnest is capped at price; manually excessive deposits are flagged. |
| Medium | Linked lender method ignored Spec interest selection | New linked state follows Spec's drawn/full-loan method. An explicit override, including false, persists. Relink restores inheritance. |
| Medium | Corrupt saved data crashed actions | Invalid storage now yields an error without overwriting the stored data. Import errors preserve existing inputs. |
| Medium | Known signup failures silently unlocked | Offline or thrown submission now leaves signup open with an error. Private deal names no longer accompany lead submissions. Receipt remains unconfirmed; see limits. |
| Medium | Accessibility and print issues | Added six LOI labels, main landmark, contextual help names, keyboard-scrollable letter, disabled inactive contingency boxes, readable muted colors, mobile label wrapping and black-on-white print styles. |
| Low | Missing returns produced misleading score; small-dollar IRR failed | Undefined return now produces F/0. $1 resale at 25% return can solve the correct $0.80 purchase price. |
| Low | Unsupported information sounded authoritative | Removed unverified late-2026 lending ranges and generic utility/septic/permit/study cost claims. Starting values are illustrative; copy requests written quotes and local fee schedules. Removed assurance that an offer price makes a buyer “protected.” |

## Reconstructed workflows and formulas

All dollar fields use USD. Percent inputs use whole percent units: `10.5` means 10.5%, not 0.105. Numerical entry accepts commas, currency symbols, k/m suffixes and scientific notation. Invalid partial input retains the last valid value; blur reveals the value in use. Numeric ranges prevent negative costs and non-finite outputs. Days/months/years/counts are rounded to integers.

### 1. Spec Build

Quick Look uses six deal inputs plus explicit target/financing switches and sample assumptions. Full Underwrite uses every displayed assumption. Full values survive switching to Quick Look and back.

| Input boxes | Calculation/output |
|---|---|
| Lot price; empty lot/teardown; demolition | Acquisition cost; demolition applies only to teardown and is paid upfront. |
| Home sqft; hard build $/sqft | Hard cost = sqft × build $/sqft. |
| Soft-cost % | Soft = hard × soft %. |
| Contingency % | Contingency = (hard + soft) × contingency %. |
| Permits | Construction total = hard + soft + contingency + permits. |
| Buy closing % | Acquisition closing = lot price × percentage. |
| Build months; sell months; monthly carry | Duration = build + sell. Carry = monthly carry × (duration + 1), including closing month. |
| Sale $/sqft; selling-cost % | ARV = sqft × sale $/sqft; selling costs = ARV × percentage. |
| Loan switch; LTC %; maximum LTV % | Loan = smaller of LTC × eligible cost and LTV × ARV. Closing costs, points and lender fee are paid outside eligible cost. |
| Interest method; annual rate | Draw method charges each month on end-of-month outstanding balance. Full-loan method charges full commitment every month. No principal payments before sale. |
| Points %; lender fee | Points = loan × points %. Fee is zero when no loan is funded. |
| Partner switch; cash share; profit share | Contributions follow cash share; both profit and losses follow profit share. Terminal adjustment reconciles unequal shares. Personal cash includes required exit contribution. |
| Margin target (including duplicate inline box); IRR target | Reverse solvers find maximum land price meeting each target and recompute funding as price changes. Unreachable targets return no price. |

All-in cost includes acquisition, closing, demolition, construction, financing and carry. Net profit subtracts selling costs as well. Margin is profit / ARV; return on cash is profit / peak cash. Annual IRR is `(1 + monthly IRR)^12 − 1`, using dated monthly contributions/distribution. Break-even sale price recomputes financing. Stress table independently calculates all 25 sale/build combinations.

### 2. Hire a GC

Ten boxes: hard work (linked hard + demolition), permits, contingency %, design/soft allowance, cost-plus fee %, GC savings share %, GMP cap, lump-sum markup %, design-build markup %, actual-cost variance %.

Work cost = hard + permits. Budget = work × (1 + contingency %); actual work = work × (1 + variance %). Markup is on cost, not sales margin. Design is paid separately except in fixed-price design-build.

Cost-plus bills actual work + percentage fee. GMP limits the bill to its cap and shares savings after actual work + fee. Lump sum fixes budget × (1 + markup). Design-build fixes (work + design) × (1 + contingency) × (1 + markup). Owner totals and GC profit/margin account for design consistently. Savings share is the GC's portion.

Independent on-budget fixture: $1M work, $100k design, 5% contingency, 10% fee, 20% fixed-price markups, 50% GC savings share produces owner totals $1.2M / $1,227,500 / $1.36M / $1.38M. A 20% overrun tests who bears the excess. Fee, cap, zero cost, negative GC profit and savings-share extremes pass.

Relink resets linked cost inputs; terms reset separately. Comparison edits do not automatically replace Spec Build. Confirm the scope before transferring a chosen quote back: Spec's entire soft-cost bucket initially maps to this tool's design allowance.

### 3. Lender Terms

Fifteen boxes: lot value/price, existing lot debt, construction budget, ARV, build/sell months, LTC, LTV, lot advance %, interest rate, points, fees, closing costs, permanent rate and permanent years. Switches choose acquired/owned land, drawn/full-loan interest, reserve, and construction-only/construction-to-permanent.

Cost basis = lot + build + financed reserve. Loan cannot exceed LTC or LTV capacity, or modeled funding needs. Land advance is limited by land value × advance %, amount needed and loan capacity. Linked teardown work is separately funded at closing at LTC; remaining work draws evenly through build months. Borrower cash includes unfunded land/work, closing, points, fees and unfunded interest.

Reserve is borrowed money; drawn-balance interest includes capitalized payments. Bounded reserve solution respects both caps and prioritizes the reserve over later construction draws. Permanent conversion occurs after build, without sale hold months. Mortgage principal-and-interest payment uses the standard amortization formula, with a numerically stable zero-rate limit. Taxes and insurance are additional.

Independent ordinary fixture: $400k lot / $1M build / $2M ARV, 85% LTC, 70% LTV/lot advance, 12% rate, 2 points, $2k fees, $6k closing, 10+2 months: $1.19M loan; $280k land funding; $910k draws; $151,800 closing cash; $90k build cash; $101,850 drawn interest; $343,650 total borrower cash. Full-loan interest is $142,800.

Lender cash excludes Spec's property taxes, insurance and utilities. Owned-lot value is a cost-basis assumption to confirm with the lender. A manually overridden build budget uses uniform draws; relink restores demolition timing. Custom lender terms remain independent of Spec.

### 4. LOI and Due Diligence

Thirteen numeric boxes: offer price, earnest, expiration days, diligence days, closing lag, minimum units, extension count/days, exclusivity days, survey, soils, environmental and other diligence costs. Five text fields supply buyer, seller, property, intended use and title company. Date field supplies the LOI date. Ten contingency controls and 17 checklist items retain independent state.

Automatic earnest is approximately 1.5%, rounded to $500, with a $1,000 floor capped at purchase price. Explicit deposits stay explicit. Diligence-at-risk = survey + soils + environmental + other; later exposure adds deposit. Deposit credits purchase price and is not an extra acquisition charge.

Calendar arithmetic uses UTC. Expiration = LOI date + validity days. Projected diligence end = assumed purchase-agreement date + diligence days. Extensions add count × days; projected closing adds closing lag. Units and extension inputs disable when their contingency is off, retaining values. Completed fields/checklists are not legal approval. Copy preserves generated terms and placeholders for missing information.

### Shared workflows

Navigation, next/back buttons, Quick/Full, lot/teardown, help, target/stress chips, keyboard switches, name, Save/Load/Delete, Export/Import, Reset, copy, print and reload state were traced. Version-2 save/export includes inputs, mode and all tool state. Old exports reset unrelated tools to avoid carrying terms from another project. Storage is local to the device; there is no server account or cloud sync.

Signup uses a seven-day local trial and Google Forms. Invalid/offline/failed invocation paths were tested with a stub. Public form configuration was read and the three required entry IDs match. No live submission or email-delivery test was made.

## Validation evidence

- `npm test`: contract/lender/offer regressions; 600 deterministic lender scenarios; 17 underwriting suites including 96 financing/timing combinations and all 25 stress cells; DOM checks for 61 numeric controls, six keyboard switches, 27 checklist/contingency controls, navigation, help, persistence, import/export, copy/print dispatch and signup failures.
- Independent cash-event reconstruction: 512 combinations confirmed project and partner peaks without double-counting settlement losses.
- Live baseline: all four tabs loaded at 375, 768 and 1440px without horizontal overflow, page errors or HTTP failures observed during the audit.
- Corrected browser preview: all 12 tab/width combinations passed the same checks and axe WCAG A/AA plus best-practice checks with zero reported violations, including contrast. Mobile screenshot and print-media screenshot reviewed. This does not replace screen-reader testing or establish field Core Web Vitals.
- No historical screenshots exist: visual regression comparison is inconclusive. Current-layout and interaction checks pass.
- `git diff --check` and executable inline-script syntax checks pass. Static app has no build step.

## Remaining limits and critique

1. **Lead receipt is not acknowledged.** Cross-origin Google Forms iframe cannot confirm a response was stored. Offline/synchronous errors are fixed, but rejection after navigation remains invisible. A same-origin endpoint returning a verified result is needed for reliable lead delivery; receipt and follow-up email remain unverified.
2. **Four tools share starting inputs, not a two-way budget.** A GC quote, custom loan or diligence spending does not automatically change Spec profit. Copy now makes this explicit. A future explicit “apply agreed quote” action would reduce manual transfer mistakes; silent synchronization would risk double-counting fees/design/diligence.
3. **Models are estimates.** Uniform monthly draws, closing-month carry, reserve priority, unchanged design during overruns, fixed-price design-build, and loss sharing are deliberate simplifications. Real contracts/lender draw policies can differ. Grade and land-value bands are internal screening heuristics, not market validation or loan approval.
4. **LOI remains a draft.** Some provisions, including exclusivity, may be binding. Actual signed agreement dates and negotiated deposit/contingency terms control. Automated field completeness cannot certify enforceability.
5. **Coverage is bounded.** No live Google Form submission, email delivery, screen-reader session, historical visual comparison or real-user performance study was performed. Print CSS was visually checked; a physical printer was not tested.

Primary references consulted: [CFPB construction-loan disclosure guidance](https://www.consumerfinance.gov/rules-policy/regulations/1026/37/) supports interest-only construction phases; [OCC commercial real-estate lending handbook](https://www.occ.gov/publications-and-resources/publications/comptrollers-handbook/files/commercial-real-estate-lending/pub-ch-commercial-real-estate.pdf) describes interest reserves and underwriting constraints; [AIA A102 instructions](https://help.aiacontracts.com/hc/en-us/articles/1500009828181-instructions-a102-2017-standard-form-of-agreement-between-owner-and-contractor-where-the-basis-of-payment-is-the-cost-of-the-work-plus-a-fee-wi) identify contract-specific savings participation. These support the stated modeling concepts, not a guarantee that any particular deal or agreement is acceptable.
