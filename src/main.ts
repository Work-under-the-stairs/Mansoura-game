import { LoadingScene } from './scenes/LoadingScene';

const loading = new LoadingScene(document.body);

// simulation للتيست بس
let progress = 0;
const interval = setInterval(() => {
  progress += Math.random() * 3 + 1;
  if (progress >= 100) {
    progress = 100;
    clearInterval(interval);
  }
  loading.updateProgress(progress);
}, 120);

loading.onComplete(() => {
  console.log('خلص التحميل!');
});