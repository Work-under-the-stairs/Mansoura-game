import { LoadingScene } from './scenes/LoadingScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { NarrativeScene } from './scenes/NarrativeScene';
import { Engine } from './scenes/game/Engine';
import { Engine } from './scenes/game/Engine2';
import { OrientationGuard } from './utils/OrientationGuard';

const orientationGuard = new OrientationGuard();

// main.ts — add at the very top before anything else
  
document.body.style.margin = '0';
document.body.style.padding = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#0f121a'; 

const loading = new LoadingScene(document.body);

// Engine starts loading all assets immediately (silently, canvas is hidden)
const gameEngine = new Engine2(loading);

// When all assets finish loading → show the main menu
gameEngine.onReady(() => {
  const menu = new MainMenuScene(document.body);
  menu.show();

  menu.onStart(() => {
    const narrative = new NarrativeScene(document.body);
    narrative.show();


    narrative.onComplete(() => {
      // Only NOW reveal the game canvas and mobile controls
      gameEngine.show();
      // Start the render + game loop
      gameEngine.init();
    });
  });
});