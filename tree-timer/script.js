/* =========================================================
   GROWING TREE TIMER
   - Lottie tree growth tied to countdown
   - localStorage persistence (auto-resume)
   - Continuous piano background music with fade + loop
   - Mute toggle works ANYTIME (independent of timer state)
   ========================================================= */

/* ---------- 1. DOM references ---------- */
const timerEl       = document.getElementById("timer");
const completeMsg   = document.getElementById("complete-msg");
const treeContainer = document.getElementById("tree-container");
const loadingEl     = document.getElementById("loading");

const btnStart  = document.getElementById("btn-start");
const btnPause  = document.getElementById("btn-pause");
const btnReset  = document.getElementById("btn-reset");
const btnStop   = document.getElementById("btn-stop");
const btnChange = document.getElementById("btn-change");
const btnSound  = document.getElementById("btn-sound");

const changePanel  = document.getElementById("change-panel");
const inputHours   = document.getElementById("input-hours");
const inputMinutes = document.getElementById("input-minutes");
const inputSeconds = document.getElementById("input-seconds");
const btnApply     = document.getElementById("btn-apply");
const btnCancel    = document.getElementById("btn-cancel");

/* ---------- 2. Config ---------- */
const STORAGE_KEY   = "treeTimerState";
const SOUND_KEY     = "treeTimerSoundMuted";
const DEFAULT_TIME  = 30;
const TOTAL_FRAMES  = 320;          // bloom frame
const FADE_MS       = 1500;         // fade time (ms)
const TARGET_VOLUME = 2000.0;         // max volume (0 → 1)

/* ---------- 3. State ---------- */
let totalSeconds = DEFAULT_TIME;
let remaining    = totalSeconds;
let elapsed      = 0;
let isRunning    = false;
let tickInterval = null;

let muted        = false;           // user preference (persisted)
let fadeInterval = null;            // handle for fade steps

/* ---------- 4. Audio setup ---------- */
const piano = new Audio("sounds/piano.mp3");
piano.loop    = true;
piano.volume  = 0;
piano.preload = "auto";

/* Restore mute preference from localStorage */
try {
  muted = localStorage.getItem(SOUND_KEY) === "true";
} catch (e) {}

function updateSoundButton() {
  btnSound.textContent = muted ? "🔇" : "🔊";
  btnSound.classList.toggle("muted", muted);
}

/* Smooth fade from current volume → target */
function fadeVolume(target) {
  if (fadeInterval) clearInterval(fadeInterval);

  const steps  = 40;
  const stepMs = FADE_MS / steps;
  const start  = piano.volume;
  const diff   = target - start;
  let   i      = 0;

  fadeInterval = setInterval(() => {
    i++;
    piano.volume = Math.max(0, Math.min(1, start + diff * (i / steps)));

    if (i >= steps) {
      clearInterval(fadeInterval);
      fadeInterval = null;

      // After fading to 0, actually pause the audio so it doesn't
      // keep playing silently in the background
      if (target === 0) {
        piano.pause();
      }
    }
  }, stepMs);
}

/* Start (or resume) piano with fade-in.
   Silently does nothing if muted. */
function startPiano() {
  if (muted) return;

  if (piano.paused) {
    // Only reset currentTime if it's the very first start of a session.
    // If it's a resume, keep the position and just fade back in.
    piano.volume = 0;
    piano.play().catch(err => console.warn("Piano play blocked:", err));
    fadeVolume(TARGET_VOLUME);
  } else {
    fadeVolume(TARGET_VOLUME);
  }
}

/* Fade out and pause. Keeps currentTime so resume works. */
function pausePiano() {
  if (piano.paused && piano.volume === 0) return;
  fadeVolume(0);
}

/* Full stop + rewind (used by Reset and Stop) */
function stopPiano() {
  if (fadeInterval) clearInterval(fadeInterval);
  fadeInterval = null;
  piano.pause();
  piano.currentTime = 0;
  piano.volume      = 0;
}

/* ---------- 5. Lottie tree ---------- */
const tree = lottie.loadAnimation({
  container: treeContainer,
  renderer: "svg",
  loop: false,
  autoplay: false,
  path: "tree.json",
});

tree.addEventListener("DOMLoaded", () => {
  console.log("Tree loaded ✅ — total frames in file:", tree.totalFrames);
  loadingEl.classList.add("hidden");
  treeContainer.classList.add("ready");

  restoreSession();
  updateTimerText();
  updateTree();
  updateButtonStates();
  updateSoundButton();

  if (isRunning && remaining > 0) {
    startTimer();
  }
});

/* ---------- 6. Helpers ---------- */

function formatTime(s) {
  s = Math.max(0, Math.floor(s));
  const h  = String(Math.floor(s / 3600)).padStart(2, "0");
  const m  = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sc = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sc}`;
}

function updateTimerText() {
  timerEl.textContent = formatTime(remaining);
  if (remaining <= 10 && remaining > 0) {
    timerEl.classList.add("low");
  } else {
    timerEl.classList.remove("low");
  }
}

function setTreeProgress(p) {
  p = Math.max(0, Math.min(1, p));
  tree.goToAndStop(p * TOTAL_FRAMES, true);
}

function updateTree() {
  if (totalSeconds <= 0) return;
  setTreeProgress(elapsed / totalSeconds);
}

function readTimeInputs() {
  const h = Number(inputHours.value)   || 0;
  const m = Number(inputMinutes.value) || 0;
  const s = Number(inputSeconds.value) || 0;
  return h * 3600 + m * 60 + s;
}

function writeTimeInputs(total) {
  inputHours.value   = Math.floor(total / 3600);
  inputMinutes.value = Math.floor((total % 3600) / 60);
  inputSeconds.value = total % 60;
}

function updateButtonStates() {
  btnStart.disabled  = isRunning || remaining <= 0;
  btnPause.disabled  = !isRunning;
  btnReset.disabled  = false;
  btnStop.disabled   = false;
  btnChange.disabled = isRunning;
  // NOTE: btnSound is intentionally NEVER disabled — it must work anytime
}

/* ---------- 7. Persistence ---------- */

function saveState() {
  const state = {
    totalSeconds,
    remaining,
    elapsed,
    isRunning,
    lastSavedAt: Date.now(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Could not save state:", e);
  }
}

function clearSavedState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
}

function restoreSession() {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {}
  if (!raw) return;

  let state;
  try { state = JSON.parse(raw); } catch (e) { return; }
  if (!state || typeof state.totalSeconds !== "number") return;

  totalSeconds = state.totalSeconds;
  elapsed      = state.elapsed   || 0;
  remaining    = state.remaining ?? state.totalSeconds;
  isRunning    = !!state.isRunning;

  if (state.isRunning && state.lastSavedAt) {
    const secondsPassed = Math.floor((Date.now() - state.lastSavedAt) / 1000);
    if (secondsPassed > 0) {
      elapsed   = Math.min(totalSeconds, elapsed + secondsPassed);
      remaining = Math.max(0, totalSeconds - elapsed);
    }
  }

  if (remaining <= 0) {
    remaining = 0;
    elapsed   = totalSeconds;
    isRunning = false;
    completeMsg.classList.remove("hidden");
    requestAnimationFrame(() => completeMsg.classList.add("show"));
  }
}

/* ---------- 8. Timer core ---------- */

function startTimer() {
  if (isRunning) return;
  if (remaining <= 0) return;

  completeMsg.classList.remove("show");
  completeMsg.classList.add("hidden");

  isRunning = true;
  updateButtonStates();
  saveState();
  startPiano();

  tickInterval = setInterval(() => {
    remaining -= 1;
    elapsed   += 1;

    if (remaining <= 0) {
      remaining = 0;
      updateTimerText();
      updateTree();
      finishTimer();
      return;
    }

    updateTimerText();
    updateTree();
    saveState();
  }, 1000);
}

function pauseTimer() {
  if (!isRunning) return;
  clearInterval(tickInterval);
  tickInterval = null;
  isRunning = false;
  updateButtonStates();
  saveState();
  pausePiano();
}

function resetTimer() {
  pauseTimer();
  clearSavedState();
  stopPiano();

  totalSeconds = totalSeconds || DEFAULT_TIME;
  remaining    = totalSeconds;
  elapsed      = 0;
  isRunning    = false;

  updateTimerText();
  setTreeProgress(0);
  completeMsg.classList.remove("show");
  completeMsg.classList.add("hidden");
  updateButtonStates();
  saveState();
}

function stopTimer() {
  pauseTimer();
  stopPiano();
  remaining = 0;
  elapsed   = totalSeconds;
  updateTimerText();
  updateTree();
  updateButtonStates();
  saveState();
}

function finishTimer() {
  pauseTimer();
  pausePiano();
  remaining = 0;
  elapsed   = totalSeconds;
  completeMsg.classList.remove("hidden");
  requestAnimationFrame(() => completeMsg.classList.add("show"));
  updateButtonStates();
  saveState();
}

/* ---------- 9. Button wiring ---------- */

btnStart.addEventListener("click", startTimer);
btnPause.addEventListener("click", pauseTimer);
btnReset.addEventListener("click", resetTimer);
btnStop.addEventListener("click",  stopTimer);

btnChange.addEventListener("click", () => {
  writeTimeInputs(totalSeconds);
  changePanel.classList.remove("hidden");
  inputHours.focus();
});

btnCancel.addEventListener("click", () => {
  changePanel.classList.add("hidden");
});

/* ---------- 10. Sound toggle — WORKS ANYTIME ---------- */
btnSound.addEventListener("click", () => {
  muted = !muted;
  try { localStorage.setItem(SOUND_KEY, String(muted)); } catch (e) {}
  updateSoundButton();

  if (muted) {
    // Fade out, no matter what state the timer is in
    pausePiano();
  } else {
    // Unmuted: if the timer is currently running, bring music back.
    // If the timer is not running, stay silent — music will start
    // automatically when the user clicks Start.
    if (isRunning) {
      startPiano();
    }
  }
});

/* ---------- 11. Change Time (Option A) ---------- */

btnApply.addEventListener("click", () => {
  const newTotal = readTimeInputs();
  if (newTotal < 1) {
    alert("Please set at least 1 second.");
    return;
  }
  totalSeconds = newTotal;

  if (elapsed > totalSeconds) {
    elapsed   = totalSeconds;
    remaining = 0;
  } else {
    remaining = totalSeconds - elapsed;
  }

  updateTimerText();
  updateTree();
  changePanel.classList.add("hidden");
  updateButtonStates();
  saveState();
});

/* ---------- 12. Save on tab close ---------- */

window.addEventListener("beforeunload", saveState);
window.addEventListener("pagehide",    saveState);
