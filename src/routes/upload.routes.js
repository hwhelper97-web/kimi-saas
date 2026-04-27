const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload.middleware");
const authMiddleware = require("../middleware/auth.middleware");

router.post("/", authMiddleware, upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded" });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ success: true, url: fileUrl });
});

module.exports = router;
