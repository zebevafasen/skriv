import { loadServerEnv } from "@asterism/config";
import { buildApp } from "./app.js";

const env = loadServerEnv();
const app = await buildApp(env);

try {
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
