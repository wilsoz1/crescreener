// Operations — the org-level machinery: queued outreach, delinquency rules, document routing, the log.
import { useState } from 'react'
import { Org } from './supabase'
import { OutreachLog, DelinquencyRules, QueuedMessages } from './Outreach'
import DocRouting from './Documents'

export default function Operations({ org }: { org: Org }) {
  const [tick, setTick] = useState(0)
  return (
    <>
      <h1>Operations</h1>
      <p className="subtitle">Automation and intake for the whole bank — rules fire daily; anything ambiguous queues here for a human.</p>
      <QueuedMessages org={org} tick={tick} onSent={() => setTick(t => t + 1)} />
      <DelinquencyRules org={org} onRan={() => setTick(t => t + 1)} />
      <div className="grid" style={{ marginBottom: 20 }}>
        <div className="uw-head"><span><b>Document routing</b> <span className="small">drop anything — classification files it on the right loan; ambiguous files queue here</span></span></div>
        <div style={{ padding: 14 }}><DocRouting org={org} /></div>
      </div>
      <OutreachLog org={org} tick={tick} />
    </>
  )
}
