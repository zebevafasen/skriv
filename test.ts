import { OpenRouterProvider } from "@asterism/ai";
const provider = new OpenRouterProvider(process.env.OPENROUTER_API_KEY || "sk-or-v1-fake");
provider.complete({
  model: "google/gemini-flash-1.5",
  maxOutputTokens: 100,
  messages: [{ role: "user", content: "Test" }]
}).then(console.log).catch(console.error);
