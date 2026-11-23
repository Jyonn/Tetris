import { sizes, colors, shapes, randomPiece, emptyBoard, fits, place, clearRows, dropInterval, planAI } from "./engine.mjs";

const get = id => document.getElementById(id);
const settings = get("settings");
const options = ["style", "size", "difficulty", "pattern"].map(get);
const boardCanvas = get("board");
const previewCanvas = get("preview");
const boardContext = boardCanvas.getContext("2d");
const previewContext = previewCanvas.getContext("2d");
const well = get("well");
const overlay = get("overlay");
const splashes = {
  ready: overlay.querySelector(".splash-ready"),
  paused: overlay.querySelector(".splash-paused"),
  over: overlay.querySelector(".splash-over"),
};
const status = get("status");
const scoreDisplay = get("score");
const linesDisplay = get("lines");
const aiLabel = get("ai-label");
const pauseLabel = get("pause-label");
const actions = Object.groupBy(document.querySelectorAll("button[data-action]"), button => button.dataset.action);
const cellSize = 25;
const aiStep = 50;
const clearDelay = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 165;

let game;
let frame = 0;
let deadline = 0;
let pauseStarted = 0;
let previousFrame = 0;

function initialize() {
  const [style, size, difficulty, pattern] = options.map(option => Number(option.value));
  const [width, height] = sizes[size];
  game = {
    style, width, height, difficulty, pattern,
    board: emptyBoard(width, height), phase: "ready", ai: false, active: null,
    next: null, score: 0, lines: 0, clearing: [], route: [], routeIndex: 0,
  };
  cancelAnimationFrame(frame);
  frame = 0;
  boardCanvas.width = width * cellSize;
  boardCanvas.height = height * cellSize;
  well.style.setProperty("--columns", width);
  well.style.setProperty("--rows", height);
  get("dimensions").textContent = `${width} × ${height}`;
  get("piece-set").textContent = style < 3
    ? `${style + 3} 格 / ${shapes[style].length} 种`
    : `花式 / ${shapes[style].length} 种`;
  render();
}

function square(context, x, y, type, emptyOutline, preview = false) {
  const positionX = x * cellSize;
  const positionY = y * cellSize;
  const filled = type >= 0;
  if (filled) {
    context.fillStyle = colors[type];
    context.fillRect(positionX, positionY, cellSize, cellSize);
  }
  if (game.pattern !== 3 && (!filled || game.pattern === 0)) return;
  if (!filled && !emptyOutline) return;
  context.strokeStyle = game.pattern === 1 ? (preview ? "#161613" : "#252621") : "#f4f3eb";
  context.lineWidth = 1;
  context.strokeRect(positionX + 0.5, positionY + 0.5, cellSize - 1, cellSize - 1);
}

function drawBoard() {
  boardContext.fillStyle = "#23241f";
  boardContext.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
  for (const [y, row] of game.board.entries()) {
    for (const [x, type] of row.entries()) square(boardContext, x, y, type, true);
  }
  if (game.active) {
    const { x, y, turn, type } = game.active;
    for (const [dx, dy] of shapes[game.style][type][turn]) square(boardContext, x + dx, y + dy, type, true);
  }
  boardContext.fillStyle = "#f1ffb3b8";
  for (const y of game.clearing) boardContext.fillRect(0, y * cellSize, boardCanvas.width, cellSize);
}

function drawPreview() {
  previewContext.fillStyle = "#161613";
  previewContext.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
  if (game.next) {
    const { type, turn } = game.next;
    for (const [x, y] of shapes[game.style][type][turn]) square(previewContext, x, y, type, false, true);
  } else {
    previewContext.fillStyle = "#6f6d60";
    previewContext.fillRect(44, 49, 12, 2);
  }
}

function render() {
  drawBoard();
  drawPreview();
  const running = game.phase === "playing";
  const paused = game.phase === "paused";
  const state = running && game.ai ? "ai" : game.phase;
  const stateLabels = { ready: "待开始", playing: "玩家操作", ai: "AI 运行中", paused: "已暂停", over: "已结束" };
  if (status.dataset.state !== state) {
    status.dataset.state = state;
    status.lastElementChild.textContent = stateLabels[state];
  }
  settings.disabled = running || paused;
  overlay.hidden = running;
  for (const [phase, splash] of Object.entries(splashes)) splash.hidden = phase !== game.phase;
  scoreDisplay.textContent = String(game.score).padStart(6, "0");
  linesDisplay.textContent = String(game.lines).padStart(2, "0");
  for (const action of ["left", "right", "rotate", "down"]) actions[action][0].disabled = !running || game.ai;
  actions.pause[0].disabled = !running && !paused;
  actions.quit[0].disabled = !running && !paused;
  actions.ai[0].disabled = game.ai || paused || game.phase === "over";
  actions.ai[0].setAttribute("aria-pressed", String(game.ai));
  aiLabel.textContent = game.ai ? "AI 已接管" : "AI 接管";
  pauseLabel.textContent = paused ? "继续" : "暂停";
}

function spawn(now) {
  game.active = { ...game.next, x: Math.floor(game.width / 2) - 1, y: 0 };
  game.next = randomPiece(game.style);
  if (!fits(game.board, currentRotations(), game.active)) {
    endGame();
    return;
  }
  game.score += 4;
  deadline = now + dropInterval(game.difficulty, game.score);
  if (game.ai) prepareAI(now);
}

function begin(ai) {
  game.phase = "playing";
  game.ai = ai;
  game.next = randomPiece(game.style);
  previousFrame = performance.now();
  spawn(previousFrame);
  render();
  requestTick();
}

function endGame() {
  game.phase = "over";
  game.active = null;
  game.clearing = [];
  cancelAnimationFrame(frame);
  frame = 0;
}

function currentRotations() {
  return shapes[game.style][game.active.type];
}

function shift(dx, rotate = false) {
  const { x, turn } = game.active;
  const candidate = { ...game.active, x: x + dx, turn: (turn + Number(rotate)) % 4 };
  if (fits(game.board, currentRotations(), candidate)) game.active = candidate;
}

function lock(now) {
  game.clearing = place(game.board, currentRotations(), game.active);
  game.active = null;
  if (game.clearing.length) {
    deadline = now + clearDelay;
  } else {
    spawn(now);
  }
}

function descend(now) {
  const candidate = { ...game.active, y: game.active.y + 1 };
  if (fits(game.board, currentRotations(), candidate)) {
    game.active = candidate;
  } else {
    lock(now);
  }
}

function prepareAI(now) {
  game.route = planAI(game.board, currentRotations(), game.active);
  game.routeIndex = 0;
  deadline = now + aiStep;
}

function requestTick() {
  if (!frame && game.phase === "playing") frame = requestAnimationFrame(tick);
}

function tick(now) {
  frame = 0;
  const elapsed = now - previousFrame;
  if (elapsed > 1500) deadline += elapsed;
  previousFrame = now;
  if (now >= deadline) {
    if (game.clearing.length) {
      const count = game.clearing.length;
      game.board = clearRows(game.board, game.clearing);
      game.clearing = [];
      game.lines += count;
      game.score += game.width * 2 * count;
      spawn(now);
    } else if (game.ai) {
      if (game.routeIndex < game.route.length) {
        game.active = game.route[game.routeIndex++];
        deadline = now + aiStep;
      } else {
        lock(now);
      }
    } else {
      deadline = now + dropInterval(game.difficulty, game.score);
      descend(now);
    }
    render();
  }
  requestTick();
}

function resume(now) {
  game.phase = "playing";
  deadline += now - pauseStarted;
  previousFrame = now;
  requestTick();
}

function dispatch(action) {
  const now = performance.now();
  const phase = game.phase;
  if (action === "reset") {
    initialize();
    actions.start[0].focus({ preventScroll: true });
    return;
  }
  if (phase === "ready" && (action === "start" || action === "ai")) {
    begin(action === "ai");
    return;
  }
  if (phase === "paused") {
    if (action === "quit") endGame();
    if (action === "pause" || action === "resume") resume(now);
  } else if (phase === "playing") {
    if (action === "quit") endGame();
    if (action === "pause") {
      game.phase = "paused";
      pauseStarted = now;
      cancelAnimationFrame(frame);
      frame = 0;
    }
    if (action === "ai" && !game.ai) {
      game.ai = true;
      if (game.active) prepareAI(now);
    }
    if (game.active && !game.ai) {
      if (action === "left") shift(-1);
      if (action === "right") shift(1);
      if (action === "rotate") shift(0, true);
      if (action === "down") descend(now);
    }
  }
  render();
}

const keys = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "rotate",
  ArrowDown: "down",
  Enter: "start",
  " ": "pause",
  p: "pause",
  c: "resume",
  q: "quit",
  Escape: "quit",
  r: "reset",
  x: "ai",
};

document.addEventListener("keydown", event => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.target.closest("select")) return;
  if ((event.key === "Enter" || event.key === " ") && event.target.closest("button")) return;
  const action = keys[event.key.length === 1 ? event.key.toLowerCase() : event.key];
  if (!action) return;
  event.preventDefault();
  if (event.repeat && !["left", "right", "rotate", "down"].includes(action)) return;
  if (game.phase === "over" && action === "start") dispatch("reset");
  else dispatch(action);
});

for (const [action, buttons] of Object.entries(actions)) {
  for (const button of buttons) {
    let timer;
    let held = false;
    button.addEventListener("click", event => {
      if (!held || event.detail === 0) dispatch(action);
      held = false;
    });
    if (!["left", "right", "down"].includes(action)) continue;
    button.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      button.setPointerCapture(event.pointerId);
      held = false;
      timer = setTimeout(function repeat() {
        held = true;
        if (!button.disabled) dispatch(action);
        timer = setTimeout(repeat, 65);
      }, 235);
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) {
      button.addEventListener(event, () => clearTimeout(timer));
    }
  }
}

settings.addEventListener("change", initialize);
initialize();
