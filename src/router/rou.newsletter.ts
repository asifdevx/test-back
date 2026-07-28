import express, { Request, Response } from "express";
import { addMailToList, confirmSubscription, unsubscribe } from "../mongoDb/controllers/c.mailingList";
import { MailingList, NewsletterStatus } from "../mongoDb/schemas/sch.mailingList"; // adjust path to your model

const router = express.Router();

router.post("/", addMailToList);
router.post("/confirm", confirmSubscription);
router.post("/unsubscribe", unsubscribe);

router.get("/get", async (req: Request, res: Response) => {
  const { search } = req.query;

  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 12;

    const baseFilter = {
      status: NewsletterStatus.ACTIVE, 
    };

    const searchFilter = search
      ? {
          $or: [{ email: { $regex: search, $options: "i" } }],
        }
      : {};

    const filter = { ...baseFilter, ...searchFilter };

    const skip = (page - 1) * limit;

    const [subscribers, totalCount] = await Promise.all([MailingList.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), MailingList.countDocuments(filter)]);

    const hasMore = skip + subscribers.length < totalCount;

    return res.status(200).json({
      success: true,
      data: subscribers,
      pagination: {
        total: totalCount,
        page,
        limit,
        hasMore,
      },
    });
  } catch (error: any) {
    console.error("Mailing List Fetch Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
});
export default router;
