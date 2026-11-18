// FLIPNOTE Internationalization (i18n) — 15 languages + RTL + independent learning language preferences

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', dir: 'ltr' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', dir: 'ltr' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', dir: 'ltr' },
  { code: 'de', name: 'German', native: 'Deutsch', dir: 'ltr' },
  { code: 'fr', name: 'French', native: 'Français', dir: 'ltr' },
  { code: 'es', name: 'Spanish', native: 'Español', dir: 'ltr' },
  { code: 'pt', name: 'Portuguese', native: 'Português', dir: 'ltr' },
  { code: 'ar', name: 'Arabic', native: 'العربية', dir: 'rtl' },
  { code: 'ur', name: 'Urdu', native: 'اردو', dir: 'rtl' },
  { code: 'ja', name: 'Japanese', native: '日本語', dir: 'ltr' },
  { code: 'ko', name: 'Korean', native: '한국어', dir: 'ltr' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', dir: 'ltr' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', dir: 'ltr' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', dir: 'ltr' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', dir: 'ltr' }
];

const RTL_CODES = new Set(['ar', 'ur']);

let currentLocale = 'en';
let fallbackDict = {};
let activeDict = {};

export function getSuggestedBrowserLanguage() {
  const navLangs = navigator.languages && navigator.languages.length
    ? navigator.languages
    : [navigator.language || 'en'];
  for (const raw of navLangs) {
    const base = String(raw).toLowerCase().split('-')[0];
    if (SUPPORTED_LANGUAGES.some((l) => l.code === base)) {
      return base;
    }
  }
  return 'en';
}

export function getCurrentLanguage() {
  return currentLocale;
}

export function getLanguageDir(code = currentLocale) {
  return RTL_CODES.has(code) ? 'rtl' : 'ltr';
}

async function fetchLocaleJson(code) {
  const res = await fetch(`./locales/${code}.json`);
  if (!res.ok) throw new Error(`Locale ${code} load failed`);
  return res.json();
}

export async function initI18n(preferredCode) {
  try {
    fallbackDict = await fetchLocaleJson('en');
  } catch {
    fallbackDict = {};
  }
  const valid = SUPPORTED_LANGUAGES.some((l) => l.code === preferredCode)
    ? preferredCode
    : getSuggestedBrowserLanguage();
  await setLanguage(valid);
}

export async function setLanguage(code) {
  const valid = SUPPORTED_LANGUAGES.some((l) => l.code === code) ? code : 'en';
  if (valid === 'en' && Object.keys(fallbackDict).length) {
    activeDict = fallbackDict;
  } else {
    try {
      activeDict = await fetchLocaleJson(valid);
    } catch {
      activeDict = fallbackDict;
    }
  }
  currentLocale = valid;
  document.documentElement.lang = valid;
  document.documentElement.dir = getLanguageDir(valid);
  applyTranslations();
  return valid;
}

function resolveKey(obj, path) {
  return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
}

export function t(key, params = {}) {
  let val = resolveKey(activeDict, key);
  if (val === undefined) {
    val = resolveKey(fallbackDict, key);
  }
  if (val === undefined) return key;
  let str = String(val);
  for (const [k, v] of Object.entries(params)) {
    str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return str;
}

export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.setAttribute('placeholder', t(key));
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria');
    el.setAttribute('aria-label', t(key));
  });
}

export function populateLanguageSelect(selectEl, selectedCode) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  for (const lang of SUPPORTED_LANGUAGES) {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = `${lang.native} (${lang.name})`;
    if (lang.code === selectedCode) opt.selected = true;
    selectEl.appendChild(opt);
  }
}
