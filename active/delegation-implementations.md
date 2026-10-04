# Delegation implementations: existing patterns

Research into how existing systems solve the agent delegation/authorization problem.

## 1. ACK Grants (v2 PR #179)

The most complete implementation. Three parties: owner, agent, relying party (RP).

### Artifact shape

A grant is a JWT (`typ: "grant+jwt"`), signed by the owner's assertion key:

```json
{
  "iss": "did:web:acme.com",
  "sub": "did:web:acme.com:invoice-bot",
  "aud": "https://api.examplebank.com",
  "scope": "invoices:read",
  "constraints": { "region": "us" },
  "iat": 1781035200,
  "exp": 1781121600,
  "jti": "grn_4kq8",
  "cnf": { "jkt": "tH5Qw9..." }
}
```

| Claim | Required | Purpose |
|---|---|---|
| `iss` | REQUIRED | DID of the owner (principal) |
| `sub` | REQUIRED | DID of the agent |
| `aud` | REQUIRED | Single string, exact-match RP identifier |
| `scope` | REQUIRED | Space-delimited action scopes (meaning owned by RP) |
| `constraints` | OPTIONAL | Open object, members only narrow (unknown = reject) |
| `iat`/`exp` | REQUIRED | Issued-at / expiry |
| `jti` | REQUIRED | Unique per issuer |
| `cnf` | REQUIRED | `jkt` possession pin (thumbprint of agent's key) |

### Verification model

Offline, no callbacks. The RP:
1. Verifies the request signature (RFC 9421) against the agent's published keys (one HTTPS fetch)
2. Verifies the grant JWT against the owner's key, pinned at onboarding
3. Checks that the grant's scope covers the request

The owner can be offline. Everything verifies locally except fetching the agent's key document.

### Constraint model

`constraints` is an open object. Members only narrow what the grant allows. A verifier MUST reject a grant carrying a member it doesn't understand (skipping would widen the grant). No shared vocabulary is defined in core. This means third parties walking the trail encounter `{"maxAmount": "10000"}` and can't tell if that's subunits or major units without the RP's semantics.

### Revocation model

Multiple levers, no single mechanism:
- **Short `exp`**: grants are short-lived by design
- **`jti` single-use**: tracked by the RP
- **Agent key removal**: remove the agent's key from its published document
- **Owner key unpinning**: RP removes the owner's pinned key
- **ext-revocation** (separate extension): signed revocation lists, IETF Token Status List

### Delegation chains (ext-delegation)

Owner signs once (offline), a hot issuance service mints short-lived leaves. Chain claim links each grant to its parent by hash. Strict attenuation: child never exceeds parent (`exp` never later, `aud` never wider, constraints within parent's). Intermediates have distinct `typ: "grant-int+jwt"` to prevent misuse as direct grants.

### Limitations

- `constraints` has no shared vocabulary. Third parties can't interpret constraint values without RP-specific knowledge.
- Single-use intent isn't expressible by the owner. `singleUse: true` as a well-known constraint was suggested but hasn't landed.
- `aud` is single string exact match. Can't express "any merchant in category X."
- The `ack` binding in receipts is SHOULD, not MUST. A compliant seller can omit it.

---

## 2. Budget Reservation Protocol (Ectsang, v0.1)

Renamed from "Budget Authority Protocol." Sits between identity/delegation and settlement. Rail-agnostic.

### Three-layer model

```
Identity + Delegation (who authorized this agent?)
    ↓
Budget Reservation (is this spend within the limit?)
    ↓
Settlement (move the money: x402, MPP, cards, bank)
```

Key insight: "A delegation without a budget has no spending limit. A budget without a delegation has no proof of authorization. Settlement without either is what got the Bankr agent drained ($115K, May 4 2026)."

### Artifact shape

Budget created by principal (not the agent):

```
agent_id          string    required
amount            integer   required   (minor currency units)
currency          string    required
valid_until       string    required   (ISO 8601)
constraints       object    optional   (max per-tx, vendor allow/blocklist)
```

### Verb set

Four verbs (v0.1), expanding to six in v0.2:

| Verb | Purpose | Credential |
|---|---|---|
| `authorize` | Atomic check + decrement + hold | Agent key |
| `commit` | Confirm hold after payment | Agent key |
| `refund` | Release hold on failure | Agent key |
| `query` | Check budget state (advisory only) | Agent key |
| Budget creation | Set spending limits | Principal key (MUST differ from agent) |

Critical design: `authorize` is atomic. No separate "check remaining" call. Read and decrement are one operation. This prevents the concurrency race (two agents reading same remaining balance).

### Verification model

Stateful. The budget reservation layer is a single source of truth. Not offline-verifiable like ACK grants. Requires the budget service to be reachable.

### Constraint model

- Per-transaction max
- Per-window cap and window
- Vendor allow/blocklist
- Expiry
- Credential separation (principal vs agent keys)

### Revocation model

Budget expiry (`valid_until`). Hold TTL (recommended 5 minutes). No separate revocation mechanism beyond letting the budget expire or the principal modifying it.

### Hold lifecycle

```
authorize() -> HELD -> commit() -> COMMITTED
                 |
                 +-> refund() -> RELEASED
                 |
                 +-> [TTL expires] -> EXPIRED
                        |
                        +-> commit() [late commit MUST succeed if record exists]
```

Late commit on expired hold re-debits the budget. This handles slow payment rails (3DS, network congestion).

### Limitations

- Stateful. Requires reachable budget service. Can't verify offline.
- Single budget. v0.1 doesn't support sub-allocation (parent budgets with child budgets). Planned for v0.2.
- No delegation chain. Knows about "principal" and "agent" but doesn't define how that relationship is established. Defers to the identity layer (ACK, AP2).

---

## 3. MPP #366 (Delegated Authority)

Not an implementation. A question asking where delegation belongs in MPP.

### The ask

An agent pays on behalf of an organization under a scoped mandate (e.g., up to $25K across suppliers until a date, revocable). The credential's `source` field identifies the payer, and the payment method proves funds. But the server can't see:
- Whether the organization authorized *this agent* for *this purchase*
- Whether that authority still holds

### Where they think it could live

Three options raised:
1. In the identity extension
2. In a separate delegation extension
3. Outside MPP entirely, with 403 as the integration point

They note: handling it entirely outside MPP works today (server returns 403 on failed authority check), but it isn't interoperable across servers.

### Key insight for our work

The B2B angle: "company budgets span many sellers, and a lot of procurement runs on invoices rather than a card-backed token, so per-payment limits don't capture the organization's authority."

Zero responses on this issue. Open territory.

---

## 4. x402 #3646 (Agreement-Session Extension)

A detailed proposal from Kairose-master with a reference implementation (ALSP).

### Gap

Each x402 payment is stateless and independent. No way to bind multiple payments to the same agreement with shared terms, budget, and expiry.

### Proposed shape

```json
{
  "agreement-session": {
    "version": "1",
    "agreementId": "...",
    "termsHash": "...",
    "validUntil": "...",
    "provider": "..."
  }
}
```

### The key invariant

```
provider-approved terms
        |
        v
   agreementId
     /   |   \
x402 #1 x402 #2 x402 #3
     \   |   /
     evidence
        |
   close / expiry
```

Settlement stays with existing x402 schemes. The extension only defines the relationship/lifecycle binding.

### What they explicitly don't propose

- Escrow, authorize-max/settle-actual, batch settlement
- Payment channels, continuous metering
- Correctness guarantees, reputation, dispute resolution

### Open questions they raised

1. Should agreement binding live in x402 or remain application-level?
2. Minimum provider-assent primitive for bilateral (not just buyer-side) evidence?
3. Should `PaymentRequirements` commit directly to `agreementId`, or compose through offer/receipt?
4. Does close need protocol semantics, or are expiry + app-level evidence enough?

### Reference implementation

ALSP (Agent License Session Protocol): https://github.com/Kairose-master/ALSP
Current limitation: the archive is unilateral. The buyer can prove what it selected, but the provider hasn't necessarily recognized the session ID or assented.

Zero comments on this issue. No engagement.

---

## 5. x402 #3620 (Pooled Escrow + Spending-Policy)

The most operationally advanced proposal. Two parts from gazoy with a working Python implementation.

### Part A: Pooled escrow

One escrow contract per (operator, server, token). Multiple agents share the pool. Each signs cumulative vouchers. Server claims all in one transaction. Wire format identical to existing x402 batch-settlement.

### Part B: Spending-policy extension

A policy object on each payer account:

- Per-transaction cap
- Per-window cap and window
- Allow/deny lists
- Expiry
- Optional escalation co-signer
- Parent account (accounts form a tree)

### The tree model

Accounts form a hierarchy. A deposit is checked against the account's policy AND every ancestor's policy. A worker can never exceed its cap, and a crew can never exceed the orchestrator's cap, even after a parent tightens.

### Verification

Enforcement is in the escrow contract on-chain. Off-chain vouchers are bounded by the deposit. The extension declares `policy_id` in `PaymentPayload.extensions` so a server or facilitator can verify the deposit was policy-checked.

### Active discussion

3 comments. ty-everett engaged on per-asset budgets. gazoy published a standalone spec with 115 conformance vectors and two reference implementations (Python + Solidity on Avalanche Fuji). Independent review published.

### Key insight for our work

The policy tree is the multi-agent version of ACK's constraints. ACK's grants constrain one agent at a time. The spending-policy tree constrains a crew hierarchically. The tree model is what makes aggregate budget enforcement mechanical.

### Limitations

- On-chain enforcement only. Doesn't work for off-chain or fiat payments.
- Coupled to batch-settlement scheme. The policy sits in the escrow contract.
- No identity/delegation model. Knows about "accounts" and "parent accounts" but doesn't connect to DIDs, grants, or any identity standard.

---

## Cross-cutting analysis

### What the minimum viable delegation artifact needs

Across all implementations, the common fields are:

| Field | ACK | BAP | x402 #3620 | Purpose |
|---|---|---|---|---|
| Principal identifier | `iss` (DID) | principal credential | parent account | Who authorized |
| Agent identifier | `sub` (DID) | agent credential | account | Who is authorized |
| Audience/target | `aud` | — | — | Where it's valid |
| Amount constraint | `constraints` (open) | `amount`, `per_tx_max` | `perTxMax`, `perWindowMax` | How much |
| Time constraint | `exp` | `valid_until` | `expiry` | Until when |
| Vendor constraint | `constraints` (open) | `vendor` allow/blocklist | allow/deny lists | With whom |
| Unique ID | `jti` | `budget_id` | — | For tracking/revocation |
| Possession binding | `cnf.jkt` | credential separation | contract-level | Proof of agent identity |

### Verification spectrum

```
Fully offline ←————————————————————————→ Fully stateful
    ACK grants          ↑           BAP / x402 #3620
                   agreement-session
                   (bilateral but
                    no enforcement)
```

ACK grants verify offline (check signature, check expiry, check scope). BAP requires a reachable budget service. x402 #3620 requires on-chain state. The tradeoff: offline verification can't enforce aggregate limits (multiple payments against one budget). Stateful verification can, but requires a trusted intermediary.

### The delegation-budget gap

No single system covers both delegation (who authorized this agent?) and budget enforcement (is this within the limit?). The BAP spec states this explicitly: "A delegation without a budget has no spending limit. A budget without a delegation has no proof of authorization."

ACK has delegation (grants) but no budget enforcement at the protocol level. BAP has budget enforcement but no delegation. x402 #3620 has budget enforcement with hierarchy but no identity model. MPP has neither.

### What this means for our proposal

A protocol-agnostic delegation extension needs to:

1. **Define the artifact** (like ACK grants) — signed, short-lived, constrained
2. **Reference the budget** (like BAP) — the delegation artifact can reference a budget authority without embedding it
3. **Support hierarchy** (like x402 #3620's policy tree) — delegation chains where children are strictly attenuated
4. **Work across rails** — the same delegation artifact should work whether settlement is x402, MPP, or fiat
5. **Connect to disputes** — a scope violation is only expressible if the scope was declared. The delegation artifact IS the scope artifact in our dispute taxonomy

The `scope_ref` concept from our MPP #359 reply (hash + type discriminator + URI) is the bridge: the dispute extension references the delegation artifact by hash, without knowing its internals.
