import { useEffect, useState } from 'react'
import { supabase, DbLoan, Deposit, CreditLine, Org, money } from './supabase'
import { Ico } from './Icons'

const stageCls: Record<string, string> = {
  Servicing: 's-green', Closing: 's-amber', Approval: 's-amber', Underwriting: 's-blue', Application: 's-gray',
}
const fmtDate = (d: string | null) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')

export default function Dashboard({ org }: { org: Org }) {
  const [loans, setLoans] = useState<DbLoan[]>([])
  const [deposits, setDeposits] = useState<Deposit[]>([])
  const [locs, setLocs] = useState<CreditLine[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('loans').select('*, customers(name, company)').order('created_at', { ascending: false }),
      supabase.from('deposits').select('*, customers(name, company)').order('balance', { ascending: false }),
      supabase.from('credit_lines').select('*, customers(name, company)').order('commitment', { ascending: false }),
    ]).then(([l, d, c]) => {
      setLoans((l.data as DbLoan[]) ?? [])
      setDeposits((d.data as Deposit[]) ?? [])
      setLocs((c.data as CreditLine[]) ?? [])
      setLoading(false)
    })
  }, [org.id])

  const loanTotal = loans.reduce((s, l) => s + l.amount, 0)
  const depTotal = deposits.reduce((s, d) => s + d.balance, 0)
  const commitTotal = locs.reduce((s, c) => s + c.commitment, 0)
  const outTotal = locs.reduce((s, c) => s + c.outstanding, 0)
  const util = commitTotal ? outTotal / commitTotal : 0

  if (loading) return <p className="subtitle">Loading portfolio…</p>

  return (
    <>
      <h1>{org.name}</h1>
      <p className="subtitle">Relationship dashboard — loans, deposits, and credit lines across the book. Invite code: <b>{org.invite_code}</b></p>

      <div className="tiles">
        <div className="tile"><div className="n">{money(loanTotal)}</div><div className="l">Loan exposure · {loans.length} loans</div></div>
        <div className="tile"><div className="n">{money(depTotal)}</div><div className="l">Deposits · {deposits.length} accounts</div></div>
        <div className="tile"><div className="n">{money(commitTotal)}</div><div className="l">LOC commitments · {locs.length} lines</div></div>
        <div className="tile">
          <div className="n">{(util * 100).toFixed(0)}%</div>
          <div className="l">Line utilization ({money(outTotal)} drawn)</div>
          <div className="bar"><span style={{ width: `${Math.min(util * 100, 100)}%` }} /></div>
        </div>
      </div>

      <div className="grid" style={{ marginBottom: 20 }}>
        <div className="uw-head"><span><b>Loans</b></span><a href="#/app/loans" className="small" style={{ color: 'var(--accent)' }}>View all loans with filters →</a></div>
        <table>
          <thead><tr><th>Loan</th><th>Borrower</th><th>Type</th><th>Stage</th><th className="num">Amount</th><th>Rate</th><th className="num">LTV</th><th className="num">DSCR</th><th>Maturity</th><th>RM</th></tr></thead>
          <tbody>
            {loans.map(l => (
              <tr key={l.id} className="rowlink" onClick={() => (window.location.hash = `#/app/loans/${l.id}`)}>
                <td className="mono">{l.loan_number}</td>
                <td className="ellipsis">{l.customers?.company ?? l.customers?.name ?? '—'}</td>
                <td>{l.type}</td>
                <td><span className={`status ${stageCls[l.stage] ?? 's-gray'}`}>{l.stage === 'Servicing' ? 'Active' : l.stage}</span></td>
                <td className="num mono">{money(l.amount)}</td>
                <td className="mono">{l.rate ?? '—'}</td>
                <td className="num mono">{l.ltv === null ? '—' : `${Math.round(l.ltv * 100)}%`}</td>
                <td className="num mono">{l.dscr === null ? '—' : `${Number(l.dscr).toFixed(2)}x`}</td>
                <td>{fmtDate(l.maturity)}</td>
                <td>{l.rm ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="two-col">
        <div className="grid">
          <div className="uw-head"><span><b>Deposits</b></span></div>
          <table>
            <thead><tr><th>Account</th><th>Customer</th><th>Type</th><th className="num">Balance</th></tr></thead>
            <tbody>
              {deposits.map(d => (
                <tr key={d.id}>
                  <td>{d.account_name}</td>
                  <td className="ellipsis">{d.customers?.company ?? '—'}</td>
                  <td><span className="pill">{d.type.replace('_', ' ')}</span></td>
                  <td className="num mono">{money(d.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid">
          <div className="uw-head"><span><b>Lines of credit</b></span></div>
          <table>
            <thead><tr><th>Line</th><th className="num">Commitment</th><th className="num">Drawn</th><th style={{ width: 160 }}>Utilization</th><th>Maturity</th></tr></thead>
            <tbody>
              {locs.map(c => {
                const u = c.commitment ? c.outstanding / c.commitment : 0
                return (
                  <tr key={c.id}>
                    <td><b>{c.name}</b><div className="small">{c.customers?.company}</div></td>
                    <td className="num mono">{money(c.commitment)}</td>
                    <td className="num mono">{money(c.outstanding)}</td>
                    <td>
                      <div className="bar big"><span className={u > 0.8 ? 'hot' : ''} style={{ width: `${Math.min(u * 100, 100)}%` }} /></div>
                      <span className="small mono">{(u * 100).toFixed(0)}%</span>
                    </td>
                    <td>{fmtDate(c.maturity)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="small"><Ico.lock /> All data is scoped to {org.name} by Postgres row-level security.</p>
    </>
  )
}
