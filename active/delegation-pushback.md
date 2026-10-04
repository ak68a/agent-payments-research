# Delegation proposal: adversarial review

Findings from an adversarial pass, ordered by severity.

---

## 1. The privacy model requires facilitator changes that don't exist

**Issue:** The `attestation` and `none` disclosure modes assume the facilitator can (a) verify a delegation grant, (b) produce a signed attestation about it, and (c) return that attestation to the server in `VerifyResponse.extensions`. None of this exists in any x402 facilitator today. The doc says "uses architecture that already exists" but what actually exists is the `extensions` field on the wire format. The verification logic, attestation signing, and routing (grant goes to facilitator only, not to server) are all new facilitator behavior.

**Why it matters:** A reviewer will say: "you're proposing a privacy model that requires every facilitator to implement DID resolution, grant signature verification, constraint checking, and attestation issuance. That's not 'no new infrastructure,' that's a significant new capability." The Coinbase facilitator (the primary one) would need to ship all of this. Saying "the architecture supports it" conflates wire-format extensibility with implementation readiness.

**Suggested fix:** Be explicit that facilitator-mediated privacy requires facilitator implementation work. Frame it as: the wire format supports it today, the facilitator logic is new, and the extension spec defines what a delegation-aware facilitator must do. Don't claim it's zero-effort. Also acknowledge that until facilitators implement it, the only working mode is `full` (grant visible to both sides). The privacy modes are a progression, not a launch requirement.

---

## 2. The facilitator doesn't verify the payer's identity today

**Issue:** Edge case #7 (grant replay) says "`cnf.jkt` possession binding prevents stolen grant replay: the facilitator verifies the payment was signed by the key pinned in the grant." But x402 facilitators verify the *payment* (on-chain signature, settlement validity), not the *payer's identity*. The facilitator checks that `authorization.from` has funds and that the signature is valid for the chain's scheme. It does NOT resolve DIDs, check `cnf.jkt` thumbprints, or verify that the payer's signing key matches a key in a DID document.

**Why it matters:** The entire replay-prevention argument rests on the facilitator checking the `cnf.jkt` binding. If the facilitator doesn't do DID-based identity verification today, this is new capability, not existing infrastructure. The grant might say `"cnf": {"jkt": "tH5Qw9..."}` but the facilitator would need to hash the payer's public key, compare it to the thumbprint, and reject on mismatch. That's a new verification step.

**Suggested fix:** Acknowledge that `cnf.jkt` verification is new facilitator behavior. The chain-level signature already proves the payer controls the private key for `authorization.from`, so the binding check is: does the grant's `agent` field (a DID or address) match `authorization.from`? That's simpler than full DID resolution and might be sufficient for the replay case. Spell out exactly what check the facilitator performs, rather than abstractly referencing "possession binding."

---

## 3. "Same denomination as the payment" doesn't resolve the units problem

**Issue:** The constraint vocabulary section says `maxAmount` is "string, minor currency units, same denomination as the payment." But the payment's denomination is determined by the `PaymentRequired` response from the server, which the principal doesn't see when issuing the grant. The principal issues the grant before the agent encounters any specific payment. The grant says `maxAmount: "1000000"` in... what? USDC (6 decimals, so $1.00)? A hypothetical 18-decimal token (so 0.000000000001)?

**Why it matters:** unblinkr from #3500 will catch this immediately. The JCS string-as-amount rule avoids *serialization* ambiguity, but doesn't solve *semantic* ambiguity. A grant issued in "minor units" of one asset and checked against a payment in a different asset with different decimals will produce wrong results silently.

**Suggested fix:** The grant must specify its own denomination explicitly: `maxAmount` + `asset` + `network` (or a CAIP-19 identifier). The facilitator converts between the grant's denomination and the payment's denomination at verify time using known token decimals. Without explicit denomination in the grant, the constraint is uninterpretable. This also means the minimum viable artifact needs an `asset`/`network` field or equivalent, which isn't in the current table.

---

## 4. The "MUST reject unknown constraints" rule has an adoption problem

**Issue:** The constraint vocabulary says "A resolver that doesn't recognize a constraint MUST reject." This is ACK's rule. In ACK's context it works because the RP onboards with the owner and negotiates which constraints it supports. In x402's context, the facilitator is a generic intermediary, not a pre-negotiated counterparty. A facilitator that MUST reject on any unknown constraint field will reject grants from any principal that adds a custom constraint the facilitator hasn't been programmed to handle.

**Why it matters:** This creates a deployment deadlock. Principals can't use custom constraints because facilitators reject them. Facilitators can't support all custom constraints because they're open-ended. The rule that prevents silent widening also prevents extensibility. ty-everett or Shxnque will point this out: "so who decides which constraints the Coinbase facilitator supports?"

**Suggested fix:** Split constraints into two categories: (a) `well-known` constraints that the facilitator MUST understand and enforce (the minimum set: maxAmount, allowedRecipients, expiry), and (b) `audience-scoped` constraints (`aud`-specific) that the facilitator MAY forward to the server for evaluation without interpreting them. The facilitator rejects grants with unknown `well-known` constraints (because skipping them is dangerous) but passes through `audience-scoped` constraints to the server (because the server, not the facilitator, is the party that negotiated them with the principal). This matches the actual trust relationship: the facilitator is generic, the server has the business relationship.

---

## 5. The concurrent grants answer ignores conflicting constraints

**Issue:** Edge case #1 says "the agent picks which grant to attach per payment." But what about an agent with Grant A (maxAmount: 100, from Principal A) and Grant B (maxAmount: 50, from Principal B), paying for a $75 item? The agent picks Grant A. But what if the server has a business relationship with Principal B and expects B's grant? The agent substituted A's authority for B's context. The facilitator has no way to detect this because it only sees the grant that was presented.

**Why it matters:** In B2B scenarios (MPP #366's concern), the server cares *whose* authority backs the payment, not just that *some* authority exists. An agent presenting any valid grant to any server misses the point of delegation in organizational contexts.

**Suggested fix:** Acknowledge that the server MAY enforce `aud` matching against its own expectations (e.g., "I only accept grants where `iss` is Acme Corp for this API"). This is already implicit in the `aud` field but should be stated as a verification step the server performs, separate from what the facilitator checks. The facilitator verifies grant validity; the server verifies grant applicability.

---

## 6. Dispute interaction with `attestation`/`none` privacy modes has a gap

**Issue:** The privacy section says "the agent holds the grant and presents it voluntarily when filing a dispute." But this assumes the agent cooperates. In an agent-scope dispute (the whole reason delegation exists), the agent is the party that exceeded its authority. The agent has no incentive to present the grant that proves it was wrong. The principal (who filed the dispute) issued the grant and has a copy. But the proposal doesn't say the principal retains the grant or can present it.

**Why it matters:** The dispute evidence model from #3500 assumes the claimant presents evidence. For scope violations, the claimant is the principal. The principal needs the grant to file the dispute. If only the agent holds the grant (because the agent received it), and the agent is the one being disputed, the evidence is in the hands of the wrong party.

**Suggested fix:** State explicitly that the principal MUST retain a copy of every grant it issues. The grant is a signed artifact the principal created, so this is natural (they have the input, they have the signed output). In the dispute flow, the principal presents the grant alongside the receipt. The agent's copy is irrelevant. The facilitator can also be required to retain grant hashes (not contents, for privacy) to confirm a grant was used in a specific transaction, linking the principal's copy to the payment record.

---

## 7. No error semantics for constraint violation

**Issue:** The proposal says the facilitator "returns constraint violations in `VerifyResponse.extensions.delegation`" but doesn't define what a constraint violation response looks like. Does the facilitator reject the entire payment? Return a specific error code? Does the client get a chance to retry with a different grant? Does the server see why the payment failed?

**Why it matters:** Error handling drives adoption. An implementer reading the spec needs to know: what does my client do when the facilitator says the grant's maxAmount is exceeded? Is there a standard error shape? Does the 402 response change? The current x402 error model has `VerifyResponse` with a boolean `valid` field. A delegation failure would set `valid: false`, but the reason would be opaque unless the extension defines error semantics.

**Suggested fix:** Define a small set of delegation-specific error codes: `delegation_required` (server requires delegation, none provided), `delegation_expired` (grant past expiry), `delegation_constraint_violated` (specific constraint failed, with the constraint name), `delegation_signature_invalid`, `delegation_agent_mismatch` (payer doesn't match grant's agent). Return these in `VerifyResponse.extensions.delegation.error`. The client can then decide whether to retry with a different grant or surface the error.

---

## 8. The `aud` field is a poor fit for x402

**Issue:** ACK grants use `aud` as a single exact-match string identifying the relying party. In x402, the "relying party" is... who? The resource server (the one behind the 402)? The facilitator (the one verifying the payment)? In ACK, the RP is the service provider. In x402, the facilitator is the verification party but the resource server is the service provider. The delegation proposal doesn't say what `aud` should contain in the x402 context, or whether it's the resource server's identifier, the facilitator's identifier, or something else.

**Why it matters:** If `aud` is the resource server, the grant is locked to one server. If `aud` is the facilitator, any server using that facilitator accepts the grant. If `aud` is omitted, the grant is open to any server. Each choice has different security implications. Getting this wrong means grants are either too narrow (locked to one server, can't shop around) or too wide (any server accepts them).

**Suggested fix:** Define `aud` semantics for x402 explicitly. Recommendation: `aud` is the resource server (the party the principal is authorizing the agent to transact with). The facilitator is the verifier, not the audience. This matches ACK's model and means the principal says "my agent can buy from api.example.com" not "my agent can buy from anyone using the Coinbase facilitator." Support `aud` as an array for multi-server grants, since x402 agents routinely interact with multiple resource servers.

---

## 9. Missing edge case: grant issued for wrong chain/asset

**Issue:** The grant says `maxAmount: "1000000"` and `allowedRecipients: ["0xabc..."]`. The agent encounters a payment on Solana, not EVM. The recipient is a Solana address, not an EVM address. The `allowedRecipients` check fails because the address format doesn't match, even though it might be the same merchant. Conversely, the `maxAmount` might pass even though the token has different decimals on this chain.

**Why it matters:** x402 is multi-chain by design (18 chains). A grant that doesn't specify which chain/asset it applies to will produce false positives (amount check passes on wrong-decimal token) and false negatives (recipient check fails on same-merchant-different-chain).

**Suggested fix:** Add `allowedNetworks` and/or `allowedAssets` to the well-known constraints. Or, as noted in issue #3, require the grant to carry its own `asset`/`network` denomination. Either way, the multi-chain problem needs to be addressed in the minimum viable artifact, not deferred.

---

## 10. The "just an extension" claim understates the coordination needed

**Issue:** The proposal repeatedly says delegation is "just an extension" with "zero core spec changes." This is true at the wire-format level. But for delegation to be useful, it needs: (a) at least one facilitator to implement grant verification, (b) client SDKs to implement grant attachment, (c) resource servers to advertise delegation requirements, and (d) principals to have a way to issue grants. None of (a)-(d) exists today. Saying "just an extension" makes it sound like plugging in a module, when it's actually a new multi-party protocol layered on top of x402.

**Why it matters:** Community reviewers will push back on the gap between "the wire format supports this" and "this is implementable." The spec proposal itself is clean, but the implementation path is significant. Understating it will erode credibility.

**Suggested fix:** Acknowledge the implementation scope honestly. The extension spec is additive (no core changes). The implementation is a multi-party effort: facilitator support is the critical path, client SDK support enables it, server-side is opt-in. Propose a phased rollout: (1) spec + reference implementation for a single facilitator, (2) SDK integration, (3) production deployment. This is how the offer-and-receipt extension shipped; follow the same playbook.
