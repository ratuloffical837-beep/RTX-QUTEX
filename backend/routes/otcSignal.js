/**
 * ═══════════════════════════════════════════════════════════════
 *  RTX EARN — Route: /api/signal
 *
 *  কাজ: Mini App থেকে রিকোয়েস্ট এলে (symbol + market=real/otc দিয়ে):
 *  ১. Python Quotex Data Service থেকে candle ডেটা আনা
 *  ২. signalEngine.js (backend ভার্সন) দিয়ে ১১-ইন্ডিকেটর analysis চালানো
 *  ৩. ফলাফল (CALL/PUT + strength + confidence + সব ইন্ডিকেটরের breakdown) ফেরত দেওয়া
 *
 *  ⚠️ এই ফাইলটা ../signalEngine.js এর উপর নির্ভর করে (backend-এর নিজস্ব
 *  CommonJS ভার্সন — পরের ফাইল হিসেবে দেব, এটা frontend-এর signalEngine.js
 *  থেকে আলাদা ফাইল কারণ ES modules vs CommonJS syntax আলাদা)।
 *
 *  Query params:
 *    GET /api/signal?symbol=EURUSD&market=real
 *    GET /api/signal?symbol=EURUSD&market=otc
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

const QUOTEX_SERVICE_URL = process.env.QUOTEX_SERVICE_URL // যেমন: https://rtx-earn-quotex-service.onrender.com
const SERVICE_API_KEY = process.env.SERVICE_API_KEY       // Python service-এর সাথে মিলতে হবে

// ── ছোট in-memory cache — একই symbol/market ৫ সেকেন্ডের মধ্যে বারবার
//    রিকোয়েস্ট এলে Python service-কে বারবার কল না করে cache থেকে দেওয়া,
//    যাতে অনেক ইউজার একসাথে থাকলে Python service-এ চাপ না পড়ে ──────
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

    // ── Python Quotex service থেকে candle আনা ────────────────────
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

    // ── Signal Engine চালানো ──────────────────────────────────────
    const result = runSignalEngine(candles)

    const responseData = {
      symbol,
      market,
      direction: result.direction,       // 'CALL' | 'PUT' | null
      strength: result.strength,         // 0-100
      confidence: result.confidence,     // 0-100
      breakdown: result.breakdown,       // সব ১১টা ইন্ডিকেটরের BULL/BEAR — সবসময় দেখাবে
      candleCount: candles.length,
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
