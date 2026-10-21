// ==UserScript==
// @name         NeoCheck V3
// @namespace    neofamily-copy-for-check
// @version      1.72
// @updateURL    https://raw.githubusercontent.com/kirilkasss/NeoFamily_plug/main/neocheck.user.js
// @downloadURL  https://raw.githubusercontent.com/kirilkasss/NeoFamily_plug/main/neocheck.user.js
// @description  1) Кнопка у задания копирует условие, ключ, имя ученика и текст/фото ответа. 2) Над полем «Диалог с учеником» свои шаблоны (текст и картинки) предпросмотр прикреплённых картинок, режим «ключ рядом с ответом», подсветка совпадений с ключом и подсчёт заданий, сообщений, выплат и личный график смен
// @match        https://neofamily.ru/*
// @match        https://*.neofamily.ru/*
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @grant        unsafeWindow
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ======================================================================
  //  ЧАСТЬ 1. Копирование задания для проверки
  // ======================================================================

  // Эта строка добавляется в начало копируемого текста. Можно поменять или оставить пустой ''.
  const PREFIX = 'Проверь по скиллу ege-bio-check.';

  const DETAIL = '[class*="detail-text_detailText"]';

  function walk(n, out) {
    if (n.nodeType === 3) { out.push(n.nodeValue); return; }
    if (n.nodeType !== 1) return;
    const t = n.tagName;
    if (t === 'SVG' || t === 'svg' || t === 'STYLE' || t === 'SCRIPT') return;
    if (t === 'BR') { out.push('\n'); return; }
    if (t === 'IMG') {
      const m = (n.getAttribute('src') || '').match(/[?&]url=([^&]+)/);
      let u = n.getAttribute('src') || '';
      try { if (m) u = decodeURIComponent(m[1]); } catch (e) {}
      out.push('\n[К заданию приложен рисунок: ' + u + ']\n');
      return;
    }
    if (t === 'TABLE') {
      n.querySelectorAll('tr').forEach(tr => {
        const cells = [...tr.children].map(c => c.textContent.trim());
        out.push(cells.join(' | ') + '\n');
      });
      return;
    }
    n.childNodes.forEach(c => walk(c, out));
    if (/^(P|DIV|LI|TR|H[1-6])$/.test(t)) out.push('\n');
  }

  function textOf(el) {
    if (!el) return '';
    const out = [];
    walk(el, out);
    return out.join('')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function collect(card) {
    const region = card.querySelector('[role="region"]');
    if (!region) return null;

    const details = [...region.querySelectorAll(DETAIL)];

    const answerLabel = [...region.querySelectorAll('span')]
      .find(s => /^Ответ ученика\s*:?$/i.test(s.textContent.trim()));
    // В разметке NeoFamily фото — следующий сосед надписи, а не блок detail-text.
    const answerContainer = answerLabel && answerLabel.parentElement;
    const answerBox = answerLabel
      ? (answerLabel.nextElementSibling || answerContainer?.querySelector(DETAIL) || answerContainer)
      : null;
    const answerImages = answerBox ? [...answerBox.querySelectorAll('img')] : [];

   const keyBox = details.find(d => /Элементы (ключа|ответа)/i.test(d.textContent));
    const tableBox = details.find(d => d.querySelector('table'));
    const condBox = details.find(d => d !== answerBox && d !== keyBox && d !== tableBox);

    const key = textOf(keyBox)
      .split('\n')
      .filter(l => !/^Источник\s*:/i.test(l.trim()))
      .join('\n')
      .trim();

    const answerText = textOf(answerBox)
      .replace(/\[К заданию приложен рисунок:[^\]]*\]/g, '')
      .trim();
    const answer = answerText || (answerImages.length
      ? `Ответ приложен фотографией (${answerImages.length}).`
      : '[ответ не найден или приложен файлом/фото]');

    const num = (card.textContent.match(/№\s*(\d+)/) || [])[1];
    const lineEl = [...card.querySelectorAll('div')]
      .find(d => d.children.length === 0 && /^\d+\s*линия$/i.test(d.textContent.trim()));
    const line = lineEl ? lineEl.textContent.trim() : '';
    const topicEl = [...card.querySelectorAll('span')].find(s => /^Тема:/.test(s.textContent.trim()));
    const topic = topicEl ? topicEl.textContent.trim() : '';
    const head = ['Задание' + (num ? ' №' + num : ''), line, topic].filter(Boolean).join(', ');

    const maxEl = card.querySelector('[id$="-score-input"] label span');
    const max = maxEl ? maxEl.textContent.replace('/', '').trim() : '';

    // Если ответ ученика приложен фотографией, сам ответ и фото не копируем:
    // для проверки достаточно условия, ключа и разбалловки.
    if (answerImages.length) {
      const parts = [];
      parts.push('УСЛОВИЕ:\n' + (textOf(condBox) || '[не найдено]'));
      parts.push('КЛЮЧ:\n' + (key || '[не найден]'));
      if (tableBox) parts.push('ПЕРЕВОД ЭЛЕМЕНТОВ В БАЛЛЫ:\n' + textOf(tableBox));
      return { text: parts.join('\n\n'), answerImages: [], photoAnswerSkipped: true };
    }

    // Текстовый ответ ученика копируем полностью, как и раньше.
    const parts = [];
    if (PREFIX) parts.push(PREFIX);
    const student = getStudentName();
    if (student?.full) parts.push('УЧЕНИК:\n' + student.full);
    parts.push(head + (max ? '\nМаксимальный балл: ' + max : ''));
    parts.push('УСЛОВИЕ:\n' + (textOf(condBox) || '[не найдено]'));
    parts.push('КЛЮЧ:\n' + (key || '[не найден]'));
    if (tableBox) parts.push('ПЕРЕВОД ЭЛЕМЕНТОВ В БАЛЛЫ:\n' + textOf(tableBox));
    parts.push('ОТВЕТ УЧЕНИКА:\n' + answer);
    return { text: parts.join('\n\n'), answerImages: [], photoAnswerSkipped: false };
  }

  function toast(msg, bad) {
    const d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:99999;padding:12px 18px;border-radius:12px;'
      + 'font:600 14px sans-serif;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.25);background:' + (bad ? '#d33' : '#2e9e5b');
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 2200);
  }

  async function copyText(text) {
    if (typeof GM_setClipboard === 'function') { GM_setClipboard(text, 'text'); return; }
    await navigator.clipboard.writeText(text);
  }

  async function makeAnswerImageBlob(images) {
    const loaded = await Promise.all(images.map(async (img, index) => {
      const src = img.currentSrc || img.src;
      if (!src) throw new Error(`У фото №${index + 1} нет адреса`);
      // В присланной разметке currentSrc — same-origin адрес /_next/image,
      // поэтому загружаем уже отображаемую оптимизированную копию.
      const response = await fetch(src, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Не удалось загрузить фото №${index + 1}`);
      const bitmap = await createImageBitmap(await response.blob());
      let turns = Number(img.getAttribute('data-tm-rot') || 0);
      if (!Number.isFinite(turns)) turns = 0;
      if (Math.abs(turns) > 3) turns = Math.round(turns / 90);
      turns = ((turns % 4) + 4) % 4;
      const sideways = turns % 2 === 1;
      return {
        bitmap,
        turns,
        width: sideways ? bitmap.height : bitmap.width,
        height: sideways ? bitmap.width : bitmap.height
      };
    }));

    // Несколько фотографий объединяем вертикально: так в буфер попадает
    // одно изображение, которое можно вставить вместе с текстом задания.
    const margin = 32;
    const labelHeight = loaded.length > 1 ? 48 : 0;
    const gap = loaded.length > 1 ? 32 : 0;
    const contentWidth = Math.max(...loaded.map(item => item.width));
    const contentHeight = loaded.reduce((sum, item) => sum + item.height + labelHeight, 0)
      + gap * Math.max(0, loaded.length - 1);
    const rawWidth = contentWidth + margin * 2;
    const rawHeight = contentHeight + margin * 2;
    const scale = Math.min(1, 12000 / Math.max(rawWidth, rawHeight), Math.sqrt(100000000 / (rawWidth * rawHeight)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(rawWidth * scale));
    canvas.height = Math.max(1, Math.ceil(rawHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Не удалось подготовить фото для буфера обмена');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);

    let y = margin;
    loaded.forEach((item, index) => {
      if (loaded.length > 1) {
        ctx.fillStyle = '#222';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText(`Фото ответа ${index + 1}`, margin, y + 34);
        y += labelHeight;
      }
      ctx.save();
      ctx.translate(margin + contentWidth / 2, y + item.height / 2);
      ctx.rotate(item.turns * Math.PI / 2);
      ctx.drawImage(item.bitmap, -item.bitmap.width / 2, -item.bitmap.height / 2);
      ctx.restore();
      y += item.height + gap;
      item.bitmap.close?.();
    });

    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('Браузер не смог создать PNG фотографии');
    return png;
  }

  async function copy(text, answerImages = []) {
    if (!answerImages.length) { await copyText(text); return; }
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('Браузер не поддерживает копирование изображения');
      }
      // Передаём Promise в ClipboardItem и начинаем запись сразу в обработчике
      // клика, чтобы браузер не потерял пользовательское разрешение на буфер.
      const image = makeAnswerImageBlob(answerImages);
      const item = new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'image/png': image
      });
      await navigator.clipboard.write([item]);
    } catch (error) {
      // Если браузер запретил изображение, хотя бы сохраняем текст задания.
      await copyText(text);
      const fallbackError = new Error(error?.message || 'Не удалось скопировать фото');
      fallbackError.textCopied = true;
      throw fallbackError;
    }
  }

  function addCopyButton(card) {
    if (card.querySelector('.nf-copy-btn')) return;
    const region = card.querySelector('[role="region"]');
    if (!region) return;
    const hasAnswer = [...region.querySelectorAll('span')].some(s => /Ответ ученика/i.test(s.textContent));
    if (!hasAnswer) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nf-copy-btn';
    btn.textContent = '📋 Копировать для проверки';
    btn.style.cssText = 'align-self:flex-start;padding:10px 18px;border-radius:12px;border:2px solid #6b5cff;'
      + 'background:#fff;color:#6b5cff;font:700 14px sans-serif;cursor:pointer;';
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      try {
        const result = collect(card);
        if (!result) throw new Error('no data');
        await copy(result.text, result.answerImages);
        toast(result.photoAnswerSkipped
          ? 'Фото ответа пропущено: скопированы условие, ключ и разбалловка'
          : 'Скопированы задание, ответ ученика, ключ и разбалловка');
      } catch (err) {
        console.error('[NeoFamily copy]', err);
        toast(err.textCopied
          ? 'Текст скопирован, но фото не удалось включить'
          : 'Не получилось скопировать', true);
      }
    });

    const scoreRow = card.querySelector('[id$="-score-input"]');
    const row = scoreRow && scoreRow.closest('.justify-between');
    if (row && row.parentElement) {
      row.parentElement.insertBefore(btn, row);
    } else {
      const holder = region.querySelector('.flex.w-full.flex-col') || region;
      holder.appendChild(btn);
    }
  }

  // ======================================================================
  //  ЧАСТЬ 2. Свои шаблоны (текст и картинки) над полем «Диалог с учеником»
  // ======================================================================

  const TXT_KEY = 'nf_reply_templates_v1';
  const IMG_KEY = 'nf_reply_images_v1';
  const OLD_DEFAULT_IDS = ['d1', 'd2', 'd3']; // прежние готовые шаблоны, убираем

  function storeGet(key) {
    try {
      const raw = typeof GM_getValue === 'function' ? GM_getValue(key, null) : localStorage.getItem(key);
      if (!raw) return [];
      const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(v) ? v : [];
    } catch (e) { console.error('[NeoFamily tpl] load', e); return []; }
  }

  function storeSet(key, list) {
    try {
      const s = JSON.stringify(list);
      if (typeof GM_setValue === 'function') GM_setValue(key, s);
      else localStorage.setItem(key, s);
      return true;
    } catch (e) { console.error('[NeoFamily tpl] save', e); return false; }
  }

  let texts = storeGet(TXT_KEY).filter(t => !OLD_DEFAULT_IDS.includes(t.id));
  let images = storeGet(IMG_KEY);
  const panels = new Set();

  function renderAll() {
    panels.forEach(p => {
      if (!p.isConnected) { panels.delete(p); return; }
      p._render();
    });
  }

  function getEditor(panel) {
    const cont = panel.closest('[id$="-dialogue"]');
    return cont ? cont.querySelector('.ProseMirror[contenteditable="true"]') : null;
  }

  // ---------- вставка текста в редактор (ProseMirror/tiptap) ----------
  function insertText(editor, text) {
    editor.focus();
    const sel = window.getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode)) {
      const r = document.createRange();
      r.selectNodeContents(editor);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    const before = editor.textContent;
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    } catch (e) { /* пойдём запасным путём */ }
    if (editor.textContent === before) {
      text.split('\n').forEach((line, i) => {
        if (i > 0) document.execCommand('insertParagraph');
        if (line) document.execCommand('insertText', false, line);
      });
    }
  }

  // ---------- имя ученика и подстановки ----------
  // На странице имя стоит в блоке: <span>Имя Фамилия</span><span>Курс: ...</span>
  function getStudentName() {
    const course = [...document.querySelectorAll('span')].find(s =>
      /^Курс\s*:/.test(s.textContent.trim())
      && s.previousElementSibling
      && s.previousElementSibling.tagName === 'SPAN'
      && s.previousElementSibling.textContent.trim());
    if (!course) return null;
    const full = course.previousElementSibling.textContent.trim().replace(/\s+/g, ' ');
    const parts = full.split(' ');
    return { full, first: parts[0], last: parts.slice(1).join(' ') };
  }

  // Подставляет {имя}, {фамилия}, {фио}. Если нужное значение не найдено, возвращает null.
  function applyVars(text) {
    const needs = /\{\s*(имя|фамилия|фио)\s*\}/i.test(text);
    if (!needs) return text;
    const st = getStudentName();
    if (!st) { toast('Не нашла имя ученика на странице', true); return null; }
    let missing = false;
    const out = text.replace(/\{\s*(имя|фамилия|фио)\s*\}/gi, (m, k) => {
      k = k.toLowerCase();
      const v = k === 'имя' ? st.first : k === 'фамилия' ? st.last : st.full;
      if (!v) missing = true;
      return v || '';
    });
    if (missing) { toast('В имени ученика нет фамилии', true); return null; }
    return out;
  }

  function editorText(editor) {
    return [...editor.querySelectorAll('p')].map(p => p.textContent).join('\n').trim();
  }

  // ---------- картинки ----------
  const MAX_IMG_BYTES = 4 * 1024 * 1024;

  function readImage(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = reject;
      fr.onload = () => {
        const src = fr.result;
        // gif не трогаем, чтобы не потерять анимацию; небольшие файлы тоже
        if (file.type === 'image/gif' || file.size < 300 * 1024) {
          resolve({ dataUrl: src, type: file.type, fileName: file.name });
          return;
        }
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const k = Math.min(1, 1200 / Math.max(img.width, img.height));
          const w = Math.round(img.width * k);
          const h = Math.round(img.height * k);
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          const out = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          resolve({ dataUrl: c.toDataURL(out, 0.85), type: out, fileName: file.name });
        };
        img.src = src;
      };
      fr.readAsDataURL(file);
    });
  }

  function dataUrlToFile(dataUrl, baseName) {
    const [head, b64] = dataUrl.split(',');
    const mime = (head.match(/:(.*?);/) || [])[1] || 'image/png';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');
    return new File([bytes], (baseName || 'image') + '.' + ext, { type: mime });
  }

  function attachImage(panel, im) {
    const cont = panel.closest('[id$="-dialogue"]');
    const input = cont && cont.querySelector('input[type="file"]');
    if (!input) { toast('Не найдено поле загрузки файла', true); return; }
    try {
      const dt = new DataTransfer();
      dt.items.add(dataUrlToFile(im.dataUrl, im.name.replace(/[^\wа-яё-]+/gi, '_')));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {
      console.error('[NeoFamily tpl] attach', e);
      toast('Не получилось прикрепить картинку', true);
    }
  }

  // ---------- интерфейс ----------
  function el(tag, css, props) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (props) Object.assign(e, props);
    return e;
  }

  const CHIP = 'padding:6px 12px;border-radius:999px;border:1px solid #c9c5ff;background:#f4f2ff;color:#4a3fd6;'
    + 'font:600 13px sans-serif;cursor:pointer;';
  const CHIP_IMG = 'display:inline-flex;align-items:center;gap:6px;padding:4px 12px 4px 5px;border-radius:999px;'
    + 'border:1px solid #bfe3c9;background:#effaf2;color:#217a45;font:600 13px sans-serif;cursor:pointer;';
  const MINI = 'padding:6px 10px;border-radius:10px;border:1px solid #ccc;background:#fff;color:#333;'
    + 'font:600 13px sans-serif;cursor:pointer;';
  const FIELD = 'width:100%;box-sizing:border-box;padding:8px 10px;border-radius:10px;border:1px solid #ccc;'
    + 'font:14px sans-serif;background:#fff;color:#222;';

  function thumb(dataUrl, size) {
    return el('img', 'width:' + size + 'px;height:' + size + 'px;object-fit:contain;background:#fff;border-radius:6px;',
      { src: dataUrl, alt: '' });
  }

  // Полный просмотр картинки перед прикреплением: нужно явно нажать «Прикрепить»
  function openPreview(im, onConfirm) {
    const old = document.querySelector('.nf-preview');
    if (old) old.remove();

    const overlay = el('div', 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.6);display:flex;'
      + 'align-items:center;justify-content:center;padding:20px;');
    overlay.className = 'nf-preview';
    const card = el('div', 'background:#fff;border-radius:16px;padding:16px;max-width:min(92vw,720px);max-height:92vh;'
      + 'display:flex;flex-direction:column;gap:12px;box-shadow:0 10px 40px rgba(0,0,0,.35);');
    const title = el('div', 'font:700 15px sans-serif;color:#222;', { textContent: 'Прикрепить эту картинку? «' + im.name + '»' });
    const full = el('img', 'max-width:100%;max-height:68vh;object-fit:contain;border-radius:10px;align-self:center;',
      { src: im.dataUrl, alt: im.name });
    const btns = el('div', 'display:flex;gap:8px;justify-content:flex-end;');
    const cancel = el('button', MINI, { type: 'button', textContent: 'Отмена' });
    const ok = el('button', CHIP, { type: 'button', textContent: 'Прикрепить' });

    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    cancel.onclick = e => { e.stopPropagation(); close(); };
    ok.onclick = e => { e.stopPropagation(); close(); onConfirm(); };
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey, true);

    btns.append(cancel, ok);
    card.append(title, full, btns);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  function buildPanel() {
    const panel = el('div', 'display:flex;flex-direction:column;gap:8px;margin-bottom:8px;');
    panel.className = 'nf-tpl-panel';
    panel._manage = false;
    panel._form = null; // null | { kind: 'text'|'image', id, name, text, dataUrl, type }

    // не терять курсор в редакторе при клике по кнопкам
    panel.addEventListener('mousedown', e => {
      if (e.target.tagName === 'BUTTON') e.preventDefault();
    });

    panel._render = function () {
      panel.innerHTML = '';

      const row = el('div', 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;');
      row.appendChild(el('span', 'font:700 12px sans-serif;color:#777;', { textContent: 'Шаблоны' }));

      if (!texts.length && !images.length) {
        row.appendChild(el('span', 'font:13px sans-serif;color:#999;', { textContent: 'пока пусто, добавь свой' }));
      }

      // текстовые
      texts.forEach(t => {
        if (panel._manage) {
          const g = el('span', 'display:inline-flex;gap:2px;align-items:center;');
          g.appendChild(el('span', CHIP + 'cursor:default;', { textContent: t.name }));
          const ed = el('button', MINI, { type: 'button', textContent: '✎', title: 'Изменить' });
          ed.onclick = e => {
            e.stopPropagation();
            panel._form = { kind: 'text', id: t.id, name: t.name, text: t.text };
            panel._render();
          };
          const del = el('button', MINI, { type: 'button', textContent: '✕', title: 'Удалить' });
          del.onclick = e => {
            e.stopPropagation();
            if (!confirm('Удалить шаблон «' + t.name + '»?')) return;
            texts = texts.filter(x => x.id !== t.id);
            storeSet(TXT_KEY, texts);
            renderAll();
          };
          g.append(ed, del);
          row.appendChild(g);
        } else {
          const chip = el('button', CHIP, { type: 'button', textContent: t.name, title: t.text });
          chip.onclick = e => {
            e.stopPropagation();
            const editor = getEditor(panel);
            const txt = applyVars(t.text);
            if (editor && txt !== null) insertText(editor, txt);
          };
          row.appendChild(chip);
        }
      });

      // картинки
      images.forEach(im => {
        if (panel._manage) {
          const g = el('span', 'display:inline-flex;gap:2px;align-items:center;');
          const label = el('span', CHIP_IMG + 'cursor:default;');
          label.append(thumb(im.dataUrl, 24), document.createTextNode(im.name));
          const ed = el('button', MINI, { type: 'button', textContent: '✎', title: 'Изменить' });
          ed.onclick = e => {
            e.stopPropagation();
            panel._form = { kind: 'image', id: im.id, name: im.name, dataUrl: im.dataUrl, type: im.type };
            panel._render();
          };
          const del = el('button', MINI, { type: 'button', textContent: '✕', title: 'Удалить' });
          del.onclick = e => {
            e.stopPropagation();
            if (!confirm('Удалить картинку «' + im.name + '»?')) return;
            images = images.filter(x => x.id !== im.id);
            storeSet(IMG_KEY, images);
            renderAll();
          };
          g.append(label, ed, del);
          row.appendChild(g);
        } else {
          const chip = el('button', CHIP_IMG, { type: 'button', title: 'Прикрепить картинку к сообщению' });
          chip.append(thumb(im.dataUrl, 24), document.createTextNode(im.name));
          chip.onclick = e => {
            e.stopPropagation();
            openPreview(im, () => attachImage(panel, im));
          };
          row.appendChild(chip);
        }
      });

      const addT = el('button', MINI, { type: 'button', textContent: '＋ Текст', title: 'Добавить текстовый шаблон' });
      addT.onclick = e => { e.stopPropagation(); panel._form = { kind: 'text', id: null, name: '', text: '' }; panel._render(); };
      const addI = el('button', MINI, { type: 'button', textContent: '＋ Картинка', title: 'Добавить картинку' });
      addI.onclick = e => { e.stopPropagation(); panel._form = { kind: 'image', id: null, name: '', dataUrl: '', type: '' }; panel._render(); };
      const gear = el('button', MINI, {
        type: 'button',
        textContent: panel._manage ? 'Готово' : '⚙',
        title: 'Изменить или удалить шаблоны'
      });
      gear.onclick = e => { e.stopPropagation(); panel._manage = !panel._manage; panel._render(); };
      row.append(addT, addI, gear);
      const who = getStudentName();
      if (who) {
        panel.appendChild(el('div', 'font:800 15px sans-serif;color:#222;', {
          textContent: 'Ученик: ' + who.full,
          title: 'Имя ученика из шапки страницы'
        }));
      }
      panel.appendChild(row);

      if (panel._form) panel.appendChild(panel._form.kind === 'text' ? textForm(panel) : imageForm(panel));
    };

    panel._render();
    return panel;
  }

  const FORM_BOX = 'display:flex;flex-direction:column;gap:6px;padding:10px;border:1px dashed #c9c5ff;'
    + 'border-radius:12px;background:#fff;';

  function textForm(panel) {
    const f = panel._form;
    const form = el('div', FORM_BOX);
    const name = el('input', FIELD, { type: 'text', placeholder: 'Название кнопки', value: f.name });
    const text = el('textarea', FIELD + 'min-height:90px;resize:vertical;', { placeholder: 'Текст шаблона', value: f.text });
    name.oninput = () => { f.name = name.value; };
    text.oninput = () => { f.text = text.value; };

    const btns = el('div', 'display:flex;gap:6px;flex-wrap:wrap;');
    const fromField = el('button', MINI, { type: 'button', textContent: 'Взять из поля ответа' });
    fromField.onclick = e => {
      e.stopPropagation();
      const editor = getEditor(panel);
      if (editor) { f.text = editorText(editor); text.value = f.text; }
    };
    const save = el('button', CHIP, { type: 'button', textContent: 'Сохранить' });
    save.onclick = e => {
      e.stopPropagation();
      const nm = f.name.trim();
      const tx = f.text.trim();
      if (!nm || !tx) { toast('Нужны название и текст', true); return; }
      texts = f.id
        ? texts.map(x => x.id === f.id ? { ...x, name: nm, text: tx } : x)
        : texts.concat({ id: 't' + Date.now(), name: nm, text: tx });
      storeSet(TXT_KEY, texts);
      panel._form = null;
      renderAll();
    };
    const cancel = el('button', MINI, { type: 'button', textContent: 'Отмена' });
    cancel.onclick = e => { e.stopPropagation(); panel._form = null; panel._render(); };
    btns.append(fromField, save, cancel);
    // кнопки подстановок: вставляют метку в текст шаблона в позицию курсора
    const vars = el('div', 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;');
    vars.appendChild(el('span', 'font:12px sans-serif;color:#777;', { textContent: 'Подставить имя ученика:' }));
    ['{имя}', '{фамилия}', '{фио}'].forEach(tag => {
      const b = el('button', MINI, { type: 'button', textContent: tag });
      b.onclick = e => {
        e.stopPropagation();
        const s = text.selectionStart != null ? text.selectionStart : text.value.length;
        const en = text.selectionEnd != null ? text.selectionEnd : s;
        text.value = text.value.slice(0, s) + tag + text.value.slice(en);
        f.text = text.value;
        text.focus();
        text.setSelectionRange(s + tag.length, s + tag.length);
      };
      vars.appendChild(b);
    });

    form.append(name, text, vars, btns);
    return form;
  }

  function imageForm(panel) {
    const f = panel._form;
    const form = el('div', FORM_BOX);
    const name = el('input', FIELD, { type: 'text', placeholder: 'Название кнопки (например, «Молодец»)', value: f.name });
    name.oninput = () => { f.name = name.value; };

    const file = el('input', 'font:13px sans-serif;', { type: 'file', accept: 'image/*' });
    const preview = el('div', 'min-height:0;');
    const drawPreview = () => {
      preview.innerHTML = '';
      if (f.dataUrl) {
        preview.appendChild(el('img', 'max-height:110px;max-width:100%;border-radius:8px;', { src: f.dataUrl, alt: '' }));
      }
    };
    drawPreview();

    file.onchange = async () => {
      const fl = file.files && file.files[0];
      if (!fl) return;
      try {
        const r = await readImage(fl);
        if (r.dataUrl.length * 0.75 > MAX_IMG_BYTES) { toast('Файл слишком большой (до 4 МБ)', true); file.value = ''; return; }
        f.dataUrl = r.dataUrl;
        f.type = r.type;
        if (!f.name.trim()) { f.name = r.fileName.replace(/\.[^.]+$/, ''); name.value = f.name; }
        drawPreview();
      } catch (err) {
        console.error('[NeoFamily tpl] image', err);
        toast('Не получилось прочитать картинку', true);
      }
    };

    const btns = el('div', 'display:flex;gap:6px;flex-wrap:wrap;');
    const save = el('button', CHIP, { type: 'button', textContent: 'Сохранить' });
    save.onclick = e => {
      e.stopPropagation();
      const nm = f.name.trim();
      if (!nm || !f.dataUrl) { toast('Нужны название и картинка', true); return; }
      const next = f.id
        ? images.map(x => x.id === f.id ? { ...x, name: nm, dataUrl: f.dataUrl, type: f.type } : x)
        : images.concat({ id: 'i' + Date.now(), name: nm, dataUrl: f.dataUrl, type: f.type });
      if (!storeSet(IMG_KEY, next)) { toast('Не хватило места для картинки', true); return; }
      images = next;
      panel._form = null;
      renderAll();
    };
    const cancel = el('button', MINI, { type: 'button', textContent: 'Отмена' });
    cancel.onclick = e => { e.stopPropagation(); panel._form = null; panel._render(); };
    btns.append(save, cancel);

    form.append(name, file, preview, btns);
    return form;
  }

  function injectPanels() {
    // только главное поле в блоке «Диалог с учеником» (в конце домашки), без полей под каждым заданием
    document.querySelectorAll('[id$="-dialogue"] .ProseMirror[contenteditable="true"]').forEach(ed => {
      const box = ed.closest('.rounded-2xl');
      if (!box || !box.parentElement) return;
      // одна панель на весь блок диалога (после прикрепления файла сайт добавляет свой блок рядом)
      const cont = ed.closest('[id$="-dialogue"]');
      if (cont && cont.querySelector('.nf-tpl-panel')) return;
      const panel = buildPanel();
      panels.add(panel);
      box.parentElement.insertBefore(panel, box);
    });
  }

  // ======================================================================
  //  ЧАСТЬ 3. Предпросмотр любых прикреплённых картинок (скрепкой, шаблоном и т.д.)
  // ======================================================================

  const attached = []; // { name, size, url, born }

  // Кнопка «удалить» у файла в блоке сайта (по имени файла)
  function siteRemoveButton(cont, name) {
    return [...cont.querySelectorAll('button')].find(b => {
      if (!/^удалить$/i.test(b.textContent.trim())) return false;
      const chip = b.closest('.flex.items-center.gap-2');
      return chip && chip.textContent.includes(name);
    });
  }

  function fmtSize(n) {
    return n >= 1048576 ? (n / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(n / 1024)) + ' КБ';
  }

  function renderAttachPreview(cont) {
    let strip = cont.querySelector('.nf-attach-preview');
    if (!attached.length) { if (strip) strip.remove(); return; }
    const sig = attached.map(a => a.url).join('|');
    if (strip && strip.dataset.sig === sig) return; // ничего не изменилось, не перерисовываем

    if (!strip) {
      strip = el('div', 'display:flex;flex-direction:column;gap:8px;margin-bottom:8px;');
      strip.className = 'nf-attach-preview';
      const panel = cont.querySelector('.nf-tpl-panel');
      if (panel) panel.after(strip); else cont.appendChild(strip);
    }
    strip.dataset.sig = sig;
    strip.innerHTML = '';
    strip.appendChild(el('span', 'font:700 12px sans-serif;color:#777;', { textContent: 'Будет отправлено:' }));

    attached.slice().forEach(a => {
      const card = el('div', 'display:flex;flex-direction:column;gap:6px;padding:10px;border:1px solid #d9d6f5;'
        + 'border-radius:12px;background:#fff;align-self:flex-start;max-width:100%;');
      const img = el('img', 'max-width:100%;max-height:260px;object-fit:contain;border-radius:8px;align-self:flex-start;',
        { src: a.url, alt: a.name });
      const bottom = el('div', 'display:flex;gap:10px;align-items:center;justify-content:space-between;');
      bottom.appendChild(el('span', 'font:600 13px sans-serif;color:#444;word-break:break-all;',
        { textContent: a.name + ' · ' + fmtSize(a.size) }));
      const rm = el('button', MINI, { type: 'button', textContent: 'Убрать' });
      rm.onclick = e => {
        e.stopPropagation();
        const b = siteRemoveButton(cont, a.name);
        if (b) b.click();
        URL.revokeObjectURL(a.url);
        const i = attached.indexOf(a);
        if (i > -1) attached.splice(i, 1);
        renderAttachPreview(cont);
      };
      bottom.appendChild(rm);
      card.append(img, bottom);
      strip.appendChild(card);
    });
  }

  // Убирает из предпросмотра файлы, которых уже нет в блоке сайта (удалили или отправили)
  function syncAttach() {
    const cont = document.querySelector('[id$="-dialogue"]');
    if (!cont) {
      attached.splice(0).forEach(a => URL.revokeObjectURL(a.url));
      return;
    }
    const now = Date.now();
    for (let i = attached.length - 1; i >= 0; i--) {
      const a = attached[i];
      if (now - a.born > 2500 && !siteRemoveButton(cont, a.name)) {
        URL.revokeObjectURL(a.url);
        attached.splice(i, 1);
      }
    }
    renderAttachPreview(cont);
  }

  function addAttachedFiles(cont, files) {
    console.log('[NF] файлы:', [...(files || [])].map(f => f.name + ' (' + f.type + ', ' + f.size + ')'));
    const imgs = [...(files || [])].filter(f => /^image\//.test(f.type));
    if (!imgs.length) return;
    const now = Date.now();
    imgs.forEach(f => {
      // один и тот же файл, пришедший двумя событиями подряд, добавляем один раз
      const dup = attached.some(a => a.name === f.name && a.size === f.size && now - a.born < 1500);
      if (!dup) attached.push({ name: f.name, size: f.size, url: URL.createObjectURL(f), born: now });
    });
    renderAttachPreview(cont);
    setTimeout(syncAttach, 3000);
  }

  function dialogueOf(target) {
    return target && target.closest ? target.closest('[id$="-dialogue"]') : null;
  }

  // 1) Выбор файла скрепкой или шаблоном-картинкой
  document.addEventListener('change', e => {
    const input = e.target;
    if (!input || input.tagName !== 'INPUT' || input.type !== 'file') return;
    const cont = dialogueOf(input);
    if (cont) addAttachedFiles(cont, input.files);
  }, true);

  // 2) Картинка вставлена из буфера обмена (Ctrl+V), например скриншот
  document.addEventListener('paste', e => {
    const cont = dialogueOf(e.target);
    console.log('[NF] paste, в диалоге:', !!cont);
    if (cont && e.clipboardData) addAttachedFiles(cont, e.clipboardData.files);
  }, true);

  // 3) Картинка перетащена мышью в диалог
  document.addEventListener('drop', e => {
    const cont = dialogueOf(e.target);
    console.log('[NF] drop, в диалоге:', !!cont);
    if (cont && e.dataTransfer) addAttachedFiles(cont, e.dataTransfer.files);
  }, true);


  // ======================================================================
  //  Общие функции (нужны подсчёту выплат)
  // ======================================================================

  function hwInfo() {
    const h1 = document.querySelector('h1');
    const title = ((h1 && h1.textContent) || document.title || 'Без названия').trim().replace(/\s+/g, ' ');
    return { title, url: location.href.split('#')[0] };
  }

  function attemptId() {
    const d = document.querySelector('[id$="-dialogue"]');
    const m = d && d.id.match(/attempt-(\d+)-dialogue/);
    return m ? m[1] : location.pathname;
  }

  // ======================================================================
  //  ЧАСТЬ 5. Режим «ключ рядом с ответом» и подсветка совпадений с ключом
  //  Ничего на странице не переписывается: колонки делает CSS-сетка,
  //  подсветка идёт через CSS Custom Highlight API (теги в текст не вставляются).
  //  Настройки (включено / выключено) запоминаются.
  // ======================================================================

  const VIEW_KEY = 'nf_view_prefs_v1';

  function prefsLoad() {
    try {
      const raw = typeof GM_getValue === 'function' ? GM_getValue(VIEW_KEY, null) : localStorage.getItem(VIEW_KEY);
      if (!raw) return {};
      const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch (e) { return {}; }
  }

  function prefsSave() {
    try {
      const s = JSON.stringify(prefs);
      if (typeof GM_setValue === 'function') GM_setValue(VIEW_KEY, s);
      else localStorage.setItem(VIEW_KEY, s);
    } catch (e) { console.error('[NF] prefs save', e); }
  }

  let prefs = prefsLoad(); // { sbs: bool, hl: bool }

  (function addViewStyles() {
    const st = document.createElement('style');
    st.textContent = `
      @media (min-width: 1000px) {
        .nf-sbs-on { display: grid !important; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; }
        /* если в ответе есть картинка, ей отдаём колонку пошире */
        .nf-sbs-on.nf-sbs-img { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); }
        .nf-sbs-on > * { grid-column: 1 / -1; }
        .nf-sbs-on > .nf-sbs-cond { grid-row: 1; }
        .nf-sbs-on > .nf-sbs-key { grid-column: 1; grid-row: 2; max-height: 85vh; overflow: auto; }
        .nf-sbs-on > .nf-sbs-ans { grid-column: 2; grid-row: 2; max-height: 85vh; overflow: auto; }
        .nf-sbs-on .nf-sbs-key img { max-width: 100%; height: auto; }
        .nf-sbs-on .nf-sbs-ans img { max-width: 100%; }
        /* «Вписать картинку»: фото целиком в пределах колонки, без обрезки */
        .nf-sbs-on.nf-sbs-fit > .nf-sbs-ans img { width: auto !important; height: auto !important; max-width: 100% !important;
          max-height: calc(85vh - 70px) !important; aspect-ratio: auto !important; object-fit: contain !important; }
      }
      ::highlight(nf-ans) { background-color: #ffe66d; color: #1a1a1a; }
      ::highlight(nf-found) { background-color: rgba(46, 158, 91, .35); }
      ::highlight(nf-seq) { background-color: #8fd0ff; color: #1a1a1a; }
      ::highlight(nf-seq-part) { background-color: #ffc98a; color: #1a1a1a; }
    `;
    document.head.appendChild(st);
  })();

  // <pure>
  const STOP = new Set(('этого этой этом этим этих этот эта эти это чтобы когда если тогда также который которая '
    + 'которые которых может могут будет будут быть есть является являются более менее очень между через после '
    + 'перед потому поэтому именно только другой другие свой своей своих всех всей при или для что как так его '
    + 'они она оно них там тут тоже уже еще даже ответ ответа элемент верно неверно указано указан приводит '
    + 'приводят приведет вследствие любой любые каждый каждой можно нужно должен должна должны такой такая такие '
    + 'всего все вся').split(' '));

  const normW = w => w.toLowerCase().replace(/ё/g, 'е');

  function wordsOf(text) {
    const out = [];
    const re = /[A-Za-zА-Яа-яЁё]+(?:-[A-Za-zА-Яа-яЁё]+)*/g;
    let m;
    while ((m = re.exec(text || ''))) out.push({ raw: m[0], w: normW(m[0]), start: m.index, end: m.index + m[0].length });
    return out;
  }

  // ---- цепочки нуклеотидов ----
  const NUC = { 'А': 'А', 'У': 'У', 'Г': 'Г', 'Ц': 'Ц', 'Т': 'Т', 'A': 'А', 'U': 'У', 'G': 'Г', 'C': 'Ц', 'T': 'Т' };
  const SEQ_MIN = 8; // короче 8 нуклеотидов — не «длинная цепочка», такие совпадения случайны
  const nucOf = ch => NUC[ch.toUpperCase()] || null;
  const isNucWord = raw => raw.length >= 6 && [...raw].every(ch => nucOf(ch));
  const SKIP_RE = /[\s\u00a0\-–—'''′ʹ`"«».,;:()\[\]0-9_]/;

  // Поток нуклеотидов: пробелы, дефисы, штрихи, цифры и скобки выбрасываем, любая другая буква = разрыв '#'.
  // pos[i] — индекс символа в исходном тексте. upperOnly: в ключе строчные буквы считаем разрывом.
  function nucStream(text, upperOnly) {
    let norm = '';
    const pos = [];
    const t = String(text || '');
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (SKIP_RE.test(ch)) continue;
      let n = nucOf(ch);
      if (n && upperOnly && ch !== ch.toUpperCase()) n = null;
      norm += n || '#';
      pos.push(i);
    }
    return { norm, pos };
  }

  // Длинные цепочки в тексте ключа: [{ seq, s, e }] (s..e — позиции в исходном тексте)
  function keySeqs(text) {
    const st = nucStream(text);
    const out = [];
    let i = 0;
    while (i < st.norm.length) {
      if (st.norm[i] === '#') { i++; continue; }
      let j = i;
      while (j < st.norm.length && st.norm[j] !== '#') j++;
      if (j - i >= SEQ_MIN) out.push({ seq: st.norm.slice(i, j), s: st.pos[i], e: st.pos[j - 1] + 1 });
      i = j;
    }
    return out;
  }

  // Общие куски цепочки S и потока ответа A (длиной от minRun), максимальные по длине
  function commonRuns(S, A, minRun) {
    const out = [];
    let prev = new Array(S.length + 1).fill(0);
    for (let i = 1; i <= A.length; i++) {
      const cur = new Array(S.length + 1).fill(0);
      for (let j = 1; j <= S.length; j++) {
        if (A[i - 1] === S[j - 1]) {
          cur[j] = prev[j - 1] + 1;
          if (cur[j] >= minRun && (i === A.length || j === S.length || A[i] !== S[j])) out.push({ aEnd: i, sEnd: j, len: cur[j] });
        }
      }
      prev = cur;
    }
    return out;
  }

  // Какая часть цепочки есть в ответе: целиком или кусками
  function seqCoverage(S, A) {
    if (A.indexOf(S) !== -1) return { cov: 1, full: true };
    const covered = new Array(S.length).fill(false);
    commonRuns(S, A, SEQ_MIN).forEach(r => { for (let k = r.sEnd - r.len; k < r.sEnd; k++) covered[k] = true; });
    return { cov: covered.filter(Boolean).length / S.length, full: false };
  }

  // «Основа» слова из ключа: отрезаем окончание, чтобы «мембраны» нашло «мембран».
  // Аббревиатуры (ДНК, АТФ, ФДТ) ищем только целиком.
  function termOf(raw) {
    const w = normW(raw);
    if (STOP.has(w)) return null;
    if (isNucWord(raw)) return null; // длинные цепочки считаются отдельно
    // Короткие слова (2–3 буквы: ДНК, АТФ, ген, мет) ищутся только целым словом, регистр не важен.
    // Двухбуквенные строчные отбрасываем: это почти всегда предлоги и шум.
    if (w.length === 3 || (w.length === 2 && raw !== raw.toLowerCase())) {
      return { id: w + '!', stem: w, exact: true, raw: w };
    }
    if (w.length < 4) return null;
    const cut = w.length === 4 ? 4 : Math.max(4, w.length - (w.length >= 8 ? 3 : 2));
    return { id: w.slice(0, cut), stem: w.slice(0, cut), exact: false, raw: w };
  }

  // Ищем основу слова прямо в тексте ответа (даже внутри слипшихся слов: «аденинитимин»).
  // Двухбуквенные аббревиатуры ищем только как отдельное слово.
  function termIn(t, text, words) {
    if (t.exact) return words.some(x => x.w === t.stem);
    return text.includes(t.stem);
  }

  // Ключ → элементы. Варианты через «ИЛИ» (одинаковый номер) считаются альтернативами одного элемента.
  function parseKey(text) {
    const els = [];
    let last = null, done = false;
    (text || '').split('\n').map(s => s.trim()).filter(Boolean).forEach(line => {
      if (done) return;
      line = line.replace(/^Элементы\s+(ключа|ответа)\s*:?\s*/i, '');
      if (!line) return;
      if (/^(ЕГЭ|ОГЭ|Источник)/i.test(line)) { done = true; return; }
      if (/^или$/i.test(line)) return;
      const m = line.match(/^(\d+)\s*[).]\s*(.*)$/);
      if (m) {
        const n = Number(m[1]);
        let e = els.find(x => x.n === n);
        if (!e) { e = { n, alts: [] }; els.push(e); }
        e.alts.push(m[2]);
        last = { e, i: e.alts.length - 1 };
      } else if (last) {
        // строка без номера — продолжение элемента, только если предыдущая не закончилась точкой или «;».
        // Иначе это примечание к ключу (курсив под элементами), к элементам оно не относится.
        if (/[.;!?]\s*$/.test(last.e.alts[last.i])) done = true;
        else last.e.alts[last.i] += ' ' + line;
      }
    });
    return els;
  }

  function analyzeTexts(keyText, answerText, condText, answerRaw) {
    const els = parseKey(keyText);
    if (!els.length) return null;
    const ansStream = nucStream(answerRaw !== undefined ? answerRaw : answerText).norm;
    const condStream = nucStream(condText).norm;
    const seqMap = new Map(); // цепочка -> { cov, full }
    const ansWords = wordsOf(answerText);
    const condWords = wordsOf(condText);
    const ansNorm = normW(answerText || '');
    const condNorm = normW(condText || '');
    const info = new Map(); // id -> { t, found }
    const res = [];
    els.forEach(e => {
      let best = null;
      e.alts.forEach(alt => {
        const seen = new Map();
        wordsOf(alt).forEach(w => { const t = termOf(w.raw); if (t && !seen.has(t.id)) seen.set(t.id, t); });
        const terms = [...seen.values()];
        const seqFlags = keySeqs(alt).map(k => {
          let c = seqMap.get(k.seq);
          if (!c) { c = seqCoverage(k.seq, ansStream); seqMap.set(k.seq, c); }
          return {
            t: { id: 'seq:' + k.seq, raw: 'цепочка ' + k.seq.slice(0, 10) + '…', isSeq: true },
            wt: condStream.indexOf(k.seq) !== -1 ? 0.5 : 2, // цепочка из условия — «эхо», весит вполсилы
            found: c.cov >= 0.5
          };
        });
        if (!terms.length && !seqFlags.length) return;
        // слова, которые есть и в условии, весят вполсилы: ученик мог просто повторить условие
        const flags = terms.map(t => ({
          t,
          wt: termIn(t, condNorm, condWords) ? 0.5 : 1,
          found: termIn(t, ansNorm, ansWords)
        })).concat(seqFlags);
        flags.forEach(f => {
          if (f.t.isSeq) return;
          const prev = info.get(f.t.id);
          info.set(f.t.id, { t: f.t, found: f.found || !!(prev && prev.found) });
        });
        const found = flags.filter(f => f.found).length;
        const sumW = flags.reduce((n, f) => n + f.wt, 0);
        const ratio = flags.reduce((n, f) => n + (f.found ? f.wt : 0), 0) / sumW;
        if (!best || ratio > best.ratio) {
          best = { n: e.n, ratio, found, total: flags.length, missing: flags.filter(f => !f.found).map(f => f.t.raw) };
        }
      });
      if (best) res.push(best);
    });
    const seqs = [...seqMap.entries()].map(([seq, c]) => ({ seq, cov: c.cov, full: c.full }));
    return { res, info, seqs };
  }
  // </pure>

  // ---------- поиск частей карточки ----------
  function cardParts(card) {
    const region = card.querySelector('[role="region"]');
    if (!region) return null;
    const label = [...region.querySelectorAll('span')].find(s => /Ответ ученика/i.test(s.textContent));
    if (!label) return null;
    const answerBox = label.parentElement ? label.parentElement.querySelector(DETAIL) : null;
const keyBox = [...region.querySelectorAll(DETAIL)].find(d => /Элементы (ключа|ответа)/i.test(d.textContent));
    if (!answerBox || !keyBox) return null;

    let ans = label;
    while (ans.parentElement && !ans.parentElement.contains(keyBox)) ans = ans.parentElement;
    const holder = ans.parentElement;
    if (!holder) return null;
    let key = keyBox;
    while (key && key.parentElement !== holder) key = key.parentElement;
    if (!key || key === ans) return null;

    const cond = [...holder.children].find(c => c !== ans && c !== key && !c.querySelector('table')
      && (c.matches(DETAIL) || c.querySelector(DETAIL)));
    const condBox = cond ? (cond.matches(DETAIL) ? cond : cond.querySelector(DETAIL)) : null;
    return { holder, ans, key, cond, answerBox, keyBox, condBox };
  }

  // ---------- режим «ключ рядом» ----------
  function applySbs(p) {
    const on = !!prefs.sbs;
    p.holder.classList.toggle('nf-sbs-on', on);
    p.ans.classList.toggle('nf-sbs-ans', on);
    p.key.classList.toggle('nf-sbs-key', on);
    if (p.cond) p.cond.classList.toggle('nf-sbs-cond', on);
    const hasImg = !!p.ans.querySelector('img');
    p.holder.classList.toggle('nf-sbs-img', on && hasImg);
    p.holder.classList.toggle('nf-sbs-fit', on && hasImg && prefs.fit !== false);
  }

  // ---------- подсветка ----------
  const hlStore = new Map(); // card -> { ranges: [{ kind, r }] }
  let warnedHl = false;
  const hlSupported = () => typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight !== 'undefined';

  function publishHighlights() {
    if (!hlSupported()) return;
    const all = { 'nf-ans': [], 'nf-found': [], 'nf-seq': [], 'nf-seq-part': [] };
    hlStore.forEach((v, card) => {
      if (!card.isConnected) { hlStore.delete(card); return; }
      v.ranges.forEach(x => all['nf-' + x.kind].push(x.r));
    });
    Object.keys(all).forEach(name => {
      if (all[name].length) {
        const h = new Highlight(...all[name]);
        if (name.indexOf('nf-seq') === 0) h.priority = 2; // цепочки рисуются поверх подсветки слов
        CSS.highlights.set(name, h);
      } else CSS.highlights.delete(name);
    });
  }

  // Диапазоны совпадений внутри блока. Для ответа ищем основы слов прямо в тексте,
  // подсвечиваем только само совпадение (слово из ключа целиком, если оно там есть, иначе основу с окончанием).
  function answerRanges(root, terms) {
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const text = normW(n.nodeValue);
      terms.forEach(t => {
        if (t.exact) {
          wordsOf(n.nodeValue).filter(w => w.w === t.stem).forEach(w => out.push({ kind: 'ans', n, a: w.start, b: w.end }));
          return;
        }
        let i = text.indexOf(t.stem);
        while (i !== -1) {
          let end;
          if (text.startsWith(t.raw, i)) end = i + t.raw.length;
          else {
            end = i + t.stem.length;
            const lim = i + t.stem.length + 3;
            while (end < lim && end < text.length && /[a-zа-я]/.test(text[end])) end++;
          }
          out.push({ kind: 'ans', n, a: i, b: end });
          i = text.indexOf(t.stem, i + t.stem.length);
        }
      });
    }
    return out.map(x => {
      const r = document.createRange();
      r.setStart(x.n, x.a);
      r.setEnd(x.n, x.b);
      return { kind: x.kind, r };
    });
  }

  // В ключе подсвечиваем только слова, которые нашлись в ответе
  function keyRanges(root, info) {
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      wordsOf(n.nodeValue).forEach(w => {
        const t = termOf(w.raw);
        const x = t && info.get(t.id);
        if (!x || !x.found) return;
        const r = document.createRange();
        r.setStart(n, w.start);
        r.setEnd(n, w.end);
        out.push({ kind: 'found', r });
      });
    }
    return out;
  }

  // Текст блока одним куском: склеиваем все текстовые узлы, чтобы цепочка находилась,
  // даже если ученик разбил её пробелами, дефисами или подчеркнул куски (это разные узлы).
  function textIndex(root) {
    const nodes = [], starts = [];
    let text = '';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) { nodes.push(n); starts.push(text.length); text += n.nodeValue; }
    const at = idx => {
      let lo = 0, hi = nodes.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; }
      return { node: nodes[lo], offset: idx - starts[lo] };
    };
    return { text, at, empty: !nodes.length };
  }

  // Диапазон [s, e) в тексте блока; может охватывать несколько узлов
  function rangeBetween(ti, s, e) {
    if (ti.empty || e <= s) return null;
    const a = ti.at(s), b = ti.at(e - 1);
    const r = document.createRange();
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset + 1);
    return r;
  }

  // Цепочки в ответе: целиком — голубым, куски от 8 нуклеотидов — оранжевым
  function answerSeqRanges(root, seqs) {
    const ti = textIndex(root);
    if (ti.empty) return [];
    const st = nucStream(ti.text);
    const out = [];
    const push = (kind, i0, i1) => { // i0..i1 — индексы в потоке, включительно
      const r = rangeBetween(ti, st.pos[i0], st.pos[i1] + 1);
      if (r) out.push({ kind, r });
    };
    seqs.forEach(q => {
      if (q.full) {
        let i = st.norm.indexOf(q.seq);
        while (i !== -1) { push('seq', i, i + q.seq.length - 1); i = st.norm.indexOf(q.seq, i + q.seq.length); }
      } else if (q.cov > 0) {
        commonRuns(q.seq, st.norm, SEQ_MIN).forEach(r => push('seq-part', r.aEnd - r.len, r.aEnd - 1));
      }
    });
    return out;
  }

  // Цепочки в самом ключе: найденные целиком — голубым, частично — оранжевым, ненайденные не трогаем
  function keySeqRanges(root, seqs) {
    const ti = textIndex(root);
    if (ti.empty) return [];
    const by = new Map(seqs.map(q => [q.seq, q]));
    const out = [];
    keySeqs(ti.text).forEach(k => {
      const q = by.get(k.seq);
      if (!q || q.cov <= 0) return;
      const r = rangeBetween(ti, k.s, k.e);
      if (r) out.push({ kind: q.full ? 'seq' : 'seq-part', r });
    });
    return out;
  }

  function applyHighlight(card, p) {
    if (!prefs.hl) {
      if (hlStore.has(card)) { hlStore.delete(card); publishHighlights(); }
      card._nfSig = null;
      return;
    }
    const sig = p.answerBox.textContent + '||' + p.keyBox.textContent + '||' + (p.ans.querySelector('img') ? 1 : 0);
    const cur = hlStore.get(card);
    if (card._nfSig === sig && cur && (!cur.ranges.length || cur.ranges[0].r.startContainer.isConnected)) return;

    const a = analyzeTexts(textOf(p.keyBox), textOf(p.answerBox), p.condBox ? textOf(p.condBox) : '', p.answerBox.textContent);
    card._nfSig = sig;
    if (!a) { hlStore.set(card, { ranges: [] }); return; }

    if (!hlSupported()) {
      hlStore.set(card, { ranges: [] });
      if (!warnedHl) { warnedHl = true; toast('Подсветка слов в этом браузере недоступна, показываю итог по элементам', true); }
      return;
    }
    const found = [...a.info.values()].filter(x => x.found).map(x => x.t);
    const seqs = a.seqs || [];
    const ranges = answerRanges(p.answerBox, found).concat(keyRanges(p.keyBox, a.info),
      answerSeqRanges(p.answerBox, seqs), keySeqRanges(p.keyBox, seqs));
    hlStore.set(card, { ranges });
    publishHighlights();
  }

  // ---------- кнопки ----------
  function viewBtnCss(color, active) {
    return 'padding:10px 18px;border-radius:12px;border:2px solid ' + color + ';background:' + (active ? color : '#fff')
      + ';color:' + (active ? '#fff' : color) + ';font:700 14px sans-serif;cursor:pointer;';
  }

  function addViewRow(card) {
    if (card.querySelector('.nf-view-row')) return;
    const anchor = card.querySelector('.nf-copy-btn');
    if (!anchor || !cardParts(card)) return;

    const row = el('div', 'align-self:flex-start;display:flex;flex-wrap:wrap;gap:8px;align-items:center;');
    row.className = 'nf-view-row';
    const b1 = el('button', viewBtnCss('#1a73e8', false), {
      type: 'button', textContent: '⇄ Ключ рядом', title: 'Ключ слева, ответ ученика справа (на широком экране)'
    });
    b1.className = 'nf-sbs-btn';
    const b2 = el('button', viewBtnCss('#c77700', false), {
      type: 'button', textContent: '🔍 Подсветка совпадений', title: 'Слова из ключа в ответе ученика'
    });
    b2.className = 'nf-hl-btn';
    const b3 = el('button', viewBtnCss('#2e7d6b', false), {
      type: 'button', textContent: '🖼 Вписать картинку',
      title: 'Фото ответа целиком по высоте экрана рядом с ключом. Выключено: фото по ширине колонки (можно прокручивать)'
    });
    b3.className = 'nf-fit-btn';

    b1.addEventListener('click', e => { e.stopPropagation(); prefs.sbs = !prefs.sbs; prefsSave(); refreshView(); });
    b2.addEventListener('click', e => { e.stopPropagation(); prefs.hl = !prefs.hl; prefsSave(); refreshView(); });
    b3.addEventListener('click', e => { e.stopPropagation(); prefs.fit = prefs.fit === false; prefsSave(); refreshView(); });
    row.append(b1, b2, b3);
    anchor.after(row);
  }

  function refreshView() {
    document.querySelectorAll('[data-task-id]').forEach(card => {
      const p = cardParts(card);
      if (!p) return;
      applySbs(p);
      const row = card.querySelector('.nf-view-row');
      if (!row) return;
      row.querySelector('.nf-sbs-btn').style.cssText = viewBtnCss('#1a73e8', !!prefs.sbs);
      row.querySelector('.nf-hl-btn').style.cssText = viewBtnCss('#c77700', !!prefs.hl);
      const fitBtn = row.querySelector('.nf-fit-btn');
      if (fitBtn) { // показываем только когда режим «ключ рядом» включён и в ответе есть картинка
        fitBtn.style.cssText = viewBtnCss('#2e7d6b', prefs.fit !== false)
          + (prefs.sbs && p.ans.querySelector('img') ? '' : 'display:none;');
      }
      applyHighlight(card, p);
    });
  }

  // ======================================================================
  //  ЧАСТЬ 6. Подсчёт проверенных заданий, ответов на сообщения и выплаты
  // ======================================================================

  const STAT_KEY = 'nf_work_stats_v2';
  const SEEN_KEY = 'nf_seen_answers_v1';
  const MSG_KEY = 'nf_msg_base_v1';

  function jsonLoad(key, fallback) {
    try {
      const raw = typeof GM_getValue === 'function' ? GM_getValue(key, null) : localStorage.getItem(key);
      if (!raw) return fallback;
      const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return v && typeof v === 'object' ? v : fallback;
    } catch (e) { console.error('[NF] load', key, e); return fallback; }
  }

  function jsonSave(key, v) {
    try {
      const s = JSON.stringify(v);
      if (typeof GM_setValue === 'function') GM_setValue(key, s);
      else localStorage.setItem(key, s);
      return true;
    } catch (e) { console.error('[NF] save', key, e); return false; }
  }

  // <pure>
  const TIERS = ['low', 'mid', 'high'];
  const TIER_LABEL = { low: '0–3', mid: '4–7', high: '8–10' };
  const DEF_RATES = { regular: [5, 6, 7], neuro: [2, 3, 4], msg: 2, chatMsg: 9, multiplier: 1 };
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

  const pad2 = n => String(n).padStart(2, '0');
  const dayKey = d => { d = d || new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  const monthName = k => MONTHS[Number(k.slice(5, 7)) - 1] + ' ' + k.slice(0, 4);
  function weekStartKey(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // неделя с понедельника
    return dayKey(x);
  }
  function tierOf(st, date) { return st.tiers[date.slice(0, 7)] || 'mid'; } // по умолчанию 4–7: так у большинства
  function recParts(r, st) {
    const i = TIERS.indexOf(tierOf(st, r.date));
    // Умножитель применяется ТОЛЬКО к заданиям (не к сообщениям)
    const mult = (st.rates && st.rates.multiplier >= 1) ? st.rates.multiplier : 1;
    return {
      tasks: ((Number(r.regular) || 0) * st.rates.regular[i] + (Number(r.neuro) || 0) * st.rates.neuro[i]) * mult,
      msgs: (Number(r.msgs) || 0) * st.rates.msg,
      chatMsgs: (Number(r.chatMsgs) || 0) * st.rates.chatMsg
    };
  }
  function recMoney(r, st) { const p = recParts(r, st); return p.tasks + p.msgs + p.chatMsgs; }
  function sumRecords(list, st) {
    return list.reduce((a, r) => {
      const p = recParts(r, st);
      if ((r.kind || 'work') === 'work') a.works += 1;
      a.neuro += Number(r.neuro) || 0;
      a.regular += Number(r.regular) || 0;
      a.msgs += Number(r.msgs) || 0;
      a.chatMsgs += Number(r.chatMsgs) || 0;
      a.moneyTasks += p.tasks;
      a.moneyMsgs += p.msgs;
      a.moneyChatMsgs += p.chatMsgs;
      a.money += p.tasks + p.msgs + p.chatMsgs;
      return a;
    }, { works: 0, neuro: 0, regular: 0, msgs: 0, moneyTasks: 0, moneyMsgs: 0, chatMsgs: 0, moneyChatMsgs: 0, money: 0 });
  }
  function periodStats(records, st, now) {
    now = now || new Date();
    const t = dayKey(now), w = weekStartKey(now), m = t.slice(0, 7);
    return {
      today: sumRecords(records.filter(r => r.date === t), st),
      week: sumRecords(records.filter(r => r.date >= w && r.date <= t), st),
      month: sumRecords(records.filter(r => r.date.slice(0, 7) === m), st),
      all: sumRecords(records, st)
    };
  }
  function parseNum(x) {
    const v = parseFloat(String(x).replace(',', '.'));
    return isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
  }
  // Кто написал сообщение. data-current-user="true" — это ты, но "false" — не обязательно ученик:
  // там бывают и другие методисты. Поэтому смотрим на имя автора.
  function kindOfName(name, mine, studentFull) {
    if (mine) return 'me';
    const n = String(name || '').replace(/\s+/g, ' ').trim();
    if (studentFull && n === studentFull) return 'student';
    if (/^(Методист|Куратор|Администратор|Преподаватель|Модератор)/i.test(n)) return 'staff';
    return 'student';
  }
  // Ответы на сообщения: сколько раз ты написал сразу после сообщения ученика.
  // kinds: 'me' | 'student' | 'staff' в хронологическом порядке.
  function countReplies(kinds) {
    let n = 0, prev = null;
    kinds.forEach(k => { if (prev === 'student' && k === 'me') n++; prev = k; });
    return n;
  }
  // </pure>

  const fmtMoney = n => (Math.round(n * 100) / 100).toLocaleString('ru-RU') + ' ₽';

  function loadStats() {
    let s = jsonLoad(STAT_KEY, null);
    if (!s || Array.isArray(s)) {
      // перенос записей версии 1.12 (там были только задания; считаем их нейропроверкой)
      const old = jsonLoad('nf_work_stats_v1', null);
      s = { records: old && Array.isArray(old.records)
        ? old.records.map(r => ({ kind: 'work', id: r.id, ts: r.ts, date: r.date, hw: r.hw, neuro: Number(r.tasks) || 0, regular: 0 }))
        : [] };
    }
    s.tiers = s.tiers && typeof s.tiers === 'object' ? s.tiers : {};
    s.mode = s.mode === 'regular' ? 'regular' : 'neuro';
    s.taskComments = !!s.taskComments;
    const r = s.rates || {};
    const okList = a => Array.isArray(a) && a.length === 3 && a.every(x => Number(x) >= 0);
    s.rates = {
      regular: okList(r.regular) ? r.regular.map(Number) : DEF_RATES.regular.slice(),
      neuro: okList(r.neuro) ? r.neuro.map(Number) : DEF_RATES.neuro.slice(),
      msg: r.msg === undefined || !(Number(r.msg) >= 0) ? DEF_RATES.msg : Number(r.msg),
      chatMsg: r.chatMsg === undefined || !(Number(r.chatMsg) >= 0) ? DEF_RATES.chatMsg : Number(r.chatMsg),
      multiplier: r.multiplier === undefined || !Number.isFinite(Number(r.multiplier)) ? DEF_RATES.multiplier : Math.min(3, Math.max(1, Math.round(Number(r.multiplier) * 2) / 2))
    };
    s.records = Array.isArray(s.records) ? s.records.filter(x => x && x.date) : [];
    return s;
  }
  const saveStats = o => jsonSave(STAT_KEY, o);

  function loadSeen() {
    const s = jsonLoad(SEEN_KEY, {});
    return Array.isArray(s) ? {} : s;
  }

  // Есть ли у задания ответ ученика: хотя бы один символ, картинка или файл
  function hasStudentAnswer(card) {
    const region = card.querySelector('[role="region"]');
    if (!region) return false;
    const label = [...region.querySelectorAll('span')].find(s => /Ответ ученика/i.test(s.textContent));
    if (!label) return false;
    const box = label.parentElement ? label.parentElement.querySelector(DETAIL) : null;
    if (box) return box.textContent.trim().length > 0 || !!box.querySelector('img,a,video');
    return !!(label.parentElement && label.parentElement.querySelector('img,a,video'));
  }

  // Нейропроверку определяем автоматически по характерному разбору в комментариях задания.
  // Если есть «Разбор по элементам» и строки «Элемент N: верно/неверно» — считаем задание нейропроверкой.
  function hasElementBreakdown(card) {
    const commentBoxes = [...card.querySelectorAll('[id$="-comments"]')];
    return commentBoxes.some(box => {
      const text = String(box.innerText || box.textContent || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\*+/g, '')
        .replace(/\\/g, ' ')
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('ru-RU');
      return /разбор\s+по\s+элементам\s*:/.test(text)
        && /элемент\s+\d+\s*:\s*(?:верно|неверно)(?![а-яё])/.test(text);
    });
  }

  // Запоминаем и наличие ответа, и автоматически определённый тип каждого задания.
  function trackAnswers() {
    const found = [];
    document.querySelectorAll('[data-task-id]').forEach(card => {
      const id = card.getAttribute('data-task-id');
      if (id && hasStudentAnswer(card)) {
        found.push({ id, kind: hasElementBreakdown(card) ? 'neuro' : 'regular' });
      }
    });
    if (!found.length) return;

    const aid = attemptId();
    const db = loadSeen();
    const cur = db[aid] || (db[aid] = { ts: Date.now(), ids: [] });
    cur.ids = Array.isArray(cur.ids) ? cur.ids : [];
    cur.kindById = cur.kindById && typeof cur.kindById === 'object' ? cur.kindById : {};

    let changed = false;
    found.forEach(({ id, kind }) => {
      if (!cur.ids.includes(id)) { cur.ids.push(id); changed = true; }
      if (cur.kindById[id] !== kind) { cur.kindById[id] = kind; changed = true; }
    });
    if (!changed) return;

    cur.ts = Date.now();
    const lim = Date.now() - 30 * 864e5;
    Object.keys(db).forEach(k => { if (!(db[k] && db[k].ts > lim)) delete db[k]; });
    jsonSave(SEEN_KEY, db);
  }

  function toastAction(msg, label, fn) {
    const d = el('div', 'position:fixed;right:20px;bottom:20px;z-index:99999;padding:12px 14px 12px 18px;border-radius:12px;'
      + 'font:600 14px sans-serif;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.25);background:#2e9e5b;display:flex;gap:12px;align-items:center;');
    d.appendChild(el('span', '', { textContent: msg }));
    const b = el('button', 'padding:4px 10px;border-radius:8px;border:1px solid #fff;background:transparent;color:#fff;'
      + 'font:700 13px sans-serif;cursor:pointer;', { type: 'button', textContent: label });
    b.onclick = () => { d.remove(); fn(); };
    d.appendChild(b);
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 9000);
  }

  function removeRecord(rec) {
    const t = loadStats();
    t.records = t.records.filter(r => !(r.id === rec.id && r.ts === rec.ts));
    saveStats(t);
    forceStats();
  }

  // Режим страницы. Если есть кнопка «Завершить проверку», идёт проверка работы.
  // Если кнопки нет, работа уже проверена: платят только за ответы на сообщения.
  function finishButton() {
    return [...document.querySelectorAll('button[aria-haspopup="dialog"]')]
      .find(b => /^Завершить проверку/i.test(b.textContent.trim()) && !b.closest('[role="dialog"],[role="alertdialog"]'));
  }
  function pageMode() {
    if (!document.querySelector('[data-task-id]')) return null;
    return finishButton() ? 'check' : 'checked';
  }

  // ---------- засчитывание заданий ----------
  let pendingFinish = null; // { aid, hw, controls, ts }

  function commitFinish(p) {
    // На момент завершения ещё раз обновляем типы заданий по комментариям.
    trackAnswers();

    const seen = loadSeen()[p.aid] || {};
    const ids = [...new Set(Array.isArray(seen.ids) ? seen.ids : [])];
    const n = ids.length;
    if (!n) { toast('Нет заданий с ответом ученика: в подсчёт не попало', true); return; }

    const kindById = seen.kindById && typeof seen.kindById === 'object' ? seen.kindById : {};
    const kindFor = id => kindById[id] === 'neuro' ? 'neuro' : 'regular';
    const countKinds = (taskIds, kinds) => taskIds.reduce((counts, id) => {
      counts[kinds[id] === 'neuro' ? 'neuro' : 'regular']++;
      return counts;
    }, { neuro: 0, regular: 0 });

    const s = loadStats();
    const i = s.records.findIndex(r => (r.kind || 'work') === 'work' && r.id === p.aid);

    if (i > -1) {
      const r = s.records[i];
      const was = (r.neuro || 0) + (r.regular || 0);

      if (Array.isArray(r.taskIds) && r.taskKinds && typeof r.taskKinds === 'object') {
        const taskIds = [...new Set(r.taskIds.concat(ids))];
        const taskKinds = { ...r.taskKinds };
        ids.forEach(id => { taskKinds[id] = kindFor(id); });
        const counts = countKinds(taskIds, taskKinds);
        const changed = counts.neuro !== (r.neuro || 0)
          || counts.regular !== (r.regular || 0)
          || taskIds.length !== r.taskIds.length;

        r.taskIds = taskIds;
        r.taskKinds = taskKinds;
        r.neuro = counts.neuro;
        r.regular = counts.regular;

        if (changed) {
          saveStats(s);
          toast('Работа обновлена автоматически: ' + counts.neuro + ' нейро, ' + counts.regular + ' обычных');
        } else {
          toast('Эта работа уже учтена (' + was + ' зад.)');
        }
      } else if (n >= was) {
        // Старую запись переводим на новую систему, когда снова видим все задания работы.
        const taskKinds = Object.fromEntries(ids.map(id => [id, kindFor(id)]));
        const counts = countKinds(ids, taskKinds);
        r.taskIds = ids;
        r.taskKinds = taskKinds;
        r.neuro = counts.neuro;
        r.regular = counts.regular;
        saveStats(s);
        toast('Работа пересчитана автоматически: ' + counts.neuro + ' нейро, ' + counts.regular + ' обычных');
      } else {
        toast('Эта работа уже учтена (' + was + ' зад.)');
      }

      forceStats();
      return;
    }

    const taskKinds = Object.fromEntries(ids.map(id => [id, kindFor(id)]));
    const counts = countKinds(ids, taskKinds);
    const rec = {
      kind: 'work', mode: 'check', id: p.aid, date: dayKey(), ts: Date.now(), hw: p.hw.title,
      neuro: counts.neuro, regular: counts.regular, taskIds: ids, taskKinds
    };

    s.records.push(rec);
    saveStats(s);
    forceStats();
    toastAction(
      'Засчитано: ' + n + ' зад. (' + counts.neuro + ' нейро, ' + counts.regular + ' обычных) ≈ ' + fmtMoney(recMoney(rec, s)),
      'Отменить',
      () => removeRecord(rec)
    );
  }

  document.addEventListener('click', e => {
    const btn = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!btn) return;
    const dlg = btn.closest('[role="dialog"],[role="alertdialog"]');

    // 1) нажали «Завершить проверку» на странице: запоминаем, но ещё не засчитываем (может быть «Отмена»)
   if (!dlg && btn.getAttribute('aria-haspopup') === 'dialog' && /^Завершить проверку/i.test(btn.textContent.trim())) {

  trackAnswers();
  pendingFinish = { aid: attemptId(), hw: hwInfo(), controls: btn.getAttribute('aria-controls') || '', ts: Date.now() };
  return;
}
    // 2) нажали кнопку подтверждения в окне именно этой кнопки
    if (pendingFinish && dlg) {
      if (Date.now() - pendingFinish.ts > 10 * 60 * 1000) { pendingFinish = null; return; }
      if (pendingFinish.controls && dlg.id !== pendingFinish.controls) return;
      const label = btn.textContent.trim();
      if (!label || /отмен|назад|закры|нет|вернут|не сейчас|cancel|close/i.test(label)) return;
      const p = pendingFinish;
      pendingFinish = null;
      commitFinish(p);
    }
  }, true);

  // ---------- ответы на сообщения ----------
  // По умолчанию считаем «Диалог с учеником» под домашкой. Комментарии под заданиями — по галочке в панели.
  // Первый раз увидев переписку, запоминаем текущее число ответов как исходное и считаем только новые.
  const msgMem = {}; // id блока переписки -> { T, t }

  function msgKind(m, studentFull) {
    // data-current-user="true" надёжнее всего — это мы (методист)
    const isMine = m.getAttribute('data-current-user') === 'true';
    // Ищем имя автора несколькими способами — структура может меняться
    const nameEl = m.querySelector('span[class*="line-clamp"]')
      || m.querySelector('[class*="name"]')
      || m.querySelector('[class*="author"]')
      || m.querySelector('[class*="sender"]');
    return kindOfName(nameEl ? nameEl.textContent : '', isMine, studentFull);
  }

  function mainChatId() {
    // Основной чат всегда имеет отдельный id в URL: /subject/chat/<chatId>
    const m = location.pathname.match(/^\/[^/]+\/chat\/([^/?#]+)\/?$/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function isGroupChatPage() {
    return !!mainChatId();
  }

  function findMainChatList() {
    if (!isGroupChatPage()) return null;
    // Ищем список сообщений не по первому случайному flex-col-reverse,
    // а через реальный пузырь сообщения основного чата.
    const bubble = document.querySelector('main [data-current-user][data-previous-from-same-user]')
      || document.querySelector('[data-current-user][data-previous-from-same-user]');
    if (!bubble) return null;
    return bubble.closest('.flex.flex-col-reverse');
  }

  function chatReplies(cont, type) {
    if (!cont) return 0;

    // Основной чат: каждое новое сообщение методиста = отдельное chatMsg по ставке 9 ₽.
    if (type === 'chat' || isGroupChatPage()) {
      return cont.querySelectorAll('[data-current-user="true"][data-previous-from-same-user]').length;
    }

    // На странице домашки: старая логика — считаем ответы методиста после сообщений ученика.
    let msgs = [...cont.querySelectorAll('[data-previous-from-same-user][data-current-user]')];
    if (!msgs.length) msgs = [...cont.querySelectorAll('[data-current-user]')];
    if (!msgs.length) return 0;
    let list = msgs;
    try {
      const par = msgs[0].parentElement;
      if (par && getComputedStyle(par).flexDirection === 'column-reverse') list = msgs.slice().reverse();
    } catch (e) { /* оставляем порядок как есть */ }
    const st = getStudentName();
    const full = st ? st.full : '';
    return countReplies(list.map(m => msgKind(m, full)));
  }

  function scanMessages() {
    const settings = loadStats();
    const sources = [];

    // Диалог под домашкой — обычные сообщения по ставке msg (2 ₽).
    document.querySelectorAll('[id$="-dialogue"]').forEach(cont => {
      if (!cont.id) return;
      sources.push({ el: cont, key: cont.id, type: 'homework', src: 'dialogue' });
    });

    // Комментарии под заданиями — только если включены в настройках.
    if (settings.taskComments) {
      document.querySelectorAll('[id$="-comments"]').forEach(cont => {
        if (!cont.id) return;
        sources.push({ el: cont, key: cont.id, type: 'task', src: 'task' });
      });
    }

    // Основной чат. Ключ содержит id конкретного чата, поэтому переход между чатами
    // больше не сравнивает один диалог с другим.
    const chatId = mainChatId();
    const chatList = findMainChatList();
    if (chatId && chatList) {
      // основной чат считается по отправкам (installMainChatObserver), а не по DOM
    }

    if (!sources.length) return;

    const db = jsonLoad(MSG_KEY, {});
    let changed = false;
    const added = [];

    sources.forEach(source => {
      const key = source.key;
      const T = chatReplies(source.el, source.type);
      let base = db[key];

      // Совместимость со старым ключом домашки из версии 1.13.
      if (base === undefined && source.type !== 'chat') {
        const legacy = (key.match(/^attempt-(\d+)-dialogue$/) || [])[1];
        if (legacy && db[legacy]) {
          db[key] = db[legacy];
          base = db[key];
          changed = true;
        }
      }

      if (base === undefined) {
        // При первом открытии ждём, пока история диалога догрузится,
        // после чего фиксируем её как исходную и не начисляем деньги за старые сообщения.
        const m = msgMem[key] || (msgMem[key] = { T, t: Date.now() });
        if (m.T !== T) {
          m.T = T;
          m.t = Date.now();
          return;
        }
        if (Date.now() - m.t < 2500) return;
        db[key] = { n: T, ts: Date.now() };
        changed = true;
        return;
      }

      if (T === base.n) return;

      // При ререндере/неполной загрузке число может временно уменьшиться.
      // Просто синхронизируем базу, ничего не списывая и не начисляя.
      if (T < base.n) {
        base.n = T;
        base.ts = Date.now();
        changed = true;
        return;
      }

      added.push({ key, delta: T - base.n, type: source.type, src: source.src });
      base.n = T;
      base.ts = Date.now();
      changed = true;
    });

    if (changed) {
      const lim = Date.now() - 60 * 864e5;
      Object.keys(db).forEach(k => { if (!(db[k] && db[k].ts > lim)) delete db[k]; });
      jsonSave(MSG_KEY, db);
    }

    if (!added.length) return;

    const s = loadStats();
    const mode = pageMode() || 'checked';
    const recs = [];

    added.forEach(a => {
      if (a.type === 'chat') {
        recs.push({
          kind: 'chat_msg',
          mode: 'chat',
          src: 'main-chat',
          id: 'chat-dom:' + a.key + ':' + Date.now() + ':' + Math.random().toString(36).slice(2),
          date: dayKey(),
          ts: Date.now(),
          hw: '(основной чат)',
          chatMsgs: a.delta
        });
      } else {
        recs.push({
          kind: 'msg',
          mode,
          src: a.src,
          id: 'm:' + a.key + ':' + Date.now() + ':' + Math.random().toString(36).slice(2),
          date: dayKey(),
          ts: Date.now(),
          hw: hwInfo().title,
          msgs: a.delta
        });
      }
    });

    recs.forEach(r => s.records.push(r));
    saveStats(s);
    forceStats();

    const chatCount = recs.reduce((n, r) => n + (Number(r.chatMsgs) || 0), 0);
    const homeworkCount = recs.reduce((n, r) => n + (Number(r.msgs) || 0), 0);

    if (chatCount > 0) {
      toastAction(
        'Сообщение в основном чате учтено: +' + fmtMoney(chatCount * s.rates.chatMsg),
        'Отменить',
        () => recs.filter(r => r.chatMsgs).forEach(removeRecord)
      );
    }

    if (homeworkCount > 0) {
      toastAction(
        'Ответ на сообщение учтён: +' + fmtMoney(homeworkCount * s.rates.msg),
        'Отменить',
        () => recs.filter(r => r.msgs).forEach(removeRecord)
      );
    }
  }

  // ---------- читаемость статистики в светлой/Pink и Halloween темах ----------
  (function addStatsThemeCompatibilityStyles() {
    if (document.getElementById('nf-stats-theme-compat')) return;
    const st = document.createElement('style');
    st.id = 'nf-stats-theme-compat';
    st.textContent = `
      /* Светлая / Pink Pick Me: сохраняем светлые карточки и тёмный читаемый текст. */
      html:not([data-nf-theme="halloween"]) .nf-stats-widget .nf-stats-summary-card {
        background:#fff8e7 !important;color:#5f4a20 !important;-webkit-text-fill-color:#5f4a20 !important;
      }
      html:not([data-nf-theme="halloween"]) .nf-stats-widget .nf-stats-mode-card {
        color:#333 !important;-webkit-text-fill-color:#333 !important;
      }
      html:not([data-nf-theme="halloween"]) .nf-stats-widget .nf-stats-auto-card {
        background:#f3f7ff !important;color:#35506f !important;-webkit-text-fill-color:#35506f !important;
      }
      html:not([data-nf-theme="halloween"]) .nf-stats-widget .nf-stats-factor-box {
        background:#fafdfb !important;border-color:#e6eee9 !important;color:#333 !important;
      }
      html:not([data-nf-theme="halloween"]) .nf-stats-widget .nf-stats-factor-top {
        color:#333 !important;-webkit-text-fill-color:#333 !important;
      }
      html:not([data-nf-theme="halloween"]) .nf-stats-widget .nf-stats-factor-out {
        color:#2e7d6b !important;-webkit-text-fill-color:#2e7d6b !important;
      }
      html:not([data-nf-theme="halloween"]) .nf-stats-widget .nf-stats-factor-ticks,
      html:not([data-nf-theme="halloween"]) .nf-stats-widget .nf-stats-factor-ticks span {
        color:#777 !important;-webkit-text-fill-color:#777 !important;
      }

      /* Halloween: светлые inline-карточки NeoCheck превращаем в тёмные поверхности. */
      html[data-nf-theme="halloween"] .nf-stats-widget .nf-stats-summary-card {
        background:#3b2d42 !important;color:#ffe8bf !important;-webkit-text-fill-color:#ffe8bf !important;
        border:1px solid #76566f !important;
      }
      html[data-nf-theme="halloween"] .nf-stats-widget .nf-stats-mode-card {
        background:#382c41 !important;color:#f5eaf4 !important;-webkit-text-fill-color:#f5eaf4 !important;
        border:1px solid #71536b !important;
      }
      html[data-nf-theme="halloween"] .nf-stats-widget .nf-stats-auto-card {
        background:#382d46 !important;color:#f1e6ff !important;-webkit-text-fill-color:#f1e6ff !important;
        border:1px solid #735f91 !important;
      }
      html[data-nf-theme="halloween"] .nf-stats-widget .nf-stats-factor-box {
        background:#281f31 !important;border-color:#73556d !important;color:#f7edf6 !important;
      }
      html[data-nf-theme="halloween"] .nf-stats-widget .nf-stats-factor-top,
      html[data-nf-theme="halloween"] .nf-stats-widget .nf-stats-factor-top span {
        color:#f7edf6 !important;-webkit-text-fill-color:#f7edf6 !important;
      }
      html[data-nf-theme="halloween"] .nf-stats-widget .nf-stats-factor-out {
        color:#7fd8bd !important;-webkit-text-fill-color:#7fd8bd !important;
      }
      html[data-nf-theme="halloween"] .nf-stats-widget .nf-stats-factor-ticks,
      html[data-nf-theme="halloween"] .nf-stats-widget .nf-stats-factor-ticks span {
        color:#d4c5d7 !important;-webkit-text-fill-color:#d4c5d7 !important;
      }
      html[data-nf-theme="halloween"] .nf-stats-widget input[type="range"] {
        background:transparent !important;accent-color:#4ba38a !important;
      }
      html[data-nf-theme="halloween"] .nf-stats-widget select,
      html[data-nf-theme="halloween"] .nf-stats-widget select option {
        background:#291f31 !important;color:#fff3fa !important;-webkit-text-fill-color:#fff3fa !important;color-scheme:dark !important;
      }

      /* Кнопки NeoCheck внутри карточки домашки: светлая и Halloween темы. */
      html:not([data-nf-theme="halloween"]) .nf-copy-btn {
        background:#fff !important;color:#6b5cff !important;border-color:#6b5cff !important;
        -webkit-text-fill-color:#6b5cff !important;
      }
      html:not([data-nf-theme="halloween"]) .nf-reg-quick > button {
        background:#f5f1fe !important;color:#3f326a !important;border-color:#b5a2dc !important;
        -webkit-text-fill-color:#3f326a !important;
      }
      html:not([data-nf-theme="halloween"]) .nf-reg-quick > div {
        background:#fcfaff !important;color:#302a3e !important;border-color:#ded6ee !important;
      }
      html:not([data-nf-theme="halloween"]) .nf-reg-quick > div :is(strong,li,ol,p,span) {
        color:#302a3e !important;-webkit-text-fill-color:#302a3e !important;
      }

      html[data-nf-theme="halloween"] .nf-copy-btn {
        background:#42304a !important;color:#fff0fa !important;border-color:#8b6684 !important;
        -webkit-text-fill-color:#fff0fa !important;box-shadow:0 3px 12px rgba(9,5,15,.14) !important;
      }
      html[data-nf-theme="halloween"] .nf-copy-btn:hover {
        background:#5d4058 !important;border-color:#ffad77 !important;
      }
      html[data-nf-theme="halloween"] .nf-reg-quick > button {
        background:#44304d !important;color:#fff0f7 !important;border-color:#896780 !important;
        -webkit-text-fill-color:#fff0f7 !important;box-shadow:0 3px 12px rgba(9,5,15,.12) !important;
      }
      html[data-nf-theme="halloween"] .nf-reg-quick > button:hover {
        background:#60415b !important;border-color:#ffad77 !important;
      }
      html[data-nf-theme="halloween"] .nf-reg-quick > div {
        background:#302539 !important;color:#f7edf6 !important;border-color:#76576d !important;
        box-shadow:0 5px 16px rgba(8,5,14,.16) !important;
      }
      html[data-nf-theme="halloween"] .nf-reg-quick > div :is(strong,li,ol,p,span) {
        color:#f7edf6 !important;-webkit-text-fill-color:#f7edf6 !important;
      }
      html[data-nf-theme="halloween"] .nf-reg-quick > div > button {
        color:#ffbd87 !important;-webkit-text-fill-color:#ffbd87 !important;
      }

      /* Верхняя кнопка «Регламент» на странице домашних работ. */
      html[data-nf-theme="halloween"] #nf-reg-top-button {
        background:#382a42 !important;
        color:#f7edf6 !important;
        -webkit-text-fill-color:#f7edf6 !important;
        border:1px solid #76566f !important;
        box-shadow:0 4px 14px rgba(0,0,0,.18) !important;
      }
      html[data-nf-theme="halloween"] #nf-reg-top-button:hover {
        background:#4b3550 !important;
        border-color:#9b6a86 !important;
        box-shadow:0 5px 16px rgba(0,0,0,.24) !important;
      }
      html:not([data-nf-theme="halloween"]) #nf-reg-top-button {
        background:#e9e4f4 !important;
        color:#302a3e !important;
        -webkit-text-fill-color:#302a3e !important;
      }
    `;
    (document.head || document.documentElement).appendChild(st);
  })();

  // ---------- панель ----------
  let statsWidget = null;

  function forceStats() { if (statsWidget) statsWidget._sig = null; renderStats(); }

  function downloadCsv(st) {
    const q = v => '"' + String(v).replace(/"/g, '""') + '"';
    const num = v => String(v).replace('.', ',');
    const page = r => r.mode === 'check' ? 'на проверке' : r.mode === 'checked' ? 'уже проверена' : '';
    const rows = st.records.slice().sort((a, b) => a.ts - b.ts).map(r => [
      r.date, r.kind === 'chat_msg' ? 'сообщение основного чата' : (r.kind || 'work') === 'msg' ? 'сообщение домашки' : 'работа', page(r), q(r.hw || ''),
      r.neuro || 0, r.regular || 0, r.msgs || 0, r.chatMsgs || 0, TIER_LABEL[tierOf(st, r.date)], num(recMoney(r, st).toFixed(2))
    ].join(';'));
    const text = '\uFEFF' + ['Дата;Тип;Страница;Домашка;Нейро-заданий;Обычных заданий;Ответов под домашками;Сообщений в чатах;Оценка месяца;Сумма']
      .concat(rows).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = 'proverki_' + dayKey() + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function chipBtn(text, on, color, title) {
    return el('button', 'padding:6px 12px;border-radius:999px;border:1px solid ' + color + ';font:700 13px sans-serif;cursor:pointer;'
      + 'background:' + (on ? color : '#fff') + ';color:' + (on ? '#fff' : color) + ';', { type: 'button', textContent: text, title: title || '' });
  }

  const STATS_EXPANDED_KEY = 'nf_stats_widget_expanded_v1';

  function loadStatsExpanded() {
    try {
      const raw = typeof GM_getValue === 'function' ? GM_getValue(STATS_EXPANDED_KEY, false) : localStorage.getItem(STATS_EXPANDED_KEY);
      if (typeof raw === 'boolean') return raw;
      if (raw == null) return false;
      return raw === 'true' || raw === '1';
    } catch (e) { return false; }
  }

  function saveStatsExpanded(v) {
    try {
      if (typeof GM_setValue === 'function') GM_setValue(STATS_EXPANDED_KEY, !!v);
      else localStorage.setItem(STATS_EXPANDED_KEY, String(!!v));
    } catch (e) { console.error('[NF stats] expanded save', e); }
  }

  // Меняем компактный/полный вид, сохраняя ближайший край панели на месте.
  // Поэтому справа-снизу раскрытие идёт влево/вверх, а не "прыгает" по экрану.
  function setStatsExpanded(w, next) {
    if (!w) return;
    const r = w.getBoundingClientRect();
    const keepRight = r.left + r.width / 2 > innerWidth / 2;
    const keepBottom = r.top + r.height / 2 > innerHeight / 2;
    const edgeX = keepRight ? innerWidth - r.right : r.left;
    const edgeY = keepBottom ? innerHeight - r.bottom : r.top;

    w._expanded = !!next;
    saveStatsExpanded(w._expanded);
    w._sig = null;
    renderStats();

    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!w.isConnected) return;
      let left = keepRight ? innerWidth - edgeX - w.offsetWidth : edgeX;
      let top = keepBottom ? innerHeight - edgeY - w.offsetHeight : edgeY;
      const p = clampStatsWidget(w, left, top);
      w.style.left = p.left + 'px';
      w.style.top = p.top + 'px';
      w.style.right = 'auto';
      w.style.bottom = 'auto';
      saveStatsPos(p.left, p.top, w);
    }));
  }

  // Ручная поправка числа сообщений основного чата за выбранный день
  function fixChatDay() {
    const s = loadStats();
    const date = prompt('За какую дату поправить (ГГГГ-ММ-ДД)?', dayKey());
    if (!date) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) { toast('Нужен формат ГГГГ-ММ-ДД', true); return; }
    const d = date.trim();
    const cur = s.records.filter(r => r.date === d && r.chatMsgs).reduce((n, r) => n + (Number(r.chatMsgs) || 0), 0);
    const ans = prompt('Сколько сообщений в чате было на самом деле? Сейчас в учёте: ' + cur, String(cur));
    if (ans === null) return;
    const n = parseInt(ans, 10);
    if (!(n >= 0)) { toast('Нужно число', true); return; }
    s.records = s.records.filter(r => !(r.date === d && r.chatMsgs));
    if (n > 0) s.records.push({ kind: 'chat_msg', id: 'manual-chat:' + d + ':' + Date.now(),
      date: d, ts: Date.now(), hw: '(основной чат, вручную)', chatMsgs: n });
    saveStats(s);
    forceStats();
    toast('Чат за ' + d + ': ' + n + ' сообщ.');
  }

  function renderStats() {
    const w = statsWidget;
    if (!w) return;
    const s = loadStats();
    const cur = ((loadSeen()[attemptId()] || {}).ids || []).length;
    if (!w._month) w._month = dayKey().slice(0, 7);
    const sig = JSON.stringify([s, cur, dayKey(), w._month, pageMode()]);
    if (w._sig === sig) return;
    w._sig = sig;
    const P = periodStats(s.records, s);
    w.innerHTML = '';

    const tasksToday = P.today.neuro + P.today.regular;

    // Компактный режим по умолчанию: одна строка с главными счётчиками.
    if (!w._expanded) {
      w.style.width = 'auto';
      w.style.minWidth = '0';
      w.style.maxWidth = 'calc(100vw - 16px)';
      w.style.height = 'auto';
      w.style.padding = '0';
      w.style.overflow = 'visible';

      const compact = el('div', 'display:flex;align-items:center;gap:7px;padding:9px 11px;cursor:grab;user-select:none;white-space:nowrap;');
      compact.title = 'Перетащи в удобное место. Клик — открыть полную статистику';
      compact.appendChild(el('span', 'font:800 14px sans-serif;line-height:1;', { textContent: '📊' }));
      compact.appendChild(el('span', 'font:800 12px sans-serif;color:#2b2b2b;', {
        textContent: tasksToday + ' ДЗ · ' + P.today.msgs + ' ответов · ' + P.today.chatMsgs + ' чат'
      }));
      compact.appendChild(el('span', 'font:900 12px sans-serif;color:#9a7b45;margin-left:2px;', { textContent: '▾' }));
      installStatsDrag(compact, w);
      compact.addEventListener('click', e => {
        if (w._justDragged) return;
        e.stopPropagation();
        setStatsExpanded(w, true);
      });
      w.appendChild(compact);
      return;
    }

    // Полная статистика раскрывается из той же точки и может быть снова свернута.
    w.style.width = 'min(360px, calc(100vw - 16px))';
    w.style.minWidth = '300px';
    w.style.maxWidth = '360px';
    w.style.height = 'auto';
    w.style.padding = '9px 10px';
    w.style.overflow = 'hidden auto';

    const head = el('div', 'display:flex;align-items:center;gap:7px;cursor:grab;user-select:none;min-height:30px;');
    head.title = 'Зажми эту строку и перетащи статистику в удобное место';
    const headIcon = el('span', 'font:800 16px sans-serif;line-height:1;', { textContent: '📊' });
    const headText = el('span', 'font:800 12px sans-serif;color:#222;flex:1;', {
      textContent: 'Статистика методиста'
    });
    const dragHint = el('span', 'font:700 11px sans-serif;color:#9a7b45;white-space:nowrap;', {
      textContent: '⋮⋮'
    });
    const collapse = el('button', 'width:26px;height:26px;padding:0;border:1px solid #ead4a4;border-radius:8px;background:#fffaf0;color:#7b5c24;font:900 14px sans-serif;cursor:pointer;', {
      type: 'button', textContent: '▴', title: 'Свернуть статистику'
    });
    collapse.onclick = e => { e.stopPropagation(); setStatsExpanded(w, false); };
    head.append(headIcon, headText, dragHint, collapse);
    installStatsDrag(head, w);
    w.appendChild(head);

    {
      const summaryCard = el('div', 'padding:7px 8px;border-radius:9px;background:#fff8e7;font:700 12px sans-serif;color:#5f4a20;', {
        textContent: 'Сегодня: ' + tasksToday + ' ДЗ · ' + P.today.msgs + ' ответов · ' + P.today.chatMsgs + ' чат · ' + fmtMoney(P.today.money)
      });
      summaryCard.className = 'nf-stats-summary-card';
      w.appendChild(summaryCard);
    }

    const pm = pageMode();
    if (pm) {
      const modeCard = el('div', 'padding:6px 8px;border-radius:8px;font:12px sans-serif;color:#333;background:'
        + (pm === 'check' ? '#e6f6ec' : '#eef3ff') + ';', {
        textContent: pm === 'check'
          ? '🟢 Идёт проверка (есть кнопка «Завершить проверку»). Засчитаются задания с ответом ученика: '
            + cur + ' (тип каждого определяется автоматически) и ответы на сообщения.'
          : '💬 Работа уже проверена (кнопки «Завершить проверку» нет). Задания не считаются, '
            + 'только ответы на сообщения: по ' + s.rates.msg + ' ₽.'
      });
      modeCard.className = 'nf-stats-mode-card';
      w.appendChild(modeCard);
    }

    // оценка месяца
    const months = [...new Set(s.records.map(r => r.date.slice(0, 7)).concat(dayKey().slice(0, 7)))].sort().reverse();
    if (!months.includes(w._month)) months.unshift(w._month);
    const mrow = el('div', 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:4px;');
    mrow.appendChild(el('span', 'font:700 12px sans-serif;color:#777;', { textContent: 'Оценка старшего методиста за' }));
    const sel = el('select', 'padding:4px 6px;border-radius:8px;border:1px solid #ccc;font:600 12px sans-serif;background:#fff;color:#222;');
    months.forEach(k => sel.appendChild(el('option', '', { value: k, textContent: monthName(k), selected: k === w._month })));
    sel.onchange = () => { w._month = sel.value; renderStats(); };
    mrow.appendChild(sel);
    w.appendChild(mrow);

    const tier = s.tiers[w._month] || 'mid';
    const trow = el('div', 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;');
    TIERS.forEach(t => {
      const b = chipBtn(TIER_LABEL[t], t === tier, '#c77700', 'Оценка за этот месяц: суммы за него пересчитаются');
      b.onclick = () => { const x = loadStats(); x.tiers[w._month] = t; saveStats(x); forceStats(); };
      trow.appendChild(b);
    });
    const gear = el('button', MINI, { type: 'button', textContent: '⚙ Ставки', title: 'Изменить ставки' });
    gear.onclick = () => {
      const x = loadStats();
      const ans = prompt(
        'Ставки (4 поля через ; ):\n1) обычные по оценкам 0-3/4-7/8-10\n2) нейро по оценкам\n3) ответ под ДЗ\n4) сообщение в чате\n\nПример: 5,6,7; 2,3,4; 2; 9',
        x.rates.regular.join(',') + '; ' + x.rates.neuro.join(',') + '; ' + x.rates.msg + '; ' + x.rates.chatMsg
      );
      if (ans === null) return;
      const parts = ans.split(';').map(z => z.trim());
      const list = z => (z || '').split(/[,\s]+/).filter(Boolean).map(parseNum);
      const reg = list(parts[0]), neu = list(parts[1]), msg = parseNum(parts[2]), chatMsg = parseNum(parts[3]);
      if (reg.length !== 3 || neu.length !== 3 || reg.includes(null) || neu.includes(null) || msg === null || chatMsg === null) {
        toast('Нужно 4 поля: обычные(3 числа); нейро(3 числа); ДЗ; чат', true);
        return;
      }
      x.rates = { regular: reg, neuro: neu, msg, chatMsg, multiplier: x.rates.multiplier || 1 };
      saveStats(x);
      forceStats();
    };
    const resetRates = el('button', MINI, { type: 'button', textContent: '↺ Сбросить ставки', title: 'Вернуть ставки по умолчанию: обычные 5/6/7, нейро 2/3/4, ДЗ 2, чат 9' });
    resetRates.onclick = () => {
      if (!confirm('Сбросить ставки на стандартные?\nОбычные: 5,6,7 ₽\nНейро: 2,3,4 ₽\nДЗ: 2 ₽\nЧат: 9 ₽')) return;
      const x = loadStats();
      x.rates = { regular: DEF_RATES.regular.slice(), neuro: DEF_RATES.neuro.slice(), msg: DEF_RATES.msg, chatMsg: DEF_RATES.chatMsg, multiplier: x.rates.multiplier || 1 };
      saveStats(x);
      forceStats();
    };
    trow.append(gear, resetRates);
    w.appendChild(trow);
    const i = TIERS.indexOf(tier);
    w.appendChild(el('div', 'font:12px sans-serif;color:#555;', {
      textContent: 'Сейчас: обычное ' + s.rates.regular[i] + ' ₽ · нейро ' + s.rates.neuro[i] + ' ₽ · ДЗ ' + s.rates.msg + ' ₽ · чат ' + s.rates.chatMsg + ' ₽'
        + (s.tiers[w._month] ? '' : ' (по умолчанию 4–7, пока оценки нет)')
    }));

    // Тип каждого задания определяется автоматически по комментариям.
    const autoCard = el('div', 'padding:7px 8px;border-radius:9px;background:#f3f7ff;font:12px sans-serif;color:#35506f;', {
      textContent: '✨ Тип проверки определяется автоматически: с «Разбором по элементам» — нейро, без него — обычная.'
    });
    autoCard.className = 'nf-stats-auto-card';
    w.appendChild(autoCard);

    // Коэффициент применяется только к заданиям. Ответы ДЗ (2 ₽) и чат (9 ₽) не умножаются.
    w.appendChild(el('div', 'font:700 12px sans-serif;color:#777;margin-top:4px;', { textContent: 'Коэффициент заданий:' }));
    const factorBox = el('div', 'display:flex;flex-direction:column;gap:4px;padding:8px 9px;border:1px solid #e6eee9;border-radius:10px;background:#fafdfb;');
    factorBox.className = 'nf-stats-factor-box';
    const factorTop = el('div', 'display:flex;justify-content:space-between;align-items:center;font:12px sans-serif;color:#333;');
    factorTop.className = 'nf-stats-factor-top';
    factorTop.appendChild(el('span', 'font-weight:600;', { textContent: 'Выплата за задания' }));
    const factorOut = el('span', 'font:800 12px sans-serif;color:#2e7d6b;', { textContent: '×' + s.rates.multiplier });
    factorOut.className = 'nf-stats-factor-out';
    factorTop.appendChild(factorOut);

    const slider = el('input', 'width:100%;height:18px;margin:0;accent-color:#2e7d6b;cursor:pointer;', {
      type: 'range', min: '1', max: '3', step: '0.5', value: String(s.rates.multiplier),
      title: 'Коэффициент заданий от 1× до 3×, шаг 0,5×'
    });
    slider.setAttribute('aria-label', 'Коэффициент заданий');
    slider.oninput = () => { factorOut.textContent = '×' + Number(slider.value).toLocaleString('ru-RU', { maximumFractionDigits: 1 }); };
    slider.onchange = () => {
      const x = loadStats();
      x.rates.multiplier = Number(slider.value);
      saveStats(x);
      forceStats();
    };

    const ticks = el('div', 'display:flex;justify-content:space-between;font:10px sans-serif;color:#888;');
    ticks.className = 'nf-stats-factor-ticks';
    [1, 1.5, 2, 2.5, 3].forEach(v => ticks.appendChild(el('span', '', {
      textContent: '×' + v.toLocaleString('ru-RU', { maximumFractionDigits: 1 })
    })));
    factorBox.append(factorTop, slider, ticks);
    w.appendChild(factorBox);

    // периоды
    const line = (name, x) => {
      const d = el('div', 'font:13px sans-serif;color:#333;');
      d.appendChild(el('div', 'font-weight:700;', { textContent: name + ': ' + fmtMoney(x.money) }));
      d.appendChild(el('div', 'font-size:12px;color:#666;', {
        textContent: 'задания ' + (x.neuro + x.regular) + ' (🤖' + x.neuro + ' ✍' + x.regular + ') = ' + fmtMoney(x.moneyTasks)
          + ' · ответы ДЗ ' + x.msgs + ' = ' + fmtMoney(x.moneyMsgs)
          + ' · сообщения чатов ' + x.chatMsgs + ' = ' + fmtMoney(x.moneyChatMsgs) + ' · работ ' + x.works
      }));
      return d;
    };
    const per = el('div', 'display:flex;flex-direction:column;gap:4px;margin-top:4px;');
    per.append(line('Сегодня', P.today), line('Неделя', P.week), line('Месяц', P.month), line('Всего', P.all));
    w.appendChild(per);

    // записи за сегодня
    const todayRecs = s.records.filter(r => r.date === dayKey()).sort((a, b) => a.ts - b.ts);
    const works = todayRecs.filter(r => (r.kind || 'work') === 'work');
    if (works.length) {
      w.appendChild(el('div', 'font:700 12px sans-serif;color:#777;margin-top:4px;', { textContent: 'Сегодня засчитано:' }));
      works.forEach(r => {
        const row = el('div', 'display:flex;gap:6px;align-items:center;justify-content:space-between;font:12px sans-serif;color:#333;');
        const title = r.hw || 'Без названия';
        row.appendChild(el('span', 'max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', {
          textContent: '🤖' + (r.neuro || 0) + ' ✍' + (r.regular || 0) + ' · ' + fmtMoney(recMoney(r, s)) + ' · ' + title, title
        }));
        const ed = el('button', MINI, { type: 'button', textContent: '✎', title: 'Изменить число заданий' });
        ed.onclick = () => {
          const ans = prompt('Заданий с нейропроверкой и обычных через пробел, например: 12 0', (r.neuro || 0) + ' ' + (r.regular || 0));
          if (ans === null) return;
          const [a, b] = ans.trim().split(/\s+/);
          const n1 = parseInt(a, 10), n2 = parseInt(b === undefined ? '0' : b, 10);
          if (!(n1 >= 0) || !(n2 >= 0)) { toast('Нужно два числа', true); return; }
          const t = loadStats();
          const x = t.records.find(z => z.id === r.id && z.ts === r.ts);
          if (x) { x.neuro = n1; x.regular = n2; saveStats(t); forceStats(); }
        };
        const del = el('button', MINI, { type: 'button', textContent: '✕', title: 'Убрать из подсчёта' });
        del.onclick = () => { if (confirm('Убрать эту работу из подсчёта?')) removeRecord(r); };
        row.append(ed, del);
        w.appendChild(row);
      });
    }

    // сообщения: считаются сами, плюс ручная поправка
    const mrow2 = el('div', 'display:flex;gap:6px;align-items:center;justify-content:space-between;font:12px sans-serif;color:#333;margin-top:4px;');
    mrow2.appendChild(el('span', '', {
      textContent: '💬 Ответов на сообщения сегодня: ' + P.today.msgs + ' · ' + fmtMoney(P.today.msgs * s.rates.msg)
    }));
    const minus = el('button', MINI, { type: 'button', textContent: '−', title: 'Убрать один ответ (если посчитался лишний)' });
    minus.onclick = () => {
      const t = loadStats();
      const last = t.records.filter(r => r.date === dayKey() && r.kind === 'msg').sort((a, b) => b.ts - a.ts)[0];
      if (!last) return;
      if ((last.msgs || 1) > 1) last.msgs -= 1;
      else t.records = t.records.filter(r => r !== last && !(r.id === last.id && r.ts === last.ts));
      saveStats(t);
      forceStats();
    };
    const plus = el('button', MINI, { type: 'button', textContent: '＋', title: 'Добавить ответ вручную (если не посчитался)' });
    plus.onclick = () => {
      const t = loadStats();
      t.records.push({ kind: 'msg', id: 'manual', date: dayKey(), ts: Date.now(), hw: '(вручную)', msgs: 1 });
      saveStats(t);
      forceStats();
    };
    mrow2.append(minus, plus);
    w.appendChild(mrow2);

    const fixBtn = el('button', MINI + 'text-align:left;margin-top:4px;', {
      type: 'button', textContent: '🛠 Поправить чат за день',
      title: 'Вручную выставить число сообщений основного чата за выбранную дату'
    });
    fixBtn.onclick = fixChatDay;
    w.appendChild(fixBtn);

    const csv = el('button', MINI + 'text-align:left;margin-top:4px;', { type: 'button', textContent: '⬇ Выгрузить всё в таблицу (CSV)' });
    csv.onclick = () => {
      const st = loadStats();
      if (!st.records.length) { toast('Пока нечего выгружать', true); return; }
      downloadCsv(st);
    };
    w.appendChild(csv);

    // Позицию здесь не пересчитываем: при обновлении содержимого панель остаётся
    // ровно там, куда её поставил методист. Перепривязка нужна только при resize.
  }

  const STATS_POS_KEY = 'nf_stats_widget_position_v1';

  function loadStatsPos() {
    try {
      const raw = typeof GM_getValue === 'function' ? GM_getValue(STATS_POS_KEY, null) : localStorage.getItem(STATS_POS_KEY);
      if (!raw) return null;
      const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!v || typeof v !== 'object') return null;
      if (Number.isFinite(v.x) && Number.isFinite(v.y)) return v;
      // Совместимость с положением, сохранённым в v1.45.
      if (Number.isFinite(v.left) && Number.isFinite(v.top)) return v;
      return null;
    } catch (e) { return null; }
  }

  function saveStatsPos(left, top, w) {
    w = w || statsWidget;
    const width = Math.max(1, w?.offsetWidth || 360);
    const height = Math.max(1, w?.offsetHeight || 100);
    const maxX = Math.max(1, innerWidth - width);
    const maxY = Math.max(1, innerHeight - height);
    // Храним относительное положение. Поэтому «справа снизу» останется
    // справа снизу даже после перезапуска браузера или изменения окна.
    const v = {
      x: Math.min(1, Math.max(0, left / maxX)),
      y: Math.min(1, Math.max(0, top / maxY)),
      left: Math.round(left),
      top: Math.round(top)
    };
    try {
      if (typeof GM_setValue === 'function') GM_setValue(STATS_POS_KEY, v);
      else localStorage.setItem(STATS_POS_KEY, JSON.stringify(v));
    } catch (e) { console.error('[NF stats] position save', e); }
  }

  function clampStatsWidget(w, left, top) {
    const pad = 8;
    const width = Math.max(48, w.offsetWidth || 48);
    const height = Math.max(48, w.offsetHeight || 48);
    return {
      left: Math.min(Math.max(pad, left), Math.max(pad, innerWidth - width - pad)),
      top: Math.min(Math.max(pad, top), Math.max(pad, innerHeight - height - pad))
    };
  }

  function applyStatsPos(w) {
    const pos = loadStatsPos();
    requestAnimationFrame(() => {
      if (!w.isConnected) return;
      let left, top;
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
        const maxX = Math.max(0, innerWidth - w.offsetWidth);
        const maxY = Math.max(0, innerHeight - w.offsetHeight);
        left = pos.x * maxX;
        top = pos.y * maxY;
      } else if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
        left = pos.left;
        top = pos.top;
      } else {
        // Поведение по умолчанию как раньше: слева снизу.
        left = 12;
        top = innerHeight - w.offsetHeight - 12;
      }
      const p = clampStatsWidget(w, left, top);
      w.style.left = p.left + 'px';
      w.style.top = p.top + 'px';
      w.style.right = 'auto';
      w.style.bottom = 'auto';
    });
  }

  function installStatsDrag(handle, w) {
    handle.style.touchAction = 'none';
    handle.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button,select,input,a')) return;
      const r = w.getBoundingClientRect();
      const startX = e.clientX, startY = e.clientY;
      const startLeft = r.left, startTop = r.top;
      let moved = false;
      handle.setPointerCapture?.(e.pointerId);
      handle.style.cursor = 'grabbing';

      const move = ev => {
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
        if (!moved) return;
        const p = clampStatsWidget(w, startLeft + dx, startTop + dy);
        w.style.left = p.left + 'px';
        w.style.top = p.top + 'px';
        w.style.right = 'auto';
        w.style.bottom = 'auto';
      };

      const up = ev => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        handle.releasePointerCapture?.(ev.pointerId);
        handle.style.cursor = 'grab';
        if (moved) {
          const rr = w.getBoundingClientRect();
          saveStatsPos(rr.left, rr.top, w);
          w._justDragged = true;
          setTimeout(() => { if (w) w._justDragged = false; }, 0);
        }
      };

      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }

  function ensureStatsWidget() {
    // Виджет доступен на всех страницах NeoFamily. Его положение сохраняется между перезагрузками.
    if (!statsWidget || !statsWidget.isConnected) {
      statsWidget = el('div', 'position:fixed;left:12px;bottom:12px;z-index:9999;background:#fff;border:1px solid #f0d9a8;'
        + 'border-radius:14px;padding:8px;display:flex;flex-direction:column;gap:6px;box-shadow:0 5px 18px rgba(0,0,0,.16);'
        + 'max-width:360px;max-height:72vh;overflow:hidden auto;box-sizing:border-box;');
      statsWidget.className = 'nf-stats-widget';
      statsWidget._month = dayKey().slice(0, 7);
      statsWidget._expanded = loadStatsExpanded();
      document.body.appendChild(statsWidget);
      applyStatsPos(statsWidget);
    }
    renderStats();
  }

  window.addEventListener('resize', () => {
    if (!statsWidget || !statsWidget.isConnected) return;
    applyStatsPos(statsWidget);
  }, { passive: true });

  // ======================================================================
  //  ЧАСТЬ 7. Поворот изображений на 90° (кнопка ↻ в углу картинки)
  // ======================================================================

  function scanRotate(root) {
    root = root || document;
    if (root instanceof HTMLImageElement) { addRotateControl(root); return; }
    if (root.querySelectorAll) root.querySelectorAll('img').forEach(addRotateControl);
  }

  // ======================================================================
  // ЧАСТЬ 8. Основные чаты: 9 ₽ за КАЖДОЕ успешное сообщение методиста.
  // Наблюдаем за штатными ответами POST /v2/chats/{id}/messages.
  // Ни текст, ни вложения, ни авторизационные заголовки не читаем/не храним.
  // ======================================================================
  const CHAT_SEEN_KEY = 'nf_main_chat_sent_ids_v1';
  const CHAT_EVENT = 'nf-main-chat-send-v1';
  const CHAT_NONCE = 'nf-' + Math.random().toString(36).slice(2) + '-' + Date.now();

  function recordMainChatSent(chatId, messageId, createdAt) {
    if (!chatId || !messageId) return;
    const unique = String(chatId) + ':' + String(messageId);
    const seen = jsonLoad(CHAT_SEEN_KEY, {});
    if (Object.prototype.hasOwnProperty.call(seen, unique)) return;
    const now = Date.now();
    const dt = createdAt && !Number.isNaN(Date.parse(createdAt)) ? new Date(createdAt) : new Date();
    const st = loadStats();
    // Сохраняем ID вместо текста переписки. Статистика не включает сообщения других людей.
    st.records.push({ kind: 'chat_msg', id: 'chat:' + unique, date: dayKey(dt),
      ts: now, hw: '(основной чат)', chatMsgs: 1 });
    if (!saveStats(st)) return;
    seen[unique] = now;
    // Только дедупликация за последние 90 дней, чтобы не разрасталось хранилище.
    const threshold = now - 90 * 864e5;
    for (const key of Object.keys(seen)) if (seen[key] < threshold) delete seen[key];
    jsonSave(CHAT_SEEN_KEY, seen);
    forceStats();
    toast('📨 +1 сообщение основного чата · +' + fmtMoney(st.rates.chatMsg));
  }

  window.addEventListener('message', event => {
    if (event.source !== window || !event.data || event.data.type !== CHAT_EVENT || event.data.nonce !== CHAT_NONCE) return;
    const { chatId, messageId, createdAt } = event.data;
    if (typeof chatId === 'string' && typeof messageId === 'string') recordMainChatSent(chatId, messageId, createdAt);
  });

    function installMainChatObserver() {
    // Считаем именно отправки: перехватываем штатные POST /v2/chats/{id}/messages.
    // Текст сообщений и вложения не читаются и не сохраняются, только id сообщения.
    const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    if (w.__nfChatHook) return;
    w.__nfChatHook = true;
    const re = /\/v2\/chats\/([^/?#]+)\/messages(?:[?#]|$)/;

    function report(url, method, status, raw) {
      if (String(method).toUpperCase() !== 'POST' || status < 200 || status >= 300) return;
      const chatId = (String(url).match(re) || [])[1];
      if (!chatId) return;
      let messageId = null, createdAt = null;
      try {
        const obj = JSON.parse(raw);
        const m = (obj && obj.data) || obj;
        messageId = m && (m.id || m.message_id || m.messageId);
        createdAt = m && (m.created_at || m.createdAt);
      } catch (_) { /* не страшно: возьмём запасной id */ }
      if (messageId == null) messageId = 'ts-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      recordMainChatSent(chatId, String(messageId), typeof createdAt === 'string' ? createdAt : null);
    }

    const origFetch = w.fetch;
    if (typeof origFetch === 'function') {
      w.fetch = function (input, init) {
        const method = (init && init.method) || (input && input.method) || 'GET';
        const url = typeof input === 'string' ? input : (input && input.url);
        const p = origFetch.apply(this, arguments);
        if (url && re.test(url) && String(method).toUpperCase() === 'POST') {
          p.then(r => {
            if (r.ok) r.clone().text().then(t => report(url, method, r.status, t)).catch(() => {});
          }).catch(() => {});
        }
        return p;
      };
    }

    const P = w.XMLHttpRequest && w.XMLHttpRequest.prototype;
    if (P) {
      const open = P.open, send = P.send;
      P.open = function (m, u) { this.__nf = { m: String(m), u: String(u) }; return open.apply(this, arguments); };
      P.send = function () {
        const r = this.__nf;
        if (r && re.test(r.u) && r.m.toUpperCase() === 'POST') {
          this.addEventListener('load', () => {
            try { report(r.u, r.m, this.status, this.responseText); } catch (_) {}
          }, { once: true });
        }
        return send.apply(this, arguments);
      };
    }
  }
  installMainChatObserver();


  // ======================================================================
  //  ЧАСТЬ 9. «Мои смены»: личное недельное расписание (без API-запросов)
  // ======================================================================

  const SHIFT_STORE = 'nf_my_shifts_v1';
  const SHIFT_TIMES = ['До 10:00', '10:00–12:00', '12:00–14:00', '14:00–16:00',
    '16:00–18:00', '18:00–20:00', '20:00–22:00', 'После 22:00'];
  const SHIFT_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const SHIFT_LABEL = { none: '—', hw: 'Домашки', chat: 'Чат' };
  const SHIFT_BG = { none: '#fff', hw: '#e4f5e8', chat: '#eae8ff' };
  const SHIFT_FG = { none: '#72717c', hw: '#276e43', chat: '#5144a5' };
  const SHIFT_WINDOW_STORE = 'nf_my_shift_windows_v1';
  const SHIFT_GOOGLE_STORE = 'nf_google_shifts_v1';
  const SHIFT_OVERRIDE_STORE = 'nf_google_shift_overrides_v1';
  const SHIFT_CLEARED_STORE = 'nf_google_cleared_weeks_v1';
  const SHIFT_SOURCE_STORE = 'nf_shift_source_v1';
  const SHIFT_HISTORY_STORE = 'nf_shift_history_v1';
  const SHIFT_METHODIST_STORE = 'nf_methodist_full_name_v1';
  const SHIFT_GOOGLE_URL = 'https://script.google.com/macros/s/AKfycbxoDoEXXu9e2-J5l00ZJ1Ibc1VhTXGNlBGs69ljlYcprXVCLHrznUpOu8DJh_fzIbot/exec';
  const SHIFT_GOOGLE_KEY = 'NEOCHECK_BIO_2026';
  const SHIFT_GOOGLE_TTL = 5 * 60 * 1000;
  const SHIFT_SLOT_INDEX = { before10:0, '10-12':1, '12-14':2, '14-16':3, '16-18':4, '18-20':5, '20-22':6, after22:7 };
  let shiftWeek = null;
  let shiftActive = false;
  let shiftPanel = null;
  let shiftRoot = null;
  let shiftList = null;
  let shiftOldDisplay = '';

  // Все даты и слоты смен рассчитываем в часовом поясе Москвы, независимо от TZ устройства.
  // Источник текущего момента — часы устройства; при неправильных часах возможна ошибка.
  const SHIFT_TZ = 'Europe/Moscow';
  const shiftFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: SHIFT_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  function shiftMskParts(date = new Date()) {
    const parts = Object.fromEntries(shiftFmt.formatToParts(date)
      .filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
    return parts;
  }
  function shiftDateKey(date = new Date()) {
    const p = shiftMskParts(date);
    return [p.year, String(p.month).padStart(2, '0'), String(p.day).padStart(2, '0')].join('-');
  }
  function shiftParse(k) {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12));
  }
  function shiftAdd(k, n) {
    const d = shiftParse(k);
    d.setUTCDate(d.getUTCDate() + n);
    return [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, '0'),
      String(d.getUTCDate()).padStart(2, '0')].join('-');
  }
  function shiftMonday(date = new Date()) {
    const k = shiftDateKey(date);
    const d = shiftParse(k);
    return shiftAdd(k, -((d.getUTCDay() + 6) % 7));
  }
  function shiftGoogleRead() {
    const x = jsonLoad(SHIFT_GOOGLE_STORE, {});
    return x && !Array.isArray(x) ? x : {};
  }
  function shiftSourceMode() {
    try {
      const v = typeof GM_getValue === 'function' ? GM_getValue(SHIFT_SOURCE_STORE, 'auto') : localStorage.getItem(SHIFT_SOURCE_STORE);
      return v === 'manual' ? 'manual' : 'auto';
    } catch (e) { return 'auto'; }
  }
  function shiftSetSourceMode(v) {
    const next = v === 'manual' ? 'manual' : 'auto';
    try {
      if (typeof GM_setValue === 'function') GM_setValue(SHIFT_SOURCE_STORE, next);
      else localStorage.setItem(SHIFT_SOURCE_STORE, next);
    } catch (e) {}
  }
  function shiftGoogleWeekKey(day) {
    return shiftMonday(shiftParse(day));
  }
  function shiftGoogleWeekData(dayOrWeek) {
    const week = /^\d{4}-\d{2}-\d{2}$/.test(dayOrWeek) ? shiftGoogleWeekKey(dayOrWeek) : dayOrWeek;
    return shiftGoogleRead()?.weeks?.[week] || null;
  }
  function shiftGoogleActive(day) {
    if (shiftSourceMode() !== 'auto') return false;
    const week = shiftGoogleWeekKey(day);
    return !!shiftGoogleRead()?.weeks?.[week]?.ok;
  }
  function shiftGoogleGet(day, slot) {
    const week = shiftGoogleWeekKey(day);
    const w = shiftGoogleRead()?.weeks?.[week];
    if (!w?.ok) return null;
    return w.days?.[day]?.[slot] || 'none';
  }
  function shiftCleanStaffName(text) {
    const t = String(text || '').replace(/\s+/g,' ').trim();
    const m = t.match(/^(?:Методист|Куратор|Администратор|Преподаватель|Модератор)\s+([А-ЯЁA-Z][А-ЯЁа-яёA-Za-z-]+)(?:\s+([А-ЯЁA-Z][А-ЯЁа-яёA-Za-z-]+))?/i);
    return m ? [m[1], m[2]].filter(Boolean).join(' ') : '';
  }
  function shiftSidebarFirstName() {
    const nodes = document.querySelectorAll('aside span, aside div');
    for (const el of nodes) {
      if (el.children.length) continue;
      const name = shiftCleanStaffName(el.textContent);
      if (name) return name.split(/\s+/)[0];
    }
    return '';
  }
  function shiftCachedMethodistName() {
    try {
      const x = typeof GM_getValue === 'function' ? GM_getValue(SHIFT_METHODIST_STORE, '') : localStorage.getItem(SHIFT_METHODIST_STORE);
      return String(x || '').trim();
    } catch (e) { return ''; }
  }
  function shiftSaveMethodistName(name) {
    const n = String(name || '').trim();
    if (!n) return;
    try {
      if (typeof GM_setValue === 'function') GM_setValue(SHIFT_METHODIST_STORE, n);
      else localStorage.setItem(SHIFT_METHODIST_STORE, n);
    } catch (e) {}
  }
  function shiftDetectMethodistName() {
    const first = shiftSidebarFirstName();
    const cached = shiftCachedMethodistName();
    if (cached && (!first || cached.toLocaleLowerCase('ru-RU').startsWith(first.toLocaleLowerCase('ru-RU') + ' '))) return cached;

    const candidates = new Set();
    document.querySelectorAll('span').forEach(el => {
      if (el.children.length) return;
      const raw = (el.textContent || '').trim();
      if (raw.length > 90 || !/^(Методист|Куратор|Администратор|Преподаватель|Модератор)\s+/i.test(raw)) return;
      const n = shiftCleanStaffName(raw);
      if (!n || n.split(/\s+/).length < 2) return;
      if (!first || n.toLocaleLowerCase('ru-RU').startsWith(first.toLocaleLowerCase('ru-RU') + ' ')) candidates.add(n);
    });
    if (candidates.size === 1) {
      const n = [...candidates][0];
      shiftSaveMethodistName(n);
      return n;
    }
    return '';
  }
  function shiftAskMethodistName() {
    const first = shiftSidebarFirstName();
    const old = shiftCachedMethodistName();
    const entered = prompt('Не удалось однозначно определить ФИО методиста.\nУкажи имя и фамилию один раз — NeoCheck запомнит их для Google-расписания.', old || (first ? first + ' ' : ''));
    if (entered === null) return '';
    const n = String(entered).replace(/\s+/g,' ').trim();
    if (n.split(/\s+/).length < 2) { toast('Нужно указать имя и фамилию', true); return ''; }
    shiftSaveMethodistName(n);
    return n;
  }

  let shiftGoogleBusy = false;
  let shiftGoogleLastTry = 0;
  let shiftGoogleLastError = '';
  function shiftGoogleRequest(name) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') { reject(new Error('GM_xmlhttpRequest недоступен')); return; }
      const url = SHIFT_GOOGLE_URL + '?key=' + encodeURIComponent(SHIFT_GOOGLE_KEY) + '&name=' + encodeURIComponent(name);
      GM_xmlhttpRequest({
        method:'GET', url, timeout:15000, anonymous:true,
        onload:r => {
          try {
            const data = JSON.parse(r.responseText || '{}');
            if (!data || data.ok !== true) reject(new Error(data?.error || 'Google API вернул ошибку'));
            else resolve(data);
          } catch (e) { reject(new Error('Не удалось прочитать ответ Google')); }
        },
        onerror:() => reject(new Error('Не удалось подключиться к Google')),
        ontimeout:() => reject(new Error('Google не ответил вовремя'))
      });
    });
  }
  function shiftSaveGoogleResponse(data, name) {
    const week = shiftMonday(new Date());
    const days = {};
    (Array.isArray(data.shifts) ? data.shifts : []).forEach(x => {
      const di = Number(x.dayIndex);
      const si = SHIFT_SLOT_INDEX[x.slot];
      if (!Number.isInteger(di) || di < 0 || di > 6 || !Number.isInteger(si)) return;
      if (x.type !== 'hw' && x.type !== 'chat') return;
      const day = shiftAdd(week, di);
      if (!days[day]) days[day] = {};
      days[day][si] = x.type;
    });
    const db = shiftGoogleRead();
    if (!db.weeks || Array.isArray(db.weeks)) db.weeks = {};
    db.weeks[week] = {
      ok:true, methodist:name, matchedAs:data.matchedAs || '', sheet:data.sheet || '',
      updatedAt:data.updatedAt || '', syncedAt:Date.now(), days,
      count:Array.isArray(data.shifts) ? data.shifts.length : 0,
      sheetId:data.sheetId || null,
      changeAlerts:Array.isArray(data.changeAlerts) ? data.changeAlerts : []
    };
    jsonSave(SHIFT_GOOGLE_STORE, db);
    shiftGoogleLastError = '';
  }
  async function shiftSyncGoogle(opts = {}) {
    if (shiftGoogleBusy) return;
    const manual = !!opts.manual;
    let name = shiftDetectMethodistName();
    if (!name && manual) name = shiftAskMethodistName();
    if (!name) {
      shiftGoogleLastError = 'ФИО не определено';
      if (manual) toast('Не удалось определить ФИО методиста', true);
      if (shiftActive) shiftRender();
      return;
    }
    shiftGoogleBusy = true;
    shiftGoogleLastTry = Date.now();
    try {
      const data = await shiftGoogleRequest(name);
      const currentWeek = shiftMonday(new Date());

      // После «Очистить неделю» первый ручной запрос Google считается явным
      // восстановлением недели: снимаем блокирующие "none"-правки.
      if (manual && shiftWeekIsCleared(currentWeek)) {
        shiftClearOverridesWeek(currentWeek);
        shiftSetWeekCleared(currentWeek, false);
      }

      // Обычная синхронизация обновляет базу Google, но не трогает реальные
      // локальные правки пользователя.
      shiftSaveGoogleResponse(data, name);
      if (manual) toast('Google обновлён · ' + (data.count || 0) + ' смен · локальные правки сохранены');
      shiftRefreshLabel();
    } catch (e) {
      shiftGoogleLastError = String(e?.message || e || 'Ошибка синхронизации');
      if (manual) toast('Google: ' + shiftGoogleLastError + '. Оставлено ручное расписание.', true);
    } finally {
      shiftGoogleBusy = false;
      if (shiftActive) shiftRender(true);
    }
  }
  function shiftMaybeAutoSync() {
    if (shiftSourceMode() !== 'auto' || shiftGoogleBusy) return;
    if (Date.now() - shiftGoogleLastTry < 60000) return;
    const week = shiftMonday(new Date());
    if (shiftWeekIsCleared(week)) return;
    const w = shiftGoogleRead()?.weeks?.[week];
    if (w?.ok && Date.now() - Number(w.syncedAt || 0) < SHIFT_GOOGLE_TTL) return;
    if (!shiftDetectMethodistName()) return;
    shiftSyncGoogle({manual:false});
  }
  function shiftGoogleCount(week) {
    const w = shiftGoogleRead()?.weeks?.[week];
    return Number(w?.count || 0);
  }
  function shiftEffectiveCount(week) {
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const day = shiftAdd(week, i);
      for (let slot = 0; slot < SHIFT_TIMES.length; slot++) {
        if (shiftGet(day, slot) !== 'none') n++;
      }
    }
    return n;
  }

  function shiftGoogleStatus(week) {
    if (shiftSourceMode() === 'manual') return '✍ Ручной режим';
    const w = shiftGoogleRead()?.weeks?.[week];
    if (w?.ok) {
      const tm = w.syncedAt ? new Date(w.syncedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}) : '';
      return '☁ Google · ' + (w.methodist || 'методист') + (w.sheet ? ' · ' + w.sheet : '') + (tm ? ' · ' + tm : '') + ' · Google ' + shiftGoogleCount(week) + ' · на сайте ' + shiftEffectiveCount(week) + ' · правок ' + shiftOverrideCount(week);
    }
    return '☁ Google: ' + (shiftGoogleLastError || 'ожидание синхронизации');
  }

  function shiftOverrideRead() {
    const x = jsonLoad(SHIFT_OVERRIDE_STORE, {});
    return x && !Array.isArray(x) ? x : {};
  }
  function shiftOverrideValue(day, slot) {
    const db = shiftOverrideRead();
    if (!db[day] || !Object.prototype.hasOwnProperty.call(db[day], slot)) return null;
    const raw = db[day][slot];
    const value = raw && typeof raw === 'object' ? raw.value : raw;
    return Object.prototype.hasOwnProperty.call(SHIFT_LABEL, value) ? value : 'none';
  }
  function shiftHistoryPush(entry) {
    const h = jsonLoad(SHIFT_HISTORY_STORE, []);
    const arr = Array.isArray(h) ? h : [];
    arr.push({ ...entry, at: Date.now() });
    while (arr.length > 50) arr.shift();
    jsonSave(SHIFT_HISTORY_STORE, arr);
  }
  function shiftOverridePut(day, slot, value) {
    const next = Object.prototype.hasOwnProperty.call(SHIFT_LABEL, value) ? value : 'none';
    const googleValue = shiftGoogleGet(day, slot);
    const db = shiftOverrideRead();
    const prev = shiftGet(day, slot);
    shiftHistoryPush({ kind:'cell', day, slot, prev, next });
    if (googleValue !== null && next === googleValue) {
      if (db[day]) {
        delete db[day][slot];
        if (!Object.keys(db[day]).length) delete db[day];
      }
    } else {
      if (!db[day]) db[day] = {};
      db[day][slot] = { value: next, baseGoogle: googleValue, changedAt: Date.now() };
    }
    jsonSave(SHIFT_OVERRIDE_STORE, db);
  }
  function shiftUndoLast() {
    const h = jsonLoad(SHIFT_HISTORY_STORE, []);
    const arr = Array.isArray(h) ? h : [];
    const x = arr.pop();
    if (!x) { toast('Нечего отменять'); return; }
    jsonSave(SHIFT_HISTORY_STORE, arr);
    if (x.kind === 'cell') {
      const db = shiftOverrideRead();
      const gv = shiftGoogleGet(x.day, x.slot);
      if (x.prev === gv) {
        if (db[x.day]) { delete db[x.day][x.slot]; if (!Object.keys(db[x.day]).length) delete db[x.day]; }
      } else {
        if (!db[x.day]) db[x.day] = {};
        db[x.day][x.slot] = { value:x.prev, baseGoogle:gv, changedAt:Date.now() };
      }
      jsonSave(SHIFT_OVERRIDE_STORE, db);
      shiftRender(); shiftRefreshLabel(); toast('Последнее изменение отменено');
    }
  }
  function shiftClearOverridesWeek(week) {
    const db = shiftOverrideRead();
    for (let i = 0; i < 7; i++) delete db[shiftAdd(week, i)];
    jsonSave(SHIFT_OVERRIDE_STORE, db);
  }
  function shiftFillOverridesNone(week) {
    const db = shiftOverrideRead();
    for (let i = 0; i < 7; i++) {
      const day = shiftAdd(week, i);
      db[day] = {};
      for (let slot = 0; slot < SHIFT_TIMES.length; slot++) db[day][slot] = 'none';
    }
    jsonSave(SHIFT_OVERRIDE_STORE, db);
  }
  function shiftOverrideCount(week) {
    const db = shiftOverrideRead();
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const day = shiftAdd(week, i);
      if (!db[day]) continue;
      n += Object.keys(db[day]).length;
    }
    return n;
  }
  function shiftClearedRead() {
    const x = jsonLoad(SHIFT_CLEARED_STORE, {});
    return x && !Array.isArray(x) ? x : {};
  }
  function shiftWeekIsCleared(week) {
    return !!shiftClearedRead()[week];
  }
  function shiftSetWeekCleared(week, yes) {
    const db = shiftClearedRead();
    if (yes) db[week] = Date.now();
    else delete db[week];
    jsonSave(SHIFT_CLEARED_STORE, db);
  }

  function shiftRead() {
    const x = jsonLoad(SHIFT_STORE, {});
    return x && !Array.isArray(x) ? x : {};
  }
  function shiftLocalValue(day, slot) {
    const x = shiftRead();
    if (!x[day] || !Object.prototype.hasOwnProperty.call(x[day], slot)) return null;
    const value = x[day][slot];
    return value === 'both' ? 'hw' : (Object.prototype.hasOwnProperty.call(SHIFT_LABEL, value) ? value : 'none');
  }
  function shiftGet(day, slot) {
    // В авто-режиме Google — база, а поверх него применяются ТОЛЬКО реальные
    // ручные правки пользователя. Локальное резервное расписание не перекрывает
    // свежие данные Google.
    if (shiftSourceMode() === 'auto' && shiftGoogleActive(day)) {
      const override = shiftOverrideValue(day, slot);
      if (override !== null) return override;
      const gv = shiftGoogleGet(day, slot);
      return gv !== null ? gv : 'none';
    }

    // Если Google недоступен или включён ручной режим — используем локальный резерв.
    const local = shiftLocalValue(day, slot);
    if (local !== null) return local;

    return 'none';
  }
  function shiftPut(day, slot, value) {
    const x = shiftRead();
    if (!x[day]) x[day] = {};
    // «none» тоже сохраняем: это локальная отмена Google-смены.
    x[day][slot] = Object.prototype.hasOwnProperty.call(SHIFT_LABEL, value) ? value : 'none';
    if (!jsonSave(SHIFT_STORE, x)) toast('Не получилось сохранить смену', true);
  }
  function shiftClearLocalWeek(week, fillNone = false) {
    const db = shiftRead();
    for (let i = 0; i < 7; i++) {
      const day = shiftAdd(week, i);
      if (fillNone) {
        db[day] = {};
        for (let slot = 0; slot < SHIFT_TIMES.length; slot++) db[day][slot] = 'none';
      } else {
        delete db[day];
      }
    }
    jsonSave(SHIFT_STORE, db);
  }
  function shiftDropGoogleWeek(week) {
    const db = shiftGoogleRead();
    if (db.weeks && db.weeks[week]) {
      delete db.weeks[week];
      jsonSave(SHIFT_GOOGLE_STORE, db);
    }
  }
  // Для крайних интервалов можно задавать точное время, включая переход через полночь.
  // Слот «После 22» привязан к выбранной дате: старт 22:00–23:59 в этот день
  // или 00:00–09:59 СЛЕДУЮЩЕГО дня. Например, понедельник 00:30–02:00 = вторник утром.
  function shiftWindowRead() {
    const v = jsonLoad(SHIFT_WINDOW_STORE, {});
    return v && !Array.isArray(v) ? v : {};
  }
  function shiftWindow(day, slot) {
    const v = shiftWindowRead()?.[day]?.[slot];
    const fallback = slot === 0 ? { start: '00:00', end: '10:00' }
      : slot === 7 ? { start: '22:00', end: '00:00' }
      : { start: String(10 + (slot - 1) * 2).padStart(2, '0') + ':00',
          end: String(12 + (slot - 1) * 2).padStart(2, '0') + ':00' };
    return v && /^\d{2}:\d{2}$/.test(v.start) && /^\d{2}:\d{2}$/.test(v.end) ? v : fallback;
  }
  function shiftSaveWindow(day, slot, times) {
    const db = shiftWindowRead();
    if (!db[day]) db[day] = {};
    db[day][slot] = times;
    jsonSave(SHIFT_WINDOW_STORE, db);
  }
  function shiftWindowText(day, slot) {
    const t = shiftWindow(day, slot);
    const nextDayStart = slot === 7 && Number(t.start.slice(0,2)) < 10;
    return t.start + '–' + t.end + (nextDayStart ? ' (след. день)'
      : slot === 7 && t.end <= t.start ? ' (+1 день)' : '');
  }
  function shiftEditWindow(day, slot) {
    const t = shiftWindow(day, slot);
    const entered = prompt('Точное время смены по Москве (начало–конец).\n'
      + 'Например: 23:00-01:00 или 00:30-02:00 (следующего дня для «После 22»)', t.start + '-' + t.end);
    if (entered === null) return false;
    const m = entered.trim().match(/^(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})$/);
    if (!m) { toast('Нужен формат ЧЧ:ММ-ЧЧ:ММ', true); return false; }
    const [a,b,c,d] = m.slice(1).map(Number);
    if (a > 23 || c > 23 || b > 59 || d > 59 || (a === c && b === d)) {
      toast('Некорректный интервал времени', true); return false;
    }
    const st = a*60+b, en=c*60+d;
    // «После 22» включает и глубокую ночь следующего дня (00:00–09:59 МСК).
    // Для ночного старта после полуночи окончание должно быть позднее начала и до 10:00.
    const lateStart = st >= 1320;
    const nextDayStart = st < 600;
    const lateValid = lateStart && (en > st || en <= 600);
    const nextValid = nextDayStart && en > st && en <= 600;
    if ((slot === 0 && !(st < 600 && en <= 600 && en > st)) ||
        (slot === 7 && !(lateValid || nextValid))) {
      toast(slot === 0 ? 'Для «До 10» время должно быть до 10:00 в этот день'
        : 'Для «После 22» начало: 22:00–23:59 выбранного дня или 00:00–09:59 следующего (МСК)', true);
      return false;
    }
    shiftSaveWindow(day, slot, {start: String(a).padStart(2,'0')+':'+String(b).padStart(2,'0'),
      end: String(c).padStart(2,'0')+':'+String(d).padStart(2,'0')});
    return true;
  }
  function shiftEvent(day, slot, kind) {
    const t = shiftWindow(day, slot);
    const [y,m,d] = day.split('-').map(Number);
    const toMs = x => { const [h,mm] = x.split(':').map(Number); return Date.UTC(y,m-1,d,h-3,mm); };
    const startsNextDay = slot === 7 && Number(t.start.slice(0, 2)) < 10;
    const start = toMs(t.start) + (startsNextDay ? 86400000 : 0);
    let end = toMs(t.end) + (startsNextDay ? 86400000 : 0);
    if (end <= start) end += 86400000;
    return {day,slot,kind,start,end,time:shiftWindowText(day,slot)};
  }
  function shiftEventsAround(date, now) {
    const result = [];
    // Вчерашняя поздняя смена может всё ещё идти после 00:00 МСК.
    [shiftAdd(date,-1),date].forEach(day => {
      for (let slot = 0; slot < 8; slot++) {
        const kind = shiftGet(day,slot);
        if (kind !== 'none') result.push(shiftEvent(day,slot,kind));
      }
    });
    return result.sort((a,b) => a.start-b.start);
  }
  function shiftDaySummary(day) {
    const a = [];
    SHIFT_TIMES.forEach((time, i) => {
      const v = shiftGet(day, i);
      if (v !== 'none') a.push(time + ' · ' + SHIFT_LABEL[v]);
    });
    return a;
  }
  function shiftIsHomeworkPage() {
    return /^\/[\w-]+\/students-homework(?:\/|$)/.test(location.pathname);
  }
  function shiftBtn(label, action, strong) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = 'padding:9px 13px;border:1px solid #d7d4df;border-radius:12px;'
      + 'background:' + (strong ? '#302a3e;color:#fff;' : '#fff;color:#302a3e;')
      + 'font:700 12px Comfortaa,sans-serif;cursor:pointer;';
    b.addEventListener('click', action);
    return b;
  }
  function shiftDateCaption(key) {
    return shiftParse(key).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  }

  function shiftGoogleAlert(day, slot) {
  try {
    const week = shiftGoogleWeekKey(day);
    const alerts = shiftGoogleRead()?.weeks?.[week]?.changeAlerts || [];
    if (!alerts.length) return null;
    const slotKey = Object.keys(SHIFT_SLOT_INDEX).find(k => SHIFT_SLOT_INDEX[k] === slot);
    const dayIdx = (shiftParse(day).getUTCDay() + 6) % 7;
    const dayNames = [
      ['mon','monday','пн','понедельник'], ['tue','tuesday','вт','вторник'],
      ['wed','wednesday','ср','среда'], ['thu','thursday','чт','четверг'],
      ['fri','friday','пт','пятница'], ['sat','saturday','сб','суббота'],
      ['sun','sunday','вс','воскресенье']
    ][dayIdx];
    return alerts.find(a => {
      const sameSlot = a.slot === slotKey || a.slot === slot;
      const sameDay = a.dayIndex === dayIdx || a.day === day
        || dayNames.includes(String(a.day).toLowerCase());
      return sameSlot && sameDay;
    }) || null;
  } catch (e) {
    console.error('[NF shifts] alert', e);
    return null;
  }
}
  function shiftLocalMeta(day, slot) {
    const raw = shiftOverrideRead()?.[day]?.[slot];
    return raw && typeof raw === 'object' ? raw : null;
  }

  function shiftRender(background) {
    if (!shiftPanel || !shiftPanel.isConnected || !shiftActive) return;
    const week = shiftWeek || shiftMonday(new Date());
    const ae = document.activeElement;
    if (background && ae && ae.tagName === 'SELECT' && shiftPanel.contains(ae)) return;
    const oldScroll = (shiftPanel.querySelector('.nf-shift-scroll') || {}).scrollLeft || 0;
    shiftPanel.replaceChildren();
    const title = document.createElement('div');
    title.style.cssText = 'display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:14px;';
    const heading = document.createElement('div');
    heading.innerHTML = '<strong style="font-size:19px">📅 Мои смены (по МСК)</strong>';
    const desc = document.createElement('div');
    desc.textContent = 'Все даты и часы — по Москве (UTC+3). Google даёт базовое расписание, после загрузки любую смену можно изменить вручную.';
    desc.style.cssText = 'font-size:12px;color:#777;margin-top:5px';
    const syncState = document.createElement('div');
    syncState.textContent = shiftGoogleStatus(week);
    syncState.style.cssText = 'font-size:11px;color:#655c70;margin-top:5px;font-weight:700;';
    heading.append(desc, syncState);
    const nav = document.createElement('div');
    nav.style.cssText = 'display:flex;gap:7px;align-items:center;flex-wrap:wrap;';
    nav.append(
      shiftBtn('←', () => { shiftWeek = shiftAdd(week, -7); shiftRender(); }),
      shiftBtn(shiftDateCaption(week) + ' — ' + shiftDateCaption(shiftAdd(week, 6)),
        () => { shiftWeek = shiftMonday(new Date()); shiftRender(); }),
      shiftBtn('→', () => { shiftWeek = shiftAdd(week, 7); shiftRender(); }),
      shiftBtn('Эта неделя', () => { shiftWeek = shiftMonday(new Date()); shiftRender(); })
    );
    title.append(heading, nav);
    shiftPanel.appendChild(title);

    const scroll = document.createElement('div');
    scroll.style.cssText = 'overflow-x:auto;padding-bottom:4px;';
    scroll.className = 'nf-shift-scroll';
    const table = document.createElement('table');
    table.style.cssText = 'width:100%;min-width:830px;border-collapse:separate;border-spacing:5px;table-layout:fixed;';
    const thead = table.createTHead();
    const hr = thead.insertRow();
    const th = document.createElement('th');
    th.textContent = 'Время';
    th.style.cssText = 'width:110px;text-align:left;padding:9px;font-size:12px;color:#666;';
    hr.appendChild(th);
    SHIFT_DAYS.forEach((label, offset) => {
      const day = shiftAdd(week, offset);
      const td = document.createElement('th');
      const today = day === shiftDateKey();
      td.style.cssText = 'text-align:center;padding:9px 4px;border-radius:10px;font-size:12px;'
        + (today ? 'background:#e1f3c7;color:#27371b;' : 'color:#5e5867;');
      td.textContent = label + ' · ' + shiftDateCaption(day);
      hr.appendChild(td);
    });
    const tbody = table.createTBody();
    SHIFT_TIMES.forEach((time, slot) => {
      const row = tbody.insertRow();
      const label = row.insertCell();
      label.textContent = time;
      label.style.cssText = 'padding:10px 7px;font-weight:700;font-size:11px;white-space:nowrap;color:#444;';
      for (let offset = 0; offset < 7; offset++) {
        const day = shiftAdd(week, offset);
        const val = shiftGet(day, slot);
        const cell = row.insertCell();
        cell.style.cssText = 'padding:0;';
        const select = document.createElement('select');
        select.setAttribute('aria-label', day + ', ' + time);
        select.title = day + ' · ' + time + (slot === 0 || slot === 7 ? ' · ' + shiftWindowText(day,slot) : '');
        const ev = shiftEvent(day, slot, val);
        const isNow = val !== 'none' && Date.now() >= ev.start && Date.now() < ev.end;
        select.style.cssText = 'box-sizing:border-box;width:100%;min-height:42px;padding:8px 3px;border-radius:10px;'
          + 'border:1px solid ' + (val === 'none' ? '#ebe9ee' : '#c7c3da') + ';'
          + 'background:' + SHIFT_BG[val] + ';color:' + SHIFT_FG[val] + ';'
          + 'font:700 11px Comfortaa,sans-serif;cursor:pointer;'
          + (isNow ? 'outline:3px solid #83b641;outline-offset:1px;box-shadow:0 0 0 5px #eaf6d8;' : '');
        Object.entries(SHIFT_LABEL).forEach(([code, text]) => {
          const option = document.createElement('option');
          option.value = code;
          option.textContent = text;
          select.appendChild(option);
        });
        select.value = val;
        const fromGoogle = shiftGoogleActive(day) && shiftOverrideValue(day, slot) === null;
        if (fromGoogle) select.title += ' · загружено из Google; можно изменить вручную';
        const googleAlert = shiftGoogleAlert(day, slot);
        const localMeta = shiftLocalMeta(day, slot);
        select.onchange = () => {
          const next = select.value;
          if (next !== 'none' && (slot === 0 || slot === 7) && !shiftEditWindow(day,slot)) {
            shiftRender(); return;
          }

          // В Google-режиме это именно override одной ячейки, а не копия всей недели.
          if (shiftSourceMode() === 'auto' && shiftGoogleActive(day)) {
            shiftOverridePut(day, slot, next);
          } else {
            shiftPut(day, slot, next);
          }

          shiftRender(); shiftRefreshLabel();
        };
        if (val !== 'none' && (slot === 0 || slot === 7)) {
          const edit = document.createElement('button');
          edit.type = 'button';
          edit.textContent = '🕒 ' + shiftWindowText(day,slot);
          edit.title = 'Изменить время смены';
          edit.style.cssText = 'display:block;width:100%;border:0;background:transparent;color:#60566d;font:600 9px Comfortaa,sans-serif;cursor:pointer;padding:5px 0 0;';
          edit.onclick = () => { if (shiftEditWindow(day,slot)) { shiftRender(); shiftRefreshLabel(); } };
          cell.append(select,edit);
        } else cell.appendChild(select);
        if (googleAlert) {
          const b = document.createElement('div');
          const tm = googleAlert.changedAt ? new Date(googleAlert.changedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}) : '';
          let txt = '⚠ Google ' + tm;
          if (googleAlert.kind === 'replaced') txt += ' → ' + (googleAlert.to || 'другая фамилия');
          else if (googleAlert.kind === 'removed') txt += ' → удалено';
          else if (googleAlert.kind === 'added') txt += ' → добавлено';
          b.textContent = txt;
          b.title = 'Было: ' + (googleAlert.from || '—') + ' · Стало: ' + (googleAlert.to || '—');
          b.style.cssText='font:700 9px Comfortaa,sans-serif;color:#9a5a00;padding:4px 2px;text-align:center;white-space:normal;';
          cell.appendChild(b);
        } else if (localMeta) {
          const b = document.createElement('div');
          const tm = localMeta.changedAt ? new Date(localMeta.changedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}) : '';
          const curG = shiftGoogleGet(day, slot);
          const conflict = localMeta.baseGoogle !== undefined && curG !== null && localMeta.baseGoogle !== curG;
          b.textContent=(conflict ? '⚠ конфликт Google · ' : '✏ локально ') + tm;
          if (conflict) b.title='Google изменился после вашей ручной правки';
          b.style.cssText='font:700 9px Comfortaa,sans-serif;color:#6b5b88;padding:4px 2px;text-align:center;';
          cell.appendChild(b);
        }
      }
    });
    scroll.appendChild(table);
    shiftPanel.appendChild(scroll);
    scroll.scrollLeft = oldScroll;

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:13px;';
    actions.appendChild(shiftBtn(shiftGoogleBusy ? '⏳ Google…' : '↻ Обновить из Google', () => shiftSyncGoogle({manual:true}), true));
    actions.appendChild(shiftBtn('↶ Отменить', () => shiftUndoLast()));
    actions.appendChild(shiftBtn('♻ Сбросить мои правки', () => {
      if (!confirm('Удалить только локальные правки этой недели и снова показать расписание Google как есть?')) return;
      shiftClearOverridesWeek(week);
      shiftSetWeekCleared(week, false);
      shiftSyncGoogle({manual:true});
      shiftRender(); shiftRefreshLabel();
    }));
    actions.appendChild(shiftBtn(shiftSourceMode() === 'auto' ? '✍ Ручной режим' : '☁ Авто Google', () => {
      const next = shiftSourceMode() === 'auto' ? 'manual' : 'auto';
      shiftSetSourceMode(next);
      if (next === 'auto') shiftSyncGoogle({manual:false});
      shiftRender(); shiftRefreshLabel();
    }));
    actions.appendChild(shiftBtn('👤 ФИО', () => {
      if (shiftAskMethodistName()) shiftSyncGoogle({manual:true});
    }));
    actions.appendChild(shiftBtn('📋 Скопировать предыдущую неделю', () => {
      if (!confirm('Заменить расписание этой недели сменами предыдущей?')) return;
      const db = shiftRead();
      for (let i = 0; i < 7; i++) {
        const dest = shiftAdd(week, i), source = shiftAdd(week, i - 7);
        if (db[source]) db[dest] = { ...db[source] };
        else delete db[dest];
      }
      jsonSave(SHIFT_STORE, db);
      const wd = shiftWindowRead();
      for (let i = 0; i < 7; i++) {
        const dest = shiftAdd(week,i), source = shiftAdd(week,i-7);
        if (wd[source]) wd[dest] = JSON.parse(JSON.stringify(wd[source]));
        else delete wd[dest];
      }
      jsonSave(SHIFT_WINDOW_STORE, wd);
      shiftRender(); shiftRefreshLabel();
    }));
    actions.appendChild(shiftBtn('🗑 Очистить неделю', () => {
      if (!confirm('Полностью очистить выбранную неделю, включая смены из Google?')) return;
      // Полностью очищаем и Google-базу, и локальное представление недели.
      // Фоновая синхронизация не вернёт её, пока пользователь сам не нажмёт
      // «Обновить из Google».
      shiftClearLocalWeek(week, true);
      shiftFillOverridesNone(week);
      shiftDropGoogleWeek(week);
      shiftSetWeekCleared(week, true);
      const wd = shiftWindowRead();
      for (let i = 0; i < 7; i++) delete wd[shiftAdd(week,i)];
      jsonSave(SHIFT_WINDOW_STORE, wd);
      shiftRender(); shiftRefreshLabel();
      toast('Неделя полностью очищена');
    }));
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px;color:#777;margin-left:auto;';
    hint.textContent = '☁ Google — база · ✏ меняются только правленные ячейки · автообновление ~5 мин · 💚 Домашки · 💜 Чат';
    actions.appendChild(hint);
    shiftPanel.appendChild(actions);
  }

  function shiftRefreshLabel() {
    const tag = document.getElementById('nf-shift-today');
    if (!tag) return;
    const now = new Date();
    const date = shiftDateKey(now);
    const parts = shiftMskParts(now);
    const mskTime = String(parts.hour).padStart(2,'0') + ':' + String(parts.minute).padStart(2,'0');
    const events = shiftEventsAround(date,now);
    const active = events.find(e => e.start <= now.getTime() && e.end > now.getTime());
    // Показываем предстоящие события по фактической дате начала по МСК,
    // включая ночную смену, записанную на предыдущий день.
    const dayStartUtc = Date.UTC(parts.year, parts.month - 1, parts.day, -3);
    const future = events.filter(e => e.start > now.getTime() && e.start < dayStartUtc + 86400000);
    const sig = JSON.stringify([date,mskTime,active,future]);
    if (tag.dataset.sig === sig) return;
    tag.dataset.sig = sig;
    tag.replaceChildren();
    tag.style.cssText = 'display:flex;flex-wrap:wrap;align-items:stretch;gap:10px;'
      + 'margin-bottom:12px;font-family:Comfortaa,sans-serif;color:#302a3e;';

    const currentBox = document.createElement('div');
    currentBox.style.cssText = 'display:flex;flex-direction:column;justify-content:center;gap:5px;'
      + 'padding:12px 16px;border:2px solid ' + (active ? '#83b641' : '#e2e0e8')
      + ';border-radius:14px;background:' + (active ? '#eaf6d8' : '#f6f5f8')
      + ';min-width:180px;flex:0 1 auto;';
    const currentLabel = document.createElement('span');
    currentLabel.textContent = '● СЕЙЧАС · ' + mskTime + ' МСК';
    currentLabel.style.cssText = 'font-size:10px;font-weight:800;color:#5d7935;letter-spacing:.04em;';
    const currentValue = document.createElement('strong');
    currentValue.textContent = active ? SHIFT_LABEL[active.kind] + ' · ' + active.time : 'Сейчас смены нет';
    currentValue.style.cssText = 'font-size:14px;color:#293b20;line-height:1.5;';
    currentBox.append(currentLabel,currentValue);

    const nextBox = document.createElement('div');
    nextBox.style.cssText = 'display:flex;flex-direction:column;justify-content:center;gap:7px;'
      + 'padding:12px 16px;border:1px solid #e9e4f4;border-radius:14px;background:#f4f1fb;'
      + 'flex:1 1 280px;min-width:0;';
    const nextLabel = document.createElement('span');
    nextLabel.textContent = '📅 ДАЛЬШЕ СЕГОДНЯ (МСК)';
    nextLabel.style.cssText = 'font-size:10px;font-weight:800;color:#776a89;letter-spacing:.04em;';
    const nextContent = document.createElement('div');
    nextContent.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;';
    if (!future.length) {
      const empty = document.createElement('span');
      empty.textContent = 'Больше смен сегодня нет';
      empty.style.cssText = 'font-size:12px;font-weight:600;color:#746b7e;';
      nextContent.appendChild(empty);
    } else future.forEach(item => {
      const chip = document.createElement('span');
      chip.textContent = item.time + ' · ' + SHIFT_LABEL[item.kind];
      chip.style.cssText = 'font-size:11px;font-weight:700;padding:7px 10px;border-radius:9px;'
        + 'background:' + SHIFT_BG[item.kind] + ';color:' + SHIFT_FG[item.kind] + ';';
      nextContent.appendChild(chip);
    });
    nextBox.append(nextLabel,nextContent);
    tag.append(currentBox,nextBox);
  }

  function shiftOpen(open) {
    shiftActive = open;
    if (shiftList && shiftList.isConnected) shiftList.style.display = open ? 'none' : shiftOldDisplay;
    if (shiftPanel && shiftPanel.isConnected) shiftPanel.style.display = open ? 'block' : 'none';
    const button = document.getElementById('nf-shift-tab');
    if (button) {
      button.style.background = open ? '#302a3e' : '#efedf2';
      button.style.color = open ? '#fff' : '#302a3e';
    }
    if (open) shiftRender();
  }

  function shiftInject() {
    if (!shiftIsHomeworkPage()) {
      shiftActive = false;
      shiftPanel = shiftRoot = shiftList = null;
      return;
    }
    const tabs = document.querySelector('[role="tablist"][aria-orientation="horizontal"]');
    if (!tabs) return;
    const tabWrapper = tabs.closest('[dir="ltr"][data-orientation="horizontal"]');
    if (!tabWrapper || !tabWrapper.parentElement) return;
    let list = tabWrapper.nextElementSibling;
    if (list && list.id === 'nf-shift-panel') list = list.nextElementSibling; // пропускаем свою панель
    if (!list) return;

    const btn = document.getElementById('nf-shift-tab');
    const alive = shiftRoot === tabWrapper && shiftPanel && shiftPanel.isConnected && btn && tabs.contains(btn);
    if (alive) {
      shiftList = list;
      list.style.display = shiftActive ? 'none' : ''; // держим состояние, даже если сайт перерисовал список
      shiftRefreshLabel();
      return;
    }

    // Сайт пересоздал вкладки (или это первый запуск): убираем старое и строим заново
    document.querySelectorAll('#nf-shift-panel, #nf-shift-tab').forEach(n => n.remove());
    shiftRoot = tabWrapper;
    shiftList = list;
    shiftOldDisplay = ''; // никогда не запоминаем 'none'
    if (!shiftWeek) shiftWeek = shiftMonday(new Date());

    const b = document.createElement('button');
    b.id = 'nf-shift-tab';
    b.type = 'button';
    b.textContent = '📅 Мои смены';
    b.style.cssText = 'border:0;border-radius:13px;background:#efedf2;color:#302a3e;'
      + 'font:700 13px Comfortaa,sans-serif;white-space:nowrap;padding:12px 15px;cursor:pointer;';
    b.onclick = () => shiftOpen(!shiftActive);
    tabs.appendChild(b);
    tabs.addEventListener('click', e => {
      if (e.target.closest('button[role="tab"]') && shiftActive) shiftOpen(false);
    });

    shiftPanel = document.createElement('section');
    shiftPanel.id = 'nf-shift-panel';
    shiftPanel.style.cssText = 'display:none;background:#fff;border-radius:20px;padding:20px;'
      + 'box-shadow:0 2px 10px rgba(0,0,0,.035);font:13px Comfortaa,sans-serif;color:#302a3e;margin:12px 0 22px;';
    tabWrapper.after(shiftPanel);

    let badge = document.getElementById('nf-shift-today');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'nf-shift-today';
      badge.style.cssText = 'font:700 11px Comfortaa,sans-serif;color:#4c4656;'
        + 'padding:11px 13px;background:#f4f1fb;border:1px solid #e9e4f4;'
        + 'border-radius:13px;margin-bottom:12px;';
    }
    tabWrapper.before(badge);
    shiftRefreshLabel();
    shiftMaybeAutoSync();
    shiftOpen(shiftActive);
  }

  // После полуночи/начала нового слота сегодняшняя подпись обновится и без перезагрузки.
  let lastShiftHighlight = '';
  setInterval(() => {
    if (!shiftIsHomeworkPage()) return;
    shiftRefreshLabel();
    const date = shiftDateKey();
    const key = date + ':' + shiftEventsAround(date).filter(e => e.start <= Date.now() && Date.now() < e.end).map(e => e.day + '/' + e.slot).join(',');
    if (key !== lastShiftHighlight) { lastShiftHighlight = key; if (shiftActive) shiftRender(true); }
  }, 60 * 1000);

  setInterval(() => { try { scanMessages(); } catch (e) { console.error('[NF] msgs', e); } }, 1500);

  // ======================================================================
  //  ЧАСТЬ 9. Регламент методиста (локальная копия PDF, только чтение)
  // ======================================================================
  const NF_REG_SECTIONS = [{"title":"Основные действующие лица","blocks":[{"kind":"p","text":"Кто есть кто в биологии NeoFamily и к кому идти с вопросами."},{"kind":"h3","text":"Даниил Гущеваров · старший методист по биологии"},{"kind":"p","text":"По всем вопросам об организации курса, теории и спорных проверках — пишите мне. Но сначала убедитесь, что ответа нет в регламенте или в теме «Важные сообщения». А ещё мне можно писать с идеями и пожеланиями по работе методиста на платформе :)"},{"kind":"h3","text":"Telegram: t.me/ddzxhss"},{"kind":"h3","text":"ВКонтакте: vk.com/ddzxhss"},{"kind":"p","text":"Срочно: +7 964 140-44-46 — только если другие способы связи не сработали"},{"kind":"h3","text":"Антон Олейников · старший методист по биологии"},{"kind":"p","text":"Второй старший методист. К нему тоже можно и нужно обращаться по проверкам и любым другим рабочим вопросам. Именно Антону новички пишут за аккаунтом методиста."},{"kind":"h3","text":"Telegram: t.me/aaahchooo"},{"kind":"h3","text":"Виктория Григорьева · руководитель учебного отдела"},{"kind":"p","text":"Пишите, если возникла проблема или вопрос, который почему-то не получается решить через старшего методиста. Не бойтесь это делать!"},{"kind":"h3","text":"ВКонтакте: vk.com/victoriabatyrbaeva"},{"kind":"p","text":"Е сли действительно ЧП — звоните в любое время: +7 981 832-18-34"},{"kind":"h3","text":"Андрей Фомин"},{"kind":"p","text":"Преподаватель по биологии, CEO NeoFamily."},{"kind":"p","text":"Ведёт вебинары."},{"kind":"h3","text":"Нурлан Жангалиев"},{"kind":"p","text":"Преподаватель по биологии. Ведёт видеоуроки."},{"kind":"p","text":"! Преподавателям писать нельзя ни в коем случае. Все рабочие вопросы — через старших методистов."}]},{"title":"Как попасть в команду","blocks":[{"kind":"p","text":"Если вы только приступаете к первым проверкам — начните с этого раздела:"},{"kind":"p","text":"как подать заявку, получить аккаунт, пройти стажировку и оформить выплаты."},{"kind":"h3","text":"Отбор"},{"kind":"p","text":"Заявка подаётся через «Вакансии NeoFamily»:"},{"kind":"h3","text":"ВКонтакте: vk.com/neofamily_hr"},{"kind":"h3","text":"Telegram: @neofamilyhr"},{"kind":"h3","text":"Критерии отбора"},{"kind":"h3","text":"Балл за ЕГЭ по биологии — не ниже 85–90"},{"kind":"h3","text":"Сертификат о прохождении курсов эксперта ЕГЭ"},{"kind":"h3","text":"Высшее биологическое образование"},{"kind":"p","text":"Главный критерий — балл за ЕГЭ, но возможны исключения."},{"kind":"p","text":"После заполнения формы напишите в сообщество вакансий, а затем старшему методисту — Даниилу. Если ответа нет 3 дня — напомните о себе ещё раз."},{"kind":"p","text":"Чтобы пройти на следующий этап, выполните итоговое задание. Пишите с любым результатом и обязательно укажите в сообщении набранные баллы — каждый случай рассматривается индивидуально. Если результат устроил старшего методиста, вы получите ссылки на вступление в чат методистов."},{"kind":"h3","text":"Стажировка: пошагово"},{"kind":"p","text":"Прочитайте регламент. Особое внимание — разделам «Нейропроверка», «Оценивание второй части» и «Проверка домашних заданий»."},{"kind":"p","text":"Запросите аккаунт методиста. Напишите Антону, что вам нужен аккаунт, — укажите имя и фамилию. Дождитесь аккаунта от старшего методиста."},{"kind":"p","text":"Запросите доступ к таблице распределения. Выберите удобное время и впишите свою фамилию в ячейки, окрашенные голубым."},{"kind":"p","text":"Перед началом напишите в теме, что «вышли на стажировку». Затем в выбранное время нажмите «Приступить к проверкам» в разделе «Домашки учеников»."},{"kind":"p","text":"Первые 5–7 проверок отправляйте в тему «Первые 15 проверок» — их посмотрит старший методист. Работу завершайте только после его ответа «всё верно», учтя правки и рекомендации. Так — пока не получится идеальная проверка без замечаний."},{"kind":"p","text":"Оставшиеся работы (до 15 включительно) проверяйте самостоятельно."},{"kind":"p","text":"Пройдите чек-лист: запросите доступ ко всем таблицам и заполните формы — список ниже."},{"kind":"p","text":"Напишите старшему методисту, что всё сделали, и ждите, когда вас подключат к основному штату."},{"kind":"p","text":"На первые 5–7 работ обычно уходит 1,5–2 часа — закладывайте это время."},{"kind":"h3","text":"Как отправлять стажёрские проверки"},{"kind":"p","text":"По каждой проверке отправляйте в тему ссылку на домашку (в формате https:// neofamily.ru/biologiya/students-homework/…) и текст, который собираетесь отправить ребёнку: номер задания и комментарий к нему — отдельно. В конце — общий комментарий для самого нижнего поля."},{"kind":"h3","text":"Пример Стажёрская проверка"},{"kind":"p","text":"Ссылка neofamily.ru/biologiya/students-homework/41233232597"},{"kind":"h3","text":"Задание 6"},{"kind":"p","text":"Пункт ключа 1: +/–. Конкретнее называй термин — это годичное кольцо."},{"kind":"h3","text":"Задание 7"},{"kind":"p","text":"Пункт ключа 3: –. Зная частоту аллеля а, можно рассчитать частоту нормального (доминантного) аллеля А: в равновесной популяции p + q = 1, поэтому p = 1 – 0,0223 = 0,9777."},{"kind":"p","text":"Ты пропустила один 0 после запятой, поэтому все дальнейшие расчёты (и пункты) неверные."},{"kind":"h3","text":"Задание 8"},{"kind":"p","text":"Пункт ключа 3: –. Такая же ошибка, как в задании 7, — все дальнейшие расчёты неверные."},{"kind":"h3","text":"Задание 1 0"},{"kind":"p","text":"Указала всего по одной особенности строения и жизнедеятельности, а нужно как минимум по две:"},{"kind":"bullet","text":"• пункт ключа 5: – (особенность строения: в этих клетках крупные ядра и много рибосом, что"},{"kind":"p","text":"связано с активным синтезом белка для деления);"},{"kind":"bullet","text":"• пункт ключа 6: – (ещё одна особенность строения: вакуоли в клетках меристемы очень"},{"kind":"p","text":"мелкие или отсутствуют);"},{"kind":"bullet","text":"• пункт ключа 8: – (особенность жизнедеятельности: клетки верхушечной меристемы могут"},{"kind":"p","text":"дифференцироваться в клетки других тканей растения)."},{"kind":"h3","text":"О бщий комментарий"},{"kind":"p","text":"Привет! Замечательная работа! Не забудь разобрать ошибочки и повторить материал — комментарии оставила у заданий. Продолжай в том же духе, у тебя всё получится!"},{"kind":"h3","text":"Важные правила"},{"kind":"p","text":"Про верка длится больше 20 минут — вас могут снять со смены. Нажимайте «Продлить проверку», как только кнопка появится, иначе работа уйдёт другому методисту и не зачтётся вам."},{"kind":"p","text":"Необязательно проверять все 15 работ за одну смену — можно разбить на несколько дней. Главное — предупредите в теме или лично старшего методиста, что проверите позже."},{"kind":"p","text":"Не можете выйти в выбранное время — сразу предупредите старшего методиста и уберите свою фамилию из таблицы, выбрав другое время."},{"kind":"p","text":"Пустые домашки (без выполненных заданий) не засчитываются в эти 15 работ. Но баллы всё равно нужно выставить и завершить проверку, написав в общем комментарии шаблонную шапку. Примеры — в таблице «Шапки и скрипты», лист с шапочками. Там можно вписать своё имя и придумать собственные фразы или взять готовые у других ребят — думаю, они не будут против :)"},{"kind":"p","text":"Если вам назначилась уже проверенная домашка, скорее всего, там висит непрочитанное сообщение от ученика. На него нужно ответить, даже если это «спасибо за проверку!» — пока вы не ответите, система не выдаст новую домашку."},{"kind":"p","text":"Линии 22–26 проверяются с помощью нейропроверки. Итоговый текст полностью переписывать не нужно, если в нём нет ошибок и неточностей. Но нейропроверка — лишь вспомогательный инструмент: ИИ-текст не уходит ребёнку автоматически после завершения проверки, его нужно отправить самому, нажав на значок самолётика справа от строки текста."},{"kind":"p","text":"Перед завершением проверки убедитесь, что под каждым заданием отправлен комментарий, верно выставлены баллы и написан общий комментарий по работе."},{"kind":"p","text":"В теме «Первые 15 проверок» можно смотреть проверки и замечания других новичков — учитесь на них и прокачивайте навык."},{"kind":"p","text":"Кнопка отправки. Нажимайте её у каждого задания отдельно — без этого комментарий не отправится."},{"kind":"h3","text":"Формы и таблицы"},{"kind":"p","text":"Что Зачем"},{"kind":"p","text":"1. Регламент Вы читаете его сейчас :) Прочитайте полностью."},{"kind":"p","text":"2. Шапки и скрипты Шаблонные фразы и шапки для проверок."},{"kind":"p","text":"3. Таблица распределения Запись на смены. Запросите доступ: доступ обновляется каждое воскресенье, чем раньше запросите — тем лучше."},{"kind":"p","text":"4. Форма знакомства Нужна, чтобы попасть в список на распределение. Без этой формы вы не считаетесь методистом."},{"kind":"p","text":"5. Дни рождения По желанию — чтобы вас поздравили во флудилке."},{"kind":"p","text":"6. Резервный чат ВК Запасной канал связи с командой."},{"kind":"h3","text":"Оформление выплат"},{"kind":"p","text":"Большинство методистов работают как самозанятые. Об особенностях этого формата — в файле по ссылке."},{"kind":"p","text":"Х отите работать как самозанятый — прочитайте пост Ксении и заполните форму."},{"kind":"p","text":"Хотите оформить ГПХ или работать как ИП — напишите Ксении (автору поста)."},{"kind":"p","text":"Как считается вознаграждение — в разделе «Вознаграждение»."}]},{"title":"Коммуникация","blocks":[{"kind":"p","text":"Все взаимодействия методистов с детьми — только на платформе neofamily.ru."},{"kind":"p","text":"Между собой методисты общаются в Telegram."},{"kind":"h3","text":"Чат всех методистов"},{"kind":"p","text":"Главный чат, где собрана вся нужная информация. Он разделён на темы, у каждой — свои правила."},{"kind":"h3","text":"Важные сообщения Выходы на смену Флудилка"},{"kind":"p","text":"Уведомления не выключать. Писать сюда нельзя — только важная информация к ознакомлению. Прочитали — поставьте реакцию."},{"kind":"p","text":"Только два типа сообщений: «Вышел на чат» и «Завершил чат». О выходе на проверку домашек сообщать не нужно."},{"kind":"p","text":"Общение на любые темы."},{"kind":"p","text":"Под запретом только оскорбления и разжигание ненависти. Очень здорово, когда вы присылаете скрины благодарностей от детей."},{"kind":"h3","text":"Вопросы"},{"kind":"p","text":"Здесь можно и нужно спрашивать о проверках, организации курса, теории и о том, как оценить ответ ребёнка. В последнем случае пришлите условие задания (на что отвечает ребёнок), текст ответа и элемент ключа, по которому сомневаетесь."},{"kind":"h3","text":"Хорошо заданный вопрос"},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Сообщение в теме"},{"kind":"p","text":"Здравствуйте! Подскажите, засчитывать ли этот пункт? В условии: «Назовите тип и фазу деления диплоидной клетки. Ответ поясните». Ребёнок пишет: «На рисунке видно расхождение хромосом к полюсам». Элемент ключа 3: «расхождение двухроматидных хромосом». Засчитывать ответ или обязательно указать двухроматидность?"},{"kind":"p","text":"i Грамотно заданный вопрос — правильно полученный ответ."},{"kind":"h3","text":"Послания методистам"},{"kind":"p","text":"Сюда отправляем случаи, когда ребёнок не согласен с оценкой другого методиста: не понимает, почему ему засчитали или не засчитали пункт ключа и почему такой балл."},{"kind":"p","text":"Дети не знают особенностей оценивания, да и методисты порой ошибаются. Чтобы не играть в «сломанный телефон» и не отдуваться за чужую проверку, пересылаем вопрос автору проверки."},{"kind":"p","text":"Сообщение в теме оформляем единообразно:"},{"kind":"p","text":"Ф амилия и имя методиста."},{"kind":"p","text":"Его тег через @ — из таблицы в закрепе темы (там теги и методистов, и кураторов)."},{"kind":"p","text":"Ссылка вида t.me/name уведомления не даёт, а тег, добавленный при редактировании, тоже не срабатывает — пишите правильно с первого раза."},{"kind":"p","text":"Ссылка на домашку в формате https://neofamily.ru/biologiya/students-homework/"},{"kind":"h3","text":"…"},{"kind":"h3","text":"Пример сообщения в теме «Послания методистам»"},{"kind":"p","text":"Ребёнку под домашкой пишем:"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Привет! Передала вопрос методисту, попрошу его тебе ответить. Большая просьба:"},{"kind":"p","text":"ничего не пиши под этой домашкой, иначе он не сможет её открыть. Если вдруг ответа не будет — напиши снова."},{"kind":"p","text":"Методист не сможет открыть домашку, если последнее сообщение в ней — от ребёнка."},{"kind":"p","text":"Если тегнули вас — обязательно ответьте ребёнку и поставьте под сообщением в теме реакцию: так видно, что вы ответили."},{"kind":"h3","text":"Распределение"},{"kind":"p","text":"Здесь вы записываетесь в свободные слоты на проверки домашек. Как это устроено — в разделе «Расписание и смены»."},{"kind":"h3","text":"Частые ошибки"},{"kind":"p","text":"Сюда присылаем частые ошибки детей и нейронки в домашних заданиях. Материал нужен для двух вещей:"},{"kind":"p","text":"Практикумы преподавателей — один из блоков там посвящён разбору частых ошибок."},{"kind":"p","text":"Улучшение нейропроверки: вам же меньше править."},{"kind":"p","text":"В закрепе — расписание вебинаров и список домашек, ошибки из которых нужно присылать. Сообщение должно быть структурированным:"},{"kind":"p","text":"название домашки ;"},{"kind":"p","text":"номер задания;"},{"kind":"p","text":"описание ошибки в одном предложении;"},{"kind":"p","text":"3–4 ссылки на домашки с этой ошибкой."},{"kind":"h3","text":"Пример сообщения в теме «Частые ошибки»"},{"kind":"p","text":"Активность в этой теме приносит баллы в рейтинг за «Активность в беседе» (до 4), а рейтинг — это дополнительное вознаграждение."},{"kind":"h3","text":"Конспекты"},{"kind":"p","text":"Здесь публикуются материалы, по которым на курсе даётся теория. Ориентируемся в первую очередь на них, а не на вузовские учебники или олимпиадные знания."},{"kind":"p","text":"Конспекты дублируются на Google Диск — ссылка в закрепе."},{"kind":"p","text":"Совет: после публикации конспекта прочитайте его, чтобы освежить знания. Там может быть информация, отличающаяся от того, как вас учили в школе: она максимально приближена к материалам ФИПИ и к тому, что спрашивают на ЕГЭ, и проходит многоступенчатую проверку экспертами."},{"kind":"h3","text":"Грубые дети"},{"kind":"p","text":"Сюда отправляем детей, которые неуважительно общаются с методистами, хамят и не соблюдают субординацию. Цель — провести с ними работу, при необходимости отключить от курса или ограничить доступ к чату и, конечно, не допустить их на позицию куратора или методиста в будущем."},{"kind":"h3","text":"Ответы на анонимные вопросы"},{"kind":"p","text":"Ответы на вопросы из анонимной формы (ссылка в закрепе): пожелания, вопросы, замечания — всё, что по какой-то причине не хочется писать в личку."},{"kind":"h3","text":"Дайджест ЕГЭ"},{"kind":"p","text":"Новые нюансы и изменения экзамена — сейчас это ЕГЭ-2027. Тема очень важная:"},{"kind":"p","text":"следите за ней и не пропускайте изменений."},{"kind":"h3","text":"Шедевры учеников"},{"kind":"p","text":"Забавные моменты из проверок: опечатки, странные формулировки и сообщения детей."},{"kind":"p","text":"Потом всё это пойдёт в ежегодное видео «методисты core»."},{"kind":"h3","text":"Чат «Методисты + кураторы»"},{"kind":"p","text":"В тему «Методисты по биологии» кураторы пересылают теоретические вопросы детей, которые не хотят спрашивать на платформе. Свои вопросы туда не пишите — для этого есть тема «Вопросы» :)"},{"kind":"p","text":"Вступать в этот чат не обязательно — только если хотите отвечать на вопросы и получать дополнительные баллы за активность."}]},{"title":"Нейропроверка","blocks":[{"kind":"p","text":"Для заданий линий 22–26, написанных текстом, есть нейропроверка — готовый разбор ответа ученика на соответствие пунктам ключа. Ваша задача — проверить этот разбор, а не отправить его вслепую."},{"kind":"h3","text":"Что нужно проверить"},{"kind":"p","text":"Баллы выставлены верно, а разбалловка соответствует актуальной."},{"kind":"p","text":"Незачтённые пункты действительно отсутствуют в ответе, а зачтённые — действительно есть. Обязательно читайте пояснение модели — что она засчитала, а что нет. Если пояснения нет — пересмотрите ответ сами. В 95% случаев модель занижает балл, а не завышает."},{"kind":"p","text":"Балл за биологическую ошибку снят заслуженно. Модель иногда плохо отличает ЕГЭшную информацию от неЕГЭшной. Если считаете, что «–» за пункт выставлен незаслуженно, — исправляйте."},{"kind":"h3","text":"Модель слишком строга к формулировке"},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"1 — слияние гамет"},{"kind":"h3","text":"2 — созревание зооспор"},{"kind":"label","text":"Комментарий модели"},{"kind":"p","text":"Элемент 1: Неверно. Указано «слияние гамет» вместо «гамета»."},{"kind":"p","text":"Элемент 2: Неверно. Указано «созревание зооспор» вместо «зооспора», неполное соответствие."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"За каждый из этих пунктов можно поставить +/–, так как суть верна. Вместо пояснения модели напишите: «Засчитаю, но в условии просят определить СТАДИИ, а не процессы — будь внимательнее»."},{"kind":"h3","text":"Пункт снят верно, но ребёнку нужно объяснение"},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"…потому что в водопроводной воде неизвестная концентрация солей, и в таком случае тургор клеток этих растений может нарушиться и вследствие этого растение может погибнуть"},{"kind":"label","text":"Комментарий модели"},{"kind":"p","text":"Элемент 4: Неверно. Допущена ошибка: указана неверная причина (неизвестная концентрация солей и риск нарушения тургора), а не отсутствие необходимых минеральных солей для роста."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Пункт не засчитан верно, но ребёнок может не до конца понять, в чём ошибка."},{"kind":"p","text":"Желательно дописать что-то от себя."},{"kind":"label","text":"Ваш финальный комментарий"},{"kind":"p","text":"Допущена ошибка: указана неверная причина (неизвестная концентрация солей и риск нарушения тургора), а не отсутствие необходимых минеральных солей для роста. То, что концентрация неизвестна, — это ладно, а вот отсутствие солей — это уже серьёзно!"},{"kind":"p","text":"Написать 2–3 таких замечания — быстро, а ребёнок гораздо лучше поймёт свою ошибку."},{"kind":"p","text":"Не в каждом задании, но там, где нужно, — обязательно."},{"kind":"p","text":"Такой комментарий — очень даже хорошо: методист дописал своё и поправил модель Если задание полностью верное (3/3) и все пункты зачтены — пояснение можно не отправлять."},{"kind":"h3","text":"Частично верно (+/–) округляем вверх"},{"kind":"p","text":"У модели с этим пока есть проблемы: 4,5 пункта она считает как 4. Обращайте на это внимание!"},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"2) надпочечники вырабатывают адреналин"},{"kind":"p","text":"3) синтез глюкозы"},{"kind":"label","text":"Комментарий модели"},{"kind":"p","text":"Элемент 3: Частично верно. Указано «синтез глюкозы» из скобок альтернативного варианта, но отсутствует «действие гормонов усиливает…» или «активируется глюконеогенез»."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"В ответе нет логической связи между адреналином и синтезом глюкозы — выглядит как несвязный текст. За пункт можно поставить +/– и переформулировать комментарий."},{"kind":"label","text":"Ваш финальный комментарий"},{"kind":"p","text":"Элемент 3: Частично верно. Указано «синтез глюкозы», но нет никакой связи с гормонами."},{"kind":"h3","text":"Что удалять изответа модели"},{"kind":"p","text":"Любые фразы модели вида «Ученик не указывает», «Ученик не использует» — удаляйте."},{"kind":"p","text":"Их присутствие в ваших комментариях скажется на оценке!"},{"kind":"p","text":"Иногда модель выдаёт мусор — обрывки слов, иероглифы. Такое тоже обязательно убирайте Если у ребёнка нет ответа на задание, сгенерированный комментарий не отправляйте."},{"kind":"p","text":"Просто спросите: «Возникли какие-то вопросы?Нужно помочь?Не бойся спрашивать!»"},{"kind":"h3","text":"Пустой ответ — комментарий модели не отправляем"},{"kind":"h3","text":"Что влияет на вашу оценку за проверки"},{"kind":"p","text":"О шибки в проверках— как часто вы завышаете или занижаете балл. Самый серьёзный показатель."},{"kind":"p","text":"Внимательность — вчитываетесь ли вы в комментарий модели или бездумно отправляете всё подряд."},{"kind":"p","text":"Отклонения от нейронки — пишете ли вы хоть иногда что-то от себя, понятен ли комментарий ребёнку."},{"kind":"p","text":"Скорость, указания на опечатки, обращение по имени — на балл влияют минимально, но пренебрегать ими не стоит. Особенно обращением по имени!"}]},{"title":"Оценивание второй части","blocks":[{"kind":"p","text":"Как оценивать задания второй части. Обязательно к подробному ознакомлению! Раздел разбит на подразделы по линиям — выберите нужный."},{"kind":"h3","text":"Где смотреть реальные ответы с экзамена"},{"kind":"p","text":"На платформе можно посмотреть реальные ответы детей с ЕГЭ и то, как их оценили эксперты. Это есть не у всех заданий — только у заданий с реального экзамена."},{"kind":"p","text":"Откройте банк заданий, введите в поиске «ЕГЭ-2026» (или «ЕГЭ-2025») и выберите нужную линию (22–28)."},{"kind":"p","text":"У задания нажмите «Решение» и откройте «Примеры ответов» — там ответ ученика и объяснение по пунктам, почему его оценили именно так."},{"kind":"p","text":"Поиск по банку: введите год экзамена и выберите линию"},{"kind":"h3","text":"«Примеры ответов» — под решением задания"},{"kind":"h3","text":"Так выглядит пример ответа с разбором по элементам"},{"kind":"p","text":"Эти примеры помогают разобраться в нюансах и оценивать максимально близко к реальному экзамену."},{"kind":"h3","text":"Жизненные циклы (линия 27)"},{"kind":"p","text":"Задачи на жизненные циклы и наборы хромосом на ЕГЭ сейчас не встречаются. Но если попадутся в домашке:"},{"kind":"p","text":"в задачах на набор хромосом всегда должны быть пояснения (почему на картинке та или иная фаза деления);"},{"kind":"p","text":"следите, чтобы ученики не путали «набор хромосом» (2n, 4n, 3n) и «количество хромосом» (46, 8, 16)."}]},{"title":"Биологические ошибки","blocks":[{"kind":"p","text":"За биологическую ошибку в дополнительной информации снимается 1 балл."},{"kind":"p","text":"Если же ошибка допущена в самом пункте ключа, этот пункт просто не засчитывается — дополнительно балл не снимается."},{"kind":"h3","text":"Ошибка в пункте ключа — балл не снимаем"},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Условие"},{"kind":"p","text":"В каких секретах клеток поджелудочной железы будет обнаружена радиоактивная метка?"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"«Клетки внутренней секреции выделяют гормоны (поджелудочная железа — глюкагон и инсулин), не являющиеся структурами белковой природы (белок состоит из аминокислот)»."},{"kind":"label","text":"Ключ"},{"kind":"p","text":"2) в гормонах (инсулин; глюкагон; соматостатин; грелин);"},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Ошибка «гормоны не являются белками» напрямую относится к пункту 2 ключа."},{"kind":"p","text":"Поэтому, хотя по сути ответ верный (метка будет в гормонах), пункт не засчитывается — он дан с биологической ошибкой. Но дополнительно балл за задание НЕ снимается."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Условие"},{"kind":"p","text":"Какие два метода использовались в эксперименте?"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"«Метод меченых атомов, хроматография»."},{"kind":"label","text":"Ключ"},{"kind":"p","text":"3) метод меченых атомов (авторадиография, радиоавтография, радиоизотопный метод);"},{"kind":"p","text":"4) центрифугирование."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Один метод назван верно (п. 3: +), второй — неверно (п. 4: –). Дополнительно балл не снимается."},{"kind":"p","text":"Ошибка в дополнительной информации — снимаем балл"},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Условие"},{"kind":"p","text":"Предположите, в какое время суток полушник активно накапливает малат в клетках. В какое время суток у полушника происходит активный распад малата?"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"2) Соответственно, распад малата у полушника лучше всего происходит днём и очень активно, поскольку водоросли в световую фазу фотосинтеза поглощают углекислый газ и его концентрация возле полушника невысокая (т. е. распад опережает синтез)."},{"kind":"label","text":"Ключ"},{"kind":"p","text":"2) ночью (в тёмное время суток) низкая конкуренция за растворённый в воде углекислый газ (в воде большое количество доступного углекислого газа);"},{"kind":"p","text":"3) разлагает (распадается) малат днём (в светлое время суток);"},{"kind":"p","text":"4) днём (в светлое время суток) активно протекает фотосинтез (для которого необходим углекислый газ);"},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Снят балл за дополнительную информацию с биологической ошибкой: углекислый газ фиксируется не в световую, а в темновую фазу фотосинтеза. В ключе нет пункта о поглощении углекислого газа, поэтому эта информация — дополнительная."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Условие"},{"kind":"p","text":"Какие морфологические особенности сформировались у китов в связи с водным образом жизни?"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"3) Наличие плавников для передвижения в воде, обтекаемая форма тела для уменьшения сопротивляемости течению, влажная кожа (у некоторых возможно покрыта слизью) для лёгкого передвижения в толще воды, уменьшения трения."},{"kind":"label","text":"Ключ"},{"kind":"p","text":"3) наличие хвостового плавника;"},{"kind":"p","text":"4) редукция задних конечностей;"},{"kind":"p","text":"5) видоизменение передних конечностей в ласты;"},{"kind":"p","text":"6) обтекаемая форма тела (ноздри, расположенные на темени);"},{"kind":"p","text":"7) формирование китового уса (цедильного аппарата);"},{"kind":"p","text":"8) толстый слой подкожной жировой клетчатки."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Ответ содержит биологическую ошибку: кожа китов не покрыта слизью (это признак рыб и амфибий). В ключе ничего нет про покровы кита — это дополнительная информация, поэтому балл снят."}]},{"title":"Линия 22","blocks":[{"kind":"p","text":"Линия хоть и шаблонная, но всё равно требует конкретики."},{"kind":"h3","text":"Зависимая и независимая переменные"},{"kind":"p","text":"В заданиях на определение переменных обязательно должны быть указаны обе переменные, иначе пункт не засчитывается."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"1) независимая переменная (задаваемая экспериментатором) — возраст курицы (порода);"},{"kind":"p","text":"зависимая переменная (изменяющаяся в эксперименте) — средняя яйценоскость;"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"Независимая переменная: порода кур. Зависимая: возраст курицы."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Пункт не засчитывается — неверно определена зависимая переменная."},{"kind":"h3","text":"Альтернативные формулировки"},{"kind":"p","text":"Синонимы и другие формулировки допустимы: если смысл пункта ключа передан верно — засчитываем."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"1) внутриутробное развитие плода (диаметр плаценты, длина и вес эмбриона) не зависит от наличия никотина (концентрации никотина) в воде;"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"Развитие эмбриона не зависит от наличия никотина."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Засчитываем: абсолютно верно передана суть нулевой гипотезы о независимости двух переменных."},{"kind":"h3","text":"Нулевая гипотеза: два варианта"},{"kind":"p","text":"Нулевую гипотезу всегда можно сформулировать и как «x не влияет на y», и как «y не зависит от x»."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"1) нулевая гипотеза 1 — дальность полёта насекомых (число пролетевших более 1000 м) не зависит от температуры;"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"Температура не влияет на число насекомых, пролетевших более километра."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Пункт засчитывается, хотя такая формулировка в ключе не отражена."},{"kind":"p","text":"Не во всех ключах отражены все варианты формулировок. В пункте 1 (определение переменных) допускается несколько вариантов, а в следующих пунктах они могут быть уже не перечислены."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"1) внутриутробное развитие плода (диаметр плаценты, длина и вес эмбриона) не зависит от наличия никотина (концентрации никотина) в воде;"},{"kind":"p","text":"4) зависимость между внутриутробным развитием плода и никотином в воде не удаётся установить в явном виде."},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"Длина эмбриона не зависит от концентрации никотина в воде; зависимость между длиной эмбриона и концентрацией никотина в воде не удаётся установить в явном виде."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Засчитываются оба пункта. Хотя в пункте 4 ключа перечислены не все формулировки переменных, логически ответ абсолютно верный."},{"kind":"h3","text":"Нелогичный ответ"},{"kind":"p","text":"Если ребёнок пишет несвязный ответ (сначала одни переменные, потом другие) — не засчитываем. Ответ должен быть логически связан, а здесь ребёнок показывает непонимание сути эксперимента. Лояльный эксперт на ЕГЭ может такое и засчитать, но в образовательных целях лучше сделать пометку и снять балл."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"1) внутриутробное развитие плода (диаметр плаценты, длина и вес эмбриона) не зависит от наличия никотина (концентрации никотина) в воде;"},{"kind":"p","text":"4) зависимость между внутриутробным развитием плода и никотином в воде не удаётся установить в явном виде."},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"Длина эмбриона не зависит от концентрации никотина в воде; зависимость между диаметром плаценты и концентрацией никотина в воде не удаётся установить в явном виде."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Пункт 4 ключа лучше не засчитывать — в ответе нет логической связи."},{"kind":"h3","text":"Комментарий ребёнку"},{"kind":"p","text":"Всё верно, но будь внимателен — в пункте 1 у тебя одна переменная, а дальше ты пишешь о другой. Балл снимаю: на ЕГЭ строгий эксперт тоже может снять."},{"kind":"h3","text":"Отрицательный контроль:уколы и растворы"},{"kind":"p","text":"В заданиях с отрицательным контролем, где животным делают уколы или вводят растворы, нужно обязательно повторить сам факт манипуляции с животным."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"3) следует ввести животным растворитель, в котором была растворена глюкоза (физиологический раствор);"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"Необходимо измерить уровень инсулина у крыс, которым не вводим глюкозу."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Не засчитывается: не указано, что животным нужно вводить растворитель (то есть проверить, не являются ли изменения реакцией на сам укол)."},{"kind":"h3","text":"Цель отрицательного контроля: два шаблона"},{"kind":"p","text":"Для пункта 4 в заданиях с отрицательным контролем допускаются два шаблона формулировки цели:"},{"kind":"p","text":"4) данный эксперимент позволяет установить, действительно ли [зависимая переменная] зависит от [независимой переменной] или"},{"kind":"p","text":"4) данный эксперимент позволяет проверить, насколько изменения в [зависимой переменной] обусловлены факторами, не связанными с [независимой переменной] Не во всех ключах есть оба варианта — следите за этим при оценивании. И то и другое — допустимое описание цели отрицательного контроля."},{"kind":"h3","text":"Последовательность ответа"},{"kind":"p","text":"Ответ может быть дан в другой последовательности или другими словами — главное, чтобы смысл не был искажён."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"3) у разных людей (групп) уровень глюкозы в крови может по-разному изменяться в зависимости от питания (приёма пищи, времени суток);"},{"kind":"p","text":"4) пища, различная по составу и принимаемая в разных количествах, может вызывать разные изменения в уровне глюкозы в крови;"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"Результаты могут быть недостоверными, т. к. из разной пищи может получиться разное кол- во глюкозы. В эксперименте участвовала одна и та же группа добровольцев, т. к. у разных людей могут быть разные показатели, а учёному нужно было выявить зависимость между уровнем глюкозы в крови и типом питания (т. е. во избежание погрешностей в эксперименте)."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Засчитываются и п. 3 (показано, что уровень глюкозы индивидуален), и п. 4 (показано, что уровень глюкозы зависит от пищи)."},{"kind":"h3","text":"Конкретика в ответе"},{"kind":"p","text":"Нужна конкретика: если в ключе «диаметр сужается», а у ребёнка «диаметр изменяется» и не сказано как — пункт не засчитываем."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"3) чем больше крысят в приплоде, тем меньше эмбрионы по размеру (длине) и массе (весу)"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"В зависимости от того, сколько детёнышей вынашивает крыса, её организм испытывает разную нагрузку, поэтому может работать немного, но по-другому (каждый организм индивидуален)."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Пункт 3 ключа не засчитывается."},{"kind":"p","text":"В пункте 4 (шаблонная формулировка) обязательно указывать, что именно является зависимой и независимой переменными. Просто «не удастся установить зависимость между переменными» засчитывать нельзя."},{"kind":"h3","text":"Конкретика в достоверности"},{"kind":"p","text":"В ответе о достоверности результатов тоже всегда нужна конкретика: ученик должен назвать, что именно повлияет и как (чаще всего — назвать эти факторы). Обычно это шаблонная фраза — рекомендуйте её ученикам."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"4) зависимость между внутриутробным развитием плода (диаметром плаценты, длиной и весом эмбрионов) и никотином (концентрацией никотина) в воде не удаётся установить в явном виде."},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"Соответственно, эксперимент не будет достоверным из-за развития крысят в отличающихся условиях."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Пункт 4 ключа не засчитывается — нет шаблонной формулировки."}]},{"title":"Линии 23, 25, 26","blocks":[{"kind":"p","text":"Сюда относятся задания с развёрнутым ответом по рисунку, тексту или данным."},{"kind":"p","text":"Главное — смысл ответа, а не совпадение слов с ключом."},{"kind":"h3","text":"Вариативность терминологии"},{"kind":"p","text":"Следите за грамотным употреблением терминов, но допускается вариативность терминологии по смыслу."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Условие"},{"kind":"p","text":"Какой буквой на графике обозначено растение-суккулент, обитающее в пустыне? Ответ поясните, исходя из особенностей физиологии растений."},{"kind":"label","text":"Ключ"},{"kind":"p","text":"2) буквой В;"},{"kind":"p","text":"3) растение не поглощает углекислый газ в дневное время суток;"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"Растение-суккулент обозначено буквой В, потому что поглощение углекислого газа происходит в темновой фазе фотосинтеза, а на графике показано интенсивное поглощение именно с 18:00 до 24:00."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Фразу можно зачесть как верный элемент — 18:00–24:00 уже не дневное время суток."},{"kind":"p","text":"Оба пункта засчитаны."},{"kind":"p","text":"Но мысль нужно доводить до конца и знать грань: любое событие нужно связать с тем, о чём спрашивают, и сделать логический вывод."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Условие"},{"kind":"p","text":"Какое физиологическое значение имеет такое расположение дыхалец?"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"1) через трахеи (дыхальца) происходит испарение влаги;"},{"kind":"p","text":"2) влага конденсируется на надкрыльях ИЛИ 2) влага хуже испаряется из-под надкрыльев (крыльев);"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"1) Дыхальца закрываются надкрыльями, что уменьшает испарение воды из организма жука."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Есть мысль о связи дыхалец и надкрыльев, но в явном виде не сказано, что именно через дыхальца испаряется вода. Пункт 1 не засчитывается."},{"kind":"h3","text":"Сложные пункты ключа (3; 4 ИЛИ 3; 4)"},{"kind":"p","text":"Следите за логичностью ответа: он должен соответствовать реальности, а не только словам из ключа."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Условие"},{"kind":"p","text":"У каких простейших и почему сократительные вакуоли могут отсутствовать?"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"4) у простейших, обитающих в морях (у паразитических простейших);"},{"kind":"p","text":"5) они обитают в среде с гипертонической (физиологической) концентрацией солей ИЛИ 5) концентрация солей в морской воде (во внутриорганизменной среде) равна или выше концентрации солей в клетках простейших (в цитоплазме простейших)."},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"Дизентерийная амёба живёт в организме в гипертонических условиях и не имеет необходимости в данном органоиде."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Пункт 5 не засчитывается, хотя все слова из ключа в ответе есть. Паразитическая дизентерийная амёба живёт в изотонической среде — сказать, что в гипертонической, будет ошибкой."},{"kind":"h3","text":"+/– за пункты ключа"},{"kind":"p","text":"Нет пояснения (только перечисление) — чаще всего засчитываем пункт как +/–. В новых заданиях 2024–2026 годов пояснение обычно вынесено отдельным пунктом ключа."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Условие"},{"kind":"p","text":"Какие особенности строения и жизнедеятельности позволяют им вести этот образ жизни?"},{"kind":"p","text":"Назовите не менее пяти пунктов. В чём заключается роль этих приспособлений?"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"1) органы прикрепления (присоски, крючья) позволяют закрепиться в органах хозяина;"},{"kind":"p","text":"2) покровы (тегумент) защищают от переваривания в теле хозяина;"},{"kind":"p","text":"3) всасывание питательных веществ всей поверхностью тела позволяет потреблять больше питательных веществ;"},{"kind":"p","text":"4) редукция не повышающих приспособленность систем органов (пищеварительной;"},{"kind":"p","text":"органов чувств) снижает расход энергии на работу этих систем;"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"У червей есть органы прикрепления, различные покрытия тела, но при этом они всасывают всей поверхностью тела. Вследствие этого редуцировалась пищеварительная система."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"По всем четырём пунктам ответ неполный — за каждый +/–. Итого два полных пункта."},{"kind":"h3","text":"Веер ответов: когда можно додумать ключ"},{"kind":"p","text":"Если какой-то функции, механизма или формулировки нет в ключе, а вы считаете, что они заслуживают там быть, — напишите старшему методисту, что в ключ стоит что-то добавить (особенно если ключ авторский). Это дополнительные баллы в рейтинг за активность."},{"kind":"p","text":"Формулировки не из ключа без искажения смысла (первичная продукция = органическое вещество растений, хорошая освещённость = лучше проникает свет и т."},{"kind":"p","text":"д.) допустимы всегда, если опираются на биологическую суть."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Условие"},{"kind":"p","text":"Как называется этот органоид и какие процессы с белками в нём происходили?"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"5) грЭПС (шероховатый ЭПР);"},{"kind":"p","text":"6) созревание (фолдинг; сворачивание) белка ИЛИ 6) модификация белка"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"Гранулярный эндоплазматический ретикулум; транспорт белков."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Транспорта белков в ключе нет, но это действительно функция шЭПС, и ответ отвечает на вопрос условия. Пункт засчитываем."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Условие"},{"kind":"p","text":"Используя схему пищевой цепи и данные по концентрации метилртути в морской среде, определите, у каких животных могли проявляться симптомы болезни Минамата."},{"kind":"label","text":"Ключ"},{"kind":"p","text":"2) при переходе на следующий трофический уровень концентрация метилртути увеличивается примерно в 10 раз"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"По правилу 10%, исходя из того, что продуценты содержат метилртуть 0,68 мг/кг, зоопланктон выедает продуцентов, метилртуть накапливается в содержании 6,8 мг/кг."},{"kind":"p","text":"Консументы 2-го порядка питаются зоопланктоном, метилртуть накапливается в содержании 68 мг/кг…"},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Правило 10% раскрыто в расчётах и показано в явном виде. Пункт засчитан."},{"kind":"h3","text":"Веер ответов: когда нельзя додумывать ключ"},{"kind":"p","text":"Проверяйте, действительно ли ответ попадает в этот «веер». Ключи 2024–2026 годов и так очень полные, веер в них избыточный."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Условие"},{"kind":"p","text":"Какие особенности строения скелета позвоночного животного, изображённого на рисунке, доказывают его наземное происхождение?"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"1) наличие пояса передних конечностей (лопатки);"},{"kind":"p","text":"2) свободная передняя конечность из трёх отделов: плеча, предплечья, кисти;"},{"kind":"p","text":"3) наличие рудиментарных костей тазового пояса;"},{"kind":"p","text":"4) рудименты свидетельствуют о наличии у предков задних конечностей;"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"Наличие семи шейных позвонков; наличие 5 отделов позвоночника; копчиковые позвонки."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Особенности строения скелета названы правильно, но они никак не доказывают наземное происхождение. Ни одна не засчитывается."},{"kind":"h3","text":"Важно читать условие"},{"kind":"p","text":"Смотрите, как сформулирован вопрос и действительно ли ответ ему соответствует."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Условие"},{"kind":"p","text":"Какие особенности строения жабр костных рыб обеспечивают эффективное насыщение крови кислородом?"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"3) большая площадь поверхности жабр (жаберных лепестков);"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"Большая площадь поверхности."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Не сказано, что именно жабры имеют большую площадь поверхности, но это и не требуется — вопрос изначально про строение жабр. Засчитываем."},{"kind":"h3","text":"Анализируем ответ комплексно"},{"kind":"p","text":"Допускается иной порядок изложения без искажения биологической сути. Ищите элементы ответа во всём тексте, а не только «под своим номером»."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Условие"},{"kind":"p","text":"Как связано наличие складок со средой обитания амфибии? В чём причина такого поведения?"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"1) в холодной воде высокая растворимость кислорода ИЛИ 1) в атмосферном воздухе недостаточно кислорода (атмосферный воздух разрежен; низкое парциальное давление кислорода);"},{"kind":"p","text":"4) активные движения позволяют обогащённой кислородом воде омыть кожу ИЛИ 4) активные движения позволяют свистуну согреться;"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"1) Титикакский свистун обитает в высокогорном озере Титикака на высоте 3800 м над уровнем моря."},{"kind":"p","text":"2) Наличие большого количества складок на теле связано с увеличением таким образом площади поверхности тела."},{"kind":"p","text":"3) Из-за увеличения площади поверхности тела у свистуна развита капиллярная сеть сосудов, благодаря чему у него интенсивнее происходит газообмен."},{"kind":"p","text":"4) Это необходимо из-за того, что на высоте 3800 м над уровнем моря воздух разряжен и количество кислорода низкое."},{"kind":"p","text":"5) Расправление конечностей и активное движение телом необходимо для расправления кожных складок и более лёгкого газообмена на поверхности тела."},{"kind":"p","text":"6) Резкое увеличение одноклеточных водорослей приводит к снижению количества кислорода в водоёме."},{"kind":"p","text":"7) Ночью свистун не двигается активно."},{"kind":"p","text":"8) В ночное время множество свистунов погибает от недостатка кислорода."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Первый пункт ключа — в п. 4 ответа: анализируем целиком! Фразу «активное движение телом необходимо для расправления кожных складок и более лёгкого газообмена» тоже можно зачесть как элемент «активные движения позволяют обогащённой кислородом воде омыть кожу» — это обоснование того, зачем свистун резко двигается."},{"kind":"h3","text":"Доказательство от противного — засчитываем"},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Условие"},{"kind":"p","text":"Предположите, в какое время суток полушник активно накапливает малат в клетках."},{"kind":"label","text":"Ключ"},{"kind":"p","text":"1) накапливает малат ночью (в тёмное время суток);"},{"kind":"p","text":"2) ночью (в тёмное время суток) низкая конкуренция за растворённый в воде углекислый газ (в воде большое количество доступного углекислого газа);"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"1) Малат накапливается в ночное время."},{"kind":"p","text":"2) В дневное время суток водоросли активно фиксируют углекислый газ (концентрация углекислого газа в воде становится низкой). Фотосинтез идёт только при наличии света, поэтому ночью малат накапливается в полушнике, чтобы быть использованным днём."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Из ответа явно следует: раз днём углекислого газа в воде мало, ночью его концентрация выше — водоросли его не фиксируют. Пункты 1 и 2 засчитываются."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Условие"},{"kind":"p","text":"Количество мышечных волокон в двигательной единице будет меньше в нижней косой глазодвигательной или в икроножной мышце?"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"Количество мышечных волокон в двигательной единице будет меньшим в нижней косой глазодвигательной мышце;"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"Количество мышечных волокон будет больше в икроножной мышце."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Засчитываем: если в икроножной мышце волокон больше, значит, в глазодвигательной — меньше."}]},{"title":"Линия 24","blocks":[{"kind":"p","text":"В линии 24 крайне важно правильно определить объект или процесс на рисунке. Просят определить один, два или три объекта — от этого зависят правила оценивания."},{"kind":"p","text":"Синонимичные термины засчитываются: стрекающие = кишечнополостные, пастбищная цепь = цепь выедания."},{"kind":"h3","text":"Один объект"},{"kind":"p","text":"Объект определён неверно и хотя бы один из остальных пунктов неверен — 0 баллов за всё задание."},{"kind":"p","text":"Объект определён неверно, но ВСЕ остальные пункты ключа есть — 1 балл."},{"kind":"h3","text":"Два объекта"},{"kind":"p","text":"Неверно определён один объект — оцениваем по разбалловке, но 3/3 поставить нельзя (максимум 2 балла — если все остальные пункты есть)."},{"kind":"p","text":"Неверно определены оба объекта — 0 баллов."},{"kind":"h3","text":"Три объекта"},{"kind":"p","text":"Неверно определён один — оцениваем по разбалловке, но 3/3 поставить нельзя."},{"kind":"p","text":"Неверно определены два — максимум 1 балл, и только если по числу засчитанных пунктов вышло бы 2–3 балла."},{"kind":"p","text":"Неверно определены все три — максимум 1 балл, и только если все остальные пункты верны."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"1) 1 — зародыш;"},{"kind":"p","text":"2) образуется из зиготы;"},{"kind":"p","text":"3) из него развивается новое растение (спорофит);"},{"kind":"p","text":"4) 2 — семенная кожура;"},{"kind":"p","text":"5) формируется из покровов семязачатка (интегументов);"},{"kind":"p","text":"6) защищает зародыш от механических повреждений, высыхания, проникновения микроорганизмов;"},{"kind":"p","text":"7) 3 — эндосперм;"},{"kind":"p","text":"8) формируется из оплодотворённой центральной клетки зародышевого мешка;"},{"kind":"p","text":"9) содержит запас питательных веществ для развития зародыша."},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"1 — гипокотиль; образуется из зиготы; обеспечивает развитие будущего растения (спорофита);"},{"kind":"p","text":"2 — семенная кожура; формируется из стенки завязи; защищает зародыш от механических повреждений и высыхания;"},{"kind":"p","text":"3 — центральная клетка; формируется из оплодотворённой центральной клетки зародышевого мешка; обеспечивает питание зародыша."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Засчитано 6 пунктов из 9 (2, 3, 4, 6, 8, 9). Неверно определены 2 структуры из 3: 1 — не гипокотиль, а зародыш; 3 — не центральная клетка, а эндосперм. Пункт 5 тоже неверен:"},{"kind":"p","text":"семенная кожура образуется из интегументов, а не из стенки завязи. По числу пунктов вышло бы 2 балла, но при двух неверно определённых структурах — максимум 1 балл."},{"kind":"p","text":"Остальные нюансы — как в линиях 23, 25, 26."}]},{"title":"Линия 27 · Биосинтез белка","blocks":[{"kind":"p","text":"Самое важное здесь — оформление: запятые, тире и штрих-концы. Ниже — что засчитываем, а что нет."},{"kind":"h3","text":"Оформление"},{"kind":"p","text":"Триплеты внутри одной молекулы ДНК, иРНК или тРНК нельзя разделять запятой — за это сразу снимается 1 балл."},{"kind":"p","text":"Запятой разделяются только антикодоны тРНК: одна молекула тРНК несёт один антикодон, а «антикодоны» во множественном числе — это несколько молекул, поэтому, как при любом перечислении, ставим запятые. Слитное написание антикодонов тРНК не засчитываем ни в коем случае."},{"kind":"p","text":"Нуклеотиды одной молекулы ДНК, иРНК или тРНК можно записывать слитно (АТЦГТАААЦГТЦ), через тире (А-Т-Ц-Г-Т-А-А-А-Ц-Г-Т-Ц) или триплетами через тире (АТЦ–ГТА–ААЦ–ГТЦ). Деление на триплеты через тире разрешено методичкой для экспертов (её можно скачать на сайте ФИПИ). Но если ребёнок боится, что за это всё же снимут балл, рекомендуйте писать слитно, без знаков препинания (кроме антикодонов тРНК и аминокислот)."},{"kind":"p","text":"Аминокислоты в белке пишутся через тире и без штрих-концов. Ставить между ними «;», «,» или просто пробелы нельзя."},{"kind":"p","text":"Писать «по принципу комплементарности / антипараллельности» не обязательно."},{"kind":"p","text":"Делить последовательности на триплеты детям не рекомендуем: это мешает решению и затрудняет поиск рамки считывания."},{"kind":"p","text":"Штрих-концы 5’- и 3’-концы нуклеиновых кислот должны стоять верно. Если они перепутаны или опущены — этот элемент не засчитываем (остальные верные элементы засчитать можно)."},{"kind":"p","text":"У аминокислотной последовательности штрих-концов быть не может. Запись 5’- лей-ала-гли-глу-3’ — очень грубая ошибка, такой пункт не засчитывается."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"открытая рамка считывания иРНК: 5’-АУГЦГАУАЦГЦГЦАУЦГ-3’"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"открытая рамка считывания иРНК: АУГЦГАУАЦГЦГЦАУЦГ"},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Не засчитывается: у полинуклеотидной цепи нет штрих-концов."},{"kind":"p","text":"У отдельных триплетов штрих-концы можно опустить (хотя рекомендуем писать их всегда и везде). Без штрих-концов засчитываем только триплеты, записанные в направлении 5’→3’:"},{"kind":"p","text":"АУГ можно засчитать как 5’-АУГ-3’;"},{"kind":"p","text":"ГУА можно засчитать как 3’-АУГ-5’;"},{"kind":"p","text":"АУГ нельзя засчитать как 3’-АУГ-5’."},{"kind":"p","text":"Палиндром, ОРС или РНК (любую цепь длиннее 3 нуклеотидов) без штрих-концов не засчитываем!"},{"kind":"h3","text":"Зеркальная запись"},{"kind":"p","text":"Любую полинуклеотидную цепь можно записать зеркально: 5’-ГГГГГГААААААУУУУУУ-3’ — то же самое, что 3’-УУУУУУААААААГГГГГГ-5’."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"открытая рамка считывания иРНК: 5’-АУГЦГАУАЦГЦГЦАУЦГ-3’"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"открытая рамка считывания иРНК: 3’-ГЦУАЦГЦГЦАУАГЦГУА-5’"},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Засчитывается — иРНК записана абсолютно верно, просто в обратном направлении."},{"kind":"h3","text":"Описки в последовательности"},{"kind":"p","text":"Оценивайте на своё усмотрение. Если это единичная описка, а остальное решение логически верно и не искажено (из-за описки неверна только одна аминокислота), снижаем балл только за элемент с неверным нуклеотидом — то есть за пункт, где просят последовательность нуклеотидов."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"3) открытая рамка считывания иРНК: 5’-АУГАУУЦУУУЦГААГ-3’;"},{"kind":"p","text":"4) последовательность полипептида: мет-иле-лей-сер-лиз."},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"3) открытая рамка считывания иРНК: 5’-АУГЦУУЦУУУЦГААГ-3’"},{"kind":"p","text":"4) последовательность полипептида: мет-лей-лей-сер-лиз."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Из-за описки в рамке считывания не засчитывается только пункт 3."},{"kind":"p","text":"Открытая рамка считывания должна быть подписана Если в задании просят указать открытую рамку считывания (ОРС), это обязательно."},{"kind":"p","text":"Просто подчеркнуть недостаточно: в ключах всегда пишут «или указана и подписана в последовательности РНК / на вторичной структуре». Ученик должен подчеркнуть ОРС и подписать рядом «открытая рамка считывания» либо выписать её отдельным пунктом."},{"kind":"p","text":"Иначе пункт не засчитывается."},{"kind":"h3","text":"ОРС не подписана"},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"2) открытая рамка считывания: 5’-АУГЦГГГАУЦАУУЦГ-3’ (или указана и подписана в последовательности иРНК);"},{"kind":"p","text":"3) последовательность аминокислот: мет-арг-асп-гис-сер."},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"1) иРНК: 5’-ГЦАУГЦГГГАУЦАУУЦГГ-3’"},{"kind":"p","text":"2) 5’-АУГ ЦГГ ГАУ ЦАУ УЦГ-3’"},{"kind":"p","text":"3) мет-арг-асп-гис-сер"},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"ОРС выписана отдельной строкой, но нигде не подписана как открытая рамка считывания — пункт 2 не засчитывается. Её нужно подписать «ОРС / открытая рамка считывания» либо выделить на цепи иРНК и подписать. Пункт 3 засчитывается."},{"kind":"h3","text":"1–2 нуклеотида, не кодирующие аминокислоту"},{"kind":"p","text":"Бывает, что аминокислоты у ребёнка верные, а в ОРС по краям не хватает 1–2 нуклеотидов. Чаще всего это не ошибка! Баллы не снижаем, но советуем ребёнку выписывать в ОРС и «лишние» нуклеотиды, которые не кодируют аминокислоту в рамках задачи."},{"kind":"h3","text":"Фрагмент рамки"},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"3) фрагмент открытой рамки считывания: 5’-ГЦААЦЦУГЦУУЦУ-3’"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"h3","text":"В ОРС ребёнка не хватает крайнего нуклеотида У"},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"ОРС засчитывается, несмотря на отсутствие крайнего нуклеотида У."},{"kind":"h3","text":"Комментарий ребёнку"},{"kind":"p","text":"Привет! Засчитываю твою ОРС, но будь внимательнее — стоит выписывать и те нуклеотиды, которые не образуют полноценный триплет в данной рамке. Рамка ведь не обрывается стоп-кодоном — нам дан всего лишь её фрагмент."},{"kind":"p","text":"! Скобки в ключе вокруг «лишних» нуклеотидов нужны только эксперту — ученику писать их НЕ нужно. Если ребёнок пишет запись со скобками, балл не снимайте, но обязательно скажите ему об этом."},{"kind":"h3","text":"Фрагмент конца гена"},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"6) открытая рамка считывания иРНК: 5’-ЦГАУАЦГЦГЦАУЦГУАГ-3’"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"Последовательность конца открытой рамки считывания 5’-АУАЦГЦГЦАУЦГУАГ-3’"},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"ОРС засчитывается, несмотря на отсутствие крайних нуклеотидов ЦГ."},{"kind":"h3","text":"Комментарий ребёнку"},{"kind":"p","text":"Привет! Засчитываю твою ОРС, но будь внимательнее — стоит выписывать и те нуклеотиды, которые не образуют полноценный триплет в данной рамке. Нам дан всего лишь фрагмент рамки — он не начинается со старт-кодона."},{"kind":"p","text":"Палиндромы: «хвостики» за пределами комплементарныхучастков Ученик должен изображать полную вторичную структуру — вместе с неспаренными нуклеотидами на концах цепи. Если их нет, пункт со вторичной структурой не засчитывается."},{"kind":"h3","text":"Нет концевых нуклеотидов"},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Условие"},{"kind":"p","text":"Фрагмент иРНК имеет последовательность 5’-УЦУАЦГЦЦУАЦГУГГЦГУАА-3’. Определите участок, способный образовать шпильку (палиндром), и изобразите вторичную структуру фрагмента."},{"kind":"label","text":"Ключ"},{"kind":"p","text":"2) вторичная структура фрагмента — вместе с неспаренными концевыми нуклеотидами 5’- УЦ и 3’-А:"},{"kind":"p","text":"5’– У"},{"kind":"h3","text":"3’– А"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"А"},{"kind":"h3","text":"У"},{"kind":"h3","text":"У"},{"kind":"h3","text":"А"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"У Г"},{"kind":"h3","text":"У А"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"3’– А"},{"kind":"h3","text":"5’– У"},{"kind":"h3","text":"У"},{"kind":"h3","text":"А"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"У Г"},{"kind":"h3","text":"У А"},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Шпилька изображена верно, но нет неспаренных концевых нуклеотидов 5’-УЦ и 3’-А."},{"kind":"p","text":"Пункт 2 ключа не засчитывается."},{"kind":"h3","text":"Допустимые варианты оформления палиндромов"},{"kind":"p","text":"Водородные связи можно обозначать точками или чёрточками — одной или по числу связей (две для А–У, три для Г–Ц). Дефисы между нуклеотидами — по желанию, петлю можно рисовать в любой форме. Всё это допустимо:"},{"kind":"h3","text":"У Г"},{"kind":"h3","text":"Ц"},{"kind":"p","text":"У А 5’– У – Ц– У – А– Ц– Г – Ц– Ц 3’– А– А– У – Г – Ц– Г – Г 5’– У"},{"kind":"h3","text":"3’– А"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"А"},{"kind":"h3","text":"У"},{"kind":"h3","text":"У"},{"kind":"h3","text":"А"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"У Г"},{"kind":"p","text":"У А 5’– У – Ц– У – А– Ц– Г – Ц– Ц"},{"kind":"h3","text":"3’– А– А– У – Г – Ц– Г – Г"},{"kind":"h3","text":"У Г"},{"kind":"h3","text":"Ц"},{"kind":"p","text":"У А 5’– У"},{"kind":"h3","text":"3’– А"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"А"},{"kind":"h3","text":"У"},{"kind":"h3","text":"У"},{"kind":"h3","text":"А"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"У Г"},{"kind":"p","text":"У А 5’– У"},{"kind":"h3","text":"3’– А"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"А"},{"kind":"h3","text":"У"},{"kind":"h3","text":"У"},{"kind":"h3","text":"А"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"У Г"},{"kind":"p","text":"У А 5’– У"},{"kind":"h3","text":"3’– А"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"А"},{"kind":"h3","text":"У"},{"kind":"h3","text":"У"},{"kind":"h3","text":"А"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Г"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"Ц"},{"kind":"h3","text":"У Г"},{"kind":"h3","text":"У А"},{"kind":"p","text":"Огромные ключи: 2 варианта решения и 7 пунктов Такие ключи (например, задание 75119) — недоработка составителей ЕГЭ, попытавшихся сделать максимально инклюзивное решение."},{"kind":"p","text":"У большинства таких ключей на платформе есть примечание: если сразу верно определены расположение искомых кодонов, открытая рамка считывания и матричная цепь (без поиска смысловой), по которой найден верный белок, ставится максимальный балл."},{"kind":"p","text":"Но наугад определить верную цепь, отметить старт-кодон и кодон искомой аминокислоты, выписать ОРС и аминокислоты недостаточно для 3/3 — ход решения должен быть обоснован."},{"kind":"h3","text":"Пример Полное обоснование — 3/3"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"1) аминокислоте мет соответствует кодон 5’-АУГ-3’ и, соответственно, триплет на матричной цепи ДНК 3’-ТАЦ-5’;"},{"kind":"p","text":"2) такой триплет присутствует в обеих цепях ДНК;"},{"kind":"p","text":"3) аминокислоте ала соответствует кодон иРНК 5’-ГЦ_-3’ и, соответственно, триплет на матричной цепи ДНК 3’-ЦГ_-5’ (5’-_ГЦ-3’);"},{"kind":"p","text":"4) такой триплет присутствует только на верхней цепи ДНК;"},{"kind":"p","text":"5) следовательно, верхняя цепь матричная;"},{"kind":"p","text":"6) открытая рамка считывания иРНК: 5’-АУГЦГАУАЦГЦГЦАУЦГ-3’ (может быть указана полная иРНК, на которой отмечена рамка считывания);"},{"kind":"p","text":"7) фрагмент полипептида: мет-арг-тир-ала-гис."},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"ДНК: 5’-ЦГАТГЦГЦГТАТЦГЦАТТТАЦГАГЦ-3’"},{"kind":"h3","text":"3’-ГЦТАЦГЦГЦАТАГЦГТАААТГЦТЦГ-5’"},{"kind":"p","text":"Аминокислоту мет кодирует кодон иРНК 5’-АУГ-3’, а аминокислоту ала — кодоны 5’-ГЦУ-3’, 5’-ГЦЦ-3’, 5’-ГЦА-3’, 5’-ГЦГ-3’ — по таблице генетического кода."},{"kind":"p","text":"Этим кодонам соответствуют триплеты ДНК 3’-ТАЦ-5’, 3’-ЦГА-5’, 3’-ЦГГ-5’, 3’-ЦГТ-5’, 3’- ЦГЦ-5’ — по принципу комплементарности."},{"kind":"p","text":"Триплеты 3’-ТАЦ-5’ и 3’-ЦГЦ-5’ расположены в верхней цепи → верхняя цепь транскрибируемая (матричная), нижняя — смысловая."},{"kind":"p","text":"иРНК: 5’-ГЦУЦГУАААУГЦГАУАЦГЦГЦАУЦГ-3’ — по принципу комплементарности. Синтез начинается с аминокислоты мет (с 9-го нуклеотида)."},{"kind":"p","text":"Аминокислотная последовательность: мет-арг-тир-ала-гис — по таблице генетического кода."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"В ответе нет пункта 2, а пункты 4 и 5 неполные, но ход и порядок получения правильного ответа полностью обоснованы. Оценка — 3/3."},{"kind":"h3","text":"Пример Альтернативный способ решения — 2/3"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"1) если матричная цепь нижняя (смысловая цепь верхняя), то последовательность иРНК: 5’- ЦГАУГЦГЦГУАУЦГЦАУУУАЦГАГЦ-3’;"},{"kind":"p","text":"2) аминокислоте мет соответствует кодон 5’-АУГ-3’;"},{"kind":"p","text":"3) открытая рамка считывания: 5’-АУГЦГЦГУАУЦГЦАУУУАЦГАГЦ-3’ (или обозначена и подписана на иРНК);"},{"kind":"p","text":"4) данная рамка считывания не содержит кодонов, кодирующих аминокислоту ала (кодонов ГЦУ, ГЦЦ, ГЦА или ГЦГ; кодоны указывать не обязательно);"},{"kind":"p","text":"5) если матричная цепь верхняя (смысловая цепь нижняя), то последовательность иРНК: 3’- ГЦУАЦГЦГЦАУАГЦГУАААУГЦУЦГ-5’ ИЛИ 5’-ГЦУЦГУАААУГЦГАУАЦГЦГЦАУЦГ-3’;"},{"kind":"p","text":"6) открытая рамка считывания: 5’-АУГЦГАУАЦГЦГЦАУЦГ-3’ (или обозначена и подписана на иРНК);"},{"kind":"p","text":"7) фрагмент полипептида: мет-арг-тир-ала-гис."},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"1) Аминокислоте МЕТ соответствует кодон 5’-АУГ-3’."},{"kind":"p","text":"2) Аминокислоте АЛА соответствуют кодоны 5’-ГЦУ-3’; 5’-ГЦЦ-3’; 5’-ГЦА-3’; 5’-ГЦГ-3’."},{"kind":"p","text":"3) Верхняя цепь является матричной ДНК, потому что на иРНК, синтезируемой на основе нижней матричной ДНК, есть аминокислота мет, кодируемая 5’-АУГ-3’, а также есть аминокислота АЛА, которая находится в открытой рамке считывания."},{"kind":"p","text":"4) Нижняя цепочка не является матричной ДНК, в открытой рамке считывания отсутствует аминокислота АЛА."},{"kind":"p","text":"иРНК: 5’-ГЦУЦГУАААУГЦГАУАЦГЦГЦАУЦГ-3’"},{"kind":"h3","text":"Открытая рамка считывания: 5’-АУГЦГАУАЦГЦГЦАУЦГ-3’"},{"kind":"p","text":"Последовательность аминокислот: мет-арг-тир-ала-гис."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Нет достаточного обоснования, почему нижняя цепь не матричная: иРНК с неё не построена и не показано отсутствие нужных кодонов. Кроме того, ошибка в формулировке: в открытой рамке не аминокислоты, а кодоны. Оценка — 2/3."},{"kind":"h3","text":"Сдвиг рамки считывания"},{"kind":"p","text":"Если ребёнок выписывает новую ОРС, удаляя первый нуклеотид стоп-кодона (после которого рамка сдвигается), — это биологическая ошибка: делеции не происходит, рибосома просто пропускает нуклеотид. Снимается балл (либо не засчитывается пункт с рамкой)."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"1) нуклеотидная последовательность иРНК: 5’-ЦУГААУГУГГГГЦУААЦУГЦГУА-3’"},{"kind":"p","text":"2) аминокислоте мет соответствует кодон 5’-АУГ-3’;"},{"kind":"p","text":"3) в рамке считывания имеется стоп-кодон 5’-УАА-3’;"},{"kind":"p","text":"4) происходит сдвиг рамки считывания до кодона 5’-ААЦ-3’;"},{"kind":"p","text":"5) последовательность аминокислот в полипептиде: мет-три-гли-асн-цис-вал."},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"1)–4) — как в ключе;"},{"kind":"p","text":"5) открытая рамка считывания становится 5’-АУГУГГГГЦААЦУГЦГУА-3’;"},{"kind":"p","text":"6) последовательность аминокислот в полипептиде: мет-три-гли-асн-цис-вал."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Ребёнок выписал ОРС, удалив из неё нуклеотид, который пропускается рибосомой. Это грубая ошибка (делеции не происходит) — снимается балл."}]},{"title":"Линия 27 · Харди — Вайнберг","blocks":[{"kind":"p","text":"Сложность задач на закон Харди — Вайнберга не только в оформлении: многие задачи решаются несколькими способами. Если числа у ребёнка сходятся с ключом, а ход решения — нет, задумайтесь, точно ли стоит снижать балл."},{"kind":"p","text":"Проверьте, не решал ли ребёнок альтернативным способом: числа просто так не сходятся."},{"kind":"h3","text":"Оформление без символов"},{"kind":"p","text":"Сокращённые корректные обозначения («частота а», «частота аа», «частота рецессивного аллеля») засчитываем."},{"kind":"p","text":"Писать «равновесная» не обязательно."},{"kind":"p","text":"p², q² и т. п. — по желанию. Но если ребёнок вводит эти обозначения, он обязан пояснить, что они значат (p — частота аллеля А и т. д.), иначе пункт не засчитывается."},{"kind":"p","text":"Пояснить можно один раз в начале в виде легенды, а дальше считать с символами."},{"kind":"h3","text":"Пример Без общепринятых символов — 3/3"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"1) частота рецессивных гомозигот (аа; особей с жёлтой окраской) в изначальной популяции составляет 35/1000 = 0,035;"},{"kind":"p","text":"2) частота рецессивного аллеля (а) в изначальной популяции: q = √0,035 = 0,1871;"},{"kind":"p","text":"3) частота доминантного аллеля (А) в изначальной популяции: р = 1 − 0,1871 = 0,8129;"},{"kind":"p","text":"4) частота доминантных гомозигот (АА; голубые) в изначальной популяции: 0,8129² = 0,6608;"},{"kind":"p","text":"5) после гибели 50% голубых особей в популяции осталось 0,6696 особей (66,96%; 0,6696 = 1 − 0,6608 · 0,5);"},{"kind":"p","text":"6) частота голубых особей сразу после гибели 50% доминантных гомозигот: 0,3304 / 0,6696 = 0,4934;"},{"kind":"p","text":"7) частота особей с промежуточной окраской: 0,3042 / 0,6696 = 0,4543;"},{"kind":"p","text":"8) частота особей с жёлтой окраской: 0,035 / 0,6696 = 0,0523 (ИЛИ 1 − 0,4934 − 0,4543 = 0,0523)."},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"1) Частота рецессивных гомозигот: 35/1000 = 0,035."},{"kind":"p","text":"2) Частота рецессивного аллеля (а): √0,035 = 0,1871."},{"kind":"p","text":"3) Частота доминантного аллеля (А): 1 − 0,1871 = 0,8129."},{"kind":"p","text":"4) Частота доминантных гомозигот: 0,8129² = 0,6608."},{"kind":"p","text":"5) Частота доминантных гомозигот после отлова: 0,3304 / 0,6696 = 0,4934."},{"kind":"p","text":"6) Частота гетерозигот после отлова: 0,3042 / 0,6696 = 0,4543."},{"kind":"p","text":"7) Частота рецессивных гомозигот после отлова: 0,035 / 0,6696 = 0,0523."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Ребёнок не использует общепринятые обозначения закона Харди — Вайнберга, но получает полностью верный и логически обоснованный ответ — 3/3."},{"kind":"h3","text":"Математическое обоснование чисел"},{"kind":"p","text":"Ответ без расчётов допустим — именно так оформлены ключи 2026 года. Но рекомендуйте прописывать, как получено каждое число: если ребёнок что-то неправильно посчитал или разделил — это ошибка. Старые ключи подробнее, но оценивайте по образцу ключей 2026 года."},{"kind":"h3","text":"Только итоговые числа — засчитываем"},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"1) частота рецессивных гомозигот (аа; особей с жёлтой окраской) в изначальной популяции составляет 70/1000 = 0,07;"},{"kind":"p","text":"2) частота рецессивного аллеля (а): q = √0,07 = 0,2646;"},{"kind":"p","text":"3) частота доминантного аллеля (А): р = 1 − 0,2646 = 0,7354;"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"4) Частота особей с жёлтой окраской в исходной популяции составляет 0,07."},{"kind":"p","text":"5) Частота рецессивного аллеля (а) в исходной популяции составляет 0,2646."},{"kind":"p","text":"6) Частота доминантного аллеля (А) в исходной популяции составляет 0,7354."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Пункты засчитываются по образцу ключей 2026 года. Важно найти правильное число и указать, чему оно соответствует."},{"kind":"h3","text":"Идеально"},{"kind":"p","text":"Есть верные расчёты, показан ход действий."},{"kind":"h3","text":"Допустимо"},{"kind":"p","text":"Расчётов нет, только итоговые числа."},{"kind":"h3","text":"Не засчитываем"},{"kind":"p","text":"Числа верные, но получены неверными рассуждениями — по удачному совпадению."},{"kind":"h3","text":"Частота аллеля ≠ частота генотипа"},{"kind":"p","text":"Важно не путать частоту аллеля и частоту генотипа — такие пункты не засчитываются."},{"kind":"h3","text":"Пример Перепутаны частоты — 0/3"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"1) частота рецессивных гомозигот (аа; особей с жёлтой окраской) в изначальной популяции:"},{"kind":"p","text":"90/1000 = 0,09;"},{"kind":"p","text":"2) частота рецессивного аллеля (а): q = √0,09 = 0,3;"},{"kind":"p","text":"3) частота доминантного аллеля (А): р = 1 − 0,3 = 0,7;"},{"kind":"p","text":"4) частота доминантных гомозигот (АА; голубые): 0,7² = 0,49;"},{"kind":"p","text":"5) после гибели 30% голубых особей осталось 0,853 особей (85,3%; 0,853 = 1 − 0,49 · 0,3);"},{"kind":"p","text":"6) частота голубых особей сразу после гибели: 0,343 / 0,853 = 0,4021;"},{"kind":"p","text":"7) частота особей с промежуточной окраской: 0,42 / 0,853 = 0,4924;"},{"kind":"p","text":"8) частота особей с жёлтой окраской: 0,09 / 0,853 = 0,1055 (ИЛИ 1 − 0,4021 − 0,4924 = 0,1055)."},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"1) Частота рецессивного аллеля (а), отвечающего за жёлтый цвет, в равновесной популяции:"},{"kind":"p","text":"a = q = 90/1000 = 0,09."},{"kind":"p","text":"2) Частота доминантного аллеля (А), отвечающего за голубую окраску: A = p = 1 − q = 1 − 0,09 = 0,91."},{"kind":"p","text":"3) Частота особей с голубой окраской (АА): AA = p² = 0,91² = 0,8281."},{"kind":"p","text":"4) Частота особей с жёлтой окраской (аа): aa = q² = 0,09² = 0,0081."},{"kind":"p","text":"5) Частота голубых после отлова хищниками: 0,7 · 0,8281 = 0,57967 ≈ 0,5797."},{"kind":"p","text":"6) Частота жёлтых после отлова остаётся прежней: 0,0081."},{"kind":"p","text":"7) Частота промежуточной окраски (Аа) после отлова: 1 − q² − p² = 2pq: 1 − 0,0081 − 0,5797 = 0,4122."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Ребёнок перепутал частоту аллеля и частоту генотипа: 0,09 — это частота генотипа аа, а не аллеля а. Всё дальнейшее решение из-за этого неверное — 0/3."},{"kind":"h3","text":"Гибель или прибавление особей («5-й элемент"},{"kind":"h3","text":"Федорова»)"},{"kind":"p","text":"После выхода популяции из равновесия (гибели части особей или добавления новых) закон Харди — Вайнберга не действует. Поэтому p², q², 2pq в тексте, извлечение корня и возведение в квадрат на этом этапе — ошибка."},{"kind":"p","text":"Пример Символика в неравновесной популяции — не засчитываем Задание"},{"kind":"h3","text":"75117 в банке заданий"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"1) частота рецессивных гомозигот (аа; жёлтые): 100/1000 = 0,1;"},{"kind":"p","text":"2) частота рецессивного аллеля (а): q = √0,1 = 0,3162;"},{"kind":"p","text":"3) частота доминантного аллеля (А): р = 1 − 0,3162 = 0,6838;"},{"kind":"p","text":"4) частота доминантных гомозигот (АА; зелёные): 0,6838² = 0,4676;"},{"kind":"p","text":"5) после гибели 40% зелёных особей в популяции осталось 0,8130 особей (81,30%; 0,8130 = 1 − 0,4676 · 0,4);"},{"kind":"p","text":"6) частота зелёных сразу после гибели: 0,2806 / 0,8130 = 0,3451;"},{"kind":"p","text":"7) частота особей с промежуточной окраской: 0,4324 / 0,8130 = 0,5319;"},{"kind":"p","text":"8) частота жёлтых: 0,1 / 0,8130 = 0,1230 (ИЛИ 1 − 0,3451 − 0,5319 = 0,1230)."},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"1) Частота жёлтых (аа) агам в равновесной популяции: q²(аа) = 100 : 1000 = 0,1."},{"kind":"p","text":"2) Частота рецессивного аллеля (а): q(a) = √0,1 = 0,3162."},{"kind":"p","text":"3) Частота доминантного аллеля (А): p(A) = 1 – 0,3162 = 0,6838."},{"kind":"p","text":"4) Частота зелёных (АА) агам: p²(АА) = 0,6838² = 0,4676."},{"kind":"p","text":"5) Частота жёлто-зелёных (Аа): 2pq(Аа) = 2 · 0,3162 · 0,6838 = 0,4324."},{"kind":"p","text":"После отлова хищниками:"},{"kind":"p","text":"1) Частота зелёных (АА): p² · 0,4 = 0,4676 · 0,4 = 0,187."},{"kind":"p","text":"2) Частота рецессивных гомозигот и гетерозигот: q² + 2pq = 1 – 0,187 = 0,813."},{"kind":"p","text":"3) Частота жёлтых (аа) теперь: q² = 0,1 / 0,813 = 0,123."},{"kind":"p","text":"4) Частота жёлто-зелёных (Аа): 2pq = 0,4324 / 0,813 = 0,5319."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Числа «после отлова» верные, но засчитать эти пункты нельзя: в них используется символика закона Харди — Вайнберга, а он НЕ применим к неравновесной популяции."},{"kind":"h3","text":"Округление"},{"kind":"p","text":"Обычно в задаче просят округлять до четвёртого знака после запятой. Но в ключах ЕГЭ допускается погрешность до второго знака (0,01) — здесь нужно просто быть внимательным."},{"kind":"h3","text":"Округление до 3-го знака — засчитываем"},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"1) частота рецессивных гомозигот (аа; жёлтые): 800/1000 = 0,8;"},{"kind":"p","text":"2) частота рецессивного аллеля (а): q = √0,8 = 0,8944;"},{"kind":"p","text":"3) частота доминантного аллеля (А): р = 1 − 0,8944 = 0,1056;"},{"kind":"p","text":"4) частота доминантных гомозигот (АА; вулканическая окраска): 0,1056² = 0,0112;"},{"kind":"p","text":"5) после гибели 50% вулканических особей осталось 0,9944 особей (99,44%; 0,9944 = 1 − 0,0112 · 0,5);"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"1) 800/1000 = 0,8;"},{"kind":"p","text":"2) q = √0,8 = 0,894;"},{"kind":"p","text":"3) р = 1 − 0,8944 = 0,106;"},{"kind":"p","text":"4) 0,106² = 0,011;"},{"kind":"p","text":"5) после гибели 50% вулканических особей осталось 0,995 особей."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Все пункты засчитаны: ребёнок округлял до 3-го знака, поэтому числа отличаются от ключа, но абсолютно верный ход решения дал результат в пределах погрешности."},{"kind":"h3","text":"Два способа решения"},{"kind":"p","text":"Равнозначные (альтернативные) способы решения часто дают разную погрешность, а значит, и разные числа."},{"kind":"p","text":"Ключ с двумя равнозначными способами решения (см. пункты 1–2) Альтернативный способ поиска частот после изменения численности Частоты генотипов после изменения численности можно найти двумя способами, а в ключе отражён только один. Если числа у ребёнка верные, а способа их получения в ключе нет, скорее всего, он решал альтернативным способом."},{"kind":"h3","text":"Расчёт через число особей — засчитываем"},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"5) после гибели 30% голубых особей в популяции осталось 0,853 особей (85,3%; 0,853 = 1 − 0,49 · 0,3);"},{"kind":"p","text":"6) частота голубых сразу после гибели: 0,343 / 0,853 = 0,4021;"},{"kind":"p","text":"7) частота особей с промежуточной окраской: 0,42 / 0,853 = 0,4924;"},{"kind":"p","text":"8) частота жёлтых: 0,09 / 0,853 = 0,1055 (ИЛИ 1 − 0,4021 − 0,4924 = 0,1055)."},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"6) После отлова погибло 30% голубых особей: 490 − 30% (147 особей) = 343 особи осталось."},{"kind":"p","text":"7) Всего особей в популяции: 853 (343 + 420 + 90)."},{"kind":"p","text":"8) Частота фенотипа АА (голубой): 343/853 = 0,4021; Аа (зелёный): 420/853 = 0,4924; аа (жёлтый): 90/853 = 0,1055."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Расчёт произведён через число особей. Все пункты засчитываются."},{"kind":"h3","text":"Число не выписано отдельно, но ответ верный"},{"kind":"p","text":"Некоторые расчёты могут быть «спрятаны» внутри формулы. Если из ответа явно следует, откуда взялось число, — пункт засчитывается."},{"kind":"h3","text":"Расчёт внутри формулы — засчитываем"},{"kind":"h4","text":"Пример"},{"kind":"p","text":"Задание"},{"kind":"h3","text":"75117 в банке заданий"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"5) после гибели 40% зелёных особей в популяции осталось 0,8130 особей (81,30%; 0,8130 = 1 − 0,4676 · 0,4);"},{"kind":"p","text":"6) частота зелёных сразу после гибели: 0,2806 / 0,8130 = 0,3451;"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"6) Погибло зелёных особей после отлова хищниками: 0,4676 · 0,4 = 0,1870. Выжило:"},{"kind":"p","text":"0,4676 · 0,6 = 0,2806."},{"kind":"p","text":"7) Частота зелёных особей в популяции после отлова: 0,2806 / (1 − 0,1870) = 0,3451."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Засчитываются и пункт 5, и пункт 6: расчёт 1 − 0,187 записан в знаменателе дроби, а в п. 6 пояснено, откуда взялось 0,187."},{"kind":"h3","text":"Соответствие фенотипов и генотипов"},{"kind":"p","text":"Следите, чтобы ученик писал, какие генотипы соответствуют какому фенотипу. На ЕГЭ это иногда опускают, но настоятельно рекомендуйте это делать."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"1) мутантный фенотип представлен доминантными гомозиготами (AA) и гетерозиготами (Aa);"},{"kind":"p","text":"2) частота мутантного фенотипа в равновесной человеческой популяции составляет p² + 2pq = 1/700 = 0,0014;"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"1) мутантный фенотип представлен доминантными гомозиготами;"},{"kind":"p","text":"2) частота мутантного фенотипа в равновесной человеческой популяции составляет 1/700 = 0,0014;"},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Пункт 1 не засчитывается — не указаны гетерозиготы."}]},{"title":"Линия 27 · Филогенетика","blocks":[{"kind":"p","text":"Задачи на филогенетические деревья: важна топология, точность формулировок и разумное округление."},{"kind":"h3","text":"Форма и ориентация дерева — не ошибка"},{"kind":"p","text":"Ключ прямо разрешает «любой вариант изображения»: важна топология (кто с кем группируется), а не то, как дерево нарисовано, — сверху вниз или слева направо, зеркально, с закруглёнными или прямыми линиями, в виде кладограммы или скобочной записью вида (A,(B,C))."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"h3","text":"Варианты деревьев из ключа"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"h3","text":"Дерево ребёнка"},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Засчитывается — топология идентична ключевой, различие чисто визуальное."},{"kind":"p","text":"«Кто возник первым»: альтернативные формулировки Обе формулировки ключа равноценны, принимаются и любые корректные перефразировки: «A — базальная (первая отделившаяся) линия», «A отделился от общего предка раньше, чем разошлись B и C» и т. п. Но в явном виде должно быть показано, какой штамм возник первым, а какие — позже. Если нельзя сказать, какой из двух штаммов возник раньше, нужно указать оба."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"2) сначала возник штамм А и предок штаммов В/С (предковый штамм ВС);"},{"kind":"p","text":"3) затем возникли штаммы В и С;"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"2) сначала возник предок штаммов В/С;"},{"kind":"p","text":"3) затем возник штамм В, потом штамм С;"},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Ни пункт 2, ни пункт 3 не засчитываются: не указано, когда возник штамм А, а вывод, что штамм В возник раньше штамма С, ошибочен."},{"kind":"h3","text":"Округление"},{"kind":"p","text":"Условие требует округлять до первого знака после запятой. При полностью верном ходе решения допускайте небольшую погрешность (например, N = 66,6–66,7 или t = 1332–1336 мин) — это следствие округления на промежуточных шагах, а не ошибка по существу. Если расхождение большое (например, ребёнок округлил 100/3 до 30 и получил N = 60), это уже вычислительная ошибка, и пункт не засчитывается."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"4) между штаммами В и С имеется четыре нуклеотидных различия (в позициях 9, 17, 28, 32);"},{"kind":"p","text":"5) после разделения два штамма накопили в среднем по две нейтральные мутации;"},{"kind":"p","text":"6) количество поколений (N), необходимое для накопления такого количества мутаций, составит 2 · 100 / 3 = 66,7;"},{"kind":"p","text":"7) время, необходимое для формирования такого количества различий (t), составит t = 66,7 · 20 = 1334 минуты (22,2 часа)."},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"4) между штаммами имеется четыре нуклеотидных различия;"},{"kind":"p","text":"5) после разделения штаммы накопили по две нейтральные мутации;"},{"kind":"p","text":"6) количество поколений составит 66,7 (68);"},{"kind":"p","text":"7) время, необходимое для формирования такого количества различий (t), составит t = 68 · 20 = 1360 минут."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Пункт 4 не засчитывается — не указано, между какими штаммами различия."},{"kind":"p","text":"Пункт 5 засчитывается."},{"kind":"p","text":"Пункт 6 не засчитывается — в ответе нет формулы."},{"kind":"p","text":"Пункт 7 не засчитывается — исходное округление отличается больше чем на 0,1."},{"kind":"p","text":"! 3 балла ставится, только если верно указаны пункты 1, 6 и 7. 2 балла — только если указан пункт 1."}]},{"title":"Линия 28 · Генетика","blocks":[{"kind":"p","text":"Главная сложность генетики — нюансы оформления. Их много: их нужно запомнить и набить руку."},{"kind":"h3","text":"Что писать не обязательно"},{"kind":"p","text":"Дано (легенда) Кроссоверные гаметы Индексы F1, F2, P1 Писать не обязательно. Но если написано и в нём ошибка — снимается балл."},{"kind":"p","text":"Помечать кроссоверные гаметы и особи не обязательно — за отсутствие балл не снимается. Обводить гаметы в кружок тоже не нужно."},{"kind":"p","text":"Не нужны. За наличие, отсутствие и даже ошибки в индексах баллы не снимаются — на экзамене на это закрывают глаза."},{"kind":"p","text":"Можно просто прокомментировать."},{"kind":"h3","text":"Генетическая карта"},{"kind":"p","text":"Гены разрешается писать на концах отрезка. Это не лучший вариант (на концах хромосомы гены располагаться не могут), но допустимый."},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Привет! Не стоит писать гены на концах «хромосомы» — там они располагаться не могут."},{"kind":"p","text":"Баллы не снижаю, но учти этот момент, чтобы произвести хорошее впечатление на эксперта."},{"kind":"h3","text":"Указание пола"},{"kind":"p","text":"Признаки, сцепленные с полом, — пол указываем обязательно, в любом случае ."},{"kind":"p","text":"Аутосомные признаки у животных — пол обязательно указываем у родителей."},{"kind":"p","text":"Аутосомные признаки у растений — пол можно (и желательно) не указывать, но указание ошибкой не будет."},{"kind":"h3","text":"Написание фенотипов"},{"kind":"p","text":"При голандрическом наследовании признак, сцепленный с Y-хромосомой, пишем и в фенотипе женщин — нужно показать, что у них этого признака нет (и быть не может). То есть у всех девушек пишем «нет гипертрихоза»."},{"kind":"p","text":"В идеале фенотип пишется полностью по обоим признакам, например: «нет ксеродермы, нет дальтонизма». Ответ «здоров» или «норма» считается верным; если особь здорова по обоим признакам, можно написать «здоров / норма» один раз."},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Привет! Рекомендация от меня: не ленись писать полные фенотипы, а не «здоров». Не видел(а) случаев, чтобы на ЕГЭ за такое снижали, но всё равно лучше быть аккуратнее — так легко запутаться."},{"kind":"p","text":"! Порядок признаков в фенотипе должен соответствовать порядку генов и быть одинаковым во всём решении."},{"kind":"h3","text":"Так нельзя — признаки вразнобой"},{"kind":"h4","text":"Пример"},{"kind":"h3","text":"Фенотипы"},{"kind":"h3","text":"АаВВ — серые, красные глаза"},{"kind":"h3","text":"ААВв — красные глаза, серые"},{"kind":"h3","text":"АаX(d)Y — дальтонизм, волнистые волосы"},{"kind":"h3","text":"Сокращения"},{"kind":"p","text":"Сокращать фенотипы можно: «нет ксер.» вместо «нет ксеродермы» допустимо — это общепринятое сокращение, хотя и не рекомендуемое."},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Привет! Фенотипы засчитаю, но рекомендация: не ленись писать их полностью. Я понимаю, что под «нет ксер.» ты имеешь в виду «нет ксеродермы», но на ЕГЭ это может сыграть против тебя: эксперт неправильно прочитает букву — и всё, балла нет."},{"kind":"p","text":"! В фенотипе должна быть написана БОЛЬШАЯ часть слова. Сокращения до 1–2 букв («н. к.») не засчитываем."},{"kind":"h3","text":"Фенотипы родителей"},{"kind":"p","text":"Если в условии просят — нужно писать, если не просят — можно не писать. Обычно это звучит как «определите генотипы, фенотипы родителей и… в двух браках». Если фенотипы родителей написаны неверно — балл снимается."},{"kind":"h3","text":"За одну и ту же ошибку дважды не снижаем"},{"kind":"p","text":"Если в обоих скрещиваниях пропущены гаметы, не указан пол детей или родителей, не написаны фенотипы родителей — это одна ошибка, снимается только 1 балл (хотя каждое скрещивание оценивается независимо). В целом за верную схему скрещивания без гамет можно получить 2/3."},{"kind":"p","text":"Но на ЕГЭ за это могут и обнулить — обязательно предупреждайте ребёнка."},{"kind":"h3","text":"Решётка Пеннета"},{"kind":"p","text":"Если ученик рисует решётку Пеннета, в каждой клетке должен быть указан фенотип — иначе балл снимается. Рекомендовать её не нужно (долго и бывает неразборчиво), но она допустима."},{"kind":"h3","text":"Аллели при полимерии"},{"kind":"p","text":"Принимается только запись через индексы: А₁А₁А₂А₂, А₁А₂. Запись через разные буквы (ААВВ) не принимается — обязательно указывайте на это ребёнку."},{"kind":"p","text":"Слева — правильная запись через индексы. Запись через разные буквы (справа) не принимается"},{"kind":"h3","text":"Соотношение генотипов"},{"kind":"p","text":"Потомков можно писать подряд с повторениями или с коэффициентами — разницы нет."},{"kind":"h3","text":"Подряд С коэффициентами"},{"kind":"h3","text":"АаBb — круглый, красный 2АаBb — круглый, красный"},{"kind":"p","text":"АаBb — круглый, красный ааbb — грушевидный, жёлтый ааbb — грушевидный, жёлтый ! Пропуск одного из потомков — грубая ошибка, за неё снижается балл."},{"kind":"p","text":"i Рекомендовать ученикам коэффициенты не нужно."},{"kind":"h3","text":"Смена обозначений аллелей"},{"kind":"p","text":"Ребёнок может обозначить признаки другими буквами (например, цвет крыльев не А/а, а В/b) — это допустимо, баллы НЕ снижаем. Хотя по правилам первый признак, упомянутый в задаче, обозначается А/а."},{"kind":"h4","text":"Пример"},{"kind":"h3","text":"Усл овие"},{"kind":"p","text":"При скрещивании растения томата со сложными соцветиями, опушёнными плодами и растения с простыми соцветиями, гладкими плодами всё потомство получилось с простыми соцветиями, опушёнными плодами."},{"kind":"h3","text":"В ерд икт"},{"kind":"p","text":"Ребёнок обозначил соцветия через В/b, а плоды — через А/а. Ошибки нет: решение соответствует условию."},{"kind":"h3","text":"Задачи с летальным аллелем"},{"kind":"p","text":"В потомстве нельзя писать фенотип особей, которые погибают (лучше вообще их не писать). Если записали — нужно указать, что они погибают, а не просто дать фенотип."},{"kind":"p","text":"В пояснении допустимы любые формулировки вроде «АА подыхают» — баллы за это не снимаем. Но для полного зачёта в пояснении должны быть названы все погибающие генотипы."},{"kind":"h4","text":"Пример"},{"kind":"h3","text":"В ерд икт"},{"kind":"p","text":"Пояснение (пункт 3) засчитывается, а второе скрещивание — нет: в нём указан фенотип особей, которые гибнут на эмбриональной стадии. Если бы ребёнок обвёл их в схеме и подписал «гибнут», элемент можно было бы зачесть."},{"kind":"h3","text":"Перепутанные местами скрещивания"},{"kind":"p","text":"Скрещивания могут быть записаны не в том порядке. Если они правильные и соответствуют условию — не снижаем."},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Привет! Скрещивания правильные, но рекомендую писать их в хронологическом порядке — в том, в котором они записаны в задаче. Так будет проще и тебе, и эксперту при оценивании."},{"kind":"h3","text":"Перепутан тип наследования"},{"kind":"p","text":"Если ребёнок перепутал тип наследования (например, решает псевдоаутосомно, хотя по условию признак аутосомный), обнуляются оба скрещивания. Если ответ на вопрос задачи верный (и в нём не фигурируют хромосомы), можно поставить 1/3. Пример — задание 75113."},{"kind":"h3","text":"Пояснения: аутосомное наследование"},{"kind":"p","text":"Писать можно короче и ёмче — это не ошибка, но придерживайтесь стиля ключа. Если ребёнок всё расписал подробно, но чего-то не хватает (например, не указал, какие аллели сцеплены), балл снимается — подскажите, что пояснение лучше писать как в ключах."},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Привет! Смотри, пояснение хорошее, но нужно написать, что многочисленная группа образована сцеплением аллелей: А сцеплен с b, а — с B. И про кроссинговер в малочисленной группе тоже обязательно скажи!"},{"kind":"p","text":"i В задачах на построение хромосомной карты (появились в ЕГЭ-2025) пояснения не требуются."},{"kind":"p","text":"Пояснения: наследование, сцепленное с полом ! Нельзя писать «ребёнок получил гамету, содержащую аллель». Ребёнок получает не гамету, а ХРОМОСОМУ — а сам он образуется в результате слияния гамет. Такое пояснение не засчитывается."},{"kind":"p","text":"Г оландрическое наследование: достаточно пояснения «Y-хромосома сцеплена с аллелем заболевания» или «признак наследуется голандрически»."},{"kind":"p","text":"Псевдоаутосомное наследование: достаточно показать, в результате слияния каких гамет (с какими хромосомами) появляется такой ребёнок. Кроссоверная или некроссоверная гамета (X или Y) — обязательно указываем; без уточнения засчитывать нельзя."},{"kind":"p","text":"Крисс-кросс (сцепление с X): достаточно минималистичного «расщепление связано со сцеплением признака цвета перьев с X-хромосомой». Но обязательно рекомендуйте писать и фразу из ключей: «гомогаметный пол получает X-хромосому от обоих родителей, а гетерогаметный — только от одного». Рекомендация обязательна, но баллы за отсутствие этой фразы не снимаются."},{"kind":"h3","text":"Пример Псевдоаутосомное наследование"},{"kind":"h3","text":"Кл юч"},{"kind":"p","text":"В первом браке возможно рождение сына с дисхондростеозом и гипертрихозом (X(a)Y(Ab)). В генотипе этого ребёнка находятся материнская X(a)-хромосома и некроссоверная отцовская Y(Ab)-хромосома."},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"В первом браке возможно рождение сына с дисхондростеозом и гипертрихозом (X(a)Y(Ab)). Гипертрихоз наследуется голандрически, и все сыновья будут больны, дисхондростеоз наследуется псевдоаутосомно. Так как заболевание доминантное, все сыновья будут больны."},{"kind":"h3","text":"В ерд икт"},{"kind":"p","text":"Пояснение не засчитывается: не объяснено, почему рождается ребёнок с дисхондростеозом, — в результате слияния гамет с какими хромосомами."},{"kind":"h3","text":"Запись генотипов"},{"kind":"h3","text":"Независимое аутосомное наследование"},{"kind":"p","text":"Запись гетерозигот как аА вместо Аа — грубая ошибка, о ней нужно сказать ребёнку."},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Привет! Балл снимаю: у тебя нарушена генетическая символика. В задачах по генетике всегда пишут сначала доминантный аллель, затем рецессивный. Иная запись может вызвать вопросы у проверяющего."},{"kind":"p","text":"А вот порядок генов в задачах, где один признак аутосомный, а другой сцеплен с полом, не принципиален. Принято писать сначала аутосомный, затем сцепленный с полом (АаX(B)Y), но запись X(B)YАа ошибкой не будет — балл не снимаем, можно лишь написать ребёнку."},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Привет! Балл не снимаю, но принято писать сначала аутосомный ген, а потом сцепленный с полом. Это правило используется во всех задачах — так будет легче и тебе, и проверяющему :)"},{"kind":"p","text":"Использование тех же букв (А/а, В/b) для второго признака в задачах на группы крови ошибкой не является. Напишите об этом ребёнку, но балл не снижайте."},{"kind":"p","text":"Буква B использована и для группы крови, и для второго признака"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Привет! В задачах с группой крови не стоит использовать ту же букву для второго (аутосомного) признака — это может запутать и тебя, и эксперта. Лучше возьми любую другую букву. Задачи на группы крови на ЕГЭ сейчас встречаются нечасто, но никто не исключает их появления."},{"kind":"h3","text":"Сцепленное с полом наследование"},{"kind":"p","text":"Для гемофилии, дальтонизма и других признаков на платформе чаще всего используются буквы H/h, D/d. Ребёнок может обозначить их любой буквой (чаще всего А/а и В/b) — это допустимо."},{"kind":"h3","text":"Сцепленное аутосомное наследование"},{"kind":"p","text":"Допустима запись и с «палочками», и без. Вариант с палочками рекомендуют эксперты:"},{"kind":"p","text":"в нём меньше шансов запутаться, и он помогает определить, какие потомки кроссоверные (при оценивании следите, чтобы расположение аллелей было указано верно). Вертикальная запись палочек тоже разрешена."},{"kind":"h3","text":"Допустимые варианты записи сцепленных генов"},{"kind":"p","text":"Аллели, сцепленные с половыми хромосомами (не голандрические) Оформление половых хромосом «палочками» допустимо, но не рекомендуется."},{"kind":"h3","text":"Варианты записи для мальчиков и девочек"},{"kind":"h3","text":"Голандрический аллель (сцепленный с Y)"},{"kind":"p","text":"Допустимы несколько вариантов записи аллеля, сцепленного с Y."},{"kind":"p","text":"Варианты записи голандрического аллеля"}]},{"title":"Проверка домашних заданий","blocks":[{"kind":"p","text":"Как проверять домашки быстро и качественно."},{"kind":"h3","text":"Коротко"},{"kind":"p","text":"Рекомендуемое время на одну домашку с нейропроверкой — 3 минуты (не больше 5-7) без потери качества."},{"kind":"p","text":"Комментарий к каждому заданию пишется в поле у самого задания, внизу — общий комментарий по работе. Заготовьте шаблоны, чтобы пользоваться ими эффективно."},{"kind":"p","text":"Вся статистика по вашим проверкам видна старшему методисту — старайтесь работать оперативно."},{"kind":"p","text":"Tone of voice: нейтральный, к детям обращаемся по имени. Без излишнего «милашества» и лишних эмоций."},{"kind":"h3","text":"Пример Хорошие комментарии"},{"kind":"label","text":"Общий комментарий"},{"kind":"p","text":"Надежда, привет. Домашка хорошая, мне очень понравилось проверять! Есть некоторые замечания по ответам — посмотри их у заданий. Если будут вопросы — спрашивай в чате с методистом!"},{"kind":"h3","text":"К заданию"},{"kind":"p","text":"Смотри, у тебя ошибка в механизме заражения: окончательный хозяин заражается финнами (с плохо прожаренным мясом), а не яйцами. Высокую плодовитость засчитаю, а про редукцию пищеварительной системы и органов чувств у тебя ничего не написано."},{"kind":"h3","text":"К заданию"},{"kind":"p","text":"Ошибка в формулировке: печень не вырабатывает ферменты «при помощи» эндокринных и экзокринных желёз — она сама синтезирует соответствующие вещества. Вдобавок ты забыла про антикоагулянтный эффект метаболитов печени (гепарина) и синтез холестерина."},{"kind":"p","text":"По разбалловке вышло 3/3, но обрати внимание."},{"kind":"p","text":"Очень круто, когда вы обращаетесь к ребёнку по имени. И следите за полом ребёнка, чтобы не обращаться к нему в формах противоположного пола. Не знаете, как обратиться, — просто «Привет!»."},{"kind":"h3","text":"Шаблонные фразы"},{"kind":"p","text":"Заготовьте несколько шаблонов и копируйте их из домашки в домашку. Примеры — в таблице «Шапки и скрипты»."},{"kind":"h3","text":"Шапка для идеальной домашки"},{"kind":"p","text":"Привет! Идеальная домашка, ни единой ошибки — ты просто супер! Остались вопросы по пройденной теме? Если что-то непонятно, обязательно спрашивай у методистов в чате <3"},{"kind":"h3","text":"Шапка для хорошей домашки"},{"kind":"p","text":"Привет! Домашка выполнена хорошо. Пояснения по ошибкам в первой части посмотри прямо в пояснениях к заданиям, а по второй части я расписала у самих заданий."},{"kind":"p","text":"Остались вопросы по теме? Обязательно спрашивай у методистов в чате <3"},{"kind":"h3","text":"Шапка для слабой домашки"},{"kind":"p","text":"Привет! Вижу, что с домашкой возникли трудности. Пояснения по ошибкам в первой части посмотри в пояснениях к заданиям, по второй — всё расписала у заданий."},{"kind":"p","text":"Обязательно разбери эту тему! По ЛЮБЫМ вопросам спрашивай у методистов в чате!"},{"kind":"p","text":"Сначала отправьте комментарий и только потом нажимайте «Завершить проверку»."},{"kind":"p","text":"Задания первой части в домашках НЕ проверяются, но на вопросы по ним, конечно, нужно отвечать."},{"kind":"h3","text":"Комментарии к заданиям"},{"kind":"p","text":"В комментарии к заданию пишите, каких пунктов ключа нет в ответе и что стоило бы исправить. Биологические ошибки лучше выписывать отдельно и выделять жирным (Ctrl+B)."},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Привет! Вижу биологическую ошибку: неверно указано, что из нерпы выходят личинки — на схеме показаны яйца паразита. Второй пункт не засчитываю."},{"kind":"p","text":"Если задание сделано на отлично, его можно не комментировать. Но если вся домашка на максимум, напишите хоть что-то по 1–2 заданиям, чтобы ребёнок видел, что его работу действительно прочитали. Или отметьте почерк и стиль изложения."},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Привет! Работа просто прекрасная :) Только «анабиоз», а не «анабеоз» — следи за орфографией, хоть за неё и не снижают."},{"kind":"p","text":"Невыполненные задания лучше отметить в общем комментарии внизу, а не у каждого задания."},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Привет! Почему не получилось выполнить задания 25 и 27? Если есть вопросы — смело задавай, разберёмся!"},{"kind":"p","text":"В поле общего комментария отправляйте шаблонную шапку:"},{"kind":"h3","text":"Шапка"},{"kind":"p","text":"Аделина, привет! Хорошая домашка, ты молодец! Ошибки в заданиях первой части глянь в пояснениях к ним, по второй части всё расписано у самих заданий."},{"kind":"h3","text":"Шапка для отличной домашки"},{"kind":"p","text":"Даня, отличный результат! Остались вопросы по материалу? Смело спрашивай в нашем чате методистов!"},{"kind":"p","text":"Вопросы дети (в идеале) задают у самих заданий. Ваша задача — не пропустить их (они подсвечены красной точкой) и ответить. Если это вопрос по проверке, нужно ответить на каждое такое сообщение, иначе домашка «не снимется» с вас; при необходимости передайте вопрос в тему «Послания методистам»."},{"kind":"h3","text":"Вторая часть"},{"kind":"p","text":"Баллы за задания второй части выставляются прямо на платформе."},{"kind":"p","text":"Оценивайте строго, но справедливо — все сдавали ЕГЭ и понимают специфику. Иногда лучше поставить балл повыше, но в пояснении указать, что на экзамене этот пункт могут и не засчитать."},{"kind":"p","text":"Никогда не советуйте ученику писать меньше, чем нужно, — это неправильная тактика. Никто не знает, что будет в ключе, поэтому лучший совет: «пиши всё, что знаешь по теме и в чём уверен, чтобы не допустить биологических ошибок и повысить шансы попасть в ключ; рассматривай вопрос с разных сторон»."},{"kind":"h3","text":"Списывание — не повод снижать балл"},{"kind":"p","text":"Даже если ответ явно списан, оцениваем как обычно: верный ответ — 3/3. Ваша задача — проверять задания и справедливо их оценивать. Давайте обойдёмся без синдрома вахтёра: в 16–17 лет это уже осознанные люди, которые понимают последствия. На крайний случай оставьте «шапку для списывальщиков»."},{"kind":"p","text":"Пояснения из ключей на платформе ни в коем случае не копируем — всё пишем от себя."},{"kind":"p","text":"Ваша цель — чтобы у ученика не возник вопрос «а за что мне сняли балл???». Как сделать это быстро и качественно — решаете вы."},{"kind":"p","text":"В ваши обязанности входят и ответы на сообщения ученика в конце прохождения (там, где обычно «спасибо большое, вопросов нет!»). Отвечаем как в жизни:"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Пожалуйста! Передала благодарность методисту!"},{"kind":"p","text":"Если одновременно пришли домашка и вопрос — сначала отвечаем на вопрос, потом проверяем домашку."},{"kind":"p","text":"Важнейший момент: сначала отправляем комментарий и отвечаем на вопрос ребёнка, и только после этого нажимаем «Завершить проверку». После завершения вернуться к прохождению ребёнка можно будет только через вкладку «Проверено»."},{"kind":"h3","text":"Какой должна бытьпроверка"},{"kind":"h3","text":"Быстрой Понятной Полной"},{"kind":"p","text":"В идеале — не больше 1,5 минуты на задание."},{"kind":"p","text":"Первые проверки идут долго, это нормально: со временем вы набьёте руку."},{"kind":"p","text":"Суть ошибки — простыми словами, без воды и сложных терминов. Пункт ключа целиком не копируем."},{"kind":"p","text":"Читайте весь ответ, каждую фразу. Даже при 3/3 найдите, что подсказать."},{"kind":"h3","text":"Быстрой"},{"kind":"p","text":"Заранее придумайте фразы для типовых ситуаций: скопировал — вставил — готово."},{"kind":"p","text":"Не придумывайте каждый раз реакцию на типовую ситуацию «с нуля» — это убивает скорость. Держите список готовых фраз перед глазами (например, в отдельном файле)."},{"kind":"p","text":"Увидели типовую ситуацию — скопировали фразу, вставили в комментарий."},{"kind":"p","text":"При необходимости добавьте 1–2 слова про конкретную ошибку."},{"kind":"h3","text":"Понятной"},{"kind":"p","text":"Комментарий должен объяснять суть ошибки обычными словами. Если ответ частично верный, прямо укажите на ошибку, не копируя пункт ключа целиком."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Условие"},{"kind":"p","text":"Какая переменная в этом эксперименте будет зависимой (изменяющейся), а какая — независимой (задаваемой)?"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"1) зависимая переменная (изменяющаяся в эксперименте) — объём (форма, размер) живой части растительной клетки (протопласта); независимая переменная (задаваемая экспериментатором) — концентрация (% содержание) соли в окружающем растворе (должны быть указаны обе переменные);"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"1) зависимая — концентрация соли раствора, а независимая переменная — форма протопласта"},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Ни в коем случае не копируем ключ. Достаточно написать: «У тебя переменные перепутаны местами, поэтому засчитать не могу!» Если скопировать ключ, ученик может не понять суть ошибки — и вам придётся возвращаться к домашке и объяснять снова."},{"kind":"h3","text":"Полной"},{"kind":"p","text":"Внимательно читайте весь развёрнутый ответ — каждую фразу и каждое утверждение."},{"kind":"p","text":"Даже если начало верное, в середине или в конце может быть ошибка, которую нельзя пропустить."},{"kind":"p","text":"Даже если работа идеальна (3/3), найдите хоть что-то — неточность, опечатку, — чтобы было видно, что работу действительно проверили, а не просмотрели для галочки."},{"kind":"h3","text":"Пример Всё верно, но нужна конкретика"},{"kind":"label","text":"Условие"},{"kind":"p","text":"Как в ходе эксперимента изменяется длина передних конечностей и длина хвоста? Почему на последнем этапе эксперимента исследователи не смогли определить количественно исследуемый параметр? Какие органоиды в клетках хвоста головастика обеспечивают его изменение в ходе метаморфоза? Ответ поясните."},{"kind":"label","text":"Ключ"},{"kind":"p","text":"1) длина передних конечностей увеличивается, длина хвоста — снижается (должны быть указаны оба пункта);"},{"kind":"p","text":"2) в конце метаморфоза хвост у головастиков полностью исчез;"},{"kind":"p","text":"3) лизосомы;"},{"kind":"p","text":"4) обеспечивают разрушение клеток ферментами лизосом (гидролазами)."},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"1) длина передних конечностей увеличивается, а длина хвоста — снижается"},{"kind":"p","text":"2) к концу развития хвост исчезает"},{"kind":"p","text":"3) лизосомы, которые обеспечивают разрушение клеток"},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Все пункты верные — очевидно 3/3. Но важно подсказать, что клетки разрушают не сами лизосомы, а их ферменты. Конкретика нужна, даже когда задание оценено на максимум."},{"kind":"p","text":"Если разбалловка позволяет поставить 3/3, несмотря на недостающие пункты ключа, всё равно укажите на них!"},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Условие"},{"kind":"p","text":"Каковы особенности строения и физиологии кардиомиоцитов? Укажите три особенности."},{"kind":"label","text":"Ключ"},{"kind":"p","text":"3) имеют поперечную исчерченность;"},{"kind":"p","text":"4) соединяются друг с другом (при помощи вставочных дисков);"},{"kind":"p","text":"5) одноядерность (двуядерность; многоядерность)"},{"kind":"p","text":"6) низкая утомляемость;"},{"kind":"p","text":"7) способность генерировать и проводить электрический (нервный) импульс (потенциал действия)."},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"3) имеют поперечную исчерченность"},{"kind":"p","text":"4) соединяются друг с другом"},{"kind":"p","text":"5) способность генерировать и проводить электрический импульс"},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"Разбалловка позволяет поставить 3 балла, но ученику нужно указать на недостающие пункты 5 и 6 ключа."},{"kind":"h3","text":"С индивидуальным подходом и по-человечески"},{"kind":"p","text":"Пишите от себя, обращайтесь по имени, замечайте сильные стороны работы — комментарий должен звучать как от живого человека, а не как выдержка из ключа."},{"kind":"h3","text":"Частые вопросы по оцениванию второй части"},{"kind":"h3","text":"Перечислены не все пункты"},{"kind":"p","text":"Например, в пункте ключа перечисляются органоиды или признаки, а ученик назвал не все. Оцениваем по ключу — обычно это +/– (неполный элемент ответа)."},{"kind":"h4","text":"Пример"},{"kind":"label","text":"Условие"},{"kind":"p","text":"При интенсивных нагрузках у крупных пустынных жуков многие ткани и органы используют гликолиз в качестве основного метаболического пути. Как можно объяснить такую закономерность?"},{"kind":"label","text":"Ключ"},{"kind":"p","text":"5) при интенсивных нагрузках используется много кислорода"},{"kind":"label","text":"Ответ ребёнка"},{"kind":"p","text":"5) При интенсивных нагрузках крупные жуки в качестве основного метаболического пути используют гликолиз, потому что им не хватает кислорода."},{"kind":"label","text":"Вердикт"},{"kind":"p","text":"+/–: нехватка кислорода названа, но не объяснено, почему его не хватает (при нагрузке кислород расходуется очень быстро)."},{"kind":"h3","text":"Примеры: засчитываем любые верные"},{"kind":"p","text":"Когда просят привести пример, засчитываем любой верный. Нужен белок с четвертичной структурой, в ключе — гемоглобин, а ребёнок написал АТФ-синтазу или лактатдегидрогеназу — засчитываем. Но советуйте приводить несколько примеров, включая самые очевидные. А вот миоглобин — ошибка (и вы должны знать почему)."},{"kind":"h3","text":"Ответ — набор слов"},{"kind":"p","text":"Изо всех сил ищите в ответе пункты ключа. Следите за правильным использованием терминов, просите выражаться академичнее. Высоких требований к грамматике здесь нет, но можно попросить делить ответ на пункты, писать понятно и перечитать ответ глазами учителя. Если мысль (пункт ключа) передана верно — засчитываем."},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Привет! Пишешь верно, но совсем непонятно, что к чему относится, — просто перечисление: непонятно, что изображено под цифрой 1, АТФ-синтаза или хлоропласт."},{"kind":"p","text":"Пиши не просто по пунктам, а полными предложениями — формулируй в ответе, на какой вопрос отвечаешь."},{"kind":"h3","text":"Орфография"},{"kind":"p","text":"На орфографические ошибки указываем, но баллы за них не снижаем: «кроссенговер», «комплиментарность» — во второй части за такое не снимаем!"}]},{"title":"Чат с методистом","blocks":[{"kind":"p","text":"Ответ на вопрос ученика нужно дать в течение 5 минут после его появления — с 10:00 до 22:00."},{"kind":"p","text":"Если у вас нет смены в чате — в чат вы не заходите. На смены в чате записываются через таблицу распределения; если вы ни разу не были на чате, нужно одобрение старшего методиста."},{"kind":"p","text":"Вопросы появляются в хронологическом порядке сверху вниз: сверху — самый старый неотвеченный."},{"kind":"p","text":"В КАЖДОМ диалоге последнее сообщение должно быть за методистом."},{"kind":"p","text":"Будьте вежливы, не душните, будьте на одной волне с детьми. Не надо расписывать полотна."},{"kind":"h3","text":"Один диалог — один методист"},{"kind":"p","text":"Пока вы находитесь в диалоге, в него не может зайти другой методист. Диалог закрепляется за вами ещё на 3 минуты после выхода — в это время его никто не может открыть. Поэтому, если ведёте диалог с ребёнком, желательно общаться с ним всю смену, чтобы не вникать каждый раз в контекст."},{"kind":"h3","text":"Каким должен быть ответ"},{"kind":"h3","text":"Понятным Проиллюстрированным"},{"kind":"p","text":"Без непонятных терминов и сложных объяснений, о которых узнаёшь только в вузе."},{"kind":"p","text":"Картинки, схемы, ссылки на умный справочник — только в помощь."},{"kind":"h3","text":"Правильным"},{"kind":"p","text":"Это очень важно. Не знаете — не бойтесь искать в интернете или спросить нейросеть."},{"kind":"p","text":"Но переформулируйте ответ, не копируйте его целиком: ребёнок ни в коем случае не должен усомниться в знаниях методиста."},{"kind":"p","text":"Старший методист периодически просматривает чаты."},{"kind":"h3","text":"Эстетичным"},{"kind":"p","text":"Не отправляйте детям странные картинки (целые слайды из презентаций в интернете) и тем более картинки других онлайн-школ."},{"kind":"h3","text":"На что ещё отвечаем"},{"kind":"p","text":"Вопросы по заданиям с других плат форм (2–3 штуки) — отвечаем. Это занимает 1–2 минуты, а в глазах ребёнка вы выглядите лучше и не отталкиваете его."},{"kind":"p","text":"Просьба проверить школьный пробник или пробник с платформы — можно. Не обязательно за 5 минут, но примерный балл и кратко ошибки назвать нужно. Как вариант — скинуть ключ и указать, каких пунктов не хватает."},{"kind":"p","text":"Вопросы по другим предметам (например, чем кислые соли отличаются от средних) отвечать не обязательно. Мягко перенаправьте в чат методистов по химии или русскому — предмет меняется в верхнем меню платформы."},{"kind":"h3","text":"На что ссылаться"},{"kind":"p","text":"У вас есть доступ к конспектам вебинаров — они очень красивые, и на них можно ссылаться :) В первую очередь ссылаемся на конспект и вебинар, затем — на умный справочник."},{"kind":"p","text":"Ссылаться на материалы из интернета крайне нежелательно, а на материалы других онлайн-школ — табу. Поэтому никогда не отправляйте в чате ссылки на сторонние сайты."},{"kind":"p","text":"Гайд по продажам: nfsales.yonote.ru/share/… — только для вашего пользования, детям его отправлять НЕЛЬЗЯ."},{"kind":"h3","text":"Служба заботы"},{"kind":"p","text":"Технические неполадки, вопросы оплаты, не открываются вебинары, не получается распечатать материалы, жалобы — всё это в Службу заботы:"},{"kind":"p","text":"Telegram ВКонтакте WhatsApp t.me/NeoFamilyHelp Сообщения сообщества Написать в WhatsApp"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Привет! Если у тебя технические неполадки, финансовый вопрос или хочешь пожаловаться — обратись в Службу заботы, тебе там обязательно помогут: t.me/ NeoFamilyHelp. Ещё можно написать в сообщения сообщества ВКонтакте по биологии или в WhatsApp. Пиши по любому вопросу, даже если ты не по адресу, — тебе всё равно помогут или подскажут, куда обратиться."},{"kind":"h3","text":"Ответы на частые вопросы детей"},{"kind":"p","text":"Готовые ответы — копируйте и адаптируйте под ситуацию."},{"kind":"p","text":"Как найти куратора?"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Привет! Перейди в «Мои занятия» и нажми на баннер, который предлагает выбрать куратора. Возможно, система уже распределила тебя автоматически, если с момента покупки прошло больше часа."},{"kind":"h3","text":"Не отвечает куратор"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Привет! Передам в учебный отдел — обязательно разберёмся, что произошло с куратором. Обратись, пожалуйста, в Службу заботы: t.me/NeoFamilyHelp или в сообщения сообщества ВК."},{"kind":"h3","text":"Мне не написал куратор"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Привет! Если возникли сложности, обратись в техподдержку: нажми на значок с вопросительным знаком в правом нижнем углу платформы. Если значка нет — переходи по ссылке t.me/NeoFamilyHelp."},{"kind":"p","text":"Как сменить куратора?"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Открой раздел «Мои занятия» и нажми на значок куратора — там будет кнопка «Хочу к другому куратору». Не переживай и указывай настоящую причину: твой текущий куратор её не увидит. Но для начала, пожалуйста, обратись в Службу заботы: t.me/ NeoFamilyHelp или в сообщения сообщества ВК."},{"kind":"p","text":"Где найти курсы? Когда занятия?"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Все курсы — в разделе «Мои занятия» на платформе. Годовой курс стартовал 15 сентября, занятия проходят по понедельникам, средам и пятницам в 17:00 (МСК), прошедшие уроки доступны в записи. Полное расписание: «Мои занятия» → кнопка «Расписание» — там удобный календарь и красиво оформленные расписания по всем курсам. А ещё можно спросить у своего куратора."},{"kind":"p","text":"Как отменить запись на курс?"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Обратись в Службу заботы — тебе там обязательно помогут: t.me/NeoFamilyHelp Будут ли скрипты?"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"На вебинарах Андрей пишет конспект вместе с учениками прямо во время занятия. На видеоуроках Нурлан опирается на презентацию — её можно заранее распечатать и заполнять вместе с ним. К обоим форматам прикреплены скрипты :) Выбирай тот, что удобнее тебе!"},{"kind":"p","text":"Чем отличаются вебинары от видеоуроков? Надо смотреть и то и другое?"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Вебинары ведёт Андрей: они идут онлайн, потом остаётся запись. Длятся дольше, потому что преподаватель общается с чатом и вместе с учениками составляет конспект."},{"kind":"p","text":"Видеоуроки ведёт Нурлан, они сразу в записи и короче: преподаватель не отвлекается на чат и объясняет тему по презентации. Вебинары и видеоуроки равнозначны — выбирай то, что больше нравится!"},{"kind":"p","text":"Где взять конспекты? Где домашка?"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Конспекты прикреплены к соответствующим теоретическим вебинарам, а домашка находится ниже основных вебинаров в карточке занятия."},{"kind":"p","text":"Что такое Умное повторение?"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Умное повторение — это алгоритм интервального повторения. К каждому занятию добавляются карточки по теме, а твоя задача — каждый день заходить в раздел «Умное повторение» и нажимать «Повторить всё!». Алгоритм сам подберёт карточки, тебе останется только отвечать. Лучше всего уделять этому 15–30 минут утром, днём и вечером. Если проходить УП регулярно, материал запомнится легко и надолго, а если нерегулярно — карточки начнут копиться и превратятся в настоящий «снежный ком»."},{"kind":"p","text":"Подробнее — в Инструкции."},{"kind":"p","text":"Почему у меня 400 карточек УП в день?"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Делай Умное повторение каждый день — возьми это в привычку: 15 минут утром, 15 днём и 15 перед сном. Это очень эффективный способ запомнить большой объём информации, ты выйдешь на ЕГЭ супер-подкованным. Если проходить УП не каждый день (например, 3 раза в неделю), копится снежный ком из карточек и придётся тратить очень много времени — колоды добавляются в течение всего курса, и чем дальше, тем их больше."},{"kind":"p","text":"Если повторять каждый день, мозг сделает всю работу за тебя: он очень любит интервальное повторение «понемногу»."},{"kind":"p","text":"Что лучше — умный справочник или конспекты?"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"PDF-конспекты к вебинарам. Статьями Умного справочника лучше пользоваться на начальном этапе или когда тема даётся трудно. Конспекты гораздо лучше подходят для изучения — на них строится вся образовательная программа, а УС — вспомогательный инструмент."},{"kind":"p","text":"Что такое кодовое слово?"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Над вебинаром есть окошко для ввода кодового слова. Его называет преподаватель на вебинаре (и явно говорит, что сейчас прозвучит кодовое слово). Когда ты вводишь слово, вебинар переходит из пропущенных в просмотренные, а тебе начисляются баллы в рейтинг. Если прослушал кодовое слово — нажми «Отметить просмотренным»: вебинар тоже перейдёт в просмотренные, но без бонусов."},{"kind":"p","text":"Какое кодовое слово к вебинару?"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Привет! Если честно, я не знаю — у меня нет доступа к вебинарам. Оно звучало на вебинаре :)"},{"kind":"p","text":"Можно ли скачивать видео с платформы?"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Нет, скачивать и скриншотить видео нельзя — в целях защиты авторских прав :( А мне проверят второе прохождение домашки?"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Привет! Нет, второе прохождение не проверяется. Если есть вопросы по конкретным заданиям — задавай их здесь, в чате!"},{"kind":"p","text":"Как найти телеграм-канал NeoFamily?"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Открытый телеграм-канал по биологии: @biofamily_ege. Чтобы попасть в закрытый канал для учеников курса, нужно под руководством куратора заполнить специальную форму, убедиться, что в Telegram у тебя открыт номер телефона или ник, и подать заявку в канал. В течение суток тебя примут :)"},{"kind":"p","text":"Какие книги и платформы посоветуете?"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Привет! Для полноценной подготовки к ЕГЭ материала наших курсов более чем достаточно. ЕГЭ строится на школьных учебниках, которые мы каждый год изучаем и актуализируем на вебинарах. Классика для ЕГЭ — учебники Теремова и Петросовой (10– 11 класс, профильный уровень) и Пасечника (10–11 класс), а сейчас всё чаще встречаются задания, вдохновлённые учебником Дымшица. Остальные учебники и справочники (тот же трёхтомник Тейлора, Грина и Стаута) — хороший материал, но не совсем под формат ЕГЭ. Побольше решай наш банк заданий, не забывай про карточки Умного повторения и делай все домашки — для 90+ этого хватит."}]},{"title":"Расписание и смены","blocks":[{"kind":"p","text":"Выходить на проверки домашек можно в любое время, но записываться в таблицу распределения всё равно нужно."},{"kind":"h3","text":"Как это работает"},{"kind":"p","text":"В очереди почти всегда много домашек (200+ — обычное дело): дети сдают биологию непрерывно, и для вас это плюс. Поэтому проверять можно когда удобно: на паре — 2–3 штучки, потом в транспорте, потом дома минут 40, пока есть свободное время."},{"kind":"h3","text":"Очередь домашек на платформе"},{"kind":"p","text":"Если в очереди больше 80 домашек (а это почти всегда) — выходите в любое время и на сколько позволяет нагрузка: хоть на полчаса, хоть на 3 часа. Выплата зависит от вас и вашей скорости."},{"kind":"p","text":"Если в очереди меньше 80 домашек (на биологии обычно только в субботу) — выходите строго по таблице распределения."},{"kind":"p","text":"Таблица нужна и для вашего удобства — чтобы не забыть, когда собирались выйти. А старшему методисту она помогает прикинуть, сколько людей планирует работать, поэтому записываться обязательно."},{"kind":"p","text":"Во время проверки у вас под рукой должно быть удобное устройство (компьютер или ноутбук, в крайнем случае планшет) со стабильным интернетом — и сосредоточенность на проверках."},{"kind":"p","text":"Тем, кто проверяет домашки, не нужно предупреждать об опозданиях, ранних или поздних выходах: ваши проверки — ваши деньги."},{"kind":"p","text":"Для смен в чате всё строго: выходите по таблице — там ограниченное число людей."},{"kind":"p","text":"Не успеваете или опаздываете — пишите старшему методисту, вам найдут замену (но лучше так не делать). Переносы, перерывы и отмены — тоже только через старшего методиста."},{"kind":"h3","text":"Распределение"},{"kind":"p","text":"Распределение проходит каждое воскресенье в 4 потока. Списки потоков публикуются до 10:00 воскресенья. Потоки чередуются в течение месяца (4-3-2-1-4-3-2-1…), чтобы все заняли примерно равное количество смен."},{"kind":"p","text":"Поток Когда открывается запись (МСК) 1-й поток 12:00 2-й поток 12:30 3-й поток 13:00"},{"kind":"h3","text":"4-й поток 13:30"},{"kind":"p","text":"Р аньше своего времени не заходите — Google Таблицы начинают сильно лагать."},{"kind":"p","text":"Каждый месяц по рейтингу формируется топ-25 методистов — они всегда записываются в 1-м потоке."},{"kind":"p","text":"Первые столбцы (фиолетовые) — смены в чате. На них можно записываться самостоятельно; если вы ни разу не были на чате, нужно одобрение старшего методиста."},{"kind":"p","text":"Таблица распределения: фиолетовые ячейки — смены в чате"},{"kind":"h3","text":"Запись в ячейки"},{"kind":"p","text":"В свободные ячейки вписывайте ТО ЛЬКО свою фамилию (при однофамильцах — ещё и инициалы)."},{"kind":"p","text":"Google Таблицы синхронизируются не идеально, и кто-то может случайно затереть ваше имя. Посмотрите историю ячейки (правой кнопкой мыши по ячейке) и впишитесь рядом — места обычно есть. Если мест нет, ячейка остаётся за тем, кто записался раньше, — обязательно предупредите второго методиста."},{"kind":"p","text":"Количество смен — любое, по вашей нагрузке. В течение воскресенья можно редактировать запись, дописываться и выписываться (не злоупотребляйте), потом доступ закрывается."},{"kind":"h3","text":"Учёт смен"},{"kind":"p","text":"Ведите учёт своих смен сами — не полагайтесь только на таблицу, там может быть не всё. Записывайте, сколько смен у вас было за неделю (и в какое время), — это нужно для подсчёта выплат. Особенно актуально для чата."},{"kind":"p","text":"Коэффициент"},{"kind":"h3","text":"1 смена = 20 домашек = 2 часа"},{"kind":"p","text":"Проверили за день 35 домашек — запишите себе 1,75 смены."},{"kind":"p","text":"! Статистика по каждому методисту — среднее время проверки, количество проверок за смену и т. д. — видна старшему методисту. При нарушении условий договора его придётся расторгнуть в одностороннем порядке."}]},{"title":"Вознаграждение","blocks":[{"kind":"p","text":"Выплата складывается из проверенных заданий, ответов на сообщения и бонуса за место в рейтинге."},{"kind":"h3","text":"Проверка заданий"},{"kind":"p","text":"Задание считается проверенным, если ребёнок написал в ответе хотя бы один символ или прикрепил картинку."},{"kind":"h3","text":"Даже такой ответ — оплачиваемое проверенное задание"},{"kind":"p","text":"Ставка за задание зависит от оценки ваших проверок, которую старший методист ставит в конце месяца в обратной связи:"},{"kind":"h3","text":"Ставки за проверенное задание"},{"kind":"p","text":"Оценка 0–3: без нейропроверки — 5 ₽; с нейропроверкой — 2 ₽."},{"kind":"p","text":"Оценка 4–7: без нейропроверки — 6 ₽; с нейропроверкой — 3 ₽."},{"kind":"p","text":"Оценка 8–10: без нейропроверки — 7 ₽; с нейропроверкой — 4 ₽."},{"kind":"p","text":"0–3 — много ошибок, ошибки ИИ-модели игнорируются, её спорные формулировки не меняются. Складывается впечатление, что вы совершенно не понимаете, как оценивать."},{"kind":"p","text":"4–7 — подавляющее большинство методистов: стабильные, хорошие проверки."},{"kind":"p","text":"8–10 — качественные проверки, соблюдающие все требования регламента (см."},{"kind":"p","text":"раздел «Нейропроверка»)."},{"kind":"p","text":"Обычно во второй части домашки 5–7 заданий (около 35 ₽ за домашку), но бывает и до 10–11."},{"kind":"h3","text":"Сообщения"},{"kind":"p","text":"Под домашкой — 2 ₽ за каждое отвеченное сообщение: теоретический вопрос или обычное «пожалуйста» на «спасибо»."},{"kind":"p","text":"В чате с методистом — 9 ₽ за каждое сообщение ребёнка, на которое ответил методист. Если ребёнок написал несколько сообщений подряд, оплачивается каждое."},{"kind":"p","text":"Методист Малика получит 6 ₽ за проверенное задание, а методист Даша — 2 ₽ за отвеченное сообщение Ребёнок написал три сообщения подряд — методист, который ответит, получит 27 ₽"},{"kind":"h3","text":"Дополнительная выплата за рейтинг"},{"kind":"p","text":"Топ-40 методистов получают дополнительную выплату за качество, а топ-25 могут записываться на смены в любом потоке."},{"kind":"p","text":"Дополнительные выплаты по рейтингу: топ-5 — 5 000 ₽; места 6–15 — 3 000 ₽; места 16–30 — 2 000 ₽; места 31–40 — 1 000 ₽."},{"kind":"h3","text":"Из чего складывается рейтинг"},{"kind":"h3","text":"Показатель Баллы Что оценивается"},{"kind":"p","text":"Проверки 0–10 Качество (отсутствие ошибок), внимательность, человечность (насколько легко ребёнку понять ошибку из вашего объяснения), индивидуальный подход (отклонение от скриптов, комментарии от себя), скорость и эстетика. При 0–2 баллах поднимается вопрос о продолжении сотрудничества."},{"kind":"p","text":"Ответы под домашками 0–2 Как вы отвечаете на вопросы детей под домашками — теоретические и по вашим проверкам."},{"kind":"p","text":"Чат 0–3 Работа в чате: понимаете ли вы вопросы детей, насколько подробно и понятно отвечаете."},{"kind":"p","text":"Баллы за тесты 0–5 Как вы пишете тестирования для методистов (примерно раз в месяц)."},{"kind":"p","text":"Активность в беседе 0–4 Помощь другим методистам с их вопросами, активность в теме «Частые ошибки»."},{"kind":"p","text":"Ошибки −0,5 за каждую Число домашек, в которых вы допустили ошибку."},{"kind":"p","text":"В обратной связи старший методист присылает ссылки на проверки, где вы ошиблись."},{"kind":"p","text":"По каждой обязательно напишите ребёнку:"},{"kind":"label","text":"Сообщение ученику"},{"kind":"p","text":"Привет! Пересмотрела твою работу, забыла отметить — в этом задании не забывай…"},{"kind":"h3","text":"Как получать выплату"},{"kind":"p","text":"Большинство методистов работают как самозанятые. Об особенностях этого формата — в файле по ссылке."},{"kind":"p","text":"Самозанятость: прочитайте пост Ксении и заполните форму."},{"kind":"p","text":"ГПХ или ИП: напишите Ксении (автору поста)."}]},{"title":"FAQ","blocks":[{"kind":"p","text":"Ответы на частые вопросы методистов. Готовые ответы на вопросы детей — в разделе «Чат с методистом»."},{"kind":"p","text":"На меня назначилась домашка, уже проверенная другим методистом. Что делать?"},{"kind":"p","text":"Значит, ученик написал сообщение и оно последнее в диалоге. Ответьте по контексту — учтите, что до вас там могли отвечать и другие методисты, вчитайтесь в переписку. Если там просто «спасибо, вопросов нет» — напишите что-нибудь вроде «Отлично, появятся вопросы — задавай!»."},{"kind":"p","text":"Ребёнок сдал домашку и задал под ней вопрос. Как быть?"},{"kind":"p","text":"Отправьте проверку и ответ на вопрос ОТДЕЛЬНЫМИ сообщениями. Дети боятся больших сообщений и могут просто не заметить ответ. Поэтому на вопрос отвечаем новым сообщением, чтобы ребёнок видел: его вопрос точно не остался без ответа (кроме случаев, когда вопрос касается единственного проверенного задания)."},{"kind":"p","text":"Сколько времени тратить на одну домашку?"},{"kind":"p","text":"Стараемся укладываться в 7 минут. Получается быстрее — здорово, но, пожалуйста, качественно. Дольше (не повезло с домашкой, медленный интернет) — бывает, главное, чтобы не систематически."},{"kind":"p","text":"Проверка идёт дольше 20 минут — что будет?"},{"kind":"p","text":"Вас могут снять со смены, а работа уйдёт другому методисту и не зачтётся вам."},{"kind":"p","text":"Нажимайте «Продлить проверку», как только появится кнопка."},{"kind":"p","text":"Я не ответил на вопрос / забыл отправить проверку. Меня убьют?"},{"kind":"p","text":"Нет, всякое бывает. Мы всегда на вашей стороне — формат непривычный и новый для всех. Напишите старшему методисту, решим!"},{"kind":"p","text":"Ответа нет в регламенте. Куда писать?"},{"kind":"p","text":"В тему «Вопросы» в чате методистов или старшему методисту."}]},{"title":"Примеры образцовых проверок","blocks":[{"kind":"p","text":"К чему стремиться в проверках: разборы реальных работ, которые старший методист считает образцовыми."},{"kind":"p","text":"Раздел наполняется — примеры образцовых проверок появятся здесь в ближайшее время."}]}];
  const NF_REG_SHORT = {"22":["Переменные: если пункт требует независимую и зависимую переменные, должны быть верно названы обе. Одной недостаточно.","Нулевая гипотеза: допускай равнозначные варианты «X не влияет на Y» и «Y не зависит от X»; важны смысл и конкретные величины.","Отрицательный контроль с инъекцией: нужно указать введение растворителя, а не просто отсутствие введения вещества.","В выводах и достоверности: требуй конкретные переменные, факторы и направление изменений. Общего «зависимость не установлена» недостаточно.","Синонимы и порядок ответа допустимы, если логика верна; противоречивые части ответа не засчитывай.","Общее: ошибка внутри самого элемента ключа означает, что этот элемент не засчитывается; дополнительный балл за неё не снимай. За отдельную биологическую ошибку в дополнительной информации регламент предписывает снять 1 балл.","Для линий 22–26 с нейропроверкой обязательно перепроверяй вывод ИИ: зачтённые/незачтённые пункты, разбалловку и снятие баллов. «+/−» округляется вверх; не пересылай сырой комментарий модели.","Конкретная разбалловка — только по критериям текущего задания; краткая памятка не заменяет ключ и полный регламент."],"23":["Учитывай смысл и допустимые синонимы, а не только дословное совпадение с ключом.","Причинно-следственная связь и конкретика должны быть выражены явно: намёка без объяснения может быть недостаточно.","Альтернативы через «ИЛИ» — варианты одного элемента, а не дополнительные баллы.","Не начисляй баллы механически за совпавшие слова: сопоставь ответ с вопросом, ключом и логикой.","Общее: ошибка внутри самого элемента ключа означает, что этот элемент не засчитывается; дополнительный балл за неё не снимай. За отдельную биологическую ошибку в дополнительной информации регламент предписывает снять 1 балл.","Для линий 22–26 с нейропроверкой обязательно перепроверяй вывод ИИ: зачтённые/незачтённые пункты, разбалловку и снятие баллов. «+/−» округляется вверх; не пересылай сырой комментарий модели.","Конкретная разбалловка — только по критериям текущего задания; краткая памятка не заменяет ключ и полный регламент."],"24":["Проверяй соответствие конкретному изображению, объектам и вопросу; не засчитывай расплывчатые обозначения.","Следи, чтобы ученик действительно назвал требуемые структуры/характеристики и не перепутал их.","Разбалловка зависит от ключа задания — сопоставляй число зачтённых элементов с критериями.","Общее: ошибка внутри самого элемента ключа означает, что этот элемент не засчитывается; дополнительный балл за неё не снимай. За отдельную биологическую ошибку в дополнительной информации регламент предписывает снять 1 балл.","Для линий 22–26 с нейропроверкой обязательно перепроверяй вывод ИИ: зачтённые/незачтённые пункты, разбалловку и снятие баллов. «+/−» округляется вверх; не пересылай сырой комментарий модели.","Конкретная разбалловка — только по критериям текущего задания; краткая памятка не заменяет ключ и полный регламент."],"25":["Допускаются корректные смысловые синонимы, но должны быть названы все необходимые признаки элемента.","Проверяй логическую связь объяснения с условием — верный термин без нужной связи может не раскрывать пункт.","Не засчитывай биологически неверные утверждения, даже если отдельные слова совпадают с ключом.","Общее: ошибка внутри самого элемента ключа означает, что этот элемент не засчитывается; дополнительный балл за неё не снимай. За отдельную биологическую ошибку в дополнительной информации регламент предписывает снять 1 балл.","Для линий 22–26 с нейропроверкой обязательно перепроверяй вывод ИИ: зачтённые/незачтённые пункты, разбалловку и снятие баллов. «+/−» округляется вверх; не пересылай сырой комментарий модели.","Конкретная разбалловка — только по критериям текущего задания; краткая памятка не заменяет ключ и полный регламент."],"26":["Ответ должен не просто называть факт, но и объяснять причинно-следственную связь, когда этого требует условие.","Достаточно равнозначной формулировки, необязательно повторять текст ключа.","Разделяй отсутствие элемента ключа и дополнительную биологическую ошибку — правила вычета разные.","Общее: ошибка внутри самого элемента ключа означает, что этот элемент не засчитывается; дополнительный балл за неё не снимай. За отдельную биологическую ошибку в дополнительной информации регламент предписывает снять 1 балл.","Для линий 22–26 с нейропроверкой обязательно перепроверяй вывод ИИ: зачтённые/незачтённые пункты, разбалловку и снятие баллов. «+/−» округляется вверх; не пересылай сырой комментарий модели.","Конкретная разбалловка — только по критериям текущего задания; краткая памятка не заменяет ключ и полный регламент."],"27":["В биосинтезе белка проверяй направление, матричность, комплементарность, последовательности и корректность всех этапов решения по конкретному ключу.","В задачах Харди—Вайнберга проверяй, что частоты аллелей и генотипов не смешаны; учитывай ход вычислений и округление.","В филогенетических деревьях сверяй интерпретацию узлов, ветвей и сделанные выводы с данными задания.","Для каждого типа задачи — своя разбалловка. Не применяй единый шаблон «по числу пунктов».","Общее: ошибка внутри самого элемента ключа означает, что этот элемент не засчитывается; дополнительный балл за неё не снимай. За отдельную биологическую ошибку в дополнительной информации регламент предписывает снять 1 балл.","Для линий 22–26 с нейропроверкой обязательно перепроверяй вывод ИИ: зачтённые/незачтённые пункты, разбалловку и снятие баллов. «+/−» округляется вверх; не пересылай сырой комментарий модели.","Конкретная разбалловка — только по критериям текущего задания; краткая памятка не заменяет ключ и полный регламент."],"28":["Сверяй схему скрещивания и обозначения генов/аллелей с условием.","Проверяй гаметы, генотипы, фенотипы, вероятности и пояснения в рамках конкретного задания.","При арифметической или генетической ошибке оценивай по указанным критериям, не по общему числу написанных строк.","Общее: ошибка внутри самого элемента ключа означает, что этот элемент не засчитывается; дополнительный балл за неё не снимай. За отдельную биологическую ошибку в дополнительной информации регламент предписывает снять 1 балл.","Для линий 22–26 с нейропроверкой обязательно перепроверяй вывод ИИ: зачтённые/незачтённые пункты, разбалловку и снятие баллов. «+/−» округляется вверх; не пересылай сырой комментарий модели.","Конкретная разбалловка — только по критериям текущего задания; краткая памятка не заменяет ключ и полный регламент."]};
  const NF_REG_LINE_SECTIONS = {"22":6,"23":7,"24":8,"25":7,"26":7,"27":9,"28":12};
  let nfRegOpen = false;
  let nfRegSelected = 0;
  function nfRegText(tag, text, css='') {
    const x=document.createElement(tag);x.textContent=text;if(css)x.style.cssText=css;return x;
  }
  // NeoCheck 1.74 — регламент: навигация по темам наверху, разделы по линиям,
  // выделение результатов поиска, избранное и возврат в последний раздел.
  const NF_REG_UI_KEY = 'nf_reg_ui_v3';
  const nfRegUiLoad = () => jsonLoad(NF_REG_UI_KEY, {selected:0, bookmarks:[]});
  const nfRegUiSave = (selected, bookmarks) => jsonSave(NF_REG_UI_KEY, {selected, bookmarks:[...bookmarks]});
  // Источник остаётся неизменным: группируем по заголовкам уже имеющихся разделов.
  function nfRegGroups() {
    const groups = [
      {name:'Основы', icon:'🏠', ids:[]},
      {name:'Линии ЕГЭ', icon:'🧬', ids:[]},
      {name:'Работа методиста', icon:'💼', ids:[]}
    ];
    NF_REG_SECTIONS.forEach((section, index) => {
      const title = section.title;
      const isLine = /^(?:Линия|Линии|Биологические ошибки|Оценивание второй части)/i.test(title);
      if (isLine) groups[1].ids.push(index);
      else if (/^(Основные действующие лица|Как попасть в команду|Коммуникация|Нейропроверка|Оценивание второй части)/i.test(title)) groups[0].ids.push(index);
      else groups[2].ids.push(index);
    });
    return groups.filter(x=>x.ids.length);
  }
  function nfRegModal(sectionIndex=null, query='') {
    document.getElementById('nf-reg-overlay')?.remove();
    const stored = nfRegUiLoad();
    let selected = Number.isInteger(sectionIndex) && sectionIndex>=0 ? sectionIndex : Number(stored.selected)||0;
    selected = Math.min(Math.max(selected,0),NF_REG_SECTIONS.length-1);
    let bookmarks = new Set(Array.isArray(stored.bookmarks) ? stored.bookmarks.filter(Number.isInteger) : []);
    let activeGroup = 0;
    let searchMode = false;
    let expanded27 = /^Линия\s+27/i.test(NF_REG_SECTIONS[selected].title);
    const groups = nfRegGroups();
    const findGroup = id => Math.max(0,groups.findIndex(g=>g.ids.includes(id)));
    activeGroup=findGroup(selected);
    nfRegOpen=true;
    const overlay=nfRegText('div','');overlay.id='nf-reg-overlay';
    overlay.style.cssText='position:fixed;inset:0;z-index:2147483640;background:rgba(18,15,35,.66);display:grid;place-items:center;padding:14px;box-sizing:border-box;';
    const box=nfRegText('section','');box.className='nf-reg-modern';
    box.style.cssText='width:min(1140px,98vw);height:min(870px,96vh);min-height:0;background:#fff;border-radius:22px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 95px #0c061c60;color:#29253b;font-family:Nunito,system-ui,sans-serif;';
    const header=nfRegText('div','');header.style.cssText='background:linear-gradient(115deg,#302943,#52456a);padding:19px 24px 15px;color:white;';
    const top=nfRegText('div','');top.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:12px;';
    const heading=nfRegText('div','');heading.append(nfRegText('div','NEOCHECK  /  БАЗА ЗНАНИЙ','font:800 10px/1.5 Nunito,sans-serif;letter-spacing:.16em;color:#d8cde6;'),nfRegText('strong','Регламент методиста','font:900 23px/1.5 Nunito,sans-serif;'));
    const close=nfRegText('button','✕');close.type='button';close.setAttribute('aria-label','Закрыть регламент');
    close.style.cssText='width:35px;height:35px;border:1px solid #ffffff44;background:#ffffff22;color:#fff;border-radius:11px;font:700 17px sans-serif;cursor:pointer;';
    const shut=()=>{overlay.remove();nfRegOpen=false;document.removeEventListener('keydown',onKey);};
    close.onclick=shut;overlay.addEventListener('mousedown',e=>{if(e.target===overlay)shut();});
    const onKey=e=>{if(e.key==='Escape')shut();};document.addEventListener('keydown',onKey);
    top.append(heading,close);
    const hint=nfRegText('div','Разделы сгруппированы по темам. Материалы заново перенесены из PDF от 14.10.2026, каждый раздел соответствует своей странице. Для спорных формулировок сверяйся с PDF.','font:12px/1.5 Nunito,sans-serif;color:#e9dff0;margin-top:4px;');
    header.append(top,hint);
    const tools=nfRegText('div','');tools.style.cssText='padding:13px 20px 10px;background:#faf8fe;border-bottom:1px solid #e9e4f0;display:flex;gap:10px;align-items:center;flex-wrap:wrap;';
    const finder=nfRegText('input','');finder.type='search';finder.placeholder='🔎 Найти правило, термин или пример во всём регламенте';finder.value=query;
    finder.style.cssText='box-sizing:border-box;flex:1 1 260px;min-width:160px;padding:11px 14px;border:1px solid #ddd5e9;border-radius:12px;background:white;color:#302a3e;font:600 13px Nunito,sans-serif;outline-color:#8b77ba;';
    const favorites=nfRegText('button','☆ Избранное');favorites.type='button';favorites.className='nf-reg-tool';
    const prev=nfRegText('button','←');prev.type='button';prev.title='Предыдущий раздел';prev.className='nf-reg-tool';
    const next=nfRegText('button','→');next.type='button';next.title='Следующий раздел';next.className='nf-reg-tool';
    tools.append(finder,favorites,prev,next);
    const tabs=nfRegText('nav','');tabs.style.cssText='display:flex;gap:8px;padding:11px 20px;overflow-x:auto;flex:none;border-bottom:1px solid #eee9f5;';
    const subnav=nfRegText('div','');subnav.style.cssText='padding:10px 20px 12px;display:flex;gap:7px;flex-wrap:wrap;max-height:105px;overflow-y:auto;border-bottom:1px solid #eee9f5;background:#fff;';
    const article=nfRegText('article','');article.style.cssText='flex:1;min-height:0;overflow-y:auto;padding:23px clamp(18px,4vw,56px) 55px;line-height:1.75;overflow-wrap:anywhere;background:#fff;';
    const footer=nfRegText('div','Материал для внутреннего пользования • Содержание сохранено • Избранное хранится только в браузере','padding:10px 20px;border-top:1px solid #eee9f5;background:#faf8fe;font:11px/1.4 Nunito,sans-serif;color:#817890;');
    const styles=nfRegText('style','');styles.textContent=`
      .nf-reg-modern .nf-reg-tool{border:1px solid #ddd5e9;background:#fff;border-radius:11px;color:#4a405e;padding:10px 12px;font:800 12px Nunito,sans-serif;cursor:pointer}
      .nf-reg-modern .nf-reg-tool:hover{background:#eee8f8}
      .nf-reg-modern .nf-reg-tab{white-space:nowrap;border:1px solid #ddd5e9;background:#fff;color:#554b68;border-radius:12px;padding:10px 14px;font:800 13px Nunito,sans-serif;cursor:pointer}
      .nf-reg-modern .nf-reg-tab[aria-selected="true"]{background:#48395e;color:#fff;border-color:#48395e}
      .nf-reg-modern .nf-reg-sub{border:1px solid #ebe4f4;background:#f8f5fc;color:#4c3d64;border-radius:10px;padding:8px 11px;font:750 12px Nunito,sans-serif;cursor:pointer;text-align:left}
      .nf-reg-modern .nf-reg-sub[aria-current="true"]{background:#e7def6;border-color:#b69fd6;color:#332147}
      .nf-reg-modern .nf-reg-example-card{padding:18px 21px;margin:20px 0;background:#f8f6fd;border:1px solid #e5dff0;border-left:4px solid #9c86bf;border-radius:15px}
      .nf-reg-modern .nf-reg-callout{padding:12px 15px;border-radius:12px;background:#fff7e8;border-left:3px solid #dcab5c}
      .nf-reg-modern mark{background:#ffec95;color:#242035;padding:1px 0;border-radius:2px}
      .nf-reg-modern .nf-reg-article-title{font:900 clamp(21px,3vw,29px)/1.4 Nunito,sans-serif;color:#2e2541;margin:0 0 8px}
      @media(max-width:600px){.nf-reg-modern .nf-reg-sub{font-size:11px;padding:7px 9px}.nf-reg-modern .nf-reg-tab{font-size:12px;padding:9px}.nf-reg-modern article{padding:16px!important}}
    `;
    const normalize=s=>String(s||'').toLocaleLowerCase('ru-RU');
    const matches=(s,q)=>normalize(s.title).includes(q)||s.blocks.some(x=>normalize(x.text).includes(q));
    function markText(node,value,q){
      if(!q){node.textContent=value;return;}
      const low=normalize(value);let at=0,i;
      while((i=low.indexOf(q,at))!==-1){
        node.append(document.createTextNode(value.slice(at,i)));
        const mark=document.createElement('mark');mark.textContent=value.slice(i,i+q.length);node.append(mark);at=i+q.length;
      }
      node.append(document.createTextNode(value.slice(at)));
    }
    function persist(){nfRegUiSave(selected,bookmarks);}
    function jump(index){selected=index;activeGroup=findGroup(index);searchMode=false;expanded27=/^Линия\s+27/i.test(NF_REG_SECTIONS[index].title);persist();draw();article.scrollTop=0;}
    function button(name,cls,handler){const b=nfRegText('button',name);b.type='button';b.className=cls;b.onclick=handler;return b;}
    function drawTabs(){
      tabs.replaceChildren();
      groups.forEach((group,i)=>{
        const b=button(group.icon+' '+group.name,'nf-reg-tab',()=>{activeGroup=i;searchMode=false;selected=group.ids.includes(selected)?selected:group.ids[0];persist();draw();});
        b.setAttribute('aria-selected',String(!searchMode&&activeGroup===i));tabs.append(b);
      });
      if(bookmarks.size){const b=button('★ Сохранённые','nf-reg-tab',()=>{searchMode=true;draw();});b.setAttribute('aria-selected',String(searchMode));tabs.append(b);}
    }
    function drawSubnav(){
      subnav.replaceChildren();
      const q=normalize(finder.value.trim());
      const ids=q?NF_REG_SECTIONS.map((_,i)=>i).filter(i=>matches(NF_REG_SECTIONS[i],q)):(searchMode?[...bookmarks]:groups[activeGroup].ids);
      if(!ids.length){subnav.append(nfRegText('span','Совпадений нет','font-size:12px;color:#847892;'));return;}
      let group27Rendered=false;
      ids.forEach(i=>{
        const title=NF_REG_SECTIONS[i].title;
        if(!q && !searchMode && /^Линия\s+27/i.test(title)) {
          if(!group27Rendered) {
            group27Rendered=true;
            const choose=button('🧬 Линия 27  '+(expanded27?'▴':'▾'),'nf-reg-sub',()=>{expanded27=!expanded27;drawSubnav();});
            choose.setAttribute('aria-expanded',String(expanded27));
            choose.style.fontWeight='900';
            subnav.append(choose);
          }
          if(!expanded27)return;
        }
        // «Линия 27» отображается как одна группа с уточнением при выборе темы.
        const label=title.replace(/^Линия\s+27\s*[·.:-]\s*/i,'').replace(/^Линия\s+27$/i,'Общее');
        const short=/^Линия\s+27/i.test(title)?'27 · '+label:title;
        const b=button(short,'nf-reg-sub',()=>jump(i));b.setAttribute('aria-current',String(selected===i));b.title=title;subnav.append(b);
      });
    }
    function renderArticle(){
      article.replaceChildren();
      const sec=NF_REG_SECTIONS[selected];if(!sec)return;
      const q=normalize(finder.value.trim());
      const crumb=nfRegText('div',(groups[activeGroup]?.name||'Регламент')+'  /  '+sec.title,'font:800 11px/1.5 Nunito,sans-serif;color:#8e79a5;margin-bottom:9px;');
      const headingRow=nfRegText('div','');headingRow.style.cssText='display:flex;gap:12px;align-items:flex-start;justify-content:space-between;';
      const h=nfRegText('h1',sec.title,'');h.className='nf-reg-article-title';
      const star=button(bookmarks.has(selected)?'★ В избранном':'☆ Сохранить','nf-reg-tool',()=>{bookmarks.has(selected)?bookmarks.delete(selected):bookmarks.add(selected);persist();draw();});
      headingRow.append(h,star);article.append(crumb,headingRow);
      const intro=nfRegText('div','Источник: регламент NeoFamily · 14.10.2026 · сезон 2026/27','font:700 11px Nunito,sans-serif;color:#8b8293;margin:0 0 20px;');article.append(intro);
      let blocks=sec.blocks;
      if(q&&!normalize(sec.title).includes(q)){
        const included=new Set();blocks.forEach((b,i)=>{if(normalize(b.text).includes(q)){
          for(let j=Math.max(0,i-2);j<=Math.min(blocks.length-1,i+1);j++)included.add(j);
          for(let j=i-1;j>=0;j--)if(/^h[234]$/.test(blocks[j].kind)){included.add(j);break;}
        }});blocks=blocks.filter((_,i)=>included.has(i));
      }
      let example=null;
      for(const b of blocks){
        const kind=b.kind, text=b.text;
        if(/^h[23]$/.test(kind)||/^Пример(?:\s*:|$)/i.test(text))example=null;
        if(/^Пример(?:\s*:|$)/i.test(text)){
          example=nfRegText('section','');example.className='nf-reg-example-card';article.append(example);
        }
        const tag=kind==='h2'?'h2':kind==='h3'?'h3':kind==='h4'?'h4':kind==='label'?'strong':'p';
        const node=document.createElement(tag);
        const css={h2:'font:900 21px/1.4 Nunito,sans-serif;margin:30px 0 14px;color:#a33c61;border-bottom:1px solid #eadfe9;padding-bottom:7px;',h3:'font:850 18px/1.45 Nunito,sans-serif;margin:25px 0 9px;color:#5c467d;',h4:'font:850 15px/1.55 Nunito,sans-serif;margin:20px 0 9px;color:#3c3450;',label:'display:block;font:850 13px/1.5 Nunito,sans-serif;margin:13px 0 5px;color:#69547d;',bullet:'font:14px/1.7 Nunito,sans-serif;margin:7px 0 8px 8px;padding-left:12px;border-left:2px solid #e3daee;',number:'font:14px/1.7 Nunito,sans-serif;margin:8px 0 9px 6px;',p:'font:14px/1.75 Nunito,sans-serif;margin:0 0 13px;color:#3c3547;'};
        node.style.cssText=css[kind]||css.p;
        if(kind==='p' && /^(?:Важно|Внимание|Нельзя|Не забывайте)[!\s:]/i.test(text))node.className='nf-reg-callout';
        markText(node,text,q);(example||article).append(node);
        if(example && (kind==='label'&&/^(Вердикт|Общий комментарий)\s*:/i.test(text)))node.style.color='#7345a0';
      }
      if(!blocks.length)article.append(nfRegText('p','Для этой темы совпадений не найдено.'));
    }
    function draw(){
      const q=normalize(finder.value.trim());
      if(q && !matches(NF_REG_SECTIONS[selected],q)){
        const i=NF_REG_SECTIONS.findIndex(x=>matches(x,q));if(i>=0){selected=i;activeGroup=findGroup(i);}
      }
      drawTabs();drawSubnav();renderArticle();
      favorites.textContent=bookmarks.size?'★ Избранное ('+bookmarks.size+')':'☆ Избранное';
    }
    favorites.onclick=()=>{if(!bookmarks.size){toast('Добавь раздел в избранное кнопкой ☆');return;}searchMode=true;finder.value='';draw();};
    prev.onclick=()=>jump((selected-1+NF_REG_SECTIONS.length)%NF_REG_SECTIONS.length);
    next.onclick=()=>jump((selected+1)%NF_REG_SECTIONS.length);
    finder.oninput=()=>{searchMode=false;draw();article.scrollTop=0;};
    box.append(styles,header,tools,tabs,subnav,article,footer);overlay.append(box);document.body.append(overlay);draw();
  }
  // Регламент в боковой панели: текст в развёрнутой, векторная книга в свёрнутой.
  // Отслеживаем реальную ширину aside, а не классы сайта: они могут меняться.
  const nfRegSideObserved = new WeakSet();
  function nfRegSidebarState(side) {
    const btn=side?.querySelector('#nf-reg-sidebar-link');
    if(!btn)return;
    const aside=side.closest('aside');
    const width=aside?.getBoundingClientRect().width || side.getBoundingClientRect().width;
    // При сворачивании меню NeoFamily оставляет только колонку иконок.
    const compact=width>0 && width<230;
    btn.classList.toggle('nf-reg-sidebar-compact',compact);
    btn.setAttribute('aria-label','Регламент методистов по биологии');
    btn.title='Регламент методистов по биологии';
  }
  function nfRegInject() {
    if(!document.body)return;
    const side=document.querySelector('aside nav');
    if(side && !side.querySelector('#nf-reg-sidebar-link')) {
      const a=document.createElement('button');
      a.id='nf-reg-sidebar-link';a.type='button';
      a.className='nf-reg-sidebar-link';
      a.setAttribute('aria-label','Регламент методистов по биологии');
      // Inline SVG: чёткая векторная книга без внешних ресурсов и emoji-отступов.
      a.innerHTML='<svg class="nf-reg-book-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 7.2c-2.5-1.9-5.4-2.3-9-1.8v13.2c3.6-.5 6.5-.1 9 1.8 2.5-1.9 5.4-2.3 9-1.8V5.4c-3.6-.5-6.5-.1-9 1.8Z"/><path d="M12 7.2v13.2"/><path d="M6 9.4c1.3 0 2.3.2 3.3.7M15 10.1c1-.5 2-.7 3.3-.7"/></svg><span class="nf-reg-sidebar-label">Регламент</span>';
      a.onclick=()=>nfRegModal();
      side.appendChild(a);
    }
    if(side) {
      if(!document.getElementById('nf-reg-sidebar-styles')) {
        const st=document.createElement('style');st.id='nf-reg-sidebar-styles';
        st.textContent=`
          #nf-reg-sidebar-link {box-sizing:border-box;display:flex;align-items:center;justify-content:flex-start;gap:12px;
            width:100%;max-width:100%;min-width:0;margin:0;border:0;border-radius:12px;
            padding:11px 12px;background:#e9e4f4;color:#302a3e;cursor:pointer;
            text-align:left;font:700 12px Comfortaa,system-ui,sans-serif;overflow:hidden;}
          #nf-reg-sidebar-link .nf-reg-book-icon {width:24px;height:24px;min-width:24px;flex:none;display:block;}
          #nf-reg-sidebar-link .nf-reg-sidebar-label {min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
          #nf-reg-sidebar-link.nf-reg-sidebar-compact {justify-content:center;gap:0;padding:12px 0;
            background:transparent;border-radius:13px;}
          #nf-reg-sidebar-link.nf-reg-sidebar-compact .nf-reg-book-icon {width:32px;height:32px;min-width:32px;}
          #nf-reg-sidebar-link.nf-reg-sidebar-compact .nf-reg-sidebar-label {display:none;}
          #nf-reg-sidebar-link:hover {background:#ded5ef;}
          #nf-reg-sidebar-link:focus-visible {outline:2px solid #a08aca;outline-offset:2px;}
        `;
        (document.head||document.documentElement).appendChild(st);
      }
      const aside=side.closest('aside');
      if(aside && !nfRegSideObserved.has(aside)) {
        nfRegSideObserved.add(aside);
        if(typeof ResizeObserver==='function') {
          const ro=new ResizeObserver(()=>nfRegSidebarState(side));
          ro.observe(aside);
        }
      }
      nfRegSidebarState(side);
    }
    // Никаких плашек регламента внутри карточек заданий.
    document.querySelectorAll('.nf-reg-quick, #nf-reg-top-button').forEach(node=>node.remove());
  }

  // ======================================================================
  //  ЧАСТЬ 10. Резервное копирование пользовательских данных NeoCheck
  // ======================================================================
  const NF_BACKUP_KEYS = [
    'nf_reply_templates_v1', 'nf_reply_images_v1',
    'nf_view_prefs_v1', 'nf_work_stats_v2', 'nf_work_stats_v1',
    'nf_seen_answers_v1', 'nf_msg_base_v1', 'nf_main_chat_sent_ids_v1',
    'nf_my_shifts_v1', 'nf_my_shift_windows_v1'
  ];
  const NF_BACKUP_MAGIC = 'neocheck-backup';
  function nfBackupGet(key) {
    // Сначала хранилище Tampermonkey, затем прежнее хранилище браузера.
    let value = null;
    try { if (typeof GM_getValue === 'function') value = GM_getValue(key, null); } catch (e) {}
    if (value === null || value === undefined) {
      try { value = localStorage.getItem(key); } catch (e) {}
    }
    return value;
  }
  function nfBackupSnapshot() {
    const data = {};
    for (const key of NF_BACKUP_KEYS) {
      const raw = nfBackupGet(key);
      if (raw !== null && raw !== undefined) data[key] = raw;
    }
    return { format: NF_BACKUP_MAGIC, version: 1, createdAt: new Date().toISOString(),
      origin: location.origin, data };
  }
  function nfBackupFile(snapshot, suffix='') {
    const str = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([str], {type:'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'NeoCheck_backup_' + new Date().toISOString().slice(0,10) + suffix + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  function nfBackupModal() {
    document.getElementById('nf-backup-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'nf-backup-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483642;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:16px;background:rgba(24,20,39,.64);';
    const panel = document.createElement('div');
    panel.style.cssText = 'width:min(490px,95vw);max-height:90vh;overflow:auto;box-sizing:border-box;border:1px solid #ded5ee;border-radius:20px;background:#fff;color:#302a3e;padding:24px;box-shadow:0 18px 65px #0004;font:14px/1.55 Nunito,system-ui,sans-serif;';
    const title = document.createElement('h2');
    title.textContent = '💾 Резервная копия NeoCheck';
    title.style.cssText = 'margin:0 0 10px;font-size:21px;color:#302a3e;';
    const desc = document.createElement('p');
    desc.textContent = 'Сохраняются шаблоны (включая картинки), смены, статистика и настройки NeoCheck. Копия хранится у тебя в JSON-файле, а не на сервере.';
    desc.style.cssText = 'margin:0 0 15px;color:#655b70;';
    const status = document.createElement('p');
    status.setAttribute('role','status');
    status.style.cssText = 'min-height:20px;margin:12px 0 0;color:#6552a0;font-size:12px;overflow-wrap:anywhere;';
    const button = (name) => {
      const b=document.createElement('button');b.type='button';b.textContent=name;
      b.style.cssText='width:100%;box-sizing:border-box;padding:12px 14px;margin:5px 0;border:1px solid #bba8da;border-radius:12px;background:#f4effc;color:#35244e;font:700 14px Nunito,system-ui,sans-serif;cursor:pointer;';
      return b;
    };
    const save = button('⬇ Скачать резервную копию');
    save.onclick = () => {
      try {
        const snap = nfBackupSnapshot();
        nfBackupFile(snap);
        status.textContent = 'Готово! Сохранено разделов: ' + Object.keys(snap.data).length + '. Проверь папку загрузок.';
      } catch(e) {status.textContent='Ошибка при создании копии: '+e.message;}
    };
    const restore = button('⬆ Восстановить из файла JSON');
    const file = document.createElement('input');
    file.type='file';file.accept='.json,application/json';file.hidden=true;
    restore.onclick=()=>file.click();
    file.onchange=async()=>{
      const chosen=file.files?.[0];file.value='';if(!chosen)return;
      try {
        if(chosen.size>30*1024*1024)throw Error('Файл слишком большой (максимум 30 МБ).');
        const obj=JSON.parse(await chosen.text());
        if(!obj || obj.format!==NF_BACKUP_MAGIC || obj.version!==1 || !obj.data ||
          typeof obj.data!=='object' || Array.isArray(obj.data))throw Error('Это не резервная копия NeoCheck.');
        const keys=NF_BACKUP_KEYS.filter(k=>Object.prototype.hasOwnProperty.call(obj.data,k));
        if(!keys.length)throw Error('В файле нет известных данных NeoCheck.');
        // Не импортируем произвольные поля: только разрешённые ключи и JSON-значения.
        for(const k of keys){
          const val=obj.data[k];
          if(typeof val!=='string' && (typeof val!=='object'||val===null))throw Error('Неверные данные в разделе '+k);
          const parsed=typeof val==='string'?JSON.parse(val):val;
          if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)){
            // Шаблоны — массивы, остальные ключи обычно объекты.
            if(!(['nf_reply_templates_v1','nf_reply_images_v1'].includes(k)&&Array.isArray(parsed)))
              throw Error('Некорректный формат раздела '+k);
          }
        }
        const oldCount=Object.keys(nfBackupSnapshot().data).length;
        const okay=confirm('Восстановить данные NeoCheck из файла?\n\n'
          +'Разделов для восстановления: '+keys.length+'\n'
          +'Дата копии: '+(obj.createdAt||'неизвестна')+'\n'
          +'Сейчас на устройстве: '+oldCount+' разделов.\n\n'
          +'Текущие данные в совпадающих разделах будут заменены. Перед заменой автоматически скачается страховочная копия. Продолжить?');
        if(!okay)return;
        // Сначала бэкап текущего состояния; если скачать не удастся — прерываем.
        nfBackupFile(nfBackupSnapshot(), '_before_restore');
        for(const key of keys){
          const value=typeof obj.data[key]==='string'?obj.data[key]:JSON.stringify(obj.data[key]);
          if(typeof GM_setValue==='function')GM_setValue(key,value);
          else localStorage.setItem(key,value);
        }
        status.textContent='Восстановлено '+keys.length+' разделов. Перезагрузи страницу для применения.';
        alert('NeoCheck: данные восстановлены. Обнови страницу, чтобы шаблоны, смены и статистика появились.');
      }catch(e){status.textContent='Не удалось восстановить: '+e.message;}
    };
    const note=document.createElement('p');
    note.textContent='Важно: резервная копия содержит личные данные, в том числе названия работ и сохранённые картинки. Не публикуй файл. Если старые шаблоны уже пропали из хранилища, новая копия не восстановит их задним числом.';
    note.style.cssText='font-size:12px;color:#8a778a;margin:13px 0 0;';
    const close=button('Закрыть');close.style.background='#fff';
    const shut=()=>overlay.remove();close.onclick=shut;
    overlay.addEventListener('mousedown',e=>{if(e.target===overlay)shut();});
    panel.append(title,desc,save,restore,file,status,note,close);
    overlay.appendChild(panel);document.body.appendChild(overlay);
  }
  function nfBackupInject() {
    const side=document.querySelector('aside nav');
    if(side && !document.getElementById('nf-backup-sidebar-link')){
      const b=document.createElement('button');b.id='nf-backup-sidebar-link';b.type='button';
      b.title='Резервное копирование NeoCheck';b.setAttribute('aria-label','Резервное копирование NeoCheck');
      b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v7h10V3M7 21v-8h10v8M10 6h4"/></svg><span>Резервная копия</span>';
      // Делаем кнопку резервной копии геометрически идентичной «Регламенту»,
      // чтобы в свернутом сайдбаре обе иконки стояли строго на одной оси.
      b.style.cssText='box-sizing:border-box;display:flex;align-items:center;justify-content:flex-start;gap:12px;width:100%;max-width:100%;min-width:0;margin:0;border:0;border-radius:12px;padding:11px 12px;background:#e9e4f4;color:#302a3e;cursor:pointer;text-align:left;font:700 12px Comfortaa,system-ui,sans-serif;overflow:hidden;';
      b.querySelector('svg').style.cssText='width:24px;height:24px;min-width:24px;flex:none;display:block;';
      b.querySelector('span').style.cssText='min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      b.onclick=nfBackupModal;
      side.appendChild(b);
    }
    const b=document.getElementById('nf-backup-sidebar-link');
    if(b){
      const compact=(b.closest('aside')?.getBoundingClientRect().width||0)<230;
      b.querySelector('span').hidden=compact;
      b.style.justifyContent=compact?'center':'flex-start';
      b.style.gap=compact?'0':'12px';
      b.style.padding=compact?'12px 0':'11px 12px';
      b.style.margin='0';
      b.style.background=compact?'transparent':'#e9e4f4';
      b.style.borderRadius=compact?'13px':'12px';
      const icon=b.querySelector('svg');
      icon.style.width=icon.style.height=compact?'32px':'24px';
      icon.style.minWidth=compact?'32px':'24px';
      // Оптическая компенсация: контур дискеты визуально тяжелее справа,
      // поэтому в свернутом сайдбаре сдвигаем только сам SVG на 2px влево.
      icon.style.transform=compact?'translateX(-2px)':'none';
    }
  }

  // ======================================================================
  //  ЧАСТЬ 11. Быстрые ответы и режим концентрации (только интерфейс).
  //  Ответы лишь вставляются в редактор; отправку контролирует методист.
  // ======================================================================
  const NF_FAST_REPLIES = [
    ['💗 Пожалуйста', 'Пожалуйста! Если появятся вопросы, обязательно спрашивай <3'],
    ['✨ Успехов', 'Успехов в учёбе! Всё обязательно получится 💜'],
    ['💬 Спрашивай', 'Если что-то осталось непонятным, смело задавай вопросы! Мы всегда рядом <3'],
    ['🌷 На связи', 'Всегда на связи! Если возникнут новые вопросы, обязательно пиши 💗']
  ];

  function nfInsertQuickReply(editor, value) {
    if (!editor || !editor.isConnected) { toast('Поле ответа не найдено', true); return; }
    // Вставка через штатный обработчик Tiptap с поддержкой текста и абзацев.
    // Не делаем .innerHTML= и не нажимаем кнопку отправки.
    try { insertText(editor, value); }
    catch (err) { console.error('[NeoCheck quick reply]', err); toast('Не удалось вставить ответ', true); }
  }

  function nfQuickReplyInject() {
    document.querySelectorAll('[id^="attempt-"][id$="-dialogue"]').forEach(cont => {
      const editor=cont.querySelector('.ProseMirror[contenteditable="true"]');
      if(!editor || cont.querySelector('.nf-quick-replies')) return;
      const panel=cont.querySelector('.nf-tpl-panel');
      const box=editor.closest('.rounded-2xl');
      if(!panel && !box?.parentElement) return;
      const bar=document.createElement('div');
      bar.className='nf-quick-replies';
      bar.style.cssText='display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:5px 0 11px;max-width:100%;';
      const caption=document.createElement('span');
      caption.textContent='⚡ Быстрый ответ:';
      caption.style.cssText='font:700 12px Comfortaa,system-ui,sans-serif;color:#675d76;margin-right:2px;';
      bar.appendChild(caption);
      NF_FAST_REPLIES.forEach(([title,body])=>{
        const b=document.createElement('button');
        b.type='button';b.textContent=title;b.title=body;
        b.style.cssText='border:1px solid #cdb9e8;background:#f7f2ff;color:#473565;border-radius:999px;padding:7px 11px;font:700 11px Comfortaa,system-ui,sans-serif;cursor:pointer;';
        b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();nfInsertQuickReply(editor,body);});
        bar.appendChild(b);
      });
      if(panel)panel.after(bar);
      else box.parentElement.insertBefore(bar,box);
    });
  }

  // Spotlight-фокус: не изменяем DOM ключа/ответа и не блокируем мышь.
  // SVG-маска оставляет два отдельных «окна» над ответом и ключом.
  // Сохраняем предпочтение между домашками и перезагрузками, не привязывая к конкретному ученику.
  const NF_FOCUS_PREF_KEY='nf_focus_enabled_v1';
  let nfFocusEnabled=GM_getValue(NF_FOCUS_PREF_KEY, false) === true;
  let nfFocusCard=null;
  let nfFocusFrame=0;
  let nfFocusOverlay=null;
  const NF_FOCUS_SHADE=0.28;
  const NF_FOCUS_SVG_NS='http://www.w3.org/2000/svg';

  // Подсветка блока выставления баллов (минус / текущий балл / плюс).
  // Используем ID существующего компонента NeoFamily, не вмешиваясь в его события.
  function nfFocusScoreControl(card) {
    if (!card?.isConnected) return null;
    const score=card.querySelector('[id$="-score-input"]');
    if (!score) return null;
    // Встречаются разные варианты верстки: кнопки внутри поля или рядом с ним.
    // Выбираем самый маленький общий контейнер, чтобы не осветлять всю карточку.
    let fallback=score;
    for(let node=score, depth=0; node && node!==card && depth<5; node=node.parentElement,depth++){
      const bounds=node.getBoundingClientRect();
      if(bounds.width>440 || bounds.height>155)break;
      const buttons=[...node.querySelectorAll('button, [role="button"]')];
      const name=b=>(b.getAttribute('aria-label')||b.getAttribute('title')||b.textContent||'').trim().toLowerCase();
      const minus=buttons.some(b=>/^(?:−|-|–|минус|уменьшить|снизить)/.test(name(b)));
      const plus=buttons.some(b=>/^(?:\+|＋|плюс|увеличить|добавить)/.test(name(b)));
      if(minus && plus)return node;
      // При отсутствии явных текстовых знаков (например, SVG-иконки)
      // достаточно двух кнопок рядом с ID счетчика.
      if(buttons.length>=2 && buttons.length<=3)fallback=node;
    }
    return fallback;
  }

  function nfFocusSpotNodes(card) {
    if (!card?.isConnected) return [];
    const p=cardParts(card);
    let nodes=[];
    if (p) nodes=[p.ans,p.key].filter(Boolean);
    else {
      const region=card.querySelector('[role="region"]') || card;
      const label=[...region.querySelectorAll('span')].find(x=>/^Ответ ученика\s*:?$/i.test(x.textContent.trim()));
      const answer=label?.parentElement || null;
      const key=[...region.querySelectorAll(DETAIL)].find(x=>/Элементы (ключа|ответа)/i.test(x.textContent));
      nodes=[answer,key].filter(Boolean);
    }
    // Шкала баллов подсвечивается наравне с ключом и ответом.
    const scoreControl=nfFocusScoreControl(card);
    if(scoreControl)nodes.push(scoreControl);
    // Поле комментария ПОД КОНКРЕТНЫМ заданием также остаётся светлым.
    // Используем сам редактор и небольшую оболочку, не подсвечивая всю карточку целиком.
    const editors=[...card.querySelectorAll('.ProseMirror[contenteditable="true"], [contenteditable="true"][role="textbox"], textarea')];
    for (const editor of editors) {
      const parent=editor.parentElement;
      const er=editor.getBoundingClientRect();
      const pr=parent?.getBoundingClientRect();
      const compact=parent && pr && pr.width<=er.width+65 && pr.height<=Math.max(er.height+95,235);
      nodes.push(compact?parent:editor);
    }
    return [...new Set(nodes)].filter(Boolean);
  }

  function nfFocusPickCard() {
    if(nfFocusCard?.isConnected && nfFocusSpotNodes(nfFocusCard).length){
      const r=nfFocusCard.getBoundingClientRect();
      if(r.bottom>innerHeight*0.12 && r.top<innerHeight*0.88)return nfFocusCard;
    }
    const cards=[...document.querySelectorAll('[data-task-id]')];
    // Первая карточка, чей ответ ближе к центру экрана.
    nfFocusCard=cards.filter(c=>nfFocusSpotNodes(c).length).sort((a,b)=>{
      const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();
      const distance=r=>Math.abs((r.top+r.bottom)/2-innerHeight/2);
      return distance(ar)-distance(br);
    })[0] || null;
    return nfFocusCard;
  }

  function nfFocusRect(el) {
    if(!el) return null;
    const r=el.getBoundingClientRect();
    const x=Math.max(0,r.left-7),y=Math.max(0,r.top-7);
    const right=Math.min(innerWidth,r.right+7),bottom=Math.min(innerHeight,r.bottom+7);
    if(right<=x || bottom<=y) return null;
    return {x,y,w:right-x,h:bottom-y};
  }

  let nfFocusScoreFlashUntil=0;
  let nfFocusScoreFlashTimer=0;

  function nfFocusUpdate() {
    nfFocusFrame=0;
    if(!nfFocusEnabled || !nfFocusOverlay) return;
    const card=nfFocusPickCard();
    const nodes=nfFocusSpotNodes(card);
    // Также оставляем ярким общий комментарий в «Диалоге с учеником» внизу домашки.
    const generalEditors=[...document.querySelectorAll('[id$="-dialogue"] .ProseMirror[contenteditable="true"]')];
    for(const editor of generalEditors){
      const er=editor.getBoundingClientRect();
      if(er.bottom<0 || er.top>innerHeight)continue;
      const parent=editor.parentElement;
      const pr=parent?.getBoundingClientRect();
      const compact=parent && pr && pr.width<=er.width+65 && pr.height<=Math.max(er.height+95,235);
      nodes.push(compact?parent:editor);
    }
    const rects=nodes.map(nfFocusRect).filter(Boolean);
    const svg=nfFocusOverlay;
    svg.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
    svg.setAttribute('width',String(innerWidth));
    svg.setAttribute('height',String(innerHeight));
    const holes=svg.querySelector('#nf-focus-holes');
    const edges=svg.querySelector('#nf-focus-edges');
    holes.replaceChildren();edges.replaceChildren();
    const scoreNode=nfFocusScoreControl(card);
    const scoreRect=scoreNode ? nfFocusRect(scoreNode) : null;
    for(const r of rects){
      const isScore=scoreRect && Math.abs(r.x-scoreRect.x)<1 && Math.abs(r.y-scoreRect.y)<1
        && Math.abs(r.w-scoreRect.w)<1 && Math.abs(r.h-scoreRect.h)<1;
      const flashing=isScore && Date.now()<nfFocusScoreFlashUntil;
      const mk=()=>document.createElementNS(NF_FOCUS_SVG_NS,'rect');
      const hole=mk();
      const stroke=mk();
      for(const el of [hole,stroke]){
        el.setAttribute('x',r.x);el.setAttribute('y',r.y);
        el.setAttribute('width',r.w);el.setAttribute('height',r.h);
        el.setAttribute('rx','13');
      }
      hole.setAttribute('fill','black');
      stroke.setAttribute('fill','none');stroke.setAttribute('stroke','#b7a5e6');
      stroke.setAttribute('stroke-width',flashing?'3.5':'2');
      if(flashing)stroke.setAttribute('stroke','#9672e1');
      holes.appendChild(hole);edges.appendChild(stroke);
    }
    // При невозможности найти блоки ничего не затемняем.
    svg.style.display=rects.length?'block':'none';
  }

  function nfFocusSchedule(){
    if(nfFocusEnabled && !nfFocusFrame)nfFocusFrame=requestAnimationFrame(nfFocusUpdate);
  }

  function nfFocusEnsureOverlay(){
    if(nfFocusOverlay?.isConnected)return;
    const svg=document.createElementNS(NF_FOCUS_SVG_NS,'svg');
    svg.id='nf-check-spotlight';
    svg.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:9990;overflow:visible;';
    svg.innerHTML=`<defs><mask id="nf-focus-mask" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse"><rect x="0" y="0" width="100%" height="100%" fill="white"/><g id="nf-focus-holes"></g></mask></defs><rect width="100%" height="100%" fill="rgba(19,16,33,${NF_FOCUS_SHADE})" mask="url(#nf-focus-mask)"/><g id="nf-focus-edges"></g>`;
    document.body.appendChild(svg);
    nfFocusOverlay=svg;
  }

  function nfFocusSet(enabled){
    nfFocusEnabled=!!enabled;
    GM_setValue(NF_FOCUS_PREF_KEY, nfFocusEnabled);
    document.documentElement.classList.toggle('nf-check-focus',nfFocusEnabled);
    if(nfFocusEnabled){nfFocusEnsureOverlay();nfFocusSchedule();}
    else {nfFocusOverlay?.remove();nfFocusOverlay=null;nfFocusCard=null;}
    const button=document.getElementById('nf-check-focus-toggle');
    if(button){
      const caption=nfFocusEnabled?'✕ Выйти из фокуса':'🎯 Фокус';
      if(button.textContent!==caption)button.textContent=caption;
      button.title=nfFocusEnabled?'Вернуть обычный интерфейс (Esc)':'Подсветить ответ и ключ; остальные элементы слегка затемнить';
      button.setAttribute('aria-pressed',String(nfFocusEnabled));
      button.style.background=nfFocusEnabled?'#4c3b72':'#fff';
      button.style.color=nfFocusEnabled?'#fff':'#493766';
    }
  }
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape' && nfFocusEnabled && !document.querySelector('#nf-reg-overlay, #nf-backup-overlay, [role="dialog"]')) nfFocusSet(false);
  });
  // Выделяем ту карточку, в которой пользователь работает; прокрутка не перехватывается.
  document.addEventListener('pointerdown',e=>{
    if(!nfFocusEnabled || e.target.closest('#nf-check-focus-toggle'))return;
    const card=e.target.closest('[data-task-id]');
    if(card && card!==nfFocusCard){nfFocusCard=card;nfFocusSchedule();}
  },true);
  // Ненавязчивое подтверждение изменения оценки: ярче обводка ровно на секунду.
  document.addEventListener('click',e=>{
    if(!nfFocusEnabled)return;
    const card=e.target.closest('[data-task-id]');
    const score=card && nfFocusScoreControl(card);
    if(!score || !score.contains(e.target))return;
    const button=e.target.closest('button, [role="button"]');
    if(!button)return;
    nfFocusCard=card;
    nfFocusScoreFlashUntil=Date.now()+1000;
    nfFocusSchedule();
    clearTimeout(nfFocusScoreFlashTimer);
    nfFocusScoreFlashTimer=setTimeout(nfFocusSchedule,1000);
  },true);
  document.addEventListener('scroll',nfFocusSchedule,true);
  window.addEventListener('resize',nfFocusSchedule,{passive:true});

  const NF_THEME_STORAGE_KEY='nf_themes_choice_v2';

  function nfThemeDockInject(){
    let dock=document.getElementById('nf-quick-dock');
    if(!document.getElementById('nf-quick-dock-style')){
      const st=document.createElement('style');st.id='nf-quick-dock-style';
      st.textContent=`
        #nf-quick-dock {position:fixed;left:16px;bottom:16px;z-index:9992;display:flex;align-items:flex-end;gap:8px;
          font-family:Comfortaa,system-ui,sans-serif;pointer-events:auto;}
        #nf-quick-dock .nf-dock-btn {height:38px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:6px;
          border:1px solid #d8c7e8;border-radius:13px;background:#fff;color:#493766;box-shadow:0 5px 18px #30204d26;
          padding:0 12px;font:800 12px Comfortaa,system-ui,sans-serif;cursor:pointer;white-space:nowrap;
          transition:transform .18s,background .18s,opacity .18s,border-color .18s;}
        #nf-quick-dock .nf-dock-btn:hover {transform:translateY(-2px);opacity:1;}
        #nf-check-focus-toggle[data-disabled="true"] {opacity:.52;cursor:not-allowed;}
        #nf-theme-dock-wrap {position:relative;}
        #nf-theme-dock-menu {position:absolute;left:0;bottom:46px;min-width:178px;padding:7px;display:flex;flex-direction:column;gap:5px;
          background:#fff;border:1px solid #d8c7e8;border-radius:13px;box-shadow:0 10px 28px rgba(48,32,77,.18);}
        #nf-theme-dock-menu[hidden]{display:none !important;}
        #nf-theme-dock-menu button {width:100%;border:0;border-radius:10px;padding:8px 10px;text-align:left;background:transparent;color:#493766;
          font:750 12px Comfortaa,system-ui,sans-serif;cursor:pointer;}
        #nf-theme-dock-menu button:hover,#nf-theme-dock-menu button[data-active="true"]{background:#f3edf8;}
        html[data-nf-theme="halloween"] #nf-quick-dock .nf-dock-btn {background:#382a42;color:#f7edf6;border-color:#76566f;box-shadow:0 6px 20px rgba(0,0,0,.28);}
        html[data-nf-theme="halloween"] #nf-quick-dock .nf-dock-btn:hover {background:#4b3550;border-color:#9b6a86;}
        html[data-nf-theme="halloween"] #nf-theme-dock-menu {background:#302337;border-color:#76566f;box-shadow:0 12px 30px rgba(0,0,0,.42);}
        html[data-nf-theme="halloween"] #nf-theme-dock-menu button {color:#f7edf6;}
        html[data-nf-theme="halloween"] #nf-theme-dock-menu button:hover,
        html[data-nf-theme="halloween"] #nf-theme-dock-menu button[data-active="true"]{background:#49344f;}
        html.nf-check-focus #tm-pink-coquette-decor,html.nf-check-focus .tm-pink-note {display:none !important;}
        @media(max-width:700px){#nf-quick-dock{left:10px;bottom:10px;gap:6px;}#nf-quick-dock .nf-dock-btn{height:36px;padding:0 10px;font-size:11px;}}
        @media(prefers-reduced-motion:reduce){#nf-quick-dock .nf-dock-btn{transition:none;}}
      `;
      document.head.appendChild(st);
    }
    if(dock && dock.isConnected)return dock;

    dock=document.createElement('div');dock.id='nf-quick-dock';

    const focus=document.createElement('button');
    focus.id='nf-check-focus-toggle';focus.className='nf-dock-btn';focus.type='button';focus.textContent='🎯 Фокус';
    focus.addEventListener('click',()=>{
      const available=/\/students-homework\/[^/]+/.test(location.pathname) && !!document.querySelector('[data-task-id]');
      if(!available){toast('Фокус доступен при проверке домашки', true);return;}
      nfFocusSet(!nfFocusEnabled);
    });

    const themeWrap=document.createElement('div');themeWrap.id='nf-theme-dock-wrap';
    const themeBtn=document.createElement('button');themeBtn.id='nf-theme-dock-toggle';themeBtn.className='nf-dock-btn';themeBtn.type='button';themeBtn.textContent='🎨 Тема';
    themeBtn.setAttribute('aria-expanded','false');
    const menu=document.createElement('div');menu.id='nf-theme-dock-menu';menu.hidden=true;
    const options=[['pink','🎀 Pink Pick Me'],['halloween','🎃 Halloween']];
    const current=()=>document.documentElement.dataset.nfTheme || (()=>{try{return localStorage.getItem(NF_THEME_STORAGE_KEY)||'pink';}catch{return 'pink';}})();
    options.forEach(([value,label])=>{
      const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.value=value;
      b.dataset.active=String(current()===value);
      b.addEventListener('click',()=>{
        try{localStorage.setItem(NF_THEME_STORAGE_KEY,value);}catch(e){}
        document.documentElement.dataset.nfTheme=value;
        menu.hidden=true;themeBtn.setAttribute('aria-expanded','false');
        setTimeout(()=>location.reload(),60);
      });
      menu.appendChild(b);
    });
    themeBtn.addEventListener('click',e=>{
      e.stopPropagation();menu.hidden=!menu.hidden;themeBtn.setAttribute('aria-expanded',String(!menu.hidden));
      menu.querySelectorAll('button').forEach(b=>b.dataset.active=String(b.dataset.value===current()));
    });
    document.addEventListener('pointerdown',e=>{if(!themeWrap.contains(e.target)){menu.hidden=true;themeBtn.setAttribute('aria-expanded','false');}});
    themeWrap.append(themeBtn,menu);
    dock.append(focus,themeWrap);
    document.body.appendChild(dock);
    return dock;
  }

  function nfFocusInject(){
    const isDetail=/\/students-homework\/[^/]+/.test(location.pathname) && !!document.querySelector('[data-task-id]');
    nfThemeDockInject();
    const button=document.getElementById('nf-check-focus-toggle');
    if(!button)return;

    if(!isDetail){
      nfFocusOverlay?.remove();nfFocusOverlay=null;nfFocusCard=null;
      document.documentElement.classList.remove('nf-check-focus');
      button.textContent='🎯 Фокус';
      button.title='Фокус включается на странице проверки домашки';
      button.dataset.disabled='true';
      button.setAttribute('aria-pressed','false');
      button.style.background='';button.style.color='';
      return;
    }

    delete button.dataset.disabled;
    document.documentElement.classList.toggle('nf-check-focus',nfFocusEnabled);
    if(nfFocusEnabled){nfFocusEnsureOverlay();nfFocusSchedule();}
    button.textContent=nfFocusEnabled?'✕ Фокус':'🎯 Фокус';
    button.title=nfFocusEnabled?'Вернуть обычный интерфейс (Esc)':'Подсветить ответ, ключ, баллы и поле комментария';
    button.setAttribute('aria-pressed',String(nfFocusEnabled));
    if(nfFocusEnabled){
      button.style.background='#4c3b72';button.style.color='#fff';button.style.borderColor='#4c3b72';
    }else{
      button.style.background='';button.style.color='';button.style.borderColor='';
    }
  }

  // ======================================================================
  // NeoCheck -> school Google Apps Script (opt-in, private preview only)
  // ======================================================================
  const NC_CFG_KEY = 'nf_nc_gas_cfg_v1';
  const NC_SCHOOL_URL = 'https://script.google.com/macros/s/AKfycbwrJmBKt19r676ojqRRPAvbFrh9q22CeC2MKN7Rxcx1zTyDsgtipUrpZsTNy2_Seqxuxg/exec';
  const NC_BOT_URL = 'https://t.me/MetodistNotifications_bot';
  const NC_SYNC_INTERVAL_MS = 3 * 60 * 60 * 1000; // once every 3 hours while page is open
  let ncBusy = false;
  let ncLinkSession = null;
  let ncLastSync = 0;
  function ncCfg() { return jsonLoad(NC_CFG_KEY, {url:NC_SCHOOL_URL,key:'',enabled:false}); }
  function ncHttp(url, payload, retries=2) {
    return new Promise((resolve, reject) => {
      const attempt = (left) => GM_xmlhttpRequest({
        method:'POST', url, headers:{'Content-Type':'text/plain;charset=utf-8'},
        data:JSON.stringify(payload), timeout:25000,
        onload:r => {
          let j;
          try { j=JSON.parse(r.responseText); }
          catch(e) {
            // Google occasionally returns HTML instead of the expected JSON.
            if(left>0) { setTimeout(()=>attempt(left-1), 2500); return; }
            reject(new Error('Google вернул не JSON. Попробуйте позже.')); return;
          }
          if(!j || typeof j.ok !== 'boolean') {
            reject(new Error('Некорректный ответ сервера')); return;
          }
          if(j.ok) resolve(j);
          else { const err=new Error(j.error||'API_ERROR'); err.code=j.error; reject(err); }
        },
        onerror:()=>reject(new Error('Сетевая ошибка')),
        ontimeout:()=>reject(new Error('Таймаут'))
      });
      attempt(retries);
    });
  }
  function ncDaily() {
    const s=loadStats(); const m=new Map();
    s.records.forEach(r=>{
      if(!/^20\d\d-\d\d-\d\d$/.test(String(r.date))) return;
      const x=m.get(r.date)||{date:r.date,regular:0,neuro:0,msgs:0,chatMsgs:0,money:0};
      x.regular+=Number(r.regular)||0; x.neuro+=Number(r.neuro)||0;
      x.msgs+=Number(r.msgs)||0; x.chatMsgs+=Number(r.chatMsgs)||0;
      x.money+=recMoney(r,s); m.set(r.date,x);
    });
    const now = new Date();
    const dateISO = d => [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
    const end=dateISO(now), start=dateISO(new Date(now.getFullYear(),now.getMonth(),now.getDate()-44));
    return [...m.values()].filter(x=>x.date>=start && x.date<=end)
      .sort((a,b)=>a.date.localeCompare(b.date))
      .map(x=>({...x,money:Math.round(x.money*100)/100}));
  }
  async function ncSync(manual=false) {
    const cfg=ncCfg();
    if(!cfg.enabled || !cfg.key || ncBusy) return;
    ncBusy=true;
    try {
      await ncHttp(NC_SCHOOL_URL,{action:'neocheck_sync_v1',key:cfg.key,days:ncDaily()});
      ncLastSync=Date.now();
      if(manual) toast('✅ NeoCheck: статистика отправлена');
    } catch(e) {
      console.warn('[NeoCheck Telegram]',e.message);
      if(e.code==='UNAUTHORIZED') {
        jsonSave(NC_CFG_KEY,{...cfg,enabled:false,key:''});
        toast('Ключ больше не действует, привяжите Telegram заново',true);
      } else if(manual) toast('Telegram: '+e.message,true);
    } finally {ncBusy=false;}
  }
  function ncOpenBot(url) {
    if(typeof GM_openInTab==='function') GM_openInTab(url,{active:true,insert:true});
    else window.open(url,'_blank','noopener,noreferrer');
  }
  function ncModal() {
    document.getElementById('nf-nc-link-modal')?.remove();
    const cover=el('div','position:fixed;inset:0;z-index:2147483646;background:#1d163a99;display:flex;align-items:center;justify-content:center;padding:16px;');
    cover.id='nf-nc-link-modal';
    const box=el('div','width:min(440px,100%);box-sizing:border-box;background:white;color:#28213b;border-radius:18px;padding:22px;box-shadow:0 14px 50px #0004;font:14px/1.5 sans-serif;');
    const title=el('div','font:bold 19px sans-serif;margin-bottom:10px;', {textContent:'🔗 Подключение Telegram'});
    const message=el('div','white-space:pre-line;margin-bottom:14px;',{textContent:'Подключи школьный бот, чтобы видеть свою статистику и предварительный заработок.'});
    const actions=el('div','display:flex;gap:8px;flex-wrap:wrap;');
    const primary=el('button',CHIP,{type:'button',textContent:'Привязать Telegram'});
    const manual=el('button',MINI,{type:'button',textContent:'Ввести ключ вручную'});
    const sync=el('button',MINI,{type:'button',textContent:'Отправить сейчас'});
    const disconnect=el('button',MINI,{type:'button',textContent:'Отключить'});
    const close=el('button',MINI,{type:'button',textContent:'Закрыть'});
    const endSession=()=>{ if(ncLinkSession){ncLinkSession.cancelled=true;ncLinkSession=null;} };
    const stop=()=>{endSession();cover.remove();};
    close.onclick=stop;
    cover.addEventListener('mousedown',e=>{if(e.target===cover)stop();});
    const cfg=ncCfg();
    if(cfg.enabled && cfg.key) {
      message.textContent='🟢 Telegram подключён. Статистика отправляется при подключении и раз в 3 часа, пока открыт NeoFamily.';
      primary.textContent='Привязать заново';
    }
    const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    primary.onclick=async()=>{
      endSession();
      const session={cancelled:false}; ncLinkSession=session;
      primary.disabled=true; manual.disabled=true;
      message.textContent='Создаём одноразовое подключение…';
      try {
        const start=await ncHttp(NC_SCHOOL_URL,{action:'neocheck_link_start_v1'});
        if(session.cancelled)return;
        if(!/^[0-9a-f]{32}$/i.test(String(start.code||'')) || !/^https:\/\/t\.me\/MetodistNotifications_bot\?start=nc_[0-9a-f]{32}$/i.test(String(start.url||'')))
          throw new Error('Сервер прислал неверные данные привязки');
        const seconds=Math.min(600,Math.max(1,Number(start.expires_in)||600));
        const endAt=Date.now()+seconds*1000;
        message.textContent='Открой бота и подтверди привязку.\n\nПроверочный код: '+String(start.check||'—')+'\n\nБот обрабатывает команды примерно раз в минуту. Ожидаем подтверждения (до 10 минут)…';
        ncOpenBot(start.url);
        while(!session.cancelled && Date.now()<endAt) {
          await sleep(4000);
          if(session.cancelled) return;
          let result;
          try { result=await ncHttp(NC_SCHOOL_URL,{action:'neocheck_link_poll_v1',code:start.code},1); }
          catch(e) {
            if(['DECLINED','EXPIRED','BAD_REQUEST','BUSY','BOT_NOT_READY'].includes(e.code)) throw e;
            // Temporary Google errors should not terminate the link flow.
            console.warn('[NeoCheck link]',e.message);
            continue;
          }
          if(session.cancelled)return;
          if(result.status==='pending')continue;
          if(result.status==='ready') {
            if(typeof result.key!=='string' || result.key.length!==128) throw new Error('Сервер прислал некорректный ключ');
            jsonSave(NC_CFG_KEY,{url:NC_SCHOOL_URL,key:result.key,enabled:true});
            message.textContent='✅ Telegram подключён! Отправляем статистику…';
            toast('Telegram успешно привязан');
            ncSync(true);
            return;
          }
          throw new Error('Неизвестный статус привязки');
        }
        if(!session.cancelled)throw new Error('Время привязки истекло. Начните заново.');
      } catch(e) {
        if(!session.cancelled) {
          const errors={DECLINED:'Привязка отменена в Telegram.',EXPIRED:'Срок действия кода истёк. Начните заново.',BUSY:'Слишком много попыток привязки. Повторите позже.',BOT_NOT_READY:'Бот пока не готов. Попробуйте позже.',BAD_REQUEST:'Некорректный запрос. Попробуйте заново.',SERVER_ERROR:'Ошибка сервера. Попробуйте позже.'};
          message.textContent='❌ '+(errors[e.code]||e.message);
        }
      } finally {
        if(ncLinkSession===session) ncLinkSession=null;
        if(cover.isConnected){primary.disabled=false;manual.disabled=false;}
      }
    };
    manual.onclick=()=>{
      endSession();
      const key=prompt('Личный ключ из /nc_token. Никому его не передавайте:');
      if(key===null)return;
      if(key.trim().length!==128){toast('Неверная длина ключа',true);return;}
      if(!confirm('Включить отправку личной статистики в школьного бота?'))return;
      jsonSave(NC_CFG_KEY,{url:NC_SCHOOL_URL,key:key.trim(),enabled:true});
      message.textContent='🟢 Telegram подключён через личный ключ.';
      ncSync(true);
    };
    sync.onclick=()=>{if(!ncCfg().enabled){toast('Сначала привяжите Telegram',true);return;} ncSync(true);};
    disconnect.onclick=()=>{
      if(!confirm('Отключить отправку статистики? Данные, уже отправленные школе, останутся на сервере.'))return;
      endSession();jsonSave(NC_CFG_KEY,{url:NC_SCHOOL_URL,key:'',enabled:false});
      message.textContent='Telegram отключён. Для нового подключения нажмите «Привязать Telegram».';
    };
    actions.append(primary,manual,sync,disconnect,close);
    box.append(title,message,actions); cover.append(box); document.body.append(cover);
  }
  function nfTgInject() {
  // Создаём нижнюю панель NeoCheck, если её ещё нет.
  const dock = nfThemeDockInject();
  if (!dock) return;

  // Если кнопка уже существует — просто проверяем её расположение.
  let b = document.getElementById('nf-nc-telegram');

  if (b) {
    if (b.parentElement !== dock) {
      dock.appendChild(b);
    }
    return;
  }

  // Telegram находится рядом с «Фокус» и «Тема».
  b = document.createElement('button');
  b.id = 'nf-nc-telegram';
  b.type = 'button';
  b.className = 'nf-dock-btn';
  b.textContent = '🔗 Telegram';
  b.title = 'Подключение Telegram и синхронизация статистики';

  b.addEventListener('click', ncModal);

  dock.appendChild(b);
}
  setInterval(()=>ncSync(false),NC_SYNC_INTERVAL_MS);

  // ======================================================================
  //  ЧАСТЬ 12. Кто в каком чате: «🔒 Имя» на карточках списка чатов.
  //  Сайт не сообщает, кем занят чат. Поэтому, пока методист держит чат
  //  (сайт успешно продлевает резерв: POST /v2/chats/{id}/reservations),
  //  NeoCheck раз в 45 с отмечается на сервере бота смен, а в списке
  //  чатов спрашивает, кто где сидит, а над свободными чатами показывает,
  //  кто заходил последним (до 7 дней). Нужна Telegram-привязка (ключ в ncCfg).
  //  Текст переписки не читается и никуда не отправляется — только id чата.
  // ======================================================================
  const NC_HOLD_EVERY_MS = 45 * 1000;
  const NC_WHO_EVERY_MS = 20 * 1000;
  const NC_CHAT_ID_RE = /\/chat\/([0-9a-z]{26})(?:[/?#]|$)/;
  const NC_RESERVE_RE = /\/v2\/chats\/([0-9a-z]{26})\/reservations(?:[?#]|$)/;
  let ncHeld = null, ncHeldSent = 0;
  let ncWho = {}, ncWhoAt = 0, ncWhoIds = '', ncWhoBusy = false;
  let ncLast = {};
  let ncDeniedShown = '';
  let ncWhoError = '';
  let ncReserveObserved = false;
  let ncLastConfirmedChat = '';

  function ncChatKey() { return ncCfg().key || ''; }
  function ncPageChatId() { const m = location.pathname.match(NC_CHAT_ID_RE); return m ? m[1] : null; }

  function ncHoldPing(force) {
    const key = ncChatKey();
    if (!key || !ncHeld || (!force && Date.now() - ncHeldSent < NC_HOLD_EVERY_MS)) return;
    ncHeldSent = Date.now();
    const chatId = ncHeld;
    ncHttp(NC_SCHOOL_URL, {action:'neocheck_chat_here_v1', key, chatId})
      .catch(e => { ncHeldSent = 0; console.warn('[NeoCheck чаты] here:', e.message); });
  }

  function ncHoldLeave() {
    const key = ncChatKey(), chatId = ncHeld;
    ncHeld = null; ncHeldSent = 0;
    if (key && chatId) ncHttp(NC_SCHOOL_URL, {action:'neocheck_chat_leave_v1', key, chatId}).catch(() => {});
  }

  function ncAgo(since, now) {
    const min = Math.max(0, Math.round((now - since) / 60000));
    if (min < 1) return 'только что';
    if (min < 60) return min + ' мин';
    if (min < 1440) return Math.floor(min / 60) + ' ч ' + (min % 60) + ' мин';
    return Math.floor(min / 1440) + ' дн';
  }

  // Сайт отказал в резерве — подсказываем, у кого чат (если тот методист с NeoCheck).
  async function ncShowHolder(chatId) {
    const key = ncChatKey();
    if (!key || ncDeniedShown === chatId) return;
    ncDeniedShown = chatId;
    try {
      const r = await ncHttp(NC_SCHOOL_URL, {action:'neocheck_chat_who_v1', key, chatIds:[chatId]});
      const b = r.busy && r.busy[chatId];
      if (b && !b.me) toast('🔒 Чат сейчас у: ' + b.name + ' (' + ncAgo(b.since, r.now) + ')', true);
    } catch (_) { /* не страшно */ }
  }

  function ncOnReserve(url, status) {
    const chatId = (String(url).match(NC_RESERVE_RE) || [])[1];
    if (!chatId) return;
    ncReserveObserved = true;
    console.debug('[NeoCheck чаты] reservation', chatId, status);
    if (status >= 200 && status < 300) {
      ncLastConfirmedChat = chatId;
      const isNew = ncHeld !== chatId;
      if (isNew && ncHeld) ncHoldLeave();
      ncHeld = chatId;
      ncDeniedShown = '';
      ncHoldPing(isNew);
    } else if (status >= 400) {
      if (ncHeld === chatId) { ncHoldLeave(); }
      ncShowHolder(chatId);
    }
  }

  (function installReserveObserver() {
    const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    if (w.__nfReserveHook) return;
    w.__nfReserveHook = true;
    const origFetch = w.fetch;
    if (typeof origFetch === 'function') {
      w.fetch = function (input, init) {
        const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        const url = typeof input === 'string' ? input : (input && input.url);
        const p = origFetch.apply(this, arguments);
        if (url && method === 'POST' && NC_RESERVE_RE.test(url)) {
          p.then(r => ncOnReserve(url, r.status)).catch(() => {});
        }
        return p;
      };
    }
    const P = w.XMLHttpRequest && w.XMLHttpRequest.prototype;
    if (P) {
      const open = P.open, send = P.send;
      P.open = function (m, u) { this.__nfRes = {m:String(m).toUpperCase(), u:String(u)}; return open.apply(this, arguments); };
      P.send = function () {
        const r = this.__nfRes;
        if (r && r.m === 'POST' && NC_RESERVE_RE.test(r.u)) {
          this.addEventListener('loadend', () => { try { ncOnReserve(r.u, this.status); } catch (_) {} }, {once:true});
        }
        return send.apply(this, arguments);
      };
    }
  })();

  async function ncWhoRefresh(ids) {
    const key = ncChatKey();
    if (!key || ncWhoBusy) return;
    ncWhoBusy = true;
    try {
      const r = await ncHttp(NC_SCHOOL_URL, {action:'neocheck_chat_who_v1', key, chatIds:ids});
      ncWho = r.busy || {};
      ncWho.__now = r.now;
      ncLast = r.last || {};
      ncWhoError = '';
      ncWhoAt = Date.now();
      ncWhoIds = ids.join(',');
      nfChatLocksRender();
    } catch (e) {
      console.warn('[NeoCheck чаты] who:', e.message);
      ncWhoError = e.code === 'UNAUTHORIZED' ? 'Ключ Telegram не действует. Привяжите заново.' : e.message;
      ncWhoIds = ids.join(',');
      ncWhoAt = Date.now(); // не долбим сервер при ошибке
    } finally { ncWhoBusy = false; nfChatStatusRender(); }
  }

  function ncChatCards() {
    return [...document.querySelectorAll('a[href*="/chat/"]')]
      .map(a => ({a, id:(a.getAttribute('href').match(NC_CHAT_ID_RE) || [])[1]}))
      .filter(x => x.id);
  }

  // Видимый индикатор диагностики в списке. Если активных резервов нет,
  // отсутствие плашек — нормальное состояние, а не признак поломки.
  function nfChatStatusRender() {
    const cards = ncChatCards();
    let status = document.getElementById('nf-chat-locks-status');
    if (!cards.length) { if (status) status.remove(); return; }
    const parent = cards[0].a.parentElement;
    if (!parent) return;
    if (!status || status.parentElement !== parent) {
      status?.remove();
      status = document.createElement('div');
      status.id = 'nf-chat-locks-status';
      status.style.cssText = 'align-self:flex-start;box-sizing:border-box;padding:7px 11px;border-radius:11px;font:700 12px/1.5 Nunito,system-ui,sans-serif;background:#eef4ff;color:#325078;border:1px solid #d5e2f5;';
      parent.insertBefore(status, cards[0].a);
    }
    const key = ncChatKey();
    const count = Object.keys(ncWho).filter(k => k !== '__now').length;
    const message = !key
      ? '🔗 Статусы чатов: привяжите Telegram в NeoCheck'
      : ncWhoError
        ? '⚠️ Статусы чатов: ' + ncWhoError
        : !ncWhoAt
          ? '⏳ Проверяем занятость чатов…'
          : '🔒 Проверка чатов работает · занято: ' + count + (count ? '' : ' (плашки появятся при активной работе)');
    if (status.textContent !== message) status.textContent = message;
    status.title = 'Плашки показывают только подтверждённые резервы методистов с NeoCheck и привязанным Telegram. После закрытия чата резерв снимается.';
  }

  function nfChatLocksRender() {
    const now = ncWho.__now || Date.now();
    for (const {a, id} of ncChatCards()) {
      const b = ncWho[id], l = !b && ncLast[id];
      let badge = a.querySelector(':scope > .nf-chat-lock');
      const ago = at => { const t = ncAgo(at, now); return t === 'только что' ? t : t + ' назад'; };
      const text = b ? (b.me ? '✓ Этот чат у вас' : '🔒 Сейчас в чате: ' + b.name + ' · ' + ncAgo(b.since, now))
        : l ? (l.me ? '🕓 Последними заходили вы · ' : '🕓 Последним заходил(а): ' + l.name + ' · ') + ago(l.at)
        : '';
      if (!text) { if (badge) badge.remove(); continue; }
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'nf-chat-lock';
        a.insertBefore(badge, a.firstChild);
      }
      const css = 'align-self:flex-start;padding:4px 10px;border-radius:10px;font:700 12px/1.4 Nunito,system-ui,sans-serif;' +
        (!b ? 'background:#f1eff6;color:#60566d;' : b.me ? 'background:#e4f5e8;color:#276e43;' : 'background:#fde8ec;color:#b83f53;');
      if (badge.textContent !== text) badge.textContent = text;
      if (badge.style.cssText !== css) badge.style.cssText = css;
    }
  }

  function nfChatLocksInject() {
    // Ушли со страницы удерживаемого чата — сразу снимаем отметку.
    if (ncHeld && ncPageChatId() !== ncHeld) ncHoldLeave();
    if (ncDeniedShown && ncPageChatId() !== ncDeniedShown) ncDeniedShown = '';
    ncHoldPing(false);
    const ids = ncChatCards().map(x => x.id);
    if (!ids.length) { nfChatStatusRender(); return; }
    nfChatStatusRender();
    const uniq = [...new Set(ids)].slice(0, 200);
    if (uniq.join(',') !== ncWhoIds || Date.now() - ncWhoAt > NC_WHO_EVERY_MS) ncWhoRefresh(uniq);
    else nfChatLocksRender();
  }
  setInterval(nfChatLocksInject, 5000); // Быстрый поиск карточек, HTTP не чаще 20 сек
  window.addEventListener('pagehide', ncHoldLeave);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) nfChatLocksInject(); });

  function inject() {
    document.querySelectorAll('[data-task-id]').forEach(card => { addCopyButton(card); addViewRow(card); });
    injectPanels();
    syncAttach();
    refreshView();
    trackAnswers();
    ensureStatsWidget();
    nfTgInject();
    scanMessages(); // обновляем счётчик сообщений при каждом изменении DOM
    shiftInject();
    nfRegInject();
    nfBackupInject();
    nfQuickReplyInject();
    nfFocusInject();
    nfChatLocksInject();
  }

  let timer;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(inject, 300);
  }).observe(document.body, { childList: true, subtree: true });

  inject();
})();
