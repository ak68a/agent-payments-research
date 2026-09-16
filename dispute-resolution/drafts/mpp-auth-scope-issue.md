### Problem

When an AI agent pays on behalf of a user, the user needs a way to constrain what the agent can do — maximum amount, allowed recipients, allowed intents, expiry. MPP doesn't currently have an artifact for this.

The challenge's `request` field (§4) defines what the server asks for. The credential (§5) proves the agent paid. The receipt (§6) confirms settlement. But nothing in the protocol captures what the **principal** — the user behind the agent — authorized the agent to do.

The credential's optional `source` auth-param identifies *who* is paying, but carries no constraints on *what* they authorized. An agent holding a `source` DID can pay any challenge, for any amount, to any recipient. The principal has no protocol-level mechanism to say "up to $100, only to these merchants, only for charge intents, before this time."

This gap matters for dispute evidence ([#359](https://github.com/tempoxyz/mpp-specs/issues/359)) — you can't describe a mismatch between authorization and action if the authorization isn't a protocol artifact. But it also matters independently: as agents begin transacting via MPP, principals need a standard way to express and verify spending constraints.

### Sketch

An **authorization scope** extension that defines a signed artifact from the principal. The artifact would carry:

- `principal` — the principal's identity (DID or URL), matching the credential's `source`
- `agent` — the agent identity authorized to transact
- `constraints` — structured spending limits:
  - `maxAmount` / `currency` — per-transaction ceiling
  - `recipients` — allowed counterparties (matching challenge `realm` or `request.recipient`)
  - `intents` — allowed intent types (e.g., only `charge`, not `subscription`)
  - `methods` — allowed payment methods
- `iat` / `exp` — validity window
- A signature from the principal

The artifact could be:
1. A new field on the credential JSON — the agent includes the signed scope (a JWT compact serialization, i.e. a string) alongside the payment proof. The credential's JSON structure already supports unknown parameters (§4.2: "Unknown parameters MUST be ignored by clients"), so an `authorization` field is additive.
2. A standalone signed object that travels out-of-band and is referenced by content hash in the credential.

Option 1 fits MPP's HTTP authentication model more naturally. The credential already carries `source` (a DID string) as an optional payer identity; an `authorization` field carrying the signed scope as a JWT string would pair with it — same pattern, same extensibility mechanism.

This extension would NOT define enforcement — whether a server rejects payments that exceed the scope is a policy decision. The extension defines the artifact format and how to verify it. Enforcement and dispute evidence are downstream use cases.

### Relationship to existing primitives

- **`source` DID** (§5): Identifies the payer. The authorization scope would reference the same identity as the principal, creating a verifiable chain: principal → authorization → agent → credential → receipt.
- **Challenge `request`** (§4): Defines what the server asks for. The authorization scope defines what the principal allows. A dispute is a structured mismatch between the two sides of the agent's position.
- **Subscription `interval`/`count`** (charge intent §3): The closest existing concept to spending constraints. An authorization scope generalizes this beyond subscriptions.

### Ask

1. Does an auth-param on the credential feel like the right home, or should this be a standalone extension artifact?
2. Should the authorization scope reference the `challengeId` to bind to a specific transaction, or should it be reusable across multiple challenges (like a spending policy)?
3. Is there existing thinking about agent delegation or principal-agent relationships in MPP that I should build on?

This is a prerequisite for the dispute evidence extension proposed in [#359](https://github.com/tempoxyz/mpp-specs/issues/359) — but it stands on its own as "how does a user constrain what an agent can spend via MPP?"

---

*This issue was prepared with AI assistance (Claude Code).*
