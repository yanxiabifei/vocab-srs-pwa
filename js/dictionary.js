// dictionary.js - 本地词典按需加载与缓存
var dictionaryLoaded = false;
var dictionaryLoadPromise = null;

async function ensureDictionaryLoaded() {
  if (dictionaryLoaded) return;
  if (dictionaryLoadPromise) return dictionaryLoadPromise;

  dictionaryLoadPromise = (async function() {
    try {
      var store = tx('dictionary_cache');
      var count = await promisify(store.count());
      if (count > 1000) {
        dictionaryLoaded = true;
        return;
      }

      var response = await fetch('data/dictionary.json');
      if (!response.ok) throw new Error('Dictionary fetch failed');
      var dict = await response.json();

      var entries = [];
      var words = Object.keys(dict);
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        entries.push({
          word: w.toLowerCase(),
          meaning: dict[w][0],
          phonetic: dict[w][1] || ''
        });
      }

      var BATCH_SIZE = 500;
      for (var i = 0; i < entries.length; i += BATCH_SIZE) {
        await bulkSetDictCache(entries.slice(i, i + BATCH_SIZE));
      }

      dictionaryLoaded = true;
      console.log('Dictionary loaded: ' + entries.length + ' entries cached');
    } catch (err) {
      console.error('Dictionary load failed:', err);
      dictionaryLoadPromise = null;
      throw err;
    }
  })();

  return dictionaryLoadPromise;
}

async function lookupWord(word) {
  var w = word.toLowerCase().trim();
  var cached = await getDictCache(w);
  if (cached) return cached;

  await ensureDictionaryLoaded();
  return await getDictCache(w);
}

async function lookupWords(words) {
  var results = {};
  for (var i = 0; i < words.length; i++) {
    var entry = await lookupWord(words[i]);
    if (entry) results[words[i]] = entry;
  }
  return results;
}
