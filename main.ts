// Nusantara Skies — the hand-in program (Node 22, standard library
// only). It assembles the entry's output: the game folder and the
// screenshots go to the output directory, and the dossier the judge
// reads is written from them with the vendored make.fun library.
// Run it with MAKEFUN_OUTPUT_DIR set outside the grader; inside the
// grader /output is the destination. Both runs must write identical
// bytes, so this program reads nothing but the repository and the clock
// never enters the output.
// v2 (26 Nov): visual-polish pass — refined airliner silhouette,
// detailed islands, living sea, stronger storm, sharper HUD, dressed
// runway. Same mission, same route, same rules; only the picture got
// better.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const OUTPUT_DIR = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function fail(message) {
  throw new Error(`nusantara-skies hand-in: ${message}`);
}

function checkLayout() {
  const gameDir = join(REPO_ROOT, 'game');
  const shotsDir = join(REPO_ROOT, 'screenshots');
  if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
  if (!existsSync(shotsDir)) fail('screenshots/ is missing');
  const shots = readdirSync(shotsDir)
    .filter((name) => !name.startsWith('.'))
    .sort();
  if (shots.length < 3 || shots.length > 4) fail(`expected 3-4 screenshots, found ${shots.length}`);
  for (const name of shots) {
    const size = statSync(join(shotsDir, name)).size;
    if (size === 0) fail(`screenshot ${name} is empty`);
    if (size > 262144) fail(`screenshot ${name} is ${size} bytes, over the 256 KiB cap`);
  }
  return { gameDir, shotsDir, shots };
}

function freshOutput() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(join(OUTPUT_DIR, 'game'), { recursive: true });
  mkdirSync(join(OUTPUT_DIR, 'screenshots'), { recursive: true });
}

function copyEntry(layout) {
  cpSync(layout.gameDir, join(OUTPUT_DIR, 'game'), { recursive: true });
  cpSync(layout.shotsDir, join(OUTPUT_DIR, 'screenshots'), { recursive: true });
}

function writeDossier() {
  const dossier = buildDossier(OUTPUT_DIR, DOSSIER_LIMITS);
  writeFileSync(join(OUTPUT_DIR, 'dossier.json'), dossier);
  return dossier.length;
}

function handIn() {
  const layout = checkLayout();
  freshOutput();
  copyEntry(layout);
  const dossierBytes = writeDossier();
  return { shots: layout.shots, dossierBytes };
}

const result = handIn();
console.log(
  `nusantara-skies: handed in ${result.shots.length} screenshots (${result.shots.join(', ')}) to ${OUTPUT_DIR}; dossier ${result.dossierBytes} bytes`,
);
