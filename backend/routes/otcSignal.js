/**
 * ═══════════════════════════════════════════════════════════════
 *  RTX EARN — Route: /api/signal  (আপডেটেড ভার্সন — v2)
 *
 *  ⚠️ এটা আগের routes/otcSignal.js-এর প্যাচড ভার্সন। শুধু একটা
 *  পরিবর্তন হয়েছে: রেসপন্সে এখন `lastCandle: { open, close }` যোগ
 *  করা হয়েছে, যেটা miniapp/src/App.jsx-এর checkResult() ফাংশন
 *  ব্যবহার করে বোঝে যে predicted CALL/PUT আসলে সঠিক হয়েছিল কিনা
 *  (শেষ closed candle-এর open vs close তুলনা করে)।
 *
 *  এই ফাইলটা তোমার আগের routes/otcSignal.js-কে সম্পূর্ণ replace করবে —
 *  পুরনোটা মুছে এটা একই জায়গায় (routes/otcSignal.js নামে) বসাও।
 * ═══════════════════════════════════════════════════════════════
 */

const express = require('express')
const router = express.Router()

let runSignalEngine, MIN_CANDLES
try {
  ;({ runSignalEngine, MIN_CANDLES } = require('../signalEngine'))
} catch (e) {
  console.warn('⚠️ ../signalEngine.js এখনো তৈরি হয়নি — /api/signal রুট কাজ করবে না:', e.message)
}

const QUOTEX_SERVICE_URL = process.env.QUOTEX_SERVICE_URL
const SERVICE_API_KEY = process.env.SERVICE_API_KEY

const CACHE_TTL_MS = 5000
const cache = new Map() // key: "symbol:market" → { data, expiresAt }

router.get('/', async (req, res) => {
  try {
    const { symbol, market = 'real' } = req.query

    if (!symbol) {
      return res.status(400).json({ error: 'symbol প্যারামিটার দরকার (যেমন: EURUSD)' })
    }
    if (!['real', 'otc'].includes(market)) {
      return res.status(400).json({ error: "market হতে হবে 'real' অথবা 'otc'" })
    }
    if (!runSignalEngine) {
      return res.status(503).json({ error: 'signalEngine.js এখনো সেটআপ হয়নি' })
    }
    if (!QUOTEX_SERVICE_URL) {
      return res.status(503).json({ error: 'QUOTEX_SERVICE_URL এনভায়রনমেন্ট ভ্যারিয়েবল সেট নেই' })
    }

    const cacheKey = `${symbol}:${market}`
    const cached = cache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({ ...cached.data, cached: true })
    }

    const url = `${QUOTEX_SERVICE_URL}/candles?symbol=${encodeURIComponent(symbol)}&market=${market}&count=150&period=60`
    const upstreamRes = await fetch(url, {
      headers: { 'X-API-Key': SERVICE_API_KEY || '' },
    })

    if (!upstreamRes.ok) {
      const errBody = await upstreamRes.json().catch(() => ({}))
      return res.status(upstreamRes.status).json({
        error: errBody.detail || 'Quotex data service থেকে ডেটা আনতে সমস্যা হয়েছে',
      })
    }

    const upstreamData = await upstreamRes.json()
    const candles = upstreamData.values || []

    if (candles.length < MIN_CANDLES) {
      return res.status(422).json({
        error: `পর্যাপ্ত candle ডেটা নেই (${candles.length}/${MIN_CANDLES}) — একটু পর আবার চেষ্টা করো`,
      })
    }

    const result = runSignalEngine(candles)

    // ── 🆕 lastCandle — শেষ (সবচেয়ে recent, ইতিমধ্যে closed) candle-এর
    //    open/close, যেটা result-checking-এ actual direction বোঝার
    //    জন্য দরকার (fetchCandles Python service-এ already-formed
    //    candle বাদ দিয়ে শুধু closed candle পাঠায়, তাই এটা নির্ভরযোগ্য) ──
    const lastRaw = candles[candles.length - 1]
    const lastCandle = {
      open: lastRaw.open,
      close: lastRaw.close,
      datetime: lastRaw.datetime,
    }

    const responseData = {
      symbol,
      market,
      direction: result.direction,
      strength: result.strength,
      confidence: result.confidence,
      breakdown: result.breakdown,
      candleCount: candles.length,
      lastCandle,              // 🆕 নতুন ফিল্ড
      generatedAt: Date.now(),
    }

    cache.set(cacheKey, { data: responseData, expiresAt: Date.now() + CACHE_TTL_MS })

    res.json(responseData)

  } catch (e) {
    console.error('❌ /api/signal রুটে এরর:', e)
    res.status(500).json({ error: 'সিগনাল জেনারেট করতে সমস্যা হয়েছে' })
  }
})

module.exports = router
