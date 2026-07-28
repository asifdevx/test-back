import { Document, Schema, Types, model } from "mongoose";


export enum UserRoles {
  USER= "user",
  CREATOR= "creator",
  ADMIN= "admin",
  MODERATOR= "moderator",
}
export interface IUser extends Document {
  address: string;
  name?: string;
  isFirstTime: boolean;
  role: UserRoles;
  profile?: Types.ObjectId;
  kyc?: Types.ObjectId;
  isVerified: boolean;
  isBanned: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
export interface IProfile extends Document {
  address: string;
  displayName?: string;
  email?: string;
  emailVerify?: boolean;
  mobileVerify?: boolean;
  bio?: string;
  links: {
    x: string;
    instagram: string;
    website: string;
  };
  avatarUrl?: string;
  bannerUrl?: string;
  mobile: string;
  activeNewsletters: boolean;
  verified: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const ProfileSchema = new Schema<IProfile>({
  address: { type: String, lowercase: true, unique: true, index: true },
  displayName: { type: String, index: true },
  email: { type: String, lowercase: true, unique: true, sparse: true },
  bio: String,
  links: {
    x: { type: String, default: "" },
    instagram: { type: String, default: "" },
    website: { type: String, default: "" },
  },
  avatarUrl: String,
  bannerUrl: String,
  mobile: String,
  emailVerify: { type: Boolean, default: false },
  mobileVerify: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  activeNewsletters: { type: Boolean, default: false },
  verified: { type: Boolean, default: false },
});

const UserSchema = new Schema<IUser>(
  {
    address: {
      type: String,
      lowercase: true,
      unique: true,
      required: true,
      index: true,
    },

    name: {
      type: String,
      index: true,
    },

    isFirstTime: {
      type: Boolean,
      default: true,
    },

    role: {
      type: String,
      enum: UserRoles,
      default: UserRoles.USER,
    },
    profile: {
      type: Schema.Types.ObjectId,
      ref: "Profile",
      index: true,
    },

    kyc: {
      type: Schema.Types.ObjectId,
      ref: "Kyc",
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    isBanned: {
      type: Boolean,
      default: false,
    },

    lastLoginAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

ProfileSchema.index({ address: 1 }, { unique: true });
ProfileSchema.index({ displayName: 1 });
ProfileSchema.index({ email: 1 }, { sparse: true });
ProfileSchema.index({ activeNewsletters: 1 });

UserSchema.index({ address: 1 }, { unique: true });
UserSchema.index({ role: 1, isBanned: 1 });
UserSchema.index({ createdAt: -1 });

export const User = model<IUser>("User", UserSchema);
export const Profile = model<IProfile>("Profile", ProfileSchema);
