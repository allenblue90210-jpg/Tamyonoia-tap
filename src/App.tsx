/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';

type GameState = 'menu' | 'ready' | 'play' | 'dead' | 'quit';

interface Pipe {
  x: number;
  b: number;
  gy: number;
  ph: number;
  p: boolean;
}

interface Star {
  rx: number; // normalized 0..1
  ry: number; // normalized 0..1
  s: number;
  phase: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SPRITE_PATHS = [
  '/sprites/sprite_0.png', // 0: flying robo-cat
  '/sprites/sprite_1.png', // 1: sitting mascot robo-cat
  '/sprites/sprite_2.png', // 2: TAMIYANOIA Tap logo
  '/sprites/sprite_3.png', // 3: TAP TO RETRY button
  '/sprites/sprite_4.png', // 4: Back button
  '/sprites/sprite_5.png', // 5: SYSTEM CRASH banner
  '/sprites/sprite_6.png', // 6: START banner
];

const GAP = 116;
const PW = 64;
const BASE_SPD = 3.4;
const GRAV = 0.52;
const FLAP = -7.4;
const GROUND = 44;

function inRect(px: number, py: number, r: Rect, pad = 6): boolean {
  return (
    px >= r.x - pad &&
    px <= r.x + r.w + pad &&
    py >= r.y - pad &&
    py <= r.y + r.h + pad
  );
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const cv = canvasRef.current;
    if (!container || !cv) return;

    const g = cv.getContext('2d', { alpha: false });
    if (!g) return;

    // Preload high-DPI sharpened sprites
    const imgs: HTMLImageElement[] = SPRITE_PATHS.map((src) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
      return img;
    });

    // Dynamic uniform-scale logical viewport (guaranteed 1:1 X/Y aspect — zero squeeze)
    let W = 400;
    let H = 600;
    let cssW = 400;
    let cssH = 600;
    let dpr = 2;
    let scale = 1;
    let safeTop = 0;
    let safeBottom = 0;
    let isMobileFullBleed = false;

    const stars: Star[] = Array.from({ length: 65 }, () => ({
      rx: Math.random(),
      ry: Math.random(),
      s: Math.random() * 1.6 + 0.6,
      phase: Math.random() * Math.PI * 2,
    }));

    let score = 0;
    let best = 0;
    let state: GameState = 'menu';
    let frame = 0;
    let pipeTimer = 77;
    let groundScroll = 0;
    let pipes: Pipe[] = [];
    let cat = { x: 90, y: 260, v: 0, r: 0 };

    try {
      best = Number(localStorage.getItem('rcbest')) || 0;
    } catch {
      // ignore storage errors
    }

    const getGroundH = () => GROUND + Math.round(safeBottom);
    const getSkyH = () => H - getGroundH();
    const getUiTop = () => {
      const avail = getSkyH() - safeTop;
      return safeTop + Math.max(0, (avail - 536) * 0.5);
    };

    const getMenuRects = () => {
      const cx = W / 2;
      const uiY = getUiTop();
      return {
        startBtn: { x: cx - 110, y: uiY + 396, w: 220, h: 52 },
        quitBtn: { x: cx - 110, y: uiY + 462, w: 220, h: 52 },
      };
    };

    const getBackRect = (): Rect => ({
      x: 12,
      y: 12 + safeTop,
      w: 50,
      h: 50,
    });

    const reset = () => {
      const cx = W / 2;
      const skyH = getSkyH();
      cat = {
        x: Math.max(68, cx - 110),
        y: skyH * 0.5 - 32,
        v: 0,
        r: 0,
      };
      pipes = [];
      score = 0;
      frame = 0;
      pipeTimer = 77;
    };

    const syncViewport = () => {
      const vw = container.clientWidth || window.innerWidth;
      const vh = container.clientHeight || window.innerHeight;
      if (vw <= 0 || vh <= 0) return;

      // Supersample at minimum 2x even on 1x displays, and full native Retina up to 4x on phones
      dpr = Math.min(Math.max(window.devicePixelRatio || 1, 2), 4);

      // Full-bleed edge-to-edge on mobile/narrow screens; crisp 2:3 cabinet on desktop/tablet
      isMobileFullBleed = vw <= 640;

      if (isMobileFullBleed) {
        cssW = vw;
        cssH = vh;
        // Maintain 100% uniform X/Y scaling (never stretch or squash)
        if (cssH / cssW >= 1.5) {
          W = 400;
          scale = cssW / W;
          H = Math.round(cssH / scale);
        } else {
          H = 600;
          scale = cssH / H;
          W = Math.round(cssW / scale);
        }
        const cs = getComputedStyle(document.documentElement);
        safeTop = (parseFloat(cs.getPropertyValue('--sat')) || 0) / scale;
        safeBottom = (parseFloat(cs.getPropertyValue('--sab')) || 0) / scale;
      } else {
        const pad = 24;
        const maxH = Math.min(vh - pad, 860);
        const maxW = vw - pad;
        if (maxH * (2 / 3) <= maxW) {
          cssH = Math.max(360, Math.round(maxH));
          cssW = Math.round(cssH * (2 / 3));
        } else {
          cssW = Math.max(240, Math.round(maxW));
          cssH = Math.round(cssW * 1.5);
        }
        W = 400;
        H = 600;
        scale = cssW / W;
        safeTop = 0;
        safeBottom = 0;
      }

      cv.style.width = `${cssW}px`;
      cv.style.height = `${cssH}px`;
      cv.style.borderRadius = isMobileFullBleed ? '0px' : '16px';
      cv.style.boxShadow = isMobileFullBleed
        ? 'none'
        : '0 0 48px rgba(10, 76, 255, 0.35), 0 0 0 1px rgba(95, 242, 255, 0.28)';

      const targetPixelW = Math.round(cssW * dpr);
      const targetPixelH = Math.round(cssH * dpr);
      if (cv.width !== targetPixelW || cv.height !== targetPixelH) {
        cv.width = targetPixelW;
        cv.height = targetPixelH;
      }

      // Clamp cat inside playfield if resized mid-session
      const skyH = getSkyH();
      cat.x = Math.max(68, W / 2 - 110);
      if (state === 'ready' || state === 'menu') {
        cat.y = skyH * 0.5 - 32;
      } else {
        cat.y = Math.min(cat.y, skyH - 64);
      }
    };

    syncViewport();
    reset();

    const getSpeed = () => BASE_SPD + Math.min(score * 0.15, 1.5);

    const die = () => {
      state = 'dead';
      frame = 0;
      if (score > best) {
        best = score;
        try {
          localStorage.setItem('rcbest', String(best));
        } catch {
          // ignore
        }
      }
    };

    const flap = () => {
      if (state === 'menu' || state === 'quit') return;
      if (state === 'ready') {
        state = 'play';
      }
      if (state === 'play') {
        cat.v = FLAP;
      } else if (state === 'dead' && frame > 26) {
        state = 'ready';
        reset();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') {
        e.preventDefault();
        if (state === 'quit') {
          state = 'menu';
        } else if (state === 'menu') {
          state = 'ready';
          reset();
        } else {
          flap();
        }
      } else if (e.code === 'Escape' && (state === 'ready' || state === 'dead')) {
        state = 'menu';
        reset();
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const x = ((e.clientX - rect.left) * W) / rect.width;
      const y = ((e.clientY - rect.top) * H) / rect.height;

      if (state === 'quit') {
        state = 'menu';
        return;
      }

      if (state === 'menu') {
        const { startBtn, quitBtn } = getMenuRects();
        if (inRect(x, y, startBtn, 6)) {
          state = 'ready';
          reset();
        } else if (inRect(x, y, quitBtn, 6)) {
          state = 'quit';
        }
        return;
      }

      if ((state === 'dead' && frame > 20) || state === 'ready') {
        if (inRect(x, y, getBackRect(), 12)) {
          state = 'menu';
          reset();
          return;
        }
      }

      flap();
    };

    window.addEventListener('keydown', handleKeyDown);
    cv.addEventListener('pointerdown', handlePointerDown, { passive: false });
    window.addEventListener('resize', syncViewport);
    window.visualViewport?.addEventListener('resize', syncViewport);

    const ro = new ResizeObserver(syncViewport);
    ro.observe(container);

    const update = (step: number) => {
      frame += step;
      const skyH = getSkyH();

      if (state === 'play') {
        cat.v += GRAV * step;
        cat.y += cat.v * step;
        cat.r = Math.max(-0.4, Math.min(1, cat.v / 12));

        const curSpd = getSpeed();
        groundScroll = (groundScroll + curSpd * step) % 30;

        pipeTimer += step;
        if (pipeTimer >= 78) {
          pipeTimer -= 78;
          // Keep pipe spawn range comfortable & consistent on tall mobile screens
          const midCenter = skyH * 0.5 - GAP * 0.5;
          const bandHalf = Math.min(132, Math.max(60, (skyH - GAP - 190) * 0.5));
          const base = midCenter + (Math.random() * 2 - 1) * bandHalf;
          pipes.push({
            x: W + 10,
            b: base,
            gy: base,
            ph: Math.random() * Math.PI * 2,
            p: false,
          });
        }

        const HB: [number, number, number][] = [
          [34, -10, 13],
          [8, 0, 16],
          [-22, 4, 14],
        ];

        for (const p of pipes) {
          p.x -= curSpd * step;
          p.gy = Math.max(
            44,
            Math.min(skyH - GAP - 44, p.b + Math.sin(frame / 22 + p.ph) * 55)
          );

          if (!p.p && p.x + PW < cat.x) {
            p.p = true;
            score++;
          }

          const hit = HB.some(([ox, oy, R]) => {
            const cx = cat.x + 30 + ox;
            const cy = cat.y + 30 + oy;
            return (
              cx + R > p.x &&
              cx - R < p.x + PW &&
              (cy - R < p.gy || cy + R > p.gy + GAP)
            );
          });
          if (hit) {
            die();
            break;
          }
        }

        pipes = pipes.filter((p) => p.x > -PW - 12);

        if (cat.y + 64 > skyH || cat.y < -20) {
          die();
        }
      } else if (state === 'ready') {
        cat.y = skyH * 0.5 - 32 + Math.sin(frame / 12) * 8;
      } else if (state === 'dead' && cat.y + 64 < skyH) {
        cat.v += GRAV * step;
        cat.y = Math.min(skyH - 64, cat.y + cat.v * step);
        cat.r = 1;
      }
    };

    const drawPipe = (x: number, y: number, h: number, isTop: boolean) => {
      if (h <= 0) return;
      const gr = g.createLinearGradient(x, 0, x + PW, 0);
      gr.addColorStop(0, '#0a2a7a');
      gr.addColorStop(0.5, '#1a5cff');
      gr.addColorStop(1, '#0a2a7a');

      g.fillStyle = gr;
      g.fillRect(x, y, PW, h);
      g.strokeStyle = '#5ff2ff';
      g.lineWidth = 2;
      g.strokeRect(x, y, PW, h);

      g.fillStyle = '#5ff2ff';
      for (let i = 8; i < h - 18; i += 34) {
        g.fillRect(x + PW / 2 - 2, y + i, 4, 14);
      }

      const capH = Math.min(18, h);
      const cy = isTop ? y + h - capH : y;
      g.fillStyle = '#0d3fcc';
      g.fillRect(x - 5, cy, PW + 10, capH);
      g.strokeRect(x - 5, cy, PW + 10, capH);
    };

    const drawSpriteCrisp = (
      im: HTMLImageElement,
      x: number,
      y: number,
      w: number,
      glowBlur = 0
    ) => {
      if (!im.complete || im.naturalWidth === 0) return;
      const h = (w * im.naturalHeight) / im.naturalWidth;
      if (glowBlur > 0) {
        g.save();
        g.shadowColor = 'rgba(42, 168, 255, 0.5)';
        g.shadowBlur = glowBlur * dpr;
        g.drawImage(im, x, y, w, h);
        g.restore();
      } else {
        g.drawImage(im, x, y, w, h);
      }
    };

    const drawCat = (im: HTMLImageElement) => {
      if (!im.complete || im.naturalWidth === 0) return;
      const up = cat.v < 0 && state === 'play';
      g.save();
      g.translate(cat.x + 30, cat.y + 30);
      g.rotate(cat.r);

      if (up) {
        g.fillStyle = '#5ff2ff';
        g.beginPath();
        g.moveTo(-14, 24);
        g.lineTo(-8 - Math.random() * 4, 40 + Math.random() * 8);
        g.lineTo(0, 24);
        g.fill();
      }

      g.shadowColor = 'rgba(42, 168, 255, 0.55)';
      g.shadowBlur = 8 * dpr;
      const hw = 104;
      const hh = (hw * im.naturalHeight) / im.naturalWidth;
      g.drawImage(im, -hw / 2, -hh / 2, hw, hh);
      g.restore();
    };

    const drawMenu = () => {
      const cx = W / 2;
      const skyH = getSkyH();
      const uiY = getUiTop();

      g.save();
      g.fillStyle = 'rgba(5, 11, 31, 0.88)';
      g.fillRect(0, 0, W, skyH);

      // Game logo (TAMIYANOIA Tap)
      drawSpriteCrisp(imgs[2], cx - 170, uiY + 20, 340, 8);

      // Subtitle
      g.textAlign = 'center';
      g.font = '600 14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      g.fillStyle = '#a8ceff';
      g.fillText(`EXTREME MODE  ·  Best: ${best}`, cx, uiY + 144);

      // Mascot robo-cat
      drawSpriteCrisp(imgs[1], cx - 72, uiY + 156, 144, 10);

      // Crisp vector menu buttons
      const { startBtn, quitBtn } = getMenuRects();
      const drawBtn = (r: Rect, label: string, primary: boolean) => {
        const btnGrad = g.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
        if (primary) {
          btnGrad.addColorStop(0, '#256eff');
          btnGrad.addColorStop(1, '#1246cc');
        } else {
          btnGrad.addColorStop(0, '#0e3394');
          btnGrad.addColorStop(1, '#081e5c');
        }
        g.fillStyle = btnGrad;
        g.strokeStyle = '#5ff2ff';
        g.lineWidth = 2;
        g.beginPath();
        g.roundRect(r.x, r.y, r.w, r.h, 12);
        g.fill();
        g.stroke();

        g.fillStyle = '#ffffff';
        g.font = '700 21px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
        g.fillText(label, r.x + r.w / 2, r.y + 34);
      };

      drawBtn(startBtn, 'START GAME', true);
      drawBtn(quitBtn, 'QUIT', false);
      g.restore();
    };

    const draw = () => {
      // Apply high-DPI uniform transform cleanly every frame
      g.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';

      const cx = W / 2;
      const skyH = getSkyH();
      const groundH = getGroundH();
      const uiY = getUiTop();

      // Deep cyber space sky gradient
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#050b1f');
      bg.addColorStop(1, '#0b2260');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);

      // Twinkling crisp stars
      g.fillStyle = '#bfe3ff';
      for (const s of stars) {
        g.globalAlpha = 0.35 + 0.45 * Math.sin(frame / 20 + s.phase);
        g.fillRect(s.rx * W, s.ry * skyH, s.s, s.s);
      }
      g.globalAlpha = 1;

      // Obstacles
      for (const p of pipes) {
        drawPipe(p.x, 0, p.gy, true);
        drawPipe(p.x, p.gy + GAP, skyH - p.gy - GAP, false);
      }

      // Neon cyber ground
      g.fillStyle = '#0a1a4a';
      g.fillRect(0, skyH, W, groundH);
      g.fillStyle = '#3d7bff';
      g.fillRect(0, skyH, W, 3);
      g.fillStyle = '#1a3a9a';
      const off = state === 'play' ? groundScroll : 0;
      for (let x = -off; x < W; x += 30) {
        g.fillRect(x, skyH + 15, 16, 4);
      }

      // Player cat & live score
      if (state !== 'menu') {
        drawCat(imgs[0]);
      }

      if (state === 'play' || state === 'ready') {
        g.save();
        g.textAlign = 'center';
        g.font = '800 46px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
        g.lineJoin = 'round';
        g.strokeStyle = 'rgba(3, 8, 24, 0.85)';
        g.lineWidth = 5;
        const scoreY = Math.max(66, uiY + 66);
        g.strokeText(String(score), cx, scoreY);
        g.fillStyle = '#ffffff';
        g.fillText(String(score), cx, scoreY);
        g.restore();
      }

      // Ready overlay
      if (state === 'ready') {
        drawSpriteCrisp(imgs[2], cx - 160, uiY + 104, 320, 6);
        drawSpriteCrisp(imgs[6], cx - 95, uiY + 382, 190, 8);
        g.textAlign = 'center';
        g.font = '600 16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
        g.fillStyle = '#d4e7ff';
        g.fillText('Tap or press Space to flap', cx, uiY + 498);
        g.fillStyle = '#9ec4ff';
        g.fillText(`Best: ${best}`, cx, uiY + 524);
      }

      // Back button in ready & dead states
      if (state === 'ready' || state === 'dead') {
        const b = getBackRect();
        drawSpriteCrisp(imgs[4], b.x, b.y, b.w, 4);
      }

      // Menu overlay
      if (state === 'menu') {
        drawMenu();
      }

      // Quit overlay
      if (state === 'quit') {
        g.fillStyle = 'rgba(5, 11, 31, 0.94)';
        g.fillRect(0, 0, W, H);
        g.textAlign = 'center';
        g.fillStyle = '#5ff2ff';
        g.font = '700 30px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
        g.fillText('Thanks for playing!', cx, H * 0.5 - 16);
        g.font = '500 16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
        g.fillStyle = '#a8ceff';
        g.fillText('Tap anywhere to return to the menu', cx, H * 0.5 + 20);
      }

      // Game over overlay
      if (state === 'dead') {
        drawSpriteCrisp(imgs[5], cx - 150, uiY + 95, 300, 8);
        g.save();
        g.textAlign = 'center';
        g.font = '700 19px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
        g.lineJoin = 'round';
        g.lineWidth = 4;
        g.strokeStyle = 'rgba(3, 8, 24, 0.9)';
        const summary = `Score ${score}   ·   Best ${best}`;
        g.strokeText(summary, cx, uiY + 272);
        g.fillStyle = '#ffffff';
        g.fillText(summary, cx, uiY + 272);
        g.restore();

        drawSpriteCrisp(imgs[3], cx - 100, uiY + 296, 200, 8);
      }
    };

    let rafId = 0;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const elapsed = now - lastTime;
      lastTime = now;
      // Normalize physics to 60Hz so 120Hz ProMotion phones play at identical speed
      const step = Math.min(Math.max(elapsed / (1000 / 60), 0.25), 2.5);
      update(step);
      draw();
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('keydown', handleKeyDown);
      cv.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', syncViewport);
      window.visualViewport?.removeEventListener('resize', syncViewport);
    };
  }, []);

  return (
    <main
      ref={containerRef}
      className="w-full h-[100dvh] overflow-hidden bg-[#050b1f] flex items-center justify-center m-0 p-0 select-none touch-none"
    >
      <canvas ref={canvasRef} className="block touch-none select-none" />
    </main>
  );
}
