// Runs before first paint (loaded from index.html as a blocking script, so the
// CSP needs no inline-script allowance).
(function () {
  var mode = null;
  try {
    mode = localStorage.getItem("paddlemate-color-mode");
  } catch (e) {}
  var dark =
    mode === "dark" ||
    (mode !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  // Mirrors resolveMotion in src/lib/motionMode.ts.
  var motion = null;
  try {
    motion = localStorage.getItem("pm-motion");
  } catch (e) {}
  var reduced =
    motion === "reduced" ||
    (motion === "system" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches);
  document.documentElement.setAttribute(
    "data-motion",
    reduced ? "reduced" : "full",
  );
  document
    .querySelector('meta[name="theme-color"][media*="light"]')
    .setAttribute("content", dark ? "#141b1f" : "#ffffff");
  // iOS, iPads that call themselves a Mac included: draw to the edge
  // and keep the bottom chrome above the home indicator (theme.ts).
  var ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (ios) {
    document.documentElement.setAttribute("data-ios", "");
    var vp = document.querySelector('meta[name="viewport"]');
    vp.setAttribute("content", vp.getAttribute("content") + ", viewport-fit=cover");
  }
})();
