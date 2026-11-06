// ==UserScript==
// @name         NeoFamily — проверка ответа рядом с ключом
// @namespace    https://neofamily.ru/
// @version      4.3.1
// @description  Ключ ответа выводится рядом с ответом и его можно перетаскивать по странице задания. Фото ответа поворачиваются кнопкой ↻.
// @match        https://neofamily.ru/*
// @match        https://www.neofamily.ru/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'tm-neofamily-review-style-v4';
  const PANEL_CLASS = 'tm-neofamily-review-key-v4';
  const PHOTO_GROUP_CLASS = 'tm-neofamily-review-photos-v4';
  const TEXT_CLASS = 'tm-neofamily-review-file-text-v4';
  const ANSWER_IMG = 'img[alt="Картинка ответа"]';
  const ROT_BTN_CLASS = 'tm-nf-rot-btn';

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isKeyBlock(element) {
    return [...element.querySelectorAll('strong')].some((node) =>
      normalize(node.textContent).startsWith('Элементы ключа')
    );
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${PHOTO_GROUP_CLASS} {
        display: flex !important;
        flex-direction: column !important;
        align-items: flex-start !important;
        width: 58% !important;
        max-width: 760px !important;
        gap: 10px !important;
      }
      .${PHOTO_GROUP_CLASS} > div {
        width: 100% !important;
        max-width: 100% !important;
      }
      .${PHOTO_GROUP_CLASS} img[alt="Картинка ответа"] {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        height: auto !important;
        margin: 0 !important;
        object-fit: contain !important;
        object-position: left top !important;
      }

      .${PANEL_CLASS} {
        box-sizing: border-box !important;
        overflow: auto !important;
        max-height: 62vh !important;
        padding: 0 16px 16px 16px !important;
        border: 1px solid #d7dbe5 !important;
        border-radius: 14px !important;
        background: #fff !important;
        color: #302a3e !important;
        box-shadow: 0 4px 18px rgba(48, 42, 62, .18) !important;
        font: 14px/1.45 Arial, sans-serif !important;
        text-align: left !important;
        resize: both;
        min-width: 220px;
        min-height: 160px;
        z-index: 9000;
      }
      .${PANEL_CLASS} .tm-nf-key-handle {
        position: sticky;
        top: 0;
        margin: 0 -16px 10px -16px;
        padding: 10px 16px;
        background: #f4f2ff;
        border-bottom: 1px solid #d7dbe5;
        border-radius: 14px 14px 0 0;
        font: 700 15px/1.3 Arial, sans-serif;
        color: #302a3e;
        cursor: move;
        user-select: none;
        touch-action: none;
      }
      .${PANEL_CLASS} p { margin: 5px 0 !important; }
      .${PANEL_CLASS} table { max-width: 100% !important; border-collapse: collapse !important; }
      .${PANEL_CLASS} img { max-width: 100% !important; height: auto !important; }

      .${TEXT_CLASS} {
        position: absolute !important;
        z-index: 21 !important;
        top: 52px !important;
        right: 16px !important;
        width: min(34%, 380px) !important;
        max-height: 360px !important;
        overflow: auto !important;
        box-sizing: border-box !important;
        padding: 14px !important;
        border: 1px solid #d7dbe5 !important;
        border-radius: 12px !important;
        background: #fff !important;
        color: #302a3e !important;
        font: 13px/1.45 Arial, sans-serif !important;
        white-space: pre-wrap !important;
      }

      .tm-neofamily-review-answer-card-v4 {
        position: relative !important;
        min-height: 420px !important;
        overflow: visible !important;
      }

      .${ROT_BTN_CLASS} {
        position: absolute !important;
        z-index: 10 !important;
        top: 8px !important;
        right: 8px !important;
        width: 36px !important;
        height: 36px !important;
        padding: 0 !important;
        border: 1px solid rgba(0, 0, 0, .18) !important;
        border-radius: 8px !important;
        background: rgba(255, 255, 255, .94) !important;
        color: #222 !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, .2) !important;
        cursor: pointer !important;
        font: 22px/1 Arial, sans-serif !important;
      }
      .${ROT_BTN_CLASS}:hover { background: #fff !important; }

      .tm-neofamily-key-panel,
      .tm-neofamily-key-panel-v3,
      .tm-neofamily-answer-layout,
      .tm-neofamily-review-layout {
        display: none !important;
      }

    `;
    document.head.appendChild(style);
  }

  function removeOldPanels() {
    document.querySelectorAll('.tm-neofamily-key-panel, .tm-neofamily-key-panel-v3, .tm-neofamily-review-layout, .tm-neofamily-answer-layout').forEach((node) => node.remove());
  }

  function findKeyBlock(answerCard) {
    let sibling = answerCard.nextElementSibling;
    while (sibling) {
      if (isKeyBlock(sibling)) return sibling;
      sibling = sibling.nextElementSibling;
    }
    return null;
  }

  function preparePhotoGroup(answerCard) {
    const images = [...answerCard.querySelectorAll(ANSWER_IMG)];
    if (!images.length) return null;
    const existingGroup = answerCard.querySelector(`.${PHOTO_GROUP_CLASS}`);
    if (existingGroup) return existingGroup;
    const firstImage = images[0];
    const group = firstImage.parentElement?.parentElement || firstImage.parentElement;
    if (!group) return null;
    group.classList.add(PHOTO_GROUP_CLASS);
    return group;
  }

  // Поворот фото на 90°. При повороте боком фото уменьшается, чтобы влезть в колонку, отступы подстраиваются
  function applyRotation(img, rotation) {
    if (rotation % 180 === 0) {
      img.style.transform = rotation ? 'rotate(180deg)' : '';
      img.style.margin = '';
      return;
    }
    const w = img.offsetWidth;
    const h = img.offsetHeight;
    const avail = (img.parentElement && img.parentElement.clientWidth) || w;
    const k = Math.min(1, avail / (h || 1));
    img.style.transform = 'rotate(' + rotation + 'deg) scale(' + k + ')';
    const vw = h * k;
    const vh = w * k;
    img.style.margin = ((vh - h) / 2) + 'px ' + ((vw - w) / 2) + 'px';
  }

  function addPhotoRotation(answerCard) {
    answerCard.querySelectorAll(ANSWER_IMG).forEach((img) => {
      if (img.dataset.tmRot) return;
      img.dataset.tmRot = '1';
      const host = img.parentElement;
      if (!host) return;
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      let rotation = 0;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = ROT_BTN_CLASS;
      btn.textContent = '↻';
      btn.title = 'Повернуть фото на 90°';
      btn.setAttribute('aria-label', 'Повернуть фото на 90 градусов');
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        rotation = (rotation + 90) % 360;
        applyRotation(img, rotation);
        btn.title = 'Поворот: ' + rotation + '°. Нажмите, чтобы повернуть ещё на 90°';
      });
      host.appendChild(btn);
    });
  }

  // Ключ перетаскивается за шапку, но только внутри блока своего задания
  function makeDraggable(panel, handle, card) {
    let drag = null;
    handle.addEventListener('pointerdown', (e) => {
      const pr = panel.getBoundingClientRect();
      drag = { dx: e.clientX - pr.left, dy: e.clientY - pr.top };
      if (handle.setPointerCapture) handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const cr = card.getBoundingClientRect();
      const pr = panel.getBoundingClientRect();
      const maxX = Math.max(0, cr.width - pr.width);
      const maxY = Math.max(0, cr.height - pr.height);
      let x = e.clientX - drag.dx - cr.left;
      let y = e.clientY - drag.dy - cr.top;
      x = Math.min(Math.max(0, x), maxX);
      y = Math.min(Math.max(0, y), maxY);
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
      panel.style.right = 'auto';
    });
    const end = () => { drag = null; };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function copyKey(answerCard) {
    if (answerCard._tmKeyPanel && answerCard._tmKeyPanel.isConnected) return;
    if (answerCard.querySelector(`.${PANEL_CLASS}`)) return;
    const keyBlock = findKeyBlock(answerCard);
    if (!keyBlock) return;
    const panel = document.createElement('aside');
    panel.className = PANEL_CLASS;
    const handle = document.createElement('div');
    handle.className = 'tm-nf-key-handle';
    handle.textContent = '⠿ Ключ ответа';
    panel.appendChild(handle);
    panel.appendChild(keyBlock.cloneNode(true));

    // окно живёт внутри блока задания и не выходит за его границы
    answerCard.style.position = 'relative';
    panel.style.position = 'absolute';
    panel.style.top = '52px';
    panel.style.right = '16px';
    panel.style.left = 'auto';
    panel.style.width = 'min(46%, 760px)';
    answerCard.appendChild(panel);

    answerCard._tmKeyPanel = panel;
    makeDraggable(panel, handle, answerCard);
  }

  function addFileText(answerCard) {
    const link = [...answerCard.querySelectorAll('a[href]')].find((node) =>
      /\.(?:pdf|docx)(?:[?#].*)?$/i.test(node.href)
    );
    if (!link || answerCard.querySelector(`.${TEXT_CLASS}`)) return;
    const label = document.createElement('div');
    label.className = TEXT_CLASS;
    label.textContent = `Файл ответа: ${link.textContent.trim() || link.href.split('/').pop()}`;
    answerCard.appendChild(label);
  }

  function process() {
    installStyle();
    removeOldPanels();

    document.querySelectorAll(ANSWER_IMG).forEach((image) => {
      let answerCard = image.parentElement;
      while (answerCard && answerCard !== document.body) {
        if (
          answerCard.matches('div.rounded-lg.p-4') &&
          [...answerCard.querySelectorAll('span, p, strong')].some((node) => normalize(node.textContent).includes('Ответ ученика:'))
        ) break;
        answerCard = answerCard.parentElement;
      }
      if (!answerCard || answerCard === document.body) return;

      answerCard.classList.add('tm-neofamily-review-answer-card-v4');
      preparePhotoGroup(answerCard);
      addPhotoRotation(answerCard);
      copyKey(answerCard);
      addFileText(answerCard);
    });
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      process();
    });
  }

  process();
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
})();
