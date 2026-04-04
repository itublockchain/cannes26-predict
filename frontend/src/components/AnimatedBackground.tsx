import React, { useEffect, useRef } from 'react';

const BLOB_CONFIGS = [
  {
    xFreqs: [0.000031, 0.000058], xPhases: [0,    2.2], xAmps: [6, 2.5],
    yFreqs: [0.000019, 0.000074], yPhases: [1.1,  3.8], yAmps: [4, 3],
    activeMulti: 6, mouseFX:  18, mouseFY: -12,
    radA: ['58%','42%','62%','38%'], radB: ['43%','57%','50%','50%'],
    radC: ['48%','55%','45%','52%'], radD: ['62%','38%','56%','44%'],
    morphSpd: 0.000019,
  },
  {
    xFreqs: [0.000024, 0.000063], xPhases: [2.1,  4.5], xAmps: [5, 2],
    yFreqs: [0.000041, 0.000052], yPhases: [0.7,  1.9], yAmps: [6, 1.5],
    activeMulti: 5, mouseFX: -20, mouseFY:  14,
    radA: ['44%','56%','36%','64%'], radB: ['60%','40%','48%','52%'],
    radC: ['58%','42%','58%','42%'], radD: ['38%','62%','46%','54%'],
    morphSpd: 0.000026,
  },
  {
    xFreqs: [0.000045, 0.000029], xPhases: [4.2,  1.0], xAmps: [4, 3],
    yFreqs: [0.000037, 0.000081], yPhases: [2.6,  0.3], yAmps: [5, 2],
    activeMulti: 7, mouseFX:  12, mouseFY:  18,
    radA: ['68%','32%','52%','48%'], radB: ['48%','52%','66%','34%'],
    radC: ['38%','62%','38%','62%'], radD: ['57%','43%','44%','56%'],
    morphSpd: 0.000016,
  },
  {
    xFreqs: [0.000027, 0.000066], xPhases: [1.05, 3.2], xAmps: [5.5, 2],
    yFreqs: [0.000055, 0.000034], yPhases: [3.7,  0.9], yAmps: [4,   3],
    activeMulti: 5.5, mouseFX: -15, mouseFY: -16,
    radA: ['36%','64%','58%','42%'], radB: ['54%','46%','40%','60%'],
    radC: ['62%','38%','62%','38%'], radD: ['42%','58%','54%','46%'],
    morphSpd: 0.000023,
  },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const AnimatedBackground: React.FC = () => {
  const blobRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    let animationFrameId: number;
    let mouseX = 0;
    let mouseY = 0;

    const states = BLOB_CONFIGS.map(() => ({
      act: 0, tAct: 0, sMX: 0, sMY: 0, curDX: 0, curDY: 0
    }));

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    window.addEventListener('mousemove', handleMouseMove);

    const tick = (t: number) => {
      blobRefs.current.forEach((el, index) => {
        if (!el) return;
        const conf = BLOB_CONFIGS[index];
        const state = states[index];

        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        const threshold = Math.max(rect.width, rect.height) * 0.9;
        const dist = Math.hypot(mouseX - cx, mouseY - cy);
        state.tAct = dist < threshold ? 1 : 0;

        state.act = lerp(state.act, state.tAct, 0.03);

        const nMX = (mouseX / window.innerWidth) - 0.5;
        const nMY = (mouseY / window.innerHeight) - 0.5;
        state.sMX = lerp(state.sMX, nMX, 0.04);
        state.sMY = lerp(state.sMY, nMY, 0.04);

        const multi = lerp(1, conf.activeMulti, state.act);

        let dx = conf.xFreqs.reduce((s, f, i) => s + Math.sin(t * f + conf.xPhases[i]) * conf.xAmps[i] * multi, 0);
        let dy = conf.yFreqs.reduce((s, f, i) => s + Math.cos(t * f + conf.yPhases[i]) * conf.yAmps[i] * multi, 0);

        dx += state.sMX * conf.mouseFX * state.act * 32;
        dy += state.sMY * conf.mouseFY * state.act * 26;

        el.style.transform = `translate(${dx}px, ${dy}px)`;

        const m = (Math.sin(t * conf.morphSpd) + 1) / 2;
        const rA = conf.radA.map((v, i) => lerp(parseFloat(v), parseFloat(conf.radB[i]), m).toFixed(1) + '%');
        const rB = conf.radC.map((v, i) => lerp(parseFloat(v), parseFloat(conf.radD[i]), m).toFixed(1) + '%');
        
        el.style.borderRadius = `${rA.join(' ')} / ${rB.join(' ')}`;
      });

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <>
      <style>{`
        .global-bg-wrapper {
          position: fixed;
          top: 0; left: 0;
          width: 100vw; height: 100vh;
          overflow: hidden;
          background: linear-gradient(135deg, #05091e 0%, #0a1538 45%, #0c1d4a 75%, #0a0d2a 100%);
          z-index: -10;
          pointer-events: none;
        }

        .blob {
          position: absolute;
          pointer-events: none;
          will-change: transform, border-radius;
        }
        .blob-1 {
          width: 18vw; height: 20vw; top: 4vh; left: 4vw;
          background: rgba(65,125,255,0.7); filter: blur(5px);
          border-radius: 58% 42% 62% 38% / 48% 55% 45% 52%;
        }
        .blob-2 {
          width: 14vw; height: 16vw; top: 52vh; left: 68vw;
          background: rgba(105,165,255,0.65); filter: blur(5px);
          border-radius: 44% 56% 36% 64% / 58% 42% 58% 42%;
        }
        .blob-3 {
          width: 11vw; height: 13vw; top: 62vh; left: 6vw;
          background: rgba(185,218,255,0.6); filter: blur(4px);
          border-radius: 68% 32% 52% 48% / 38% 62% 38% 62%;
        }
        .blob-4 {
          width: 15vw; height: 13vw; top: 6vh; left: 74vw;
          background: rgba(50,100,230,0.68); filter: blur(5px);
          border-radius: 36% 64% 58% 42% / 62% 38% 62% 38%;
        }

        .grid-overlay {
          position: absolute; inset: 0; pointer-events: none; z-index: 1;
          background-image: linear-gradient(rgba(99,156,230,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(99,156,230,0.04) 1px, transparent 1px);
          background-size: 80px 80px;
        }
      `}</style>
      
      <div className="global-bg-wrapper">
        <div className="blob blob-1" ref={(el) => { if(el) blobRefs.current[0] = el; }}></div>
        <div className="blob blob-2" ref={(el) => { if(el) blobRefs.current[1] = el; }}></div>
        <div className="blob blob-3" ref={(el) => { if(el) blobRefs.current[2] = el; }}></div>
        <div className="blob blob-4" ref={(el) => { if(el) blobRefs.current[3] = el; }}></div>

        <div className="grid-overlay"></div>
      </div>
    </>
  );
};
