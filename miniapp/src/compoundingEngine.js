// ═══════════════════════════════════════════════════════════════
//  RTX EARN — Mini App — Compounding + Martingale Engine
//
//  আগে App.jsx-এ mLevel সিস্টেম ছিল সাধারণ mult (1 → 2.5 → 5.5 → 1...),
//  আর RulesPage.jsx-এ আলাদা একটা সঠিক recovery-formula ছিল যেটা
//  নিশ্চিত করে যে WIN হলে ঠিক আগের সব লস কভার হয়ে টার্গেট প্রফিট থাকে।
//
//  এই ফাইলে RulesPage-এর ফর্মুলাটাই লাইভ ট্রেডিং স্কোরের জন্য ব্যবহার
//  করা হচ্ছে — যাতে "ডেমো" আর "আসল" হিসাব সবসময় একই সূত্র মেনে চলে।
//
//  ফর্মুলা: next_trade = ceil( (cumulative_loss + target_profit) / payout_rate )
// ═══════════════════════════════════════════════════════════════

export const PAYOUT_RATE = 0.85       // ৮৫% পে-আউট (RulesPage-এর সাথে মিল রেখে)
export const BASE_TRADE = 100          // প্রথম/রিসেট-পরবর্তী ট্রেড এমাউন্ট
export const TARGET_PROFIT = Math.round(BASE_TRADE * PAYOUT_RATE) // ৳85
export const MAX_MTG_STEPS = 5         // সর্বোচ্চ ৫ ধাপ রিকভারি — RulesPage-এর সাথে মিল

// ── দৈনিক লক্ষ্য (দিন যত বাড়বে, লক্ষ্য তত বাড়বে) ──────────────────
// (App.jsx-এর পুরনো dailyTarget লজিক অপরিবর্তিত রাখা হলো)
export function computeDailyTarget(startDateISO) {
  const days = Math.floor((Date.now() - new Date(startDateISO)) / 86400000)
  return days < 3 ? 6 : days < 6 ? 12 : 20
}

// ── পরের রিকভারি ট্রেড এমাউন্ট গণনা ─────────────────────────────
// cumulativeLoss = এই MTG সাইকেলে এখন পর্যন্ত মোট লস
export function computeNextTradeAmount(cumulativeLoss) {
  return Math.ceil((cumulativeLoss + TARGET_PROFIT) / PAYOUT_RATE)
}

// ── ডিফল্ট/নতুন Martingale স্টেট ────────────────────────────────
export function createInitialMtgState() {
  return {
    step: 0,              // 0 = কোনো active recovery cycle নেই
    cumulativeLoss: 0,     // এই সাইকেলে এখন পর্যন্ত মোট লস
    currentTrade: BASE_TRADE,
  }
}

/**
 * একটা ট্রেডের ফলাফল (win/loss) দিয়ে Martingale স্টেট আপডেট করে।
 * @param {object} state - বর্তমান MTG স্টেট (createInitialMtgState() বা আগের রিটার্ন ভ্যালু)
 * @param {boolean} isWin
 * @returns {{ newState: object, profitChange: number, cycleEnded: boolean, maxStepsReached: boolean }}
 */
export function recordTradeResult(state, isWin) {
  const tradeAmount = state.currentTrade

  if (isWin) {
    // WIN হলে — এই ট্রেডের লাভ + সাইকেল রিসেট
    const profitChange = +(tradeAmount * PAYOUT_RATE).toFixed(2)
    return {
      newState: createInitialMtgState(),
      profitChange,
      cycleEnded: true,
      maxStepsReached: false,
    }
  }

  // LOSS হলে — cumulative loss বাড়বে, পরের ধাপের এমাউন্ট গণনা হবে
  const newCumulativeLoss = state.cumulativeLoss + tradeAmount
  const newStep = state.step + 1

  if (newStep >= MAX_MTG_STEPS) {
    // ৫ ধাপ শেষ — RulesPage-এর সতর্কতা অনুযায়ী আর রিকভারি ট্রেড না করে
    // সাইকেল বন্ধ করে দেওয়া হচ্ছে (নাহলে লস সীমাহীন বাড়তে থাকবে)
    return {
      newState: createInitialMtgState(),
      profitChange: -tradeAmount,
      cycleEnded: true,
      maxStepsReached: true,
    }
  }

  const nextTrade = computeNextTradeAmount(newCumulativeLoss)

  return {
    newState: {
      step: newStep,
      cumulativeLoss: newCumulativeLoss,
      currentTrade: nextTrade,
    },
    profitChange: -tradeAmount,
    cycleEnded: false,
    maxStepsReached: false,
  }
}

/**
 * localStorage-এ সেভ করার জন্য সিরিয়ালাইজ/ডিসিরিয়ালাইজ হেল্পার
 */
export function loadMtgState() {
  try {
    const raw = JSON.parse(localStorage.getItem('mtg_state'))
    if (
      raw &&
      Number.isFinite(raw.step) &&
      Number.isFinite(raw.cumulativeLoss) &&
      Number.isFinite(raw.currentTrade)
    ) {
      return raw
    }
  } catch (_) {}
  return createInitialMtgState()
}

export function saveMtgState(state) {
  localStorage.setItem('mtg_state', JSON.stringify(state))
}

/**
 * ৫ ধাপ শেষে সম্ভাব্য সর্বোচ্চ ক্ষতি — RulesPage-এর মতোই ইউজারকে
 * আগে থেকে দেখানোর জন্য (ঝুঁকি সচেতনতা)
 */
export function computeWorstCaseLoss() {
  let cumulativeLoss = 0
  let trade = BASE_TRADE
  for (let step = 1; step <= MAX_MTG_STEPS; step++) {
    cumulativeLoss += trade
    if (step < MAX_MTG_STEPS) {
      trade = computeNextTradeAmount(cumulativeLoss)
    }
  }
  return cumulativeLoss
                                   }
