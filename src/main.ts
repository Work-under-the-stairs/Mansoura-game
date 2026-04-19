import { LoadingScene } from './scenes/LoadingScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { NarrativeScene } from './scenes/NarrativeScene'; 
import { Engine } from './scenes/game/Engine';

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

loading.onComplete(() => {
  const menu = new MainMenuScene(document.body);
  menu.show();

  menu.onStart(() => {
    const narrative = new NarrativeScene(document.body);
    narrative.show();

    narrative.onComplete(() => {
      const gameEngine = new Engine();
      gameEngine.init();
    });
  });
});
