const $ = (selector) => document.querySelector(selector);

const ui = {
  picker: $("#picker"),
  countdown: $("#countdown"),
  hours: $("#hours"),
  minutes: $("#minutes"),
  seconds: $("#seconds"),
  remaining: $("#remaining"),
  status: $("#status"),
  progress: $("#progress"),
  cancel: $("#cancelButton"),
  start: $("#startButton"),
  startLabel: $("#startLabel")
};

const CIRCUMFERENCE = 879.646;
let state = "idle";
let duration = 0;
let timeLeft = 0;
let lastFrame = 0;
let frameId = 0;
let audioContext;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function readDuration() {
  const hours = clamp(ui.hours.value, 0, 23);
  const minutes = clamp(ui.minutes.value, 0, 59);
  const seconds = clamp(ui.seconds.value, 0, 59);
  ui.hours.value = hours;
  ui.minutes.value = minutes;
  ui.seconds.value = seconds;
  return hours * 3600 + minutes * 60 + seconds;
}

function format(seconds) {
  const value = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function render() {
  const idle = state === "idle";
  ui.picker.hidden = !idle;
  ui.countdown.hidden = idle;
  ui.cancel.disabled = idle;

  if (!idle) {
    ui.remaining.textContent = format(timeLeft);
    const ratio = duration ? Math.max(0, timeLeft / duration) : 0;
    ui.progress.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - ratio));
  }

  ui.start.classList.toggle("pause", state === "running");
  document.body.classList.toggle("finished", state === "finished");

  const labels = { idle: "开始", running: "暂停", paused: "继续", finished: "重复" };
  const statuses = { running: "倒计时", paused: "已暂停", finished: "时间到" };
  ui.startLabel.textContent = labels[state];
  if (!idle) ui.status.textContent = statuses[state] || "倒计时";
  document.title = idle ? "计时器" : `${format(timeLeft)} · 计时器`;
}

function start() {
  if (state === "idle") {
    duration = readDuration();
    if (!duration) return;
    localStorage.setItem("timerDuration", String(duration));
    timeLeft = duration;
  } else if (state === "finished") {
    timeLeft = duration;
  }
  state = "running";
  lastFrame = performance.now();
  ensureAudio();
  frameId = requestAnimationFrame(tick);
  render();
}

function pause() {
  state = "paused";
  cancelAnimationFrame(frameId);
  render();
}

function cancel() {
  cancelAnimationFrame(frameId);
  state = "idle";
  timeLeft = 0;
  render();
}

function tick(now) {
  if (state !== "running") return;
  timeLeft -= (now - lastFrame) / 1000;
  lastFrame = now;
  if (timeLeft <= 0) {
    timeLeft = 0;
    state = "finished";
    alertSound();
    render();
    return;
  }
  render();
  frameId = requestAnimationFrame(tick);
}

function ensureAudio() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
}

function alertSound() {
  ensureAudio();
  for (let index = 0; index < 4; index += 1) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const at = audioContext.currentTime + index * .32;
    oscillator.type = "sine";
    oscillator.frequency.value = index % 2 ? 740 : 880;
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(.18, at + .02);
    gain.gain.exponentialRampToValueAtTime(.0001, at + .2);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(at);
    oscillator.stop(at + .22);
  }
}

ui.start.addEventListener("click", () => state === "running" ? pause() : start());
ui.cancel.addEventListener("click", cancel);
[ui.hours, ui.minutes, ui.seconds].forEach(input => input.addEventListener("change", readDuration));

document.addEventListener("keydown", (event) => {
  if (document.activeElement.tagName === "INPUT") return;
  if (event.code === "Space") {
    event.preventDefault();
    state === "running" ? pause() : start();
  }
  if (event.key === "Escape" && state !== "idle") cancel();
});

const saved = clamp(localStorage.getItem("timerDuration") || 720, 1, 86399);
ui.hours.value = Math.floor(saved / 3600);
ui.minutes.value = Math.floor((saved % 3600) / 60);
ui.seconds.value = saved % 60;
render();
