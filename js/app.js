// app.js - Application entry point
var db;
var deferredPrompt = null; // beforeinstallprompt event
var isInstalled = false;

async function init() {
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(function(e) {
        console.warn('SW registration failed:', e);
      });
    }
    // Phase 1: Open DB and init settings (required for UI)
    db = await openDB();
    await initSettings();

    // Render the home page IMMEDIATELY so the user sees a working UI,
    // even if the background data loading is slow or fails.
    renderHomePage();

    // Phase 2: Background data loading — non-blocking, won't freeze the page
    try {
      await checkDailyReset();
      await checkDegradations();
      renderHomePage(); // Re-render with updated counts
    } catch (err) {
      console.warn('Background data loading failed:', err);
      // Home page is already showing — don't hide it
    }

    startNotificationTimer();
    setupInstallPrompt();
  } catch (err) {
    console.error('Init failed:', err);
    // Only show error page if the DB/settings phase itself fails
    document.body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--color-danger)">'
      + '<h2>初始化失败</h2><p>请检查浏览器是否支持 IndexedDB，或尝试刷新页面。</p>'
      + '<p style="font-size:12px;color:var(--color-text-secondary);margin-top:12px">' + err.message + '</p></div>';
  }
}

// ========== PWA 安装处理 ==========

function setupInstallPrompt() {
  // Check if already installed
  if (window.matchMedia('(display-mode: standalone)').matches) {
    isInstalled = true;
    return;
  }

  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner(true);
  });

  window.addEventListener('appinstalled', function() {
    isInstalled = true;
    deferredPrompt = null;
    showInstallBanner(false);
  });
}

function showInstallBanner(show) {
  var banner = document.getElementById('install-banner');
  if (banner) {
    if (show) { banner.classList.add('visible'); }
    else { banner.classList.remove('visible'); }
  }
}

function triggerInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function(result) {
      if (result.outcome === 'accepted') {
        isInstalled = true;
        showInstallBanner(false);
      }
      deferredPrompt = null;
    });
  } else if (isInstalled) {
    alert('应用已安装！');
  } else {
    alert('安装暂不可用。\n\n请通过浏览器菜单选择"添加到主屏幕"或"安装应用"。\n\n如使用 Edge，请在地址栏右侧点击"应用"图标。');
  }
}

function showView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  var view = document.getElementById('view-' + viewName);
  if (view) view.classList.add('active');
}

document.addEventListener('click', async (e) => {
  var target = e.target.closest('[id]');
  if (!target) return;
  var id = target.id;

  if (id === 'btn-settings') {
    showView('settings');
    renderSettingsPage();
  } else if (id === 'btn-settings-back') {
    showView('home');
    renderHomePage();
  } else if (id === 'btn-start') {
    await handleStartButton();
  } else if (id === 'btn-study-back') {
    if (currentSession && !currentSession.isExtra) {
      currentSession = null;
    }
    showView('home');
    renderHomePage();
  } else if (id === 'btn-install') {
    triggerInstall();
  } else if (id === 'btn-install-app') {
    triggerInstall();
  }
});

document.addEventListener('DOMContentLoaded', init);

// ========== 每日逻辑 ==========

async function checkDailyReset() {
  var todayStr = new Date().toISOString().slice(0, 10);
  var lastActive = await getSetting('lastActiveDate');
  if (lastActive === todayStr) return;

  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  var yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (lastActive === yesterdayStr) {
    var streak = (await getSetting('streakDays') || 0) + 1;
    await setSetting('streakDays', streak);
  } else if (lastActive && lastActive !== todayStr) {
    await setSetting('streakDays', 0);
  } else if (!lastActive) {
    await setSetting('streakDays', 1);
  }

  var dailyNewCount = await getSetting('dailyNewCount') || 5;
  var bookKey = await getSetting('currentBook') || 'gaokao';
  var order = await getSetting('bookOrder') || 'sequential';
  await replenishNewWords(dailyNewCount, bookKey, order);

  await setSetting('lastActiveDate', todayStr);
}

async function checkDegradations() {
  var now = new Date();
  var ts = todayStart(now);

  var overdueWords = await getWordsDueForDegrade(ts);
  for (var i = 0; i < overdueWords.length; i++) {
    var word = overdueWords[i];
    var daysMissed = getDaysMissed(word, now);
    if (daysMissed > 0) {
      var result = degradeLevel(word.srsLevel, daysMissed);
      await updateWord(word.id, {
        srsLevel: result.newLevel,
        degradeCount: (word.degradeCount || 0) + daysMissed
      });
    }
  }
}

// ========== 学习会话流程 ==========

async function handleStartButton() {
  var now = new Date();
  var bookKey = await getSetting('currentBook') || 'gaokao';
  var dueReviews = await getDueReviews(now);
  var newWords = await getNewWords(await getSetting('dailyNewCount') || 5, bookKey);
  var newCount = await getNewWordsCount(bookKey);
  var reviewCount = await getPendingReviewCount(now);

  if (newCount === 0 && reviewCount === 0) {
    await startExtraSession();
    return;
  }

  var wordIds = {};
  var queue = [];

  for (var i = 0; i < dueReviews.length; i++) {
    if (!wordIds[dueReviews[i].id]) {
      wordIds[dueReviews[i].id] = true;
      queue.push(dueReviews[i]);
    }
  }
  for (var i = 0; i < newWords.length; i++) {
    if (!wordIds[newWords[i].id]) {
      wordIds[newWords[i].id] = true;
      queue.push(newWords[i]);
    }
  }

  currentSession = new LearningSession(queue);
  startSession();
}

async function startExtraSession() {
  var extraCount = await getSetting('extraCount') || 10;
  var words = await getExtraWords(extraCount);
  currentSession = new LearningSession(words, { isExtra: true });
  startSession();
}

async function startSession() {
  showView('study');
  renderStudyPage();
}

// ========== 单词复习完成回调 ==========

async function completeWordReview(word) {
  var now = new Date();

  if (word.firstLearningDone === 1) {
    var newLevel = Math.min(word.srsLevel + 1, MAX_LEVEL);
    var nextReview = new Date(now.getTime() + SRS_INTERVALS[newLevel]);
    await updateWord(word.id, {
      srsLevel: newLevel,
      nextReview: nextReview.toISOString(),
      firstLearningDone: 1
    });
  } else {
    var newLevel = 2;
    var nextReview = new Date(now.getTime() + SRS_INTERVALS[newLevel]);
    await updateWord(word.id, {
      srsLevel: newLevel,
      nextReview: nextReview.toISOString(),
      firstLearningDone: 1,
      isNewWord: 0
    });
  }

  await logReview(word.id, word.word, 'completed');
}

// ========== 学习页事件代理 ==========

document.addEventListener('click', async function(e) {
  // 先尝试 study 交互
  var studyTarget = e.target.closest('#study-area');
  if (studyTarget) {
    await handleStudyInteraction(e);
    return;
  }

  var target = e.target.closest('[id]');
  if (!target) {
    // 检查是否 order-btn
    var orderTarget = e.target.closest('[data-order]');
    if (orderTarget && orderTarget.dataset.order) {
      await setSetting('bookOrder', orderTarget.dataset.order);
      document.querySelectorAll('.order-btn').forEach(function(b) { b.classList.remove('active'); });
      orderTarget.classList.add('active');
    }
    return;
  }
  var id = target.id;

  if (id === 'btn-import-text') {
    var text = document.getElementById('import-text').value.trim();
    if (!text) return;
    document.getElementById('import-result').innerHTML = '<p class="import-loading">正在导入...</p>';
    var result = await importFromText(text);
    var msg = result.bookName
      ? '导入完成！已创建词书「' + result.bookName + '」<br>新增 ' + result.imported + ' 词，已存在 ' + result.skipped + ' 词' + (result.notFound.length > 0 ? '，' + result.notFound.length + ' 词未找到释义' : '')
      : '未提取到有效单词';
    document.getElementById('import-result').innerHTML = '<p>' + msg + '</p>';
    document.getElementById('import-text').value = '';
    // Refresh to show new custom book in dropdown
    setTimeout(function() { renderSettingsPage(); }, 600);
  }

  if (id === 'btn-new-minus' || id === 'btn-new-plus') {
    var current = await getSetting('dailyNewCount') || 5;
    var newVal = id === 'btn-new-minus' ? Math.max(1, current - 1) : Math.min(50, current + 1);
    await setSetting('dailyNewCount', newVal);
    document.getElementById('new-count-val').textContent = newVal;
  }

  if (id === 'btn-extra-minus' || id === 'btn-extra-plus') {
    var current = await getSetting('extraCount') || 10;
    var newVal = id === 'btn-extra-minus' ? Math.max(5, current - 5) : Math.min(50, current + 5);
    await setSetting('extraCount', newVal);
    document.getElementById('extra-count-val').textContent = newVal;
  }
});

document.addEventListener('change', async function(e) {
  if (e.target.id === 'select-book') {
    await setSetting('currentBook', e.target.value);
  }

  if (e.target.id === 'file-upload') {
    var file = e.target.files[0];
    if (!file) return;
    document.getElementById('import-result').innerHTML = '<p class="import-loading">正在导入...</p>';
    var result = await importFromFile(file);
    var msg = result.bookName
      ? '导入完成！已创建词书「' + result.bookName + '」<br>新增 ' + result.imported + ' 词，已存在 ' + result.skipped + ' 词' + (result.notFound.length > 0 ? '，' + result.notFound.length + ' 词未找到释义' : '')
      : '未提取到有效单词';
    document.getElementById('import-result').innerHTML = '<p>' + msg + '</p>';
    setTimeout(function() { renderSettingsPage(); }, 600);
  }
});
