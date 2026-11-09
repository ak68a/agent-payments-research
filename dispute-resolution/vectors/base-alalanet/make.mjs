// Builds records.json from real x402 payments on Base mainnet (input/receipts, input/blocks) and one test mandate per case
// (input/cases.json), and checks its own JCS against the four jcs cases of ../solana-iussum/input/jcs.json.
// Node standard library only. Run:  node make.mjs
//
// For each case it reads the payment from the recorded transaction receipt, evaluates the mandate, and for a mismatch builds the
// ext-disputes.md section 5.6 canonical record { reason, tier, evidence: { delta: [ { field, authorized, actual, currency? } ] }, iat },
// serialises it with JCS (RFC 8785) and hashes it with SHA-256 (base64url without padding, and hex). Every value comes from the
// mandate, the receipt, the block or the case's explicit filing time. It stops if a case's result differs from what the case expects.
// It also runs input/fixtures.json: variants of B1 that are not on chain (logs added to its recorded receipt, or a changed mandate).
// They test which payment event is selected and when the result is `unchecked`; they produce no record.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const here = (p) => new URL(p, import.meta.url);
const read = (p) => JSON.parse(readFileSync(here(p), 'utf8'));

// ---- JCS (RFC 8785) for the value types that occur here: null, boolean, string, finite number, array, object.
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
const digest = (rec) => { const text = jcs(rec), d = sha(text); return { jcs: text, sha256_b64url: d.toString('base64url'), sha256_hex: d.toString('hex') }; };

// ---- self-check: the four jcs cases of the Solana set must come out of this serialiser byte for byte
const jcsCases = read('../solana-iussum/input/jcs.json');
for (const c of jcsCases) if (jcs(c.input) !== c.expect) throw new Error(`jcs case failed: ${c.name}`);

// ---- payment facts from a recorded receipt (eth_getTransactionReceipt) and block (eth_getBlockByNumber)
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'; // Transfer(address,address,uint256)
const EIP3009_USED = '0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5'; // EIP-3009 AuthorizationUsed(address,bytes32)
const chainId = BigInt(read('./input/chain-id.json').result);
const network = `eip155:${chainId}`;
const topicAddr = (t) => `0x${t.slice(-40)}`.toLowerCase();

function payment(tx, addLogs = []) {
  const r = read(`./input/receipts/${tx}.json`).result;
  if (r.status !== '0x1') throw new Error(`${tx}: transaction failed`);
  const b = read(`./input/blocks/${r.blockNumber}.json`).result;
  if (b.hash !== r.blockHash) throw new Error(`${tx}: block hash does not match the receipt`);
  const logs = [...r.logs, ...addLogs];
  // One x402 "exact" payment on EVM: transferWithAuthorization (EIP-3009) emits one AuthorizationUsed by the payer and one
  // Transfer from the same payer, both from the token contract. Transfers of other contracts or senders are not the payment.
  // If that does not single out one event, the payment event is not determined: `unchecked`, never a guess.
  const auths = logs.filter((l) => l.topics[0] === EIP3009_USED);
  if (auths.length !== 1) return { unchecked: `${auths.length} AuthorizationUsed logs` };
  const token = auths[0].address.toLowerCase(), payer = topicAddr(auths[0].topics[1]);
  const transfers = logs.filter((l) => l.topics[0] === TRANSFER && l.address.toLowerCase() === token && topicAddr(l.topics[1]) === payer);
  if (transfers.length !== 1) return { unchecked: `${transfers.length} Transfer logs of the token contract from the authorizer` };
  const t = transfers[0];
  return {
    tx, network, asset: token, payer, to: topicAddr(t.topics[2]),
    amount: BigInt(t.data).toString(), time: Number(BigInt(b.timestamp)),
    // the transaction itself: sent by the facilitator, addressed to the token contract (see "Pitfalls")
    tx_from: r.from.toLowerCase(), tx_to: r.to.toLowerCase(),
  };
}

// ---- the mandate checks, in a fixed order. EVM addresses are compared and recorded in lowercase (see README).
// `bad` is the constraint's own predicate (membership, BigInt cap, time bound, equality), never `authorized !== actual`:
// B1 and B2 differ from their mandates and violate nothing. A value that is not valid for its predicate gives `unchecked`.
const isAddr = (s) => typeof s === 'string' && /^0x[0-9a-fA-F]{40}$/.test(s);
const isTime = (n) => Number.isSafeInteger(n) && n >= 0;
const norm = (v) => (Array.isArray(v) ? v.map(norm) : isAddr(v) ? v.toLowerCase() : v);
const at = (m, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), m);
const CHECKS = [
  { field: 'network', code: 'network-mismatch', proposed: true, valid: (v) => typeof v === 'string' && /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$/.test(v), bad: (m, p) => m.network !== p.network, actual: (p) => p.network },
  { field: 'asset', code: 'asset-mismatch', proposed: true, valid: isAddr, bad: (m, p) => norm(m.asset) !== p.asset, actual: (p) => p.asset },
  { field: 'not_before', code: 'grant-not-yet-valid', proposed: true, valid: isTime, bad: (m, p) => p.time < m.not_before, actual: (p) => p.time },
  { field: 'expires_at', code: 'grant-expired', valid: isTime, bad: (m, p) => p.time >= m.expires_at, actual: (p) => p.time },
  { field: 'per_payment_max', code: 'scope-exceeded', valid: (v) => typeof v === 'string' && /^(0|[1-9][0-9]*)$/.test(v), bad: (m, p) => BigInt(p.amount) > BigInt(m.per_payment_max), actual: (p) => p.amount, currency: (p) => p.asset },
  { field: 'allow.pay_to', code: 'audience-mismatch', valid: (v) => Array.isArray(v) && v.every(isAddr), bad: (m, p) => !norm(m.allow.pay_to).includes(p.to), actual: (p) => p.to },
];
const KNOWN = new Set(['v', ...CHECKS.map((k) => k.field)]);
const leaves = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? leaves(v, `${pre}${k}.`) : [`${pre}${k}`]));

// in_scope, mismatch (the violated checks) or unchecked (why). Decided from the mandate and the payment event, not from a delta.
function judge(m, p) {
  if (p.unchecked) return { verdict: 'unchecked', cause: 'payment_event', why: `payment event not determined: ${p.unchecked}` };
  const unknown = leaves(m).filter((f) => !KNOWN.has(f));
  if (unknown.length) return { verdict: 'unchecked', cause: 'no_predicate', why: `no predicate for ${unknown.join(', ')}` };
  const invalid = CHECKS.filter((k) => !k.valid(at(m, k.field))).map((k) => k.field);
  if (invalid.length) return { verdict: 'unchecked', cause: 'invalid_value', why: `not a valid value for its predicate: ${invalid.join(', ')}` };
  const violated = CHECKS.filter((k) => k.bad(m, p));
  return violated.length ? { verdict: 'mismatch', violated } : { verdict: 'in_scope' };
}

function record(check, m, p, iat, verbatim = false) {
  const raw = at(m, check.field);
  const entry = { field: check.field, authorized: verbatim ? raw : norm(raw), actual: check.actual(p) };
  if (check.currency) entry.currency = check.currency(p);
  return { reason: check.code, tier: 1, evidence: { delta: [entry] }, iat };
}

const facts = (p) => ({ network: p.network, asset: p.asset, payer: p.payer, to: p.to, amount: p.amount, block_time: p.time });
const cases = read('./input/cases.json');
const records = [], proposed = [], inScope = [], pitfalls = [];
cases.forEach((c, index) => {
  const p = payment(c.tx), j = judge(c.mandate, p);
  if (j.verdict === 'unchecked') throw new Error(`${c.name}: ${j.why}`); // every case is a recorded payment with a valid mandate
  if (!(c.filed_at > p.time)) throw new Error(`${c.name}: the dispute must be filed after the payment (Step 5 item 4)`);
  const violated = j.violated ?? [];
  if (violated.length > 1) throw new Error(`${c.name}: more than one constraint violated; each case tests one`);
  const base = { index, name: c.name, tx: c.tx, payment: facts(p) };

  // Pitfall 1: comparing addresses as exact strings. A mandate in EIP-55 mixed case then "violates" constraints it satisfies.
  const exact = CHECKS.filter((k) => (k.field === 'asset' ? c.mandate.asset !== p.asset : k.field === 'allow.pay_to' ? !c.mandate.allow.pay_to.includes(p.to) : false));
  const falseByCase = exact.filter((k) => !violated.includes(k)).map((k) => k.field);
  if (falseByCase.length) pitfalls.push({ index, name: c.name, pitfall: 'exact_string_address_compare', false_mismatches: falseByCase });

  if (violated.length === 0) {
    if (c.expect.verdict !== 'in_scope') throw new Error(`${c.name}: expected ${c.expect.code}, found no mismatch`);
    inScope.push(base);
    // Pitfall 2: the transaction's own fields. On x402 EVM the facilitator sends the transaction to the token contract, so
    // tx.to is the token contract and tx.from the facilitator's wallet; the payee and the payer are in the Transfer log.
    if (!norm(c.mandate.allow.pay_to).includes(p.tx_to)) {
      const wrong = record(CHECKS.find((k) => k.field === 'allow.pay_to'), c.mandate, { ...p, to: p.tx_to }, c.filed_at);
      pitfalls.push({ index, name: c.name, pitfall: 'payee_read_from_tx_to', tx_to: p.tx_to, tx_from: p.tx_from, wrong_record: wrong, ...digest(wrong) });
    }
    return;
  }
  const k = violated[0];
  if (c.expect.verdict !== 'mismatch' || c.expect.code !== k.code || c.expect.field !== k.field) throw new Error(`${c.name}: expected ${c.expect.code}/${c.expect.field}, got ${k.code}/${k.field}`);
  const canonical = record(k, c.mandate, p, c.filed_at);
  const out = { ...base, code: k.code, tier: 1, canonical, ...digest(canonical) };
  const verbatim = record(k, c.mandate, p, c.filed_at, true);
  if (jcs(verbatim) !== out.jcs) out.verbatim_from_mandate = { note: 'authorized copied as the mandate spells it (EIP-55); a different hash for the same mismatch', canonical: verbatim, ...digest(verbatim) };
  (k.proposed ? proposed : records).push(out);
});

// ---- fixtures (not on chain): a recorded receipt with `add_logs` appended, and/or a changed mandate. No record comes out of them.
const fixtureInput = read('./input/fixtures.json');
const fixtures = fixtureInput.map((f, index) => {
  const added = f.add_logs ?? [], p = payment(f.tx, added), j = judge(f.mandate, p);
  if (j.verdict !== f.expect.verdict || j.cause !== f.expect.cause) throw new Error(`${f.name}: expected ${f.expect.verdict} ${f.expect.cause ?? ''}, got ${j.verdict} ${j.why ?? ''}`);
  if (j.verdict === 'mismatch') throw new Error(`${f.name}: a fixture must not produce a record`);
  const out = { index, name: f.name, tx: f.tx, added_logs: added.length, verdict: j.verdict };
  if (j.why) return { ...out, cause: j.cause, why: j.why };
  // added logs must not change the selected event
  if (jcs(facts(p)) !== jcs(facts(payment(f.tx)))) throw new Error(`${f.name}: the added logs changed the selected payment event`);
  return { ...out, payment: facts(p), same_event_as_recorded_receipt: true };
});

const out = {
  spec: 'ext-disputes.md section 5.6 canonical field set as used by vectors/solana-iussum (reason, tier, evidence.delta, iat; JCS; SHA-256 base64url)',
  network,
  inputs: { 'input/cases.json': cases.length, 'input/receipts': [...new Set(cases.map((c) => c.tx))].length, 'input/chain-id.json': network, 'input/fixtures.json': fixtureInput.length },
  counts: { cases: cases.length, records: records.length, proposed_code_records: proposed.length, in_scope: inScope.length, pitfalls: pitfalls.length, fixtures: fixtures.length, jcs_cases_reproduced_by_make_mjs: jcsCases.length },
  records,
  proposed_code_records: proposed,
  in_scope: inScope,
  pitfalls,
  fixtures,
};
if (records.length + proposed.length + inScope.length !== cases.length) throw new Error('accounting');
writeFileSync(here('./records.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out.counts));
