import { UserRepository } from "../repositories/user-repository.js";

export class UserService {
  constructor(private readonly userRepository = new UserRepository()) {}

  /**
   * Lista usuarios expostos pela API backend.
   * A service ainda nao aplica filtro de permissao; qualquer protecao adicional
   * precisa ser adicionada na rota/controller antes de expor este endpoint.
   */
  async list() {
    return this.userRepository.findMany();
  }
}
