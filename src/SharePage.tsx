import { useEffect, useState } from 'react'
import { money } from './supabase'
import { Ico } from './Icons'

type Payload = {
  institution: string; lender: string; expires_at: string
  loan: { loan_number: string; type: string; amount: number; collateral: string | null; borrower: string | null }
  files: { filename: string; doc_type: string; uploaded: string; url: string | null }[]
}

// Public page for external institutions — no account needed; the token is the credential.
export default function SharePage({ token }: { token: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch(`https://ngmpmyuwacwbwtqtinos.supabase.co/functions/v1/share-docs?token=${token}`)
      .then(async r => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error ?? 'Unable to open this link.')
        setData(body)
      })
      .catch(e => setErr(e.message))
  }, [token])

  if (err) return <div className="auth-wrap"><div className="auth-card"><h2>Link unavailable</h2><p className="small">{err}</p></div></div>
  if (!data) return <p className="subtitle" style={{ padding: 40 }}>Opening secure document room…</p>

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px' }}>
      <div className="dbtag"><Ico.lock /> Secure document room · prepared for <b>{data.institution}</b> by {data.lender}</div>
      <h1>{data.loan.borrower ?? data.loan.loan_number}</h1>
      <p className="subtitle">
        {data.loan.loan_number} · {data.loan.type} · {money(data.loan.amount)} · {data.loan.collateral ?? ''}<br />
        Link expires {new Date(data.expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. Download links are valid for 1 hour per visit — refresh to renew.
      </p>
      <div className="grid">
        <table>
          <thead><tr><th>Document</th><th>Type</th><th>Uploaded</th><th /></tr></thead>
          <tbody>
            {data.files.map(f => (
              <tr key={f.filename + f.uploaded}>
                <td className="mono small">{f.filename}</td>
                <td><span className="pill">{f.doc_type}</span></td>
                <td className="small">{new Date(f.uploaded).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                <td>{f.url ? <a className="btn-light" href={f.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>Download</a> : <span className="small">unavailable</span>}</td>
              </tr>
            ))}
            {!data.files.length && <tr><td colSpan={4} className="small">No documents are attached to this loan yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="small" style={{ marginTop: 14 }}>Provided via CRE Screener. Access to this room is logged for the lender.</p>
    </div>
  )
}
