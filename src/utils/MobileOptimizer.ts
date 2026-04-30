export function applyMobileOptimizations(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
  if (!isMobile) return;

  // Pixel ratio أقل
  renderer.setPixelRatio(1);

  // شيل الـ shadows خالص على الموبايل
  renderer.shadowMap.enabled = false;

  // شيل الـ shadows من كل الـ lights
  scene.traverse((obj: any) => {
    if (obj.isLight) {
      obj.castShadow = false;
    }
    if (obj.isMesh) {
      obj.castShadow = false;
      obj.receiveShadow = false;
    }
  });
}