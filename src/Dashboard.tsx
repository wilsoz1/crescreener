import { useEffect, useState } from 'react'
import { supabase, DbLoan, Deposit, CreditLine, Org, Payment, Attempt, money, pastDueOf, daysLate, runRules } from './supabase'
import { OutreachLog, DelinquencyRules, QueuedMessages } from './Outreach'
import DocRouting from './Documents'
import { AskBar, DraftButton } from './Ai'
import { Ico } from './Icons'

const TABS = ['Overview', 'Portfolio', 'Operations'] as const
type Tab = (typeof TABS)[number]

const stageCls: Record<string, string> = {
  Servicing: 's-green', Closing: 's-amber', Approval: 's-amber', Underwriting: 's-blue', Application: 's-gray',
}
const fmtDate = (d: string | null) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')
type CovRow = { id: string; name: string; actual: string | null; requirement: string; status: string; loan_id: string; loans: { loan_number: string } | null }
type TickRow = { id: string; requirement: string; due_date: string; status: string; responsible: string; loan_id: string; loans: { loan_number: string } | null }
type NoteRow = { id: string; body: string; author: string | null; created_at: string; loans: { loan_number: string } | null }
type DocRow = { id: string; filename: string; status: string }

export default function Dashboard({ org }: { org: Org }) {
  const [tab, setTab] = useState<Tab>('Overview')
  const [tick, setTick] = useState(0)
  const [loans, setLoans] = useState<DbLoan[]>([])
  const [deposits, setDeposits] = useState<Deposit[]>([])
  const [locs, setLocs] = useState<CreditLine[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [covs, setCovs] = useState<CovRow[]>([])
  const [ticks, setTicks] = useState<TickRow[]>([])
  const [docsReview, setDocsReview] = useState<DocRow[]>([])
  const [queuedCount, setQueuedCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { runRules(true).then(d => setQueuedCount((d.queued ?? []).length)).catch(() => setQueuedCount(0)) }, [org.id, tick])

  useEffect(() => {
    Promise.all([
      supabase.from('loans').select('*, customers(name, company)').order('amount', { ascending: false }),
      supabase.from('deposits').select('*, customers(name, company)').order('balance', { ascending: false }),
      supabase.from('credit_lines').select('*, customers(name, company)').order('commitment', { ascending: false }),
      supabase.from('loan_payments').select('id, loan_id, due_date, amount, status, paid_date'),
      supabase.from('covenants').select('id, name, actual, requirement, status, loan_id, loans(loan_number)'),
      supabase.from('ticklers').select('id, requirement, due_date, status, responsible, loan_id, loans(loan_number)'),
      supabase.from('documents').select('id, filename, status').eq('status', 'needs_review'),
    ]).then(([l, d, c, p, cov, tk, dr]) => {
      setLoans((l.data as DbLoan[]) ?? [])
      setDeposits((d.data as Deposit[]) ?? [])
      setLocs((c.data as CreditLine[]) ?? [])
      setPayments((p.data as Payment[]) ?? [])
      setCovs((cov.data as unknown as CovRow[]) ?? [])
      setTicks((tk.data as unknown as TickRow[]) ?? [])
      setDocsReview((dr.data as DocRow[]) ?? [])
      setLoading(false)
    })
  }, [org.id, tick])

  if (loading) return <p className="subtitle">Loading portfolio…</p>

  const loanTotal = loans.reduce((s, l) => s + l.amount, 0)
  const balanceTotal = loans.reduce((s, l) => s + Number(l.current_balance ?? 0), 0)
  const depTotal = deposits.reduce((s, d) => s + d.balance, 0)
  const commitTotal = locs.reduce((s, c) => s + c.commitment, 0)
  const outTotal = locs.reduce((s, c) => s + c.outstanding, 0)
  const util = commitTotal ? outTotal / commitTotal : 0

  const pastDue = loans.map(l => ({ l, pd: pastDueOf(payments, l.id) })).filter(x => x.pd)
  const covFails = covs.filter(c => c.status === 'Fail')
  const covNear = covs.filter(c => c.status === 'Near')
  const tickPastDue = ticks.filter(t => (t.status === 'open' || t.status === 'requested') && daysLate(t.due_date) > 0)
  const attention = pastDue.length + covFails.length + tickPastDue.length + docsReview.length
  const healthy = attention === 0

  const badges: Partial<Record<Tab, { n: number; cls: string }>> = {
    Overview: attention ? { n: attention, cls: pastDue.length + covFails.length ? 'red' : 'amber' } : undefined,
    Operations: docsReview.length ? { n: docsReview.length, cls: 'amber' } : undefined,
  }

  return (
    <>
      <div className="viewbar" style={{ marginBottom: 4, alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{org.name}</h1>
          <p className="subtitle" style={{ marginBottom: 0 }}>Invite code <b>{org.invite_code}</b> · all data scoped to your bank by row-level security</p>
        </div>
        <span className="spacer" />
        <div style={{ display: 'flex', gap: 8 }}>
          <DraftButton kind="brief" label="Draft Monday brief" />
          <a className="btn-dark" href="#/app/screener" style={{ textDecoration: 'none' }}>Screen a new deal <Ico.chevron /></a>
        </div>
      </div>

      {healthy ? (
        <div className="alert-strip ok"><span className="status s-green"><Ico.check /> Portfolio current · in compliance</span>{covNear.length > 0 && <span className="status s-amber"><Ico.clock /> {covNear.length} covenant near threshold</span>}</div>
      ) : (
        <div className="alert-strip">
          {pastDue.length > 0 && <span className="status s-red"><Ico.x /> {pastDue.length} loan{pastDue.length > 1 ? 's' : ''} past due — {money(pastDue.reduce((s, x) => s + (x.pd?.amount ?? 0), 0))}</span>}
          {covFails.length > 0 && <span className="status s-red"><Ico.x /> {covFails.length} covenant failure{covFails.length > 1 ? 's' : ''}</span>}
          {tickPastDue.length > 0 && <span className="status s-amber"><Ico.clock /> {tickPastDue.length} reporting item{tickPastDue.length > 1 ? 's' : ''} past due</span>}
          {docsReview.length > 0 && <span className="status s-amber"><Ico.doc /> {docsReview.length} document{docsReview.length > 1 ? 's' : ''} to review</span>}
        </div>
      )}

      <div className="detail-tabs" style={{ marginTop: 16 }}>
        {TABS.map(t => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>
            {t}{badges[t] && <span className={`tab-badge ${badges[t]!.cls}`}>{badges[t]!.n}</span>}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <>
          <AskBar />
          <div className="tiles" style={{ marginTop: 4 }}>
            <div className="tile"><div className="n">{loans.length}</div><div className="l">Total loans · {money(loanTotal)} committed</div></div>
            <div className="tile"><div className="n">{money(balanceTotal)}</div><div className="l">Outstanding loan balances</div></div>
            <div className="tile"><div className="n">{money(depTotal)}</div><div className="l">Deposits · {deposits.length} accounts</div></div>
            <div className="tile">
              <div className="n">{(util * 100).toFixed(0)}%</div><div className="l">LOC utilization · {money(outTotal)} of {money(commitTotal)}</div>
              <div className="bar"><span style={{ width: `${Math.min(util * 100, 100)}%` }} /></div>
            </div>
            <div className="tile"><div className="n" style={{ color: pastDue.length ? 'var(--red)' : 'inherit' }}>{pastDue.length}</div><div className="l">Lates{pastDue.length ? ` · ${money(pastDue.reduce((s, x) => s + (x.pd?.amount ?? 0), 0))} past due` : ''}</div></div>
            <div className="tile"><div className="n" style={{ color: covFails.length ? 'var(--red)' : 'inherit' }}>{covFails.length}<span style={{ fontSize: 14, color: 'var(--amber)' }}> +{covNear.length} near</span></div><div className="l">Covenant failures</div></div>
            <div className="tile"><div className="n" style={{ color: tickPastDue.length ? 'var(--amber)' : 'inherit' }}>{tickPastDue.length}</div><div className="l">Reporting past due</div></div>
            <button type="button" className="tile rowlink" onClick={() => setTab('Operations')}>
              <div className="n" style={{ color: queuedCount ? 'var(--amber)' : 'inherit' }}>{queuedCount ?? '…'}</div>
              <div className="l">Queued messages → Operations</div>
            </button>
          </div>

          <div className="grid" style={{ marginBottom: 20 }}>
            <div className="uw-head"><span><b>Needs attention</b> {attention > 0 && <span className="small">{attention} item{attention > 1 ? 's' : ''} across the book</span>}</span></div>
            {attention ? <>
              {pastDue.map(({ l, pd }) => (
                <div className="alert" key={l.id}>
                  <span className="dot2 red" />
                  <span style={{ flex: 1 }}><b>{l.customers?.company}</b> — {money(pd!.amount)} past due {pd!.days} days on {l.loan_number}</span>
                  <a className="linkish" href={`#/app/loans/${l.id}`}>Open loan →</a>
                </div>
              ))}
              {covFails.map(c => (
                <div className="alert" key={c.id}>
                  <span className="dot2 red" />
                  <span style={{ flex: 1 }}>Covenant failing on <b>{c.loans?.loan_number}</b>: {c.name} — {c.actual} vs. {c.requirement}</span>
                  <a className="linkish" href={`#/app/loans/${c.loan_id}`}>Open loan →</a>
                </div>
              ))}
              {tickPastDue.map(t => (
                <div className="alert" key={t.id}>
                  <span className="dot2 amber" />
                  <span style={{ flex: 1 }}>{t.requirement} past due {daysLate(t.due_date)}d on <b>{t.loans?.loan_number}</b> ({t.responsible})</span>
                  <a className="linkish" href={`#/app/loans/${t.loan_id}`}>Open loan →</a>
                </div>
              ))}
              {docsReview.map(d => (
                <div className="alert" key={d.id}>
                  <span className="dot2 amber" />
                  <span style={{ flex: 1 }}>Document needs routing: <span className="mono small">{d.filename}</span></span>
                  <button className="linkish" onClick={() => setTab('Operations')}>Operations →</button>
                </div>
              ))}
            </> : <p className="small" style={{ padding: 14 }}>Nothing needs attention. Payments current, covenants in compliance, reporting up to date.</p>}
          </div>
        </>
      )}

      {tab === 'Portfolio' && (
        <>
          <div className="grid" style={{ marginBottom: 20 }}>
            <div className="uw-head"><span><b>Loans</b></span><a href="#/app/loans" className="linkish">All loans with filters →</a></div>
            <table>
              <thead><tr><th>Loan</th><th>Borrower</th><th>Type</th><th>Stage</th><th className="num">Amount</th><th>Rate</th><th>Maturity</th></tr></thead>
              <tbody>
                {loans.map(l => (
                  <tr key={l.id} className="rowlink" onClick={() => (window.location.hash = `#/app/loans/${l.id}`)}>
                    <td className="mono"><a className="cell-link" href={`#/app/loans/${l.id}`}>{l.loan_number}</a></td>
                    <td className="ellipsis" title={l.customers?.company ?? undefined}>{l.customers?.company ?? '—'}</td>
                    <td>{l.type}</td>
                    <td><span className={`status ${stageCls[l.stage] ?? 's-gray'}`}>{l.stage === 'Servicing' ? 'Active' : l.stage}</span></td>
                    <td className="num mono">{money(l.amount)}</td>
                    <td className="mono">{l.rate ?? '—'}</td>
                    <td>{fmtDate(l.maturity)}</td>
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
                      <td className="ellipsis" title={d.customers?.company ?? undefined}>{d.customers?.company ?? '—'}</td>
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
        </>
      )}

      {tab === 'Operations' && (
        <>
          <QueuedMessages org={org} tick={tick} onSent={() => setTick(t => t + 1)} />
          <DelinquencyRules org={org} onRan={() => setTick(t => t + 1)} />
          <div className="grid" style={{ marginBottom: 20 }}>
            <div className="uw-head"><span><b>Document routing</b> <span className="small">drop anything — classification files it on the right loan; ambiguous files queue here</span></span></div>
            <div style={{ padding: 14 }}><DocRouting org={org} /></div>
          </div>
          <OutreachLog org={org} tick={tick} />
        </>
      )}
    </>
  )
}
