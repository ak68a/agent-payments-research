# iussum test cases mapped to the tier 1 canonical set (Solana)

Source: [seekdaseek/iussum](https://github.com/seekdaseek/iussum) at commit `e476c89`. The inputs in `input/` are copies of `test/vectors/resolve.json` and `test/vectors/jcs.json` from that commit, plus `test/vectors/recorded/payment-5KsYz26T.json` (a real devnet `getTransaction` response, which three of the resolve cases use). iussum is a Solana implementation of a mandate, a seller receipt and a resolver; its network is Solana devnet.

This folder takes iussum's resolver cases, builds the record that ext-disputes.md section 5.6 describes for each case that has an equivalent code, and writes the JCS string and SHA-256 of each record. It does not change any existing file in this repository and it is not a claim that iussum conforms to the draft.

## What is and is not covered

iussum has 153 golden test cases in ten files. Only `resolve.json` holds dispute outcomes (56 cases, each with an expected verdict, reason and liable party). So this folder covers:

- the 56 resolver cases, of which **10 become a section 5.6 record** (5 distinct records, see below);
- the 4 `jcs.json` cases, used only as canonicalization cross-checks.

It does not cover the other files (grant parsing, scope checks, resource matching, receipts, mandate ids): they are not dispute outcomes. `period.json` holds 6 more `resolve()` cases that are not used here: one is `period_over_budget` (an aggregate, tier 3 case; its fields are not specified yet), one is `pay_to_not_allowed` (it would map like the others), four are `in_scope`.

## The record

Rules taken from section 5.6 of the unmerged PR #1 (head `3199225`, "canonical field set, absent-field rule, integer tiers"):

- required: `reason`, `tier`, `evidence.delta`, `iat`; optional: `evidence.attestation` (a tier 1 record does not carry it);
- a missing required field makes the record invalid; a missing optional field is left out; `null` is a value and hashes differently from absent;
- JCS (RFC 8785); every amount is a string;
- hash: SHA-256, base64url without padding. `records.json` also carries the hex form.

A record for one case looks like this (case 1; keys are sorted by JCS, so the field names `reason`, `tier`, `evidence.delta` with entries `field`, `authorized`, `actual`, `currency`, and `iat` are the whole vocabulary):

```json
{"evidence":{"delta":[{"actual":"60000","authorized":"50000","currency":"4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU","field":"per_payment_max"}]},"iat":1800000100,"reason":"scope-exceeded","tier":1}
```

How each value is read, with no value invented:

- `iat` is the payment's `blockTime` from the case input. Section 4.2 defines `iat` as the time the dispute was filed; the iussum cases have no filing time, so the block time is used and this is an open question (below).
- `field` is a dot-path into the mandate (the JSON document that plays the grant's role; the ApproveChecked grant transaction carries a Memo with a summary line that ends in the mandate's id): `per_payment_max`, `allow.pay_to`, `allow.resource_prefix`, `expires_at`.
- `authorized` is the value at that path in the mandate (arrays stay arrays; `expires_at` stays a number).
- `actual` is read from the chain payment (amount, destination owner, block time) or the seller receipt (`resource`); where both exist, `make.mjs` stops if they differ.
- `currency` is present for the amount only and is the mint address from the transfer. iussum has no symbol; see open questions.

## Mapping

Codes are used only where the meaning is the same.

| iussum reason | code | tier | `field` | cases |
|---|---|---|---|---|
| `amount_over_cap` | `scope-exceeded` | 1 | `per_payment_max` | 2 |
| `resource_not_allowed` | `scope-exceeded` | 1 | `allow.resource_prefix` | 1 |
| `pay_to_not_allowed` | `audience-mismatch` | 1 | `allow.pay_to` | 5 |
| `mandate_expired` | `grant-expired` | 1 | `expires_at` | 2 |

The ten records (`index` is the position in `input/resolve.json`):

| index | iussum reason | iussum liable | code | `field` | sha256 (base64url) |
|---|---|---|---|---|---|
| 1 | `amount_over_cap` | seller | `scope-exceeded` | `per_payment_max` | `wzJP63DI9omc…` |
| 2 | `pay_to_not_allowed` | seller | `audience-mismatch` | `allow.pay_to` | `jBloxMXvZvlJ…` |
| 3 | `resource_not_allowed` | seller | `scope-exceeded` | `allow.resource_prefix` | `fnQ309kExDcz…` |
| 7 | `mandate_expired` | seller | `grant-expired` | `expires_at` | `ZMEPHqmklY-6…` |
| 8 | `mandate_expired` | seller | `grant-expired` | `expires_at` | `ZMEPHqmklY-6…` |
| 11 | `pay_to_not_allowed` | agent_operator | `audience-mismatch` | `allow.pay_to` | `jBloxMXvZvlJ…` |
| 18 | `pay_to_not_allowed` | agent_operator | `audience-mismatch` | `allow.pay_to` | `jBloxMXvZvlJ…` |
| 35 | `pay_to_not_allowed` | agent_operator | `audience-mismatch` | `allow.pay_to` | `jBloxMXvZvlJ…` |
| 38 | `amount_over_cap` | agent_operator | `scope-exceeded` | `per_payment_max` | `wzJP63DI9omc…` |
| 55 | `pay_to_not_allowed` | seller | `audience-mismatch` | `allow.pay_to` | `gtqeucz7snG3…` |

Several cases produce the same record: indexes 1 and 38; 2, 11, 18 and 35; 7 and 8. The record holds the mismatch only. iussum's liable party (`seller` or `agent_operator`) depends on whether the seller was shown the mandate, which is not part of the record, so the same bytes and the same hash belong to different liability outcomes. That is a property of the record shape, not a defect; it means the liable party has to travel in the resolver's output (ak68a made the same point about the third state on x402#3500).

## What is not mapped

**No code in section 5.2 (9 cases).** `make.mjs` emits no record for these, because no code with the same meaning exists and none is invented here.

| index | iussum reason | iussum liable |
|---|---|---|
| 4 | `asset_mismatch` | seller |
| 5 | `network_mismatch` | seller |
| 6 | `mandate_not_yet_valid` | seller |
| 34 | `debit_not_x402` | agent_operator |
| 40 | `debit_not_x402` | agent_operator |
| 41 | `debit_not_x402` | agent_operator |
| 42 | `debit_not_x402` | agent_operator |
| 43 | `debit_not_x402` | agent_operator |
| 44 | `debit_not_x402` | agent_operator |

- `mandate_not_yet_valid`: the counterpart of `grant-expired` for a payment before the grant's start; no code.
- `network_mismatch`: payment on another network than the grant names; no code.
- `debit_not_x402`: the agent moved funds out of the granted account by something other than one x402 transfer (a plain transfer, a burn, a transfer by CPI, two debits in one transaction); no code, and it is about the shape of a transaction rather than a field of the grant.
- `asset_mismatch`: no code. edge-cases.md lists `asset_mismatch` as an open tier 2 candidate for an offer whose asset is a clone of the canonical token. In iussum the mandate names the mint, so a payment in another mint differs from a value that sits in both the grant and the transaction; by the tier 1 definition (a value that appears in both) that case is mechanical. Whether the same code name covers both is an open question.

**Not mismatch records (15 cases).** The resolver either found nothing wrong with the payment or could not judge it. `in_scope` (8 cases: the dispute is rejected and the principal bears the payment) has no violation to put in `evidence.delta`. `history_incomplete` (7 cases: the resolver could not rebuild the chain history it needs, `liable: null`) is a "could not check" state. ak68a's comment on x402#3500 (Oct 28) puts that state on the resolver output, not in the evidence record; the iussum cases are consistent with that, since iussum returns it as the resolver's own verdict with `liable: null`, not as part of any evidence a party submits. They are listed in `records.json` under `not_mismatch_records`.

**Rejected before a record exists (22 cases).** The resolver refused to judge because an input did not verify, so there is no mismatch to record:

| iussum reason | cases |
|---|---|
| `tx_mismatch` | 10 |
| `mandate_mismatch` | 1 |
| `mandate_superseded` | 1 |
| `signature_invalid` | 3 |
| `grant_mismatch` | 2 |
| `grant_not_found` | 1 |
| `mandate_invalid` | 1 |
| `tx_not_found` | 2 |
| `mandate_missing` | 1 |

## Cross-check of the serialisation

`make.mjs` has its own short JCS function. It reproduces the four `jcs.json` expectations (RFC 8785 section 3.2.3 key and unicode order, nesting, ECMAScript number output, amounts above 2^53 as strings) and stops otherwise.

Outside this repository, the same ten records and four cases were also serialised by iussum's `packages/core/src/jcs.js` and by `canonicalize` 5.1.0 (npm, pinned; installed in a scratch directory, not part of this folder). All three outputs were byte-identical for 10 of 10 records and 4 of 4 cases, 0 different. The deltas in `records.json` were also compared with the delta iussum's own resolver produced for the same cases: 10 of 10 consistent after spelling is normalised (iussum joins allow-lists with commas and writes times as `>= N` / `< N` strings).

## Not the same thing: iussum's `verdict_id`

iussum has a `verdictId()` that is the **hex** SHA-256 of the JCS of iussum's own stored record (`tx_sig`, `mandate_id`, `grant_tx`, `receipt_sha256`, `verdict`, `reason`, `liable`, `delta`, `unjudged`). That is not the section 5.6 record and not base64url, and it is not used here. The two hashes of one dispute will differ.

## Seed Vault: a Solana-specific constraint

Summarised from iussum's `docs/SEED-VAULT.md`, only as far as it says:

- On a Seeker (Android 16) the Seed Vault wallet's `signMessages` sheet did **not display the message text** for any of three samples (162, 150 and 741 bytes). The "Message" box was a grey loading skeleton for a fraction of a second to about a second, with Approve disabled; after that it was replaced by "Confirm that you are authorized to sign transactions with this wallet." and Approve was enabled. No text, hash or length was shown. A Sign In With Solana request with the summary as its statement also showed no statement.
- The signature came back as a 64-byte detached ed25519 signature and verified in Node over exactly the bytes sent, so it is valid, and it is over text the person was not shown. A scope artifact that is only a message signature is therefore signed blind on this wallet.
- For a transaction (ApproveChecked plus a Memo) the wallet renders the sheet itself, but only the token (abbreviated mint), the amount, the network fee and generic warnings. It did **not** show the delegate address or the Memo text. The document concludes that the amount is the only mandate field the person sees, and that anything else the person reads has to come from the application before it hands off to the wallet.
- iussum carries its scope in the ApproveChecked transaction (the approved amount is the cap; a summary line ending in the mandate id is in the Memo). The document does not claim that this makes the scope visible to the person; it records that the wallet shows the amount and not the delegate or the Memo.
- Untested there: whether the transaction sheet scrolls to show more, what a recognised domain changes, the text behind the info icon on the message sheet, other message shapes.

So for a draft whose scope artifact may be a signed message, the finding is that on this wallet a message signature gives the person no view of the scope, and a transaction gives a view of the amount only.

## Open questions

1. `iat`: dispute filing time (section 4.2) or the payment's block time (used here)? A vector needs a fixed value either way.
2. `field`: a dot-path into the grant's claims works when the grant has named claims. iussum's mandate keys are `per_payment_max`, `allow.pay_to`, `allow.resource_prefix`, `expires_at`. iussum's own delta uses the labels `amount`, `pay_to`, `resource`, `time`. Which naming should a cross-implementation vector use?
3. `authorized` for an allow-list (`allow.pay_to`, `allow.resource_prefix`): the whole array (used here) or the matched/violated element? Is an array allowed as a delta value?
4. `currency`: a symbol, a CAIP-19 asset id, or the chain's own identifier? Here it is the mint address, because the input has nothing else. Section 4.4 says it is present when `field` references an amount, so it appears on `per_payment_max` only.
5. Numbers in a delta (`expires_at`, `actual` time): plain JSON numbers (used here, they are NumericDate-sized) or strings, given the rule "any other value where two producers could disagree"?
6. Whether `mandate_not_yet_valid`, `network_mismatch`, `debit_not_x402` and a tier 1 `asset_mismatch` belong in the registry, and under what names.
7. Whether `grant-expired` should compare against the block time (used here) or a receipt time; iussum's resolver prefers the block time and falls back to the receipt's `settled_at` when the chain has none (one case, index 9, `in_scope`, not mapped).

## Re-run

```
node make.mjs
git diff --exit-code records.json
```

`make.mjs` uses only Node's standard library and reads `input/`. It writes `records.json` and prints the counts. The output has no timestamps, so a second run is byte-identical.
