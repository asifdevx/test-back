import { Schema, model } from "mongoose";

const OTPSchema = new Schema({
  address: { type: String, lowercase: true, index: true }, 
  otp: { type: String },
  email: { type: String, lowercase: true },
  mobile: { type: String},
  expiresAt: { type: Date },
  verified: { type: Boolean, default: false },
  attempts: { type: Number, default: 0 } ,
  

},{timestamps:true});

export const OTP = model("OTP", OTPSchema);