const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export function createDefaultFastingPlan() {
  return {
    planType: "16:8",
    eatingWindowStart: "12:00",
    eatingWindowEnd: "20:00"
  };
}

export function getFastingWindow({ date, eatingWindowStart, eatingWindowEnd }) {
  const eatingStartAt = parseLocalDateTime(date, eatingWindowStart);
  let eatingEndAt = parseLocalDateTime(date, eatingWindowEnd);
  if (eatingEndAt <= eatingStartAt) {
    eatingEndAt = new Date(eatingEndAt.getTime() + DAY_MS);
  }

  return {
    fastingStartAt: toLocalIso(new Date(eatingStartAt.getTime() - (eatingEndAt.getTime() - eatingStartAt.getTime() === DAY_MS ? 0 : DAY_MS - (eatingEndAt - eatingStartAt)))),
    fastingEndAt: toLocalIso(eatingStartAt),
    eatingStartAt: toLocalIso(eatingStartAt),
    eatingEndAt: toLocalIso(eatingEndAt)
  };
}

export function getFastingStatus({ plan, now = new Date() }) {
  if (!plan) {
    return {
      status: "idle",
      label: "未开始",
      remainingMs: null,
      targetAt: null
    };
  }

  const date = toDateKey(now);
  const window = getFastingWindow({
    date,
    eatingWindowStart: plan.eatingWindowStart,
    eatingWindowEnd: plan.eatingWindowEnd
  });
  const eatingStart = new Date(window.eatingStartAt);
  const eatingEnd = new Date(window.eatingEndAt);

  if (now >= eatingStart && now < eatingEnd) {
    return {
      status: "eating",
      label: "进食窗口中",
      remainingMs: eatingEnd.getTime() - now.getTime(),
      targetAt: window.eatingEndAt,
      ...window
    };
  }

  const targetAt = now < eatingStart ? eatingStart : new Date(eatingStart.getTime() + DAY_MS);
  return {
    status: "fasting",
    label: "断食中",
    remainingMs: targetAt.getTime() - now.getTime(),
    targetAt: toLocalIso(targetAt),
    ...window,
    fastingEndAt: toLocalIso(targetAt)
  };
}

export function formatDuration(ms) {
  const minutes = Math.max(0, Math.ceil(Number(ms || 0) / MINUTE_MS));
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (!hours) return `${restMinutes}分钟`;
  if (!restMinutes) return `${hours}小时`;
  return `${hours}小时${restMinutes}分钟`;
}

export function createFastingLog({ id, date, planType, eatingWindowStart, eatingWindowEnd, now = new Date() }) {
  const status = getFastingStatus({
    plan: { eatingWindowStart, eatingWindowEnd },
    now
  });
  const window = getFastingWindow({ date, eatingWindowStart, eatingWindowEnd });

  return {
    id,
    date,
    planType,
    eatingWindowStart,
    eatingWindowEnd,
    fastingStartAt: window.fastingStartAt,
    fastingEndAt: status.fastingEndAt ?? window.fastingEndAt,
    eatingStartAt: window.eatingStartAt,
    eatingEndAt: window.eatingEndAt,
    status: status.status
  };
}

function parseLocalDateTime(date, time) {
  const [hour = 0, minute = 0] = String(time || "00:00").split(":").map(Number);
  const [year, month, day] = String(date).split("-").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}`;
}
