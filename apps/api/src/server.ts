import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";

import {
  createLogger,
  createNoopTracer,
  extendObservabilityContext,
  sanitizeProblemInstance,
  type ObservabilityTracer,
  type VisionLogger
} from "@vision/observability";

import "./fastify-types";
import { mapApiErrorToProblem } from "./http-errors";
import { createApiRequestContext } from "./request-context";
import { getApiRuntimeConfig, type ApiRuntimeConfig } from "./runtime";

export type ApiBuildDependencies = {
  runtime: ApiRuntimeConfig;
  logger: VisionLogger;
  tracer: ObservabilityTracer;
};

const REQUEST_ID_HEADER = "x-request-id";
const CORRELATION_ID_HEADER = "x-correlation-id";

function getProtectedHeaderValue(
  name: string,
  context: ReturnType<typeof createApiRequestContext>
): string | undefined {
  const normalizedName = name.toLowerCase();

  if (normalizedName === REQUEST_ID_HEADER) {
    return context.requestId;
  }

  if (normalizedName === CORRELATION_ID_HEADER) {
    return context.correlationId;
  }

  return undefined;
}

function applyResponseContextHeaders(
  reply: FastifyReply,
  context: ReturnType<typeof createApiRequestContext>
): void {
  reply.header(REQUEST_ID_HEADER, context.requestId);
  reply.header(CORRELATION_ID_HEADER, context.correlationId);
}

function protectResponseContextHeaders(
  reply: FastifyReply,
  context: ReturnType<typeof createApiRequestContext>
): void {
  type ReplyHeaders = NonNullable<Parameters<FastifyReply["headers"]>[0]>;

  const originalHeader = reply.header.bind(reply);
  const originalHeaders = reply.headers.bind(reply);
  const originalSetHeader = reply.raw.setHeader.bind(reply.raw);

  reply.header = ((name: string, value: unknown) => {
    return originalHeader(name, getProtectedHeaderValue(name, context) ?? value);
  }) as typeof reply.header;

  reply.headers = ((values: ReplyHeaders) => {
    const nextValues = Object.entries(values).reduce<ReplyHeaders>(
      (accumulator, [name, value]) => {
        accumulator[name as keyof ReplyHeaders] = (
          getProtectedHeaderValue(name, context) ?? value
        ) as ReplyHeaders[keyof ReplyHeaders];

        return accumulator;
      },
      {}
    );

    return originalHeaders(nextValues);
  }) as typeof reply.headers;

  reply.raw.setHeader = ((name: string, value: number | string | readonly string[]) => {
    return originalSetHeader(name, getProtectedHeaderValue(name, context) ?? value);
  }) as typeof reply.raw.setHeader;
}

export function buildApi(
  overrides: Partial<ApiBuildDependencies> = {}
): FastifyInstance {
  const runtime = overrides.runtime ?? getApiRuntimeConfig();
  const rootLogger =
    overrides.logger ??
    createLogger({
      service: runtime.serviceName,
      environment: runtime.appEnv,
      level: runtime.logLevel
    });
  const tracer = overrides.tracer ?? createNoopTracer();
  const api = Fastify({
    logger: false
  });

  api.decorateRequest("activeTrace", null);
  api.decorateRequest("observabilityContext", null);
  api.decorateRequest("requestLogger", null);
  api.decorateRequest("requestStartedAt", null);

  api.addHook("onRequest", async (request, reply) => {
    request.requestStartedAt = Date.now();

    const baseContext = createApiRequestContext(request, runtime);
    const activeTrace = tracer.startTrace("http.request");
    const context = activeTrace.traceId
      ? extendObservabilityContext(baseContext, {
          traceId: activeTrace.traceId
        })
      : baseContext;

    request.activeTrace = activeTrace;
    request.observabilityContext = context;
    request.requestLogger = rootLogger.child(context);

    protectResponseContextHeaders(reply, context);
    applyResponseContextHeaders(reply, context);
  });

  api.addHook("onSend", async (request, reply, payload) => {
    const context =
      request.observabilityContext ?? createApiRequestContext(request, runtime);

    applyResponseContextHeaders(reply, context);

    return payload;
  });

  api.addHook("onResponse", async (request, reply) => {
    const context =
      request.observabilityContext ?? createApiRequestContext(request, runtime);
    const requestLogger = request.requestLogger ?? rootLogger.child(context);
    const durationMs = Math.max(
      0,
      Date.now() - (request.requestStartedAt ?? Date.now())
    );

    request.activeTrace?.end({
      statusCode: reply.statusCode
    });

    requestLogger.info("request.completed", {
      method: request.method,
      route: sanitizeProblemInstance(request.routeOptions.url ?? request.url),
      statusCode: reply.statusCode,
      durationMs
    });
  });

  api.setErrorHandler((error, request, reply) => {
    const context =
      request.observabilityContext ?? createApiRequestContext(request, runtime);
    const requestLogger = request.requestLogger ?? rootLogger.child(context);
    const { statusCode, problem } = mapApiErrorToProblem(error, request, context);

    request.activeTrace?.error(error);

    requestLogger.error("request.failed", {
      method: request.method,
      route: sanitizeProblemInstance(request.routeOptions.url ?? request.url),
      statusCode,
      problem,
      error
    });

    reply
      .type("application/problem+json")
      .code(statusCode)
      .headers({
        "x-request-id": context.requestId,
        "x-correlation-id": context.correlationId
      })
      .send(problem);
  });

  api.get("/health", async () => ({
    service: runtime.serviceName,
    status: "ok"
  }));

  return api;
}
