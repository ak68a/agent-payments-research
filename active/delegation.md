# Delegation and authorization for agent payments

**Status:** Research
**Protocols:** x402, MPP
**Related:** MPP #366, ACK grants (PR #179), AP2 #207 (BAP verb set), x402 #3620, x402 #3646

## The gap

Agent payment protocols handle authentication (who is paying?) but not authorization (who said they could?).

x402 knows the signer. MPP knows the credential holder. Neither can express "this agent is paying on behalf of this principal, within these constraints." Every payment is direct. There's no artifact that captures what the principal authorized.

This matters for disputes because a scope violation is only expressible if the scope was declared. Our dispute taxonomy (#3500) needs an authorization-scope leg. Without delegation, there's no scope to violate.

## What exists today

### ACK grants (v2 PR #179)

The most complete implementation. A grant is a JWT (`typ: "grant+jwt"`) signed by the owner:

- `iss`: principal DID
- `sub`: agent DID
- `aud`: relying party (single string, exact match)
- `scope`: space-delimited action scopes
- `constraints`: open object (members only narrow, unknown = reject)
- `exp`: expiry
- `cnf.jkt`: possession pin (agent's key thumbprint)

Verification is offline. RP checks the grant signature against the owner's pinned key, checks the agent's request signature against published keys, checks scope. No callbacks needed.

Revocation: short `exp`, `jti` tracking, key removal, or ext-revocation (signed lists).

Delegation chains via ext-delegation: owner signs once, hot service mints short-lived leaves. Strict attenuation (child never exceeds parent).

**Limitations:** `constraints` has no shared vocabulary. Third parties can't interpret values without RP-specific knowledge. `aud` is single exact match, can't express categories. The `ack` receipt binding is SHOULD not MUST.

### Budget Reservation Protocol (Ectsang, BAP v0.1)

Sits between delegation and settlement. Four verbs: authorize (atomic check + decrement + hold), commit, refund, query.

Key design: `authorize` IS the decrement. No separate "check remaining" call. Prevents the concurrency race where two agents read the same balance and both proceed.

Budget artifact: agent_id, amount (minor units), currency, valid_until, constraints (per-tx max, vendor allow/blocklist).

**Limitation:** Stateful. Requires reachable budget service. Can't verify offline. No delegation chain. Knows "principal" and "agent" but doesn't define how that relationship is established.

The BAP spec states the core tension: "A delegation without a budget has no spending limit. A budget without a delegation has no proof of authorization."

### x402 #3620 (pooled escrow + spending-policy)

The most operationally advanced. Accounts form a hierarchy (policy tree). A deposit is checked against the account's policy AND every ancestor's policy. Workers can't exceed their cap, crews can't exceed the orchestrator's cap.

Policy object: per-tx cap, per-window cap/window, allow/deny lists, expiry, optional escalation co-signer, parent account.

Has 115 conformance vectors and two reference implementations (Python + Solidity on Avalanche Fuji).

**Limitation:** On-chain enforcement only. Coupled to batch-settlement scheme. No identity/delegation model. Knows "accounts" not "agents."

### x402 #3646 (agreement-session)

Binds multiple payments to one agreement with shared terms, budget, expiry. An `agreementId` groups payments. Settlement stays with existing x402 schemes, the extension only defines the lifecycle binding.

Has a reference implementation (ALSP) but it's unilateral. The buyer can prove what it selected, but the provider hasn't necessarily assented.

**Limitation:** No enforcement. No delegation. No dispute resolution. Zero engagement on the issue.

### MPP #366 (delegated authority)

Not an implementation. An open question asking where delegation belongs in MPP. Three options raised: identity extension, separate extension, or outside MPP with 403 as the integration point.

Key insight: B2B procurement runs on invoices, not card-backed tokens. Per-payment limits don't capture organizational authority.

Zero responses. Open territory.

## Nobody covers both halves

| System | Has delegation? | Has budget enforcement? |
|---|---|---|
| ACK grants | Yes (offline, JWT) | No |
| BAP | No (defers to identity layer) | Yes (stateful, atomic) |
| x402 #3620 | No (accounts, not agents) | Yes (on-chain, hierarchical) |
| x402 #3646 | No | No (lifecycle binding only) |
| MPP | No | No |

The gap is always the same: delegation and budget enforcement are built separately and don't connect.

## Where delegation plugs into x402

The wire format supports delegation as an extension with no core spec changes. The implementation is a multi-party effort.

**Wire format:** The `extensions` field on PaymentRequired and PaymentPayload (`Record<string, unknown>`) is the entry point. Server advertises delegation requirements in the 402 response. Client attaches the delegation artifact in the payment payload. This is how every x402 extension works.

**Facilitator verification:** The facilitator receives the full PaymentPayload on `/verify` and `/settle`. A delegation-aware facilitator would extract the grant, verify the principal's signature, check that `grant.agent` matches `authorization.from` (address comparison, not DID resolution), verify constraints, and return results in `VerifyResponse.extensions.delegation`. This is new facilitator behavior. No facilitator does this today.

**SDK hooks:** The hook system supports the integration points. Server-side: `onBeforeVerify` can abort if delegation is missing or invalid. Client-side: `enrichPaymentPayload` attaches the grant, `onBeforePaymentCreation` checks constraints pre-payment.

**Backward compatible:** Servers that don't understand delegation ignore the extension. Agents without grants pay directly. Purely additive at the wire level.

**Implementation path:** The spec is additive but the implementation is multi-party: (1) spec + reference facilitator implementation, (2) SDK integration (client grant attachment, server grant advertising), (3) production deployment. This is how the offer-and-receipt extension shipped. Facilitator support is the critical path.

## What delegation adds beyond SpendControls

x402's SDK has SpendControls (per-payment USD cap, allowed assets). But these are client-enforced only. The server and facilitator can't see them. They don't express who authorized the agent, can't constrain recipients or categories, can't enforce aggregate budgets, and aren't third-party verifiable.

A delegation extension makes authorization verifiable by the facilitator and usable as dispute evidence.

## Minimum viable delegation artifact

Across all implementations, the common fields:

| Field | Purpose | Source |
|---|---|---|
| Principal identifier | Who authorized | ACK `iss`, BAP principal credential |
| Agent identifier | Who is authorized (must match `authorization.from`) | ACK `sub`, BAP agent credential |
| Audience | Which resource server(s) this grant is valid for | ACK `aud` |
| Amount constraint | How much (string, minor units) | ACK `constraints`, BAP `amount` |
| Asset/network | Denomination of `maxAmount` (e.g. CAIP-19). Top-level grant field, not a constraint. | New (required for multi-chain) |
| Time constraint | Until when | ACK `exp`, BAP `valid_until` |
| Recipient constraint | With whom (chain-appropriate address format) | ACK `constraints`, BAP vendor list |
| Allowed networks | Which chains this grant covers. Well-known constraint, not top-level. | New (required for multi-chain) |
| Unique ID | Tracking/revocation | ACK `jti`, BAP `budget_id` |

Format: JWS (matching x402's offer-receipt extension). Signed by the principal.

The `aud` field is the resource server, not the facilitator. The principal says "my agent can buy from api.example.com," not "my agent can use the Coinbase facilitator." Support as array for multi-server grants. The facilitator MUST check `aud` against the originating resource server (it knows this from the payment flow). In `full` mode, the server MAY additionally check `aud`. In `attestation`/`none` mode, the facilitator's check is the only one.

Optional fields not in the minimum set: `budgetRef` (URI to a budget authority for aggregate limit enforcement), `disclosure` (privacy mode: `full`, `attestation`, or `none`).

Replay prevention: the facilitator checks that `grant.agent` matches `authorization.from`. This is an address comparison, not DID resolution. The chain-level signature already proves the payer controls the private key for that address.

## Verification spectrum

```
No principal callback ←———————————————→ Fully stateful
   ACK grants                        BAP / x402 #3620
   (can't enforce                   (can enforce aggregate
    aggregate limits)                 but needs intermediary)
```

"Offline" here means the verifier (facilitator or server) doesn't need to contact the principal or any external authority to check per-payment constraints. The grant is self-contained: signature, constraints, and expiry are all in the artifact. This is NOT "no facilitator involvement." The facilitator still verifies the grant, it just doesn't need to call out to anyone to do it.

Stateful verification (contacting a budget authority) can enforce aggregate limits but requires a reachable intermediary.

i think a delegation extension should verify without principal callback for per-payment constraints and optionally reference a budget authority for aggregate constraints. The `scope_ref` concept (hash + type + URI) lets the delegation artifact point to a budget without embedding it.

## Connection to dispute evidence

The delegation artifact IS the authorization-scope leg that #3500 needs. With delegation:

- Grant = authorization scope (what the principal allowed)
- Offer = what was promised (existing offer-receipt extension)
- Receipt = what was settled (existing offer-receipt extension)

The evidence triple is complete. A dispute resolver verifies the grant against the receipt. In `full` mode the grant is in the payment extensions. In `attestation`/`none` mode the principal supplies the grant at dispute time, and the facilitator's retained hash confirms it was the grant used in that transaction. Either way, the `scope_ref` in dispute evidence references the grant by hash.

Without delegation, dispute evidence can prove "the receipt doesn't match the offer" but can't prove "the agent exceeded its authority." The first is a payment error. The second is the problem agent payments actually have.

## Edge cases and failure modes

### 1. Concurrent grants

Agent holds grants from two principals. Which applies?

The agent picks which grant to attach per payment. The grant is in `paymentPayload.extensions.delegation`, explicit per-transaction. The facilitator only sees the one presented. No ambiguity at verification time.

But in B2B scenarios, the server cares *whose* authority backs the payment, not just that *some* authority exists. The facilitator verifies grant validity (is the signature good, are constraints satisfied). The server verifies grant applicability (is this the right principal for this transaction). These are separate checks. The server MAY enforce `aud` and `iss` matching against its own expectations.

### 2. Delegation chains

Intermediary issues sub-grants. How deep, how does attenuation work?

ACK solved this with ext-delegation: `grant-int+jwt` for intermediates, strict attenuation (child never exceeds parent on exp, aud, constraints), chain claim links by hash. For x402, chains should be optional. Most use cases are one-hop (principal -> agent). Chains matter for enterprise (company -> department -> agent) but shouldn't be required for the extension to be useful.

### 3. Revocation timing

Grant revoked between payment initiation and settlement.

Two windows: before facilitator verify and between verify and settle. Before verify is clean, facilitator checks and rejects. Between verify and settle is harder. The facilitator already said "this payment is valid."

Answer: settlement honors what was valid at verify time. Revocation applies to future payments, not in-flight ones. Same as how credit card auth works. The dispute extension handles after-the-fact claims if needed.

### 4. Constraint vocabulary

"maxAmount: 10000" is ambiguous without units.

Two categories of constraints:

**Well-known** (facilitator MUST understand and enforce):
- `maxAmount`: string, minor currency units, denominated in the grant's own `asset`/`network` fields. The facilitator converts between grant denomination and payment denomination at verify time.
- `allowedRecipients`: array of addresses (chain-appropriate format matching the grant's `allowedNetworks`)
- `expiry`: unix timestamp
- `allowedNetworks`: array of CAIP-2 network identifiers

**Audience-scoped** (facilitator MAY forward to server without interpreting):
- Namespaced keys (`vendor:acme/category`, `scope:invoices:read`)
- The server, not the facilitator, evaluates these. The server has the business relationship with the principal.
- A facilitator that doesn't recognize an audience-scoped constraint passes it through. A facilitator that doesn't recognize a well-known constraint MUST reject.

This avoids the deployment deadlock where a generic facilitator can't support open-ended custom constraints. The facilitator enforces the standard set, the server enforces its own.

Amounts as strings avoids the JCS IEEE 754 precision problem from the #3500 canonicalization discussion.

### 5. Privacy

The grant reveals the principal's identity, the agent-principal relationship, and the constraints. This needs a real solution, not a deferral.

**Facilitator-mediated privacy.** The facilitator already sits between agent and server. The grant goes to the facilitator only. The facilitator verifies it and returns a verification attestation to the server. The server learns "this payment is authorized" but not by whom or under what constraints.

The principal controls disclosure with a `disclosure` field on the grant:

- **`full`**: grant visible to both facilitator and server. B2B, enterprise, audit-required.
- **`attestation`**: facilitator verifies the grant and issues a signed statement to the server ("authorized, constraints verified"). The server sees the attestation, not the grant.
- **`none`**: facilitator verifies, server gets `{verified: true}` in the extension response.

Why this works:
- No ZK complexity. No new cryptography.
- The trust boundary doesn't expand. You already trust the facilitator with payment data.
- The principal decides the disclosure level per-grant.

**Implementation reality:** `full` mode works at launch since the grant is just an extension payload. `attestation` and `none` require facilitator implementation work (grant verification, attestation signing, selective routing). These are a progression, not a launch requirement. Until facilitators implement privacy modes, `full` is the only working mode.

**Dispute interaction.** In `attestation` or `none` mode, the grant isn't in the server's records. The principal (not the agent) presents the grant when filing a dispute. The principal issued the grant and MUST retain a copy. This matters because in a scope-violation dispute, the agent is the party being disputed and has no incentive to produce the evidence. The claimant is the principal.

The facilitator retains grant hashes (not contents) to confirm a grant was used in a specific transaction, linking the principal's copy to the payment record. Disclosure happens at dispute time, not payment time.

**Tradeoff, stated openly:** facilitator-mediated privacy means the facilitator becomes a privacy boundary. If compromised, the principal-agent relationship is exposed. Same risk profile as a payment processor knowing the cardholder. Not new, but real.

**Cross-facilitator correlation:** different facilitators can't correlate the same principal. Same facilitator can, across transactions. Same as card networks.

### 6. Aggregate limits

Per-payment constraints pass but the sum across payments doesn't.

Per-payment verification is offline (check signature, check amount). Aggregate verification is stateful (need total spend against this grant). The delegation extension handles per-payment. Aggregate enforcement needs a budget authority (BAP pattern) or session binding.

The grant carries an optional `budgetRef` pointing to a budget authority by URI. Facilitators that understand it check aggregate limits via the budget authority. Facilitators that don't still verify per-payment constraints. Additive, same pattern as the tiered reason codes in #3500.

### 7. Grant replay

Reusing a grant across multiple servers or facilitators.

A reusable grant can be presented to any server in the `aud` audience. That's by design, it's how a principal says "this agent can buy from these merchants." Replay prevention: the facilitator checks that `grant.agent` matches `authorization.from` (an address comparison). The chain-level signature already proves the payer controls that address's private key. You can't use someone else's grant without their private key.

Single-use grants need `jti` tracking by the facilitator, which is stateful. The facilitator is the natural place for this since it already processes every payment.

### 8. Offline principal

The principal doesn't need to be online. But what about revocation?

This is the fundamental tradeoff of offline verification. Options:

- **Short-lived grants** (minutes/hours): revocation is "don't renew." Simplest.
- **Revocation lists**: facilitators poll periodically. Adds latency between revocation and enforcement.
- **Revocation endpoint**: facilitator checks on verify. Adds a dependency but real-time.

Short-lived grants are sufficient for most agent use cases. The delegation chain pattern (offline root signs intermediate, hot service mints short-lived leaves) gives both: the principal is offline, the issuance service can stop minting.

### 9. Multi-chain grant mismatch

Grant says `maxAmount: "1000000"` with `allowedRecipients: ["0xabc..."]`. Agent encounters a payment on Solana. The recipient is a Solana address, not EVM. The `allowedRecipients` check fails because address formats don't match, even if it's the same merchant. The `maxAmount` might pass even though the token has different decimals.

x402 is multi-chain by design (18 chains). The grant MUST specify which chains and assets it covers via `allowedNetworks` and its own `asset`/`network` denomination. A grant without these fields is uninterpretable in a multi-chain context.

### 10. Error semantics

The facilitator needs standard error codes for delegation failures. Without them, implementers can't build reliable client retry logic.

Delegation-specific error codes in `VerifyResponse.extensions.delegation.error`:
- `delegation_required`: server requires delegation, none provided
- `delegation_expired`: grant past expiry
- `delegation_constraint_violated`: specific constraint failed (include constraint name)
- `delegation_signature_invalid`: principal's signature doesn't verify
- `delegation_agent_mismatch`: payer doesn't match grant's agent field
- `delegation_network_unsupported`: payment's network not in grant's `allowedNetworks`

These error codes are returned by the facilitator in `VerifyResponse.extensions.delegation.error` for well-known constraint violations.

For audience-scoped constraints (evaluated by the server, not the facilitator), the server returns its own error after the facilitator's verification pass. A server-side audience-scoped constraint failure would be an HTTP 403 with a delegation error body. The extension should define a standard error shape for this so clients get consistent behavior regardless of which party evaluated the constraint.

The client can then decide: retry with a different grant, request a new grant from the principal, or surface the error.

### MPP prior art: closed PR #338

saneGuy proposed an authorization evidence extension for MPP. brendanjryan (maintainer) closed it because: "we want to avoid upstreaming anything which is not widely used." The proposal had a working npm package but no independent third-party adoption.

This means MPP won't accept a delegation proposal without evidence of live adoption. Our strategy: build the extension for x402 first (more receptive to spec proposals), respond to MPP #366 with the concept, come back to MPP when there's adoption.

## Open questions

1. **Constraint vocabulary beyond the minimum set.** The three well-known constraints (maxAmount, allowedRecipients, expiry) cover the common cases. What else should be standardized vs left custom? Categories/resource types? Per-window caps?

2. **Grant lifecycle.** Single-use or reusable? Reusable needs `jti` tracking by the facilitator. Single-use is simpler but doesn't cover subscription-style access.

3. **Budget reference format.** What does `budgetRef` look like? A URI to a BAP-style budget authority? A hash of a budget artifact? How does the facilitator know which budget protocol to speak?

## Summary

Agent payments have authentication but not authorization. Every protocol can verify who paid. None can verify who said they could, or within what limits.

The BAP spec states the core tension: "A delegation without a budget has no spending limit. A budget without a delegation has no proof of authorization." Both halves exist in isolation. Nobody has connected them.

The dispute evidence work (#3500) exposed the foundational gap: you can't prove an agent exceeded its scope if there's no scope artifact to exceed.

## Detailed findings

- [x402 architecture analysis](delegation-x402-findings.md)
- [Implementation patterns](delegation-implementations.md)
