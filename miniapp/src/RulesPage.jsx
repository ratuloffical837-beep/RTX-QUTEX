import { useState } from 'react'
import { BYBIT as C } from './MarketTabs'
import {
  PAYOUT_RATE, BASE_TRADE, TARGET_PROFIT, MAX_MTG_STEPS,
  computeNextTradeAmount, computeWorstCaseLoss,
} from './compoundingEngine'

// ═══════════════════════════════════════════════════════════════
//  RulesPage — এখন compoundingEngine.js থেকে সরাসরি constant ও
//  formula import করছে (আগে এই ফাইলেই আলাদাভাবে ডুপ্লিকেট করা ছিল)।
//  এর মানে RulesPage-এ যে হিসাব দেখানো হয়, App.jsx-এর লাইভ ট্রেডিং
//  ঠিক একই হিসাব ব্যবহার করে — দুই জায়গায় সংখ্যা কখনো মিসম্যাচ হবে না।
// ═══════════════════════════════════════════════════════════════

const START_BALANCE = 5000

// ── MTG 5-Step WIN scenario ──────────────────────────────────────
const genMtgWinSteps = () => {
  const rows = []
  let balance = START_BALANCE
  for (let step = 1; step <= MAX_MTG_STEPS; step++) {
    const gain = Math.round(BASE_TRADE * PAYOUT_RATE)
    balance += gain
    rows.push({ step, trade: BASE_TRADE, gain, balance })
  }
  return rows
}
const mtgWinSteps = genMtgWinSteps()

// ── MTG Recovery scenario (compoundingEngine-এর ফর্মুলা ব্যবহার করে) ──
const genMtgRecoverySteps = () => {
  const rows = []
  let cumulativeLoss = 0
  let trade = BASE_TRADE

  for (let step = 1; step <= MAX_MTG_STEPS; step++) {
    const prevBalance = START_BALANCE - cumulativeLoss
    const winGain = +(trade * PAYOUT_RATE).toFixed(2)
    const winBalance = +(prevBalance + winGain).toFixed(2)
    const lossBalance = +(prevBalance - trade).toFixed(2)

    cumulativeLoss += trade
    const nextTrade = step < MAX_MTG_STEPS ? computeNextTradeAmount(cumulativeLoss) : null

    rows.push({ step, trade, prevBalance, winGain, winBalance, lossBalance, nextTrade })
    trade = nextTrade
  }
  return rows
}
const mtgRecoverySteps = genMtgRecoverySteps()
const worstCaseLoss = computeWorstCaseLoss()
const worstCaseBalance = START_BALANCE - worstCaseLoss

// ── 30-Day Compounding data ──────────────────────────────────────
const genCompounding = () => {
  const rows = []
  let bal = 5000
  for (let day = 1; day <= 30; day++) {
    const target = +(bal * 0.10).toFixed(2)
    const end = +(bal + target).toFixed(2)
    rows.push({ day, start: bal, target, end })
    bal = end
  }
  return rows
}
const compoundRows = genCompounding()
const finalBalance = compoundRows[compoundRows.length - 1].end

export default function RulesPage({ onClose = () => {} }) {
  const [tab, setTab] = useState('disclaimer')

  return (
    <div style={{
      position: 'fixed', inset: 0, background: C.bg, zIndex: 999,
      overflowY: 'auto', WebkitOverflowScrolling: 'touch',
    }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: C.card, borderBottom: `1px solid ${C.border}`,
        padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: C.yellow }}>📜 রুল্স ও গাইড</div>
        <button onClick={onClose} style={{
          background: C.bgSecondary, border: `1px solid ${C.border}`, color: C.textMuted,
          borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer',
        }}>✕ বন্ধ</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '12px 12px 0' }}>
        {[
          { key: 'disclaimer', label: '⚠️ নিয়মাবলী' },
          { key: 'mtg', label: `🎯 ${MAX_MTG_STEPS}-Step MTG` },
          { key: 'compounding', label: '📈 30 Day Plan' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '10px 6px', borderRadius: 8, fontSize: 11, fontWeight: 700,
            cursor: 'pointer',
            background: tab === t.key ? `${C.yellow}22` : C.card,
            color: tab === t.key ? C.yellow : C.textMuted,
            border: tab === t.key ? `2px solid ${C.yellow}` : `1px solid ${C.border}`,
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: 14 }}>

        {/* ══════════ DISCLAIMER TAB ══════════ */}
        {tab === 'disclaimer' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            <div style={{ ...s.card, textAlign: 'center', border: `1px solid ${C.yellow}44` }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.yellow }}>
                بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>বিসমিল্লাহির রাহমানির রাহিম</div>
            </div>

            <div style={{ ...s.card, border: `1px solid ${C.red}55` }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.red, marginBottom: 8 }}>
                ⚠️ ঝুঁকি সম্পর্কিত সতর্কতা
              </div>
              <ul style={s.ul}>
                <li>ট্রেডিং (ফরেক্স/বাইনারি) একটি <b style={{ color: C.red }}>উচ্চ-ঝুঁকিপূর্ণ</b> কার্যক্রম। এখানে টাকা হারানোর সম্ভাবনা সবসময় থাকে।</li>
                <li>এই অ্যাপের সিগনাল কোনো নিশ্চিত লাভের গ্যারান্টি না — এটি একটি সহায়ক টুল মাত্র, বিশেষজ্ঞ পরামর্শ না।</li>
                <li>OTC মার্কেটের দাম ব্রোকারের নিজস্ব সিস্টেম দিয়ে জেনারেট হয় — এটি বাইরের কোনো রিয়েল মার্কেটের সাথে সরাসরি সম্পর্কিত না।</li>
                <li>আপনি যা বিনিয়োগ করছেন তা সম্পূর্ণ হারানোর সম্ভাবনা মেনে নিয়েই ট্রেড করুন।</li>
                <li>নিজের আর্থিক সিদ্ধান্তের দায়ভার সম্পূর্ণ আপনার নিজের — এই অ্যাপ, এর ডেভেলপার বা সিগনাল কোনো ক্ষতির দায় নেবে না।</li>
              </ul>
            </div>

            <div style={{ ...s.card, border: `1px solid ${C.yellow}55` }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.yellow, marginBottom: 8 }}>
                💰 মানি ম্যানেজমেন্ট — সাধারণ নীতি
              </div>
              <ul style={s.ul}>
                <li>প্রতি ট্রেডে মোট ব্যালেন্সের মাত্র ১-২% ঝুঁকি নিন।</li>
                <li>একদিনে সর্বোচ্চ ৩-৫টি ট্রেডের বেশি না করাই ভালো।</li>
                <li>লাভ বা লস — কোনোটাতেই আবেগের বশে সিদ্ধান্ত বদলাবেন না।</li>
                <li>পরিকল্পনামতো ট্রেড করুন, আল্লাহর উপর ভরসা রাখুন — ফলাফল সবসময় আল্লাহর হাতে।</li>
              </ul>
            </div>

            <div style={{ ...s.card, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.yellow, marginBottom: 8 }}>
                🎯 মার্টিঙ্গেল (রিকভারি ট্রেড) নিয়ে বিশেষ সতর্কতা
              </div>
              <ul style={s.ul}>
                <li>মার্টিঙ্গেল সিস্টেমে প্রতিটা লসের পর পরের ট্রেডের এমাউন্ট এমনভাবে বাড়ানো হয় যাতে WIN হলে আগের লস কভার হয়ে সামান্য লাভও থাকে, ইনশাআল্লাহ।</li>
                <li>কিন্তু <b style={{ color: C.red }}>টানা লস চলতে থাকলে</b> রিকভারি ট্রেডের পরিমাণ দ্রুত অনেক বড় হয়ে যায় — {MAX_MTG_STEPS} ধাপের পরেও লস চললে ব্যালেন্সের বড় অংশ চলে যেতে পারে।</li>
                <li>এই অ্যাপে {MAX_MTG_STEPS} ধাপ শেষে সিস্টেম স্বয়ংক্রিয়ভাবে সাইকেল বন্ধ করে দেয় — কখনো নিজে থেকে এমাউন্ট বাড়িয়ে জোর করে চালিয়ে যাবেন না।</li>
              </ul>
            </div>

          </div>
        )}

        {/* ══════════ MTG STEP TAB ══════════ */}
        {tab === 'mtg' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            <div style={{ ...s.card, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: C.yellow, marginBottom: 4 }}>بِسْمِ اللَّهِ — আল্লাহর নামে শুরু</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: C.yellow }}>MTG {MAX_MTG_STEPS}-STEP RECOVERY METHOD</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6, lineHeight: 1.6 }}>
                নিয়ম: লস না হলে রিকভারি ট্রেড নয়, লাভ হলে ৳{BASE_TRADE} কন্টিনিউ।
                লস হলে পরের ট্রেড এমন এমাউন্টে করা হয় যাতে WIN হলে আগের লস কভার হয়ে
                লাভে ফিরে আসবে, ইনশাআল্লাহ। — এই একই ফর্মুলা অ্যাপের লাইভ স্কোরেও ব্যবহার হয়।
              </div>
              <div style={{ marginTop: 10, background: C.bgSecondary, borderRadius: 8, padding: '8px 12px', display: 'inline-block' }}>
                <span style={{ fontSize: 11, color: C.textMuted }}>START BALANCE: </span>
                <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>৳{START_BALANCE.toLocaleString()}</span>
              </div>
            </div>

            <div style={s.card}>
              <div style={{ ...s.sectionLabel, color: C.green }}>✅ লাভের ক্ষেত্রে (Win Scenario)</div>
              <TableHead cols={['ধাপ', 'ট্রেড (৳)', 'রেজাল্ট', 'পরের ব্যালেন্স']} />
              {mtgWinSteps.map(r => (
                <TableRow key={r.step} cells={[r.step, `৳${r.trade}`, <span style={{ color: C.green }}>WIN ✅</span>, `৳${r.balance}`]} />
              ))}
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8, lineHeight: 1.7 }}>
                • প্রতিটি ট্রেডে {Math.round(PAYOUT_RATE * 100)}% লাভ এবং ৳{BASE_TRADE} কন্টিনিউ করলে {MAX_MTG_STEPS}টি ট্রেড শেষে ব্যালেন্স:{' '}
                <b style={{ color: C.green }}>৳{mtgWinSteps[mtgWinSteps.length - 1].balance}</b> — আলহামদুলিল্লাহ।
              </div>
            </div>

            <div style={s.card}>
              <div style={{ ...s.sectionLabel, color: C.red }}>🔁 লস হলে রিকভারি ট্রেড (Loss → Recovery Scenario)</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10, lineHeight: 1.7 }}>
                প্রতিটা ধাপ ধরে নিচ্ছে যে এর আগের সব ধাপ LOSS হয়েছে। প্রতিটা ধাপের ট্রেড
                এমাউন্ট এমনভাবে বসানো হয়েছে যাতে ওই ধাপে <b style={{ color: C.green }}>WIN</b> হলে —
                আগের সব লস কভার হয়ে প্রায় ৳{TARGET_PROFIT} লাভ থেকে যায় ({Math.round(PAYOUT_RATE * 100)}% পে-আউট ধরে), ইনশাআল্লাহ।
                আবার <b style={{ color: C.red }}>LOSS</b> হলে ব্যালেন্স ও পরের রিকভারি ট্রেড এমাউন্ট দেখানো হয়েছে।
              </div>

              {mtgRecoverySteps.map((r, idx) => (
                <div key={r.step} style={{
                  marginBottom: idx === mtgRecoverySteps.length - 1 ? 0 : 14,
                  paddingBottom: idx === mtgRecoverySteps.length - 1 ? 0 : 14,
                  borderBottom: idx === mtgRecoverySteps.length - 1 ? 'none' : `1px solid ${C.border}55`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: C.text }}>
                      ধাপ {r.step} — ট্রেড ৳{r.trade.toLocaleString()}
                    </span>
                    <span style={{ fontSize: 10.5, color: C.textMuted }}>
                      (আগের ব্যালেন্স ৳{r.prevBalance.toLocaleString()})
                    </span>
                  </div>

                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: `${C.green}14`, border: `1px solid ${C.green}33`,
                    borderRadius: 8, padding: '7px 10px', marginBottom: 6,
                  }}>
                    <span style={{ fontSize: 11.5, color: C.green, fontWeight: 700 }}>✅ WIN হলে (লস কভার + লাভ)</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.green }}>৳{Math.round(r.winBalance).toLocaleString()}</span>
                  </div>

                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: `${C.red}14`, border: `1px solid ${C.red}33`,
                    borderRadius: 8, padding: '7px 10px',
                  }}>
                    <span style={{ fontSize: 11.5, color: C.red, fontWeight: 700 }}>❌ LOSS হলে</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.red }}>৳{Math.round(r.lossBalance).toLocaleString()}</span>
                  </div>

                  {r.nextTrade && (
                    <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 6, textAlign: 'right' }}>
                      → LOSS হলে পরের রিকভারি ট্রেড: <b style={{ color: C.yellow }}>৳{r.nextTrade.toLocaleString()}</b>
                    </div>
                  )}
                  {!r.nextTrade && (
                    <div style={{ fontSize: 10.5, color: C.red, marginTop: 6, textAlign: 'right', fontWeight: 700 }}>
                      ⚠️ {MAX_MTG_STEPS} ধাপ শেষ — এরপর অ্যাপ স্বয়ংক্রিয়ভাবে সাইকেল বন্ধ করে নতুন করে শুরু করবে
                    </div>
                  )}
                </div>
              ))}

              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 12, lineHeight: 1.7, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                • যেকোনো ধাপে WIN হলেই আগের সব লস কভার হয়ে ৳{TARGET_PROFIT}-এর কাছাকাছি লাভ নিয়ে
                চক্র শেষ হয়ে যাবে, ইনশাআল্লাহ। আলহামদুলিল্লাহ বলে নতুন করে ৳{BASE_TRADE} দিয়ে আবার শুরু করা যায়।<br />
                • কিন্তু {MAX_MTG_STEPS} ধাপ ধারাবাহিকভাবে LOSS হলে চূড়ান্ত ব্যালেন্স:{' '}
                <b style={{ color: C.red }}>৳{Math.round(worstCaseBalance).toLocaleString()}</b>{' '}
                (মোট লস ৳{Math.round(worstCaseLoss).toLocaleString()}) — এটাই এই কৌশলের সবচেয়ে বড় ঝুঁকি,
                তাই কখনোই এমাউন্ট বাড়িয়ে জোর করে চালিয়ে যাবেন না।
              </div>
            </div>

          </div>
        )}

        {/* ══════════ 30-DAY COMPOUNDING TAB ══════════ */}
        {tab === 'compounding' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            <div style={{ ...s.card, textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: C.yellow }}>30 DAYS COMPOUNDING PLAN</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>মানি ও রিস্ক ম্যানেজমেন্ট সহ — আল্লাহ ভরসা</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <Badge label="স্টার্ট" value="৳5,000" color={C.blue || '#60a5fa'} />
                <Badge label="দৈনিক টার্গেট" value="10%" color={C.green} />
                <Badge label="রিস্ক/ট্রেড" value="1-2%" color={C.yellow} />
              </div>
            </div>

            <div style={{ ...s.card, border: `1px solid ${C.yellow}44` }}>
              <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.7 }}>
                <b style={{ color: C.text }}>ফর্মুলা:</b> পরের দিনের ব্যালেন্স = আজকের ব্যালেন্স × ১.১০
                <br />
                <span style={{ color: C.red }}>⚠️ এই হিসাব ধরে নিচ্ছে প্রতিদিন লাভ হবে, কোনো লস দিন থাকবে না — বাস্তবে এটি নিশ্চিত না। এটি একটি হাইপোথেটিক্যাল (সম্ভাব্য) উদাহরণ মাত্র, প্রতিশ্রুতি না।</span>
              </div>
            </div>

            <div style={s.card}>
              <div style={s.sectionLabel}>দৈনিক ব্যালেন্স টেবিল</div>
              <TableHead cols={['দিন', 'শুরুর ব্যালেন্স', 'টার্গেট (10%)', 'শেষ ব্যালেন্স']} small />
              <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                {compoundRows.map(r => (
                  <TableRow key={r.day}
                    small
                    cells={[r.day, `৳${r.start.toLocaleString()}`, `৳${r.target.toLocaleString()}`, <b style={{ color: C.green }}>৳{r.end.toLocaleString()}</b>]}
                  />
                ))}
              </div>
            </div>

            <div style={{ ...s.card, textAlign: 'center', border: `1px solid ${C.green}55` }}>
              <div style={{ fontSize: 11, color: C.textMuted }}>৩০ দিন পর (হাইপোথেটিক্যাল)</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: C.green, margin: '4px 0' }}>
                ৳{finalBalance.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: C.yellow }}>
                সম্ভাব্য লাভ: ৳{(finalBalance - 5000).toLocaleString()} (যদি প্রতিদিন লাভ হয়) — আলহামদুলিল্লাহ
              </div>
            </div>

            <div style={{ ...s.card, border: `1px solid ${C.border}` }}>
              <div style={{ ...s.sectionLabel, color: C.yellow }}>রিস্ক ম্যানেজমেন্ট প্ল্যান</div>
              <ul style={s.ul}>
                <li>SL (Stop Loss) ব্যবহার করুন</li>
                <li>RR (Risk:Reward) কমপক্ষে 1:2 রাখুন</li>
                <li>আবেগ দিয়ে না, পরিকল্পনা দিয়ে ট্রেড করুন</li>
                <li>নিজের ট্রেডিং সময় অতিরিক্ত না নেওয়াই ভালো</li>
                <li>প্রতিটা ট্রেডের আগে বিসমিল্লাহ বলে শুরু করুন, ফলাফল আল্লাহর হাতে ছেড়ে দিন</li>
              </ul>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}

// ── Small sub-components ────────────────────────────────────────
function TableHead({ cols, small }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${cols.length}, 1fr)`,
      gap: 4, marginBottom: 6, paddingBottom: 6, borderBottom: `1px solid ${C.border}`,
    }}>
      {cols.map((c, i) => (
        <div key={i} style={{ fontSize: small ? 9 : 10, color: C.textMuted, fontWeight: 700, textAlign: i === 0 ? 'left' : 'center' }}>{c}</div>
      ))}
    </div>
  )
}

function TableRow({ cells, small }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
      gap: 4, padding: small ? '5px 0' : '7px 0', borderBottom: `1px solid ${C.border}33`,
    }}>
      {cells.map((c, i) => (
        <div key={i} style={{ fontSize: small ? 10.5 : 12, color: C.text, textAlign: i === 0 ? 'left' : 'center' }}>{c}</div>
      ))}
    </div>
  )
}

function Badge({ label, value, color }) {
  return (
    <div style={{ background: C.bgSecondary, borderRadius: 8, padding: '6px 12px', border: `1px solid ${color}44` }}>
      <div style={{ fontSize: 9, color: C.textMuted }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────
const s = {
  card: {
    background: C.card, borderRadius: 12, padding: 14,
    border: `1px solid ${C.border}`,
  },
  sectionLabel: {
    fontSize: 10, color: C.textMuted, fontWeight: 700,
    letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10,
  },
  ul: {
    margin: 0, paddingLeft: 18, fontSize: 12, color: C.text,
    lineHeight: 1.9, display: 'flex', flexDirection: 'column', gap: 4,
  },
    }
