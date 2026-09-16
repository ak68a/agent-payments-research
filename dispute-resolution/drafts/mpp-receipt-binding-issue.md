### Problem

The `Payment-Receipt` header (§4.3) currently carries four core parameters: `method`, `reference`, `status`, and `timestamp`. It proves that a payment settled, but it doesn't reference *which authorization* covered that payment — or even which challenge it fulfilled.

The challenge-to-receipt binding gap is already surfacing in practice. [#292](https://github.com/tempoxyz/mpp-specs/issues/292) shows implementations adding `challengeId` and `settlement` fields to receipts because the core spec doesn't carry enough context. [#317](https://github.com/tempoxyz/mpp-specs/issues/317) flags that asynchronous MCP delivery has no required correlation to its payment receipt. Both point at the same structural gap: receipts prove settlement happened but don't bind back to the exchange that triggered it.

For agent commerce, the binding needs to go one step further. It's not just "which challenge did this receipt fulfill?" but "which authorization scope covered this payment?" If a principal issues an authorization scope (proposed in the companion issue) and an agent pays, the receipt doesn't record which authorization was in effect. A third party examining the receipt after the fact can't verify the authorization chain.

### Sketch

Add an optional `authorization` parameter to the `Payment-Receipt` header. The value would be a content-hash reference (SHA-256, base64url) to the authorization scope artifact that was in effect when the payment was made.

```
Payment-Receipt: method=tempo,
  reference=abc123...,
  status=success,
  timestamp=1726531200,
  authorization=kQ3v8Zt...
```

The receipt issuer (the server) would include this parameter when the credential carried an authorization scope. The binding works like this:

1. Principal signs an authorization scope artifact
2. Agent presents the authorization alongside the credential
3. Server verifies the credential, processes the payment
4. Server includes the SHA-256 of the authorization artifact in the receipt's `authorization` parameter

A verifier can then:
1. Hash the authorization artifact
2. Compare against the receipt's `authorization` value
3. Confirm the authorization's constraints against the receipt's settlement values

### Design considerations

**Optional parameter.** The `authorization` parameter would be OPTIONAL — receipts without an authorization scope continue to work exactly as today. This is additive, not breaking.

**Server-side binding.** The server records the authorization hash at settlement time. This means the server attests "I saw this authorization when I processed this payment." A forged authorization artifact won't match the hash the server recorded.

**Receipt extensibility.** §6.1 already allows method-specific extensions to add parameters to the receipt. An `authorization` parameter follows this pattern — though it's method-agnostic (any method's receipt could carry it).

**Binding direction.** The receipt references the authorization (not vice versa). This matches the temporal flow: the authorization exists before the payment, and the receipt records which authorization was active.

### Relationship to existing issues and proposals

- **#292** (receipt reference/settlement semantics): Shows implementations already adding `challengeId` to receipts. The `authorization` parameter proposed here extends the same principle — receipts should carry enough context to reconstruct the payment's provenance.
- **#317** (MCP delivery correlation): Flags the receipt-to-action correlation gap. An `authorization` binding addresses the same class of problem — connecting receipts to the context that produced them.
- **Authorization scope** (companion issue): Defines the artifact this parameter references. The two proposals are designed as a pair but could land independently — the binding parameter format doesn't depend on the authorization artifact format.
- **Dispute evidence** ([#359](https://github.com/tempoxyz/mpp-specs/issues/359)): Uses this binding to construct the evidence trail. The dispute artifact embeds both the authorization and the receipt, and a resolver confirms the receipt's `authorization` hash matches the embedded authorization.

### Ask

1. Should `authorization` be a core receipt parameter or a receipt extension parameter?
2. Should the hash algorithm be fixed (SHA-256) or negotiable?
3. Should the server be REQUIRED to include the authorization hash when the credential carried one, or SHOULD?

---

*This issue was prepared with AI assistance (Claude Code).*
