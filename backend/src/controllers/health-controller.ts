import type { Request, Response } from "express";

export class HealthController {
  /**
   * Healthcheck simples para verificar se o processo Express esta respondendo.
   * Nao testa banco de dados nem dependencias externas.
   */
  show(_request: Request, response: Response) {
    return response.status(200).json({
      status: "ok",
      service: "Renato Cortes Barbearia API"
    });
  }
}
