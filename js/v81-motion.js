// FLIPNOTE v8.1 — Enterprise Motion Engine (Apple / Linear / Vercel-grade 60fps UI Physics)
// Zero dependencies, GPU-accelerated, respects prefers-reduced-motion.

(function initFlipnoteMotion() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // 1. Inject ambient floating aurora mesh layer once
  if (!document.getElementById('v81-aurora-bg')) {
    const aurora = document.createElement('div');
    aurora.id = 'v81-aurora-bg';
    aurora.setAttribute('aria-hidden', 'true');
    aurora.innerHTML = '<div class="v81-orb orb-1"></div><div class="v81-orb orb-2"></div><div class="v81-orb orb-3"></div>';
    document.body.prepend(aurora);
  }

  // 2. Interactive pointer spotlight tracking on glass cards & tiles
  let rafId = null;
  let lastX = 0;
  let lastY = 0;

  function updateSpotlight() {
    rafId = null;
    const cards = document.querySelectorAll('.glass-card, .qc-tile, .v6-card, .v72-pdf-row, .v81-item-card');
    for (let i = 0; i < cards.length; i++) {
      const el = cards[i];
      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      el.style.setProperty('--mx', `${lastX - rect.left}px`);
      el.style.setProperty('--my', `${lastY - rect.top}px`);
    }
  }

  window.addEventListener('pointermove', (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
    if (!rafId) rafId = requestAnimationFrame(updateSpotlight);
  }, { passive: true });

  // 3. Staggered entrance animation when switching views
  function animateViewEntrance(section) {
    if (!section) return;
    const targets = section.querySelectorAll('.view-header, .quick-capture-grid, .glass-card, .v6-card, .v81-item-card');
    targets.forEach((el, idx) => {
      el.classList.remove('v81-stagger-in');
      void el.offsetWidth; // force reflow for crisp replay
      el.style.setProperty('--stagger-delay', `${Math.min(idx * 45, 360)}ms`);
      el.classList.add('v81-stagger-in');
    });
  }

  // Observe active class changes on .view-section
  const viewObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        const target = m.target;
        if (target.classList && target.classList.contains('active')) {
          animateViewEntrance(target);
        }
      }
    }
  });

  function attachObservers() {
    document.querySelectorAll('.view-section').forEach((sec) => {
      viewObserver.observe(sec, { attributes: true });
      if (sec.classList.contains('active')) {
        animateViewEntrance(sec);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachObservers);
  } else {
    attachObservers();
  }
})();
