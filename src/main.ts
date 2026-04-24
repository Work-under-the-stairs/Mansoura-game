import { LoadingScene } from './scenes/LoadingScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { NarrativeScene } from './scenes/NarrativeScene';
import { Engine } from './scenes/game/Engine';
import { OrientationGuard } from './utils/OrientationGuard';

const orientationGuard = new OrientationGuard();

const loading = new LoadingScene(document.body);

// ابدأ الـ Engine فوراً — هو اللي هيحمل كل حاجة ويبعت الـ progress الحقيقي
const gameEngine = new Engine(loading);

// لما التحميل يخلص — اعرض المنيو
gameEngine.onReady(() => {
  // const menu = new MainMenuScene(document.body);
  // menu.show();

  // menu.onStart(() => {
  //   const narrative = new NarrativeScene(document.body);
  //   narrative.show();

  //   narrative.onComplete(() => {
      gameEngine.init();
    });
//   });
// });