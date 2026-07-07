// db.js - IndexedDB 操作层
const DB_NAME = 'vocab_srs';
const DB_VERSION = 2;
var db;

// Shared utility: fetch with timeout (used by dictionary.js and wordbank.js)
function fetchWithTimeout(url, ms) {
  ms = ms || 10000;
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() {
      reject(new Error('Fetch timeout for ' + url));
    }, ms);
    fetch(url).then(function(response) {
      clearTimeout(timer);
      resolve(response);
    }).catch(function(err) {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      var oldVersion = event.oldVersion;

      if (oldVersion < 1) {
        var vocabStore = db.createObjectStore('vocabulary', {
          keyPath: 'id', autoIncrement: true
        });
        vocabStore.createIndex('word', 'word', { unique: true });
        vocabStore.createIndex('nextReview', 'nextReview');
        vocabStore.createIndex('srsLevel', 'srsLevel');
        vocabStore.createIndex('isNewWord', 'isNewWord');

        var logStore = db.createObjectStore('review_log', {
          keyPath: 'id', autoIncrement: true
        });
        logStore.createIndex('wordId', 'wordId');
        logStore.createIndex('timestamp', 'timestamp');

        db.createObjectStore('settings', { keyPath: 'key' });
        db.createObjectStore('dictionary_cache', { keyPath: 'word' });
      }

      if (oldVersion < 2) {
        var wbStore = db.createObjectStore('custom_wordbooks', { keyPath: 'key' });
        wbStore.createIndex('createdAt', 'createdAt');
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// --- Custom Wordbooks ---
async function createWordbook(name, wordList) {
  var key = 'custom_' + Date.now();
  var entry = {
    key: key,
    name: name,
    wordList: wordList,
    createdAt: new Date().toISOString()
  };
  await promisify(tx('custom_wordbooks', 'readwrite').add(entry));
  return entry;
}

async function getAllWordbooks() {
  return promisify(tx('custom_wordbooks').getAll());
}

// --- 通用事务辅助 ---
function tx(storeName, mode) {
  mode = mode || 'readonly';
  var transaction = db.transaction(storeName, mode);
  transaction.onerror = function(e) {
    console.error('Transaction error on ' + storeName + ':', transaction.error);
  };
  return transaction.objectStore(storeName);
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = function() { resolve(request.result); };
    request.onerror = function() { reject(request.error); };
  });
}

// --- Vocabulary CRUD ---
async function addWord(wordData) {
  return promisify(tx('vocabulary', 'readwrite').add(wordData));
}

async function updateWord(id, changes) {
  const store = tx('vocabulary', 'readwrite');
  const record = await promisify(store.get(id));
  if (!record) throw new Error('Word id=' + id + ' not found');
  Object.assign(record, changes);
  return promisify(store.put(record));
}

async function getWord(id) {
  return promisify(tx('vocabulary').get(id));
}

async function getWordByText(word) {
  const index = tx('vocabulary').index('word');
  return promisify(index.get(word));
}

async function getAllWords() {
  return promisify(tx('vocabulary').getAll());
}

async function getWordsByIds(ids) {
  const store = tx('vocabulary');
  const results = [];
  for (var i = 0; i < ids.length; i++) {
    var record = await promisify(store.get(ids[i]));
    if (record) results.push(record);
  }
  return results;
}

async function getDueReviews(now) {
  var index = tx('vocabulary').index('nextReview');
  var range = IDBKeyRange.upperBound(now.toISOString());
  return promisify(index.getAll(range));
}

async function getNewWords(limit, bookKey) {
  var index = tx('vocabulary').index('isNewWord');
  var range = IDBKeyRange.only(1);
  var all = await promisify(index.getAll(range));
  // Filter by book if specified
  if (bookKey) {
    all = all.filter(function(w) { return w.sourceBook === bookKey; });
  }
  all.sort(function(a, b) { return a.id - b.id; });
  return all.slice(0, limit);
}

async function getNewWordsCount(bookKey) {
  var index = tx('vocabulary').index('isNewWord');
  var range = IDBKeyRange.only(1);
  var all = await promisify(index.getAll(range));
  if (bookKey) {
    all = all.filter(function(w) { return w.sourceBook === bookKey; });
  }
  return all.length;
}

async function getCompletedWordsCount() {
  var all = await promisify(tx('vocabulary').getAll());
  return all.filter(function(w) { return w.isNewWord === 0 && w.srsLevel >= 4; }).length;
}

async function getPendingReviewCount(now) {
  var index = tx('vocabulary').index('nextReview');
  var range = IDBKeyRange.upperBound(now.toISOString());
  return promisify(index.count(range));
}

async function getWordsDueForDegrade(todayStart) {
  var index = tx('vocabulary').index('nextReview');
  var range = IDBKeyRange.upperBound(todayStart.toISOString());
  var all = await promisify(index.getAll(range));
  return all.filter(function(w) { return w.firstLearningDone === 1 && w.srsLevel > 1; });
}

// --- Review Log ---
async function logReview(wordId, word, result) {
  return promisify(tx('review_log', 'readwrite').add({
    wordId: wordId, word: word,
    timestamp: new Date().toISOString(), result: result
  }));
}

async function getReviewLogs(wordId) {
  return promisify(tx('review_log').index('wordId').getAll(IDBKeyRange.only(wordId)));
}

async function getTodayReviewCount(dateStr) {
  var index = tx('review_log').index('timestamp');
  var range = IDBKeyRange.bound(dateStr + 'T00:00:00', dateStr + 'T23:59:59');
  var all = await promisify(index.getAll(range));
  var ids = all.map(function(r) { return r.wordId; });
  return new Set(ids).size;
}

// --- Settings ---
async function getSetting(key) {
  var record = await promisify(tx('settings').get(key));
  return record ? record.value : null;
}

async function setSetting(key, value) {
  return promisify(tx('settings', 'readwrite').put({ key: key, value: value }));
}

async function initSettings() {
  var defaults = {
    dailyNewCount: 5, extraCount: 10,
    currentBook: 'gaokao', bookOrder: 'sequential',
    streakDays: 0, lastActiveDate: null, streakStartDate: null
  };
  var keys = Object.keys(defaults);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var existing = await getSetting(key);
    if (existing === null || existing === undefined) {
      await setSetting(key, defaults[key]);
    }
  }
}

// --- Dictionary Cache ---
async function getDictCache(word) {
  return promisify(tx('dictionary_cache').get(word.toLowerCase()));
}

async function setDictCache(word, meaning, phonetic) {
  return promisify(tx('dictionary_cache', 'readwrite').put({
    word: word.toLowerCase(), meaning: meaning, phonetic: phonetic
  }));
}

async function bulkSetDictCache(entries) {
  var store = tx('dictionary_cache', 'readwrite');
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    store.put({ word: e.word.toLowerCase(), meaning: e.meaning, phonetic: e.phonetic });
  }
  return new Promise((resolve, reject) => {
    store.transaction.oncomplete = resolve;
    store.transaction.onerror = function() {
      reject(store.transaction.error || new Error('bulkSetDictCache transaction failed'));
    };
  });
}
