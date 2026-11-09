/* =====================================================================
   GHAMMISH content manager (Firebase Firestore)
   ---------------------------------------------------------------------
   Manages three kinds of content, without editing any code:
     - PDFs            (Learning Materials page)
     - YouTube lessons (Educational Videos page)
     - School events   (School Events section on the home page)

   - Everyone sees what you published.
   - Only the admin account (admin-config.js) sees the admin panel and the
     Edit / Delete buttons.
   - For PDFs and videos, the cards already written in the HTML stay
     visible until you publish, so the site never looks empty.
   Real protection is in the Firestore rules (see FIRESTORE-SETUP.txt):
   even if someone copies this code, only the admin can change data.
   ===================================================================== */

import { firebaseConfig } from "./firebase-config.js";
import { adminUid } from "./admin-config.js";

const FIREBASE_URL = "https://www.gstatic.com/firebasejs/10.12.2";

const isSetUp = Boolean(
  firebaseConfig &&
  firebaseConfig.apiKey &&
  !String(firebaseConfig.apiKey).startsWith("PASTE")
);
const hasAdmin = Boolean(adminUid) && !String(adminUid).startsWith("PASTE");


/* ---------- What each kind of content looks like ---------- */
const KINDS = {
  resources: {
    orderBy: "order",
    panelTitle: "Add a PDF",
    addLabel: "Add PDF",
    empty: "No PDFs have been added yet.",
    fields: [
      { key: "subject", label: "Subject label", placeholder: "e.g. SCIENCE", required: true, half: true, upper: true },
      { key: "title", label: "Title", required: true, half: true },
      { key: "description", label: "Short description" },
      {
        key: "link", label: "Google Drive link", required: true,
        help: "Paste the Drive share link. The file must be shared as \"Anyone with the link\".",
        idField: "driveId", parse: parseDriveId,
        error: "That does not look like a Google Drive link."
      }
    ]
  },

  videos: {
    orderBy: "order",
    panelTitle: "Add a video",
    addLabel: "Add video",
    empty: "No videos have been added yet.",
    fields: [
      { key: "subject", label: "Subject label", placeholder: "e.g. BIOLOGY", required: true, half: true, upper: true },
      { key: "title", label: "Title", required: true, half: true },
      { key: "description", label: "Short description" },
      {
        key: "link", label: "YouTube link", required: true,
        help: "Paste the YouTube link (or just the video ID).",
        idField: "youtubeId", parse: parseYouTubeId,
        error: "That does not look like a YouTube link."
      }
    ]
  },

  events: {
    orderBy: "date",
    panelTitle: "Add a school event",
    addLabel: "Add event",
    empty: "No events have been added yet. Please check back soon.",
    fields: [
      { key: "title", label: "Event name", required: true, half: true },
      { key: "date", label: "Date", type: "date", required: true, half: true },
      { key: "place", label: "Place (optional)", placeholder: "e.g. School assembly ground" },
      { key: "description", label: "Short description" }
    ]
  }
};


/* ---------- Which page are we on? ---------- */
const pageName = (location.pathname.split("/").pop() || "index").replace(".html", "");
const eventsGrid = document.getElementById("events-grid");

const kind = eventsGrid ? "events" : { resources: "resources", videos: "videos" }[pageName];
const grid = kind === "events" ? eventsGrid : document.querySelector("main .grid");
const config = KINDS[kind];

// Everything the page needs to remember while it is open
const S = {
  fs: null,             // Firestore functions
  db: null,             // Firestore database
  items: [],            // published items
  meta: {},             // { published, imported }
  staticCards: [],      // the cards that were written in the HTML
  loaded: false,        // true once we have real (or saved) data
  isAdmin: false,
  editingId: null,
  panel: null
};

if (isSetUp && kind && grid) {
  startContent().catch((error) => console.error("Content could not load:", error));
}


/* ---------- Start ---------- */
async function startContent() {
  // Keep a copy of the HTML cards BEFORE anything replaces them.
  // (Events have no real cards in the HTML, only a "no events yet" note.)
  S.staticCards = kind === "events" ? [] : Array.from(grid.children).map((card) => card.cloneNode(true));

  loadStyles();

  const [{ initializeApp, getApps, getApp }, authSdk, fs] = await Promise.all([
    import(`${FIREBASE_URL}/firebase-app.js`),
    import(`${FIREBASE_URL}/firebase-auth.js`),
    import(`${FIREBASE_URL}/firebase-firestore.js`)
  ]);

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  S.fs = fs;
  S.db = fs.getFirestore(app);

  // Show the last saved copy straight away, then refresh from the internet
  const cached = readCache();
  if (cached) {
    S.items = cached.items;
    S.meta = cached.meta;
    S.loaded = true;
    render();
  }

  authSdk.onAuthStateChanged(authSdk.getAuth(app), (user) => {
    S.isAdmin = Boolean(user && hasAdmin && user.uid === adminUid);
    renderPanel();
    render();
  });

  await refresh();
}


/* ---------- Load published items ---------- */
async function refresh() {
  const { fs, db } = S;
  try {
    if (kind !== "events") {
      const metaSnap = await fs.getDoc(fs.doc(db, "meta", kind));
      S.meta = metaSnap.exists() ? metaSnap.data() : {};
    }

    const listSnap = await fs.getDocs(fs.query(fs.collection(db, kind), fs.orderBy(config.orderBy)));
    S.items = listSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
    S.loaded = true;
    writeCache();
  } catch (error) {
    console.warn("Could not load the latest items (showing saved copy):", error);
  }
  render();
  renderPanel();
}

function usingDatabase() {
  if (kind === "events") return true;
  return Boolean(S.meta.published) || S.items.length > 0;
}


/* ---------- Draw the cards ---------- */
function render() {
  if (!S.loaded) return;            // nothing real yet: keep what the HTML shows

  if (!usingDatabase()) {
    // Nothing published yet: keep the cards written in the HTML
    if (grid.dataset.source === "database") {
      grid.replaceChildren(...S.staticCards.map((card) => card.cloneNode(true)));
      grid.dataset.source = "html";
    }
    return;
  }

  grid.dataset.source = "database";

  if (S.items.length === 0) {
    grid.replaceChildren(makeElement("p", "muted", config.empty));
    return;
  }

  if (kind === "events") {
    grid.replaceChildren(...orderEvents(S.items).map(buildEventCard));
  } else {
    grid.replaceChildren(...S.items.map(buildCard));
  }
}

// PDFs and videos
function buildCard(item) {
  const card = makeElement("article", kind === "videos" ? "card video-card" : "card");
  const body = makeElement("div", "card-body");

  body.append(
    makeElement("span", "pill", item.subject || ""),
    makeElement("h3", "", item.title || ""),
    makeElement("p", "", item.description || "")
  );

  if (kind === "resources") {
    const actions = makeElement("div", "resource-actions");

    const view = makeElement("a", "resource-download resource-view", "👁 View");
    view.href = `https://drive.google.com/file/d/${item.driveId}/view`;
    view.target = "_blank";
    view.rel = "noopener";

    const download = makeElement("a", "resource-download", "⬇ Download PDF");
    download.href = `https://drive.google.com/uc?export=download&id=${item.driveId}`;

    actions.append(view, download);
    body.append(actions);
    card.append(body);
  } else {
    const frame = document.createElement("iframe");
    frame.src = `https://www.youtube-nocookie.com/embed/${item.youtubeId}`;
    frame.title = item.title || "Video lesson";
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    frame.allowFullscreen = true;
    frame.loading = "lazy";
    card.append(body, frame);
  }

  addAdminTools(body, item);
  return card;
}

// School events: upcoming first (soonest first), then past events
function orderEvents(items) {
  const today = todayText();
  const upcoming = items.filter((item) => item.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = items.filter((item) => item.date < today).sort((a, b) => b.date.localeCompare(a.date));
  return [...upcoming, ...past];
}

function buildEventCard(item) {
  const isPast = item.date < todayText();
  const date = parseDate(item.date);

  const card = makeElement("article", isPast ? "card event-card event-past" : "card event-card");

  const badge = makeElement("div", "event-date");
  badge.append(
    makeElement("b", "", String(date.getDate())),
    makeElement("span", "", date.toLocaleString("en-GB", { month: "short" }).toUpperCase())
  );

  const body = makeElement("div", "card-body");
  body.append(makeElement("span", "pill", isPast ? "PAST EVENT" : "UPCOMING"));
  body.append(makeElement("h3", "", item.title || ""));

  const when = date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  body.append(makeElement("p", "event-meta", item.place ? `${when} · ${item.place}` : when));

  if (item.description) body.append(makeElement("p", "", item.description));

  addAdminTools(body, item);
  card.append(badge, body);
  return card;
}

// Edit / Delete buttons (admin only)
function addAdminTools(body, item) {
  if (!S.isAdmin) return;

  const tools = makeElement("div", "admin-card-tools");

  const edit = makeElement("button", "admin-btn", "✏ Edit");
  edit.type = "button";
  edit.addEventListener("click", () => startEditing(item));

  const remove = makeElement("button", "admin-btn admin-btn-danger", "🗑 Delete");
  remove.type = "button";
  remove.addEventListener("click", () => deleteItem(item));

  tools.append(edit, remove);
  body.append(tools);
}


/* ---------- Admin panel (only the admin ever gets this) ---------- */
function renderPanel() {
  if (!S.isAdmin) {
    if (S.panel) S.panel.remove();
    S.panel = null;
    return;
  }

  if (!S.panel) {
    S.panel = buildPanel();
    grid.parentNode.insertBefore(S.panel, grid);
  }

  // The import button is only needed once (and never for events)
  const importBox = S.panel.querySelector("#adm-import-box");
  importBox.hidden = Boolean(S.meta.imported) || S.staticCards.length === 0;
}

function buildPanel() {
  const panel = makeElement("section", "admin-panel");

  panel.innerHTML = `
    <div class="admin-head">
      <span class="admin-badge">ADMIN</span>
      <h3 id="adm-heading">${config.panelTitle}</h3>
    </div>

    <p class="admin-note">Only you can see this panel. Visitors see the published items only.</p>

    <form id="adm-form" autocomplete="off">
      ${buildFieldsHtml()}

      <div class="admin-actions">
        <button class="admin-btn admin-btn-main" type="submit" id="adm-save">${config.addLabel}</button>
        <button class="admin-btn" type="button" id="adm-cancel" hidden>Cancel edit</button>
      </div>
    </form>

    <div id="adm-import-box" hidden>
      <hr />
      <p class="admin-note">
        The cards already written in your HTML are not in the database yet.
        Import them once so you can edit or delete them here.
      </p>
      <button class="admin-btn" type="button" id="adm-import">Import current cards</button>
    </div>

    <p class="admin-message" id="adm-message" hidden></p>
  `;

  panel.querySelector("#adm-form").addEventListener("submit", (event) => {
    event.preventDefault();
    saveItem();
  });
  panel.querySelector("#adm-cancel").addEventListener("click", resetForm);
  panel.querySelector("#adm-import").addEventListener("click", importStaticCards);

  return panel;
}

// Builds the form boxes from the field list at the top of this file
function buildFieldsHtml() {
  let html = "";
  const fields = config.fields;

  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];

    if (f.half && fields[i + 1] && fields[i + 1].half) {      // two boxes side by side
      html += `<div class="admin-row">${fieldHtml(f)}${fieldHtml(fields[i + 1])}</div>`;
      i++;
    } else {
      html += fieldHtml(f);
    }
  }
  return html;
}

function fieldHtml(f) {
  return `
    <div>
      <label for="adm-${f.key}">${f.label}</label>
      <input id="adm-${f.key}" type="${f.type || "text"}"
             placeholder="${f.placeholder || ""}" ${f.required ? "required" : ""} />
      ${f.help ? `<small>${f.help}</small>` : ""}
    </div>`;
}

function box(key) {
  return S.panel.querySelector("#adm-" + key);
}

function showMessage(text, type) {
  const message = S.panel.querySelector("#adm-message");
  message.textContent = text;
  message.className = "admin-message " + (type || "info");
  message.hidden = !text;
}

function setBusy(busy) {
  S.panel.querySelectorAll("button").forEach((button) => (button.disabled = busy));
}

function resetForm() {
  S.editingId = null;
  S.panel.querySelector("#adm-form").reset();
  S.panel.querySelector("#adm-heading").textContent = config.panelTitle;
  S.panel.querySelector("#adm-save").textContent = config.addLabel;
  S.panel.querySelector("#adm-cancel").hidden = true;
}

function startEditing(item) {
  S.editingId = item.id;

  config.fields.forEach((f) => {
    box(f.key).value = (f.idField ? item[f.idField] : item[f.key]) || "";
  });

  S.panel.querySelector("#adm-heading").textContent = "Edit item";
  S.panel.querySelector("#adm-save").textContent = "Save changes";
  S.panel.querySelector("#adm-cancel").hidden = false;
  showMessage("", "info");
  S.panel.scrollIntoView({ behavior: "smooth", block: "start" });
}


/* ---------- Add / edit ---------- */
async function saveItem() {
  const { fs, db } = S;
  const data = {};

  // Read every box and check it
  for (const f of config.fields) {
    let text = box(f.key).value.trim();

    if (f.required && !text) return showMessage(`Please fill in "${f.label}".`, "error");
    if (f.upper) text = text.toUpperCase();

    if (f.idField) {
      const id = f.parse(text);
      if (!id) return showMessage(f.error, "error");
      data[f.idField] = id;
    } else {
      data[f.key] = text;
    }
  }

  setBusy(true);
  showMessage("Saving...", "info");
  try {
    if (S.editingId) {
      await fs.updateDoc(fs.doc(db, kind, S.editingId), data);
    } else {
      if (kind !== "events") data.order = nextOrder();
      await fs.addDoc(fs.collection(db, kind), data);
    }
    if (kind !== "events") {
      await fs.setDoc(fs.doc(db, "meta", kind), { published: true }, { merge: true });
    }

    resetForm();
    await refresh();
    showMessage("Saved. Visitors can see it now.", "ok");
  } catch (error) {
    showMessage(friendlyError(error), "error");
  }
  setBusy(false);
}

function nextOrder() {
  return Math.max(0, ...S.items.map((item) => item.order || 0)) + 1;
}


/* ---------- Delete ---------- */
async function deleteItem(item) {
  if (!confirm(`Delete "${item.title}"? Visitors will no longer see it.`)) return;

  try {
    await S.fs.deleteDoc(S.fs.doc(S.db, kind, item.id));
    if (S.editingId === item.id) resetForm();
    await refresh();
    showMessage("Deleted.", "ok");
  } catch (error) {
    showMessage(friendlyError(error), "error");
  }
}


/* ---------- Import the cards written in the HTML (one time) ---------- */
async function importStaticCards() {
  const { fs, db } = S;
  let order = nextOrder();
  let added = 0;
  let skipped = 0;

  setBusy(true);
  showMessage("Importing...", "info");
  try {
    for (const card of S.staticCards) {
      const item = readStaticCard(card);
      if (!item) { skipped++; continue; }
      await fs.addDoc(fs.collection(db, kind), { ...item, order: order++ });
      added++;
    }
    await fs.setDoc(fs.doc(db, "meta", kind), { published: true, imported: true }, { merge: true });

    await refresh();
    const extra = skipped ? ` ${skipped} card(s) had no valid link and were skipped.` : "";
    showMessage(`Imported ${added} card(s).${extra}`, "ok");
  } catch (error) {
    showMessage(friendlyError(error), "error");
  }
  setBusy(false);
}

// Reads one HTML card and returns its details (or null if it has no real link)
function readStaticCard(card) {
  const linkField = config.fields.find((f) => f.idField);
  const text = (selector) => (card.querySelector(selector)?.textContent || "").trim();

  const link = kind === "resources"
    ? card.querySelector(".resource-view")?.getAttribute("href") || ""
    : card.querySelector("iframe")?.getAttribute("src") || "";

  const id = linkField.parse(link);
  if (!id) return null;

  return {
    subject: text(".pill").toUpperCase(),
    title: text("h3"),
    description: text("p"),
    [linkField.idField]: id
  };
}


/* ---------- Link helpers ---------- */
function parseDriveId(text) {
  text = String(text || "").trim();
  const match = text.match(/\/d\/([A-Za-z0-9_-]{10,})/) || text.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (match) return match[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(text) ? text : null;
}

function parseYouTubeId(text) {
  text = String(text || "").trim();
  const match = text.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
  if (match) return match[1];
  return /^[A-Za-z0-9_-]{11}$/.test(text) ? text : null;
}


/* ---------- Dates (events) ---------- */
function todayText() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function parseDate(text) {
  const [year, month, day] = String(text).split("-").map(Number);
  return new Date(year, month - 1, day);
}


/* ---------- Saved copy (so the page loads fast and works offline) ---------- */
function readCache() {
  try {
    return JSON.parse(localStorage.getItem("ghammish-cache-" + kind));
  } catch (error) {
    return null;
  }
}

function writeCache() {
  try {
    localStorage.setItem("ghammish-cache-" + kind, JSON.stringify({ items: S.items, meta: S.meta }));
  } catch (error) {
    /* storage full or blocked: ignore */
  }
}


/* ---------- Small helpers ---------- */
function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function friendlyError(error) {
  if (error && error.code === "permission-denied") {
    return "Permission denied. Make sure you are signed in as the admin, and that the same UID is in admin-config.js and in the Firestore rules (and that the rules include events).";
  }
  if (error && error.code === "unavailable") {
    return "No internet connection. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

function loadStyles() {
  if (document.querySelector('link[href$="admin.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "admin.css";
  document.head.appendChild(link);
}
