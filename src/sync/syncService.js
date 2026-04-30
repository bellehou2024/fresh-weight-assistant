const CONFIG_KEY = "fresh-weight-assistant-sync-config";
const SESSION_KEY = "fresh-weight-assistant-session";

export function getSyncConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY)) ?? { url: "", anonKey: "" };
  } catch {
    return { url: "", anonKey: "" };
  }
}

export function saveSyncConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function createSyncService(config = getSyncConfig()) {
  const isConfigured = Boolean(config.url && config.anonKey);

  return {
    isConfigured,
    getSession() {
      try {
        return JSON.parse(localStorage.getItem(SESSION_KEY));
      } catch {
        return null;
      }
    },
    saveSession(session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    },
    handleAuthRedirect() {
      if (!location.hash.includes("access_token")) return this.getSession();
      const params = new URLSearchParams(location.hash.slice(1));
      const accessToken = params.get("access_token");
      if (!accessToken) return null;
      const session = {
        access_token: accessToken,
        refresh_token: params.get("refresh_token"),
        user: decodeJwt(accessToken)
      };
      this.saveSession(session);
      history.replaceState(null, "", location.pathname + location.search);
      return session;
    },
    async sendMagicLink(email) {
      if (!isConfigured) throw new Error("同步未配置");
      const response = await fetch(`${config.url}/auth/v1/otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.anonKey
        },
        body: JSON.stringify({
          email,
          create_user: true,
          options: { email_redirect_to: location.href.split("#")[0] }
        })
      });
      if (!response.ok) throw new Error("登录邮件发送失败");
    },
    async upsert(table, rows) {
      const session = this.getSession();
      if (!isConfigured || !session?.access_token || !rows.length) return;
      const response = await fetch(`${config.url}/rest/v1/${table}?on_conflict=id`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.anonKey,
          Authorization: `Bearer ${session.access_token}`,
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(rows)
      });
      if (!response.ok) throw new Error("同步失败");
    }
  };
}

function decodeJwt(token) {
  const [, payload] = token.split(".");
  if (!payload) return null;
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return JSON.parse(atob(normalized));
  } catch {
    return null;
  }
}
