import type { ErrorRequestHandler } from "express";

/**
 * Handler final de erros nao tratados.
 * Loga o erro no servidor e devolve mensagem generica para nao vazar detalhes
 * internos da API ao cliente.
 */
export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  console.error(error);

  return response.status(500).json({
    message: "Erro interno do servidor."
  });
};
