import { silhouettes } from "./pieces.mjs";

export const sizes = [[10, 15], [10, 20], [15, 20], [20, 20]];
export const colors = [
  "#ff0000", "#ffff00", "#00ffff", "#00ff00", "#008080",
  "#ff00ff", "#0000ff", "#000080", "#008000", "#800000",
  "#800080", "#808000", "#c08040", "#8040c0", "#40c080",
];

export const shapes = silhouettes.map(set => set.map(rotations => rotations.map(mask => {
  const cells = [];
  for (let dx = 0; dx < 4; dx++) {
    const column = (mask >> ((3 - dx) * 4)) & 15;
    for (let dy = 0; dy < 4; dy++) {
      if (column & (8 >> dy)) cells.push([dx, dy]);
    }
  }
  return cells;
})));

export function randomPiece(style, random = Math.random) {
  return {
    type: Math.floor(random() * shapes[style].length),
    turn: Math.floor(random() * 4),
  };
}

export function emptyBoard(width, height) {
  return Array.from({ length: height }, () => Array(width).fill(-1));
}

export function fits(board, rotations, { x, y, turn }) {
  const width = board[0].length;
  const height = board.length;
  return rotations[turn].every(([dx, dy]) => {
    const col = x + dx;
    const row = y + dy;
    return col >= 0 && col < width && row >= 0 && row < height && board[row][col] < 0;
  });
}

export function place(board, rotations, { x, y, turn, type }) {
  for (const [dx, dy] of rotations[turn]) board[y + dy][x + dx] = type;
  return board.flatMap((row, index) => row.every(cell => cell >= 0) ? [index] : []);
}

export function clearRows(board, rows) {
  const remaining = board.filter((_, index) => !rows.includes(index));
  return [...emptyBoard(board[0].length, rows.length), ...remaining];
}

export function dropInterval(difficulty, score) {
  return Math.max(32, 1000 - difficulty * 100 - Math.floor(score / 100));
}

const directions = [[0, 1], [1, 0], [-1, 0], [0, -1]];

function landingRating(board, rotations, { x, y, turn }) {
  const cells = rotations[turn];
  const width = board[0].length;
  let exposed = 0;
  for (const [dx, dy] of cells) {
    for (const [stepX, stepY] of directions) {
      const nextX = x + dx + stepX;
      const nextY = y + dy + stepY;
      if (stepY >= 0 && (nextX < 0 || nextX >= width || nextY >= board.length || board[nextY][nextX] >= 0)) continue;
      if (!cells.some(([otherX, otherY]) => dx + stepX === otherX && dy + stepY === otherY)) exposed++;
    }
  }

  // V4.20 rates each reachable landing by depth and exposed edges.
  // Its line and flood-fill terms are constant within one search.
  return y * 2 - exposed * 5;
}

export function planAI(board, rotations, active) {
  const approach = [];
  let start = { ...active };
  const top = board.findIndex(row => row.some(cell => cell >= 0));
  const firstOccupied = top === -1 ? board.length : top;
  if (firstOccupied > start.y + 4) {
    const descent = Math.ceil((firstOccupied - start.y) / 2);
    for (let step = 0; step < descent; step++) {
      const next = { ...start, y: start.y + 1 };
      if (!fits(board, rotations, next)) break;
      start = next;
      approach.push(start);
    }
  }

  const queue = [{ state: start, previous: -1 }];
  const visited = new Set([`${start.x},${start.y},${start.turn}`]);
  let best = -Infinity;
  let finish = 0;

  for (let index = 0; index < queue.length; index++) {
    const { state } = queue[index];
    const { x, y, turn } = state;
    const candidates = [
      { ...state, y: y + 1 },
      { ...state, x: x + 1 },
      { ...state, x: x - 1 },
      { ...state, turn: (turn + 1) % 4 },
    ];

    if (!fits(board, rotations, candidates[0])) {
      const rating = landingRating(board, rotations, state);
      if (rating > best) {
        best = rating;
        finish = index;
      }
    }

    for (const next of candidates) {
      const key = `${next.x},${next.y},${next.turn}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (fits(board, rotations, next)) queue.push({ state: next, previous: index });
    }
  }

  const route = [];
  for (let index = finish; index > 0; index = queue[index].previous) route.push(queue[index].state);
  return approach.concat(route.reverse());
}
