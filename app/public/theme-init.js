(function () {
  try {
    var t = localStorage.getItem("mhs-theme") || "system";
    var r =
      t === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : t;
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(r);
  } catch (e) {}
})();
