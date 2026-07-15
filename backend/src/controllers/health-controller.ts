import type { Request, Response } from "express";

export class HealthController {
  show(_request: Request, response: Response) {
    return response.status(200).json({
      status: "ok",
      service: "Renato Cortes Barbearia API"
    });
  }
}
