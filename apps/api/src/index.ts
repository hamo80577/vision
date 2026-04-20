import { getApiListenOptions } from "./runtime";
import { buildApi } from "./server";

const api = buildApi();

try {
  await api.listen(getApiListenOptions());
} catch (error: unknown) {
  api.log.error(error);
  process.exit(1);
}
