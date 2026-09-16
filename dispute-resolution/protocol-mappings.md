# Protocol mappings for dispute evidence

This document maps the dispute evidence triple (authorization scope +
action + delta) to the primitives of each protocol. The ACK mapping is
the reference implementation in [ext-disputes.md](ext-disputes.md).
MPP and x402 mappings are sketches — full specs would live in each
protocol's repo.

## Concept map

| Evidence leg | ACK | MPP | x402 |
|---|---|---|---|
| **Authorization scope** | Grant (JWT, signed by owner) | *Does not exist yet* | *Does not exist yet* |
| **Action** | Receipt (JWS, `ack.grant` binding) | Payment-Receipt header (`method`, `reference`, `status`, `timestamp`) | Signed receipt (offer-receipt extension) |
| **Binding** | Content hash (`ack.grant` = SHA-256 of grant) | `challengeId` ties receipt to challenge | Facilitator holds both sides |
| **Dispute artifact** | `dispute+jwt` (proposed) | Dispute extension (proposed) | Dispute extension (proposed) |
| **Verifier** | Third-party resolver | Third-party resolver | Facilitator (natural fit) |

## ACK

ACK has the most complete foundation. The grant carries authorization
scope (`aud`, `scope`, `constraints`, `exp`), and the receipt's `ack`
binding ties each payment back to the grant by content hash. Both legs
exist as signed artifacts with a cryptographic reference between them.

The dispute evidence artifact (`dispute+jwt`) embeds both, adds a
structured delta, and a resolver walks a five-step verification
checklist. See [ext-disputes.md](ext-disputes.md) for the full spec.

**What's needed:** The dispute artifact itself. Everything else exists.

## MPP

MPP's flow is: server issues a **challenge** (`WWW-Authenticate:
Payment` with `id`, `intent`, `method`, `request`) → client answers
with a **credential** (`Authorization: Payment` carrying the payment
proof) → server returns a **receipt** (`Payment-Receipt` header).

### What exists

- The **challenge** defines what the server asked for: amount,
  currency, recipient (in the `request` field).
- The **credential** proves the client paid (method-specific payload).
- The **receipt** proves settlement: method, transaction reference,
  status, timestamp.
- The `challengeId` binds the receipt back to the challenge.

### What's missing

MPP has no **authorization-scope artifact** — nothing that says "the
principal authorized this agent to spend up to $X at these merchants
before this time." The credential proves the agent *could* pay, not
that the agent *was authorized* to pay within specific constraints.

Without the authorization leg, a dispute extension would need to
either:

1. **Introduce an authorization-scope artifact** — a signed object
   from the principal (the user behind the agent) that constrains
   what the agent can do. This is new to MPP.
2. **Reference an external authorization format** — e.g., a signed
   JWT from the principal that the dispute evidence embeds alongside
   the receipt.

The delta would compare the authorization scope against the
challenge's `request` parameters and the receipt's settlement values.

### Where it fits

A dispute evidence extension under `specs/extensions/`, layering on
existing challenge/credential/receipt artifacts. This follows MPP's
contribution model — extensions add capabilities without modifying
the core protocol.

**Proposed:** [tempoxyz/mpp-specs#359](https://github.com/tempoxyz/mpp-specs/issues/359)

## x402

x402's flow is: resource server returns **HTTP 402** with
`PaymentRequired` (acceptable payment methods, amounts, assets) →
client constructs a **PaymentPayload** → **facilitator** verifies
and settles → access granted.

### What exists

- The **PaymentRequired** response defines the terms: scheme, amount,
  asset, recipient, timeout.
- The **PaymentPayload** proves the client can pay.
- The **facilitator** sits between payer and resource, handling
  `POST /verify` and `POST /settle`.
- The **offer-and-receipt extension** defines signed offers (server
  commits to terms) and signed receipts (server confirms delivery).
  Critically, this extension already names "dispute evidence and
  auditability" and "dispute workflows, including scenarios involving
  automated purchasers (agents)" as use cases (§1, §5.5, §8) — but
  defines no dispute artifact.

### What's missing

Like MPP, x402 has no **authorization-scope artifact** from the
principal. The `PaymentRequired` says what the server wants, and the
`PaymentPayload` proves the client paid it. But nothing captures the
user's constraints on the agent.

The `upto` scheme is the closest existing concept — it defines a
maximum amount the payer will accept. But it's server-defined (the
resource sets the cap), not principal-defined (the user behind the
agent sets the cap).

### Where the facilitator fits

The facilitator is a natural dispute verifier. It already:

- Sees both sides of the transaction (payment proof + resource access)
- Has verification infrastructure (key resolution, signature checks)
- Knows the original `PaymentRequired` terms and the settled amount

A `POST /dispute` endpoint alongside `/verify` and `/settle` could
accept a dispute evidence artifact and verify it against both the
facilitator's own records and the embedded authorization scope.

### Where it fits

A dispute extension alongside the existing offer-and-receipt
extension, building on the evidence building blocks that extension
already created. The artifact shape would likely be JWS, matching the
offer-receipt extension's format.

**Proposed:** [x402-foundation/x402#3500](https://github.com/x402-foundation/x402/issues/3500)

## Convergence

The three protocols don't need a universal dispute format — they serve
different architectures and a shared wire format would mean a shared
artifact model, which defeats the purpose of having different
protocols.

What should converge is the **verification property**: a third party
can confirm the mismatch from the evidence alone, without callbacks.

If all three adopt this property, a resolver serving ACK and a
facilitator serving x402 are doing the same logical operation on
different data shapes. Interoperability happens at the verification
semantics level, not the wire format level.

The practical consequence: compliance teams, arbitration services, and
insurance products can treat agent payment disputes as a category with
a known verification pattern, regardless of which protocol originated
the payment.
