import { createFailedFoodAnalysis, normalizeFoodAnalysisResponse } from "../domain/foodAnalysis.js";

export function isAiConfigured(config) {
  return Boolean(config?.url && config?.anonKey);
}

export async function analyzeFoodPhoto({
  config,
  imageDataUrl,
  meal,
  note = "",
  accessToken = "",
  fetchImpl = fetch
}) {
  if (!isAiConfigured(config)) {
    return createFailedFoodAnalysis("AI 分析未配置");
  }

  try {
    const response = await fetchImpl(`${config.url.replace(/\/$/, "")}/functions/v1/analyze-food-photo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.anonKey,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify({ imageDataUrl, meal, note })
    });

    if (!response.ok) {
      return createFailedFoodAnalysis("AI 分析失败，可手动填写");
    }

    return normalizeFoodAnalysisResponse(await response.json());
  } catch {
    return createFailedFoodAnalysis("网络不稳定，可手动填写");
  }
}
