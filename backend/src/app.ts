import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { routes } from "./routes/index.js";

export const app = express();

// Middlewares globais da API Express: protecao HTTP, CORS restrito ao frontend e JSON.
app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL
  })
);
app.use(express.json());

// Todas as rotas versionadas entram em /api; erros nao tratados caem no handler padrao.
app.use("/api", routes);
app.use(errorHandler);
