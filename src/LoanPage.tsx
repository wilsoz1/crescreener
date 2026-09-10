import { useEffect, useState } from 'react'
import { supabase, DbLoan, Doc, Org, ShareLink, Attempt, Payment, DbCovenant, DbTickler, Guarantor, Note, money, daysLate } from './supabase'
import { fmtDate } from './Loans'
import { Ico } from './Icons'

const shareUrl = (token: string) => `${window.location.origin}/#/share/${token}`
const covCls = { Pass: 's-green', Near: 's-amber', Fail: 's-red' } as const
const payStatus = (p: Payment) => {
  if (p.status === 'paid') {
    const late = p.paid_date && p.paid_date > p.due_date
    return <span className={`status ${late ? 's-amber' : 's-green'}`}><Ico.check /> {late ? `Paid late (${fmtDate(p.paid_date)})` : 'Paid on time'}</span>
  }
  const d = daysLate(p.due_date)
  if (d <= 0) return <span className="status s-gray">Upcoming</span>
  return <span className="status s-red"><Ico.x /> {d} days past due</span>
}
const tickStatus = (t: DbTickler) => {
  if (t.status === 'complete') return <span className="status s-green"><Ico.check /> Complete</span>
  if (t.status === 'waived') return <span className="status s-gray">Waived</span>
  if (daysLate(t.due_date) > 0) return <span className="status s-red"><Ico.x /> Past due {daysLate(t.due_date)}d</span>
  return <span className={`status ${t.status === 'requested' ? 's-amber' : 's-gray'}`}>{t.status === 'requested' ? 'Requested' : 'Upcoming'}</span>
}

export default function LoanPage({ org, loanId }: { org: Org; loanId: string }) {
  const [loan, setLoan] = useState<DbLoan | null>(null)
  const [docs, setDocs] = useState<Doc[]>([])
  const [links, setLinks] = useState<ShareLink[]>([])
  const [outreach, setOutreach] = useState<Attempt[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [covenants, setCovenants] = useState<DbCovenant[]>([])
  const [ticklers, setTicklers] = useState<DbTickler[]>([])
  const [guarantors, setGuarantors] = useState<Guarantor[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const { data: l } = await supabase.from('loans').select('*, customers(name, company, email, phone)').eq('id', loanId).single()
    setLoan((l as DbLoan) ?? null)
    const [d, s, pay, cov, tick, g, n, o] = await Promise.all([
      supabase.from('documents').select('*, loans(loan_number), customers(company)').eq('loan_id', loanId).order('created_at', { ascending: false }),
      supabase.from('share_links').select('*').eq('loan_id', loanId).order('created_at', { ascending: false }),
      supabase.from('loan_payments').select('*').eq('loan_id', loanId).order('due_date', { ascending: false }),
      supabase.from('covenants').select('*').eq('loan_id', loanId).order('created_at'),
      supabase.from('ticklers').select('*').eq('loan_id', loanId).order('due_date'),
      supabase.from('guarantors').select('*').eq('loan_id', loanId),
      supabase.from('loan_notes').select('*').eq('loan_id', loanId).order('created_at', { ascending: false }),
      l?.customer_id
        ? supabase.from('outreach_attempts').select('*, customers(name, company)').eq('customer_id', l.customer_id).order('created_at', { ascending: false }).limit(8)
        : Promise.resolve({ data: [] }),
    ])
    setDocs((d.data as Doc[]) ?? []); setLinks((s.data as ShareLink[]) ?? [])
    setPayments((pay.data as Payment[]) ?? []); setCovenants((cov.data as DbCovenant[]) ?? [])
    setTicklers((tick.data as DbTickler[]) ?? []); setGuarantors((g.data as Guarantor[]) ?? [])
    setNotes((n.data as Note[]) ?? []); setOutreach(((o as { data: Attempt[] | null }).data as Attempt[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [loanId])

  if (loading) return <p className="subtitle">Loading loan…</p>
  if (!loan) return <><h1>Loan not found</h1><p className="subtitle"><a href="#/app/loans">Back to all loans</a></p></>

  const overdue = payments.filter(p => p.status !== 'paid' && daysLate(p.due_date) > 0)
  const covFails = covenants.filter(c => c.status === 'Fail').length
  const tickPastDue = ticklers.filter(t => (t.status === 'open' || t.status === 'requested') && daysLate(t.due_date) > 0).length

  return (
    <>
      <div className="crumb-row"><a href="#/app/loans">← All loans</a></div>
      <div className="viewbar" style={{ marginBottom: 6 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{loan.loan_number}</h1>
          <p className="subtitle" style={{ marginBottom: 0 }}>{loan.customers?.company} · {loan.type} · {money(loan.amount)} commitment</p>
        </div>
        <span className="spacer" />
        <ShareControls org={org} loanId={loanId} docs={docs} links={links} onChange={load} />
      </div>

      {(overdue.length > 0 || covFails > 0 || tickPastDue > 0) && (
        <div className="alert-strip">
          {overdue.length > 0 && <span className="status s-red"><Ico.x /> {overdue.length} payment{overdue.length > 1 ? 's' : ''} past due — {money(overdue.reduce((s, p) => s + Number(p.amount), 0))} ({Math.max(...overdue.map(p => daysLate(p.due_date)))} days)</span>}
          {covFails > 0 && <span className="status s-red"><Ico.x /> {covFails} covenant failure{covFails > 1 ? 's' : ''}</span>}
          {tickPastDue > 0 && <span className="status s-amber"><Ico.clock /> {tickPastDue} reporting item{tickPastDue > 1 ? 's' : ''} past due</span>}
          <span className="small">Delinquency rules run daily and log automatic outreach — see <a href="#/app/outreach">Outreach</a>.</span>
        </div>
      )}

      <div className="two-col" style={{ marginTop: 14 }}>
        <div>
          <Card title="Terms">
            <table className="kv"><tbody>
              {([
                ['Borrower', loan.customers?.company ?? '—'],
                ['Contact', `${loan.customers?.name ?? '—'} · ${loan.customers?.email ?? 'no email'} · ${loan.customers?.phone ?? 'no phone'}`],
                ['Type / stage', `${loan.type} · ${loan.stage}`],
                ['Payment structure', loan.payment_type],
                ['Rate', `${loan.rate ?? '—'}${loan.rate_floor ? ` · floor ${loan.rate_floor}` : ''}`],
                ['Rate reset', fmtDate(loan.rate_reset_date)],
                ['I/O period ends', fmtDate(loan.io_end_date)],
                ['Term / amortization', loan.term ?? '—'],
                ['Origination → maturity', `${fmtDate(loan.origination_date)} → ${fmtDate(loan.maturity)}`],
                ['Draw period ends', fmtDate(loan.draw_period_end)],
                ['LTV / DSCR', `${loan.ltv === null ? '—' : Math.round(loan.ltv * 100) + '%'} / ${loan.dscr === null ? '—' : Number(loan.dscr).toFixed(2) + 'x'}`],
                ['Collateral', loan.collateral ?? '—'],
                ['Relationship manager', loan.rm ?? '—'],
              ] as [string, string][]).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
            </tbody></table>
          </Card>

          <Card title="Balances & payment">
            <table className="kv"><tbody>
              <tr><td>Current balance</td><td className="mono">{loan.current_balance === null ? '—' : money(loan.current_balance)} <span className="small">of {money(loan.amount)} commitment</span></td></tr>
              <tr><td>Next payment</td><td className="mono">{loan.next_payment_amount ? `${money(loan.next_payment_amount)} on ${fmtDate(loan.next_payment_date)}` : '—'}</td></tr>
              {loan.budget_total !== null && <>
                <tr><td>Construction budget</td><td className="mono">{money(loan.budget_total)}</td></tr>
                <tr><td>Draws to date</td><td>
                  <span className="mono">{money(loan.draws_to_date ?? 0)} ({Math.round(((loan.draws_to_date ?? 0) / loan.budget_total) * 100)}%)</span>
                  <div className="bar big" style={{ maxWidth: 220 }}><span style={{ width: `${Math.min(((loan.draws_to_date ?? 0) / loan.budget_total) * 100, 100)}%` }} /></div>
                </td></tr>
                <tr><td>Interest reserve remaining</td><td className="mono">{money(loan.interest_reserve_remaining ?? 0)}</td></tr>
              </>}
            </tbody></table>
          </Card>

          <Card title="Payment history" sub="the past-due record of truth — drives the delinquency rules">
            <table>
              <thead><tr><th>Due</th><th className="num">Amount</th><th>Status</th></tr></thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id}>
                    <td>{fmtDate(p.due_date)}</td>
                    <td className="num mono">{money(p.amount)}</td>
                    <td>{payStatus(p)}</td>
                  </tr>
                ))}
                {!payments.length && <tr><td colSpan={3} className="small">No payment schedule yet{loan.stage !== 'Servicing' ? ` — loan is in ${loan.stage}.` : '.'}</td></tr>}
              </tbody>
            </table>
          </Card>

          <Card title="Guarantors">
            <table>
              <thead><tr><th>Name</th><th className="num">Guarantee</th><th>Latest PFS</th><th className="num">Net worth</th><th className="num">Liquidity</th></tr></thead>
              <tbody>
                {guarantors.map(g => (
                  <tr key={g.id}>
                    <td><b>{g.name}</b></td>
                    <td className="num">{g.guarantee_pct ? `${g.guarantee_pct}%` : ''} {g.guarantee_type}</td>
                    <td>{fmtDate(g.pfs_date)}{g.pfs_date && daysLate(g.pfs_date) > 365 && <span className="status s-amber" style={{ marginLeft: 6 }}>Stale</span>}</td>
                    <td className="num mono">{g.net_worth ? money(g.net_worth) : '—'}</td>
                    <td className="num mono">{g.liquidity ? money(g.liquidity) : '—'}</td>
                  </tr>
                ))}
                {!guarantors.length && <tr><td colSpan={5} className="small">No guarantors recorded.</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>

        <div>
          <Card title="Covenants" sub={`${covenants.length} tracked`}>
            <table>
              <thead><tr><th>Covenant</th><th>Requirement</th><th>Actual</th><th>Status</th><th>Next test</th></tr></thead>
              <tbody>
                {covenants.map(c => (
                  <tr key={c.id}>
                    <td><b>{c.name}</b><div className="src">{c.source}</div></td>
                    <td className="small">{c.requirement}</td>
                    <td className="small mono">{c.actual ?? '—'}</td>
                    <td><span className={`status ${covCls[c.status]}`}>{c.status === 'Near' ? 'Near violation' : c.status}</span></td>
                    <td className="small">{fmtDate(c.next_test)}</td>
                  </tr>
                ))}
                {!covenants.length && <tr><td colSpan={5} className="small">No covenants recorded.</td></tr>}
              </tbody>
            </table>
          </Card>

          <Card title="Ticklers & reporting" sub="what's due and when">
            <table>
              <thead><tr><th>Requirement</th><th>Responsible</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {ticklers.map(t => (
                  <tr key={t.id}>
                    <td><b>{t.requirement}</b><div className="src">{t.source}</div></td>
                    <td className="small">{t.responsible}</td>
                    <td>{fmtDate(t.due_date)}</td>
                    <td>{tickStatus(t)}</td>
                  </tr>
                ))}
                {!ticklers.length && <tr><td colSpan={4} className="small">No ticklers yet.</td></tr>}
              </tbody>
            </table>
          </Card>

          <Card title="Documents" sub={`${docs.length} on this loan`}>
            <table><tbody>
              {docs.map(d => (
                <tr key={d.id}>
                  <td className="mono small ellipsis" title={d.filename}>{d.filename}</td>
                  <td><span className="pill">{d.doc_type}</span></td>
                  <td className="small mono">{new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                </tr>
              ))}
              {!docs.length && <tr><td className="small">None yet — drop files on <a href="#/app/docs">Documents</a>.</td></tr>}
            </tbody></table>
          </Card>

          <ShareLinksCard links={links} onChange={load} />
          <Notes org={org} loanId={loanId} notes={notes} onChange={load} />

          <Card title="Outreach history" sub="this borrower">
            <table><tbody>
              {outreach.map(a => (
                <tr key={a.id}>
                  <td className="small mono">{new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                  <td><span className="pill">{a.channel}</span>{a.rule_id && <span className="pill" style={{ marginLeft: 4 }}>auto</span>}</td>
                  <td className="ellipsis small" title={a.body}>{a.subject ?? a.body}</td>
                  <td><span className={`status ${a.status === 'sent' ? 's-green' : a.status === 'failed' ? 's-red' : 's-blue'}`}>{a.status}</span></td>
                </tr>
              ))}
              {!outreach.length && <tr><td className="small">No outreach yet for this borrower.</td></tr>}
            </tbody></table>
          </Card>
        </div>
      </div>
    </>
  )
}

const Card = ({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) => (
  <div className="grid" style={{ marginBottom: 20 }}>
    <div className="uw-head"><span><b>{title}</b> {sub && <span className="small">{sub}</span>}</span></div>
    {children}
  </div>
)

function ShareControls({ org, loanId, docs, links, onChange }: { org: Org; loanId: string; docs: Doc[]; links: ShareLink[]; onChange: () => void }) {
  const [open, setOpen] = useState(false)
  const [institution, setInstitution] = useState('')
  const [passcode, setPasscode] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [justCreated, setJustCreated] = useState<string | null>(null)

  const toggle = (id: string) => {
    const s = new Set(selected)
    s.has(id) ? s.delete(id) : s.add(id)
    setSelected(s)
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data, error } = await supabase.from('share_links').insert({
      org_id: org.id, loan_id: loanId, institution,
      passcode: passcode || null,
      doc_ids: selected.size && selected.size < docs.length ? [...selected] : null,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    }).select().single()
    if (!error && data) {
      setJustCreated(shareUrl(data.token))
      navigator.clipboard?.writeText(shareUrl(data.token)).catch(() => {})
      setOpen(false); setInstitution(''); setPasscode(''); setSelected(new Set())
      onChange()
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button className="btn-dark" onClick={() => setOpen(o => !o)}><Ico.link /> Share documents</button>
      {open && (
        <form className="share-pop" onSubmit={create}>
          <b>Share documents with an institution</b>
          <p className="small">Protected link: unguessable token · expires in 14 days · revocable · every open logged.</p>
          <input required placeholder="Institution name" value={institution} onChange={e => setInstitution(e.target.value)} />
          <input placeholder="Optional passcode (share it separately)" value={passcode} onChange={e => setPasscode(e.target.value)} />
          <div className="share-docs-list">
            {docs.map(d => (
              <label key={d.id} className="share-doc">
                <input type="checkbox" checked={selected.size === 0 || selected.has(d.id)} onChange={() => toggle(d.id)} />
                <span className="ellipsis">{d.filename}</span>
              </label>
            ))}
            {!docs.length && <span className="small">No documents on this loan yet — the link will show an empty room.</span>}
          </div>
          <p className="small">{selected.size === 0 || selected.size === docs.length ? `Sharing all ${docs.length}` : `Sharing ${selected.size} of ${docs.length}`} document{docs.length === 1 ? '' : 's'}.</p>
          <button className="btn-dark" style={{ width: '100%', justifyContent: 'center' }}>Create link</button>
        </form>
      )}
      {justCreated && (
        <div className="share-toast">Link created & copied<br /><span className="mono small">{justCreated}</span></div>
      )}
    </div>
  )
}

const ShareLinksCard = ({ links, onChange }: { links: ShareLink[]; onChange: () => void }) => {
  const revoke = async (id: string) => {
    await supabase.from('share_links').update({ revoked: true }).eq('id', id)
    onChange()
  }
  return (
    <Card title="Share links" sub="every access is logged">
      <table>
        <thead><tr><th>Institution</th><th>Scope</th><th>Expires</th><th className="num">Opens</th><th>Status</th><th /></tr></thead>
        <tbody>
          {links.map(s => {
            const expired = new Date(s.expires_at) < new Date()
            return (
              <tr key={s.id}>
                <td><b>{s.institution}</b><div className="small mono ellipsis">{shareUrl(s.token)}</div></td>
                <td className="small">{s.doc_ids ? `${s.doc_ids.length} docs` : 'All docs'}{s.passcode ? ' · passcode' : ''}</td>
                <td className="small">{new Date(s.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                <td className="num mono">{s.access_count}</td>
                <td><span className={`status ${s.revoked ? 's-red' : expired ? 's-gray' : 's-green'}`}>{s.revoked ? 'Revoked' : expired ? 'Expired' : 'Active'}</span></td>
                <td>{!s.revoked && !expired && <button className="btn-light" onClick={() => revoke(s.id)}>Revoke</button>}</td>
              </tr>
            )
          })}
          {!links.length && <tr><td colSpan={6} className="small">Nothing shared yet.</td></tr>}
        </tbody>
      </table>
    </Card>
  )
}

function Notes({ org, loanId, notes, onChange }: { org: Org; loanId: string; notes: Note[]; onChange: () => void }) {
  const [body, setBody] = useState('')
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const user = (await supabase.auth.getUser()).data.user
    await supabase.from('loan_notes').insert({
      org_id: org.id, loan_id: loanId, body,
      author: (user?.user_metadata?.full_name as string) ?? user?.email ?? 'Unknown',
      created_by: user?.id,
    })
    setBody('')
    onChange()
  }
  return (
    <Card title="Notes & activity" sub="calls, site visits, waiver discussions — on the record">
      <div className="notes">
        <form onSubmit={add} className="note-form">
          <input required placeholder="Add a note — e.g. 'Called borrower re: Aug payment; promised funds by 9/15'" value={body} onChange={e => setBody(e.target.value)} />
          <button className="btn-dark">Add</button>
        </form>
        {notes.map(n => (
          <div className="note" key={n.id}>
            <div className="small"><b>{n.author}</b> · {new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
            <div>{n.body}</div>
          </div>
        ))}
        {!notes.length && <p className="small" style={{ padding: '0 14px 12px' }}>No notes yet.</p>}
      </div>
    </Card>
  )
}
