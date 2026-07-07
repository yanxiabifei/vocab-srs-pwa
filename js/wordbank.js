// wordbank.js - 词书管理、导入、每日新词分配
var WORD_BOOKS = {
  primary:  { name: '小学词汇', file: 'data/wordbooks/primary.json' },
  junior:   { name: '初中词汇', file: 'data/wordbooks/junior.json' },
  gaokao:   { name: '高考词汇', file: 'data/wordbooks/gaokao.json' },
  cet4:     { name: '四级词汇', file: 'data/wordbooks/cet4.json' },
  cet6:     { name: '六级词汇', file: 'data/wordbooks/cet6.json' },
  postgrad: { name: '考研词汇', file: 'data/wordbooks/postgrad.json' }
};

async function loadWordBook(bookKey, order) {
  order = order || 'sequential';
  var book = WORD_BOOKS[bookKey];

  // Built-in book — load from JSON file
  if (book) {
    var response = await fetchWithTimeout(book.file, 15000);
    if (!response.ok) throw new Error('Failed to load ' + book.file);
    var data = await response.json();
    var words = data.words;
    if (!Array.isArray(words)) throw new Error('Invalid word book format: missing words array');
    if (order === 'shuffled') {
      for (var i = words.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = words[i]; words[i] = words[j]; words[j] = tmp;
      }
    }
    return { bookKey: bookKey, name: data.name, words: words };
  }

  // Custom book — load from wordbook metadata
  var customBooks = await getAllWordbooks();
  for (var i = 0; i < customBooks.length; i++) {
    if (customBooks[i].key === bookKey) {
      var cb = customBooks[i];
      var wordObjs = [];
      for (var w = 0; w < cb.wordList.length; w++) {
        wordObjs.push({ word: cb.wordList[w], meaning: '', phonetic: '' });
      }
      if (order === 'shuffled') {
        for (var k = wordObjs.length - 1; k > 0; k--) {
          var m = Math.floor(Math.random() * (k + 1));
          var tmp = wordObjs[k]; wordObjs[k] = wordObjs[m]; wordObjs[m] = tmp;
        }
      }
      return { bookKey: bookKey, name: cb.name, words: wordObjs };
    }
  }

  throw new Error('Unknown word book: ' + bookKey);
}

function extractWords(text) {
  var wordRegex = /\b[a-zA-Z]{2,}\b/g;
  var matches = text.match(wordRegex) || [];
  var seen = {};
  var result = [];
  for (var i = 0; i < matches.length; i++) {
    var w = matches[i].toLowerCase();
    if (!seen[w]) { seen[w] = true; result.push(w); }
  }
  return result;
}

async function importFromText(text) {
  var words = extractWords(text);
  if (words.length === 0) return { imported: 0, skipped: 0, notFound: [], bookName: null };
  return importWords(words, '文本导入');
}

async function importFromFile(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = async function(e) {
      try {
        var words = extractWords(e.target.result);
        if (words.length === 0) {
          resolve({ imported: 0, skipped: 0, notFound: [], bookName: null });
          return;
        }
        var fileName = file.name.replace(/\.(txt|text)$/i, '');
        var result = await importWords(words, fileName || '文件导入');
        resolve(result);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

async function importWords(words, label) {
  var today = new Date().toISOString().slice(0, 10);
  var bookName = label + ' ' + today;

  var imported = 0, skipped = 0;
  var notFound = [];
  var actualWordList = [];

  for (var i = 0; i < words.length; i++) {
    var word = words[i];
    var existing = await getWordByText(word);
    if (existing) { skipped++; continue; }

    var dictEntry = await lookupWord(word);
    if (!dictEntry) {
      notFound.push(word);
      actualWordList.push(word); // still track for the wordbook
      continue;
    }

    actualWordList.push(word);
  }

  if (actualWordList.length === 0) {
    return { imported: 0, skipped: skipped, notFound: notFound, bookName: null };
  }

  // Create custom wordbook
  var book = await createWordbook(bookName, actualWordList);

  // Import words with dictionary meanings
  for (var i = 0; i < actualWordList.length; i++) {
    var word = actualWordList[i];
    var dictEntry = await lookupWord(word);
    await addWord({
      word: word.toLowerCase(),
      meaning: dictEntry ? dictEntry.meaning : '(待补充)',
      phonetic: dictEntry ? (dictEntry.phonetic || '') : '',
      srsLevel: 1,
      nextReview: null,
      firstLearningDone: 0,
      isNewWord: 1,
      sourceBook: book.key,
      createdAt: new Date().toISOString(),
      degradeCount: 0
    });
    imported++;
  }

  return { imported: imported, skipped: skipped, notFound: notFound, bookName: bookName, bookKey: book.key };
}

async function replenishNewWords(dailyNewCount, bookKey, order) {
  var currentNewWords = await getNewWords(99999, bookKey);
  var unfinishedCount = currentNewWords.length;

  var needMore = dailyNewCount - unfinishedCount;
  if (needMore <= 0) return;

  var allWords = await getAllWords();
  var existingSet = {};
  for (var i = 0; i < allWords.length; i++) {
    existingSet[allWords[i].word.toLowerCase()] = true;
  }

  var book = await loadWordBook(bookKey, order);
  var freshWords = [];
  for (var i = 0; i < book.words.length; i++) {
    if (!existingSet[book.words[i].word.toLowerCase()]) {
      freshWords.push(book.words[i]);
    }
  }

  var added = 0;
  for (var i = 0; i < freshWords.length && added < needMore; i++) {
    try {
      await addWord({
        word: freshWords[i].word.toLowerCase(),
        meaning: freshWords[i].meaning || '',
        phonetic: freshWords[i].phonetic || '',
        srsLevel: 1,
        nextReview: null,
        firstLearningDone: 0,
        isNewWord: 1,
        sourceBook: bookKey,
        createdAt: new Date().toISOString(),
        degradeCount: 0
      });
      added++;
    } catch (e) {
      console.error('Failed to add word ' + freshWords[i].word + ':', e);
      continue;
    }
  }
}

async function getExtraWords(count) {
  var all = await getAllWords();
  var learned = [];
  for (var i = 0; i < all.length; i++) {
    if (all[i].firstLearningDone === 1) learned.push(all[i]);
  }

  if (learned.length === 0) {
    var newWords = [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].isNewWord === 1) newWords.push(all[i]);
    }
    return newWords.slice(0, count);
  }

  for (var i = learned.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = learned[i]; learned[i] = learned[j]; learned[j] = tmp;
  }
  return learned.slice(0, count);
}
