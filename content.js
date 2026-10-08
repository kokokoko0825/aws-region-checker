(() => {
  "use strict";

  const REGION_BUTTON = '[data-testid="awsc-nav-regions-menu-button"]';
  const REGION_RE = /^[a-z]{2}(-[a-z]+)+-\d+$/;
  const GLOBAL = "Global";
  // コンソールのパス先頭セグメント。ホスト名が us-east-1 でもリージョンを持たないサービス。
  const GLOBAL_SERVICES = new Set([
    "iam",
    "iamv2",
    "cloudfront",
    "route53",
    "organizations",
    "billing",
    "costmanagement",
  ]);
  const GLOBAL_LABELS = new Set(["global", "グローバル"]);
  // ナビ側に消され続けた場合に再挿入を打ち切り、fixed 表示へ切り替える上限。
  // 前回の挿入から NAV_INSERT_QUIET_MS 以上空いた挿入は正常な再描画とみなし、数え直す。
  const MAX_NAV_INSERTS = 20;
  const NAV_INSERT_QUIET_MS = 2000;
  const UPDATE_DELAY_MS = 200;
  // background の応答を待つ上限。超えたら確認済みなしとして表示する。
  const RESTORE_TIMEOUT_MS = 1000;
  // CSS が読み込めなくても右上に出るよう、位置だけは要素に直接指定する。
  const FALLBACK_STYLE = {
    position: "fixed",
    top: "56px",
    right: "16px",
    "z-index": "2147483647",
    margin: "0",
  };

  let host = null;
  let label = null;
  let input = null;
  let shownRegion = null;
  let navInserts = 0;
  let lastNavInsert = 0;
  let scheduled = false;
  // このタブで最後に確認したリージョン。この値を正とし、background への保存は復元用。
  let confirmed = null;
  // 最初の復元が終わるまでは描画しない(確認済みのページで一瞬表示されるのを避ける)。
  let restored = false;

  const findRegion = (parts) => parts.find((part) => REGION_RE.test(part)) ?? null;

  function getRegion() {
    if (GLOBAL_SERVICES.has(location.pathname.split("/")[1])) return GLOBAL;

    const buttonText =
      document.querySelector(REGION_BUTTON)?.textContent.trim().toLowerCase() ?? "";
    if (GLOBAL_LABELS.has(buttonText)) return GLOBAL;

    return (
      findRegion(location.hostname.split(".")) ??
      findRegion([new URLSearchParams(location.search).get("region") ?? ""]) ??
      findRegion(buttonText.split(/[^a-z0-9-]+/))
    );
  }

  function setConfirmed(region) {
    confirmed = region;
    try {
      chrome.runtime.sendMessage({ type: "set", region }, () => void chrome.runtime.lastError);
    } catch {
      // 拡張コンテキストが無効。confirmed だけで続ける。
    }
  }

  // background から確認済みリージョンを復元して描画する。
  // 応答なし・失敗時は確認済みなしとして扱い、バナーを出す。
  function restore() {
    let done = false;
    const finish = (region) => {
      if (done) return;
      done = true;
      confirmed = region;
      restored = true;
      update();
    };
    setTimeout(finish, RESTORE_TIMEOUT_MS, null);
    try {
      chrome.runtime.sendMessage({ type: "get" }, (response) => {
        finish(chrome.runtime.lastError ? null : (response?.region ?? null));
      });
    } catch {
      finish(null);
    }
  }

  function createBanner() {
    // 途中で例外が出ても半端な状態を残さないよう、組み立て終えてから変数に代入する。
    const newHost = document.createElement("div");
    const root = newHost.attachShadow({ mode: "closed" });

    const banner = document.createElement("div");
    banner.className = "banner";
    const newLabel = document.createElement("span");
    newLabel.className = "label";
    const hint = document.createElement("label");
    hint.className = "hint";
    const newInput = document.createElement("input");
    newInput.type = "text";
    newInput.autocomplete = "off";
    newInput.spellcheck = false;
    hint.append("消すにはリージョンを入力", newInput);

    newInput.addEventListener("input", () => {
      if (newInput.value.trim().toLowerCase() !== shownRegion.toLowerCase()) return;
      setConfirmed(shownRegion);
      update();
    });
    // コンソール側のキーボードショートカットが入力中に発火しないようにする。
    for (const type of ["keydown", "keypress", "keyup"]) {
      newInput.addEventListener(type, (event) => event.stopPropagation());
    }

    try {
      const style = document.createElement("link");
      style.rel = "stylesheet";
      style.href = chrome.runtime.getURL("content.css");
      root.append(style);
    } catch {
      // 拡張コンテキストが無効。無装飾のまま表示する。
    }
    banner.append(newLabel, hint);
    root.append(banner);

    host = newHost;
    label = newLabel;
    input = newInput;
  }

  function place() {
    const button =
      navInserts < MAX_NAV_INSERTS ? document.querySelector(REGION_BUTTON) : null;
    if (button) {
      if (host.nextSibling !== button) {
        const now = Date.now();
        if (now - lastNavInsert >= NAV_INSERT_QUIET_MS) navInserts = 0;
        lastNavInsert = now;
        navInserts += 1;
        button.before(host);
      }
    } else if (host.parentNode !== document.body) {
      document.body.append(host);
    }
    for (const [name, value] of Object.entries(FALLBACK_STYLE)) {
      if (button) host.style.removeProperty(name);
      else host.style.setProperty(name, value);
    }
  }

  function update() {
    if (!restored) return;
    const region = getRegion();
    if (!region || region === confirmed) {
      host?.remove();
      shownRegion = null;
      return;
    }
    if (!host) createBanner();
    if (region !== shownRegion) {
      shownRegion = region;
      label.textContent = `現在のリージョン: ${region}`;
      input.value = "";
    }
    place();
  }

  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      update();
    }, UPDATE_DELAY_MS);
  }

  // ナビの遅延描画・再描画と、SPA 遷移に伴う DOM 変化をまとめて拾う。
  new MutationObserver(scheduleUpdate).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  addEventListener("popstate", scheduleUpdate);
  addEventListener("hashchange", scheduleUpdate);
  // bfcache から復元されたページは confirmed が古いので取り直す。
  addEventListener("pageshow", (event) => {
    if (event.persisted) restore();
  });
  restore();
})();
