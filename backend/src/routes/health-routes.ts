import { Router } from "express";
import { HealthController } from "../controllers/health-controller.js";

const healthRoutes = Router();
const healthController = new HealthController();

healthRoutes.get("/health", healthController.show);

export { healthRoutes };
