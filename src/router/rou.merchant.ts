import { Router } from "express";
import {
    addDirector,
    changeMerchantGateway,
    changeOwnerShip,
    createApiKey,
    createRecurringApi,
    deleteApiKey,
    deleteMerchant,
    getAllChartData,
    getDirectors,
    getMerchantApiKeys,
    getStats,
    getSubscriptionHistory,
    getTxHistory,
    removeDirector,
    toggleDirector,
    toggleSubscriptionStatus,
} from "../mongoDb/controllers/c.merchant";
import { getCheckoutDetails, getFilterChainRegister, getRefunded, getReviewDetails, getUserSessionDetails, getUserStatus, submitMerchantKyc } from "../mongoDb/controllers/c.pay";



const router = Router();
router.get("/user-status",getUserStatus)
router.post("/add-merchant-user-kyc",submitMerchantKyc);



//! checkout 
router.post("/user-session-details",getUserSessionDetails);
router.post("/checkout-review",getReviewDetails);
router.post("/checkout-init", getCheckoutDetails);

// ! Merchant Dashboard
router.get("/stats",getStats)
router.post("/change-gateway",changeMerchantGateway)
// ! directors 
router.get("/directors", getDirectors);
router.post ("/add-director",addDirector);
router.post("/toggle-director-status", toggleDirector);
router.post("/change-ownership", changeOwnerShip);
router.post("/remove-director", removeDirector);
router.post("/delete-merchant", deleteMerchant);
// ! directors 
router.post("/getRefundedData",getRefunded);

router.get("/chart-data", getAllChartData);  /// Merchant Chart Data 
router.get("/txHistory", getTxHistory);  /// Merchant Chart Data 
//! APi- Key
router.get("/apis",getMerchantApiKeys);
router.post("/create-api", createApiKey);
router.delete("/delete-api/:keyId", deleteApiKey);
//! ---- Subscription 
router.post("/create-user-subscription", createRecurringApi);
router.get("/GET-subscription-history", getSubscriptionHistory);
router.post("/subscription-toggle", toggleSubscriptionStatus);
// ! --- chains 
router.get("/chains/register",getFilterChainRegister);
export default router;