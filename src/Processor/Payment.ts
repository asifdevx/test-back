import { updateSubscription } from "../mongoDb/controllers/c.pricing";
import { Payload } from "../types";

export const handlePayment = async ({ event }: Payload) => {
  try {
    const { user, pkgId: pkgid, amountWei, callType } = event.args;
    const userAddr = String(user).toLowerCase();
    const pkgId = Number(pkgid) as 0 | 1 | 2 | 3;
    const mode = callType === "business" ? "business" : "nft";

    await updateSubscription({
      address: userAddr,
      pkgId,
      mode,
    });
  } catch (error) {
    console.error("Error in PaymentPackagePurchased handler:", error);
  }
};
export const handleDozPayment = async ({ event }: Payload) => {
  try {
    const { user, token, pkgId: pkgid, amountWei, callType } = event.args;

    const userAddr = String(user).toLowerCase();
    const pkgId = Number(pkgid) as 0 | 1 | 2 | 3;
    const mode = callType === "business" ? "business" : "nft";

    await updateSubscription({
      address: userAddr,
      pkgId,
      mode,
    });
  } catch (error) {
    console.error("Error in PaymentPackagePurchased handler:", error);
  }
};
