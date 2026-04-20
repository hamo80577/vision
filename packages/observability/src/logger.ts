import type { ObservabilityContext } from "./context";
import { serializeErrorForLog } from "./errors";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogMetadata = Record<string, unknown>;
export type LogSink = (line: string) => void;
export type Clock = () => Date;

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  environment: string;
  message: string;
  context?: Partial<ObservabilityContext>;
  meta?: LogMetadata;
}

export interface VisionLogger {
  debug(message: string, meta?: LogMetadata): void;
  info(message: string, meta?: LogMetadata): void;
  warn(message: string, meta?: LogMetadata): void;
  error(message: string, meta?: LogMetadata): void;
  child(context: Partial<ObservabilityContext>): VisionLogger;
}

export interface CreateLoggerOptions {
  service: string;
  environment: string;
  level?: LogLevel;
  context?: Partial<ObservabilityContext>;
  sink?: LogSink;
  clock?: Clock;
  now?: Clock;
  write?: LogSink;
}

const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function mergeContext(
  parent: Partial<ObservabilityContext> | undefined,
  next: Partial<ObservabilityContext> | undefined
): Partial<ObservabilityContext> | undefined {
  if (!parent && !next) {
    return undefined;
  }

  return {
    ...parent,
    ...next
  };
}

function hasKeys(record: Record<string, unknown> | undefined): boolean {
  return record !== undefined && Object.keys(record).length > 0;
}

function normalizeMeta(meta: LogMetadata | undefined): LogMetadata | undefined {
  if (meta === undefined) {
    return undefined;
  }

  const normalized: LogMetadata = {};

  for (const [key, value] of Object.entries(meta)) {
    if (value instanceof Error) {
      normalized[key] = serializeErrorForLog(value);
      continue;
    }

    normalized[key] = value;
  }

  return hasKeys(normalized) ? normalized : undefined;
}

export function createLogger(options: CreateLoggerOptions): VisionLogger {
  const threshold = options.level ?? "info";
  const sink = options.sink ?? options.write ?? ((line: string) => console.log(line));
  const clock = options.clock ?? options.now ?? (() => new Date());
  const baseContext = options.context;

  const writeEntry = (
    level: LogLevel,
    message: string,
    context: Partial<ObservabilityContext> | undefined,
    meta: LogMetadata | undefined
  ) => {
    if (LOG_LEVEL_WEIGHT[level] < LOG_LEVEL_WEIGHT[threshold]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: clock().toISOString(),
      level,
      service: options.service,
      environment: options.environment,
      message
    };

    const normalizedContext = context && Object.keys(context).length > 0 ? context : undefined;
    if (normalizedContext) {
      entry.context = normalizedContext;
    }

    const normalizedMeta = normalizeMeta(meta);
    if (normalizedMeta) {
      entry.meta = normalizedMeta;
    }

    sink(JSON.stringify(entry));
  };

  const createScopedLogger = (
    context: Partial<ObservabilityContext> | undefined
  ): VisionLogger => ({
    debug(message, meta) {
      writeEntry("debug", message, context, meta);
    },
    info(message, meta) {
      writeEntry("info", message, context, meta);
    },
    warn(message, meta) {
      writeEntry("warn", message, context, meta);
    },
    error(message, meta) {
      writeEntry("error", message, context, meta);
    },
    child(childContext) {
      return createScopedLogger(mergeContext(context, childContext));
    }
  });

  return createScopedLogger(baseContext);
}
