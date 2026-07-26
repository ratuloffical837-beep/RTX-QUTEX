// ═══════════════════════════════════════════════════════════════
//  RTX EARN — Mini App — Firebase Client Init
//
//  এটা client-side Firebase SDK — এটা তোমার Firebase project-এর
//  public config (এগুলো সিক্রেট না, ব্রাউজারে এক্সপোজ হওয়াই স্বাভাবিক —
//  আসল নিরাপত্তা আসে Firestore Security Rules থেকে, এই config থেকে না)।
//
//  ⚠️ backend/firebaseAdmin.js এর থেকে এটা সম্পূর্ণ আলাদা — ওটা
//  server-side Admin SDK (পূর্ণ ক্ষমতা), এটা client-side SDK
//  (Security Rules মেনে চলতে বাধ্য)।
// ═══════════════════════════════════════════════════════════════

import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

// ── Vite এনভায়রনমেন্ট ভ্যারিয়েবল (import.meta.env, .env ফাইলে
//    VITE_ প্রিফিক্স দিয়ে সেট করতে হয়) ────────────────────────────
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// ── কনফিগ ভ্যালিডেশন — ডেভেলপমেন্টে ভুলে কোনো ভ্যারিয়েবল বাদ পড়লে
//    সাথে সাথে স্পষ্ট এরর দেখাবে, নাহলে Firestore কল করার সময় অস্পষ্ট
//    এরর আসে যা ডিবাগ করা কঠিন ────────────────────────────────────
const missingKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key)

if (missingKeys.length > 0) {
  console.error(
    `❌ Firebase config-এ এই ভ্যারিয়েবলগুলো মিসিং: ${missingKeys.join(', ')}\n` +
    `.env ফাইলে VITE_FIREBASE_* ভ্যারিয়েবলগুলো ঠিকমতো সেট করা আছে কিনা চেক করো।`
  )
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
