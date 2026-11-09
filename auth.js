/* =====================================================================
   GHAMMISH sign-in and sign-up (Firebase Authentication)
   ---------------------------------------------------------------------
   What this file does
   1. Adds "Sign in" and "Sign up" to the menu on every page. Once a
      student is signed in, it shows their name and "Sign out" instead.
   2. Powers the forms on login.html (sign in) and signup.html (sign up).
   3. Tells the rest of the site who is signed in (used by welcome.js).
   Firebase keeps the student signed in on that device, so the website
   remembers them next time.
   ===================================================================== */

import { firebaseConfig } from "./firebase-config.js";

const FIREBASE_URL = "https://www.gstatic.com/firebasejs/10.12.2";
const HOME_PAGE = "index.html";

// True once the PASTE_... values in firebase-config.js have been replaced
const isSetUp = Boolean(
  firebaseConfig &&
  firebaseConfig.apiKey &&
  !String(firebaseConfig.apiKey).startsWith("PASTE")
);

window.ghammishAuthPending = isSetUp;   // lets welcome.js know to wait for us
loadStyles();

if (isSetUp) {
  startFirebase().catch((error) => console.error("Sign-in could not start:", error));
} else {
  showNotSetUp();
}


/* ---------- Start Firebase ---------- */
async function startFirebase() {
  const { initializeApp, getApps, getApp } = await import(`${FIREBASE_URL}/firebase-app.js`);
  const fb = await import(`${FIREBASE_URL}/firebase-auth.js`);

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = fb.getAuth(app);

  // Runs now, and again every time someone signs in or out
  fb.onAuthStateChanged(auth, (user) => {
    announceUser(user);
    renderMenu(user, fb, auth);
    renderSignedInPanel(user);
  });

  wirePage(fb, auth);
}

// Lets other scripts (welcome.js) know who is signed in
function announceUser(user) {
  window.ghammishUser = user
    ? { name: displayName(user), firstName: firstName(user), email: user.email, uid: user.uid }
    : null;
  window.ghammishAuthReady = true;
  window.dispatchEvent(new CustomEvent("ghammish-auth"));
}


/* ---------- Menu: "Sign in / Sign up" or "Name + Sign out" ---------- */
function renderMenu(user, fb, auth) {
  const nav = document.querySelector(".nav");
  if (!nav) return;

  nav.querySelectorAll(".nav-auth").forEach((item) => item.remove());

  if (!user) {
    nav.appendChild(makeNavLink("nav-signin", "login.html", "Sign in"));
    nav.appendChild(makeNavLink("nav-signup", "signup.html", "Sign up"));
    return;
  }

  const name = document.createElement("span");
  name.className = "nav-auth nav-user";
  name.textContent = "👤 " + firstName(user);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "nav-auth nav-signout";
  button.textContent = "Sign out";
  button.addEventListener("click", () => fb.signOut(auth));

  nav.appendChild(name);
  nav.appendChild(button);
}

function makeNavLink(className, href, text) {
  const link = document.createElement("a");
  link.className = "nav-auth " + className;
  link.href = href;
  link.textContent = text;
  return link;
}


/* ---------- Sign-in / sign-up pages: which panel to show ---------- */
function renderSignedInPanel(user) {
  const forms = document.getElementById("auth-forms");
  const signedIn = document.getElementById("auth-signedin");
  if (!forms || !signedIn) return;

  forms.hidden = Boolean(user);
  signedIn.hidden = !user;

  if (user) {
    document.getElementById("signedin-name").textContent = displayName(user);
  }
}


/* ---------- Buttons and forms (only the ones on the current page) ---------- */
function wirePage(fb, auth) {
  const card = document.getElementById("auth-card");
  if (!card) return;

  // Sign in with email + password (login.html)
  on("form-signin", "submit", (event) => {
    event.preventDefault();
    const email = value("signin-email");
    const password = document.getElementById("signin-password").value;

    run(() => fb.signInWithEmailAndPassword(auth, email, password), "Welcome back!");
  });

  // Create a new account (signup.html)
  on("form-signup", "submit", (event) => {
    event.preventDefault();
    const name = value("signup-name");
    const email = value("signup-email");
    const password = document.getElementById("signup-password").value;
    const confirm = document.getElementById("signup-confirm").value;

    if (password !== confirm) {
      return showMessage("The two passwords do not match. Please type them again.", "error");
    }

    run(async () => {
      const result = await fb.createUserWithEmailAndPassword(auth, email, password);
      await fb.updateProfile(result.user, { displayName: name });
      announceUser(auth.currentUser);                    // show the full name straight away
      renderMenu(auth.currentUser, fb, auth);
    }, "Your account is ready. Welcome to GHAMMISH!");
  });

  // Continue with Google (both pages)
  on("btn-google", "click", () => {
    run(() => fb.signInWithPopup(auth, new fb.GoogleAuthProvider()), "Welcome!");
  });

  // Forgot password (login.html)
  on("btn-reset", "click", async () => {
    const email = value("signin-email");
    if (!email) {
      return showMessage("Type your email in the box above first, then tap Forgot password.", "error");
    }
    try {
      await fb.sendPasswordResetEmail(auth, email);
      showMessage("Password reset email sent. Check your inbox (and spam folder).", "ok");
    } catch (error) {
      showMessage(friendlyError(error), "error");
    }
  });

  // Sign out (on the "you are signed in" panel)
  on("btn-signout", "click", () => fb.signOut(auth));
}

// Runs an action, shows the result, and goes to the home page on success
async function run(action, successText) {
  const buttons = document.querySelectorAll("#auth-card button");
  buttons.forEach((button) => (button.disabled = true));
  showMessage("Please wait...", "info");

  try {
    await action();
    showMessage(successText, "ok");
    setTimeout(() => (window.location.href = HOME_PAGE), 900);
  } catch (error) {
    showMessage(friendlyError(error), "error");
    buttons.forEach((button) => (button.disabled = false));
  }
}

function showMessage(text, type) {
  const box = document.getElementById("auth-message");
  if (!box) return;
  box.textContent = text;
  box.className = "auth-message " + type;
  box.hidden = !text;
}


/* ---------- Helpers ---------- */
function on(id, eventName, handler) {
  const element = document.getElementById(id);
  if (element) element.addEventListener(eventName, handler);
}

function value(id) {
  const element = document.getElementById(id);
  return element ? element.value.trim() : "";
}

function displayName(user) {
  return user.displayName || (user.email ? user.email.split("@")[0] : "Student");
}

function firstName(user) {
  return displayName(user).split(" ")[0];
}

// Turns Firebase error codes into messages students can understand
function friendlyError(error) {
  const messages = {
    "auth/invalid-credential":        "Wrong email or password. Please try again.",
    "auth/wrong-password":            "Wrong email or password. Please try again.",
    "auth/user-not-found":            "No account found with that email. Try Sign up.",
    "auth/invalid-email":             "That email address does not look right.",
    "auth/email-already-in-use":      "An account with that email already exists. Try Sign in.",
    "auth/weak-password":             "Password is too short. Use at least 6 characters.",
    "auth/too-many-requests":         "Too many tries. Please wait a few minutes and try again.",
    "auth/network-request-failed":    "No internet connection. Please check and try again.",
    "auth/popup-closed-by-user":      "Google sign-in was cancelled.",
    "auth/cancelled-popup-request":   "Google sign-in was cancelled.",
    "auth/popup-blocked":             "Your browser blocked the Google window. Allow pop-ups and try again.",
    "auth/operation-not-allowed":     "This sign-in method is not turned on yet in Firebase.",
    "auth/unauthorized-domain":       "This website address is not allowed yet in Firebase (Authorized domains)."
  };
  return messages[error.code] || "Something went wrong. Please try again.";
}

function showNotSetUp() {
  const card = document.getElementById("auth-card");
  if (!card) return;
  card.querySelectorAll("button, input").forEach((item) => (item.disabled = true));
  showMessage("Sign-in is not set up yet. The school admin still needs to add the Firebase settings.", "error");
}

// Loads auth.css so the menu buttons look right on every page
function loadStyles() {
  if (document.querySelector('link[href$="auth.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "auth.css";
  document.head.appendChild(link);
}
