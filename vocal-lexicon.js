/*
 * CMU Pronouncing Dictionary (CMUdict) data, full English-word subset.
 * Source: Carnegie Mellon University Speech Group, CMUdict.
 * Dataset includes 125,093 normalized headwords and 134,119 listed pronunciations.
 * Alternate pronunciations are retained for 8,365 headwords.
 * The dictionary data carries the CMU redistribution notice below; this file
 * contains dictionary data only, not GPL-licensed Python wrapper code.
 * Data encoding: sorted word table + one-character ARPABET phone codes.
 */
/* CMUdict data license:
 * Copyright (C) 1993-2015 Carnegie Mellon University. All rights reserved.
 * * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 *    The contents of this file are deemed to be source code.
 * * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in
 *    the documentation and/or other materials provided with the
 *    distribution.
 * * This work was supported in part by funding from the Defense Advanced
 * Research Projects Agency, the Office of Naval Research and the National
 * Science Foundation of the United States of America, and by member
 * companies of the Carnegie Mellon Sphinx Speech Consortium. We acknowledge
 * the contributions of many volunteers to the expansion and improvement of
 * this dictionary.
 * * THIS SOFTWARE IS PROVIDED BY CARNEGIE MELLON UNIVERSITY ``AS IS'' AND
 * ANY EXPRESSED OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
 * THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL CARNEGIE MELLON UNIVERSITY
 * NOR ITS EMPLOYEES BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
(() => {
  'use strict';
  const DATA_FILE = 'vocal-lexicon-data.json';
  const DATA_SHA256 = '0a9c758a0ca06a83ca318d8bb38e8703518a5a4b705a449be45be0914bfeb5ee';
  const DATA_SRI = 'sha256-Cpx1igygaoPKMY2Ls46HA1GKWktwWkSb5FvgkUv+te4=';
  const MAX_DECLARED_DATA_BYTES = 4 * 1024 * 1024;
  let controller = null;

  const initializeCurioidLexicon = payload => {
    const { phoneTable, words, primary, alternates, gameHeadwordData } = payload;
// Keep large newline-delimited tables packed in their source strings. A typed
// offset index replaces three 125k-element arrays of JavaScript strings.
function countLines(source) {
  let count = 1;
  for (let index = 0; index < source.length; index++) if (source.charCodeAt(index) === 10) count++;
  return count;
}
function buildLineOffsets(source, expectedCount, label) {
  const offsets = new Uint32Array(expectedCount + 1);
  let row = 0;
  offsets[row++] = 0;
  for (let index = 0; index < source.length; index++) {
    if (source.charCodeAt(index) === 10) offsets[row++] = index + 1;
  }
  if (row !== expectedCount) throw new Error(`${label} has ${row} rows; expected ${expectedCount}.`);
  offsets[expectedCount] = source.length + 1;
  return offsets;
}
const wordCount = countLines(words);
const wordOffsets = buildLineOffsets(words, wordCount, 'Word table');
const primaryOffsets = buildLineOffsets(primary, wordCount, 'Pronunciation table');
const alternateOffsets = buildLineOffsets(alternates, wordCount, 'Alternate pronunciation table');
const getLine = (source, offsets, index) => {
  if (!Number.isInteger(index) || index < 0 || index >= wordCount) return '';
  return source.slice(offsets[index], offsets[index + 1] - 1);
};
const getWord = index => getLine(words, wordOffsets, index);
const getPrimary = index => getLine(primary, primaryOffsets, index);
const getAlternate = index => getLine(alternates, alternateOffsets, index);
const decode = value => Array.from(value || '', char => phoneTable[char.charCodeAt(0) - 33]).filter(Boolean);
let alternateWordCount = 0;
for (let index = 0; index < wordCount; index++) if (alternateOffsets[index + 1] - alternateOffsets[index] > 1) alternateWordCount++;
// Compare directly against the packed word string. Binary search no longer
// allocates a temporary substring for every midpoint (important while building
// the 34k-entry shared word register and during repeated lookups).
const comparePackedWordAt = (index, target) => {
  let cursor = wordOffsets[index], end = wordOffsets[index + 1] - 1, position = 0;
  while (cursor < end && position < target.length) {
    const stored = words.charCodeAt(cursor), wanted = target.charCodeAt(position);
    if (stored !== wanted) return stored < wanted ? -1 : 1;
    cursor++; position++;
  }
  if (cursor >= end) return position >= target.length ? 0 : -1;
  return position >= target.length ? 1 : 0;
};
const findWordIndex = word => {
  let low = 0, high = wordCount - 1;
  while (low <= high) {
    const mid = (low + high) >> 1, comparison = comparePackedWordAt(mid, word);
    if (comparison === 0) return mid;
    if (comparison < 0) low = mid + 1; else high = mid - 1;
  }
  return -1;
};
// Decode only words actually requested. Each table retains a bounded cache.
function dictionaryView(variantMode = false) {
  const cache = new Map();
  const view = new Proxy(Object.create(null), {
    get(_target, key) {
      if (typeof key !== 'string') return undefined;
      if (cache.has(key)) {
        const cached = cache.get(key);
        cache.delete(key);
        cache.set(key, cached);
        return cached;
      }
      const index = findWordIndex(key);
      if (index < 0) return undefined;
      let result;
      if (variantMode) {
        const encoded = getAlternate(index);
        if (!encoded) return undefined;
        result = encoded.split('\u0001').filter(Boolean).map(decode).filter(list => list.length);
        if (!result.length) return undefined;
      } else {
        result = decode(getPrimary(index));
        if (!result.length) return undefined;
      }
      if (cache.size >= 2048) cache.delete(cache.keys().next().value);
      cache.set(key, result);
      return result;
    },
    has(_target, key) {
      if (typeof key !== 'string') return false;
      const index = findWordIndex(key);
      return index >= 0 && (!variantMode || Boolean(getAlternate(index)));
    },
    ownKeys() {
      const keys = [];
      for (let index = 0; index < wordCount; index++) {
        if (!variantMode || getAlternate(index)) keys.push(getWord(index));
      }
      return keys;
    },
    getOwnPropertyDescriptor(_target, key) {
      if (typeof key !== 'string') return undefined;
      const index = findWordIndex(key);
      if (index < 0 || (variantMode && !getAlternate(index))) return undefined;
      return { enumerable: true, configurable: true, get() { return view[key]; } };
    },
    set() { return false; }, defineProperty() { return false; }, deleteProperty() { return false; }
  });
  return view;
}
Object.freeze(phoneTable);
/*
 * Game headword subset adapted from the Brill rule-based tagger lexicon v1.14,
 * trained on the Brown Corpus and Penn Treebank. Eric Brill (1992),
 * Proceedings of the Workshop on Speech and Natural Language. Copyright 1993
 * Massachusetts Institute of Technology and University of Pennsylvania.
 * Additional entries derive from the Twitter POS Annotated Data by Kevin Gimpel,
 * Nathan Schneider, Brendan O'Connor et al. (2011), licensed CC BY 3.0 Unported.
 * Source: https://www.ark.cs.cmu.edu/TweetNLP. The filtered subset keeps
 * alphabetic common-noun, verb, adjective, adverb and interjection forms.
 * Proper-noun-only entries, punctuation and non-alphabetic tokens are excluded.
 */
const main = dictionaryView(false), extra = dictionaryView(true);
/* Require both a common lexical part-of-speech entry and a CMU pronunciation entry.
   Scan the packed source directly so the temporary 43 KB token table is not retained. */
const englishHeadwords = [];
let headwordOffset = 0;
while (headwordOffset <= gameHeadwordData.length) {
  const separator = gameHeadwordData.indexOf('\\n', headwordOffset);
  const word = gameHeadwordData.slice(headwordOffset, separator < 0 ? gameHeadwordData.length : separator);
  if (word && findWordIndex(word) >= 0) englishHeadwords.push(word);
  if (separator < 0) break;
  headwordOffset = separator + 2;
}
Object.freeze(englishHeadwords);
/** @type {Window & Record<string, any>} */
const curioidWordGlobal = window;
curioidWordGlobal.CURIOID_ENGLISH_HEADWORDS=englishHeadwords;
curioidWordGlobal.ECHONOISE_ARPA=main;curioidWordGlobal.ECHONOISE_ARPA_VARIANTS=extra;curioidWordGlobal.ECHONOISE_LEXICON_META=Object.freeze({source:'CMU Pronouncing Dictionary',entries:125093,pronunciations:134119,alternateWords:8365,locale:'US English',lazyDecode:true,cacheLimitPerTable:2048});

// Shared local word-intelligence layer. The CMU pronunciation table and the
// filtered English headword register are reused by other CURIOID environments
// without mounting the full Echonoise workstation.
const wordToolsNormalize=value=>String(value??'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim();
function wordToolsPhones(word){const key=wordToolsNormalize(word);if(!/^[a-z]+(?:'[a-z]+)?$/.test(key))return null;const found=main[key];return Array.isArray(found)&&found.length?found.slice():null;}
const wordToolsIpaMap=Object.freeze({AA:'ɑ',AE:'æ',AH:'ʌ',AO:'ɔ',AW:'aʊ',AY:'aɪ',EH:'ɛ',ER:'ɝ',EY:'eɪ',IH:'ɪ',IY:'i',OW:'oʊ',OY:'ɔɪ',UH:'ʊ',UW:'u',B:'b',CH:'tʃ',D:'d',DH:'ð',F:'f',G:'ɡ',HH:'h',JH:'dʒ',K:'k',L:'l',M:'m',N:'n',NG:'ŋ',P:'p',R:'ɹ',S:'s',SH:'ʃ',T:'t',TH:'θ',V:'v',W:'w',Y:'j',Z:'z',ZH:'ʒ'});
function wordToolsToIpa(phones){return(phones||[]).map(phone=>{const raw=String(phone||'').toUpperCase(),match=/^([A-Z]+)([012])?$/.exec(raw);if(!match)return raw.toLowerCase();const base=match[1],stress=match[2]==='1'?'ˈ':match[2]==='2'?'ˌ':'';return(/[012]$/.test(raw)?stress:'')+(wordToolsIpaMap[base]||base.toLowerCase());}).join('');}
function wordToolsInfo(word){const normalized=wordToolsNormalize(word),phones=wordToolsPhones(normalized);if(!phones)return null;const vowelIndexes=[];phones.forEach((phone,index)=>{if(/[012]$/.test(phone))vowelIndexes.push(index);});const syllables=vowelIndexes.length,stress=vowelIndexes.map(index=>phones[index].endsWith('1')?'/':phones[index].endsWith('2')?'\\':'×').join(' '),firstVowel=vowelIndexes[0],lastPrimary=[...vowelIndexes].reverse().find(index=>/[12]$/.test(phones[index]))??vowelIndexes[vowelIndexes.length-1],onset=firstVowel>0?phones.slice(0,firstVowel).join(' '):'',rhymeKey=Number.isInteger(lastPrimary)?phones.slice(lastPrimary).join(' '):'';return{word:normalized,phones,ipa:wordToolsToIpa(phones),ipaDialect:'Broad General American',syllables,stress,onset,rhymeKey};}
let wordToolsSoundIndex=null,wordToolsSoundIndexPromise=null;
function wordToolsBuildSoundIndex(){
  if(wordToolsSoundIndex)return Promise.resolve(wordToolsSoundIndex);
  if(wordToolsSoundIndexPromise)return wordToolsSoundIndexPromise;
  wordToolsSoundIndexPromise=new Promise((resolve,reject)=>{
    const rhymes=new Map(),onsets=new Map(),vowels=new Map(),stresses=new Map();let offset=0;
    const schedule = callback => {
      if (typeof requestIdleCallback === 'function') return requestIdleCallback(callback, { timeout: 80 });
      if (typeof globalThis.scheduler?.postTask === 'function') return globalThis.scheduler.postTask(callback, { priority: 'background' });
      return setTimeout(callback, 0);
    };
    const processChunk=()=>{
      try{
        const stop=Math.min(englishHeadwords.length,offset+450);
        for(;offset<stop;offset++){
          const word=englishHeadwords[offset],info=wordToolsInfo(word);if(!info)continue;
          if(info.rhymeKey){if(!rhymes.has(info.rhymeKey))rhymes.set(info.rhymeKey,[]);rhymes.get(info.rhymeKey).push(word);}
          if(info.onset){if(!onsets.has(info.onset))onsets.set(info.onset,[]);onsets.get(info.onset).push(word);}
          if(info.stress){if(!stresses.has(info.stress))stresses.set(info.stress,[]);stresses.get(info.stress).push(word);}
          const firstStressed=info.phones.find(phone=>/[12]$/.test(phone));
          if(firstStressed){const vowel=firstStressed.replace(/[012]$/,'');if(!vowels.has(vowel))vowels.set(vowel,[]);vowels.get(vowel).push(word);}
        }
        if(offset<englishHeadwords.length){schedule(processChunk);return;}
        wordToolsSoundIndex={rhymes,onsets,vowels,stresses};resolve(wordToolsSoundIndex);
      }catch(error){wordToolsSoundIndexPromise=null;reject(error);}
    };
    processChunk();
  }).catch(error=>{wordToolsSoundIndexPromise=null;throw error;});
  return wordToolsSoundIndexPromise;
}
function wordToolsSuggest(prefix,limit=12){const query=wordToolsNormalize(prefix).replace(/[^a-z]/g,'').slice(0,32);if(!query)return[];const cap=Math.max(1,Math.min(40,Number(limit)||12));let low=0,high=englishHeadwords.length;while(low<high){const mid=(low+high)>>1;if(englishHeadwords[mid]<query)low=mid+1;else high=mid;}const results=[];for(let i=low;i<englishHeadwords.length&&results.length<cap&&englishHeadwords[i].startsWith(query);i++)results.push(englishHeadwords[i]);return results;}
async function wordToolsRhymes(word,limit=16){const info=wordToolsInfo(word);if(!info?.rhymeKey)return[];const index=await wordToolsBuildSoundIndex(),found=index.rhymes.get(info.rhymeKey)||[];return found.filter(item=>item!==info.word).slice().sort((a,b)=>Math.abs(a.length-info.word.length)-Math.abs(b.length-info.word.length)||a.localeCompare(b)).slice(0,Math.max(1,Math.min(40,Number(limit)||16)));}
async function wordToolsAlliterations(word,limit=16){const info=wordToolsInfo(word);if(!info?.onset)return[];const index=await wordToolsBuildSoundIndex(),found=index.onsets.get(info.onset)||[];return found.filter(item=>item!==info.word).slice().sort((a,b)=>Math.abs(a.length-info.word.length)-Math.abs(b.length-info.word.length)||a.localeCompare(b)).slice(0,Math.max(1,Math.min(40,Number(limit)||16)));}
function wordToolsAnalyzeText(value){
  const rawText=String(value??''),maxCharacters=10000,maxTokens=1200,maxLines=96,maxLineWords=120,maxLineCharacters=600;
  const text=rawText.slice(0,maxCharacters),allLines=text.split(/\r?\n/),allTokens=[...text.matchAll(/[A-Za-z]+(?:'[A-Za-z]+)?/g)];
  const lines=allLines.slice(0,maxLines),tokens=allTokens.slice(0,maxTokens).map(match=>match[0].toLowerCase());
  const reasons=[];
  if(rawText.length>maxCharacters)reasons.push('character limit');
  if(allTokens.length>maxTokens)reasons.push('word limit');
  if(allLines.length>maxLines)reasons.push('line limit');
  const entries=tokens.map(wordToolsInfo),known=entries.filter(Boolean),unknown=[...new Set(tokens.filter((_,index)=>!entries[index]))],alliterationGroups=new Map(),assonanceGroups=new Map();
  known.forEach(info=>{if(info.onset){if(!alliterationGroups.has(info.onset))alliterationGroups.set(info.onset,[]);alliterationGroups.get(info.onset).push(info.word);}const stressed=info.phones.find(phone=>/[12]$/.test(phone));if(stressed){const vowel=stressed.replace(/[012]$/,'');if(!assonanceGroups.has(vowel))assonanceGroups.set(vowel,[]);assonanceGroups.get(vowel).push(info.word);}});
  let remainingLineWords=maxTokens;
  const lineProfiles=lines.filter(line=>line.trim()).map(line=>{
    const matches=[...(line.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)||[])],lineWordLimit=Math.max(0,Math.min(maxLineWords,remainingLineWords)),words=matches.slice(0,lineWordLimit).map(word=>word.toLowerCase());
    remainingLineWords-=words.length;
    const found=words.map(wordToolsInfo),valid=found.filter(Boolean),last=valid[valid.length-1],wordLimited=matches.length>lineWordLimit,lineLimited=line.length>maxLineCharacters;
    if(matches.length>maxLineWords||lineLimited)reasons.push('long line');
    if(wordLimited&&lineWordLimit<maxLineWords)reasons.push('word limit');
    return{line:line.slice(0,maxLineCharacters),words:words.length,known:valid.length,syllables:valid.reduce((sum,item)=>sum+item.syllables,0),stress:valid.map(item=>item.stress).filter(Boolean).join(' | '),endWord:last?.word||null,rhymeKey:last?.rhymeKey||null,truncated:wordLimited||lineLimited};
  });
  const groupList=map=>[...map.entries()].map(([sound,items])=>({sound,words:[...new Set(items)]})).filter(group=>group.words.length>1).sort((a,b)=>b.words.length-a.words.length).slice(0,8);
  const rhymeLines=new Map();lineProfiles.forEach(line=>{if(!line.rhymeKey)return;if(!rhymeLines.has(line.rhymeKey))rhymeLines.set(line.rhymeKey,[]);rhymeLines.get(line.rhymeKey).push(line.endWord);});
  return{format:'curioid-word-intelligence-report',version:3,text,tokenCount:tokens.length,availableTokenCount:allTokens.length,inputCharacterCount:rawText.length,analyzedCharacterCount:text.length,knownCount:known.length,uniqueKnownCount:new Set(known.map(item=>item.word)).size,unknownWordCount:unknown.length,unknownWords:unknown.slice(0,80),unknownWordsTruncated:unknown.length>80,wordEntriesAvailable:known.length,wordEntries:known.slice(0,200),wordEntriesTruncated:known.length>200,syllableCount:known.reduce((sum,item)=>sum+item.syllables,0),alliteration:groupList(alliterationGroups),assonance:groupList(assonanceGroups),lineProfiles,endRhymes:[...rhymeLines.entries()].map(([key,words])=>({key,words:[...new Set(words)]})).filter(group=>group.words.length>1),truncated:reasons.length>0,truncationReasons:[...new Set(reasons)],limits:{characters:maxCharacters,tokens:maxTokens,lines:maxLines,wordsPerLine:maxLineWords,charactersPerLine:maxLineCharacters,wordEntryDetails:200,unknownWordExamples:80}};
}
async function wordToolsStressMatches(pattern,limit=24){const symbols=String(pattern??'').replace(/[|,]+/g,' ').trim().split(/\s+/).filter(Boolean).flatMap(token=>[...token]).map(char=>char==='.'?'×':char);if(!symbols.length||symbols.length>12||symbols.some(char=>!['/','\\','×'].includes(char)))throw new Error('Use /, \\ and × stress symbols.');const index=await wordToolsBuildSoundIndex(),found=index.stresses.get(symbols.join(' '))||[];return found.slice(0,Math.max(1,Math.min(60,Number(limit)||24)));}
curioidWordGlobal.CURIOID_WORD_INTELLIGENCE=Object.freeze({version:'1.3.0',source:'CMUdict + filtered Brill/TweetNLP headwords; broad General American IPA',headwordCount:wordCount,pronunciationCount:134119,alternateHeadwordCount:alternateWordCount,suggestionHeadwordCount:englishHeadwords.length,lookup:wordToolsInfo,suggest:wordToolsSuggest,rhymes:wordToolsRhymes,alliterations:wordToolsAlliterations,analyzeText:wordToolsAnalyzeText,stressMatches:wordToolsStressMatches});


  };

  window.CURIOID_WORD_DATA_ABORT = () => {
    try { controller?.abort(); } catch (_) {}
  };
  window.CURIOID_WORD_DATA_READY = (async () => {
    controller = new AbortController();
    const base = window.CURIOID_PROJECT_ASSET_BASE_URL || new URL('.', document.baseURI || window.location.href).href;
    const url = new URL(DATA_FILE, base);
    url.searchParams.set('v', `sha256-${DATA_SHA256}`);
    const response = await fetch(url.href, { method:'GET', mode:'same-origin', credentials:'same-origin', cache:'default', redirect:'follow', integrity:DATA_SRI, signal:controller.signal });
    if (!response.ok) throw new Error(`Pronunciation data returned HTTP ${response.status}.`);
    const responseUrl = new URL(response.url || url.href, url.href);
    if (responseUrl.origin !== window.location.origin) throw new Error('Pronunciation data redirected away from the current site origin.');
    const declaredBytes = Number(response.headers?.get?.('content-length') || 0);
    if (declaredBytes > MAX_DECLARED_DATA_BYTES) throw new Error('Pronunciation data exceeds the 4 MB response safety limit.');
    // Fetch's native SRI verification checks the response bytes before exposing
    // them. This avoids an extra ArrayBuffer + TextDecoder copy and duplicate
    // JavaScript-side SHA-256 work for this 3 MB static dictionary.
    const data = await response.json();
    if (data?.schemaVersion !== 1 || !Array.isArray(data.phoneTable) || typeof data.words !== 'string' || typeof data.primary !== 'string' || typeof data.alternates !== 'string' || typeof data.gameHeadwordData !== 'string') throw new Error('Pronunciation data has an invalid schema.');
    initializeCurioidLexicon(data);
    return true;
  })().catch(error => {
    window.CURIOID_WORD_DATA_ERROR = String(error?.message || error).slice(0, 260);
    throw error;
  }).finally(() => {
    controller = null;
    delete window.CURIOID_WORD_DATA_ABORT;
  });
})();
