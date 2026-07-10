import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "./app.js";

const appPromise = buildApp();

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const app = await appPromise;
  await app.ready();
  app.server.emit("request", request, response);
}
