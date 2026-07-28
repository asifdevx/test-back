import { ethers } from "ethers";
import { redis } from "../config/redis";
import { DOZ_TOKEN_ADDRESS, WAVAX_ADDRESS } from "../config/swap.config";

import { POOL_ABI } from "../constant/abi";
import env from "../constant/env";
import { DozAdminModel } from "../mongoDb/schemas/sch.DozRewordPool";
import { SwapTransaction } from "../mongoDb/schemas/sch.swapTx";
import { getPriceBySymbol } from "../utils/price";
import { getRpcForPool } from "./dozAmm.service";

const WrapperAVAX_ADDRESS = (WAVAX_ADDRESS as string)?.toLowerCase();

const DOZ_ADDR_LC = DOZ_TOKEN_ADDRESS.toLowerCase();

const ERC20_ABI = ["function decimals() view returns (uint8)", "function totalSupply() view returns (uint256)"];

let _provider: ethers.JsonRpcProvider | null = null;
function getProvider() {
  if (!_provider) _provider = new ethers.JsonRpcProvider(getRpcForPool);
  return _provider;
}

function getPoolContract() {
  return new ethers.Contract(env.POOL_ADDRESS, POOL_ABI, getProvider());
}

const CACHE_KEY = "doz:market:data";
const CACHE_TTL_SECONDS = 30;
const PRICE_HISTORY_KEY = "doz:price:history"; // redis zset — score=timestamp(ms), member="ts:price"

// ── Pool decode ──────────────────────────────────────────────────────────────

interface PoolSnapshot {
  dozPriceInAvax: number; // value of 1 DOZ, denominated in AVAX (decimal-corrected, human-readable)
  reserveDoz: bigint; // raw DOZ balance held by the pool (DOZ's own decimals)
  reserveAvax: bigint; // raw WAVAX balance held by the pool (WAVAX's own decimals)
  dozDecimals: number;
  avaxDecimals: number;
}

// DOZ's decimals never change on-chain — fetch once and reuse everywhere instead of
// re-querying per call (readPoolSnapshot, getDozTotalSupplyFormatted, volume calc all need it).
let _dozDecimalsPromise: Promise<number> | null = null;
function getDozDecimals(): Promise<number> {
  if (!_dozDecimalsPromise) {
    const token = new ethers.Contract(DOZ_TOKEN_ADDRESS, ERC20_ABI, getProvider());
    _dozDecimalsPromise = token.decimals().then((d: bigint | number) => Number(d));
  }
  return _dozDecimalsPromise;
}

async function readPoolSnapshot(): Promise<PoolSnapshot> {
  const pool = getPoolContract();
  const [token0, token1, reserves, spotPriceX18] = await Promise.all([pool.token0(), pool.token1(), pool.getReserves(), pool.getSpotPriceX18()]);

  const t0 = (token0 as string).toLowerCase();
  const t1 = (token1 as string).toLowerCase();

  const dozIsToken0 = t0 === DOZ_ADDR_LC;
  // compare against the lowercased WAVAX address — comparing against the raw
  // (possibly checksum-cased) config value here would silently never match
  const knownPair = (t0 === DOZ_ADDR_LC && t1 === WrapperAVAX_ADDRESS) || (t1 === DOZ_ADDR_LC && t0 === WrapperAVAX_ADDRESS);
  if (!knownPair) {
    throw new Error(`DozAvaxPool token0/token1 (${t0}, ${t1}) don't match configured DOZ/WAVAX addresses`);
  }

  // DO NOT assume 18/18 — pull each token's real decimals. getSpotPriceX18 is a *raw*
  // (wei-for-wei) ratio; it only equals the human-readable price when both tokens share
  // the same decimals, which isn't guaranteed.
  const token0Contract = new ethers.Contract(t0, ERC20_ABI, getProvider());
  const token1Contract = new ethers.Contract(t1, ERC20_ABI, getProvider());
  const [decimals0Raw, decimals1Raw] = await Promise.all([token0Contract.decimals(), token1Contract.decimals()]);
  const decimals0 = Number(decimals0Raw);
  const decimals1 = Number(decimals1Raw);

  // price1Per0X18 = token1_raw / token0_raw, scaled 1e18 — correct it to a human
  // (whole-token) price: human1Per0 = raw1Per0 * 10^(decimals0 - decimals1)
  const priceX18 = spotPriceX18 as bigint;
  if (priceX18 === 0n) throw new Error("Pool not initialized (spot price is zero)");
  const rawRatio = Number(priceX18) / 1e18;
  const humanPrice1Per0 = rawRatio * 10 ** (decimals0 - decimals1);

  // normalize to "1 DOZ = X AVAX" regardless of which side is token0
  const dozPriceInAvax = dozIsToken0 ? humanPrice1Per0 : 1 / humanPrice1Per0;

  const [reserve0, reserve1] = reserves as [bigint, bigint];
  const reserveDoz = dozIsToken0 ? reserve0 : reserve1;
  const reserveAvax = dozIsToken0 ? reserve1 : reserve0;
  const dozDecimals = dozIsToken0 ? decimals0 : decimals1;
  const avaxDecimals = dozIsToken0 ? decimals1 : decimals0;

  return { dozPriceInAvax, reserveDoz, reserveAvax, dozDecimals, avaxDecimals };
}

async function getDozTotalSupplyFormatted(): Promise<number> {
  const token = new ethers.Contract(DOZ_TOKEN_ADDRESS, ERC20_ABI, getProvider());
  const [supply, decimals] = await Promise.all([token.totalSupply(), getDozDecimals()]);
  return Number(supply as bigint) / 10 ** decimals;
}

// ── 24h volume from your own swap history ────────────────────────────────────

async function getDoz24hVolumeUsd(dozPriceUsd: number, dozDecimals: number): Promise<{ volumeUsd: number; txns24h: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const txs = await SwapTransaction.find({
    createdAt: { $gte: since },
    $or: [{ "from.address": DOZ_ADDR_LC }, { "to.address": DOZ_ADDR_LC }],
  })
    .select("from to")
    .lean();

  let volumeUsd = 0;
  const scale = 10 ** dozDecimals;
  for (const tx of txs) {
    const dozSide = tx.from.address === DOZ_ADDR_LC ? tx.from : tx.to;
    volumeUsd += (Number(dozSide.amount) / scale) * dozPriceUsd;
  }

  return { volumeUsd, txns24h: txs.length };
}

async function recordPriceSnapshot(priceUsd: number): Promise<void> {
  if (!redis) return;
  const now = Date.now();
  await redis.zadd(PRICE_HISTORY_KEY, now, `${now}:${priceUsd}`);
  // trim anything older than 25h so the set doesn't grow forever
  await redis.zremrangebyscore(PRICE_HISTORY_KEY, 0, now - 25 * 60 * 60 * 1000);
}

async function get24hAgoPrice(): Promise<number | null> {
  if (!redis) return null;
  const target = Date.now() - 24 * 60 * 60 * 1000;
  // first snapshot at/after the 24h-ago mark — closest we have to that point in time
  const results: string[] = await redis.zrangebyscore(PRICE_HISTORY_KEY, target, "+inf", "LIMIT", 0, 1);
  if (!results.length) return null;
  const [, priceStr] = results[0].split(":");
  const price = Number(priceStr);
  return Number.isFinite(price) ? price : null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface DozMarketData {
  priceUsd: number;
  priceChange24h: number | null;
  marketCap: number;
  liquidity: number;
  volume24h: number;
  txns24h: number;
  reserveDoz: string;
  reserveAvax: string;
}

export async function getDozMarketData(): Promise<DozMarketData> {
  if (redis) {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return JSON.parse(cached);
  }

  const [avaxPriceUsd, goldPriceUsd, snapshot] = await Promise.all([
    getPriceBySymbol("AVAX"),
    getPriceBySymbol("PAXG"),
    readPoolSnapshot(),
  ]);



  const dozPriceUsd = goldPriceUsd;

  const [totalSupply, volumeInfo, price24hAgo] = await Promise.all([getDozTotalSupplyFormatted(), getDoz24hVolumeUsd(dozPriceUsd, snapshot.dozDecimals), get24hAgoPrice()]);

  const reserveAvaxFormatted = Number(snapshot.reserveAvax) / 10 ** snapshot.avaxDecimals;
  const reserveDozFormatted = Number(snapshot.reserveDoz) / 10 ** snapshot.dozDecimals;

  const liquidityUsd = reserveAvaxFormatted * avaxPriceUsd + reserveDozFormatted * dozPriceUsd;

  const priceChange24h = price24hAgo && price24hAgo > 0 ? ((dozPriceUsd - price24hAgo) / price24hAgo) * 100 : null;

  const result: DozMarketData = {
    priceUsd: dozPriceUsd,
    priceChange24h,
    marketCap: dozPriceUsd * totalSupply,
    liquidity: liquidityUsd,
    volume24h: volumeInfo.volumeUsd,
    txns24h: volumeInfo.txns24h,
    reserveDoz: snapshot.reserveDoz.toString(),
    reserveAvax: snapshot.reserveAvax.toString(),
  };

  recordPriceSnapshot(dozPriceUsd).catch((err) => console.error("Failed to record DOZ price snapshot:", err));

  DozAdminModel.updateOne({ _id: "admin" }, { $set: { dozValueInUsd: dozPriceUsd } }, { upsert: true }).catch((err) => console.error("Failed to sync DozAdmin.dozValueInUsd:", err));

  if (redis) {
    await redis.set(CACHE_KEY, JSON.stringify(result), "EX", CACHE_TTL_SECONDS);
  }

  return result;
}
