/**
 * ═══════════════════════════════════════════════════════════════
 *  RTX EARN — Firebase Admin SDK Init
 *
 *  এই মডিউলটা backend থেকে Firestore-এ সরাসরি (নিরাপদে) লিখতে দেয়।
 *  Client-side Firebase SDK (React app-এর) আর এই Admin SDK আলাদা —
 *  Admin SDK-এর security rules বাইপাস করার ক্ষমতা থাকে, তাই এটা শুধু
 *  backend-এ থাকবে, কখনো frontend-এ না।
 *
 *  ব্যবহার (অন্য ফাইলে):
 *    const { db, admin } = require('../firebaseAdmin')
 *    await db.collection('users').doc(uid).set({ status: 'approved' })
 * ═══════════════════════════════════════════════════════════════
 */

const admin = require('firebase-admin')

// ── Service Account Key লোড করা ──────────────────────────────────
// দুইভাবে সেট করা যায় (যেকোনো একটা):
//
// পদ্ধতি ১ (Render-এ সুপারিশকৃত): FIREBASE_SERVICE_ACCOUNT এনভায়রনমেন্ট
//   ভ্যারিয়েবলে পুরো service-account JSON-টা এক লাইনের string হিসেবে বসাও।
//
// পদ্ধতি ২ (লোকাল ডেভেলপমেন্টে সুবিধাজনক): serviceAccountKey.json নামে
//   ফাইল রেখে GOOGLE_APPLICATION_CREDENTIALS পাথ সেট করো (.gitignore-এ
//   এই ফাইলটা অবশ্যই থাকতে হবে — এটা অত্যন্ত সিক্রেট)।

let credential

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    credential = admin.credential.cert(serviceAccount)
  } catch (e) {
    console.error('❌ FIREBASE_SERVICE_ACCOUNT পার্স করতে ব্যর্থ — এটা valid JSON string কিনা চেক করো:', e.message)
    throw e
  }
} else {
  // GOOGLE_APPLICATION_CREDENTIALS এনভায়রনমেন্ট ভ্যারিয়েবল সেট থাকলে
  // (ফাইল পাথ নির্দেশ করে) applicationDefault() সেটা নিজে থেকে খুঁজে নেবে
  console.warn(
    '⚠️ FIREBASE_SERVICE_ACCOUNT এনভায়রনমেন্ট ভ্যারিয়েবলে নেই — ' +
    'GOOGLE_APPLICATION_CREDENTIALS দিয়ে ফাইল-পাথ চেষ্টা করা হচ্ছে (লোকাল ডেভ মোড)'
  )
  credential = admin.credential.applicationDefault()
}

// ── ইনিশিয়ালাইজ (একবারই হবে — hot-reload/multiple require-এ যেন
//    ক্র্যাশ না করে, তাই already-initialized চেক করা হলো) ──────────
if (!admin.apps.length) {
  admin.initializeApp({ credential })
  console.log('✅ Firebase Admin SDK ইনিশিয়ালাইজ হয়েছে')
}

const db = admin.firestore()

module.exports = { admin, db }
