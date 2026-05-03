import {
  DAILY_CALORIE_BUDGET,
  EXERCISES,
  WATER_STEP_ML,
  WATER_TARGET_ML,
  adjustWaterMl,
  calculateBmi,
  calculateCalorieRemaining,
  calculateGoalRemainingKg,
  calculateTodayDeficit,
  createWeightChartPoints,
  estimateBaseCalories,
  estimateExerciseCalories,
  formatWeightKg,
  getDeficitMessage,
  kgToJin
} from "./domain/health.js";
import {
  createDefaultFastingPlan,
  createFastingLog,
  formatDuration,
  getFastingStatus
} from "./domain/fasting.js";
import { createLocalId } from "./domain/id.js";
import { createLocalStore } from "./storage/localStore.js";
import { analyzeFoodPhoto, isAiConfigured } from "./sync/aiFoodService.js";
import { createSyncService, getSyncConfig, saveSyncConfig } from "./sync/syncService.js";
import "./pwa.js";

const store = createLocalStore();
const app = document.querySelector("#app");
const today = new Date().toISOString().slice(0, 10);

const state = {
  tab: "record",
  profile: normalizeProfile(null),
  dailyLog: null,
  foodEntries: [],
  exerciseEntries: [],
  fastingLogs: [],
  dailyLogs: [],
  syncMessage: "本地保存",
  syncConfig: getSyncConfig(),
  session: null
};

await boot();

async function boot() {
  state.profile = normalizeProfile(await store.getProfile());
  await loadDay();
  await loadDailyLogs();
  state.session = createSyncService().handleAuthRedirect();
  render();
}

async function loadDay() {
  state.dailyLog = (await store.getDailyLog(today)) ?? {
    date: today,
    weightKg: state.profile.weightKg,
    waterMl: 0
  };
  state.dailyLog = migrateDailyLog(state.dailyLog);
  state.foodEntries = await store.listFoodEntries(today);
  state.exerciseEntries = await store.listExerciseEntries(today);
  state.fastingLogs = await store.listFastingLogs(today);
}

async function loadDailyLogs() {
  state.dailyLogs = await store.listDailyLogs();
}

function render() {
  const content = {
    record: renderRecord,
    fasting: renderFasting,
    profile: renderProfile
  }[state.tab]();

  app.innerHTML = `
    <main class="shell">
      <section class="topbar">
        <div>
          <p class="eyebrow">轻盈日记</p>
          <h1>${greeting()}</h1>
        </div>
        <button class="ghost-button" data-action="open-sync">同步</button>
      </section>
      ${renderSyncBar()}
      ${content}
      ${renderBottomNav()}
    </main>
  `;

  bindEvents();
}

function greeting() {
  return state.profile.nickname ? `${escapeHtml(state.profile.nickname)}，今天也慢慢来` : "今天也慢慢来";
}

function renderSyncBar() {
  const aiLabel = isAiConfigured(state.syncConfig) ? "AI 可用" : "AI 未配置";
  const syncLabel = state.session ? "已登录" : state.syncConfig.url ? "同步已配置" : "本地保存";
  return `<div class="sync-bar"><span>${syncLabel} · ${aiLabel}</span><small>${escapeHtml(state.syncMessage)}</small></div>`;
}

function renderRecord() {
  const summary = getTodaySummary();
  return `
    <section class="card record-hero">
      <div>
        <p class="muted">今日摄入</p>
        <div class="kcal-line">${summary.intakeCalories}<span>kcal</span></div>
        <p class="note">预算 ${summary.budget} kcal · 还可吃 ${summary.remainingCalories ?? "--"} kcal</p>
      </div>
      <div class="hero-meter" style="--progress:${summary.budgetProgress}%">
        <strong>${summary.budgetProgress}%</strong>
        <span>预算</span>
      </div>
    </section>

    <section class="metric-grid">
      <article class="mini-card"><span>运动消耗</span><strong>${summary.exerciseCalories} kcal</strong></article>
      <article class="mini-card"><span>估算缺口</span><strong>${summary.deficit ?? "--"} kcal</strong></article>
    </section>
    <p class="outside-note">${getDeficitMessage(summary.deficit)}</p>

    <section class="card">
      <div class="section-title">
        <h2>热量记录</h2>
        <span>${state.foodEntries.length} 条</span>
      </div>
      <div class="meal-grid">
        ${["早餐", "午餐", "晚餐", "加餐"].map(renderMealCard).join("")}
      </div>
      <form id="food-form" class="stack">
        <label class="photo-picker">
          <input name="photo" type="file" accept="image/*" capture="environment">
          <span>拍照或选相册</span>
          <small>配置 AI 后可自动估算热量</small>
        </label>
        <div class="segmented">
          ${["早餐", "午餐", "晚餐", "加餐"].map((meal, index) => `
            <label><input type="radio" name="meal" value="${meal}" ${index === 1 ? "checked" : ""}><span>${meal}</span></label>
          `).join("")}
        </div>
        <input name="note" class="text-input" placeholder="备注，比如半碗米饭">
        <label class="unit-input">
          <input name="kcal" class="text-input" type="number" inputmode="numeric" placeholder="手动填写或 AI 自动生成">
          <span>kcal</span>
        </label>
        <button class="primary-button">保存记录</button>
      </form>
    </section>

    <section class="card">
      <div class="section-title">
        <h2>今日运动</h2>
        <span>${summary.exerciseCalories} kcal</span>
      </div>
      ${renderExerciseForm()}
    </section>

    <section class="feed">
      ${state.foodEntries.length ? state.foodEntries.map(renderFoodEntry).join("") : emptyState("还没有饮食记录", "下一餐拍一下，AI 会先给一个可修改的估算。")}
      ${state.exerciseEntries.length ? state.exerciseEntries.map(renderExerciseEntry).join("") : ""}
    </section>
  `;
}

function renderMealCard(meal) {
  const kcal = state.foodEntries
    .filter((entry) => entry.meal === meal)
    .reduce((sum, entry) => sum + Number(entry.kcal || 0), 0);
  return `<article class="meal-card"><span>${meal}</span><strong>${kcal}</strong><small>kcal</small></article>`;
}

function renderExerciseForm() {
  return `
    <form id="exercise-form" class="stack compact-stack">
      <div class="chips">
        ${EXERCISES.slice(0, 8).map((exercise, index) => `
          <label>
            <input type="radio" name="exercise" value="${exercise.name}" data-met="${exercise.met}" ${index === 0 ? "checked" : ""}>
            <span>${exercise.name}</span>
          </label>
        `).join("")}
      </div>
      <input name="customName" class="text-input" placeholder="也可以自己写运动名">
      <div class="grid-two compact">
        <label class="unit-input">
          <input name="minutes" class="text-input" type="number" inputmode="numeric" value="30" aria-label="运动分钟数">
          <span>分钟</span>
        </label>
        <select name="intensity" class="text-input">
          <option value="easy">轻松</option>
          <option value="normal" selected>中等</option>
          <option value="hard">较累</option>
        </select>
      </div>
      <label class="unit-input">
        <input name="manualKcal" class="text-input" type="number" inputmode="numeric" placeholder="可选：自己填">
        <span>kcal</span>
      </label>
      <button class="secondary-button">添加运动</button>
    </form>
  `;
}

function renderFoodEntry(entry) {
  const status = foodStatusLabel(entry);
  return `
    <article class="food-card">
      ${entry.imageDataUrl ? `<img src="${escapeAttr(entry.imageDataUrl)}" alt="${escapeAttr(entry.meal)}">` : `<div class="food-placeholder">kcal</div>`}
      <div>
        <div class="entry-title">
          <strong>${escapeHtml(entry.meal)}</strong>
          <label class="inline-kcal">
            <input data-food-kcal="${escapeAttr(entry.id)}" type="number" inputmode="numeric" value="${escapeAttr(entry.kcal ?? "")}" aria-label="修改饮食热量">
            <span>kcal</span>
          </label>
        </div>
        <p>${entry.note ? escapeHtml(entry.note) : renderAnalysisItems(entry)}</p>
        <small>${status}</small>
      </div>
    </article>
  `;
}

function renderAnalysisItems(entry) {
  if (!Array.isArray(entry.analysisItems) || !entry.analysisItems.length) return "未写备注";
  return entry.analysisItems.map((item) => `${item.name} ${item.kcal}kcal`).join(" · ");
}

function foodStatusLabel(entry) {
  if (entry.analysisStatus === "pending") return "AI 正在估算";
  if (entry.analysisStatus === "done") return `AI 估算，可修改 · ${confidenceLabel(entry.analysisConfidence)}`;
  if (entry.analysisStatus === "failed") return entry.analysisSummary || "分析失败，可手动填写";
  return entry.analysisSource === "manual" ? "手动记录" : "本地记录";
}

function renderExerciseEntry(entry) {
  const kcal = entry.manualKcal || entry.estimatedKcal;
  return `
    <article class="list-card exercise-entry">
      <div>
        <strong>${escapeHtml(entry.name)}</strong>
        <p>${entry.minutes} 分钟 · ${intensityLabel(entry.intensity)}</p>
      </div>
      <span>${kcal} kcal</span>
    </article>
  `;
}

function renderFasting() {
  const plan = getFastingPlan();
  const status = getFastingStatus({ plan });
  const latest = [...state.fastingLogs].sort((a, b) => String(b.createdAt ?? b.id).localeCompare(String(a.createdAt ?? a.id)))[0];
  return `
    <section class="card fasting-hero">
      <p class="muted">当前方案 ${plan.planType}</p>
      <h2>${status.label}</h2>
      <div class="fasting-clock">${status.remainingMs === null ? "--" : formatDuration(status.remainingMs)}</div>
      <p class="note">${status.status === "eating" ? "距离进食窗口结束" : "距离可以进食"}</p>
      <div class="button-row">
        <button class="primary-button" data-action="start-fasting">开始断食</button>
        <button class="secondary-button" data-action="end-fasting">结束断食</button>
      </div>
    </section>

    <section class="card">
      <div class="section-title">
        <h2>轻断食计划</h2>
        <span>${plan.eatingWindowStart}-${plan.eatingWindowEnd}</span>
      </div>
      <div class="segmented">
        ${["14:10", "16:8", "18:6"].map((type) => `
          <label><input type="radio" name="planType" data-fasting-plan="${type}" value="${type}" ${plan.planType === type ? "checked" : ""}><span>${type}</span></label>
        `).join("")}
      </div>
      <div class="grid-two compact time-grid">
        <label class="mini-card"><span>开始吃饭</span><input data-profile-field="eatingWindowStart" type="time" value="${escapeAttr(plan.eatingWindowStart)}"></label>
        <label class="mini-card"><span>结束吃饭</span><input data-profile-field="eatingWindowEnd" type="time" value="${escapeAttr(plan.eatingWindowEnd)}"></label>
      </div>
      <p class="note">身体不舒服就先停下，不需要硬撑。第一版只记录状态，不做推送提醒。</p>
    </section>

    <section class="feed">
      ${latest ? renderFastingLog(latest) : emptyState("今天还没有断食记录", "点开始断食后，这里会保存今天的状态。")}
    </section>
  `;
}

function renderFastingLog(log) {
  return `
    <article class="list-card">
      <div>
        <strong>${escapeHtml(log.planType)}</strong>
        <p>${escapeHtml(statusLabel(log.status))} · ${formatShortTime(log.fastingStartAt)} 到 ${formatShortTime(log.fastingEndAt)}</p>
      </div>
      <span>${escapeHtml(log.date)}</span>
    </article>
  `;
}

function renderProfile() {
  const log = state.dailyLog;
  const bmi = calculateBmi({ weightKg: Number(log.weightKg || state.profile.weightKg), heightCm: Number(state.profile.heightCm) });
  const sortedLogs = [...state.dailyLogs].sort((a, b) => a.date.localeCompare(b.date));
  const lastLogs = [...sortedLogs].reverse().slice(0, 7);
  const chartLogs = [...lastLogs].reverse();
  const weights = lastLogs.map((item) => Number(item.weightKg)).filter(Boolean);
  const firstWeight = sortedLogs.map((item) => Number(item.weightKg)).find(Boolean) || Number(state.profile.weightKg);
  const currentWeight = Number(log.weightKg || weights[0] || state.profile.weightKg);
  const remainingKg = calculateGoalRemainingKg({
    startKg: firstWeight,
    currentKg: currentWeight,
    targetKg: state.profile.targetWeightKg
  });
  const chartPoints = createWeightChartPoints(chartLogs);
  const waterTarget = Number(state.profile.waterTargetMl || WATER_TARGET_ML);

  return `
    <section class="card profile-hero">
      <div>
        <p class="muted">身体档案</p>
        <label class="weight-line weight-edit">
          <input data-log-field="weightKg" type="number" inputmode="decimal" step="0.01" value="${escapeAttr(formatWeightInput(log.weightKg))}" aria-label="今日体重 kg">
          <span>kg</span>
        </label>
        <p class="muted">${log.weightKg ? `${kgToJin(Number(log.weightKg))} 斤 · BMI ${bmi ?? "-"}` : "记录今天体重"}</p>
      </div>
    </section>

    <section class="card">
      <div class="section-title">
        <h2>目标</h2>
        <span>${remainingKg === null ? "-- kg" : `还差 ${formatWeightKg(remainingKg)} kg`}</span>
      </div>
      <div class="grid-two compact">
        <label class="mini-card"><span>身高 cm</span><input data-profile-field="heightCm" type="number" inputmode="decimal" value="${escapeAttr(state.profile.heightCm)}"></label>
        <label class="mini-card"><span>目标 kg</span><input data-profile-field="targetWeightKg" type="number" inputmode="decimal" step="0.01" value="${escapeAttr(formatWeightInput(state.profile.targetWeightKg))}"></label>
        <label class="mini-card"><span>热量预算 kcal</span><input data-profile-field="dailyCalorieBudget" type="number" inputmode="numeric" value="${escapeAttr(state.profile.dailyCalorieBudget)}"></label>
        <label class="mini-card"><span>饮水目标 ml</span><input data-profile-field="waterTargetMl" type="number" inputmode="numeric" step="${WATER_STEP_ML}" value="${escapeAttr(waterTarget)}"></label>
      </div>
    </section>

    <section class="card water-card">
      <div class="section-title">
        <h2>饮水量</h2>
        <span>${Number(log.waterMl || 0)} / ${waterTarget} ml</span>
      </div>
      <div class="water-controls">
        <button class="round-button" data-water-delta="-1" aria-label="减少 ${WATER_STEP_ML} 毫升">-</button>
        <input class="water-range" data-water-range type="range" min="0" max="${waterTarget}" step="${WATER_STEP_ML}" value="${Number(log.waterMl || 0)}" aria-label="饮水量 ml">
        <button class="round-button" data-water-delta="1" aria-label="增加 ${WATER_STEP_ML} 毫升">+</button>
      </div>
    </section>

    <section class="card trend-card">
      <div class="section-title">
        <h2>最近 7 天</h2>
        <span>${lastLogs.length} 天</span>
      </div>
      ${renderWeightChart(chartPoints)}
    </section>
  `;
}

function renderWeightChart(points) {
  if (!points.length) return `<div class="chart-empty">暂无体重记录</div>`;
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  return `
    <svg class="weight-chart" viewBox="0 0 300 120" role="img" aria-label="最近 7 天体重折线图">
      <line x1="16" y1="24" x2="284" y2="24"></line>
      <line x1="16" y1="60" x2="284" y2="60"></line>
      <line x1="16" y1="96" x2="284" y2="96"></line>
      <polyline points="${polyline}"></polyline>
      ${points.map((point) => `
        <g>
          <circle cx="${point.x}" cy="${point.y}" r="4"></circle>
          <text x="${point.x}" y="116">${escapeHtml(point.label)}</text>
        </g>
      `).join("")}
    </svg>
  `;
}

function renderBottomNav() {
  const tabs = [
    ["record", "记录"],
    ["fasting", "轻断食"],
    ["profile", "档案"]
  ];
  return `<nav class="bottom-nav">${tabs.map(([id, label]) => `<button class="${state.tab === id ? "active" : ""}" data-tab="${id}">${label}</button>`).join("")}</nav>`;
}

function bindEvents() {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.dataset.tab;
      render();
    });
  });

  document.querySelectorAll("[data-log-field]").forEach((input) => {
    input.addEventListener("change", async () => {
      const key = input.dataset.logField;
      state.dailyLog[key] = input.value;
      if (key === "weightKg") state.profile.weightKg = Number(input.value || state.profile.weightKg);
      await saveProfileAndLog("本地已保存");
    });
  });

  document.querySelectorAll("[data-profile-field]").forEach((input) => {
    input.addEventListener("change", async () => {
      state.profile[input.dataset.profileField] = input.value;
      state.profile = normalizeProfile(state.profile);
      await saveProfileAndLog("档案已本地保存");
    });
  });

  document.querySelectorAll("[data-water-delta]").forEach((button) => {
    button.addEventListener("click", async () => {
      await updateWaterMl(adjustWaterMl(state.dailyLog.waterMl, Number(button.dataset.waterDelta)));
    });
  });

  document.querySelector("[data-water-range]")?.addEventListener("input", async (event) => {
    await updateWaterMl(Number(event.target.value));
  });

  document.querySelectorAll("[data-fasting-plan]").forEach((input) => {
    input.addEventListener("change", async () => {
      applyFastingPreset(input.value);
      await saveProfileAndLog("轻断食计划已保存");
    });
  });

  document.querySelectorAll("[data-food-kcal]").forEach((input) => {
    input.addEventListener("change", async () => {
      await updateFoodKcal(input.dataset.foodKcal, input.value);
    });
  });

  document.querySelector("[data-action='start-fasting']")?.addEventListener("click", startFasting);
  document.querySelector("[data-action='end-fasting']")?.addEventListener("click", endFasting);
  document.querySelector("#food-form")?.addEventListener("submit", saveFood);
  document.querySelector("#exercise-form")?.addEventListener("submit", saveExercise);
  document.querySelector("[data-action='open-sync']")?.addEventListener("click", openSyncDialog);
}

async function saveProfileAndLog(message) {
  await store.saveProfile(state.profile);
  await store.saveDailyLog(normalizeDailyLog(state.dailyLog));
  await loadDailyLogs();
  state.syncMessage = message;
  await tryAutoSync();
  render();
}

async function updateWaterMl(value) {
  state.dailyLog.waterMl = Math.min(Number(state.profile.waterTargetMl || WATER_TARGET_ML), Number(value) || 0);
  await saveProfileAndLog("饮水量已本地保存");
}

async function saveFood(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const file = form.get("photo");
  const imageDataUrl = file?.size ? await fileToDataUrl(file) : "";
  const manualKcal = form.get("kcal") ? Number(form.get("kcal")) : null;
  const entry = {
    id: createLocalId(),
    date: today,
    meal: form.get("meal"),
    imageDataUrl,
    note: form.get("note") ?? "",
    kcal: manualKcal,
    analysisStatus: imageDataUrl ? "pending" : "none",
    analysisSource: manualKcal ? "manual" : "manual",
    analysisItems: [],
    analysisSummary: "",
    analysisConfidence: "low"
  };

  await store.saveFoodEntry(entry);
  await loadDay();
  state.syncMessage = imageDataUrl ? "照片已保存，准备分析" : "饮食已本地保存";
  render();

  if (!imageDataUrl || manualKcal) {
    await tryAutoSync();
    return;
  }

  const analysis = await analyzeFoodPhoto({
    config: state.syncConfig,
    imageDataUrl,
    meal: entry.meal,
    note: entry.note,
    accessToken: state.session?.access_token || ""
  });
  await store.saveFoodEntry({
    ...entry,
    kcal: analysis.totalKcal,
    analysisStatus: analysis.ok ? "done" : "failed",
    analysisSource: analysis.ok ? "ai" : "manual",
    analysisItems: analysis.items,
    analysisSummary: analysis.summary,
    analysisConfidence: analysis.confidence
  });
  await loadDay();
  state.syncMessage = analysis.ok ? "AI 已估算，可按实际修改" : analysis.summary;
  await tryAutoSync();
  render();
}

async function updateFoodKcal(id, value) {
  const entry = state.foodEntries.find((item) => item.id === id);
  if (!entry) return;
  await store.saveFoodEntry({
    ...entry,
    kcal: value ? Number(value) : null,
    analysisSource: entry.analysisSource === "ai" ? "ai" : "manual",
    analysisSummary: entry.analysisSource === "ai" ? "AI 估算已手动调整" : entry.analysisSummary
  });
  await loadDay();
  state.syncMessage = "热量已本地保存";
  await tryAutoSync();
  render();
}

async function saveExercise(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const selected = form.querySelector("input[name='exercise']:checked");
  const customName = form.customName.value.trim();
  const minutes = Number(form.minutes.value || 0);
  const intensity = form.intensity.value;
  const manualKcal = form.manualKcal.value ? Number(form.manualKcal.value) : null;
  const estimatedKcal = estimateExerciseCalories({
    met: Number(selected.dataset.met),
    weightKg: Number(state.dailyLog.weightKg || state.profile.weightKg),
    minutes,
    intensity
  });
  await store.saveExerciseEntry({
    id: createLocalId(),
    date: today,
    name: customName || selected.value,
    minutes,
    intensity,
    estimatedKcal,
    manualKcal
  });
  await loadDay();
  state.syncMessage = "运动已本地保存";
  await tryAutoSync();
  render();
}

async function startFasting() {
  const plan = getFastingPlan();
  await store.saveFastingLog(createFastingLog({
    id: createLocalId(),
    date: today,
    planType: plan.planType,
    eatingWindowStart: plan.eatingWindowStart,
    eatingWindowEnd: plan.eatingWindowEnd
  }));
  await loadDay();
  state.syncMessage = "轻断食已开始记录";
  await tryAutoSync();
  render();
}

async function endFasting() {
  const plan = getFastingPlan();
  const log = createFastingLog({
    id: createLocalId(),
    date: today,
    planType: plan.planType,
    eatingWindowStart: plan.eatingWindowStart,
    eatingWindowEnd: plan.eatingWindowEnd
  });
  await store.saveFastingLog({ ...log, status: "completed", fastingEndAt: localNowIso() });
  await loadDay();
  state.syncMessage = "轻断食记录已结束";
  await tryAutoSync();
  render();
}

async function openSyncDialog() {
  const current = getSyncConfig();
  const url = prompt("Supabase URL（用于同步和 AI 分析，不填则继续本地使用）", current.url);
  if (url === null) return;
  const anonKey = prompt("Supabase anon key", current.anonKey);
  if (anonKey === null) return;
  saveSyncConfig({ url: url.trim(), anonKey: anonKey.trim() });
  state.syncConfig = getSyncConfig();
  const sync = createSyncService(state.syncConfig);
  state.session = sync.getSession();
  if (!sync.isConfigured) {
    state.syncMessage = "继续本地保存";
  } else if (!state.session) {
    const email = prompt("输入邮箱，发送登录链接；只用 AI 可先取消");
    if (email) {
      try {
        await sync.sendMagicLink(email.trim());
        state.syncMessage = "登录邮件已发送，请在手机上打开邮件链接";
      } catch (error) {
        state.syncMessage = error.message;
      }
    } else {
      state.syncMessage = "AI 配置已保存";
    }
  } else {
    await syncAll();
  }
  render();
}

async function tryAutoSync() {
  if (!state.syncConfig.url || !state.session) return;
  try {
    await syncAll();
  } catch {
    state.syncMessage = "本地已保存，稍后再同步";
  }
}

async function syncAll() {
  const sync = createSyncService(state.syncConfig);
  const session = sync.getSession();
  const userId = session?.user?.sub;
  if (!userId) {
    state.syncMessage = "请先用邮箱登录";
    return;
  }
  const dailyLogs = (await store.listDailyLogs()).map((log) => ({
    id: `${userId}:${log.date}`,
    user_id: userId,
    date: log.date,
    weight_kg: log.weightKg,
    water_ml: log.waterMl,
    intake_calories: getFoodCaloriesForDate(log.date),
    updated_at: log.updatedAt ?? new Date().toISOString()
  }));
  await sync.upsert("profiles", [{
    id: userId,
    nickname: state.profile.nickname,
    height_cm: state.profile.heightCm,
    weight_kg: state.profile.weightKg,
    target_weight_kg: state.profile.targetWeightKg || null,
    daily_calorie_budget: state.profile.dailyCalorieBudget,
    water_target_ml: state.profile.waterTargetMl,
    fasting_plan_type: state.profile.fastingPlanType,
    eating_window_start: state.profile.eatingWindowStart,
    eating_window_end: state.profile.eatingWindowEnd,
    updated_at: new Date().toISOString()
  }]);
  const foodEntries = (await store.listAllFoodEntries()).map((entry) => ({
    id: entry.id,
    user_id: userId,
    date: entry.date,
    meal: entry.meal,
    image_data_url: entry.imageDataUrl,
    note: entry.note,
    kcal: entry.kcal,
    analysis_status: entry.analysisStatus,
    analysis_source: entry.analysisSource,
    analysis_items: entry.analysisItems ?? [],
    analysis_summary: entry.analysisSummary,
    analysis_confidence: entry.analysisConfidence,
    updated_at: entry.updatedAt ?? new Date().toISOString()
  }));
  const exerciseEntries = (await store.listAllExerciseEntries()).map((entry) => ({
    id: entry.id,
    user_id: userId,
    date: entry.date,
    name: entry.name,
    minutes: entry.minutes,
    intensity: entry.intensity,
    estimated_kcal: entry.estimatedKcal,
    manual_kcal: entry.manualKcal,
    updated_at: entry.updatedAt ?? new Date().toISOString()
  }));
  const fastingLogs = (await store.listAllFastingLogs()).map((entry) => ({
    id: entry.id,
    user_id: userId,
    date: entry.date,
    plan_type: entry.planType,
    fasting_start_at: entry.fastingStartAt,
    fasting_end_at: entry.fastingEndAt,
    eating_start_at: entry.eatingStartAt,
    eating_end_at: entry.eatingEndAt,
    status: entry.status,
    updated_at: entry.updatedAt ?? new Date().toISOString()
  }));
  await sync.upsert("daily_logs", dailyLogs);
  await sync.upsert("food_entries", foodEntries);
  await sync.upsert("exercise_entries", exerciseEntries);
  await sync.upsert("fasting_logs", fastingLogs);
  state.syncMessage = "已同步";
}

function getTodaySummary() {
  const intakeCalories = totalFoodCalories();
  const exerciseCalories = totalExerciseCalories();
  const baseCalories = estimateBaseCalories({
    weightKg: Number(state.dailyLog.weightKg || state.profile.weightKg),
    heightCm: Number(state.profile.heightCm)
  });
  const budget = Number(state.profile.dailyCalorieBudget || DAILY_CALORIE_BUDGET);
  const deficit = calculateTodayDeficit({ baseCalories, exerciseCalories, intakeCalories });
  const remainingCalories = calculateCalorieRemaining({ budget, intakeCalories });
  const budgetProgress = budget ? Math.min(100, Math.round((intakeCalories / budget) * 100)) : 0;
  return { intakeCalories, exerciseCalories, baseCalories, budget, deficit, remainingCalories, budgetProgress };
}

function normalizeProfile(profile) {
  const defaults = createDefaultFastingPlan();
  return {
    nickname: "",
    heightCm: 156,
    weightKg: 51,
    targetWeightKg: "",
    dailyCalorieBudget: DAILY_CALORIE_BUDGET,
    waterTargetMl: WATER_TARGET_ML,
    fastingPlanType: defaults.planType,
    eatingWindowStart: defaults.eatingWindowStart,
    eatingWindowEnd: defaults.eatingWindowEnd,
    ...(profile ?? {})
  };
}

function getFastingPlan() {
  return {
    planType: state.profile.fastingPlanType || "16:8",
    eatingWindowStart: state.profile.eatingWindowStart || "12:00",
    eatingWindowEnd: state.profile.eatingWindowEnd || "20:00"
  };
}

function applyFastingPreset(planType) {
  const windows = {
    "14:10": ["10:00", "20:00"],
    "16:8": ["12:00", "20:00"],
    "18:6": ["12:00", "18:00"]
  };
  const [start, end] = windows[planType] ?? [state.profile.eatingWindowStart, state.profile.eatingWindowEnd];
  state.profile.fastingPlanType = planType;
  state.profile.eatingWindowStart = start;
  state.profile.eatingWindowEnd = end;
}

function normalizeDailyLog(log) {
  return {
    ...log,
    weightKg: log.weightKg ? Number(log.weightKg) : null,
    waterMl: log.waterMl ? Number(log.waterMl) : 0,
    intakeCalories: totalFoodCalories()
  };
}

function migrateDailyLog(log) {
  if ("waterMl" in log) return log;
  const waterMl = log.waterCups ? Number(log.waterCups) * 250 : 0;
  const { waterCups, mood, sleepHours, steps, intakeCalories, ...rest } = log;
  return { ...rest, waterMl, intakeCalories };
}

function totalFoodCalories() {
  return state.foodEntries.reduce((sum, entry) => sum + Number(entry.kcal || 0), 0);
}

function totalExerciseCalories() {
  return state.exerciseEntries.reduce((sum, entry) => sum + Number(entry.manualKcal || entry.estimatedKcal || 0), 0);
}

function getFoodCaloriesForDate(date) {
  if (date === today) return totalFoodCalories();
  return null;
}

function intensityLabel(value) {
  return { easy: "轻松", normal: "中等", hard: "较累" }[value] ?? "中等";
}

function confidenceLabel(value) {
  return { low: "低置信度", medium: "中置信度", high: "高置信度" }[value] ?? "中置信度";
}

function statusLabel(value) {
  return { idle: "未开始", fasting: "断食中", eating: "进食中", completed: "已结束" }[value] ?? "记录";
}

function formatWeightInput(value) {
  const formatted = formatWeightKg(value);
  return formatted === "-" ? "" : formatted;
}

function formatShortTime(value) {
  if (!value) return "--:--";
  return String(value).slice(11, 16);
}

function localNowIso() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function emptyState(title, text) {
  return `<div class="empty"><strong>${title}</strong><p>${text}</p></div>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
