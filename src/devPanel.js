import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { TUNING_DEFAULTS, TUNING_PRESETS, applyTuning } from './config.js';
import { saveTuning } from './tuning.js';

// 开发版的调节面板（右上角，按 G 显示 / 隐藏）。
// 每次改动都会存到浏览器和项目里的 tuning.json（需要用 serve.py 启动），下次打开就是调好的样子。

export function createDevPanel(U, tuning, { onSheepStyle, onPlayMusic } = {}) {
  const changed = () => {
    applyTuning(U, tuning);
    saveTuning(tuning);
  };

  const gui = new GUI({ title: 'Look tuning (G to hide)' });
  // 帧率（每秒刷新一次）
  const stats = { fps: '—' };
  gui.add(stats, 'fps').name('Frame rate').disable().listen();
  let frames = 0, last = performance.now();
  const tick = () => {
    frames++;
    const now = performance.now();
    if (now - last >= 1000) {
      stats.fps = `${Math.round((frames * 1000) / (now - last))} fps`;
      frames = 0;
      last = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const g = gui.addFolder('Grass');
  g.add(tuning.grass, 'toon').name('Two-tone (off = realistic)').onChange(changed);
  g.addColor(tuning.grass, 'light').name('Lit color').onChange(changed);
  g.addColor(tuning.grass, 'lightDeep').name('Lit deep color (blade roots / dense tufts)').onChange(changed);
  g.addColor(tuning.grass, 'shadow').name('Shadow color').onChange(changed);
  g.add(tuning.grass, 'edge', 0.02, 0.95, 0.01).name('Light/shadow edge').onChange(changed);
  g.add(tuning.grass, 'softness', 0, 0.3, 0.005).name('Edge softness').onChange(changed);
  g.add(tuning.grass, 'variation', 0, 1, 0.01).name('Amount of dark patches').onChange(changed);
  g.add(tuning.grass, 'flowers', 0, 1, 0.01).name('Wildflowers').onChange(changed);
  g.add(tuning.grass, 'hues', 0, 1, 0.01).name('Hidden hues (stray colors in the blades)').onChange(changed);

  const f = gui.addFolder('Spruce forest');
  f.addColor(tuning.forest, 'lit').name('Lit color').onChange(changed);
  f.addColor(tuning.forest, 'shade').name('Shadow color').onChange(changed);
  f.add(tuning.forest, 'hues', 0, 1, 0.01).name('Hidden hues (stray colors in the branches)').onChange(changed);

  const s = gui.addFolder('Sheep');
  s.add(tuning.sheep, 'toon').name('Illustrated shading (off = realistic)').onChange((v) => { changed(); onSheepStyle?.(v); });
  s.addColor(tuning.sheep, 'light').name('Lit color').onChange(changed);
  s.addColor(tuning.sheep, 'shadow').name('Shadow color').onChange(changed);
  s.add(tuning.sheep, 'followGrass', 0, 1, 0.01).name('Shadow leans toward grass shadow').onChange(changed);
  s.add(tuning.sheep, 'edge', 0.02, 0.95, 0.01).name('Light/shadow edge').onChange(changed);
  s.add(tuning.sheep, 'softness', 0, 0.5, 0.005).name('Edge softness').onChange(changed);
  s.add(tuning.sheep, 'texture', 0, 1, 0.01).name('Texture detail').onChange(changed);
  s.add(tuning.sheep, 'fuzz', 0, 1, 0.01).name('Fluffy bump').onChange(changed);
  s.add(tuning.sheep, 'rim', 0, 1, 0.01).name('Rim light').onChange(changed);
  s.add(tuning.sheep, 'brightness', 0.5, 2, 0.01).name('Overall brightness').onChange(changed);
  s.add(tuning.sheep, 'highlight', 0, 1.5, 0.01).name('Sunny-side boost').onChange(changed);

  const k = gui.addFolder('Sky & sun');
  k.add(tuning.sky, 'elevation', 3, 75, 0.5).name('Sun elevation (°)').onChange(changed);
  k.add(tuning.sky, 'azimuth', -180, 180, 1).name('Sun azimuth (°)').onChange(changed);
  k.add(tuning.sky, 'sun', 0.5, 4, 0.05).name('Sunlight strength').onChange(changed);
  k.add(tuning.sky, 'skyLight', 0.1, 1.5, 0.01).name('Skylight strength').onChange(changed);
  k.addColor(tuning.sky, 'zenith').name('Zenith color').onChange(changed);
  k.addColor(tuning.sky, 'horizon').name('Horizon color').onChange(changed);
  k.add(tuning.sky, 'band', 0.04, 0.8, 0.01).name('Horizon band height').onChange(changed);
  k.add(tuning.sky, 'haze', 0, 1, 0.01).name('Distant haze').onChange(changed);
  k.add(tuning.sky, 'air', 0, 1.5, 0.01).name('Atmosphere (mid-distance mist)').onChange(changed);
  k.add(tuning.sky, 'exposure', 0.6, 2.2, 0.01).name('Exposure (water / forest / mountains)').onChange(changed);
  k.add(tuning.sky, 'bloom', 0, 1.5, 0.01).name('Bloom').onChange(changed);
  k.add(tuning.sky, 'cloudCover', 0, 1, 0.01).name('Cloud shadow cover').onChange(changed);
  k.add(tuning.sky, 'cloudStrength', 0, 1, 0.01).name('Cloud shadow strength').onChange(changed);
  k.add(tuning.sky, 'cloudSoftness', 0, 1, 0.01).name('Cloud shadow softness').onChange(changed);
  k.add(tuning.sky, 'cloudSpeed', 0, 4, 0.05).name('Cloud speed').onChange(changed);

  const w = gui.addFolder('Stream & lake');
  w.addColor(tuning.water, 'color').name('Water color').onChange(changed);
  w.add(tuning.water, 'reflection', 0, 1, 0.01).name('Sky reflection').onChange(changed);
  w.add(tuning.water, 'ripple', 0.3, 2.5, 0.01).name('Ripple fineness').onChange(changed);
  w.add(tuning.water, 'glitter', 0, 3, 0.01).name('Sun glitter').onChange(changed);
  w.addColor(tuning.water, 'glitterColor').name('Distant glitter color').onChange(changed);
  w.addColor(tuning.water, 'lake').name('Lake color').onChange(changed);

  const so = gui.addFolder('Sound (starts after you click the view)');
  so.add(tuning.sound, 'master', 0, 1.5, 0.01).name('Master volume').onChange(changed);
  so.add(tuning.sound, 'wind', 0, 1.5, 0.01).name('Wind & grass').onChange(changed);
  so.add(tuning.sound, 'water', 0, 1.5, 0.01).name('Stream').onChange(changed);
  so.add(tuning.sound, 'sheep', 0, 1.5, 0.01).name('Sheep bleats').onChange(changed);
  so.add(tuning.sound, 'bees', 0, 1.5, 0.01).name('Bumblebees').onChange(changed);
  so.add(tuning.sound, 'birds', 0, 1.5, 0.01).name('Skylarks').onChange(changed);
  so.add(tuning.sound, 'music', 0, 1.5, 0.01).name('Music').onChange(changed);
  so.add(tuning.sound, 'musicStyle', { 'Dombra küy': 'kuy', 'Steppe tune (flute)': 'song' }).name('Music style').onChange(changed);
  if (onPlayMusic) so.add({ play: onPlayMusic }, 'play').name('Play some music now');

  // 预设：一键套用一组配好的参数（只改预设里列出的项，羊的参数不动）
  const presetNames = Object.keys(TUNING_PRESETS);
  const pick = { preset: presetNames[0] };
  gui.add(pick, 'preset', presetNames).name('Preset');
  gui.add({
    apply() {
      const pr = TUNING_PRESETS[pick.preset];
      for (const k2 of Object.keys(pr)) Object.assign(tuning[k2], pr[k2]);
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
      changed();
      onSheepStyle?.(tuning.sheep.toon);
    },
  }, 'apply').name('Apply this preset');
  gui.add({
    reset() {
      for (const k of Object.keys(TUNING_DEFAULTS)) Object.assign(tuning[k], TUNING_DEFAULTS[k]);
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
      changed();
      onSheepStyle?.(tuning.sheep.toon);
    },
  }, 'reset').name('Reset everything');

  addEventListener('keydown', (e) => {
    if (e.code === 'KeyG' && !e.target.closest?.('input, textarea, select')) gui.show(gui._hidden);
  });
  return gui;
}
