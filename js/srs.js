// srs.js - 艾宾浩斯间隔重复引擎（纯函数）
var SRS_INTERVALS = {
  1:  5 * 60 * 1000,
  2:  30 * 60 * 1000,
  3:  12 * 60 * 60 * 1000,
  4:  24 * 60 * 60 * 1000,
  5:  2 * 24 * 60 * 60 * 1000,
  6:  4 * 24 * 60 * 60 * 1000,
  7:  7 * 24 * 60 * 60 * 1000,
  8:  15 * 24 * 60 * 60 * 1000,
  9:  30 * 24 * 60 * 60 * 1000,
  10: 90 * 24 * 60 * 60 * 1000,
  11: 180 * 24 * 60 * 60 * 1000,
  12: 365 * 24 * 60 * 60 * 1000,
  13: 730 * 24 * 60 * 60 * 1000,
  14: 1460 * 24 * 60 * 60 * 1000,
  15: 2920 * 24 * 60 * 60 * 1000
};
var MAX_LEVEL = 15;

function advanceLevel(currentLevel, now) {
  now = now || new Date();
  var newLevel = Math.min(currentLevel + 1, MAX_LEVEL);
  var interval = SRS_INTERVALS[newLevel];
  return new Date(now.getTime() + interval);
}

function degradeLevel(currentLevel, daysMissed, now) {
  now = now || new Date();
  var newLevel = Math.max(1, currentLevel - daysMissed);
  var interval = SRS_INTERVALS[newLevel];
  return {
    newLevel: newLevel,
    nextReview: new Date(now.getTime() + interval)
  };
}

function isReviewDue(word, now) {
  now = now || new Date();
  if (!word) return true;
  if (word.firstLearningDone != 1) return true;
  if (!word.nextReview) return true;
  var dueDate = new Date(word.nextReview);
  if (isNaN(dueDate.getTime())) return true;
  return dueDate <= now;
}

function getDaysMissed(word, now) {
  now = now || new Date();
  if (!word || !word.nextReview) return 0;
  var dueDate = new Date(word.nextReview);
  if (isNaN(dueDate.getTime())) return 0;
  if (dueDate > now) return 0;
  var dueDayEnd = new Date(dueDate);
  dueDayEnd.setHours(23, 59, 59, 999);
  if (now <= dueDayEnd) return 0;
  var diffFromDueEnd = now.getTime() - dueDayEnd.getTime();
  return Math.ceil(diffFromDueEnd / (24 * 60 * 60 * 1000));
}

function todayStart(now) {
  now = now || new Date();
  var d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}
