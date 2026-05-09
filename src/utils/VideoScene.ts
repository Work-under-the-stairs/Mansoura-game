export class VideoScene {
  private container: HTMLElement;
  private wrapper: HTMLDivElement | null = null;
  private overlay: HTMLDivElement | null = null;
  private video: HTMLVideoElement | null = null;
  private completeCallback: (() => void) | null = null;

  constructor(container: HTMLElement, private src: string) {
    this.container = container;
  }

  show(): void {
    this.wrapper = document.createElement('div');
    Object.assign(this.wrapper.style, {
      position:   'fixed',
      inset:      '0',
      width:      '100vw',
      height:     '100vh',
      background: '#000',
      zIndex:     '9999',
    });

    this.video = document.createElement('video');
    this.video.src         = this.src;
    this.video.playsInline = true;
    this.video.preload     = 'auto';
    Object.assign(this.video.style, {
      width:      '100%',
      height:     '100%',
      objectFit:  'cover',
      display:    'block',
    });

    this.overlay = document.createElement('div');
    Object.assign(this.overlay.style, {
      position:      'absolute',
      inset:         '0',
      background:    '#000',
      opacity:       '1',          // يبدأ معتم ← fade in
      transition:    'opacity 1s ease',
      pointerEvents: 'none',
      zIndex:        '1',
    });

    this.wrapper.appendChild(this.video);
    this.wrapper.appendChild(this.overlay);
    this.container.appendChild(this.wrapper);

    this.video.play().catch(console.error);

    // fade in بعد frame واحد
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.overlay!.style.opacity = '0';
      });
    });

    this.video.addEventListener('ended', () => this.fadeOutAndFinish());
  }

  onComplete(cb: () => void): void {
    this.completeCallback = cb;
  }

  private fadeOutAndFinish(): void {
    if (!this.overlay) return;
    this.overlay.style.opacity = '1';

    setTimeout(() => {
      this.video?.pause();
      this.wrapper?.remove();
      this.wrapper = null;
      this.overlay = null;
      this.video   = null;
      this.completeCallback?.();
    }, 1000);
  }
}