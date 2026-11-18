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
  isSupabaseReady, publishStudySetToSupabase, publishQuizToSupabase,
  fetchPublicStudySets, fetchSharedByShortCode
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
  deferredInstallPrompt: null
};

async function bootstrap() {
  await openDB();
  state.settings = await getAllSettings();

  // Theme
  const theme = state.settings.theme || 'dark';
  applyTheme(theme);

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
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', theme === 'light' ? '#eef1fb' : '#101738');
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

  // Quick Theme Toggle
  document.getElementById('btn-theme-toggle')?.addEventListener('click', async () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next);
    state.settings.theme = next;
    await setSetting('theme', next);
    const sel = document.getElementById('setting-theme');
    if (sel) sel.value = next;
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
    const total = state.quizOrder.length;
    const pct = Math.round((state.quizScore / total) * 100);
    document.getElementById('quiz-final-score').textContent = `${state.quizScore} / ${total} (${pct}%)`;
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
