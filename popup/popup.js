'use strict'

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
]

// ── DOM refs ─────────────────────────────────────────────────────────────────
const langSelect        = document.getElementById('language-select')
const defaultLangSel    = document.getElementById('default-language')
const channelLangSel    = document.getElementById('channel-language')
const btnRun            = document.getElementById('btn-run')
const btnStop           = document.getElementById('btn-stop')
const progressText      = document.getElementById('progress-text')
const statusBanner      = document.getElementById('status-banner')
const pageContext       = document.getElementById('page-context')
const confirmChk        = document.getElementById('confirm-before-run')
const bulkDelaySlider   = document.getElementById('bulk-delay')
const delayValueDisplay = document.getElementById('delay-value')
const btnSaveSettings   = document.getElementById('btn-save-settings')
const btnClearCache     = document.getElementById('btn-clear-cache')
const historyList       = document.getElementById('history-list')
const btnClearHistory   = document.getElementById('btn-clear-history')

// ── Populate language dropdowns ───────────────────────────────────────────────
function populateLanguages() {
    LANGUAGES.forEach(({ code, label }) => {
        langSelect.appendChild(new Option(label, code))
        defaultLangSel.appendChild(new Option(label, code))
        // Channel language uses label as value (content script matches by label text)
        channelLangSel.appendChild(new Option(label, label))
    })
}

// ── Tab navigation ───────────────────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'))
        document.querySelectorAll('.tab').forEach(t => { t.classList.add('hidden'); t.classList.remove('active') })

        btn.classList.add('active')
        const tab = document.getElementById(`tab-${btn.dataset.tab}`)
        tab.classList.remove('hidden')
        tab.classList.add('active')
    })
})

// ── Status helpers ───────────────────────────────────────────────────────────
function showStatus(type, message) {
    statusBanner.textContent = message
    statusBanner.className = `status-banner ${type}`
}

function clearStatus() {
    statusBanner.className = 'status-banner hidden'
}

// ── Enable/disable run button ─────────────────────────────────────────────────
langSelect.addEventListener('change', () => {
    btnRun.disabled = !langSelect.value
    clearStatus()
})

// ── Detect page context ───────────────────────────────────────────────────────
async function detectContext() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!tab?.url?.includes('studio.youtube.com')) {
            pageContext.textContent = 'Navigate to YouTube Studio'
            btnRun.disabled = true
            showStatus('info', 'Open YouTube Studio to use this feature.')
            return
        }
        pageContext.textContent = 'YouTube Studio detected'
    } catch {
        pageContext.textContent = 'Unknown page'
    }
}

// ── Run automation ────────────────────────────────────────────────────────────
btnRun.addEventListener('click', async () => {
    const langCode  = langSelect.value
    const langLabel = langSelect.options[langSelect.selectedIndex].text
    const applyTo   = document.querySelector('input[name="apply-to"]:checked').value

    if (!langCode) return

    // ── Settings validation ────────────────────────────────────────────────────
    const { defaultLanguage, channelLanguageLabel } = await chrome.storage.sync.get({
        defaultLanguage: '',
        channelLanguageLabel: '',
    })
    const missing = []
    if (!defaultLanguage)      missing.push('"Default Add Language"')
    if (!channelLanguageLabel) missing.push('"Channel Language"')
    if (missing.length) {
        showStatus('error', `Please set ${missing.join(' and ')} in Settings before running.`)
        btnRun.disabled = false
        return
    }

    // ── All-videos mode ────────────────────────────────────────────────────────
    if (applyTo === 'all') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

        if (!tab?.url?.match(/studio\.youtube\.com\/channel\/[^/]+\/(videos|shorts|live)/)) {
            showStatus('error', 'Please navigate to the Channel content page (Videos, Shorts, or Live tab) first.')
            return
        }

        const { confirmBeforeRun } = await chrome.storage.sync.get({ confirmBeforeRun: true })
        if (confirmBeforeRun) {
            const ok = confirm(
                `Add "${langLabel}" subtitles to ALL videos in this channel?\n\nYou can stop the process at any time.`
            )
            if (!ok) return
        }

        btnRun.disabled = true
        btnStop.classList.remove('hidden')
        progressText.classList.remove('hidden')
        progressText.textContent = 'Collecting video list…'
        showStatus('running', `Preparing to add "${langLabel}" to all videos…`)

        chrome.runtime.sendMessage({
            action: 'START_ALL_VIDEOS',
            payload: { tabId: tab.id, langCode, langLabel, channelPageUrl: tab.url },
        })
        return
    }

    // ── Single-video mode ──────────────────────────────────────────────────────
    btnRun.disabled = true
    showStatus('running', `Adding "${langLabel}" subtitle track…`)

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

        // Inject the content script if it isn't already running in this tab
        // (happens when the tab was open before the extension was loaded/reloaded).
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content/content.js'],
            })
        } catch {
            // Script already injected or tab is not injectable — proceed anyway.
        }

        const response = await chrome.tabs.sendMessage(tab.id, {
            action: 'ADD_SUBTITLE_LANGUAGE',
            payload: { langCode, langLabel, applyTo },
        })

        const result  = response?.success ? (response?.skipped ? 'skipped' : 'success') : 'failed'
        const message = response?.message || (response?.success ? `"${langLabel}" added successfully.` : 'Something went wrong.')

        await saveHistoryEntry({
            type: 'single',
            date: new Date().toISOString(),
            langLabel,
            title: tab.title || 'Unknown video',
            result,
            message,
        })

        if (response?.success) {
            showStatus('success', message)
        } else {
            showStatus('error', message)
            btnRun.disabled = false
        }
    } catch (err) {
        showStatus('error', `Error: ${err.message}`)
        btnRun.disabled = false
    }
})

// ── Stop button ───────────────────────────────────────────────────────────────
btnStop.addEventListener('click', async () => {
    btnStop.disabled = true
    showStatus('running', 'Stopping after current video finishes…')

    // Tell the service worker to stop. If the SW is dead/unresponsive the message
    // will fail — that's fine because the startup cleanup will clear the stale
    // flag on next SW wake-up.  As a belt-and-suspenders fallback, also set the
    // stop flag directly in storage so an already-awake SW sees it.
    await chrome.storage.local.set({ ytbStopRequested: true })
    chrome.runtime.sendMessage({ action: 'STOP_ALL_VIDEOS' }).catch(() => {})
})

// ── Background progress messages ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'COLLECTING') {
        progressText.classList.remove('hidden')
        progressText.textContent = 'Collecting video list across all pages…'

    } else if (message.type === 'PROGRESS') {
        const { processed, total, currentTitle, succeeded, skipped, failed } = message
        showStatus('running', `Video ${processed + 1} of ${total}: "${currentTitle}"`)
        progressText.classList.remove('hidden')
        progressText.textContent = `${succeeded} added  ·  ${skipped} skipped  ·  ${failed} failed`

    } else if (message.type === 'ALL_DONE') {
        btnRun.disabled = false
        btnStop.classList.add('hidden')
        btnStop.disabled = false
        progressText.classList.add('hidden')
        progressText.textContent = ''
        showStatus(message.success ? 'success' : 'error', message.message)

    } else if (message.type === 'STOPPED') {
        btnRun.disabled = false
        btnStop.classList.add('hidden')
        btnStop.disabled = false
        progressText.classList.add('hidden')
        progressText.textContent = ''
        showStatus(
            'info',
            `Stopped after ${message.processed} videos — ` +
            `${message.succeeded} added, ${message.skipped} skipped, ${message.failed} failed.`
        )
    }
})

// ── Settings: load & save ─────────────────────────────────────────────────────
async function loadSettings() {
    const { defaultLanguage, confirmBeforeRun, channelLanguageLabel, bulkDelaySeconds } =
        await chrome.storage.sync.get({
            defaultLanguage: '',
            confirmBeforeRun: true,
            channelLanguageLabel: '',
            bulkDelaySeconds: 30,
        })
    if (defaultLanguage) {
        langSelect.value       = defaultLanguage
        defaultLangSel.value   = defaultLanguage
        btnRun.disabled        = false
    }
    if (channelLanguageLabel) {
        channelLangSel.value = channelLanguageLabel
    }
    confirmChk.checked = confirmBeforeRun
    bulkDelaySlider.value       = bulkDelaySeconds
    delayValueDisplay.textContent = `${bulkDelaySeconds}s`
}

bulkDelaySlider.addEventListener('input', () => {
    delayValueDisplay.textContent = `${bulkDelaySlider.value}s`
})

btnClearCache.addEventListener('click', async () => {
    await chrome.storage.local.set({ ytbProcessedCache: [] })
    btnClearCache.textContent = 'Cleared ✓'
    setTimeout(() => { btnClearCache.textContent = 'Clear Skip Cache' }, 1500)
})

btnSaveSettings.addEventListener('click', async () => {
    await chrome.storage.sync.set({
        defaultLanguage: defaultLangSel.value,
        confirmBeforeRun: confirmChk.checked,
        channelLanguageLabel: channelLangSel.value,
        bulkDelaySeconds: parseInt(bulkDelaySlider.value, 10),
    })
    btnSaveSettings.textContent = 'Saved ✓'
    setTimeout(() => { btnSaveSettings.textContent = 'Save Settings' }, 1500)
})

// ── History ───────────────────────────────────────────────────────────────────
const MAX_HISTORY = 50

async function saveHistoryEntry(entry) {
    const { ytbHistory = [] } = await chrome.storage.local.get({ ytbHistory: [] })
    ytbHistory.unshift(entry)
    if (ytbHistory.length > MAX_HISTORY) ytbHistory.length = MAX_HISTORY
    await chrome.storage.local.set({ ytbHistory })
}

async function renderHistory() {
    const { ytbHistory = [] } = await chrome.storage.local.get({ ytbHistory: [] })
    if (ytbHistory.length === 0) {
        historyList.innerHTML = '<p class="history-empty">No runs yet.</p>'
        return
    }
    historyList.innerHTML = ytbHistory.map(entry => renderEntry(entry)).join('')
}

function renderEntry(e) {
    const date = formatDate(e.date)
    if (e.type === 'single') {
        const resultClass = e.result === 'success' ? 'success' : e.result === 'skipped' ? 'skipped' : 'failed'
        const resultText  = e.result === 'success' ? '✓ Added' : e.result === 'skipped' ? '— Skipped' : '✗ Failed'
        return `
            <div class="history-entry">
                <div class="history-entry-header">
                    <span class="history-entry-type single">Single</span>
                    <span class="history-entry-date">${date}</span>
                </div>
                <div class="history-entry-title">${escHtml(e.title)}</div>
                <div class="history-entry-meta">${escHtml(e.langLabel)}</div>
                <div class="history-entry-result ${resultClass}">${resultText}</div>
            </div>`
    }
    // bulk
    const dur  = formatDuration(e.durationMs)
    const stopped = e.stopped ? ' (stopped)' : ''
    const contentType = e.contentType ?? 'Videos'
    let failedHtml = ''
    if (e.failedTitles?.length) {
        const items = e.failedTitles.map(t => `<li>${escHtml(t)}</li>`).join('')
        failedHtml = `<ul class="history-failed-list">${items}</ul>`
    }
    return `
        <div class="history-entry">
            <div class="history-entry-header">
                <span class="history-entry-type bulk">Bulk · ${escHtml(contentType)}${stopped}</span>
                <span class="history-entry-date">${date}</span>
            </div>
            <div class="history-entry-meta">${escHtml(e.langLabel)} · ${e.processed} items · ${dur}</div>
            <div class="history-entry-meta">
                <span style="color:#7ec97e">✓ ${e.succeeded}</span> &nbsp
                <span style="color:var(--text-muted)">— ${e.skipped}</span> &nbsp
                <span style="color:#e87a7a">✗ ${e.failed}</span>
            </div>
            ${failedHtml}
        </div>`
}

function formatDate(iso) {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(ms) {
    const s = Math.round(ms / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60), r = s % 60
    return r ? `${m}m ${r}s` : `${m}m`
}

function escHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c =>
        ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c])
}

// Render history when user switches to the History tab.
document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.dataset.tab === 'history') {
        btn.addEventListener('click', renderHistory)
    }
})

btnClearHistory.addEventListener('click', async () => {
    await chrome.storage.local.set({ ytbHistory: [] })
    historyList.innerHTML = '<p class="history-empty">No runs yet.</p>'
})

// ── Restore running state if batch is still active ────────────────────────────
async function restoreBatchState() {
    const { ytbBatchRunning } = await chrome.storage.local.get({ ytbBatchRunning: false })
    if (!ytbBatchRunning) return

    // Reflect the correct "Apply To" selection so the UI isn't misleading.
    document.querySelector('input[name="apply-to"][value="all"]').checked = true

    btnRun.disabled = true
    btnStop.classList.remove('hidden')
    btnStop.disabled = false
    progressText.classList.remove('hidden')
    progressText.textContent = 'Batch running…'
    showStatus('running', 'Batch in progress — click Stop to cancel.')
}

// ── Init ──────────────────────────────────────────────────────────────────────
populateLanguages()
loadSettings()
detectContext()
restoreBatchState()
