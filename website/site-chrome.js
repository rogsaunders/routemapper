/**
 * RouteMapper shared header + footer.
 *
 * Edit the menu / footer links HERE ONLY — every page that loads this
 * script picks up the change.
 *
 * Usage in a page:
 *   <script src="/site-chrome.js" data-part="header"></script>   (where the header goes)
 *   <script src="/site-chrome.js" data-part="footer"></script>   (where the footer goes)
 *
 * Optional on the header tag:  data-active="live"  (highlights that menu item)
 */
(function () {
  "use strict";

  // ---- EDIT THESE ----------------------------------------------------
  var NAV_LINKS = [
    { id: "features", label: "Features", href: "/#features" },
    { id: "live", label: "Live Navigation", href: "/live" },
    { id: "usecases", label: "Use Cases", href: "/#usecases" },
    { id: "pricing", label: "Pricing", href: "/#pricing" },
    { id: "roadmap", label: "Roadmap", href: "/#roadmap" },
    { id: "updates", label: "Updates", href: "/updates.html" },
    { id: "guide", label: "User Guide", href: "/guide" },
  ];
  var APP_URL = "https://app.routemapper.net";

  var FOOTER_LINKS = [
    { label: "Home", href: "/" },
    { label: "Live Navigation", href: "/live" },
    { label: "User Guide", href: "/guide" },
    { label: "Pricing", href: "/#pricing" },
    { label: "Updates", href: "/updates.html" },
    { label: "Press Kit", href: "/press.html" },
    { label: "Terms of Service", href: "/terms.html" },
    { label: "Privacy Policy", href: "/privacy.html" },
  ];
  // --------------------------------------------------------------------

  var script = document.currentScript;
  if (!script) return;
  var part = script.getAttribute("data-part");
  var active = script.getAttribute("data-active") || "";

  function headerHtml() {
    var links = NAV_LINKS.map(function (l) {
      var cur = l.id === active ? ' aria-current="page"' : "";
      return '<a href="' + l.href + '"' + cur + ">" + l.label + "</a>";
    }).join("\n          ");
    return (
      '<header class="nav nav-overlay">\n' +
      '  <div class="container nav-wrap">\n' +
      '    <a class="brand" href="/" aria-label="RouteMapper home">\n' +
      '      <img src="/assets/route-logo.png" alt="RouteMapper logo" />\n' +
      "    </a>\n" +
      '    <button class="menu-toggle" aria-label="Toggle navigation menu" aria-expanded="false">\n' +
      "      <span></span><span></span><span></span>\n" +
      "    </button>\n" +
      '    <nav class="nav-menu">\n          ' +
      links +
      '\n          <a href="' +
      APP_URL +
      '" class="btn btn-green">Launch App</a>\n' +
      "    </nav>\n" +
      "  </div>\n" +
      "</header>"
    );
  }

  function footerHtml() {
    var links = FOOTER_LINKS.map(function (l) {
      return '<a href="' + l.href + '">' + l.label + "</a>";
    }).join("\n          ");
    return (
      '<footer class="footer">\n' +
      '  <div class="container foot-grid">\n' +
      "    <div>\n" +
      '      <img class="foot-logo" src="/assets/route-logo.png" alt="RouteMapper logo" />\n' +
      "      <p>&copy; " +
      new Date().getFullYear() +
      " RouteMapper. All rights reserved.</p>\n" +
      '      <p class="footer-tagline">Built for the journey, designed for the destination.</p>\n' +
      "    </div>\n" +
      '    <nav aria-label="Footer navigation">\n' +
      '      <h3 class="sr-only">Site links</h3>\n          ' +
      links +
      "\n    </nav>\n" +
      "  </div>\n" +
      "</footer>"
    );
  }

  if (part === "header") script.insertAdjacentHTML("afterend", headerHtml());
  else if (part === "footer") script.insertAdjacentHTML("afterend", footerHtml());
})();
