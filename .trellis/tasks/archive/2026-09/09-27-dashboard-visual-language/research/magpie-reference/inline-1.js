
(() => {
  const nav = document.getElementById("nav");

  // The theme button steps system → light → dark.
  const next = { system: "light", light: "dark", dark: "system" };
  document.querySelectorAll("button.theme").forEach((b) => {
    b.dataset.mode = themeMode();
    b.title = "Theme: " + themeMode();
    b.addEventListener("click", () => setTheme(next[themeMode()]));
  });
  const onScroll = () => nav.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  document.querySelectorAll(".copy").forEach((b) => b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(document.getElementById(b.dataset.copy).textContent);
      b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1400);
    } catch {}
  }));

  // Windows and Linux get their own app; arm64 is guessed from the user
  // agent and corrected by the browser when it can tell.
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua) ? "windows" : /Linux|X11|CrOS/.test(ua) && !/Android/.test(ua) ? "linux" : "mac";
  if (os !== "mac") {
    document.documentElement.dataset.os = os;
    const name = os === "windows" ? "Windows" : "Linux";
    const arm = /aarch64|arm64|armv8/i.test(ua);
    const dl = (a64) => "/download/" + os + (a64 ? "-arm64" : "-amd64");
    document.querySelectorAll("a.dl").forEach((a) => (a.href = dl(arm)));
    document.querySelectorAll(".dl-label").forEach((e) => (e.textContent = "Download for " + name));
    document.querySelectorAll(".os-note").forEach((e) => (e.innerHTML = os === "windows" ? "Windows 10+" : "Needs WebKitGTK 4.1"));
    document.querySelectorAll('.meta a[href="#get"]').forEach((a) => (a.textContent = "macOS & other builds"));
    try { navigator.userAgentData?.getHighEntropyValues(["architecture"]).then((v) => {
      if (v.architecture === "arm") document.querySelectorAll("a.dl").forEach((a) => (a.href = dl(true)));
    }).catch(() => {}); } catch {}
  }

  // Intel Macs get the Intel build; browsers that can tell say so, the rest
  // get Apple Silicon with the Intel link beside it.
  const setArch = (arch) => {
    if (arch !== "x86" || os !== "mac") return;
    document.querySelectorAll("a.dl").forEach((a) => (a.href = "/download/mac-intel"));
    document.querySelectorAll("a.alt").forEach((a) => { a.href = "/download/mac-arm64"; a.textContent = "Apple Silicon"; });
  };
  try { navigator.userAgentData?.getHighEntropyValues(["architecture"]).then((v) => setArch(v.architecture)).catch(() => {}); } catch {}

  fetch("/api/latest").then((r) => (r.ok ? r.json() : null)).then((rel) => {
    if (!rel) return;
    document.querySelectorAll(".ver").forEach((e) => (e.textContent = "Version " + rel.version));
  }).catch(() => {});
})();
