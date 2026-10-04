# MPP PR Backlog

Notable PRs from tempoxyz/mpp-specs ranked by protocol significance. Focus on protocol-level engineering, not chain-specific boilerplate or CI/infra.

## Tier 1 - High significance

### PR #328 - Alternate payment credential header
**Author:** raubrey-stripe | **Status:** merged | **Date:** 2026-08-25
**Size:** +179/-24 across 1 file (core spec)
**What it does:** Adds an alternate credential header mechanism to the core MPP auth spec. Stripe engineer modifying the core protocol for how payment credentials are presented.
**Why it matters:** A Stripe engineer reshaping the core wire format for payment credentials. Shows how traditional payment companies are shaping agent payment standards.
**Source:** https://github.com/tempoxyz/mpp-specs/pull/328

### PR #305 - Solana confidential transfers
**Author:** lgalabru | **Status:** merged | **Date:** 2026-08-07
**Size:** +663/-7 across 4 files (charge + subscription specs)
**What it does:** Adds support for Solana confidential transfers to the charge intent. Touches the subscription specs too, propagating privacy-preserving payment across intents.
**Why it matters:** Privacy in agent payments. Confidential transfers mean the payment amount isn't publicly visible on-chain. Directly relevant to the privacy gap we identified in the x402 audit.
**Source:** https://github.com/tempoxyz/mpp-specs/pull/305

### PR #362 - HMAC header slot vectors
**Author:** brendanjryan | **Status:** merged | **Date:** 2026-09-21
**Size:** +95/-20 across 1 file (core spec)
**What it does:** Defines HMAC header slot vectors in the core protocol. Determines which headers are signed and in what order for payment authentication.
**Why it matters:** Security-critical spec work. Header signing order affects replay protection and tampering resistance. The kind of subtle spec decision that has outsized impact.
**Source:** https://github.com/tempoxyz/mpp-specs/pull/362

### PR #338 - Authorization evidence extension draft (CLOSED)
**Author:** saneGuy | **Status:** closed | **Date:** 2026-08-30
**Size:** +424/-0 across 1 file (new extension spec)
**What it does:** Proposed an authorization evidence extension for MPP. 424 lines of spec for how authorization evidence is structured and verified.
**Why it matters:** Someone else tried to solve the same problem we're working on (authorization/delegation evidence) and the PR was closed. Understanding why it was rejected tells us what the MPP team considers in/out of scope.
**Source:** https://github.com/tempoxyz/mpp-specs/pull/338

### PR #348 - Payment compliance screening extension (CLOSED)
**Author:** OceanAlt666 | **Status:** closed | **Date:** 2026-09-07
**Size:** +199/-0 across 1 file (new extension spec)
**What it does:** Proposed a compliance screening extension. Payer compliance checks before settlement.
**Why it matters:** Compliance as a protocol concern, not an application concern. The fact that it was closed tells us where the MPP team draws the line on what belongs in the protocol vs the application layer.
**Source:** https://github.com/tempoxyz/mpp-specs/pull/348

## Tier 2 - Good supporting content

### PR #323 - Require challenge binding verification
**Author:** brendanjryan | **Status:** merged | **Date:** 2026-08-18
**Size:** +68/-8 across 3 files (core spec + lint)
**What it does:** Makes challenge binding verification a MUST in the spec. Previously underspecified, now servers must verify that the credential matches the challenge that was issued.
**Why it matters:** Tightening a security gap. Without this, a credential from one challenge could be replayed against a different challenge.
**Source:** https://github.com/tempoxyz/mpp-specs/pull/323

### PR #335 - Card charge cached-200 replay fix (OPEN)
**Author:** ygd58 | **Status:** open | **Date:** 2026-08-23
**Size:** +31/-6 across 1 file (card charge spec)
**What it does:** Requires same-credential match before allowing a cached 200 replay on card charges. Prevents unauthenticated resource re-delivery.
**Why it matters:** Security fix for the card payment method. The existing spec allows replaying a successful response without re-verifying the credential. One of the issues we flagged in the watching section.
**Source:** https://github.com/tempoxyz/mpp-specs/pull/335

### PR #296 - Solana sessions operational cost reduction
**Author:** lgalabru | **Status:** merged | **Date:** 2026-07-17
**Size:** +679/-177 across 1 file (Solana session spec)
**What it does:** Major rewrite of the Solana session spec to reduce operational costs. Rethinks how sessions are managed on-chain.
**Why it matters:** The economics of on-chain agent payment sessions. When every session operation costs gas, the protocol design has to optimize for cost, not just correctness.
**Source:** https://github.com/tempoxyz/mpp-specs/pull/296

### PR #309 - Solana session operator-signed mode + idle timeout
**Author:** lgalabru | **Status:** merged | **Date:** 2026-08-07
**Size:** +445/-60 across 4 files (session + subscription specs)
**What it does:** Tightens operator-signed mode for Solana sessions and adds idle timeout. Prevents sessions from staying open indefinitely.
**Why it matters:** Session lifecycle management. Idle timeouts prevent resource leaks when agents abandon sessions without closing them.
**Source:** https://github.com/tempoxyz/mpp-specs/pull/309

### PR #299 - Near Intents refund and settlement recovery
**Author:** mikedotexe | **Status:** merged | **Date:** 2026-07-29
**Size:** +76/-31 across 1 file (Near Intents charge spec)
**What it does:** Clarifies refund and settlement recovery for Near Intents. What happens when settlement fails or needs to be reversed.
**Why it matters:** Refund/recovery semantics for a specific chain. Relevant to our refund-pipeline research thread.
**Source:** https://github.com/tempoxyz/mpp-specs/pull/299

## Tier 3 - New payment method additions (reference, not primary content)

### PR #346 - XRPL payment method (+1670 lines)
### PR #284 - Near Intents charge intent (+916 lines)
### PR #272 - USDC charge payment method (+1382 lines, Circle engineer)
### PR #258 - Hedera session intent (+2386 lines)
### PR #251 - Hedera charge intent (+1347 lines)
### PR #312 - Generic SPT spec (+1619 lines, open)

These are large spec PRs adding new chains/methods. Individually they're implementation work, but the pattern (how a new payment rail gets specced for MPP) is worth understanding.
