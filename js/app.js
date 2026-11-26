// FLIPNOTE Main Application Controller

import {
  openDB, getAllSettings, setSetting, getAllItems, putItem, deleteItem,
  exportAllData, importAllData, clearAllData
} from './database.js';
import {
  initI18n, setLanguage, getCurrentLanguage, getSuggestedBrowserLanguage,
  t, populateLanguageSelect
} from './i18n.js';
import {
  uid, escapeHtml, renderSimpleMarkdown, formatDate, formatNumber,
  downloadFile, showToast, confirmAction
} from './utils.js';
import {
  extractPdfText, extractImageTextOCR, saveNoteRecord, listNotes, removeNote, generateDeterministicSummary, SAMPLE_NOTE
} from './notes.js';
import {
  generateFlashcards, saveStudySet, listStudySets, removeStudySet
} from './flashcards.js';
import {
  generateQuiz, shuffleArray, saveQuizRecord, recordQuizAttempt, listQuizzes, removeQuiz
} from './quiz.js';
import {
  getDueCards, rateCard, getWeakTopics, logStudySession
} from './revision.js';
import {
  generateInstantShareLink, exportStudyMaterialJson, parseImportedInput, normalizeSharedObject
} from './sharing.js';
import {
  speakText, stopSpeaking, calculateStudyStreak, calculateExamNetScore, formatTimerMMSS, downloadQuizResultCard
} from './v2.js';
import {
  APPLE_THEMES, normalizeTheme, getThemeMetaColor, getThemeDisplayName, getNextTheme,
  isVoiceDictationSupported, createVoiceDictation,
  flashcardsToCsv, parseCsvOrTsvFlashcards, downloadTextFile, openPrintStudySheet
} from './v3.js';
import {
  computeNoteMetrics, parseNoteToMindMapTree, renderMindMapSvg, createFocusAudioEngine
} from './v4.js';
import {
  scoreFeynmanRecall, buildPanicCramDeck, REEL_GRADIENTS
} from './v5.js';
import { logMistakes } from './v6.js';
import { initV6ExamHub, refreshV6ExamHub, updateMistakeBadge } from './v6-ui.js';
import { initV7Superpowers } from './v7-ui.js';
import { initV8BrainHub, refreshV8BrainHub } from './v8-ui.js';
import {
  isSupabaseReady, publishStudySetToSupabase, publishQuizToSupabase,
  fetchPublicStudySets, fetchSharedByShortCode, registerAppUserToSupabase
} from './supabase.js';

const state = {
  settings: {},
  currentView: 'notes',
  editingNoteId: null,
  activeSet: { id: null, title: '', subject: 'General', language: 'en', cards: [] },
  fcIndex: 0,
  fcFlipped: false,
  activeQuiz: { id: null, title: '', subject: 'General', language: 'en', questions: [] },
  quizOrder: [],
  quizIdx: 0,
  quizScore: 0,
  quizMissed: [],
  quizAnswered: false,
  revQueue: [],
  revIndex: 0,
  libraryFilter: 'all',
  shareTarget: null,
  deferredInstallPrompt: null,
  examTimerId: null,
  examSecondsLeft: 0,
  lastQuizSummary: null,
  pomoTimerId: null,
  pomoMode: 'focus',
  pomoSecondsLeft: 25 * 60,
  voiceDictation: null,
  lastNoteSummary: ''
};

async function bootstrap() {
  await openDB();
  state.settings = await getAllSettings();

  // Theme
  const theme = normalizeTheme(state.settings.theme || 'dark');
  applyTheme(theme);
  renderThemePicker();

  // Language & RTL
  await initI18n(state.settings.interfaceLang);

  // Populate all language dropdowns
  const langSelectIds = [
    ['onboarding-lang-select', getCurrentLanguage()],
    ['setting-interface-lang', getCurrentLanguage()],
    ['setting-notes-lang', state.settings.notesInputLang || getCurrentLanguage()],
    ['setting-fc-lang', state.settings.flashcardOutLang || getCurrentLanguage()],
    ['setting-quiz-lang', state.settings.quizOutLang || getCurrentLanguage()],
    ['setting-summary-lang', state.settings.summaryOutLang || getCurrentLanguage()],
    ['setting-translate-lang', state.settings.translationTargetLang || 'en']
  ];
  for (const [id, val] of langSelectIds) {
    populateLanguageSelect(document.getElementById(id), val);
  }

  bindEvents();
  syncSettingsForm();
  updateOnlineStatus();

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch((err) => {
      console.warn('Service worker registration skipped:', err);
    });
  }

  // Handle shared link or route hash
  await handleHashNavigation();

  // Show onboarding on first visit
  if (!state.settings.onboarded && !window.location.hash.startsWith('#share=')) {
    const suggested = getSuggestedBrowserLanguage();
    const sel = document.getElementById('onboarding-lang-select');
    if (sel) sel.value = suggested;
    document.getElementById('onboarding-modal').hidden = false;
  }

  await refreshAllViews();
  initWelcomeGate();
  initV4Features();
  initV5PowerModes();
  initV6ExamHub({
    onOpenRetest: (questions, title) => {
      state.activeQuiz = {
        id: null,
        title: title || 'Mistake Notebook Re-Test',
        subject: 'Mistake Review',
        language: 'en',
        questions
      };
      startQuizRun(questions);
      switchView('quiz');
    },
    onDataImported: async () => {
      await renderSavedNotesList();
      await renderLibrary();
    },
    onLogSession: async (kind, count) => {
      await logStudySession(kind, count);
    }
  });
  initV7Superpowers({
    onOpenExamHubTab: (tab) => {
      switchView('examhub');
      refreshV6ExamHub(tab);
    }
  });
  initV8BrainHub({
    onDataImported: async () => {
      await renderSavedNotesList();
      await renderLibrary();
    },
    getUserName: () => state.settings.userName || 'You'
  });
}

function applyTheme(theme) {
  const safeTheme = normalizeTheme(theme);
  document.documentElement.setAttribute('data-theme', safeTheme);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', getThemeMetaColor(safeTheme));
  const sel = document.getElementById('setting-theme');
  if (sel) sel.value = safeTheme;
  document.querySelectorAll('.theme-swatch-card').forEach((card) => {
    const isActive = card.dataset.themeId === safeTheme;
    card.classList.toggle('active', isActive);
    card.setAttribute('aria-checked', String(isActive));
  });
}

function renderThemePicker() {
  const grid = document.getElementById('theme-picker-grid');
  if (!grid) return;
  const active = normalizeTheme(state.settings.theme || 'dark');
  grid.innerHTML = APPLE_THEMES.map((th) => `
    <button type="button" class="theme-swatch-card ${th.id === active ? 'active' : ''}" data-theme-id="${th.id}" role="radio" aria-checked="${th.id === active}">
      <div class="theme-swatch-preview" style="background:${th.swatchBg};">
        <div class="theme-swatch-dots">
          <span style="background:#ff5f57;"></span>
          <span style="background:#febc2e;"></span>
          <span style="background:#28c840;"></span>
        </div>
        <div class="theme-swatch-bar" style="background:${th.swatchCard};">
          <span class="theme-swatch-pill" style="background:${th.swatchAccent};"></span>
        </div>
      </div>
      <span class="theme-swatch-name">${escapeHtml(th.name)}</span>
    </button>
  `).join('');

  grid.querySelectorAll('.theme-swatch-card').forEach((card) => {
    card.addEventListener('click', async () => {
      const next = card.dataset.themeId;
      applyTheme(next);
      state.settings.theme = next;
      await setSetting('theme', next);
      showToast(`${getThemeDisplayName(next)} theme applied`);
    });
  });
}

function switchView(viewName) {
  state.currentView = viewName;
  document.querySelectorAll('.view-section').forEach((sec) => {
    sec.classList.toggle('active', sec.id === `view-${viewName}`);
  });
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  if (viewName === 'library') renderLibrary();
  if (viewName === 'revision') renderRevision();
  if (viewName === 'progress') renderProgress();
  if (viewName === 'examhub') refreshV6ExamHub();
  if (viewName === 'brain') refreshV8BrainHub();
}

async function refreshAllViews() {
  await renderNotesList();
  renderFlashcardStudio();
  renderQuizView();
  await renderRevision();
  await renderLibrary();
  await renderProgress();
}

function updateOnlineStatus() {
  const banner = document.getElementById('offline-banner');
  if (banner) banner.hidden = navigator.onLine;
}

// ============================================================================
// Event Bindings
// ============================================================================
function bindEvents() {
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  window.addEventListener('hashchange', handleHashNavigation);

  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
    const b = document.getElementById('btn-install-pwa');
    if (b) b.hidden = true;
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredInstallPrompt = e;
    const btn = document.getElementById('btn-install-pwa');
    if (btn) btn.hidden = false;
  });

  document.getElementById('btn-install-pwa')?.addEventListener('click', async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    document.getElementById('btn-install-pwa').hidden = true;
  });

  // Navigation
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  document.getElementById('btn-open-settings')?.addEventListener('click', () => switchView('settings'));
  document.getElementById('btn-fc-go-notes')?.addEventListener('click', () => switchView('notes'));
  document.getElementById('btn-quiz-go-notes')?.addEventListener('click', () => switchView('notes'));

  // Quick Theme Toggle (cycles Apple Theme Studio)
  document.getElementById('btn-theme-toggle')?.addEventListener('click', async () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = getNextTheme(current);
    applyTheme(next);
    state.settings.theme = next;
    await setSetting('theme', next);
    showToast(`${getThemeDisplayName(next)}`);
  });

  // Onboarding
  document.getElementById('onboarding-lang-select')?.addEventListener('change', async (e) => {
    await setLanguage(e.target.value);
    state.settings.interfaceLang = e.target.value;
    await setSetting('interfaceLang', e.target.value);
    const s = document.getElementById('setting-interface-lang');
    if (s) s.value = e.target.value;
  });

  const finishOnboarding = async () => {
    document.getElementById('onboarding-modal').hidden = true;
    state.settings.onboarded = true;
    await setSetting('onboarded', true);
  };
  document.getElementById('btn-onboarding-start')?.addEventListener('click', finishOnboarding);
  document.getElementById('btn-onboarding-skip')?.addEventListener('click', finishOnboarding);

  // Notes View
  document.getElementById('btn-note-edit-mode')?.addEventListener('click', () => toggleNotePreview(false));
  document.getElementById('btn-note-preview-mode')?.addEventListener('click', () => toggleNotePreview(true));
  document.getElementById('btn-load-sample')?.addEventListener('click', () => {
    state.editingNoteId = null;
    document.getElementById('note-title').value = SAMPLE_NOTE.title;
    document.getElementById('note-subject').value = SAMPLE_NOTE.subject;
    document.getElementById('note-content').value = SAMPLE_NOTE.content;
    toggleNotePreview(false);
  });

  document.getElementById('btn-clear-note')?.addEventListener('click', () => {
    state.editingNoteId = null;
    document.getElementById('note-title').value = '';
    document.getElementById('note-subject').value = '';
    document.getElementById('note-content').value = '';
    toggleNotePreview(false);
  });

  document.getElementById('btn-save-note')?.addEventListener('click', handleSaveNote);
  document.getElementById('btn-gen-flashcards')?.addEventListener('click', handleGenerateFlashcardsFromNote);
  document.getElementById('btn-gen-quiz')?.addEventListener('click', handleGenerateQuizFromNote);
  document.getElementById('btn-summarize-note')?.addEventListener('click', handleSummarizeNote);
  document.getElementById('btn-voice-note')?.addEventListener('click', handleToggleVoiceNote);
  document.getElementById('btn-print-note')?.addEventListener('click', handlePrintNote);
  document.getElementById('btn-fc-export-csv')?.addEventListener('click', handleExportFlashcardsCsv);
  document.getElementById('input-fc-import-csv')?.addEventListener('change', handleImportFlashcardsCsv);
  document.getElementById('btn-fc-print')?.addEventListener('click', handlePrintFlashcards);
  document.getElementById('notes-search')?.addEventListener('input', () => renderNotesList());

  document.getElementById('input-pdf-file')?.addEventListener('change', handlePdfUpload);
  document.getElementById('input-ocr-file')?.addEventListener('change', handleOcrUpload);

  // Flashcard Studio
  const fc3d = document.getElementById('flashcard-3d');
  fc3d?.addEventListener('click', flipCurrentCard);
  fc3d?.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      flipCurrentCard();
    }
  });

  document.getElementById('btn-fc-prev')?.addEventListener('click', () => moveCard(-1));
  document.getElementById('btn-fc-next')?.addEventListener('click', () => moveCard(1));
  document.getElementById('btn-fc-shuffle')?.addEventListener('click', () => {
    if (!state.activeSet.cards.length) return;
    state.activeSet.cards = shuffleArray(state.activeSet.cards);
    state.fcIndex = 0;
    state.fcFlipped = false;
    renderFlashcardStudio();
  });
  document.getElementById('btn-fc-add')?.addEventListener('click', () => openCardEditor(null));
  document.getElementById('btn-fc-speak')?.addEventListener('click', () => {
    const card = state.activeSet.cards[state.fcIndex];
    if (!card) return;
    const text = state.fcFlipped ? card.back : card.front;
    const lang = state.activeSet.language || getCurrentLanguage();
    if (!speakText(text, lang)) showToast('Audio speech is not supported on this browser.');
  });
  document.getElementById('btn-rev-speak')?.addEventListener('click', () => {
    const item = state.revQueue[state.revIndex];
    if (!item) return;
    const flipped = document.getElementById('rev-card-3d')?.classList.contains('is-flipped');
    const text = flipped ? item.card.back : item.card.front;
    if (!speakText(text, getCurrentLanguage())) showToast('Audio speech is not supported on this browser.');
  });
  document.getElementById('quiz-exam-mode')?.addEventListener('change', () => {
    if (state.quizOrder.length && state.quizIdx < state.quizOrder.length) {
      setupExamTimer();
    }
  });
  document.getElementById('btn-quiz-download-card')?.addEventListener('click', () => {
    if (!state.lastQuizSummary) return;
    downloadQuizResultCard(state.lastQuizSummary);
    showToast('Quiz result card downloaded!');
  });
  document.getElementById('btn-pomo-start')?.addEventListener('click', startPomodoro);
  document.getElementById('btn-pomo-pause')?.addEventListener('click', pausePomodoro);
  document.getElementById('btn-pomo-reset')?.addEventListener('click', resetPomodoro);
  document.getElementById('btn-pomo-mode')?.addEventListener('click', togglePomodoroMode);
  document.getElementById('btn-fc-edit-card')?.addEventListener('click', () => {
    const card = state.activeSet.cards[state.fcIndex];
    if (card) openCardEditor(card);
  });
  document.getElementById('btn-fc-delete-card')?.addEventListener('click', async () => {
    const card = state.activeSet.cards[state.fcIndex];
    if (!card) return;
    const ok = await confirmAction(t('flashcards.deleteCardConfirm'), t('common.delete'), t('common.cancel'));
    if (!ok) return;
    state.activeSet.cards.splice(state.fcIndex, 1);
    if (state.fcIndex >= state.activeSet.cards.length) {
      state.fcIndex = Math.max(0, state.activeSet.cards.length - 1);
    }
    state.fcFlipped = false;
    renderFlashcardStudio();
    showToast(t('flashcards.cardDeleted'));
  });
  document.getElementById('btn-fc-save')?.addEventListener('click', handleSaveStudySet);
  document.getElementById('btn-fc-share')?.addEventListener('click', () => {
    if (!state.activeSet.cards.length) return;
    state.activeSet.title = document.getElementById('set-title-input').value.trim() || state.activeSet.title || 'Study Set';
    openShareModal('studySet', state.activeSet);
  });

  // Card Edit Modal
  document.getElementById('btn-card-edit-close')?.addEventListener('click', () => {
    document.getElementById('card-edit-modal').hidden = true;
  });
  document.getElementById('btn-card-edit-save')?.addEventListener('click', saveEditedCard);

  // Quiz Engine
  document.getElementById('btn-quiz-next')?.addEventListener('click', advanceQuiz);
  document.getElementById('btn-quiz-randomize')?.addEventListener('click', () => {
    if (!state.activeQuiz.questions.length) return;
    startQuizRun(shuffleArray(state.activeQuiz.questions));
  });
  document.getElementById('btn-quiz-retry-all')?.addEventListener('click', () => {
    startQuizRun(state.activeQuiz.questions);
  });
  document.getElementById('btn-quiz-retry-wrong')?.addEventListener('click', () => {
    if (state.quizMissed.length) startQuizRun(state.quizMissed);
  });
  document.getElementById('btn-quiz-save')?.addEventListener('click', async () => {
    if (!state.activeQuiz.questions.length) return;
    const saved = await saveQuizRecord(state.activeQuiz);
    state.activeQuiz.id = saved.id;
    showToast(t('quiz.quizSaved'));
    renderLibrary();
  });
  document.getElementById('btn-quiz-share')?.addEventListener('click', () => {
    if (!state.activeQuiz.questions.length) return;
    openShareModal('quiz', state.activeQuiz);
  });

  // Revision Engine
  const revCard = document.getElementById('rev-card-3d');
  revCard?.addEventListener('click', () => revCard.classList.toggle('is-flipped'));
  document.querySelectorAll('[data-rate]').forEach((btn) => {
    btn.addEventListener('click', () => handleRateRevisionCard(btn.dataset.rate));
  });
  document.getElementById('btn-rev-practice-all')?.addEventListener('click', () => renderRevision(true));

  // Library
  document.querySelectorAll('#library-filters .segmented-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#library-filters .segmented-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.libraryFilter = btn.dataset.filter;
      renderLibrary();
    });
  });
  document.getElementById('library-search')?.addEventListener('input', () => renderLibrary());
  document.getElementById('btn-refresh-public')?.addEventListener('click', () => renderPublicDiscovery());

  // Import Modal
  document.getElementById('btn-open-import')?.addEventListener('click', () => {
    document.getElementById('import-text-input').value = '';
    document.getElementById('import-modal').hidden = false;
  });
  document.getElementById('btn-import-close')?.addEventListener('click', () => {
    document.getElementById('import-modal').hidden = true;
  });
  document.getElementById('import-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    document.getElementById('import-text-input').value = await file.text();
  });
  document.getElementById('btn-import-submit')?.addEventListener('click', handleImportSubmit);

  // Share Modal
  document.getElementById('btn-share-close')?.addEventListener('click', () => {
    document.getElementById('share-modal').hidden = true;
  });
  document.getElementById('btn-share-copy-link')?.addEventListener('click', handleCopyShareLink);
  document.getElementById('btn-share-download-json')?.addEventListener('click', () => {
    if (!state.shareTarget) return;
    exportStudyMaterialJson(state.shareTarget.kind, state.shareTarget.data);
  });
  document.getElementById('btn-share-publish')?.addEventListener('click', handlePublishPublic);

  // Settings
  document.getElementById('setting-theme')?.addEventListener('change', async (e) => {
    applyTheme(e.target.value);
    state.settings.theme = e.target.value;
    await setSetting('theme', e.target.value);
  });
  document.getElementById('setting-interface-lang')?.addEventListener('change', async (e) => {
    await setLanguage(e.target.value);
    state.settings.interfaceLang = e.target.value;
    await setSetting('interfaceLang', e.target.value);
    await refreshAllViews();
  });
  document.getElementById('btn-save-settings')?.addEventListener('click', handleSaveSettings);
  document.getElementById('btn-export-all')?.addEventListener('click', async () => {
    const data = await exportAllData();
    downloadFile(`flipnote-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
  });
  document.getElementById('input-import-all')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      await importAllData(parsed);
      state.settings = await getAllSettings();
      syncSettingsForm();
      await refreshAllViews();
      showToast(t('library.importSuccess'));
    } catch {
      showToast(t('library.importInvalid'));
    }
    e.target.value = '';
  });
  document.getElementById('btn-delete-all')?.addEventListener('click', async () => {
    const ok = await confirmAction(t('settings.deleteAllConfirm'), t('common.delete'), t('common.cancel'));
    if (!ok) return;
    await clearAllData();
    state.settings = {};
    state.activeSet = { id: null, title: '', subject: 'General', language: 'en', cards: [] };
    state.activeQuiz = { id: null, title: '', subject: 'General', language: 'en', questions: [] };
    await refreshAllViews();
    showToast(t('settings.dataDeleted'));
  });
}

// ============================================================================
// Notes Handlers
// ============================================================================
function toggleNotePreview(showPreview) {
  const textarea = document.getElementById('note-content');
  const preview = document.getElementById('note-preview');
  const btnEdit = document.getElementById('btn-note-edit-mode');
  const btnPrev = document.getElementById('btn-note-preview-mode');

  btnEdit.classList.toggle('active', !showPreview);
  btnPrev.classList.toggle('active', showPreview);
  textarea.hidden = showPreview;
  preview.hidden = !showPreview;
  if (showPreview) {
    preview.innerHTML = renderSimpleMarkdown(textarea.value);
  }
}

async function handlePdfUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const status = document.getElementById('note-status');
  status.textContent = t('notes.pdfExtracting');
  status.hidden = false;
  try {
    const text = await extractPdfText(file);
    const titleEl = document.getElementById('note-title');
    if (!titleEl.value.trim()) titleEl.value = file.name.replace(/\.pdf$/i, '');
    const contentEl = document.getElementById('note-content');
    contentEl.value = (contentEl.value ? contentEl.value + '\n\n' : '') + text;
    showToast(t('common.success'));
  } catch {
    showToast(t('notes.pdfError'));
  } finally {
    status.hidden = true;
    e.target.value = '';
  }
}

async function handleOcrUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const status = document.getElementById('note-status');
  status.textContent = t('notes.ocrExtracting');
  status.hidden = false;
  try {
    const lang = state.settings.notesInputLang || getCurrentLanguage();
    const text = await extractImageTextOCR(file, lang);
    const contentEl = document.getElementById('note-content');
    contentEl.value = (contentEl.value ? contentEl.value + '\n\n' : '') + text;
    showToast(t('common.success'));
  } catch {
    showToast(t('notes.ocrError'));
  } finally {
    status.hidden = true;
    e.target.value = '';
  }
}

function handleSummarizeNote() {
  const content = document.getElementById('note-content').value.trim();
  const box = document.getElementById('note-summary-box');
  if (!content) {
    showToast(t('notes.needContent'));
    return;
  }
  const points = generateDeterministicSummary(content, 5);
  const inLang = state.settings.notesInputLang || getCurrentLanguage();
  const outLang = state.settings.summaryOutLang || inLang;
  const langNotice = (!state.settings.aiEnabled && inLang !== outLang)
    ? `<p class="item-sub" style="margin:8px 0 0; color:var(--warning);">Preserving original language (${escapeHtml(inLang)}). Enable optional AI in Settings for cross-language translation to ${escapeHtml(outLang)}.</p>`
    : '';
  box.innerHTML = `<strong style="display:block; margin-bottom:6px;">Key Points</strong><ul style="margin:0; padding-inline-start:18px;">${points.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>${langNotice}`;
  box.hidden = false;
}

async function handleSaveNote() {
  const content = document.getElementById('note-content').value.trim();
  if (!content) {
    showToast(t('notes.needContent'));
    return null;
  }
  const note = await saveNoteRecord({
    id: state.editingNoteId,
    title: document.getElementById('note-title').value,
    subject: document.getElementById('note-subject').value,
    content,
    language: state.settings.notesInputLang || getCurrentLanguage()
  });
  state.editingNoteId = note.id;
  showToast(t('notes.noteSaved'));
  await renderNotesList();
  return note;
}

async function renderNotesList() {
  const container = document.getElementById('notes-list');
  if (!container) return;
  const query = document.getElementById('notes-search')?.value || '';
  const notes = await listNotes(query);
  const loc = getCurrentLanguage();

  if (!notes.length) {
    container.innerHTML = `<div class="empty-state"><p class="empty-title">${escapeHtml(t('notes.emptyTitle'))}</p><p class="empty-desc">${escapeHtml(t('notes.emptyDesc'))}</p></div>`;
    return;
  }

  container.innerHTML = notes.map((n) => `
    <div class="item-row">
      <div class="item-meta">
        <p class="item-title">${escapeHtml(n.title)}</p>
        <p class="item-sub">${escapeHtml(n.subject || 'General')} · ${escapeHtml(formatDate(n.updatedAt, loc))}</p>
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary btn-sm" data-open-note="${escapeHtml(n.id)}" type="button">${escapeHtml(t('library.open'))}</button>
        <button class="btn btn-danger btn-sm" data-del-note="${escapeHtml(n.id)}" type="button">${escapeHtml(t('common.delete'))}</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-open-note]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const n = notes.find((x) => x.id === btn.dataset.openNote);
      if (!n) return;
      state.editingNoteId = n.id;
      document.getElementById('note-title').value = n.title;
      document.getElementById('note-subject').value = n.subject || '';
      document.getElementById('note-content').value = n.content;
      toggleNotePreview(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  container.querySelectorAll('[data-del-note]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await confirmAction(t('notes.deleteConfirm'), t('common.delete'), t('common.cancel'));
      if (!ok) return;
      await removeNote(btn.dataset.delNote);
      if (state.editingNoteId === btn.dataset.delNote) state.editingNoteId = null;
      await renderNotesList();
      showToast(t('notes.noteDeleted'));
    });
  });
}

// ============================================================================
// Flashcards Handlers
// ============================================================================
async function handleGenerateFlashcardsFromNote() {
  const content = document.getElementById('note-content').value.trim();
  if (!content) {
    showToast(t('notes.needContent'));
    return;
  }
  const title = document.getElementById('note-title').value.trim() || t('common.untitled');
  const subject = document.getElementById('note-subject').value.trim() || 'General';
  const lang = state.settings.flashcardOutLang || getCurrentLanguage();

  const cards = await generateFlashcards({
    text: content,
    count: 12,
    language: lang,
    settings: state.settings
  });

  state.activeSet = {
    id: null,
    title,
    subject,
    language: lang,
    noteId: state.editingNoteId,
    cards
  };
  state.fcIndex = 0;
  state.fcFlipped = false;
  await logStudySession('flashcards', cards.length);
  renderFlashcardStudio();
  switchView('flashcards');
}

function renderFlashcardStudio() {
  const emptyEl = document.getElementById('flashcard-empty');
  const activeEl = document.getElementById('flashcard-active-area');
  const titleInput = document.getElementById('set-title-input');
  const counterEl = document.getElementById('flashcard-counter');

  titleInput.value = state.activeSet.title || '';
  const total = state.activeSet.cards.length;

  if (!total) {
    emptyEl.hidden = false;
    activeEl.hidden = true;
    counterEl.textContent = '0 / 0';
    return;
  }

  emptyEl.hidden = true;
  activeEl.hidden = false;

  if (state.fcIndex >= total) state.fcIndex = 0;
  const card = state.activeSet.cards[state.fcIndex];
  const cardEl = document.getElementById('flashcard-3d');
  cardEl.classList.toggle('is-flipped', state.fcFlipped);

  document.getElementById('flashcard-front-text').textContent = card.front;
  document.getElementById('flashcard-back-text').textContent = card.back;
  counterEl.textContent = t('flashcards.cardOf', {
    current: formatNumber(state.fcIndex + 1, getCurrentLanguage()),
    total: formatNumber(total, getCurrentLanguage())
  });
}

function flipCurrentCard() {
  state.fcFlipped = !state.fcFlipped;
  document.getElementById('flashcard-3d')?.classList.toggle('is-flipped', state.fcFlipped);
}

function moveCard(delta) {
  const total = state.activeSet.cards.length;
  if (!total) return;
  state.fcIndex = (state.fcIndex + delta + total) % total;
  state.fcFlipped = false;
  renderFlashcardStudio();
}

let editingCardRef = null;
function openCardEditor(card) {
  editingCardRef = card;
  document.getElementById('edit-card-front').value = card ? card.front : '';
  document.getElementById('edit-card-back').value = card ? card.back : '';
  document.getElementById('card-edit-modal').hidden = false;
}

function saveEditedCard() {
  const front = document.getElementById('edit-card-front').value.trim();
  const back = document.getElementById('edit-card-back').value.trim();
  if (!front || !back) return;

  if (editingCardRef) {
    editingCardRef.front = front;
    editingCardRef.back = back;
  } else {
    state.activeSet.cards.push({
      id: uid(),
      front,
      back,
      ease: 'new',
      nextReviewAt: Date.now(),
      reviewCount: 0
    });
    state.fcIndex = state.activeSet.cards.length - 1;
  }
  document.getElementById('card-edit-modal').hidden = true;
  renderFlashcardStudio();
  showToast(t('flashcards.cardUpdated'));
}

async function handleSaveStudySet() {
  if (!state.activeSet.cards.length) return;
  state.activeSet.title = document.getElementById('set-title-input').value.trim() || state.activeSet.title || 'Study Set';
  const saved = await saveStudySet(state.activeSet);
  state.activeSet.id = saved.id;
  showToast(t('flashcards.setSaved'));
  await renderLibrary();
}

// ============================================================================
// Quiz Handlers
// ============================================================================
async function handleGenerateQuizFromNote() {
  const content = document.getElementById('note-content').value.trim();
  if (!content) {
    showToast(t('notes.needContent'));
    return;
  }
  const title = document.getElementById('note-title').value.trim() || t('common.untitled');
  const subject = document.getElementById('note-subject').value.trim() || 'General';
  const lang = state.settings.quizOutLang || getCurrentLanguage();

  const questions = await generateQuiz({ text: content, count: 8, language: lang, settings: state.settings });
  if (!questions.length) {
    showToast(t('quiz.noQuestionsGenerated'));
    return;
  }

  state.activeQuiz = { id: null, title, subject, language: lang, questions };
  startQuizRun(questions);
  switchView('quiz');
}

function startQuizRun(questions) {
  state.quizOrder = [...questions];
  state.quizIdx = 0;
  state.quizScore = 0;
  state.quizMissed = [];
  state.quizAnswered = false;
  document.getElementById('quiz-complete').hidden = true;
  setupExamTimer();
  renderQuizView();
}

function renderQuizView() {
  const emptyEl = document.getElementById('quiz-empty');
  const activeEl = document.getElementById('quiz-active');
  const completeEl = document.getElementById('quiz-complete');

  if (!state.quizOrder.length) {
    emptyEl.hidden = false;
    activeEl.hidden = true;
    completeEl.hidden = true;
    return;
  }
  emptyEl.hidden = true;

  if (state.quizIdx >= state.quizOrder.length) {
    activeEl.hidden = true;
    completeEl.hidden = false;
    stopExamTimer();
    const total = state.quizOrder.length;
    const wrong = state.quizMissed.length;
    const examMode = Boolean(document.getElementById('quiz-exam-mode')?.checked);
    const negMarking = Boolean(document.getElementById('quiz-neg-marking')?.checked);
    const netScore = calculateExamNetScore(state.quizScore, wrong, negMarking);
    const pct = Math.round((state.quizScore / total) * 100);
    state.lastQuizSummary = {
      title: state.activeQuiz.title || 'FLIPNOTE Quiz',
      score: state.quizScore,
      total,
      netScore,
      percent: pct,
      examMode: examMode || negMarking
    };
    document.getElementById('quiz-final-score').textContent = negMarking
      ? `${state.quizScore} / ${total} (${pct}%) · Net: ${netScore}`
      : `${state.quizScore} / ${total} (${pct}%)`;
    const retryWrongBtn = document.getElementById('btn-quiz-retry-wrong');
    if (state.quizMissed.length > 0) {
      retryWrongBtn.hidden = false;
      retryWrongBtn.textContent = t('quiz.retryIncorrect', { count: state.quizMissed.length });
    } else {
      retryWrongBtn.hidden = true;
    }
    return;
  }

  activeEl.hidden = false;
  completeEl.hidden = true;
  state.quizAnswered = false;

  const q = state.quizOrder[state.quizIdx];
  document.getElementById('quiz-title-display').textContent = state.activeQuiz.title || t('quiz.title');
  document.getElementById('quiz-progress-pill').textContent = t('quiz.questionOf', {
    current: state.quizIdx + 1,
    total: state.quizOrder.length
  });
  document.getElementById('quiz-question-text').textContent = q.question;
  document.getElementById('quiz-feedback').hidden = true;
  document.getElementById('btn-quiz-next').hidden = true;

  const letters = ['A', 'B', 'C', 'D'];
  const listEl = document.getElementById('quiz-options-list');
  listEl.innerHTML = q.options.map((opt, idx) => `
    <button class="quiz-option" data-opt-idx="${idx}" type="button">
      <span class="quiz-option-letter">${letters[idx] || idx + 1}</span>
      <span>${escapeHtml(opt)}</span>
    </button>
  `).join('');

  listEl.querySelectorAll('.quiz-option').forEach((btn) => {
    btn.addEventListener('click', () => selectQuizOption(Number(btn.dataset.optIdx)));
  });
}

function selectQuizOption(selectedIdx) {
  if (state.quizAnswered) return;
  state.quizAnswered = true;

  const q = state.quizOrder[state.quizIdx];
  const isCorrect = selectedIdx === q.correctIndex;
  if (isCorrect) state.quizScore++;
  else state.quizMissed.push(q);

  document.querySelectorAll('#quiz-options-list .quiz-option').forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === q.correctIndex) btn.classList.add('correct');
    else if (idx === selectedIdx) btn.classList.add('incorrect');
  });

  const feedback = document.getElementById('quiz-feedback');
  const statusEl = document.getElementById('quiz-feedback-status');
  const expEl = document.getElementById('quiz-feedback-explanation');

  statusEl.textContent = isCorrect ? t('quiz.correct') : t('quiz.incorrect');
  statusEl.style.color = isCorrect ? 'var(--success)' : 'var(--danger)';
  expEl.textContent = q.explanation ? `${t('quiz.explanation')}: ${q.explanation}` : '';
  feedback.hidden = false;

  const nextBtn = document.getElementById('btn-quiz-next');
  nextBtn.textContent = state.quizIdx + 1 >= state.quizOrder.length ? t('quiz.finishQuiz') : t('quiz.nextQuestion');
  nextBtn.hidden = false;
}

async function advanceQuiz() {
  state.quizIdx++;
  if (state.quizIdx >= state.quizOrder.length) {
    await recordQuizAttempt({
      quizId: state.activeQuiz.id,
      title: state.activeQuiz.title,
      score: state.quizScore,
      total: state.quizOrder.length,
      missedQuestions: state.quizMissed
    });
    if (state.quizMissed.length) {
      logMistakes(state.quizMissed, {
        subject: state.activeQuiz.subject || 'General',
        source: state.activeQuiz.title || 'Quiz Engine'
      });
      updateMistakeBadge();
    }
    await logStudySession('quiz', state.quizOrder.length);
  }
  renderQuizView();
}

// ============================================================================
// Revision Handlers
// ============================================================================
async function renderRevision(includeAll = false) {
  state.revQueue = await getDueCards(includeAll);
  state.revIndex = 0;
  document.getElementById('rev-due-pill').textContent = `${t('revision.dueNow')}: ${state.revQueue.length}`;

  showCurrentRevisionCard();

  const weak = await getWeakTopics();
  const weakEl = document.getElementById('weak-topics-list');
  if (!weak.length) {
    weakEl.innerHTML = `<p class="item-sub">${escapeHtml(t('revision.noWeakTopics'))}</p>`;
  } else {
    weakEl.innerHTML = weak.map((w) => `
      <div class="item-row">
        <div class="item-meta">
          <p class="item-title">${escapeHtml(w.topic)}</p>
          <p class="item-sub">${escapeHtml(w.source)} · ${escapeHtml(w.detail)}</p>
        </div>
        <span class="pill pill-danger">${escapeHtml(w.reason)}</span>
      </div>
    `).join('');
  }
}

function showCurrentRevisionCard() {
  const emptyEl = document.getElementById('rev-empty');
  const activeEl = document.getElementById('rev-active');
  if (!state.revQueue.length || state.revIndex >= state.revQueue.length) {
    emptyEl.hidden = false;
    activeEl.hidden = true;
    return;
  }
  emptyEl.hidden = true;
  activeEl.hidden = false;
  const item = state.revQueue[state.revIndex];
  document.getElementById('rev-set-label').textContent = `${item.setTitle} · ${state.revIndex + 1} / ${state.revQueue.length}`;
  document.getElementById('rev-card-3d').classList.remove('is-flipped');
  document.getElementById('rev-front-text').textContent = item.card.front;
  document.getElementById('rev-back-text').textContent = item.card.back;
}

async function handleRateRevisionCard(rating) {
  const item = state.revQueue[state.revIndex];
  if (!item) return;
  await rateCard(item.setId, item.card.id, rating);
  await logStudySession('revision', 1);
  showToast(t('revision.rated', { rating: t(`revision.${rating}`) }));
  state.revIndex++;
  showCurrentRevisionCard();
}

// ============================================================================
// Library, Sharing & Public Discovery
// ============================================================================
async function renderLibrary() {
  const container = document.getElementById('library-local-list');
  if (!container) return;

  const q = (document.getElementById('library-search')?.value || '').trim().toLowerCase();
  const [notes, sets, quizzes] = await Promise.all([listNotes(), listStudySets(), listQuizzes()]);

  // Recently Studied section
  const recentCard = document.getElementById('library-recent-card');
  const recentList = document.getElementById('library-recent-list');
  const recentSets = sets.filter((s) => s.lastStudiedAt).sort((a, b) => b.lastStudiedAt - a.lastStudiedAt).slice(0, 3);
  if (recentCard && recentList) {
    if (recentSets.length) {
      recentCard.hidden = false;
      recentList.innerHTML = recentSets.map((s) => `
        <div class="item-row">
          <div class="item-meta">
            <p class="item-title">${escapeHtml(s.title)}</p>
            <p class="item-sub">${s.cards.length} ${escapeHtml(t('common.cards'))} · ${escapeHtml(formatDate(s.lastStudiedAt, getCurrentLanguage()))}</p>
          </div>
          <button class="btn btn-secondary btn-sm" data-recent-set="${escapeHtml(s.id)}" type="button">${escapeHtml(t('library.study'))}</button>
        </div>
      `).join('');
      recentList.querySelectorAll('[data-recent-set]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const found = sets.find((x) => x.id === btn.dataset.recentSet);
          if (!found) return;
          state.activeSet = JSON.parse(JSON.stringify(found));
          state.fcIndex = 0;
          state.fcFlipped = false;
          renderFlashcardStudio();
          switchView('flashcards');
        });
      });
    } else {
      recentCard.hidden = true;
    }
  }

  const items = [];
  if (state.libraryFilter === 'all' || state.libraryFilter === 'notes') {
    notes.forEach((n) => items.push({ kind: 'note', title: n.title, sub: `${n.subject} · Note`, date: n.updatedAt, raw: n }));
  }
  if (state.libraryFilter === 'all' || state.libraryFilter === 'sets') {
    sets.forEach((s) => items.push({ kind: 'studySet', title: s.title, sub: `${s.cards.length} ${t('common.cards')}`, date: s.updatedAt, raw: s }));
  }
  if (state.libraryFilter === 'all' || state.libraryFilter === 'quizzes') {
    quizzes.forEach((qz) => items.push({ kind: 'quiz', title: qz.title, sub: `${qz.questions.length} ${t('common.questions')}`, date: qz.updatedAt, raw: qz }));
  }

  const filtered = items
    .filter((i) => !q || (i.title || '').toLowerCase().includes(q) || (i.sub || '').toLowerCase().includes(q))
    .sort((a, b) => (b.date || 0) - (a.date || 0));

  if (!filtered.length) {
    container.innerHTML = `<p class="item-sub">${escapeHtml(t('notes.emptyTitle'))}</p>`;
  } else {
    container.innerHTML = filtered.map((item, idx) => `
      <div class="item-row">
        <div class="item-meta">
          <p class="item-title">${escapeHtml(item.title)}</p>
          <p class="item-sub">${escapeHtml(item.sub)} · ${escapeHtml(formatDate(item.date, getCurrentLanguage()))}</p>
        </div>
        <div class="btn-row">
          <button class="btn btn-secondary btn-sm" data-lib-open="${idx}" type="button">${escapeHtml(t('library.open'))}</button>
          ${item.kind !== 'note' ? `<button class="btn btn-ghost btn-sm" data-lib-share="${idx}" type="button">${escapeHtml(t('common.share'))}</button>` : ''}
          <button class="btn btn-danger btn-sm" data-lib-del="${idx}" type="button">${escapeHtml(t('common.delete'))}</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('[data-lib-open]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const it = filtered[Number(btn.dataset.libOpen)];
        if (it.kind === 'note') {
          state.editingNoteId = it.raw.id;
          document.getElementById('note-title').value = it.raw.title;
          document.getElementById('note-subject').value = it.raw.subject || '';
          document.getElementById('note-content').value = it.raw.content;
          switchView('notes');
        } else if (it.kind === 'studySet') {
          state.activeSet = JSON.parse(JSON.stringify(it.raw));
          state.fcIndex = 0;
          state.fcFlipped = false;
          renderFlashcardStudio();
          switchView('flashcards');
        } else {
          state.activeQuiz = JSON.parse(JSON.stringify(it.raw));
          startQuizRun(state.activeQuiz.questions);
          switchView('quiz');
        }
      });
    });

    container.querySelectorAll('[data-lib-share]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const it = filtered[Number(btn.dataset.libShare)];
        openShareModal(it.kind, it.raw);
      });
    });

    container.querySelectorAll('[data-lib-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const it = filtered[Number(btn.dataset.libDel)];
        const ok = await confirmAction(t('library.deleteConfirm'), t('common.delete'), t('common.cancel'));
        if (!ok) return;
        if (it.kind === 'note') await removeNote(it.raw.id);
        else if (it.kind === 'studySet') await removeStudySet(it.raw.id);
        else await removeQuiz(it.raw.id);
        await renderLibrary();
      });
    });
  }

  await renderPublicDiscovery();
}

async function renderPublicDiscovery() {
  const container = document.getElementById('library-public-list');
  if (!container) return;
  if (!isSupabaseReady(state.settings)) {
    container.innerHTML = `<p class="item-sub">${escapeHtml(t('library.publicUnconfigured'))}</p>`;
    return;
  }
  const sets = await fetchPublicStudySets(state.settings);
  if (!sets.length) {
    container.innerHTML = `<p class="item-sub">${escapeHtml(t('library.publicEmpty'))}</p>`;
    return;
  }
  container.innerHTML = sets.map((s, idx) => `
    <div class="item-row">
      <div class="item-meta">
        <p class="item-title">${escapeHtml(s.title)}</p>
        <p class="item-sub">${escapeHtml(s.author_alias || 'Learner')} · ${s.card_count || (s.cards || []).length} ${escapeHtml(t('common.cards'))}</p>
      </div>
      <button class="btn btn-secondary btn-sm" data-pub-open="${idx}" type="button">${escapeHtml(t('library.study'))}</button>
    </div>
  `).join('');

  container.querySelectorAll('[data-pub-open]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const raw = sets[Number(btn.dataset.pubOpen)];
      const norm = normalizeSharedObject({ kind: 'studySet', ...raw });
      await putItem('studySets', norm.data);
      state.activeSet = norm.data;
      state.fcIndex = 0;
      state.fcFlipped = false;
      renderFlashcardStudio();
      switchView('flashcards');
    });
  });
}

function openShareModal(kind, data) {
  state.shareTarget = { kind, data };
  const { sizeKB, isTooLarge } = generateInstantShareLink(kind, data);
  const warnEl = document.getElementById('share-size-warning');
  if (isTooLarge) {
    warnEl.textContent = t('sharing.sizeWarning', { size: sizeKB });
    warnEl.hidden = false;
  } else {
    warnEl.hidden = true;
  }
  document.getElementById('share-modal').hidden = false;
}

async function handleCopyShareLink() {
  if (!state.shareTarget) return;
  const { url } = generateInstantShareLink(state.shareTarget.kind, state.shareTarget.data);
  try {
    await navigator.clipboard.writeText(url);
    showToast(t('sharing.linkCopied'));
  } catch {
    prompt(t('sharing.generateLink'), url);
  }
}

async function handlePublishPublic() {
  if (!state.shareTarget) return;
  if (!isSupabaseReady(state.settings)) {
    showToast(t('sharing.supabaseRequired'));
    return;
  }
  const alias = document.getElementById('share-author-alias').value.trim() || 'Learner';
  try {
    const row = state.shareTarget.kind === 'studySet'
      ? await publishStudySetToSupabase(state.settings, state.shareTarget.data, alias)
      : await publishQuizToSupabase(state.settings, state.shareTarget.data, alias);
    showToast(t('sharing.publishedSuccess', { code: row.short_code }));
    await renderPublicDiscovery();
  } catch (err) {
    showToast(err.message);
  }
}

async function handleImportSubmit() {
  const raw = document.getElementById('import-text-input').value;
  try {
    const imported = parseImportedInput(raw);
    if (imported.kind === 'studySet') {
      await putItem('studySets', imported.data);
      state.activeSet = imported.data;
      state.fcIndex = 0;
      state.fcFlipped = false;
      renderFlashcardStudio();
      switchView('flashcards');
    } else {
      await putItem('quizzes', imported.data);
      state.activeQuiz = imported.data;
      startQuizRun(imported.data.questions);
      switchView('quiz');
    }
    document.getElementById('import-modal').hidden = true;
    showToast(t('library.importSuccess'));
  } catch {
    showToast(t('library.importInvalid'));
  }
}

async function handleHashNavigation() {
  const hash = window.location.hash || '';
  if (hash.startsWith('#share=')) {
    try {
      const imported = parseImportedInput(window.location.href);
      if (imported.kind === 'studySet') {
        await putItem('studySets', imported.data);
        state.activeSet = imported.data;
        state.fcIndex = 0;
        renderFlashcardStudio();
        switchView('flashcards');
      } else {
        await putItem('quizzes', imported.data);
        state.activeQuiz = imported.data;
        startQuizRun(imported.data.questions);
        switchView('quiz');
      }
      showToast(t('library.importSuccess'));
    } catch {
      showToast(t('library.importInvalid'));
    }
    return;
  }

  if (hash.startsWith('#code=') && isSupabaseReady(state.settings)) {
    const code = hash.slice(6);
    const res = await fetchSharedByShortCode(state.settings, code);
    if (res) {
      const norm = normalizeSharedObject({ kind: res.kind, ...res.item });
      if (norm.kind === 'studySet') {
        state.activeSet = norm.data;
        renderFlashcardStudio();
        switchView('flashcards');
      } else {
        state.activeQuiz = norm.data;
        startQuizRun(norm.data.questions);
        switchView('quiz');
      }
    }
    return;
  }

  const clean = hash.replace('#', '');
  if (['notes', 'flashcards', 'quiz', 'revision', 'library', 'progress', 'settings'].includes(clean)) {
    switchView(clean);
  }
}

// ============================================================================
// Progress & Settings
// ============================================================================
async function renderProgress() {
  const [sessions, quizHistory, revLogs] = await Promise.all([
    getAllItems('sessions'),
    getAllItems('quizHistory'),
    getAllItems('revisionLogs')
  ]);

  document.getElementById('stat-sessions').textContent = formatNumber(sessions.length, getCurrentLanguage());
  document.getElementById('stat-quizzes').textContent = formatNumber(quizHistory.length, getCurrentLanguage());
  document.getElementById('stat-cards-reviewed').textContent = formatNumber(revLogs.length, getCurrentLanguage());
  const streak = calculateStudyStreak(sessions, revLogs);
  const streakEl = document.getElementById('stat-streak-pill');
  if (streakEl) streakEl.textContent = `🔥 ${formatNumber(streak, getCurrentLanguage())} Day Streak`;

  const avg = quizHistory.length
    ? Math.round(quizHistory.reduce((acc, q) => acc + (q.percent || 0), 0) / quizHistory.length)
    : 0;
  document.getElementById('stat-avg-score').textContent = `${avg}%`;

  // 7-day chart
  const chartEl = document.getElementById('activity-chart');
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const label = d.toLocaleDateString(getCurrentLanguage(), { weekday: 'short' });
    const count = sessions.filter((s) => s.day === key).length + revLogs.filter((r) => r.day === key).length;
    days.push({ label, count });
  }
  const maxVal = Math.max(1, ...days.map((d) => d.count));
  chartEl.innerHTML = days.map((d) => {
    const h = Math.max(8, Math.round((d.count / maxVal) * 96));
    return `<div class="chart-col"><div class="chart-bar" style="height:${h}px" title="${d.count}"></div><span class="chart-day">${escapeHtml(d.label)}</span></div>`;
  }).join('');

  // Recent quizzes
  const recentEl = document.getElementById('recent-quizzes-list');
  if (!quizHistory.length) {
    recentEl.innerHTML = `<p class="item-sub">${escapeHtml(t('progress.noActivity'))}</p>`;
  } else {
    recentEl.innerHTML = quizHistory.slice(0, 8).map((q) => `
      <div class="item-row">
        <div class="item-meta">
          <p class="item-title">${escapeHtml(q.title)}</p>
          <p class="item-sub">${escapeHtml(formatDate(q.createdAt, getCurrentLanguage()))}</p>
        </div>
        <span class="pill ${q.percent >= 70 ? 'pill-success' : 'pill-warning'}">${q.score}/${q.total} (${q.percent}%)</span>
      </div>
    `).join('');
  }
}

function syncSettingsForm() {
  const s = state.settings;
  const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
  setVal('setting-theme', s.theme || 'dark');
  setVal('setting-interface-lang', getCurrentLanguage());
  setVal('setting-notes-lang', s.notesInputLang || getCurrentLanguage());
  setVal('setting-fc-lang', s.flashcardOutLang || getCurrentLanguage());
  setVal('setting-quiz-lang', s.quizOutLang || getCurrentLanguage());
  setVal('setting-summary-lang', s.summaryOutLang || getCurrentLanguage());
  setVal('setting-translate-lang', s.translationTargetLang || 'en');
  const aiCb = document.getElementById('setting-ai-enabled');
  if (aiCb) aiCb.checked = Boolean(s.aiEnabled);
  setVal('setting-ai-provider', s.aiProvider || 'openai-compatible');
  setVal('setting-ai-model', s.aiModel || '');
  setVal('setting-ai-key', s.aiApiKey || '');
  setVal('setting-sb-url', s.supabaseUrl || '');
  setVal('setting-sb-key', s.supabaseAnonKey || '');
}

async function handleSaveSettings() {
  const pairs = [
    ['notesInputLang', document.getElementById('setting-notes-lang').value],
    ['flashcardOutLang', document.getElementById('setting-fc-lang').value],
    ['quizOutLang', document.getElementById('setting-quiz-lang').value],
    ['summaryOutLang', document.getElementById('setting-summary-lang').value],
    ['translationTargetLang', document.getElementById('setting-translate-lang').value],
    ['aiEnabled', document.getElementById('setting-ai-enabled').checked],
    ['aiProvider', document.getElementById('setting-ai-provider').value],
    ['aiModel', document.getElementById('setting-ai-model').value.trim()],
    ['aiApiKey', document.getElementById('setting-ai-key').value.trim()],
    ['supabaseUrl', document.getElementById('setting-sb-url').value.trim()],
    ['supabaseAnonKey', document.getElementById('setting-sb-key').value.trim()]
  ];
  for (const [k, v] of pairs) {
    state.settings[k] = v;
    await setSetting(k, v);
  }
  showToast(t('settings.settingsSaved'));
  await renderPublicDiscovery();
}

bootstrap();

// ============================================================================
// v2 Helpers: Exam Timer & Pomodoro
// ============================================================================
function stopExamTimer() {
  if (state.examTimerId) {
    clearInterval(state.examTimerId);
    state.examTimerId = null;
  }
  const pill = document.getElementById('quiz-timer-pill');
  if (pill) pill.hidden = true;
}

function setupExamTimer() {
  stopExamTimer();
  const enabled = Boolean(document.getElementById('quiz-exam-mode')?.checked);
  if (!enabled || !state.quizOrder.length) return;
  const pill = document.getElementById('quiz-timer-pill');
  state.examSecondsLeft = state.quizOrder.length * 60;
  if (pill) {
    pill.textContent = formatTimerMMSS(state.examSecondsLeft);
    pill.hidden = false;
  }
  state.examTimerId = setInterval(() => {
    state.examSecondsLeft--;
    if (pill) pill.textContent = formatTimerMMSS(state.examSecondsLeft);
    if (state.examSecondsLeft <= 0) {
      stopExamTimer();
      state.quizIdx = state.quizOrder.length;
      renderQuizView();
      showToast('Exam time is up!');
    }
  }, 1000);
}

function renderPomodoro() {
  const disp = document.getElementById('pomodoro-display');
  const label = document.getElementById('pomodoro-mode-label');
  if (disp) disp.textContent = formatTimerMMSS(state.pomoSecondsLeft);
  if (label) label.textContent = state.pomoMode === 'focus' ? 'Focus (25m)' : 'Break (5m)';
}

function startPomodoro() {
  if (state.pomoTimerId) return;
  renderPomodoro();
  state.pomoTimerId = setInterval(async () => {
    state.pomoSecondsLeft--;
    renderPomodoro();
    if (state.pomoSecondsLeft <= 0) {
      pausePomodoro();
      if (state.pomoMode === 'focus') {
        await logStudySession('pomodoro', 1);
        showToast('Focus session complete! Take a 5-minute break.');
        state.pomoMode = 'break';
        state.pomoSecondsLeft = 5 * 60;
      } else {
        showToast('Break finished! Ready for the next focus session.');
        state.pomoMode = 'focus';
        state.pomoSecondsLeft = 25 * 60;
      }
      renderPomodoro();
      renderProgress();
    }
  }, 1000);
}

function pausePomodoro() {
  if (state.pomoTimerId) {
    clearInterval(state.pomoTimerId);
    state.pomoTimerId = null;
  }
}

function resetPomodoro() {
  pausePomodoro();
  state.pomoSecondsLeft = state.pomoMode === 'focus' ? 25 * 60 : 5 * 60;
  renderPomodoro();
}

function togglePomodoroMode() {
  pausePomodoro();
  state.pomoMode = state.pomoMode === 'focus' ? 'break' : 'focus';
  state.pomoSecondsLeft = state.pomoMode === 'focus' ? 25 * 60 : 5 * 60;
  renderPomodoro();
}


// ==========================================================================
// FLIPNOTE v3.0 Handlers: Voice-to-Notes, Anki/CSV Export-Import, Print/PDF
// ==========================================================================

function handleToggleVoiceNote() {
  const btn = document.getElementById('btn-voice-note');
  const statusEl = document.getElementById('note-status');
  const textarea = document.getElementById('note-content');

  if (!isVoiceDictationSupported()) {
    showToast('Voice dictation works best in Chrome, Edge, or Safari.');
    return;
  }

  if (state.voiceDictation && state.voiceDictation.isActive()) {
    state.voiceDictation.stop();
    return;
  }

  const lang = state.settings.notesInputLang || getCurrentLanguage();
  state.voiceDictation = createVoiceDictation({
    lang,
    onStatusChange: (isRecording) => {
      if (btn) {
        btn.classList.toggle('btn-recording', isRecording);
        btn.textContent = isRecording ? t('notes.voiceStop') : t('notes.voiceNote');
      }
      if (statusEl) {
        if (isRecording) {
          statusEl.hidden = false;
          statusEl.textContent = t('notes.voiceListening');
        } else {
          statusEl.hidden = true;
          statusEl.textContent = '';
        }
      }
    },
    onInterimText: (interim) => {
      if (statusEl && interim) {
        statusEl.hidden = false;
        statusEl.textContent = `${t('notes.voiceListening')} ${interim}`;
      }
    },
    onFinalText: (finalText) => {
      if (!textarea || !finalText) return;
      const prefix = textarea.value && !/\s$/.test(textarea.value) ? ' ' : '';
      textarea.value = `${textarea.value}${prefix}${finalText}`;
      textarea.dispatchEvent(new Event('input'));
    },
    onError: (err) => {
      if (err === 'not-allowed') {
        showToast('Microphone permission denied. Allow mic access to use Voice Note.');
      } else if (err !== 'no-speech') {
        showToast(`Voice dictation stopped (${err}).`);
      }
    }
  });

  try {
    state.voiceDictation.start(lang);
  } catch {
    showToast('Could not start microphone dictation.');
  }
}

function handlePrintNote() {
  const title = document.getElementById('note-title')?.value.trim() || 'FLIPNOTE Study Notes';
  const subject = document.getElementById('note-subject')?.value.trim() || '';
  const content = document.getElementById('note-content')?.value.trim() || '';
  if (!content) {
    showToast(t('notes.emptyWarning'));
    return;
  }
  const summaryBox = document.getElementById('note-summary-box');
  const summary = summaryBox && !summaryBox.hidden ? summaryBox.textContent.trim() : '';
  openPrintStudySheet({ mode: 'note', title, subject, content, summary });
}

function handleExportFlashcardsCsv() {
  const cards = state.activeSet?.cards || [];
  if (!cards.length) {
    showToast(t('flashcards.emptyTitle'));
    return;
  }
  const safeName = (state.activeSet.title || 'flipnote-flashcards')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '') || 'flipnote-flashcards';
  const csv = flashcardsToCsv(cards, { includeHeader: true });
  downloadTextFile(`${safeName}-anki.csv`, csv, 'text/csv;charset=utf-8');
  showToast(t('flashcards.csvExported'));
}

async function handleImportFlashcardsCsv(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    const imported = parseCsvOrTsvFlashcards(text);
    if (!imported.length) {
      showToast(t('flashcards.csvImportEmpty'));
      return;
    }
    const baseName = file.name.replace(/\.(csv|tsv|txt)$/i, '').replace(/[-_]+/g, ' ').trim();
    if (!state.activeSet.cards.length) {
      state.activeSet.title = state.activeSet.title || baseName || 'Imported Deck';
      const titleInput = document.getElementById('set-title-input');
      if (titleInput && !titleInput.value.trim()) titleInput.value = state.activeSet.title;
    }
    state.activeSet.cards.push(...imported);
    state.fcIndex = Math.max(0, state.activeSet.cards.length - imported.length);
    state.fcFlipped = false;
    renderFlashcardStudio();
    showToast(`${imported.length} ${t('flashcards.csvImported')}`);
  } catch {
    showToast(t('flashcards.csvImportEmpty'));
  }
}

function handlePrintFlashcards() {
  const cards = state.activeSet?.cards || [];
  if (!cards.length) {
    showToast(t('flashcards.emptyTitle'));
    return;
  }
  const title = document.getElementById('set-title-input')?.value.trim() || state.activeSet.title || 'FLIPNOTE Flashcards';
  openPrintStudySheet({ mode: 'flashcards', title, cards });
}


// ==========================================================================
// FLIPNOTE v3.1 — Apple Welcome Sign-In Gate (Name + Email -> Supabase)
// ==========================================================================

const USER_PROFILE_STORAGE_KEY = 'flipnote_user_profile_v1';

function getStoredUserProfile() {
  try {
    const raw = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.fullName && parsed.email) return parsed;
  } catch {}
  return null;
}

function saveStoredUserProfile(profile) {
  try {
    localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {}
}

function isValidEmailAddress(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

async function syncPendingUserProfile(profile) {
  if (!profile || profile.synced) return;
  try {
    await registerAppUserToSupabase(state.settings, {
      fullName: profile.fullName,
      email: profile.email,
      language: getCurrentLanguage()
    });
    profile.synced = true;
    saveStoredUserProfile(profile);
  } catch {
    // Keep profile locally; will retry automatically when online
  }
}

function updateAccountSummaryUI(profile) {
  const el = document.getElementById('settings-account-summary');
  if (!el) return;
  if (profile) {
    el.textContent = `${profile.fullName} (${profile.email})`;
  } else {
    el.textContent = t('auth.notSignedIn');
  }
}

function initWelcomeGate() {
  const modal = document.getElementById('welcome-gate-modal');
  const form = document.getElementById('welcome-gate-form');
  const nameInput = document.getElementById('auth-full-name');
  const emailInput = document.getElementById('auth-email');
  const errorEl = document.getElementById('welcome-gate-error');
  const submitBtn = document.getElementById('btn-auth-continue');
  const switchBtn = document.getElementById('btn-switch-account');

  const existing = getStoredUserProfile();
  updateAccountSummaryUI(existing);

  if (!existing && modal) {
    modal.hidden = false;
    setTimeout(() => nameInput?.focus(), 60);
  } else if (existing && !existing.synced) {
    syncPendingUserProfile(existing);
  }

  window.addEventListener('online', () => {
    const current = getStoredUserProfile();
    if (current && !current.synced) syncPendingUserProfile(current);
  });

  switchBtn?.addEventListener('click', () => {
    const current = getStoredUserProfile();
    if (nameInput) nameInput.value = current?.fullName || '';
    if (emailInput) emailInput.value = current?.email || '';
    if (errorEl) errorEl.hidden = true;
    if (modal) modal.hidden = false;
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = (nameInput?.value || '').trim();
    const email = (emailInput?.value || '').trim().toLowerCase();

    if (fullName.length < 2) {
      if (errorEl) {
        errorEl.textContent = t('auth.invalidName');
        errorEl.hidden = false;
      }
      nameInput?.focus();
      return;
    }
    if (!isValidEmailAddress(email)) {
      if (errorEl) {
        errorEl.textContent = t('auth.invalidEmail');
        errorEl.hidden = false;
      }
      emailInput?.focus();
      return;
    }

    if (errorEl) errorEl.hidden = true;
    if (submitBtn) submitBtn.disabled = true;

    const profile = {
      fullName,
      email,
      signedInAt: new Date().toISOString(),
      synced: false
    };
    saveStoredUserProfile(profile);
    updateAccountSummaryUI(profile);

    await syncPendingUserProfile(profile);

    if (submitBtn) submitBtn.disabled = false;
    if (modal) modal.hidden = true;
    showToast(`${t('auth.welcomeToast')} ${fullName}!`);
  });
}


// ==========================================================================
// FLIPNOTE v4.0 — Live Word Counter, Auto Mind Map & Offline Focus Sounds
// ==========================================================================

let focusAudioEngine = null;
let lastMindMapSvg = '';

function updateLiveWordBadge() {
  const textarea = document.getElementById('note-content');
  const badge = document.getElementById('note-word-badge');
  if (!textarea || !badge) return;
  badge.textContent = computeNoteMetrics(textarea.value).label;
}

function initV4Features() {
  focusAudioEngine = createFocusAudioEngine();

  // Live word count & reading time
  const noteArea = document.getElementById('note-content');
  noteArea?.addEventListener('input', updateLiveWordBadge);
  document.getElementById('btn-load-sample')?.addEventListener('click', () => setTimeout(updateLiveWordBadge, 20));
  document.getElementById('btn-clear-note')?.addEventListener('click', () => setTimeout(updateLiveWordBadge, 20));
  updateLiveWordBadge();

  // Streak pill jumps straight to Progress view
  document.getElementById('header-streak-pill')?.addEventListener('click', () => switchView('progress'));

  // Auto Mind Map modal
  const mmModal = document.getElementById('mindmap-modal');
  const mmStage = document.getElementById('mindmap-stage');
  document.getElementById('btn-mind-map')?.addEventListener('click', () => {
    const title = document.getElementById('note-title')?.value.trim() || 'Study Mind Map';
    const content = document.getElementById('note-content')?.value.trim() || '';
    if (!content) {
      showToast(t('notes.emptyWarning'));
      return;
    }
    const tree = parseNoteToMindMapTree(title, content);
    lastMindMapSvg = renderMindMapSvg(tree);
    if (mmStage) mmStage.innerHTML = lastMindMapSvg;
    if (mmModal) mmModal.hidden = false;
  });
  document.getElementById('btn-mindmap-close')?.addEventListener('click', () => {
    if (mmModal) mmModal.hidden = true;
  });
  document.getElementById('btn-mindmap-download')?.addEventListener('click', () => {
    if (!lastMindMapSvg) return;
    downloadTextFile('flipnote-mindmap.svg', lastMindMapSvg, 'image/svg+xml;charset=utf-8');
    showToast('Mind Map SVG downloaded!');
  });

  // Offline Focus Sounds modal
  const faModal = document.getElementById('focus-audio-modal');
  const faTile = document.getElementById('btn-focus-sounds');
  const volInput = document.getElementById('focus-volume');
  const volLabel = document.getElementById('focus-volume-label');

  const syncSoundButtons = () => {
    const active = focusAudioEngine?.getMode();
    faTile?.classList.toggle('active-sound', Boolean(active));
    document.querySelectorAll('.focus-sound-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.sound === active);
    });
  };

  faTile?.addEventListener('click', () => {
    if (faModal) faModal.hidden = false;
    syncSoundButtons();
  });
  document.getElementById('btn-focus-close')?.addEventListener('click', () => {
    if (faModal) faModal.hidden = true;
  });
  document.querySelectorAll('.focus-sound-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = focusAudioEngine?.play(btn.dataset.sound);
      syncSoundButtons();
      showToast(mode ? `Focus audio playing (${mode})` : 'Focus audio paused');
    });
  });
  document.getElementById('btn-focus-stop')?.addEventListener('click', () => {
    focusAudioEngine?.stop();
    syncSoundButtons();
    showToast('Focus audio stopped');
  });
  volInput?.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    if (volLabel) volLabel.textContent = `${val}%`;
    focusAudioEngine?.setVolume(val / 100);
  });
}


// ==========================================================================
// FLIPNOTE v5.0 — Study Reels, Feynman Recall, Walk & Revise, Exam Panic
// ==========================================================================

async function collectAvailableFlashcards() {
  if (state.activeSet?.cards?.length) return state.activeSet.cards;
  const sets = await listStudySets();
  const merged = [];
  for (const s of sets) {
    if (Array.isArray(s.cards)) merged.push(...s.cards);
  }
  if (merged.length) return merged;
  const noteText = document.getElementById('note-content')?.value.trim();
  if (noteText) {
    return generateFlashcards(noteText, getCurrentLanguage());
  }
  return [];
}

function initV5PowerModes() {
  // --- 1. Study Reels (Vertical Swipe Feed) ---
  const reelsModal = document.getElementById('study-reels-modal');
  const reelsFeed = document.getElementById('reels-feed');
  const reelsCounter = document.getElementById('reels-counter');

  document.getElementById('btn-study-reels')?.addEventListener('click', async () => {
    const cards = await collectAvailableFlashcards();
    if (!cards.length) {
      showToast('Generate or load flashcards first to open Study Reels.');
      return;
    }
    if (reelsCounter) reelsCounter.textContent = `1 / ${cards.length}`;
    if (reelsFeed) {
      reelsFeed.innerHTML = cards.map((c, idx) => `
        <section class="reel-slide" style="background:${REEL_GRADIENTS[idx % REEL_GRADIENTS.length]};" data-idx="${idx}">
          <div class="reel-card-glass" data-reel-card="${idx}">
            <p class="reel-q">${escapeHtml(c.front)}</p>
            <p class="reel-a" hidden>${escapeHtml(c.back)}</p>
            <div class="reel-hint">Tap card to reveal answer • Swipe up for next</div>
          </div>
          <div class="reel-rail">
            <button type="button" class="reel-action-btn" data-reel-like="${idx}" aria-label="Mastered">❤️</button>
            <button type="button" class="reel-action-btn" data-reel-speak="${idx}" aria-label="Speak">🔊</button>
          </div>
        </section>
      `).join('');

      reelsFeed.querySelectorAll('[data-reel-card]').forEach((box) => {
        box.addEventListener('click', () => {
          const ans = box.querySelector('.reel-a');
          const hint = box.querySelector('.reel-hint');
          if (ans) ans.hidden = !ans.hidden;
          if (hint) hint.textContent = ans?.hidden ? 'Tap card to reveal answer • Swipe up for next' : 'Swipe up for next card ↑';
        });
      });
      reelsFeed.querySelectorAll('[data-reel-like]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          btn.classList.toggle('liked');
          showToast(btn.classList.contains('liked') ? 'Marked as mastered!' : 'Unmarked');
        });
      });
      reelsFeed.querySelectorAll('[data-reel-speak]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const c = cards[Number(btn.dataset.reelSpeak)];
          if (c) speakText(`${c.front}. ${c.back}`, getCurrentLanguage());
        });
      });
      reelsFeed.onscroll = () => {
        const idx = Math.min(cards.length, Math.max(1, Math.round(reelsFeed.scrollTop / window.innerHeight) + 1));
        if (reelsCounter) reelsCounter.textContent = `${idx} / ${cards.length}`;
      };
      reelsFeed.scrollTop = 0;
    }
    if (reelsModal) reelsModal.hidden = false;
  });

  document.getElementById('btn-reels-close')?.addEventListener('click', () => {
    stopSpeaking();
    if (reelsModal) reelsModal.hidden = true;
  });

  // --- 2. Teach It Back (Feynman Voice Recall) ---
  const feynModal = document.getElementById('feynman-modal');
  const feynQ = document.getElementById('feynman-question');
  const feynInput = document.getElementById('feynman-input');
  const feynResult = document.getElementById('feynman-result');
  const feynMicBtn = document.getElementById('btn-feynman-mic');
  let feynCards = [];
  let feynIdx = 0;
  let feynDictation = null;

  const renderFeynmanCard = () => {
    const c = feynCards[feynIdx];
    if (!c) return;
    if (feynQ) feynQ.textContent = c.front;
    if (feynInput) feynInput.value = '';
    if (feynResult) feynResult.hidden = true;
  };

  document.getElementById('btn-feynman-mode')?.addEventListener('click', async () => {
    feynCards = await collectAvailableFlashcards();
    if (!feynCards.length) {
      showToast('Generate or load flashcards first to use Teach It Back.');
      return;
    }
    feynIdx = 0;
    renderFeynmanCard();
    if (feynModal) feynModal.hidden = false;
  });

  document.getElementById('btn-feynman-next')?.addEventListener('click', () => {
    if (!feynCards.length) return;
    feynIdx = (feynIdx + 1) % feynCards.length;
    renderFeynmanCard();
  });

  feynMicBtn?.addEventListener('click', () => {
    if (!isVoiceDictationSupported()) {
      showToast('Mic dictation works in Chrome, Edge, or Safari — you can type your answer below.');
      return;
    }
    if (feynDictation && feynDictation.isActive()) {
      feynDictation.stop();
      return;
    }
    feynDictation = createVoiceDictation({
      lang: state.settings.notesInputLang || getCurrentLanguage(),
      onStatusChange: (rec) => {
        feynMicBtn.classList.toggle('btn-recording', rec);
        feynMicBtn.textContent = rec ? '⏹ Stop Speaking' : '🎙️ Speak Explanation';
      },
      onFinalText: (txt) => {
        if (!feynInput || !txt) return;
        feynInput.value = `${feynInput.value}${feynInput.value ? ' ' : ''}${txt}`;
      }
    });
    feynDictation?.start();
  });

  document.getElementById('btn-feynman-check')?.addEventListener('click', () => {
    const c = feynCards[feynIdx];
    if (!c || !feynInput || !feynResult) return;
    const res = scoreFeynmanRecall(feynInput.value, c.back);
    const hitHtml = res.matched.map((w) => `<span class="kw-chip kw-hit">✓ ${escapeHtml(w)}</span>`).join('');
    const missHtml = res.missed.map((w) => `<span class="kw-chip kw-miss">• ${escapeHtml(w)}</span>`).join('');
    feynResult.innerHTML = `
      <div style="font-size:1.15rem; font-weight:800; margin-bottom:6px;">Recall Score: ${res.score}%</div>
      <p style="margin:0 0 10px; color:var(--text-secondary);">${escapeHtml(res.verdict)}</p>
      ${hitHtml ? `<div style="margin-bottom:6px;">${hitHtml}</div>` : ''}
      ${missHtml ? `<div><strong>Missed concepts:</strong><br>${missHtml}</div>` : ''}
      <p style="margin:10px 0 0; font-size:0.86rem; color:var(--text-muted);"><strong>Reference:</strong> ${escapeHtml(c.back)}</p>
    `;
    feynResult.hidden = false;
  });

  document.getElementById('btn-feynman-close')?.addEventListener('click', () => {
    if (feynDictation && feynDictation.isActive()) feynDictation.stop();
    if (feynModal) feynModal.hidden = true;
  });

  // --- 3. Walk & Revise (Hands-Free Audio Podcast Loop) ---
  const walkModal = document.getElementById('walk-revise-modal');
  const walkPhase = document.getElementById('walk-phase-pill');
  const walkText = document.getElementById('walk-card-text');
  const walkProg = document.getElementById('walk-progress');
  let walkCards = [];
  let walkIdx = 0;
  let walkRunning = false;
  let walkTimer = null;

  const stopWalkLoop = () => {
    walkRunning = false;
    if (walkTimer) clearTimeout(walkTimer);
    walkTimer = null;
    stopSpeaking();
    if (walkPhase) walkPhase.textContent = 'Paused • Hands-Free Audio';
  };

  const runWalkStep = () => {
    if (!walkRunning || !walkCards.length) return;
    const c = walkCards[walkIdx];
    const lang = getCurrentLanguage();
    if (walkProg) walkProg.textContent = `Card ${walkIdx + 1} / ${walkCards.length}`;
    if (walkPhase) walkPhase.textContent = '🎙️ Question...';
    if (walkText) walkText.textContent = c.front;

    speakText(c.front, lang);
    walkTimer = setTimeout(() => {
      if (!walkRunning) return;
      if (walkPhase) walkPhase.textContent = '⏳ Think (4s)...';
      walkTimer = setTimeout(() => {
        if (!walkRunning) return;
        if (walkPhase) walkPhase.textContent = '💡 Answer...';
        if (walkText) walkText.textContent = c.back;
        speakText(c.back, lang);
        walkTimer = setTimeout(() => {
          if (!walkRunning) return;
          walkIdx = (walkIdx + 1) % walkCards.length;
          runWalkStep();
        }, 4200);
      }, 4000);
    }, 3200);
  };

  document.getElementById('btn-walk-revise')?.addEventListener('click', async () => {
    walkCards = await collectAvailableFlashcards();
    if (!walkCards.length) {
      showToast('Generate or load flashcards first to use Walk & Revise.');
      return;
    }
    walkIdx = 0;
    if (walkProg) walkProg.textContent = `Card 1 / ${walkCards.length}`;
    if (walkText) walkText.textContent = walkCards[0].front;
    if (walkModal) walkModal.hidden = false;
  });

  document.getElementById('btn-walk-play')?.addEventListener('click', () => {
    if (!walkCards.length) return;
    stopWalkLoop();
    walkRunning = true;
    runWalkStep();
  });

  document.getElementById('btn-walk-skip')?.addEventListener('click', () => {
    if (!walkCards.length) return;
    const wasRunning = walkRunning;
    stopWalkLoop();
    walkIdx = (walkIdx + 1) % walkCards.length;
    if (walkProg) walkProg.textContent = `Card ${walkIdx + 1} / ${walkCards.length}`;
    if (walkText) walkText.textContent = walkCards[walkIdx].front;
    if (wasRunning) {
      walkRunning = true;
      runWalkStep();
    }
  });

  document.getElementById('btn-walk-stop')?.addEventListener('click', stopWalkLoop);
  document.getElementById('btn-walk-close')?.addEventListener('click', () => {
    stopWalkLoop();
    if (walkModal) walkModal.hidden = true;
  });

  // --- 4. Exam Panic Mode (Last-Night 10-Min Crammer) ---
  const panicModal = document.getElementById('exam-panic-modal');
  const panicTimerEl = document.getElementById('panic-timer');
  const panicCounterEl = document.getElementById('panic-counter');
  const panicFrontEl = document.getElementById('panic-front');
  const panicBackEl = document.getElementById('panic-back');
  const btnPanicReveal = document.getElementById('btn-panic-reveal');
  const btnPanicAgain = document.getElementById('btn-panic-again');
  const btnPanicGotIt = document.getElementById('btn-panic-gotit');

  let panicQueue = [];
  let panicMastered = 0;
  let panicSec = 600;
  let panicInterval = null;

  const stopPanicTimer = () => {
    if (panicInterval) clearInterval(panicInterval);
    panicInterval = null;
  };

  const renderPanicCard = () => {
    if (!panicQueue.length) {
      stopPanicTimer();
      if (panicCounterEl) panicCounterEl.textContent = `Session Complete • ${panicMastered} cards crammed!`;
      if (panicFrontEl) panicFrontEl.textContent = '🎉 You cleared your 10-Minute Panic Deck!';
      if (panicBackEl) panicBackEl.hidden = true;
      if (btnPanicReveal) btnPanicReveal.hidden = true;
      if (btnPanicAgain) btnPanicAgain.hidden = true;
      if (btnPanicGotIt) btnPanicGotIt.hidden = true;
      return;
    }
    const c = panicQueue[0];
    if (panicCounterEl) panicCounterEl.textContent = `Remaining: ${panicQueue.length} • Mastered: ${panicMastered}`;
    if (panicFrontEl) panicFrontEl.textContent = c.front;
    if (panicBackEl) {
      panicBackEl.textContent = c.back;
      panicBackEl.hidden = true;
    }
    if (btnPanicReveal) btnPanicReveal.hidden = false;
    if (btnPanicAgain) btnPanicAgain.hidden = true;
    if (btnPanicGotIt) btnPanicGotIt.hidden = true;
  };

  document.getElementById('btn-exam-panic')?.addEventListener('click', async () => {
    const allCards = await collectAvailableFlashcards();
    panicQueue = buildPanicCramDeck(allCards, 20);
    if (!panicQueue.length) {
      showToast('Add some notes or flashcards first to start Exam Panic Mode.');
      return;
    }
    panicMastered = 0;
    panicSec = 600;
    if (panicTimerEl) panicTimerEl.textContent = formatTimerMMSS(panicSec);
    stopPanicTimer();
    panicInterval = setInterval(() => {
      panicSec = Math.max(0, panicSec - 1);
      if (panicTimerEl) panicTimerEl.textContent = formatTimerMMSS(panicSec);
      if (panicSec === 0) {
        stopPanicTimer();
        showToast('10-Minute Panic Sprint finished!');
      }
    }, 1000);
    renderPanicCard();
    if (panicModal) panicModal.hidden = false;
  });

  btnPanicReveal?.addEventListener('click', () => {
    if (panicBackEl) panicBackEl.hidden = false;
    if (btnPanicReveal) btnPanicReveal.hidden = true;
    if (btnPanicAgain) btnPanicAgain.hidden = false;
    if (btnPanicGotIt) btnPanicGotIt.hidden = false;
  });

  btnPanicAgain?.addEventListener('click', () => {
    const c = panicQueue.shift();
    if (c) panicQueue.push(c);
    renderPanicCard();
  });

  btnPanicGotIt?.addEventListener('click', () => {
    panicQueue.shift();
    panicMastered += 1;
    renderPanicCard();
  });

  document.getElementById('btn-panic-close')?.addEventListener('click', () => {
    stopPanicTimer();
    if (panicModal) panicModal.hidden = true;
  });
}
