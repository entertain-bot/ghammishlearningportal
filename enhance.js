/* ===========================================================
   GHAMMISH — extra features.
   Runs separately from the sign-in code (auth.js), so it can
   never break login or sign-up. Everything is wrapped in
   try/catch for safety.
   =========================================================== */
(function () {
  "use strict";

  var SITE = window.GHAMMISH_SITE || {};

  function safe(fn) { try { fn(); } catch (error) { console.warn("enhance.js:", error); } }
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (error) { return null; }
  }

  /* ---------- 1. Dark mode ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var button = document.querySelector(".theme-toggle");
    if (button) {
      button.textContent = theme === "dark" ? "☀️" : "🌙";
      button.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    }
  }

  function setupTheme() {
    var header = document.querySelector(".site-header");
    if (!header) return;

    var button = el("button", "theme-toggle");
    button.type = "button";
    var menu = header.querySelector(".menu-toggle");
    header.insertBefore(button, menu || null);

    var saved = store("ghammish-theme");
    applyTheme(saved === "dark" ? "dark" : "light");

    button.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      store("ghammish-theme", next);
      applyTheme(next);
    });
  }

  /* ---------- 2. Announcement banner ---------- */
  function setupAnnouncement() {
    var note = SITE.announcement;
    if (!note || !note.text) return;

    var key = "ghammish-announce-" + (note.id || "1");
    if (store(key) === "closed") return;

    var bar = el("div", "announce-bar");
    bar.setAttribute("role", "status");
    bar.appendChild(el("span", "", note.text));

    if (note.link && note.linkText) {
      var link = el("a", "", note.linkText);
      link.href = note.link;
      bar.appendChild(link);
    }

    var close = el("button", "", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close announcement");
    close.addEventListener("click", function () {
      store(key, "closed");
      bar.remove();
    });
    bar.appendChild(close);

    document.body.insertBefore(bar, document.body.firstChild);
  }

  /* ---------- 3. Search + subject filter (resources / videos) ---------- */
  function setupFilter() {
    var page = location.pathname.toLowerCase();
    if (page.indexOf("resources") === -1 && page.indexOf("videos") === -1) return;

    var grid = document.querySelector("main .grid");
    if (!grid) return;

    var isVideos = page.indexOf("videos") !== -1;
    var bar = el("div", "filter-bar");
    var search = el("input", "filter-search");
    search.type = "search";
    search.placeholder = isVideos ? "Search videos..." : "Search resources by title or subject...";
    search.setAttribute("aria-label", "Search");
    var chips = el("div", "filter-chips");
    var count = el("p", "filter-count");
    bar.append(search, chips, count);

    var empty = el("p", "filter-empty", "Nothing found. Try another word or choose All.");
    grid.parentNode.insertBefore(bar, grid);
    grid.parentNode.insertBefore(empty, grid.nextSibling);

    var activeSubject = "All";

    function cards() { return Array.prototype.slice.call(grid.querySelectorAll(".card")); }
    function subjectOf(card) {
      var pill = card.querySelector(".pill");
      return pill ? pill.textContent.trim() : "";
    }

    function buildChips() {
      var subjects = [];
      cards().forEach(function (card) {
        var name = subjectOf(card);
        if (name && subjects.indexOf(name) === -1) subjects.push(name);
      });
      subjects.sort();
      if (activeSubject !== "All" && subjects.indexOf(activeSubject) === -1) activeSubject = "All";

      chips.textContent = "";
      chips.hidden = subjects.length < 2;
      ["All"].concat(subjects).forEach(function (name) {
        var chip = el("button", "filter-chip" + (name === activeSubject ? " active" : ""), name);
        chip.type = "button";
        chip.addEventListener("click", function () {
          activeSubject = name;
          buildChips();
          apply();
        });
        chips.appendChild(chip);
      });
    }

    function apply() {
      var words = search.value.toLowerCase().trim();
      var shown = 0;
      var all = cards();

      all.forEach(function (card) {
        var text = card.textContent.toLowerCase();
        var matchSearch = !words || text.indexOf(words) !== -1;
        var matchSubject = activeSubject === "All" || subjectOf(card) === activeSubject;
        var visible = matchSearch && matchSubject;
        card.classList.toggle("is-hidden", !visible);
        if (visible) shown++;
      });

      count.textContent = all.length ? "Showing " + shown + " of " + all.length : "";
      empty.style.display = all.length && shown === 0 ? "block" : "none";
    }

    search.addEventListener("input", apply);

    // Cards load from the database a moment after the page opens, so refresh when they change
    new MutationObserver(function () { buildChips(); apply(); }).observe(grid, { childList: true });

    buildChips();
    apply();
  }

  /* ---------- 4. Contact section (About page) ---------- */
  function setupContact() {
    var holder = document.getElementById("contact-section");
    if (!holder) return;

    var digits = function (value) { return String(value || "").replace(/\D/g, ""); };
    var actions = holder.querySelector(".contact-actions");
    var details = holder.querySelector(".contact-details");

    function addButton(label, href, className) {
      var a = el("a", "contact-btn" + (className ? " " + className : ""), label);
      a.href = href;
      if (href.indexOf("http") === 0) { a.target = "_blank"; a.rel = "noopener"; }
      actions.appendChild(a);
    }

    if (SITE.phone) addButton("📞 Call us", "tel:+" + digits(SITE.phone));
    if (SITE.whatsapp) {
      addButton("💬 WhatsApp", "https://wa.me/" + digits(SITE.whatsapp) +
        "?text=" + encodeURIComponent(SITE.whatsappMessage || ""), "whatsapp");
    }
    if (SITE.email) addButton("✉️ Email", "mailto:" + SITE.email, "outline");

    var query = SITE.mapQuery || SITE.location || "";
    if (query) {
      addButton("📍 Open in Maps", "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query), "outline");
      var map = el("iframe", "contact-map");
      map.src = "https://www.google.com/maps?q=" + encodeURIComponent(query) + "&output=embed";
      map.title = "School location map";
      map.loading = "lazy";
      map.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
      holder.querySelector(".contact-card").appendChild(map);
    }

    if (details) {
      [["Email", SITE.email], ["Phone", SITE.phone ? "+" + digits(SITE.phone) : ""], ["Location", SITE.location]]
        .forEach(function (row) {
          if (!row[1]) return;
          var p = el("p");
          var strong = el("strong", "", row[0] + ": ");
          p.append(strong, document.createTextNode(row[1]));
          details.appendChild(p);
        });
    }
  }

  /* ---------- 5. Floating WhatsApp button ---------- */
  function setupWhatsApp() {
    var number = String(SITE.whatsapp || "").replace(/\D/g, "");
    if (!number) return;
    var a = el("a", "wa-float", "💬");
    a.href = "https://wa.me/" + number + "?text=" + encodeURIComponent(SITE.whatsappMessage || "");
    a.target = "_blank";
    a.rel = "noopener";
    a.setAttribute("aria-label", "Chat with us on WhatsApp");
    document.body.appendChild(a);
  }

  /* ---------- Start ---------- */
  function start() {
    safe(setupTheme);
    safe(setupAnnouncement);
    safe(setupFilter);
    safe(setupContact);
    safe(setupWhatsApp);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
