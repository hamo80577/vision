import type { FastifyRequest } from "fastify";

import { requireResolvedTenancyContext } from "@vision/tenancy";

export function requireTenancyContext(request: FastifyRequest) {
  return requireResolvedTenancyContext(request.tenancy);
}
