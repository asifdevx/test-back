import { ethers } from "ethers";

import { DOZ_TOKEN_ADDRESS, WAVAX_ADDRESS } from "../config/swap.config";

import { POOL_ABI } from "../constant/abi";
import env from "../constant/env";
import { DozAdminModel } from "../mongoDb/schemas/sch.DozRewordPool";
import { SwapTransaction } from "../mongoDb/schemas/sch.swapTx";
import { getPriceBySymbol } from "../utils/price";
import { getRpcForPool } from "./dozAmm.service";
import { DozPriceCandleModel, DozCandleInterval } from "../mongoDb/schemas/sch.dozPriceCandle";
import { DozPriceTickModel } from "../mongoDb/schemas/sch.dozPriceTick";

const WrapperAVAX_ADDRESS = (WAVAX_ADDRESS as string)?.toLowerCase();
const DOZ_ADDR_LC = DOZ_TOKEN_ADDRESS.toLowerCase();

interface RecordDozSwapPriceParams {
  txHash: string;
  walletAddress: string;
  fromAddress: string;
  toAddress: string;
  fromAmountRaw: string; // wei
  toAmountRaw: string;   // wei
  tradedAt?: Date;
}

const INTERVAL_MS: Record<DozCandleInterval, number> = {
  [DozCandleInterval.ONE_MIN]: 60_000,
  [DozCandleInterval.FIVE_MIN]: 5 * 60_000,
  [DozCandleInterval.FIFTEEN_MIN]: 15 * 60_000,
  [DozCandleInterval.ONE_HOUR]: 60 * 60_000,
  [DozCandleInterval.FOUR_HOUR]: 4 * 60 * 60_000,
  [DozCandleInterval.ONE_DAY]: 24 * 60 * 60_000,
};

function floorToInterval(date: Date, ms: number): Date {
  return new Date(Math.floor(date.getTime() / ms) * ms);
}

export function isDozAddress(address: string): boolean {
  return address?.toLowerCase() === DOZ_ADDR_LC;
}

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

// ── Pool decode ──────────────────────────────────────────────────────────────

interface PoolSnapshot {
  dozPriceInAvax: number; // value of 1 DOZ, denominated in AVAX (decimal-corrected, human-readable)
  reserveDoz: bigint; // raw DOZ balance held by the pool (DOZ's own decimals)
  reserveAvax: bigint; // raw WAVAX balance held by the pool (WAVAX's own decimals)
  dozDecimals: number;
  avaxDecimals: number;
}

async function readPoolSnapshot(): Promise<PoolSnapshot> {
  const pool = getPoolContract();
  const [token0, token1, reserves, spotPriceX18] = await Promise.all([pool.token0(), pool.token1(), pool.getReserves(), pool.getSpotPriceX18()]);

  const t0 = (token0 as string).toLowerCase();
  const t1 = (token1 as string).toLowerCase();

  const dozIsToken0 = t0 === DOZ_ADDR_LC;
  const knownPair = (t0 === DOZ_ADDR_LC && t1 === WrapperAVAX_ADDRESS) || (t1 === DOZ_ADDR_LC && t0 === WrapperAVAX_ADDRESS);
  if (!knownPair) {
    throw new Error(`DozAvaxPool token0/token1 (${t0}, ${t1}) don't match configured DOZ/WAVAX addresses`);
  }

  const token0Contract = new ethers.Contract(t0, ERC20_ABI, getProvider());
  const token1Contract = new ethers.Contract(t1, ERC20_ABI, getProvider());
  const [decimals0Raw, decimals1Raw] = await Promise.all([token0Contract.decimals(), token1Contract.decimals()]);
  const decimals0 = Number(decimals0Raw);
  const decimals1 = Number(decimals1Raw);

  const priceX18 = spotPriceX18 as bigint;
  if (priceX18 === 0n) throw new Error("Pool not initialized (spot price is zero)");
  const rawRatio = Number(priceX18) / 1e18;
  const humanPrice1Per0 = rawRatio * 10 ** (decimals0 - decimals1);

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
  const [supply] = await token.totalSupply();
  return Number(supply as bigint) / 10 ** 18;
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

// ── 24h-ago price, read from our own candle history ───────────────────────────

async function get24hAgoPrice(): Promise<number | null> {
  const target = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const candle = await DozPriceCandleModel.findOne({
    interval: DozCandleInterval.ONE_HOUR,
    bucketStart: { $lte: target },
  })
    .sort({ bucketStart: -1 })
    .lean();

  return candle ? candle.close : null;
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
  const [avaxPriceUsd, snapshot] = await Promise.all([getPriceBySymbol("AVAX"), readPoolSnapshot()]);

  const dozPriceUsd = snapshot.dozPriceInAvax * avaxPriceUsd;

  const [totalSupply, volumeInfo, price24hAgo] = await Promise.all([
    getDozTotalSupplyFormatted(),
    getDoz24hVolumeUsd(dozPriceUsd, snapshot.dozDecimals),
    get24hAgoPrice(),
  ]);

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

  DozAdminModel.updateOne({ _id: "admin" }, { $set: { dozValueInUsd: dozPriceUsd } }, { upsert: true }).catch((err) => console.error("Failed to sync DozAdmin.dozValueInUsd:", err));

  return result;
}

export async function recordDozSwapPrice(params: RecordDozSwapPriceParams): Promise<void> {
  const fromIsDoz = isDozAddress(params.fromAddress);
  const toIsDoz = isDozAddress(params.toAddress);
  if (fromIsDoz === toIsDoz) return; 

  let snapshot: PoolSnapshot;
  let avaxUsd: number;
  try {
    [snapshot, avaxUsd] = await Promise.all([readPoolSnapshot(), getPriceBySymbol("AVAX")]);
  } catch (err) {
    console.error("Failed to read pool snapshot for DOZ price tick:", err);
    return;
  }

  const priceAvax = snapshot.dozPriceInAvax;
  const priceUsd = priceAvax * avaxUsd;

  const dozAmount = Number(fromIsDoz ? params.fromAmountRaw : params.toAmountRaw) / 10 ** snapshot.dozDecimals;
  const avaxAmount = Number(fromIsDoz ? params.toAmountRaw : params.fromAmountRaw) / 10 ** snapshot.avaxDecimals;
  if (!dozAmount || !avaxAmount) return;

  const tradedAt = params.tradedAt ?? new Date();

  try {
    await DozPriceTickModel.create({
      txHash: params.txHash.toLowerCase(),
      priceAvax,
      priceUsd,
      zeroForOne: fromIsDoz,
      amountDoz: dozAmount,
      amountAvax: avaxAmount,
      walletAddress: params.walletAddress?.toLowerCase(),
      tradedAt,
    });
  } catch (err: any) {
    if (err?.code !== 11000) console.error("Failed to store DOZ price tick:", err);
  }

  await Promise.all(Object.values(DozCandleInterval).map((i) => upsertCandle(i, tradedAt, priceUsd, dozAmount, avaxAmount)));
}

async function upsertCandle(interval: DozCandleInterval, tradedAt: Date, price: number, dozAmount: number, avaxAmount: number) {
  const bucketStart = floorToInterval(tradedAt, INTERVAL_MS[interval]);
  await DozPriceCandleModel.findOneAndUpdate(
    { interval, bucketStart },
    {
      $min: { low: price },
      $max: { high: price },
      $set: { close: price },
      $setOnInsert: { open: price },
      $inc: { volumeDoz: dozAmount, volumeAvax: avaxAmount, trades: 1 },
    },
    { upsert: true, setDefaultsOnInsert: true },
  );
}