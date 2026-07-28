import { Router } from "express";
import {
    addDozReward,
    calculateDozReward,
    checkMonStakingForUser,
    claimAssets,
    getDozGeneratedSignature,
    getMyDoz,
    getMyStaking,
    getMyStakingActivity,
    getPublicStakingActivity,
    getStakeGeneratedSignature,
    getStakeValidatorData,
    getStakingCollectionData,
    getTokenColNftData,
    handleUpdateCoinStake,
    unStakeAssets,
    updateMonadWithdrawId,
} from "../mongoDb/controllers/c.staking";
import { deleteSession, getSession, startSession, updateSession } from "../mongoDb/controllers/c.staking_session";

const rou = Router();
/**
 *  !   ----------- Session
 */
rou.post("/session/start", startSession);
rou.post("/session/update", updateSession);
rou.get("/session", getSession);
rou.delete("/session/:sessionId", deleteSession);

/**
 *  !   ----------- stakeFlow
 */
rou.get("/getValidator", getStakeValidatorData);
/**
 *  !   ----------- Token Page
 */

rou.post("/update-or-create-coin-stake", handleUpdateCoinStake);
rou.get("/get-my-staking", getMyStaking);
rou.get("/get-my-collections", getStakingCollectionData);
rou.get("/get-my-staking-nfts", getTokenColNftData);

/**
 *  !   ----------- My Staking
 */
rou.get("/get_my_doz_reward", getMyDoz);
rou.post("/get-stake-generated-signature", getStakeGeneratedSignature);
rou.get("/get_my_staking_activity", getMyStakingActivity);
rou.get("/get_public_staking_activity", getPublicStakingActivity);
rou.post("/unstake-assets", unStakeAssets);
rou.post("/claimed-assets", claimAssets);
rou.post("/check-mon-staking-for-user",checkMonStakingForUser);
rou.post("/update-mon-withdraw-id", updateMonadWithdrawId);

/**
 *  !   ----------- DOz
*/
rou.post("/get-doz-generated-signature", getDozGeneratedSignature);
rou.post("/calculate-doz-reward", calculateDozReward);
rou.post("/add-doz-reward", addDozReward);
export default rou;
