/**
 * ═══════════════════════════════════════════════════════════════
 *  RTX EARN — Node.js Backend — Main Server
 *
 *  এই ফাইলটাই মূল এন্ট্রি পয়েন্ট। এটা যা যা করে:
 *  ১. Express সার্ভার চালু করে
 *  ২. Firebase Admin ইনিশিয়ালাইজ করে (Firestore-এ লিখতে)
 *  ৩. Telegram bot চালু করে (payment approve/reject)
 *  ৪. Route মাউন্ট করে (payment notify, signal API)
 *  ৫. Render ফ্রি টায়ারে sleep ঠেকাতে self-ping keep-alive চালায়
 *
 *  ⚠️ এই ফাইলটা নিচের ফাইলগুলোর উপর নির্ভর করে (পরে একে একে দেব):
 *     - ./firebaseAdmin.js
 *     - ./bot/telegramBot.js
 *     - ./routes/notifyPayment.js
 *     - ./routes/otcSignal.js
 *  এই ফাইলগুলো এখনো তৈরি না হলে সার্ভার চালু করলে "Cannot find module"
 *  এরর আসবে — এটাই স্বাভাবিক, বাকি ফাইলগুলো দেওয়ার পর ঠিক হয়ে যাবে।
 * ═══════════════════════════════════════════════════════════════
 */

require('dotenv').config()

const express = require('express')
const cors = require('cors')

const app = express()
const PORT = process.env.PORT || 3000

// ── Middleware ────────────────────────────────────────────────
app.use(cors())
app.use(express.json())

// ── অনুরোধ লগ (ডিবাগিং-এর জন্য, প্রোডাকশনে চাইলে কমিয়ে দিও) ──────
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} — ${req.method} ${req.path}`)
  next()
})

// ── স্বাস্থ্য-পরীক্ষা এন্ডপয়েন্ট (Render health check + self-ping উভয়ের জন্য) ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() })
})

app.get('/', (req, res) => {
  res.send('RTX EARN Backend — চলছে ✅')
})

// ── Route মাউন্ট (এই ফাইলগুলো পরের ধাপে দেব) ──────────────────────
try {
  const notifyPaymentRoute = require('./routes/notifyPayment')
  app.use('/api/notify-payment', notifyPaymentRoute)
} catch (e) {
  console.warn('⚠️ routes/notifyPayment.js এখনো তৈরি হয়নি — এই রুট স্কিপ করা হলো:', e.message)
}

try {
  const otcSignalRoute = require('./routes/otcSignal')
  app.use('/api/signal', otcSignalRoute)
} catch (e) {
  console.warn('⚠️ routes/otcSignal.js এখনো তৈরি হয়নি — এই রুট স্কিপ করা হলো:', e.message)
}

// ── Telegram Bot চালু করা (পরের ধাপে bot/telegramBot.js দেব) ──────
try {
  require('./bot/telegramBot')
  console.log('✅ Telegram bot মডিউল লোড হয়েছে')
} catch (e) {
  console.warn('⚠️ bot/telegramBot.js এখনো তৈরি হয়নি — বট চালু হয়নি:', e.message)
}

// ── 404 হ্যান্ডলার ─────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'এই রুট পাওয়া যায়নি' })
})

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err)
  res.status(500).json({ error: 'সার্ভার এরর হয়েছে' })
})

// ── সার্ভার চালু ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 RTX EARN Backend চলছে পোর্ট ${PORT}-এ`)
})

// ═══════════════════════════════════════════════════════════════
//  Self-ping Keep-Alive (Render ফ্রি টায়ারে ১৫ মিনিট নিষ্ক্রিয় থাকলে
//  সার্ভিস sleep করে — এটা প্রতি ১০ মিনিটে নিজেকে নিজে পিং করে সেটা
//  ঠেকায়। RENDER_EXTERNAL_URL Render নিজে থেকেই এনভায়রনমেন্টে সেট
//  করে দেয়, তাই আলাদা করে বসাতে হয় না)
// ═══════════════════════════════════════════════════════════════
const SELF_PING_INTERVAL_MS = 10 * 60 * 1000 // ১০ মিনিট

if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => {
    fetch(`${process.env.RENDER_EXTERNAL_URL}/health`)
      .then(() => console.log('🔄 Self-ping সফল — সার্ভিস জাগ্রত আছে'))
      .catch((e) => console.warn('⚠️ Self-ping ব্যর্থ:', e.message))
  }, SELF_PING_INTERVAL_MS)
  console.log('✅ Self-ping keep-alive চালু হয়েছে')
} else {
  console.log('ℹ️ RENDER_EXTERNAL_URL পাওয়া যায়নি — self-ping স্কিপ করা হলো (লোকাল ডেভেলপমেন্টে এটাই স্বাভাবিক)')
  }
