import dotenv from "dotenv";
import mongoose from "mongoose";
dotenv.config();

const mongodbURI= process.env.MONGODB_URI;
export let kycBucket: mongoose.mongo.GridFSBucket;
export let profileBucket: mongoose.mongo.GridFSBucket;
export let colBucket: mongoose.mongo.GridFSBucket;
if (!mongodbURI){
  throw new Error("MOngodb Uri not set")
}

export const connectDB = async () => {
  console.log(mongodbURI);
  
    try {
      const conn = await mongoose.connect(mongodbURI);
      console.log("[✅ Database] Connected  ");
      
      kycBucket = new mongoose.mongo.GridFSBucket(conn.connection.db, { bucketName: "kycFiles" });
      profileBucket = new mongoose.mongo.GridFSBucket(conn.connection.db, { bucketName: "profileImages" });
      colBucket = new mongoose.mongo.GridFSBucket(conn.connection.db, { bucketName: "collectionMedia" });
    } catch (error) {
      console.error(error);
    }
  };

