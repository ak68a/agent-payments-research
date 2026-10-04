# Delegation.md: internal consistency check

## 1. Privacy model vs dispute model

**Status: Inconsistency found.**

The "Connection to dispute evidence" section (line 150) says: "A dispute resolver extracts the grant from payment extensions and compares it against the receipt."

But the privacy section (line 218) says: in `attestation`/`none` mode, the grant ISN'T in the payment extensions visible to the server. The principal presents it at dispute time.

These two sections describe different flows without acknowledging each other. A reader hitting line 150 thinks the grant is always in the payment record. A reader hitting line 218 learns it might not be.

The `scope_ref` (hash reference) itself is fine — the dispute evidence references the grant by hash regardless of where the grant came from. But the "extracts the grant from payment extensions" language is wrong for privacy modes.

**Resolution:** Line 150 should say something like: "A dispute resolver verifies the grant against the receipt. In `full` mode the grant is in the payment extensions. In `attestation`/`none` mode the principal supplies the grant at dispute time, and the facilitator's retained hash confirms it was the grant used in that transaction."

## 2. Constraint vocabulary vs multi-chain fields

**Status: Overlap — technically consistent but confusing.**

The minimum viable artifact table (lines 117-120) has:
- "Asset/network — Denomination of the amount constraint (e.g. CAIP-19)"
- "Allowed networks — Which chains this grant covers"

The well-known constraints section (lines 184-188) has:
- `maxAmount` "denominated in the grant's own `asset`/`network` fields"
- `allowedNetworks`: array of CAIP-2 network identifiers

These are the same fields described in two places. The artifact table calls them "Asset/network" and "Allowed networks" as top-level grant fields. The constraints section lists `allowedNetworks` as a well-known constraint. Are `allowedNetworks` and "Allowed networks" the same field? Is "Asset/network" a top-level field or part of constraints?

**Resolution:** Clarify that the minimum viable artifact table shows all grant fields including well-known constraints inline. Or explicitly say: "The well-known constraints (`maxAmount`, `allowedRecipients`, `expiry`, `allowedNetworks`) are fields within the grant's `constraints` object. `asset`/`network` (the denomination) is a top-level grant field, not a constraint." Right now the reader can't tell whether `allowedNetworks` is a top-level field or a constraint member.

## 3. Phased rollout vs edge case answers

**Status: Consistent.**

The "where it plugs in" section (line 216) says `full` is the only working mode at launch. The edge case answers don't assume privacy modes are available. The dispute interaction paragraph acknowledges that privacy-mode dispute handling is different but doesn't claim it works at launch.

No issue here.

## 4. Verification spectrum vs facilitator section

**Status: Tension — not a contradiction, but the framing is confusing.**

The verification spectrum (line 132) places the proposal on the offline end: "a delegation extension should verify offline for per-payment constraints." But the facilitator section (line 93) describes the facilitator doing the verification (address comparison, constraint checks, returning results). That's not offline — it's facilitator-dependent.

These aren't contradictory because "offline" in context means "no callback to the principal" (like ACK grants), not "no server/facilitator involvement." But a reader could think "verify offline" means the client verifies locally, when actually the facilitator verifies without calling the principal.

**Resolution:** Clarify what "offline" means in the verification spectrum. Something like: "Offline here means the verifier (facilitator or server) doesn't need to contact the principal or any external authority to check per-payment constraints. The grant is self-contained — signature, constraints, and expiry are all in the artifact."

## 5. `aud` semantics — who checks it?

**Status: Inconsistency found.**

Three sections reference `aud` checking:

- Minimum viable artifact (line 125): "`aud` is the resource server, not the facilitator"
- Concurrent grants (line 162): "The server MAY enforce `aud` and `iss` matching"
- Facilitator section (line 93): the facilitator does constraint verification

So who checks `aud`? The facilitator verifies the grant, but `aud` is the resource server's identifier. Does the facilitator check `aud`? It would need to know which resource server the payment is for, which it does (the resource server initiated the flow). But this isn't stated.

The concurrent grants section says the server checks `aud`. But in `attestation`/`none` privacy modes, the server doesn't see the grant. So only the facilitator can check `aud` in those modes.

**Resolution:** State explicitly: the facilitator MUST check `aud` against the originating resource server (it knows this from the payment flow). The server MAY additionally check `aud` in `full` mode when it has the grant. In `attestation`/`none` mode, the facilitator's `aud` check is the only one. This makes the facilitator the `aud` gatekeeper, which is consistent with it being the verification party.

## 6. Error codes vs constraint categories

**Status: Gap — not contradictory, but incomplete.**

Error code `delegation_constraint_violated` (line 268) is defined for the facilitator's `VerifyResponse`. But the constraint vocabulary (line 190-193) says audience-scoped constraints are evaluated by the server, not the facilitator. So:

- Who returns `delegation_constraint_violated` for a well-known constraint? The facilitator, in `VerifyResponse`. Clear.
- Who returns it for an audience-scoped constraint? The server, after the facilitator passes the constraint through. But the error code is defined in `VerifyResponse.extensions.delegation.error`, which is a facilitator response.

The server would need its own error mechanism for audience-scoped constraint failures, and that's not defined.

**Resolution:** Add a note: "For audience-scoped constraints, the server evaluates them after the facilitator's verification pass. If a server-evaluated constraint fails, the server returns its own error (e.g. HTTP 403 with a delegation error body). The `delegation_constraint_violated` error code in `VerifyResponse` applies only to well-known constraints the facilitator evaluates." Or define a second error surface for server-side constraint evaluation.

## 7. Budget reference

**Status: Consistent but `budgetRef` is a ghost field.**

`budgetRef` is mentioned in edge case #6 (line 232): "The grant carries an optional `budgetRef` pointing to a budget authority by URI." And in open question #3 (line 286): "What does `budgetRef` look like?"

But `budgetRef` does NOT appear in the minimum viable artifact table (lines 110-121). It's described as optional, so omitting it from the "minimum" table is defensible. But a reader might wonder where it lives in the grant structure.

**Resolution:** Either add `budgetRef` to the artifact table as an optional field, or add a sentence after the table: "Optional fields not shown: `budgetRef` (URI to a budget authority for aggregate limit enforcement), `disclosure` (privacy mode)." This also surfaces the `disclosure` field, which is described in the privacy section but also absent from the artifact table.

## 8. Pushback fixes verification

Checking each of the 10 pushback findings against the current doc:

1. **Privacy requires facilitator work** — Fixed. Line 216 acknowledges `full` is launch mode, others are progression. ✓
2. **Facilitator doesn't verify identity** — Fixed. Line 93 and 127 use address comparison, not DID resolution. ✓
3. **Denomination ambiguity** — Fixed. Asset/network added to artifact table (lines 117-118). ✓
4. **MUST-reject deadlock** — Fixed. Well-known vs audience-scoped split at lines 184-195. ✓
5. **Concurrent grants B2B** — Fixed. Validity vs applicability split at lines 162. ✓
6. **Wrong party holds evidence** — Fixed. Principal retains grant, lines 218-220. ✓
7. **No error semantics** — Fixed. Error codes at lines 264-270. ✓ (But see finding #6 above about audience-scoped gaps.)
8. **`aud` semantics** — Partially fixed. `aud` defined as resource server at line 125, array support mentioned. But who checks it is ambiguous (see finding #5 above). ⚠️
9. **Multi-chain mismatch** — Fixed. `allowedNetworks` and denomination at lines 254-258. ✓
10. **"Just an extension" understated** — Fixed. Multi-party implementation path at lines 99. ✓

## Summary

**3 inconsistencies to fix:**
1. Dispute evidence section assumes grant is always in payment extensions (doesn't account for privacy modes)
2. `aud` checking responsibility unclear across facilitator, server, and privacy modes
3. Error codes don't cover server-side audience-scoped constraint failures

**3 clarity improvements (technically consistent but confusing):**
4. Asset/network vs allowedNetworks — top-level field or constraint member?
5. "Offline" verification means "no principal callback," not "no facilitator"
6. `budgetRef` and `disclosure` are described but absent from the artifact table
