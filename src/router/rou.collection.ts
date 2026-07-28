import express from "express";
import {
    batchSelectNftFromCollection,
    changeCollectionBannerAndAvatar,
    exploreCollection,
    featureCollection,
    getCollectionFilters,
    getCollectionProfileData,
    handleSlugExists,
    searchCollection,
    updateCollection,
    userCollection,
} from "../mongoDb/controllers/c.collection";
const r = express.Router();

r.get("/slug-exists", handleSlugExists);
r.get("/getCollection/:address", userCollection);

r.post("/create-new-collection", updateCollection);
r.get("/searchCollection", searchCollection);
r.get("/explore-collection", exploreCollection);
r.get("/profile", getCollectionProfileData);
r.get("/filters", getCollectionFilters);
r.post("/:contractAddress/select", batchSelectNftFromCollection);
r.get("/feature-collection", featureCollection);
r.post("/change-banner&avatar", changeCollectionBannerAndAvatar);
export default r;
