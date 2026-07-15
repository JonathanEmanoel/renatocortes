import { Router } from "express";
import { healthRoutes } from "./health-routes.js";
import { userRoutes } from "./user-routes.js";

const routes = Router();

routes.use(healthRoutes);
routes.use(userRoutes);

export { routes };
