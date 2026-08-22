import { useEffect, useState } from 'react'
import Screener from './Screener'
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
  const Sep = () => <span className="sep"><Ico.chevron /></span>

  return (
    <>
      <div className="window-title">CRE Screener</div>
      <div className="frame">
        <header className="topbar">
          <span className="brand"><Ico.logo /></span>
          <nav className="crumbs">
            <a href="#/">Home</a><Sep />
            {section === 'portfolio' && <b>commercial-loan-portfolio</b>}
            {section === 'loans' && id && <><a href="#/portfolio">commercial-loan-portfolio</a><Sep /><b>{id}</b></>}
            {section !== 'portfolio' && section !== 'loans' && <b>cre-screener</b>}
            <span className="sep" style={{ marginLeft: 4 }}><Ico.doc /></span>
          </nav>
          <nav className="navlinks">
            <a href="#/" className={section === '' ? 'on' : ''}>Screener</a>
            <a href="#/portfolio" className={section === 'portfolio' || section === 'loans' ? 'on' : ''}>Portfolio</a>
          </nav>
          <span className="spacer" />
          <span className="edited">Edited 23 min ago</span>
          <button className="btn-dark"><Ico.link /> Share <Ico.chevron /></button>
          <span className="avatar">KR</span>
          <button className="iconbtn"><Ico.star /></button>
          <button className="iconbtn"><Ico.dots /></button>
        </header>
        <div className="page">
          {section === 'portfolio' ? <Portfolio />
            : section === 'loans' && id ? <LoanDetail id={id} />
            : <Screener />}
        </div>
      </div>
    </>
  )
}
