import handler from "../.vercel-build/api-handler.mjs";

export default function apiHandler(request, response) {
  const url = new URL(request.url ?? "/api", "http://localhost");
  const path = url.searchParams.get("__skriv_path");
  if (path !== null) {
    url.searchParams.delete("__skriv_path");
    const query = url.searchParams.toString();
    request.url = `/api/${path}${query ? `?${query}` : ""}`;
  }
  return handler(request, response);
}
