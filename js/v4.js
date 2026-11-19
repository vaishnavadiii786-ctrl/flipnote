// FLIPNOTE v4.0 — Mobile-First iOS 18 Enhancements
// Live Note Metrics, Deterministic SVG Mind Map Generator, Offline Web Audio Focus Sounds

import { escapeHtml } from './utils.js';

export function computeNoteMetrics(text) {
  const cleaned = String(text || '').trim();
  if (!cleaned) {
    return { words: 0, minutes: 0, label: '0 words' };
  }
  const words = cleaned.split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return {
    words,
    minutes,
    label: `${words} words • ${minutes}m`
  };
}

export function parseNoteToMindMapTree(title, content) {
  const rootLabel = String(title || 'Study Mind Map').trim().slice(0, 42) || 'Study Mind Map';
  const lines = String(content || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const branches = [];
  let currentBranch = null;

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      currentBranch = { label: headingMatch[1].replace(/[*_`]/g, '').trim().slice(0, 34), children: [] };
      branches.push(currentBranch);
      continue;
    }

    const bulletMatch = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)/);
    const body = (bulletMatch ? bulletMatch[1] : line).replace(/[*_`]/g, '').trim();

    const colonIdx = body.indexOf(':');
    if (colonIdx > 1 && colonIdx < 34) {
      const term = body.slice(0, colonIdx).trim().slice(0, 30);
      const detail = body.slice(colonIdx + 1).trim().slice(0, 38);
      if (!currentBranch || branches.length < 6) {
        const b = { label: term, children: detail ? [detail] : [] };
        branches.push(b);
        currentBranch = b;
      } else if (currentBranch.children.length < 3) {
        currentBranch.children.push(`${term}: ${detail}`.slice(0, 38));
      }
      continue;
    }

    const shortItem = body.split(/[.!?।]/)[0].trim().slice(0, 36);
    if (!shortItem) continue;
    if (currentBranch && currentBranch.children.length < 3) {
      currentBranch.children.push(shortItem);
    } else if (branches.length < 6) {
      currentBranch = { label: shortItem, children: [] };
      branches.push(currentBranch);
    }
  }

  if (!branches.length && content) {
    const sentences = String(content)
      .split(/[.!?।]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 4)
      .slice(0, 5);
    for (const s of sentences) {
      branches.push({ label: s.slice(0, 36), children: [] });
    }
  }

  return {
    root: rootLabel,
    branches: branches.slice(0, 6)
  };
}

export function renderMindMapSvg(tree) {
  const branches = tree?.branches || [];
  const palette = ['#0a84ff', '#5e5ce6', '#30d158', '#ff9f0a', '#ff375f', '#5ac8fa'];

  const rowHeight = 104;
  const height = Math.max(360, branches.length * rowHeight + 80);
  const width = 820;
  const rootX = 115;
  const rootY = Math.round(height / 2);

  let paths = '';
  let nodes = '';

  branches.forEach((br, idx) => {
    const color = palette[idx % palette.length];
    const bx = 370;
    const by = Math.round(64 + idx * rowHeight + (branches.length < 4 ? (height - branches.length * rowHeight - 80) / 2 : 0));

    const c1x = rootX + 125;
    const c2x = bx - 95;
    paths += `<path d="M ${rootX + 86} ${rootY} C ${c1x} ${rootY}, ${c2x} ${by}, ${bx - 92} ${by}" fill="none" stroke="${color}" stroke-opacity="0.72" stroke-width="2.5" />`;

    nodes += `
      <g>
        <rect x="${bx - 92}" y="${by - 22}" width="196" height="44" rx="14" fill="rgba(28,32,48,0.92)" stroke="${color}" stroke-width="1.8" />
        <text x="${bx + 6}" y="${by + 5}" text-anchor="middle" fill="#f5f5f7" font-size="13" font-weight="600" font-family="-apple-system, BlinkMacSystemFont, Inter, sans-serif">${escapeHtml(br.label)}</text>
      </g>`;

    const kids = (br.children || []).slice(0, 2);
    kids.forEach((kid, kIdx) => {
      const kx = 670;
      const ky = kids.length === 1 ? by : by + (kIdx === 0 ? -24 : 24);
      paths += `<path d="M ${bx + 104} ${by} C ${bx + 145} ${by}, ${kx - 140} ${ky}, ${kx - 115} ${ky}" fill="none" stroke="${color}" stroke-opacity="0.45" stroke-width="1.8" />`;
      nodes += `
        <g>
          <rect x="${kx - 115}" y="${ky - 16}" width="230" height="32" rx="11" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.18)" stroke-width="1.2" />
          <text x="${kx}" y="${ky + 4}" text-anchor="middle" fill="#d1d1d6" font-size="11.5" font-family="-apple-system, BlinkMacSystemFont, Inter, sans-serif">${escapeHtml(kid)}</text>
        </g>`;
    });
  });

  nodes += `
    <g>
      <rect x="${rootX - 92}" y="${rootY - 28}" width="184" height="56" rx="18" fill="#0a84ff" stroke="rgba(255,255,255,0.45)" stroke-width="1.8" />
      <text x="${rootX}" y="${rootY + 5}" text-anchor="middle" fill="#ffffff" font-size="14" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, Inter, sans-serif">${escapeHtml(tree?.root || 'Mind Map')}</text>
    </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="auto" style="border-radius:16px; background:linear-gradient(145deg,#090d1a,#121830);">
    ${paths}
    ${nodes}
  </svg>`;
}

export function createFocusAudioEngine() {
  let ctx = null;
  let masterGain = null;
  let activeNodes = [];
  let currentMode = null;
  let volume = 0.35;

  function ensureContext() {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctx) {
      ctx = new AudioCtx();
      masterGain = ctx.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function stop() {
    for (const node of activeNodes) {
      try {
        if (typeof node.stop === 'function') node.stop();
        if (typeof node.disconnect === 'function') node.disconnect();
      } catch {}
    }
    activeNodes = [];
    currentMode = null;
  }

  function createNoiseBuffer(audioCtx, type) {
    const bufferSize = audioCtx.sampleRate * 3;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const out = buffer.getChannelData(0);
    let lastOut = 0.0;
    let b0 = 0, b1 = 0, b2 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      if (type === 'brown') {
        out[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = out[i];
        out[i] *= 2.8;
      } else {
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.96300 * b1 + white * 0.2965164;
        b2 = 0.57000 * b2 + white * 1.0526913;
        out[i] = (b0 + b1 + b2 + white * 0.1848) * 0.08;
      }
    }
    return buffer;
  }

  function play(mode) {
    if (currentMode === mode) {
      stop();
      return null;
    }
    stop();
    const audioCtx = ensureContext();
    if (!audioCtx) return null;

    if (mode === 'rain' || mode === 'brown') {
      const src = audioCtx.createBufferSource();
      src.buffer = createNoiseBuffer(audioCtx, mode);
      src.loop = true;

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = mode === 'rain' ? 1400 : 420;

      src.connect(filter);
      filter.connect(masterGain);
      src.start();
      activeNodes.push(src, filter);
    } else if (mode === 'lofi') {
      const freqs = [130.81, 164.81, 196.0, 246.94, 293.66];
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 520;
      filter.connect(masterGain);
      activeNodes.push(filter);

      freqs.forEach((f) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        g.gain.value = 0.09;
        osc.connect(g);
        g.connect(filter);
        osc.start();
        activeNodes.push(osc, g);
      });
    }

    currentMode = mode;
    return currentMode;
  }

  function setVolume(nextVol) {
    volume = Math.max(0, Math.min(1, Number(nextVol) || 0));
    if (masterGain) masterGain.gain.value = volume;
  }

  return {
    play,
    stop,
    setVolume,
    getMode: () => currentMode
  };
}
