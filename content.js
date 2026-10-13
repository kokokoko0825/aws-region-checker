(() => {
  "use strict";

  const REGION_BUTTON = '[data-testid="awsc-nav-regions-menu-button"]';
  // リージョンボタンを含むナビバー要素。下端をバナーの top に使う。
  const NAV_BAR = "#awsc-nav-header, header, nav";
  // ナビバー直下の帯(ハンバーガーメニューと情報アイコンが載る行)。バナーの上端と高さを合わせる。
  // クラス名の末尾はビルドごとに変わるハッシュなので、前方部分で一致させる。
  const TOOLBAR = '[class*="awsui_toolbar-container"]';
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
  const UPDATE_DELAY_MS = 200;
  // background の応答を待つ上限。超えたら確認済みなしとして表示する。
  const RESTORE_TIMEOUT_MS = 1000;
  // リージョンボタンが見つからないときの位置。
  const FALLBACK_TOP = 56;
  const FALLBACK_RIGHT = 16;
  // ナビバー要素を特定できないとき、ボタン下端との間に空ける余白。
  const BUTTON_GAP = 4;
  // ボタンが右端に寄っていても画面外に出さないための right の下限。
  const MIN_RIGHT = 8;
  // バナーの文字サイズをページの見出しに合わせる。先に見つかったタグを使う。
  const HEADING_TAGS = ["h2", "h3"];
  // 見出しがないときの文字サイズ(px)。Cloudscape の h2 相当。
  const FALLBACK_FONT_SIZE = 20;
  // 見出しのサイズが異常でもバナーが崩れないための範囲(px)。
  const MIN_FONT_SIZE = 16;
  const MAX_FONT_SIZE = 24;
  // ツールバーの高さに収めるために下げるときの下限(px)。
  const FIT_MIN_FONT_SIZE = 12;
  // 1 行の高さ = 文字サイズ × 行高 + 入力欄の上下余白と枠。content.css の input と合わせる。
  const LINE_HEIGHT = 1.3;
  const INPUT_EXTRA_HEIGHT = 10;
  // content.css が var() で参照する。
  const FONT_SIZE_PROPERTY = "--banner-font-size";
  const PADDING_BLOCK_PROPERTY = "--banner-padding-block";
  // CSS が読み込めなくても同じ位置に出るよう、位置だけは要素に直接指定する。
  const HOST_STYLE = {
    position: "fixed",
    "z-index": "2147483647",
    margin: "0",
  };

  let host = null;
  let label = null;
  let input = null;
  let shownRegion = null;
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

  // ページの見出しの計算済み font-size(px)。読むのはサイズだけで、文言は読まない。
  // バナーは closed な Shadow DOM の中なので、querySelector の対象にならない。
  function headingFontSize() {
    for (const tag of HEADING_TAGS) {
      const heading = document.querySelector(tag);
      if (!heading) continue;
      const size = parseFloat(getComputedStyle(heading).fontSize);
      if (Number.isFinite(size)) {
        return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size));
      }
    }
    return FALLBACK_FONT_SIZE;
  }

  // 表示されている最初のツールバーの矩形。なければ null。
  function toolbarRect() {
    for (const toolbar of document.querySelectorAll(TOOLBAR)) {
      const rect = toolbar.getBoundingClientRect();
      if (rect.width && rect.height) return rect;
    }
    return null;
  }

  // 値が変わらないときは style を書き換えない。value が null なら指定を外す。
  function setStyle(name, value) {
    if (host.style.getPropertyValue(name) === (value ?? "")) return;
    if (value === null) host.style.removeProperty(name);
    else host.style.setProperty(name, value);
  }

  // 見出しのサイズを基本に、1 行の高さがツールバーを超えるなら収まる大きさまで下げる。
  function fontSize(toolbar) {
    const size = headingFontSize();
    if (!toolbar) return size;
    const fit = Math.floor((toolbar.height - INPUT_EXTRA_HEIGHT) / LINE_HEIGHT);
    return Math.min(size, Math.max(FIT_MIN_FONT_SIZE, fit));
  }

  // ナビのレイアウトを押し広げないよう、body 直下に置いて fixed で重ねる。
  // 位置はリージョンボタンの右端揃えで、ツールバーがあればその行に重ね、なければナビバーのすぐ下。
  // 見出しとツールバーは遅延描画されるので update() のたびに取り直す。
  function place() {
    if (host.parentNode !== document.body) document.body.append(host);

    const button = document.querySelector(REGION_BUTTON);
    const rect = button?.getBoundingClientRect();
    const toolbar = toolbarRect();
    let top = FALLBACK_TOP;
    let right = FALLBACK_RIGHT;
    // 幅も高さも 0 のボタンは非表示とみなし、見つからない場合と同じ位置にする。
    if (rect && (rect.width || rect.height)) {
      const navBottom = button.closest(NAV_BAR)?.getBoundingClientRect().bottom;
      top = navBottom >= rect.bottom ? navBottom : rect.bottom + BUTTON_GAP;
      right = Math.max(MIN_RIGHT, document.documentElement.clientWidth - rect.right);
    }
    if (toolbar) top = toolbar.top;

    for (const [name, value] of Object.entries(HOST_STYLE)) {
      setStyle(name, value);
    }
    setStyle(FONT_SIZE_PROPERTY, `${fontSize(toolbar)}px`);
    setStyle("top", `${Math.round(top)}px`);
    setStyle("right", `${Math.round(right)}px`);
    // ツールバーと同じ高さにし、上下の余白は中央ぞろえで吸収する。折り返したときは伸びる。
    setStyle("min-height", toolbar ? `${Math.round(toolbar.height)}px` : null);
    setStyle(PADDING_BLOCK_PROPERTY, toolbar ? "0px" : null);
    // 左にはみ出さないよう、左側にも MIN_RIGHT を残した幅を上限にする。
    const maxWidth = document.documentElement.clientWidth - Math.round(right) - MIN_RIGHT;
    setStyle("max-width", `${Math.max(0, maxWidth)}px`);
    // リージョンメニューはこの位置に開くので、開いている間は隠す。
    setStyle("display", button?.getAttribute("aria-expanded") === "true" ? "none" : null);
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

  // ナビの遅延描画・再描画、SPA 遷移に伴う DOM 変化、リージョンメニューの開閉をまとめて拾う。
  new MutationObserver(scheduleUpdate).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributeFilter: ["aria-expanded"],
  });
  addEventListener("resize", scheduleUpdate);
  addEventListener("popstate", scheduleUpdate);
  addEventListener("hashchange", scheduleUpdate);
  // bfcache から復元されたページは confirmed が古いので取り直す。
  addEventListener("pageshow", (event) => {
    if (event.persisted) restore();
  });
  restore();
})();
