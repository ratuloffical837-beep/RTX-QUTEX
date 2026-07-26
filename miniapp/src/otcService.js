// ═══════════════════════════════════════════════════════════════
//  RTX EARN — Mini App — Signal Service (Backend API Client)
//
//  এই মডিউলটা Node.js backend-এর /api/signal এন্ডপয়েন্ট কল করে,
//  যেটা ভিতরে Python Quotex service থেকে candle আনে আর signalEngine
//  চালিয়ে ফলাফল দেয়। App.jsx এই ফাইলের ফাংশনগুলো ব্যবহার করবে।
//
//  ⚠️ পুরনো App.jsx সরাসরি Twelve Data API কল করত (client থেকে,
//  API key ব্রাউজারে সেভ করে)। নতুন ভার্সনে backend-ই সব ডেটা-ফেচিং
//  করে, তাই client-এ আর কোনো API key লাগবে না — এটা বেশি নিরাপদ।
// ═══════════════════════════════════════════════════════════════

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL // যেমন: https://rtx-earn-backend.onrender.com

if (!BACKEND_URL) {
  console.error('❌ VITE_BACKEND_URL এনভায়রনমেন্ট ভ্যারিয়েবলে সেট নেই — সিগনাল আনা যাবে না')
}

/**
 * Real অথবা OTC মার্কেটের জন্য সিগনাল আনে।
 * @param {string} symbol - যেমন 'EURUSD'
 * @param {'real'|'otc'} market
 * @returns {Promise<{direction, strength, confidence, breakdown, symbol, market, candleCount, generatedAt}>}
 */
export async function fetchSignal(symbol, market = 'real') {
  if (!BACKEND_URL) {
    throw new Error('Backend URL কনফিগার করা নেই')
  }

  const url = `${BACKEND_URL}/api/signal?symbol=${encodeURIComponent(symbol)}&market=${market}`

  let res
  try {
    res = await fetch(url)
  } catch (networkErr) {
    // নেটওয়ার্ক-লেভেল ফেইলিওর (সার্ভার ডাউন, ইন্টারনেট নেই ইত্যাদি)
    throw new Error('সার্ভারে পৌঁছানো যাচ্ছে না — ইন্টারনেট কানেকশন চেক করো')
  }

  let data
  try {
    data = await res.json()
  } catch (parseErr) {
    throw new Error('সার্ভার থেকে অস্বাভাবিক রেসপন্স এসেছে')
  }

  if (!res.ok) {
    // backend routes/otcSignal.js যে { error: '...' } ফরম্যাটে পাঠায় সেটা এখানে ধরা হচ্ছে
    throw new Error(data.error || `সিগনাল আনতে ব্যর্থ (status ${res.status})`)
  }

  return data
}

/**
 * Backend health চেক — অ্যাপ চালু হওয়ার সময় বা ট্রাবলশুটিং-এ কাজে লাগে
 */
export async function checkBackendHealth() {
  if (!BACKEND_URL) return { ok: false, reason: 'BACKEND_URL সেট নেই' }
  try {
    const res = await fetch(`${BACKEND_URL}/health`)
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
    const data = await res.json()
    return { ok: true, ...data }
  } catch (e) {
    return { ok: false, reason: e.message }
  }
}
