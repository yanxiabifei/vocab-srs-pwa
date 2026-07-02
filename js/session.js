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
  this.feedbackState = null; // null | { round, correct, userChoice, correctChoice, word, meaning, phonetic }
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

// 大型干扰项词库 — 每次随机抽取，保证选项多样性
var DISTRACTOR_POOL = [
  '放弃', '获得', '申请', '达到', '影响', '包括', '提供', '接受', '允许', '避免',
  '属于', '比较', '竞争', '组成', '消费', '接触', '贡献', '创造', '决定', '发展',
  '教育', '鼓励', '建立', '估计', '存在', '解释', '表达', '形成', '产生', '增长',
  '发生', '涉及', '增加', '表明', '打算', '判断', '保持', '导致', '认识到', '代表',
  '要求', '似乎', '遭受', '支持', '认为', '对待', '理解', '使用', '重视', '实现',
  '适应', '承认', '采纳', '分析', '出现', '应用', '争论', '安排', '评估', '假定',
  '尝试', '相信', '受益', '选择', '声称', '收集', '评论', '交流', '集中', '关心',
  '连接', '考虑', '继续', '控制', '说服', '处理', '批评', '损害', '定义', '依赖',
  '描述', '设计', '渴望', '破坏', '不同意', '发现', '讨论', '展示', '区分', '分配',
  '怀疑', '强调', '享受', '检查', '经历', '实验', '探索', '失败', '恐惧', '感觉',
  '战斗', '找到', '适合', '飞行', '跟随', '禁止', '忘记', '原谅', '冻结', '聚集',
  '给予', '治理', '问候', '成长', '守卫', '引导', '发生', '憎恨', '拥有', '治愈',
  '听见', '隐藏', '打击', '握住', '希望', '狩猎', '匆忙', '想象', '进口', '改进',
  '指示', '影响', '通知', '坚持', '检查', '打算', '打断', '介绍', '发明', '邀请',
  '涉及', '孤立', '连接', '跳跃', '判断', '保持', '敲击', '知道', '缺乏', '引导',
  '学习', '离开', '说谎', '提起', '限制', '连接', '倾听', '生活', '装载', '定位',
  '锁定', '观察', '获得', '操作', '反对', '组织', '拥有', '绘画', '参与', '通过',
  '表演', '说服', '放置', '计划', '玩耍', '指出', '练习', '预测', '准备', '呈现',
  '阻止', '生产', '承诺', '保护', '证明', '提供', '出版', '追求', '提升', '到达',
  '认识', '记录', '减少', '反映', '拒绝', '关联', '释放', '移除', '重复', '取代',
  '报告', '代表', '请求', '研究', '解决', '回应', '恢复', '揭示', '回顾', '奖励',
  '保存', '搜寻', '选择', '分离', '服务', '分享', '转移', '展示', '标记', '简化',
  '唱歌', '下沉', '睡觉', '滑动', '闻起来', '微笑', '解决', '分类', '发言', '花费',
  '传播', '站立', '凝视', '陈述', '停留', '偷窃', '粘住', '停止', '奋斗', '学习',
  '提交', '成功', '遭受', '建议', '供应', '支持', '包围', '幸存', '怀疑', '游泳'
];

// 第 1 轮：见义（4 选 1）
LearningSession.prototype.getRound1Data = function() {
  var correct = this.currentWord;
  if (!correct) return null;

  // 从当前会话词库 + 大型干扰池中随机抽取
  var distractors = this._pickDistractors(correct, 3);

  var choices = [
    { text: correct.meaning, isCorrect: true, index: 0 }
  ];
  for (var i = 0; i < distractors.length; i++) {
    choices.push({ text: distractors[i], isCorrect: false, index: i + 1 });
  }

  this._shuffle(choices);
  var data = { word: correct.word, phonetic: correct.phonetic || '', meaning: correct.meaning, choices: choices };
  this._cachedRound1Data = data;
  return data;
};

LearningSession.prototype.submitRound1 = function(choiceIndex) {
  var data = this._cachedRound1Data;
  if (!data) return false;

  var isCorrect = !!(data.choices[choiceIndex] && data.choices[choiceIndex].isCorrect);

  // Find the correct choice index in the shuffled array
  var correctIdx = -1;
  for (var i = 0; i < data.choices.length; i++) {
    if (data.choices[i].isCorrect) { correctIdx = i; break; }
  }

  this.feedbackState = {
    round: 1,
    correct: isCorrect,
    userChoice: choiceIndex,
    correctChoice: correctIdx,
    word: data.word,
    meaning: data.meaning,
    phonetic: data.phonetic
  };

  return isCorrect;
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
  var correctWord = this.currentWord.word.toLowerCase();
  var isCorrect = assembled && assembled.toLowerCase() === correctWord;

  this.feedbackState = {
    round: 2,
    correct: isCorrect,
    userAnswer: assembled || '',
    correctWord: correctWord,
    meaning: this.currentWord.meaning,
    phonetic: this.currentWord.phonetic || ''
  };

  return isCorrect;
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

// 清除反馈并推进 — 由 UI 在用户点击"下一个"后调用
LearningSession.prototype.advanceAfterFeedback = function() {
  if (!this.feedbackState) return 'done';

  var wasCorrect = this.feedbackState.correct;
  this.feedbackState = null;

  if (!wasCorrect) {
    this.resetToRound1();
    return 'retry';
  }

  return this.advanceRound();
};

// 辅助方法
LearningSession.prototype._pickDistractors = function(currentWord, count) {
  var seen = {};
  var candidates = [];

  // 优先从当前会话的其他单词释义中选取
  for (var i = 0; i < this.originalQueue.length; i++) {
    var m = this.originalQueue[i].meaning;
    if (this.originalQueue[i].word !== currentWord.word && m && !seen[m]) {
      seen[m] = true;
      candidates.push(m);
    }
  }

  // 不足时从大型干扰池随机补充
  if (candidates.length < count) {
    // 每次随机打乱池子，保证不同单词看到不同干扰项
    var poolCopy = DISTRACTOR_POOL.slice();
    this._shuffle(poolCopy);
    for (var j = 0; j < poolCopy.length && candidates.length < count; j++) {
      if (!seen[poolCopy[j]]) {
        seen[poolCopy[j]] = true;
        candidates.push(poolCopy[j]);
      }
    }
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
