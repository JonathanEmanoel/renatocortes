import type { Request, Response } from "express";
import { UserService } from "../services/user-service.js";

export class UserController {
  constructor(private readonly userService = new UserService()) {}

  async index(_request: Request, response: Response) {
    const users = await this.userService.list();
    return response.json(users);
  }
}
