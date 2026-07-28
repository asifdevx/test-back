import { ethers } from "ethers";

export function toWei(value: string | number, decimals: number): string {
  if (value === null || value === undefined) {
    throw new Error("Invalid amount");
  }

  const str = value.toString().trim();

  if (!/^\d+(\.\d+)?$/.test(str)) {
    throw new Error("Invalid numeric format");
  }

  const [int, frac = ""] = str.split(".");

  // trim extra decimals (floor)
  const safe = frac.length > decimals ? `${int}.${frac.slice(0, decimals)}` : str;

  return ethers.parseUnits(safe, decimals).toString();
}
