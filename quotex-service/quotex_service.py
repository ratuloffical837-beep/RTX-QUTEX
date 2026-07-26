#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════
  RTX EARN — Quotex Data Service
  কাজ: pyquotex দিয়ে Quotex-এ কানেক্ট থেকে Real + OTC market candle
       ডেটা REST API আকারে Node.js backend-কে সাপ্লাই করা।

  ⚠️ গুরুত্বপূর্ণ নোট:
  pyquotex একটি community-maintained unofficial লাইব্রেরি। এর ক্লাস/মেথড
  নাম ভার্সনভেদে সামান্য বদলাতে পারে। নিচে যেখানে "VERIFY" কমেন্ট আছে,
  ইনস্টল করার পর সেই অংশগুলো তোমার ইনস্টল হওয়া ভার্সনের সাথে মিলিয়ে
  নিও (pip show pyquotex অথবা লাইব্রেরির __init__.py দেখে)।
═══════════════════════════════════════════════════════════════════
"""

import os
import asyncio
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# VERIFY: pyquotex-এর ইনস্টল হওয়া ভার্সনে ইম্পোর্ট পাথ এটাই থাকে সাধারণত।
# যদি ImportError আসে, `from pyquotex.quotexapi.stable_api import Quotex`
# বা লাইব্রেরির README দেখে সঠিক পাথ বসাও।
from pyquotex.stable_api import Quotex

# ── লগিং ─────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("quotex_service")

# ── এনভায়রনমেন্ট ভ্যারিয়েবল (Render-এ সেট করতে হবে) ──────────────
QUOTEX_EMAIL = os.environ.get("QUOTEX_EMAIL", "")
QUOTEX_PASSWORD = os.environ.get("QUOTEX_PASSWORD", "")
ACCOUNT_MODE = os.environ.get("QUOTEX_ACCOUNT_MODE", "PRACTICE")  # PRACTICE বা REAL
SERVICE_API_KEY = os.environ.get("SERVICE_API_KEY", "")  # Node backend-এর সাথে শেয়ার করা সিক্রেট
PORT = int(os.environ.get("PORT", 8000))

RECONNECT_INTERVAL_SEC = 15   # কানেকশন ছিঁড়ে গেলে কতক্ষণ পর পর রিট্রাই
HEALTHCHECK_INTERVAL_SEC = 30  # ব্যাকগ্রাউন্ডে কানেকশন হেলথ কতক্ষণ পর পর চেক

if not QUOTEX_EMAIL or not QUOTEX_PASSWORD:
    log.warning("QUOTEX_EMAIL / QUOTEX_PASSWORD এনভায়রনমেন্ট ভ্যারিয়েবলে সেট নেই — কানেকশন ফেইল করবে।")

# ── গ্লোবাল স্টেট ────────────────────────────────────────────────
class QuotexState:
    def __init__(self):
        self.client: Quotex | None = None
        self.connected: bool = False
        self.last_error: str | None = None
        self.last_connected_at: float | None = None
        self.reconnect_task: asyncio.Task | None = None

state = QuotexState()


# ── কানেকশন লজিক (auto-reconnect সহ) ────────────────────────────
async def connect_quotex():
    """Quotex-এ কানেক্ট করার চেষ্টা করে। ফেইল করলে exception raise করে না,
    বরং state.last_error-এ কারণ লিখে রাখে — ক্যালার সেটা দেখে সিদ্ধান্ত নেয়।"""
    try:
        state.client = Quotex(
            email=QUOTEX_EMAIL,
            password=QUOTEX_PASSWORD,
        )
        # VERIFY: set_account_mode মেথডের নাম/প্যারামিটার pyquotex ভার্সনভেদে
        # আলাদা হতে পারে (কিছু ভার্সনে change_account("PRACTICE") নামেও থাকে)
        state.client.set_account_mode(ACCOUNT_MODE)

        connected, reason = await state.client.connect()
        if not connected:
            state.connected = False
            state.last_error = str(reason)
            log.error(f"❌ Quotex কানেকশন ব্যর্থ: {reason}")
            return False

        state.connected = True
        state.last_error = None
        state.last_connected_at = time.time()
        log.info("✅ Quotex-এ সফলভাবে কানেক্ট হয়েছে")
        return True

    except Exception as e:
        state.connected = False
        state.last_error = str(e)
        log.exception(f"❌ Quotex কানেকশন এক্সেপশন: {e}")
        return False


async def reconnect_loop():
    """ব্যাকগ্রাউন্ডে চলতে থাকা টাস্ক — কানেকশন ছিঁড়ে গেলে auto-reconnect করে।
    Render ফ্রি/স্টার্টার টায়ারে মাঝেমধ্যে নেটওয়ার্ক ড্রপ হতে পারে, তাই এই
    লুপটাই সার্ভিসের স্থিতিশীলতার মূল ভিত্তি।"""
    while True:
        try:
            is_alive = False
            if state.client and state.connected:
                # VERIFY: check_connect() না থাকলে state.client.check_connect
                # অথবা কোনো ping/heartbeat মেথড ব্যবহার করো
                try:
                    is_alive = state.client.check_connect()
                except Exception:
                    is_alive = False

            if not is_alive:
                state.connected = False
                log.warning("⚠️ কানেকশন নেই — রিকানেক্ট করার চেষ্টা করা হচ্ছে...")
                await connect_quotex()

        except Exception as e:
            log.exception(f"reconnect_loop এ অপ্রত্যাশিত এরর: {e}")

        await asyncio.sleep(RECONNECT_INTERVAL_SEC)


# ── FastAPI lifespan (startup/shutdown) ─────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("🚀 Quotex Data Service চালু হচ্ছে...")
    await connect_quotex()
    state.reconnect_task = asyncio.create_task(reconnect_loop())
    yield
    log.info("🛑 সার্ভিস বন্ধ হচ্ছে...")
    if state.reconnect_task:
        state.reconnect_task.cancel()
    if state.client and state.connected:
        try:
            state.client.close()
        except Exception:
            pass


app = FastAPI(title="RTX EARN — Quotex Data Service", lifespan=lifespan)

# ── CORS — শুধু নিজের Node backend থেকে কল হবে, তাই কড়া রাখা ভালো ─
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # প্রোডাকশনে এটা তোমার backend-এর নির্দিষ্ট ডোমেইনে বদলে দিও
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ── সিম্পল API-key নিরাপত্তা (Node backend ছাড়া কেউ যাতে সরাসরি কল না করতে পারে) ──
def verify_api_key(x_api_key: str = Header(default="")):
    if not SERVICE_API_KEY:
        # কী সেট করা না থাকলে ওয়ার্নিং সহ চলতে দেওয়া হচ্ছে (শুধু লোকাল টেস্টিংয়ের জন্য)
        return
    if x_api_key != SERVICE_API_KEY:
        raise HTTPException(status_code=401, detail="ভুল বা অনুপস্থিত API key")


# ── Asset নাম ম্যাপিং: Real vs OTC ───────────────────────────────
def resolve_asset_name(symbol: str, market: str) -> str:
    """
    Frontend থেকে আসা সিম্বল (যেমন 'EURUSD') আর market টাইপ ('real'/'otc')
    দেখে Quotex-এর নিজস্ব asset নাম বানায়।
    VERIFY: Quotex-এ OTC পেয়ারের নেমিং কনভেনশন সাধারণত '_otc' suffix
    (যেমন 'EURUSD_otc') — কিন্তু প্রতিটা পেয়ার Quotex-এ OTC ভার্সনে
    নাও থাকতে পারে, তাই /assets এন্ডপয়েন্ট দিয়ে আগে যাচাই করে নেওয়া ভালো।
    """
    clean = symbol.replace("/", "").upper()
    if market.lower() == "otc":
        return f"{clean}_otc"
    return clean


# ── ENDPOINT: হেলথ চেক ───────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "connected": state.connected,
        "last_error": state.last_error,
        "last_connected_at": state.last_connected_at,
        "account_mode": ACCOUNT_MODE,
    }


# ── ENDPOINT: উপলব্ধ Asset লিস্ট (Real + OTC ভেরিফাই করার জন্য) ────
@app.get("/assets")
async def list_assets(x_api_key: str = Header(default="")):
    verify_api_key(x_api_key)
    if not state.connected or not state.client:
        raise HTTPException(status_code=503, detail="Quotex এ কানেক্টেড না, একটু পর আবার চেষ্টা করো")
    try:
        # VERIFY: get_all_asset_name() বা get_all_assets() — ভার্সনভেদে নাম আলাদা হতে পারে
        assets = state.client.get_all_asset_name()
        return {"assets": assets}
    except Exception as e:
        log.exception("assets fetch error")
        raise HTTPException(status_code=500, detail=str(e))


# ── ENDPOINT: Candle ডেটা (মূল এন্ডপয়েন্ট — Node backend এটাই কল করবে) ──
@app.get("/candles")
async def get_candles(
    symbol: str = Query(..., description="যেমন: EURUSD"),
    market: str = Query("real", description="'real' অথবা 'otc'"),
    period: int = Query(60, description="candle timeframe সেকেন্ডে (default 60 = 1min)"),
    count: int = Query(150, ge=10, le=1000, description="কতগুলো candle লাগবে"),
    x_api_key: str = Header(default=""),
):
    verify_api_key(x_api_key)

    if not state.connected or not state.client:
        raise HTTPException(status_code=503, detail="Quotex এ কানেক্টেড না, একটু পর আবার চেষ্টা করো")

    asset = resolve_asset_name(symbol, market)

    try:
        # VERIFY: pyquotex-এ candle আনার মূল মেথড। সাধারণত এরকম সিগনেচার থাকে:
        #   await client.get_candles(asset, end_from_time, offset, period)
        # যেখানে end_from_time = এখনকার timestamp, offset = কত সেকেন্ড পিছনে যাবে।
        end_from_time = time.time()
        offset = count * period  # count-সংখ্যক candle পাওয়ার জন্য দরকারি time-window

        raw_candles = await state.client.get_candles(asset, end_from_time, offset, period)

        if not raw_candles:
            raise HTTPException(
                status_code=404,
                detail=f"'{asset}' এর জন্য কোনো candle ডেটা পাওয়া যায়নি (মার্কেট বন্ধ থাকতে পারে বা পেয়ার নেই)",
            )

        # ── প্রতিটা candle-কে frontend-এর signalEngine.js যে ফরম্যাট আশা করে
        #    (open/high/low/close/datetime) সেই ফরম্যাটে normalize করা ──
        normalized = []
        for c in raw_candles:
            # VERIFY: raw candle dict-এর key নাম — pyquotex সাধারণত
            # {'open':.., 'high':.., 'low':.., 'close':.., 'time':..} রিটার্ন করে
            normalized.append({
                "open": c.get("open"),
                "high": c.get("high"),
                "low": c.get("low"),
                "close": c.get("close"),
                "datetime": c.get("time") or c.get("datetime"),
            })

        return {
            "symbol": symbol,
            "market": market,
            "asset": asset,
            "period": period,
            "count": len(normalized),
            "values": normalized,
        }

    except HTTPException:
        raise
    except Exception as e:
        log.exception(f"candle fetch error for {asset}")
        raise HTTPException(status_code=500, detail=f"Candle আনতে সমস্যা হয়েছে: {e}")


# ── ENDPOINT: ব্যালেন্স (ডিবাগ/মনিটরিং-এর জন্য, ঐচ্ছিক) ──────────
@app.get("/balance")
async def get_balance(x_api_key: str = Header(default="")):
    verify_api_key(x_api_key)
    if not state.connected or not state.client:
        raise HTTPException(status_code=503, detail="Quotex এ কানেক্টেড না")
    try:
        balance = await state.client.get_balance()
        return {"balance": balance, "account_mode": ACCOUNT_MODE}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
