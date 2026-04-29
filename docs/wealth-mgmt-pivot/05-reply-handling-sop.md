# Reply-Handling SOP — Wealth-Mgmt Outreach

> **When a real RIA replies to MonkFlow's cold outreach (email or
> LinkedIn DM), you have ~24 hours before the response goes stale.**
> This SOP is the decision tree. Print it, pin it next to your
> monitor, or paste into Notion. Update with new patterns as they emerge.

---

## Step 1 · Triage within 4 hours

Notification arrives via Pushover (positive sentiment) or DB triage card
(any reply). First 4 hours from receipt:

1. Open the reply text + the prospect's outreach_lead row in admin
2. Skim: name, firm, current CRM, observation we made in the cold email
3. Categorize using the decision tree below
4. Send first response (template + minimal personalization)

**If you cannot respond within 4 hours**, send a 1-line "got it,
following up tomorrow" holding reply within the same business day.
Silence past 24 hours = the prospect mentally moves on.

---

## Step 2 · Decision tree

### Pattern A — "Send it." / "Yes please." / explicit interest in the deliverable

**Probability:** highest-intent reply category. ~30-40% of responders.

**Response (within 4 hours):**

```
Subject: Re: [thread subject]

Hey {firstName},

Sending now — attached.

Quick context: this is the 1-pager I built specifically for advisor
firms. The TFS case study at the bottom is the closest analog to
{firmName}'s setup if you're on Redtail (or close — Wealthbox is the
same architecture).

If anything in there resonates, here's a 90-min Onboarding Audit at
$1,500 — refundable against any project tier. monkflow.io/#wealth-intake

Or just reply with questions. No pressure.

Nathan
```

**Attach:** the 1-pager PDF (`docs/wealth-mgmt-pivot/01-intake-forms-1pager.md` rendered)
**Loom (optional, +30%):** 90-second personalized intro referencing their firm name + diagnosis-detected gap.

### Pattern B — "Send me more info" / "tell me more" / soft positive

**Probability:** ~20-25% of responders.

**Response (within 4 hours):**

```
Hey {firstName},

Happy to. Two quick things:

1. The 1-pager I mentioned — attached. Walks through the 3
   automations in 2 minutes.
2. The TFS case study (4-advisor RIA in Dallas, real client) is at
   monkflow.io/team-financial-strategies — same workflow you'd see
   if we built for {firmName}.

If you want to dig into specifics, $1,500 Onboarding Audit gets you
a 90-min Loom walkthrough of your current flow + a written report on
the 3 highest-ROI fixes. Refundable against any project. Book at
monkflow.io/#wealth-intake.

Or just reply with whatever questions surface. No pressure.

Nathan
```

### Pattern C — "What's it cost?" / pricing question

**Probability:** ~15% of responders. High intent, asking for the close.

**Response (within 4 hours):**

```
Hey {firstName},

Public pricing on the page — three tiers:

  $1,500   Onboarding Audit (7-day delivery, refundable against any project)
  $7,500   Intake Pro: digital intake + one CRM sync (Redtail, Wealthbox, or SF FSC), 14-day delivery
  $14,500  Onboarding System: TFS scope — intake + CRM sync + signed-PDF + reminders + IPS draft, 28-day delivery

Founding-partner option (May 2026 only): Tier 3 at $5,000 in exchange
for a written case study + 30-min joint testimonial + reference-call
permission. monkflow.io/#wealth-intake

Want a 15-min call to figure out which tier fits {firmName}?
monkflow.io/#schedule

Nathan
```

### Pattern D — "We already use [X CRM/tool]"

**Probability:** ~10% of responders. NOT a no — they're testing fit.

**Response (within 4 hours):**

```
Hey {firstName},

Good — that's actually the easier path. {X} is solid; the gap is
usually the form-to-{X} bridge, not {X} itself.

For TFS we built on top of Redtail without replacing anything they
were using. Same approach for {X}: keep your CRM, add the digital
intake + auto-sync layer in front of it. Two-week build.

Want a 15-min call? I can show you what the integration looks like
specifically for {X}. monkflow.io/#schedule

Nathan
```

### Pattern E — "Not interested" / "remove me" / unsubscribe

**Probability:** ~15% of responders.

**Response:** Do NOT respond. The webhook + reply-detector already
marks `status='closed'` and removes from sequence. Respect the
boundary. **Do not try to "win them back."**

**Internal:** verify in admin that the unsubscribe processed. If the
reply text says "unsubscribe" but `status` is still `active`, manually
mark it closed.

### Pattern F — Out-of-office / vacation auto-reply

**Probability:** ~5% of responders.

**Response:** Do NOT respond. The reply-detector classifies as
`reply_sentiment='ooo'` and reschedules `next_followup_at` to
+7 business days. Resume normal cadence after.

### Pattern G — Wrong person ("I'm not the decision maker")

**Probability:** ~5% of responders.

**Response (within 4 hours):**

```
Hey {firstName},

Appreciate the heads-up. Who's the right person at {firmName} for
new-client onboarding workflow / CRM ops? Happy to circle back to
them directly.

Nathan
```

### Pattern H — Hostile / aggressive

**Probability:** rare (<1%). Usually triggered by spam-folder-then-
saw-it pattern.

**Response:** Acknowledge briefly, mark closed, never engage further.

```
Hey {firstName},

Apologies for the cold reach. Removing you from the list — won't
hear from me again.

Nathan
```

Mark `status='closed'`, mark sender_email in your personal blocklist.

---

## Step 3 · After-response logging

For every responded reply:

1. Update `outreach_leads.triage_status` (UI buttons: `booked` /
   `not_interested` / `snoozed` / `closed`)
2. If meeting booked: add to your personal CRM (Pipedrive / Notion /
   spreadsheet — whatever you're using; do NOT use MonkFlow's outreach
   tables for active opportunity tracking)
3. If audit/project signed: archive the thread in Mail.app + start
   the project channel in your delivery tool

---

## Step 4 · Follow-up cadence after first response

| Their response | Your follow-up |
|---|---|
| No reply within 5 business days | One bump: "Hey {firstName}, did this land? Reply yes/no/whenever." |
| Booked but no-show | One reschedule offer; if no response, mark `closed` |
| Audit booked + delivered | Day 7 post-delivery: ask for project decision. Day 14: final follow-up. Day 30: audit refund offer expires. |
| Project signed | n/a — switch to project SOP |

---

## What NOT to do

- Don't write a custom 4-paragraph response when a template fits.
  The prospect is comparing you against 10 other vendors who
  responded with templates. Speed beats artistry.
- Don't apologize for the cold reach unless they're hostile (Pattern H).
- Don't undersell the price. The Audit at $1,500 is the entry point;
  the productized tiers are not negotiable except via the Founding
  Partner program.
- Don't hop on a discovery call without a paid audit OR a clear
  signal that the prospect is ready for a project quote. "Free
  consultation" is for the website CTA, not for engaged replies —
  $1,500 audit is the right anchor for engaged replies.
- Don't promise functionality you haven't built. If they ask "do you
  do X?", honest answer: "Not today — could be added in the project
  scope. Want to talk through it on the audit call?"

---

*Last updated: 2026-04-29 · Update with new patterns as they emerge*
