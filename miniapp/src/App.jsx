import { useState, useEffect, useRef, useCallback } from 'react'
import { db } from './firebase'
import { doc, onSnapshot } from 'firebase/firestore'
import PaymentPage from './PaymentPage'
import RulesPage from './RulesPage'
import MarketTabs, { BYBIT } from './MarketTabs'
import { forexMarkets } from './signalEngine'
import { fetchSignal, checkBackendHealth } from './otcService'
import {
  loadMtgState, saveMtgState, recordTradeResult,
  computeDailyTarget, TARGET_PROFIT,
} from './compoundingEngine'

// ── Telegram WebApp ───────────────────────────────────────────
const tg = window.Telegram?.WebApp
if (tg) { tg.ready(); tg.expand() }

const getTgUser = () => {
  if (tg?.initDataUnsafe?.user) return tg.initDataUnsafe.user
  return { id: 12345, first_name: 'Test', last_name: '', username: 'testuser' }
}

const C = BYBIT // সংক্ষিপ্ত alias — সব জায়গায় Bybit প্যালেট ব্যবহার হবে

const socialBtnStyle = {
  flex: 1, padding: '9px 4px', borderRadius: 8,
  background: C.card, color: C.yellow,
  fontWeight: 700, fontSize: 10.5, border: `1px solid ${C.border}`,
  cursor: 'pointer',
}

const TRADE_SECONDS = 60          // 1-minute candle prediction
const FREE_DAILY_SIGNAL_LIMIT = 3
const RESULT_CHECK_DELAY_MS = (TRADE_SECONDS + 5) * 1000

// ── Social links (footer) ───────────────────────────────────────
const CHANNEL_LINK = 'https://t.me/ratulhossain4241'
const GROUP_LINK   = 'https://t.me/ratulhossain424'
const CHAT_LINK    = 'https://t.me/ratulhossain56'

// ── localStorage helper: ফ্রি-টায়ার দৈনিক সিগনাল কোটা ───────────
const localDateStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const getFreeUsage = () => {
  try {
    const raw = JSON.parse(localStorage.getItem('free_signal_usage'))
    const validShape = raw && raw.date === localDateStr() && Number.isFinite(raw.count) && raw.count >= 0
    if (validShape) return raw
  } catch (_) {}
  const fresh = { date: localDateStr(), count: 0 }
  localStorage.setItem('free_signal_usage', JSON.stringify(fresh))
  return fresh
}

const bumpFreeUsage = () => {
  const u = getFreeUsage()
  u.count += 1
  localStorage.setItem('free_signal_usage', JSON.stringify(u))
  return u
}

if (typeof window !== 'undefined') {
  window.__resetFreeSignals = () => {
    localStorage.removeItem('free_signal_usage')
    console.log('✅ ফ্রি সিগনাল কোটা রিসেট হয়েছে — পেজ রিলোড করুন')
  }
}

export default function App() {
  const tgUser = getTgUser()

  // ── Auth / Subscription ────────────────────────────────────────
  const [authStatus, setAuthStatus] = useState('loading')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [freeUsage, setFreeUsage] = useState(getFreeUsage())

  // ── Backend health ───────────────────────────────────────────
  const [backendOk, setBackendOk] = useState(null) // null=checking, true/false

  // ── Trading ───────────────────────────────────────────────────
  const [activeMarket, setActiveMarket] = useState('real') // 'real' | 'otc'
  const [selected, setSelected] = useState(forexMarkets[0])
  const [liveTime, setLiveTime] = useState('--:--:--')
  const [connStatus, setConnStatus] = useState('READY')
  const [sigData, setSigData] = useState({ direction: null, strength: 50, breakdown: {}, confidence: 0 })
  const [lastPred, setLastPred] = useState(null)
  const [scanning, setScanning] = useState(false)

  // ── Compounding / Martingale স্টেট (compoundingEngine.js থেকে) ──
  const [mtgState, setMtgState] = useState(loadMtgState())
  const [score, setScore] = useState(JSON.parse(localStorage.getItem('trade_score')) || { win: 0, loss: 0, profit: 0 })
  const [unlockTime, setUnlockTime] = useState(localStorage.getItem('unlock_time') || null)
  const [isLocked, setIsLocked] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const resultTimerRef = useRef(null)

  const dailyTarget = (() => {
    if (!localStorage.getItem('start_date')) localStorage.setItem('start_date', new Date().toISOString())
    return computeDailyTarget(localStorage.getItem('start_date'))
  })()

  const isPremium = authStatus === 'approved'

  // ── Firestore auth listener ───────────────────────────────────
  useEffect(() => {
    const uid = String(tgUser.id)
    if (!uid || uid === '0') { setAuthStatus('new'); return }

    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      if (!snap.exists()) { setAuthStatus('new'); return }
      const d = snap.data()
      if (d.status === 'approved') {
        const exp = d.expiresAt?.toDate?.()
        if (exp && exp < new Date()) setAuthStatus('expired')
        else setAuthStatus('approved')
      } else if (d.status === 'rejected') {
        setAuthStatus('rejected')
      } else if (d.status === 'disconnected') {
        setAuthStatus('expired')
      } else if (d.status === 'pending') {
        setAuthStatus('pending')
      } else {
        setAuthStatus('new')
      }
    }, (err) => {
      console.error('Firestore error:', err)
      setAuthStatus('new')
    })
    return () => unsub()
  }, [tgUser.id])

  // ── Backend health চেক (একবার, চালু হওয়ার সময়) ─────────────────
  useEffect(() => {
    checkBackendHealth().then((res) => setBackendOk(res.ok))
  }, [])

  // ── Clock + lock timer ──────────────────────────────────────
  useEffect(() => {
    const tick = setInterval(() => {
      const now = new Date()
      setLiveTime(now.toLocaleTimeString('en-GB'))
      if (unlockTime) {
        if (now < new Date(unlockTime)) setIsLocked(true)
        else { setIsLocked(false); setUnlockTime(null); localStorage.removeItem('unlock_time') }
      }
      setFreeUsage(getFreeUsage())
    }, 1000)
    return () => clearInterval(tick)
  }, [unlockTime])

  useEffect(() => () => { if (resultTimerRef.current) clearTimeout(resultTimerRef.current) }, [])

  // ── মার্কেট ট্যাব বদলালে বর্তমান সিগনাল ক্লিয়ার করা (Real আর OTC
  //    গুলিয়ে না যায়) ──────────────────────────────────────────
  useEffect(() => {
    setSigData({ direction: null, strength: 50, breakdown: {}, confidence: 0 })
    setLastPred(null)
  }, [activeMarket])

  // ── সিগনাল জেনারেট করা ─────────────────────────────────────────
  const generateSignal = useCallback(async () => {
    if (isLocked) return
    if (!backendOk) { setConnStatus('সার্ভার সংযোগ নেই ❌'); return }

    if (!isPremium) {
      const fu = getFreeUsage()
      if (fu.count >= FREE_DAILY_SIGNAL_LIMIT) {
        setConnStatus('ফ্রি লিমিট শেষ ❌')
        setShowPaymentModal(true)
        return
      }
    }

    setScanning(true)
    setConnStatus('ডেটা আনা হচ্ছে...')

    try {
      const result = await fetchSignal(selected.td, activeMarket)
      setSigData(result)
      setConnStatus('CONNECTED ✅')

      if (!isPremium) setFreeUsage(bumpFreeUsage())

      if (result.direction) {
        setLastPred(result.direction)
        try { new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play() } catch (_) {}

        if (resultTimerRef.current) clearTimeout(resultTimerRef.current)
        resultTimerRef.current = setTimeout(() => { checkResult(result.direction) }, RESULT_CHECK_DELAY_MS)
      }
    } catch (e) {
      console.error(e)
      setConnStatus(`ERROR: ${e.message} ❌`)
    } finally {
      setScanning(false)
    }
  }, [selected, activeMarket, isLocked, backendOk, isPremium]) // eslint-disable-line

  // ── রেজাল্ট চেক (একটা নির্দিষ্ট সময় পর একবার) ───────────────────
  const checkResult = useCallback(async (predDirection) => {
    try {
      // ⚠️ lastCandle ফিল্ডটা routes/otcSignal.js-এ একটা ছোট প্যাচের
      // মাধ্যমে যোগ করতে হবে (open/close সহ) — এই ফাইলের সাথে সেটাও
      // আলাদাভাবে দেওয়া হবে। আপাতত এই কল আবার fetchSignal ব্যবহার করছে।
      const fresh = await fetchSignal(selected.td, activeMarket)
      const lastCandle = fresh.lastCandle

      if (!lastCandle) {
        console.warn('⚠️ lastCandle ডেটা পাওয়া যায়নি — routes/otcSignal.js প্যাচ করা হয়েছে কিনা চেক করো')
        setLastPred(null)
        return
      }

      const actual = parseFloat(lastCandle.close) > parseFloat(lastCandle.open) ? 'CALL' : 'PUT'
      const isWin = predDirection === actual

      // ── Compounding Engine দিয়ে স্কোর ও পরের ট্রেড এমাউন্ট আপডেট ──
      const { newState, profitChange, maxStepsReached } = recordTradeResult(mtgState, isWin)
      setMtgState(newState)
      saveMtgState(newState)

      setScore(prev => {
        const updated = {
          win: isWin ? prev.win + 1 : prev.win,
          loss: isWin ? prev.loss : prev.loss + 1,
          profit: parseFloat((prev.profit + profitChange).toFixed(2)),
        }
        localStorage.setItem('trade_score', JSON.stringify(updated))
        if (updated.profit >= dailyTarget) {
          const lock = new Date(Date.now() + 12 * 3600 * 1000).toISOString()
          setUnlockTime(lock); localStorage.setItem('unlock_time', lock)
        }
        return updated
      })

      if (maxStepsReached) {
        setConnStatus('⚠️ ৫ ধাপ রিকভারি শেষ — নতুন করে শুরু হলো')
      }

      setLastPred(null)
      setSigData(prev => ({ direction: null, strength: prev.strength, breakdown: prev.breakdown, confidence: prev.confidence }))
    } catch (e) {
      console.error('checkResult error:', e)
    }
  }, [selected, activeMarket, mtgState, dailyTarget])

  // ── Loading screen ────────────────────────────────────────────
  if (authStatus === 'loading') {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 32 }}>💹</div>
        <div style={{ color: C.textMuted, fontSize: 13 }}>লোড হচ্ছে...</div>
      </div>
    )
  }

  const dir = sigData.direction
  const str = sigData.strength
  const conf = sigData.confidence
  const isCall = dir === 'CALL'
  const isPut = dir === 'PUT'
  const sigColor = isCall ? C.green : isPut ? C.red : C.textMuted
  const sigLabel =
    scanning ? '⟳  স্ক্যান হচ্ছে...' :
    isCall ? '▲  CALL  (UP)' :
    isPut ? '▼  PUT  (DOWN)' :
    lastPred ? '⏳  রেজাল্ট আসছে...' :
    '—  সিগনাল জেনারেট করুন'

  const handleReset = () => {
    if (!window.confirm('স্কোর রিসেট করবেন?')) return
    const e = { win: 0, loss: 0, profit: 0 }
    setScore(e)
    localStorage.removeItem('trade_score')
    localStorage.removeItem('start_date')
    localStorage.removeItem('mtg_state')
    setMtgState(loadMtgState())
  }

  const freeRemaining = Math.max(0, FREE_DAILY_SIGNAL_LIMIT - freeUsage.count)

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "'Inter',sans-serif", minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── HEADER ── */}
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 14px', background: C.card, borderBottom: `1px solid ${C.border}`,
        fontSize: 11, fontWeight: 700, gap: 6,
      }}>
        <span style={{ color: connStatus.includes('✅') ? C.green : connStatus.includes('❌') ? C.red : C.yellow, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {connStatus}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {isPremium ? (
            <span style={{ color: C.yellow, fontWeight: 900, fontSize: 13, letterSpacing: '0.02em' }}>💎★★★★★</span>
          ) : (
            <button onClick={() => setShowPaymentModal(true)} style={{
              background: `linear-gradient(90deg, ${C.yellow}, #ffd76a)`, color: '#000',
              border: 'none', borderRadius: 6, padding: '4px 10px', fontWeight: 800, fontSize: 11, cursor: 'pointer',
            }}>⬆️ Upgrade</button>
          )}

          <button onClick={() => setShowRules(true)} aria-label="Rules" style={{
            background: C.card, border: `1px solid ${C.border}`, color: C.yellow,
            borderRadius: 6, padding: '4px 8px', fontSize: 13, cursor: 'pointer', lineHeight: 1,
          }}>📜</button>
        </div>

        <span style={{ color: C.textMuted, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{liveTime}</span>
      </header>

      {/* ── SUB-HEADER ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 14px', background: C.bgSecondary, borderBottom: `1px solid ${C.border}`,
        fontSize: 10.5,
      }}>
        <span style={{ color: C.yellow, fontWeight: 700 }}>🎯 লক্ষ্য: ৳{dailyTarget}</span>
        {isPremium ? (
          <span style={{ color: C.green, fontWeight: 700 }}>✅ প্রিমিয়াম সক্রিয় — আনলিমিটেড</span>
        ) : (
          <span style={{ color: freeRemaining === 0 ? C.red : C.textMuted, fontWeight: 700 }}>
            🆓 ফ্রি সিগনাল বাকি: {freeRemaining}/{FREE_DAILY_SIGNAL_LIMIT}
          </span>
        )}
      </div>

      {backendOk === false && (
        <div style={{ background: '#2a0000', borderBottom: `1px solid ${C.red}33`, color: C.red, fontSize: 11, padding: '8px 14px', textAlign: 'center' }}>
          ⚠️ ব্যাকএন্ড সার্ভারে সংযোগ করা যাচ্ছে না — একটু পর আবার চেষ্টা করো
        </div>
      )}
      {authStatus === 'pending' && (
        <div style={{ background: '#1a1200', borderBottom: `1px solid ${C.yellow}33`, color: C.yellow, fontSize: 11, padding: '8px 14px', textAlign: 'center' }}>
          ⏳ আপনার পেমেন্ট রিভিউতে আছে
        </div>
      )}
      {authStatus === 'rejected' && (
        <div style={{ background: '#2a0000', borderBottom: `1px solid ${C.red}33`, color: C.red, fontSize: 11, padding: '8px 14px', textAlign: 'center' }}>
          ❌ আপনার আগের পেমেন্ট রিজেক্ট হয়েছে
        </div>
      )}
      {authStatus === 'expired' && (
        <div style={{ background: '#1a1200', borderBottom: `1px solid ${C.yellow}33`, color: C.yellow, fontSize: 11, padding: '8px 14px', textAlign: 'center' }}>
          ⚠️ প্রিমিয়াম মেয়াদ শেষ — ফ্রি টায়ারে ফিরিয়ে আনা হয়েছে
        </div>
      )}

      {/* ── CHART ── */}
      <div style={{ height: '32vh', background: C.bgSecondary }}>
        <iframe
          key={selected.td}
          src={`https://s.tradingview.com/widgetembed/?symbol=${selected.tv}&theme=dark&hide_top_toolbar=1&save_image=0`}
          width="100%" height="100%" style={{ border: 'none', display: 'block' }}
          title="chart"
        />
      </div>

      {/* ── SCORE ROW ── */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 12px 0' }}>
        {[
          { l: 'WIN', v: score.win, c: C.green },
          { l: 'LOSS', v: score.loss, c: C.red },
          { l: 'PROFIT', v: `৳${score.profit}`, c: C.yellow },
        ].map(x => (
          <div key={x.l} style={{
            flex: 1, padding: '9px 4px', borderRadius: 8, textAlign: 'center',
            background: C.card, border: `1px solid ${x.c}22`,
            color: x.c, fontSize: 11, fontWeight: 800,
          }}>
            <div style={{ color: C.textMuted, fontSize: 9, marginBottom: 3 }}>{x.l}</div>
            {x.v}
          </div>
        ))}
        <button onClick={handleReset} style={{
          padding: '0 10px', borderRadius: 8, background: C.card,
          border: `1px solid ${C.border}`, color: C.textMuted, fontSize: 11, cursor: 'pointer',
        }}>↺</button>
      </div>

      {/* ── MAIN ── */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {isLocked ? (
          <div style={{
            background: `${C.yellow}14`, border: `2px solid ${C.yellow}`,
            borderRadius: 14, padding: '28px 20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
            <div style={{ color: C.yellow, fontWeight: 800, fontSize: 18 }}>লক্ষ্য অর্জিত!</div>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 6 }}>
              আনলক: {new Date(unlockTime).toLocaleTimeString()}
            </div>
          </div>
        ) : (
          <>
            {/* ── MARKET TABS (Real / OTC) ── */}
            <MarketTabs activeMarket={activeMarket} onChange={setActiveMarket} />

            {/* ── SIGNAL CARD ── */}
            <div style={{
              borderRadius: 14, padding: '16px', background: C.card,
              border: `2px solid ${isCall ? C.green : isPut ? C.red : C.border}`,
              boxShadow: isCall ? `0 0 24px ${C.green}33` : isPut ? `0 0 24px ${C.red}33` : 'none',
              transition: 'all 0.4s',
            }}>
              <div style={{ textAlign: 'center', fontSize: 20, fontWeight: 900, color: sigColor, marginBottom: 10, letterSpacing: '0.04em' }}>
                {sigLabel}
              </div>

              {dir && (
                <div style={{ textAlign: 'center', marginBottom: 10 }}>
                  <span style={{
                    background: conf >= 80 ? `${C.green}22` : `${C.yellow}22`,
                    color: conf >= 80 ? C.green : C.yellow,
                    border: `1px solid ${conf >= 80 ? C.green : C.yellow}55`,
                    borderRadius: 20, padding: '3px 14px', fontSize: 11, fontWeight: 700,
                  }}>{conf}% কনফিডেন্স</span>
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: C.textMuted, marginBottom: 3 }}>
                  <span>PUT ↓</span>
                  <span style={{ color: C.yellow, fontWeight: 700 }}>শক্তি {str}%</span>
                  <span>↑ CALL</span>
                </div>
                <div style={{ height: 7, borderRadius: 4, background: C.bgSecondary, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.max(0, 50 - str)}%`, background: str <= 35 ? C.red : `${C.red}44`, borderRadius: '4px 0 0 4px', transition: 'width 0.5s' }} />
                  <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${Math.max(0, str - 50)}%`, background: str >= 65 ? C.green : `${C.green}44`, borderRadius: '0 4px 4px 0', transition: 'width 0.5s' }} />
                  <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: C.border, transform: 'translateX(-50%)' }} />
                </div>
              </div>

              {/* ── ইন্ডিকেটর ব্রেকডাউন — সবসময় দেখাবে, ১১টাই ── */}
              {Object.keys(sigData.breakdown).length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 6px', marginBottom: 8 }}>
                  {Object.entries(sigData.breakdown).map(([k, v]) => (
                    <div key={k} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      fontSize: 9.5, padding: '5px 7px', borderRadius: 5, background: C.bgSecondary,
                      overflow: 'hidden', gap: 4,
                    }}>
                      <span style={{ color: C.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k}</span>
                      <span style={{
                        color: v.includes('BULL') ? C.green : v.includes('BEAR') ? C.red : C.textMuted,
                        fontWeight: 700, whiteSpace: 'nowrap', fontSize: 9,
                      }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}

              {mtgState.step > 0 && (
                <div style={{ textAlign: 'center', fontSize: 11, color: C.yellow, fontWeight: 700 }}>
                  💰 রিকভারি ধাপ {mtgState.step}/5 — পরের ট্রেড: ৳{mtgState.currentTrade}
                </div>
              )}
            </div>

            {/* ── MARKET SELECT ── */}
            <select value={selected.td} onChange={e => setSelected(forexMarkets.find(m => m.td === e.target.value))}
              style={{ padding: '11px 12px', borderRadius: 8, background: C.card, color: C.text, border: `1px solid ${C.border}`, fontSize: 12 }}>
              {['Major', 'Cross', 'Exotic'].map(cat => (
                <optgroup key={cat} label={cat}>
                  {forexMarkets.filter(m => m.cat === cat).map(m => (
                    <option key={m.td} value={m.td}>{m.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>

            {/* ── ACTION BUTTONS ── */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={generateSignal}
                disabled={scanning || backendOk === false}
                style={{
                  flex: 2, padding: '14px', borderRadius: 8, fontWeight: 800, fontSize: 13,
                  border: 'none', cursor: scanning || backendOk === false ? 'not-allowed' : 'pointer',
                  background: scanning ? C.card : C.green,
                  color: scanning ? C.textMuted : '#000',
                  opacity: backendOk === false ? 0.5 : 1,
                  transition: '0.2s',
                }}>
                {scanning ? '⟳ স্ক্যান হচ্ছে...' : `🔍 সিগনাল জেনারেট (${activeMarket === 'real' ? 'Real' : 'OTC'})`}
              </button>
              <button onClick={() => setShowSettings(s => !s)} style={{
                flex: 1, padding: '14px', borderRadius: 8, background: C.card,
                color: C.yellow, fontWeight: 700, fontSize: 12,
                border: `1px solid ${C.border}`, cursor: 'pointer',
              }}>⚙️</button>
            </div>

            {/* ── SETTINGS PANEL ── */}
            {showSettings && (
              <div style={{ background: C.card, borderRadius: 12, padding: 14, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                  ℹ️ সিস্টেম স্ট্যাটাস
                </div>
                <div style={{ fontSize: 12, color: backendOk ? C.green : C.red, marginBottom: 6 }}>
                  ব্যাকএন্ড: {backendOk === null ? 'চেক হচ্ছে...' : backendOk ? '🟢 সংযুক্ত' : '🔴 সংযোগ নেই'}
                </div>
                <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.6 }}>
                  প্রতি সাইকেলের টার্গেট প্রফিট: ৳{TARGET_PROFIT}<br />
                  রিকভারি স্টেপ: {mtgState.step}/5 {mtgState.step > 0 && `(cumulative loss: ৳${mtgState.cumulativeLoss})`}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── SOCIAL FOOTER ── */}
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button onClick={() => window.open(CHANNEL_LINK, '_blank')} style={socialBtnStyle}>📢 চ্যানেল</button>
          <button onClick={() => window.open(GROUP_LINK, '_blank')} style={socialBtnStyle}>👥 গ্রুপ</button>
          <button onClick={() => window.open(CHAT_LINK, '_blank')} style={socialBtnStyle}>💬 চ্যাট</button>
        </div>
      </div>

      {/* ── MODALS ── */}
      {showPaymentModal && (
        <PaymentPage tgUser={tgUser} status={authStatus} onClose={() => setShowPaymentModal(false)} />
      )}
      {showRules && <RulesPage onClose={() => setShowRules(false)} />}

    </div>
  )
  }
