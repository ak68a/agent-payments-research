# Base (EVM) test cases for the tier 1 canonical set (ext-disputes §5.6)

A companion to `../solana-iussum`, built the same way, so that the same record rules can be checked on a second chain. As requested on x402#3500: the same section 5.6 field set, the same JCS, the same SHA-256.

The payments are three real x402 payments on **Base mainnet** (`eip155:8453`, USDC). They were made by alalanet's test buyer wallet `0xe54bb381c683b9ae150f561778f0d7bdc1065876` and settled by CDP facilitator wallets. `input/receipts/` and `input/blocks/` are the recorded `eth_getTransactionReceipt` and `eth_getBlockByNumber` answers (block header fields only). `input/chain-id.json` is `eth_chainId`. The receipts were read from `mainnet.base.org` and are identical on `base-rpc.publicnode.com`.

The mandates in `input/cases.json` are test documents, one per case. They use the field names of the iussum mandate (`network`, `asset`, `per_payment_max`, `allow.pay_to`, `not_before`, `expires_at`), so that a field means the same thing in both sets. Each case changes one constraint against a real payment. This does not change any existing file in this repository, and it is not a claim that any implementation conforms to the draft.

| tx | block time | payer → payee | amount (USDC, 6 decimals) | sent by |
|---|---|---|---|---|
| `0xbc7f261a…8928` | 1794044049 | `0xe54b…5876` → `0xf8c6…44f6` | 2000 | `0x97ac…a016` (CDP) |
| `0x37e2cac6…1bd4` | 1794119226 | `0xe54b…5876` → `0x995f…d8e0` | 5000 | `0x97ac…a016` (CDP) |
| `0xc029415e…fb45` | 1794115629 | `0xe54b…5876` → `0xcb9b…d7e9` | 10000 | `0x8cda…fa39` (CDP) |

## The record

The same rules as `../solana-iussum`:

- the fields are `reason`, `tier`, `evidence.delta` (`field`, `authorized`, `actual`, `currency` for an amount) and `iat`;
- JCS (RFC 8785); amounts are strings; times are numbers;
- SHA-256, base64url without padding. `records.json` also has the hex form.

Two choices follow the comments on #3500 and PR #3:

- `iat` is an explicit filing time per case (`filed_at` in `input/cases.json`), not derived from the block time. Every filing time is after the payment (Step 5 item 4).
- `field` is a dot-path relative to the mandate root.

How each value is read:

- **The payment** is the one EIP-3009 `AuthorizationUsed(address,bytes32)` log plus the one `Transfer(address,address,uint256)` log of the same token contract from the same payer. That is what `transferWithAuthorization` emits for an x402 `exact` payment on EVM. Transfer logs of other contracts or senders are skipped. If this does not single out one event, the result is `unchecked`.
  - `actual` payee: topic 2 of the Transfer log.
  - `actual` amount: the log data, as a decimal string.
  - `actual` asset: the log's contract address.
  - `actual` time: the block's `timestamp`.
  - `actual` network: `eip155:` plus `eth_chainId` in decimal.
- **`authorized`** is the value at `field` in the mandate (an allow-list stays an array).
- **`currency`** is present for the amount only. It is the token contract address.
- **EVM addresses are compared and recorded in lowercase.** See the first finding below.

**Deciding a mismatch.** Each check in `make.mjs` (`CHECKS`) is the constraint's own predicate: `allow.pay_to` is membership, `per_payment_max` is `BigInt(amount) > BigInt(cap)`, `not_before` and `expires_at` bound the block time, `network` and `asset` are equality. It is not `authorized ≠ actual` (Step 4d as written). B1 and B3 use the same 2000-unit transfer: it differs from both caps (10000 and 1000), and only B3 is over its cap. In B2 the allow-list (an array) differs from the payee (a string), and the payee is allowed; B4 is the disallowed control. If the payment event or a predicate cannot be determined, the result is `unchecked` and there is no record (see Fixtures).

## Records

`index` is the position in `input/cases.json`.

| index | case | code | `field` | sha256 (base64url) |
|---|---|---|---|---|
| 2 | B3 amount over the cap | `scope-exceeded` | `per_payment_max` | `FwvPwzb5tbMj…` |
| 3 | B4 payee not in the allow-list | `audience-mismatch` | `allow.pay_to` | `L69mKe0sk5jk…` |
| 4 | B5 the same, allow-list in EIP-55 mixed case | `audience-mismatch` | `allow.pay_to` | `L69mKe0sk5jk…` |
| 5 | B6 mandate expired before the payment | `grant-expired` | `expires_at` | `urZEe40KKPt-…` |

Cases for the three codes ak68a proposed in the PR #3 thread are kept apart under `proposed_code_records`, because these codes are not in section 5.2 yet:

| index | case | proposed code | `field` | sha256 (base64url) |
|---|---|---|---|---|
| 6 | B7 payment before `not_before` | `grant-not-yet-valid` | `not_before` | `mUQHVSoobr4j…` |
| 7 | B8 mandate names Base Sepolia, payment on Base | `network-mismatch` | `network` | `7PKhJgVWktQL…` |
| 8 | B9 mandate names EURC, payment in USDC | `asset-mismatch` | `asset` | `StjjauLVIR7D…` |

The other 3 cases (B1, B2, B10) are in scope: no record.

## What EVM adds

**1. The same address has more than one spelling.** EVM addresses are case-insensitive hex. Wallets, catalogues and x402 `payTo` fields often use the EIP-55 mixed-case checksum (`0xF8c639D3e47aB60FF96BCc144260F5d8BeA344f6`). Logs and topics are lowercase. Two things go wrong if implementations compare or copy the strings as they are:

- **False mismatches.** B2 is in scope, but an exact string comparison reports both `asset` and `allow.pay_to` as violated (see `pitfalls`, `exact_string_address_compare`).
- **Different hashes for the same mismatch.** B4 and B5 are the same mismatch. The mandate of B5 spells the allow-list in EIP-55. Normalised to lowercase, both give `L69mKe0sk5jk…`. With `authorized` copied as B5's mandate spells it, the hash is `zuYXdHe96R0B…` (`verbatim_from_mandate` in `records.json`).

So the spec has to say how an EVM address appears in a record, and Step 4c ("the `authorized` value equals the extracted grant value") has to compare it in the same normalised form. Lowercase is used here because it is what the chain returns and needs no keccak to produce. EIP-55 would also work if everyone used it.

**2. The transaction's own fields are not the payment.** In x402 on EVM the facilitator sends the transaction. So `tx.from` is the facilitator's wallet, not the payer, and `tx.to` is the USDC contract, not the payee. A resolver that reads the payee from `tx.to` finds every payment out of scope. `pitfalls` (`payee_read_from_tx_to`) holds the wrong `audience-mismatch` record such a resolver would produce for B1, B2 and B10, with its hash, so that an implementation can test it does not produce it. The payer and the payee are in the Transfer log, and the payer is also the EIP-3009 authorizer.

**3. One payment, one shape.** On Solana, `debit_not_x402` covers money that left the granted account some other way. On EVM the closest test is the receipt shape: exactly one AuthorizationUsed, and exactly one Transfer of the same token contract from the same payer. These cases have no record for that. A receipt without that shape gives `unchecked` (F2 below); Transfer logs of other contracts or senders are skipped (F1).

## Fixtures (not on chain)

`input/fixtures.json` holds four variants of B1 that are not on chain: logs appended to its recorded receipt, or a changed mandate. The recorded receipts and blocks are not modified. The fixtures produce no record; `records.json` lists their results under `fixtures`.

| fixture | change to B1 | result |
|---|---|---|
| F1 | two unrelated Transfer logs added: 1 EURC unit from the payer, 1 USDC unit from the facilitator | `in_scope`, the same payment event as the recorded receipt |
| F2 | a second, identical USDC Transfer from the payer | `unchecked` (`payment_event`) |
| F3 | the allow-list entry is one hex digit short, so not an address | `unchecked` (`invalid_value`), not `audience-mismatch` |
| F4 | `allow.resource_prefix` added; the payment event carries no resource | `unchecked` (`no_predicate`), not `in_scope` |

F1 and F2 follow the review on PR #5. `unchecked` is the resolver's result, not an evidence record: the same split as `history_incomplete` in `../solana-iussum`.

## Cross-check of the serialisation

`make.mjs` has its own short JCS function and first reproduces the four `../solana-iussum/input/jcs.json` cases.

`records.json` holds 11 serialised records: the 7 records, the B5 verbatim variant and the 3 `payee_read_from_tx_to` records. Outside this repository they were also serialised by:
- `canonicalize` 5.1.0 (npm, installed in a scratch directory, not part of this folder);
- Python's `json.dumps(sort_keys=True, separators=(',', ':'))`, which equals JCS for these values (ASCII strings, integers below 2^53).

All three serialisers gave byte-identical output and the same SHA-256 for 11 of 11.

## Open questions

1. EVM addresses in a record: lowercase (used here) or EIP-55? And should Step 4c say that the comparison uses the same normal form? Should Step 4d evaluate the field's constraint, as `make.mjs` does, instead of `authorized ≠ actual`, and return `unchecked` when the predicate or the payment event cannot be determined?
2. `currency`: the contract address (used here), or a CAIP-19 id such as `eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`? CAIP-19 would also carry the network, which a bare contract address does not.
3. `network` values: CAIP-2 (`eip155:8453`), as in the iussum mandate, or the x402 v1 names (`base`, `base-sepolia`) some catalogues still use? A record that mixes them hashes differently for the same mismatch.
4. `grant-not-yet-valid`: violated when the block time is before `not_before` (used here, like JWT `nbf`). And `grant-expired` when the block time is at or after `expires_at` (like JWT `exp`). Is the boundary second meant to be inclusive the same way on both?

## Re-run

```
node make.mjs
git diff --exit-code records.json
```

`make.mjs` uses only Node's standard library. It reads `input/` and `../solana-iussum/input/jcs.json`, writes `records.json` and prints the counts. The output has no timestamps, so a second run is byte-identical.
