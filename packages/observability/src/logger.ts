import type { ObservabilityContext } from "./context";
import { serializeErrorForLog } from "./errors";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogMeta = Record<string, unknown>;

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  environment: string;
  message: string;
  context?: Partial<ObservabilityContext>;
  meta?: LogMeta;
}

export interface VisionLogger {
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
  child(context: Partial<ObservabilityContext>): VisionLogger;
}

export interface CreateLoggerOptions {
  service: string;
  environment: string;
  level?: LogLevel;
  context?: Partial<ObservabilityContext>;
  now?: () => Date;
  write?: (line: string) => void;
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

function normalizeMeta(meta: LogMeta | undefined): LogMeta | undefined {
  if (meta === undefined) {
    return undefined;
  }

  const normalized: LogMeta = {};

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
  const write = options.write ?? ((line: string) => console.log(line));
  const now = options.now ?? (() => new Date());
  const baseContext = options.context;

  const writeEntry = (
    level: LogLevel,
    message: string,
    context: Partial<ObservabilityContext> | undefined,
    meta: LogMeta | undefined
  ) => {
    if (LOG_LEVEL_WEIGHT[level] < LOG_LEVEL_WEIGHT[threshold]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: now().toISOString(),
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

    write(JSON.stringify(entry));
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
