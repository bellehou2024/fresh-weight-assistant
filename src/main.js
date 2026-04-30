import {
  EXERCISES,
  WATER_STEP_ML,
  WATER_TARGET_ML,
  adjustWaterMl,
  calculateBmi,
  calculateDeficit,
  calculateGoalRemainingKg,
  createWeightChartPoints,
  estimateBaseCalories,
  estimateExerciseCalories,
  formatWeightKg,
  getDeficitMessage,
  kgToJin
} from "./domain/health.js";
import { createLocalId } from "./domain/id.js";
import { createLocalStore } from "./storage/localStore.js";
import { createSyncService, getSyncConfig, saveSyncConfig } from "./sync/syncService.js";
import "./pwa.js";

const store = createLocalStore();
const app = document.querySelector("#app");
const today = new Date().toISOString().slice(0, 10);

const state = {
  tab: "today",
  profile: { nickname: "", heightCm: 156, weightKg: 51, targetWeightKg: "" },
  dailyLog: null,
  foodEntries: [],
  exerciseEntries: [],
  dailyLogs: [],
  syncMessage: "本地保存",
  syncConfig: getSyncConfig(),
  session: null
};

await boot();

async function boot() {
  const profile = await store.getProfile();
  if (profile) state.profile = profile;
  await loadDay();
  await loadDailyLogs();
  state.session = createSyncService().handleAuthRedirect();
  render();
}

async function loadDay() {
  state.dailyLog = (await store.getDailyLog(today)) ?? {
    date: today,
    weightKg: state.profile.weightKg,
    waterMl: 0,
    intakeCalories: ""
  };
  state.dailyLog = migrateDailyLog(state.dailyLog);
  state.foodEntries = await store.listFoodEntries(today);
  state.exerciseEntries = await store.listExerciseEntries(today);
}

async function loadDailyLogs() {
  state.dailyLogs = await store.listDailyLogs();
}

function render() {
  const content = {
    today: renderToday,
    food: renderFood,
    exercise: renderExercise,
    trends: renderTrends
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
  const label = state.session ? "已登录，记录会尝试同步" : state.syncConfig.url ? "同步已配置，登录后可跨设备" : "未配置同步，先本地保存";
  return `<div class="sync-bar"><span>${label}</span><small>${escapeHtml(state.syncMessage)}</small></div>`;
}

function renderToday() {
  const log = state.dailyLog;
  const exerciseCalories = totalExerciseCalories();
  const baseCalories = estimateBaseCalories({
    weightKg: Number(log.weightKg || state.profile.weightKg),
    heightCm: Number(state.profile.heightCm)
  });
  const deficit = calculateDeficit({
    baseCalories,
    exerciseCalories,
    intakeCalories: log.intakeCalories
  });
  const bmi = calculateBmi({ weightKg: Number(log.weightKg), heightCm: Number(state.profile.heightCm) });

  return `
    <section class="card">
      <div class="hero-card">
      <div>
        <p class="muted">今日体重</p>
        <label class="weight-line weight-edit">
          <input data-log-field="weightKg" type="number" inputmode="decimal" step="0.01" value="${escapeAttr(formatWeightInput(log.weightKg))}" aria-label="今日体重 kg">
          <span>kg</span>
        </label>
        <p class="muted">${log.weightKg ? `${kgToJin(Number(log.weightKg))} 斤 · BMI ${bmi ?? "-"}` : "轻轻记录，不用焦虑"}</p>
      </div>
      </div>
    </section>

    <section class="card water-card">
      <div class="section-title">
        <h2>饮水量</h2>
        <span>${Number(log.waterMl || 0)} / ${WATER_TARGET_ML} ml</span>
      </div>
      <div class="water-controls">
        <button class="round-button" data-water-delta="-1" aria-label="减少 ${WATER_STEP_ML} 毫升">-</button>
        <div>
          <input class="water-range" data-water-range type="range" min="0" max="${WATER_TARGET_ML}" step="${WATER_STEP_ML}" value="${Number(log.waterMl || 0)}" aria-label="饮水量 ml">
          <p class="note">每日目标 ${WATER_TARGET_ML} ml，每次调整 ${WATER_STEP_ML} ml。</p>
        </div>
        <button class="round-button" data-water-delta="1" aria-label="增加 ${WATER_STEP_ML} 毫升">+</button>
      </div>
    </section>

    <section class="card">
      <div class="section-title">
        <h2>今日热量</h2>
        <span>估算</span>
      </div>
      <label class="line-input">
        <span>摄入 kcal</span>
        <input data-log-field="intakeCalories" type="number" inputmode="numeric" value="${escapeAttr(log.intakeCalories)}" placeholder="可选">
      </label>
      <div class="calorie-row">
        <div><strong>${baseCalories ?? "-"}</strong><span>基础</span></div>
        <div><strong>${exerciseCalories}</strong><span>运动</span></div>
        <div><strong>${deficit ?? "-"}</strong><span>缺口</span></div>
      </div>
      <p class="note">${getDeficitMessage(deficit)}</p>
    </section>
  `;
}

function renderFood() {
  return `
    <section class="card">
      <div class="section-title">
        <h2>拍照记一餐</h2>
        <span>备注可空</span>
      </div>
      <form id="food-form" class="stack">
        <label class="photo-picker">
          <input name="photo" type="file" accept="image/*" capture="environment" required>
          <span>点这里拍照或选相册</span>
        </label>
        <div class="segmented">
          ${["早餐", "午餐", "晚餐", "加餐"].map((meal, index) => `
            <label><input type="radio" name="meal" value="${meal}" ${index === 1 ? "checked" : ""}><span>${meal}</span></label>
          `).join("")}
        </div>
        <input name="note" class="text-input" placeholder="可选备注，比如半碗米饭">
        <input name="kcal" class="text-input" type="number" inputmode="numeric" placeholder="可选 kcal">
        <button class="primary-button">保存照片</button>
      </form>
    </section>
    <section class="feed">
      ${state.foodEntries.length ? state.foodEntries.map(renderFoodEntry).join("") : emptyState("还没有饮食照片", "下一餐拍一下就好，不用写很多字。")}
    </section>
  `;
}

function renderFoodEntry(entry) {
  return `
    <article class="food-card">
      <img src="${escapeAttr(entry.imageDataUrl)}" alt="${escapeAttr(entry.meal)}">
      <div>
        <strong>${escapeHtml(entry.meal)}</strong>
        <p>${entry.note ? escapeHtml(entry.note) : "未写备注"}</p>
        <small>${entry.kcal ? `${entry.kcal} kcal` : "未填热量"}</small>
      </div>
    </article>
  `;
}

function renderExercise() {
  return `
    <section class="card">
      <div class="section-title">
        <h2>我的运动</h2>
        <span>快捷估算</span>
      </div>
      <form id="exercise-form" class="stack">
        <div class="chips">
          ${EXERCISES.map((exercise, index) => `
            <label>
              <input type="radio" name="exercise" value="${exercise.name}" data-met="${exercise.met}" ${index === 0 ? "checked" : ""}>
              <span>${exercise.name}</span>
            </label>
          `).join("")}
        </div>
        <input name="customName" class="text-input" placeholder="没有的话，自己写运动名">
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
          <input name="manualKcal" class="text-input" type="number" inputmode="numeric" placeholder="可选：自己填" aria-label="手动填写消耗千卡">
          <span>kcal</span>
        </label>
        <button class="primary-button">添加运动</button>
      </form>
    </section>
    <section class="feed">
      ${state.exerciseEntries.length ? state.exerciseEntries.map(renderExerciseEntry).join("") : emptyState("今天还没记运动", "快走、瑜伽、家务都可以算一点。")}
    </section>
  `;
}

function renderExerciseEntry(entry) {
  const kcal = entry.manualKcal || entry.estimatedKcal;
  return `
    <article class="list-card">
      <div>
        <strong>${escapeHtml(entry.name)}</strong>
        <p>${entry.minutes} 分钟 · ${intensityLabel(entry.intensity)}</p>
      </div>
      <span>${kcal} kcal</span>
    </article>
  `;
}

function renderTrends() {
  const sortedLogs = [...state.dailyLogs].sort((a, b) => a.date.localeCompare(b.date));
  const lastLogs = [...sortedLogs].reverse().slice(0, 7);
  const chartLogs = [...lastLogs].reverse();
  const weights = lastLogs.map((log) => Number(log.weightKg)).filter(Boolean);
  const firstWeight = sortedLogs.map((log) => Number(log.weightKg)).find(Boolean) || Number(state.profile.weightKg);
  const currentWeight = weights[0] || Number(state.dailyLog.weightKg || state.profile.weightKg);
  const chartPoints = createWeightChartPoints(chartLogs);
  const targetWeight = state.profile.targetWeightKg;
  const remainingKg = calculateGoalRemainingKg({
    startKg: firstWeight,
    currentKg: currentWeight,
    targetKg: targetWeight
  });

  return `
    <section class="card trend-card">
      <div class="section-title">
        <p class="muted">最近 7 天</p>
        <span>${lastLogs.length} 天</span>
      </div>
      ${renderWeightChart(chartPoints)}
      <p class="note">${chartPoints.length ? `当前 ${formatWeightKg(currentWeight)} kg，只看轻趋势，不追单日数字。` : "记录几天体重后，这里会显示折线趋势。"}</p>
    </section>
    <section class="card goal-card">
      <div class="section-title">
        <h2>距离完成目标还差</h2>
        <span>${remainingKg === null ? "-- kg" : `${formatWeightKg(remainingKg)} kg`}</span>
      </div>
      <label class="target-input-row">
        <span>目标</span>
        <input data-profile-field="targetWeightKg" type="number" inputmode="decimal" step="0.01" value="${escapeAttr(formatWeightInput(targetWeight))}" placeholder="可选">
        <span>kg</span>
      </label>
      <p class="note">${remainingKg === null ? "填一个健康目标体重后，这里会显示还差多少 kg。" : `按当前 ${formatWeightKg(currentWeight)} kg 到目标 ${formatWeightKg(targetWeight)} kg 估算。`}</p>
    </section>
    <section class="feed">
      ${lastLogs.length ? lastLogs.map((log) => `
        <article class="list-card">
          <div><strong>${log.date}</strong><p>饮水 ${log.waterMl ?? 0} ml</p></div>
          <span>${formatWeightKg(log.weightKg)} kg</span>
        </article>
      `).join("") : emptyState("趋势还在生成", "记录几天后这里会更有用。")}
    </section>
  `;
}

function renderWeightChart(points) {
  if (!points.length) {
    return `<div class="chart-empty">暂无体重记录</div>`;
  }

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
    ["today", "今日"],
    ["food", "饮食"],
    ["exercise", "运动"],
    ["trends", "趋势"]
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
      if (["weightKg"].includes(key)) state.profile.weightKg = Number(input.value || state.profile.weightKg);
      await store.saveProfile(state.profile);
      await store.saveDailyLog(normalizeDailyLog(state.dailyLog));
      await loadDailyLogs();
      state.syncMessage = "本地已保存";
      await tryAutoSync();
      render();
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

  document.querySelectorAll("[data-profile-field]").forEach((input) => {
    input.addEventListener("change", async () => {
      state.profile[input.dataset.profileField] = input.value;
      await store.saveProfile(state.profile);
      state.syncMessage = "目标已本地保存";
      await tryAutoSync();
      render();
    });
  });

  document.querySelector("#food-form")?.addEventListener("submit", saveFood);
  document.querySelector("#exercise-form")?.addEventListener("submit", saveExercise);
  document.querySelector("[data-action='open-sync']")?.addEventListener("click", openSyncDialog);
}

async function updateWaterMl(value) {
  state.dailyLog.waterMl = Number(value) || 0;
  state.syncMessage = "饮水量已本地保存";
  render();
  await store.saveDailyLog(normalizeDailyLog(state.dailyLog));
  await loadDailyLogs();
  await tryAutoSync();
}

async function saveFood(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const file = form.get("photo");
  if (!file || !file.size) return;
  const imageDataUrl = await fileToDataUrl(file);
  await store.saveFoodEntry({
    id: createLocalId(),
    date: today,
    meal: form.get("meal"),
    imageDataUrl,
    note: form.get("note") ?? "",
    kcal: form.get("kcal") ? Number(form.get("kcal")) : null,
    analysisStatus: "none",
    estimatedItems: []
  });
  await loadDay();
  state.syncMessage = "照片已本地保存";
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

async function openSyncDialog() {
  const current = getSyncConfig();
  const url = prompt("Supabase URL（不填则继续本地使用）", current.url);
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
    const email = prompt("输入邮箱，发送登录链接");
    if (email) {
      try {
        await sync.sendMagicLink(email.trim());
        state.syncMessage = "登录邮件已发送，请在手机上打开邮件链接";
      } catch (error) {
        state.syncMessage = error.message;
      }
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
    intake_calories: log.intakeCalories,
    updated_at: log.updatedAt ?? new Date().toISOString()
  }));
  await sync.upsert("profiles", [{
    id: userId,
    nickname: state.profile.nickname,
    height_cm: state.profile.heightCm,
    weight_kg: state.profile.weightKg,
    target_weight_kg: state.profile.targetWeightKg || null,
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
  await sync.upsert("daily_logs", dailyLogs);
  await sync.upsert("food_entries", foodEntries);
  await sync.upsert("exercise_entries", exerciseEntries);
  state.syncMessage = "已同步";
}

function fieldCard(label, key, value, type, placeholder, step = null) {
  return `
    <label class="mini-card">
      <span>${label}</span>
      <input data-log-field="${key}" type="${type}" inputmode="decimal" ${step ? `step="${step}"` : ""} value="${escapeAttr(key === "weightKg" ? formatWeightInput(value) : value)}" placeholder="${placeholder}">
    </label>
  `;
}

function normalizeDailyLog(log) {
  return {
    ...log,
    weightKg: log.weightKg ? Number(log.weightKg) : null,
    waterMl: log.waterMl ? Number(log.waterMl) : 0,
    intakeCalories: log.intakeCalories ? Number(log.intakeCalories) : null
  };
}

function totalExerciseCalories() {
  return state.exerciseEntries.reduce((sum, entry) => sum + Number(entry.manualKcal || entry.estimatedKcal || 0), 0);
}

function intensityLabel(value) {
  return { easy: "轻松", normal: "中等", hard: "较累" }[value] ?? "中等";
}

function migrateDailyLog(log) {
  if ("waterMl" in log) return log;
  const waterMl = log.waterCups ? Number(log.waterCups) * 250 : 0;
  const { waterCups, mood, sleepHours, steps, ...rest } = log;
  return { ...rest, waterMl };
}

function formatWeightInput(value) {
  const formatted = formatWeightKg(value);
  return formatted === "-" ? "" : formatted;
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
