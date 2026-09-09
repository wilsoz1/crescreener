import { useEffect, useRef, useState } from 'react'
import { supabase, Doc, Org } from './supabase'
import { Ico } from './Icons'

type LoanLite = { id: string; loan_number: string; customer_id: string | null; customers: { company: string | null } | null }

// Heuristic classifier: filename keywords → document type. AI classification slots in here later.
const RULES: [string, RegExp][] = [
  ['Rent Roll', /rent[\s_-]?roll/i],
  ['Tax Return', /tax|1040|1065|1120|k-?1\b/i],
  ['Personal Financial Statement', /pfs|personal[\s_-]?financial/i],
  ['Insurance Certificate', /acord|insurance|\bcoi\b|certificate/i],
  ['Appraisal', /appraisal/i],
  ['Borrowing Base Certificate', /borrow|bbc/i],
  ['Offering Memorandum', /\bom\b|offering|memorandum/i],
  ['Lease', /lease/i],
  ['Organizational Documents', /articles|operating[\s_-]?agreement|bylaws|\bein\b|resolution/i],
  ['Financial Statement', /financial|balance[\s_-]?sheet|income|t-?12|operating[\s_-]?statement|interim/i],
]

function classify(filename: string, loans: LoanLite[]) {
  const hit = RULES.find(([, re]) => re.test(filename))
  const docType = hit?.[0] ?? 'Unclassified'
  const norm = filename.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  const loan = loans.find(l => {
    const co = (l.customers?.company ?? '').toLowerCase().split(/\s+/).filter(w => w.length > 3)
    return norm.includes(l.loan_number.toLowerCase()) || co.some(w => norm.includes(w))
  })
  return { docType, loan, confidence: (hit ? 0.6 : 0.2) + (loan ? 0.35 : 0) }
}

export default function Documents({ org }: { org: Org }) {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loans, setLoans] = useState<LoanLite[]>([])
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const load = () => {
    supabase.from('documents').select('*, loans(loan_number), customers(company)').order('created_at', { ascending: false })
      .then(({ data }) => setDocs((data as Doc[]) ?? []))
    supabase.from('loans').select('id, loan_number, customer_id, customers(company)')
      .then(({ data }) => setLoans((data as unknown as LoanLite[]) ?? []))
  }
  useEffect(load, [org.id])

  const upload = async (files: FileList | File[]) => {
    setErr(null)
    for (const file of Array.from(files)) {
      setBusy(file.name)
      const { docType, loan, confidence } = classify(file.name, loans)
      const path = `${org.id}/${crypto.randomUUID()}-${file.name}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file)
      if (upErr) { setErr(`${file.name}: ${upErr.message}`); break }
      const { error: insErr } = await supabase.from('documents').insert({
        org_id: org.id, loan_id: loan?.id ?? null, customer_id: loan?.customer_id ?? null,
        filename: file.name, storage_path: path, doc_type: docType, confidence,
        status: loan && docType !== 'Unclassified' ? 'routed' : 'needs_review',
      })
      if (insErr) { setErr(`${file.name}: ${insErr.message}`); break }
    }
    setBusy(null)
    load()
  }

  const reroute = async (doc: Doc, loanId: string) => {
    const loan = loans.find(l => l.id === loanId)
    await supabase.from('documents').update({ loan_id: loanId || null, customer_id: loan?.customer_id ?? null, status: loanId ? 'routed' : 'needs_review' }).eq('id', doc.id)
    load()
  }

  return (
    <>
      <h1>Documents</h1>
      <p className="subtitle">Drop anything here — tax returns, rent rolls, insurance certs. Files are classified and routed to the right loan automatically; anything ambiguous lands in review.</p>

      <div
        className={`drop slim ${drag ? 'drag' : ''}`}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files) }}
        onClick={() => input.current?.click()}
      >
        <input ref={input} type="file" multiple hidden onChange={e => e.target.files && upload(e.target.files)} />
        {busy ? <span className="small"><span className="spin" style={{ display: 'inline-block', verticalAlign: -2 }} /> Uploading {busy}…</span>
          : <><Ico.doc /> <b>Drop documents</b> <span className="small">or click to choose — routing runs on upload</span></>}
      </div>
      {err && <div className="demo-note">{err}</div>}

      <div className="grid">
        <div className="uw-head"><span><b>Document log</b> <span className="small">{docs.filter(d => d.status === 'needs_review').length} need review</span></span></div>
        <table>
          <thead><tr><th>File</th><th>Classified as</th><th className="num">Confidence</th><th>Routed to</th><th>Status</th><th>Uploaded</th></tr></thead>
          <tbody>
            {docs.map(d => (
              <tr key={d.id}>
                <td className="mono small ellipsis" title={d.filename}>{d.filename}</td>
                <td><span className="pill">{d.doc_type}</span></td>
                <td className="num mono">{Math.round(d.confidence * 100)}%</td>
                <td>
                  <select className="mini" value={d.loan_id ?? ''} onChange={e => reroute(d, e.target.value)}>
                    <option value="">— unassigned —</option>
                    {loans.map(l => <option key={l.id} value={l.id}>{l.loan_number} · {l.customers?.company ?? ''}</option>)}
                  </select>
                </td>
                <td><span className={`status ${d.status === 'routed' ? 's-green' : 's-amber'}`}>{d.status === 'routed' ? 'Routed' : 'Needs review'}</span></td>
                <td className="small mono">{new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
              </tr>
            ))}
            {!docs.length && <tr><td colSpan={6} className="small">Nothing yet — drop a file like <code>HarborPoint_rent_roll_Q2.pdf</code> to see routing.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
