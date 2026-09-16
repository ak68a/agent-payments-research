/**
 * Dispute evidence — working example.
 *
 * Demonstrates the full flow with the `jose` library:
 * 1. Owner issues a grant to an agent (max $100 USDC)
 * 2. Agent makes a payment that exceeds the grant ($450 USDC)
 * 3. Owner produces dispute evidence with a structured delta
 * 4. A third-party resolver verifies the evidence
 *
 * Run: npx tsx rfc/example.ts
 */
import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  jwtVerify,
  SignJWT,
} from "jose"

// --- Setup: owner and agent identities ---

const owner = await generateKeyPair("EdDSA")
const agent = await generateKeyPair("EdDSA")

const ownerJwk = await exportJWK(owner.publicKey)
ownerJwk.kid = await calculateJwkThumbprint(ownerJwk)

const agentJwk = await exportJWK(agent.publicKey)
agentJwk.kid = await calculateJwkThumbprint(agentJwk)

const ownerDid = "did:web:acme.com"
const agentDid = "did:web:acme.com:shopper"

// --- Step 1: Owner mints a grant (max 100 USDC) ---

const grant = await new SignJWT({
  scope: "payment",
  constraints: {
    maxAmount: "100000000", // 100 USDC in 6-decimal subunits
    currency: "USDC",
    category: "office-supplies",
  },
  cnf: { jkt: agentJwk.kid },
})
  .setProtectedHeader({ alg: "EdDSA", typ: "grant+jwt", kid: ownerJwk.kid })
  .setIssuer(ownerDid)
  .setSubject(agentDid)
  .setAudience("did:web:merchant.example.com")
  .setIssuedAt()
  .setExpirationTime("1h")
  .setJti(crypto.randomUUID())
  .sign(owner.privateKey)

console.log("Grant issued:", grant.slice(0, 40) + "...")

// --- Step 2: Agent pays 450 USDC (exceeds the grant) ---
// In practice, the receipt comes from a receipt service.
// Here we simulate the receipt payload that the service would sign.

const grantRef = bufToBase64url(
  new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(grant)))
)

const receiptPayload = {
  paymentRequestToken: "eyJ...(simulated)",
  paymentOptionId: "opt-usdc",
  amount: "450000000", // 450 USDC — exceeds the grant
  currency: "USDC",
  recipient: "did:web:merchant.example.com",
  ack: {
    agent: agentDid,
    grant: grantRef,
  },
}

// Simulate receipt signing (normally done by receipt service)
const receipt = await new SignJWT(receiptPayload)
  .setProtectedHeader({ alg: "EdDSA", typ: "receipt+jwt" })
  .setIssuer("did:web:receipts.example.com")
  .setIssuedAt()
  .sign(agent.privateKey) // simplified — real receipt signed by receipt service

console.log("Receipt issued:", receipt.slice(0, 40) + "...")

// --- Step 3: Owner produces dispute evidence ---

const receiptRef = bufToBase64url(
  new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(receipt)))
)

const dispute = await new SignJWT({
  reason: "scope-exceeded",
  grant_ref: grantRef,
  receipt_ref: receiptRef,
  evidence: {
    grant,
    receipt,
    delta: [
      {
        field: "constraints.maxAmount",
        authorized: "100000000",
        actual: "450000000",
        currency: "USDC",
      },
    ],
  },
})
  .setProtectedHeader({ alg: "EdDSA", typ: "dispute+jwt", kid: ownerJwk.kid })
  .setIssuer(ownerDid)
  .setSubject(agentDid)
  .setIssuedAt()
  .setExpirationTime("90d")
  .setJti(crypto.randomUUID())
  .sign(owner.privateKey)

console.log("Dispute filed:", dispute.slice(0, 40) + "...")

// --- Step 4: Resolver verifies the evidence ---

// 4a. Verify dispute signature
const { payload } = await jwtVerify(dispute, owner.publicKey, {
  typ: "dispute+jwt",
})
console.log("\n✓ Dispute signature valid")
console.log("  Reason:", payload.reason)

// 4b. Verify grant artifact reference
const evidence = payload.evidence as {
  grant: string
  receipt: string
  delta: Array<{ field: string; authorized: string; actual: string }>
}

const computedGrantRef = bufToBase64url(
  new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(evidence.grant)))
)
console.log("✓ Grant ref matches:", computedGrantRef === payload.grant_ref)

// 4c. Verify receipt artifact reference
const computedReceiptRef = bufToBase64url(
  new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(evidence.receipt)))
)
console.log("✓ Receipt ref matches:", computedReceiptRef === payload.receipt_ref)

// 4d. Verify delta mechanically
const grantPayload = JSON.parse(atob(evidence.grant.split(".")[1]!))
const receiptPayload2 = JSON.parse(atob(evidence.receipt.split(".")[1]!))

for (const delta of evidence.delta) {
  const grantValue = getNestedField(grantPayload, delta.field)
  const receiptValue = delta.field.startsWith("constraints.")
    ? receiptPayload2.amount // amount is the actual field for maxAmount disputes
    : getNestedField(receiptPayload2, delta.field)

  const authorizedMatches = String(grantValue) === delta.authorized
  const actualMatches = String(receiptValue) === delta.actual
  const isViolation = BigInt(delta.actual) > BigInt(delta.authorized)

  console.log(`✓ Delta verified: ${delta.field}`)
  console.log(`  Authorized: ${delta.authorized} (matches grant: ${authorizedMatches})`)
  console.log(`  Actual:     ${delta.actual} (matches receipt: ${actualMatches})`)
  console.log(`  Violation:  ${isViolation}`)
}

// --- Helpers ---

function bufToBase64url(buf: Uint8Array): string {
  let s = ""
  for (const b of buf) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function getNestedField(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (curr, key) => (curr as Record<string, unknown>)?.[key],
    obj,
  )
}
