# Card network mapping for dispute evidence

This maps the ext-disputes tier 1 reason codes to Visa and Mastercard
dispute codes, and lists what card rules ask of a merchant that the
evidence triple does not carry. It started in
[agentcommercekit/ack#217](https://github.com/agentcommercekit/ack/issues/217).

Visa text is quoted from the Visa Core Rules and Visa Product and
Service Rules, 18 April 2026 edition, by rule ID, so every line can be
checked. I could not get the current Mastercard Chargeback Guide. The
Mastercard column comes from acquirer and vendor docs and is marked
that way. Which code an issuer picks for a given case is judgment. No
network publishes this mapping.

## What Visa already says about agent transactions

Section 4.1.24 of the Visa rules defines the Agentic Payment Provider
(the agent app). Before an agent buys, the provider must "Clearly
state the expiration date of the Cardholder-defined payment
instruction" and get the cardholder's acknowledgement that they are
responsible for the provider's actions (ID 0031169). When it stores a
credential for future purchases, it must also get consent to the
agreement's terms and "retain this information for the duration of the
agreement and provide it to the Cardholder or Issuer upon written
request" (ID 0031169).

When it buys, the provider must "Use only the Cardholder-defined
criteria for purchasing the goods or services" and pass the
cardholder's name, billing and shipping address, and email to the
merchant (ID 0031170). For repeated purchases, it keeps going only
until the cardholder cancels or "The Cardholder's payment instruction
expires" (ID 0031175).

Two rules decide who carries the loss:

- "A Cardholder is responsible for any actions taken by an Agentic
  Payment Provider as part of an Agentic Transaction as if the
  Cardholder initiated the Transaction." (ID 0031176)
- The issuer must pay for "An Agentic Transaction processed in
  accordance with a Cardholder's payment instructions" (ID 0006558).

My reading, not Visa's words: inside the instruction, the loss sits
with the cardholder and issuer. Outside it, the rules say nothing. The
ext-disputes delta marks part of that line, the part that can be
checked by comparing fields. Category and intent are also in the
cardholder's instruction, and ext-disputes leaves them out on purpose
(Sections 5.3 and 5.4).

The dispute chapter has no agent reason codes. Agent mentions there
are limited to Compelling Evidence 3.0, covered below. So an issuer
has to force each agent case into the nearest existing code, which is
the gap the README names. The table is a guess at where they land.

## Reason code mapping

One table per tier 1 code. The Mastercard column comes from secondary
sources, as noted above.

### `scope-exceeded`

| Case | Likely Visa code | Likely Mastercard code (secondary sources) | What the merchant must show | Does grant plus receipt cover it |
|---|---|---|---|---|
| On `constraints.maxAmount` | 12.5 Incorrect Amount | 4834 | "Transaction Receipt ... or other record to prove that the Transaction amount was correct" (ID 0030301). The acquirer must also present the exact amount authorized "in accordance with a Cardholder's payment instructions" (ID 0008358) | The receipt covers the amount. The grant hurts the merchant: it shows the amount broke the cardholder's limit |
| On another constraint (recipient, any field in both grant and payment request) | 10.4 Other Fraud, Card-Absent | 4837 | That the cardholder authorized it | No. The grant shows the constraint was broken |

### `grant-expired`

| Case | Likely Visa code | Likely Mastercard code (secondary sources) | What the merchant must show | Does grant plus receipt cover it |
|---|---|---|---|---|
| Repeated purchase | 13.2 Cancelled Recurring | 4853 | That the authority was live when charged | No. A verified artifact already proves it was not |
| One-off | 10.4 | 4837 | That the cardholder authorized it | No, same reason |

### `audience-mismatch`

| Case | Likely Visa code | Likely Mastercard code (secondary sources) | What the merchant must show | Does grant plus receipt cover it |
|---|---|---|---|---|
| Any | 10.4 | 4837 | That the cardholder authorized this merchant | No. The grant proves the opposite |

### `unauthorized-agent`

| Case | Likely Visa code | Likely Mastercard code (secondary sources) | What the merchant must show | Does grant plus receipt cover it |
|---|---|---|---|---|
| Any | 10.4 | 4837 | That the cardholder authorized the agent that placed it | Not alone. The cardholder's acknowledgement and agreement terms sit with the agent provider, which owes them to the issuer, not the merchant (ID 0031169) |

On a repeated purchase, a verified `grant-expired` artifact means the
provider kept charging after the instruction expired, which ID 0031175
says it must not do. That duty is the provider's, not the merchant's.
The merchant still holds the disputed charge.

## Who brings what

The grant carries authorization scope: `aud`, `scope`, `constraints`,
`exp`. It does not carry cardholder details, and it should not. The
name, address and email Visa requires under ID 0031170 come from the
checkout flow the agent uses. The evidence triple stays scope only.

The merchant still has a gap on its own side. It receives the
cardholder details at checkout but not the instruction's limits or
expiry, so it cannot check a constraint it never saw, and cannot prove
later that it did. The receipt's `ack.grant` hash already makes the
fix cheap: the agent passes the grant, or its hash plus the constraint
fields, at checkout, and the merchant stores it with the order.

The cost, stated openly: the merchant now holds a signed statement of
the cardholder's limits. In a 12.5 dispute that statement is evidence
against it.

## Known incompatibility: CE 3.0 device signals

For a 10.4 dispute, the merchant's strongest defense is Compelling
Evidence 3.0 (Table 11-28). For disputes processed on or after
24 October 2026, the merchant shows two prior undisputed transactions
on the same card, "processed more than 120 calendar days before the
Dispute was submitted", where "The device ID/fingerprint, or the IP
address and an additional one or more" elements match.

Visa defines each signal as the cardholder's own: "IP address must be
the Cardholder's public IP address", and device ID and fingerprint are
"a unique identifier of the Cardholder's device". The same update adds
"login IDs for an Agentic Payment Provider" to the list of extra
elements. That helps, but only as the second element. The device or IP
match is still required.

An agent order arrives from the agent platform, so the IP and device
on the transaction are the platform's. The cardholder's device shows
up at setup, when the provider verifies identity, not at purchase.
This should be documented as a known incompatibility, not routed
around. Passing the setup device off as the purchase device would be
worse than leaving the gap open.

Mastercard's First-party Trust program has the same shape (device
group, delivery group, one more factor), per vendor docs.

## Evidence expiry

This reopens settled decision 7 ("Evidence expires. 90-day SHOULD")
and answers the README's open question on the window, for card rails.

The clash is in Section 9: "A resolver SHOULD reject evidence filed
more than 90 days after the receipt's `iat`". Visa lets an issuer open
a 10.4 dispute up to "120 calendar days from the Transaction
Processing Date" (ID 0030255). A cardholder who files on day 100 is
inside Visa's window and outside ext-disputes. The 90 day SHOULD on
`exp` in Section 4.2 counts from the filing, so it is a separate
question.

My recommendation is to drop the fixed filing limit in Section 9 and
let the applicable dispute window set it. Bumping 90 to 120 fixes 10.4
today and breaks again the first time a network or a code runs
longer.

The cost, stated openly: with no fixed limit, a resolver has to know
the rail's window to judge whether a filing is late. That is policy,
and it belongs above the protocol, which matches the "Evidence, not
verdicts" guideline.

## The merchant needs the opposite result

A `dispute+jwt` proves the agent went out of bounds. In a card
dispute that is the cardholder's case. The merchant wins representment
by proving the purchase was inside the instruction, which is ID
0006558's own test.

Same grant, same receipt, same verification path, zero deltas. Section
4.3 requires one or more delta entries, so that result has nowhere to
live today. Open decision 3 already names the shape, a
`counter-dispute+jwt` carrying "the merchant's evidence that the grant
was satisfied". The card rules are a reason to define it rather than
leave it to the resolution layer. That changes the output model, so it
stays a design question on #217, not part of this doc.

## What I could not confirm for Mastercard

I found no published Mastercard dispute rule for agent transactions.
Agent Pay and agentic tokens were announced as rules and checkout
standards in January 2026. Verifiable Intent, announced in March 2026,
is pitched as a dispute audit trail, with no stated place in
chargeback rules. Anyone with the current Chargeback Guide should check
the Mastercard column against it.

## Sources

- Visa Core Rules and Visa Product and Service Rules, 18 April 2026:
  https://usa.visa.com/dam/VCOM/download/about-visa/visa-rules-public.pdf
  (IDs 0006558, 0008358, 0030255, 0030301, 0031169, 0031170, 0031175,
  0031176; CE 3.0 in Table 11-28)
- Mastercard reason codes overview:
  https://chargebacks911.com/chargeback-reason-codes/mastercard/
- Visa CE 3.0 and Mastercard First-party Trust evidence:
  https://developers.justt.ai/docs/visa-ce-30-mastercard-fptp-evidence-guide
- Mastercard First-party Trust:
  https://b2b.mastercard.com/news-and-insights/blog/how-mastercard-s-first-party-trust-program-will-combat-the-surging-trend-in-first-party-fraud
- Mastercard Verifiable Intent:
  https://www.pymnts.com/mastercard/2026/mastercard-unveils-open-standard-to-verify-ai-agent-transactions/
- Worldpay on agent liability:
  https://worldpay.com/insights/articles/agentic-commerce-liability-is-still-being-written
