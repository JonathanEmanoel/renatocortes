import { prisma } from "../config/prisma.js";

export class UserRepository {
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
