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

type ProtectedContext = ReturnType<typeof createApiRequestContext>;

function getProtectedHeaderValue(
  name: string,
  context: ProtectedContext
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

function applyProtectedHeadersToHeaderRecord(
  headers: Record<string, unknown>,
  context: ProtectedContext
): Record<string, unknown> {
  return {
    ...headers,
    [REQUEST_ID_HEADER]: context.requestId,
    [CORRELATION_ID_HEADER]: context.correlationId
  };
}

function applyProtectedHeadersToRawHeaderPairs(
  headers: readonly unknown[],
  context: ProtectedContext
): unknown[] {
  const nextHeaders = [...headers];
  let sawRequestId = false;
  let sawCorrelationId = false;

  for (let index = 0; index < nextHeaders.length - 1; index += 2) {
    const name = nextHeaders[index];

    if (typeof name !== "string") {
      continue;
    }

    const protectedValue = getProtectedHeaderValue(name, context);
    if (protectedValue === undefined) {
      continue;
    }

    nextHeaders[index + 1] = protectedValue;

    if (name.toLowerCase() === REQUEST_ID_HEADER) {
      sawRequestId = true;
    }

    if (name.toLowerCase() === CORRELATION_ID_HEADER) {
      sawCorrelationId = true;
    }
  }

  if (!sawRequestId) {
    nextHeaders.push(REQUEST_ID_HEADER, context.requestId);
  }

  if (!sawCorrelationId) {
    nextHeaders.push(CORRELATION_ID_HEADER, context.correlationId);
  }

  return nextHeaders;
}

function applyProtectedHeadersToWriteHeadArgument(
  headers: unknown,
  context: ProtectedContext
): unknown {
  if (Array.isArray(headers)) {
    return applyProtectedHeadersToRawHeaderPairs(headers, context);
  }

  if (headers && typeof headers === "object") {
    return applyProtectedHeadersToHeaderRecord(
      headers as Record<string, unknown>,
      context
    );
  }

  return headers;
}

function applyProtectedHeadersToIterable(
  headers: Headers | Map<string, number | string | readonly string[]>,
  context: ProtectedContext
): Headers | Map<string, number | string | readonly string[]> {
  if (headers instanceof Headers) {
    const nextHeaders = new Headers(headers);
    nextHeaders.set(REQUEST_ID_HEADER, context.requestId);
    nextHeaders.set(CORRELATION_ID_HEADER, context.correlationId);

    return nextHeaders;
  }

  const nextHeaders = new Map(headers);
  nextHeaders.set(REQUEST_ID_HEADER, context.requestId);
  nextHeaders.set(CORRELATION_ID_HEADER, context.correlationId);

  return nextHeaders;
}

function applyResponseContextHeaders(
  reply: FastifyReply,
  context: ProtectedContext
): void {
  reply.header(REQUEST_ID_HEADER, context.requestId);
  reply.header(CORRELATION_ID_HEADER, context.correlationId);
}

function protectResponseContextHeaders(
  reply: FastifyReply,
  context: ProtectedContext
): void {
  type ReplyHeaders = NonNullable<Parameters<FastifyReply["headers"]>[0]>;

  const originalHeader = reply.header.bind(reply);
  const originalRemoveHeader = reply.removeHeader.bind(reply);
  const originalHeaders = reply.headers.bind(reply);
  const originalSetHeader = reply.raw.setHeader.bind(reply.raw);
  const originalRawRemoveHeader = reply.raw.removeHeader.bind(reply.raw);
  const originalWriteHead = reply.raw.writeHead.bind(reply.raw);
  const originalAppendHeader = reply.raw.appendHeader?.bind(reply.raw);
  const originalSetHeaders = reply.raw.setHeaders?.bind(reply.raw);

  reply.header = ((name: string, value: unknown) => {
    return originalHeader(name, getProtectedHeaderValue(name, context) ?? value);
  }) as typeof reply.header;

  reply.removeHeader = ((name: string) => {
    const protectedValue = getProtectedHeaderValue(name, context);

    if (protectedValue !== undefined) {
      originalHeader(name, protectedValue);
      return reply;
    }

    return originalRemoveHeader(name);
  }) as typeof reply.removeHeader;

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

  if (originalAppendHeader) {
    reply.raw.appendHeader = ((name: string, value: string | readonly string[]) => {
      const protectedValue = getProtectedHeaderValue(name, context);

      if (protectedValue !== undefined) {
        originalSetHeader(name, protectedValue);
        return reply.raw;
      }

      return originalAppendHeader(name, value);
    }) as typeof reply.raw.appendHeader;
  }

  if (originalSetHeaders) {
    reply.raw.setHeaders = ((headers: Headers | Map<string, number | string | readonly string[]>) => {
      return originalSetHeaders(applyProtectedHeadersToIterable(headers, context));
    }) as typeof reply.raw.setHeaders;
  }

  reply.raw.removeHeader = ((name: string) => {
    const protectedValue = getProtectedHeaderValue(name, context);

    if (protectedValue !== undefined) {
      originalSetHeader(name, protectedValue);
      return reply.raw;
    }

    return originalRawRemoveHeader(name);
  }) as typeof reply.raw.removeHeader;

  reply.raw.writeHead = ((...args: unknown[]) => {
    if (args.length >= 3) {
      args[2] = applyProtectedHeadersToWriteHeadArgument(args[2], context);
    } else if (args.length >= 2 && typeof args[1] !== "string") {
      args[1] = applyProtectedHeadersToWriteHeadArgument(args[1], context);
    }

    return originalWriteHead(...(args as Parameters<typeof reply.raw.writeHead>));
  }) as typeof reply.raw.writeHead;
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
