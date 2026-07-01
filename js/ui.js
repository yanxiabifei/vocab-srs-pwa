// ui.js - DOM rendering helpers

// ========== 主页渲染 ==========

async function renderHomePage() {
  var now = new Date();

  var newCount = await getNewWordsCount();
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

  var newCount = await getNewWordsCount();
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

  var word = currentSession.currentWord;
  var studyArea = document.getElementById('study-area');

  if (currentSession.currentRound === 1) {
    var data = currentSession.getRound1Data();
    var html = '<div class="study-card">';
    html += '<div class="word-display">' + escapeHtml(data.word) + '</div>';
    html += '<div class="round-label">第 1/3 轮 · 选择释义</div>';
    html += '<div class="choices-grid">';
    for (var i = 0; i < data.choices.length; i++) {
      html += '<button class="choice-btn" data-choice="' + i + '">' + escapeHtml(data.choices[i].text) + '</button>';
    }
    html += '</div></div>';
    studyArea.innerHTML = html;
  } else if (currentSession.currentRound === 2) {
    var data = currentSession.getRound2Data();
    var html = '<div class="study-card">';
    html += '<div class="round-label">第 2/3 轮 · 拼写单词</div>';
    html += '<div class="blocks-pool" id="blocks-pool">';
    for (var i = 0; i < data.blocks.length; i++) {
      html += '<button class="letter-block" data-block-id="' + data.blocks[i].id + '" data-block-index="' + data.blocks[i].index + '">' + escapeHtml(data.blocks[i].letter) + '</button>';
    }
    html += '</div>';
    html += '<div class="assembled-area" id="assembled-area"></div>';
    html += '<div class="hint text-secondary">' + data.wordLength + ' 个字母</div>';
    html += '</div>';
    studyArea.innerHTML = html;
  } else if (currentSession.currentRound === 3) {
    var data = currentSession.getRound3Data();
    var html = '<div class="study-card">';
    html += '<div class="word-display">' + escapeHtml(data.word) + '</div>';
    html += '<div class="round-label">第 3/3 轮 · 心中确认后揭晓</div>';
    html += '<div class="meaning-reveal" id="meaning-reveal" style="display:none">';
    html += '<div class="meaning-text">' + escapeHtml(data.meaning) + '</div>';
    if (data.phonetic) {
      html += '<div class="phonetic-text">' + escapeHtml(data.phonetic) + '</div>';
    }
    html += '</div>';
    html += '<div class="round3-actions">';
    html += '<button class="btn-main" id="btn-reveal">揭晓答案</button>';
    html += '<div class="round3-remember" id="round3-remember" style="display:none">';
    html += '<p>记住了吗？</p>';
    html += '<button class="btn-main" id="btn-remembered">记住了</button>';
    html += '<button class="btn-secondary" id="btn-forgot">没记住</button>';
    html += '</div>';
    html += '</div></div>';
    studyArea.innerHTML = html;
  }

  updateProgressBar();
}

function updateProgressBar() {
  if (!currentSession) return;
  var p = currentSession.progress;
  var pct = p.total > 0 ? Math.round(p.completed / p.total * 100) : 0;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-text').textContent = (p.completed + 1) + '/' + p.total;
}

// ========== 学习页交互处理 ==========

async function handleStudyInteraction(event) {
  var target = event.target.closest('[id], [class]');
  if (!target || !currentSession || currentSession.isDone) return;

  // 第 1 轮：选择释义
  if (target.classList.contains('choice-btn')) {
    var choiceIndex = parseInt(target.dataset.choice);
    var correct = currentSession.submitRound1(choiceIndex);
    if (correct) {
      await onRoundPassed();
    } else {
      flashElement(target, 'wrong-flash');
      setTimeout(function() {
        currentSession.resetToRound1();
        renderStudyPage();
      }, 800);
    }
  }

  // 第 2 轮：字母块点击（从池子移到拼装区）
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

    updateBlocksState();
  }

  // 第 2 轮：从已拼区域移回
  if (target.classList.contains('letter-block') && target.closest('#assembled-area')) {
    var blockId = target.dataset.blockId;
    target.remove();
    var pool = document.getElementById('blocks-pool');
    var block = document.createElement('button');
    block.className = 'letter-block';
    block.dataset.blockId = blockId;
    block.dataset.blockIndex = target.dataset.blockIndex;
    block.textContent = target.textContent;
    pool.appendChild(block);

    updateBlocksState();
  }

  // 第 3 轮：揭晓
  if (target.id === 'btn-reveal') {
    document.getElementById('meaning-reveal').style.display = 'block';
    target.style.display = 'none';
    document.getElementById('round3-remember').style.display = 'block';
  }

  // 第 3 轮：记住了/没记住
  if (target.id === 'btn-remembered' || target.id === 'btn-forgot') {
    var remembered = target.id === 'btn-remembered';
    currentSession.submitRound3(remembered);
    await onRoundPassed();
  }
}

// ========== 通用辅助函数 ==========

function updateBlocksState() {
  var pool = document.getElementById('blocks-pool');
  var assembled = document.getElementById('assembled-area');

  if (pool && pool.children.length === 0) {
    var assembledBlocks = assembled ? assembled.querySelectorAll('.letter-block') : [];
    var assembledStr = '';
    for (var i = 0; i < assembledBlocks.length; i++) {
      assembledStr += assembledBlocks[i].textContent;
    }
    var correct = currentSession.submitRound2(assembledStr);
    if (correct) {
      flashElement(assembled, 'correct-flash');
      setTimeout(function() { onRoundPassed(); }, 400);
    } else {
      flashElement(assembled, 'wrong-flash');
      setTimeout(function() {
        currentSession.resetToRound1();
        renderStudyPage();
      }, 800);
    }
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

  var area = document.getElementById('settings-area');
  var html = '';

  html += '<div class="settings-section"><div class="section-title">当前词书</div>';
  html += '<select id="select-book" class="settings-select">';
  var books = ['primary', 'junior', 'gaokao', 'cet4', 'cet6', 'postgrad'];
  var bookNames = { primary: '小学词汇', junior: '初中词汇', gaokao: '高考词汇', cet4: '四级词汇', cet6: '六级词汇', postgrad: '考研词汇' };
  for (var i = 0; i < books.length; i++) {
    var selected = books[i] === currentBook ? ' selected' : '';
    html += '<option value="' + books[i] + '"' + selected + '>' + bookNames[books[i]] + '</option>';
  }
  html += '</select>';
  html += '<div class="order-toggle">';
  html += '<button class="order-btn' + (bookOrder === 'sequential' ? ' active' : '') + '" data-order="sequential">顺序</button>';
  html += '<button class="order-btn' + (bookOrder === 'shuffled' ? ' active' : '') + '" data-order="shuffled">乱序</button>';
  html += '</div></div>';

  html += '<div class="settings-section"><div class="section-title">自定义导入</div>';
  html += '<textarea id="import-text" class="import-textarea" placeholder="粘贴包含英文单词的文本..."></textarea>';
  html += '<button id="btn-import-text" class="btn-main">从文本导入</button>';
  html += '<p class="import-hint">或</p>';
  html += '<label class="btn-main file-label">上传 TXT 文件<input type="file" id="file-upload" accept=".txt" style="display:none"></label>';
  html += '<div id="import-result"></div></div>';

  html += '<div class="settings-section"><div class="section-title">学习控制</div>';
  html += '<div class="stepper"><span>每日新学</span><button id="btn-new-minus" class="stepper-btn">-</button><span id="new-count-val">' + dailyNewCount + '</span><button id="btn-new-plus" class="stepper-btn">+</button></div>';
  html += '<div class="stepper"><span>加练数量</span><button id="btn-extra-minus" class="stepper-btn">-</button><span id="extra-count-val">' + extraCount + '</span><button id="btn-extra-plus" class="stepper-btn">+</button></div>';
  html += '</div>';

  html += '<div class="settings-section"><div class="section-title">统计</div>';
  html += '<div class="stats-row"><div class="stat-card"><div class="stat-label">已掌握</div><div class="stat-value">' + completedCount + '</div></div>';
  html += '<div class="stat-card"><div class="stat-label">待复习</div><div class="stat-value">' + reviewCount + '</div></div></div>';
  html += '</div>';

  area.innerHTML = html;
}
