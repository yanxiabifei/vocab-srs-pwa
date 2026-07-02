// ui.js - DOM rendering helpers

// ========== 主页渲染 ==========

async function renderHomePage() {
  var now = new Date();
  var bookKey = await getSetting('currentBook') || 'gaokao';

  var newCount = await getNewWordsCount(bookKey);
  var reviewCount = await getPendingReviewCount(now);
  var streakDays = await getSetting('streakDays') || 0;

  document.getElementById('streak-days').textContent = streakDays;
  document.getElementById('new-count').textContent = newCount;
  document.getElementById('review-count').textContent = reviewCount;

  updateMainButton();
}

async function updateMainButton() {
  var btn = document.getElementById('btn-start');
  var now = new Date();
  var bookKey = await getSetting('currentBook') || 'gaokao';

  var newCount = await getNewWordsCount(bookKey);
  var reviewCount = await getPendingReviewCount(now);
  var hasPending = newCount > 0 || reviewCount > 0;

  if (currentSession && currentSession.isExtra) {
    var p = currentSession.progress;
    btn.textContent = '加练中 (' + p.completed + '/' + p.total + ')';
    btn.className = 'btn-main btn-extra';
  } else if (hasPending) {
    btn.textContent = '开始学习';
    btn.className = 'btn-main';
  } else {
    btn.textContent = '太棒了';
    btn.className = 'btn-main btn-done';
  }
}

// ========== 学习页渲染 ==========

async function renderStudyPage() {
  if (!currentSession || currentSession.isDone) return;

  var studyArea = document.getElementById('study-area');

  // --- 反馈状态：答题后先展示结果 ---
  if (currentSession.feedbackState) {
    studyArea.innerHTML = renderFeedbackHTML(currentSession.feedbackState);
    updateProgressBar();
    return;
  }

  // --- 正常答题状态 ---
  if (currentSession.currentRound === 1) {
    studyArea.innerHTML = renderRound1HTML();
  } else if (currentSession.currentRound === 2) {
    studyArea.innerHTML = renderRound2HTML();
  } else if (currentSession.currentRound === 3) {
    studyArea.innerHTML = renderRound3HTML();
  }

  updateProgressBar();
}

function renderRound1HTML() {
  var data = currentSession.getRound1Data();
  if (!data) return '<p class="text-secondary" style="text-align:center">加载失败</p>';

  var html = '<div class="study-card">';
  html += '<div class="word-display">' + escapeHtml(data.word) + '</div>';
  html += '<div class="round-label">第 1/3 轮 · 选择释义</div>';
  html += '<div class="choices-grid">';
  for (var i = 0; i < data.choices.length; i++) {
    html += '<button class="choice-btn" data-choice="' + i + '">' + escapeHtml(data.choices[i].text) + '</button>';
  }
  html += '</div></div>';
  return html;
}

function renderRound2HTML() {
  var data = currentSession.getRound2Data();
  if (!data) return '<p class="text-secondary" style="text-align:center">加载失败</p>';

  var html = '<div class="study-card">';
  html += '<div class="round-label">第 2/3 轮 · 拼写单词</div>';
  html += '<div class="blocks-section">';
  html += '<div class="blocks-label">可选字母</div>';
  html += '<div class="blocks-pool" id="blocks-pool">';
  for (var i = 0; i < data.blocks.length; i++) {
    html += '<button class="letter-block" data-block-id="' + data.blocks[i].id + '" data-block-index="' + data.blocks[i].index + '">' + escapeHtml(data.blocks[i].letter) + '</button>';
  }
  html += '</div>';
  html += '<div class="blocks-label">你的拼写</div>';
  html += '<div class="assembled-area" id="assembled-area"></div>';
  html += '</div>';
  html += '<button class="btn-main btn-confirm" id="btn-confirm" disabled>确认拼写</button>';
  html += '</div>';
  return html;
}

function renderRound3HTML() {
  var data = currentSession.getRound3Data();
  if (!data) return '<p class="text-secondary" style="text-align:center">加载失败</p>';

  var html = '<div class="study-card">';
  html += '<div class="word-display">' + escapeHtml(data.word) + '</div>';
  html += '<div class="round-label">第 3/3 轮 · 回忆释义</div>';
  html += '<p class="round3-hint">在心中回忆这个词的意思，然后揭晓答案</p>';
  html += '<div class="meaning-reveal" id="meaning-reveal" style="display:none">';
  html += '<div class="meaning-text">' + escapeHtml(data.meaning) + '</div>';
  if (data.phonetic) {
    html += '<div class="phonetic-text">' + escapeHtml(data.phonetic) + '</div>';
  }
  html += '</div>';
  html += '<div class="round3-actions">';
  html += '<button class="btn-main" id="btn-reveal">揭晓答案</button>';
  html += '<div class="round3-remember" id="round3-remember" style="display:none">';
  html += '<p>你记住了吗？</p>';
  html += '<button class="btn-main btn-remembered" id="btn-remembered">记住了 ✓</button>';
  html += '<button class="btn-secondary btn-forgot" id="btn-forgot">没记住，再练一次</button>';
  html += '</div>';
  html += '</div></div>';
  return html;
}

function renderFeedbackHTML(fb) {
  var html = '<div class="study-card">';

  // Icon + result text
  if (fb.correct) {
    html += '<div class="feedback-icon feedback-icon-ok">✓</div>';
  } else {
    html += '<div class="feedback-icon feedback-icon-ng">✗</div>';
  }

  html += '<div class="feedback-word">' + escapeHtml(fb.word) + '</div>';

  if (fb.phonetic) {
    html += '<div class="feedback-phonetic">' + escapeHtml(fb.phonetic) + '</div>';
  }

  html += '<div class="feedback-meaning">' + escapeHtml(fb.meaning) + '</div>';

  // Detail based on round
  if (fb.round === 1) {
    html += '<div class="feedback-detail">你的选择：<span class="' + (fb.correct ? 'text-ok' : 'text-ng') + '">' + escapeHtml(currentSession._cachedRound1Data.choices[fb.userChoice].text) + '</span></div>';
    if (!fb.correct) {
      html += '<div class="feedback-detail">正确答案：<span class="text-ok">' + escapeHtml(currentSession._cachedRound1Data.choices[fb.correctChoice].text) + '</span></div>';
    }
  } else if (fb.round === 2) {
    html += '<div class="feedback-detail">你的拼写：<span class="' + (fb.correct ? 'text-ok' : 'text-ng') + '">' + escapeHtml(fb.userAnswer) + '</span></div>';
    if (!fb.correct) {
      html += '<div class="feedback-detail">正确拼写：<span class="text-ok">' + escapeHtml(fb.correctWord) + '</span></div>';
    }
  }

  // Next button
  html += '<button class="btn-main btn-next" id="btn-next-word">';
  if (fb.correct) {
    html += currentSession.currentRound === 3 ? '下一个单词 →' : '下一步 →';
  } else {
    html += '重新来过 →';
  }
  html += '</button>';

  html += '</div>';
  return html;
}

function updateProgressBar() {
  if (!currentSession) return;
  var p = currentSession.progress;
  var pct = p.total > 0 ? Math.round(p.completed / p.total * 100) : 0;
  var fill = document.getElementById('progress-fill');
  var text = document.getElementById('progress-text');
  if (fill) fill.style.width = pct + '%';
  if (text) text.textContent = (p.completed + 1) + '/' + p.total;
}

// ========== 学习页交互处理 ==========

async function handleStudyInteraction(event) {
  var target = event.target.closest('[id], [class]');
  if (!target || !currentSession || currentSession.isDone) return;

  // --- 反馈状态按钮 ---
  if (target.id === 'btn-next-word') {
    var result = currentSession.advanceAfterFeedback();
    if (result === 'retry') {
      // 答错 — 重新渲染当前轮（回到第 1 轮）
      currentSession._cachedRound1Data = null;
      renderStudyPage();
      return;
    }
    if (result === 'session_done') {
      currentSession = null;
      showView('home');
      await renderHomePage();
      scheduleNotification();
      return;
    }
    if (result === 'word_done') {
      // advanceAfterFeedback already advanced — for completed word
      // Actually, advanceAfterFeedback calls advanceRound which handles completedCount++
      // But wait, for round 3, submitRound3 is called separately, then we call advanceAfterFeedback
      // which just calls advanceRound(). So for a correct round 3 answer, it goes to word_done/session_done.
      // But there's a subtlety: for round 3, we go from feedback → need to also log the review.
      // Actually, let me re-examine the flow...
    }
    // advanceAfterFeedback can return: 'retry', 'next_round', 'word_done', 'session_done'
    if (result === 'next_round') {
      renderStudyPage();
      return;
    }
    // word_done: word's 3 rounds complete, save SRS progress
    if (result === 'word_done') {
      var word = currentSession.queue[currentSession.currentIndex];
      if (word && !currentSession.isExtra) {
        await completeWordReview(word);
      }
      // Move to next word; check if session is over
      if (!currentSession.nextWord()) {
        currentSession = null;
        showView('home');
        await renderHomePage();
        scheduleNotification();
        return;
      }
      renderStudyPage();
      return;
    }
    // session_done fallback — shouldn't normally reach here
    if (result === 'session_done') {
      var w = currentSession.queue[currentSession.currentIndex];
      if (w && !currentSession.isExtra) {
        await completeWordReview(w);
      }
      currentSession = null;
      showView('home');
      await renderHomePage();
      scheduleNotification();
      return;
    }
    renderStudyPage();
    return;
  }

  // --- Round 1: 选择释义 ---
  if (target.classList.contains('choice-btn') && currentSession.currentRound === 1 && !currentSession.feedbackState) {
    var choiceIndex = parseInt(target.dataset.choice);
    currentSession.submitRound1(choiceIndex);
    renderStudyPage();
    return;
  }

  // --- Round 2: 字母块从池子移到拼装区 ---
  if (target.classList.contains('letter-block') && target.closest('#blocks-pool')) {
    var blockId = target.dataset.blockId;
    var blockIndex = target.dataset.blockIndex;
    var letter = target.textContent;

    target.remove();
    var assembled = document.getElementById('assembled-area');
    var block = document.createElement('button');
    block.className = 'letter-block assembled';
    block.dataset.blockId = blockId;
    block.dataset.blockIndex = blockIndex;
    block.textContent = letter;
    assembled.appendChild(block);

    updateConfirmButton();
    return;
  }

  // --- Round 2: 从拼装区移回池子 ---
  if (target.classList.contains('letter-block') && target.closest('#assembled-area')) {
    var blockId = target.dataset.blockId;
    var blockIndex = target.dataset.blockIndex;
    var letter = target.textContent;
    target.remove();

    var pool = document.getElementById('blocks-pool');
    var block = document.createElement('button');
    block.className = 'letter-block';
    block.dataset.blockId = blockId;
    block.dataset.blockIndex = blockIndex;
    block.textContent = letter;
    pool.appendChild(block);

    updateConfirmButton();
    return;
  }

  // --- Round 2: 确认按钮 ---
  if (target.id === 'btn-confirm' && currentSession.currentRound === 2 && !currentSession.feedbackState) {
    var assembledBlocks = document.getElementById('assembled-area').querySelectorAll('.letter-block');
    var assembledStr = '';
    for (var i = 0; i < assembledBlocks.length; i++) {
      assembledStr += assembledBlocks[i].textContent;
    }
    if (!assembledStr) return;
    currentSession.submitRound2(assembledStr);
    renderStudyPage();
    return;
  }

  // --- Round 3: 揭晓 ---
  if (target.id === 'btn-reveal') {
    document.getElementById('meaning-reveal').style.display = 'block';
    target.style.display = 'none';
    document.getElementById('round3-remember').style.display = 'flex';
    return;
  }

  // --- Round 3: 记住了/没记住 ---
  if (target.id === 'btn-remembered' || target.id === 'btn-forgot') {
    var remembered = target.id === 'btn-remembered';
    currentSession.submitRound3(remembered);

    // Build feedback state for round 3
    var r3 = currentSession.getRound3Data();
    currentSession.feedbackState = {
      round: 3,
      correct: remembered,
      word: r3.word,
      meaning: r3.meaning,
      phonetic: r3.phonetic
    };
    renderStudyPage();
    return;
  }
}

// ========== 通用辅助函数 ==========

function updateConfirmButton() {
  var assembled = document.getElementById('assembled-area');
  var btn = document.getElementById('btn-confirm');
  if (!btn) return;
  if (assembled && assembled.children.length > 0) {
    btn.disabled = false;
    btn.classList.add('btn-confirm-ready');
  } else {
    btn.disabled = true;
    btn.classList.remove('btn-confirm-ready');
  }
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function flashElement(el, cls) {
  el.classList.add(cls);
  setTimeout(function() { el.classList.remove(cls); }, 600);
}

// ========== 词库管理页渲染 ==========

async function renderSettingsPage() {
  var currentBook = await getSetting('currentBook') || 'gaokao';
  var bookOrder = await getSetting('bookOrder') || 'sequential';
  var dailyNewCount = await getSetting('dailyNewCount') || 5;
  var extraCount = await getSetting('extraCount') || 10;
  var completedCount = await getCompletedWordsCount();
  var allWords = await getAllWords();
  var reviewCount = allWords.filter(function(w) { return w.firstLearningDone === 1 && w.srsLevel < 4; }).length;
  var customBooks = await getAllWordbooks();

  var area = document.getElementById('settings-area');
  var html = '';

  // --- 词书选择 ---
  html += '<div class="settings-section"><div class="section-title">当前词书</div>';
  html += '<select id="select-book" class="settings-select">';

  // Built-in books
  var books = ['primary', 'junior', 'gaokao', 'cet4', 'cet6', 'postgrad'];
  var bookNames = { primary: '小学词汇', junior: '初中词汇', gaokao: '高考词汇', cet4: '四级词汇', cet6: '六级词汇', postgrad: '考研词汇' };
  html += '<optgroup label="内置词书">';
  for (var i = 0; i < books.length; i++) {
    var sel = books[i] === currentBook ? ' selected' : '';
    html += '<option value="' + books[i] + '"' + sel + '>' + bookNames[books[i]] + '</option>';
  }
  html += '</optgroup>';

  // Custom wordbooks
  if (customBooks.length > 0) {
    html += '<optgroup label="自定义词书">';
    for (var c = 0; c < customBooks.length; c++) {
      var cb = customBooks[c];
      var cSel = cb.key === currentBook ? ' selected' : '';
      html += '<option value="' + cb.key + '"' + cSel + '>' + cb.name + ' (' + cb.wordList.length + '词)</option>';
    }
    html += '</optgroup>';
  }
  html += '</select>';

  html += '<div class="order-toggle">';
  html += '<button class="order-btn' + (bookOrder === 'sequential' ? ' active' : '') + '" data-order="sequential">顺序</button>';
  html += '<button class="order-btn' + (bookOrder === 'shuffled' ? ' active' : '') + '" data-order="shuffled">乱序</button>';
  html += '</div></div>';

  // --- 自定义导入 ---
  html += '<div class="settings-section"><div class="section-title">自定义导入</div>';
  html += '<p class="import-desc">导入后生成新的自定义词书，可在上方词书列表中选择使用。</p>';
  html += '<textarea id="import-text" class="import-textarea" placeholder="粘贴包含英文单词的文本..."></textarea>';
  html += '<button id="btn-import-text" class="btn-main import-btn">从文本导入</button>';
  html += '<div class="import-divider"><span>或</span></div>';
  html += '<label class="file-label import-btn">上传 TXT 文件<input type="file" id="file-upload" accept=".txt"></label>';
  html += '<div id="import-result" class="import-result"></div></div>';

  // --- 学习控制 ---
  html += '<div class="settings-section"><div class="section-title">学习控制</div>';
  html += '<div class="stepper"><span class="stepper-label">每日新学</span><div class="stepper-controls"><button id="btn-new-minus" class="stepper-btn">-</button><span class="stepper-value" id="new-count-val">' + dailyNewCount + '</span><button id="btn-new-plus" class="stepper-btn">+</button></div></div>';
  html += '<div class="stepper"><span class="stepper-label">加练数量</span><div class="stepper-controls"><button id="btn-extra-minus" class="stepper-btn">-</button><span class="stepper-value" id="extra-count-val">' + extraCount + '</span><button id="btn-extra-plus" class="stepper-btn">+</button></div></div>';
  html += '</div>';

  // --- 统计 ---
  html += '<div class="settings-section"><div class="section-title">统计</div>';
  html += '<div class="stats-row"><div class="stat-card"><div class="stat-label">已掌握</div><div class="stat-value">' + completedCount + '</div></div>';
  html += '<div class="stat-card"><div class="stat-label">待复习</div><div class="stat-value">' + reviewCount + '</div></div></div>';
  html += '</div>';

  // --- 安装应用 ---
  html += '<div class="settings-section"><div class="section-title">应用</div>';
  html += '<p class="import-desc">将应用安装到手机桌面，离线也能用。</p>';
  html += '<button id="btn-install-app" class="btn-main install-app-btn">安装到手机</button>';
  html += '</div>';

  area.innerHTML = html;
}
