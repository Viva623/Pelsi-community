// SillyTavern Community Board Extension
// Ported from RisuAI Community Board Module

const MODULE_NAME = 'community_board';
const BOARD_START = '<~ Board Start ~>';
const BOARD_END = '<~ Board End ~>';

// ===== Accumulated posts (global) =====
const allPosts = [];
globalThis.cbAllPosts = allPosts;
globalThis.allPosts = allPosts;

const POSTS_PER_PAGE = 10;

// ===== Default Settings =====
const defaultSettings = Object.freeze({
    enabled: true,
    postCount: 5,
    boardName: '자유게시판',
    readerDescription: 'The readers are South Korean otaku adult women in their 20s and 30s.',
    communityDescription: 'As this is an informal female-dominated online community, features such as South Korean internet slang, sarcasm, abbreviations, profanity, and omission of punctuation may appear.',
    maxComments: 20,
});

// ===== Settings Management =====
function getSettings() {
    const context = SillyTavern.getContext();
    if (!context.extensionSettings[MODULE_NAME]) {
        context.extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(context.extensionSettings[MODULE_NAME], key)) {
            context.extensionSettings[MODULE_NAME][key] = defaultSettings[key];
        }
    }
    return context.extensionSettings[MODULE_NAME];
}
globalThis.cbGetSettings = getSettings;

// ===== Prompt Builder =====
function buildBoardPrompt(settings) {
    const postTemplate = Array.from({ length: settings.postCount }, (_, i) => {
        const n = i + 1;
        return `POST[Post ${n} Title§Post ${n} Content§Number of comments on Post ${n}§Comments on Post ${n} (each comment separated by a § symbol. Replies start with >>. up to ${settings.maxComments})]`;
    }).join('\n');

    return `# Important Mission: Display Reader Bulletin Board
For this one time only, at the very bottom of the response, include ${settings.postCount} posts with reader reactions to this story and the comments on those posts.

## Reader Reaction Bulletin Board Guidelines
- ${settings.readerDescription}
- ${settings.communityDescription}
- If readers' opinions conflict, they may argue.
- Comments that start with >> are replies to the comment directly above them. Use these to show readers arguing, agreeing, or reacting to each other.
- Write comments in a natural Korean internet style. Examples of tone and style:
  - "아 ㅋㅋㅋㅋ 진짜 미쳤다"
  - "ㄹㅇ 이건 좀 아닌데..."
  - "헐 나만 이거 보고 심장 터질뻔했음?"
  - "ㅇㅈ 개공감 ㅠㅠ"
  - "아니 근데 이 남자 왜 이러는겨 진짜"
  - ">>ㄹㅇㅋㅋ 나도 그거 보고 소리지름"
  - ">>아 그건 좀 억까 아님?"
- Use abbreviations (ㅋㅋ, ㅠㅠ, ㄹㅇ, ㅇㅈ, ㄱㅇㄷ, ㅁㅊ, ㄴㄴ, ㅇㅇ), omit punctuation, and mix in profanity or exaggeration as real Korean community users would.
- Bulletin Board Template (Please **strictly** adhere to the following template.):

${BOARD_START}
${postTemplate}
${BOARD_END}`;
}

// ===== Board Parser =====
function parseBoard(text) {
    // 마지막 Board Start를 찾아서 파싱 (think 블록 안의 플래닝 무시)
    let startIdx = -1;
    let searchFrom = 0;
    while (true) {
        const found = text.indexOf(BOARD_START, searchFrom);
        if (found === -1) break;
        startIdx = found;
        searchFrom = found + 1;
    }

    const endIdx = text.lastIndexOf(BOARD_END);
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null;

    const boardText = text.substring(startIdx, endIdx + BOARD_END.length);
    const posts = [];
    let match;

    const regex = /POST\[([^§]+)§([^§]+)§(\d+)§([^\]]*)\]/g;
    while ((match = regex.exec(boardText)) !== null) {
        const [, title, content, commentCount, commentsRaw] = match;
        const rawComments = commentsRaw
            .split('§')
            .map(c => c.trim())
            .filter(c => c.length > 0);

        const comments = [];
        for (const raw of rawComments) {
            if (raw.startsWith('>>')) {
                const replyText = raw.substring(2).trim();
                if (comments.length > 0) {
                    if (!comments[comments.length - 1].replies) {
                        comments[comments.length - 1].replies = [];
                    }
                    comments[comments.length - 1].replies.push(replyText);
                } else {
                    comments.push({ text: replyText, replies: [] });
                }
            } else {
                comments.push({ text: raw, replies: [] });
            }
        }

        posts.push({
            title: title.trim(),
            content: content.trim(),
            commentCount: parseInt(commentCount, 10),
            comments,
        });
    }

    return posts.length > 0 ? { posts, rawBoardText: boardText } : null;
}
globalThis.parseBoard = parseBoard;

// ===== Generate stable meta for a post =====
function assignPostMeta(post) {
    if (!post._meta) {
        const baseTime = post._timestamp || Date.now();
        const postDate = new Date(baseTime);
        const hours = String(postDate.getHours()).padStart(2, '0');
        const minutes = String(postDate.getMinutes()).padStart(2, '0');

        post._meta = {
            views: Math.floor(Math.random() * 300) + 1,
            timeStr: `${hours}:${minutes}`,
        };
    }
    return post._meta;
}

// ===== Generate comment time string =====
function makeCommentTime(postTimestamp, commentIndex) {
    const offsetMs = (commentIndex + 1) * (Math.floor(Math.random() * 3) + 1) * 60000;
    const commentDate = new Date(postTimestamp + offsetMs);
    const h = String(commentDate.getHours()).padStart(2, '0');
    const m = String(commentDate.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
}

// ===== Show Board Popup =====
function showBoardPopup(settings) {
    document.querySelector('.cb-popup-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.classList.add('cb-popup-overlay');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);z-index:999999;display:flex;align-items:center;justify-content:center;overflow:visible;';

    const popup = document.createElement('div');
    popup.classList.add('cb-popup');
    popup.style.cssText = 'position:relative;width:90%;max-width:480px;height:80vh;margin:0;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.3);background:#ffffff;display:flex;flex-direction:column;';

    const closeBtn = document.createElement('button');
    closeBtn.classList.add('cb-popup-close');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:absolute;top:10px;right:12px;background:none;border:none;font-size:22px;cursor:pointer;color:#fff;z-index:10;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;';

    const contentArea = document.createElement('div');
    contentArea.classList.add('cb-popup-content');
    contentArea.style.cssText = 'flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;min-height:0;';

    popup.appendChild(closeBtn);
    popup.appendChild(contentArea);
    overlay.appendChild(popup);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);

    const escHandler = (e) => {
        if (e.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // ===== 터치 스크롤 vs 탭 구분 =====
    let touchStartY = 0;
    function addTapHandler(el, callback) {
        el.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
        }, { passive: true });
        el.addEventListener('touchend', (e) => {
            const diff = Math.abs(e.changedTouches[0].clientY - touchStartY);
            if (diff < 10) {
                e.preventDefault();
                callback();
            }
        });
        el.addEventListener('click', (e) => {
            e.preventDefault();
            callback();
        });
    }

    addTapHandler(closeBtn, () => overlay.remove());

    let currentPage = 1;

    // ===== List View =====
    function showListView(page) {
        currentPage = page;
        const totalPages = Math.max(1, Math.ceil(allPosts.length / POSTS_PER_PAGE));
        if (currentPage > totalPages) currentPage = totalPages;

        const sorted = [...allPosts].sort((a, b) => (b._timestamp || 0) - (a._timestamp || 0));
        const startIdx = (currentPage - 1) * POSTS_PER_PAGE;
        const pagePosts = sorted.slice(startIdx, startIdx + POSTS_PER_PAGE);

        let listHtml = '';
        pagePosts.forEach((post, idx) => {
            const meta = assignPostMeta(post);
            const globalIdx = allPosts.indexOf(post);
            listHtml += `
                <div class="post-item" data-post-index="${globalIdx}">
                    <div class="post-summary">
                        <div class="post-summary-content">
                            <p class="post-title">${post.title}</p>
                            <div class="post-meta">
                                <span>여시</span>
                                <span class="dot">·</span>
                                <span>${meta.timeStr}</span>
                                <span class="new-icon">N</span>
                                <span class="dot">·</span>
                                <span>조회 ${meta.views}</span>
                            </div>
                        </div>
                        <div class="comment-count">${post.commentCount}</div>
                    </div>
                </div>`;
        });

        let paginationHtml = '<div class="cb-pagination">';
        if (currentPage > 1) {
            paginationHtml += `<span class="cb-page-btn" data-page="${currentPage - 1}">‹ 이전</span>`;
        }
        for (let p = 1; p <= totalPages; p++) {
            paginationHtml += `<span class="cb-page-num ${p === currentPage ? 'cb-page-active' : ''}" data-page="${p}">${p}</span>`;
        }
        if (currentPage < totalPages) {
            paginationHtml += `<span class="cb-page-btn" data-page="${currentPage + 1}">다음 ›</span>`;
        }
        paginationHtml += '</div>';

        contentArea.innerHTML = `
            <div class="board-container">
                <header class="board-header">
                    <div class="header-left"><span>‹</span></div>
                    <h1>${settings.boardName}</h1>
                    <div class="header-icons"><span>🔔</span><span>☰</span></div>
                </header>
                <div class="board-info">
                    <p class="post-count">
                        <span class="new-text">새글</span>
                        <span class="new-posts">${Math.min(allPosts.length, 50)}</span>/${allPosts.length.toLocaleString()}
                    </p>
                    <span class="notice-link">공지 보기</span>
                </div>
                <main class="post-list">
                    ${allPosts.length === 0 ? '<div class="cb-empty">아직 게시글이 없어요</div>' : listHtml}
                </main>
                ${totalPages > 1 ? paginationHtml : ''}
            </div>`;

        contentArea.querySelectorAll('.post-item[data-post-index]').forEach(el => {
            addTapHandler(el, () => {
                const idx = parseInt(el.dataset.postIndex, 10);
                showDetailView(idx);
            });
        });

        contentArea.querySelectorAll('[data-page]').forEach(el => {
            addTapHandler(el, () => {
                const p = parseInt(el.dataset.page, 10);
                showListView(p);
                contentArea.scrollTop = 0;
            });
        });
    }

    // ===== Detail View =====
    function showDetailView(idx) {
        const post = allPosts[idx];
        if (!post) return;
        const meta = assignPostMeta(post);
        const postTime = post._timestamp || Date.now();

        let commentTimeIndex = 0;
        const commentTimes = [];
        post.comments.forEach((comment) => {
            commentTimes.push(makeCommentTime(postTime, commentTimeIndex));
            commentTimeIndex++;
            if (comment.replies) {
                for (let r = 0; r < comment.replies.length; r++) {
                    commentTimes.push(makeCommentTime(postTime, commentTimeIndex));
                    commentTimeIndex++;
                }
            }
        });

        let commentsHtml = '';
        let timeIdx = 0;
        post.comments.forEach((comment, cIdx) => {
            const isFirst = cIdx === 0;
            const cTime = commentTimes[timeIdx] || meta.timeStr;
            timeIdx++;

            commentsHtml += `
                <li class="comment-item">
                    <div class="comment-main">
                        <div class="comment-meta">
                            <strong>여시</strong>
                            <span class="new-icon">N</span>
                            <span>${cTime}</span>
                        </div>
                        <p class="comment-text">
                            ${isFirst ? '<span class="first-comment-badge">첫댓글</span> ' : ''}${comment.text}
                        </p>
                    </div>
                    <span>⋮</span>
                </li>`;

            if (comment.replies && comment.replies.length > 0) {
                for (const reply of comment.replies) {
                    const rTime = commentTimes[timeIdx] || meta.timeStr;
                    timeIdx++;

                    commentsHtml += `
                        <li class="comment-item comment-reply">
                            <div class="reply-arrow">┗</div>
                            <div class="comment-main">
                                <div class="comment-meta">
                                    <strong>여시</strong>
                                    <span class="new-icon">N</span>
                                    <span>${rTime}</span>
                                </div>
                                <p class="comment-text">${reply}</p>
                            </div>
                            <span>⋮</span>
                        </li>`;
                }
            }
        });

        contentArea.innerHTML = `
            <div class="board-container">
                <header class="board-header">
                    <div class="header-left cb-back-btn"><span>‹</span></div>
                    <h1>${settings.boardName}</h1>
                    <div class="header-icons"><span>🔔</span><span>☰</span></div>
                </header>
                <div class="detail-view">
                    <div class="detail-post-header">
                        <p class="detail-post-title">${post.title}</p>
                        <div class="detail-post-meta">
                            <strong>여시</strong>
                            <span class="dot">·</span>
                            <span>${meta.timeStr}</span>
                            <span class="dot">·</span>
                            <span>조회 ${meta.views}</span>
                        </div>
                    </div>
                    <div class="detail-post-body">
                        <p>${post.content}</p>
                    </div>
                    <div class="detail-post-actions">
                        <span>🤍 공감</span>
                        <span>💬 댓글 ${post.commentCount}</span>
                        <span>🔗 공유</span>
                    </div>
                    <div class="comments-section">
                        <div class="comments-header">
                            <div><span>💬</span>댓글 ${post.commentCount}</div>
                            <div class="bingle">↻</div>
                        </div>
                        <ul class="comment-list">
                            ${commentsHtml}
                        </ul>
                    </div>
                </div>
            </div>`;

        const backBtn = contentArea.querySelector('.cb-back-btn');
        addTapHandler(backBtn, () => showListView(currentPage));

        contentArea.scrollTop = 0;
    }

    showListView(1);
}
globalThis.showBoardPopup = showBoardPopup;

// ===== Process a single message element =====
function processMessageElement(messageElement) {
    const mesId = messageElement.getAttribute('mesid');
    if (!mesId) return;

    const context = SillyTavern.getContext();
    const chatMessage = context.chat[parseInt(mesId, 10)];
    if (!chatMessage || chatMessage.is_user) return;

    const rawMes = chatMessage.mes;
    if (!rawMes || !rawMes.includes(BOARD_START)) return;

    const parsed = parseBoard(rawMes);
    if (!parsed || parsed.posts.length === 0) return;

    // 리롤 대응: 같은 mesId의 기존 게시글 삭제
    for (let i = allPosts.length - 1; i >= 0; i--) {
        if (allPosts[i]._mesId === mesId) {
            allPosts.splice(i, 1);
        }
    }

    // 새 게시글 추가
    const mesIdNum = parseInt(mesId, 10);
    const baseTime = Date.now() - (200 - mesIdNum) * 10 * 60000;
    for (let i = 0; i < parsed.posts.length; i++) {
        const post = parsed.posts[i];
        post._mesId = mesId;
        post._timestamp = baseTime + i * (Math.floor(Math.random() * 3) + 1) * 60000;
        allPosts.push(post);
    }
    console.log(`[Community Board] ${parsed.posts.length} posts added from message #${mesId} (total: ${allPosts.length})`);

    // 화면에서 보드 텍스트 제거
    const messageText = messageElement.querySelector('.mes_text');
    if (messageText) {
        const rawHtml = messageText.innerHTML;
        const cleaned = rawHtml
            .replace(/<~\s*Board Start\s*~>[\s\S]*?<~\s*Board End\s*~>/g, '')
            .replace(/&lt;~\s*Board Start\s*~&gt;[\s\S]*?&lt;~\s*Board End\s*~&gt;/g, '')
            .replace(/~\s*Board Start\s*~[\s\S]*?~\s*Board End\s*~/g, '');
        messageText.innerHTML = cleaned;
    }

    messageElement.dataset.cbProcessed = 'true';
    updateButtonBadge();
}

// ===== Process all messages =====
function processAllMessages() {
    document.querySelectorAll('.mes:not([is_user="true"])').forEach(el => {
        processMessageElement(el);
    });
}

// ===== Update badge on button =====
function updateButtonBadge() {
    const btn = document.getElementById('community-board-btn');
    if (!btn) return;

    let badge = btn.querySelector('.cb-badge');
    const count = allPosts.length;

    if (count > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.classList.add('cb-badge');
            btn.appendChild(badge);
        }
        badge.textContent = count;
    } else if (badge) {
        badge.remove();
    }
}

// ===== Prompt Injection =====
function injectPrompt() {
    const settings = getSettings();
    const context = SillyTavern.getContext();

    if (settings.enabled) {
        let lastUserMsg = '';
        for (let i = context.chat.length - 1; i >= 0; i--) {
            if (context.chat[i].is_user) {
                lastUserMsg = context.chat[i].mes?.trim() || '';
                break;
            }
        }
        const inputText = document.getElementById('send_textarea')?.value?.trim() || '';
        const textToCheck = lastUserMsg || inputText;

        const isOOC = /^\(ooc[\s:]/i.test(textToCheck)
            || /^\(\([\s\S]*\)\)$/.test(textToCheck)
            || /^\[ooc[\s:]/i.test(textToCheck)
            || /^<ooc>/i.test(textToCheck);

        if (isOOC) {
            context.setExtensionPrompt(MODULE_NAME, '', 1, 0);
            console.log('[Community Board] OOC detected, skipping prompt injection');
            return;
        }

        const prompt = buildBoardPrompt(settings);
        context.setExtensionPrompt(MODULE_NAME, prompt, 1, 0);
        console.log('[Community Board] Prompt injected');
    } else {
        context.setExtensionPrompt(MODULE_NAME, '', 1, 0);
    }
}

// ===== Remove Board from AI Context =====
globalThis.communityBoardInterceptor = function (chat, contextSize, abort, type) {
    for (const message of chat) {
        if (message.mes && message.mes.includes(BOARD_START)) {
            const startIdx = message.mes.indexOf(BOARD_START);
            const endIdx = message.mes.indexOf(BOARD_END);
            if (startIdx !== -1 && endIdx !== -1) {
                message.mes =
                    message.mes.substring(0, startIdx).trimEnd() +
                    message.mes.substring(endIdx + BOARD_END.length).trimStart();
            }
        }
    }
};

// ===== Settings UI =====
function loadSettingsUI() {
    const settings = getSettings();

    const settingsHtml = `
    <div id="community-board-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>📋 Community Board</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="cb-setting-row">
                    <label for="cb_enabled">게시판 활성화</label>
                    <input id="cb_enabled" type="checkbox" ${settings.enabled ? 'checked' : ''} />
                </div>
                <div class="cb-setting-row">
                    <label for="cb_board_name">게시판 이름</label>
                    <input id="cb_board_name" type="text" class="text_pole" value="${settings.boardName}" />
                </div>
                <div class="cb-setting-row">
                    <label for="cb_post_count">게시글 수 (턴당)</label>
                    <input id="cb_post_count" type="number" class="text_pole" min="1" max="10" value="${settings.postCount}" />
                </div>
                <div class="cb-setting-row">
                    <label for="cb_max_comments">최대 댓글 수</label>
                    <input id="cb_max_comments" type="number" class="text_pole" min="1" max="50" value="${settings.maxComments}" />
                </div>
                <div class="cb-setting-row">
                    <label for="cb_reader_desc">독자 설정</label>
                    <textarea id="cb_reader_desc" class="text_pole" rows="2">${settings.readerDescription}</textarea>
                </div>
                <div class="cb-setting-row">
                    <label for="cb_community_desc">커뮤니티 분위기</label>
                    <textarea id="cb_community_desc" class="text_pole" rows="2">${settings.communityDescription}</textarea>
                </div>
            </div>
        </div>
    </div>`;

    $('#extensions_settings2').append(settingsHtml);

    const saveDebounced = SillyTavern.getContext().saveSettingsDebounced;

    $('#cb_enabled').on('change', function () {
        settings.enabled = !!$(this).prop('checked');
        saveDebounced();
    });

    $('#cb_board_name').on('input', function () {
        settings.boardName = String($(this).val());
        saveDebounced();
    });

    $('#cb_post_count').on('input', function () {
        settings.postCount = parseInt($(this).val(), 10) || 5;
        saveDebounced();
    });

    $('#cb_max_comments').on('input', function () {
        settings.maxComments = parseInt($(this).val(), 10) || 20;
        saveDebounced();
    });

    $('#cb_reader_desc').on('input', function () {
        settings.readerDescription = String($(this).val());
        saveDebounced();
    });

    $('#cb_community_desc').on('input', function () {
        settings.communityDescription = String($(this).val());
        saveDebounced();
    });
}

// ===== Main Button =====
function addMainButton() {
    const sendForm = document.getElementById('send_form');
    if (!sendForm) return;

    // 버튼들을 가로로 묶는 wrapper
    const wrapper = document.createElement('div');
    wrapper.id = 'cb-btn-wrapper';
    wrapper.style.cssText = 'display:flex;flex-direction:row;gap:4px;align-self:flex-start;';

    const button = document.createElement('button');
    button.id = 'community-board-btn';
    button.title = '게시판 열기';
    button.textContent = '📋';
    button.type = 'button';
    button.style.cssText = 'z-index:9999;position:relative;cursor:pointer;font-size:1.2em;padding:3px 5px;border-radius:5px;background:none;border:none;-webkit-tap-highlight-color:rgba(0,0,0,0.1);touch-action:manipulation;';

    button.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        console.log('[Community Board] Button activated!');
        if (allPosts.length > 0) {
            showBoardPopup(getSettings());
        } else {
            toastr.warning('아직 생성된 게시판이 없어요! Extensions 설정에서 게시판을 활성화하고 메시지를 보내보세요.');
        }
        return false;
    };

    wrapper.appendChild(button);
    sendForm.insertBefore(wrapper, sendForm.firstChild);
    console.log('[Community Board] Button added to send_form');
}

// ===== Main Init =====
(async function () {
    const context = SillyTavern.getContext();

    loadSettingsUI();
    addMainButton();

    context.eventSource.on(context.eventTypes.CHARACTER_MESSAGE_RENDERED, (messageIndex) => {
        setTimeout(() => {
            const messageElement = document.querySelector(`.mes[mesid="${messageIndex}"]`);
            if (messageElement) {
                processMessageElement(messageElement);
                console.log('[Community Board] Processed message #' + messageIndex);
            } else {
                console.log('[Community Board] Message element not found for #' + messageIndex);
            }
        }, 300);
    });

    context.eventSource.on(context.eventTypes.CHAT_CHANGED, () => {
        allPosts.length = 0;
        updateButtonBadge();
        setTimeout(processAllMessages, 500);
    });

    context.eventSource.on(context.eventTypes.GENERATION_STARTED, () => {
        injectPrompt();
    });

    context.eventSource.on(context.eventTypes.GENERATION_ENDED, () => {
        const ctx = SillyTavern.getContext();
        ctx.setExtensionPrompt(MODULE_NAME, '', 1, 0);
    });

    setTimeout(processAllMessages, 2000);

    // 글로벌 노출 (디버그용)
    globalThis.processAllMessages = processAllMessages;
    globalThis.processMessageElement = processMessageElement;

    console.log('[Community Board] Extension loaded!');
})();
