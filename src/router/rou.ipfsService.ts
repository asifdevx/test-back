import axios from "axios";
import express from "express";
import FormData from "form-data";
import multer from "multer";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
});

const PINATA_JWT = process.env.PINATA_JWT;

// ---------------- FILE UPLOAD ----------------
router.post("/folder", upload.array("files"), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];

    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "No files received under field name 'files'" });
    }

    const formData = new FormData();

    files.forEach((file) => {
      formData.append("file", file.buffer, {
        filepath: `assets/${file.originalname}`,
      });
    });

    const pinataRes = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, {
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      headers: {
        Authorization: `Bearer ${process.env.PINATA_JWT}`,
        ...formData.getHeaders(),
      },
    });

    res.json({ cid: `ipfs://${pinataRes.data.IpfsHash}` });
  } catch (error: any) {
    console.error("Folder Upload Error:", error?.response?.data || error?.message ||error);
    res.status(500).json({ error: "Folder upload to IPFS failed" });
  }
});
router.post("/file", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (!process.env.PINATA_JWT) {
      throw new Error("PINATA_JWT missing");
    }

    const formData = new FormData();
    formData.append("file", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    const pinataRes = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, {
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 120000,
      headers: {
        Authorization: `Bearer ${process.env.PINATA_JWT}`,
        ...formData.getHeaders(),
        "Content-Length": formData.getLengthSync(),
      },
    });

    res.json({
      cid: `ipfs://${pinataRes.data.IpfsHash}`,
    });
  } catch (error: any) {
    console.error("========== /ipfs/file ERROR ==========");
    console.error("Message:", error.message);

    if (error.response) {
      console.error("Pinata status:", error.response.status);
      console.error("Pinata data:", error.response.data);
    }

    if (error.request) {
      console.error("Request made but no response received");
    }

    res.status(500).json({ error: "Upload to IPFS failed" });
  }
});

//-------- METADATA UPLOAD ----------------
router.post("/metadata", async (req, res) => {
  try {
    const pinataRes = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", req.body, {
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
    });

    res.json({ cid: `ipfs://${pinataRes.data.IpfsHash}` });
  } catch (error: any) {
    console.error("=== Pinata Metadata Upload Error ===");
    if (error.response) {
      console.error("Status code:", error.response.status);
    } else {
      console.error("Error message:", error.message);
    }
    res.status(500).json({ error: "Metadata upload failed" });
  }
});

export default router;
