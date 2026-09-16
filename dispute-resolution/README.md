**Status: proposal draft.**

# Dispute resolution for agent commerce

## Motivation

When an AI agent makes a purchase that doesn't match user intent, no
existing chargeback reason code covers it. The payment was
authenticated, authorized, and completed — no fraud occurred. But the
agent acted outside the scope the user granted.

ACK-Pay v2 introduces grants (short-lived JWTs carrying authorization
scope) and binds each receipt to its authorizing grant via an artifact
reference. This gives us both legs of the evidence: what was authorized
and what happened. What's missing is a machine-readable format for the
mismatch between them — and a verification path that a third party can
walk without callbacks to either side.

<img alt="dispute-concept" src="dispute-concept.svg" />

## Design guidelines

1. **Layer, don't fork.** Dispute evidence is an extension artifact
   that layers on ACK-Pay core's receipt binding and ACK-ID core's
   grant model. No changes to core artifacts.

2. **Evidence, not verdicts.** The protocol generates verifiable
   evidence of a mismatch. Whether that evidence warrants a refund is
   a business decision above the protocol.

3. **Mechanical verification.** A resolver can verify every claim in
   the evidence by extracting fields from the embedded grant and
   receipt and comparing values. No natural-language interpretation
   required.

4. **Same verification infrastructure.** Dispute evidence is a signed
   JWT verified with the same key resolution and signature
   verification that core uses. No new cryptographic primitives.

5. **Fail closed on missing evidence.** If the grant or receipt is
   missing, tampered, or doesn't match its artifact reference, the
   entire dispute is rejected. There is no partial-evidence path.

## Document map

| Section | Location |
|---|---|
| Evidence trail, artifact, reason codes, verification checklist | [ext-disputes.md](ext-disputes.md) |
| Working example (jose) | [example.ts](example.ts) |

## Settled decisions

1. **Dispute evidence is a JWT, not a VC.** Consistent with v2's
   move from Verifiable Credentials to plain JOSE. A lossless
   VC mapping can live in ext-attestations if needed.

2. **The disputant signs.** The disputant (grant issuer) is the only
   party with standing to claim a mismatch. The agent can't dispute
   its own authorization, and the merchant has no visibility into the
   grant's constraints.

3. **Grants are referenced by content hash.** The `ack.grant`
   artifact reference (SHA-256, base64url) is already defined in
   ACK-Pay core Section 4. Dispute evidence reuses it — no new
   binding mechanism.

4. **Deltas are structured, not narrative.** Each delta entry names
   a field, an authorized value, and an actual value. A resolver
   verifies mechanically. This trades expressiveness for
   verifiability — a disputant who can't express their complaint
   as a field mismatch needs a human arbitration layer.

5. **Reason codes are extensible.** Unrecognized codes don't cause
   rejection. The delta is self-describing, so a resolver can verify
   the mismatch even with an unknown reason label. The cost: a
   reason code alone is never sufficient evidence; the delta must
   always be present and verifiable.

6. **Only mechanically verifiable mismatches.** Category mismatch and
   "no grant" were deliberately excluded from the reason code
   registry — neither can be verified by comparing grant fields to
   receipt fields. The cost: some real disputes can't be expressed
   as machine-readable evidence and need human arbitration.

7. **Evidence expires.** 90-day SHOULD, matching common chargeback
   windows. The cost: legitimate disputes filed after 90 days are
   unverifiable by compliant resolvers.

## Dependencies

This proposal depends on:

- **ACK-ID core** — grants, artifact references, key resolution
- **ACK-Pay core** — receipt `ack` binding, payment request embedding

Both are proposed in [RFC: ACK-ID + ACK-Pay v2](https://github.com/agentcommercekit/ack/pull/179).

## Open questions for reviewers

- Should the offer-retention recommendation (Section 8) be a MUST?
  That strengthens dispute evidence but increases storage requirements
  for agents.
- Is 90 days the right evidence expiry window for agent commerce, or
  do autonomous agents need a shorter/longer window?
- Should the protocol define counter-evidence, or leave response
  mechanisms entirely to the resolution layer?
