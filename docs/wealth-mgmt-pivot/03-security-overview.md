# MonkFlow — Security & Data-Handling Overview

> **Audience:** RIA Chief Compliance Officer or operations manager
> evaluating MonkFlow as a vendor. **Goal:** answer the "what happens
> to client PII" question before they have to ask. **Length:** 1 page,
> readable in 90 seconds, no buzzword bingo.
>
> Convert to PDF. Brand consistently with monkflow.io. Include a
> dated "last updated" footer. Update whenever sub-processors change.

---

## Position

MonkFlow is a **workflow layer, not a data store.** Client data
collected through MonkFlow-built intake forms moves directly into
your CRM (Redtail / Wealthbox / Salesforce FSC) and is **not**
persisted on MonkFlow infrastructure beyond the implementation
window. We are not a database for your client data — we are the
plumbing that gets it from the form into your authoritative system
of record.

---

## In transit

- **TLS 1.2+** required for all API endpoints, intake forms, webhook
  handlers, and admin tooling.
- HSTS enforced on all monkflow.io subdomains.
- No HTTP-only fallback paths.

## At rest

- Postgres 15 hosted on Railway (US-East). AES-256 encryption at the
  storage layer (cloud provider default).
- Backups: daily snapshots, 14-day retention, encrypted with the same
  key.
- Form submissions are processed in-memory and written to your CRM
  via API. They are NOT persisted to MonkFlow's database in the
  steady-state architecture. (Implementation-window exception below.)

## Implementation window

During the 14- to 28-day implementation phase, MonkFlow may
temporarily store intake-form submissions for debugging and QA. This
is:

- **Time-bounded:** purged at project go-live unless your engagement
  letter specifies otherwise
- **Encrypted at rest** as above
- **Access-restricted:** founder access only

After go-live, MonkFlow's role is API integration and form rendering.
Client PII flows: form → MonkFlow webhook → your CRM. We don't keep
a copy.

---

## Access controls

- **Single operator** — Nathan Linder, founder. No employees, no
  contractors with production access today.
- **2FA required** on all admin tooling (Railway, Resend, Anthropic,
  Postgres console, GitHub).
- **No shared credentials.** Each sub-processor has its own
  least-privilege key/token.
- **Production database access** is logged. Connection strings are
  rotated on every team-size change.

---

## Sub-processors

| Vendor | Role | Where data lives |
|---|---|---|
| Anthropic | AI-generated intake-form personalization (no client PII) | US |
| Resend | Transactional email delivery | US |
| Railway | Application hosting | US |
| Postgres (managed by Railway) | Application database | US |
| Unipile | LinkedIn outreach automation (no client PII) | EU |
| Stripe | Project billing (no client PII) | US |

Sub-processor list updated quarterly. Material changes communicated
to active clients within 30 days.

---

## Incident response

- **Direct contact:** Nathan Linder, nathan@mail.getmonkflow.com,
  phone on file with each client.
- **Notification SLA:** within 24 hours of confirmed breach affecting
  client data.
- **Forensics:** logs retained for 90 days; longer on request.

---

## What we don't do (yet)

Honesty is the policy here. As of the engagement, MonkFlow is:

- **Not SOC 2 certified.** Roadmap target: Type 1 readiness by EOY 2026.
- **Not HIPAA-covered.** RIAs aren't HIPAA-covered entities, so this
  isn't blocking — but flagged for transparency.
- **Solo-operator.** Single point of failure on operational continuity.
  Mitigation: quarterly engagement-handoff documentation; named
  contractor on file for operational continuity in the event of
  founder unavailability.
- **Not yet covered by cyber liability insurance.** Quote on file
  with Hiscox; bound on first paid engagement.

---

## What you can ask for

- Sub-processor list at engagement signing (inventoried above)
- DPA template (separate document; signed prior to any production data flow)
- Detailed sub-processor access matrix on request
- Architecture diagram on request

---

## Approval & contact

To engage MonkFlow on a project, your firm's CCO can sign the DPA
(separate document) and the engagement letter. No vendor questionnaire
process required for state-registered RIAs in the productized tiers
(see monkflow.io/#wealth-intake for tier definitions).

For SEC-registered firms or firms requiring a SIG Lite-or-equivalent
vendor questionnaire: please contact Nathan to discuss timing.
Productized tiers may not be the right fit; custom engagement
preferred.

---

*Last updated: 2026-04-29 · Nathan Linder · MonkFlow · monkflow.io*
