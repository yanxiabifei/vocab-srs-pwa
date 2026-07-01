// notifications.js - 通知调度（Web Notification API）
var NOTIFICATION_INTERVAL_MS = 30 * 60 * 1000; // 30 分钟检查间隔

function requestNotificationPermission() {
  if (!('Notification' in window)) return Promise.resolve('denied');
  if (Notification.permission === 'granted') return Promise.resolve('granted');
  if (Notification.permission === 'denied') return Promise.resolve('denied');
  return Notification.requestPermission();
}

async function scheduleNotification() {
  var perm = await requestNotificationPermission();
  if (perm !== 'granted') return;

  var now = new Date();
  var pendingCount = await getPendingReviewCount(now);
  var newCount = await getNewWordsCount();
  var total = pendingCount + newCount;

  if (total === 0) return;

  var messages = [
    '\u{1F4DA} ' + total + ' 个单词等着你，现在开始复习吧！',
    '⏰ 今天的复习还没完成～还剩 ' + total + ' 个单词哦',
    '\u{1F31F} 每天一步，单词不会自己跑进脑子里！',
    '\u{1F4AA} 别拖了，' + total + ' 个单词在等你，打开就能完成！',
    '✨ 小步快跑，坚持就是胜利！还有 ' + total + ' 个单词哦～'
  ];
  var msg = messages[Math.floor(Math.random() * messages.length)];

  var title = '每日单词打卡';
  var options = {
    body: msg,
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    tag: 'vocab-review-reminder',
    requireInteraction: true,
    vibrate: [200, 100, 200]
  };

  navigator.serviceWorker.ready.then(function(reg) {
    reg.showNotification(title, options);
  }).catch(function() {
    new Notification(title, options);
  });
}

function startNotificationTimer() {
  requestNotificationPermission().then(function(perm) {
    if (perm !== 'granted') return;
    scheduleNotification();
    setInterval(function() {
      scheduleNotification();
    }, NOTIFICATION_INTERVAL_MS);
  });
}

// 每天早 9 点提醒（如果支持）
function scheduleDailyReminder() {
  var now = new Date();
  var nineAm = new Date(now);
  nineAm.setHours(9, 0, 0, 0);
  if (now > nineAm) {
    nineAm.setDate(nineAm.getDate() + 1);
  }
  var msUntil9 = nineAm.getTime() - now.getTime();

  setTimeout(function() {
    scheduleNotification();
    setInterval(function() {
      scheduleNotification();
    }, 24 * 60 * 60 * 1000);
  }, msUntil9);
}
