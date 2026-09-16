# agent-payments-research

Research and proposals for dispute resolution across machine payment protocols.

The core problem: every agent payment protocol handles the forward flow (authorize → pay → receipt) but none handle the reverse — what happens when the agent was wrong? The payment was authenticated, authorized, and completed. No fraud occurred. But the agent acted outside the scope the user granted, and no protocol can express that.

The core idea: an **evidence triple** — authorization scope + action + structured delta — that a third party can verify mechanically with no callbacks to either side. The concept is protocol-agnostic; each protocol maps it to its own primitives.

## Proposals

| Proposal | Status | Description |
|---|---|---|
| [dispute-resolution](dispute-resolution/) | Draft | Evidence architecture for agent payment disputes |

### Cross-protocol issues

| Protocol | Issue | Primitives | Key gap |
|---|---|---|---|
| **ACK** | [agentcommercekit/ack#217](https://github.com/agentcommercekit/ack/issues/217) | Grant → receipt → `dispute+jwt` | Has the grant-to-receipt binding; needs the dispute artifact |
| **MPP** | [tempoxyz/mpp-specs#359](https://github.com/tempoxyz/mpp-specs/issues/359) | Challenge → credential → receipt | No authorization-scope artifact exists yet |
| **x402** | [x402-foundation/x402#3500](https://github.com/x402-foundation/x402/issues/3500) | Offer → receipt → facilitator | Offer-receipt extension anticipates disputes but stops short |

## How it works

A dispute evidence artifact binds three things:

1. **Authorization scope** — what the user authorized the agent to do (amount, recipient, expiry)
2. **Action** — what the agent actually did (the payment receipt)
3. **Delta** — which fields don't match, with the authorized and actual values

A resolver walks the evidence mechanically: extract the named field from each embedded artifact, confirm the values differ. No interpretation, no callbacks, no external state.

See [dispute-resolution/](dispute-resolution/) for the full spec (ACK as the reference implementation) and [protocol-mappings.md](dispute-resolution/protocol-mappings.md) for how the concept translates to MPP and x402.

## Process

1. Draft the proposal here with spec, diagrams, and a working `jose` example
2. Open issues on each protocol's repo with the motivation and concept sketch
3. If a protocol team is receptive, contribute a spec PR in their repo using their conventions
