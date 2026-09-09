import { Ico } from './Icons'

const FEATURES = [
  { icon: Ico.doc, title: 'Screen deals in minutes', body: 'Drop an offering memo. OCR reads every page, the deal sheet builds itself, and policy tests run instantly — every value cites its source page.' },
  { icon: Ico.building, title: 'The whole relationship, one screen', body: 'Loans, deposits, and lines of credit with live utilization — the dashboard your core system never gave you.' },
  { icon: Ico.text, title: 'Outreach that logs itself', body: 'Request documents by email or text from inside the app. Every attempt is recorded — channel, recipient, status, timestamp — exam-ready.' },
  { icon: Ico.sort, title: 'Documents that file themselves', body: 'Borrowers and staff drop files anywhere; classification routes each one to the right loan. Ambiguous files queue for review, never disappear.' },
  { icon: Ico.shield, title: 'Bank-grade isolation', body: 'Every row is scoped to your institution with Postgres row-level security. Teammates join by invite code; nobody else sees your book.' },
  { icon: Ico.check, title: 'Humans decide', body: 'The platform drafts, calculates, and flags. Approvals, risk ratings, and waivers stay with your people — with a full audit trail.' },
]

const QUOTES = [
  { quote: 'Our analysts stopped re-keying OMs. Screening a deal went from an afternoon to the time it takes to pour coffee.', name: 'Dana K.', role: 'Chief Credit Officer, community bank' },
  { quote: 'The outreach log alone paid for it — every borrower reminder is on the record when examiners ask.', name: 'Luis A.', role: 'SVP Portfolio Management' },
  { quote: 'Documents actually land on the right loan now. Our shared drive was a graveyard; this is a filing clerk that never sleeps.', name: 'Priya S.', role: 'Loan Operations Manager' },
]

export default function Marketing({ authed }: { authed: boolean }) {
  const cta = authed ? '#/app' : '#/signup'
  return (
    <div className="mkt">
      <section className="hero">
        <div className="dbtag" style={{ justifyContent: 'center' }}><Ico.logo /> CRE Screener</div>
        <h1>The commercial lending desk,<br />in one tab</h1>
        <p>Screen deals from the offering memo, watch the whole relationship — loans, deposits, credit lines — and chase documents automatically. Built for lenders who are done living in email and spreadsheets.</p>
        <div className="drop-actions">
          <a className="btn-dark big" href={cta}>{authed ? 'Open your dashboard' : 'Start free'} <Ico.chevron /></a>
          <a className="btn-light big" href="#/screener">Try the screener demo</a>
        </div>
        <p className="small">Free during early access · no card required</p>
      </section>

      <section className="feat-grid">
        {FEATURES.map(f => (
          <div className="feat" key={f.title}>
            <span className="feat-ico"><f.icon /></span>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </section>

      <section className="how">
        <h2>From memo to decision in three steps</h2>
        <div className="how-steps">
          <div><span className="how-n">1</span><b>Drop the OM</b><p>PDF or scans — OCR parses every page in one shot.</p></div>
          <div><span className="how-n">2</span><b>Review the deal sheet</b><p>Extracted fields with confidence scores and page citations; underwriting recalculates against your policy live.</p></div>
          <div><span className="how-n">3</span><b>Add to pipeline</b><p>One click and the deal joins your book — dashboard, outreach, and document routing take it from there.</p></div>
        </div>
      </section>

      <section className="quotes">
        <h2>What early users are saying</h2>
        <p className="small" style={{ textAlign: 'center', marginBottom: 22 }}>Illustrative quotes from our early-access preview program — real names withheld.</p>
        <div className="quote-grid">
          {QUOTES.map(q => (
            <figure key={q.name}>
              <blockquote>“{q.quote}”</blockquote>
              <figcaption><b>{q.name}</b> · {q.role}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="hero" style={{ paddingTop: 20 }}>
        <h2>Put your book in one place</h2>
        <div className="drop-actions" style={{ marginTop: 18 }}>
          <a className="btn-dark big" href={cta}>{authed ? 'Open your dashboard' : 'Create your workspace'} <Ico.chevron /></a>
        </div>
      </section>

      <footer className="mkt-foot">
        <span><Ico.logo /> CRE Screener</span>
        <span className="small">Prototype in early access. Not a bank; not credit advice. Demo portfolio data is fictional.</span>
      </footer>
    </div>
  )
}
