// Portfolio — the whole book, organized by relationship. Each borrower is a group:
// one header row with the relationship facts (exposure, deposits, utilization, global
// DSCR, past due) that opens the full relationship page, and their loans beneath it.
import { useEffect, useMemo, useState } from 'react'
import { supabase, DbLoan, Org, Customer, Payment, PaymentType, Deposit, CreditLine, Spread, Guarantor, money, pastDueOf } from './supabase'
import { latestGlobalDSCR, CFScenarioData } from './CashFlow'
import { ModifyButton } from './Modify'
import { Ico } from './Icons'

const PAYMENT_TYPES: PaymentType[] = ['P&I', 'I/O', 'Deferred', 'I/O Deferred', 'Construction']
const stageCls: Record<string, string> = {
  Servicing: 's-green', Closing: 's-amber', Approval: 's-amber', Underwriting: 's-blue', Application: 's-gray',
}
// Payment structure is a fact, not an alert — always monochrome.
const payCls: Record<PaymentType, string> = {
  'P&I': 's-gray', 'I/O': 's-gray', Deferred: 's-gray', 'I/O Deferred': 's-gray', Construction: 's-gray',
}
export const fmtDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

type Review = 'Covenant' | 'Annual review'
type Filters = {
  drawEndBy: string
  pay: Set<PaymentType>
  pastDueOnly: boolean
  reviews: Set<Review>
}
const EMPTY: Filters = { drawEndBy: '', pay: new Set(), pastDueOnly: false, reviews: new Set() }
type BaseScenario = { id: string; customer_id: string; name: string; data: CFScenarioData }

export default function Loans({ org }: { org: Org }) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loans, setLoans] = useState<DbLoan[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [deposits, setDeposits] = useState<(Deposit & { customer_id?: string | null })[]>([])
  const [lines, setLines] = useState<(CreditLine & { customer_id?: string | null })[]>([])
  const [reviewMap, setReviewMap] = useState<Record<string, Review[]>>({})
  const [scenarios, setScenarios] = useState<BaseScenario[]>([])
  const [spreads, setSpreads] = useState<Spread[]>([])
  const [guarantors, setGuarantors] = useState<(Guarantor & { loans: { customer_id: string | null } | null })[]>([])
  const [loading, setLoading] = useState(true)
  const [f, setF] = useState<Filters>(EMPTY)

  useEffect(() => {
    Promise.all([
      supabase.from('customers').select('*'),
      supabase.from('loans').select('*, customers(name, company, email, phone)').order('amount', { ascending: false }),
      supabase.from('loan_payments').select('id, loan_id, due_date, amount, status, paid_date'),
      supabase.from('covenants').select('loan_id'),
      supabase.from('ticklers').select('loan_id, requirement'),
      supabase.from('deposits').select('*, customers(name, company)'),
      supabase.from('credit_lines').select('*, customers(name, company)'),
      supabase.from('cash_flow_scenarios').select('id, customer_id, name, data').eq('is_base', true),
      supabase.from('financial_spreads').select('*').eq('status', 'reviewed'),
      supabase.from('guarantors').select('*, loans(customer_id)'),
    ]).then(([c, l, p, cov, tick, dep, cl, cfs, sp, g]) => {
      setCustomers((c.data as Customer[]) ?? [])
      setLoans((l.data as DbLoan[]) ?? [])
      setPayments((p.data as Payment[]) ?? [])
      setDeposits((dep.data as (Deposit & { customer_id?: string | null })[]) ?? [])
      setLines((cl.data as (CreditLine & { customer_id?: string | null })[]) ?? [])
      setScenarios((cfs.data as BaseScenario[]) ?? [])
      setSpreads((sp.data as Spread[]) ?? [])
      setGuarantors((g.data as unknown as (Guarantor & { loans: { customer_id: string | null } | null })[]) ?? [])
      // A loan is under covenant review if it has covenants; under annual review if a tickler says so.
      const map: Record<string, Review[]> = {}
      for (const x of (cov.data as { loan_id: string }[]) ?? []) {
        if (!map[x.loan_id]?.includes('Covenant')) map[x.loan_id] = [...(map[x.loan_id] ?? []), 'Covenant']
      }
      for (const t of (tick.data as { loan_id: string; requirement: string }[]) ?? []) {
        if (/annual review/i.test(t.requirement) && !map[t.loan_id]?.includes('Annual review'))
          map[t.loan_id] = [...(map[t.loan_id] ?? []), 'Annual review']
      }
      setReviewMap(map)
      setLoading(false)
    })
  }, [org.id])

  const matches = (l: DbLoan) => {
    if (f.drawEndBy && (!l.draw_period_end || l.draw_period_end > f.drawEndBy)) return false
    if (f.pay.size && !f.pay.has(l.payment_type)) return false
    if (f.pastDueOnly && !pastDueOf(payments, l.id)) return false
    if (f.reviews.size && ![...f.reviews].every(r => reviewMap[l.id]?.includes(r))) return false
    return true
  }

  // One group per relationship, biggest exposure first; filters hide loans, and
  // relationships with nothing left to show.
  const groups = useMemo(() => {
    const byId = new Map(customers.map(c => [c.id, c]))
    const grouped = new Map<string, DbLoan[]>()
    for (const l of loans) {
      const key = l.customer_id ?? 'none'
      grouped.set(key, [...(grouped.get(key) ?? []), l])
    }
    return [...grouped.entries()]
      .map(([cid, all]) => {
        const cust = byId.get(cid) ?? null
        const shown = all.filter(matches)
        const exposure = all.reduce((s, l) => s + Number(l.current_balance ?? l.amount), 0)
        const dep = deposits.filter(d => d.customer_id === cid).reduce((s, d) => s + Number(d.balance), 0)
        const custLines = lines.filter(x => x.customer_id === cid)
        const commit = custLines.reduce((s, x) => s + Number(x.commitment), 0)
        const drawn = custLines.reduce((s, x) => s + Number(x.outstanding), 0)
        const pastDue = all.reduce((s, l) => s + (pastDueOf(payments, l.id)?.amount ?? 0), 0)
        const base = scenarios.find(s => s.customer_id === cid)
        const dscr = base ? latestGlobalDSCR(
          base.data ?? {},
          spreads.filter(s => s.customer_id === cid),
          guarantors.filter(g => g.loans?.customer_id === cid),
          all,
        ) : null
        return { cid, cust, all, shown, exposure, dep, commit, drawn, pastDue, dscr }
      })
      .filter(g => g.shown.length > 0)
      .sort((a, b) => b.exposure - a.exposure)
  }, [customers, loans, deposits, lines, payments, scenarios, spreads, guarantors, reviewMap, f])

  const togglePay = (p: PaymentType) => {
    const pay = new Set(f.pay)
    pay.has(p) ? pay.delete(p) : pay.add(p)
    setF({ ...f, pay })
  }
  const toggleReview = (r: Review) => {
    const reviews = new Set(f.reviews)
    reviews.has(r) ? reviews.delete(r) : reviews.add(r)
    setF({ ...f, reviews })
  }
  const active = f.drawEndBy || f.pay.size > 0 || f.pastDueOnly || f.reviews.size > 0
  const shownLoans = groups.flatMap(g => g.shown)

  if (loading) return <p className="subtitle">Loading portfolio…</p>

  return (
    <>
      <h1>Portfolio</h1>
      <p className="subtitle">
        {groups.length} relationship{groups.length === 1 ? '' : 's'} · {shownLoans.length} of {loans.length} loans · {money(shownLoans.reduce((s, l) => s + Number(l.amount), 0))} shown.
        Click a practice for its full picture — cash flow, deposits, documents, outreach.
      </p>

      <div className="filters">
        <div className="f-group">
          <span className="f-label"><Ico.clock /> Draw period ends by</span>
          <input type="date" aria-label="Draw period ends by" value={f.drawEndBy} onChange={e => setF({ ...f, drawEndBy: e.target.value })} />
        </div>
        <div className="f-group">
          <span className="f-label"><Ico.tag /> Payment</span>
          {PAYMENT_TYPES.map(p => (
            <button key={p} className={`f-chip ${f.pay.has(p) ? 'on' : ''}`} onClick={() => togglePay(p)}>{p}</button>
          ))}
        </div>
        <div className="f-group">
          <span className="f-label"><Ico.shield /> Reviews</span>
          {(['Covenant', 'Annual review'] as Review[]).map(r => (
            <button key={r} className={`f-chip ${f.reviews.has(r) ? 'on' : ''}`} onClick={() => toggleReview(r)}>{r}</button>
          ))}
        </div>
        <button className={`f-chip red ${f.pastDueOnly ? 'on' : ''}`} onClick={() => setF({ ...f, pastDueOnly: !f.pastDueOnly })}>
          Past due ({loans.filter(l => pastDueOf(payments, l.id)).length})
        </button>
        {active && <button className="btn-light" onClick={() => setF({ ...EMPTY, pay: new Set(), reviews: new Set() })}>Clear filters</button>}
      </div>

      <div className="grid">
        <table>
          <thead><tr>
            <th>Loan</th><th>Type</th><th>Stage</th><th>Payment</th><th>Reviews</th><th>Past due</th>
            <th className="num">Amount</th><th>Rate</th><th>Maturity</th><th>Draw period end</th><th>RM</th><th></th>
          </tr></thead>
          <tbody>
            {groups.map(g => (
              <GroupRows key={g.cid} g={g} org={org} payments={payments} reviewMap={reviewMap} />
            ))}
            {!groups.length && <tr><td colSpan={12} className="small">No loans match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}

function GroupRows({ g, org, payments, reviewMap }: {
  g: {
    cid: string; cust: Customer | null; shown: DbLoan[]; all: DbLoan[]
    exposure: number; dep: number; commit: number; drawn: number; pastDue: number
    dscr: { dscr: number; period: string } | null
  }
  org: Org
  payments: Payment[]
  reviewMap: Record<string, ('Covenant' | 'Annual review')[]>
}) {
  const href = `#/app/borrowers/${g.cid}`
  const name = g.cust?.company ?? g.cust?.name ?? 'No borrower on file'
  return (
    <>
      <tr className="rowlink" onClick={() => g.cust && (window.location.hash = href)}>
        <td colSpan={12} style={{ padding: '14px 14px 10px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 14.5 }}>
              {g.cust ? <a className="cell-link" href={href}>{name}</a> : name}
            </b>
            <span className="small">{g.all.length} loan{g.all.length === 1 ? '' : 's'} · {money(g.exposure)} exposure</span>
            {g.dep > 0 && <span className="small">{money(g.dep)} deposits</span>}
            {g.commit > 0 && <span className="small">{Math.round((g.drawn / g.commit) * 100)}% line drawn</span>}
            {g.dscr && (
              <span className={`status ${g.dscr.dscr >= 1.25 ? 's-green' : g.dscr.dscr >= 1.1 ? 's-amber' : 's-red'}`}
                title={`Global DSCR · base scenario · ${g.dscr.period}`}>
                DSCR {g.dscr.dscr.toFixed(2)}x
              </span>
            )}
            {g.pastDue > 0 && <span className="status s-red"><Ico.x /> {money(g.pastDue)} past due</span>}
            <span className="spacer" />
            {g.cust && <a className="linkish small" href={href} onClick={e => e.stopPropagation()}>Cash flow & relationship →</a>}
          </span>
        </td>
      </tr>
      {g.shown.map(l => {
        const pd = pastDueOf(payments, l.id)
        return (
          <tr key={l.id} className="rowlink" onClick={() => (window.location.hash = `#/app/loans/${l.id}`)}>
            <td className="mono"><a className="cell-link" href={`#/app/loans/${l.id}`}>{l.loan_number}</a></td>
            <td>{l.type}</td>
            <td><span className={`status ${stageCls[l.stage] ?? 's-gray'}`}>{l.stage === 'Servicing' ? 'Active' : l.stage}</span></td>
            <td><span className={`status ${payCls[l.payment_type]}`}>{l.payment_type}</span></td>
            <td>{reviewMap[l.id]?.length
              ? reviewMap[l.id].map(r => <span key={r} className="pill" style={{ marginRight: 4 }}>{r}</span>)
              : <span className="small">—</span>}</td>
            <td>{pd ? <span className="status s-red"><Ico.x /> {pd.days}d · {money(pd.amount)}</span>
              : payments.some(p => p.loan_id === l.id) ? <span className="status s-green"><Ico.check /> Current</span>
              : <span className="small">—</span>}</td>
            <td className="num mono">{money(l.amount)}</td>
            <td className="mono">{l.rate ?? '—'}</td>
            <td>{fmtDate(l.maturity)}</td>
            <td>{fmtDate(l.draw_period_end)}</td>
            <td>{l.rm ?? '—'}</td>
            <td onClick={e => e.stopPropagation()}><ModifyButton org={org} loan={l} small /></td>
          </tr>
        )
      })}
    </>
  )
}
