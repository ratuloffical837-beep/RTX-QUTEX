import { useState } from 'react'

// ═══════════════════════════════════════════════════════════════
//  RTX EARN — Mini App — Market Tabs (Bybit-style)
//
//  Real market ও OTC market আলাদা ট্যাব হিসেবে দেখায়। প্রতিটা ট্যাবে
//  ক্লিক করলে onChange('real' | 'otc') কল হয় — App.jsx সেটা ধরে
//  ফেচিং লজিক বদলাবে।
// ═══════════════════════════════════════════════════════════════

// ── Bybit-স্টাইল কালার প্যালেট (কালো ব্যাকগ্রাউন্ড + হলুদ accent) ──
export const BYBIT = {
  bg: '#000000',
  bgSecondary: '#0a0a0a',
  card: '#16181c',
  cardHover: '#1e2126',
  border: '#22252b',
  text: '#eaecef',
  textMuted: '#76808f',
  yellow: '#f7a600',     // Bybit প্রধান accent
  green: '#00c076',      // UP/CALL/WIN
  red: '#f84960',        // DOWN/PUT/LOSS
}

export default function MarketTabs({ activeMarket, onChange }) {
  return (
    <div style={{
      display: 'flex',
      background: BYBIT.card,
      borderRadius: 10,
      padding: 4,
      gap: 4,
      border: `1px solid ${BYBIT.border}`,
    }}>
      <TabButton
        label="📈 Real Market"
        sublabel="লাইভ ফরেক্স ডেটা"
        active={activeMarket === 'real'}
        onClick={() => onChange('real')}
      />
      <TabButton
        label="🌙 OTC Market"
        sublabel="সপ্তাহান্তে/অফ-আওয়ার"
        active={activeMarket === 'otc'}
        onClick={() => onChange('otc')}
      />
    </div>
  )
}

function TabButton({ label, sublabel, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '10px 8px',
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        background: active ? BYBIT.yellow : 'transparent',
        color: active ? '#000' : BYBIT.textMuted,
        transition: 'all 0.2s',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <span style={{ fontSize: 12.5, fontWeight: 800 }}>{label}</span>
      <span style={{ fontSize: 9.5, opacity: active ? 0.75 : 0.6 }}>{sublabel}</span>
    </button>
  )
                                    }
