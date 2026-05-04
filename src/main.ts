import { LoadingScene } from './scenes/LoadingScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { NarrativeScene } from './scenes/NarrativeScene';
import { Engine } from './scenes/game/Engine';
import { OrientationGuard } from './utils/OrientationGuard';

const orientationGuard = new OrientationGuard();

document.body.style.margin = '0';
document.body.style.padding = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#0f121a';

// ── Helper: start (or restart) the game session ─────────────────
function launchGame(existingEngine?: Engine): void {
  // Destroy old engine instance cleanly if restarting
  existingEngine?.destroy();

  const engine = new Engine();  // fresh engine, no loading scene on restart

  engine.onReady(() => {
    const narrative = new NarrativeScene(document.body);
    narrative.show();

    narrative.onComplete(() => {
      engine.show();
      engine.init({
        onRestart: () => launchGame(engine),
        onExit:    () => {
          engine.destroy();
          showMainMenu();
        },
      });
    });
  });
}

// ── Helper: show main menu ───────────────────────────────────────
function showMainMenu(): void {
  const menu = new MainMenuScene(document.body);
  menu.show();
  menu.onStart(() => launchGame());
}

// ── Boot: loading screen then main menu ─────────────────────────
const loading = new LoadingScene(document.body);
const gameEngine = new Engine(loading);

gameEngine.onReady(() => {
  const menu = new MainMenuScene(document.body);
  menu.show();

  menu.onStart(() => {
    const audio = loading.getAudio();
  // console.log("Audio element:", audio);
  loading.setVolume(0.05);
    const narrative = new NarrativeScene(document.body);
    narrative.show();

    narrative.onComplete(() => {
      gameEngine.show();
      gameEngine.init({
        onRestart: () => launchGame(gameEngine),
        onExit:    () => {
          gameEngine.destroy();
          showMainMenu();
        },
      });
    });
  });
});