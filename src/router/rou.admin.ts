import { Router } from "express";
import { getBusinessKycs, reviewKyc } from "../mongoDb/controllers/c.admin-business-kyc";
import { sendMail } from "../mongoDb/controllers/c.admin-campaign";
import { createRegister, deleteRegister, getChainsRegister } from "../mongoDb/controllers/c.admin-chains";
import { getCollection, getCollectionStats7d, handleDeleteCollection, handleVerifyCollection } from "../mongoDb/controllers/c.admin-collection";
import { collectionByCategory, countMarketplaceStatistic, getSaleOverTime } from "../mongoDb/controllers/c.admin-dashboard";
import { deletePayConfig, getAllConfigsForAdmin, updatePayConfigByAdmin } from "../mongoDb/controllers/c.admin-merchant";

import { adminMiddleware } from "../middleware/middleware-auth";
import { getPayTransaction, handleNofifyTxReturn } from "../mongoDb/controllers/c.admin-payTx";
import { getDozSwapRestrictionStatus, listPositions, logMint, logRemove, updateDozSwapRestrictionStatus } from "../mongoDb/controllers/c.admin-poolAdmin";
import { createPricingList, updatePricing } from "../mongoDb/controllers/c.admin-pricing";
import { getReports } from "../mongoDb/controllers/c.admin-report";
import { handleChangeUserRole, handleUsers } from "../mongoDb/controllers/c.admin-role";
import { deleteStaking, getStakingDetails, upgradeStaking } from "../mongoDb/controllers/c.admin-stake";
import { exportSwapTransactionsCsv, listSwapTransactions } from "../mongoDb/controllers/c.admin-swapTx";
import { getAllUsers, getUserActivity, handleDeleteUser, handleToggleBan, handleToggleVerified, handleuserPkg } from "../mongoDb/controllers/c.admin-user";
import { getAllRewards, getDozContractConfig, updateChainRewards, updateDozValue, updateMinDozWithdaw } from "../mongoDb/controllers/c.admin.reward";

import { adminReply, closeConversation, getAllContact, handleContact } from "../mongoDb/controllers/c.contact";

const router = Router();
router.use(adminMiddleware);
//! ---- dashboard
router.get("/dashboard/stats", countMarketplaceStatistic);
router.get("/dashboard/sale-vs-time", getSaleOverTime);
router.get("/dashboard/collectionByCategory", collectionByCategory);

// ! ---- Report  Manager
router.get("/reports", getReports);

// ! ---- SWAP Tx
router.get("/swap/tx", listSwapTransactions);
router.get("/swapTx/export", exportSwapTransactionsCsv);

// ! ---- Business  Manager
router.get("/pay/business-kyc", getBusinessKycs);
router.patch("/pay/admin-review-documentation/:id", reviewKyc);

//! ---- - Collection Manager
router.get("/collections/get-collection", getCollection);
router.get("/collections/collection-chart", getCollectionStats7d);
router.patch("/collections/verify-collection", handleVerifyCollection);
router.delete("/collections/delete-collection", handleDeleteCollection);

// ! ---- User  Manager
router.get("/users", getAllUsers);
router.get("/user/activity", getUserActivity);
router.patch("/users/verify", handleToggleVerified);
router.patch("/users/ban", handleToggleBan);
router.patch("/users/package", handleuserPkg);
router.delete("/users", handleDeleteUser);

// ! ---- Role  Manager
router.get("/role", handleUsers);
router.patch("/role/:id", handleChangeUserRole);

// ! ---- Pool Admin Manager--------------
router.post("/positions/mint", logMint);
router.post("/positions/remove", logRemove);
router.get("/positions", listPositions);
router.get("/positions/doz-restriction", getDozSwapRestrictionStatus);
router.put("/positions/doz-restriction", updateDozSwapRestrictionStatus);

//! ---- Pricing Control
router.post("/pricing", createPricingList);
router.put("/pricing/:id", updatePricing);


//! ---- Stake Manage
router.get("/staking", getStakingDetails);
router.put("/staking/:id", upgradeStaking);
router.delete("/staking/:id", deleteStaking);

//! ---- DOz reward +reward condition
router.get("/reward/get-conditon", getAllRewards);
router.post("/reward/upgrade-condition", updateChainRewards);
router.get("/reward/get-doz-reward-contracts-status", getDozContractConfig);
router.post("/reward/update-doz-min-withdraw", updateMinDozWithdaw);
router.post("/reward/update-doz-value", updateDozValue);

//! ---- Pay Transaction
router.get("/pay-transaction", getPayTransaction);
router.post("/notify-tx-return", handleNofifyTxReturn);

//! ---- Merchant Manager
router.get("/merchant-config", getAllConfigsForAdmin);
router.patch("/merchant-config/:id", updatePayConfigByAdmin);
router.delete("/merchant-config", deletePayConfig);

//! ---- Register Token
router.get("/chains/register", getChainsRegister);
router.post("/chains/register", createRegister);
router.delete("/chains/register", deleteRegister);

//! ---- Support Manager
router.post("/contact/", handleContact);
router.get("/contact/get-all-message", getAllContact);
router.post("/contact/reply/:conversationId", adminReply);
router.delete("/contact/close/:conversationId", closeConversation);

//! ---- Email campaign
router.post("/campaign", sendMail);

export default router;
