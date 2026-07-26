/**
 * ═══════════════════════════════════════════════════════════════
 *  RTX EARN — Telegram Bot Init
 *
 *  এই বটের কাজ:
 *  ১. ইউজারদের /start কমান্ডে সাড়া দেওয়া (Mini App-এ ঢোকার বাটন দেখানো)
 *  ২. পেমেন্ট নোটিফিকেশন এলে অ্যাডমিন চ্যাটে Approve/Reject বাটন সহ
 *     মেসেজ পাঠানো (এটা routes/notifyPayment.js থেকে ট্রিগার হবে)
 *  ৩. অ্যাডমিন বাটনে ক্লিক করলে সেটা হ্যান্ডেল করা (bot/adminHandlers.js-এ)
 *
 *  ⚠️ Polling mode ব্যবহার করা হয়েছে (webhook না) — কারণ এটা সেটআপ
 *  করা সবচেয়ে সহজ ও error-প্রবণতা কম। Render-এ এটা ঠিকঠাক চলে,
 *  শুধু মনে রাখতে হবে একই বট টোকেন দিয়ে যেন একসাথে দুইটা ইনস্ট্যান্স
 *  (যেমন লোকাল + Render দুটোই) না চলে — তাহলে "409 Conflict" এরর আসবে।
 * ═══════════════════════════════════════════════════════════════
 */

const TelegramBot = require('node-telegram-bot-api')

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://t.me/your_bot/app'

if (!BOT_TOKEN) {
  throw new Error('❌ TELEGRAM_BOT_TOKEN এনভায়রনমেন্ট ভ্যারিয়েবলে সেট নেই — বট চালু করা যাবে না')
}
if (!ADMIN_CHAT_ID) {
  console.warn('⚠️ TELEGRAM_ADMIN_CHAT_ID সেট নেই — পেমেন্ট নোটিফিকেশন কাউকে পাঠানো যাবে না')
}

// ── বট ইনস্ট্যান্স (polling mode) ────────────────────────────────
const bot = new TelegramBot(BOT_TOKEN, { polling: true })

bot.on('polling_error', (err) => {
  console.error('❌ Telegram polling error:', err.message)
})

console.log('✅ Telegram bot polling mode-এ চালু হয়েছে')

// ── /start কমান্ড — Mini App খোলার বাটন দেখানো ────────────────────
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id
  bot.sendMessage(chatId, '👋 স্বাগতম RTX EARN সিগনাল সিস্টেমে!\n\nনিচের বাটনে ক্লিক করে অ্যাপ চালু করো।', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚀 অ্যাপ চালু করো', web_app: { url: MINI_APP_URL } }],
      ],
    },
  }).catch((e) => console.error('❌ /start মেসেজ পাঠাতে ব্যর্থ:', e.message))
})

// ── অ্যাডমিন approve/reject হ্যান্ডলার মাউন্ট করা (পরের ধাপে দেব) ──
try {
  require('./adminHandlers')(bot)
  console.log('✅ Admin handlers লোড হয়েছে')
} catch (e) {
  console.warn('⚠️ bot/adminHandlers.js এখনো তৈরি হয়নি — approve/reject বাটন কাজ করবে না:', e.message)
}

module.exports = bot
