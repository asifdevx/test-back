import { handleCollectionCreated } from "./Factory";
import { handleDozPayment, handlePayment } from "./Payment";
import { handleERC1155BatchMinted, handleERC721BatchMinted } from "./mint";
import { handlePayRefund, handlePaySuccess } from "./pay";
import { handleRewardClaimed, handleRewardPool } from "./rewardPool";
import { handleStakedNfts, handleUnStakedNfts } from "./staking";
import { handleERC1155Transfer, handleERC721Transfer } from "./transfer";

import { handleBuy } from "./buy";
export const processor: Record<string, any> = {
  // /---------------- Factory ----------------
  ERC721FACTORYCollectionCreated: handleCollectionCreated,
  ERC1155FACTORYCollectionCreated: handleCollectionCreated,

  ERC721Transfer: handleERC721Transfer,
  ERC1155TransferSingle: handleERC1155Transfer,

  ERC721BatchMinted: handleERC721BatchMinted,
  ERC1155BatchMinted: handleERC1155BatchMinted,
  /// ---------------- Payment ----------------
  PAYMENTPackagePurchased: handlePayment,
  PAYMENTPackagePurchasedERC20: handleDozPayment,

  MARKETPLACEBatchOrderFilled: handleBuy,

  /// --------------- Staking -----------------
  STAKINGNFTStaked: handleStakedNfts,
  STAKINGNFTWithdrawn: handleUnStakedNfts,

  /// --------------- Staking Reward -----------------
  REWARDDeposited: handleRewardPool,
  REWARDClaimed: handleRewardClaimed,

  /// --------------- PAY -----------------
  PAYPaymentSuccess: handlePaySuccess,
  PAYRefunded: handlePayRefund,
  
};
