/* =====================================================================
   GHAMMISH photo carousel
   - Previous / next arrows, dots, swipe on phones, arrow keys
   - Changes slide by itself every 6 seconds (pauses when you hover,
     touch, or press Pause)
   - Does not move by itself if the phone is set to "reduce motion"
   ===================================================================== */

(function () {
  const root = document.querySelector(".carousel");
  if (!root) return;

  const viewport = root.querySelector(".carousel-viewport");
  const track = root.querySelector(".carousel-track");
  const slides = Array.from(root.querySelectorAll(".slide"));
  const prevButton = root.querySelector(".carousel-prev");
  const nextButton = root.querySelector(".carousel-next");
  const dotsBox = root.querySelector(".carousel-dots");
  const counter = root.querySelector(".carousel-counter");
  const pauseButton = root.querySelector(".carousel-pause");

  const SECONDS_PER_SLIDE = 6;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let current = 0;
  let timer = null;
  let userPaused = reduceMotion;      // the Pause button
  let holding = false;                // mouse over / finger down


  /* ---------- Dots ---------- */
  const dots = slides.map((slide, number) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.setAttribute("aria-label", "Go to photo " + (number + 1));
    dot.addEventListener("click", () => goTo(number));
    dotsBox.appendChild(dot);
    return dot;
  });


  /* ---------- Show one slide ---------- */
  function goTo(number) {
    current = (number + slides.length) % slides.length;
    track.style.transform = "translateX(-" + current * 100 + "%)";

    slides.forEach((slide, i) => {
      slide.toggleAttribute("inert", i !== current);          // hidden slides can't be tabbed to
      slide.setAttribute("aria-hidden", String(i !== current));
    });
    dots.forEach((dot, i) => dot.classList.toggle("active", i === current));
    counter.textContent = current + 1 + " / " + slides.length;
  }


  /* ---------- Automatic change ---------- */
  function start() {
    stop();
    if (userPaused || holding || slides.length < 2) return;
    timer = setInterval(() => goTo(current + 1), SECONDS_PER_SLIDE * 1000);
  }

  function stop() {
    clearInterval(timer);
    timer = null;
  }

  pauseButton.addEventListener("click", () => {
    userPaused = !userPaused;
    pauseButton.textContent = userPaused ? "▶ Play" : "❚❚ Pause";
    start();
  });
  pauseButton.textContent = userPaused ? "▶ Play" : "❚❚ Pause";


  /* ---------- Buttons, keyboard, hover ---------- */
  prevButton.addEventListener("click", () => { goTo(current - 1); start(); });
  nextButton.addEventListener("click", () => { goTo(current + 1); start(); });

  root.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") { goTo(current - 1); start(); }
    if (event.key === "ArrowRight") { goTo(current + 1); start(); }
  });

  root.addEventListener("mouseenter", () => { holding = true; stop(); });
  root.addEventListener("mouseleave", () => { holding = false; start(); });

  // Don't spin in a background tab
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));


  /* ---------- Swipe on phones ---------- */
  let touchStartX = null;

  viewport.addEventListener("pointerdown", (event) => {
    touchStartX = event.clientX;
    holding = true;
    stop();
  });

  viewport.addEventListener("pointerup", (event) => {
    if (touchStartX !== null) {
      const distance = event.clientX - touchStartX;
      if (Math.abs(distance) > 45) goTo(distance < 0 ? current + 1 : current - 1);
    }
    touchStartX = null;
    holding = false;
    start();
  });

  viewport.addEventListener("pointercancel", () => {
    touchStartX = null;
    holding = false;
    start();
  });


  goTo(0);
  start();
})();
