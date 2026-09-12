import { useEffect, useMemo, useState } from 'react'
import { supabase, DbLoan, Org, Payment, PaymentType, Deposit, CreditLine, money, pastDueOf } from './supabase'
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

export default function Loans({ org }: { org: Org }) {
  const [loans, setLoans] = useState<DbLoan[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [deposits, setDeposits] = useState<Deposit[]>([])
  const [lines, setLines] = useState<CreditLine[]>([])
  const [reviewMap, setReviewMap] = useState<Record<string, Review[]>>({})
  const [loading, setLoading] = useState(true)
  const [f, setF] = useState<Filters>(EMPTY)

  useEffect(() => {
    Promise.all([
      supabase.from('loans').select('*, customers(name, company, email, phone)').order('amount', { ascending: false }),
      supabase.from('loan_payments').select('id, loan_id, due_date, amount, status, paid_date'),
      supabase.from('covenants').select('loan_id'),
      supabase.from('ticklers').select('loan_id, requirement'),
      supabase.from('deposits').select('*, customers(name, company)').order('balance', { ascending: false }),
      supabase.from('credit_lines').select('*, customers(name, company)').order('commitment', { ascending: false }),
    ]).then(([l, p, cov, tick, dep, cl]) => {
      setDeposits((dep.data as Deposit[]) ?? [])
      setLines((cl.data as CreditLine[]) ?? [])
      setLoans((l.data as DbLoan[]) ?? [])
      setPayments((p.data as Payment[]) ?? [])
      // A loan is under covenant review if it has covenants; under annual review if a tickler says so.
      const map: Record<string, Review[]> = {}
      for (const c of (cov.data as { loan_id: string }[]) ?? []) {
        if (!map[c.loan_id]?.includes('Covenant')) map[c.loan_id] = [...(map[c.loan_id] ?? []), 'Covenant']
      }
      for (const t of (tick.data as { loan_id: string; requirement: string }[]) ?? []) {
        if (/annual review/i.test(t.requirement) && !map[t.loan_id]?.includes('Annual review'))
          map[t.loan_id] = [...(map[t.loan_id] ?? []), 'Annual review']
      }
      setReviewMap(map)
      setLoading(false)
    })
  }, [org.id])

  const rows = useMemo(() => loans.filter(l => {
    if (f.drawEndBy && (!l.draw_period_end || l.draw_period_end > f.drawEndBy)) return false
    if (f.pay.size && !f.pay.has(l.payment_type)) return false
    if (f.pastDueOnly && !pastDueOf(payments, l.id)) return false
    if (f.reviews.size && ![...f.reviews].every(r => reviewMap[l.id]?.includes(r))) return false
    return true
  }), [loans, payments, reviewMap, f])

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

  if (loading) return <p className="subtitle">Loading loans…</p>

  return (
    <>
      <h1>Portfolio</h1>
      <p className="subtitle">{rows.length} of {loans.length} loans · {money(rows.reduce((s, l) => s + l.amount, 0))} shown. Deposits and credit lines are below.</p>

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
            <th>Loan</th><th>Borrower</th><th>Type</th><th>Stage</th><th>Payment</th><th>Reviews</th><th>Past due</th>
            <th className="num">Amount</th><th>Rate</th><th>Maturity</th><th>Draw period end</th><th>RM</th>
          </tr></thead>
          <tbody>
            {rows.map(l => {
              const pd = pastDueOf(payments, l.id)
              return (
                <tr key={l.id} className="rowlink" onClick={() => (window.location.hash = `#/app/loans/${l.id}`)}>
                  <td className="mono"><a className="cell-link" href={`#/app/loans/${l.id}`}>{l.loan_number}</a></td>
                  <td className="ellipsis" title={l.customers?.company ?? undefined}>{l.customers?.company ?? '—'}</td>
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
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={12} className="small">No loans match these filters.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="two-col" style={{ marginTop: 20 }}>
        <div className="grid">
          <div className="uw-head"><span><b>Deposits</b> <span className="small">{deposits.length} accounts · {money(deposits.reduce((s, d) => s + Number(d.balance), 0))}</span></span></div>
          <table><tbody>
            {deposits.map(d => (
              <tr key={d.id}>
                <td>{d.account_name}</td>
                <td className="ellipsis small" title={d.customers?.company ?? undefined}>{d.customers?.company ?? '—'}</td>
                <td><span className="pill">{d.type.replace('_', ' ')}</span></td>
                <td className="num mono">{money(Number(d.balance))}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
        <div className="grid">
          <div className="uw-head"><span><b>Lines of credit</b></span></div>
          <table><tbody>
            {lines.map(c => {
              const u = Number(c.commitment) ? Number(c.outstanding) / Number(c.commitment) : 0
              return (
                <tr key={c.id}>
                  <td><b>{c.name}</b><div className="small">{c.customers?.company}</div></td>
                  <td className="num mono">{money(Number(c.outstanding))} / {money(Number(c.commitment))}</td>
                  <td style={{ width: 150 }}>
                    <div className="bar big"><span className={u > 0.8 ? 'hot' : ''} style={{ width: `${Math.min(u * 100, 100)}%` }} /></div>
                    <span className="small mono">{(u * 100).toFixed(0)}%</span>
                  </td>
                </tr>
              )
            })}
          </tbody></table>
        </div>
      </div>
    </>
  )
}
