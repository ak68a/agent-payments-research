# agent-payments-research

Research and proposals for agent payment safety across machine payment protocols.

## Structure

| Directory | What's in it |
|---|---|
| [dispute-resolution/](dispute-resolution/) | Evidence architecture for agent payment disputes (ext-disputes, ext-delivery) |
| [active/](active/) | Research threads in progress, not yet ready for proposal |
| [drafts/](drafts/) | Cross-protocol issue drafts |

## Active research

| Thread | Status | Protocols | Description |
|---|---|---|---|
| [Delegation/authorization](active/delegation.md) | Research | x402, MPP | How does a server know an agent is authorized by a principal, and within what constraints? x402 has no delegation model. |
| [Session/agreement binding](active/session-binding.md) | Research | x402 | Binding multiple payments to one agreement with terms, budget, and expiry. Stateless payments can't express aggregate constraints. |
| [Refund-to-dispute pipeline](active/refund-pipeline.md) | Research | x402 | Dispute evidence can identify problems but can't trigger remediation for exact-scheme payments. No standard refund path. |

## Proposals

| Proposal | Status | Description |
|---|---|---|
| [dispute-resolution](dispute-resolution/) | Draft | Evidence architecture for agent payment disputes |

### Cross-protocol issues

| Protocol | Issue | Primitives | Key gap |
|---|---|---|---|
| **ACK** | [agentcommercekit/ack#217](https://github.com/agentcommercekit/ack/issues/217) | Grant -> receipt -> `dispute+jwt` | Has the grant-to-receipt binding; needs the dispute artifact |
| **MPP** | [tempoxyz/mpp-specs#359](https://github.com/tempoxyz/mpp-specs/issues/359) | Challenge -> credential -> receipt | No authorization-scope artifact exists yet |
| **x402** | [x402-foundation/x402#3500](https://github.com/x402-foundation/x402/issues/3500) | Offer -> receipt -> facilitator | Offer-receipt extension anticipates disputes but stops short |
| **x402** | [x402-foundation/x402#3678](https://github.com/x402-foundation/x402/issues/3678) | Offer -> delivery -> receipt | Delivery conformance as fifth failure class (companion to #3500) |

## How it works

A dispute evidence artifact binds three things:

1. **Authorization scope** -- what the user authorized the agent to do (amount, recipient, expiry)
2. **Action** -- what the agent actually did (the payment receipt)
3. **Delta** -- which fields don't match, with the authorized and actual values

A resolver walks the evidence mechanically: extract the named field from each embedded artifact, confirm the values differ. No interpretation, no callbacks, no external state.

See [dispute-resolution/](dispute-resolution/) for the full spec (ACK as the reference implementation) and [protocol-mappings.md](dispute-resolution/protocol-mappings.md) for how the concept translates to MPP and x402.

## Process

1. Research the gap in `active/` with notes, questions, and protocol analysis
2. Draft the proposal in its own directory with spec, diagrams, and a working `jose` example
3. Open issues on each protocol's repo with the motivation and concept sketch
4. If a protocol team is receptive, contribute a spec PR in their repo using their conventions
