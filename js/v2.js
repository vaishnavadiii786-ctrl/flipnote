// FLIPNOTE v2 Features — Audio Speak (TTS), Exam Mode, Pomodoro & Streak, Shareable Result Card

const SPEECH_LOCALE_MAP = {
  en: 'en-US',
  hi: 'hi-IN',
  bn: 'bn-IN',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
  pt: 'pt-BR',
  ar: 'ar-SA',
  ur: 'ur-PK',
  ja: 'ja-JP',
  ko: 'ko-KR',
  ta: 'ta-IN',
  te: 'te-IN',
  mr: 'mr-IN',
  gu: 'gu-IN'
};

export function speakText(text, langCode = 'en') {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }
  const clean = (text || '').trim();
  if (!clean) return false;

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = SPEECH_LOCALE_MAP[langCode] || langCode || 'en-US';
  utter.rate = 0.96;
  window.speechSynthesis.speak(utter);
  return true;
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function calculateStudyStreak(sessions = [], revisionLogs = []) {
  const daySet = new Set();
  for (const s of sessions) if (s.day) daySet.add(s.day);
  for (const r of revisionLogs) if (r.day) daySet.add(r.day);
  if (!daySet.size) return 0;

  let streak = 0;
  const now = new Date();
  for (let offset = 0; offset < 365; offset++) {
    const d = new Date(now.getTime() - offset * 86400000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (daySet.has(key)) {
      streak++;
    } else if (offset === 0) {
      // Allow streak to continue if user studied yesterday and hasn't yet today
      continue;
    } else {
      break;
    }
  }
  return streak;
}

export function calculateExamNetScore(correctCount, wrongCount, negativeMarking = false) {
  if (!negativeMarking) return correctCount;
  return Math.max(0, Number((correctCount - wrongCount * 0.25).toFixed(2)));
}

export function formatTimerMMSS(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export function downloadQuizResultCard({ title, score, total, netScore, percent, examMode = false }) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  // Deep navy-to-purple gradient background
  const bg = ctx.createLinearGradient(0, 0, 1080, 1080);
  bg.addColorStop(0, '#070b1e');
  bg.addColorStop(0.5, '#141b4d');
  bg.addColorStop(1, '#311b6e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1080, 1080);

  // Soft aurora glow circles
  const drawGlow = (x, y, r, color) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  drawGlow(220, 220, 380, 'rgba(99, 102, 241, 0.35)');
  drawGlow(860, 820, 420, 'rgba(168, 85, 247, 0.32)');

  // Frosted glass card container
  roundRect(ctx, 90, 110, 900, 860, 44);
  ctx.fillStyle = 'rgba(22, 29, 64, 0.72)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.stroke();

  // Brand header
  ctx.fillStyle = '#c4b5fd';
  ctx.font = '700 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FLIPNOTE  ·  QUIZ RESULT', 540, 200);

  // Quiz title
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 42px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const cleanTitle = (title || 'Study Quiz').slice(0, 36);
  ctx.fillText(cleanTitle, 540, 275);

  // Score Ring
  const cx = 540;
  const cy = 510;
  const radius = 155;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.lineWidth = 22;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.stroke();

  const endAngle = -Math.PI / 2 + (Math.PI * 2 * Math.min(100, Math.max(0, percent))) / 100;
  const ringGrad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  ringGrad.addColorStop(0, '#7c6cf8');
  ringGrad.addColorStop(1, '#34d399');
  ctx.beginPath();
  ctx.arc(cx, cy, radius, -Math.PI / 2, endAngle);
  ctx.lineCap = 'round';
  ctx.lineWidth = 22;
  ctx.strokeStyle = ringGrad;
  ctx.stroke();

  // Percentage inside ring
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 84px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(`${percent}%`, cx, cy + 20);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '600 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const scoreLine = examMode
    ? `Correct: ${score}/${total}  ·  Net: ${netScore}`
    : `${score} / ${total} Correct`;
  ctx.fillText(scoreLine, cx, cy + 72);

  // Badge pill
  const badgeText = examMode ? 'EXAM MODE COMPLETED' : 'ACTIVE RECALL SESSION';
  roundRect(ctx, 320, 725, 440, 56, 28);
  ctx.fillStyle = 'rgba(124, 108, 248, 0.25)';
  ctx.fill();
  ctx.fillStyle = '#e0e7ff';
  ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(badgeText, 540, 761);

  // Footer
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('IG: @flipnote.app  •  YT: @flipnoteapp', 540, 865);
  ctx.fillStyle = '#a5b4fc';
  ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('vaishnavadiii786-ctrl.github.io/flipnote', 540, 912);

  const link = document.createElement('a');
  link.download = `flipnote-result-${percent}pct.png`;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
