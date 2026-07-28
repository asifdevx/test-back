import express from 'express';
import { sendReplyEmail } from '../../utils/emailTemplet';
import { Contact } from '../schemas/sch.contact';

export const handleContact = async (req: express.Request, res: express.Response) => {
  const { address, name, email, message } = req.body;

  if (!address || !email || !message) {
    res.status(404).json({ success: false, message: 'Missing field' });
  }

  try {
    let conversation = await Contact.findOne({ address: address.toLowerCase() });
    if (!conversation) {
      conversation = await Contact.create({
        address,
        name,
        email,
        messages: [
          {
            sender: 'user',
            message,
          },
        ],
      });

      return res.status(201).json({
        success: true,
        message: 'Conversation created',
        conversationId: conversation._id,
      });
    }
    conversation.messages.push({
      sender: 'user',
      message,
    });

    conversation.lastMessageAt = new Date();
    conversation.isReadByAdmin = false;
    conversation.status= "open"
    await conversation.save();

    return res.status(200).json({
      success: true,
      message: 'Message added to existing conversation',
      conversationId: conversation._id,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getAllContact = async (req: express.Request, res: express.Response) => {
  try {
    const { search = '', status = 'open', page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const filter: any = {};
    if (search) {
      filter.$or = [{ address: { $regex: search, $options: 'i' } }, { gmail: { $regex: search, $options: 'i' } }];
    }
    filter.status = status;
    const conversations = await Contact.find(filter).sort({ lastMessageAt: -1 }).skip(skip).limit(Number(limit)).lean();
    const total = await Contact.countDocuments(filter);
    res.json({
      data: conversations,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        hasMore: skip + conversations.length < total,
      },
    });
  } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch users' });
  }
};



export const adminReply =  async (req: express.Request, res: express.Response)  => {
  try {
    const { conversationId } = req.params;
    const { message } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    // Find conversation
    const conversation = await Contact.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Add admin reply
    const newMessage = {
      sender: 'admin',
      message,
      sentAt: new Date(),
    };
    conversation.messages.push(newMessage);

    
    conversation.status = 'replied';
    conversation.lastMessageAt = new Date();
    conversation.isReadByAdmin = true;

    await conversation.save();

  await sendReplyEmail({ userEmail: conversation.email, userName: conversation.name ||"user", adminMessage: message });

    res.json({ success: true, conversation });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to send reply' });
  }
};


export const closeConversation = async (req: express.Request, res: express.Response) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Contact.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    conversation.status = 'closed';

    await conversation.save();

    res.json({
      success: true,
      message: 'Conversation closed successfully',
      conversationId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to close conversation' });
  }
};