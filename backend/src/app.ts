import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { routes } from "./routes/index.js";

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL
  })
);
app.use(express.json());
app.use("/api", routes);
app.use(errorHandler);
