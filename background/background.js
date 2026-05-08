'use strict'

const log = (...args) => console.log('[YouTubeBuddy BG]', ...args)

// Tracks whether a batch is running in THIS service worker instance.
// When the service worker starts fresh this is always false — used to detect
// stale ytbBatchRunning flags left in storage by a previously killed worker.
let batchActiveInThisInstance = false

// On every service worker initialisation, clear any stale batch state that was
// left behind if the previous worker was killed (browser close, extension reload, crash).
chrome.storage.local.get({ ytbBatchRunning: false }, ({ ytbBatchRunning }) => {
    if (ytbBatchRunning && !batchActiveInThisInstance) {
        log('Clearing stale batch state from previous service worker instance.')
        chrome.storage.local.set({ ytbBatchRunning: false, ytbStopRequested: false })
    }
})

// Stop flag is persisted in storage so it survives service worker suspension.
async function isStopRequested() {
    const { ytbStopRequested } = await chrome.storage.local.get({ ytbStopRequested: false })
    return ytbStopRequested
}
async function setStopRequested(val) {
    await chrome.storage.local.set({ ytbStopRequested: val })
}

// ── Extension lifecycle ───────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') log('Installed.')
})

// ── Message listener ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'START_ALL_VIDEOS') {
        setStopRequested(false).then(() => {
            runBatch(message.payload)
                .catch(err => sendProgressToPopup({ type: 'ALL_DONE', success: false, message: err.message }))
        })
        sendResponse({ started: true })
        return false
    }
    if (message.action === 'STOP_ALL_VIDEOS') {
        setStopRequested(true).then(() => sendResponse({ ok: true }))
        return true
    }
})

// ── Batch orchestrator ────────────────────────────────────────────────────────
async function runBatch({ tabId, langCode, langLabel, channelPageUrl }) {
    batchActiveInThisInstance = true
    const contentType = /\/shorts/.test(channelPageUrl) ? 'Shorts'
                                        : /\/live/.test(channelPageUrl)   ? 'Live'
                                        : 'Videos'
    log('Batch started', { langLabel, contentType })
    await chrome.storage.local.set({ ytbBatchRunning: true })

    // Phase 1: Collect all video URLs across all pages (content script paginates).
    sendProgressToPopup({ type: 'COLLECTING' })

    await injectContentScript(tabId)
    const listResult = await sendMessageToTab(tabId, { action: 'GET_ALL_VIDEOS' })

    if (!listResult?.success) {
        sendProgressToPopup({
            type: 'ALL_DONE',
            success: false,
            message: listResult?.message || 'Failed to collect video list.',
        })
        return
    }

    const { videos } = listResult
    log(`Collected ${videos.length} videos`)

    if (videos.length === 0) {
        sendProgressToPopup({ type: 'ALL_DONE', success: true, message: 'No videos found on this channel.' })
        return
    }

    // Phase 2: Process each video one by one.
    let processed    = 0
    let succeeded    = 0
    let skipped      = 0
    let failed       = 0
    const failedTitles = []
    const startTime  = Date.now()

    // Load the persistent skip-cache for this language.
    const { ytbProcessedCache = [] } = await chrome.storage.local.get({ ytbProcessedCache: [] })
    const processedCache = new Set(ytbProcessedCache)
    const cacheKey = (video) => `${video.videoId}::${video.type ?? 'video'}::${langLabel}`

    for (const video of videos) {
        if (await isStopRequested()) {
            const entry = {
                type: 'bulk', date: new Date().toISOString(), langLabel, contentType,
                processed, succeeded, skipped, failed, failedTitles,
                durationMs: Date.now() - startTime, stopped: true,
            }
            await saveHistoryEntry(entry)
            batchActiveInThisInstance = false
            await chrome.storage.local.set({ ytbBatchRunning: false, ytbStopRequested: false })
            if (channelPageUrl) chrome.tabs.update(tabId, { url: channelPageUrl }).catch(() => {})
            sendProgressToPopup({ type: 'STOPPED', processed, total: videos.length, succeeded, skipped, failed })
            return
        }

        // Cache hit — already processed in a previous bulk run.
        if (processedCache.has(cacheKey(video))) {
            skipped++
            processed++
            log(`Cache hit — skipping "${video.title}"`)
            continue
        }

        sendProgressToPopup({
            type: 'PROGRESS',
            processed,
            total: videos.length,
            currentTitle: video.title,
            succeeded, skipped, failed,
        })

        try {
            await navigateTab(tabId, video.url)
            await sleep(800) // let the page settle before injecting

            await injectContentScript(tabId)
            const result = await sendMessageToTab(tabId, {
                action: 'ADD_SUBTITLE_LANGUAGE',
                payload: { langCode, langLabel, applyTo: 'current', silent: true },
            })

            // If Auto-translate was not ready, re-navigate (bypasses beforeunload)
            // and try once more.
            let finalResult = result
            if (result?.retryNeeded) {
                log(`Auto-translate not ready for "${video.title}" — re-navigating and retrying`)
                await navigateTab(tabId, video.url)
                await sleep(800)
                await injectContentScript(tabId)
                finalResult = await sendMessageToTab(tabId, {
                    action: 'ADD_SUBTITLE_LANGUAGE',
                    payload: { langCode, langLabel, applyTo: 'current', silent: true },
                })
            }

            processed++
            if (finalResult?.success && !finalResult?.skipped) {
                succeeded++
                // Cache so future runs skip this video immediately.
                processedCache.add(cacheKey(video))
                await chrome.storage.local.set({ ytbProcessedCache: [...processedCache] })
            } else if (finalResult?.skipped) {
                skipped++
                // Also cache — video already had the language, no need to re-check next run.
                processedCache.add(cacheKey(video))
                await chrome.storage.local.set({ ytbProcessedCache: [...processedCache] })
            } else {
                failed++
                failedTitles.push(video.title)
                log(`Failed: ${video.title} — ${finalResult?.message}`)
            }
        } catch (err) {
            processed++
            failed++
            failedTitles.push(video.title)
            log(`Error on "${video.title}": ${err.message}`)
        }
    }

    // Navigate back to channel page when done.
    if (channelPageUrl) {
        chrome.tabs.update(tabId, { url: channelPageUrl }).catch(() => {})
    }

    const entry = {
        type: 'bulk', date: new Date().toISOString(), langLabel, contentType,
        processed, succeeded, skipped, failed, failedTitles,
        durationMs: Date.now() - startTime, stopped: false,
    }
    await saveHistoryEntry(entry)
    batchActiveInThisInstance = false
    await chrome.storage.local.set({ ytbBatchRunning: false, ytbStopRequested: false })

    sendProgressToPopup({
        type: 'ALL_DONE',
        success: true,
        processed, succeeded, skipped, failed,
        message: `Done! ${succeeded} added, ${skipped} already had it, ${failed} failed.`,
    })
}

// ── Tab helpers ───────────────────────────────────────────────────────────────

async function navigateTab(tabId, url) {
    // Register the listener BEFORE triggering navigation to avoid race conditions.
    const loadPromise = waitForTabLoad(tabId)
    await chrome.tabs.update(tabId, { url })
    await loadPromise
}

function waitForTabLoad(tabId) {
    return new Promise((resolve, reject) => {
        let resolved = false

        const done = () => {
            if (resolved) return
            resolved = true
            chrome.tabs.onUpdated.removeListener(listener)
            clearTimeout(timeout)
            resolve()
        }

        function listener(updatedTabId, changeInfo) {
            if (updatedTabId === tabId && changeInfo.status === 'complete') done()
        }
        chrome.tabs.onUpdated.addListener(listener)

        const timeout = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener)
            if (!resolved) { resolved = true; reject(new Error('Tab load timeout')) }
        }, 60000)

        // Also handle the case where the tab is already complete.
        chrome.tabs.get(tabId).then(tab => {
            if (tab?.status === 'complete') done()
        }).catch(done)
    })
}

async function injectContentScript(tabId) {
    try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content/content.js'] })
    } catch {
        // Already injected or tab not injectable — proceed.
    }
}

function sendMessageToTab(tabId, message) {
    return new Promise(resolve => {
        chrome.tabs.sendMessage(tabId, message, response => {
            resolve(chrome.runtime.lastError ? null : response)
        })
    })
}

function sendProgressToPopup(data) {
    // Popup may be closed — ignore connection errors.
    chrome.runtime.sendMessage(data).catch(() => {})
}

// ── History persistence ───────────────────────────────────────────────────────
const MAX_HISTORY = 50

async function saveHistoryEntry(entry) {
    const { ytbHistory = [] } = await chrome.storage.local.get({ ytbHistory: [] })
    ytbHistory.unshift(entry) // newest first
    if (ytbHistory.length > MAX_HISTORY) ytbHistory.length = MAX_HISTORY
    await chrome.storage.local.set({ ytbHistory })
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
