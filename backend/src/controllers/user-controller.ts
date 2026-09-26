import type { Request, Response } from "express";
import { UserService } from "../services/user-service.js";

export class UserController {
  constructor(private readonly userService = new UserService()) {}

  /**
   * Retorna a lista de usuarios consultada pela camada de servico.
   * Nao transforma o payload alem do JSON porque o repository ja seleciona os
   * campos permitidos para esta API.
   */
  async index(_request: Request, response: Response) {
    const users = await this.userService.list();
    return response.json(users);
  }
}
