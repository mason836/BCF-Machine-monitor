import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const SHIFT_MINS = 480
const MACHINE = 'line-2-case-packer'
const PLANNED_REASONS = ['Lunch Break', 'Changeover / Sauce Switch']

const todayKey = () => new Date().toISOString().slice(0, 10)
const fmtTime = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
const minsToHHMM = m => { const h = Math.floor(m / 60), min = Math.round(m % 60); return `${h}h ${min}m` }
const availColor = v => v >= 75 ? '#34d399' : v >= 50 ? '#fbbf24' : '#f87171'

function buildSessions(events) {
  const sessions = []
  let start = null
  for (const e of events) {
    if (e.type === 'start') { start = e }
    else if (e.type === 'stop' && start) {
      sessions.push({
        id: start.id + '-' + e.id,
        start: new Date(start.created_at).getTime(),
        stop: new Date(e.created_at).getTime(),
        planned: false,
        planReason: ''
      })
      start = null
    }
  }
  return sessions
}

function dayStats(sessions, liveMs = 0) {
  const runMins = sessions.reduce((a, s) => a + (s.stop - s.start) / 60000, 0) + liveMs / 60000
  const plannedMins = sessions.filter(s => s.planned).reduce((a, s) => a + (s.stop - s.start) / 60000, 0)
  const unplannedMins = sessions.filter(s => !s.planned).reduce((a, s) => a + (s.stop - s.start) / 60000, 0)
  const avail = Math.min(100, (runMins / SHIFT_MINS) * 100)
  return { runMins, plannedMins, unplannedMins, avail }
}

export default function Dashboard() {
  const [events, setEvents] = useState([])
  const [now, setNow] = useState(Date.now())
  const [view, setView] = useState('today')
  const [operators, setOperators] = useState(['Operator 1', 'Operator 2', 'Operator 3'])
  const [dayOperators, setDayOperators] = useState({})
  const [plannedMap, setPlannedMap] = useState({})
  const [editStop, setEditStop] = useState(null)
  const [customReason, setCustomReason] = useState('')
  const [selectedDay, setSelectedDay] = useState(null)
  const [loading, setLoading] = useState(true)
  const [newOp, setNewOp] = useState('')
  const tickRef = useRef()

  // Load events from Supabase
  async function fetchEvents() {
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('machine', MACHINE)
      .order('created_at', { ascending: true })
    if (data) setEvents(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchEvents()
    // Real-time subscription
    const channel = supabase
      .channel('events-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, () => fetchEvents())
      .subscribe()
    tickRef.current = setInterval(() => setNow(Date.now()), 1000)
    return () => { supabase.removeChannel(channel); clearInterval(tickRef.current) }
  }, [])

  // Load saved data from localStorage
  useEffect(() => {
    try {
      const ops = localStorage.getItem('mm-operators')
      if (ops) setOperators(JSON.parse(ops))
      const dops = localStorage.getItem('mm-day-operators')
      if (dops) setDayOperators(JSON.parse(dops))
      const pm = localStorage.getItem('mm-planned-map')
      if (pm) setPlannedMap(JSON.parse(pm))
    } catch (e) {}
  }, [])

  function saveOperators(ops) {
    setOperators(ops)
    localStorage.setItem('mm-operators', JSON.stringify(ops))
  }

  function setDayOp(day, op) {
    const next = { ...dayOperators, [day]: op }
    setDayOperators(next)
    localStorage.setItem('mm-day-operators', JSON.stringify(next))
  }

  function markPlanned(sessionId, planned, reason) {
    const next = { ...plannedMap, [sessionId]: { planned, reason } }
    setPlannedMap(next)
    localStorage.setItem('mm-planned-map', JSON.stringify(next))
    setEditStop(null)
  }

  // Group events by day
  const eventsByDay = {}
  events.forEach(e => {
    const day = new Date(e.created_at).toISOString().slice(0, 10)
    if (!eventsByDay[day]) eventsByDay[day] = []
    eventsByDay[day].push(e)
  })

  const dk = todayKey()
  const todayEvents = eventsByDay[dk] || []
  const lastEvent = todayEvents[todayEvents.length - 1]
  const isRunning = lastEvent?.type === 'start'
  const liveMs = isRunning ? now - new Date(lastEvent.created_at).getTime() : 0
  const liveSeconds = Math.floor(liveMs / 1000)
  const todaySessions = buildSessions(todayEvents).map(s => ({
    ...s, ...(plannedMap[s.id] || {})
  }))
  const stats = dayStats(todaySessions, liveMs)
  const accent = isRunning ? '#34d399' : '#f87171'

  const allDays = Object.keys(eventsByDay).sort((a, b) => b.localeCompare(a))

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#080d14', color: '#334155', fontFamily: 'monospace' }}>
      Loading…
    </div>
  )

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Source+Code+Pro:wght@400;500&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#080d14;color:#e2e8f0;font-family:'Source Code Pro',monospace}
    ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#1e3a5f}
    @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(1.8)}}
    @keyframes glow{0%,100%{box-shadow:0 0 8px ${accent}44}50%{box-shadow:0 0 20px ${accent}88}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    .nav{background:none;border:none;cursor:pointer;font-family:'Source Code Pro',monospace;font-size:11px;letter-spacing:2px;padding:8px 16px;transition:all .2s;border-bottom:2px solid transparent;color:#475569}
    .nav.active{border-bottom-color:#3b82f6;color:#93c5fd}
    .nav:hover{color:#e2e8f0}
    .btn{font-family:'Rajdhani',sans-serif;letter-spacing:1px;font-size:13px;font-weight:600;border-radius:6px;border:none;cursor:pointer;transition:all .2s;padding:9px 20px}
    .btn:disabled{opacity:.3;cursor:not-allowed}
    .btn-start{background:#064e3b;color:#34d399;border:1px solid #34d39955}
    .btn-start:not(:disabled):hover{background:#065f46}
    .btn-stop{background:#450a0a;color:#f87171;border:1px solid #f8717155}
    .btn-stop:not(:disabled):hover{background:#7f1d1d}
    .ghost{background:none;border:1px solid #1e3a5f;color:#64748b;padding:5px 12px;border-radius:5px;font-family:'Source Code Pro',monospace;font-size:11px;cursor:pointer;transition:all .2s}
    .ghost:hover{border-color:#3b82f6;color:#93c5fd}
    .row:hover{background:#0f2035!important;cursor:pointer}
    th{font-family:'Rajdhani',sans-serif;font-size:9px;letter-spacing:2px;color:#334155;padding:8px 12px;text-align:left}
    td{padding:10px 12px;font-size:12px;border-bottom:1px solid #0f1e30}
    select,input[type=text]{background:#0a1628;border:1px solid #1e3a5f;color:#e2e8f0;padding:7px 12px;border-radius:6px;font-family:'Source Code Pro',monospace;font-size:12px;outline:none}
    select:focus,input[type=text]:focus{border-color:#3b82f6}
  `

  return (
    <>
      <style>{css}</style>
      <div style={{ minHeight: '100vh', background: '#080d14' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(180deg,#0d1b2e,#080d14)', borderBottom: '1px solid #1e3a5f' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 9, letterSpacing: 4, color: '#334155' }}>LINE 2 — CASE PACKER</div>
              <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 24, fontWeight: 700, letterSpacing: 2 }}>MACHINE DASHBOARD</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#334155' }}>{new Date(now).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
              <div style={{ fontSize: 20, letterSpacing: 3, color: '#93c5fd' }}>{new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
            </div>
          </div>
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px', display: 'flex', gap: 2 }}>
            {[['today','TODAY'],['history','LOGBOOK'],['settings','SETTINGS']].map(([id,lbl]) => (
              <button key={id} className={`nav ${view===id?'active':''}`} onClick={() => { setView(id); setSelectedDay(null); setEditStop(null) }}>{lbl}</button>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>

          {/* TODAY */}
          {view === 'today' && (
            <div style={{ animation: 'fadeUp .3s ease' }}>
              {/* Operator + status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 9, letterSpacing: 3, color: '#334155' }}>OPERATOR</span>
                  <select value={dayOperators[dk] || ''} onChange={e => setDayOp(dk, e.target.value)}>
                    <option value=''>— select —</option>
                    {operators.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div style={{ fontSize: 10, color: '#334155', letterSpacing: 2 }}>
                  {fmtDate(dk)}
                </div>
              </div>

              {/* Status card */}
              <div style={{
                background: `linear-gradient(135deg,#0d1b2e,#0f2035)`,
                border: `1px solid ${accent}33`, borderRadius: 12, padding: '18px 22px', marginBottom: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
                animation: isRunning ? 'glow 2s ease-in-out infinite' : 'none'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', background: accent, boxShadow: `0 0 10px ${accent}`, animation: isRunning ? 'pulse 1.5s ease-in-out infinite' : 'none' }} />
                  <div>
                    <div style={{ fontSize: 9, letterSpacing: 3, color: '#334155' }}>MACHINE STATUS</div>
                    <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 28, fontWeight: 700, color: accent, letterSpacing: 2 }}>
                      {isRunning ? 'RUNNING' : 'STOPPED'}
                    </div>
                  </div>
                </div>
                {isRunning && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, letterSpacing: 3, color: '#334155' }}>SESSION TIMER</div>
                    <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 28, fontWeight: 600, color: '#34d399', letterSpacing: 3 }}>
                      {String(Math.floor(liveSeconds/3600)).padStart(2,'0')}:{String(Math.floor((liveSeconds%3600)/60)).padStart(2,'0')}:{String(liveSeconds%60).padStart(2,'0')}
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 10, color: '#475569', letterSpacing: 1 }}>
                  Arduino controls start/stop
                </div>
              </div>

              {/* Stat cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'RUN TIME', value: minsToHHMM(stats.runMins), color: '#34d399' },
                  { label: 'UNPLANNED DT', value: minsToHHMM(stats.unplannedMins), color: '#f87171' },
                  { label: 'PLANNED DT', value: minsToHHMM(stats.plannedMins), color: '#fbbf24' },
                  { label: 'AVAILABILITY', value: `${stats.avail.toFixed(1)}%`, color: availColor(stats.avail) },
                  { label: 'SESSIONS', value: todaySessions.length + (isRunning ? 1 : 0), color: '#93c5fd' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: '#0d1b2e', border: '1px solid #1e3a5f', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontSize: 8, letterSpacing: 3, color: '#334155', marginBottom: 6 }}>{label}</div>
                    <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 22, fontWeight: 700, color }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Session table */}
              <div style={{ fontSize: 9, letterSpacing: 3, color: '#334155', marginBottom: 10 }}>SESSION LOG — click a stop row to mark as planned</div>
              {todaySessions.length === 0 && !isRunning
                ? <div style={{ color: '#1e3a5f', padding: '32px 0', textAlign: 'center', fontSize: 13 }}>No sessions yet. Waiting for Arduino signal.</div>
                : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th>#</th><th>START</th><th>END</th><th>DURATION</th><th>STATUS</th></tr></thead>
                    <tbody>
                      {isRunning && (
                        <tr style={{ background: '#0a1e1044' }}>
                          <td style={{ color: '#334155' }}>●</td>
                          <td style={{ color: '#34d399' }}>{fmtTime(new Date(lastEvent.created_at).getTime())}</td>
                          <td style={{ color: '#334155' }}>—</td>
                          <td style={{ color: '#34d399' }}>{String(Math.floor(liveSeconds/60)).padStart(2,'0')}:{String(liveSeconds%60).padStart(2,'0')} ⟳</td>
                          <td>—</td>
                        </tr>
                      )}
                      {[...todaySessions].reverse().map((s, i) => {
                        const dur = Math.round((s.stop - s.start) / 60000)
                        const pm = plannedMap[s.id] || {}
                        return (
                          <tr key={s.id} className='row' style={{ transition: 'background .15s' }}
                            onClick={() => { setEditStop(editStop === s.id ? null : s.id); setCustomReason('') }}>
                            <td style={{ color: '#334155' }}>{todaySessions.length - i}</td>
                            <td>{fmtTime(s.start)}</td>
                            <td>{fmtTime(s.stop)}</td>
                            <td style={{ color: '#64748b' }}>{dur}m</td>
                            <td>
                              {pm.planned
                                ? <span style={{ background: '#1e3a2f', color: '#34d399', fontSize: 10, padding: '2px 8px', borderRadius: 20 }}>✓ {pm.reason || 'PLANNED'}</span>
                                : <span style={{ background: '#3b0f0f', color: '#f87171', fontSize: 10, padding: '2px 8px', borderRadius: 20 }}>DOWNTIME</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}

              {/* Stop editor */}
              {editStop && (() => {
                const s = todaySessions.find(x => x.id === editStop)
                if (!s) return null
                const pm = plannedMap[s.id] || {}
                return (
                  <div style={{ marginTop: 12, background: '#0d1b2e', border: '1px solid #1e3a5f', borderRadius: 10, padding: 16, animation: 'fadeUp .2s' }}>
                    <div style={{ fontSize: 10, letterSpacing: 2, color: '#64748b', marginBottom: 12 }}>
                      EDIT STOP · {fmtTime(s.start)} → {fmtTime(s.stop)} ({Math.round((s.stop-s.start)/60000)}m)
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                      <button className='btn btn-start' onClick={() => markPlanned(s.id, true, pm.reason || PLANNED_REASONS[0])}>✓ Mark Planned</button>
                      <button className='btn btn-stop' onClick={() => markPlanned(s.id, false, '')}>✕ Mark Downtime</button>
                      <button className='ghost' onClick={() => setEditStop(null)}>Cancel</button>
                    </div>
                    {pm.planned && (
                      <div>
                        <div style={{ fontSize: 9, letterSpacing: 2, color: '#334155', marginBottom: 8 }}>REASON</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                          {PLANNED_REASONS.map(r => (
                            <button key={r} className='ghost'
                              style={{ borderColor: pm.reason===r?'#3b82f6':'#1e3a5f', color: pm.reason===r?'#93c5fd':'#64748b' }}
                              onClick={() => markPlanned(s.id, true, r)}>{r}</button>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input type='text' placeholder='Custom reason…' value={customReason} onChange={e => setCustomReason(e.target.value)}
                            onKeyDown={e => { if(e.key==='Enter'&&customReason.trim()) markPlanned(s.id,true,customReason.trim()) }} style={{ flex: 1 }} />
                          <button className='ghost' onClick={() => { if(customReason.trim()) markPlanned(s.id,true,customReason.trim()) }}>Set</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          {/* LOGBOOK */}
          {view === 'history' && !selectedDay && (
            <div style={{ animation: 'fadeUp .3s ease' }}>
              <div style={{ fontSize: 9, letterSpacing: 3, color: '#334155', marginBottom: 14 }}>DAILY LOGBOOK — click a day to view details</div>
              {allDays.length === 0
                ? <div style={{ color: '#1e3a5f', padding: '32px 0', textAlign: 'center', fontSize: 13 }}>No data yet.</div>
                : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th>DATE</th><th>OPERATOR</th><th>SESSIONS</th><th>RUN TIME</th><th>UNPLANNED DT</th><th>AVAIL %</th></tr></thead>
                    <tbody>
                      {allDays.map(d => {
                        const evs = eventsByDay[d] || []
                        const sess = buildSessions(evs).map(s => ({ ...s, ...(plannedMap[s.id] || {}) }))
                        const st = dayStats(sess)
                        const clr = availColor(st.avail)
                        return (
                          <tr key={d} className='row' style={{ transition: 'background .15s' }} onClick={() => setSelectedDay(d)}>
                            <td style={{ color: '#93c5fd', fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, fontSize: 14 }}>{fmtDate(d)}</td>
                            <td style={{ color: '#64748b' }}>{dayOperators[d] || '—'}</td>
                            <td style={{ color: '#94a3b8' }}>{sess.length}</td>
                            <td>{minsToHHMM(st.runMins)}</td>
                            <td style={{ color: '#f87171' }}>{minsToHHMM(st.unplannedMins)}</td>
                            <td style={{ color: clr, fontWeight: 600 }}>
                              {st.avail.toFixed(1)}%
                              <div style={{ marginTop: 3, height: 3, background: '#0f1e30', borderRadius: 2 }}>
                                <div style={{ width: `${st.avail}%`, height: '100%', background: clr, borderRadius: 2 }} />
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
            </div>
          )}

          {/* HISTORY DRILL DOWN */}
          {view === 'history' && selectedDay && (() => {
            const evs = eventsByDay[selectedDay] || []
            const sess = buildSessions(evs).map(s => ({ ...s, ...(plannedMap[s.id] || {}) }))
            const st = dayStats(sess)
            return (
              <div style={{ animation: 'fadeUp .3s ease' }}>
                <button className='ghost' style={{ marginBottom: 16 }} onClick={() => setSelectedDay(null)}>← Back</button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
                  <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 22, fontWeight: 700, color: '#93c5fd' }}>{fmtDate(selectedDay)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 9, letterSpacing: 3, color: '#334155' }}>OPERATOR</span>
                    <select value={dayOperators[selectedDay] || ''} onChange={e => setDayOp(selectedDay, e.target.value)}>
                      <option value=''>— select —</option>
                      {operators.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: 20 }}>
                  {[
                    { label: 'RUN TIME', value: minsToHHMM(st.runMins), color: '#34d399' },
                    { label: 'UNPLANNED DT', value: minsToHHMM(st.unplannedMins), color: '#f87171' },
                    { label: 'PLANNED DT', value: minsToHHMM(st.plannedMins), color: '#fbbf24' },
                    { label: 'AVAILABILITY', value: `${st.avail.toFixed(1)}%`, color: availColor(st.avail) },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: '#0d1b2e', border: '1px solid #1e3a5f', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 8, letterSpacing: 3, color: '#334155', marginBottom: 6 }}>{label}</div>
                      <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 20, fontWeight: 700, color }}>{value}</div>
                    </div>
                  ))}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th>#</th><th>START</th><th>END</th><th>DURATION</th><th>STATUS</th></tr></thead>
                  <tbody>
                    {[...sess].reverse().map((s, i) => {
                      const pm = plannedMap[s.id] || {}
                      return (
                        <tr key={s.id} className='row' style={{ transition: 'background .15s' }}
                          onClick={() => { setEditStop(editStop===s.id?null:s.id); setCustomReason('') }}>
                          <td style={{ color: '#334155' }}>{sess.length - i}</td>
                          <td>{fmtTime(s.start)}</td>
                          <td>{fmtTime(s.stop)}</td>
                          <td style={{ color: '#64748b' }}>{Math.round((s.stop-s.start)/60000)}m</td>
                          <td>
                            {pm.planned
                              ? <span style={{ background: '#1e3a2f', color: '#34d399', fontSize: 10, padding: '2px 8px', borderRadius: 20 }}>✓ {pm.reason||'PLANNED'}</span>
                              : <span style={{ background: '#3b0f0f', color: '#f87171', fontSize: 10, padding: '2px 8px', borderRadius: 20 }}>DOWNTIME</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {/* Stop editor for history */}
                {editStop && (() => {
                  const s = sess.find(x => x.id === editStop)
                  if (!s) return null
                  const pm = plannedMap[s.id] || {}
                  return (
                    <div style={{ marginTop: 12, background: '#0d1b2e', border: '1px solid #1e3a5f', borderRadius: 10, padding: 16 }}>
                      <div style={{ fontSize: 10, letterSpacing: 2, color: '#64748b', marginBottom: 12 }}>
                        EDIT STOP · {fmtTime(s.start)} → {fmtTime(s.stop)}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                        <button className='btn btn-start' onClick={() => markPlanned(s.id,true,pm.reason||PLANNED_REASONS[0])}>✓ Mark Planned</button>
                        <button className='btn btn-stop' onClick={() => markPlanned(s.id,false,'')}>✕ Mark Downtime</button>
                        <button className='ghost' onClick={() => setEditStop(null)}>Cancel</button>
                      </div>
                      {pm.planned && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {PLANNED_REASONS.map(r => (
                            <button key={r} className='ghost'
                              style={{ borderColor: pm.reason===r?'#3b82f6':'#1e3a5f', color: pm.reason===r?'#93c5fd':'#64748b' }}
                              onClick={() => markPlanned(s.id,true,r)}>{r}</button>
                          ))}
                          <div style={{ display: 'flex', gap: 8, width: '100%', marginTop: 6 }}>
                            <input type='text' placeholder='Custom reason…' value={customReason} onChange={e => setCustomReason(e.target.value)} style={{ flex: 1 }} />
                            <button className='ghost' onClick={() => { if(customReason.trim()) markPlanned(s.id,true,customReason.trim()) }}>Set</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )
          })()}

          {/* SETTINGS */}
          {view === 'settings' && (
            <div style={{ animation: 'fadeUp .3s ease', maxWidth: 480 }}>
              <div style={{ fontSize: 9, letterSpacing: 3, color: '#334155', marginBottom: 14 }}>OPERATOR LIST</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {operators.map(op => (
                  <div key={op} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0d1b2e', border: '1px solid #1e3a5f', borderRadius: 8, padding: '10px 14px' }}>
                    <span style={{ fontSize: 13 }}>{op}</span>
                    <button className='ghost' style={{ color: '#f87171', borderColor: '#7f1d1d' }} onClick={() => saveOperators(operators.filter(o => o !== op))}>Remove</button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
                <input type='text' placeholder='Operator name…' value={newOp} onChange={e => setNewOp(e.target.value)}
                  onKeyDown={e => { if(e.key==='Enter'&&newOp.trim()){ saveOperators([...operators,newOp.trim()]); setNewOp('') } }} style={{ flex: 1 }} />
                <button className='btn' style={{ background: '#1e3a5f', color: '#93c5fd', border: '1px solid #3b82f655' }}
                  onClick={() => { if(newOp.trim()){ saveOperators([...operators,newOp.trim()]); setNewOp('') } }}>+ Add</button>
              </div>

              <div style={{ background: '#0d1b2e', border: '1px solid #1e3a5f', borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 9, letterSpacing: 2, color: '#334155', marginBottom: 12 }}>ARDUINO ENDPOINT</div>
                <div style={{ fontSize: 12, lineHeight: 2.2, color: '#94a3b8' }}>
                  <span style={{ color: '#fbbf24' }}>POST</span>{' '}
                  <span style={{ color: '#34d399' }}>https://your-app.vercel.app/api/event</span><br />
                  <span style={{ color: '#64748b' }}>{`Content-Type: application/json`}</span><br />
                  <span style={{ color: '#64748b' }}>{`{ "type": "start", "machine": "line-2-case-packer" }`}</span><br />
                  <span style={{ color: '#64748b' }}>{`{ "type": "stop",  "machine": "line-2-case-packer" }`}</span>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
