/**
 * ═══════════════════════════════════════════════════════════════
 *  RTX EARN — Route: /api/notify-payment
 *
 *  কাজ: Mini App (PaymentPage.jsx) থেকে POST রিকোয়েস্ট আসে যখন কোনো
 *  ইউজার পেমেন্ট সাবমিট করে। এই রুট সেই তথ্য নিয়ে অ্যাডমিন চ্যাটে
 *  Approve/Reject ইনলাইন বাটন সহ একটা মেসেজ পাঠায়।
 *
 *  ⚠️ নোট: PaymentPage.jsx ইতিমধ্যেই সরাসরি Firestore-এ পেমেন্ট ডকুমেন্ট
 *  সেভ করে (client SDK দিয়ে), এই রুট শুধু Telegram নোটিফিকেশন পাঠানোর
 *  জন্য। তাই এখানে আবার Firestore-এ write করা হচ্ছে না — শুধু read করে
 *  ভেরিফাই করা হচ্ছে (ডেটা সত্যিই আছে কিনা), ডুপ্লিকেট এড়াতে এবং
 *  spoofed/fake রিকোয়েস্ট ঠেকাতে।
 * ═══════════════════════════════════════════════════════════════
 */

const express = require('express')
const router = express.Router()
const { db } = require('../firebaseAdmin')

// bot/telegramBot.js থেকে bot ইনস্ট্যান্স আনা (একই ইনস্ট্যান্স ব্যবহার
// করা হচ্ছে, নতুন কানেকশন খোলা হচ্ছে না)
let bot
try {
  bot = require('../bot/telegramBot')
} catch (e) {
  console.warn('⚠️ bot/telegramBot.js লোড করা যায়নি — notify-payment রুট বার্তা পাঠাতে পারবে না:', e.message)
}

const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID

router.post('/', async (req, res) => {
  try {
    const { userId, name, username, method, senderNumber, amount, txId, promoCode } = req.body

    // ── বেসিক ভ্যালিডেশন ────────────────────────────────────────
    if (!userId || !txId || !amount || !method || !senderNumber) {
      return res.status(400).json({ error: 'প্রয়োজনীয় তথ্য অনুপস্থিত' })
    }

    // ── Firestore-এ সত্যিই এই পেমেন্ট রেকর্ড আছে কিনা যাচাই ────────
    // (spoofed রিকোয়েস্ট ঠেকাতে — কেউ যেন সরাসরি এই API কল করে fake
    // নোটিফিকেশন না পাঠাতে পারে যেটার সাথে কোনো আসল Firestore ডেটা নেই)
    const paymentSnap = await db.collection('payments').doc(txId).get()
    if (!paymentSnap.exists) {
      return res.status(404).json({ error: 'এই TrxID-র জন্য কোনো পেমেন্ট রেকর্ড পাওয়া যায়নি' })
    }

    if (!bot || !ADMIN_CHAT_ID) {
      console.warn('⚠️ বট বা অ্যাডমিন চ্যাট আইডি সেট নেই — নোটিফিকেশন পাঠানো যায়নি, কিন্তু পেমেন্ট রেকর্ড Firestore-এ আছে')
      return res.json({ ok: true, warning: 'নোটিফিকেশন পাঠানো যায়নি, ম্যানুয়ালি Firestore চেক করো' })
    }

    // ── অ্যাডমিন মেসেজ তৈরি ───────────────────────────────────────
    const text =
      `💰 নতুন পেমেন্ট রিকোয়েস্ট\n\n` +
      `👤 নাম: ${name || 'N/A'}${username ? ` (@${username})` : ''}\n` +
      `🆔 User ID: ${userId}\n` +
      `💳 মেথড: ${method}\n` +
      `📱 প্রেরকের নম্বর: ${senderNumber}\n` +
      `💵 পরিমাণ: ৳${amount}\n` +
      `🧾 TrxID: ${txId}\n` +
      (promoCode ? `🎁 প্রমো কোড: ${promoCode}\n` : '') +
      `\n👇 যাচাই করে Approve/Reject করো`

    await bot.sendMessage(ADMIN_CHAT_ID, text, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Approve', callback_data: `appr:${userId}:${txId}` },
            { text: '❌ Reject', callback_data: `rej:${userId}:${txId}` },
          ],
        ],
      },
    })

    res.json({ ok: true })

  } catch (e) {
    console.error('❌ notify-payment রুটে এরর:', e)
    res.status(500).json({ error: 'সার্ভার এরর হয়েছে' })
  }
})

module.exports = router
