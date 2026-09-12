// Origination types + the deterministic money/policy engines (no model involved).
import { supabase, Spread } from './supabase'

export type Deal = {
  id: string; name: string; customer_id: string | null; stage: string; purpose: string | null
  probability: number | null; expected_close: string | null; rm: string | null
  rating: number | null; rating_factors: Record<string, number>; rating_override: number | null
  override_reason: string | null; override_by: string | null
  sources: { label: string; amount: number }[]; uses: { label: string; amount: number }[]
  created_at?: string
  customers: { name: string; company: string | null } | null
}
export type Facility = {
  id: string; deal_id: string; facility_type: string; amount: number; rate_display: string | null
  rate_pct: number | null; term_months: number | null; amort_months: number | null
  io_months: number; origination_fee_bps: number; loan_id: string | null
}
export type Party = { id: string; customer_id: string | null; name: string; role: string; ownership_pct: number | null }
export type PolicyRule = { id: string; name: string; metric: string; op: string; threshold: number; action: string; enabled: boolean }
export type DealException = {
  id: string; rule_name: string; requirement: string; actual: string; explanation: string | null
  mitigants: string | null; status: 'open' | 'approved' | 'declined'; approver: string | null; decided_at: string | null
}
export type Approval = { id: string; step_order: number; role_label: string; approver: string | null; decision: string; comment: string | null; decided_at: string | null }
export type Condition = { id: string; category: string; item: string; owner: string | null; due_date: string | null; status: 'open' | 'received' | 'satisfied' | 'waived'; evidence: string | null; waived_by: string | null }
export type TPOrder = { id: string; report_type: string; vendor: string | null; ordered_date: string | null; due_date: string | null; received_date: string | null; reviewed_by: string | null; status: string }
export type CollateralRec = { id: string; collateral_type: string; description: string | null; address: string | null; value: number; value_date: string | null; value_source: string | null; advance_rate: number; prior_liens: number; lien_position: number }
export type FundingAuth = { id: string; commitment: number; initial_advance: number; payoffs: number; fees: number; net_proceeds: number; wire_recipient: string | null; wire_account_last4: string | null; prepared_by: string | null; approved_by: string | null; status: 'draft' | 'pending_second' | 'authorized' | 'funded'; funded_at: string | null }
export type Screening = { id: string; party_name: string; kind: string; status: 'clear' | 'hit' | 'review'; provider: string; checked_at: string }
export type Envelope = { id: string; title: string; recipients: { name: string; email: string }[]; status: 'draft' | 'sent' | 'viewed' | 'signed' | 'declined'; sent_at: string | null; completed_at: string | null }

export const DEAL_STAGES = ['Prospect', 'Application', 'KYC', 'Underwriting', 'Approval', 'Conditions', 'Documentation', 'Closing', 'Funded'] as const

// ——— Payment engine ———

export const monthlyPayment = (principal: number, annualRatePct: number, amortMonths: number) => {
  const r = annualRatePct / 100 / 12
  if (r === 0) return principal / amortMonths
  return (principal * r) / (1 - Math.pow(1 + r, -amortMonths))
}

export type FacilityMath = { payment: number | null; ioPayment: number | null; balloon: number | null; annualDS: number }

/** Payment, IO payment, balloon and annual debt service for one facility. Revolvers (no amort) are interest-only. */
export function facilityMath(f: Facility): FacilityMath {
  const rate = f.rate_pct ?? 0
  const io = (f.amount * rate) / 100 / 12
  if (!f.amort_months) return { payment: null, ioPayment: io, balloon: f.amount, annualDS: io * 12 }
  const pmt = monthlyPayment(f.amount, rate, f.amort_months)
  let balloon: number | null = null
  if (f.term_months && f.term_months < f.amort_months + f.io_months) {
    const r = rate / 100 / 12
    const n = f.term_months - f.io_months
    balloon = f.amount * Math.pow(1 + r, n) - pmt * ((Math.pow(1 + r, n) - 1) / r)
  }
  return { payment: pmt, ioPayment: f.io_months > 0 ? io : null, balloon, annualDS: pmt * 12 }
}

export function amortPreview(f: Facility, rows = 6) {
  if (!f.amort_months || !f.rate_pct) return []
  const r = f.rate_pct / 100 / 12
  const pmt = monthlyPayment(f.amount, f.rate_pct, f.amort_months)
  let bal = f.amount
  const out: { n: number; payment: number; interest: number; principal: number; balance: number }[] = []
  for (let n = 1; n <= Math.min(rows, f.amort_months); n++) {
    const interest = bal * r
    const principal = pmt - interest
    bal -= principal
    out.push({ n, payment: pmt, interest, principal, balance: bal })
  }
  return out
}

// ——— Deal metrics + policy engine ———

export type DealMetrics = { total_amount: number; ltv: number | null; dscr: number | null; risk_rating: number | null; annualDS: number }

export function dealMetrics(facilities: Facility[], collateral: CollateralRec[], spreads: Spread[], deal: Deal): DealMetrics {
  const total = facilities.reduce((s, f) => s + Number(f.amount), 0)
  const annualDS = facilities.reduce((s, f) => s + facilityMath(f).annualDS, 0)
  const collateralValue = collateral.reduce((s, c) => s + Number(c.value) - Number(c.prior_liens), 0)
  const reviewed = spreads.filter(s => s.status === 'reviewed')
  const ebitda = reviewed.length ? Number(reviewed[reviewed.length - 1].data.ebitda ?? NaN) : NaN
  return {
    total_amount: total,
    ltv: collateralValue > 0 ? total / collateralValue : null,
    dscr: !isNaN(ebitda) && annualDS > 0 ? ebitda / annualDS : null,
    risk_rating: deal.rating_override ?? deal.rating,
    annualDS,
  }
}

const OPS: Record<string, (a: number, b: number) => boolean> = {
  gt: (a, b) => a > b, gte: (a, b) => a >= b, lt: (a, b) => a < b, lte: (a, b) => a <= b,
}
const fmtMetric = (metric: string, v: number) =>
  metric === 'ltv' ? `${(v * 100).toFixed(1)}%` : metric === 'dscr' ? `${v.toFixed(2)}x`
  : metric === 'total_amount' ? `$${Math.round(v).toLocaleString()}` : String(v)

export function runPolicy(rules: PolicyRule[], m: DealMetrics) {
  const fired: { rule: PolicyRule; actual: string; requirement: string }[] = []
  for (const r of rules.filter(r => r.enabled)) {
    const v = (m as unknown as Record<string, number | null>)[r.metric]
    if (v == null || isNaN(v)) continue
    if (OPS[r.op](Number(v), Number(r.threshold))) {
      const opText = { gt: 'must be ≤', gte: 'must be <', lt: 'must be ≥', lte: 'must be >' }[r.op]
      fired.push({ rule: r, actual: fmtMetric(r.metric, Number(v)), requirement: `${r.metric.replace('_', ' ')} ${opText} ${fmtMetric(r.metric, Number(r.threshold))}` })
    }
  }
  return {
    exceptions: fired.filter(f => f.rule.action === 'exception'),
    routes: fired.filter(f => f.rule.action.startsWith('route:')).map(f => f.rule.action.slice(6)),
  }
}

/** Idempotently sync fired policy results into deal_exceptions and the approval chain. */
export async function applyPolicy(orgId: string, dealId: string, rules: PolicyRule[], m: DealMetrics,
  existing: DealException[], approvals: Approval[]) {
  const { exceptions, routes } = runPolicy(rules, m)
  for (const e of exceptions) {
    const cur = existing.find(x => x.rule_name === e.rule.name)
    if (!cur) {
      await supabase.from('deal_exceptions').insert({
        org_id: orgId, deal_id: dealId, rule_name: e.rule.name, requirement: e.requirement, actual: e.actual,
      })
    } else if (cur.status === 'open' && cur.actual !== e.actual) {
      await supabase.from('deal_exceptions').update({ actual: e.actual }).eq('id', cur.id)
    }
  }
  for (const role of routes) {
    if (!approvals.some(a => a.role_label === role)) {
      await supabase.from('deal_approvals').insert({
        org_id: orgId, deal_id: dealId, step_order: approvals.length + 1, role_label: role,
      })
    }
  }
  return { fired: exceptions.length, routed: routes }
}

// ——— Collateral / borrowing base ———

export const eligibleValue = (c: CollateralRec) => Math.max(Number(c.value) * Number(c.advance_rate) - Number(c.prior_liens), 0)

// ——— Stress ———

export function stressDSCR(facilities: Facility[], ebitda: number, bpsUp: number, ebitdaHaircut: number) {
  const stressed = facilities.reduce((s, f) => {
    const shocked = { ...f, rate_pct: (f.rate_pct ?? 0) + bpsUp / 100 }
    return s + facilityMath(shocked).annualDS
  }, 0)
  const e = ebitda * (1 - ebitdaHaircut)
  return stressed > 0 ? e / stressed : null
}
