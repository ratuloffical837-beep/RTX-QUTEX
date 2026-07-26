/**
 * ═══════════════════════════════════════════════════════════════
 *  RTX EARN — Admin Approve/Reject Handlers
 *
 *  এই মডিউলটা bot/telegramBot.js থেকে কল হয় (bot ইনস্ট্যান্স প্যারামিটার
 *  হিসেবে পেয়ে)। কাজ:
 *  ১. অ্যাডমিন চ্যাটে পাঠানো পেমেন্ট মেসেজে ✅/❌ বাটনে ক্লিক শোনা
 *  ২. Firestore-এ users/{uid} ও payments/{txId} ডকুমেন্ট আপডেট করা
 *  ৩. ইউজারকে জানানো (approved/rejected) — এতে সে সাথে সাথে বুঝতে পারবে
 *  ৪. অ্যাডমিনের মেসেজ এডিট করে দেখানো যে সিদ্ধান্ত নেওয়া হয়ে গেছে
 *     (যাতে ভুলে দুইবার ক্লিক করলেও সমস্যা না হয়)
 *
 *  callback_data ফরম্যাট (Telegram-এর 64-byte সীমার মধ্যে রাখতে ছোট রাখা হলো):
 *    "appr:{uid}:{txId}"   → Approve
 *    "rej:{uid}:{txId}"    → Reject
 * ═══════════════════════════════════════════════════════════════
 */

const { db, admin } = require('../firebaseAdmin')

// প্রিমিয়াম সাবস্ক্রিপশনের মেয়াদ (PaymentPage.jsx-এ "৩০ দিন" বলা আছে)
const PREMIUM_DURATION_DAYS = 30

module.exports = function registerAdminHandlers(bot) {
  bot.on('callback_query', async (query) => {
    const data = query.data || ''
    const [action, uid, txId] = data.split(':')

    if (!['appr', 'rej'].includes(action) || !uid || !txId) {
      // এই বটের অন্য কোনো ফিচারের callback হতে পারে — চুপচাপ ইগনোর করা হলো
      return
    }

    try {
      // ── ইতিমধ্যে প্রসেস হয়ে গেছে কিনা চেক (ডাবল-ক্লিক প্রোটেকশন) ──
      const paymentRef = db.collection('payments').doc(txId)
      const paymentSnap = await paymentRef.get()

      if (!paymentSnap.exists) {
        await bot.answerCallbackQuery(query.id, { text: '❌ এই পেমেন্ট রেকর্ড পাওয়া যায়নি', show_alert: true })
        return
      }

      const payment = paymentSnap.data()
      if (payment.status !== 'pending') {
        await bot.answerCallbackQuery(query.id, {
          text: `⚠️ এটা ইতিমধ্যে "${payment.status}" হিসেবে প্রসেস হয়ে গেছে`,
          show_alert: true,
        })
        return
      }

      const userRef = db.collection('users').doc(uid)

      if (action === 'appr') {
        // ── APPROVE ──────────────────────────────────────────────
        const expiresAt = admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + PREMIUM_DURATION_DAYS * 24 * 3600 * 1000)
        )

        // atomic batch — দুইটা ডকুমেন্ট একসাথে আপডেট হবে, একটা ফেইল
        // করলে আরেকটাও হবে না (half-updated state এড়াতে)
        const batch = db.batch()
        batch.set(userRef, { status: 'approved', expiresAt, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
        batch.set(paymentRef, { status: 'approved', processedAt: admin.firestore.FieldValue.serverTimestamp(), processedBy: query.from.id }, { merge: true })
        await batch.commit()

        await bot.answerCallbackQuery(query.id, { text: '✅ Approve করা হয়েছে' })
        await bot.editMessageText(
          `${query.message.text}\n\n✅ APPROVED — @${query.from.username || query.from.id} কর্তৃক`,
          { chat_id: query.message.chat.id, message_id: query.message.message_id }
        )

        // ইউজারকে নোটিফাই করা
        bot.sendMessage(
          uid,
          `🎉 অভিনন্দন! আপনার পেমেন্ট কনফার্ম হয়েছে।\n💎 প্রিমিয়াম এখন সক্রিয় — মেয়াদ: ${PREMIUM_DURATION_DAYS} দিন।`
        ).catch((e) => console.warn(`⚠️ ইউজার ${uid} কে notify করা যায়নি:`, e.message))

      } else {
        // ── REJECT ───────────────────────────────────────────────
        const batch = db.batch()
        batch.set(userRef, { status: 'rejected', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
        batch.set(paymentRef, { status: 'rejected', processedAt: admin.firestore.FieldValue.serverTimestamp(), processedBy: query.from.id }, { merge: true })
        await batch.commit()

        await bot.answerCallbackQuery(query.id, { text: '❌ Reject করা হয়েছে' })
        await bot.editMessageText(
          `${query.message.text}\n\n❌ REJECTED — @${query.from.username || query.from.id} কর্তৃক`,
          { chat_id: query.message.chat.id, message_id: query.message.message_id }
        )

        bot.sendMessage(
          uid,
          `❌ দুঃখিত, আপনার পেমেন্ট যাচাই করা যায়নি বা সঠিক তথ্য মেলেনি।\nসঠিক তথ্য দিয়ে আবার চেষ্টা করুন, অথবা সাপোর্টে যোগাযোগ করুন।`
        ).catch((e) => console.warn(`⚠️ ইউজার ${uid} কে notify করা যায়নি:`, e.message))
      }

    } catch (e) {
      console.error('❌ Approve/Reject হ্যান্ডলারে এরর:', e)
      bot.answerCallbackQuery(query.id, { text: '⚠️ প্রসেস করতে সমস্যা হয়েছে, আবার চেষ্টা করুন', show_alert: true }).catch(() => {})
    }
  })
    }
