/**
 * ═══════════════════════════════════════════════════════════════
 *  RTX EARN — Firebase Admin SDK Init (v2 — Base64 সাপোর্ট সহ)
 *
 *  ⚠️ এটা আগের firebaseAdmin.js-এর আপডেটেড ভার্সন। এখন
 *  FIREBASE_SERVICE_ACCOUNT_BASE64 এনভায়রনমেন্ট ভ্যারিয়েবল থেকে
 *  Base64-এনকোড করা service account JSON পড়ে (raw JSON স্ট্রিং-এর
 *  চেয়ে এটা বেশি নিরাপদ ও ঝামেলাহীন — কোনো কোটেশন/নিউলাইন এস্কেপিং
 *  সমস্যা হয় না Render-এর env var ফিল্ডে বসানোর সময়)।
 *
 *  ব্যবহার (অন্য ফাইলে অপরিবর্তিত):
 *    const { db, admin } = require('../firebaseAdmin')
 *    await db.collection('users').doc(uid).set({ status: 'approved' })
 * ═══════════════════════════════════════════════════════════════
 */

const admin = require('firebase-admin')

let credential

if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
  try {
    const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8')
    const serviceAccount = JSON.parse(decoded)
    credential = admin.credential.cert(serviceAccount)
    console.log('✅ Firebase service account Base64 থেকে সফলভাবে লোড হয়েছে')
  } catch (e) {
    console.error(
      '❌ FIREBASE_SERVICE_ACCOUNT_BASE64 ডিকোড/পার্স করতে ব্যর্থ — এটা সঠিক Base64 স্ট্রিং কিনা চেক করো:',
      e.message
    )
    throw e
  }
} else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  // ── ফলব্যাক: পুরনো পদ্ধতি (raw JSON string) — কেউ যদি Base64 না
  //    ব্যবহার করে শুধু plain JSON বসাতে চায়, সেটাও কাজ করবে ─────
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    credential = admin.credential.cert(serviceAccount)
    console.log('✅ Firebase service account raw JSON থেকে সফলভাবে লোড হয়েছে')
  } catch (e) {
    console.error('❌ FIREBASE_SERVICE_ACCOUNT পার্স করতে ব্যর্থ:', e.message)
    throw e
  }
} else {
  // GOOGLE_APPLICATION_CREDENTIALS এনভায়রনমেন্ট ভ্যারিয়েবল সেট থাকলে
  // (ফাইল পাথ নির্দেশ করে) applicationDefault() সেটা নিজে থেকে খুঁজে নেবে
  console.warn(
    '⚠️ FIREBASE_SERVICE_ACCOUNT_BASE64 বা FIREBASE_SERVICE_ACCOUNT কোনোটাই সেট নেই — ' +
    'GOOGLE_APPLICATION_CREDENTIALS দিয়ে ফাইল-পাথ চেষ্টা করা হচ্ছে (লোকাল ডেভ মোড)'
  )
  credential = admin.credential.applicationDefault()
}

// ── ইনিশিয়ালাইজ (একবারই হবে) ────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({ credential })
  console.log('✅ Firebase Admin SDK ইনিশিয়ালাইজ হয়েছে')
}

const db = admin.firestore()

module.exports = { admin, db }
