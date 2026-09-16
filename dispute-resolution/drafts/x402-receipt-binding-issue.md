### Problem or use case

The offer-receipt extension's signed receipt (§5.2) currently carries: `version`, `network`, `resourceUrl`, `payer`, `issuedAt`, and optionally `transaction`. It proves the server acknowledged payment and delivery, but it doesn't carry:

1. **The amount that was actually settled** — intentionally omitted for privacy (§5.2), but this means a third party can't verify what was charged without access to the chain.
2. **A reference to the offer** — the receipt doesn't bind back to which specific offer terms it fulfilled. A payer can't prove "I was charged $5 when the offer said $0.10" from the receipt alone.
3. **A reference to an authorization scope** — if a principal authorized an agent to spend up to $50, the receipt doesn't record which authorization was in effect.

The extension spec already anticipates the need for richer receipts. §8 names "dispute workflows, including scenarios involving automated purchasers (agents)" as a use case, and notes that "signed offers let an agent's principal (human or system) audit what deals the agent accepted." But the receipt doesn't carry enough information for that audit — you can see *that* the agent paid, but not *what terms it accepted* or *whether those terms fell within the principal's authorization*.

This is related to #3379 (proof-of-done — binding settlement to a work-receipt ledger) and is a prerequisite for the dispute evidence proposal in [#3500](https://github.com/x402-foundation/x402/issues/3500).

### Proposed solution

Add two optional fields to the signed receipt payload in a v2 receipt schema:

**`offerRef`** — SHA-256 content hash (base64url) of the signed offer that was in effect when the payment settled. This binds the receipt to the specific terms the server presented.

**`authorizationRef`** — SHA-256 content hash (base64url) of the principal's authorization scope artifact (proposed in the companion issue). This binds the receipt to what the principal authorized.

```typescript
// Receipt v2 payload
{
  version: 2,
  network: "base-sepolia",
  resourceUrl: "https://api.example.com/data",
  payer: "0x1234...",
  issuedAt: 1726531200,
  transaction: "0xabcd...",
  offerRef: "kQ3v8Zt...",           // SHA-256 of the signed offer
  authorizationRef: "pL9m2Xw..."    // SHA-256 of the authorization scope
}
```

**How binding works:**

1. Server signs an offer (offer-receipt extension §4). Agent receives it.
2. Principal has signed an authorization scope (companion issue). Agent carries it.
3. Agent pays. Facilitator settles.
4. Server issues a receipt including:
   - `offerRef` = SHA-256 of the offer it presented
   - `authorizationRef` = SHA-256 of the authorization the agent presented in `PaymentPayload.extensions`
5. A verifier can now: hash the offer → compare against `offerRef`; hash the authorization → compare against `authorizationRef`; confirm the actual payment fell within both the offer terms and the authorization constraints.

**Privacy considerations:**

The current receipt deliberately omits `amount` and `asset` to reduce correlation risk (§5.2). The `offerRef` and `authorizationRef` fields are content hashes — they don't leak the offer or authorization contents. A verifier needs the original artifacts (which the disputing party provides) to reconstruct the comparison. This preserves the privacy-minimal design: the receipt alone reveals less, but paired with the original artifacts it enables full verification.

**Two approaches to schema evolution:**

1. **Receipt extensions field.** If the signed receipt payload supports an `extensions` object (matching the pattern on `PaymentPayload` and `SettlementResponse`), `offerRef` and `authorizationRef` could live there without changing the core schema. This avoids the EIP-712 type hash break.
2. **v2 receipt schema.** Add the fields to the core payload. §3.2 notes that type hash changes are breaking for EIP-712 signed receipts, so this requires a version bump. A v2 receipt coexists with v1.

Option 1 is less disruptive. Option 2 is cleaner if a receipt schema revision is already planned.

### Where the facilitator fits

The facilitator already receives the full `PaymentPayload` (including `extensions`) during verification and settlement. If the payload carries an authorization scope in `extensions["agent-authorization"]`, the facilitator can:

1. Pass the authorization hash through to the server for receipt inclusion
2. Optionally verify the authorization signature during its own verification step (via `beforeVerify` hook)
3. Record the authorization reference in `SettleResponse.extensions` for its own audit trail

This requires no changes to the core facilitator interface — the `extensions` fields on both `PaymentPayload` and `SettleResponse` already support arbitrary extension data.

### What this does NOT define

- The authorization scope artifact itself — that's the companion issue
- Dispute evidence — that's [#3500](https://github.com/x402-foundation/x402/issues/3500), which uses these bindings
- Whether `amount` should be added to the receipt — that's a separate privacy/utility tradeoff

### Relationship to existing work

- **Offer-receipt extension**: This proposal extends its receipt with binding fields. The offer already exists as a signed artifact; `offerRef` just adds a hash pointer from the receipt back to it.
- **#3379** (proof-of-done): Binding settlement to an external work-receipt ledger — same structural pattern (receipt → external artifact reference).
- **#3462** (operation-level entitlement scope): The authorization scope this receipt would reference.
- **#3500** (dispute evidence): Uses `offerRef` and `authorizationRef` to construct the evidence trail.

---

*This issue was prepared with AI assistance (Claude Code). The receipt binding concept is adapted from [agent-payments-research](https://github.com/ak68a/agent-payments-research/tree/main/dispute-resolution).*
