import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "./app.js";

let appPromise: ReturnType<typeof buildApp> | undefined;

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  appPromise ??= buildApp();
  const app = await appPromise;
  await app.ready();
  app.server.emit("request", request, response);
}
