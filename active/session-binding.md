# Session and agreement binding for agent payments

**Status:** Research
**Protocols:** x402
**Related:** x402 #3646, x402 #3620, ty-everett's case in #3500

## Gap

Every x402 payment is stateless and independent. There's no standard way to say "these 50 payments are part of one agreement with these terms." This makes several things impossible at the protocol level:

- Aggregate budget enforcement (ty-everett's concurrent payment case from #3500)
- Subscription semantics (repeated access under one set of terms)
- Multi-payment workflows (agent shops across merchants against one budget)
- Session-scoped spending limits

x402 #3646 (agreement-session extension) asks for this. Zero engagement so far. #3620 (pooled escrow for agent crews) is a specific instance of the same problem.

## Questions to answer

- Is this an extension or does it need core spec changes? (statelessness might be a design principle, not just an omission)
- What's the binding artifact? An agreement ID in the receipt? A session token? A reference to an off-chain agreement?
- How does a facilitator verify that a payment belongs to a session without maintaining session state?
- What's the relationship to delegation? (a session might be scoped by a grant)
- How does this interact with the aggregate-budget dispute class? (session binding is what makes aggregate disputes mechanically verifiable)

## Prior art

- AP2 IntentMandate: has budget and session semantics, but AP2-specific
- ACK grants: have expiry and constraints, but per-grant not per-session
- AlgoVoi's session JWT approach (AP2 #207 thread): session-scoped spend cap at the gateway layer
- Delegare's authorize/commit/refund/query (AP2 #207 thread): atomic decrement as the authorization operation

## Summary

Every payment protocol handles one payment at a time. None of them handle fifty. The session gap is where individual payment safety meets systemic risk.
