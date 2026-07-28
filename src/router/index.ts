// router/index.ts

import { Express } from "express";
import adminRouter from "./rou.admin";
import bid from "./rou.bid";
import buy from "./rou.buy";
import collection from "./rou.collection";
import earning from "./rou.earning";
import event from "./rou.event";
import favourite from "./rou.favourite";

import { restrictedCors } from "../app";
import fileRouter from "./rou.file";
import importCollection from "./rou.importCollection";
import ipfsService from "./rou.ipfsService";
import Kyc from "./rou.kyc";
import merchant from "./rou.merchant";
import newsletter from "./rou.newsletter";
import nft from "./rou.nft";
import opt from "./rou.otp";
import payment from "./rou.payment";
import pricing from "./rou.Pricing";
import userProfile from "./rou.profile";
import ranking from "./rou.ranking";
import staking from "./rou.staking";
import swap from "./rou.swap";
import user from "./rou.User";


export const registerRoutes = (app: Express) => {
  app.get("/", (_, res) => res.send("Welcome to the Kunstify API!"));

   // marketplace 
  app.use("/",restrictedCors, fileRouter);
  app.use("/otp",restrictedCors, opt);
  app.use("/profile",restrictedCors, userProfile);
  app.use("/kyc",restrictedCors, Kyc);
  app.use("/collection",restrictedCors, collection);
  app.use("/nft",restrictedCors, nft);
  app.use('/pricing', pricing)
  
  app.use("/user",restrictedCors, user);
  app.use("/buy",restrictedCors, buy);
  app.use("/bid",restrictedCors, bid);
  app.use("/ranking",restrictedCors, ranking);
  app.use("/favourite",restrictedCors, favourite);
  app.use("/event",restrictedCors, event);
  app.use("/import",restrictedCors, importCollection);
  app.use("/newsletter",restrictedCors, newsletter);
  //admin
  app.use("/admin",restrictedCors, adminRouter);
  app.use("/payment",restrictedCors, payment);
  app.use("/marketplace-earnings",restrictedCors, earning);
  // ipfs 
  app.use("/ipfs",restrictedCors, ipfsService);
  //staking
  app.use("/staking",restrictedCors, staking);
  // kunstify pay
  app.use("/merchant",restrictedCors, merchant);
  // Tokens - swap 
  app.use("/swap", restrictedCors, swap);

  
};
