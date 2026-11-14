// ==UserScript==
// @name         NeoFamily Themes
// @namespace    https://neofamily.ru/
// @version      2.4.1
// @description  Четыре самостоятельные темы: Pink Pick Me, тёмная Halloween, зимняя Новый год (гирлянда, снежинки, ёлочка) и спокойная жёлтовато-кремовая Бумага для чтения (Minimal Focus). Только оформление.
// @match        https://neofamily.ru/*
// @match        https://www.neofamily.ru/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @connect      *
// ==/UserScript==

(function () {
  'use strict';
  if (window.__neoThemes200) return;
  window.__neoThemes200 = true;

  const css = `
    :root {
      --pink-bg:#fff5fa; --pink-surface:rgba(255,255,255,.88);
      --pink-surface-strong:#fffafd; --pink-border:#ffd2e6;
      --pink-border-strong:#ffabd3; --pink-text:#a51b68;
      --pink-muted:#d04b91; --pink-main:#f06eae;
      --pink-hot:#e84d9b; --pink-soft:#ffe4f1;
      --pink-shadow:0 8px 24px rgba(221,91,157,.12),0 2px 6px rgba(221,91,157,.07);
      --mantine-color-body:#fff5fa !important;
      --mantine-color-text:#a51b68 !important;
    }
    html,body {
      background:radial-gradient(ellipse at 8% 5%,rgba(255,198,226,.45),transparent 28%),
        radial-gradient(ellipse at 95% 18%,rgba(255,220,238,.58),transparent 25%),
        linear-gradient(135deg,#fff7fb 0%,#fff0f7 52%,#fff9fc 100%) !important;
      color:var(--pink-text) !important;
      font-family:'Comfortaa','Trebuchet MS',sans-serif !important;
    }
    body {background-color:var(--pink-bg) !important;}
    ::selection {background:#ffb9dc !important;color:#a51b68 !important;}
    main,[role="main"],.bg-background,header.bg-background {background-color:transparent !important;}
    header {background:rgba(255,248,252,.82) !important;
      backdrop-filter:blur(18px) saturate(1.25) !important;
      -webkit-backdrop-filter:blur(18px) saturate(1.25) !important;
      border-bottom:1px solid rgba(255,191,221,.55) !important;}
    nav {scrollbar-width:thin;scrollbar-color:#f4a8ce transparent;}
    nav a,nav button,nav [role="button"] {border-radius:16px !important;
      transition:background .22s ease,transform .22s ease,box-shadow .22s ease !important;}
    nav a:hover,nav button:hover,nav [role="button"]:hover {
      background:linear-gradient(115deg,#ffe4f1,#fff6fb) !important;
      box-shadow:0 4px 14px rgba(231,104,166,.13) !important;transform:translateX(2px);}
    h1,h2,h3 {color:#bd176f !important;letter-spacing:-.035em !important;}
    h1 {text-shadow:0 2px 0 #fff,0 4px 16px rgba(238,105,174,.16) !important;}
    p,label,span,div {scrollbar-color:#f2a5cc transparent;}
    h1,h2,h3,h4,h5,h6 {color:#c21875 !important;}
    main p,main label,main th,main td,main a:not([class*="bg-"]),
    main [class*="text-natural"],main [class*="text-dark"],main [class*="text-gray"] {
      color:#b51c70 !important;}
    main [class*="text-muted"],main [class*="text-secondary"] {color:#d04491 !important;}
    main h1,main h2 {text-shadow:0 1px 0 #fff,0 3px 12px rgba(225,39,133,.2) !important;}
    .bg-background-secondary,[class*="rounded-2xl"][class*="bg-background"],
    [class*="rounded-xl"][class*="bg-background"],[class*="border-natural-1"],
    [data-radix-popper-content-wrapper]>div,[role="dialog"] {border-color:var(--pink-border) !important;}
    .grid.grid-cols-\\[minmax\\(0\\,1fr\\)\\]>div,
    .swiper+div>div,[class*="grid-cols-"][class*="gap-"]>.rounded-2xl,
    div.rounded-2xl.bg-background-secondary {border-radius:21px !important;}
    .grid.grid-cols-\\[minmax\\(0\\,1fr\\)\\] {gap:10px !important;}
    .grid.grid-cols-\\[minmax\\(0\\,1fr\\)\\]>div:not(.swiper-wrapper),
    .grid.grid-cols-\\[minmax\\(0\\,1fr\\)\\] .rounded-2xl {
      background:linear-gradient(115deg,rgba(255,255,255,.97),rgba(255,246,251,.95)) !important;
      border:1px solid #ffd8e9 !important;box-shadow:0 4px 16px rgba(215,93,153,.075) !important;}
    button,[role="button"],a[class*="rounded-button"] {
      transition:background .2s ease,box-shadow .2s ease,transform .2s ease,border-color .2s ease !important;}
    button[class*="bg-subject-biology"],button[class*="bg-main"],
    button[class*="bg-light-pink"],a[class*="bg-subject-biology"] {
      background:linear-gradient(135deg,#ffb7da 0%,#f278b6 55%,#e95ba5 100%) !important;
      color:#fff !important;border:1px solid rgba(255,255,255,.85) !important;
      box-shadow:0 5px 14px rgba(228,82,157,.22),inset 0 1px 0 rgba(255,255,255,.75) !important;}
    button:hover,[role="button"]:hover {border-color:#f5a2cb !important;}
    button[class*="bg-subject-biology"]:hover,button[class*="bg-main"]:hover,
    a[class*="bg-subject-biology"]:hover {filter:saturate(1.06) brightness(1.03);
      box-shadow:0 7px 18px rgba(228,82,157,.28),inset 0 1px 0 rgba(255,255,255,.8) !important;
      transform:translateY(-1px);}
    [role="tablist"] button,.swiper-slide button {
      border:1px solid #ffd5e8 !important;border-radius:999px !important;
      background:rgba(255,255,255,.78) !important;color:#a34d7d !important;
      box-shadow:0 2px 8px rgba(226,113,169,.08) !important;}
    [role="tablist"] button[aria-selected="true"],.swiper-slide button[data-state="active"] {
      background:linear-gradient(135deg,#ffb8da,#ed70b0) !important;
      color:#fff !important;border-color:#fff !important;
      box-shadow:0 4px 12px rgba(228,82,157,.2) !important;}
    [class*="bg-light-pink-6"],[class*="bg-light-pink"] {
      background:linear-gradient(135deg,#ffe0ef,#ffcae3) !important;
      color:#a83e79 !important;border:1px solid #ffb8d9 !important;border-radius:999px !important;}
    input,textarea,select,[role="combobox"] {
      border-color:#f5c4dc !important;border-radius:14px !important;
      background-color:rgba(255,255,255,.92) !important;color:#a51b68 !important;
      box-shadow:inset 0 1px 2px rgba(209,94,150,.04) !important;}
    input:focus,textarea:focus,select:focus {outline:2px solid rgba(240,110,174,.25) !important;
      border-color:#ee8cbd !important;}
    [data-radix-popper-content-wrapper]>*,[role="menu"],[role="listbox"],[role="dialog"] {
      background:rgba(255,250,253,.97) !important;color:#a51b68 !important;
      border:1px solid #ffd0e5 !important;border-radius:18px !important;
      box-shadow:0 14px 40px rgba(177,76,129,.18) !important;backdrop-filter:blur(16px) !important;}
    img[alt*="аватар"],img[alt*="Avatar"],img[class*="rounded-full"] {
      border:2px solid #ffc5e0 !important;box-shadow:0 2px 8px rgba(232,95,164,.16) !important;}
    table {border-color:#f7c6df !important;}
    th {color:#a95a84 !important;} td {border-color:#f9ddeb !important;}
    progress,[role="progressbar"] {accent-color:#ec70b0 !important;}
    [role="progressbar"]>div {background:linear-gradient(90deg,#ffc1df,#ec67ad) !important;}
    * {scrollbar-width:thin;scrollbar-color:#f3a4ca #fff0f7;}
    *::-webkit-scrollbar {width:9px;height:9px;}
    *::-webkit-scrollbar-track {background:#fff0f7;border-radius:20px;}
    *::-webkit-scrollbar-thumb {background:linear-gradient(#ffc0df,#ed80b9);
      border:2px solid #fff0f7;border-radius:20px;}

    /* ========= NeoCheck compatibility (CSS only): do not repaint its semantic labels ========= */
    #nf-shift-panel {background:#fffafd !important;color:#302a3e !important;
      border:1px solid #f5d6e8 !important;}
    #nf-shift-panel table {background:transparent !important;}
    #nf-shift-panel table td,#nf-shift-panel table th {color:#40344d !important;}
    #nf-shift-panel select[aria-label] {
      border-radius:10px !important;
      border:1px solid #d8c9dd !important;
      font-weight:700 !important;
      box-shadow:none !important;
      outline-offset:1px !important;
      color:#72717c !important;
      background:#fff !important;
    }
    #nf-shift-panel select[aria-label] option {background:#fff;color:#302a3e;}
    #nf-shift-panel select[aria-label]:has(option[value="hw"]:checked) {
      background:#ddf3e5 !important;color:#176238 !important;
      border-color:#8dccaa !important;
    }
    #nf-shift-panel select[aria-label]:has(option[value="chat"]:checked) {
      background:#e8e1ff !important;color:#5132a4 !important;
      border-color:#b8a5e9 !important;
    }
    #nf-shift-panel select[aria-label][style*="outline: 3px"],
    #nf-shift-panel select[aria-label][style*="outline:3px"] {
      outline:3px solid #73a72d !important;
      box-shadow:0 0 0 5px #e7f4d2 !important;
      border-color:#679b26 !important;
    }
    #nf-shift-panel select[aria-label][style*="outline: 3px"]:focus,
    #nf-shift-panel select[aria-label][style*="outline:3px"]:focus {
      outline:3px solid #73a72d !important;
    }
    #nf-shift-panel select[aria-label]:has(option[value="hw"]:checked):hover {background:#cdefdb !important;}
    #nf-shift-panel select[aria-label]:has(option[value="chat"]:checked):hover {background:#ddd1ff !important;}
    #nf-shift-today {color:#302a3e !important;}
    #nf-shift-today strong,#nf-shift-today span {color:inherit;}
    .nf-stats-widget,.nf-tpl-panel,.nf-attach-preview {color:#302a3e;}
    .nf-stats-widget button,.nf-tpl-panel button {filter:none;}
    #nf-reg-overlay article {color:#302a3e !important;}
    #nf-reg-overlay .nf-reg-example-card {background:#f7f5fc !important;
      border:1px solid #e7e0f2 !important;border-left:4px solid #a998d5 !important;}

    /* Лавандовые сообщения методистов в Pink Pick Me */
    :is([id^="attempt-card-"][id$="-comments"],
        [id^="attempt-"][id$="-dialogue"])
      [data-current-user="true"][class*="bg-warn-green-3"] {
      background: linear-gradient(135deg,#f0e6ff 0%,#eadcf8 100%) !important;
      border: 1px solid #d4bde9 !important;
      color: #352642 !important;
      box-shadow: 0 3px 12px rgba(116,75,144,.09) !important;
    }
    :is([id^="attempt-card-"][id$="-comments"],
        [id^="attempt-"][id$="-dialogue"])
      [data-current-user="true"][class*="bg-warn-green-3"]
      :is(span,div,p,strong,em,b,i) {
      color: #352642 !important;
    }
    :is([id^="attempt-card-"][id$="-comments"],
        [id^="attempt-"][id$="-dialogue"])
      [data-current-user="true"][class*="bg-warn-green-3"] a {
      color: #6941a7 !important;
      text-decoration: underline;
    }

    /* Карточки в шапке конкретной домашней работы */
    main div.grid[class*="grid-cols-[1fr_auto]"]:has(> div.border-r) {
      background: transparent !important;
      padding: 0 !important;
      gap: 14px !important;
      align-items: stretch !important;
    }
    main div.grid[class*="grid-cols-[1fr_auto]"]:has(> div.border-r) > div {
      background: linear-gradient(130deg, #ffffff 0%, #fff7fc 100%) !important;
      border: 1px solid #f3c8df !important;
      border-radius: 22px !important;
      box-shadow: 0 5px 18px rgba(190, 75, 134, .08) !important;
      padding: 20px 24px !important;
      min-width: 0 !important;
    }
    main div.grid[class*="grid-cols-[1fr_auto]"]:has(> div.border-r) > div:last-child {
      background: linear-gradient(135deg, #fff 0%, #f9f2ff 100%) !important;
      border-color: #e9d4f5 !important;
    }
    main div.grid[class*="grid-cols-[1fr_auto]"]:has(> div.border-r) > div:first-child {
      border-right: 1px solid #f3c8df !important;
    }
    @media (max-width: 900px) {
      main div.grid[class*="grid-cols-[1fr_auto]"]:has(> div.border-r) {
        grid-template-columns: minmax(0, 1fr) !important;
      }
      main div.grid[class*="grid-cols-[1fr_auto]"]:has(> div.border-r) > div {
        padding: 16px !important;
      }
    }

    /* NeoCheck Регламент в сайдбаре */
    aside #nf-reg-sidebar-link {
      box-sizing: border-box !important;
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      min-height: 46px !important;
      padding: 9px 12px !important;
      background: #eee7f6 !important;
      color: #59386f !important;
      border: 1px solid #e7d9f3 !important;
      border-radius: 15px !important;
      font: 700 12px/1.4 'Comfortaa',system-ui,sans-serif !important;
      box-shadow: none !important;
      text-align: left !important;
      white-space: nowrap !important;
      cursor: pointer !important;
    }
    aside #nf-reg-sidebar-link .nf-pink-reg-icon {
      display: block !important; flex: 0 0 26px !important;
      width: 26px !important; height: 26px !important;
      color: #b21a75 !important;
      stroke: currentColor !important;
    }
    aside #nf-reg-sidebar-link .nf-pink-reg-label {
      font: inherit !important;
      color: #59386f !important;
    }
    aside #nf-reg-sidebar-link:hover {background: #f8dcf0 !important;}
    html.sidebar-closed aside #nf-reg-sidebar-link {
      width: 48px !important; height: 48px !important;
      min-height: 48px !important; max-width: 48px !important;
      padding: 0 !important; margin: 0 !important;
      border: 0 !important; border-radius: 16px !important;
      background: transparent !important;
      display: flex !important; align-items: center !important;
      justify-content: center !important;
      overflow: hidden !important;
    }
    html.sidebar-closed aside #nf-reg-sidebar-link .nf-pink-reg-label {
      display: none !important;
    }
    html.sidebar-closed aside #nf-reg-sidebar-link .nf-pink-reg-icon {
      width: 29px !important; height: 29px !important;
      flex-basis: 29px !important;
    }
    html.sidebar-closed aside #nf-reg-sidebar-link:hover {
      background: #ffe0ef !important;
    }

    main .tm-pink-table-head {
      color:#69566c !important;font-size:13px !important;
      font-weight:800 !important;letter-spacing:.01em !important;
      line-height:1.5 !important;opacity:1 !important;
    }
    main .tm-pink-start-check {
      background:linear-gradient(125deg,#e9489f 0%,#d92986 55%,#bf1973 100%) !important;
      color:#fff !important;
      border:1px solid rgba(255,255,255,.7) !important;
      border-radius:999px !important;
      padding:13px 22px !important;
      font-weight:800 !important;
      box-shadow:0 6px 16px rgba(189,32,119,.24),inset 0 1px 0 rgba(255,255,255,.25) !important;
      text-shadow:0 1px 2px rgba(115,10,62,.2) !important;
    }
    main .tm-pink-start-check:hover {
      background:linear-gradient(125deg,#f05baa 0%,#dd318f 55%,#c31b76 100%) !important;
      box-shadow:0 9px 22px rgba(189,32,119,.30),inset 0 1px 0 rgba(255,255,255,.3) !important;
      transform:translateY(-2px) !important;
    }
    main .tm-pink-start-check:focus-visible {
      outline:3px solid #a23682 !important;outline-offset:3px !important;
    }

    /* Coquette decorative layer for Pink Pick Me */
    #tm-pink-coquette-decor {position:fixed;inset:0;pointer-events:none;z-index:9990;
      overflow:hidden;color:#f18abb;font-family:Georgia,serif;}
    #tm-pink-coquette-decor .tm-pink-float {position:absolute;opacity:.55;
      filter:drop-shadow(0 2px 5px rgba(230,91,159,.22));
      animation:tmPinkFloat 5.5s ease-in-out infinite;
      user-select:none;line-height:1;}
    #tm-pink-coquette-decor .tm-pink-float:nth-child(2n) {animation-delay:-2.4s;}
    #tm-pink-coquette-decor .tm-pink-float:nth-child(3n) {animation-delay:-3.7s;}
    @keyframes tmPinkFloat {0%,100%{transform:translateY(0) rotate(-7deg)}
      50%{transform:translateY(-9px) rotate(7deg)}}
    .tm-pink-note {position:fixed;z-index:9989;width:174px;box-sizing:border-box;
      padding:13px 13px 12px;border:2px solid rgba(255,255,255,.98);
      outline:1px solid #ff9acb;border-radius:19px;
      background:linear-gradient(145deg,rgba(255,255,255,.98),rgba(255,218,238,.97));
      box-shadow:0 8px 28px rgba(209,45,130,.2),inset 0 1px 0 #fff;
      color:#b51c70;font:700 12px/1.55 'Comfortaa','Trebuchet MS',sans-serif;
      text-align:center;pointer-events:auto;cursor:pointer;
      transition:transform .32s cubic-bezier(.2,.8,.2,1),box-shadow .2s ease !important;
      will-change:transform;
    }
    .tm-pink-note::before {content:'୨୧';display:block;margin-bottom:4px;color:#e52d91;
      font-size:19px;line-height:1;text-shadow:0 2px 5px rgba(232,60,148,.18);}
    .tm-pink-note strong {display:block;margin-bottom:4px;color:#d51b80;font-size:13px;}
    .tm-pink-note .tm-pink-mini-sticker {color:#ed4ca5;font-size:17px;}
    #tm-pink-note-1,#tm-pink-note-3 {
      left:0;transform:translateX(calc(-100% + 32px)) rotate(-1deg);
      border-radius:6px 19px 19px 6px;
    }
    #tm-pink-note-2,#tm-pink-note-4 {
      right:0;transform:translateX(calc(100% - 32px)) rotate(1deg);
      border-radius:19px 6px 6px 19px;
    }
    #tm-pink-note-1 {top:26%;}
    #tm-pink-note-2 {top:26%;}
    #tm-pink-note-3 {bottom:17%;}
    #tm-pink-note-4 {bottom:17%;}
    #tm-pink-note-1:hover,#tm-pink-note-3:hover,
    #tm-pink-note-1:focus-visible,#tm-pink-note-3:focus-visible,
    #tm-pink-note-2:hover,#tm-pink-note-4:hover,
    #tm-pink-note-2:focus-visible,#tm-pink-note-4:focus-visible {
      transform:translateX(0) rotate(0) !important;
      box-shadow:0 12px 32px rgba(209,45,130,.26),inset 0 1px 0 #fff;
    }
    @media (max-width:900px) {
      .tm-pink-note {display:none;}
      #tm-pink-coquette-decor .tm-pink-float {opacity:.25;}
    }
    @media (prefers-reduced-motion:reduce) {
      #tm-pink-coquette-decor .tm-pink-float {animation:none;}
      * {scroll-behavior:auto !important;}
    }
  `;

  // Halloween dark theme CSS
  const halloweenCss = `
    html[data-nf-theme="halloween"] {
      --nf-hw-text:#f7edf6;--nf-hw-muted:#d2c3d5;--nf-hw-card:#292031;
      --nf-hw-sub:#35283c;--nf-hw-line:#65475f;--nf-hw-orange:#ffa65b;
    }
    html[data-nf-theme="halloween"] body {background:
      radial-gradient(ellipse at 93% 5%,rgba(141,61,50,.18),transparent 34%),
      radial-gradient(ellipse at 5% 85%,rgba(92,48,101,.16),transparent 44%),
      #191420 !important;}
    html[data-nf-theme="halloween"] :is(main,[role="main"],article,section,aside,nav) {
      color:var(--nf-hw-text) !important;
    }
    html[data-nf-theme="halloween"] :is(main,[role="main"],article) :is(p,span,div,label,li,ul,ol,small,strong,b,em,blockquote,th,td,h1,h2,h3,h4,h5,h6) {
      color:var(--nf-hw-text) !important;
      text-shadow:none !important;
    }
    html[data-nf-theme="halloween"] :is(main,[role="main"],article) :is([class*="text-gray"],[class*="text-natural"],[class*="text-dark"],[class*="text-secondary"],[class*="text-muted"],[class*="text-black"],[class*="text-primary"],[class*="text-white"],[class*="text-[#"],[style*="color:"]) {
      color:var(--nf-hw-text) !important;
      opacity:1 !important;
    }
    html[data-nf-theme="halloween"] :is([id^="attempt-card-"],[id^="attempt-"], [class*="attempt"], [class*="question"], [class*="answer"], [class*="task"]) :is(p,span,div,li,strong,small) {
      color:#faf2fa !important;
      opacity:1 !important;
    }
    html[data-nf-theme="halloween"] :is(main,[role="main"],article) a:not([role="button"]) {
      color:#ffc38b !important;text-decoration-color:#b87556 !important;
    }
    html[data-nf-theme="halloween"] :is(main,[role="main"],article) a:not([role="button"]):hover {color:#ffdcad !important;}
    html[data-nf-theme="halloween"] :is(main,[role="main"],article) :is(button,[role="button"]) {
      color:#f9ecf8 !important;
    }
    html[data-nf-theme="halloween"] :is(main,[role="main"],article) :is(button,[role="button"])[class*="bg-main"],
    html[data-nf-theme="halloween"] :is(main,[role="main"],article) :is(button,[role="button"])[class*="bg-subject-biology"] {color:#211322 !important;}
    html[data-nf-theme="halloween"] :is(main,[role="main"],article) :is(input,textarea,[contenteditable="true"],[role="textbox"]) {
      background:#35283e !important;color:#fff8fd !important;
      -webkit-text-fill-color:#fff8fd !important;caret-color:#ffb676 !important;
      border-color:#72546b !important;
    }
    html[data-nf-theme="halloween"] :is(main,[role="main"],article) :is(input,textarea,[contenteditable="true"])::placeholder {
      color:#c5b1c9 !important;opacity:1 !important;
    }
    html[data-nf-theme="halloween"] :is(main,[role="main"],article) :is([class*="bg-background-secondary"],[class*="bg-background-primary"],[class*="bg-white"],[class*="bg-gray"],[class*="bg-natural"]) {
      background-color:var(--nf-hw-card) !important;border-color:var(--nf-hw-line) !important;
    }
    html[data-nf-theme="halloween"] :is(main,[role="main"],article) :is([class*="rounded-xl"],[class*="rounded-2xl"])[class*="border"] {
      border-color:var(--nf-hw-line) !important;
    }
    html[data-nf-theme="halloween"] :is([class*="bg-error"],[class*="bg-warn-red"],[class*="bg-success"],[class*="bg-warn-green"]) {
      opacity:1 !important;
    }
    html[data-nf-theme="halloween"] :is(main,[role="main"],article) :is(.ProseMirror,.tiptap,[contenteditable="true"]) * {color:#fff8fc !important;opacity:1 !important;}
    html[data-nf-theme="halloween"] :is(#nf-reg-overlay,#nf-shift-panel,.nf-tpl-panel,.nf-stats-widget,.nf-attach-preview) :is(p,span,div,label,li,strong,td,th,button) {
      color:inherit !important;
    }
    html[data-nf-theme="halloween"] #nf-theme-art{z-index:1;}
    html[data-nf-theme="halloween"] #nf-theme-art .nf-theme-illustration {opacity:.88;filter:drop-shadow(0 9px 20px rgba(231,101,45,.22));}
    html[data-nf-theme="halloween"] #nf-theme-art .nf-theme-illustration:nth-child(1) {
      left:auto;right:8px;top:12%;width:115px;height:115px;opacity:.9;
    }
    html[data-nf-theme="halloween"] #nf-theme-art .nf-theme-illustration:nth-child(2) {
      left:3px;right:auto;top:auto;bottom:7%;width:110px;height:110px;
    }
    html[data-nf-theme="halloween"] #nf-theme-art .nf-theme-illustration:nth-child(3) {
      right:4px;left:auto;bottom:4%;width:88px;height:88px;
    }
    #nf-hw-edge-art {position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:1;}
    #nf-hw-edge-art .nf-hw-edge {position:absolute;opacity:.68;}
    #nf-hw-edge-art .nf-hw-bats {top:5%;right:2%;width:115px;}
    #nf-hw-edge-art .nf-hw-web {top:110px;left:5px;width:76px;opacity:.48;}
    #nf-hw-edge-art .nf-hw-vines {bottom:4%;left:0;width:82px;opacity:.55;}
    #nf-hw-edge-art .nf-hw-stars {top:37%;right:9px;width:35px;opacity:.65;}
    #nf-hw-edge-art .nf-hw-bat-swarm {right:0;top:24%;width:84px;opacity:.64;}
    #nf-hw-edge-art .nf-hw-vampire {left:0;top:40%;width:70px;opacity:.88;}
    #nf-hw-edge-art .nf-hw-hat {right:0;top:62%;width:68px;opacity:.86;}
    #nf-hw-edge-art .nf-hw-ghost {left:3px;bottom:22%;width:65px;opacity:.82;}
    #nf-hw-edge-art .nf-hw-jack {right:2px;bottom:6%;width:82px;opacity:.83;}
    #nf-hw-edge-art .nf-hw-edge svg {display:block;width:100%;height:auto;overflow:visible;}
    html[data-nf-motion="yes"] #nf-hw-edge-art .nf-hw-bat-swarm {animation:nf-bat-sway 9s ease-in-out infinite alternate;}
    html[data-nf-motion="yes"] #nf-hw-edge-art .nf-hw-ghost {animation:nf-ghost-float 7s ease-in-out infinite alternate;}
    @keyframes nf-bat-sway {from{transform:translateY(0)}to{transform:translateY(10px)}}
    @keyframes nf-ghost-float {from{transform:translateY(0)}to{transform:translateY(-9px)}}
    @media(max-width:1500px){#nf-hw-edge-art :is(.nf-hw-vampire,.nf-hw-hat,.nf-hw-ghost,.nf-hw-jack,.nf-hw-bat-swarm){display:none;}}
    html[data-nf-decor="minimal"] #nf-hw-edge-art .nf-hw-edge:not(.nf-hw-web) {display:none;}
    html[data-nf-decor="off"] #nf-hw-edge-art{display:none;}
    html.nf-check-focus #nf-hw-edge-art {display:none !important;}
    @media(max-width:1400px){html[data-nf-theme="halloween"] #nf-theme-art .nf-theme-illustration:nth-child(1){width:75px;height:75px;right:0;}
      html[data-nf-theme="halloween"] #nf-theme-art .nf-theme-illustration:nth-child(2){width:70px;height:70px;left:0;}
      #nf-hw-edge-art .nf-hw-edge{display:none;}}
    @media(max-width:1100px){#nf-hw-edge-art{display:none;}}
    @media(prefers-reduced-motion:reduce){#nf-hw-edge-art *{animation:none !important;}}
  `;
  const addCss = txt => {
    if (typeof GM_addStyle === 'function') GM_addStyle(txt);
    else { const s = document.createElement('style'); s.textContent = txt; (document.head || document.documentElement).appendChild(s); }
  };
  addCss(halloweenCss);

  const halloweenReadabilityCss = `
    html[data-nf-theme="halloween"] {
      --nf-hw-reading:#f6eef7;
      --nf-hw-reading-muted:#ded0e5;
    }
    html[data-nf-theme="halloween"] body :is(
      [class*="text-natural"], [class*="text-gray"], [class*="text-dark"],
      [class*="text-black"], [class*="text-secondary"], [class*="text-muted"],
      [class*="text-primary"], [class*="text-[#"], [class*="text-opacity-"]
    ):not(#nf-theme-switcher):not(#nf-theme-switcher *) {
      color:var(--nf-hw-reading) !important;
      -webkit-text-fill-color:var(--nf-hw-reading) !important;
      --tw-text-opacity:1 !important;
    }
    html[data-nf-theme="halloween"] .nf-hw-readable-card {
      color:var(--nf-hw-reading) !important;
      --tw-text-opacity:1 !important;
    }
    html[data-nf-theme="halloween"] .nf-hw-readable-card :is(
      p,span,div,li,ul,ol,blockquote,pre,code,strong,b,em,i,small,
      h1,h2,h3,h4,h5,h6
    ):not(button):not([role="button"]):not([contenteditable="true"]):not(.nf-hw-keep-color) {
      color:var(--nf-hw-reading) !important;
      -webkit-text-fill-color:var(--nf-hw-reading) !important;
      --tw-text-opacity:1 !important;
      text-shadow:none !important;
    }
    html[data-nf-theme="halloween"] .nf-hw-readable-card :is(p,span,div,li,pre,code,strong,b,em,i)[style*="opacity"] {
      opacity:1 !important;
    }
    html[data-nf-theme="halloween"] .nf-hw-readable-card :is(a,[role="link"]) {
      color:#ffbb83 !important;
      -webkit-text-fill-color:#ffbb83 !important;
    }
    html[data-nf-theme="halloween"] .nf-hw-readable-card :is(input,textarea,[contenteditable="true"]) {
      color:#fff5fc !important;-webkit-text-fill-color:#fff5fc !important;
    }
    html[data-nf-theme="halloween"] .nf-hw-readable-card :is([data-placeholder],[class*="placeholder"]) {
      color:var(--nf-hw-reading-muted) !important;
      -webkit-text-fill-color:var(--nf-hw-reading-muted) !important;
    }
  `;
  addCss(halloweenReadabilityCss);

  function markHalloweenHomeworkText(){
    if (activeTheme!=='halloween') return;
    const candidates=document.querySelectorAll('button,a,[role="button"]');
    for(const control of candidates){
      const label=(control.textContent||'').trim().toLowerCase();
      if(!label.includes('показать полностью') && !label.includes('свернуть'))continue;
      if(control.closest('#nf-theme-switcher,#nf-reg-overlay,[role="dialog"]'))continue;
      let ancestor=control.parentElement;
      for(let n=0;n<6&&ancestor;n++,ancestor=ancestor.parentElement){
        const t=(ancestor.textContent||'');
        if(t.includes('Тема:') && t.length>140 && t.length<35000){
          ancestor.classList.add('nf-hw-readable-card');
          break;
        }
      }
    }
  }

  const halloweenMessageAndDecorCss = `
    html[data-nf-theme="halloween"]
    div[data-current-user="true"][class*="max-w-fit"][class*="rounded-xl"] {
      background:#463047 !important;
      background-color:#463047 !important;
      border:1px solid #865c79 !important;
      box-shadow:0 3px 12px rgba(9,5,15,.16) !important;
      color:#fff0f7 !important;
      -webkit-text-fill-color:#fff0f7 !important;
    }
    html[data-nf-theme="halloween"]
    div[data-current-user="true"][class*="max-w-fit"][class*="rounded-xl"]
    :is(.tiptap,.ProseMirror,p,span,div,strong,em,small,li,blockquote) {
      color:#fff0f7 !important;
      -webkit-text-fill-color:#fff0f7 !important;
      opacity:1 !important;
    }
    html[data-nf-theme="halloween"]
    div[data-current-user="true"][class*="max-w-fit"][class*="rounded-xl"] a {
      color:#ffc58b !important;
      -webkit-text-fill-color:#ffc58b !important;
    }
    html[data-nf-theme="halloween"]
    div[data-current-user="false"][class*="max-w-fit"][class*="rounded-xl"] {
      background:#30273a !important;
      background-color:#30273a !important;
      border:1px solid #5f4a63 !important;
      color:#f5eaf4 !important;
    }
    html[data-nf-theme="halloween"]
    div[data-current-user="false"][class*="max-w-fit"][class*="rounded-xl"]
    :is(.tiptap,.ProseMirror,p,span,div,strong,em,small,li,blockquote) {
      color:#f5eaf4 !important;
      -webkit-text-fill-color:#f5eaf4 !important;
      opacity:1 !important;
    }
    html[data-nf-theme="halloween"] #nf-hw-edge-art
    :is(.nf-hw-bats,.nf-hw-vines,.nf-hw-stars,.nf-hw-vampire,.nf-hw-hat) {display:none !important;}
    html[data-nf-theme="halloween"] #nf-hw-edge-art .nf-hw-bat-swarm {
      display:block;right:1%;top:13%;width:60px;opacity:.52;
    }
    html[data-nf-theme="halloween"] #nf-hw-edge-art .nf-hw-web {
      display:block;left:0;top:25%;width:54px;opacity:.25;
    }
    html[data-nf-theme="halloween"] #nf-hw-edge-art .nf-hw-ghost {
      display:block;left:1%;bottom:25%;width:56px;opacity:.86;
    }
    html[data-nf-theme="halloween"] #nf-hw-edge-art .nf-hw-jack {
      display:block;right:1%;bottom:9%;width:76px;opacity:.93;
    }
    html[data-nf-theme="halloween"] #nf-theme-art .nf-theme-illustration:nth-child(n+4) {
      display:none !important;
    }
    html[data-nf-theme="halloween"] #nf-theme-art .nf-theme-illustration:nth-child(1) {
      top:3%;right:1%;width:86px;height:86px;opacity:.72;
    }
    html[data-nf-theme="halloween"] #nf-theme-art .nf-theme-illustration:nth-child(2) {
      bottom:10%;left:1%;width:82px;height:82px;opacity:.69;
    }
    html[data-nf-theme="halloween"] #nf-theme-art .nf-theme-illustration:nth-child(3) {
      display:none !important;
    }
    html[data-nf-decor="minimal"][data-nf-theme="halloween"] #nf-hw-edge-art
    :is(.nf-hw-bat-swarm,.nf-hw-web) {display:none !important;}
    html[data-nf-decor="off"][data-nf-theme="halloween"] #nf-hw-edge-art,
    html[data-nf-decor="off"][data-nf-theme="halloween"] #nf-theme-art {display:none !important;}
    html.nf-check-focus[data-nf-theme="halloween"] #nf-hw-edge-art,
    html.nf-check-focus[data-nf-theme="halloween"] #nf-theme-art {display:none !important;}
    @media(max-width:1500px) {
      html[data-nf-theme="halloween"] #nf-hw-edge-art :is(.nf-hw-ghost,.nf-hw-jack) {display:block !important;}
    }
    @media(max-width:1400px) {
      html[data-nf-theme="halloween"] #nf-hw-edge-art .nf-hw-jack {
        display:block !important;width:51px;right:0;bottom:7%;
      }
      html[data-nf-theme="halloween"] #nf-hw-edge-art .nf-hw-ghost {
        display:block !important;width:43px;left:0;bottom:27%;
      }
      html[data-nf-theme="halloween"] #nf-hw-edge-art :is(.nf-hw-web,.nf-hw-bat-swarm) {display:none !important;}
    }
    @media(max-width:1100px) {
      html[data-nf-theme="halloween"] #nf-hw-edge-art {display:none !important;}
    }
  `;
  addCss(halloweenMessageAndDecorCss);

  function paintHalloweenEdges(){
    document.getElementById('nf-hw-edge-art')?.remove();
    if(activeTheme!=='halloween'||!document.body)return;
    const art=document.createElement('div');art.id='nf-hw-edge-art';art.setAttribute('aria-hidden','true');
    const assets=[
      ['nf-hw-bats',`<path fill="#e98f59" d="M8 47Q22 29 35 44q8-24 22-10 13-14 23 9 12-14 30 4-24-4-28 11L57 45 37 58Q26 42 8 47Z"/><path fill="#e98f59" opacity=".5" d="M76 15q9-9 16-1 7-15 15-6 10-6 17 10-13-4-20 5l-12-9-9 8Z"/>`],
      ['nf-hw-web',`<g stroke="#d5a1b7" stroke-width="2" fill="none"><path d="M0 0h165M0 0v165M0 0l140 140M0 0l70 165M0 0l165 70"/><path d="M34 0Q33 31 0 34M65 0Q64 65 0 65M97 0Q96 97 0 97M130 0Q130 130 0 130"/></g>`],
      ['nf-hw-vines',`<g stroke="#b46643" fill="none" stroke-width="4" stroke-linecap="round"><path d="M2 167Q33 121 29 65Q24 34 75 3M30 104Q67 105 85 67M24 130Q57 146 80 119"/></g><g fill="#a45b43"><path d="M24 77Q-8 67 5 43q26 3 19 34ZM38 110Q67 91 74 107q-15 18-36 3ZM56 37q-6-28 18-30 12 20-18 30Z"/></g>`],
      ['nf-hw-stars',`<g fill="none" stroke="#fbb97b" stroke-width="4" stroke-linecap="round"><path d="M30 10v28M16 24h28M76 46v18m-9-9h18M40 86v22m-11-11h22"/></g>`],
      ['nf-hw-bat-swarm',`<g fill="#cbb0ca" opacity=".94"><path d="M8 46q18-17 37-2 7-19 17-6 11-13 19 6 20-15 37 2-9-1-15 14-13-5-24 8L62 53 46 68Q36 55 23 60 18 45 8 46Z"/><path d="M74 111q11-11 22-2 4-11 11-4 8-7 13 5 14-9 25 0-11 0-13 12-9-6-17 4l-8-11-9 11q-7-8-16-4-1-8-8-11Z"/><path d="M10 141q8-7 15-3 4-7 7-3 5-4 8 3 9-6 15 2-8 0-10 8-5-2-9 3l-5-7-5 7q-4-4-9-3Z"/></g>`],
      ['nf-hw-vampire',`<g fill="none" stroke="#eccadd" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"><path d="M27 145 12 128l14-46-9-16 17-16 3-24 21-13 25 18 23-18 25 13 3 24 18 16-11 17 14 46-15 16-22-22-9 29-23-16-25 16-10-29Z"/><path d="M52 46q-11 34 29 41 41-7 30-41"/><path d="M44 49q39-29 76 0"/><path d="m61 61 12 7m27 0 12-7M67 85q14 12 29 0M72 88l4 15 8-10 9 10 5-15"/></g><g fill="#ffad72"><path d="M53 12Q81-2 111 12l-10 15H63Z"/></g>`],
      ['nf-hw-hat',`<path d="M48 116q20-36 20-93l15 15 14-5q-5 57 29 82 8 6 22 12-39 24-92 19-36-3-47-15 16 0 39-15Z" fill="#7650a5" stroke="#c2a0dc" stroke-width="4"/><path d="M36 112q51 29 101 8l12 16q-60 25-123-2Z" fill="#ea9547" stroke="#ffd0a2" stroke-width="3"/><path d="M84 109h18v16H84Z" fill="#4a274f" stroke="#f4c36d" stroke-width="3"/>`],
      ['nf-hw-ghost',`<path d="M32 134V61q0-47 48-47t48 47v73l-19-13-15 14-15-14-17 14-16-14Z" fill="#f0dce7" stroke="#eab0c7" stroke-width="4"/><g fill="#38263e"><ellipse cx="63" cy="78" rx="8" ry="12"/><ellipse cx="98" cy="78" rx="8" ry="12"/><ellipse cx="80" cy="107" rx="8" ry="11"/></g><g fill="#eb9aaa" opacity=".7"><ellipse cx="46" cy="99" rx="9" ry="4"/><ellipse cx="113" cy="99" rx="9" ry="4"/></g>`],
      ['nf-hw-jack',`<path d="M83 30q-7-16 5-24l5 7-1 18" fill="#709568"/><path d="M80 31Q39 9 17 46q-20 55 13 87 20 20 52 20 36 0 56-22 30-38 10-85Q128 11 80 31Z" fill="#d87736" stroke="#f8b46e" stroke-width="5"/><path d="M61 31Q31 79 61 150M104 31q28 52 0 119" fill="none" stroke="#9f492e" stroke-width="5" opacity=".6"/><g fill="#2c1b2c"><path d="m36 94 24-29 15 31ZM103 95l17-31 24 30ZM56 114l19 8 10-9 11 9 19-8-11 19-13-5-11 8-12-8-12 5Z"/></g>`]
    ];
    for(const [name,paths] of assets){const span=document.createElement('span');span.className='nf-hw-edge '+name;
      span.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 165 165" aria-hidden="true">'+paths+'</svg>';art.appendChild(span);}
    document.body.appendChild(art);
  }
  addCss(css);

  function addDecor() {
    if (!document.body || document.getElementById('tm-pink-coquette-decor')) return;
    const layer = document.createElement('div');
    layer.id = 'tm-pink-coquette-decor';
    const stickers = [
      ['♡','2%','19%','30px','-8deg'],['✧','4%','72%','24px','12deg'],
      ['୨୧','1.5%','44%','27px','-10deg'],['♡','95%','17%','27px','9deg'],
      ['✦','96%','55%','22px','-12deg'],['୨୧','94%','82%','28px','8deg'],
      ['✧','11%','91%','18px','15deg'],['♡','88%','8%','18px','-6deg']
    ];
    stickers.forEach(([symbol,left,top,size,rotation]) => {
      const item = document.createElement('span');
      item.className = 'tm-pink-float';
      item.textContent = symbol;
      item.style.left = left; item.style.top = top;
      item.style.fontSize = size; item.style.transform = `rotate(${rotation})`;
      layer.appendChild(item);
    });
    document.body.appendChild(layer);

    const notes = [
      {id:'tm-pink-note-1',title:'♡ ты bestie ♡',text:'не забывай, что только ты решаешь какой балл выставить ученику 💅🏻',sticker:'🎀 ✧ 💗'},
      {id:'tm-pink-note-2',title:'ты самая лучшая!',text:'ты самая лучшая, вперед!<br>у тебя всё получится ♡',sticker:'💖 ✨ ୨୧'},
      {id:'tm-pink-note-3',title:'little reminder',text:'ты умничка!<br>проверяй домашки<br>и не забывай отдыхать',sticker:'🩷 🧸 🎀'},
      {id:'tm-pink-note-4',title:'girl boss energy',text:'по одной домашке за раз —<br>и ты уже большая умница!',sticker:'💅🏻 ♡ ✧'}
    ];
    notes.forEach(({id,title,text,sticker}) => {
      const note = document.createElement('div');
      note.id = id;
      note.className = 'tm-pink-note';
      note.innerHTML = `<strong>${title}</strong>${text}<div class="tm-pink-mini-sticker">${sticker}</div>`;
      document.body.appendChild(note);
    });
  }

  function styleRegulationButton() {
    const btn = document.getElementById('nf-reg-sidebar-link');
    if (!btn || btn.querySelector('.nf-pink-reg-icon')) return;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'nf-pink-reg-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M12 7.2c-2.3-1.9-5.1-2.4-9-1.6v13c3.9-.8 6.7-.3 9 1.6m0-13c2.3-1.9 5.1-2.4 9-1.6v13c-3.9-.8-6.7-.3-9 1.6m0-13v13M6 9.2c1.4-.1 2.4.1 3.3.6m5.4 0c.9-.5 1.9-.7 3.3-.6M6 12.2c1.4-.1 2.4.1 3.3.6m5.4 0c.9-.5 1.9-.7 3.3-.6');
    svg.appendChild(path);
    const label = document.createElement('span');
    label.className = 'nf-pink-reg-label';
    label.textContent = 'Регламент';
    btn.replaceChildren(svg, label);
    btn.setAttribute('aria-label', 'Открыть регламент');
    btn.title = 'Регламент методистов по биологии';
  }

  function enhanceHomeworkList() {
    if (!/\/students-homework(?:\/|$)/.test(location.pathname)) return;
    const main = document.querySelector('main');
    if (!main) return;
    const headers = new Set(['Ученик', 'Методисты', 'Дата прохождения', 'Вопросы', 'Время']);
    main.querySelectorAll('div,span,th,p').forEach(node => {
      if (node.children.length === 0 && headers.has(node.textContent.trim())) {
        node.classList.add('tm-pink-table-head');
      }
    });
    main.querySelectorAll('button,a,[role="button"]').forEach(node => {
      if (/^Приступить к проверкам$/i.test(node.textContent.trim())) {
        node.classList.add('tm-pink-start-check');
      }
    });
  }

  // ===== NeoFamily Themes 2.4: Pink Pick Me + Halloween + Новый год + Бумага =====
  const THEME_KEY='nf_themes_choice_v2';
  const DECOR_KEY='nf_themes_decor_v2';
  const MOTION_KEY='nf_themes_motion_v2';
  const themes={
    pink:{name:'Pink Pick Me',icon:'🎀'},
    halloween:{name:'Halloween',icon:'🎃'},
    newyear:{name:'Новый год',icon:'🎄'},
    paper:{name:'Бумага',icon:'📖'}
  };
  const load=(k,d)=>{try{return localStorage.getItem(k)||d;}catch{return d;}};
  const save=(k,v)=>{try{localStorage.setItem(k,v);}catch{}};
  let activeTheme=themes[load(THEME_KEY,'pink')]?load(THEME_KEY,'pink'):'pink';
  let decorLevel=load(DECOR_KEY,'normal');
  let motionOn=load(MOTION_KEY,'yes')==='yes';
  const variants={
    halloween:{bg:'#17121e',card:'#282031',card2:'#332839',text:'#f7eef5',muted:'#cbbdd0',accent:'#ff994f',line:'#705069',glow:'rgba(253,130,63,.11)',grad:'#17121e,#271b31',light:false},
    newyear:{bg:'#f1f7fd',card:'#ffffff',card2:'#e8f2fb',text:'#1b3650',muted:'#567491',accent:'#1f7a5c',accent2:'#145c44',line:'#c2daee',glow:'rgba(45,108,162,.10)',grad:'#edf5ff 0%,#f7fbff 52%,#eef6fc 100%',light:true},
    paper:{bg:'#f3e9d2',card:'#fbf6e8',card2:'#efe4cb',text:'#2b2116',muted:'#6d5c47',accent:'#9c5c25',accent2:'#7d4618',line:'#d9c8a8',glow:'rgba(110,82,42,.09)',grad:'#f7f0dc 0%,#f2e7ce 55%,#ede0c2 100%',light:true}
  };
  const drawings={
    halloween:[
      `<defs><radialGradient id="nfMoon" cx="35%" cy="30%"><stop stop-color="#ffd196"/><stop offset=".55" stop-color="#f59a49"/><stop offset="1" stop-color="#ad4f37"/></radialGradient></defs><circle cx="98" cy="90" r="66" fill="url(#nfMoon)"/><g fill="#a85842" opacity=".25"><circle cx="70" cy="69" r="13"/><circle cx="118" cy="53" r="9"/><circle cx="127" cy="118" r="19"/><circle cx="82" cy="127" r="7"/></g><g fill="#180f20"><path d="M13 64q17-19 30-4q8-20 20-10q-12 0-15 18l-12-4-13 10Z"/><path d="M141 46q14-20 24-9q10-19 23-10q-17 4-18 20l-11-5-18 11Z"/></g><path d="M0 168Q42 128 52 92M15 151l-11-32m34-6-1-27m9 19 23-15" fill="none" stroke="#15101e" stroke-width="6" stroke-linecap="round"/>`,
      `<defs><radialGradient id="nfPump"><stop stop-color="#ffba60"/><stop offset="1" stop-color="#cc5e2e"/></radialGradient></defs><path d="M104 48q-15-24 9-36" stroke="#718456" stroke-width="8" fill="none"/><path d="M100 42q-37-16-52 0Q19 59 23 104q3 52 77 57 77-5 78-57 1-51-30-62-20-13-48 0" fill="url(#nfPump)" stroke="#fdac69" stroke-width="3"/><path d="M72 45q-30 58 0 109m55-109q31 58 2 110" stroke="#99442e" stroke-width="5" opacity=".65" fill="none"/><g fill="#2a1726"><path d="m48 107 22-29 12 28ZM118 106l14-28 23 29Z"/><path d="M64 127q38 25 73-1l-9 20-14-9-14 10-15-9-12 8Z"/></g><path d="M85 42q-17-24-37-9 18 4 31 24" fill="#647549"/>`,
      `<path d="M41 146V65Q41 21 98 21t57 44v81l-23-12-20 12-20-12-23 12Z" fill="#eee5ea" stroke="#e8b8cb" stroke-width="3"/><ellipse cx="74" cy="88" rx="8" ry="11" fill="#39253e"/><ellipse cx="119" cy="88" rx="8" ry="11" fill="#39253e"/><path d="M85 117q13 10 25 0" stroke="#39253e" stroke-width="4" fill="none" stroke-linecap="round"/><g stroke="#ffbd7f" stroke-width="2" opacity=".8"><path d="M19 24v21m-11-10h22M167 47v22m-11-11h22"/></g>`
    ],
    newyear:[
      // 1) Милый снеговик NeoFamily в вязаной шапочке, лавандовом шарфике и с какао (справа снизу)
      `<defs>
        <radialGradient id="nfNySnow" cx="38%" cy="30%"><stop offset="0%" stop-color="#ffffff"/><stop offset="70%" stop-color="#eef6fd"/><stop offset="100%" stop-color="#cde2f5"/></radialGradient>
        <linearGradient id="nfNyScarf" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#9e82f7"/><stop offset="100%" stop-color="#6b4ed2"/></linearGradient>
        <linearGradient id="nfNyHat" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ff8ac2"/><stop offset="100%" stop-color="#d4458a"/></linearGradient>
      </defs>
      <ellipse cx="100" cy="166" rx="48" ry="8" fill="#5e87ad" opacity=".16"/>
      <circle cx="100" cy="127" r="37" fill="url(#nfNySnow)" stroke="#b3d3ee" stroke-width="2.5"/>
      <circle cx="100" cy="76" r="26" fill="url(#nfNySnow)" stroke="#b3d3ee" stroke-width="2.5"/>
      <path d="M77 62c2-22 44-22 46 0Z" fill="url(#nfNyHat)" stroke="#ba3876" stroke-width="2.2"/>
      <rect x="74" y="57" width="52" height="9" rx="4.5" fill="#fff7fb" stroke="#f0bed7" stroke-width="2"/>
      <circle cx="100" cy="40" r="6.5" fill="#fff7fb" stroke="#f0bed7" stroke-width="2"/>
      <ellipse cx="87" cy="79" rx="4.5" ry="2.6" fill="#ff9ac4" opacity=".65"/>
      <ellipse cx="113" cy="79" rx="4.5" ry="2.6" fill="#ff9ac4" opacity=".65"/>
      <circle cx="91" cy="71" r="3.2" fill="#21354a"/><circle cx="90" cy="70" r="1.1" fill="#fff"/>
      <circle cx="109" cy="71" r="3.2" fill="#21354a"/><circle cx="108" cy="70" r="1.1" fill="#fff"/>
      <path d="M99 75l17 3.5-17 4.2Z" fill="#ff8f3a" stroke="#d96718" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M91 85q9 7 18 0" fill="none" stroke="#21354a" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M76 96q24 12 48 0v10q-24 11-48 0Z" fill="url(#nfNyScarf)" stroke="#593cb8" stroke-width="2"/>
      <path d="M108 102l12 24-11 4-10-23Z" fill="url(#nfNyScarf)" stroke="#593cb8" stroke-width="2"/>
      <path d="M84 99l3 7m11-5l1 7m11-6l-2 7" stroke="#d9ceff" stroke-width="2" stroke-linecap="round"/>
      <circle cx="97" cy="121" r="3.2" fill="#6b4ed2"/><circle cx="97" cy="134" r="3.2" fill="#ff78b4"/>
      <path d="M64 117l-17-10m9 6l-7 8M135 117l17-10m-8 6l7 7" stroke="#855a41" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="46" cy="106" r="5" fill="#9e82f7"/><circle cx="152" cy="107" r="5" fill="#9e82f7"/>
      <rect x="139" y="96" width="14" height="12" rx="3" fill="#ff8ac2" stroke="#b63d78" stroke-width="1.6"/>
      <path d="M153 99c4 0 4 6 0 6" fill="none" stroke="#b63d78" stroke-width="1.8"/>
      <path d="M144 92q2-4 0-7m5 7q2-4 0-7" fill="none" stroke="#a6c8e8" stroke-width="1.8" stroke-linecap="round"/>`,

      // 2) Новогодний био-шар NeoFamily: еловая ветка, лавандовый шар и золотая спираль ДНК внутри (справа сверху)
      `<defs>
        <radialGradient id="nfNyOrb" cx="35%" cy="30%"><stop offset="0%" stop-color="#b79cff"/><stop offset="52%" stop-color="#7c5ee6"/><stop offset="100%" stop-color="#4e35ad"/></radialGradient>
        <linearGradient id="nfNyCap" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffe78a"/><stop offset="100%" stop-color="#d89b26"/></linearGradient>
      </defs>
      <path d="M100 4v26" stroke="#c89f3c" stroke-width="3" stroke-linecap="round"/>
      <circle cx="100" cy="30" r="5" fill="none" stroke="#e5b340" stroke-width="2.8"/>
      <g stroke="#217858" stroke-width="3.6" stroke-linecap="round">
        <path d="M58 27q42-16 84-5"/>
        <path d="M70 23l-7-10m17 7l-3-12m17 10l5-12m15 13l9-10m11 12l11-6"/>
      </g>
      <circle cx="88" cy="21" r="4" fill="#ff6b7c"/><circle cx="95" cy="18" r="3.6" fill="#ff6b7c"/>
      <rect x="90" y="34" width="20" height="11" rx="3" fill="url(#nfNyCap)" stroke="#a97518" stroke-width="2"/>
      <circle cx="100" cy="96" r="50" fill="url(#nfNyOrb)" stroke="#d9ccff" stroke-width="2.5"/>
      <path d="M70 67q-12 18-8 38" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity=".28"/>
      <path d="M76 69c18 10 30 10 48 0M76 89c18 10 30 10 48 0M76 109c18 10 30 10 48 0M81 66c0 18 38 18 38 36 0 18-38 18-38 36M119 66c0 18-38 18-38 36 0 18 38 18 38 36" fill="none" stroke="#ffe484" stroke-width="2.8" stroke-linecap="round" opacity=".92"/>
      <circle cx="144" cy="144" r="3" fill="#84bdf0"/><path d="M44 64v12m-6-6h12" stroke="#ffd25e" stroke-width="2.4" stroke-linecap="round"/>`
    ]
  };
  const themeCss=Object.entries(variants).map(([id,c])=>`
    html[data-nf-theme="${id}"] {--pink-bg:${c.bg};--pink-surface:${c.card};--pink-surface-strong:${c.card};--pink-border:${c.line};--pink-border-strong:${c.line};--pink-text:${c.text};--pink-muted:${c.muted};--pink-main:${c.accent};--pink-hot:${c.accent};--pink-soft:${c.card2};--mantine-color-body:${c.bg} !important;--mantine-color-text:${c.text} !important;color-scheme:${c.light?'light':'dark'};}
    html[data-nf-theme="${id}"] body {background:linear-gradient(135deg,${c.grad}) fixed !important;color:${c.text} !important;}
    html[data-nf-theme="${id}"] header {background:${c.card}f0 !important;border-color:${c.line} !important;}
    html[data-nf-theme="${id}"] h1,html[data-nf-theme="${id}"] h2,html[data-nf-theme="${id}"] h3,html[data-nf-theme="${id}"] h4,html[data-nf-theme="${id}"] h5,html[data-nf-theme="${id}"] h6,
    html[data-nf-theme="${id}"] main p,html[data-nf-theme="${id}"] main label,html[data-nf-theme="${id}"] main th,html[data-nf-theme="${id}"] main td,html[data-nf-theme="${id}"] main a:not([class*="bg-"]),html[data-nf-theme="${id}"] main [class*="text-natural"],html[data-nf-theme="${id}"] main [class*="text-dark"],html[data-nf-theme="${id}"] main [class*="text-gray"],html[data-nf-theme="${id}"] main [class*="text-muted"],html[data-nf-theme="${id}"] main [class*="text-secondary"],html[data-nf-theme="${id}"] .tm-pink-table-head {color:${c.text} !important;text-shadow:none !important;}
    html[data-nf-theme="${id}"] .bg-background-secondary,html[data-nf-theme="${id}"] [class*="rounded-2xl"][class*="bg-background"],html[data-nf-theme="${id}"] div.rounded-2xl.bg-background-secondary,
    html[data-nf-theme="${id}"] .grid.grid-cols-\\[minmax\\(0\\,1fr\\)\\]>div:not(.swiper-wrapper),html[data-nf-theme="${id}"] .grid.grid-cols-\\[minmax\\(0\\,1fr\\)\\] .rounded-2xl {background:${c.card} !important;color:${c.text} !important;border-color:${c.line} !important;box-shadow:0 4px 18px ${c.glow} !important;}
    html[data-nf-theme="${id}"] input,html[data-nf-theme="${id}"] textarea,html[data-nf-theme="${id}"] select,html[data-nf-theme="${id}"] [role="combobox"],html[data-nf-theme="${id}"] [contenteditable="true"] {background-color:${c.card2} !important;color:${c.text} !important;border-color:${c.line} !important;caret-color:${c.accent} !important;}
    html[data-nf-theme="${id}"] input::placeholder,html[data-nf-theme="${id}"] textarea::placeholder {color:${c.muted} !important;opacity:.9 !important;}
    html[data-nf-theme="${id}"] [data-radix-popper-content-wrapper] > *,html[data-nf-theme="${id}"] [role="dialog"],html[data-nf-theme="${id}"] [role="menu"],html[data-nf-theme="${id}"] [role="listbox"] {background:${c.card} !important;color:${c.text} !important;border-color:${c.line} !important;}
    html[data-nf-theme="${id}"] button[class*="bg-subject-biology"],html[data-nf-theme="${id}"] button[class*="bg-main"],html[data-nf-theme="${id}"] button[class*="bg-light-pink"],html[data-nf-theme="${id}"] a[class*="bg-subject-biology"],html[data-nf-theme="${id}"] .tm-pink-start-check {background:linear-gradient(125deg,${c.accent},${c.light?(c.accent2||'#145c44'):c.line}) !important;color:${c.light?'#fff':'#181626'} !important;border-color:${c.line} !important;}
    html[data-nf-theme="${id}"] [role="tablist"] button,html[data-nf-theme="${id}"] .swiper-slide button,html[data-nf-theme="${id}"] nav a:hover,html[data-nf-theme="${id}"] nav button:hover {background:${c.card2} !important;color:${c.text} !important;border-color:${c.line} !important;}
    html[data-nf-theme="${id}"] [class*="bg-light-pink"],html[data-nf-theme="${id}"] [class*="bg-background-secondary"] {background:${c.card2} !important;color:${c.text} !important;border-color:${c.line} !important;}
    html[data-nf-theme="${id}"] aside #nf-reg-sidebar-link {color:${c.text} !important;}
    html[data-nf-theme="${id}"] aside #nf-reg-sidebar-link:hover {background:${c.card2} !important;}
    html[data-nf-theme="${id}"] .nf-stats-widget,html[data-nf-theme="${id}"] .nf-tpl-panel,html[data-nf-theme="${id}"] .nf-attach-preview {color:${c.text};}
    html[data-nf-theme="${id}"] #nf-reg-overlay article {color:${c.text} !important;}
    html[data-nf-theme="${id}"] #tm-pink-coquette-decor,html[data-nf-theme="${id}"] .tm-pink-note {display:none !important;}
  `).join('\n');

  // Новогодняя тема: морозно-белые и голубые карточки, хвойно-золотые акценты, гирлянда сверху и мягкие снежинки
  const newYearCss = `
    html[data-nf-theme="newyear"] body {
      background:
        radial-gradient(ellipse at 10% 4%, rgba(169,212,248,.42), transparent 32%),
        radial-gradient(ellipse at 92% 14%, rgba(255,232,175,.34), transparent 28%),
        linear-gradient(135deg,#ecf5ff 0%,#f7fbff 52%,#eef6fc 100%) !important;
      color:#1b3650 !important;
    }
    html[data-nf-theme="newyear"] ::selection {background:#bfe0ff !important;color:#14334d !important;}
    html[data-nf-theme="newyear"] header {
      background:rgba(248,252,255,.95) !important;
      backdrop-filter:none !important;-webkit-backdrop-filter:none !important;
      border-bottom:1px solid rgba(182,213,240,.85) !important;
    }
    html[data-nf-theme="newyear"] nav a:hover,
    html[data-nf-theme="newyear"] nav button:hover,
    html[data-nf-theme="newyear"] nav [role="button"]:hover {
      background:linear-gradient(115deg,#dfeffe,#f4faff) !important;
      box-shadow:0 4px 14px rgba(45,108,162,.11) !important;
    }
    html[data-nf-theme="newyear"] h1,
    html[data-nf-theme="newyear"] h2,
    html[data-nf-theme="newyear"] h3,
    html[data-nf-theme="newyear"] h4,
    html[data-nf-theme="newyear"] h5,
    html[data-nf-theme="newyear"] h6 {color:#164a42 !important;}
    html[data-nf-theme="newyear"] main [class*="text-muted"],
    html[data-nf-theme="newyear"] main [class*="text-secondary"],
    html[data-nf-theme="newyear"] .tm-pink-table-head {color:#52718f !important;}
    html[data-nf-theme="newyear"] .grid.grid-cols-\\[minmax\\(0\\,1fr\\)\\]>div:not(.swiper-wrapper),
    html[data-nf-theme="newyear"] .grid.grid-cols-\\[minmax\\(0\\,1fr\\)\\] .rounded-2xl {
      background:linear-gradient(120deg,rgba(255,255,255,.98),rgba(243,249,255,.96)) !important;
      border:1px solid #cce1f3 !important;
      box-shadow:0 4px 16px rgba(44,101,154,.07) !important;
    }
    html[data-nf-theme="newyear"] button:hover,
    html[data-nf-theme="newyear"] [role="button"]:hover {border-color:#8ec0e8 !important;}
    html[data-nf-theme="newyear"] [role="tablist"] button[aria-selected="true"],
    html[data-nf-theme="newyear"] .swiper-slide button[data-state="active"] {
      background:linear-gradient(135deg,#24906d,#186c51) !important;
      color:#fff !important;border-color:#d8f3e9 !important;
      box-shadow:0 4px 12px rgba(24,108,81,.22) !important;
    }
    html[data-nf-theme="newyear"] [class*="bg-light-pink"] {
      background:linear-gradient(135deg,#e2f1fc,#d2e8fa) !important;
      color:#1b4f78 !important;border:1px solid #b5d6f2 !important;
    }
    html[data-nf-theme="newyear"] input,
    html[data-nf-theme="newyear"] textarea,
    html[data-nf-theme="newyear"] select,
    html[data-nf-theme="newyear"] [role="combobox"] {
      background-color:rgba(255,255,255,.95) !important;
      border-color:#c1daf0 !important;color:#1b3650 !important;
    }
    html[data-nf-theme="newyear"] input:focus,
    html[data-nf-theme="newyear"] textarea:focus,
    html[data-nf-theme="newyear"] select:focus {
      outline:2px solid rgba(31,122,92,.25) !important;border-color:#4aa586 !important;
    }
    html[data-nf-theme="newyear"] img[alt*="аватар"],
    html[data-nf-theme="newyear"] img[alt*="Avatar"],
    html[data-nf-theme="newyear"] img[class*="rounded-full"] {
      border:2px solid #b7d9f4 !important;
      box-shadow:0 2px 8px rgba(48,116,174,.16) !important;
    }
    html[data-nf-theme="newyear"] table {border-color:#c6ddf2 !important;}
    html[data-nf-theme="newyear"] th {color:#446684 !important;}
    html[data-nf-theme="newyear"] td {border-color:#dcebf8 !important;}
    html[data-nf-theme="newyear"] progress,[data-nf-theme="newyear"] [role="progressbar"] {accent-color:#1f7a5c !important;}
    html[data-nf-theme="newyear"] [role="progressbar"]>div {background:linear-gradient(90deg,#70cbb0,#1f7a5c) !important;}
    html[data-nf-theme="newyear"] * {scrollbar-color:#a3c8e8 #edf5fc;}
    html[data-nf-theme="newyear"] *::-webkit-scrollbar-track {background:#edf5fc;}
    html[data-nf-theme="newyear"] *::-webkit-scrollbar-thumb {background:linear-gradient(#bddcf5,#7eb5e3);border:2px solid #edf5fc;}

    /* Шапка домашки (ученик + прогресс) в зимних цветах */
    html[data-nf-theme="newyear"] main div.grid[class*="grid-cols-[1fr_auto]"]:has(> div.border-r) > div {
      background:linear-gradient(130deg,#ffffff 0%,#f1f8ff 100%) !important;
      border:1px solid #c5ddf2 !important;
      box-shadow:0 5px 18px rgba(44,104,158,.08) !important;
    }
    html[data-nf-theme="newyear"] main div.grid[class*="grid-cols-[1fr_auto]"]:has(> div.border-r) > div:last-child {
      background:linear-gradient(135deg,#ffffff 0%,#fdf9ec 100%) !important;
      border-color:#e8dcb5 !important;
    }
    html[data-nf-theme="newyear"] main div.grid[class*="grid-cols-[1fr_auto]"]:has(> div.border-r) > div:first-child {
      border-right:1px solid #c5ddf2 !important;
    }

    /* Сообщения методиста — свежий морозно-лазурный оттенок */
    html[data-nf-theme="newyear"] :is([id^="attempt-card-"][id$="-comments"],[id^="attempt-"][id$="-dialogue"])
      [data-current-user="true"][class*="bg-warn-green-3"] {
      background:linear-gradient(135deg,#e4f4f0 0%,#deecfa 100%) !important;
      border:1px solid #b5d6e6 !important;
      color:#183649 !important;
      box-shadow:0 3px 12px rgba(40,104,142,.08) !important;
    }
    html[data-nf-theme="newyear"] :is([id^="attempt-card-"][id$="-comments"],[id^="attempt-"][id$="-dialogue"])
      [data-current-user="true"][class*="bg-warn-green-3"] :is(span,div,p,strong,em,b,i) {
      color:#183649 !important;
    }

    /* Кнопка Регламент и кнопка начала проверки */
    html[data-nf-theme="newyear"] aside #nf-reg-sidebar-link {
      background:#e6f1fb !important;color:#1a4b63 !important;border:1px solid #c8dff3 !important;
    }
    html[data-nf-theme="newyear"] aside #nf-reg-sidebar-link .nf-pink-reg-icon {color:#1f7a5c !important;}
    html[data-nf-theme="newyear"] aside #nf-reg-sidebar-link .nf-pink-reg-label {color:#1a4b63 !important;}
    html[data-nf-theme="newyear"] aside #nf-reg-sidebar-link:hover {background:#d6e9fa !important;}
    html[data-nf-theme="newyear"] main .tm-pink-start-check {
      background:linear-gradient(125deg,#259470 0%,#1b7458 55%,#145842 100%) !important;
      border-color:rgba(255,255,255,.75) !important;
      box-shadow:0 6px 16px rgba(24,108,81,.24),inset 0 1px 0 rgba(255,255,255,.25) !important;
    }
    html[data-nf-theme="newyear"] main .tm-pink-start-check:hover {
      background:linear-gradient(125deg,#2aa37c 0%,#1f8263 55%,#17644b 100%) !important;
    }

    /* Совместимость NeoCheck расписания смен (зелёный / лавандовый сохраняем) */
    html[data-nf-theme="newyear"] #nf-shift-panel {background:#fafdff !important;border:1px solid #c5ddf2 !important;color:#24384d !important;}
    html[data-nf-theme="newyear"] #nf-shift-panel select[aria-label]:has(option[value="hw"]:checked) {
      background:#ddf3e5 !important;color:#176238 !important;border-color:#8dccaa !important;
    }
    html[data-nf-theme="newyear"] #nf-shift-panel select[aria-label]:has(option[value="chat"]:checked) {
      background:#e8e1ff !important;color:#5132a4 !important;border-color:#b8a5e9 !important;
    }

    /* Деликатная гирлянда строго по самой верхней кромке (26px, чистый GPU opacity без filter-анимаций) */
    #nf-ny-garland {
      position:fixed;top:0;left:0;right:0;height:26px;pointer-events:none;z-index:9991;overflow:hidden;
      contain:layout style paint;
    }
    #nf-ny-garland svg {display:block;width:100%;height:26px;}
    html[data-nf-motion="yes"] #nf-ny-garland .nf-ny-bulb-a {animation:nfNyTwinkle 2.4s ease-in-out infinite alternate;}
    html[data-nf-motion="yes"] #nf-ny-garland .nf-ny-bulb-b {animation:nfNyTwinkle 2.4s ease-in-out -1.2s infinite alternate;}
    @keyframes nfNyTwinkle {0%{opacity:.42;}100%{opacity:1;}}

    /* Мягкие падающие снежинки (без text-shadow и лишних слоёв для стабильных 60 FPS) */
    #nf-ny-snow {
      position:fixed;inset:0;pointer-events:none;z-index:9990;overflow:hidden;
      contain:layout style paint;
    }
    .nf-ny-flake {
      position:absolute;top:-24px;user-select:none;line-height:1;
      color:#6cb2ea;
    }
    html[data-nf-motion="yes"] .nf-ny-flake {
      animation:nfNySnowFall var(--dur,15s) linear var(--del,0s) infinite;
    }
    html[data-nf-motion="no"] .nf-ny-flake {top:var(--rest,12%);opacity:.42;}
    @keyframes nfNySnowFall {
      0%{transform:translate3d(0,-20px,0);opacity:0;}
      12%{opacity:var(--op,.65);}
      88%{opacity:var(--op,.65);}
      100%{transform:translate3d(var(--sway,16px),105vh,0);opacity:0;}
    }

    html[data-nf-decor="minimal"] #nf-ny-snow .nf-ny-flake:nth-child(n+8) {display:none;}
    html[data-nf-decor="off"] #nf-ny-garland,
    html[data-nf-decor="off"] #nf-ny-snow,
    html.nf-check-focus #nf-ny-garland,
    html.nf-check-focus #nf-ny-snow,
    html.nf-check-focus #nf-ny-tree-box,
    html[data-nf-decor="off"] #nf-ny-tree-box {display:none !important;}

    /* Боковые новогодние SVG-иллюстрации только по краям (Снеговик и Био-шар справа, без CSS-фильтров) */
    html[data-nf-theme="newyear"] #nf-theme-art {z-index:1;contain:layout style paint;}
    html[data-nf-theme="newyear"] #nf-theme-art .nf-theme-illustration {filter:none;opacity:.92;}
    html[data-nf-theme="newyear"] #nf-theme-art .nf-theme-illustration:nth-child(1) {
      right:10px;left:auto;top:auto;bottom:82px;width:104px;height:104px;
    }
    html[data-nf-theme="newyear"] #nf-theme-art .nf-theme-illustration:nth-child(2) {
      right:10px;left:auto;top:76px;bottom:auto;width:88px;height:88px;opacity:.86;
    }
    @media (max-width:1380px) {
      html[data-nf-theme="newyear"] #nf-theme-art .nf-theme-illustration:nth-child(2) {display:none;}
      html[data-nf-theme="newyear"] #nf-theme-art .nf-theme-illustration {width:76px;height:76px;opacity:.76;}
    }

    /* Интерактивная Ёлочка команды (с шариками и пожеланиями методистов) */
    #nf-ny-tree-box {
      position:fixed;left:12px;bottom:68px;z-index:9991;
      font-family:Comfortaa,'Trebuchet MS',system-ui,sans-serif;
      contain:layout style;
    }
    #nf-ny-tree-card {
      width:162px;padding:7px 8px 8px;border-radius:18px;
      background:rgba(252,254,255,.92);border:1px solid #c4ddf2;
      box-shadow:0 8px 26px rgba(34,88,140,.14);color:#1b3650;
      display:flex;flex-direction:column;align-items:center;gap:4px;
    }
    #nf-ny-tree-head {
      width:100%;display:flex;align-items:center;justify-content:space-between;gap:4px;
      font:800 11px Comfortaa,sans-serif;color:#175a42;padding:0 2px;
    }
    #nf-ny-tree-hide {
      width:20px;height:20px;padding:0;border:1px solid #cfe3f4;border-radius:7px;
      background:#f2f8ff;color:#476985;font:800 12px/1 sans-serif;cursor:pointer;
    }
    #nf-ny-tree-svg {width:146px;height:152px;display:block;overflow:visible;}
    #nf-ny-tree-svg .nf-ny-ornament {
      cursor:pointer;transform-box:fill-box;transform-origin:center;
      transition:transform .16s ease,opacity .35s ease;
    }
    #nf-ny-tree-svg .nf-ny-ornament:hover,
    #nf-ny-tree-svg .nf-ny-ornament:focus-visible {transform:scale(1.26);outline:none;}
    #nf-ny-tree-meta {
      width:100%;display:flex;align-items:center;justify-content:space-between;gap:4px;
      font:700 10px sans-serif;color:#52718f;padding:0 3px;
    }
    #nf-ny-tree-next {
      border:1px solid #cbe0f3;border-radius:7px;background:#f2f8ff;color:#1f6e53;
      font:800 11px sans-serif;padding:1px 6px;cursor:pointer;line-height:1.25;
    }
    #nf-ny-tree-action {
      width:100%;border:0;border-radius:11px;padding:6px 8px;cursor:pointer;
      background:linear-gradient(135deg,#259470,#186c51);color:#fff;
      font:800 11px Comfortaa,sans-serif;box-shadow:0 3px 10px rgba(24,108,81,.22);
    }
    #nf-ny-tree-action:hover {filter:brightness(1.06);}
    #nf-ny-tree-pill {
      border:1px solid #b8d6ef;border-radius:13px;background:#f4f9ff;color:#175a42;
      padding:7px 11px;font:800 11px Comfortaa,sans-serif;cursor:pointer;
      box-shadow:0 5px 16px rgba(34,88,140,.15);display:inline-flex;align-items:center;gap:5px;
    }
    #nf-ny-tree-tip {
      position:fixed;z-index:2147483640;max-width:255px;min-width:165px;
      padding:10px 12px;border-radius:14px;pointer-events:none;
      background:rgba(255,255,255,.98);border:1px solid #b9d7f2;color:#1b3650;
      box-shadow:0 12px 32px rgba(26,72,118,.22);font:12px/1.45 sans-serif;
    }
    @media (max-width:1100px) {
      #nf-ny-snow .nf-ny-flake:nth-child(n+12) {display:none;}
      #nf-ny-tree-box {left:8px;bottom:62px;}
    }
    @media (prefers-reduced-motion:reduce) {
      .nf-ny-flake,#nf-ny-garland *,#nf-ny-tree-svg * {animation:none !important;transition:none !important;}
    }
  `;

  // Тёплая «Бумага для чтения» (Minimal Focus): жёлтовато-кремовый фон в духе E-Ink, мягкая сепия и ноль лишнего декора
  const paperCss = `
    html[data-nf-theme="paper"] body {
      background:linear-gradient(155deg,#f8f1dd 0%,#f2e7ce 54%,#ece0c2 100%) fixed !important;
      color:#2b2116 !important;
    }
    html[data-nf-theme="paper"] ::selection {background:#f2d485 !important;color:#231a10 !important;}
    html[data-nf-theme="paper"] header {
      background:rgba(249,243,226,.95) !important;
      border-bottom:1px solid #d9c8a8 !important;
      box-shadow:0 3px 12px rgba(96,70,35,.07) !important;
      backdrop-filter:none !important;
    }
    html[data-nf-theme="paper"] nav a:hover,
    html[data-nf-theme="paper"] nav button:hover,
    html[data-nf-theme="paper"] nav [role="button"]:hover {
      background:#eadcc0 !important;color:#5c3413 !important;
    }
    html[data-nf-theme="paper"] h1,
    html[data-nf-theme="paper"] h2,
    html[data-nf-theme="paper"] h3,
    html[data-nf-theme="paper"] h4,
    html[data-nf-theme="paper"] h5,
    html[data-nf-theme="paper"] h6 {color:#3d2a16 !important;}
    html[data-nf-theme="paper"] main [class*="text-muted"],
    html[data-nf-theme="paper"] main [class*="text-secondary"],
    html[data-nf-theme="paper"] .tm-pink-table-head {color:#6d5c47 !important;}
    html[data-nf-theme="paper"] aside,
    html[data-nf-theme="paper"] main .rounded-2xl,
    html[data-nf-theme="paper"] .grid.grid-cols-\\[minmax\\(0\\,1fr\\)\\]>div:not(.swiper-wrapper),
    html[data-nf-theme="paper"] .grid.grid-cols-\\[minmax\\(0\\,1fr\\)\\] .rounded-2xl {
      background:#fbf6e8 !important;color:#2b2116 !important;
      border-color:#d9c8a8 !important;box-shadow:0 3px 14px rgba(105,78,39,.07) !important;
    }
    html[data-nf-theme="paper"] button:hover,
    html[data-nf-theme="paper"] [role="button"]:hover {border-color:#bfa376 !important;}
    html[data-nf-theme="paper"] [role="tablist"] button[aria-selected="true"],
    html[data-nf-theme="paper"] .swiper-slide button[data-state="active"] {
      background:#e7d7b5 !important;color:#4a2b10 !important;border-color:#b8925c !important;
    }
    html[data-nf-theme="paper"] [class*="bg-light-pink"] {
      background:#f0e4c8 !important;color:#4a2b10 !important;border-color:#d4bf98 !important;
    }
    html[data-nf-theme="paper"] input,
    html[data-nf-theme="paper"] textarea,
    html[data-nf-theme="paper"] select,
    html[data-nf-theme="paper"] [role="combobox"],
    html[data-nf-theme="paper"] [contenteditable="true"] {
      background-color:#f6eed7 !important;color:#2b2116 !important;
      border-color:#d4c19e !important;caret-color:#8a4f1d !important;
    }
    html[data-nf-theme="paper"] input:focus,
    html[data-nf-theme="paper"] textarea:focus,
    html[data-nf-theme="paper"] select:focus {
      box-shadow:0 0 0 2px rgba(156,92,37,.20) !important;border-color:#9c5c25 !important;
    }
    html[data-nf-theme="paper"] [id^="attempt-card-"] img:not([alt*="аватар"]),
    html[data-nf-theme="paper"] [data-task-id] img:not([alt*="аватар"]) {
      border-color:#d9c8a8 !important;filter:none !important;
    }
    html[data-nf-theme="paper"] :is([id^="attempt-card-"][id$="-comments"],[id^="attempt-"][id$="-dialogue"])
      :is([class*="rounded-xl"],[class*="rounded-2xl"],[class*="bg-white"],[class*="bg-gray"],[class*="bg-slate"],.ProseMirror){
      background-color:#f6eed7 !important;color:#2b2116 !important;border-color:#d4c19e !important;
    }
    html[data-nf-theme="paper"] aside #nf-reg-sidebar-link .nf-pink-reg-icon {color:#9c5c25 !important;}
    html[data-nf-theme="paper"] aside #nf-reg-sidebar-link .nf-pink-reg-label {color:#4a2b10 !important;}
    html[data-nf-theme="paper"] aside #nf-reg-sidebar-link:hover {background:#eadcc0 !important;}
    html[data-nf-theme="paper"] main .tm-pink-start-check {
      background:linear-gradient(125deg,#9c5c25,#7d4618) !important;color:#fff !important;
      border:1px solid #6b3b12 !important;box-shadow:0 5px 14px rgba(125,70,24,.22) !important;
    }
    html[data-nf-theme="paper"] main .tm-pink-start-check:hover {background:linear-gradient(125deg,#874d1d,#6b3b12) !important;}
    html[data-nf-theme="paper"] #nf-shift-panel {background:#fbf6e8 !important;border:1px solid #d9c8a8 !important;color:#2b2116 !important;}
    html[data-nf-theme="paper"] .nf-stats-widget,
    html[data-nf-theme="paper"] .nf-tpl-panel,
    html[data-nf-theme="paper"] .nf-attach-preview {background:#fbf6e8 !important;border-color:#d9c8a8 !important;color:#2b2116 !important;}
    html[data-nf-theme="paper"] .nf-ai-clean-bar,
    html[data-nf-theme="paper"] .nf-dlg-summary-bar,
    html[data-nf-theme="paper"] .nf-quick-replies button {background:#f2e7ce !important;border-color:#d4bf98 !important;color:#4a2b10 !important;}
    html[data-nf-theme="paper"] #nf-theme-trigger,
    html[data-nf-theme="paper"] #nf-theme-panel {background:#fbf6e8 !important;border-color:#d4bf98 !important;color:#2b2116 !important;}
    html[data-nf-theme="paper"] .nf-theme-option {background:#f6eed7 !important;border-color:#d4bf98 !important;color:#2b2116 !important;}
    html[data-nf-theme="paper"] .nf-theme-option[aria-pressed="true"] {outline:2px solid #9c5c25 !important;}
    html[data-nf-theme="paper"] #nf-theme-art,
    html[data-nf-theme="paper"] #nf-ny-garland,
    html[data-nf-theme="paper"] #nf-ny-snow,
    html[data-nf-theme="paper"] #nf-ny-tree-box,
    html[data-nf-theme="paper"] #nf-hw-edge-art {display:none !important;}
  `;

  const themeUiCss=`
    ${themeCss}
    ${newYearCss}
    ${paperCss}
    #nf-theme-switcher {position:fixed;right:16px;top:48%;z-index:10020;font:600 13px/1.4 system-ui,sans-serif;}
    #nf-theme-trigger {width:44px;height:44px;border-radius:14px;border:1px solid var(--pink-border) !important;background:var(--pink-surface-strong) !important;color:var(--pink-text) !important;box-shadow:0 5px 20px rgba(0,0,0,.15) !important;cursor:pointer;font-size:22px;}
    #nf-theme-panel {position:absolute;right:52px;top:-84px;width:260px;max-height:min(520px,85vh);overflow:auto;padding:14px;border:1px solid var(--pink-border);background:var(--pink-surface-strong);color:var(--pink-text);border-radius:18px;box-shadow:0 12px 35px rgba(0,0,0,.22);}
    #nf-theme-panel[hidden]{display:none !important;}
    .nf-theme-title {font-size:16px;font-weight:800;margin:0 0 10px;}
    .nf-theme-option {width:100%;padding:10px;margin:3px 0;display:flex;gap:10px;align-items:center;text-align:left;border:1px solid var(--pink-border) !important;background:var(--pink-surface) !important;color:var(--pink-text) !important;border-radius:12px;cursor:pointer;font:600 12px system-ui,sans-serif;}
    .nf-theme-option[aria-pressed="true"] {outline:2px solid var(--pink-main);outline-offset:0;}
    .nf-theme-options-caption{font-size:11px;opacity:.85;margin-top:10px;}
    .nf-theme-settings {display:flex;align-items:center;justify-content:space-between;gap:10px;margin:9px 0;font:12px system-ui,sans-serif;}
    .nf-theme-settings select {min-width:105px;max-width:125px;padding:5px;color:var(--pink-text) !important;background:var(--pink-surface) !important;border:1px solid var(--pink-border) !important;}
    #nf-theme-art {position:fixed;inset:0;pointer-events:none;z-index:2;overflow:hidden;}
    .nf-theme-illustration {position:absolute;width:115px;height:115px;opacity:.66;filter:drop-shadow(0 5px 15px rgba(0,0,0,.12));}
    .nf-theme-illustration:nth-child(1){left:5px;top:27%;}
    .nf-theme-illustration:nth-child(2){right:5px;top:46%;}
    .nf-theme-illustration:nth-child(3){left:9px;bottom:5%;}
    html[data-nf-motion="yes"] .nf-theme-illustration:nth-child(2) {animation:nf-theme-drift 8s ease-in-out infinite alternate;}
    @keyframes nf-theme-drift{from{transform:translateY(0)}to{transform:translateY(-8px)}}
    html[data-nf-decor="minimal"] .nf-theme-illustration:not(:first-child){display:none;}
    html[data-nf-decor="off"] #nf-theme-art{display:none;}
    html.nf-check-focus #nf-theme-art {display:none !important;}
    @media (max-width:1100px){#nf-theme-art{display:none;}#nf-theme-switcher{right:8px;top:auto;bottom:80px;}}
    @media (prefers-reduced-motion:reduce){.nf-theme-illustration{animation:none !important;}}
  `;
  addCss(themeUiCss);

  // Halloween dark layout & compatibility patches
  const halloweenLayoutCss = `
    html[data-nf-theme="halloween"] {
      --nf-night-bg:#211a29;--nf-night-panel:#312638;
      --nf-night-panel2:#3c2d43;--nf-night-ink:#f7edf7;
      --nf-night-secondary:#dbcbdc;--nf-night-line:#70536d;
    }
    html[data-nf-theme="halloween"] :is(aside,nav,[role="navigation"]),
    html[data-nf-theme="halloween"] :is(aside,nav,[role="navigation"]) :is(a,button,[role="button"],span,p,div,small,li,svg) {
      color:var(--nf-night-ink) !important;
      --tw-text-opacity:1 !important;
      opacity:1 !important;
    }
    html[data-nf-theme="halloween"] :is(aside,nav,[role="navigation"]) :is(a,button,[role="button"]):hover {
      background:#48344c !important;color:#fff8f0 !important;
    }
    html[data-nf-theme="halloween"] :is(aside,nav,[role="navigation"]) :is([aria-current="page"],[data-active="true"],[class*="bg-subject-biology"]) {
      background:#49344c !important;color:#ffc391 !important;
    }
    html[data-nf-theme="halloween"] main div.grid[class*="grid-cols-[1fr_auto]"]:has(> div.border-r) > div,
    html[data-nf-theme="halloween"] main div.grid[class*="grid-cols-[1fr_auto]"]:has(> div.border-r) > div:last-child {
      background:linear-gradient(135deg,#352a3e,#3d2e43) !important;
      border:1px solid #76576d !important;
      color:var(--nf-night-ink) !important;
      box-shadow:0 5px 18px rgba(8,5,14,.24) !important;
    }
    html[data-nf-theme="halloween"] main div.grid[class*="grid-cols-[1fr_auto]"]:has(> div.border-r) > div:first-child {
      border-right:1px solid #76576d !important;
    }
    html[data-nf-theme="halloween"] main div.grid[class*="grid-cols-[1fr_auto]"]:has(> div.border-r) > div :is(p,span,div,strong,small) {
      color:var(--nf-night-ink) !important;
      -webkit-text-fill-color:var(--nf-night-ink) !important;
      opacity:1 !important;
    }
    html[data-nf-theme="halloween"] :is(main,[role="main"]) :is(
      .tm-pink-table-head, [class*="text-natural"],[class*="text-dark"],
      [class*="text-gray"],[class*="text-black"],[class*="text-muted"],
      [class*="text-secondary"], [class*="text-opacity"], [style*="color:"]
    ) {color:var(--nf-night-secondary) !important;-webkit-text-fill-color:var(--nf-night-secondary) !important;opacity:1 !important;}
    html[data-nf-theme="halloween"] :is(main,[role="main"]) :is(h1,h2,h3,h4,h5,h6,strong,b) {
      color:var(--nf-night-ink) !important;-webkit-text-fill-color:var(--nf-night-ink) !important;
    }
    html[data-nf-theme="halloween"] :is(#nf-shift-today,#nf-shift-today *,[class*="nf-shift-summary"]),
    html[data-nf-theme="halloween"] #nf-shift-today :is(div,span,p,strong) {
      color:#f4ebf6 !important;-webkit-text-fill-color:#f4ebf6 !important;
    }
    html[data-nf-theme="halloween"] #nf-shift-today,
    html[data-nf-theme="halloween"] .nf-hw-shift-head {
      background:#3a2d41 !important;border:1px solid #77576c !important;
      border-radius:15px !important;
    }
    html[data-nf-theme="halloween"] #nf-shift-today :is([class*="green"],[class*="bg-warn-green"]) {
      background:#294734 !important;color:#dbf7df !important;
      -webkit-text-fill-color:#dbf7df !important;
    }
    html[data-nf-theme="halloween"] :is([role="tablist"],.swiper-slide) button,
    html[data-nf-theme="halloween"] :is(main,[role="main"]) :is(button,[role="tab"],[role="button"])[class*="rounded-full"] {
      background:#392b42 !important;color:#f3e6f4 !important;
      -webkit-text-fill-color:#f3e6f4 !important;border:1px solid #76566b !important;
    }
    html[data-nf-theme="halloween"] :is([role="tablist"],.swiper-slide) button :is(span,div,small,strong),
    html[data-nf-theme="halloween"] :is(main,[role="main"]) :is(button,[role="tab"],[role="button"])[class*="rounded-full"] :is(span,div,small,strong) {
      color:#f3e6f4 !important;-webkit-text-fill-color:#f3e6f4 !important;
    }
    html[data-nf-theme="halloween"] :is([role="tablist"],.swiper-slide) button[aria-selected="true"],
    html[data-nf-theme="halloween"] :is([role="tablist"],.swiper-slide) button[data-state="active"] {
      background:#76402f !important;border-color:#f3a467 !important;
    }
    html[data-nf-theme="halloween"] :is(main,[role="main"]) :is(
      [class*="bg-white"],[class*="bg-light-pink"],
      [class*="bg-background-secondary"], [class*="bg-background-primary"]
    ):not([class*="bg-warn-green"]):not([class*="bg-warn-red"]) {
      background-color:var(--nf-night-panel) !important;
      border-color:var(--nf-night-line) !important;
    }
    html[data-nf-theme="halloween"] main .grid.grid-cols-\\[minmax\\(0\\,1fr\\)\\]>div:not(.swiper-wrapper),
    html[data-nf-theme="halloween"] main .grid.grid-cols-\\[minmax\\(0\\,1fr\\)\\] .rounded-2xl {
      background:var(--nf-night-panel) !important;
      border-color:var(--nf-night-line) !important;
    }
    html[data-nf-theme="halloween"] .nf-hw-shift-head,
    html[data-nf-theme="halloween"] .nf-hw-shift-head :is(div,p,span,strong,b,small) {
      color:#f1e5f0 !important;-webkit-text-fill-color:#f1e5f0 !important;
      opacity:1 !important;
    }
    html[data-nf-theme="halloween"] .nf-hw-shift-head [class*="bg-green"],
    html[data-nf-theme="halloween"] .nf-hw-shift-head [class*="bg-warn-green"] {
      background:#355442 !important;
    }
    html[data-nf-theme="halloween"] .nf-hw-shift-head [class*="bg-green"] :is(span,div),
    html[data-nf-theme="halloween"] .nf-hw-shift-head [class*="bg-warn-green"] :is(span,div) {
      color:#e4ffe9 !important;-webkit-text-fill-color:#e4ffe9 !important;
    }
    html[data-nf-theme="halloween"] :is(#nf-reg-overlay,#nf-shift-panel,.nf-tpl-panel,.nf-stats-widget,.nf-attach-preview) :is(p,span,div,label,li,strong,td,th,button) {
      -webkit-text-fill-color:currentColor !important;
    }
    html[data-nf-theme="halloween"] :is(input,textarea,[contenteditable="true"])::placeholder {
      color:#cbb8cf !important;opacity:1 !important;
    }
    html[data-nf-theme="halloween"] [data-current-user="true"][class*="bg-warn-green-3"] {
      background:#d9c8f0 !important;color:#352741 !important;
    }
    html[data-nf-theme="halloween"] [data-current-user="true"][class*="bg-warn-green-3"] :is(span,div,p,strong) {
      color:#352741 !important;-webkit-text-fill-color:#352741 !important;
    }
    @media(prefers-reduced-motion:reduce){html[data-nf-theme="halloween"] *{scroll-behavior:auto !important;}}
  `;
  addCss(halloweenLayoutCss);

  const halloweenShiftContrastCss = `
    html[data-nf-theme="halloween"] #nf-shift-today {background:transparent !important;border:0 !important;color:#f3eaf3 !important;}
    html[data-nf-theme="halloween"] #nf-shift-today > div {background:#362a40 !important;border:1px solid #76556d !important;box-shadow:0 3px 14px rgba(10,6,17,.13) !important;}
    html[data-nf-theme="halloween"] #nf-shift-today > div:first-child {background:#362b3b !important;border-color:#7a5568 !important;}
    html[data-nf-theme="halloween"] #nf-shift-today > div:last-child {background:#3a2c42 !important;}
    html[data-nf-theme="halloween"] #nf-shift-today > div > span:first-child {color:#d9b6df !important;-webkit-text-fill-color:#d9b6df !important;opacity:1 !important;}
    html[data-nf-theme="halloween"] #nf-shift-today > div > strong,
    html[data-nf-theme="halloween"] #nf-shift-today > div > div:not(:has(*)) {color:#fff5f1 !important;-webkit-text-fill-color:#fff5f1 !important;opacity:1 !important;}
    html[data-nf-theme="halloween"] #nf-shift-today > div:last-child > div > span {background:#3f5949 !important;border:1px solid #678874 !important;color:#ebffef !important;-webkit-text-fill-color:#ebffef !important;opacity:1 !important;}
    html[data-nf-theme="halloween"] #nf-shift-today > div:last-child > div > span[style*="#eae8ff"] {background:#51416d !important;border-color:#7e69a4 !important;color:#f6edff !important;-webkit-text-fill-color:#f6edff !important;}
    html[data-nf-theme="halloween"] #nf-shift-today > div:last-child > div > span[style*="#746b7e"] {background:transparent !important;border:0 !important;color:#e4d5e4 !important;-webkit-text-fill-color:#e4d5e4 !important;}
  `;
  addCss(halloweenShiftContrastCss);

  const halloweenNeoCheckWidgetsCss = `
    html[data-nf-theme="halloween"] #nf-reg-sidebar-link,
    html[data-nf-theme="halloween"] #nf-backup-sidebar-link {background:#38273d !important;color:#f9ecf6 !important;border:1px solid #75506b !important;box-shadow:0 2px 12px rgba(0,0,0,.12) !important;}
    html[data-nf-theme="halloween"] #nf-reg-sidebar-link :is(span,svg),
    html[data-nf-theme="halloween"] #nf-backup-sidebar-link :is(span,svg) {color:#f9ecf6 !important;opacity:1 !important;}
    html[data-nf-theme="halloween"] #nf-reg-sidebar-link:hover,
    html[data-nf-theme="halloween"] #nf-backup-sidebar-link:hover {background:#513247 !important;border-color:#ef9a60 !important;}
    html[data-nf-theme="halloween"] .nf-stats-widget {background:#302337 !important;color:#f7edf6 !important;border:1px solid #82556e !important;box-shadow:0 10px 30px rgba(10,6,15,.4) !important;}
    html[data-nf-theme="halloween"] .nf-stats-widget :is(div,span,p,label,strong,b,small) {color:#eee2f0 !important;opacity:1 !important;text-shadow:none !important;}
    html[data-nf-theme="halloween"] .nf-stats-widget > button,
    html[data-nf-theme="halloween"] .nf-stats-widget button {background:#42304a !important;color:#fff0fa !important;border-color:#876280 !important;opacity:1 !important;}
    html[data-nf-theme="halloween"] .nf-stats-widget button:hover {background:#60415b !important;border-color:#ffad77 !important;}
    html[data-nf-theme="halloween"] .nf-stats-widget :is(input,select,textarea) {background:#261d30 !important;color:#f7edf6 !important;border-color:#876280 !important;}
    html[data-nf-theme="halloween"] .nf-stats-widget button[aria-pressed="true"] {outline:2px solid #ffac70 !important;outline-offset:1px;}
    html[data-nf-theme="halloween"] #nf-reg-overlay > section {background:#231c2d !important;color:#f4e9f4 !important;border:1px solid #75526d !important;box-shadow:0 25px 75px rgba(0,0,0,.55) !important;}
    html[data-nf-theme="halloween"] #nf-reg-overlay > section > div:first-child {background:#34263c !important;border-bottom:1px solid #71516b !important;color:#f7edf6 !important;}
    html[data-nf-theme="halloween"] #nf-reg-overlay > section > div:nth-child(2) {background:#302437 !important;color:#d9cbdc !important;border-bottom-color:#71516b !important;}
    html[data-nf-theme="halloween"] #nf-reg-overlay input[type="search"] {background:#3a2b42 !important;color:#f9f0f8 !important;border-color:#815a76 !important;}
    html[data-nf-theme="halloween"] #nf-reg-overlay input::placeholder {color:#c4b4c8 !important;opacity:1 !important;}
    html[data-nf-theme="halloween"] #nf-reg-overlay nav {background:#2d2335 !important;color:#f5e9f5 !important;border-right-color:#6f5068 !important;}
    html[data-nf-theme="halloween"] #nf-reg-overlay nav button {background:transparent !important;color:#eadbed !important;opacity:1 !important;border:1px solid transparent !important;}
    html[data-nf-theme="halloween"] #nf-reg-overlay nav button[style*="#e9e2f8"] {background:#55394d !important;border-color:#af765f !important;color:#fff5f1 !important;}
    html[data-nf-theme="halloween"] #nf-reg-overlay nav button:hover {background:#44324a !important;}
    html[data-nf-theme="halloween"] #nf-reg-overlay article {background:#241d2e !important;color:#e9dfee !important;}
    html[data-nf-theme="halloween"] #nf-reg-overlay article :is(h1,h2,h3,h4,h5,h6,strong,b,p,li,span) {color:#f0e5f0 !important;opacity:1 !important;text-shadow:none !important;}
    html[data-nf-theme="halloween"] #nf-reg-overlay article :is(h2,h3) {color:#ffbc8f !important;border-bottom-color:#705169 !important;}
    html[data-nf-theme="halloween"] #nf-reg-overlay article .nf-reg-example-card {background:#372a40 !important;border-color:#73536e !important;border-left-color:#ff9e5c !important;box-shadow:none !important;}
    html[data-nf-theme="halloween"] #nf-reg-overlay article .nf-reg-example-card :is(p,strong,h1,h2,h3,h4) {color:#f4e7f3 !important;}
    html[data-nf-theme="halloween"] #nf-reg-overlay > section > div:first-child button {background:#55405d !important;color:#fff !important;border:1px solid #805c78 !important;}
    html[data-nf-theme="halloween"] #nf-backup-overlay > div {background:#282032 !important;color:#f7edf6 !important;border-color:#825f79 !important;box-shadow:0 22px 65px rgba(0,0,0,.5) !important;}
    html[data-nf-theme="halloween"] #nf-backup-overlay :is(h2,p,span,strong,small,label,div) {color:#f2e7f2 !important;opacity:1 !important;}
    html[data-nf-theme="halloween"] #nf-backup-overlay button {background:#42304a !important;color:#fff2fa !important;border-color:#906a86 !important;}
    html[data-nf-theme="halloween"] #nf-backup-overlay button:hover {background:#5b3c56 !important;}
    html[data-nf-theme="halloween"] .nf-tpl-panel,
    html[data-nf-theme="halloween"] .nf-attach-preview {background:#302538 !important;color:#f5e9f5 !important;border-color:#77566f !important;}
    html[data-nf-theme="halloween"] :is(.nf-tpl-panel,.nf-attach-preview) :is(p,span,label,strong,small) {color:#f5e9f5 !important;}
  `;
  addCss(halloweenNeoCheckWidgetsCss);

  const halloweenWorkspacesCss = `
    html[data-nf-theme="halloween"] #nf-shift-panel {background:#2f2438 !important;color:#f6ecf5 !important;border:1px solid #76556e !important;box-shadow:0 12px 32px rgba(8,5,14,.25) !important;}
    html[data-nf-theme="halloween"] #nf-shift-panel :is(strong,th,td,p,span,div,label,small){color:#ede1f0 !important;-webkit-text-fill-color:#ede1f0 !important;opacity:1 !important;}
    html[data-nf-theme="halloween"] #nf-shift-panel table th {color:#f0e4f2 !important;-webkit-text-fill-color:#f0e4f2 !important;}
    html[data-nf-theme="halloween"] #nf-shift-panel table th[style*="background"]{background:#5a443c !important;color:#ffe4bc !important;-webkit-text-fill-color:#ffe4bc !important;}
    html[data-nf-theme="halloween"] #nf-shift-panel button{background:#43324d !important;color:#fff1f8 !important;-webkit-text-fill-color:#fff1f8 !important;border-color:#815f79 !important;}
    html[data-nf-theme="halloween"] #nf-shift-panel button:hover {background:#624258 !important;}
    html[data-nf-theme="halloween"] #nf-shift-panel table select{background:#3c2e46 !important;color:#f2e8f2 !important;-webkit-text-fill-color:#f2e8f2 !important;border-color:#70546b !important;color-scheme:dark;}
    html[data-nf-theme="halloween"] #nf-shift-panel table select[value="homework"],
    html[data-nf-theme="halloween"] #nf-shift-panel table select.nf-hw-shift-homework{background:#2c4a3c !important;color:#e4ffe8 !important;-webkit-text-fill-color:#e4ffe8 !important;border-color:#568367 !important;}
    html[data-nf-theme="halloween"] #nf-shift-panel table select.nf-hw-shift-chat{background:#453765 !important;color:#efe7ff !important;-webkit-text-fill-color:#efe7ff !important;border-color:#8064ae !important;}
    html[data-nf-theme="halloween"] #nf-shift-panel table select option{background:#352940 !important;color:#f8edf5 !important;}
    html[data-nf-theme="halloween"] #nf-shift-tab {background:#44314b !important;border:1px solid #805d78 !important;color:#f5ecf4 !important;-webkit-text-fill-color:#f5ecf4 !important;}
    html[data-nf-theme="halloween"] .nf-tpl-panel,
    html[data-nf-theme="halloween"] .nf-quick-replies{background:transparent !important;color:#f6e9f5 !important;}
    html[data-nf-theme="halloween"] :is(.nf-tpl-panel,.nf-quick-replies) :is(button,button[style]){background:#44304d !important;color:#fff0f5 !important;-webkit-text-fill-color:#fff0f5 !important;border:1px solid #896780 !important;opacity:1 !important;}
    html[data-nf-theme="halloween"] :is(.nf-tpl-panel,.nf-quick-replies) button:hover{background:#684356 !important;border-color:#f5a46b !important;}
    html[data-nf-theme="halloween"] .nf-tpl-panel :is(div,span,strong,label,p){color:#f4eaf3 !important;-webkit-text-fill-color:#f4eaf3 !important;opacity:1 !important;}
    html[data-nf-theme="halloween"] .nf-tpl-panel :is(input,textarea){background:#30253b !important;color:#fff1f7 !important;-webkit-text-fill-color:#fff1f7 !important;border-color:#88657d !important;color-scheme:dark;}
    html[data-nf-theme="halloween"] .nf-tpl-panel [style*="background:#fff"]:not(button):not(img){background:#372a42 !important;}
    html[data-nf-theme="halloween"] .nf-tpl-panel img,
    html[data-nf-theme="halloween"] .nf-preview img{background:#fff !important;filter:none !important;}
    html[data-nf-theme="halloween"] .nf-preview > div {background:#302539 !important;border:1px solid #815b76 !important;color:#f5ecf5 !important;}
    html[data-nf-theme="halloween"] .nf-preview > div > div:first-child {color:#fff1f8 !important;-webkit-text-fill-color:#fff1f8 !important;}
    html[data-nf-theme="halloween"] .nf-hw-photo-dialog {background:#281f32 !important;color:#f7edf5 !important;border-color:#78576e !important;color-scheme:dark;}
    html[data-nf-theme="halloween"] .nf-hw-photo-dialog :is(header,h1,h2,h3,h4,section,article,div,span,p,strong,small) {color:#f5eaf4 !important;-webkit-text-fill-color:#f5eaf4 !important;}
    html[data-nf-theme="halloween"] .nf-hw-photo-dialog :is(header,[class*="bg-background"],[class*="bg-white"],[class*="bg-light"], [style*="background: rgb(255"]){background:#382941 !important;}
    html[data-nf-theme="halloween"] .nf-hw-photo-dialog img,
    html[data-nf-theme="halloween"] .nf-hw-photo-dialog svg,
    html[data-nf-theme="halloween"] .nf-hw-photo-dialog canvas{filter:none !important;opacity:1 !important;-webkit-text-fill-color:initial;}
    html[data-nf-theme="halloween"] .nf-hw-photo-dialog :is(button,[role="button"]){border-color:#876580 !important;}
    html[data-nf-theme="halloween"] .nf-hw-photo-dialog :is(button,[role="button"]):hover{background:#5b405b !important;}
  `;
  addCss(halloweenWorkspacesCss);

  const halloweenSnapshotFixCss = `
    html[data-nf-theme="halloween"] .tm-neofamily-review-key-v4 {background:#2b2234 !important;color:#f7eef6 !important;border:1px solid #805c74 !important;box-shadow:0 12px 35px rgba(10,6,15,.48) !important;color-scheme:dark;}
    html[data-nf-theme="halloween"] .tm-neofamily-review-key-v4 .tm-nf-key-handle {background:#3f2c42 !important;color:#ffdab6 !important;-webkit-text-fill-color:#ffdab6 !important;border-color:#805c74 !important;}
    html[data-nf-theme="halloween"] .tm-neofamily-review-key-v4 > .rounded-lg {background:#302539 !important;border-color:#76576d !important;}
    html[data-nf-theme="halloween"] .tm-neofamily-review-key-v4 :is(p,span,strong,b,div,li,ul,ol,td,th,blockquote),
    html[data-nf-theme="halloween"] .tm-neofamily-review-key-v4 [class*="detailText"] {color:#f8eef6 !important;-webkit-text-fill-color:#f8eef6 !important;opacity:1 !important;text-shadow:none !important;}
    html[data-nf-theme="halloween"] .tm-neofamily-review-key-v4 img,
    html[data-nf-theme="halloween"] :is(.tm-neofamily-review-photos-v4,.nf-sbs-ans) img {filter:none !important;opacity:1 !important;background:transparent !important;}
    html[data-nf-theme="halloween"] :is(.tm-neofamily-review-answer-card-v4,.nf-sbs-ans) {background:#332a3d !important;color:#f8edf6 !important;border:1px solid #70536b !important;}
    html[data-nf-theme="halloween"] :is(.tm-neofamily-review-answer-card-v4,.nf-sbs-ans) :is(p,span,strong,div,li) {color:#f8edf6 !important;-webkit-text-fill-color:#f8edf6 !important;}
    html[data-nf-theme="halloween"] :is([id^="attempt-card-"][id$="-comments"],[id^="attempt-"][id$="-dialogue"]) {background:#30263a !important;color:#f7ecf5 !important;border:1px solid #6a4e65 !important;}
    html[data-nf-theme="halloween"] :is([id^="attempt-card-"][id$="-comments"],[id^="attempt-"][id$="-dialogue"]) > :is(div,section),
    html[data-nf-theme="halloween"] :is([id^="attempt-card-"][id$="-comments"],[id^="attempt-"][id$="-dialogue"]) [contenteditable="true"] {color:#f7ecf5 !important;}
    html[data-nf-theme="halloween"] :is([id^="attempt-card-"][id$="-comments"],[id^="attempt-"][id$="-dialogue"]) [contenteditable="true"]:empty:before {color:#c7b6cc !important;}
    html[data-nf-theme="halloween"] :is([id^="attempt-card-"][id$="-comments"],[id^="attempt-"][id$="-dialogue"]) .bg-background-secondary {background:#392c42 !important;border-color:#76566f !important;}
    html[data-nf-theme="halloween"] :is(.nf-tpl-panel,.nf-quick-replies) > div :is(button,span) {color:#f8edf6 !important;-webkit-text-fill-color:#f8edf6 !important;}
  `;
  addCss(halloweenSnapshotFixCss);

  const halloweenShiftCellsFix = `
    html[data-nf-theme="halloween"] #nf-shift-panel select:is(.nf-hw-shift-homework, :has(option:checked[value="hw"])) {background-color:#28493e !important;color:#e7ffe9 !important;-webkit-text-fill-color:#e7ffe9 !important;border:1px solid #639581 !important;color-scheme:dark;}
    html[data-nf-theme="halloween"] #nf-shift-panel select:is(.nf-hw-shift-chat, :has(option:checked[value="chat"])) {background-color:#483967 !important;color:#f3eaff !important;-webkit-text-fill-color:#f3eaff !important;border:1px solid #8972c0 !important;color-scheme:dark;}
    html[data-nf-theme="halloween"] #nf-shift-panel select:has(option:checked[value="none"]) {background-color:#3c2e46 !important;color:#f2e8f2 !important;-webkit-text-fill-color:#f2e8f2 !important;border-color:#70546b !important;}
    html[data-nf-theme="halloween"] #nf-shift-panel select option {color:#f6edf6 !important;background:#352940 !important;}
    html[data-nf-theme="halloween"] #nf-shift-panel select:focus-visible {outline:2px solid #f7ad75 !important;outline-offset:2px !important;}
  `;
  addCss(halloweenShiftCellsFix);

  const halloweenBankAndCountersCss = `
    html[data-nf-theme="halloween"] :is(aside,nav,[role="navigation"]) .bg-light-green.rounded-2xl,
    html[data-nf-theme="halloween"] :is(aside,nav,[role="navigation"]) [class*="bg-light-green"][class*="rounded"] {
      background:#513a4f !important;color:#ffe2bd !important;-webkit-text-fill-color:#ffe2bd !important;
      border:1px solid #956878 !important;box-shadow:0 2px 8px rgba(0,0,0,.14) !important;
    }
    html[data-nf-theme="halloween"] [data-slot="badge"].bg-main,
    html[data-nf-theme="halloween"] [data-slot="badge"][class*="bg-light-green"] {
      background:#513a4f !important;border:1px solid #936578 !important;color:#ffe2bd !important;
      -webkit-text-fill-color:#ffe2bd !important;opacity:1 !important;font-weight:800 !important;
    }
    html[data-nf-theme="halloween"] [data-slot="badge"].bg-main *,
    html[data-nf-theme="halloween"] [data-slot="badge"][class*="bg-light-green"] * {color:#ffe2bd !important;-webkit-text-fill-color:#ffe2bd !important;}
    html[data-nf-theme="halloween"] [class*="detail-text_detailText"],
    html[data-nf-theme="halloween"] [class*="detail-text_detailText"] :is(
      p,span,div,li,ul,ol,strong,b,em,i,small,blockquote,pre,code,h1,h2,h3,h4,h5,h6,sub,sup
    ) {color:#f5edf6 !important;-webkit-text-fill-color:#f5edf6 !important;--tw-text-opacity:1 !important;opacity:1 !important;text-shadow:none !important;}
    html[data-nf-theme="halloween"] [class*="detail-text_detailText"] a {color:#ffbd87 !important;-webkit-text-fill-color:#ffbd87 !important;}
    html[data-nf-theme="halloween"] [class*="detail-text_detailText"] :is(math,mi,mn,mo,mtext,mfrac,msup,msub) {color:#f5edf6 !important;}
    html[data-nf-theme="halloween"] [class*="detail-text_detailText"] :is(img,canvas,svg image) {filter:none !important;opacity:1 !important;}
    html[data-nf-theme="halloween"] .nf-hw-bank-card :is(p,span,li,small,blockquote,strong,em):not([data-slot="badge"]) {
      color:#efe4f0 !important;-webkit-text-fill-color:#efe4f0 !important;--tw-text-opacity:1 !important;
    }
    html[data-nf-theme="halloween"] [class*="detail-text_detailText"] ::selection {
      background:#905474 !important;color:#fff9fb !important;-webkit-text-fill-color:#fff9fb !important;
    }
  `;
  addCss(halloweenBankAndCountersCss);

  function markHalloweenBankCards(){
    if(activeTheme!=='halloween') return;
    if(!/\/(?:tasks|task-bank|bank|questions)(?:\/|$)/i.test(location.pathname)) return;
    document.querySelectorAll('[class*="detail-text_detailText"]').forEach(el=>{
      let card=el;
      for(let i=0;i<5 && card.parentElement;i++){
        if(card.matches('article,[class*="rounded-xl"],[class*="rounded-2xl"]'))break;
        card=card.parentElement;
      }
      card.classList.add('nf-hw-bank-card');
    });
  }

  function markHalloweenWorkspaces(){
    if(activeTheme!=='halloween')return;
    document.querySelectorAll('#nf-shift-panel select').forEach(el=>{
      el.classList.toggle('nf-hw-shift-homework',el.value === 'hw');
      el.classList.toggle('nf-hw-shift-chat',el.value === 'chat');
      if(!el.dataset.nfHallowListener){el.dataset.nfHallowListener='1';el.addEventListener('change',()=>setTimeout(markHalloweenWorkspaces,0));}
    });
    document.querySelectorAll('[role="dialog"], [aria-modal="true"],dialog').forEach(modal=>{
      if(modal.id==='nf-reg-overlay'||modal.id==='nf-backup-overlay')return;
      const head=modal.querySelector('h1,h2,h3,h4,header,[class*="DialogTitle"]');
      const text=(head?.textContent||'').trim();
      if(/^ключ ответа\s*:?$/i.test(text)||/^ответ ученика\s*:?$/i.test(text))modal.classList.add('nf-hw-photo-dialog');
    });
    for(const title of document.querySelectorAll('h2,h3,[class*="DialogTitle"]')){
      const txt=(title.textContent||'').trim();
      if(!/^ключ ответа\s*:?$/i.test(txt) && !/^ответ ученика\s*:?$/i.test(txt))continue;
      let n=title.parentElement;
      for(let step=0;step<5&&n;step++,n=n.parentElement){
        const r=n.getBoundingClientRect(), style=getComputedStyle(n);
        if(r.width>280&&r.height>220&&r.width<innerWidth*.95&&(style.position==='fixed'||style.position==='absolute'||n.getAttribute('role')==='dialog')){
          n.classList.add('nf-hw-photo-dialog');break;
        }
      }
    }
  }

  function markHalloweenShiftHeaders(){
    if(activeTheme!=='halloween') return;
    const scope=document.querySelector('main') || document.body;
    const labels=scope.querySelectorAll('div,span,p');
    for(const n of labels){
      if(n.children.length>2 || n.textContent.length>90) continue;
      const t=(n.textContent||'').trim().toLowerCase();
      if(t.includes('дальше сегодня') || t.includes('сейчас смены нет') || t.includes('больше смен сегодня нет')){
        let cur=n.parentElement;
        for(let d=0;cur&&d<3;d++,cur=cur.parentElement){
          const r=cur.getBoundingClientRect();
          if(r.width>160 && r.width<window.innerWidth*0.95 && r.height>36 && r.height<200){
            cur.classList.add('nf-hw-shift-head');break;
          }
        }
      }
    }
  }

  function paintNewYearDecor(){
    document.getElementById('nf-ny-garland')?.remove();
    document.getElementById('nf-ny-snow')?.remove();
    if(activeTheme!=='newyear'||!document.body)return;

    // 1. Тонкая гирлянда вдоль верхней кромки окна (26px; всего 2 группы слоёв — без нагрузки на GPU)
    const garland=document.createElement('div');
    garland.id='nf-ny-garland';
    garland.setAttribute('aria-hidden','true');
    const bulbPalette=['#ff6b6b','#ffd166','#5cd6b4','#6ec1f8'];
    let groupA='', groupB='', capsSvg='';
    for(let i=0;i<24;i++){
      const x=25+i*50;
      const phase=i%6;
      const y=phase===0||phase===5?11:(phase===1||phase===4?15:18);
      const col=bulbPalette[i%bulbPalette.length];
      capsSvg+=`<rect x="${x-2}" y="${y-4}" width="4" height="3.5" rx="1" fill="#2c6b53"/>`;
      const bulb=`<circle cx="${x}" cy="${y+2}" r="7.2" fill="${col}" opacity=".22"/>`
        +`<circle cx="${x}" cy="${y+2}" r="4.1" fill="${col}"/>`
        +`<circle cx="${x-1.2}" cy="${y+0.8}" r="1.1" fill="#fff" opacity=".75"/>`;
      if(i%2===0) groupA+=bulb;
      else groupB+=bulb;
    }
    garland.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 26" preserveAspectRatio="none">`
      +`<path d="M0 3 Q150 22 300 4 T600 4 T900 4 T1200 4" fill="none" stroke="#2d7a5e" stroke-width="2" opacity=".7"/>`
      +capsSvg+`<g class="nf-ny-bulb-a">${groupA}</g><g class="nf-ny-bulb-b">${groupB}</g></svg>`;
    document.body.appendChild(garland);

    // 2. Мягкий лёгкий снегопад (14 снежинок, плотнее по бокам, чтобы не мешать чтению и не грузить FPS)
    const snow=document.createElement('div');
    snow.id='nf-ny-snow';
    snow.setAttribute('aria-hidden','true');
    const glyphs=['❄','❅','❆','✦'];
    const flakes=[
      [2,13,-2,15,12,.72,14],[6,17,-9,16,-14,.62,32],[10,15,-4,12,10,.55,54],
      [15,19,-13,13,-12,.48,72],[23,16,-7,11,10,.34,26],[36,18,-11,10,-8,.28,48],
      [52,17,-5,10,8,.25,66],[68,18,-14,11,-10,.28,38],[81,15,-6,12,11,.42,22],
      [87,17,-10,14,-12,.56,74],[91,14,-3,13,10,.66,36],[94,18,-11,16,-12,.7,52],
      [97,13,-8,14,12,.68,18],[4,16,-12,11,9,.58,84]
    ];
    flakes.forEach(([left,dur,del,size,sway,op,rest],idx)=>{
      const fl=document.createElement('span');
      fl.className='nf-ny-flake';
      fl.textContent=glyphs[idx%glyphs.length];
      fl.style.left=left+'%';
      fl.style.fontSize=size+'px';
      fl.style.setProperty('--dur',dur+'s');
      fl.style.setProperty('--del',del+'s');
      fl.style.setProperty('--sway',sway+'px');
      fl.style.setProperty('--op',String(op));
      fl.style.setProperty('--rest',rest+'%');
      snow.appendChild(fl);
    });
    document.body.appendChild(snow);
  }

  // ======================================================================
  //  Интерактивная общая Ёлочка команды (шарики методистов с пожеланиями)
  // ======================================================================
  const TREE_API_URL='https://script.google.com/macros/s/AKfycbxoDoEXXu9e2-J5l00ZJ1Ibc1VhTXGNlBGs69ljlYcprXVCLHrznUpOu8DJh_fzIbot/exec';
  const TREE_API_KEY='NEOCHECK_BIO_2026';
  const TREE_OWNER_KEY='nf_ny_tree_owner_v1';
  const TREE_MINE_KEY='nf_ny_tree_mine_v1';
  const TREE_CACHE_KEY='nf_ny_tree_cache_v1';
  const TREE_COLLAPSED_KEY='nf_themes_tree_collapsed_v1';
  const TREE_ROTATE_MS=60*1000;
  const TREE_FETCH_CACHE_MS=5*60*1000;

  const ORNAMENT_COLORS={
    ruby:     {name:'Рубиновый',    hi:'#ffc2ce',main:'#ff476c',dark:'#a31b3a',glow:'#ff6b8b'},
    gold:     {name:'Золотой мёд',  hi:'#fff6c2',main:'#ffc83d',dark:'#b37508',glow:'#ffd966'},
    lavender: {name:'Нео-лаванда',  hi:'#e7dcff',main:'#956eff',dark:'#5432b8',glow:'#b294ff'},
    pink:     {name:'Розовый блеск',hi:'#ffd1e8',main:'#ff5ea8',dark:'#a82262',glow:'#ff85c0'},
    ice:      {name:'Ледяной синий',hi:'#d6f3ff',main:'#42b8ff',dark:'#1766a8',glow:'#75ceff'},
    emerald:  {name:'Изумрудный',   hi:'#c4ffe9',main:'#2ad698',dark:'#0e7853',glow:'#5ee8b6'},
    tangerine:{name:'Мандариновый', hi:'#ffe2bf',main:'#ff8533',dark:'#a84208',glow:'#ffa366'}
  };
  const TREE_SLOTS=[
    [85,55],[116,60],
    [71,92],[101,88],[129,96],
    [59,129],[86,123],[113,126],[140,130]
  ];

  const treeState={list:[],offset:0,fetchedAt:0,loading:false,boundTimers:false};

  function getTreeOwnerId(){
    let id=load(TREE_OWNER_KEY,'');
    if(!id||id.length<8){
      id='orb_u_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9);
      save(TREE_OWNER_KEY,id);
    }
    return id;
  }
  function getTreeMine(){
    try{const raw=localStorage.getItem(TREE_MINE_KEY);return raw?JSON.parse(raw):null;}catch{return null;}
  }
  function saveTreeMine(obj){
    try{
      if(obj)localStorage.setItem(TREE_MINE_KEY,JSON.stringify(obj));
      else localStorage.removeItem(TREE_MINE_KEY);
    }catch{}
  }
  function detectTreeAuthor(){
    const mine=getTreeMine();
    if(mine&&mine.name)return mine.name;
    try{
      const saved=String(localStorage.getItem('nf_methodist_full_name_v1')||'').trim();
      if(saved)return saved;
    }catch{}
    let first='';
    document.querySelectorAll('aside span,aside p,aside div').forEach(el=>{
      if(first||el.children.length)return;
      const t=(el.textContent||'').trim();
      if(/^[А-ЯЁA-Z][а-яёa-z-]{1,20}$/.test(t)&&!/^(Меню|Чат|Чаты|Задания|Профиль|Регламент)$/i.test(t))first=t;
    });
    for(const el of document.querySelectorAll('[data-current-user="true"] span,[data-current-user="true"] div')){
      if(el.children.length)continue;
      const raw=(el.textContent||'').trim();
      const m=raw.match(/^(?:Методист|Куратор|Администратор|Преподаватель|Модератор)\s+(.{3,50})/i);
      if(m){
        const clean=m[1].replace(/\s+/g,' ').trim();
        if(!first||clean.toLowerCase().startsWith(first.toLowerCase()))return clean;
      }
    }
    return first;
  }

  function treePost(payload){
    const bodyStr=JSON.stringify({key:TREE_API_KEY,...payload});
    if(typeof GM_xmlhttpRequest==='function'){
      return new Promise((resolve,reject)=>{
        GM_xmlhttpRequest({
          method:'POST',url:TREE_API_URL,
          headers:{'Content-Type':'text/plain;charset=utf-8'},
          data:bodyStr,timeout:15000,
          onload:r=>{try{resolve(JSON.parse(r.responseText||'{}'));}catch{reject(new Error('Ошибка ответа'));}},
          onerror:()=>{
            fetch(TREE_API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:bodyStr})
              .then(r=>r.json())
              .then(resolve)
              .catch(()=>reject(new Error('Ошибка сети')));
          },
          ontimeout:()=>reject(new Error('Таймаут'))
        });
      });
    }
    return fetch(TREE_API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:bodyStr}).then(r=>r.json());
  }

  function loadTreeCache(){
    try{
      const raw=localStorage.getItem(TREE_CACHE_KEY);
      if(!raw)return null;
      const obj=JSON.parse(raw);
      if(obj&&Array.isArray(obj.list))return obj;
    }catch{}
    return null;
  }
  function saveTreeCache(list){
    try{localStorage.setItem(TREE_CACHE_KEY,JSON.stringify({ts:Date.now(),list}));}catch{}
  }

  async function refreshTreeOrnaments({force=false}={}){
    if(treeState.loading)return;
    const cached=loadTreeCache();
    if(!force&&cached&&cached.list.length&&!treeState.list.length){
      treeState.list=cached.list;
      treeState.fetchedAt=cached.ts||0;
      renderTreeOrnaments();
    }
    if(!force&&treeState.fetchedAt&&Date.now()-treeState.fetchedAt<TREE_FETCH_CACHE_MS)return;
    treeState.loading=true;
    try{
      const res=await treePost({action:'get_tree_ornaments'});
      if(res&&res.ok&&Array.isArray(res.ornaments)){
        treeState.list=res.ornaments;
        treeState.fetchedAt=Date.now();
        saveTreeCache(res.ornaments);
        const mine=getTreeMine();
        if(mine&&!res.ornaments.some(o=>o.id===mine.id||o.name.toLowerCase()===String(mine.name||'').toLowerCase())){
          saveTreeMine(null);
        }
        if(activeTheme==='newyear')paintNewYearTree();
      }
    }catch{}finally{
      treeState.loading=false;
    }
  }

  function hideTreeTooltip(){
    document.getElementById('nf-ny-tree-tip')?.remove();
  }
  function showTreeTooltip(anchorEl,ornament,isMine){
    hideTreeTooltip();
    const tip=document.createElement('div');
    tip.id='nf-ny-tree-tip';
    const pal=ORNAMENT_COLORS[ornament.color]||ORNAMENT_COLORS.lavender;

    const head=document.createElement('div');
    head.style.cssText='display:flex;align-items:center;gap:7px;font-weight:800;font-size:12px;color:#17354f;margin-bottom:4px;';
    const dot=document.createElement('span');
    dot.style.cssText=`width:10px;height:10px;border-radius:999px;flex-shrink:0;background:${pal.main};box-shadow:0 0 8px ${pal.glow};border:1px solid ${pal.hi};`;
    const who=document.createElement('span');
    who.textContent=ornament.name;
    head.append(dot,who);

    const wish=document.createElement('div');
    wish.style.cssText='color:#2d4a66;font-size:12px;line-height:1.45;word-break:break-word;';
    wish.textContent='«'+ornament.wish+'»';

    tip.append(head,wish);
    if(isMine){
      const note=document.createElement('div');
      note.style.cssText='margin-top:5px;font-size:10px;font-weight:700;color:#1f7a5c;';
      note.textContent='✨ Твой шарик · нажми, чтобы изменить';
      tip.appendChild(note);
    }
    document.body.appendChild(tip);

    const r=anchorEl.getBoundingClientRect();
    const tipW=tip.offsetWidth||220, tipH=tip.offsetHeight||80;
    const left=Math.min(window.innerWidth-tipW-12,Math.max(10,r.right+10));
    const top=Math.min(window.innerHeight-tipH-12,Math.max(10,r.top-tipH/2+8));
    tip.style.left=left+'px';
    tip.style.top=top+'px';
  }

  function makeOrnamentPreviewSvg(colorKey){
    const p=ORNAMENT_COLORS[colorKey]||ORNAMENT_COLORS.lavender;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" width="54" height="54">`
      +`<defs><radialGradient id="nfNyPrevGrad" cx="35%" cy="30%"><stop offset="0%" stop-color="${p.hi}"/><stop offset="55%" stop-color="${p.main}"/><stop offset="100%" stop-color="${p.dark}"/></radialGradient></defs>`
      +`<circle cx="30" cy="34" r="22" fill="${p.glow}" opacity=".3"/>`
      +`<path d="M30 4v9" stroke="#d4a02b" stroke-width="2.5" stroke-linecap="round"/>`
      +`<rect x="25" y="12" width="10" height="6" rx="2" fill="#f0c351" stroke="#b07c15" stroke-width="1.5"/>`
      +`<circle cx="30" cy="34" r="16" fill="url(#nfNyPrevGrad)" stroke="${p.hi}" stroke-width="1.5"/>`
      +`<circle cx="24" cy="27" r="3.8" fill="#fff" opacity=".72"/></svg>`;
  }

  function openTreeModal(){
    hideTreeTooltip();
    document.getElementById('nf-ny-tree-modal')?.remove();
    const mine=getTreeMine();
    let selectedColor=(mine&&ORNAMENT_COLORS[mine.color])?mine.color:'lavender';

    const cover=document.createElement('div');
    cover.id='nf-ny-tree-modal';
    cover.style.cssText='position:fixed;inset:0;z-index:2147483645;background:rgba(16,31,52,.56);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Comfortaa,system-ui,sans-serif;';

    const box=document.createElement('div');
    box.style.cssText='width:min(410px,95vw);background:#fff;color:#1b3650;border-radius:20px;padding:20px;border:1px solid #c3daee;box-shadow:0 18px 55px rgba(17,45,78,.28);display:flex;flex-direction:column;gap:11px;font:13px/1.45 sans-serif;';

    const title=document.createElement('div');
    title.style.cssText='font:800 17px Comfortaa,sans-serif;color:#175a42;display:flex;align-items:center;justify-content:space-between;';
    title.textContent=mine?'✏️ Твой шарик на ёлке':'🎄 Повесить свой шарик';

    const previewWrap=document.createElement('div');
    previewWrap.style.cssText='display:flex;justify-content:center;padding:2px 0;';
    previewWrap.innerHTML=makeOrnamentPreviewSvg(selectedColor);

    const nameLbl=document.createElement('label');
    nameLbl.style.cssText='display:flex;flex-direction:column;gap:4px;font-weight:700;font-size:12px;color:#355675;';
    nameLbl.textContent='Имя и Фамилия:';
    const nameIn=document.createElement('input');
    nameIn.type='text';
    nameIn.maxLength=60;
    nameIn.placeholder='Например: Ученик NeoFamily';
    nameIn.value=detectTreeAuthor();
    nameIn.style.cssText='padding:9px 11px;border-radius:11px;border:1px solid #c1daf0;background:#f7fbff;color:#1b3650;font:600 13px sans-serif;';
    nameLbl.appendChild(nameIn);

    const colorLbl=document.createElement('div');
    colorLbl.style.cssText='font-weight:700;font-size:12px;color:#355675;';
    colorLbl.textContent='Цвет светящегося шарика:';
    const swatches=document.createElement('div');
    swatches.style.cssText='display:flex;flex-wrap:wrap;gap:9px;align-items:center;';
    const swatchBtns={};
    Object.entries(ORNAMENT_COLORS).forEach(([key,pal])=>{
      const sw=document.createElement('button');
      sw.type='button';
      sw.title=pal.name;
      sw.style.cssText=`width:28px;height:28px;border-radius:999px;cursor:pointer;border:2px solid ${pal.hi};`
        +`background:radial-gradient(circle at 35% 30%,${pal.hi},${pal.main} 60%,${pal.dark});`
        +`box-shadow:0 0 10px ${pal.glow};transition:transform .14s;`;
      sw.onclick=()=>{
        selectedColor=key;
        previewWrap.innerHTML=makeOrnamentPreviewSvg(key);
        Object.entries(swatchBtns).forEach(([k,b])=>{
          b.style.outline=k===key?'3px solid #1b3650':'none';
          b.style.outlineOffset='2px';
          b.style.transform=k===key?'scale(1.14)':'scale(1)';
        });
      };
      swatchBtns[key]=sw;
      swatches.appendChild(sw);
    });
    swatchBtns[selectedColor].onclick();

    const wishLbl=document.createElement('label');
    wishLbl.style.cssText='display:flex;flex-direction:column;gap:4px;font-weight:700;font-size:12px;color:#355675;';
    const wishTop=document.createElement('div');
    wishTop.style.cssText='display:flex;justify-content:space-between;';
    const wishLeft=document.createElement('span');wishLeft.textContent='Пожелание на Новый год:';
    const wishCnt=document.createElement('span');wishCnt.style.cssText='color:#6b86a1;font-weight:600;';
    wishTop.append(wishLeft,wishCnt);
    const wishIn=document.createElement('textarea');
    wishIn.maxLength=160;
    wishIn.rows=3;
    wishIn.placeholder='Например: Пусть домашки проверяются легко, а ученики радуют высокими баллами ✨';
    wishIn.value=mine&&mine.wish?mine.wish:'';
    wishIn.style.cssText='padding:9px 11px;border-radius:11px;border:1px solid #c1daf0;background:#f7fbff;color:#1b3650;font:600 13px/1.4 sans-serif;resize:vertical;';
    const updateCnt=()=>{wishCnt.textContent=wishIn.value.length+'/160';};
    wishIn.oninput=updateCnt;
    updateCnt();
    wishLbl.append(wishTop,wishIn);

    const status=document.createElement('div');
    status.style.cssText='font:700 12px sans-serif;min-height:16px;color:#1f7a5c;';

    const actions=document.createElement('div');
    actions.style.cssText='display:flex;gap:8px;justify-content:flex-end;align-items:center;margin-top:2px;flex-wrap:wrap;';

    const closeModal=()=>{document.removeEventListener('keydown',onKey);cover.remove();};
    const onKey=e=>{if(e.key==='Escape')closeModal();};
    document.addEventListener('keydown',onKey);

    if(mine){
      const delBtn=document.createElement('button');
      delBtn.type='button';
      delBtn.textContent='🗑 Снять';
      delBtn.style.cssText='margin-right:auto;padding:8px 11px;border-radius:10px;border:1px solid #f0c2ca;background:#fff4f6;color:#b83f53;font:700 12px sans-serif;cursor:pointer;';
      delBtn.onclick=async()=>{
        if(!confirm('Снять твой шарик с ёлочки?'))return;
        delBtn.disabled=true;
        status.textContent='⏳ Снимаем шарик…';
        try{
          const res=await treePost({action:'delete_tree_ornament',ownerId:getTreeOwnerId()});
          if(res&&res.ok){
            saveTreeMine(null);
            treeState.list=Array.isArray(res.ornaments)?res.ornaments:[];
            treeState.fetchedAt=Date.now();
            saveTreeCache(treeState.list);
            treeState.offset=0;
            closeModal();
            paintNewYearTree();
          }else{
            status.style.color='#b83f53';
            status.textContent='❌ '+(res?.error||'Не удалось снять');
          }
        }catch(e){
          status.style.color='#b83f53';
          status.textContent='❌ '+e.message;
        }finally{delBtn.disabled=false;}
      };
      actions.appendChild(delBtn);
    }

    const cancelBtn=document.createElement('button');
    cancelBtn.type='button';cancelBtn.textContent='Отмена';
    cancelBtn.style.cssText='padding:8px 14px;border-radius:10px;border:1px solid #c5ddf2;background:#f5faff;color:#355675;font:700 12px sans-serif;cursor:pointer;';
    cancelBtn.onclick=closeModal;

    const saveBtn=document.createElement('button');
    saveBtn.type='button';
    saveBtn.textContent=mine?'💾 Обновить шарик':'🎄 Повесить на ёлочку';
    saveBtn.style.cssText='padding:9px 15px;border-radius:10px;border:0;background:linear-gradient(135deg,#259470,#186c51);color:#fff;font:800 12px sans-serif;cursor:pointer;';
    saveBtn.onclick=async()=>{
      const nm=nameIn.value.replace(/\s+/g,' ').trim();
      const ws=wishIn.value.replace(/\s+/g,' ').trim();
      if(nm.length<2){status.style.color='#b83f53';status.textContent='Укажи имя и фамилию';return;}
      if(ws.length<2){status.style.color='#b83f53';status.textContent='Напиши пожелание коллегам';return;}
      saveBtn.disabled=true;
      status.style.color='#1f7a5c';
      status.textContent='⏳ Вешаем шарик на ёлочку…';
      try{
        const res=await treePost({
          action:'save_tree_ornament',
          name:nm,color:selectedColor,wish:ws,
          ownerId:getTreeOwnerId()
        });
        if(res&&res.ok&&res.ornament){
          saveTreeMine(res.ornament);
          treeState.list=Array.isArray(res.ornaments)?res.ornaments:[res.ornament];
          treeState.fetchedAt=Date.now();
          saveTreeCache(treeState.list);
          const myIdx=treeState.list.findIndex(o=>o.id===res.ornament.id);
          treeState.offset=myIdx>=0?Math.floor(myIdx/TREE_SLOTS.length)*TREE_SLOTS.length:0;
          closeModal();
          paintNewYearTree();
        }else{
          status.style.color='#b83f53';
          status.textContent='❌ '+(res?.error||'Не удалось сохранить');
        }
      }catch(e){
        setTimeout(()=>{ refreshTreeOrnaments({force:true}); }, 1500);
        status.style.color='#b83f53';
        status.textContent='❌ '+e.message;
      }finally{saveBtn.disabled=false;}
    };

    actions.append(cancelBtn,saveBtn);
    box.append(title,previewWrap,nameLbl,colorLbl,swatches,wishLbl,status,actions);
    cover.appendChild(box);
    cover.addEventListener('mousedown',e=>{if(e.target===cover)closeModal();});
    document.body.appendChild(cover);
  }

  function renderTreeOrnaments(){
    hideTreeTooltip();
    const svg=document.getElementById('nf-ny-tree-svg');
    const meta=document.getElementById('nf-ny-tree-count');
    if(!svg)return;
    svg.querySelectorAll('.nf-ny-orb-layer').forEach(n=>n.remove());
    const list=treeState.list;
    const mine=getTreeMine();
    const ns='http://www.w3.org/2000/svg';
    const layer=document.createElementNS(ns,'g');
    layer.setAttribute('class','nf-ny-orb-layer');

    if(!list.length){
      if(meta)meta.textContent='Пока пусто · будь 1-м!';
      [[86,58],[114,94],[70,127]].forEach(([cx,cy])=>{
        const ph=document.createElementNS(ns,'circle');
        ph.setAttribute('cx',cx);ph.setAttribute('cy',cy);ph.setAttribute('r','7.5');
        ph.setAttribute('fill','rgba(255,255,255,.32)');
        ph.setAttribute('stroke','#ffe082');ph.setAttribute('stroke-width','1.6');
        ph.setAttribute('stroke-dasharray','3 2');ph.setAttribute('style','cursor:pointer;');
        ph.addEventListener('click',openTreeModal);
        layer.appendChild(ph);
      });
      svg.appendChild(layer);
      return;
    }

    const total=list.length;
    const count=Math.min(TREE_SLOTS.length,total);
    const start=total<=TREE_SLOTS.length?0:(treeState.offset%total);
    const batch=[];
    for(let i=0;i<count;i++)batch.push(list[(start+i)%total]);
    if(meta){
      meta.textContent=total<=TREE_SLOTS.length?`Шариков: ${total}`:`${count} из ${total}`;
    }

    const defs=svg.querySelector('defs')||svg.appendChild(document.createElementNS(ns,'defs'));
    batch.forEach((o,idx)=>{
      const [cx,cy]=TREE_SLOTS[idx];
      const pal=ORNAMENT_COLORS[o.color]||ORNAMENT_COLORS.lavender;
      const gradId='nfNyOrbDyn_'+idx;
      const oldGrad=defs.querySelector('#'+gradId);
      if(oldGrad)oldGrad.remove();
      const rg=document.createElementNS(ns,'radialGradient');
      rg.setAttribute('id',gradId);rg.setAttribute('cx','35%');rg.setAttribute('cy','30%');
      [[0,pal.hi],[55,pal.main],[100,pal.dark]].forEach(([off,stop])=>{
        const st=document.createElementNS(ns,'stop');
        st.setAttribute('offset',off+'%');st.setAttribute('stop-color',stop);
        rg.appendChild(st);
      });
      defs.appendChild(rg);

      const isMine=Boolean(mine&&(o.id===mine.id||o.name.toLowerCase()===String(mine.name||'').toLowerCase()));
      const g=document.createElementNS(ns,'g');
      g.setAttribute('class','nf-ny-ornament');
      g.setAttribute('tabindex','0');
      g.setAttribute('role','button');
      g.setAttribute('aria-label',`${o.name}: ${o.wish}`);

      const halo=document.createElementNS(ns,'circle');
      halo.setAttribute('cx',cx);halo.setAttribute('cy',cy);halo.setAttribute('r','13');
      halo.setAttribute('fill',pal.glow);halo.setAttribute('opacity','.34');

      const cap=document.createElementNS(ns,'rect');
      cap.setAttribute('x',cx-2.2);cap.setAttribute('y',cy-10.2);
      cap.setAttribute('width','4.4');cap.setAttribute('height','3');cap.setAttribute('rx','1');
      cap.setAttribute('fill','#f0c351');

      const ball=document.createElementNS(ns,'circle');
      ball.setAttribute('cx',cx);ball.setAttribute('cy',cy);ball.setAttribute('r','7.6');
      ball.setAttribute('fill',`url(#${gradId})`);
      ball.setAttribute('stroke',isMine?'#ffe985':pal.hi);
      ball.setAttribute('stroke-width',isMine?'1.9':'1.1');

      const shine=document.createElementNS(ns,'circle');
      shine.setAttribute('cx',cx-2.4);shine.setAttribute('cy',cy-2.4);shine.setAttribute('r','1.8');
      shine.setAttribute('fill','#fff');shine.setAttribute('opacity','.85');

      g.append(halo,cap,ball,shine);
      g.addEventListener('pointerenter',()=>showTreeTooltip(g,o,isMine));
      g.addEventListener('focus',()=>showTreeTooltip(g,o,isMine));
      g.addEventListener('pointerleave',hideTreeTooltip);
      g.addEventListener('blur',hideTreeTooltip);
      g.addEventListener('click',()=>{
        if(isMine)openTreeModal();
        else showTreeTooltip(g,o,false);
      });
      layer.appendChild(g);
    });
    svg.appendChild(layer);
  }

  function isNewYearTreePage(){
    const p=String(location.pathname||'/').replace(/\/+$/,'')||'/';
    // Показываем на общих страницах и в списке домашек/чатов, но скрываем внутри проверки домашки, попытки или конкретного чата
    if(/\/(?:students-homework|homework|attempts?|chats?)\/[^/]+/i.test(p)||/\/attempts?(?:\/|$)/i.test(p)){
      return false;
    }
    if(document.querySelector('[id^="attempt-card-"]'))return false;
    return true;
  }

  function paintNewYearTree(){
    hideTreeTooltip();
    document.getElementById('nf-ny-tree-box')?.remove();
    if(activeTheme!=='newyear'||!isNewYearTreePage()||!document.body)return;
    if(!treeState.list.length){
      const cached=loadTreeCache();
      if(cached&&cached.list.length){treeState.list=cached.list;treeState.fetchedAt=cached.ts||0;}
    }

    const host=document.createElement('div');
    host.id='nf-ny-tree-box';
    const collapsed=load(TREE_COLLAPSED_KEY,'no')==='yes';
    const mine=getTreeMine();

    if(collapsed){
      const pill=document.createElement('button');
      pill.id='nf-ny-tree-pill';
      pill.type='button';
      const cnt=treeState.list.length;
      pill.textContent=cnt?`🎄 Ёлочка (${cnt})`:'🎄 Ёлочка';
      pill.title='Развернуть новогоднюю ёлочку команды';
      pill.onclick=()=>{save(TREE_COLLAPSED_KEY,'no');paintNewYearTree();};
      host.appendChild(pill);
      document.body.appendChild(host);
      return;
    }

    const card=document.createElement('div');
    card.id='nf-ny-tree-card';

    const head=document.createElement('div');
    head.id='nf-ny-tree-head';
    const headTitle=document.createElement('span');
    headTitle.textContent='🎄 Ёлочка команды';
    const hideBtn=document.createElement('button');
    hideBtn.id='nf-ny-tree-hide';hideBtn.type='button';hideBtn.textContent='−';
    hideBtn.title='Свернуть ёлочку';
    hideBtn.onclick=()=>{save(TREE_COLLAPSED_KEY,'yes');paintNewYearTree();};
    head.append(headTitle,hideBtn);

    const svgWrap=document.createElement('div');
    svgWrap.innerHTML=`<svg id="nf-ny-tree-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 182">
      <defs>
        <linearGradient id="nfNyMainTreeA" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#37ad83"/><stop offset="100%" stop-color="#17694b"/></linearGradient>
        <linearGradient id="nfNyMainTreeB" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#2c9a73"/><stop offset="100%" stop-color="#135a40"/></linearGradient>
        <radialGradient id="nfNyMainStar" cx="40%" cy="35%"><stop offset="0%" stop-color="#fff4b5"/><stop offset="60%" stop-color="#ffd04d"/><stop offset="100%" stop-color="#e5971f"/></radialGradient>
        <linearGradient id="nfNyMainG1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#a58bf8"/><stop offset="100%" stop-color="#6d52d4"/></linearGradient>
        <linearGradient id="nfNyMainG2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ff9ccb"/><stop offset="100%" stop-color="#df5397"/></linearGradient>
      </defs>
      <ellipse cx="100" cy="170" rx="60" ry="8" fill="#5e87ad" opacity=".16"/>
      <rect x="89" y="142" width="22" height="25" rx="4" fill="#8b5a3c"/>
      <path d="M100 92C72 95 43 130 35 147c18 11 112 11 130 0-8-17-37-52-65-55Z" fill="url(#nfNyMainTreeB)" stroke="#134f39" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M100 58C75 61 51 92 45 111c17 10 93 10 110 0-6-19-30-50-55-53Z" fill="url(#nfNyMainTreeA)" stroke="#155d43" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M100 26C82 30 64 57 60 74c15 9 65 9 80 0-4-17-22-44-40-48Z" fill="url(#nfNyMainTreeA)" stroke="#176a4b" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M84 42q16 6 32 0M69 78q31 9 62 0M54 117q46 10 92 0" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" opacity=".5"/>
      <path d="M68 68q32 18 64 0M52 104q48 21 96 0M42 138q58 20 116 0" fill="none" stroke="#ffe18c" stroke-width="2.2" stroke-linecap="round" opacity=".88"/>
      <path d="M100 6l5.5 11.2 12.5 1.5-9.2 8.4 2.4 12.4-11.2-6.1-11.2 6.1 2.4-12.4-9.2-8.4 12.5-1.5Z" fill="url(#nfNyMainStar)" stroke="#d98e1a" stroke-width="1.8" stroke-linejoin="round"/>
      <rect x="46" y="145" width="28" height="22" rx="4" fill="url(#nfNyMainG1)" stroke="#5b41b8" stroke-width="1.8"/>
      <path d="M60 145v22M46 156h28" stroke="#ffe07a" stroke-width="3"/>
      <rect x="124" y="149" width="25" height="18" rx="4" fill="url(#nfNyMainG2)" stroke="#b63d78" stroke-width="1.8"/>
      <path d="M136.5 149v18M124 158h25" stroke="#fff7df" stroke-width="2.8"/>
    </svg>`;

    const meta=document.createElement('div');
    meta.id='nf-ny-tree-meta';
    const countSpan=document.createElement('span');
    countSpan.id='nf-ny-tree-count';
    countSpan.textContent='Загрузка…';
    const nextBtn=document.createElement('button');
    nextBtn.id='nf-ny-tree-next';nextBtn.type='button';nextBtn.textContent='↻';
    nextBtn.title='Показать следующие шарики коллег (автосмена раз в минуту)';
    nextBtn.onclick=()=>{
      if(treeState.list.length>TREE_SLOTS.length){
        treeState.offset=(treeState.offset+TREE_SLOTS.length)%treeState.list.length;
        renderTreeOrnaments();
      }else{
        refreshTreeOrnaments({force:true});
      }
    };
    meta.append(countSpan,nextBtn);

    const actionBtn=document.createElement('button');
    actionBtn.id='nf-ny-tree-action';
    actionBtn.type='button';
    actionBtn.textContent=mine?'✏️ Мой шарик':'✨ Повесить шарик';
    actionBtn.onclick=openTreeModal;

    card.append(head,svgWrap,meta,actionBtn);
    host.appendChild(card);
    document.body.appendChild(host);
    renderTreeOrnaments();

    if(!treeState.boundTimers){
      treeState.boundTimers=true;
      setInterval(()=>{
        if(activeTheme==='newyear'&&!document.hidden&&isNewYearTreePage()&&treeState.list.length>TREE_SLOTS.length){
          treeState.offset=(treeState.offset+TREE_SLOTS.length)%treeState.list.length;
          renderTreeOrnaments();
        }
      },TREE_ROTATE_MS);
      setInterval(()=>{
        if(activeTheme==='newyear'&&!document.hidden&&isNewYearTreePage())refreshTreeOrnaments({force:true});
      },10*60*1000);
    }
    refreshTreeOrnaments({force:false});
  }

  function paintIllustrations(){
    const old=document.getElementById('nf-theme-art');if(old)old.remove();
    const list=drawings[activeTheme];
    if(!list||!list.length||!document.body)return;
    const layer=document.createElement('div');layer.id='nf-theme-art';layer.setAttribute('aria-hidden','true');
    list.forEach(draw=>{
      const wrap=document.createElement('div');wrap.className='nf-theme-illustration';
      wrap.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 180" width="100%" height="100%" aria-hidden="true">${draw}</svg>`;
      layer.appendChild(wrap);
    });
    document.body.appendChild(layer);
  }

  function applyTheme(theme){
    if(!themes[theme])return;
    activeTheme=theme;save(THEME_KEY,theme);
    document.documentElement.dataset.nfTheme=theme;
    document.documentElement.dataset.nfDecor=decorLevel;
    document.documentElement.dataset.nfMotion=motionOn?'yes':'no';
    paintIllustrations();
    paintHalloweenEdges();
    paintNewYearDecor();
    paintNewYearTree();
    if(theme==='pink')addDecor();
    if(theme==='halloween'){
      markHalloweenHomeworkText();
      markHalloweenShiftHeaders();
      markHalloweenWorkspaces();
      markHalloweenBankCards();
    }
    document.querySelectorAll('.nf-theme-option').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===theme)));
    document.querySelectorAll('#nf-theme-dock-menu button').forEach(b=>b.dataset.active=String(b.dataset.value===theme));
  }

  function buildSwitcher(){
    if(!document.body||document.getElementById('nf-theme-switcher'))return;
    const host=document.createElement('div');host.id='nf-theme-switcher';
    host.innerHTML=`<button id="nf-theme-trigger" type="button" aria-label="Выбрать тему оформления" aria-expanded="false" title="Темы NeoFamily">🎨</button>
      <section id="nf-theme-panel" hidden aria-label="Оформление NeoFamily">
        <div class="nf-theme-title">🎨 Темы NeoFamily</div>
        <div id="nf-theme-options"></div>
        <div class="nf-theme-options-caption">Оформление меняется сразу и сохраняется</div>
        <label class="nf-theme-settings">Декоративные SVG
        <select id="nf-theme-decor"><option value="normal">Стандарт</option><option value="minimal">Минимум</option><option value="off">Отключить</option></select></label>
        <label class="nf-theme-settings">Анимации <input id="nf-theme-motion" type="checkbox"></label>
      </section>`;
    document.body.appendChild(host);
    const panel=host.querySelector('#nf-theme-panel'),trigger=host.querySelector('#nf-theme-trigger');
    const close=()=>{panel.hidden=true;trigger.setAttribute('aria-expanded','false');};
    trigger.addEventListener('click',()=>{panel.hidden=!panel.hidden;trigger.setAttribute('aria-expanded',String(!panel.hidden));});
    document.addEventListener('pointerdown',e=>{if(!host.contains(e.target))close();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
    Object.entries(themes).forEach(([id,t])=>{
      const btn=document.createElement('button');btn.type='button';btn.className='nf-theme-option';btn.dataset.theme=id;
      btn.textContent=`${t.icon}  ${t.name}`;btn.setAttribute('aria-pressed',String(id===activeTheme));
      btn.addEventListener('click',()=>{applyTheme(id);close();});
      host.querySelector('#nf-theme-options').appendChild(btn);
    });
    host.querySelector('#nf-theme-decor').value=decorLevel;
    host.querySelector('#nf-theme-decor').addEventListener('change',e=>{decorLevel=e.target.value;save(DECOR_KEY,decorLevel);document.documentElement.dataset.nfDecor=decorLevel;});
    host.querySelector('#nf-theme-motion').checked=motionOn;
    host.querySelector('#nf-theme-motion').addEventListener('change',e=>{motionOn=e.target.checked;save(MOTION_KEY,motionOn?'yes':'no');document.documentElement.dataset.nfMotion=motionOn?'yes':'no';});
  }

  document.documentElement.dataset.nfTheme=activeTheme;
  document.documentElement.dataset.nfDecor=decorLevel;
  document.documentElement.dataset.nfMotion=motionOn?'yes':'no';

  function boot() {
    buildSwitcher();
    paintIllustrations();
    paintHalloweenEdges();
    paintNewYearDecor();
    paintNewYearTree();
    if(activeTheme==='pink')addDecor();
    styleRegulationButton();
    enhanceHomeworkList();
    if(activeTheme==='halloween'){
      markHalloweenHomeworkText();
      markHalloweenShiftHeaders();
      markHalloweenWorkspaces();
      markHalloweenBankCards();
    }
    if (!document.getElementById('tm-pink-coquette-style-fallback')) {
      const marker = document.createElement('meta');
      marker.id = 'tm-pink-coquette-style-fallback';marker.content = 'active';
      document.head.appendChild(marker);
    }
  }
  boot();
  const themeIds = new Set(['tm-pink-coquette-decor','nf-theme-switcher','nf-theme-art','nf-hw-edge-art','nf-ny-garland','nf-ny-snow','nf-ny-tree-box','nf-ny-tree-tip','nf-ny-tree-modal']);
  const isThemeNode = n => n && n.id && themeIds.has(n.id);
  const observer = new MutationObserver(muts => {
    const hasRelevant = muts.some(m => {
      if (isThemeNode(m.target)) return false;
      const touched = [...(m.addedNodes || []), ...(m.removedNodes || [])];
      return !(touched.length && touched.every(isThemeNode));
    });
    if (!hasRelevant) return;
    clearTimeout(window.__tmPinkListTimer);
    window.__tmPinkListTimer = setTimeout(() => {
      if (activeTheme === 'pink' && !document.getElementById('tm-pink-coquette-decor')) addDecor();
      if (!document.getElementById('nf-theme-switcher')) buildSwitcher();
      if (activeTheme !== 'pink' && !document.getElementById('nf-theme-art')) paintIllustrations();
      if (activeTheme === 'halloween' && !document.getElementById('nf-hw-edge-art')) paintHalloweenEdges();
      if (activeTheme === 'newyear') {
        if (!document.getElementById('nf-ny-garland') || !document.getElementById('nf-ny-snow')) paintNewYearDecor();
        if (isNewYearTreePage() !== !!document.getElementById('nf-ny-tree-box')) paintNewYearTree();
      }
      styleRegulationButton();
      enhanceHomeworkList();
      if (activeTheme === 'halloween') {
        markHalloweenHomeworkText();
        markHalloweenShiftHeaders();
        markHalloweenWorkspaces();
        markHalloweenBankCards();
      }
    }, 280);
  });
  observer.observe(document.body || document.documentElement,{childList:true,subtree:true});
  window.addEventListener('popstate',()=>{if(activeTheme==='newyear')setTimeout(paintNewYearTree,80);});
})();
