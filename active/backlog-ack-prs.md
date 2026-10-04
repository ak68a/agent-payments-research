# ACK PR Backlog

Notable PRs from agentcommercekit/ack, ranked by engineering/protocol significance.

---

### PR #179 - RFC: ACK-ID + ACK-Pay v2
**Author:** venables | **Status:** open | **Date:** 2026-08-27
**Size:** +1603/-2 across 11 files
**What it does:** The v2 specification for ACK identity and payments. Introduces grants (delegation from owner to agent with constraints), x402 offer-receipt profiling with `ack` binding, and a new verification model. 17 reviews, active community discussion.
**Why it matters:** This is the foundational protocol design for agent payment authorization. The grant model is the only production-ready delegation artifact in the space, and our dispute taxonomy depends on it.
**Source:** https://github.com/agentcommercekit/ack/pull/179

### PR #135 - fail closed when credential revocation cannot be verified
**Author:** venables | **Status:** merged | **Date:** 2026-08-04
**Size:** +1844/-129 across 23 files
**What it does:** Changes `isRevoked` from fail-open (return false on error) to fail-closed (throw on error). Adds full verification of the status list credential: proof, trusted issuer, id binding, expiry, statusSize, index bounds. Massive hardening of the revocation path.
**Why it matters:** A case study in fail-open vs fail-closed design for financial infrastructure. The same pattern shows up in x402's hook bug (#3689).
**Source:** https://github.com/agentcommercekit/ack/pull/135

### PR #133 - refuse redirects when resolving did:web by default
**Author:** EfeDurmaz16 | **Status:** merged | **Date:** 2026-07-28
**Size:** +256/-9 across 5 files
**What it does:** Blocks HTTP redirects during did:web resolution by default. A redirect could bypass the `allowedHttpHosts` check by resolving the DID to a different host than the one in the DID string.
**Why it matters:** Subtle identity resolution attack vector. The DID says one thing, the redirect sends you somewhere else, and the host allowlist doesn't catch it.
**Source:** https://github.com/agentcommercekit/ack/pull/133

### PR #130 - require aud when an audience is expected (breaking)
**Author:** EfeDurmaz16 | **Status:** merged | **Date:** 2026-07-22
**Size:** +161/-6 across 5 files
**What it does:** Makes JWT audience validation mandatory when the caller supplies an expected audience. Previously a token with no `aud` claim would pass verification even when an audience was expected.
**Why it matters:** JWT audience enforcement is a common miss. An agent grant without audience binding can be replayed against any relying party.
**Source:** https://github.com/agentcommercekit/ack/pull/130

### PR #125 - MCP server for ACK-ID and ACK-Pay operations
**Author:** ak68a (us) | **Status:** closed | **Date:** 2026-07-03
**Size:** +3723/-0 across 28 files
**What it does:** An MCP server exposing 13 ACK tools (create credentials, issue payment requests, verify receipts). Any MCP-compatible agent can use ACK identity and payment operations directly. Closed by maintainer as out of scope for the monorepo.
**Why it matters:** The first attempt to bridge MCP and agent payment identity. The scope decision (in-repo vs ecosystem package) is itself a story about protocol governance.
**Source:** https://github.com/agentcommercekit/ack/pull/125

### PR #215 - preserve payment grants through 402 challenges
**Author:** aadopii | **Status:** open | **Date:** 2026-09-10
**Size:** +244/-1 across 7 files
**What it does:** Addresses a lifecycle bug where a single-use grant gets consumed during the authentication check before the 402 payment challenge, leaving the agent unable to complete the paid retry.
**Why it matters:** Edge case at the intersection of identity and payment flows. The grant lifecycle has to survive the 402 dance, which is exactly the flow ack-x402 middleware would handle.
**Source:** https://github.com/agentcommercekit/ack/pull/215

### PR #117 - Modernize toolchain: pnpm 11, TypeScript 6, oxlint
**Author:** venables | **Status:** merged | **Date:** 2026-06-24
**Size:** +4588/-5269 across 136 files
**What it does:** Major toolchain upgrade: pnpm 10 to 11, TypeScript 6, oxlint type-checking, dependency cleanup. Touches 136 files.
**Why it matters:** Interesting as a "how to modernize a monorepo" case study, but lower priority for agent-payment-specific content.
**Source:** https://github.com/agentcommercekit/ack/pull/117

### PR #120 - extract and harden expiresAt timestamp schema
**Author:** EfeDurmaz16 | **Status:** merged | **Date:** 2026-07-01
**Size:** +82/-10 across 4 files
**What it does:** Extracts a shared timestamp validator that rejects unparseable dates instead of treating them as "no expiry." Fail-closed on bad input.
**Why it matters:** Small change, big safety implication. A malformed expiresAt turning into "never expires" is the kind of bug that enables replay attacks on payment requests.
**Source:** https://github.com/agentcommercekit/ack/pull/120

### PR #195 - HITL approval request and decision types
**Author:** kutluhaneth46 | **Status:** closed | **Date:** 2026-09-03
**Size:** +168/-0 across 5 files
**What it does:** Proposes shared types for a human-in-the-loop payment approval flow: PaymentApprovalRequest/PaymentApprovalDecision with valibot guards. Closed as premature by maintainer.
**Why it matters:** The question of when an agent should ask a human is fundamental. This PR's rejection is interesting as a scope/timing decision, not a design failure.
**Source:** https://github.com/agentcommercekit/ack/pull/195
