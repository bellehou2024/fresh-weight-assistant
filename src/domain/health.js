export const EXERCISES = [
  { name: "快走", met: 4.3 },
  { name: "慢跑", met: 7 },
  { name: "跑步", met: 9.8 },
  { name: "骑车", met: 6.8 },
  { name: "瑜伽", met: 2.5 },
  { name: "普拉提", met: 3 },
  { name: "羽毛球", met: 5.5 },
  { name: "网球", met: 7.3 },
  { name: "力量训练", met: 4.5 },
  { name: "游泳", met: 6 },
  { name: "爬楼梯", met: 8.8 },
  { name: "家务", met: 3.3 }
];

export const WATER_TARGET_ML = 1850;
export const WATER_STEP_ML = 50;
export const DAILY_CALORIE_BUDGET = 1350;

const intensityMultiplier = {
  easy: 0.85,
  normal: 1,
  hard: 1.15
};

export function roundTo(value, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function jinToKg(jin) {
  return roundTo(Number(jin) * 0.5, 1);
}

export function kgToJin(kg) {
  return roundTo(Number(kg) * 2, 1);
}

export function formatWeightKg(value) {
  if (value === "" || value === null || value === undefined) return "-";
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "-";
  return number.toFixed(2);
}

export function adjustWaterMl(currentMl, direction) {
  const current = Number(currentMl) || 0;
  const next = current + Number(direction) * WATER_STEP_ML;
  return Math.max(0, Math.min(WATER_TARGET_ML, next));
}

export function calculateBmi({ weightKg, heightCm }) {
  const heightM = Number(heightCm) / 100;
  if (!heightM || !weightKg) return null;
  return roundTo(Number(weightKg) / (heightM * heightM), 1);
}

export function estimateBaseCalories({ weightKg, heightCm, age = 28 }) {
  if (!weightKg || !heightCm) return null;
  return Math.round(10 * Number(weightKg) + 6.25 * Number(heightCm) - 5 * Number(age) - 161);
}

export function estimateExerciseCalories({ met, weightKg, minutes, intensity = "normal" }) {
  if (!met || !weightKg || !minutes) return 0;
  const multiplier = intensityMultiplier[intensity] ?? 1;
  const hours = Number(minutes) / 60;
  return Math.round(Number(met) * multiplier * Number(weightKg) * hours);
}

export function calculateDeficit({ baseCalories, exerciseCalories = 0, intakeCalories }) {
  if (intakeCalories === null || intakeCalories === undefined || intakeCalories === "") return null;
  return Math.round(Number(baseCalories || 0) + Number(exerciseCalories || 0) - Number(intakeCalories));
}

export function calculateCalorieRemaining({ budget = DAILY_CALORIE_BUDGET, intakeCalories = 0 }) {
  if (budget === null || budget === undefined || budget === "") return null;
  return Math.round(Number(budget) - Number(intakeCalories || 0));
}

export function calculateTodayDeficit({ baseCalories, exerciseCalories = 0, intakeCalories }) {
  return calculateDeficit({ baseCalories, exerciseCalories, intakeCalories });
}

export function getDeficitMessage(deficit) {
  if (deficit === null || deficit === undefined) return "填写摄入后，才会显示今日估算缺口。";
  if (deficit > 800) return "今天缺口偏大，别硬扛，记得吃够蛋白质和好好睡觉。";
  if (deficit < -200) return "今天摄入可能略高，没关系，看一周趋势就好。";
  return "今天是温和节奏，继续轻轻记录就好。";
}

export function calculateGoalRemainingKg({ startKg, currentKg, targetKg }) {
  const start = Number(startKg);
  const current = Number(currentKg);
  const target = Number(targetKg);
  if (!start || !current || !target || start === target) return null;

  const remaining = start > target ? current - target : target - current;
  return roundTo(Math.max(0, remaining), 2);
}

export function createWeightChartPoints(logs, width = 300, height = 120, padding = 16) {
  const entries = logs
    .map((log) => ({
      date: log.date,
      value: Number(log.weightKg)
    }))
    .filter((entry) => Number.isFinite(entry.value) && entry.value > 0);

  if (!entries.length) return [];
  if (entries.length === 1) {
    return [{
      x: Math.round(width / 2),
      y: Math.round(height / 2),
      label: entries[0].date.slice(5),
      value: entries[0].value
    }];
  }

  const values = entries.map((entry) => entry.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const usableWidth = width - padding * 2;
  const top = padding + 8;
  const bottom = height - padding - 8;
  const usableHeight = bottom - top;

  return entries.map((entry, index) => {
    const x = padding + (usableWidth * index) / (entries.length - 1);
    const y = top + ((max - entry.value) / range) * usableHeight;
    return {
      x: Math.round(x),
      y: Math.round(y),
      label: entry.date.slice(5),
      value: entry.value
    };
  });
}
