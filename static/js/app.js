// Application State
let appState = {
    releaseNotes: [],
    filteredNotes: [],
    selectedId: null,
    currentFilter: 'all',
    searchQuery: '',
    lastUpdated: null
};

// Normalized types for frontend categories
const CATEGORIES = {
    ALL: 'all',
    FEATURE: 'Feature',
    ANNOUNCEMENT: 'Announcement',
    ISSUE: 'Issue',
    CHANGE: 'Change',
    DEPRECATION: 'Deprecation',
    GENERAL: 'General'
};

// DOM Elements
const DOM = {
    timelineFlow: document.getElementById('timeline-flow'),
    loadingBanner: document.getElementById('loading-banner'),
    errorBanner: document.getElementById('error-banner'),
    errorMsg: document.getElementById('error-msg'),
    emptyState: document.getElementById('empty-state'),
    
    // Header & Info
    btnRefresh: document.getElementById('btn-refresh'),
    refreshIcon: document.getElementById('refresh-icon'),
    statusDot: document.getElementById('status-dot'),
    statusLabel: document.getElementById('status-label'),
    lastUpdatedText: document.getElementById('last-updated-text'),
    btnRetry: document.getElementById('btn-retry'),
    
    // Sidebar Controls
    searchInput: document.getElementById('search-input'),
    clearSearchBtn: document.getElementById('clear-search-btn'),
    btnResetFilters: document.getElementById('btn-reset-filters'),
    
    // Category Counts
    countAll: document.getElementById('count-all'),
    countFeature: document.getElementById('count-feature'),
    countAnnouncement: document.getElementById('count-announcement'),
    countIssue: document.getElementById('count-issue'),
    countChange: document.getElementById('count-change'),
    countDeprecation: document.getElementById('count-deprecation'),
    
    // Floating Selection Bar
    selectionBar: document.getElementById('selection-bar'),
    selectionCount: document.getElementById('selection-count'),
    btnClearSelection: document.getElementById('btn-clear-selection'),
    btnTweetSelection: document.getElementById('btn-tweet-selection'),
    
    // Tweet Drawer Elements
    tweetDrawer: document.getElementById('tweet-drawer'),
    drawerOverlay: document.getElementById('tweet-drawer-overlay'),
    btnCloseDrawer: document.getElementById('btn-close-drawer'),
    btnCancelDrawer: document.getElementById('btn-cancel-drawer'),
    btnPublishTweet: document.getElementById('btn-publish-tweet'),
    tweetTextarea: document.getElementById('tweet-textarea'),
    charCount: document.getElementById('char-count'),
    charProgress: document.getElementById('char-progress'),
    tweetWarning: document.getElementById('tweet-length-warning'),
    drawerUpdateType: document.getElementById('drawer-update-type'),
    drawerUpdateDate: document.getElementById('drawer-update-date'),
    drawerUpdateSnippet: document.getElementById('drawer-update-snippet'),
    btnResetTweet: document.getElementById('btn-reset-tweet'),
    btnCopyTweet: document.getElementById('btn-copy-tweet'),
    
    // Toast Container
    toastContainer: document.getElementById('toast-container')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    setupEventListeners();
    fetchReleaseNotes(false);
}

// Set up Event Listeners
function setupEventListeners() {
    // Refresh buttons
    DOM.btnRefresh.addEventListener('click', () => fetchReleaseNotes(true));
    DOM.btnRetry.addEventListener('click', () => fetchReleaseNotes(true));
    
    // Search input
    DOM.searchInput.addEventListener('input', handleSearchInput);
    DOM.clearSearchBtn.addEventListener('click', clearSearch);
    
    // Filter chips
    const chips = document.querySelectorAll('.filter-chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            
            const filterType = chip.getAttribute('data-type');
            setFilter(filterType);
        });
    });
    
    // Reset filters button in empty state
    DOM.btnResetFilters.addEventListener('click', resetAllFilters);
    
    // Selection bar buttons
    DOM.btnClearSelection.addEventListener('click', clearSelection);
    DOM.btnTweetSelection.addEventListener('click', openTweetComposer);
    
    // Drawer buttons
    DOM.btnCloseDrawer.addEventListener('click', closeTweetDrawer);
    DOM.btnCancelDrawer.addEventListener('click', closeTweetDrawer);
    DOM.drawerOverlay.addEventListener('click', closeTweetDrawer);
    DOM.btnPublishTweet.addEventListener('click', publishTweet);
    DOM.btnResetTweet.addEventListener('click', resetTweetText);
    DOM.btnCopyTweet.addEventListener('click', copyTweetToClipboard);
    
    // Textarea input
    DOM.tweetTextarea.addEventListener('input', handleTextareaChange);
}

// Fetch release notes from backend
async function fetchReleaseNotes(forceRefresh = false) {
    toggleLoadingState(true);
    clearSelection();
    
    try {
        const url = `/api/release-notes${forceRefresh ? '?force_refresh=true' : ''}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.status === 'success' || result.status === 'fallback_success') {
            appState.releaseNotes = result.data.map(note => {
                // Attach normalized categories for filtering
                note.normalizedType = getNormalizedType(note.type);
                return note;
            });
            
            appState.lastUpdated = new Date(result.timestamp * 1000);
            updateStatusIndicator(result.cached, result.status === 'fallback_success');
            
            // Calculate and display category counts
            updateCategoryCounts();
            
            // Filter and render timeline
            filterAndSearchNotes();
            
            if (forceRefresh) {
                showToast(result.status === 'fallback_success' 
                    ? 'Failed to fetch new data. Displaying cached copy.' 
                    : 'Feed refreshed successfully!', 
                    result.status === 'fallback_success' ? 'error' : 'success'
                );
            }
        } else {
            throw new Error(result.message || 'Unknown backend error');
        }
    } catch (error) {
        console.error('Fetch error:', error);
        DOM.errorMsg.textContent = `Could not load BigQuery releases: ${error.message}`;
        DOM.timelineFlow.style.display = 'none';
        DOM.emptyState.style.display = 'none';
        DOM.errorBanner.style.display = 'flex';
    } finally {
        toggleLoadingState(false);
    }
}

// Toggle UI elements during fetch
function toggleLoadingState(isLoading) {
    if (isLoading) {
        DOM.loadingBanner.style.display = 'flex';
        DOM.errorBanner.style.display = 'none';
        DOM.timelineFlow.style.display = 'none';
        DOM.emptyState.style.display = 'none';
        DOM.refreshIcon.classList.add('spinning');
        DOM.btnRefresh.disabled = true;
    } else {
        DOM.loadingBanner.style.display = 'none';
        DOM.refreshIcon.classList.remove('spinning');
        DOM.btnRefresh.disabled = false;
    }
}

// Normalize raw feed headings to application types
function getNormalizedType(type) {
    if (!type) return CATEGORIES.GENERAL;
    const t = type.trim().toLowerCase();
    if (t.includes('feature')) return CATEGORIES.FEATURE;
    if (t.includes('announcement')) return CATEGORIES.ANNOUNCEMENT;
    if (t.includes('issue') || t.includes('fix') || t.includes('resolved')) return CATEGORIES.ISSUE;
    if (t.includes('change') || t.includes('update')) return CATEGORIES.CHANGE;
    if (t.includes('deprecation')) return CATEGORIES.DEPRECATION;
    return CATEGORIES.GENERAL;
}

// Update Header status labels & cache status
function updateStatusIndicator(isCached, isFallback) {
    if (isFallback) {
        DOM.statusDot.className = 'status-indicator-dot orange';
        DOM.statusLabel.textContent = 'Offline Fallback';
    } else if (isCached) {
        DOM.statusDot.className = 'status-indicator-dot green';
        DOM.statusLabel.textContent = 'Cached (Feed)';
    } else {
        DOM.statusDot.className = 'status-indicator-dot green';
        DOM.statusLabel.textContent = 'Synchronized';
    }
    
    if (appState.lastUpdated) {
        const timeStr = appState.lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        DOM.lastUpdatedText.textContent = timeStr;
    }
}

// Calculate the number of updates in each category for the filters sidebar
function updateCategoryCounts() {
    const notes = appState.releaseNotes;
    
    const counts = {
        all: notes.length,
        [CATEGORIES.FEATURE]: 0,
        [CATEGORIES.ANNOUNCEMENT]: 0,
        [CATEGORIES.ISSUE]: 0,
        [CATEGORIES.CHANGE]: 0,
        [CATEGORIES.DEPRECATION]: 0
    };
    
    notes.forEach(note => {
        const category = note.normalizedType;
        if (counts[category] !== undefined) {
            counts[category]++;
        } else if (category === CATEGORIES.GENERAL) {
            // General or other falls into change/all counts depending on logic
            counts[CATEGORIES.CHANGE]++; // Merge general updates under changes for visual counts
        }
    });
    
    DOM.countAll.textContent = counts.all;
    DOM.countFeature.textContent = counts[CATEGORIES.FEATURE];
    DOM.countAnnouncement.textContent = counts[CATEGORIES.ANNOUNCEMENT];
    DOM.countIssue.textContent = counts[CATEGORIES.ISSUE];
    DOM.countChange.textContent = counts[CATEGORIES.CHANGE];
    DOM.countDeprecation.textContent = counts[CATEGORIES.DEPRECATION];
}

// Search handling
function handleSearchInput(e) {
    appState.searchQuery = e.target.value.trim().toLowerCase();
    
    if (appState.searchQuery) {
        DOM.clearSearchBtn.style.display = 'block';
    } else {
        DOM.clearSearchBtn.style.display = 'none';
    }
    
    filterAndSearchNotes();
}

function clearSearch() {
    DOM.searchInput.value = '';
    DOM.clearSearchBtn.style.display = 'none';
    appState.searchQuery = '';
    filterAndSearchNotes();
}

// Filter chips handling
function setFilter(filterType) {
    appState.currentFilter = filterType;
    filterAndSearchNotes();
}

function resetAllFilters() {
    DOM.searchInput.value = '';
    DOM.clearSearchBtn.style.display = 'none';
    appState.searchQuery = '';
    appState.currentFilter = 'all';
    
    const chips = document.querySelectorAll('.filter-chip');
    chips.forEach(c => {
        if (c.getAttribute('data-type') === 'all') {
            c.classList.add('active');
        } else {
            c.classList.remove('active');
        }
    });
    
    filterAndSearchNotes();
}

// Combine filter & search states and refresh timeline
function filterAndSearchNotes() {
    const query = appState.searchQuery;
    const filter = appState.currentFilter;
    
    appState.filteredNotes = appState.releaseNotes.filter(note => {
        // 1. Category Filter Match
        let matchesFilter = false;
        if (filter === 'all') {
            matchesFilter = true;
        } else if (filter === CATEGORIES.CHANGE) {
            // Include both Change and General in Changes tab
            matchesFilter = (note.normalizedType === CATEGORIES.CHANGE || note.normalizedType === CATEGORIES.GENERAL);
        } else {
            matchesFilter = note.normalizedType === filter;
        }
        
        // 2. Keyword Search Match
        let matchesSearch = true;
        if (query) {
            const dateMatch = note.date.toLowerCase().includes(query);
            const typeMatch = note.type.toLowerCase().includes(query);
            const textMatch = note.text.toLowerCase().includes(query);
            matchesSearch = dateMatch || typeMatch || textMatch;
        }
        
        return matchesFilter && matchesSearch;
    });
    
    renderTimeline();
}

// Render release note cards to the timeline
function renderTimeline() {
    DOM.timelineFlow.innerHTML = '';
    
    if (appState.filteredNotes.length === 0) {
        DOM.timelineFlow.style.display = 'none';
        DOM.emptyState.style.display = 'flex';
        return;
    }
    
    DOM.emptyState.style.display = 'none';
    DOM.timelineFlow.style.display = 'block';
    
    appState.filteredNotes.forEach((note, index) => {
        const isSelected = appState.selectedId === note.id;
        
        // Create card container
        const itemNode = document.createElement('article');
        itemNode.className = `timeline-item ${isSelected ? 'selected' : ''}`;
        itemNode.style.animationDelay = `${Math.min(index * 0.05, 0.8)}s`;
        
        const cardClass = `update-card type-${note.normalizedType.toLowerCase()}`;
        
        itemNode.innerHTML = `
            <div class="timeline-marker"></div>
            <div class="${cardClass} ${isSelected ? 'selected' : ''}" data-id="${note.id}" id="card-${note.id}">
                <div class="card-header">
                    <div class="header-meta">
                        <span class="badge">${note.type}</span>
                        <span class="card-date">${note.date}</span>
                    </div>
                    <div class="card-selector" aria-label="Select update for tweeting">
                        <i class="fa-solid fa-check"></i>
                    </div>
                </div>
                <div class="card-body">
                    ${note.html}
                </div>
                <div class="card-actions">
                    ${note.link ? `
                        <a href="${note.link}" class="card-origin-link" target="_blank" rel="noopener noreferrer">
                            Documentation <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        </a>
                    ` : '<span></span>'}
                    <button class="btn-card-tweet" data-id="${note.id}">
                        <i class="fa-brands fa-x-twitter"></i> Draft Tweet
                    </button>
                </div>
            </div>
        `;
        
        // Card click select/deselect
        const card = itemNode.querySelector('.update-card');
        card.addEventListener('click', (e) => {
            // Prevent trigger selection if they click an anchor tag inside card
            if (e.target.tagName.toLowerCase() === 'a' || e.target.closest('a')) {
                return;
            }
            
            // Check if they clicked the direct Tweet button
            const directTweetBtn = e.target.closest('.btn-card-tweet');
            if (directTweetBtn) {
                e.stopPropagation();
                const noteId = directTweetBtn.getAttribute('data-id');
                toggleCardSelection(noteId);
                openTweetComposer();
                return;
            }
            
            toggleCardSelection(note.id);
        });
        
        DOM.timelineFlow.appendChild(itemNode);
    });
}

// Toggle Selection of Update Card
function toggleCardSelection(id) {
    if (appState.selectedId === id) {
        // Deselect
        appState.selectedId = null;
    } else {
        // Select new
        appState.selectedId = id;
    }
    
    // Update active classes directly in DOM for performance
    const allCards = DOM.timelineFlow.querySelectorAll('.update-card');
    const allItems = DOM.timelineFlow.querySelectorAll('.timeline-item');
    
    allCards.forEach(card => {
        const cardId = card.getAttribute('data-id');
        if (cardId === appState.selectedId) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });
    
    allItems.forEach(item => {
        const card = item.querySelector('.update-card');
        const cardId = card.getAttribute('data-id');
        if (cardId === appState.selectedId) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
    
    updateFloatingBar();
}

function clearSelection() {
    appState.selectedId = null;
    
    const allCards = DOM.timelineFlow.querySelectorAll('.update-card');
    const allItems = DOM.timelineFlow.querySelectorAll('.timeline-item');
    
    allCards.forEach(c => c.classList.remove('selected'));
    allItems.forEach(i => i.classList.remove('selected'));
    
    updateFloatingBar();
}

// Show/Hide bottom Floating Selection Bar
function updateFloatingBar() {
    if (appState.selectedId) {
        DOM.selectionCount.textContent = "1";
        DOM.selectionText.textContent = "update selected to share";
        DOM.selectionBar.classList.add('active');
        DOM.selectionBar.style.display = 'flex';
    } else {
        DOM.selectionBar.classList.remove('active');
        // Let transition finish before hiding completely
        setTimeout(() => {
            if (!appState.selectedId) {
                DOM.selectionBar.style.display = 'none';
            }
        }, 300);
    }
}

// Open Tweet Side-drawer and prepopulate values
function openTweetComposer() {
    if (!appState.selectedId) return;
    
    const note = appState.releaseNotes.find(n => n.id === appState.selectedId);
    if (!note) return;
    
    // Populate context details
    DOM.drawerUpdateType.textContent = note.type;
    DOM.drawerUpdateType.className = `badge type-${note.normalizedType.toLowerCase()}`;
    DOM.drawerUpdateDate.textContent = note.date;
    DOM.drawerUpdateSnippet.textContent = note.text;
    
    // Set default tweet contents
    setupDefaultTweet(note);
    
    // Open drawer
    DOM.drawerOverlay.classList.add('active');
    DOM.tweetDrawer.classList.add('active');
    DOM.tweetTextarea.focus();
}

function closeTweetDrawer() {
    DOM.drawerOverlay.classList.remove('active');
    DOM.tweetDrawer.classList.remove('active');
}

// Generate the template text for Twitter
function setupDefaultTweet(note) {
    const dateStr = note.date;
    const rawText = note.text;
    const link = note.link || "https://cloud.google.com/bigquery/docs/release-notes";
    
    // Create intro emojis based on update type
    let emoji = "💡";
    if (note.normalizedType === CATEGORIES.FEATURE) emoji = "🚀 [BigQuery Feature]";
    else if (note.normalizedType === CATEGORIES.ANNOUNCEMENT) emoji = "📢 [BigQuery]";
    else if (note.normalizedType === CATEGORIES.ISSUE) emoji = "⚠️ [BigQuery Fix]";
    else if (note.normalizedType === CATEGORIES.DEPRECATION) emoji = "🛑 [BigQuery Deprecation]";
    else if (note.normalizedType === CATEGORIES.CHANGE) emoji = "🔄 [BigQuery Change]";
    
    // Character math:
    // Max standard length is 280.
    // X shortens all links to 23 characters automatically via t.co.
    // Standard template text: "[emoji] ([date]):\n\n[excerpt]\n\nRead: [link]\n#BigQuery #GoogleCloud"
    const templateFixedText = `${emoji} (${dateStr}):\n\n\n\nRead more: \n#BigQuery #GoogleCloud`;
    // Approximate length of template characters (excluding excerpt text but including 23 characters for link)
    const fixedLength = templateFixedText.length + 23;
    const maxExcerptLen = 280 - fixedLength - 5; // buffer
    
    // Truncate excerpt text to fit comfortably
    let excerpt = rawText;
    if (excerpt.length > maxExcerptLen) {
        excerpt = excerpt.substring(0, maxExcerptLen) + "...";
    }
    
    const tweetText = `${emoji} (${dateStr}):\n\n${excerpt}\n\nRead more: ${link}\n#BigQuery #GoogleCloud`;
    
    DOM.tweetTextarea.value = tweetText;
    DOM.tweetTextarea.setAttribute('data-default-text', tweetText); // Save to reset later
    
    updateCharacterCount();
}

// Count characters accurately (respecting X's 23-character link rule)
function getTwitterCharacterCount(text) {
    // Regex matching HTTP/HTTPS links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlRegex) || [];
    
    // Subtract original length of urls, then add 23 chars for each url
    let length = text.replace(urlRegex, '').length;
    length += (urls.length * 23);
    
    return length;
}

function updateCharacterCount() {
    const text = DOM.tweetTextarea.value;
    const count = getTwitterCharacterCount(text);
    
    DOM.charCount.textContent = `${count} / 280`;
    
    // Compute progress bar percentage
    const percent = Math.min((count / 280) * 100, 100);
    DOM.charProgress.style.width = `${percent}%`;
    
    // Apply styling rules on count boundaries
    if (count > 280) {
        DOM.charProgress.className = "progress-bar-fill error";
        DOM.tweetWarning.style.display = "block";
        DOM.btnPublishTweet.disabled = true;
    } else if (count > 250) {
        DOM.charProgress.className = "progress-bar-fill warning";
        DOM.tweetWarning.style.display = "none";
        DOM.btnPublishTweet.disabled = false;
    } else {
        DOM.charProgress.className = "progress-bar-fill";
        DOM.tweetWarning.style.display = "none";
        DOM.btnPublishTweet.disabled = false;
    }
}

function handleTextareaChange() {
    updateCharacterCount();
}

function resetTweetText() {
    const defaultText = DOM.tweetTextarea.getAttribute('data-default-text');
    if (defaultText) {
        DOM.tweetTextarea.value = defaultText;
        updateCharacterCount();
        showToast("Reset to default template!", "success");
    }
}

// Copy Tweet text to Clipboard
function copyTweetToClipboard() {
    const text = DOM.tweetTextarea.value;
    navigator.clipboard.writeText(text).then(() => {
        showToast("Tweet copied to clipboard!", "success");
    }).catch(err => {
        console.error("Clipboard copy error:", err);
        showToast("Failed to copy text.", "error");
    });
}

// Publish (Post intent URL) to X/Twitter
function publishTweet() {
    const text = DOM.tweetTextarea.value;
    const count = getTwitterCharacterCount(text);
    
    if (count > 280) {
        showToast("Draft exceeds 280 characters limit!", "error");
        return;
    }
    
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(twitterUrl, '_blank', 'noopener,noreferrer');
    
    showToast("Opened Twitter Share Intent!", "success");
    closeTweetDrawer();
}

// Toast notification helper
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconClass = 'fa-solid fa-circle-check';
    if (type === 'error') iconClass = 'fa-solid fa-triangle-exclamation';
    
    toast.innerHTML = `
        <i class="${iconClass}"></i>
        <span>${message}</span>
    `;
    
    DOM.toastContainer.appendChild(toast);
    
    // Automatically delete after animation
    setTimeout(() => {
        toast.remove();
    }, 5000);
}
