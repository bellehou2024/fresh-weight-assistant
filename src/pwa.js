if ("serviceWorker" in navigator) {
  let isRefreshing = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (isRefreshing) return;
    isRefreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      registration.update();
    } catch {
      // The app still works if service worker registration is unavailable.
    }
  });
}
