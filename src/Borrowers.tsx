// Borrowers — the relationship view that was missing: one page per customer with
// everything the bank knows about them, and a lifecycle timeline tying deals to loans.
import { useEffect, useState } from 'react'
import { supabase, Org, Customer, DbLoan, Deposit, CreditLine, Spread, Attempt, Doc, SPREAD_LINES, money } from './supabase'
import { Deal, Facility } from './finance'
import { fmtDate } from './Loans'
import { Skeleton } from './dialogs'
import { Ico } from './Icons'

export default function Borrowers({ org }: { org: Org }) {
  const [customers, setCustomers] = useState<Customer[] | null>(null)
  const [loans, setLoans] = useState<DbLoan[]>([])
  const [deposits, setDeposits] = useState<Deposit[]>([])
  const [deals, setDeals] = useState<Deal[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('customers').select('*').order('company'),
      supabase.from('loans').select('*, customers(name, company, email, phone)'),
      supabase.from('deposits').select('*, customers(name, company)'),
      supabase.from('deals').select('*, customers(name, company)'),
    ]).then(([c, l, d, dl]) => {
      setCustomers((c.data as Customer[]) ?? [])
      setLoans((l.data as DbLoan[]) ?? [])
      setDeposits((d.data as Deposit[]) ?? [])
      setDeals((dl.data as Deal[]) ?? [])
    })
  }, [org.id])

  if (!customers) return <><h1>Borrowers</h1><Skeleton rows={6} /></>

  return (
    <>
      <h1>Borrowers</h1>
      <p className="subtitle">Every relationship — exposure, deposits and deals in one view. Click a borrower for the full picture.</p>
      <div className="grid">
        <table>
          <thead><tr><th>Borrower</th><th>Contact</th><th className="num">Loan exposure</th><th className="num">Deposits</th><th className="num">Deals in flight</th></tr></thead>
          <tbody>
            {customers.map(c => {
              const exp = loans.filter(l => l.customer_id === c.id).reduce((s, l) => s + Number(l.current_balance ?? l.amount), 0)
              const dep = deposits.filter(d => (d as Deposit & { customer_id?: string }).customer_id === c.id).reduce((s, d) => s + Number(d.balance), 0)
              const inFlight = deals.filter(d => d.customer_id === c.id && !['Funded', 'Declined', 'Withdrawn'].includes(d.stage)).length
              return (
                <tr key={c.id} className="rowlink" onClick={() => (window.location.hash = `#/app/borrowers/${c.id}`)}>
                  <td><a className="cell-link" href={`#/app/borrowers/${c.id}`}>{c.company ?? c.name}</a></td>
                  <td className="small">{c.name} · {c.email ?? 'no email'}</td>
                  <td className="num mono">{exp ? money(exp) : '—'}</td>
                  <td className="num mono">{dep ? money(dep) : '—'}</td>
                  <td className="num mono">{inFlight || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ——— Relationship page ———
export function BorrowerPage({ org, customerId }: { org: Org; customerId: string }) {
  const [cust, setCust] = useState<Customer | null>(null)
  const [loans, setLoans] = useState<DbLoan[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [deposits, setDeposits] = useState<Deposit[]>([])
  const [lines, setLines] = useState<CreditLine[]>([])
  const [spreads, setSpreads] = useState<Spread[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [outreach, setOutreach] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('customers').select('*').eq('id', customerId).single(),
      supabase.from('loans').select('*, customers(name, company, email, phone)').eq('customer_id', customerId),
      supabase.from('deals').select('*, customers(name, company)').eq('customer_id', customerId),
      supabase.from('deposits').select('*, customers(name, company)').eq('customer_id', customerId),
      supabase.from('credit_lines').select('*, customers(name, company)').eq('customer_id', customerId),
      supabase.from('financial_spreads').select('*').eq('customer_id', customerId).order('period'),
      supabase.from('documents').select('*, loans(loan_number), customers(company)').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(10),
      supabase.from('outreach_attempts').select('*, customers(name, company)').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(8),
    ]).then(([c, l, dl, dp, cl, sp, dc, oa]) => {
      setCust((c.data as Customer) ?? null)
      setLoans((l.data as DbLoan[]) ?? []); setDeals((dl.data as Deal[]) ?? [])
      setDeposits((dp.data as Deposit[]) ?? []); setLines((cl.data as CreditLine[]) ?? [])
      setSpreads((sp.data as Spread[]) ?? []); setDocs((dc.data as Doc[]) ?? [])
      setOutreach((oa.data as Attempt[]) ?? [])
      setLoading(false)
    })
    supabase.from('facilities').select('*').then(({ data }) => setFacilities((data as Facility[]) ?? []))
  }, [customerId])

  if (loading) return <Skeleton rows={7} />
  if (!cust) return <><h1>Borrower not found</h1><p className="subtitle"><a href="#/app/borrowers">← All borrowers</a></p></>

  const exposure = loans.reduce((s, l) => s + Number(l.current_balance ?? l.amount), 0)
  const depTotal = deposits.reduce((s, d) => s + Number(d.balance), 0)
  const lineCommit = lines.reduce((s, c) => s + Number(c.commitment), 0)
  const lineDrawn = lines.reduce((s, c) => s + Number(c.outstanding), 0)

  // Lifecycle timeline: deals and loans as one thread, newest first.
  type Ev = { at: string; label: React.ReactNode }
  const timeline: Ev[] = [
    ...deals.map(d => ({
      at: (d.created_at ?? '').slice(0, 10), label: <>Deal <a className="cell-link" href={`#/app/deals/${d.id}`}>{d.name}</a> — {d.stage}{d.stage === 'Funded' && facilities.filter(f => f.deal_id === d.id && f.loan_id).length > 0 && <> → booked as {facilities.filter(f => f.deal_id === d.id && f.loan_id).map((f, i) => {
        const loan = loans.find(l => l.id === f.loan_id)
        return loan ? <span key={f.id}>{i > 0 && ', '}<a className="cell-link" href={`#/app/loans/${loan.id}`}>{loan.loan_number}</a></span> : null
      })}</>}</>,
    })),
    ...loans.map(l => ({
      at: l.origination_date ?? '', label: <>Loan <a className="cell-link" href={`#/app/loans/${l.id}`}>{l.loan_number}</a> originated — {l.type}, {money(l.amount)}</>,
    })),
  ].filter(e => e.at).sort((a, b) => (a.at < b.at ? 1 : -1))

  const latest = spreads.filter(s => s.status === 'reviewed').slice(-2)

  return (
    <>
      <div className="crumb-row"><a href="#/app/borrowers">← Borrowers</a></div>
      <div className="viewbar" style={{ marginBottom: 4, alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{cust.company ?? cust.name}</h1>
          <p className="subtitle" style={{ marginBottom: 10 }}>{cust.name} · {cust.email ?? 'no email'} · {cust.phone ?? 'no phone'}</p>
          <div className="stat-row">
            <span><b>{money(exposure)}</b><i>loan exposure · {loans.length} loans</i></span>
            <span><b>{money(depTotal)}</b><i>deposits · {deposits.length} accounts</i></span>
            <span><b>{lineCommit ? `${Math.round((lineDrawn / lineCommit) * 100)}%` : '—'}</b><i>line utilization</i></span>
            <span><b>{deals.filter(d => !['Funded', 'Declined', 'Withdrawn'].includes(d.stage)).length}</b><i>deals in flight</i></span>
          </div>
        </div>
      </div>

      <div className="two-col" style={{ marginTop: 18 }}>
        <div>
          <div className="grid" style={{ marginBottom: 20 }}>
            <div className="uw-head"><span><b>Relationship timeline</b> <span className="small">deals become loans — one thread</span></span></div>
            {timeline.length ? timeline.map((e, i) => (
              <div className="alert" key={i}>
                <span className="small mono" style={{ width: 84 }}>{fmtDate(e.at)}</span>
                <span style={{ flex: 1 }}>{e.label}</span>
              </div>
            )) : <p className="small" style={{ padding: 14 }}>No history yet.</p>}
          </div>

          <div className="grid" style={{ marginBottom: 20 }}>
            <div className="uw-head"><span><b>Loans</b></span></div>
            <table><tbody>
              {loans.map(l => (
                <tr key={l.id}>
                  <td className="mono"><a className="cell-link" href={`#/app/loans/${l.id}`}>{l.loan_number}</a></td>
                  <td className="small">{l.type}</td>
                  <td className="num mono">{money(Number(l.current_balance ?? l.amount))}</td>
                  <td className="small">{l.rate}</td>
                  <td className="small">mat. {fmtDate(l.maturity)}</td>
                </tr>
              ))}
              {!loans.length && <tr><td className="small">No loans.</td></tr>}
            </tbody></table>
          </div>

          <div className="two-col">
            <div className="grid">
              <div className="uw-head"><span><b>Deposits</b></span></div>
              <table><tbody>
                {deposits.map(d => <tr key={d.id}><td>{d.account_name}</td><td><span className="pill">{d.type.replace('_', ' ')}</span></td><td className="num mono">{money(Number(d.balance))}</td></tr>)}
                {!deposits.length && <tr><td className="small">None.</td></tr>}
              </tbody></table>
            </div>
            <div className="grid">
              <div className="uw-head"><span><b>Credit lines</b></span></div>
              <table><tbody>
                {lines.map(c => <tr key={c.id}><td>{c.name}</td><td className="num mono">{money(Number(c.outstanding))} / {money(Number(c.commitment))}</td></tr>)}
                {!lines.length && <tr><td className="small">None.</td></tr>}
              </tbody></table>
            </div>
          </div>
        </div>

        <div>
          <div className="grid" style={{ marginBottom: 20 }}>
            <div className="uw-head"><span><b>Financials</b> <span className="small">{spreads.length} spread{spreads.length === 1 ? '' : 's'} · {spreads.filter(s => s.status === 'draft').length} draft</span></span>{loans[0] && <a className="linkish" href={`#/app/loans/${loans[0].id}/Spreads`}>Open spreads →</a>}</div>
            {latest.length ? (
              <table>
                <thead><tr><th>Line</th>{latest.map(s => <th key={s.id} className="num">{s.period}</th>)}</tr></thead>
                <tbody>
                  {SPREAD_LINES.filter(([k]) => ['revenue', 'ebitda', 'net_income', 'total_debt', 'tangible_net_worth'].includes(k)).map(([k, label]) => (
                    <tr key={k}><td>{label}</td>{latest.map(s => <td key={s.id} className="num mono">{s.data[k] == null ? '—' : money(Number(s.data[k]))}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="small" style={{ padding: 14 }}>No reviewed spreads yet — upload a tax return or financial statement on any of their loans.</p>}
          </div>

          <div className="grid" style={{ marginBottom: 20 }}>
            <div className="uw-head"><span><b>Recent documents</b></span></div>
            <table><tbody>
              {docs.map(d => <tr key={d.id}><td className="mono small ellipsis" title={d.filename}>{d.filename}</td><td><span className="pill">{d.doc_type}</span></td><td className="small">{d.loans?.loan_number ?? ''}</td></tr>)}
              {!docs.length && <tr><td className="small">None yet.</td></tr>}
            </tbody></table>
          </div>

          <div className="grid">
            <div className="uw-head"><span><b>Outreach</b></span></div>
            <table><tbody>
              {outreach.map(a => (
                <tr key={a.id}>
                  <td className="small mono">{new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                  <td><span className="pill">{a.rule_id ? 'auto' : a.channel}</span></td>
                  <td className="ellipsis small" title={a.body}>{a.subject ?? a.body}</td>
                  <td><span className={`status ${a.status === 'sent' ? 's-green' : a.status === 'failed' ? 's-red' : 's-blue'}`}>{a.status}</span></td>
                </tr>
              ))}
              {!outreach.length && <tr><td className="small">No outreach yet.</td></tr>}
            </tbody></table>
          </div>
        </div>
      </div>
    </>
  )
}
