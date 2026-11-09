/* =====================================================================
   GHAMMISH returning-visitor recognition
   ---------------------------------------------------------------------
   - Every browser gets a small note saved on the device (first visit,
     last visit, number of visits). Nothing is sent anywhere.
   - On the home page, a message above the heading says:
       * first time visitor  -> "Welcome to GHAMMISH!" + Sign up link
       * returning visitor   -> "Welcome back!" + Sign in link
       * signed-in student   -> "Welcome back, Name!" + last visit date
   ===================================================================== */

const VISITOR_KEY = "ghammish-visitor";       // saved on the device
const SESSION_KEY = "ghammish-greeting";      // saved for this browser tab session

const greeting = getGreeting();
const note = document.getElementById("welcome-note");

if (note) {
  // Update the message whenever the sign-in check finishes or changes
  window.addEventListener("ghammish-auth", () => showNote(window.ghammishUser || null));

  if (window.ghammishAuthReady || !window.ghammishAuthPending) {
    showNote(window.ghammishUser || null);        // sign-in not used, or already checked
  } else {
    // Wait briefly so a signed-in student never sees the wrong message
    setTimeout(() => showNote(window.ghammishUser || null), 1800);
  }
}


/* ---------- Count this visit (once per browser session) ---------- */
function getGreeting() {
  const saved = readJson(sessionStorage, SESSION_KEY);
  if (saved) return saved;

  const visitor = readJson(localStorage, VISITOR_KEY);
  const now = new Date().toISOString();

  const result = {
    returning: Boolean(visitor && visitor.first),
    previousVisit: visitor ? visitor.last : null
  };

  writeJson(localStorage, VISITOR_KEY, {
    first: visitor && visitor.first ? visitor.first : now,
    last: now,
    visits: ((visitor && visitor.visits) || 0) + 1
  });
  writeJson(sessionStorage, SESSION_KEY, result);

  return result;
}


/* ---------- Write the message ---------- */
function showNote(user) {
  note.textContent = "";

  if (user) {
    const text = greeting.returning || greeting.previousVisit ? "Welcome back, " : "Welcome, ";
    note.append(text + user.firstName + "!");

    if (greeting.previousVisit) {
      note.append(" Your last visit was on " + formatDate(greeting.previousVisit) + ".");
    }
  } else if (greeting.returning) {
    note.append("Welcome back to GHAMMISH! ");
    note.append(makeLink("Sign in", "login.html"));
    note.append(" so we can remember your name.");
  } else {
    note.append("Welcome to GHAMMISH! New here? ");
    note.append(makeLink("Create a free account", "signup.html"));
    note.append(" and we will remember you next time.");
  }

  note.hidden = false;
}

function makeLink(text, href) {
  const link = document.createElement("a");
  link.href = href;
  link.textContent = text;
  return link;
}

function formatDate(isoText) {
  return new Date(isoText).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}


/* ---------- Saved-data helpers (safe if storage is blocked) ---------- */
function readJson(storage, key) {
  try {
    return JSON.parse(storage.getItem(key));
  } catch (error) {
    return null;
  }
}

function writeJson(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (error) {
    /* storage blocked or full: ignore */
  }
}
