import { Document, Schema, model } from "mongoose";
export enum NewsletterStatus {
  ACTIVE = "active",
  PENDING = "pending",
  UNACTIVE = "unactive",
}
export interface INewsletter extends Document {
  email: string;

  status: NewsletterStatus;

  confirmToken?: string;
  unsubscribeToken?: string;
  tokenExpires?: Date;

  verifiedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const mailingListSchema = new Schema<INewsletter>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      unique: true,
      index: true,
    },

    status: {
      type: String,
      enum: Object.values(NewsletterStatus),
      default: NewsletterStatus.PENDING,

      index: true,
    },

    confirmToken: {
      type: String,
      index: true,
    },
    unsubscribeToken: {
      type: String,
      index: true,
    },

    tokenExpires: {
      type: Date,
    },

    verifiedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

export const MailingList = model<INewsletter>("MailingList", mailingListSchema);
