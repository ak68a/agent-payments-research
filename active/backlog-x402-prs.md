# x402 PR Backlog

Notable PRs from x402-foundation/x402, ranked by engineering/protocol significance.

## Merged - Protocol & Architecture

### PR #3197 - Auth-capture spec update: v1.1
**Author:** phdargen | **Status:** merged | **Date:** 2026-08-25
**Size:** +782/-215 across 2 files
**What it does:** Aligns the auth-capture scheme (hold/capture/void/refund lifecycle) with x402's payment flow model. Specifies how server-initiated operations (capture, void, refund) are authenticated after the initial client authorization.
**Why it matters:** The only x402 scheme with refund semantics. The spec decisions here shape what dispute resolution can actually trigger as remediation.
**Source:** https://github.com/x402-foundation/x402/pull/3197

### PR #3124 - feat(TS): spend controls
**Author:** phdargen | **Status:** merged | **Date:** 2026-08-13
**Size:** +3795/-1317 across 100 files
**What it does:** Adds client-side spend controls: default $1 USD per-payment cap on recognized pegged assets, configurable per-asset limits. Declarative, enforced before payment signing.
**Why it matters:** First attempt at agent spending limits in x402, but client-only and unverifiable by the server. Illustrates the gap between client-enforced safety and protocol-level authorization.
**Source:** https://github.com/x402-foundation/x402/pull/3124

### PR #3214 - Settlement pending auto-recovery
**Author:** CarsonRoscoe | **Status:** merged | **Date:** 2026-08-25
**Size:** +11276/-449 across 94 files
**What it does:** When a facilitator broadcasts a settlement transaction but times out waiting for confirmation, the caller now gets a pending state with the tx hash instead of a hard failure. Allows reconciliation before retrying.
**Why it matters:** Real-world payment reliability engineering. The gap between "transaction sent" and "transaction confirmed" is where money gets lost in agent payments.
**Source:** https://github.com/x402-foundation/x402/pull/3214

### PR #3603 - Go batch-settlement + unified PaymentChannelStorage
**Author:** phdargen | **Status:** merged | **Date:** 2026-09-29
**Size:** +38781/-6327 across 100 files
**What it does:** Full Go implementation of SVM batch-settlement: multiple agents share an escrow pool, server claims all vouchers in one transaction. Includes a unified PaymentChannelStorage abstraction and paymentchannels refactor.
**Why it matters:** The infrastructure for multi-agent pooled payments. Directly relevant to the crew/delegation problem.
**Source:** https://github.com/x402-foundation/x402/pull/3603

### PR #3346 / #3347 - Delegated receiver authorizer for SVM upto
**Author:** phdargen / PhilBot402 | **Status:** merged | **Date:** 2026-09-03
**Size:** +1287/-146 (TS) / +1268/-91 (Go) across 48 files
**What it does:** SVM upto can delegate the receiverAuthorizer role to the facilitator. Servers that omit a ReceiverAuthorizerSigner no longer need a Solana keypair. Matches EVM batch-settlement's pattern.
**Why it matters:** Delegation at the settlement layer. The facilitator takes on trust responsibilities the server used to hold.
**Source:** https://github.com/x402-foundation/x402/pull/3346

## Merged - Security

### PR #2859 - Bind SIWX domain validation to a configured origin
**Author:** phdargen | **Status:** merged | **Date:** 2026-07-15
**Size:** +1072/-338 across 36 files
**What it does:** SIWX (Sign-In-With-X) was validating challenge domains against the request URL's Host header, which the caller controls. Now binds to a server-configured origin so challenge issuance and verification use the same trusted value.
**Why it matters:** Classic web security bug (trusting client-supplied Host) in a payment protocol. The fix pattern is well-established in web auth but novel in agent payment contexts.
**Source:** https://github.com/x402-foundation/x402/pull/2859

### PR #2933 - SVM SIWx small-order Ed25519 verification
**Author:** phdargen | **Status:** merged | **Date:** 2026-07-23
**Size:** +109/-1 across 8 files
**What it does:** Rejects small-order Ed25519 public keys before signature validation in SVM SIWX. Prevents a class of cryptographic attack where specially crafted keys produce valid-looking signatures.
**Why it matters:** Subtle cryptographic hardening. Small-order key attacks are well-known in Ed25519 but easy to miss in new implementations.
**Source:** https://github.com/x402-foundation/x402/pull/2933

### PR #3577 - Fastify path bypass
**Author:** CarsonRoscoe | **Status:** merged | **Date:** 2026-10-02
**Size:** +171/-0 across 4 files
**What it does:** Fixes a payment gate bypass in Fastify middleware. Fastify's `request.url` is the raw request-target from the HTTP line. An attacker could craft a request that bypasses the payment check on protected routes.
**Why it matters:** Payment bypass via HTTP middleware mismatch. The same class of vulnerability (path normalization) that hits auth systems, now in payment gating.
**Source:** https://github.com/x402-foundation/x402/pull/3577

### PR #3502 - Close literal-route bypass via percent-encoded path separator
**Author:** CarsonRoscoe | **Status:** merged | **Date:** 2026-09-21
**Size:** +318/-15 across 9 files
**What it does:** Fixes a payment gate bypass in Python middleware where percent-encoded path separators could widen wildcard captures in route matching, skipping payment enforcement.
**Why it matters:** Same class as #3577 but different vector. Payment middleware has to solve the same URL normalization problems web auth frameworks solved years ago.
**Source:** https://github.com/x402-foundation/x402/pull/3502

### PR #3521 - Reject malformed CAIP-2 network identifiers
**Author:** HereForTheTechNFT | **Status:** merged | **Date:** 2026-09-21
**Size:** +40/-8 across 3 files
**What it does:** `parseInt` silently truncated malformed CAIP-2 network IDs, resolving garbage input to a valid chain ID. A malformed network string could route payments to the wrong chain.
**Why it matters:** Parsing leniency in chain identifiers as a payment safety issue. Small fix, high impact.
**Source:** https://github.com/x402-foundation/x402/pull/3521

## Merged - New Chains

### PR #2801 - XRPL exact scheme TypeScript reference implementation
**Author:** aristotle-satoshi | **Status:** merged | **Date:** 2026-07-14
**Size:** +6728/-238 across 85 files
**What it does:** Full XRPL exact scheme implementation following the new-chains contribution workflow: spec first (#2547), then reference implementation.
**Why it matters:** Case study of x402's chain-agnostic extension model in practice. How a non-EVM chain integrates with the same payment protocol.
**Source:** https://github.com/x402-foundation/x402/pull/2801

### PR #3141 - Add Solana upto to Go SDK
**Author:** CarsonRoscoe | **Status:** merged | **Date:** 2026-08-17
**Size:** +20722/-4212 across 100 files
**What it does:** Full Go implementation of SVM upto scheme (authorize max, settle actual) to spec parity with TypeScript. Includes payment channels on Solana.
**Why it matters:** Authorize-max/settle-actual on Solana. The engineering of payment channels on a non-EVM chain.
**Source:** https://github.com/x402-foundation/x402/pull/3141

## Open - The Frontier

### PR #3682 - Execution-evidence and delivery receipt specification
**Author:** whawk46 | **Status:** open | **Date:** 2026-10-04
**What it does:** Canonical mechanism to cryptographically bind on-chain payment settlement to verified delivery proof. Uses JCS canonicalization, Ed25519/EIP-712 signatures, optional SCITT transparency logs.
**Why it matters:** Overlaps with our #3678 (ext-delivery). Two independent proposals for the same gap on the same day.
**Source:** https://github.com/x402-foundation/x402/pull/3682

### PR #3681 - Extension: refund
**Author:** ceedot-rock | **Status:** open | **Date:** 2026-10-04
**What it does:** Standalone refund extension for exact-scheme payments. Servers advertise refund terms, clients send signed refund requests.
**Why it matters:** The missing remediation path for dispute resolution. Exact payments (18 chains) currently have no refund mechanism.
**Source:** https://github.com/x402-foundation/x402/pull/3681

### PR #3683 - Hardware attestation enclave specification
**Author:** whawk46 | **Status:** open | **Date:** 2026-10-04
**What it does:** Extension spec for enclave-based proof of execution. Hardware attestation for agent compute.
**Why it matters:** Trust model shift from "verify the output" to "verify the environment." Relevant to high-stakes agent payments.
**Source:** https://github.com/x402-foundation/x402/pull/3683

### PR #3656 - Reviews extension specification
**Author:** damiafuentes | **Status:** open | **Date:** 2026-10-02
**What it does:** Payment-backed reviews in 402 and settlement responses. Reputation signal anchored to real payments.
**Why it matters:** Pre-payment trust signal vs post-payment dispute evidence. Complementary to our work.
**Source:** https://github.com/x402-foundation/x402/pull/3656

### PR #3688 - Bitcoin Lightning exact mechanism
**Author:** MajorTal | **Status:** open | **Date:** 2026-10-04
**What it does:** Full TypeScript implementation of Lightning Network exact payments for x402.
**Why it matters:** Lightning is architecturally different from EVM/SVM (invoice-based, no on-chain settlement). How x402 adapts.
**Source:** https://github.com/x402-foundation/x402/pull/3688

### PR #3666 - Builder-code facilitator-authored settlement metadata
**Author:** phdargen | **Status:** open | **Date:** 2026-10-02
**What it does:** Lets the facilitator attach metadata to settlements via the builder-code extension. Attribution and analytics at the settlement layer.
**Why it matters:** The facilitator's evolving role beyond verify/settle into attestation and metadata.
**Source:** https://github.com/x402-foundation/x402/pull/3666
