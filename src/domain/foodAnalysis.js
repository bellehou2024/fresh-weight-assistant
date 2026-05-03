const CONFIDENCE_VALUES = new Set(["low", "medium", "high"]);

export function normalizeFoodAnalysisResponse(payload) {
  if (!payload || typeof payload !== "object") {
    return createFailedFoodAnalysis("AI 返回为空");
  }

  const items = Array.isArray(payload.items)
    ? payload.items.map(normalizeItem).filter((item) => item.name && item.kcal > 0)
    : [];

  if (!items.length) {
    return createFailedFoodAnalysis("未识别到可用食物");
  }

  const summedKcal = items.reduce((sum, item) => sum + item.kcal, 0);
  const totalKcal = normalizeKcal(payload.totalKcal) || summedKcal;

  return {
    ok: true,
    items,
    totalKcal,
    summary: String(payload.summary || "AI 已完成估算，请按实际份量调整。"),
    confidence: normalizeConfidence(payload.confidence),
    warnings: Array.isArray(payload.warnings) ? payload.warnings.map(String).filter(Boolean) : []
  };
}

export function createFailedFoodAnalysis(message) {
  return {
    ok: false,
    items: [],
    totalKcal: null,
    summary: message,
    confidence: "low",
    warnings: []
  };
}

function normalizeItem(item) {
  return {
    name: String(item?.name || "").trim(),
    portion: String(item?.portion || "份量不确定").trim(),
    kcal: normalizeKcal(item?.kcal),
    confidence: normalizeConfidence(item?.confidence)
  };
}

function normalizeKcal(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function normalizeConfidence(value) {
  return CONFIDENCE_VALUES.has(value) ? value : "medium";
}
