import express from "express";

const router = express.Router();

router.get("/test", (req, res) => {
  const PORT = process.env.PORT || 5000;
  res.json({
    message: "Server is running on port " + PORT,
    timestamp: new Date().toISOString(),
  });
});

export default router;
