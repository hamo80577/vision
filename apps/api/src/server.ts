import Fastify, { type FastifyInstance } from "fastify";

export function buildApi(): FastifyInstance {
  const api = Fastify({
    logger: false
  });

  api.get("/health", async () => ({
    service: "vision-api",
    status: "ok"
  }));

  return api;
}
