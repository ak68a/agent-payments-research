# x402 Delegation Extension: Architecture Findings

**Source:** x402-specification-v2.md, extension specs, TypeScript SDK types
**Date:** 2026-10-04

## Where delegation plugs into x402

### The extensions field is the entry point

Both `PaymentRequired` and `PaymentPayload` have an `extensions` field (`Record<string, unknown>`). This is how every x402 extension works:

1. Server advertises the extension in `PaymentRequired.extensions` with `info` + `schema`
2. Client echoes it in `PaymentPayload.extensions` (must include at least the info received, may append)
3. Facilitator sees both sides via `VerifyRequest` and `SettleRequest`

A delegation extension would follow this pattern. The server advertises that it accepts (or requires) delegation artifacts. The client includes the delegation artifact in its payment payload.

### Concrete extension shape

```json
// In PaymentRequired.extensions
"delegation": {
  "info": {
    "required": true,
    "acceptedFormats": ["jws", "eip712"],
    "acceptedConstraintTypes": ["budget", "recipient-allowlist", "expiry"]
  },
  "schema": { ... }
}

// In PaymentPayload.extensions
"delegation": {
  "grant": {
    "format": "jws",
    "signature": "eyJ...",
    "payload": {
      "principal": "did:web:alice.example.com",
      "agent": "did:key:z6Mk...",
      "constraints": {
        "maxAmount": "1000000",
        "allowedRecipients": ["0x209..."],
        "expiry": 1703123516
      }
    }
  }
}
```

### The facilitator can verify it

The facilitator already receives the full `PaymentPayload` and `PaymentRequirements` on both `/verify` and `/settle`. It has access to `extensions` on both sides. A delegation-aware facilitator could:

1. Extract the delegation artifact from `paymentPayload.extensions.delegation`
2. Verify the principal's signature (resolve the principal's DID, check the signature)
3. Verify the agent matches the payer (`payload.authorization.from` matches `grant.agent`)
4. Verify the constraints are satisfied (amount <= maxAmount, payTo in allowedRecipients, now < expiry)
5. Return constraint violations in `VerifyResponse.extensions.delegation`

The `VerifyResponse` and `SettleResponse` both have `extensions` fields for exactly this purpose.

### Server-side extension hooks

The SDK has a rich hook system for extensions. A delegation extension would register as a `ResourceServerExtension` with hooks:

```typescript
const delegationExtension: ResourceServerExtension = {
  key: "delegation",
  enrichPaymentRequiredResponse: async (declaration, context) => {
    // Advertise delegation requirements in the 402 response
    return { required: true, acceptedFormats: ["jws"], ... };
  },
  hooks: {
    onBeforeVerify: async (declaration, context) => {
      // Extract and verify the delegation artifact
      const grant = context.paymentPayload.extensions?.delegation?.grant;
      if (!grant && declaration.required) {
        return { abort: true, reason: "delegation_required" };
      }
      // Verify principal signature, agent binding, constraints
      // ...
    },
    onAfterSettle: async (declaration, context) => {
      // Log the delegation for audit trail
    }
  }
};
```

Key hooks available:
- `onBeforeVerify` - can abort with a reason (returns `{ abort: true, reason: string }`)
- `onAfterVerify` - can abort or skip the handler
- `onBeforeSettle` - can abort
- `onAfterSettle` - post-settlement logging/enrichment
- `onVerifyFailure` / `onSettleFailure` - recovery hooks
- `enrichPaymentRequiredResponse` - add extension data to the 402 response
- `enrichSettlementResponse` - add extension data to the settlement response

### Client-side extension hooks

The client SDK also has extension points:

```typescript
const delegationClientExtension: ClientExtension = {
  key: "delegation",
  enrichPaymentPayload: async (paymentPayload, paymentRequired) => {
    // Attach the delegation artifact to the payment
    // Check constraints before paying (pre-payment policy check)
    return enrichedPayload;
  },
  hooks: {
    onBeforePaymentCreation: async (declaration, context) => {
      // Verify this payment is within the grant's constraints
      // Abort if it violates the delegation
      const constraints = currentGrant.constraints;
      if (context.selectedRequirements.amount > constraints.maxAmount) {
        return { abort: true, reason: "exceeds_delegation_budget" };
      }
    }
  }
};
```

### SpendControls: what exists vs what's needed

The SDK has `SpendControls` on the client side:
- `maxAmountPerPayment` - USD cap per payment (default $1)
- `allowedAssets` - whitelist of allowed tokens
- Can be disabled entirely with `spendControls: false`

These are **client-enforced only**. The server and facilitator have no visibility. They also don't express delegation (who authorized this agent to spend) or aggregate constraints (total budget across payments).

### What delegation adds beyond SpendControls

| Capability | SpendControls | Delegation extension |
|---|---|---|
| Per-payment cap | Yes (client-only) | Yes (verifiable by facilitator) |
| Allowed recipients | No | Yes |
| Allowed categories/resources | No | Yes |
| Expiry | No | Yes |
| Principal identity | No | Yes (who authorized this agent) |
| Aggregate budget | No | Possible (with session binding) |
| Third-party verifiable | No | Yes (signed artifact) |
| Dispute-evidence compatible | No | Yes (the grant IS the authorization scope leg) |

### Does it need core changes or just an extension?

**Just an extension.** The architecture already supports everything needed:

1. `extensions` fields on PaymentRequired, PaymentPayload, VerifyResponse, SettleResponse
2. Hook system for server-side verification (onBeforeVerify can abort)
3. Client extension enrichment (enrichPaymentPayload)
4. Extension registration pattern (key + hooks + enrichment)

No core spec changes required. The extension model is designed for exactly this kind of additive capability.

### The auth-hints extension is a useful template

The `auth-hints` extension shows the pattern for an extension that:
- Is server-to-client (server advertises, client acts)
- References `accepts[]` entries by index
- Doesn't involve the facilitator
- Has a discovery/negotiation phase

Delegation differs in that the facilitator SHOULD be involved (it's the natural verifier), but the wire format pattern is the same.

### Integration with dispute evidence

This is the key finding: a delegation extension creates the **authorization scope artifact** that's missing from x402 for dispute evidence.

Current state: x402 has offer (what was promised) and receipt (what was settled). The dispute extension (#3500) needs a third leg: what the agent was authorized to do.

With delegation:
- The grant artifact IS the authorization scope
- It's already signed by the principal
- It's already bound to the agent
- It's already present in the payment payload (extensions field)
- The facilitator already verified it

A dispute resolver can extract the grant from the payment extensions and compare it against the receipt. The evidence triple (grant + offer + receipt) is complete.

### Open design questions

1. **Grant format:** JWS (like offer-receipt extension) or EIP-712? JWS is more flexible (any key type), EIP-712 is more EVM-native. Offer-receipt supports both; delegation probably should too.

2. **Constraint vocabulary:** What constraints are standardized vs custom? Minimum viable set is probably: maxAmount, allowedRecipients, expiry. Everything else can be custom with the understanding that resolvers skip what they don't understand.

3. **Grant lifecycle:** Is a grant single-use or reusable? If reusable, how does the facilitator track usage? This connects to the session-binding research thread.

4. **Revocation:** Expiry-only is simplest. Active revocation needs a revocation endpoint or registry. The offer-receipt extension's signer authorization section (DID docs, DNS TXT records) provides a pattern for key resolution that could extend to revocation checking.

5. **Privacy:** The grant reveals the principal-agent relationship and constraints to the server and facilitator. Is that acceptable? For enterprise use (agent acting on behalf of a company), probably yes. For consumer use, maybe not.

6. **Backward compatibility:** Servers that don't understand delegation ignore the extension. Agents without grants can still pay directly. The extension is purely additive.
