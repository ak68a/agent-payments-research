// Builds records.json from iussum's resolver test cases (input/resolve.json) and checks its own JCS against iussum's four jcs cases (input/jcs.json).
// Node standard library only. Run:  node make.mjs
//
// For each resolver case whose iussum reason has an equivalent code in ext-disputes.md section 5.2 it builds the section 5.6 canonical record
//   { reason, tier, evidence: { delta: [ { field, authorized, actual, currency? } ] }, iat }
// serialises it with JCS (RFC 8785) and hashes it with SHA-256 (base64url without padding, and hex). It never invents a code, a field or a value:
// every value is read from the case's mandate, its receipt or its payment; the one exception is the fixed filing delay of `iat` above. A case that cannot be turned into a record is listed, with the reason.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const here = (p) => new URL(p, import.meta.url);
const read = (p) => JSON.parse(readFileSync(here(p), 'utf8'));
const IUSSUM_COMMIT = 'e476c89';
// The dispute's iat is a fixed filing time one hour after the payment's block time. ext-disputes.md section 6 Step 5 item 4: the dispute's iat MUST follow the receipt's iat, and the iussum cases carry no filing time of their own.
const FILING_DELAY_S = 3600;

// ---- JCS (RFC 8785) for the value types that occur here: null, boolean, string, finite number, array, object.
// Keys sort by UTF-16 code unit (the default string order of Array.prototype.sort); strings and numbers use ECMAScript's own serialisation, which is what RFC 8785 specifies.
export function jcs(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('jcs: non-finite number'); return JSON.stringify(v); }
  if (Array.isArray(v)) return `[${v.map(jcs).join(',')}]`;
  if (typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${jcs(v[k])}`).join(',')}}`;
  throw new Error(`jcs: unsupported type ${typeof v}`);
}
const sha = (s) => createHash('sha256').update(s, 'utf8').digest();

// ---- self-check: iussum's four jcs cases must come out of this serialiser byte for byte
const jcsCases = read('./input/jcs.json');
let jcsOk = 0;
for (const c of jcsCases) {
  if (jcs(c.input) !== c.expect) throw new Error(`jcs case failed: ${c.name}`);
  jcsOk++;
}

// ---- the mapping. Only meanings that are the same.
const MAP = {
  amount_over_cap: { code: 'scope-exceeded', field: 'per_payment_max' },
  resource_not_allowed: { code: 'scope-exceeded', field: 'allow.resource_prefix' },
  pay_to_not_allowed: { code: 'audience-mismatch', field: 'allow.pay_to' },
  mandate_expired: { code: 'grant-expired', field: 'expires_at' },
};
// valid verdicts whose meaning has no code in section 5.2
const NO_CODE = new Set(['asset_mismatch', 'network_mismatch', 'mandate_not_yet_valid', 'debit_not_x402']);
// the resolver judged the dispute and found nothing wrong with the payment, or could not judge: not a mismatch record
const NOT_MISMATCH = new Set(['in_scope', 'history_incomplete']);

const recorded = read('./input/recorded-payment-5KsYz26T.json').result;
const cases = read('./input/resolve.json');

// payment facts read from the jsonParsed transaction (no iussum code)
function chainPayment(p) {
  if (p === 'RECORDED') p = recorded;
  const keys = p.transaction.message.accountKeys.map((k) => k.pubkey);
  const tcs = p.transaction.message.instructions.filter((ix) => ix.parsed?.type === 'transferChecked');
  if (tcs.length !== 1) return { blockTime: p.blockTime ?? null, transfer: null };
  const i = tcs[0].parsed.info;
  const ownerOf = (acct) => (p.meta.postTokenBalances ?? []).find((b) => keys[b.accountIndex] === acct)?.owner ?? null;
  return { blockTime: p.blockTime ?? null, transfer: { amount: i.tokenAmount.amount, mint: i.mint, destinationOwner: ownerOf(i.destination) } };
}

const records = [], noCode = [], notMismatch = [], noBlockTime = [], unmappable = [];
const rejected = new Map();
cases.forEach((c, index) => {
  const e = c.expect, iussum = { verdict: e.verdict, reason: e.reason, liable: e.liable ?? null };
  const base = { index, name: c.name, iussum };
  if (NOT_MISMATCH.has(e.reason)) return notMismatch.push(base);
  if (NO_CODE.has(e.reason)) return noCode.push(base);
  const m = MAP[e.reason];
  if (!m) { // structural: the resolver refused to judge, so no record exists
    const r = rejected.get(e.reason) ?? { reason: e.reason, count: 0, indexes: [] };
    r.count++; r.indexes.push(index); rejected.set(e.reason, r);
    return;
  }
  const { mandate, receipt } = c.input;
  const pay = chainPayment(c.input.payment);
  if (pay.blockTime === null) return noBlockTime.push(base); // iat is the block time plus the fixed delay; without a block time there is no record
  if (!pay.transfer) return unmappable.push({ ...base, why: 'the payment does not have exactly one top-level transferChecked to read the actual value from' });

  // the value the receipt claims is cross-checked against the chain; the delta carries the value the chain shows
  const entry = { field: m.field };
  if (e.reason === 'amount_over_cap') {
    if (receipt && receipt.amount !== pay.transfer.amount) return unmappable.push({ ...base, why: 'receipt amount and chain amount differ' });
    Object.assign(entry, { authorized: mandate.per_payment_max, actual: pay.transfer.amount, currency: pay.transfer.mint });
  } else if (e.reason === 'resource_not_allowed') {
    if (!receipt) return unmappable.push({ ...base, why: 'no receipt, so no resource to compare' });
    Object.assign(entry, { authorized: mandate.allow.resource_prefix, actual: receipt.resource });
  } else if (e.reason === 'pay_to_not_allowed') {
    if (receipt && receipt.pay_to !== pay.transfer.destinationOwner) return unmappable.push({ ...base, why: 'receipt pay_to and chain destination owner differ' });
    Object.assign(entry, { authorized: mandate.allow.pay_to, actual: pay.transfer.destinationOwner });
  } else if (e.reason === 'mandate_expired') {
    Object.assign(entry, { authorized: mandate.expires_at, actual: pay.blockTime });
  }
  // key order below is the order of the section 5.6 field set; JCS sorts it anyway
  const canonical = { reason: m.code, tier: 1, evidence: { delta: [entry] }, iat: pay.blockTime + FILING_DELAY_S };
  const text = jcs(canonical);
  const digest = sha(text);
  records.push({ ...base, code: m.code, tier: 1, canonical, jcs: text, sha256_b64url: digest.toString('base64url'), sha256_hex: digest.toString('hex') });
});

const out = {
  iussum_commit: IUSSUM_COMMIT,
  spec: 'ext-disputes.md section 5.6 (canonical field set) as proposed in ak68a/agent-payments-research PR #1, head 3199225',
  inputs: { 'input/resolve.json': cases.length, 'input/jcs.json': jcsCases.length, 'input/recorded-payment-5KsYz26T.json': 'used by 3 resolve cases whose payment is "RECORDED"' },
  counts: { resolve_cases: cases.length, records: records.length, no_registry_code: noCode.length, not_mismatch_records: notMismatch.length, rejected_before_a_record: [...rejected.values()].reduce((n, r) => n + r.count, 0), no_block_time: noBlockTime.length, unmappable: unmappable.length, jcs_cases_reproduced_by_make_mjs: jcsOk },
  records,
  no_registry_code: noCode,
  not_mismatch_records: notMismatch,
  rejected_before_a_record: [...rejected.values()],
  no_block_time: noBlockTime,
  unmappable,
};
const total = records.length + noCode.length + notMismatch.length + out.counts.rejected_before_a_record + noBlockTime.length + unmappable.length;
if (total !== cases.length) throw new Error(`accounting: ${total} placed, ${cases.length} cases`);
writeFileSync(here('./records.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out.counts));
