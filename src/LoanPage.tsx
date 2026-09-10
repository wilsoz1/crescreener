import { useEffect, useState } from 'react'
import { supabase, DbLoan, Doc, Org, ShareLink, Attempt, money } from './supabase'
import { fmtDate } from './Loans'
import { Ico } from './Icons'

const shareUrl = (token: string) => `${window.location.origin}/#/share/${token}`

export default function LoanPage({ org, loanId }: { org: Org; loanId: string }) {
  const [loan, setLoan] = useState<DbLoan | null>(null)
  const [docs, setDocs] = useState<Doc[]>([])
  const [links, setLinks] = useState<ShareLink[]>([])
  const [outreach, setOutreach] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [institution, setInstitution] = useState('')
  const [justCreated, setJustCreated] = useState<string | null>(null)

  const load = async () => {
    const { data: l } = await supabase.from('loans').select('*, customers(name, company, email, phone)').eq('id', loanId).single()
    setLoan((l as DbLoan) ?? null)
    const [d, s, o] = await Promise.all([
      supabase.from('documents').select('*, loans(loan_number), customers(company)').eq('loan_id', loanId).order('created_at', { ascending: false }),
      supabase.from('share_links').select('*').eq('loan_id', loanId).order('created_at', { ascending: false }),
      l?.customer_id
        ? supabase.from('outreach_attempts').select('*, customers(name, company)').eq('customer_id', l.customer_id).order('created_at', { ascending: false }).limit(10)
        : Promise.resolve({ data: [] }),
    ])
    setDocs((d.data as Doc[]) ?? [])
    setLinks((s.data as ShareLink[]) ?? [])
    setOutreach(((o as { data: Attempt[] | null }).data as Attempt[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [loanId])

  const createLink = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data, error } = await supabase.from('share_links')
      .insert({ org_id: org.id, loan_id: loanId, institution, created_by: (await supabase.auth.getUser()).data.user?.id })
      .select().single()
    if (!error && data) {
      setJustCreated(shareUrl(data.token))
      navigator.clipboard?.writeText(shareUrl(data.token)).catch(() => {})
      setSharing(false); setInstitution('')
      load()
    }
  }

  const revoke = async (id: string) => {
    await supabase.from('share_links').update({ revoked: true }).eq('id', id)
    load()
  }

  if (loading) return <p className="subtitle">Loading loan…</p>
  if (!loan) return <><h1>Loan not found</h1><p className="subtitle"><a href="#/app/loans">Back to all loans</a></p></>

  const terms: [string, string][] = [
    ['Borrower', loan.customers?.company ?? '—'],
    ['Contact', `${loan.customers?.name ?? '—'} · ${loan.customers?.email ?? 'no email'} · ${loan.customers?.phone ?? 'no phone'}`],
    ['Amount', money(loan.amount)],
    ['Type / stage', `${loan.type} · ${loan.stage}`],
    ['Payment structure', loan.payment_type + (loan.payment_type === 'Construction' ? ' (interest from draws during construction period)' : '')],
    ['Rate', loan.rate ?? '—'],
    ['Term / amortization', loan.term ?? '—'],
    ['Origination', fmtDate(loan.origination_date)],
    ['Draw period ends', fmtDate(loan.draw_period_end)],
    ['Maturity', fmtDate(loan.maturity)],
    ['LTV / DSCR', `${loan.ltv === null ? '—' : Math.round(loan.ltv * 100) + '%'} / ${loan.dscr === null ? '—' : Number(loan.dscr).toFixed(2) + 'x'}`],
    ['Collateral', loan.collateral ?? '—'],
    ['Relationship manager', loan.rm ?? '—'],
  ]

  return (
    <>
      <div className="crumb-row"><a href="#/app/loans">← All loans</a></div>
      <div className="viewbar" style={{ marginBottom: 6 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{loan.loan_number}</h1>
          <p className="subtitle" style={{ marginBottom: 0 }}>{loan.customers?.company} · {loan.type} · {money(loan.amount)}</p>
        </div>
        <span className="spacer" />
        <button className="btn-dark" onClick={() => setSharing(s => !s)}><Ico.link /> Share documents</button>
      </div>

      {sharing && (
        <form className="share-box" onSubmit={createLink}>
          <b>Share all {docs.length} document{docs.length === 1 ? '' : 's'} on this loan</b>
          <p className="small">Creates a protected link: unguessable token, expires in 14 days, revocable here, and every access is logged.</p>
          <div className="share-row">
            <input required placeholder="Institution name (e.g. First Interstate Participations)" value={institution} onChange={e => setInstitution(e.target.value)} />
            <button className="btn-dark">Create link</button>
          </div>
        </form>
      )}
      {justCreated && (
        <div className="demo-note" style={{ background: '#e7f6ec', borderColor: '#bfe3cc', color: '#14833b' }}>
          Link created and copied to clipboard: <b className="mono">{justCreated}</b>
        </div>
      )}

      <div className="two-col" style={{ marginTop: 14 }}>
        <div>
          <div className="grid" style={{ marginBottom: 20 }}>
            <div className="uw-head"><span><b>Terms</b></span></div>
            <table className="kv"><tbody>
              {terms.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
            </tbody></table>
          </div>

          <div className="grid">
            <div className="uw-head"><span><b>Outreach history</b> <span className="small">this borrower</span></span></div>
            <table>
              <tbody>
                {outreach.map(a => (
                  <tr key={a.id}>
                    <td className="small mono">{new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                    <td><span className="pill">{a.channel}</span></td>
                    <td className="ellipsis small" title={a.body}>{a.subject ?? a.body}</td>
                    <td><span className={`status ${a.status === 'sent' ? 's-green' : a.status === 'failed' ? 's-red' : 's-blue'}`}>{a.status}</span></td>
                  </tr>
                ))}
                {!outreach.length && <tr><td className="small">No outreach yet for this borrower.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="grid" style={{ marginBottom: 20 }}>
            <div className="uw-head"><span><b>Documents</b> <span className="small">{docs.length} on this loan</span></span></div>
            <table>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id}>
                    <td className="mono small ellipsis" title={d.filename}>{d.filename}</td>
                    <td><span className="pill">{d.doc_type}</span></td>
                    <td className="small mono">{new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                  </tr>
                ))}
                {!docs.length && <tr><td className="small">No documents yet — drop files on the <a href="#/app/docs">Documents</a> page and they'll route here.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="grid">
            <div className="uw-head"><span><b>Share links</b> <span className="small">every access is logged</span></span></div>
            <table>
              <thead><tr><th>Institution</th><th>Expires</th><th className="num">Opens</th><th>Last opened</th><th>Status</th><th /></tr></thead>
              <tbody>
                {links.map(s => {
                  const expired = new Date(s.expires_at) < new Date()
                  return (
                    <tr key={s.id}>
                      <td><b>{s.institution}</b><div className="small mono ellipsis">{shareUrl(s.token)}</div></td>
                      <td className="small">{new Date(s.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                      <td className="num mono">{s.access_count}</td>
                      <td className="small">{s.last_accessed_at ? new Date(s.last_accessed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never'}</td>
                      <td><span className={`status ${s.revoked ? 's-red' : expired ? 's-gray' : 's-green'}`}>{s.revoked ? 'Revoked' : expired ? 'Expired' : 'Active'}</span></td>
                      <td>{!s.revoked && !expired && <button className="btn-light" onClick={() => revoke(s.id)}>Revoke</button>}</td>
                    </tr>
                  )
                })}
                {!links.length && <tr><td colSpan={6} className="small">Nothing shared yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
