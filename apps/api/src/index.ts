import { buildApi } from "./server";

const api = buildApi();
const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

await api.listen({ host, port }).catch((error: unknown) => {
  api.log.error(error);
  process.exit(1);
});
