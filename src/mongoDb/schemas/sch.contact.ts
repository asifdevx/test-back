import mongoose, { model } from 'mongoose';

const MessageSchema = new mongoose.Schema(
  {
    sender: {
      type: String,
      enum: ['user', 'admin'],
      required: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const ContactConversationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },

    status: {
      type: String,
      enum: ['open', 'replied', 'closed'],
      default: 'open',
    },

    messages: {
      type: [MessageSchema],
      default: [],
    },

    lastMessageAt: {
      type: Date,
      default: Date.now,
    },

    isReadByAdmin: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);


export const Contact = model('contact', ContactConversationSchema);

