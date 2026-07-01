// session.js - 学习会话状态机
function LearningSession(words, options) {
  options = options || {};
  if (!Array.isArray(words)) throw new Error('LearningSession: words must be an array');
  this.originalQueue = words.slice();
  this.queue = words.slice();
  this.currentIndex = 0;
  this.currentRound = 1;
  this.isExtra = options.isExtra || false;
  this.completedCount = 0;
  this.totalCount = words.length;
  this._cachedRound1Data = null;
}

Object.defineProperty(LearningSession.prototype, 'currentWord', {
  get: function() {
    if (this.currentIndex >= this.queue.length) return null;
    return this.queue[this.currentIndex];
  }
});

Object.defineProperty(LearningSession.prototype, 'isDone', {
  get: function() {
    return this.currentIndex >= this.queue.length;
  }
});

Object.defineProperty(LearningSession.prototype, 'progress', {
  get: function() {
    return { completed: this.completedCount, total: this.totalCount };
  }
});

// 第 1 轮：见义（4 选 1）
LearningSession.prototype.getRound1Data = function() {
  var correct = this.currentWord;
  if (!correct) return null;

  var distractors = this._pickDistractors(correct, 3);

  var choices = [
    { text: correct.meaning, isCorrect: true }
  ];
  for (var i = 0; i < distractors.length; i++) {
    choices.push({ text: distractors[i], isCorrect: false });
  }

  this._shuffle(choices);
  var data = { word: correct.word, choices: choices };
  this._cachedRound1Data = data;
  return data;
};

LearningSession.prototype.submitRound1 = function(choiceIndex) {
  var data = this._cachedRound1Data;
  if (!data) return false;
  return !!(data.choices[choiceIndex] && data.choices[choiceIndex].isCorrect);
};

// 第 2 轮：拼字
LearningSession.prototype.getRound2Data = function() {
  var word = this.currentWord;
  if (!word) return null;

  var letters = word.word.split('');
  var blocks = [];
  for (var i = 0; i < letters.length; i++) {
    blocks.push({
      letter: letters[i],
      index: i,
      id: i + '-' + letters[i] + '-' + Math.random()
    });
  }
  this._shuffle(blocks);

  return { blocks: blocks, wordLength: letters.length };
};

LearningSession.prototype.submitRound2 = function(assembled) {
  if (!assembled) return false;
  return assembled.toLowerCase() === this.currentWord.word.toLowerCase();
};

// 第 3 轮：辨义
LearningSession.prototype.getRound3Data = function() {
  var word = this.currentWord;
  if (!word) return null;
  return { word: word.word, meaning: word.meaning, phonetic: word.phonetic };
};

LearningSession.prototype.submitRound3 = function(remembered) {
  return remembered;
};

// 流程控制
LearningSession.prototype.advanceRound = function() {
  if (this.currentRound < 3) {
    this.currentRound++;
    return 'next_round';
  }
  this.currentRound = 1;
  this.completedCount++;
  return this.isDone ? 'session_done' : 'word_done';
};

LearningSession.prototype.resetToRound1 = function() {
  var word = this.currentWord;
  this.currentRound = 1;
  this._cachedRound1Data = null;

  this.queue.splice(this.currentIndex, 1);

  var minGap = 3;
  var maxPos = this.queue.length;
  var rangeSize = maxPos - (this.currentIndex + minGap) + 1;
  var insertPos = this.currentIndex + minGap +
    (rangeSize > 0 ? Math.floor(Math.random() * rangeSize) : 0);
  insertPos = Math.min(insertPos, this.queue.length);

  this.queue.splice(insertPos, 0, word);
};

LearningSession.prototype.nextWord = function() {
  this.currentIndex++;
  this.currentRound = 1;
  this._cachedRound1Data = null;
  return !this.isDone;
};

// 辅助方法
LearningSession.prototype._pickDistractors = function(currentWord, count) {
  var seen = {};
  var candidates = [];
  for (var i = 0; i < this.originalQueue.length; i++) {
    var m = this.originalQueue[i].meaning;
    if (this.originalQueue[i].word !== currentWord.word && !seen[m]) {
      seen[m] = true;
      candidates.push(m);
    }
  }

  var fallback = ['伪造的', '捏造的', '杜撰的', '不存在的'];
  while (candidates.length < count) {
    candidates.push(fallback[candidates.length] || '未知的');
  }

  this._shuffle(candidates);
  return candidates.slice(0, count);
};

LearningSession.prototype._shuffle = function(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
};

// 全局当前会话
var currentSession = null;
