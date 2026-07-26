// ═══════════════════════════════════════════════════════════════
//  RTX EARN — Mini App — Vite Config
// ═══════════════════════════════════════════════════════════════

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  // ── Build আউটপুট সেটিংস ──────────────────────────────────────
  build: {
    outDir: 'dist',
    sourcemap: false, // প্রোডাকশনে সোর্স কোড এক্সপোজ না করাই ভালো
  },

  // ── Dev সার্ভার (লোকাল টেস্টিং-এর জন্য) ──────────────────────
  server: {
    port: 5173,
    host: true, // লোকাল নেটওয়ার্কে অন্য ডিভাইস (যেমন ফোন) থেকেও টেস্ট করতে দেয়
  },

  // ── Preview সার্ভার (build এর পর লোকালি চেক করার জন্য) ────────
  preview: {
    port: 4173,
    host: true,
  },
})
