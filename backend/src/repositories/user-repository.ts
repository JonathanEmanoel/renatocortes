import { prisma } from "../config/prisma.js";

export class UserRepository {
  /**
   * Busca usuarios com projecao limitada.
   * A consulta evita retornar senha ou dados sensiveis, mas ainda inclui
   * identificadores internos como `companyId`.
   */
  async findMany() {
    return prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        companyId: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }
}
