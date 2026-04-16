import { LoadingScene }   from './scenes/LoadingScene';
import { MainMenuScene }  from './scenes/MainMenuScene';
import { NarrativeScene } from './scenes/NarrativeScene';

// ── Loading Screen ──────────────────────────────────────────────────────────
const loading = new LoadingScene(document.body);

let progress = 0;
const interval = setInterval(() => {
  progress += Math.random() * 3 + 1;

  if (progress >= 100) {
    progress = 100;
    clearInterval(interval);
    loading.updateProgress(100);
    setTimeout(() => loading.hide(), 600);
    return;
  }

  loading.updateProgress(progress);
}, 120);

// ── After Loading → Main Menu ────────────────────────────────────────────────
loading.onComplete(() => {
  const menu = new MainMenuScene(document.body);
  menu.show();

  // ── On "ابدأ الآن" → Narrative Scene ─────────────────────────────────────
  menu.onStart(() => {
    const narrative = new NarrativeScene(document.body);
    narrative.show();

    // ── After narrative → launch the game ────────────────────────────────────
    narrative.onComplete(() => {
      console.log('اللعبة بدأت!');
      // TODO: launch the actual game scene here
    });
  });
});
