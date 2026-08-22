import { useEffect, useState } from 'react'
import Portfolio from './Portfolio'
import LoanDetail from './LoanDetail'
import { Ico } from './Icons'

const useHash = () => {
  const [hash, setHash] = useState(window.location.hash || '#/')
  useEffect(() => {
    const fn = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', fn)
    return () => window.removeEventListener('hashchange', fn)
  }, [])
  return hash
}

export default function App() {
  const hash = useHash()
  const route = hash.replace(/^#\//, '')
  const [section, id] = route.split('/')

  return (
    <>
      <div className="window-title">Commercial Loan Portfolio</div>
      <div className="frame">
        <header className="topbar">
          <span className="brand"><Ico.logo /></span>
          <nav className="crumbs">
            <a href="#/">Home</a>
            <span className="sep"><Ico.chevron /></span>
            <span>…</span>
            <span className="sep"><Ico.chevron /></span>
            {section === 'loans' && id
              ? <><a href="#/">commercial-loan-portfolio</a><span className="sep"><Ico.chevron /></span><b>{id}</b></>
              : <b>commercial-loan-portfolio</b>}
            <span className="sep" style={{ marginLeft: 4 }}><Ico.doc /></span>
          </nav>
          <span className="spacer" />
          <span className="edited">Edited 23 min ago</span>
          <button className="btn-dark"><Ico.link /> Share <Ico.chevron /></button>
          <span className="avatar">KR</span>
          <button className="iconbtn"><Ico.star /></button>
          <button className="iconbtn"><Ico.dots /></button>
        </header>
        <div className="page">
          {section === 'loans' && id ? <LoanDetail id={id} /> : <Portfolio />}
        </div>
      </div>
    </>
  )
}
