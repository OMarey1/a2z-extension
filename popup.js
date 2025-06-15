/* global chrome */
const coursesDiv = document.getElementById('courses');
const backupBtn = document.getElementById('backup');
const statusEl = document.getElementById('status');
const selectAllBtn = document.getElementById('selectAll');
const selectNoneBtn = document.getElementById('selectNone');
const themeToggle = document.getElementById('themeToggle');
let adminTabId = null;

/* ---------- theme handling ---------- */
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
}

themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
});

/* ---------- tiny helpers ---------- */
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);
const txt = t => document.createTextNode(t);

/* ---------- bootstrap: inject scraper ---------- */
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    adminTabId = tab.id;
    chrome.scripting.executeScript({
        target: { tabId: adminTabId },
        files: ['scrape_courses.js']
    });
});

// Initialize theme
initTheme();

/* ---------- receive data / progress ---------- */
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'coursesList') renderCourseList(msg.courses);
    if (msg.action === 'backupProgress') statusEl.textContent = msg.text;
    if (msg.action === 'coursesError') statusEl.textContent = '❌ ' + msg.message;
});

/* ---------- UI builders ---------- */
function createMetaItem(icon, text) {
    const metaItem = el('div', { className: 'meta-item' });
    metaItem.innerHTML = `
        <svg viewBox="0 0 24 24">
            ${icon}
        </svg>
        <span>${text}</span>
    `;
    return metaItem;
}

function formatPrice(price) {
    if (price === 0 || price === null) return 'Free';
    return `$${price.toFixed(2)}`;
}

function renderCourseList(courses) {
    coursesDiv.innerHTML = ''; // remove "Fetching…"

    courses.forEach(({ id, title, price, category, sectionsCount, lessonsCount }) => {
        const card = el('div', { className: 'course-card' });
        
        // Create checkbox
        const checkbox = el('input', { 
            type: 'checkbox',
            value: id,
            id: `course-${id}`
        });

        // Create title
        const titleEl = el('div', { 
            className: 'course-title',
            textContent: title
        });

        // Create meta section
        const metaSection = el('div', { className: 'course-meta' });

        // Add price
        const priceEl = createMetaItem(
            '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>',
            `<span class="price ${price === 0 ? 'free' : ''}">${formatPrice(price)}</span>`
        );

        // Add category if available
        if (category) {
            const categoryEl = createMetaItem(
                '<path d="M12 2l-5.5 9h11z"/><path d="M17.5 17.5m-4.5 0a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0"/><path d="M3 13.5h8v8H3z"/>',
                category
            );
            metaSection.appendChild(categoryEl);
        }

        // Add sections count
        if (sectionsCount !== undefined) {
            const sectionsEl = createMetaItem(
                '<path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>',
                `${sectionsCount} Section${sectionsCount !== 1 ? 's' : ''}`
            );
            metaSection.appendChild(sectionsEl);
        }

        // Add lessons count
        if (lessonsCount !== undefined) {
            const lessonsEl = createMetaItem(
                '<path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>',
                `${lessonsCount} Lesson${lessonsCount !== 1 ? 's' : ''}`
            );
            metaSection.appendChild(lessonsEl);
        }

        // Add price to meta section
        metaSection.appendChild(priceEl);

        // Add click handler for the entire card
        card.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                updateCardSelection(card, checkbox.checked);
            }
        });

        // Add checkbox change handler
        checkbox.addEventListener('change', (e) => {
            updateCardSelection(card, e.target.checked);
        });

        // Assemble card
        card.appendChild(checkbox);
        card.appendChild(titleEl);
        card.appendChild(metaSection);
        coursesDiv.appendChild(card);
    });

    backupBtn.disabled = false;
}

function updateCardSelection(card, isSelected) {
    card.classList.toggle('selected', isSelected);
    updateBackupButton();
}

function updateBackupButton() {
    const selectedCount = $$('#courses input:checked').length;
    backupBtn.textContent = selectedCount 
        ? `Backup ${selectedCount} Course${selectedCount !== 1 ? 's' : ''}`
        : 'Backup Selected Courses';
}

/* ---------- toolbar buttons ---------- */
selectAllBtn.addEventListener('click', (e) => {
    e.preventDefault();
    $$('#courses input').forEach(cb => {
        cb.checked = true;
        updateCardSelection(cb.closest('.course-card'), true);
    });
});

selectNoneBtn.addEventListener('click', (e) => {
    e.preventDefault();
    $$('#courses input').forEach(cb => {
        cb.checked = false;
        updateCardSelection(cb.closest('.course-card'), false);
    });
});

/* ---------- backup button ---------- */
backupBtn.addEventListener('click', () => {
    const ids = $$('#courses input:checked').map(cb => cb.value);
    if (!ids.length) { 
        alert('Please select at least one course to backup');
        return;
    }

    statusEl.textContent = `Queued ${ids.length} course${ids.length !== 1 ? 's' : ''} for backup…`;
    backupBtn.disabled = true;

    chrome.tabs.sendMessage(adminTabId, { action: 'backupSelected', ids });
});
