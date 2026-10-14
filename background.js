"use strict";

// タブごとの「最後に確認したリージョン 1 件」を chrome.storage.session に持つ。
// コンソールはリージョンごとにオリジンが変わるため、ページ側ではなく拡張側に置く。
// Chrome では service worker、Firefox ではイベントページとして読み込まれる。

// content.js の REGION_RE / GLOBAL と同じ値。ビルド工程がなく共有できないため、変更時は両方直す。
const REGION_RE =
  /^[a-z]{2,4}(-[a-z]{1,8})?-(north|south|east|west|central|northeast|northwest|southeast|southwest)-\d{1,2}$/;
const GLOBAL = "Global";
// "ホスト名のリージョン/region クエリのリージョン" の 2 件までを保存できる長さ。
const MAX_LENGTH = 64;

// リージョン 1 件、または食い違い時の "a/b" 形式だけを受け付ける。
const isRegion = (value) => {
  if (typeof value !== "string" || value.length > MAX_LENGTH) return false;
  if (value === GLOBAL) return true;
  const parts = value.split("/");
  return parts.length <= 2 && parts.every((part) => REGION_RE.test(part));
};
const keyOf = (tabId) => `tab:${tabId}`;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 自拡張のコンテンツスクリプト(最上位フレーム)以外からのメッセージには応答しない。
  if (sender.id !== chrome.runtime.id) return;
  if (!Number.isInteger(sender.tab?.id) || sender.frameId !== 0) return;
  const key = keyOf(sender.tab.id);

  if (message?.type === "get") {
    chrome.storage.session.get(key, (items) => {
      const region = chrome.runtime.lastError ? null : items?.[key];
      sendResponse({ region: isRegion(region) ? region : null });
    });
    return true; // 非同期で応答する。
  }
  if (message?.type === "set" && isRegion(message.region)) {
    chrome.storage.session.set({ [key]: message.region }, () => {
      sendResponse({ ok: !chrome.runtime.lastError });
    });
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(keyOf(tabId), () => void chrome.runtime.lastError);
});
