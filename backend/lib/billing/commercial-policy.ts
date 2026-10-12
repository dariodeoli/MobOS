/**
 * Proposed future caller policy only: no enrollment, catalog, entitlement or payment writes.
 * A trusted server caller must load immutable enrollment, settled paid-month count,
 * authenticated principal and provider capability evidence from authoritative sources.
 * These pure functions cannot authenticate a request or make browser input trustworthy.
 */
export const MONTHLY_PRICE_PROPOSALS = Object.freeze([99000, 199000, 349000] as const)
const TRIAL_MS = 30 * 24 * 60 * 60 * 1000

type Enrollment = { tenantId: string; trialStartedAt: string; immutable: true }
type VerifiedPrincipal = {
  source: 'verified-server-session'; subject: string; authenticated: true
  emailVerified: true; role: 'platform-owner'
}
type ApprovedPrice = { priceId: string; currency: 'PYG'; amount: number; interval: 'month' }

function approvedAmount(amount: number): void {
  if (!(MONTHLY_PRICE_PROPOSALS as readonly number[]).includes(amount)) throw new Error('unapproved_price')
}

// Private provenance marker avoids accepting plain browser-shaped coupon objects.
const couponEvidence = Symbol('server-approved-coupon')
export type FirstMonthCoupon = Readonly<{
  priceId: string; monthlyPyg: number; percent: number; scope: 'first-paid-month'
  [couponEvidence]: true
}>

/** Caller must verify claims before invoking; tenant-editable owner email is never authority. */
export function approveFirstMonthCoupon(input: {
  principal: VerifiedPrincipal; ownerSubjects: readonly string[]; price: ApprovedPrice
  provider: { firstInvoiceDiscount: true }; percent: number
}): FirstMonthCoupon {
  const { principal, ownerSubjects, price, provider, percent } = input
  if (!principal || principal.source !== 'verified-server-session' || principal.authenticated !== true
    || principal.emailVerified !== true || principal.role !== 'platform-owner'
    || !principal.subject || !Array.isArray(ownerSubjects) || !ownerSubjects.includes(principal.subject)) {
    throw new Error('verified_platform_owner_required')
  }
  if (!price || price.currency !== 'PYG' || price.interval !== 'month' || !price.priceId?.trim()) {
    throw new Error('approved_provider_price_required')
  }
  approvedAmount(price.amount)
  // A discounted recurring price is NOT a first-invoice discount capability.
  if (provider?.firstInvoiceDiscount !== true) throw new Error('first_invoice_discount_unverified')
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) throw new Error('invalid_coupon_percent')
  const coupon = { priceId: price.priceId, monthlyPyg: price.amount, percent, scope: 'first-paid-month' as const }
  Object.defineProperty(coupon, couponEvidence, { value: true })
  return Object.freeze(coupon) as FirstMonthCoupon
}

/** Monetary proposal, not a provider checkout payload or an active subscription. */
export function quoteCommercialPolicy(input: {
  enrollment: Enrollment; nowMs: number; monthlyPyg: number; paidMonths: number
  founders?: boolean; coupon?: FirstMonthCoupon
}) {
  const { enrollment, nowMs, monthlyPyg, paidMonths, founders = false, coupon } = input
  approvedAmount(monthlyPyg)
  if (!enrollment || enrollment.immutable !== true || !enrollment.tenantId?.trim()
    || typeof enrollment.trialStartedAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(enrollment.trialStartedAt)) {
    throw new Error('immutable_trial_enrollment_required')
  }
  const started = Date.parse(enrollment.trialStartedAt)
  if (!Number.isFinite(started) || new Date(started).toISOString() !== enrollment.trialStartedAt
    || !Number.isFinite(nowMs) || nowMs < started || !Number.isSafeInteger(paidMonths) || paidMonths < 0
    || typeof founders !== 'boolean') throw new Error('invalid_billing_evidence')
  if (coupon && (coupon[couponEvidence] !== true || coupon.monthlyPyg !== monthlyPyg
    || coupon.scope !== 'first-paid-month')) throw new Error('approved_coupon_required')
  if (coupon && founders) throw new Error('discount_stacking_not_approved')
  const trialEndsAt = started + TRIAL_MS
  if (nowMs < trialEndsAt) {
    if (paidMonths !== 0) throw new Error('paid_months_during_trial')
    return Object.freeze({ phase: 'trial' as const, trialEndsAt, monthlyPyg, duePyg: 0, discountPercent: 0, activation: 'proposed-only' as const })
  }
  const discountPercent = paidMonths === 0 ? (founders ? 50 : coupon?.percent ?? 0) : 0
  // All approved prices are integer PYG and divisible by 100.
  return Object.freeze({ phase: 'paid' as const, trialEndsAt, monthlyPyg,
    duePyg: monthlyPyg * (100 - discountPercent) / 100, discountPercent, activation: 'proposed-only' as const })
}
