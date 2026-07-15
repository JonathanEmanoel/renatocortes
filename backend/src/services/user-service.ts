import { UserRepository } from "../repositories/user-repository.js";

export class UserService {
  constructor(private readonly userRepository = new UserRepository()) {}

  async list() {
    return this.userRepository.findMany();
  }
}
