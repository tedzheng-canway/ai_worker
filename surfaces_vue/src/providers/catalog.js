// Provider logo registry (UX-DECISIONS §39): official brand marks for the onboarding
// provider gallery. Most are vendored from the MIT-licensed lobe-icons set; BytePlus is
// its official website mark, used with permission. All stay bundled like connector assets
// (no CDN at runtime). Keys are /v1/providers names; unknown names get no mark (the gallery
// falls back to a neutral monogram). PROVIDER_ORDER is the gallery order — recognition
// first, long tail behind the scroll fold.

import anthropic from "./logos/anthropic.svg";
import openai from "./logos/openai.svg";
import gemini from "./logos/gemini.svg";
import byteplus from "./logos/byteplus.svg";
import volcengine from "./logos/volcengine.svg";
import ollama from "./logos/ollama.svg";
import bedrock from "./logos/bedrock.svg";
import vertex from "./logos/vertex.svg";
import openrouter from "./logos/openrouter.svg";
import fireworks from "./logos/fireworks.svg";
import together from "./logos/together.svg";
import zai from "./logos/zai.svg";
import kimi from "./logos/kimi.svg";
import deepseek from "./logos/deepseek.svg";
import mistral from "./logos/mistral.svg";
import qwen from "./logos/qwen.svg";
import minimax from "./logos/minimax.svg";
import xai from "./logos/xai.svg";
import meta from "./logos/meta.svg";

export const PROVIDER_LOGOS = {
  anthropic,
  openai,
  // The subscription provider wears the same vendor mark — it's the same models,
  // different billing (owner call 2026-08-21: no bare-letter monogram).
  "openai-codex": openai,
  gemini,
  ark: byteplus,
  "ark-agent-plan-cn": volcengine,
  meta,
  ollama,
  bedrock,
  vertex,
  openrouter,
  "openrouter-account": openrouter,
  fireworks,
  together,
  zai,
  kimi,
  deepseek,
  mistral,
  qwen,
  minimax,
  xai,
};

export const PROVIDER_ORDER = [
  "anthropic",
  "openai",
  "gemini",
  "ark",
  "ark-agent-plan-cn",
  "meta",
  "ollama",
  "llamacpp",
  "vllm",
  "openrouter-account",
  "bedrock",
  "vertex",
  "openrouter",
  "fireworks",
  "together",
  "zai",
  "kimi",
  "deepseek",
  "mistral",
  "qwen",
  "minimax",
  "xai",
];

export function providerRank(name) {
  const i = PROVIDER_ORDER.indexOf(name);
  return i === -1 ? PROVIDER_ORDER.length : i;
}

export const KEY_HELP = {
  anthropic: { url: "https://console.anthropic.com/settings/keys", label: "console.anthropic.com" },
  openai: { url: "https://platform.openai.com/api-keys", label: "platform.openai.com" },
  gemini: { url: "https://aistudio.google.com/apikey", label: "aistudio.google.com" },
  ark: { url: "https://console.byteplus.com/ark/region:ark+ap-southeast-1/apiKey", label: "console.byteplus.com" },
  "ark-agent-plan-cn": { url: "https://console.volcengine.com/ark/region:cn-beijing/openManagement?LLM=%7B%7D&advancedActiveKey=agentPlan", label: "console.volcengine.com" },
  openrouter: { url: "https://openrouter.ai/keys", label: "openrouter.ai" },
  bedrock: { url: "https://console.aws.amazon.com/bedrock/home#/api-keys", label: "the AWS Bedrock console" },
  fireworks: { url: "https://fireworks.ai/account/api-keys", label: "fireworks.ai" },
  together: { url: "https://api.together.xyz/settings/api-keys", label: "together.xyz" },
  zai: { url: "https://z.ai/manage-apikey/apikey-list", label: "z.ai" },
  kimi: { url: "https://platform.moonshot.ai/console/api-keys", label: "platform.moonshot.ai" },
  deepseek: { url: "https://platform.deepseek.com/api_keys", label: "platform.deepseek.com" },
  mistral: { url: "https://console.mistral.ai/api-keys", label: "console.mistral.ai" },
  qwen: { url: "https://modelstudio.console.alibabacloud.com", label: "alibabacloud.com" },
  minimax: { url: "https://platform.minimax.io", label: "platform.minimax.io" },
  xai: { url: "https://console.x.ai", label: "console.x.ai" },
};