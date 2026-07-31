import { ethers } from "ethers";

import { DOZ_TOKEN_ADDRESS, WAVAX_ADDRESS } from "../config/swap.config";
import env from "../constant/env";
import { DozAdminModel } from "../mongoDb/schemas/sch.DozRewordPool";
import { SwapTransaction } from "../mongoDb/schemas/sch.swapTx";
import { getPriceBySymbol } from "../utils/price";
import { pool, provider } from "./dozAmm.service"; // reuse the same pool contract instance
import { DozPriceCandleModel, DozCandleInterval } from "../mongoDb/schemas/sch.dozPriceCandle";
import { DozPriceTickModel } from "../mongoDb/schemas/sch.dozPriceTick";

const WAVAX_ADDR_LC = (WAVAX_ADDRESS as string)?.toLowerCase();
const DOZ_ADDR_LC = DOZ_TOKEN_ADDRESS.toLowerCase();

export function isDozAddress(address: string): boolean {
  return address?.toLowerCase() === DOZ_ADDR_LC;
}

const ERC20_ABI = ["function decimals() view returns (uint8)", "function totalSupply() view returns (uint256)"];

interface PoolSnapshot {
  dozPriceInAvax: number; // 1 DOZ = ? AVAX
  reserveDoz: bigint;
  reserveAvax: bigint;
  dozDecimals: number;
  avaxDecimals: number;
}

// Step 1: doz = ? avax — read straight off the pool contract (same one dozAmm.service.ts uses)
async function readPoolSnapshot(): Promise<PoolSnapshot> {
  const [token0, token1, reserves, spotPriceX18] = await Promise.all([pool.token0(), pool.token1(), pool.getReserves(), pool.getSpotPriceX18()]);

  const t0 = (token0 as string).toLowerCase();
  const t1 = (token1 as string).toLowerCase();
  const dozIsToken0 = t0 === DOZ_ADDR_LC;

  const knownPair = (t0 === DOZ_ADDR_LC && t1 === WAVAX_ADDR_LC) || (t1 === DOZ_ADDR_LC && t0 === WAVAX_ADDR_LC);
  if (!knownPair) throw new Error(`Pool tokens (${t0}, ${t1}) don't match configured DOZ/WAVAX addresses`);

  const token0Contract = new ethers.Contract(t0, ERC20_ABI, provider);
  const token1Contract = new ethers.Contract(t1, ERC20_ABI, provider);
  const [decimals0, decimals1] = await Promise.all([token0Contract.decimals(), token1Contract.decimals()]).then(([a, b]) => [Number(a), Number(b)]);

  const priceX18 = spotPriceX18 as bigint;
  if (priceX18 === 0n) throw new Error("Pool not initialized (spot price is zero)");
  const rawRatio = Number(priceX18) / 1e18;
  const humanPrice1Per0 = rawRatio * 10 ** (decimals0 - decimals1);
  const dozPriceInAvax = dozIsToken0 ? humanPrice1Per0 : 1 / humanPrice1Per0;

  const [reserve0, reserve1] = reserves as [bigint, bigint];

  return {
    dozPriceInAvax,
    reserveDoz: dozIsToken0 ? reserve0 : reserve1,
    reserveAvax: dozIsToken0 ? reserve1 : reserve0,
    dozDecimals: dozIsToken0 ? decimals0 : decimals1,
    avaxDecimals: dozIsToken0 ? decimals1 : decimals0,
  };
}

async function getDozTotalSupplyFormatted(dozDecimals: number): Promise<number> {
  const token = new ethers.Contract(DOZ_TOKEN_ADDRESS, ERC20_ABI, provider);
  const supply = await token.totalSupply();
  return Number(supply as bigint) / 10 ** dozDecimals;
}

async function getDoz24hVolumeUsd(dozPriceUsd: number, dozDecimals: number): Promise<{ volumeUsd: number; txns24h: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const txs = await SwapTransaction.find({
    createdAt: { $gte: since },
    $or: [{ "from.address": DOZ_ADDR_LC }, { "to.address": DOZ_ADDR_LC }],
  })
    .select("from to")
    .lean();

  const scale = 10 ** dozDecimals;
  let volumeUsd = 0;
  for (const tx of txs) {
    const dozSide = tx.from.address === DOZ_ADDR_LC ? tx.from : tx.to;
    volumeUsd += (Number(dozSide.amount) / scale) * dozPriceUsd;
  }

  return { volumeUsd, txns24h: txs.length };
}

async function get24hAgoPrice(): Promise<number | null> {
  const target = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const candle = await DozPriceCandleModel.findOne({ interval: DozCandleInterval.ONE_HOUR, bucketStart: { $lte: target } })
    .sort({ bucketStart: -1 })
    .lean();
  return candle ? candle.close : null;
}

// ── Public API ──────────────────────────────────────────────────────────────

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
  const [avaxUsd, snapshot] = await Promise.all([getPriceBySymbol("AVAX"), readPoolSnapshot()]);
  const dozPriceUsd = snapshot.dozPriceInAvax * avaxUsd; // step 1 * step 2, as described

  const [totalSupply, volumeInfo, price24hAgo] = await Promise.all([
    getDozTotalSupplyFormatted(snapshot.dozDecimals),
    getDoz24hVolumeUsd(dozPriceUsd, snapshot.dozDecimals),
    get24hAgoPrice(),
  ]);

  const reserveAvaxFormatted = Number(snapshot.reserveAvax) / 10 ** snapshot.avaxDecimals;
  const reserveDozFormatted = Number(snapshot.reserveDoz) / 10 ** snapshot.dozDecimals;
  const liquidityUsd = reserveAvaxFormatted * avaxUsd + reserveDozFormatted * dozPriceUsd;
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

interface RecordDozSwapPriceParams {
  txHash: string;
  walletAddress: string;
  fromAddress: string;
  toAddress: string;
  fromAmountRaw: string;
  toAmountRaw: string;
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

/** Called from the /swap/tx route after a DOZ trade — records the post-trade price for the chart. */
export async function recordDozSwapPrice(params: RecordDozSwapPriceParams): Promise<void> {
  const fromIsDoz = isDozAddress(params.fromAddress);
  const toIsDoz = isDozAddress(params.toAddress);
  if (fromIsDoz === toIsDoz) return; // not a DOZ leg

  let snapshot: PoolSnapshot;
  let avaxUsd: number;
  try {
    [snapshot, avaxUsd] = await Promise.all([readPoolSnapshot(), getPriceBySymbol("AVAX")]);
  } catch (err) {
    console.error("Failed to read pool for DOZ price tick:", err);
    return;
  }

  // doz = ? avax
  const priceAvax = snapshot.dozPriceInAvax;
  // avax -> usd, then doz(usd) = doz(avax) * avax(usd)
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