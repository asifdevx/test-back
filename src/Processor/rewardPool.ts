import { DozAdminModel } from "../mongoDb/schemas/sch.DozRewordPool";
import { StakeBonus } from "../mongoDb/schemas/sch.stakeBonus";
import { StakeEventModel, StakeEventType, StakeType } from "../mongoDb/schemas/sch.StakeEvent";
import { Payload } from "../types";

export async function handleRewardPool({ type, event }: Payload) {
  const { _, amount } = event.args;

  try {
    let pool = await DozAdminModel.findById("admin");
    const currentBalance = BigInt(pool.contractBalance || 0);
    const newBalance = currentBalance + BigInt(amount.toString());

    await DozAdminModel.findByIdAndUpdate(
      "admin",
      {
        $set: {
          contractBalance: newBalance.toString(),
        },
      },
      { upsert: true, new: true },
    );
  } catch (err:any) {
    console.error("[handleRewardPool] event erro :", err?.message);
  }
}

export async function handleRewardClaimed({ chainId, type, event }: Payload) {
  const { user, amount, nonce } = event.args;
  const incNonce = Number(nonce) + 1;
  try {
    await StakeBonus.findOneAndUpdate(
      { user: user.toLowerCase() },
      {
        $set: { amount: 0, nonce: incNonce },
      },
      { upsert: true, new: true },
    );
    await StakeEventModel.create({
      chainId,
      stakeType: StakeType.TOKEN,
      eventType: StakeEventType.CLAIM,
      address: user.toLowerCase(),
      amount: amount.toString(),
      txHash: event?.transactionHash,
      timestamp: Date.now(),
    });
    let pool = await DozAdminModel.findById("admin");
    const currentBalance = BigInt(pool?.contractBalance || 0);
    const newBalance = currentBalance - BigInt(amount.toString());

    pool.contractBalance = String(newBalance);
    pool.save();
  } catch (error) {
    console.error("RewardClaimed handler error:", error);
  }
}
