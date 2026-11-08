# Delivery conformance vectors

Four synthetic cases for the digest/schema composition question in
[x402 #3678](https://github.com/x402-foundation/x402/issues/3678#issuecomment-6715065230).
Each JSON file contains the criteria, delivered body, expected digest and
expected per-check outcomes. The `both-fail` case requires both findings to
be retained.

| Vector | Digest | JSON Schema | Findings |
| --- | --- | --- | --- |
| `both-pass` | pass | pass | none |
| `digest-pass-schema-fail` | pass | fail | `schema_violation` |
| `digest-fail-schema-pass` | fail | pass | `digest_mismatch` |
| `both-fail` | fail | fail | `digest_mismatch`, `schema_violation` |

## Input contract

`delivered_body` is the exact response text. Hash the UTF-8 encoding of that
string, including any whitespace inside it, and compare
`"sha256:" + lowercase_hex(SHA256(bytes))` with `expected_digest`.
Parse the same body as JSON for the schema check. The JSON file's indentation
and final newline are outside `delivered_body` and outside its digest.

The schema requires one `records` field containing a positive integer. The
passing body is `{"records":3}`. Changing the count to `4` preserves schema
validity and changes the digest. Changing its type to a string violates the
schema. In the digest-pass/schema-fail vector, the supplied digest matches
those invalid-schema bytes, testing the case of an accurately bound delivery
with unsuitable structure.

`expected_digest` is a supplied comparison input. Its authentication and the
binding of the acceptance criteria to an offer are external prerequisites for
using these checks in a resolver. The two findings are local vector labels.

## Relationship to execution evidence

The proposed
[execution-evidence verification rule 2](https://github.com/x402-foundation/x402/blob/23b5c21125982961a2d4c13faf3cb5a6d6d7c03b/specs/extensions/execution_evidence.md#verification-rules)
hashes the received response body bytes for `delivery.contentDigest`. These
vectors use that byte boundary. JCS applies to the receipt's canonical
preimage separately. A consumer must preserve the original response bytes
while checking the parsed body against the supplied schema.

The files exercise only the two local checks. Signature verification,
settlement, offer binding, partial delivery policy, semantic quality and
liability allocation remain outside their scope. A vector passing both checks
establishes those two outcomes only.

## Reproduce

Use Python 3.10 or later and `jsonschema` 4.x. Install the verifier dependency
in an isolated environment, then run from the repository root.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install 'jsonschema>=4,<5'
.venv/bin/python delivery-conformance/verify.py
```

The verifier reads the committed fixtures, checks each schema, computes both
outcomes before comparing them, and checks that all four combinations appear.
Expected digests are committed data. The verifier computes observed digests
and leaves the fixture files untouched.
