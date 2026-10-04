# Edge cases and failure classes

How community feedback on [x402#3500](https://github.com/x402-foundation/x402/issues/3500)
evolves the dispute evidence proposal across all three protocols.

The original proposal covers one failure class: **scope violation** (the
agent exceeded its authorization). The x402 thread surfaced three more,
each with a different verification model. Together they define the full
shape of what dispute evidence needs to handle.

## Failure class taxonomy

| # | Class | Description | Who surfaced | Tier |
|---|---|---|---|---|
| 1 | **Scope violation** | Agent exceeded a grant constraint | Original proposal | 1 (mechanical) |
| 2 | **Decision integrity** | Agent's own pre-payment evaluation was wrong or stale | Shxnque (x402#3500) | 1-2 (recomputable) |
| 3 | **Information integrity** | Agent acted correctly on bad information (wrong counterparty, drifted price) | unblinkr (x402#3500) | 2 (attested) |
| 4 | **Aggregate violation** | Each payment is in-scope individually, but the set exceeds a period budget | ty-everett (x402#3500) | 3 (aggregate) |
| 5 | **Delegation scope** | Intermediate link in a delegation chain grants more authority than it received | Analysis | 1-3 (chain completeness) |
| 6 | **Settlement integrity** | Receipt claims settlement, chain disagrees | Analysis | 2-4 (boundary case) |

### Out of scope (resolution layer)

| Class | Description | Why excluded |
|---|---|---|
| **Delivery mismatch** | Paid for X, received Y | Requires subjective evaluation — tier 5 |
| **Intent mismatch** | Agent bought within scope but user didn't want it | Grant-authoring problem, not evidence problem |

## Class 1: Scope violation (original)

**Shape:** Grant says X, receipt says Y, X ≠ Y.

**Example:** Grant allows max $100. Agent pays $450. Delta: `{field:
"constraints.maxAmount", authorized: "100", actual: "450"}`.

**Verification:** Mechanical. A resolver extracts the named field from
the embedded grant and receipt, confirms the values differ. No external
state. Works offline.

**Protocol mapping:**

| Protocol | Authorization artifact | Action artifact | Binding |
|---|---|---|---|
| ACK | Grant (JWT, `constraints.*`) | Receipt (`ack.grant` hash) | Content hash — exists today |
| MPP | *Proposed* auth scope on credential | Receipt (`authorization` hash) | Content hash — proposed |
| x402 | *Proposed* `agent-authorization` extension | Receipt (`authorizationRef` hash) | Content hash — proposed |

**Reason codes (Tier 1 — mechanical):**
- `scope-exceeded` — amount, recipient, or any mechanically comparable constraint
- `grant-expired` — grant `exp` < receipt `iat`
- `audience-mismatch` — payment went to a counterparty not in the grant's `aud`
- `unauthorized-agent` — receipt names an agent the principal didn't authorize

**Status:** Fully specified in ext-disputes.md. The four reason codes,
delta format, and five-step verification checklist are complete.

## Class 2: Decision integrity (Shxnque)

**Shape:** Grant says max $0.10. Offer says $5.00. Agent's decision
engine evaluated `{constraint: max_price=0.10, proposed: 5.00}` and
the deterministic result is BLOCK — but the agent paid anyway.

**What's new:** The original triple (auth scope + action + delta) can
express that $5.00 > $0.10. What it can't express is: *the agent's own
evaluation of its constraints against this specific action should have
produced BLOCK*. The mismatch isn't just between grant and receipt — it's
between what the agent should have decided and what it actually did.

**The decision record (leg 3):**
Shxnque proposed that dispute evidence bind a third artifact: the
agent's **authorization decision record** — a recomputable hash over
`{constraint, proposed_action, policy_engine_version}` plus the verdict
(PASS/REVIEW/BLOCK).

This makes the dispute stronger than "the values don't match":
- A resolver can replay the decision: given these inputs and this engine
  version, confirm the verdict is BLOCK.
- A resolver can't with just the delta — the delta says the values
  differ, but doesn't say the agent had the information to know that.

**Open questions from the thread:**

1. **Does `input_snapshot_hash` include the offer?** (My Q1 to
   Shxnque.) If yes, the decision record proves the agent saw *this
   specific offer* and still proceeded — tighter binding but couples the
   record to x402's artifact shape. unblinkr's counterparty case
   effectively answers this: yes, include the offer, because "wrong
   counterparty" disputes need it.

2. **Engine version pinning.** (My Q2 to Shxnque.) The resolver needs
   the same policy engine version to replay the decision. If the engine
   has been updated between decision time and dispute time, the version
   must be pinned in the hash. Shxnque hasn't responded yet. unblinkr
   suggests a registry of engine versions with their canonicalization
   rules.

**Verification:** Recomputable. Stronger than mechanical (the resolver
can confirm the agent *should have known*), but requires either:
- The resolver can run the same decision engine version, OR
- The resolver trusts an attestation that the decision was deterministic

**Protocol mapping:**

| Protocol | Where the decision record lives | What it binds |
|---|---|---|
| ACK | New field on dispute evidence: `evidence.decision_record` | Grant constraints + receipt payment details + engine version |
| MPP | Same — embedded in dispute extension | Auth scope constraints + challenge request + engine version |
| x402 | Same — embedded in dispute extension | Agent-authorization constraints + PaymentRequired fields + engine version |

**Impact on ext-disputes.md:**
- The evidence object (§4.3) would gain an optional `decision_record`
  field alongside `grant`, `receipt`, and `delta`.
- The verification checklist (§6) would gain an optional Step 4b:
  verify the decision record's hash is consistent with the embedded
  inputs.
- The reason codes don't change — `scope-exceeded` still applies,
  but the decision record strengthens the evidence.

## Class 3: Information integrity (unblinkr)

**Shape:** Grant says max $5.00. Offer says $5.00. Agent pays $5.00.
Receipt matches offer. Every artifact agrees. But the `pay_to` in the
offer was wrong — it pointed to an address that doesn't match the
endpoint's settlement history. The agent acted correctly on bad
information.

**What's new:** This is fundamentally different from scope violation.
The grant-receipt pair shows no mismatch. The violation is between the
offer and an external fact (settlement history). The evidence is
*outside* the artifact chain.

**Two new reason codes:**

| Code | Description | Evidence source |
|---|---|---|
| `counterparty_mismatch` | `pay_to` at decision time differs from the endpoint's settled history | Settlement history attestation |
| `offer_drift` | `price`/`asset` at decision time differs from the offer bound in the receipt | Offer snapshot vs receipt-bound offer |

**unblinkr's data point:** A crawl of ~14K Bazaar endpoints logged 272
`pay_to` changes and zero confirmed attacks — mostly legitimate key
rotation. So `counterparty_mismatch` needs a settlement-history
reference, not just "the address changed." This means the reason code
carries an attestation from a party that can speak to the endpoint's
history — something neither the facilitator nor the payer can provide
from their own artifacts alone.

**The mechanical-vs-attested split:**

This drives the tiered reason code model I proposed in the thread:

**Tier 1 (mechanical).** The existing four codes. Resolver extracts
fields from embedded artifacts and compares. No external data. Works
offline. A resolver that only trusts what's inside the artifact can
evaluate these.

**Tier 2 (attested).** Codes like `counterparty_mismatch` and
`offer_drift`. The reason code carries an `attestation` field: who
attested, what type, and a reference to their signed artifact.

```json
{
  "reason": "counterparty_mismatch",
  "tier": 2,
  "attestation": {
    "source": "did:web:...",
    "type": "settlement-history",
    "ref": "kQ3v...",
    "observation_window": { "start": "2026-01-15T00:00:00Z", "end": "2026-09-22T14:00:00Z" },
    "as_of": "2026-09-22T14:00:00Z"
  },
  "delta": [{
    "field": "pay_to",
    "observed": "0xabc...",
    "historical": "0xdef..."
  }]
}
```

An attester MAY omit `observation_window` and `as_of`. If present,
`observation_window` MUST NOT be wider than the period actually
observed, and `as_of` MUST NOT be later than the time the attestation
was produced — inflating either is a false statement in a signed
artifact. A resolver that wants a minimum-coverage policy can use them;
one that doesn't can ignore them.

**Key design rule:** Tier 2 never weakens Tier 1 verification. If a
resolver doesn't understand attestations, the mechanical codes still
work exactly as before. The attested layer is additive. This follows
the `crit` pattern from ACK-ID grants — attested codes name their
source, and the resolver ignores what it can't evaluate.

**Verification:** Attested. The resolver must trust the attestor to
evaluate the code. A resolver that doesn't trust the attestor skips the
code but can still evaluate any Tier 1 codes in the same dispute.

**Protocol mapping:**

| Protocol | Where attestation comes from | What it attests |
|---|---|---|
| ACK | Third-party verifier (not the grant issuer or receipt issuer) | Settlement history of the `aud` / merchant |
| MPP | Third-party verifier | Settlement history of the challenge `realm` / recipient |
| x402 | Third-party verifier (not the facilitator — it only sees its own settlements) | Settlement history of the `payTo` endpoint |

**Impact on ext-disputes.md:**
- Reason code registry (§5) gains a `tier` field on each code.
- New §5.3 defines the attestation schema for Tier 2 codes.
- Verification checklist (§6) gains a conditional Step 6: for Tier 2
  codes, resolve the attestor identity and verify the attestation
  signature. A resolver MAY skip this step.
- §5.2 (extensibility) already says unrecognized codes don't cause
  rejection — this naturally accommodates Tier 2 codes that a resolver
  can't evaluate.

## Class 4: Aggregate violation (ty-everett)

**Shape:** Grant allows max $100 per payment and $150 per period. Agent
makes two concurrent payments of $80 each. Each is under the per-payment
cap. Together they exceed the period budget. Neither receipt, examined
alone, shows a violation.

**What's new:** This is the first failure class that requires
**multiple receipts** to express. Classes 1-3 are all single-receipt
disputes — one grant, one receipt, one delta. Class 4 needs: one grant,
N receipts, and a sum that exceeds a constraint.

**The completeness problem:**

A resolver can verify `sum(receipts) > budget` — that's mechanical
given the receipts. What it can't verify is **completeness**: "these are
all the receipts against this grant in this period." A dishonest
disputant could omit receipts to push the total below the budget, or add
fabricated ones to push it above.

Completeness requires someone to attest that the submitted set is the
full set. Candidates:

| Attestor | What they can attest | Limitation |
|---|---|---|
| Facilitator | All settlements it processed for this grant | Only sees its own settlements — multi-facilitator grants break this |
| Agent | All payments it made against this grant | Self-interested party — can omit or fabricate |
| Ledger / chain | All on-chain transfers from the grant's funding source | Only works for on-chain-settled payments |
| Grant issuer (principal) | The usage state they observed | Also self-interested, but they're the disputant |

No single party can provide completeness attestation across all cases.
This is inherently attested, not mechanical.

**A new reason code:**

```json
{
  "reason": "period_budget_exceeded",
  "tier": 3,
  "grant_id": "...",
  "period": {"start": "...", "end": "..."},
  "budget": "150000000",
  "receipts": ["receipt_hash_1", "receipt_hash_2"],
  "total": "160000000",
  "completeness_attestation": {
    "source": "did:web:...",
    "type": "grant-usage-log"
  }
}
```

The mechanical part (`sum > budget`) is verifiable from the embedded
receipts. The completeness claim (these are all the receipts) is
attested. A resolver that trusts the attestor evaluates the full dispute.
One that doesn't can still confirm "at minimum, these submitted receipts
alone exceed the budget" — which is sufficient for the dispute.

**Concurrency and fault assignment:**

ty-everett's case has a concurrency dimension: two payments that raced.
If the agent's decision record (Class 2) includes the usage state it
observed at authorization time (`usage_at_decision: 80, remaining: 70,
proposed: 80`), a resolver can distinguish:

- **Agent was careless:** Usage was 80, remaining was 70, proposed was
  80. Agent should have seen `80 > 70` and blocked. → Agent fault.
- **Agent raced:** Usage was 0 when agent checked, another payment
  landed concurrently, bringing total to 160. The agent's snapshot was
  correct at decision time. → Race condition, unclear fault.

This distinction only exists if the decision record captures the usage
state. Without it, aggregate disputes collapse into "the total is too
high" with no assignment of how it got there.

**Protocol mapping:**

| Protocol | Budget concept | Completeness source |
|---|---|---|
| ACK | `constraints.totalBudget` on grants | Grant issuer's usage log, or chain state |
| MPP | Subscription `count`/`interval` on charge intents | Server's challenge-receipt log |
| x402 | `totalBudget` on proposed `agent-authorization` | Facilitator's settlement log, or chain state |

**Impact on ext-disputes.md:**
- Evidence object (§4.3) gains `evidence.receipts` (array) as an
  alternative to the single `evidence.receipt` for aggregate disputes.
- Delta entries (§4.4) gain a `receipts` variant where `actual` is a
  computed aggregate, not a single receipt field.
- Verification checklist (§6) gains Step 3b: for aggregate disputes,
  verify each receipt independently, then verify the aggregate.
- New reason code `period_budget_exceeded` in the registry, tier 3.

## Verification tier summary

Tiers are integers in the wire format (`"tier": 1`, not `"tier":
"mechanical"`). The human-readable label belongs in the registry docs,
not in the artifact. Integers naturally express resolver capability:
"I support up to tier N."

Tiers are **vertical** (hierarchical), not horizontal. Each tier is a
strict superset of resolver capability:

| Tier | Label | Model | What the resolver needs | Offline? | Codes |
|---|---|---|---|---|---|
| **1** | Mechanical | Extract fields, compare | Grant + receipt embedded in evidence | Yes | `scope-exceeded`, `grant-expired`, `audience-mismatch`, `unauthorized-agent` |
| **2** | Attested | External fact, signed by third party | Evidence + attestor's signed artifact | Yes (if attestation is embedded) | `counterparty_mismatch`, `offer_drift` |
| **3** | Aggregate | Multiple receipts + completeness | Evidence + all receipts + completeness attestation | Yes (if all receipts + attestation embedded) | `period_budget_exceeded` |
| — | Decision record | Replay agent's evaluation | Evidence + decision record + engine version | Depends on engine availability | Strengthens any code, not a code itself |

A resolver declares the highest tier it supports. Codes at or below
that tier are evaluated. Codes above are **skipped** — not rejected.
The dispute remains valid for whatever the resolver can evaluate.

### Why integers, not strings

If we later rename "mechanical" to "deterministic" or "attested" to
"witnessed," the wire format doesn't break. The label is documentation;
the integer is the contract.

### The offline boundary

All three tiers share one property: verification can be completed
from the embedded artifacts alone, with no live queries. This is the
hard design boundary from ext-disputes.md ("no callbacks"). Failure
modes that require querying live state (chain, revocation registry,
live endpoints) are explicitly out of scope — see "Beyond tier 3"
below.

## Class 5: Delegation scope violation

**Shape:** Principal authorizes Agent A with a $100 limit. Agent A
delegates to Agent B with a $500 limit. Agent B pays $200 — within
Agent B's delegated scope, within Agent A's delegated scope, but
exceeding the principal's actual $100 constraint. The grant chain
widens instead of narrowing.

**What's new:** Classes 1-4 all assume a single principal→agent grant.
This is the first failure class involving a **chain** of grants where
the violation is between links, not between the leaf grant and the
receipt.

**Verification:** Mechanical *if* the full delegation chain is
embedded — the resolver walks each link and checks that constraints
narrow monotonically. But chain completeness has the same problem as
Class 4: how does a resolver know it has the full chain?

**Protocol status:** No protocol currently implements multi-hop
delegation. ext-disputes.md §1 explicitly defers this: "This extension
assumes a single agent-to-owner grant." Documented now because the
shape is predictable and the tier model should accommodate it when
delegation lands.

**Tier:** 1 (mechanical) for chain verification given a complete chain.
3 (aggregate) for chain completeness attestation.

## Class 6: Settlement integrity

**Shape:** The facilitator/receipt-issuer claims settlement succeeded.
The on-chain state disagrees — the transaction doesn't exist, reverted,
or settled to a different address/amount than claimed.

**What's new:** This is the first failure class where the dispute is
between a protocol artifact (the receipt) and **external ground truth**
(the blockchain). Every other class compares artifacts against each
other.

**Examples:**
- Phantom settlement: receipt says `status: success`, transaction was
  never submitted or reverted.
- Amount divergence: receipt claims $100 settled, chain shows $50.
- This doesn't require collusion — it could be a bug, a race condition,
  or a chain reorg.

**Verification:** Requires either:
- An embedded chain-state proof (Merkle proof of the transaction state)
  → could be tier 2 (attested by the chain itself)
- A live chain query → interactive, outside the "no callbacks" boundary

**Tier:** This sits at the boundary. If the evidence embeds a Merkle
proof, a resolver can verify offline (tier 2). If it requires a live
query, it's beyond tier 3. Documenting as a known failure mode that
the current model partially addresses.

## Explicitly out of scope

These failure modes exist but are deliberately outside the evidence
layer's verification model. They belong in the resolution layer.

### Delivery mismatch

The agent paid for "premium market data." Receipt confirms delivery.
But the server delivered basic data, garbage, or nothing. Every payment
artifact agrees — the mismatch is between what was promised and what
was actually delivered.

This is probably the most common dispute people will imagine. It's
excluded because delivery evidence is unstructured (an API response
body, a file, a service result) and can't be compared mechanically
against an offer description. "Did this JSON response constitute
premium market data?" is a judgment call.

### Intent mismatch

The agent bought within scope — the purchase satisfies every grant
constraint — but the user didn't actually want it. The grant encoded
the wrong constraints. This is a grant-authoring problem: the
principal said "up to $100 on any API," but meant "only weather APIs."
The evidence layer can't evaluate what the principal *meant* vs. what
they *signed*.

### Subcases of existing classes (brief notes)

| Failure mode | Parent class | Note |
|---|---|---|
| Temporal staleness | Class 2 (decision) | Agent held a decision record for hours before paying; snapshot was valid when taken but stale at execution. Staleness thresholds are heuristic, not mechanical. |
| Asset identity manipulation | Class 3 (information) | Offer's `asset` address points to a token clone, not canonical USDC. Same shape as `counterparty_mismatch` — candidate code `asset_mismatch`, tier 2 with token registry attestation. |
| Offer withdrawal race | Class 2 + 3 | Server withdrew offer between agent's decision and payment. Mechanical if offers have expiry fields; attested otherwise (server attests withdrawal time, but is a party to the dispute). |
| Grant revocation race | Already in §5.1 | Class 2 decision record gives this a future path: if the record captures grant validity state, a resolver can see the race. Needs a signed revocation receipt to be tier 2. |

### Already handled by existing design

| Failure mode | Why it's handled |
|---|---|
| Cross-protocol replay | Protocol-specific artifact typing (`typ`, signing scheme, binding fields) prevents an x402 receipt from passing ACK verification. |
| Grant mutation / substitution | Content-hash binding (`ack.grant` = SHA-256 of grant) rejects any grant that doesn't match the receipt's reference. |

## Beyond tier 3

The tier model extends conceptually beyond what the current proposal
covers:

| Tier | Label | Trust model | Offline? | In scope? |
|---|---|---|---|---|
| **1** | Mechanical | Trust the cryptographic artifacts | Yes | Yes |
| **2** | Attested | Artifacts + named third-party attestor | Yes | Yes |
| **3** | Aggregate | Artifacts + completeness attestation | Yes | Yes |
| **4** | Interactive | Requires live external queries (chain, registry) | No | No — breaks "no callbacks" |
| **5** | Subjective | Requires human judgment | No | No — permanently out of scope for evidence layer |

The hard boundary is between 3 and 4. Tiers 1-3 can all be verified
from embedded artifacts alone. Tier 4 requires the resolver to reach
out to a live system. Tier 5 requires a human.

This boundary is a **deliberate design choice**: the evidence layer
produces verifiable artifacts, not verdicts. Tiers 4 and 5 are the
resolution layer's job. Making this explicit prevents scope creep in
the spec and tells implementers where the evidence layer ends.

## Cross-protocol evolution

### What the thread confirms about the original design

1. **The evidence triple is right.** Every failure class maps to some
   combination of authorization scope + action + delta. Nobody
   challenged the core structure.

2. **Mechanical verification is the foundation.** Tier 1 codes work
   exactly as designed. The new tiers layer on top without weakening
   them.

3. **ext-disputes.md Section 5.1 (intentionally omitted codes) was
   correct.** The omitted codes (category mismatch, revoked grant,
   no grant) were excluded because they can't be mechanically verified.
   The thread confirms this instinct — unblinkr's codes need
   attestation, ty-everett's need completeness. The right move was to
   build the mechanical layer first and add tiers as the failure
   classes were identified.

### What the thread changes

1. **Reason codes need tiers.** The flat registry in ext-disputes.md §5
   needs a `tier` field. A resolver declares which tiers it supports.
   Tier 1 is mandatory. Tier 2+ is opt-in.

2. **The evidence object needs to support multiple receipts.** The
   current schema assumes one grant, one receipt. Aggregate disputes
   need one grant, N receipts. The `evidence` object needs either an
   array or an alternative shape.

3. **The decision record is a useful optional leg.** Shxnque's leg 3
   strengthens any dispute by proving the agent should have known.
   It's optional — a dispute without it is still valid, just weaker.

4. **Completeness is the hardest unsolved problem.** No protocol has
   a native answer for "are these all the receipts?" This is the one
   area where the dispute extension may need to explicitly defer to the
   resolution layer rather than attempting to define a verification
   path.

### What needs to happen next

| Action | Where | Depends on |
|---|---|---|
| Action | Where | Status |
|---|---|---|
| ~~Add integer `tier` field to reason code registry~~ | ext-disputes.md §5.1-5.2 | Done |
| ~~Define attestation schema for tier 2~~ | ext-disputes.md §5.5 | Done (optional, normative on accuracy if present) |
| ~~Document Classes 5-6 and out-of-scope classes~~ | ext-disputes.md §5.4 | Done |
| ~~Document tier 4-5 boundary rationale~~ | edge-cases.md "Beyond tier 3" | Done |
| ~~Respond to ty-everett~~ | x402#3500 | Done (2026-09-23) |
| Settle canonicalization: canonical field set, absent-field handling | ext-disputes.md §5.6 | Open (JCS agreed, amounts as strings agreed; lobsterbar2027-boop drafting field list + absent-field rule) |
| Add optional `decision_record` to evidence | ext-disputes.md §4.3 | Blocked on Shxnque's response |
| Resolve decision record liability tension | ext-disputes.md §10.4 | Open question |
| Support multi-receipt evidence | ext-disputes.md §4.3 | Blocked on `period_budget_exceeded` code design |
| Define `period_budget_exceeded` code | ext-disputes.md §5.2 | Blocked on completeness attestation model |
| Add `asset_mismatch` as tier 2 subcase of Class 3 | ext-disputes.md §5.2 | Open |
| ~~Respond to unblinkr (follow-up)~~ | x402#3500 | Done (unblinkr conceded observation_window as optional, updated their PR; normative-on-accuracy refinement adopted in §5.5) |
| Update x402 protocol-mapping sketch | protocol-mappings.md | Blocked on x402 thread stabilization |
| Update MPP protocol-mapping sketch | protocol-mappings.md | Blocked on MPP maintainer feedback (none yet) |

## Appendix: Thread timeline

| Date | Author | Contribution | Impact |
|---|---|---|---|
| 2026-09-16 | ak68a | Original issue: dispute evidence for agent payments | Established the evidence triple |
| ~2026-09-18 | Shxnque | Three-leg model with recomputable decision record | Added Class 2, raised Q1 and Q2 |
| 2026-09-21 | ak68a | Reply to Shxnque: questions on hash scope and engine version | Refined Class 2 requirements |
| ~2026-09-22 | unblinkr | "Agent acted on bad information" + counterparty data | Added Class 3, proposed attested codes |
| 2026-09-22 | ak68a | Mechanical-vs-attested tier split | Synthesized Classes 1-3 into tiered model |
| 2026-09-23 | ty-everett | Concurrent payments exceeding period budget | Added Class 4, raised completeness problem |
| 2026-09-24 | lobsterbar2027-boop (unblinkr) | Conceded observation_window as optional; proposed normative-on-accuracy; raised absent-field semantics for canonicalization; amounts as strings for JCS | Adopted normative-on-accuracy in §5.5; canonicalization unblocked pending their field-list draft |
