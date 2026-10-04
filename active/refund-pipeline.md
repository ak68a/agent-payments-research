# Refund-to-dispute pipeline

**Status:** Research
**Protocols:** x402
**Related:** x402 PR by ceedot-rock (refund extension), auth-capture scheme

## Gap

The dispute evidence extension (#3500) can identify what went wrong. But for exact-scheme payments (the dominant x402 scheme, 18 chains), there's no standard way to trigger remediation. A dispute proves the agent overspent, but then what?

auth-capture has refund as a lifecycle operation (hold/capture/void/refund). exact does not. The refund story is fragmented:

- auth-capture: refund exists as a first-class verb
- exact: no refund path at all
- batch-settlement: unclear

There's a community PR (ceedot-rock) proposing a standalone refund extension for exact payments: servers advertise refund terms, clients send signed refund requests. But it's disconnected from the dispute system.

## Questions to answer

- Should dispute resolution trigger refunds, or should they be independent mechanisms that can be composed?
- What does a refund look like for an on-chain exact payment? (reverse transaction? credit memo? off-chain settlement?)
- Who initiates the refund? (the disputing party? the facilitator? automatic based on dispute outcome?)
- What's the trust model? (a refund requires the server/facilitator to cooperate, which is the party being disputed)
- Is escrow a prerequisite for enforceable refunds? (hold funds until dispute window closes)
- How does this interact with the tiered reason code model? (mechanical disputes might auto-refund, attested disputes might need arbitration)

## Prior art

- Traditional card networks: chargeback is the dispute-to-refund pipeline, issuer-initiated
- auth-capture scheme: has void (pre-settlement) and refund (post-settlement) as lifecycle ops
- ceedot-rock's refund extension PR: standalone refund for exact payments
- x402 #3620 (pooled escrow): escrow as a prerequisite for enforceable refunds in multi-agent scenarios

## Summary

Agent payment protocols can prove something went wrong. None of them can make it right. The gap between evidence and remediation is where dispute resolution meets financial infrastructure.
