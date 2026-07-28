import { Request, Response, Router } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { colBucket, kycBucket, profileBucket } from "../config/connectdb"; // Import buckets from your DB file
import { uploadToGridFS } from "../services/gridfs";

const router = Router();
const storage = multer.memoryStorage();
const upload = multer({ storage });

// POST /upload/:type
router.post("/upload/:type", upload.single("file"), async (req:Request, res:Response) => {
  try {
    const { type } = req.params;
    const file = req.file;

    if (!file) return res.status(400).json({ error: "File required" });

    let bucket;
    switch (type) {
      case "kyc":
        bucket = kycBucket;
        break;
      case "profile":
        bucket = profileBucket;
        break;
      case "collection":
        bucket = colBucket;
        break;
      default:
        return res.status(400).json({ error: "Invalid upload type" });
    }

    const fileId = await uploadToGridFS(bucket, file, { type });

    res.json({
      success: true,
      fileId,
      url: `/file/${type}/${fileId}`,
    });
  } catch (err) {
    res.status(500).json({ error: "Upload failed" });
  }
});

// GET /file/:type/:id
router.get("/file/:type/:id", async (req, res) => {
  
  try {
    const { type, id } = req.params;
   
    let bucket;
    if (type === "kyc") bucket = kycBucket;
    else if (type === "profile") bucket = profileBucket;
    else if (type === "collection") bucket = colBucket;
    else return res.status(400).json({ error: "Invalid type" });

    const _id = new mongoose.Types.ObjectId(id);

    // look up file metadata first so we can set headers correctly
    const files = await bucket.find({ _id }).toArray();
    if (!files.length) return res.status(404).json({ error: "Not found" });

    const file = files[0];
    res.set("Content-Type", file.contentType || "application/octet-stream");
    res.set("Content-Length", String(file.length));
    res.set("Cache-Control", "public, max-age=31536000, immutable");

    const stream = bucket.openDownloadStream(_id);
    stream.on("error", () => res.status(404).end());
    stream.pipe(res);
  } catch {
    res.status(400).json({ error: "Invalid ID" });
  }
});

export default router;
