/* global chrome */

// =====================================================================
//  A2Z Academy – Course Backup Content‑Script (Vanilla JS)
//  v0.4 – bug‑fix & progress events
//    • IDs are normalised to *strings* so the popup’s checkbox values
//      match during selection.
//    • Emits granular progress to the popup (action: 'backupProgress').
// =====================================================================

(() => {
    if (window.__A2Z_CS_RUNNING__) return;  // idempotent
    window.__A2Z_CS_RUNNING__ = true;

    /* ---------------- constants ---------------- */
    const COURSES_API = `${location.origin}/admin/get_courses`;
    const PAGE_SIZE = 100;

    /* ---------------- helpers ---------------- */
    const toForm = obj => new URLSearchParams(obj).toString();

    async function fetchPage(start) {
        const body = toForm({
            category_id: 'all',
            status: 'all',
            instructor_id: 'all',
            price: 'all',
            ids: '1',
            start: String(start),
            length: String(PAGE_SIZE)
        });

        const r = await fetch(COURSES_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
            credentials: 'include'
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
    }

    function parseTitleCell(html) {
        const m = html.match(/href=["']([^"']+)["'][^>]*>(.*?)<\/a>/);
        if (!m) return null;
        const url = m[1];
        const title = m[2].replace(/<[^>]+>/g, '').trim();
        return { editUrl: url, title };
    }

    function extractCategory(html) {
        const m = html.match(/<span[^>]*>([^<]*)<\/span>/);
        return m ? m[1].trim() : null;
    }

    function extractSectionsAndLessonsCount(html) {
        const sectionMatch = html.match(/<b>\s*Section\s*<\/b>\s*:\s*(\d+)/i);
        const lessonMatch = html.match(/<b>\s*Lesson\s*<\/b>\s*:\s*(\d+)/i);
        if (!sectionMatch || !lessonMatch) return null;
        return {
            sectionsCount: parseInt(sectionMatch[1], 10),
            lessonsCount: parseInt(lessonMatch[1], 10)
        };
    }

    function extractPrice(html) {
        if (/\bFree\b/i.test(html)) {
            return 0;
        }
        const m = html.match(/(\d+(?:\.\d+)?)/);
        return m ? parseFloat(m[1]) : null;
    }

    function extractSectionTitle(html) {
        // Find the <div class="mb-3"> that holds the section header
        const headerDiv = html.querySelector('div.mb-3');
        if (!headerDiv) return null;

        // Get its full text, e.g. "Section 1: الكتاب"
        const fullText = headerDiv.textContent || '';

        // Split on the colon and take the part after it
        const parts = fullText.split(':');
        if (parts.length < 2) return null;

        // Return the trimmed Arabic title
        return parts[1].trim();
    }

    function extractLessonlLink(html) {
        // Find the <a> element whose onclick calls showAjaxModal
        const anchor = html.querySelector('a[onclick*="showAjaxModal"]');
        if (!anchor) return null;

        // Get the raw onclick attribute
        const onclickAttr = anchor.getAttribute('onclick') || '';

        // Use a regex to pull out the first argument (the URL)
        const m = onclickAttr.match(/showAjaxModal\(\s*['"]([^'"]+)['"]/);
        return m ? m[1] : null;
    }
    /* ---------------- course list ---------------- */
    async function getAllCourses() {
        const rows = [];
        let start = 0, total = Infinity;
        while (start < total) {
            const { data, recordsFiltered } = await fetchPage(start);
            rows.push(...data);
            if (total === Infinity) total = Number(recordsFiltered);
            start += PAGE_SIZE;
        }
        return rows.map(r => {
            const meta = parseTitleCell(r.title);
            const price = extractPrice(r.price);
            const category = extractCategory(r.category);
            const sections_lessons_count = extractSectionsAndLessonsCount(r.lesson_and_section);
            return meta ? { id: String(r.id), ...meta, price: price, category: category, ...sections_lessons_count } : null;
        }).filter(Boolean);
    }

    /* ---------------- Lesson scraper ---------------- */
    async function scrapeLesson(url) {
        // 1. fetch the modal HTML
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
        const html = await res.text();

        // 2. parse into a DOM
        const doc = new DOMParser().parseFromString(html, 'text/html');

        // 3. extract the displayed lesson type from the alert
        const alertStrong = doc.querySelector('.alert.alert-info strong');
        const lessonType = alertStrong?.textContent.trim().slice(0, -1) ?? null;

        // 4. extract the title field
        const titleInput = doc.querySelector('input[name="title"]');
        const title = titleInput?.value.trim() ?? null;


        // 5. prepare the result
        const data = { lessonType, title };

        // 6. type-specific fields
        if (/YouTube Video/i.test(lessonType)) {
            // video URL for web application
            const vidInput = doc.querySelector('input[name="video_url"]');
            data.videoUrl = vidInput?.value.trim() ?? null;
        }
        else if (/Document/i.test(lessonType)) {
            // adjust these selectors to match your Document-lesson form fields:
            const docTypeSelect = doc.querySelector('select[name="lesson_type"]');
            if (docTypeSelect) {
                data.documentType = docTypeSelect.value;
            } else {
                // maybe there's an input/url field instead
                const docUrlInput = doc.querySelector('input[name="document_url"]');
                data.documentUrl = docUrlInput?.value.trim() ?? null;
            }
        }

        return data;
    }

    /* ---------------- Course scraper ---------------- */
    const cache = {};
    async function scrapeCourse(course) {
        if (cache[course.id]) return cache[course.id];
        try {
            const r = await fetch(course.editUrl, { credentials: 'include' });
            if (!r.ok) throw new Error(r.status);
            const html = await r.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');

            let content = {};
            let sections = Array.from(doc.getElementsByClassName("col-xl-12"));
            sections = sections.slice(4, -2);

            for (let i = 0; i < sections.length; i++) {
                const title = extractSectionTitle(sections[i]);
                const lessonsElems = Array.from(sections[i].querySelectorAll('.col-md-12'));

                content[title] = await Promise.all(
                    lessonsElems.map(async lessonElem => {
                        const link = extractLessonlLink(lessonElem);
                        return scrapeLesson(link);
                    })
                );
            }
            return cache[course.id] = { title: course.title, category: course.category, price: course.price, sectionsCount: course.sectionsCount, lessonsCount: course.lessonsCount, content };
        } catch (err) {
            console.error('Scrape failed', course.title, err);
            return cache[course.id] = { title: course.title, category: course.category, price: course.price, sectionsCount: course.sectionsCount, lessonsCount: course.lessonsCount, content: [] };
        }
    }

    /* ---------------- backup ---------------- */
    async function backupSelected(ids) {
        if (!ids?.length) return;

        // ensure master list cached
        if (!window.__A2Z_COURSE_CACHE) {
            window.__A2Z_COURSE_CACHE = await getAllCourses();
        }
        const master = window.__A2Z_COURSE_CACHE;
        const targets = master.filter(c => ids.includes(c.id));
        const total = targets.length;

        let done = 0;
        const report = txt => chrome.runtime.sendMessage({ action: 'backupProgress', text: txt });

        // simple async pool limiter (5 concurrent)
        const pool = Array(5).fill(0).map(async () => {
            while (targets.length) {
                const c = targets.pop();
                await scrapeCourse(c);
                done += 1;
                report(`Scraped ${done}/${total} …`);
            }
        });
        await Promise.all(pool);

        const payload = Object.fromEntries(
            ids.map(id => [
                cache[id].title,
                {
                    category: cache[id].category,
                    price: cache[id].price,
                    sectionsCount: cache[id].sectionsCount,
                    lessonsCount: cache[id].lessonsCount,
                    content: cache[id].content
                }
            ])
        );
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const date = new Date().toISOString().slice(0, 10);

        chrome.runtime.sendMessage({
            action: 'download',
            url,
            filename: `academy-backup-${date}.json`
        });
        report('✅ Backup complete!');
    }

    /* ---------------- initial run ---------------- */
    (async () => {
        try {
            const courses = await getAllCourses();
            window.__A2Z_COURSE_CACHE = courses;
            chrome.runtime.sendMessage({ action: 'coursesList', courses });
        } catch (err) {
            chrome.runtime.sendMessage({ action: 'coursesError', message: String(err) });
        }
    })();

    /* ---------------- message listener ---------------- */
    chrome.runtime.onMessage.addListener((msg, _s, resp) => {
        if (msg?.action === 'backupSelected') {
            backupSelected(msg.ids).then(() => resp({ ok: true })).catch(e => resp({ ok: false, error: String(e) }));
            return true;
        }
    });
})();