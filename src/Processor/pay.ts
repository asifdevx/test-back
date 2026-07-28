import { ethers, formatUnits } from "ethers";
import { PayConfig } from "../mongoDb/schemas/sch.payConfig";
import { Chain } from "../mongoDb/schemas/sch.paymentChain";
import { PaySubscriptionTxModel, SubscriptionStatus } from "../mongoDb/schemas/sch.paySubscription";
import { PaymentStatus, PayTx } from "../mongoDb/schemas/sch.payTx";
import { Payload } from "../types";

/// ----- utils
const ZERO_ADDRESS = ethers.ZeroAddress;

const handlePaySuccess = async ({ chainId, event }: Payload) => {
  const { sessionId, buyer, merchant, totalAmount, feeAmount, token } = event.args;

  const payment = await PayTx.findOne({ sessionId });

  if (!payment) return;

  if (payment.status === PaymentStatus.SUCCESS) return;
  const config = await PayConfig.findById(payment?.merchantId);

  if (!config) return;

  if (config.receiverAddress.toLowerCase() !== merchant.toLowerCase()) {
    console.error("❌ Merchant mismatch");
    return;
  }
  const chain = await Chain.findOne({ chainId, isActive: true });
  if (!chain) {
    console.error("❌ Unsupported chain");
    return;
  }

  // 🔥 token validation + decimals
  let decimals = 18;
  let isToken = false;
  let tokenAddress = ZERO_ADDRESS;

  if (token && token !== ZERO_ADDRESS) {
    const found = chain.tokens.find((t) => t.contractAddress.toLowerCase() === token.toLowerCase() && t.isActive);

    if (!found) {
      console.error("❌ Unsupported token");
      return;
    }

    decimals = found.decimals;
    isToken = true;
    tokenAddress = found.contractAddress;
  }

  const formattedFeeAmount = formatUnits(feeAmount, decimals);

  const updated = await PayTx.updateOne(
    { sessionId, status: { $ne: PaymentStatus.SUCCESS } },
    {
      $set: {
        status: PaymentStatus.SUCCESS,
        txHash: event.transactionHash,
        senderAddress: buyer,
        feeAmount: formattedFeeAmount,
        webhookStatus: "pending",
        webhookRetryCount: 0,
      },
    },
  );

  if (updated.modifiedCount > 0) {
    await PayConfig.updateOne({ _id: config._id }, { $inc: { txCount: 1 } });
  }

  if (payment.isSubscription) {
    const sub = await PaySubscriptionTxModel.findOne({
      merchantId: payment.merchantId,
      address: buyer.toLowerCase(),
      status: SubscriptionStatus.ACTIVE,
    });

    if (!sub) return;

    const nextDate = new Date(sub.nextBillingDate);

    if (sub.isMonthly) {
      nextDate.setMonth(nextDate.getMonth() + 1);
    } else {
      nextDate.setFullYear(nextDate.getFullYear() + 1);
    }

    await PaySubscriptionTxModel.updateOne(
      { _id: sub._id },
      {
        $set: { nextBillingDate: nextDate },
      },
    );
  }
};

const handlePayRefund = async ({ event }: Payload) => {
  const { merchantId } = event.args;
  await PayTx.findOneAndUpdate(
    { sessionId: merchantId },
    {
      $set: {
        isRefund: true,
      },
    },
  );
};

export { handlePayRefund, handlePaySuccess };
