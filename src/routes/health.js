import { Router } from "express";
import { getStats } from "../vectorStore.js";
import { CONFIG } from "../config.js";
import { getTrainingStatus } from "./training.js";

const router = Router();

// ─────────────────────────────────────────
//  Health check
// ─────────────────────────────────────────
router.get("/health", async (req, res) => {
  const stats = await getStats();
  const trainingStatus = getTrainingStatus();
  res.json({
    status: "ok",
    totalChunks: stats.totalChunks,
    isTrainingRunning: trainingStatus.isRunning,
    embeddingModel: CONFIG.EMBEDDING_MODEL_PATH,
  });
});

export default router;
