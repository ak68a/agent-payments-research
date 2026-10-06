# ack-policy as a budgetRef authority

**Status:** Design investigation
**Package:** ack-policy (not ACK core, Matt considers runtime enforcement out of scope)

## The problem

ack-policy enforces budgets locally inside the agent's process. That works when one agent makes sequential payments through one facilitator. It stops working when:

- Multiple facilitators process payments against the same budget (each has its own counter)
- An agent sub-delegates to child agents who pay concurrently
- The principal needs a single source of truth for aggregate spend

Three agent products had the same bug: client-side budget check, then payment, then record spend. Two concurrent payments both pass (desplega-ai/agent-swarm#1885, elizaOS/eliza#33937, Bitterbot-AI/bitterbot-desktop#157).

ack-policy's `PolicyStore` already prevents this locally (atomic `checkAndReserve`). The gap is making that enforcement reachable by external parties.

## What exists today

```
PolicyStore interface
├── checkAndReserve(key, amount, limit, windowMs, idempotencyKey) → ReservationResult
├── commit(idempotencyKey) → void
└── release(idempotencyKey) → void
```

Budget key: `{agentDid}:{currency}`
Lifecycle: reserve on evaluate → commit on payment success → release on payment failure
Idempotent: same requestId returns same result without double-counting
Window: rolling time window, resets after windowMs

This maps to the budgetRef requirements from #3693:

| budgetRef requirement | PolicyStore verb |
|---|---|
| Reserve atomically | `checkAndReserve` |
| Settle | `commit` |
| Release | `release` |
| Idempotent | `idempotencyKey` |

## What's missing

### 1. Reservation TTL

**Depends on:** Nothing. Pure PolicyStore improvement.

Unreleased reservations live forever. If a facilitator reserves during `/verify` and the payment never settles, that budget is locked permanently.

Add `ttlMs` to `CheckAndReserveParams`. The store auto-releases expired holds.

```typescript
interface CheckAndReserveParams {
  key: string
  amount: bigint
  limit: bigint
  windowMs: number
  idempotencyKey: string
  ttlMs?: number  // auto-release if not committed within this window
}
```

Memory store implementation: lazy expiry. On each `checkAndReserve`, sweep expired reservations for the key before checking. No background timer needed for the in-memory case. Persistent stores (Redis, Postgres) can use native TTL/expiry features.

The cost, stated openly: lazy expiry means expired holds aren't released until the next `checkAndReserve` on the same key. If no new reservations come in, the budget stays locked until the next access. For active budgets this is fine. For abandoned budgets, a periodic sweep or eager expiry would be needed, but that adds complexity the in-memory store shouldn't carry. Persistent stores (Redis key expiry, Postgres scheduled jobs) handle this natively.

The TTL maps to the x402 verify→settle window. For EIP-3009, the TTL can match `validBefore`. For other schemes, the grant or the authority sets a default hold duration.

### 2. Grant integration

**Depends on:** ACK v2 grants landing.

Currently budgets are keyed by `agentDid:currency` and limits come from `PolicyConfig`. For grant-aware evaluation, `evaluate` gains an optional grant parameter that narrows the policy.

The grant should be accepted as a parsed, validated object. ack-policy doesn't define the grant shape. It accepts whatever the caller's grant verification produces, through a `VerifiedGrant` type that ack-policy owns:

```typescript
interface VerifiedGrant {
  id: string
  agent: string
  constraints: {
    maxAmount?: Record<string, bigint>
    recipients?: string[]
    exp?: number
  }
}
```

The caller is responsible for signature verification and parsing before passing the grant to `evaluate`. ack-policy enforces constraints, it doesn't verify cryptographic artifacts. If ACK v2's grant format changes, the caller's parsing code changes, not the `VerifiedGrant` interface.

```typescript
interface EvaluateOptions {
  paymentOption: { ... }
  agentDid?: string
  store?: PolicyStore
  requestId?: string
  grant?: VerifiedGrant
}
```

Grant constraints narrow policy constraints, never widen. If policy says 10 USDC max and grant says 5 USDC max, the effective limit is 5. If policy allows recipients A and B, and grant allows only A, the effective set is A. If the grant specifies a currency the policy doesn't have configured, that currency is denied (policy is the floor, grant narrows from there).

### 3. Grant-scoped budgets

**Depends on:** Phase 2 (grant integration).

For a remote budget authority, the budget is keyed by the grant, not the agent.

New key scheme: `grant:{grantId}:{currency}`

The grant defines the budget parameters:
- `maxAmount` on the grant = the budget limit
- `exp` on the grant = the budget window (or the authority's config specifies a rolling window)
- `grant.agent` = which agent can reserve against it

This reuses the existing `PolicyStore` interface. No new abstractions needed. The only change is the key scheme and where the limits come from (grant constraints instead of PolicyConfig).

Add a `query` method to `PolicyStore` so callers can check remaining budget:

```typescript
interface PolicyStore {
  checkAndReserve(params: CheckAndReserveParams): Promise<ReservationResult>
  commit(idempotencyKey: string): Promise<void>
  release(idempotencyKey: string): Promise<void>
  query?(key: string): Promise<{ limit: bigint; spent: bigint; reserved: bigint; remaining: bigint }>
}
```

`query` is optional to keep backward compatibility with existing store implementations.

### 4. HTTP transport

**Depends on:** Phase 3 (grant-scoped budgets). Requires a persistent store (see "Persistence" below).

A thin server wrapping `PolicyStore`. Separate package (`ack-policy-server`) or an example.

```
POST /reserve
  body: { grantId, amount, currency, requestId, ttlMs? }
  auth: grant JWT in Authorization header
  → { allowed, reservationId, remaining }

POST /settle
  body: { reservationId }
  → { ok }

POST /release
  body: { reservationId }
  → { ok }

GET /query?grantId=X&currency=Y
  auth: grant JWT (only the grant holder can query)
  → { limit, spent, reserved, remaining }
```

Auth: the caller presents the grant JWT. The authority validates the signature against the principal's key, checks that the grant references this authority's URI as `budgetRef`, and that the caller is the grant's agent or a facilitator acting on their behalf.

For facilitator auth: the facilitator presents both the grant and the payment payload. The authority checks `grant.agent` matches `authorization.from` in the payment payload. Same check the facilitator does for delegation verification.

The cost, stated openly: the authority is a single point of failure. If it's down, no facilitator can verify aggregate budget compliance. Facilitators that don't understand `budgetRef` still verify per-payment constraints from the grant (the delegation extension is designed for this graceful degradation). But any facilitator that does check the authority will fail-closed if it's unreachable. For production, the authority needs the same availability guarantees as the facilitator itself.

### 5. Hierarchical budgets (future, when delegation chains have demand)

**Depends on:** Phase 4 + evidence that delegation chains are a real use case.

Most delegation is one-hop (principal -> agent). Chains (principal -> intermediary -> agent) matter for enterprise but aren't required for the extension to be useful. Building a full hierarchy system before anyone uses flat grant-scoped budgets would be premature.

When demand materializes, the model is: issuing a child grant is a reservation against the parent's budget. Agent A has 100 USDC. Sub-delegating 30 USDC to Agent B is a `checkAndReserve` on Agent A's budget that creates a new budget for Agent B. Revoking the child = releasing the parent reservation.

```
Principal
└── Grant A: 100 USDC
    ├── Payment: 20 USDC (reserve against Grant A)
    ├── Sub-grant B: 30 USDC (reserve against Grant A, creates Grant B budget)
    │   ├── Payment: 10 USDC (reserve against Grant B's 30)
    │   └── Payment: 15 USDC (reserve against Grant B's 30)
    └── Remaining: 50 USDC
```

This would extend `PolicyStore` with `delegate(parentKey, childKey, amount, currency)` and `revoke(childKey)`. `delegate` atomically reserves from the parent and creates the child budget. `revoke` releases the parent reservation and removes the child.

Not designed further here because the flat case (Phases 1-4) needs to ship and prove useful first.

## Two modes, complementary

```
Local enforcement (agent-side)         Remote authority (network-side)
┌─────────────────────────┐            ┌─────────────────────────┐
│ evaluate(policy, {      │            │ POST /reserve           │
│   paymentOption,        │            │   { grantId, amount }   │
│   grant,                │            │                         │
│   store,                │            │ Called by: facilitator   │
│ })                      │            │ during /verify          │
│                         │            │                         │
│ Called by: agent         │            │ Enforces: aggregate     │
│ before payment          │            │ budget across all       │
│                         │            │ facilitators and        │
│ Enforces: per-tx limits,│            │ concurrent agents       │
│ recipient rules, local  │            │                         │
│ budget                  │            │                         │
└─────────────────────────┘            └─────────────────────────┘
```

Local enforcement catches things before the payment starts. Remote enforcement provides the single source of truth for aggregate spend across concurrent facilitators.

An agent can use both: evaluate locally first (fast, no network), then the facilitator checks the remote authority during /verify (authoritative, concurrent-safe).

If the agent denies locally and never sends the payment, no remote reservation is created. If the agent approves locally but the remote authority denies, the payment fails (fail-safe). If the agent approves locally, the facilitator reserves remotely, and then the payment fails for an unrelated reason, the remote reservation sits until TTL expires and auto-releases. This is budget-locking but bounded and self-healing.

## Persistence

The memory store works for testing and local agent enforcement. A remote budget authority that loses state on restart silently resets all budgets to full. Every agent gets their entire budget back. This is a correctness problem, not a convenience problem.

The cost, stated openly: a production budget authority requires a persistent store. The `PolicyStore` interface is designed for this (async methods, pluggable). Redis is a natural fit (atomic operations via EVAL/Lua, native key TTL for reservation expiry). Postgres works for durability and audit trails but needs application-level TTL management.

ack-policy should document the `PolicyStore` interface requirements for production persistence and may ship a Redis adapter. It should not pretend the memory store is production-viable for the authority use case.

## Implementation order

| Phase | What | Depends on | Ships alone? |
|---|---|---|---|
| 1 | Reservation TTL | Nothing | Yes |
| 2 | Grant integration | ACK v2 grants | Yes |
| 3 | Grant-scoped budgets | Phase 2 | Yes |
| 4 | HTTP transport | Phase 3 + persistent store | Yes |
| 5 | Hierarchical budgets | Phase 4 + demand evidence | Future |

Each phase is backward compatible. Existing `PolicyStore` implementations work without changes at every step. `ttlMs` is optional. `grant` is optional. `query` is optional.

## Design constraints

- **ack-policy stays a library.** The HTTP server is a separate concern. Someone who just wants local evaluation never sees the server code.
- **PolicyStore interface stays backward compatible.** New params are optional. Existing stores work without changes.
- **No ACK core dependency for the authority.** The authority validates grant JWTs using `jose`, not the ACK SDK. Same pattern as ACK's own "implementable with stock libraries" principle.
- **Single authority per budget.** The grant's `budgetRef` URI points to exactly one authority. The authority is the single source of truth.
- **Persistence is a prerequisite for remote authority, not optional.** The memory store is for testing. Production requires a persistent backend.

## Open questions

1. **Grant registration.** Does the principal register the grant with the budget authority before the agent uses it? Or does the authority create the budget on first reserve? Registration is cleaner (explicit budget creation, authority can reject grants it can't serve), but first-reserve is simpler (no extra step). Registration also lets the authority validate the grant's `budgetRef` URI matches itself.

2. **Cross-currency budgets.** The current design is per-currency. A principal who wants "max $100 total across USDC and USD" needs cross-currency conversion, which ack-policy deliberately avoids. Deferring until there's demand.

3. **Authority discovery.** The grant's `budgetRef` field is a URI. A facilitator that understands `budgetRef` calls it. A facilitator that doesn't ignores it and verifies per-payment constraints only. Is the URI enough, or does the facilitator need a capabilities endpoint? Leaning toward just the URI. Capabilities discovery adds complexity for a problem that doesn't exist yet.
