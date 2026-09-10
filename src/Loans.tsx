import { useEffect, useMemo, useState } from 'react'
import { supabase, DbLoan, Org, PaymentType, money } from './supabase'
import { Ico } from './Icons'

const PAYMENT_TYPES: PaymentType[] = ['P&I', 'I/O', 'Deferred', 'I/O Deferred', 'Construction']
const stageCls: Record<string, string> = {
  Servicing: 's-green', Closing: 's-amber', Approval: 's-amber', Underwriting: 's-blue', Application: 's-gray',
}
const payCls: Record<PaymentType, string> = {
  'P&I': 's-green', 'I/O': 's-blue', Deferred: 's-amber', 'I/O Deferred': 's-amber', Construction: 's-gray',
}
export const fmtDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

type Filters = {
  amountMin: string; amountMax: string
  maturityFrom: string; maturityTo: string
  drawEndBy: string
  pay: Set<PaymentType>
}
const EMPTY: Filters = { amountMin: '', amountMax: '', maturityFrom: '', maturityTo: '', drawEndBy: '', pay: new Set() }

export default function Loans({ org }: { org: Org }) {
  const [loans, setLoans] = useState<DbLoan[]>([])
  const [loading, setLoading] = useState(true)
  const [f, setF] = useState<Filters>(EMPTY)

  useEffect(() => {
    supabase.from('loans').select('*, customers(name, company, email, phone)').order('amount', { ascending: false })
      .then(({ data }) => { setLoans((data as DbLoan[]) ?? []); setLoading(false) })
  }, [org.id])

  const rows = useMemo(() => loans.filter(l => {
    if (f.amountMin && l.amount < +f.amountMin) return false
    if (f.amountMax && l.amount > +f.amountMax) return false
    if (f.maturityFrom && (!l.maturity || l.maturity < f.maturityFrom)) return false
    if (f.maturityTo && (!l.maturity || l.maturity > f.maturityTo)) return false
    if (f.drawEndBy && (!l.draw_period_end || l.draw_period_end > f.drawEndBy)) return false
    if (f.pay.size && !f.pay.has(l.payment_type)) return false
    return true
  }), [loans, f])

  const togglePay = (p: PaymentType) => {
    const pay = new Set(f.pay)
    pay.has(p) ? pay.delete(p) : pay.add(p)
    setF({ ...f, pay })
  }
  const active = f.amountMin || f.amountMax || f.maturityFrom || f.maturityTo || f.drawEndBy || f.pay.size > 0

  if (loading) return <p className="subtitle">Loading loans…</p>

  return (
    <>
      <h1>All loans</h1>
      <p className="subtitle">{rows.length} of {loans.length} loans · {money(rows.reduce((s, l) => s + l.amount, 0))} shown. Click a loan to open it.</p>

      <div className="filters">
        <div className="f-group">
          <span className="f-label"><Ico.dollar /> Amount</span>
          <input type="number" placeholder="Min" value={f.amountMin} onChange={e => setF({ ...f, amountMin: e.target.value })} />
          <span className="f-dash">–</span>
          <input type="number" placeholder="Max" value={f.amountMax} onChange={e => setF({ ...f, amountMax: e.target.value })} />
        </div>
        <div className="f-group">
          <span className="f-label"><Ico.cal /> Maturity</span>
          <input type="date" value={f.maturityFrom} onChange={e => setF({ ...f, maturityFrom: e.target.value })} />
          <span className="f-dash">–</span>
          <input type="date" value={f.maturityTo} onChange={e => setF({ ...f, maturityTo: e.target.value })} />
        </div>
        <div className="f-group">
          <span className="f-label"><Ico.clock /> Draw period ends by</span>
          <input type="date" value={f.drawEndBy} onChange={e => setF({ ...f, drawEndBy: e.target.value })} />
        </div>
        <div className="f-group">
          <span className="f-label"><Ico.tag /> Payment</span>
          {PAYMENT_TYPES.map(p => (
            <button key={p} className={`f-chip ${f.pay.has(p) ? 'on' : ''}`} onClick={() => togglePay(p)}>{p}</button>
          ))}
        </div>
        {active && <button className="btn-light" onClick={() => setF({ ...EMPTY, pay: new Set() })}>Clear filters</button>}
      </div>

      <div className="grid">
        <table>
          <thead><tr>
            <th>Loan</th><th>Borrower</th><th>Type</th><th>Stage</th><th>Payment</th>
            <th className="num">Amount</th><th>Rate</th><th>Maturity</th><th>Draw period end</th><th>RM</th>
          </tr></thead>
          <tbody>
            {rows.map(l => (
              <tr key={l.id} className="rowlink" onClick={() => (window.location.hash = `#/app/loans/${l.id}`)}>
                <td className="mono">{l.loan_number}</td>
                <td className="ellipsis">{l.customers?.company ?? '—'}</td>
                <td>{l.type}</td>
                <td><span className={`status ${stageCls[l.stage] ?? 's-gray'}`}>{l.stage === 'Servicing' ? 'Active' : l.stage}</span></td>
                <td><span className={`status ${payCls[l.payment_type]}`}>{l.payment_type}</span></td>
                <td className="num mono">{money(l.amount)}</td>
                <td className="mono">{l.rate ?? '—'}</td>
                <td>{fmtDate(l.maturity)}</td>
                <td>{fmtDate(l.draw_period_end)}</td>
                <td>{l.rm ?? '—'}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={10} className="small">No loans match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
