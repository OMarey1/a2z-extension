/* global chrome */
const coursesDiv = document.getElementById('courses');
const backupBtn = document.getElementById('backup');
const statusEl = document.getElementById('status');
let adminTabId = null;

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

/* ---------- receive data / progress ---------- */
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'coursesList') renderCourseList(msg.courses);
    if (msg.action === 'backupProgress') statusEl.textContent = msg.text;
    if (msg.action === 'coursesError') statusEl.textContent = '❌ ' + msg.message;
});

/* ---------- UI builders ---------- */
function renderCourseList(courses) {
    coursesDiv.innerHTML = '';                // remove “Fetching…”
    const toolbar = el('div', { style: 'margin-bottom:6px' });

    const linkAll = el('a', { href: '#', textContent: 'Select all' });
    const linkNone = el('a', { href: '#', textContent: 'None', style: 'margin-left:8px' });

    linkAll.onclick = e => { e.preventDefault(); $$('#courses input').forEach(cb => cb.checked = true); };
    linkNone.onclick = e => { e.preventDefault(); $$('#courses input').forEach(cb => cb.checked = false); };

    toolbar.append(linkAll, linkNone);
    coursesDiv.append(toolbar);

    courses.forEach(({ id, title }) => {
        const label = el('label');
        label.append(
            el('input', { type: 'checkbox', value: id }),
            txt(' ' + title)
        );
        coursesDiv.append(label);
    });

    backupBtn.disabled = false;
}

/* ---------- button ---------- */
backupBtn.addEventListener('click', () => {
    const ids = $$('#courses input:checked').map(cb => cb.value);   // *** string IDs ***
    if (!ids.length) { alert('Pick at least one course'); return; }

    statusEl.textContent = `Queued ${ids.length} course(s)…`;
    backupBtn.disabled = true;

    chrome.tabs.sendMessage(adminTabId, { action: 'backupSelected', ids });
});
