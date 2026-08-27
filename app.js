const PRESETS = {
  consecutive: {
    stages: [
      { name: "听取与笔记", hint: "集中获取信息，暂不组织译文。", minutes: 3 },
      { name: "口译输出", hint: "保持完整、准确、清楚，控制自我修正。", minutes: 4 }
    ],
    breakMinutes: 1,
    rounds: 3
  },
  retelling: {
    stages: [
      { name: "听取与保持", hint: "抓住主旨、结构和关键限定。", minutes: 2 },
      { name: "同语复述", hint: "按原逻辑重构，不追求逐字复现。", minutes: 2 }
    ],
    breakMinutes: 0.5,
    rounds: 3
  },
  sight: {
    stages: [
      { name: "快速准备", hint: "划分信息单元，预判主干与术语。", minutes: 1 },
      { name: "视译输出", hint: "目光领先于表达，保持稳定节奏。", minutes: 3 }
    ],
    breakMinutes: 1,
    rounds: 3
  }
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  clock: $("#clock"), ring: $("#progressRing"), title: $("#timerTitle"), hint: $("#phaseHint"),
  round: $("#roundLabel"), start: $("#startButton"), startLabel: $("#startLabel"), startIcon: $("#startIcon"),
  reset: $("#resetButton"), skip: $("#skipButton"), sound: $("#soundButton"), soundIcon: $("#soundIcon"),
  fullscreen: $("#fullscreenButton"), restore: $("#restoreButton"), sequence: $("#sequence"), toast: $("#toast"),
  first: $("#stageOneMinutes"), second: $("#stageTwoMinutes"), breakTime: $("#breakMinutes"), rounds: $("#roundsInput")
};

let presetKey = localStorage.getItem("practiceTimerPreset") || "consecutive";
let config = loadConfig();
let phaseIndex = 0;
let currentRound = 1;
let remaining = config.stages[0].minutes * 60;
let total = remaining;
let running = false;
let lastTick = null;
let animationId = null;
let soundEnabled = localStorage.getItem("practiceTimerSound") !== "false";
let audioContext = null;

function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem("practiceTimerConfig"));
    if (saved?.stages?.length === 2) return saved;
  } catch (_) {}
  return structuredClone(PRESETS[presetKey] || PRESETS.consecutive);
}

function saveConfig() {
  localStorage.setItem("practiceTimerConfig", JSON.stringify(config));
  localStorage.setItem("practiceTimerPreset", presetKey);
}

function phaseList() {
  const list = [...config.stages];
  if (config.breakMinutes > 0) list.push({ name: "轮间休息", hint: "放松注意力，为下一轮重新集中。", minutes: config.breakMinutes, isBreak: true });
  return list;
}

function activePhase() { return phaseList()[phaseIndex]; }

function formatTime(seconds) {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

function render() {
  const phase = activePhase();
  elements.clock.textContent = formatTime(remaining);
  elements.title.textContent = phase.name;
  elements.hint.textContent = phase.hint;
  elements.round.textContent = `第 ${currentRound} 轮，共 ${config.rounds} 轮`;
  elements.startLabel.textContent = running ? "暂停" : remaining < total ? "继续" : "开始";
  elements.startIcon.textContent = running ? "Ⅱ" : "▶";
  elements.ring.style.strokeDashoffset = String(904.78 * (1 - Math.max(0, remaining) / total));
  document.body.classList.toggle("break-mode", Boolean(phase.isBreak));
  document.title = `${formatTime(remaining)} · ${phase.name} · Practice Timer`;
  renderSequence();
}

function renderSequence() {
  elements.sequence.innerHTML = phaseList().map((phase, index) => {
    const state = index === phaseIndex ? "active" : index < phaseIndex ? "done" : "";
    return `<span class="sequence-step ${state}">${phase.name}</span>`;
  }).join("");
}

function syncInputs() {
  elements.first.value = config.stages[0].minutes;
  elements.second.value = config.stages[1].minutes;
  elements.breakTime.value = config.breakMinutes;
  elements.rounds.value = config.rounds;
  document.querySelectorAll(".preset").forEach(button => button.classList.toggle("active", button.dataset.preset === presetKey));
}

function startPause() {
  running = !running;
  lastTick = performance.now();
  if (running) {
    ensureAudio();
    animationId = requestAnimationFrame(tick);
  } else {
    cancelAnimationFrame(animationId);
  }
  render();
}

function tick(now) {
  if (!running) return;
  remaining -= (now - lastTick) / 1000;
  lastTick = now;
  if (remaining <= 0) {
    remaining = 0;
    render();
    beep(880, 0.13, 3);
    setTimeout(() => advance(true), 500);
    return;
  }
  render();
  animationId = requestAnimationFrame(tick);
}

function advance(autoplay = false) {
  cancelAnimationFrame(animationId);
  const phases = phaseList();
  const nextPhaseIsFinalBreak = phaseIndex === config.stages.length - 1 && currentRound === config.rounds;
  if (nextPhaseIsFinalBreak) {
    finishSession();
    return;
  }
  if (phaseIndex < phases.length - 1) {
    phaseIndex += 1;
  } else if (currentRound < config.rounds) {
    currentRound += 1;
    phaseIndex = 0;
  } else {
    finishSession();
    return;
  }
  const phase = activePhase();
  total = phase.minutes * 60;
  remaining = total;
  running = autoplay;
  lastTick = performance.now();
  render();
  showToast(phase.name);
  if (running) animationId = requestAnimationFrame(tick);
}

function finishSession() {
  running = false;
  phaseIndex = 0;
  currentRound = 1;
  remaining = config.stages[0].minutes * 60;
  total = remaining;
  render();
  showToast("训练完成");
  beep(660, 0.18, 2);
}

function resetTimer() {
  cancelAnimationFrame(animationId);
  running = false;
  phaseIndex = 0;
  currentRound = 1;
  total = config.stages[0].minutes * 60;
  remaining = total;
  render();
}

function applyPreset(key) {
  presetKey = key;
  config = structuredClone(PRESETS[key]);
  saveConfig();
  syncInputs();
  resetTimer();
  showToast("已切换训练方案");
}

function updateCustomConfig() {
  const valid = (value, fallback, min, max) => Math.min(max, Math.max(min, Number(value) || fallback));
  config.stages[0].minutes = valid(elements.first.value, 3, 0.1, 60);
  config.stages[1].minutes = valid(elements.second.value, 4, 0.1, 60);
  config.breakMinutes = valid(elements.breakTime.value, 0, 0, 30);
  config.rounds = Math.round(valid(elements.rounds.value, 3, 1, 20));
  presetKey = "custom";
  saveConfig();
  syncInputs();
  resetTimer();
}

function ensureAudio() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
}

function beep(frequency, duration, count = 1) {
  if (!soundEnabled) return;
  ensureAudio();
  for (let i = 0; i < count; i += 1) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const start = audioContext.currentTime + i * (duration + 0.09);
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
}

let toastTimeout;
function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => elements.toast.classList.remove("show"), 1800);
}

elements.start.addEventListener("click", startPause);
elements.reset.addEventListener("click", resetTimer);
elements.skip.addEventListener("click", () => advance(false));
elements.restore.addEventListener("click", () => applyPreset(presetKey === "custom" ? "consecutive" : presetKey));
document.querySelectorAll(".preset").forEach(button => button.addEventListener("click", () => applyPreset(button.dataset.preset)));
[elements.first, elements.second, elements.breakTime, elements.rounds].forEach(input => input.addEventListener("change", updateCustomConfig));

elements.sound.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem("practiceTimerSound", soundEnabled);
  elements.soundIcon.textContent = soundEnabled ? "♪" : "×";
  elements.sound.setAttribute("aria-label", soundEnabled ? "关闭提示音" : "开启提示音");
  if (soundEnabled) beep(740, 0.12, 1);
});

elements.fullscreen.addEventListener("click", async () => {
  if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
  else await document.exitFullscreen();
});

document.addEventListener("keydown", event => {
  if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
  if (event.code === "Space") { event.preventDefault(); startPause(); }
  if (event.key.toLowerCase() === "n") advance(false);
  if (event.key.toLowerCase() === "r") resetTimer();
});

elements.soundIcon.textContent = soundEnabled ? "♪" : "×";
syncInputs();
render();
