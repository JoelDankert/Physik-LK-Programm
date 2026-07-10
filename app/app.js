const BOARD_COLUMNS = 5;
const BOARD_ROWS = 4;
const VALUES = [100, 200, 300, 400];
const STORAGE_KEY = "quiz-board-state-v1";

const elements = {
  board: document.getElementById("board"),
  resetOrb: document.getElementById("reset-orb"),
  teamNameEls: [document.getElementById("team-0-name"), document.getElementById("team-1-name")],
  teamScoreEls: [document.getElementById("team-0-score"), document.getElementById("team-1-score")],
  questionOverlay: document.getElementById("question-overlay"),
  questionCategory: document.getElementById("question-category"),
  questionText: document.getElementById("question-text"),
  questionImageWrap: document.getElementById("question-image-wrap"),
  questionImage: document.getElementById("question-image"),
  questionChoices: document.getElementById("question-choices"),
  showAnswer: document.getElementById("show-answer"),
  answerPanel: document.getElementById("answer-panel"),
  questionClose: document.getElementById("question-close"),
  awardTeam0: document.getElementById("award-team-0"),
  awardTeam1: document.getElementById("award-team-1"),
  editorOverlay: document.getElementById("editor-overlay"),
  editorClose: document.getElementById("editor-close"),
  editorKicker: document.getElementById("editor-kicker"),
  editorInput: document.getElementById("editor-input"),
  editorClear: document.getElementById("editor-clear"),
  editorSave: document.getElementById("editor-save"),
  menuOverlay: document.getElementById("menu-overlay"),
  menuClose: document.getElementById("menu-close"),
  menuReset: document.getElementById("menu-reset"),
  menuFinish: document.getElementById("menu-finish"),
  finishOverlay: document.getElementById("finish-overlay"),
  finishClose: document.getElementById("finish-close"),
  finishTeams: [document.getElementById("finish-team-0"), document.getElementById("finish-team-1")],
  finishNames: [document.getElementById("finish-name-0"), document.getElementById("finish-name-1")],
  finishScores: [document.getElementById("finish-score-0"), document.getElementById("finish-score-1")],
  imageLightbox: document.getElementById("image-lightbox"),
  imageLightboxImage: document.getElementById("image-lightbox-image"),
  imageLightboxClose: document.getElementById("image-lightbox-close"),
  partyStream: document.getElementById("party-stream"),
};

const state = {
  data: null,
  game: null,
  currentQuestion: null,
  editor: null,
  pendingUndoKey: null,
  questionImageToken: 0,
  partySystem: null,
  partyResizeHandler: null,
  partyMode: "idle",
  partyIntensity: 0,
};

function defaultGameState() {
  return {
    teamNames: ["Team 1", "Team 2"],
    scores: [0, 0],
    consumed: {},
  };
}

function sanitizeGameState(raw, data) {
  const clean = defaultGameState();
  if (Array.isArray(raw?.teamNames)) {
    clean.teamNames = [0, 1].map((index) => String(raw.teamNames[index] || clean.teamNames[index]).slice(0, 24) || clean.teamNames[index]);
  }
  if (Array.isArray(raw?.scores)) {
    clean.scores = [0, 1].map((index) => Number.isFinite(Number(raw.scores[index])) ? Number(raw.scores[index]) : 0);
  }
  if (raw?.consumed && typeof raw.consumed === "object") {
    for (const [key, value] of Object.entries(raw.consumed)) {
      if (!questionExists(data, key)) continue;
      clean.consumed[key] = {
        awardedTeam: value?.awardedTeam === 0 || value?.awardedTeam === 1 ? value.awardedTeam : null,
        points: Number.isFinite(Number(value?.points)) ? Number(value.points) : valueForKey(key),
      };
    }
  }
  return clean;
}

function questionExists(data, key) {
  const [categoryIndex, rowIndex] = key.split("-").map(Number);
  return Boolean(data?.categories?.[categoryIndex]?.questions?.[rowIndex]);
}

function valueForKey(key) {
  const [, rowIndex] = key.split("-").map(Number);
  return VALUES[rowIndex] ?? 0;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.game));
}

function loadState(data) {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    raw = null;
  }
  state.game = sanitizeGameState(raw, data);
  saveState();
}

function buildBoard() {
  elements.board.innerHTML = "";
  const categories = state.data.categories.slice(0, BOARD_COLUMNS);

  categories.forEach((category) => {
    const categoryCell = document.createElement("div");
    categoryCell.className = "category-cell";
    categoryCell.textContent = category.title || "";
    elements.board.append(categoryCell);
  });

  for (let rowIndex = 0; rowIndex < BOARD_ROWS; rowIndex += 1) {
    for (let categoryIndex = 0; categoryIndex < BOARD_COLUMNS; categoryIndex += 1) {
      const key = `${categoryIndex}-${rowIndex}`;
      const question = categories[categoryIndex]?.questions?.[rowIndex];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "value-cell";
      button.dataset.key = key;
      button.textContent = String(VALUES[rowIndex]);
      if (!question) {
        button.classList.add("missing");
        button.disabled = true;
      }
      elements.board.append(button);
    }
  }
}

function renderBoardState() {
  elements.board.querySelectorAll(".value-cell[data-key]").forEach((button) => {
    const key = button.dataset.key;
    button.classList.toggle("used", Boolean(state.game.consumed[key]));
    button.classList.toggle("used-pending", state.pendingUndoKey === key);
  });
}

function renderScoreboard() {
  state.game.teamNames.forEach((name, index) => {
    elements.teamNameEls[index].textContent = name;
  });
  state.game.scores.forEach((score, index) => {
    elements.teamScoreEls[index].textContent = score;
  });
  elements.awardTeam0.textContent = state.game.teamNames[0];
  elements.awardTeam1.textContent = state.game.teamNames[1];
}

function renderChoices(choices) {
  elements.questionChoices.innerHTML = "";
  if (!Array.isArray(choices) || !choices.length) return;
  choices.forEach((choice) => {
    const card = document.createElement("div");
    card.className = "choice-card";
    card.dataset.rawChoice = normalizeComparable(choice);
    const text = document.createElement("div");
    text.className = "choice-text";
    renderRichText(text, choice);
    card.append(text);
    elements.questionChoices.append(card);
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeComparable(value) {
  return String(value ?? "")
    .replace(/\$\$/g, "")
    .replace(/\$/g, "")
    .replace(/\\\(|\\\)|\\\[|\\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function containsLatex(value) {
  return /(\\frac|\\cdot|\\sqrt|\\sum|\\int|\\alpha|\\beta|\\gamma|\\Delta|\\pi|\\lambda|\\mu|\\nu|\\omega|\\theta|\\sin|\\cos|\\tan|\^|_|\{|\}|\\left|\\right)/.test(String(value ?? ""));
}

function ensureLatexDelimiters(value) {
  const text = String(value ?? "").trim();
  if (!text || !containsLatex(text)) return text;
  if (/(\$\$[\s\S]*\$\$)|(\$[^$]+\$)|(\\\[[\s\S]*\\\])|(\\\([\s\S]*\\\))/.test(text)) {
    return text;
  }
  return `$$${text}$$`;
}

function formatRichText(value) {
  const lines = String(value ?? "")
    .split(/\n{2,}/)
    .map((part) => ensureLatexDelimiters(part.trim()))
    .filter(Boolean);
  return lines.map((line) => escapeHtml(line)).join("<br><br>");
}

function renderRichText(element, value) {
  element.innerHTML = formatRichText(value);
}

function typesetMath(...nodes) {
  const targets = nodes.filter(Boolean);
  if (!targets.length) return;
  if (!window.MathJax?.typesetPromise) return;
  window.MathJax.typesetClear?.(targets);
  window.MathJax.typesetPromise(targets).catch(() => {});
}

const PARTY_EMOJIS = ["🎉", "✨", "🎊", "🥳", "⭐", "🧪", "⚛️", "🔬", "📐", "🧲"];

function particleRandom(seed) {
  let value = seed * 9973;
  return function next() {
    value = (value * 48271) % 2147483647;
    return value / 2147483647;
  };
}

function ensurePartySystem(canvas) {
  if (!state.partySystem) {
    state.partySystem = {
      canvas,
      context: canvas.getContext("2d"),
      particles: [],
      rafId: 0,
      lastFrameTime: 0,
      spawnCarry: 0,
      burstUntil: 0,
    };
  } else {
    state.partySystem.canvas = canvas;
  }

  resizePartyCanvas();

  if (!state.partyResizeHandler) {
    state.partyResizeHandler = () => resizePartyCanvas();
    window.addEventListener("resize", state.partyResizeHandler, { passive: true });
  }

  if (!state.partySystem.rafId) {
    state.partySystem.lastFrameTime = performance.now();
    state.partySystem.rafId = requestAnimationFrame(runPartyFrame);
  }
}

function resizePartyCanvas() {
  if (!state.partySystem?.canvas || !state.partySystem.context) return;
  const { canvas, context } = state.partySystem;
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function runPartyFrame(now) {
  const system = state.partySystem;
  if (!system?.context || !system.canvas) return;

  const deltaMs = Math.min(now - system.lastFrameTime || 16, 32);
  const deltaSeconds = deltaMs / 1000;
  system.lastFrameTime = now;

  updatePartyParticles(deltaSeconds, now);
  drawPartyParticles();

  if (state.partyMode !== "idle" || system.particles.length) {
    system.rafId = requestAnimationFrame(runPartyFrame);
  } else {
    system.rafId = 0;
    system.context.clearRect(0, 0, system.canvas.clientWidth, system.canvas.clientHeight);
  }
}

function updatePartyParticles(deltaSeconds, now) {
  const system = state.partySystem;
  if (!system) return;

  let spawnRate = 0;
  if (state.partyMode === "finish") {
    spawnRate = 1.9 + state.partyIntensity * 1.5;
  } else if (state.partyMode === "burst" && now < system.burstUntil) {
    spawnRate = 8 + state.partyIntensity * 5;
  }

  system.spawnCarry += spawnRate * deltaSeconds;
  const maxParticles = state.partyMode === "finish" ? 180 : 80;

  while (system.spawnCarry >= 1 && system.particles.length < maxParticles) {
    spawnPartyParticle(state.partyMode === "burst");
    system.spawnCarry -= 1;
  }

  system.particles = system.particles.filter((particle) => {
    particle.age += deltaSeconds;
    if (particle.age >= particle.life) return false;
    const progress = particle.age / particle.life;
    particle.x = particle.startX + particle.driftX * progress;
    particle.y = particle.startY - particle.travelY * progress;
    particle.rotation = particle.rotationStart + particle.rotationDelta * progress;
    particle.alpha = getPartyAlpha(progress);
    return true;
  });

  if (state.partyMode === "burst" && now >= system.burstUntil && !system.particles.length) {
    stopParticles();
  }
}

function drawPartyParticles() {
  const system = state.partySystem;
  if (!system?.context || !system.canvas) return;
  const { context, canvas, particles } = system;
  context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (const particle of particles) {
    context.save();
    context.globalAlpha = particle.alpha;
    context.translate(particle.x, particle.y);
    context.rotate(particle.rotation);
    context.font = `${particle.size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    context.fillText(particle.emoji, 0, 0);
    context.restore();
  }
}

function spawnPartyParticle(isBurst) {
  const system = state.partySystem;
  if (!system?.canvas) return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const overshootX = width * 0.12;
  const random = particleRandom(Date.now() + system.particles.length * 17 + Math.floor(Math.random() * 9999));
  const size = (isBurst ? 72 : 62) + random() * (isBurst ? 34 : 30);
  const life = (isBurst ? 3.8 : 4.8) + random() * 1.8;

  system.particles.push({
    emoji: PARTY_EMOJIS[Math.floor(random() * PARTY_EMOJIS.length)],
    size,
    age: 0,
    life,
    startX: -overshootX + random() * (width + overshootX * 2),
    startY: height + size * (0.5 + random() * 0.8),
    x: 0,
    y: 0,
    driftX: (-0.22 + random() * 0.44) * width,
    travelY: height * (1.14 + random() * 0.28),
    rotationStart: -0.24 + random() * 0.48,
    rotationDelta: -0.65 + random() * 1.3,
    rotation: 0,
    alpha: 0,
  });
}

function getPartyAlpha(progress) {
  if (progress < 0.08) return progress / 0.08;
  if (progress < 0.7) return 0.95 - (progress - 0.08) * 0.18;
  const fadeProgress = (progress - 0.7) / 0.3;
  return 0.84 * (1 - fadeProgress);
}

function startBurstParticles() {
  ensurePartySystem(elements.partyStream);
  elements.partyStream.classList.remove("hidden");
  state.partyMode = "burst";
  state.partyIntensity = 1;
  state.partySystem.burstUntil = performance.now() + 1600;
  for (let index = 0; index < 8; index += 1) {
    spawnPartyParticle(true);
  }
  if (!state.partySystem.rafId) {
    state.partySystem.lastFrameTime = performance.now();
    state.partySystem.rafId = requestAnimationFrame(runPartyFrame);
  }
}

function startFinishParticles() {
  ensurePartySystem(elements.partyStream);
  elements.partyStream.classList.remove("hidden");
  state.partyMode = "finish";
  state.partyIntensity = 1.4;
  for (let index = 0; index < 12; index += 1) {
    spawnPartyParticle(true);
  }
  if (!state.partySystem.rafId) {
    state.partySystem.lastFrameTime = performance.now();
    state.partySystem.rafId = requestAnimationFrame(runPartyFrame);
  }
}

function stopParticles() {
  state.partyMode = "idle";
  state.partyIntensity = 0;
  elements.partyStream.classList.add("hidden");
  if (state.partySystem) {
    state.partySystem.spawnCarry = 0;
    state.partySystem.burstUntil = 0;
    state.partySystem.particles = [];
    if (state.partySystem.rafId) {
      cancelAnimationFrame(state.partySystem.rafId);
      state.partySystem.rafId = 0;
    }
    state.partySystem.context?.clearRect(0, 0, state.partySystem.canvas?.clientWidth || 0, state.partySystem.canvas?.clientHeight || 0);
  }
}

function renderAnswerOnly(answer) {
  elements.questionChoices.innerHTML = "";
  const card = document.createElement("div");
  card.className = "choice-card answer-only revealed-correct";
  card.dataset.rawChoice = normalizeComparable(answer);
  const text = document.createElement("div");
  text.className = "choice-text";
  renderRichText(text, answer);
  card.append(text);
  elements.questionChoices.append(card);
}

function disableQuestionImageInteraction() {
  elements.questionImage.classList.add("is-disabled");
}

function enableQuestionImageInteraction() {
  elements.questionImage.classList.remove("is-disabled");
}

function clearQuestionImage() {
  state.questionImageToken += 1;
  disableQuestionImageInteraction();
  elements.questionImageWrap.classList.add("hidden");
  elements.questionImage.removeAttribute("src");
  elements.questionImage.alt = "";
}

function loadQuestionImage(src, alt) {
  clearQuestionImage();
  if (!src) return;
  const token = state.questionImageToken;
  const loader = new Image();
  loader.onload = () => {
    if (token !== state.questionImageToken) return;
    elements.questionImage.src = src;
    elements.questionImage.alt = alt;
    elements.questionImageWrap.classList.remove("hidden");
    enableQuestionImageInteraction();
  };
  loader.onerror = () => {
    if (token !== state.questionImageToken) return;
    clearQuestionImage();
  };
  loader.src = src;
}

function openQuestion(key) {
  const [categoryIndex, rowIndex] = key.split("-").map(Number);
  const category = state.data.categories[categoryIndex];
  const question = category?.questions?.[rowIndex];
  if (!question) return;

  state.currentQuestion = {
    key,
    value: VALUES[rowIndex],
    categoryTitle: category.title || "",
    question: question.question || "",
    answer: question.answer || "",
    correctChoice: question.correctChoice || "",
    image: question.image || "",
    choices: Array.isArray(question.choices) ? question.choices : [],
  };

  elements.questionCategory.textContent = `${state.currentQuestion.categoryTitle} · ${state.currentQuestion.value}`;
  renderRichText(elements.questionText, state.currentQuestion.question);
  loadQuestionImage(state.currentQuestion.image, state.currentQuestion.question || "Fragenbild");
  elements.answerPanel.classList.add("hidden");
  elements.showAnswer.classList.remove("hidden");
  renderChoices(state.currentQuestion.choices);
  elements.questionOverlay.classList.remove("is-closing");
  elements.questionOverlay.classList.remove("hidden");
  elements.questionOverlay.setAttribute("aria-hidden", "false");
  typesetMath(elements.questionText, elements.questionChoices);
}

function animateOverlayClose(overlay, onDone) {
  overlay.classList.add("is-closing");
  window.setTimeout(() => {
    overlay.classList.add("hidden");
    overlay.classList.remove("is-closing");
    overlay.setAttribute("aria-hidden", "true");
    if (onDone) onDone();
  }, 520);
}

function closeQuestion() {
  disableQuestionImageInteraction();
  closeImageLightbox();
  animateOverlayClose(elements.questionOverlay, () => {
    state.currentQuestion = null;
    clearQuestionImage();
  });
}

function openMenu() {
  elements.menuOverlay.classList.remove("is-closing");
  elements.menuOverlay.classList.remove("hidden");
  elements.menuOverlay.setAttribute("aria-hidden", "false");
}

function closeMenu() {
  animateOverlayClose(elements.menuOverlay);
}

function revealAnswer() {
  if (!state.currentQuestion) return;
  if (state.currentQuestion.choices.length) {
    const correct = normalizeComparable(state.currentQuestion.correctChoice || state.currentQuestion.answer);
    elements.questionChoices.querySelectorAll(".choice-card").forEach((card) => {
      card.classList.toggle("revealed-correct", card.dataset.rawChoice === correct);
    });
  } else {
    renderAnswerOnly(state.currentQuestion.answer);
  }
  elements.answerPanel.classList.remove("hidden");
  elements.showAnswer.classList.add("hidden");
  typesetMath(elements.questionChoices);
}

function applyResult(teamIndex) {
  if (!state.currentQuestion) return;
  const { key, value } = state.currentQuestion;
  state.pendingUndoKey = null;
  state.game.consumed[key] = {
    awardedTeam: teamIndex === 0 || teamIndex === 1 ? teamIndex : null,
    points: value,
  };
  if (teamIndex === 0 || teamIndex === 1) {
    state.game.scores[teamIndex] += value;
    startBurstParticles();
  }
  saveState();
  renderScoreboard();
  renderBoardState();
  closeQuestion();
}

function undoConsumedQuestion(key) {
  const consumed = state.game.consumed[key];
  if (!consumed) return;
  state.pendingUndoKey = null;
  if (consumed.awardedTeam === 0 || consumed.awardedTeam === 1) {
    state.game.scores[consumed.awardedTeam] -= consumed.points;
  }
  delete state.game.consumed[key];
  saveState();
  renderScoreboard();
  renderBoardState();
}

function openEditor(mode) {
  const configs = {
    "team-0-name": { type: "text", teamIndex: 0, label: "Teamname", value: state.game.teamNames[0], maxLength: 24 },
    "team-1-name": { type: "text", teamIndex: 1, label: "Teamname", value: state.game.teamNames[1], maxLength: 24 },
    "team-0-score": { type: "number", teamIndex: 0, label: "Punktestand", value: String(state.game.scores[0]), maxLength: 6 },
    "team-1-score": { type: "number", teamIndex: 1, label: "Punktestand", value: String(state.game.scores[1]), maxLength: 6 },
  };
  const config = configs[mode];
  if (!config) return;
  state.editor = { ...config, draft: String(config.value ?? "") };
  elements.editorKicker.textContent = `${state.game.teamNames[config.teamIndex]} · ${config.label}`;
  elements.editorInput.value = state.editor.draft;
  elements.editorInput.type = config.type === "number" ? "number" : "text";
  elements.editorInput.maxLength = config.maxLength;
  elements.editorInput.placeholder = config.type === "number" ? "0" : "Name";
  elements.editorOverlay.classList.remove("is-closing");
  elements.editorOverlay.classList.remove("hidden");
  elements.editorOverlay.setAttribute("aria-hidden", "false");
  window.setTimeout(() => elements.editorInput.focus(), 20);
}

function closeEditor() {
  animateOverlayClose(elements.editorOverlay, () => {
    state.editor = null;
  });
}

function openFinishScreen() {
  const scores = state.game.scores;
  const maxScore = Math.max(...scores);
  state.game.teamNames.forEach((name, index) => {
    elements.finishNames[index].textContent = name;
    elements.finishScores[index].textContent = scores[index];
    elements.finishTeams[index].classList.toggle("is-winner", scores[index] === maxScore && scores[0] !== scores[1]);
  });
  startFinishParticles();
  elements.finishOverlay.classList.remove("is-closing");
  elements.finishOverlay.classList.remove("hidden");
  elements.finishOverlay.setAttribute("aria-hidden", "false");
}

function closeFinishScreen() {
  stopParticles();
  animateOverlayClose(elements.finishOverlay);
}

function openImageLightbox() {
  if (elements.questionImage.classList.contains("is-disabled")) return;
  const src = elements.questionImage.getAttribute("src");
  if (!src) return;
  elements.imageLightboxImage.src = src;
  elements.imageLightboxImage.alt = elements.questionImage.alt || "";
  elements.imageLightbox.classList.remove("hidden");
  elements.imageLightbox.setAttribute("aria-hidden", "false");
}

function closeImageLightbox() {
  elements.imageLightbox.classList.add("hidden");
  elements.imageLightbox.setAttribute("aria-hidden", "true");
  elements.imageLightboxImage.removeAttribute("src");
  elements.imageLightboxImage.alt = "";
}

function clearEditor() {
  if (!state.editor) return;
  state.editor.draft = "";
  elements.editorInput.value = "";
  elements.editorInput.focus();
}

function saveEditor() {
  if (!state.editor) return;
  const editor = state.editor;
  editor.draft = elements.editorInput.value;
  if (editor.type === "text") {
    const next = editor.draft.trim() || (editor.teamIndex === 0 ? "Team 1" : "Team 2");
    state.game.teamNames[editor.teamIndex] = next.slice(0, editor.maxLength);
  } else {
    const next = editor.draft.trim();
    state.game.scores[editor.teamIndex] = next === "" || next === "-" ? 0 : Number(next);
  }
  saveState();
  renderScoreboard();
  closeEditor();
}

function handleResetTap() {
  state.game = defaultGameState();
  state.pendingUndoKey = null;
  saveState();
  renderScoreboard();
  renderBoardState();
  closeQuestion();
  closeEditor();
  closeMenu();
  closeFinishScreen();
  stopParticles();
}

async function loadData() {
  const response = await fetch("./questions.json", { cache: "no-store" });
  if (!response.ok) throw new Error("questions.json konnte nicht geladen werden");
  const data = await response.json();
  if (!Array.isArray(data?.categories)) {
    throw new Error("questions.json hat kein gültiges categories-Feld");
  }
  return data;
}

function showLoadError(error) {
  elements.board.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "category-cell";
  panel.style.gridColumn = "1 / -1";
  panel.style.minHeight = "180px";
  panel.textContent = error.message;
  elements.board.append(panel);
}

function bindEvents() {
  elements.board.addEventListener("click", (event) => {
    const tile = event.target.closest(".value-cell[data-key]");
    if (!tile) return;
    const key = tile.dataset.key;
    if (state.game.consumed[key]) {
      if (state.pendingUndoKey === key) {
        undoConsumedQuestion(key);
      } else {
        state.pendingUndoKey = key;
        renderBoardState();
      }
      return;
    }
    if (state.pendingUndoKey) {
      state.pendingUndoKey = null;
      renderBoardState();
    }
    openQuestion(key);
  });

  elements.showAnswer.addEventListener("click", revealAnswer);
  elements.questionClose.addEventListener("click", closeQuestion);
  elements.editorClose.addEventListener("click", closeEditor);
  elements.editorClear.addEventListener("click", clearEditor);
  elements.editorSave.addEventListener("click", saveEditor);
  elements.resetOrb.addEventListener("click", openMenu);
  elements.menuClose.addEventListener("click", closeMenu);
  elements.menuReset.addEventListener("click", handleResetTap);
  elements.menuFinish.addEventListener("click", () => {
    closeMenu();
    openFinishScreen();
  });
  elements.finishClose.addEventListener("click", closeFinishScreen);
  elements.questionImage.addEventListener("click", openImageLightbox);
  elements.imageLightboxClose.addEventListener("click", closeImageLightbox);
  elements.editorInput.addEventListener("input", () => {
    if (!state.editor) return;
    if (state.editor.type === "number") {
      elements.editorInput.value = elements.editorInput.value.replace(/[^\d-]/g, "");
      if ((elements.editorInput.value.match(/-/g) || []).length > 1) {
        elements.editorInput.value = elements.editorInput.value.replace(/-/g, "");
      }
      if (elements.editorInput.value.includes("-") && !elements.editorInput.value.startsWith("-")) {
        elements.editorInput.value = elements.editorInput.value.replace(/-/g, "");
      }
    }
    state.editor.draft = elements.editorInput.value;
  });
  elements.editorInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") saveEditor();
  });

  document.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openEditor(button.dataset.edit);
    });
  });

  elements.questionOverlay.addEventListener("click", (event) => {
    if (event.target === elements.questionOverlay) closeQuestion();
  });
  elements.editorOverlay.addEventListener("click", (event) => {
    if (event.target === elements.editorOverlay) closeEditor();
  });
  elements.menuOverlay.addEventListener("click", (event) => {
    if (event.target === elements.menuOverlay) closeMenu();
  });
  elements.finishOverlay.addEventListener("click", (event) => {
    if (event.target === elements.finishOverlay) closeFinishScreen();
  });
  elements.imageLightbox.addEventListener("click", (event) => {
    if (event.target === elements.imageLightbox || event.target === elements.imageLightboxImage) {
      closeImageLightbox();
    }
  });

  document.querySelectorAll("[data-result]").forEach((button) => {
    button.addEventListener("click", () => {
      const raw = button.dataset.result;
      const teamIndex = raw === "none" ? null : Number(raw);
      applyResult(teamIndex);
    });
  });
}

async function init() {
  bindEvents();
  try {
    state.data = await loadData();
    loadState(state.data);
    buildBoard();
    renderScoreboard();
    renderBoardState();
  } catch (error) {
    showLoadError(error instanceof Error ? error : new Error("Unbekannter Ladefehler"));
  }
}

init();
