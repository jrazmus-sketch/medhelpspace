(function () {
  try {
    // Public pages are locked to dark; only /app and /admin honor the stored
    // preference. Keep this rule in sync with src/lib/theme-scope.ts.
    var p = window.location.pathname;
    var unlocked =
      p === "/app" ||
      p.indexOf("/app/") === 0 ||
      p === "/admin" ||
      p.indexOf("/admin/") === 0;

    var r;
    if (!unlocked) {
      r = "dark";
    } else {
      var t = localStorage.getItem("mhs-theme") || "system";
      r =
        t === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : t;
    }
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(r);
  } catch (e) {}
})();
