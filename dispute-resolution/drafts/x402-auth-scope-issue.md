### Problem or use case

When an AI agent initiates x402 payments on behalf of a user, the user needs a way to constrain what the agent can do — maximum amount, allowed resources, allowed networks, expiry. x402 doesn't currently have an artifact for this.

`PaymentRequired` defines what the server asks for. `PaymentPayload` proves the agent can pay. The `upto` scheme defines a maximum the *payer* will accept. But nothing in the protocol captures what the **principal** — the user behind the agent — authorized the agent to spend.

The `upto` scheme is the closest concept, but it's server-facing: the payer authorizes up to an amount for a specific payment. A principal-defined authorization scope is broader — it constrains the agent across multiple payments: "up to $50 total, only on these resources, only on Base, before Friday."

The offer-receipt extension (§8) already anticipates this need: "Autonomous agents making purchasing decisions need machine-verifiable proof of terms and delivery. Signed offers let an agent's principal (human or system) audit what deals the agent accepted." The audit trail exists. The constraint artifact — what the principal actually authorized — doesn't.

This gap also surfaces in #3462 (operation-level entitlement scope) and is a prerequisite for the dispute evidence proposal in [#3500](https://github.com/x402-foundation/x402/issues/3500).

### Proposed solution

A new extension (`agent-authorization`) carrying a signed authorization scope from the principal. The authorization travels in `PaymentPayload.extensions["agent-authorization"]` — the mechanism already exists (`extensions?: Record<string, unknown>`).

**Authorization scope fields:**

- `principal` — the principal's identity (address or DID)
- `agent` — the agent identity authorized to transact
- `constraints`:
  - `maxAmount` / `asset` — per-transaction ceiling
  - `totalBudget` / `asset` — cumulative spending limit
  - `resources` — allowed resource URLs or URL patterns
  - `networks` — allowed networks
  - `schemes` — allowed schemes (e.g., only `exact`, not `upto`)
- `validAfter` / `deadline` — validity window (matching `upto` scheme naming)
- `nonce` — replay protection
- `signature` — principal's signature (EIP-712 or JWS, matching the offer-receipt extension's dual-format approach)

**How it works:**

1. Principal signs an authorization scope defining what the agent can spend
2. Agent includes it in `PaymentPayload.extensions["agent-authorization"]` when paying
3. Server (or facilitator) can verify the principal authorized this agent to make this payment
4. The authorization is recorded in the receipt for audit and dispute evidence

**What this does NOT define:**

- Enforcement — whether a facilitator rejects payments that exceed the scope is a policy decision
- Dispute resolution — that's [#3500](https://github.com/x402-foundation/x402/issues/3500), which uses this as a building block
- Budget tracking — cumulative spending tracking is an implementation concern, not a protocol artifact

**Where the facilitator fits:**

The facilitator's verification step already receives the full `PaymentPayload` including extensions. An `agent-authorization` extension could be verified alongside the payment proof — the facilitator checks that the authorization signature is valid, the agent identity matches, and the payment falls within the constraints. The existing hook system (`beforeVerify`, `afterSettle`) could handle this without changing the core verify/settle flow.

### Relationship to existing work

- **`upto` scheme**: Server-defined max per payment. This proposal defines principal-defined constraints across payments. They're complementary — an agent could use `upto` for a specific payment while operating under a broader authorization scope from its principal.
- **Offer-receipt extension**: Creates the audit trail (what terms were offered, what was delivered). This proposal adds the constraint leg (what was authorized). Together they provide all three legs needed for dispute evidence.
- **#3462**: Operation-level entitlement scope — a related scoping gap, though from the other direction. #3462 addresses post-payment entitlement granularity (ensuring a payment for operation A doesn't authorize operation B). This proposal addresses pre-payment spending constraints (ensuring the agent can only initiate payments the principal authorized). Both tighten authorization scoping; they're complementary.
- **#3500**: Dispute evidence — uses authorization scope as one of the three evidence legs.

---

*This issue was prepared with AI assistance (Claude Code). The authorization scope concept is adapted from [agent-payments-research](https://github.com/ak68a/agent-payments-research/tree/main/dispute-resolution).*
