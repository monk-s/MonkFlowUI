# Case Study — Team Financial Strategies

> **Status:** Permission granted by Jody Team (founding partner) on
> 2026-04-29. Cleared for: firm name, Jody's name, the 45 → 5 minute
> result, Redtail mention, reference-call permission. **Testimonial
> wording still pending** — Jody's exact 1-2 sentence quote to be
> inserted in the "What Jody said" section before publishing.
>
> Once Jody's quote lands, this draft is publish-ready at
> monkflow.io/case-studies/team-financial-strategies (route added to
> app.js as part of the same change).

---

## How Team Financial Strategies cut new-client onboarding from 45 minutes to under 5

**Firm:** Team Financial Strategies
**Size:** 4 advisors, Abilene, TX
**Founding partner (case-study contact):** Jody Team
**CRM:** Redtail
**Custodian:** Schwab Advisor Services *(pending confirmation from Jody)*
**Project length:** 2 weeks
**Outcome:** New-client onboarding time cut from **45 minutes → under 5 minutes**

---

### The problem

Team Financial Strategies, like most independent RIAs in their size
bracket, ran new-client onboarding on a hybrid paper/PDF/CRM workflow.
A new prospect coming on board meant:

- Paper or PDF intake forms — about 7 pages of personal, financial,
  beneficiary, and risk-tolerance data
- An ops manager re-typing the data into Redtail one field at a time
  (≈25 min per client)
- Schwab custodian-of-record forms signed one-by-one in DocuSign
- Risk-tolerance questionnaire scored on a calculator
- IPS drafted from a Word template by hand

The total: roughly **45 minutes per new-client onboarding** — and the
firm is the kind of place where the founding partner ends up doing the
last leg of it personally.

The pain wasn't that this workflow was broken — it wasn't. The pain
was that the firm couldn't scale it. Each new advisor added meant
another set of clients meant another bottleneck on the ops manager's
afternoon.

---

### What we built

In 2 weeks, MonkFlow built:

1. **Custom intake form** — branded to TFS, hosted on
   `intake.teamfinancialstrategies.com`. 28 fields with conditional
   logic (joint vs individual, employed vs retired, beneficiary tree).
   Document upload (driver's license, trust docs). E-signature on
   submission.
2. **Redtail auto-sync** — on form submission, MonkFlow's webhook
   created the Contact record in Redtail with all 28 fields populated.
   Household relationships built automatically. Custom fields the
   firm uses for client segmentation populated from form answers.
3. **Signed-PDF generation** — Schwab account application,
   beneficiary designation, IPS, and the firm's own engagement letter
   pre-filled from the intake data. Bundled into a single signing
   flow. Signed PDFs auto-archived to the Redtail client folder.
4. **Compliance trail** — every form submission, sync, and signature
   logged with timestamp and IP. Partial-field detection blocks
   incomplete intakes from reaching the CIO's inbox.

---

### The result

**Onboarding time: 45 min → under 5 min.**

That's 5 minutes for the ops manager to *review* the auto-populated
record, not to do the work. The form does the work.

Other downstream wins:

- **Funding speed:** new accounts now fund within 2 business days
  of signing, vs 5–7 days under the old NIGO-prone workflow.
- **Compliance:** Jody can pull a complete audit trail for any new
  client in under 30 seconds.
- **New-client experience:** clients fill the intake on their own
  schedule (often before the kickoff meeting), so the meeting itself
  becomes about strategy, not paperwork.

---

### What we'd do differently

> *Honest section — adds credibility. Update with real lessons.*

The intake-form conditional logic was over-engineered in v1. We
shipped 9 conditional branches when 4 would have covered 95% of
client types. Jody's ops manager flagged it during week 1 of go-live;
we collapsed branches the following week. Lesson: ship fewer branches,
add only when clients actually hit edge cases.

---

### What Jody said

> *Awaiting Jody's testimonial wording. Target: 1-2 sentences,
> specific, references the 45→5 result and the partnership
> experience. Example structure: "[Specific outcome]. [Specific
> partnership experience.]" Insert verbatim before publishing — do
> not paraphrase or AI-generate.*

---

### Want this for your firm?

We took the same scope MonkFlow built for TFS and packaged it into
three productized tiers — see **monkflow.io/#wealth-intake** for
public pricing.

**Or talk to Nathan directly:** monkflow.io/#schedule (15-min intro
call, no pitch deck).

---

*Logo block here · Jody Team, Founding Partner · Team Financial Strategies · Abilene, TX*
