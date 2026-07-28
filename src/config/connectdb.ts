import dotenv from "dotenv";
import mongoose from "mongoose";
dotenv.config();

const mongodbURI = process.env.MONGODB_URI;
if (!mongodbURI) {
  throw new Error("MOngodb Uri not set")
}

export const connectDB = async () => {
  console.log(mongodbURI);

  try {
    const conn = await mongoose.connect(mongodbURI);
    console.log("[✅ Database] Connected  ");




  } catch (error) {
    console.error(error);
  }
};

