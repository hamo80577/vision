import { parseWorkerConfig } from "@vision/config";

import { getWorkerStatus } from "./status";

const config = parseWorkerConfig(process.env);

console.log(JSON.stringify(getWorkerStatus(config.appEnv)));
