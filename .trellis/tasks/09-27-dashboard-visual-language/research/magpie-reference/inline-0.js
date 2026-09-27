
// The chosen theme (light, dark, or the system's) is on <html data-theme>
// before anything paints.
(() => {
  let mode = "system";
  try { mode = localStorage.getItem("theme") || "system"; } catch {}
  const q = matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    const t = mode === "system" ? (q.matches ? "dark" : "light") : mode;
    document.documentElement.dataset.theme = t;
    document.querySelector('meta[name="theme-color"]').content = t === "dark" ? "#0b0b0c" : "#fafafa";
    document.querySelectorAll("button.theme").forEach((b) => { b.dataset.mode = mode; b.title = "Theme: " + mode; });
  };
  q.addEventListener("change", () => mode === "system" && apply());
  window.setTheme = (m) => { mode = m; try { m === "system" ? localStorage.removeItem("theme") : localStorage.setItem("theme", m); } catch {} apply(); };
  window.themeMode = () => mode;
  apply();
})();
