'use strict';

// ── Language list ────────────────────────────────────────────────────────────
const LANGUAGES = [
  { code: 'af',    label: 'Afrikaans' },
  { code: 'sq',    label: 'Albanian' },
  { code: 'am',    label: 'Amharic' },
  { code: 'ar',    label: 'Arabic' },
  { code: 'hy',    label: 'Armenian' },
  { code: 'az',    label: 'Azerbaijani' },
  { code: 'eu',    label: 'Basque' },
  { code: 'be',    label: 'Belarusian' },
  { code: 'bn',    label: 'Bengali' },
  { code: 'bs',    label: 'Bosnian' },
  { code: 'bg',    label: 'Bulgarian' },
  { code: 'ca',    label: 'Catalan' },
  { code: 'zh-Hans', label: 'Chinese (Simplified)' },
  { code: 'zh-Hant', label: 'Chinese (Traditional)' },
  { code: 'hr',    label: 'Croatian' },
  { code: 'cs',    label: 'Czech' },
  { code: 'da',    label: 'Danish' },
  { code: 'nl',    label: 'Dutch' },
  { code: 'en',    label: 'English' },
  { code: 'et',    label: 'Estonian' },
  { code: 'fi',    label: 'Finnish' },
  { code: 'fr',    label: 'French' },
  { code: 'gl',    label: 'Galician' },
  { code: 'ka',    label: 'Georgian' },
  { code: 'de',    label: 'German' },
  { code: 'el',    label: 'Greek' },
  { code: 'gu',    label: 'Gujarati' },
  { code: 'ht',    label: 'Haitian Creole' },
  { code: 'he',    label: 'Hebrew' },
  { code: 'hi',    label: 'Hindi' },
  { code: 'hu',    label: 'Hungarian' },
  { code: 'is',    label: 'Icelandic' },
  { code: 'id',    label: 'Indonesian' },
  { code: 'it',    label: 'Italian' },
  { code: 'ja',    label: 'Japanese' },
  { code: 'kn',    label: 'Kannada' },
  { code: 'kk',    label: 'Kazakh' },
  { code: 'km',    label: 'Khmer' },
  { code: 'ko',    label: 'Korean' },
  { code: 'ky',    label: 'Kyrgyz' },
  { code: 'lo',    label: 'Lao' },
  { code: 'lv',    label: 'Latvian' },
  { code: 'lt',    label: 'Lithuanian' },
  { code: 'mk',    label: 'Macedonian' },
  { code: 'ms',    label: 'Malay' },
  { code: 'ml',    label: 'Malayalam' },
  { code: 'mt',    label: 'Maltese' },
  { code: 'mr',    label: 'Marathi' },
  { code: 'mn',    label: 'Mongolian' },
  { code: 'ne',    label: 'Nepali' },
  { code: 'nb',    label: 'Norwegian' },
  { code: 'fa',    label: 'Persian' },
  { code: 'pl',    label: 'Polish' },
  { code: 'pt',    label: 'Portuguese' },
  { code: 'pa',    label: 'Punjabi' },
  { code: 'ro',    label: 'Romanian' },
  { code: 'ru',    label: 'Russian' },
  { code: 'sr',    label: 'Serbian' },
  { code: 'si',    label: 'Sinhala' },
  { code: 'sk',    label: 'Slovak' },
  { code: 'sl',    label: 'Slovenian' },
  { code: 'es',    label: 'Spanish' },
  { code: 'sw',    label: 'Swahili' },
  { code: 'sv',    label: 'Swedish' },
  { code: 'tl',    label: 'Filipino (Tagalog)' },
  { code: 'ta',    label: 'Tamil' },
  { code: 'te',    label: 'Telugu' },
  { code: 'th',    label: 'Thai' },
  { code: 'tr',    label: 'Turkish' },
  { code: 'uk',    label: 'Ukrainian' },
  { code: 'ur',    label: 'Urdu' },
  { code: 'uz',    label: 'Uzbek' },
  { code: 'vi',    label: 'Vietnamese' },
  { code: 'cy',    label: 'Welsh' },
  { code: 'zu',    label: 'Zulu' },
];

// ── DOM refs ─────────────────────────────────────────────────────────────────
const langSelect      = document.getElementById('language-select');
const defaultLangSel  = document.getElementById('default-language');
const btnRun          = document.getElementById('btn-run');
const btnStop         = document.getElementById('btn-stop');
const progressText    = document.getElementById('progress-text');
const statusBanner    = document.getElementById('status-banner');
const pageContext     = document.getElementById('page-context');
const confirmChk      = document.getElementById('confirm-before-run');
const btnSaveSettings = document.getElementById('btn-save-settings');

// ── Populate language dropdowns ───────────────────────────────────────────────
function populateLanguages() {
  LANGUAGES.forEach(({ code, label }) => {
    const opt1 = new Option(label, code);
    const opt2 = new Option(label, code);
    langSelect.appendChild(opt1);
    defaultLangSel.appendChild(opt2);
  });
}

// ── Tab navigation ───────────────────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => { t.classList.add('hidden'); t.classList.remove('active'); });

    btn.classList.add('active');
    const tab = document.getElementById(`tab-${btn.dataset.tab}`);
    tab.classList.remove('hidden');
    tab.classList.add('active');
  });
});

// ── Status helpers ───────────────────────────────────────────────────────────
function showStatus(type, message) {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner ${type}`;
}

function clearStatus() {
  statusBanner.className = 'status-banner hidden';
}

// ── Enable/disable run button ─────────────────────────────────────────────────
langSelect.addEventListener('change', () => {
  btnRun.disabled = !langSelect.value;
  clearStatus();
});

// ── Detect page context ───────────────────────────────────────────────────────
async function detectContext() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.includes('studio.youtube.com')) {
      pageContext.textContent = 'Navigate to YouTube Studio';
      btnRun.disabled = true;
      showStatus('info', 'Open YouTube Studio to use this feature.');
      return;
    }
    pageContext.textContent = 'YouTube Studio detected';
  } catch {
    pageContext.textContent = 'Unknown page';
  }
}

// ── Run automation ────────────────────────────────────────────────────────────
btnRun.addEventListener('click', async () => {
  const langCode  = langSelect.value;
  const langLabel = langSelect.options[langSelect.selectedIndex].text;
  const applyTo   = document.querySelector('input[name="apply-to"]:checked').value;

  if (!langCode) return;

  // ── All-videos mode ────────────────────────────────────────────────────────
  if (applyTo === 'all') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url?.match(/studio\.youtube\.com\/channel\/[^/]+\/videos/)) {
      showStatus('error', 'Please navigate to the Channel content page (Videos tab) first.');
      return;
    }

    const { confirmBeforeRun } = await chrome.storage.sync.get({ confirmBeforeRun: true });
    if (confirmBeforeRun) {
      const ok = confirm(
        `Add "${langLabel}" subtitles to ALL videos in this channel?\n\nYou can stop the process at any time.`
      );
      if (!ok) return;
    }

    btnRun.disabled = true;
    btnStop.classList.remove('hidden');
    progressText.classList.remove('hidden');
    progressText.textContent = 'Collecting video list…';
    showStatus('running', `Preparing to add "${langLabel}" to all videos…`);

    chrome.runtime.sendMessage({
      action: 'START_ALL_VIDEOS',
      payload: { tabId: tab.id, langCode, langLabel, channelPageUrl: tab.url },
    });
    return;
  }

  // ── Single-video mode ──────────────────────────────────────────────────────
  btnRun.disabled = true;
  showStatus('running', `Adding "${langLabel}" subtitle track…`);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Inject the content script if it isn't already running in this tab
    // (happens when the tab was open before the extension was loaded/reloaded).
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/content.js'],
      });
    } catch {
      // Script already injected or tab is not injectable — proceed anyway.
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'ADD_SUBTITLE_LANGUAGE',
      payload: { langCode, langLabel, applyTo },
    });

    if (response?.success) {
      showStatus('success', response.message || `"${langLabel}" added successfully.`);
    } else {
      showStatus('error', response?.message || 'Something went wrong. Please try again.');
      btnRun.disabled = false;
    }
  } catch (err) {
    showStatus('error', `Error: ${err.message}`);
    btnRun.disabled = false;
  }
});

// ── Stop button ───────────────────────────────────────────────────────────────
btnStop.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'STOP_ALL_VIDEOS' });
  btnStop.disabled = true;
  showStatus('running', 'Stopping after current video finishes…');
});

// ── Background progress messages ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'COLLECTING') {
    progressText.classList.remove('hidden');
    progressText.textContent = 'Collecting video list across all pages…';

  } else if (message.type === 'PROGRESS') {
    const { processed, total, currentTitle, succeeded, skipped, failed } = message;
    showStatus('running', `Video ${processed + 1} of ${total}: "${currentTitle}"`);
    progressText.classList.remove('hidden');
    progressText.textContent = `${succeeded} added  ·  ${skipped} skipped  ·  ${failed} failed`;

  } else if (message.type === 'ALL_DONE') {
    btnRun.disabled = false;
    btnStop.classList.add('hidden');
    btnStop.disabled = false;
    progressText.classList.add('hidden');
    progressText.textContent = '';
    showStatus(message.success ? 'success' : 'error', message.message);

  } else if (message.type === 'STOPPED') {
    btnRun.disabled = false;
    btnStop.classList.add('hidden');
    btnStop.disabled = false;
    progressText.classList.add('hidden');
    progressText.textContent = '';
    showStatus(
      'info',
      `Stopped after ${message.processed} videos — ` +
      `${message.succeeded} added, ${message.skipped} skipped, ${message.failed} failed.`
    );
  }
});

// ── Settings: load & save ─────────────────────────────────────────────────────
async function loadSettings() {
  const { defaultLanguage, confirmBeforeRun } = await chrome.storage.sync.get({
    defaultLanguage: '',
    confirmBeforeRun: true,
  });
  if (defaultLanguage) {
    langSelect.value       = defaultLanguage;
    defaultLangSel.value   = defaultLanguage;
    btnRun.disabled        = false;
  }
  confirmChk.checked = confirmBeforeRun;
}

btnSaveSettings.addEventListener('click', async () => {
  await chrome.storage.sync.set({
    defaultLanguage: defaultLangSel.value,
    confirmBeforeRun: confirmChk.checked,
  });
  btnSaveSettings.textContent = 'Saved ✓';
  setTimeout(() => { btnSaveSettings.textContent = 'Save Settings'; }, 1500);
});

// ── Init ──────────────────────────────────────────────────────────────────────
populateLanguages();
loadSettings();
detectContext();
