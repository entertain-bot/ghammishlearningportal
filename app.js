/* =====================================================================
   GHAMMISH app - turns the website into an installable app
   1. Registers the service worker (offline support)
   2. Shows an "Install app" button on browsers that support it
   ===================================================================== */

/* ---------- 1. Offline support ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}


/* ---------- 2. "Install app" button ---------- */
let installPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();          // stop the browser's default mini-banner
  installPrompt = event;           // keep it so our button can open it
  showInstallButton();
});

window.addEventListener("appinstalled", () => {
  hideInstallButton();
  installPrompt = null;
});

function showInstallButton() {
  // Already running as an installed app? Then no button.
  if (window.matchMedia("(display-mode: standalone)").matches) return;
  if (document.getElementById("install-app-btn")) return;

  const button = document.createElement("button");
  button.id = "install-app-btn";
  button.textContent = "⬇ Install app";
  button.style.cssText = [
    "position:fixed",
    "right:16px",
    "bottom:16px",
    "z-index:50",
    "padding:12px 18px",
    "border:0",
    "border-radius:30px",
    "background:linear-gradient(135deg,#f0d598,#c49a52)",
    "color:#1b1306",
    "font:bold 14px Arial,sans-serif",
    "box-shadow:0 8px 24px rgba(0,0,0,.35)",
    "cursor:pointer"
  ].join(";");

  button.addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    hideInstallButton();
  });

  document.body.appendChild(button);
}

function hideInstallButton() {
  const button = document.getElementById("install-app-btn");
  if (button) button.remove();
}
