// ==UserScript==
// @name         NeoCheck V3
// @namespace    neofamily-copy-for-check
// @version      1.65
// @updateURL    https://raw.githubusercontent.com/kirilkasss/NeoFamily_plug/main/neocheck.user.js
// @downloadURL  https://raw.githubusercontent.com/kirilkasss/NeoFamily_plug/main/neocheck.user.js
// @description  1) Кнопка у задания копирует условие, ключ, имя ученика и текст/фото ответа. 2) Над полем «Диалог с учеником» свои шаблоны (текст и картинки) предпросмотр прикреплённых картинок, режим «ключ рядом с ответом», подсветка совпадений с ключом и подсчёт заданий, сообщений, выплат и личный график смен
// @match        https://neofamily.ru/*
// @match        https://*.neofamily.ru/*
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
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
  const NF_REG_SECTIONS = [{"title":"Основные действующие лица","blocks":[{"kind":"bullet","text":"• Даниил Гущеваров — старший методист по биологии. По всем вопросам, связанным с организацией курса, теоретическими аспектами и тд обращайтесь ко мне (но сначала убедитесь, что этой информации нет в регламенте или в “важном”). А ещё мне можно писать со всякими улучшениями/пожеланиями по работе методиста на платформе :)"},{"kind":"bullet","text":"• Антон Олейников — второй старший методист, к нему также можно и нужно обращаться по различным вопросам по проверкам и остальным вопросам."},{"kind":"p","text":"Контакты для связи: Telegram: t.me/ddzxhss ВК: vk.com/ddzxhss"},{"kind":"p","text":"В случае ЧП звони +79641404446 (только если другие способы связи не сработали)"},{"kind":"bullet","text":"• Виктория Григорьева – руководитель учебного отдела. Пиши если у тебя возникли какие-либо проблемы/вопросы, которые почему-то не получается решить через"},{"kind":"h4","text":"старшего методиста. Если действительно ЧП – звони +79818321834 в любое время."},{"kind":"p","text":"По любым вопросам — также пиши своему старшему методисту, не бойся этого делать!"},{"kind":"p","text":"Контакты для связи: VK: https://vk.com/victoriabatyrbaeva"},{"kind":"bullet","text":"• Андрей Фомин — преподаватель по биологии, CEO NeoFamily."},{"kind":"bullet","text":"• Нурлан Жангалиев — преподаватель по биологии."},{"kind":"h4","text":"! Преподавателям писать ни в коем случае нельзя!"}]},{"title":"Как попасть в команду","blocks":[{"kind":"p","text":"Для начала необходимо подать заявку через “Вакансии NeoFamily”:"},{"kind":"p","text":"ВК: https://vk.com/neofamily_hr"},{"kind":"p","text":"ТГ: @neofamilyhr"},{"kind":"h4","text":"Критерии отбора:"},{"kind":"bullet","text":"• Балл за ЕГЭ (не менее 85-90)"},{"kind":"bullet","text":"• Сертификат о прохождении курсов эксперта ЕГЭ"},{"kind":"bullet","text":"• Высшее биологическое образование"},{"kind":"p","text":"Главным критерием является набранный на ЕГЭ балл, однако возможны исключения."},{"kind":"p","text":"После заполнения соответствующей формы Вам нужно будет написать в сообщество вакансий, а затем старшему методисту, Даниилу. Если Вы не получили ответ в течение 3х дней - напомните о себе еще раз."},{"kind":"p","text":"Критериями для прохождения на следующий этап отбора являются успешно выполненное итоговое задание (https://forms.yandex.ru/u/68777d97eb6146001677859d). Пишите вне зависимости от результата, не забудьте в сообщении указать набранные баллы. Каждый случай рассматривается индивидуально, пишите с любым результатом."},{"kind":"p","text":"Если старшего методиста устроил ваш результат, вы получаете ссылки на вступление в группу."},{"kind":"h3","text":"Алгоритм следующий:"},{"kind":"p","text":"Ознакамливаетесь с регламентом — особое внимание уделяете разделу с нейропроверкой, проверкой домашних заданий и оцениванием второй части."},{"kind":"p","text":"Отписываете Антону, что вам необходим аккаунт методиста (в сообщении указываете своё имя и фамилию). Дожидаетесь аккаунта от старшего методиста. После получения — запрашиваете доступ к таблице распределения: https://docs.google.com/spreadsheets/d/1B elgGceTRVUvHfxAK8i5zKcSEgdXVjkc0TgmmTNzW8w/edit?usp=drivesdk"},{"kind":"h4","text":"Выбираете удобное для себя время и вписываете вашу фамилию в окошки,"},{"kind":"h4","text":"окрашенные голубым цветом."},{"kind":"h4","text":"Учтите: на первые 5-7 работ обычно уходит 1.5-2 часа, закладывайте это время."},{"kind":"p","text":"Перед началом проверок обязательно отписываетесь в теме, что вы «вышли на стажировку». Далее выходите на смену (кнопка на платформе «приступить к проверкам» в разделе \"домашки учеников\") в указанное для вас время и начинаете проверять задания."},{"kind":"p","text":"Первые 5-7 проверок (пока не будет идеальной проверки без замечаний) отправляете в тему “Первые 15 проверок“ для проверки старшим методистом. После того, как он вам напишет, что всё верно, вы можете отправлять комментарий, учитывая правки и рекомендации от ст. методиста, и завершать проверку всей работы."},{"kind":"p","text":"Оставшиеся работы (до 15 включительно) вы проверяете самостоятельно."},{"kind":"p","text":"Отписываетесь старшему методисту, что всё сделали и ожидаете, когда вас будут готовы подключить в основной штат."},{"kind":"p","text":"По каждой проверке Вы отправляете текст вашей проверки + ссылку на домашку (в формате https://neofamily.ru/biologiya/students-homework/__). Пишите номер задания и текст, который вы отправите к каждому заданию отдельно. В конце должен быть комментарий, который вы отправите в самое нижнее поле."},{"kind":"label","text":"Пример:"},{"kind":"p","text":"https://neofamily.ru/biologiya/students-homework/41233232597 Задание 6 Пункт ключа 1: +/-, конкретнее называй термин - это годичное кольцо Задание 7 Пункт ключа 3: –, после частоты аллеля а мы можем  рассчитать частоту нормального (доминантного) аллеля (А): в равновесной популяции p + q = 1, поэтому p = 1 – 0.0223 = 0.9777. Пропустил один 0 после запятой, поэтому все дальнейшие расчеты (и пункты) неверные). Задание 8 Пункт ключа 3: –, аналогичная ошибка, как в задании 7. Тоже все дальнейшие расчеты неверные Задание 10 Указала всего по одной особенности строения и жизнедеятельности,а нужно как минимум по две: Пункт ключа 5: –, следующая особенность строения: в этих клетках крупные ядра и много рибосом, что связано с активным синтезом белка для деления"},{"kind":"p","text":"Пункт ключа 6: –, и еще одна особенность строения: вакуоли в клетках меристемы очень мелкие или отсутствуют Пункт ключа 8: –, вторая особенность жизнедеятельности: клетки верхушечной меристемы могут дифференцироваться и превращаться в клетки других тканей растения"},{"kind":"label","text":"Общий комментарий:"},{"kind":"p","text":"Привет! Замечательная работа! Не забудь разобрать ошибочки и повторить материал, комментарии оставила у заданий! Продолжай в том же духе, у тебя всё получится!"},{"kind":"h4","text":"Важные правила и некоторые нюансы"},{"kind":"number","text":"1. Если проверка длится более 20 минут — вас могут снять со смены. Нажимайте кнопку «Продлить проверку», как только она появится, иначе работа уйдёт другому методисту и не зачтётся вам."},{"kind":"number","text":"2. Необязательно проверять все 15 за одну смену. Можно разбить на несколько дней. Главное предупредить об этом в теме или лично старшему методисту, что проверите позже."},{"kind":"number","text":"3. Если не можете выйти в выбранное время — сразу предупредите старшего методиста и уберите свою фамилию из таблицы, выбрав другое время."},{"kind":"number","text":"4. Пустые домашки (без выполненных заданий) не засчитываются в эти 15 работ. Но вам необходимо выставить баллы и завершить проверку, не забыв написать в общем комментарии шаблонную шапку. Примеры таких шапочек можете найти здесь в листе с шапочками! В этой табличке вы можете написать свое имя и придумать собственные фразы или использовать уже готовые от других ребят, думаю, что они не будут против:)"},{"kind":"h4","text":"5. Если вам назначилась уже проверенная домашка, значит, скорее всего, там висит"},{"kind":"p","text":"непрочитанное сообщение от ученика, на которое нужно ответить. Даже если там «спасибо за проверку!». Пока вы не ответите на сообщение, система не выдаст новую домашку."},{"kind":"h4","text":"6. С этого года 22-26 линии проверяются с помощью нейропроверки. Итоговый текст"},{"kind":"p","text":"проверки ПОЛНОСТЬЮ менять не нужно (в случае, если он не содержит ошибок/неточностей). Помните: нейропроверка — это лишь вспомогательный для вас инструмент, поэтому ИИ-текст не отправляется автоматически ребенку после завершения проверки, его нужно отправить самостоятельно, нажав на кнопку отправки сообщения (значок"},{"kind":"p","text":"самолётика справа от строки текста)."},{"kind":"h4","text":"7. Перед завершением проверки работы убедитесь, что под каждым заданием у вас"},{"kind":"h4","text":"отправлен комментарий и верно выставлены баллы, а также написан общий"},{"kind":"p","text":"комментарий по работе!"},{"kind":"h4","text":"8. Не забывайте, что в этой теме вы можете просматривать комментарии остальных"},{"kind":"p","text":"новеньких ребят и какие-то их замечания, чтобы учиться и улучшать свои навыки в проверках!"},{"kind":"h4","text":"Внимание: не забывайте нажимать на эту кнопочку, у каждого задания отдельно! Без"},{"kind":"h4","text":"нажатия на нее комментарий не отправится."},{"kind":"p","text":"Проходите чеклист - подаете заявки на доступ во все таблицы, заполняете формы и т.д. (https://forms.gle/drHAAPtUVMHn2VLm7)"},{"kind":"p","text":"Отписываетесь старшему методисту, что всё сделали и ожидаете, когда вас будут готовы подключить в основной штат."},{"kind":"h3","text":"Основные формы и тесты, которые нужно пройти/ознакомиться:"},{"kind":"number","text":"1. Регламент: его вы читаете сейчас :). Не забудьте ознакомиться с ним полностью!"},{"kind":"h4","text":"2. Шапки и скрипты: https://docs.google.com/spreadsheets/d/1FGNg5bEyVatCCNmJQmp46za57CYId2-1"},{"kind":"p","text":"ZDteZz0F6DI/edit?usp=sharing"},{"kind":"h4","text":"3. Таблица распределения:"},{"kind":"p","text":"https://docs.google.com/spreadsheets/d/1BelgGceTRVUvHfxAK8i5zKcSEgdXVjkc0TgmmTNzW8w/edit?usp=s haring"},{"kind":"p","text":"Чтобы распределяться, вы должны запросить к ней доступ. Доступ обновляется каждое воскресенье, чем раньше вы запросите - тем лучше."},{"kind":"h4","text":"4. Форма знакомства:"},{"kind":"p","text":"https://forms.yandex.ru/u/68b720b1493639403bc1bbd6"},{"kind":"p","text":"Нужна для попадания в список на распределение. Без этой формы вы методистом не считаетесь."},{"kind":"h4","text":"5. Дни рождения (опционально, нужна, чтобы вас поздравляли во флудилке):"},{"kind":"p","text":"https://forms.gle/ZKroJD1FtQnnbSk96"},{"kind":"h4","text":"6. Резервный чат ВК:"},{"kind":"p","text":"https://vk.me/join/NJpLZcrqrHPz/CEmvYkeEsUN02GCM/oJF/o="},{"kind":"h3","text":"Далее нужно ознакомиться с вопросом выплат."},{"kind":"p","text":"Большинство методистов выбирают оказание услуг по самозанятости. Ознакомиться с особенностями данного вида можно в файле по ссылке: https://t.me/c/2279082428/2/100016"},{"kind":"p","text":"Если вы желаете сотрудничать по самозанятости, ознакамливайтесь с этим постом от Ксении (https://t.me/c/2279082428/2/131148) и заполняйте форму: https://forms.yandex.ru/u/698c490149363904ee236a2a"},{"kind":"p","text":"Если вы не желаете сотрудничать по самозанятости, хотите оформлять ГПХ/ИП — обращайтесь к Ксении (автору поста)"}]},{"title":"Коммуникация","blocks":[{"kind":"p","text":"Все-все взаимодействия методистов с детьми производятся исключительно на платформе neofamily.ru. Коммуникация между методистами производится через телеграм-чат"},{"kind":"h2","text":"Чат всех методистов"},{"kind":"p","text":"Главный чат методистов, в котором отображена вся необходимая информация. В нём есть несколько тем, каждая из которых со своими особенностями"},{"kind":"h3","text":"Важные сообщения"},{"kind":"p","text":"Чат, в котором нельзя выключать уведомления. В нём нельзя писать, там исключительно важная информация, необходимая к ознакомлению (ознакомление требует реакции)."},{"kind":"h3","text":"Выходы на смену"},{"kind":"p","text":"В данном чате пишутся только 2 типа сообщений: Вышел на чат Завершил чат"},{"kind":"p","text":"Уведомлять о том, что вы выходите проверять домашки не нужно."},{"kind":"h3","text":"Флудилка"},{"kind":"p","text":"Чат для общения. В него можно писать и кидать что угодно, под запретом только оскорбления друг друга и разжигание ненависти к любым группам. А еще очень здорово, когда вы присылаете скрином благодарности от других детей"},{"kind":"h3","text":"Вопросы"},{"kind":"p","text":"В этой теме можно и нужно задавать вопросы по проверкам, организации курса, сомнения в теоретических вопросах и том, как оценить ответ ребенка. В последнем случае нужно скинуть не только ответ ребенка, но и что спрашивают в задании (условие, то есть, на что отвечает ребенок), текст ответа ребенка и элемент ключа, относительно которого у вас сомнения."},{"kind":"label","text":"Пример:"},{"kind":"p","text":"”Здравствуйте! Подскажите, засчитывать ли этот пункт у ребенка? В условии спрашивают: “Назовите тип и фазу деления диплоидной клетки. Ответ поясните“. Ребенок пишет “На рисунке видно расхождение хромосом к полюсам”. 3 элемент ключа звучит как “расхождение двухроматидных хромосом”. Засчитывать ли ответ ребенка или обязательно указать двухроматидность? Грамотно заданный вопрос - правильно полученный ответ"},{"kind":"h3","text":"Послания методистам"},{"kind":"p","text":"В данную тему отправляем случаи, когда ребенок не согласен с оценкой методиста. То есть, ребенок не понимает, почему ему засчитали/не засчитали тот или иной пункт ключа, почему выставили такой или иной балл. Дети не знакомы с особенностями оценивания различных заданий (поэтому у них могут возникать вопросы), да и методисты порой ошибаются. Поэтому чтобы не играть в “сломанный телефон” и не отдуваться за проверку другого методиста - пересылаем её ему. Делаем это унифицированно:"},{"kind":"p","text":"В сообщение в теме вы прикрепляете"},{"kind":"number","text":"1. Фамилию Имя методиста"},{"kind":"number","text":"2. Его тэг (берём из таблицы в закрепе этой темы), обязательно через @. Обратите внимание - если вы просто прикрепите ссылку на аккаунт методиста (t.me/name), уведомление ему не придет. После редактирования сообщения (добавления тэга) уведомление также не приходит, так что пишите правильно с первого раза."},{"kind":"number","text":"3. Ссылка на домашку в формате https://neofamily.ru/biologiya/students-homework)."},{"kind":"p","text":"В такой форме вы отправляете сообщение в эту тему. Ребенку вы пишите “Привет! Передала методиста, попрошу его тебе ответить. Большая просьба ничего не отвечать под этой домашкой, иначе он не сможет открыть домашку (если вдруг ответа не будет - снова напиши). Важно: методист не сможет открыть домашку, если в ней последним будет сообщение ребенка!"},{"kind":"p","text":"Тэги находятся в закрепе этой темы. Как тэги кураторов, так и методистов."},{"kind":"h4","text":"Если Вас тегнули — обязательно нужно ответить ребенку! Ставьте реакцию,"},{"kind":"p","text":"символизирующую Ваш ответ."},{"kind":"h3","text":"Распределение"},{"kind":"p","text":"В данной теме вы распределяетесь в свободные слоты на проверки домашек. Распределение проходит каждое воскресенье в 4 потока, списки отправляются до 10:00 воскресенья. Потоки чередуются в течение месяца (4-3-2-1-4-3-2-1-…), чтобы все заняли +- равное количество смен."},{"kind":"p","text":"В 12:00 по московскому времени открывается доступ к табличке, первый поток вписывается. В 12:30 второй, в 13:00 третий, в 13:30 четвертый. Раньше своего времени заходить не надо, поскольку гугл-таблицы начинают сильно лагать."},{"kind":"h4","text":"Каждый месяц формируется топ-25 методистов исходя из рейтинга. Эти методисты"},{"kind":"p","text":"получают возможность всегда записываться в 1 потоке."},{"kind":"p","text":"Первые столбцы (окрашенные в фиолетовый) - методисты, которые отвечают в Чате. На эти смены можно вписываться самим, если вы ни разу не были на чате - для распределения на чат нужно получить одобрение старшего методиста."},{"kind":"h3","text":"Частые ошибки"},{"kind":"p","text":"В данную тему скидывается материал с частыми ошибками, которые совершают дети в домашних заданиях. Этот материал нужен по 2 причинам:"},{"kind":"number","text":"1) Проведение преподавателями практикумов для детей, где 1 из блоков - разбор частых ошибок детей."},{"kind":"number","text":"2) Дополнение скриптов, чтобы облегчить и ускорить ваши проверки (шаблонные фразы, которые можно вставить, если ребенок совершает эту ошибку). В закрепе находится расписание вебинаров и то, ошибки в каких домашках нужно скидывать."},{"kind":"p","text":"Ваше сообщение должно быть структурированным и понятным. Советую придерживаться следующей структуры:"},{"kind":"p","text":"Название домашки Задание №_ Описание ошибки в 1 предложении 3-4 ссылки на домашки, в которых эта ошибка допущена"},{"kind":"p","text":"Активное участие в данной теме дает баллы в рейтинг за “активность” (до 4. А рейтинг => дополнительное вознаграждение."},{"kind":"h3","text":"Конспекты"},{"kind":"p","text":"В данной теме публикуются материалы, по которы на курсе даётся теоретическая информация. В первую очередь ориентируемся именно на неё, а не на вузовские учебники / олимпиадные знания. Конспекты также дублируются на гугл-диск, ссылка на который в закрепе."},{"kind":"p","text":"Рекомендация - после публикации конспекта ознакомиться с ним, чтобы освежить знания и актуализировать их. Там может быть информация, отличающаяся от того, как Вас учили в школе. Она максимально приближена к материалам ФИПИ и тому, что спрашивается на ЕГЭ, поскольку проходит многоступенчатую проверку экспертами."},{"kind":"h3","text":"Грубые дети"},{"kind":"p","text":"В данную тему следует отправлять детей, которые неуважительно общаются с методистами, хамят и не соблюдают субординацию. Цель - проведение работы с такими детьми, возможное их отключение от курса/ограничение доступа к чату. И, конечно, предотвратить возможное их попадание на позицию куратора/методиста в следующем году."},{"kind":"h3","text":"Ответы на анонимные вопросы"},{"kind":"p","text":"В данной теме даются ответы на вопросы, которые отправляются в анонимную форму (в закрепе). Это могут быть пожелания, вопросы, какие-то замечания - всё то, что по какой-то причине не можете написать в ЛС."},{"kind":"h3","text":"Дайджест ЕГЭ 2025"},{"kind":"p","text":"Данная тема посвящена освещению новых нюансов и изменений в ЕГЭ-2025. Тема очень важная, следите за ней и не пропускайте изменений."},{"kind":"h3","text":"Шедевры учеников"},{"kind":"p","text":"В данную тему просто скидывайте забавные моменты, с которыми вы столкнулись во время проверок. Как забавные опечатки, так и странные формулировки/сообщения детей. Потом оно пойдет в ежегодное видео “методисты core”"},{"kind":"h2","text":"Чат методисты + кураторы"},{"kind":"p","text":"В тему “Методисты по биологии” кураторы пересылают теоретические вопросы от детей, которые не хотят спрашивать вопросы на платформе. Спрашивать свои собственные вопросы там не надо - сделайте это в соответствующей теме :)"},{"kind":"p","text":"Вступать в данную беседу не обязательно, только если есть желание поотвечать и получить доп баллы за активность."}]},{"title":"Нейропроверка","blocks":[{"kind":"p","text":"Для заданий 22-26 линии, написанных текстом предусмотрена нейропроверка - готовый разбор ответа ученика на соответствие пунктам ключа."},{"kind":"p","text":"Ваша задача - проверить несколько составляющих."},{"kind":"bullet","text":"• Действительно ли баллы выставлены верно и разбалловка соответствует"},{"kind":"h4","text":"актуальной"},{"kind":"bullet","text":"• Незачтенные пункты действительно отсутствуют в ответе ребенка, а зачтенные"},{"kind":"h4","text":"пункты действительно присутствуют. Обязательно смотрите сгенерированное"},{"kind":"p","text":"пояснение, где модель поясняет, что именно она засчитала, а что не засчитала. Если этого нет - пересмотрите ответ. В 95% пунктах она “занижает” балл, а не завышает."},{"kind":"bullet","text":"• Балл за биологическую ошибку снят заслуженно. У модели порой бывают проблемы с разграничением ЕГЭшной/неЕГЭшной информацией. Обращайте на это внимание."},{"kind":"p","text":"Если вы считаете, что незаслуженно выставлен “-” за пункт — исправляйте."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ответ ребенка:"},{"kind":"p","text":"1 - слияние гамет 2- созревание зооспор"},{"kind":"label","text":"Комментарий модели:"},{"kind":"p","text":"Элемент 1: Неверно Указано 'слияние гамет' вместо 'гамета' Элемент 2: Неверно Указано 'созревание зооспор' вместо 'зооспора', неполное соответствие"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"За каждый из этих процессов можно выставить +/-, так как суть верна. Вместо пояснения от модели нужно написать “засчитаю, но в условии просят определить СТАДИИ, а не процессы - будь внимательнее”."},{"kind":"h4","text":"Еще один пример:"},{"kind":"label","text":"Ответ ребенка:"},{"kind":"p","text":"потому что в водопроводной воде неизвестная концентрация солей, и в таком случае тургор клеток этих растений может нарушиться и вследствие этого растение может погибнуть"},{"kind":"label","text":"Комментарий модели:"},{"kind":"p","text":"Элемент 4: Неверно Допущена ошибка: указана неверная причина (неизвестная концентрация солей и риск нарушения тургора), а не отсутствие необходимых минеральных солей для роста."},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Пункт не зачтен верно, однако ребенок может не до конца понять, в чем ошибка. Желательно от себя дописать что-то в конце, например: “то что концентрация неизвестная это ладно, а вот отсутствие солей - это уже серьезно”."},{"kind":"label","text":"Финальный ваш комментарий:"},{"kind":"p","text":"Допущена ошибка: указана неверная причина (неизвестная концентрация солей и риск нарушения тургора), а не отсутствие необходимых минеральных солей для роста. То, что концентрация неизвестная это ладно, а вот отсутствие солей - это уже серьезно!"},{"kind":"p","text":"Написать 2-3 таких замечания — быстро, но ребенок быстрее поймет свою ошибку. Опять-таки, далеко не по каждому заданию, но в ваших проверках такое должно присутствовать там, где нужно."},{"kind":"p","text":"Если задание у ученика полностью верное (3/3), все пункты зачтены — пояснение можно не отправлять."},{"kind":"p","text":"Такой комментарий - очень даже хорошо"},{"kind":"p","text":"+/- (частично верно) округляем в большую сторону. У модели с этим есть сейчас некоторые проблемы (4,5 пункта она считает как 4), обращайте на это внимание!"},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ответ ребенка:"},{"kind":"number","text":"2) надпочечники вырабатывают адреналин"},{"kind":"number","text":"3) синтез глюкозы"},{"kind":"label","text":"Комментарий модели:"},{"kind":"p","text":"Элемент 3: Частично верно Указано 'синтез глюкозы' из скобок альтернативного варианта, но отсутствует 'действие гормонов усиливает...' или 'активируется глюконеогенез'."},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"В ответе ребенка нет логической связи, что адреналин усиливает синтез глюкозы -выглядит как несвязный текст. За пункт можно поставить +/- и переформулировать комментарий как “Указано 'синтез глюкозы', но нет никакой связи с гормонами”."},{"kind":"label","text":"Финальный ваш комментарий:"},{"kind":"p","text":"Элемент 3: Частично верно Указано 'синтез глюкозы', но отсутствует какая-либо связь с гормонами."},{"kind":"p","text":"Естественно, любые комментарии модели по типу “Ученик не указывает”, “Ученик не используют” надо удалять. Их присутствие в ваших комментариях скажется на оценке!"},{"kind":"h3","text":"Итого, на вашу оценку за проверки влияет:"},{"kind":"bullet","text":"• Ошибки в проверках: как часто вы завышаете/занижаете балл. Это самый серьезный показатель."},{"kind":"bullet","text":"• Внимательность: вчитываетесь ли вы в комментарий или бездумно отправляете всё подряд"},{"kind":"bullet","text":"• Отклонения от нейронки: пишите ли вы хоть иногда что-то от себя, понятен ли комментарий ребенку."},{"kind":"bullet","text":"• Скорость проверок, указания на опечатки, обращения по имени — опционально, но желательно этим не пренебрегать. Особенно обращениями по именам! На выставленный вам балл это влияет минимально."},{"kind":"p","text":"Если у ребенка нет ответа на задание, не надо отправлять сгенерированный нейропроверкой комментарий. Просто спросите: “возникли какие-то вопросы? нужно помочь? не бойся спрашивать!”"}]},{"title":"Оценивание · введение и биологические ошибки","blocks":[{"kind":"h2","text":"5 Оценивание второй части"},{"kind":"bullet","text":"• Биологические ошибки"},{"kind":"bullet","text":"• Линия 22"},{"kind":"bullet","text":"• Линии 23, 25, 26"},{"kind":"bullet","text":"• Линия 24"},{"kind":"bullet","text":"• Линия 27. Биосинтез белка."},{"kind":"bullet","text":"• Линия 27. Харди-Вайнберг"},{"kind":"bullet","text":"• Линия 27. Филогенетические деревья."},{"kind":"bullet","text":"• Линия 27. Жизненные циклы — уже не встречаются на ЕГЭ."},{"kind":"bullet","text":"• Линия 28. Генетика."},{"kind":"p","text":"Внимание — далее в регламенте для компактности информации примеры и подробные пояснения скрыты значком . Чтобы развернуть информацию — просто нажмите на него."},{"kind":"p","text":"На платформе есть функция просмотра реальных ответов детей с экзамена и того, как к ним выставлены баллы. Эта функция есть не у всех заданий, только с реального ЕГЭ. Для этого нужно в банке заданий вбить ЕГЭ-2025 и выбрать нужную линию (22-28)."},{"kind":"p","text":"Примеры ответов есть у большинства (но не у всех) заданий. Для этого нужно прямо в банке нажать на кнопку “Решение” и открыть “Примеры ответов”. Там вы можете видеть ответ ученика и объяснение по пунктам, почему оно так было оценено."},{"kind":"p","text":"Данный раздел должен вам помочь разобраться в нюансах оценивания и делать это максимально приближенно к реальному экзамену."},{"kind":"h2","text":"Биологические ошибки"},{"kind":"p","text":"За наличие биологических ошибок в дополнительной информации снимается 1 балл."},{"kind":"p","text":"При этом важно, чтобы эта информация была именно дополнительной, а не относилась к одному из пунктов ключа (в данном случае просто не засчитывается пункт, а дополнительно балл не снимается)."},{"kind":"h4","text":"Пример, где биологическая ошибка допущена в пункте ключа и дополнительно балл не был снят:"},{"kind":"label","text":"Условие:"},{"kind":"p","text":"В каких секретах клеток поджелудочной железы будет обнаружена радиоактивная метка"},{"kind":"label","text":"Ответ ученика:"},{"kind":"p","text":"\"Клетки внутренней секреции выделяют гормоны (поджелудочная железа глюкагон и инсулин), не являющиеся структурами белковой природы (белок состоит из аминокислот).\""},{"kind":"label","text":"Пункт ключа:"},{"kind":"number","text":"2) в гормонах (инсулин; глюкагон; соматостатин; грелин);"},{"kind":"p","text":"В данном случае биологическая ошибка \"гормоны не являются белками\" напрямую и логически относится к одному из пунктов ключа. Поэтому, несмотря на то, что ответ ученика верный (метка будет в гормонах), этот пункт не засчитывается, так как он дан с биологической ошибкой. Но дополнительно за задание балл НЕ снимается."},{"kind":"h4","text":"Еще один такой же пример"},{"kind":"label","text":"Условие:"},{"kind":"p","text":"Какие два метода использовались в эксперименте?"},{"kind":"label","text":"Ответ ученика:"},{"kind":"p","text":"\"Метод меченых атомов, хроматография\""},{"kind":"label","text":"Пункт ключа:"},{"kind":"number","text":"3) метод меченых атомов (авторадиография, радиоавтография, радиоизотопный метод);"},{"kind":"number","text":"4) центрифугирование."},{"kind":"p","text":"В данном случае верно назван один из методов (п.3 +). Второй же метод назван неверно, поэтому четвертый пункт ключа не засчитывается (п.4 -). Дополнительно балл не снимается."},{"kind":"h4","text":"Пример с биологической ошибкой, за которую сняли балл:"},{"kind":"label","text":"Условие:"},{"kind":"p","text":"Предположите, в какое время суток полушник активно накапливает малат в клетках. В какое время суток у полушника происходит активный распад малата?"},{"kind":"label","text":"Ответ ученика:"},{"kind":"number","text":"2) Соответственно, распад малата у полушника лучше всего происходит днем и очень активно, поскольку водоросли в световую фазу фотосинтеза поглощают углекислый газ и его концентрация возле полушника невысокая (т. е. распад опережает синтез)."},{"kind":"label","text":"Пункт ключа:"},{"kind":"number","text":"2) ночью (в темное время суток) низкая конкуренции за растворенный в воде углекислый газ (в воде большое количество доступного углекислого газа);"},{"kind":"number","text":"3) разлагает (распадается) малат днем (в светлое время суток);"},{"kind":"number","text":"4) днем (в светлое время суток) активно протекает фотосинтез (для которого необходим углекислый газ);"},{"kind":"p","text":"В данном случае снят балл за дополнительную информацию с биологической ошибкой: углекислый газ поглощается не в световую, а в темновую фазу фотосинтеза. Нигде в ключе нет пункта о поглощении углекислого газа, поэтому данная информация считается биологической ошибкой."},{"kind":"h4","text":"Еще один пример, где балл был снят:"},{"kind":"label","text":"Условие:"},{"kind":"p","text":"Какие морфологические особенности сформировались у китов в связи с водным образом жизни?"}]},{"title":"Линия 22 · Эксперимент","blocks":[{"kind":"label","text":"Ответ ученика:"},{"kind":"number","text":"3) Наличие плавников для передвижения в воде, обтекаемая форма тела для уменьшения сопротивляемости течению, влажная кожа (у некоторых возможно покрыта слизью) для легкого передвижения в толще воды, уменьшения трения."},{"kind":"label","text":"Пункт ключа:"},{"kind":"number","text":"3) наличие хвостового плавника;"},{"kind":"number","text":"4) редукция задних конечностей;"},{"kind":"number","text":"5) видоизменение передних конечностей в ласты;"},{"kind":"number","text":"6) обтекаемая форма тела (ноздри, расположенные на темени);"},{"kind":"number","text":"7) формирование китового уса (цедильного аппарата);"},{"kind":"number","text":"8) толстый слой подкожной жировой клетчатки."},{"kind":"p","text":"Ответ содержит биологическую ошибку: кожа китов не покрыта слизью (это признак рыб, амфибий). За это снят балл, поскольку нигде в ключе не говорится об особенностях покровов кита, считается дополнительной информацией"},{"kind":"h2","text":"Линия 22"},{"kind":"p","text":"Данная линия хоть и является шаблонной, однако все равно требует конкретики."},{"kind":"h4","text":"Определение зависимой и независимой переменных"},{"kind":"p","text":"В заданиях с определением переменных обязательно нужно указать обе переменные, иначе пункт не засчитывается."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"1) независимая переменная (задаваемая экспериментатором) - возраст курицы (порода); зависимая переменная (изменяющаяся в эксперименте) - средняя яйценоскость;"},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"p","text":"Независимая переменная: порода кур. Зависимая: возраст курицы."},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Пункт ключа не засчитывается, так как неверно определена зависимая переменная"},{"kind":"h4","text":"Альтернативные формулировки"},{"kind":"p","text":"Могут быть синонимы, альтернативные формулировки и т.д. Если смысл пункта ключа передан верно и ребенок другими словами правильно его описал - засчитываем."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"1) внутриутробное развитие плода (диаметр плаценты, длина и вес эмбриона) не зависит от наличия никотина (концентрации никотина) в воде;"},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"p","text":"развитие эмбриона не зависит от наличия никотина."},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Абсолютно верно передана суть нулевой гипотезы о независимости двух переменных"},{"kind":"h4","text":"Отрицательный контроль — уколы/вакцины"},{"kind":"p","text":"В заданиях с отрицательным контролем, где делают какие-то уколы животным/вводят в них растворы всегда нужно совершать факт манипуляции с животным."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"3) следует ввести животным растворитель, в котором была растворена глюкоза (физиологический раствор);"},{"kind":"label","text":"Ответ ребенка:"},{"kind":"p","text":"Необходимо измерить уровень инсулина у крыс, которым не вводим глюкозу."},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Данный пункт не засчитывается, так как не указана необходимость вводить растворитель (и, соответственно, посмотреть, а точно ли изменения в эксперименте не являются реакцией на укол)"},{"kind":"h4","text":"2 варианта одной и той же нулевой гипотезы"},{"kind":"p","text":"Нулевую гипотезу всегда можно сформулировать и как “х не влияет на у”, так и как “у не зависит от х”."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"1) нулевая гипотеза 1 - дальность полёта насекомых (число пролетевших более 1000 м) не зависит от температуры;"},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"p","text":"температура не влияет на число насекомых, пролетевших более километра"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Пункт должен быть засчитан, несмотря на то, что в ключе не отражена альтернативная его формулировка"},{"kind":"h4","text":"Не во всех случаях в ключе отражены все варианты альтернативных формулировок. В"},{"kind":"p","text":"1 пункте (при определении переменных) допускается несколько вариантов того, как можно сформулировать свой ответ. Однако в дальнейших пунктах отражены не все из них."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"1) внутриутробное развитие плода (диаметр плаценты, длина и вес эмбриона) не зависит от наличия никотина (концентрации никотина) в воде;"},{"kind":"number","text":"4) зависимость между внутриутробным развитием плода и никотином в воде не удается установить в явном виде."},{"kind":"label","text":"Ответ ребенка:"},{"kind":"p","text":"длина эмбриона не зависит от концентрации никотина в воде; зависимость между длиной эмбриона и концентрацией никотина в воде не удается установить в явном виде."},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Засчитываются оба пункта. Несмотря на то, что в 4 пункте ключа не отражены все формулировки переменных, логически ответ ребенка абсолютно верный."},{"kind":"h4","text":"Нелогичный ответ ребенка"},{"kind":"p","text":"Если ребенок пишет абсолютный бред (сначала одни переменные, потом другие) — не"},{"kind":"h4","text":"стоит засчитывать. Ответ должен быть логически связан, а в таком ответе ребенок"},{"kind":"p","text":"показывает непонимание сути эксперимента. На ЕГЭ такой ответ лояльный эксперт может и засчитать, но в образовательных целях лучше делать пометку и снимать балл."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"1) внутриутробное развитие плода (диаметр плаценты, длина и вес эмбриона) не зависит от наличия никотина (концентрации никотина) в воде;"},{"kind":"number","text":"4) зависимость между внутриутробным развитием плода и никотином в воде не удается установить в явном виде."},{"kind":"label","text":"Ответ ребенка:"},{"kind":"p","text":"длина эмбриона не зависит от концентрации никотина в воде; зависимость между диаметром плаценты и концентрацией никотина в воде не удается установить в явном виде."},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"4 пункт ключа лучше не засчитывать. Отсутствует логическая связь в ответе ребенка."},{"kind":"p","text":"Образец вашего комментария: Всё верно, но будь внимателен — в 1 пункте у тебя одна переменная, а затем ты пишешь о другой. Балл снимаю, на ЕГЭ строгий эксперт тоже может снять."},{"kind":"h4","text":"2 варианта цели отрицательного контроля"},{"kind":"p","text":"На 4 пункт ключа в заданиях с отрицательным контролем допускаются 2 формата формулировок (шаблонов) цели ОК."},{"kind":"label","text":"Пример:"},{"kind":"number","text":"4) данный эксперимент позволяет установить, действительно ли _____________ (зависимая переменная) зависит от _____________________ (независимой переменной) ИЛИ"},{"kind":"number","text":"4) данный эксперимент позволяет проверить, насколько изменения в _____________ (зависимой переменной) обусловлены факторами, не связанными с __________________________ (независимой переменной)"},{"kind":"p","text":"Не во всех ключах отражены оба варианта. Внимательно следите за тем, как вы оцениваете. И то, и то — допустимое описание цели отрицательного контроля."},{"kind":"h4","text":"Последовательность ответа"},{"kind":"p","text":"Ответ может быть дан и в другой последовательности или формулировках, только если смысл не искажен"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"3) у разных людей (групп) уровень глюкозы в крови может по-разному изменяться в зависимости от питания (приёма пищи, времени суток);"},{"kind":"number","text":"4) пища, различная по составу и принимаемая в разных количествах, может вызывать разные изменения в уровне глюкозы в крови;"},{"kind":"label","text":"Ответ ребенка:"},{"kind":"p","text":"Результаты могут быть недостоверными, т. к. из разной пищи может получиться разное кол-во глюкозы. В эксперименте участвовала одна и та же группа добровольцев, т. к. у разных людей могут быть разные показатели, а ученому нужно было выявить зависимость между уровнем глюкозы в крови и типом питания (т.е. во избежание погрешностей в эксперименте). Вердикт: В данном случае засчитываются и п. 3 ключа (показано, что уровень глюкозы индивидуален), и п.4 ключа (показано, что уровень глюкозы зависит от пищи)"},{"kind":"h4","text":"Конкретика в ответе"},{"kind":"p","text":"Нужна конкретика - если в ключе указано, что “диаметр сужается”, а в ответе ребенка “диаметр изменяется” и не указано как, то этот пункт не засчитываем."},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"3) чем больше крысят в приплоде, тем меньше эмбрионы по размеру (длине) и массе (весу)"},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"p","text":"В зависимости от того, сколько детенышей вынашивает крыса, ее организм испытывает разную нагрузку, поэтому может работать немного, но по-другому (каждый организм индивидуален). Вердикт: В данном случае п.3 ключа не засчитывается"}]},{"title":"Линии 23, 25, 26","blocks":[{"kind":"p","text":"В 4 пункте ключа (шаблонная формулировка) обязательно нужно указывать, что именно является зависимой/независимой переменными. Просто “не удастся установить зависимость между переменными” засчитывать нельзя."},{"kind":"h4","text":"Конкретика в достоверности"},{"kind":"p","text":"При ответе на вопрос о достоверности результатов аналогично всегда нужна конкретика — учащийся должен написать в своём ответе, что именно повлияет и как (то есть, назвать эти факторы, чаще всего). Обычно это является шаблонной фразой, рекомендуйте ученикам их"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"4) зависимость между внутриутробным развитием плода (диаметром плаценты, длиной и весом эмбрионов) и никотином (концентрацией никотина) в воде не удается установить в явном виде."},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"p","text":"Соответственно, эксперимент не будет достоверным из-за развития крысят в отличающихся условиях."},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"В данном случае п.4 ключа не засчитывается. Нет шаблонного пункта 4."},{"kind":"h2","text":"Линии 23, 25, 26"},{"kind":"h4","text":"Вариативность терминологии"},{"kind":"p","text":"Учитывайте грамотность употребления терминов — допускается вариативность терминологии по смыслу."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Условие:"},{"kind":"p","text":"Какой буквой на графике обозначено растение-суккулент, обитающее в пустыне? Ответ поясните, исходя из особенностей физиологии растений."},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"2) буквой В;"},{"kind":"number","text":"3) растение не поглощает углекислый газ в дневное время суток;"},{"kind":"label","text":"Ответ ребенка:"},{"kind":"p","text":"Растение-суккулент обозначен буквой В, потому что поглощение углекислого газа происходит в темновой фазе фотосинтеза, а на графике показано интенсивное поглощение именно с 18:00 до 24:00."},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Фраза в ответе ученика может быть зачтена как верный элемент, поскольку это уже не дневное время суток. Оба пункта засчитаны."},{"kind":"p","text":"Однако мысль нужно доводить до конца и знать грань. То есть, любое событие нужно связать с тем, что просят в задании и дать логический вывод."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Условие:"},{"kind":"p","text":"Какое физиологическое значение имеет такое расположение дыхалец?"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"1) через трахеи (дыхальца) происходит испарение влаги;"},{"kind":"number","text":"2) влага конденсируется на надкрыльях ИЛИ"},{"kind":"number","text":"2) влага хуже испаряется из-под надкрыльев (крыльев);"},{"kind":"label","text":"Ответ ребенка:"},{"kind":"number","text":"1) Дыхальца закрываются надкрыльями, что уменьшает испарение воды из организма жука"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Есть мысль о связи дыхалец и надкрыльев, однако в явном виде не сказано, что именно дыхальца отвечают за испарение. Пункт 1 не засчитывается."},{"kind":"h4","text":"Сложные пункты ключа (3 ; 4 ИЛИ 3 ; 4)"},{"kind":"p","text":"Следите за логичностью ответа, он должен соответствовать реальности (а не только ключу)."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Условие:"},{"kind":"p","text":"У каких простейших и почему сократительные вакуоли могут отсутствовать?"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"4) у простейших, обитающих в морях (у паразитических простейших);"},{"kind":"number","text":"5) они обитают в среде с гипертонической (физиологической) концентрацией солей ИЛИ"},{"kind":"number","text":"5) концентрация солей в морской воде (во внутриорганизменной среде) равна или выше концентрации солей в клетках простейших (в цитоплазме простейших)."},{"kind":"label","text":"Ответ ребенка:"},{"kind":"p","text":"дизентерийная амеба живет в организме в гипертонических условиях и не имеет необходимости в данном органоиде"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Пункт 5 не может быть засчитан, несмотря на то, что все эти слова есть в ответе ученика. Если идет речь о паразитических простейших (дизентерийной амебе), то она живет в изотонической среде; сказать, что она живет в гипертонической среде будет ошибкой."},{"kind":"h4","text":"+/- за пункты ключа"},{"kind":"p","text":"Отсутствие пояснения (только перечисление) – засчитываем пункт как за +/-, чаще всего (в новых заданиях 2024-2026 годов) пояснение выделено отдельным пунктом ключа."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Условие:"},{"kind":"p","text":"Какие особенности строения и жизнедеятельности позволяют им вести этот образ жизни? Назовите не менее пяти пунктов. В чём заключается роль этих приспособлений?"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"1) органы прикрепления (присоски, крючья) позволяют закрепиться в органах хозяина;"},{"kind":"number","text":"2) покровы (тегумент) защищают от переваривания в теле хозяина;"},{"kind":"number","text":"3) всасывание питательных веществ всей поверхностью тела позволяет потреблять больше питательных веществ;"},{"kind":"number","text":"4) редукция не повышающих приспособленность систем органов (пищеварительной; органов чувств) снижает расход энергии на работу этих систем;"},{"kind":"label","text":"Ответ ребенка:"},{"kind":"p","text":"у червей есть органы прикрепления, различные покрытия тела, но при этом они всасывают всей поверхностью тела. Вследствие этого редуцировалась пищеварительная система"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"На 4 пункта ключа у ребенка дан неполный ответ. За каждый из них ставится +/-. Итого полные 2 пункта."},{"kind":"h4","text":"Веер ответов — когда можно додумать ключ"},{"kind":"p","text":"Если какой-то функции/пункта/формулировке/альтернативного механизма нет в ключе, а вы считаете, что он заслуживает там быть — пишите старшему методисту, что в ключ"},{"kind":"h4","text":"стоит что-то добавить (особенно если это авторский). Это — дополнительные баллы в"},{"kind":"h4","text":"рейтинг за активность."},{"kind":"p","text":"Если даны формулировки не из ключа, но смысл не искажён (первичная продукция = органическое вещество от растений, хорошая освещенность = лучше проникает свет и т.д.) – всегда допускаются альтернативные формулировки, если они опираются на биологическую суть (оценивайте как корректный вариант)."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Условие:"},{"kind":"p","text":"Как называется этот органоид и какие процессы с белками в нем происходили?"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"5) грЭПС (шероховатый ЭПР);"},{"kind":"number","text":"6) созревание (фолдинг; сворачивание) белка ИЛИ"},{"kind":"number","text":"6) модификация белка"},{"kind":"label","text":"Ответ ученика:"},{"kind":"p","text":"гранулярный эндоплазматический ретикулум транспорт белков"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Несмотря на то, что ответ ребенка не совпадает с ключом (в нем нет речь об отправлении белков куда-либо), данный пункт полностью верный и отвечает на вопрос в условии о функции шЭПС."},{"kind":"h4","text":"Аналогичный пример:"},{"kind":"label","text":"Условие:"},{"kind":"p","text":"Используя схему пищевой цепи и данные по концентрации метилртути в морской среде, определите, у каких животных могли проявляться симптомы болезни Минамата."},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"2) при переходе на следующий трофический уровень концентрация метилртути увеличивается примерно в 10 раз"},{"kind":"label","text":"Ответ ученика:"},{"kind":"p","text":"По правилу 10%, исходя из того, что продуценты содержат метилртуть 0,68 мг/кг, зоопланктон выедает продуцентов, метилртуть накапливается в содержании 6,8 мг/кг. Консументы 2-го порядка питаются зоопланктоном, метилртуть накапливается в содержании 68 мг/кг,"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Правило 10% раскрыто в приведенных расчетах, отображено в явном виде. Пункт засчитан."},{"kind":"h4","text":"Веер ответов — когда нельзя додумывать ключ"},{"kind":"p","text":"Обращайте внимание, действительно ли ответ ребенка соответствует этому самому вееру ответов. Ключи 2024-2026 годов и так очень полные, там веер и так избыточный."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Условие:"},{"kind":"p","text":"Какие особенности строения скелета позвоночного животного, изображенного на рисунке, доказывают его наземное происхождение?"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"1) наличие пояса передних конечностей (лопатки);"},{"kind":"number","text":"2) свободная передняя конечность из трёх отделов: плеча, предплечья, кисти;"},{"kind":"number","text":"3) наличие рудиментарных костей тазового пояса;"},{"kind":"number","text":"4) рудименты свидетельствуют о наличии у предков задних конечностей;"},{"kind":"label","text":"Ответ ребенка:"},{"kind":"p","text":"наличие семи шейных позвонков наличие 5 отделов позвоночника копчиковые позвонки"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"У ребенка перечислены правильные особенности строения скелета, однако они никак не доказывают его наземное происхождение. Поэтому ни один из них не засчитывается."},{"kind":"h4","text":"Важно читать условие"},{"kind":"p","text":"Обращайте внимание, как сформулирован вопрос в условии и действительно ли ответ ребенка соответствует ему."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Условие:"},{"kind":"p","text":"Какие особенности строения жабр костных рыб обеспечивают эффективное насыщение крови кислородом?"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"3) большая площадь поверхности жабр (жаберных лепестков);"},{"kind":"label","text":"Ответ ребенка:"},{"kind":"p","text":"Большая площадь поверхности"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"В ответе ребенка не сказано, что именно жабры имеют большую площадь поверхности. Однако это и не требуется — в условии изначально спрашивают об особенностях строения жабр."},{"kind":"h4","text":"Анализируем ответ комплексно"},{"kind":"p","text":"Допускается иной порядок изложения, без искажения биологической сути. Старайтесь анализировать ответ ученика комплексно и искать все элементы ответа во всем тексте"},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Условие:"},{"kind":"p","text":"Как связано наличие складок со средой обитания амфибии? В чем причина такого поведения?"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"1) в холодной воде высокая растворимость кислорода ИЛИ"},{"kind":"number","text":"1) в атмосферном воздухе недостаточно кислорода (атмосферный воздух разрежен; низкое парциальное давление кислорода);"},{"kind":"number","text":"4) активные движения позволяют обогащенной кислородом воде омыть кожу ИЛИ"},{"kind":"number","text":"4) активные движения позволяют свистуну согреться;"},{"kind":"label","text":"Ответ ребенка:"},{"kind":"number","text":"1) Титикакский свистун обитает в высокогорном озере Титикака на высоте 3800 м над уровнем моря."},{"kind":"number","text":"2) Наличие большого количества складок на теле связано с увеличением таким образом площади поверхности тела."},{"kind":"number","text":"3) Из-за увеличения площади поверхности тела у свистуна развита капиллярная сеть сосудов, благодаря чему у него интенсивнее происходит газообмен."},{"kind":"number","text":"4) Это необходимо из-за того, что на высоте 3800 м над уровнем моря воздух разряжен и количество кислорода низкое."},{"kind":"number","text":"5) Расправление конечностей и активное движение телом необходимо для расправление кожных складок и более легкого газообмена на поверхности тела."},{"kind":"number","text":"6) Резкое увеличение одноклеточных водорослей приводит к снижению количества кислорода в водоеме."},{"kind":"number","text":"7) Ночью свистун не двигается активно."},{"kind":"number","text":"8) В ночное время множество свистунов погибает от недостатка кислорода."},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Первый пункт ключа написан в п.4 в ответе ученика, анализируем целиком! Также можно зачесть фразу “активное движение телом необходимо для расправление кожных складок и более легкого газообмена” как элемент “активные движения позволяют обогащенной кислородом воде омыть кожу”. Это является обоснованием того, почему лягушка резко дрыгается."},{"kind":"h4","text":"Доказательство от противного — засчитываем."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Условие:"},{"kind":"p","text":"Предположите, в какое время суток полушник активно накапливает малат в клетках."},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"1) накапливает малат ночью (в темное время суток);"},{"kind":"number","text":"2) ночью (в темное время суток) низкая конкуренция за растворенный в воде углекислый газ (в воде большое количество доступного углекислого газа);"},{"kind":"label","text":"Ответ ребенка:"},{"kind":"number","text":"1) Малат накапливается в ночное время."},{"kind":"number","text":"2) В дневное время суток водоросли активно фиксируют углекислый газ (концентрация углекислого газа в воде становится низкой). Фотосинтез идет только при наличии света, поэтому ночью малат накапливается в полушнике, чтобы быть использованным днем."}]},{"title":"Линия 24","blocks":[{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Из утверждения учащегося в явном виде следует, что раз днем мало углекислого газа в воде (низкая концентрация), значит ночью его концентрация выше, так как водоросли не фиксируют. Пункты 1 и 2 ключа засчитываются."},{"kind":"h4","text":"Похожий пример:"},{"kind":"label","text":"Условие:"},{"kind":"p","text":"Количество мышечных волокон в двигательной единице будет меньше в нижней косой глазодвигательной или икроножной мышце?"},{"kind":"label","text":"Ключ:"},{"kind":"p","text":"количество мышечных волокон в двигательной единице будет меньшим в нижней косой глазодвигательной мышце;"},{"kind":"label","text":"Ответ ребенка:"},{"kind":"p","text":"Количество мышечных волокон будет больше в икроножной мышце."},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Элемент засчитывается. Так как если в икроножной мышце волокон больше, то в глазодвигательной их меньше."},{"kind":"h2","text":"Линия 24"},{"kind":"p","text":"В 24 линии крайне важно определить объект или процесс, который изображён на рисунке. При этом могут просить определить один, два или три объекта, что и влияет на правила оценивания."},{"kind":"h4","text":"Исключения: синонимичные термины (стрекающие = кишечнополостные, пастбищная цепь"},{"kind":"p","text":"= выедания)"},{"kind":"h4","text":"Просят определить один объект на рисунке:"},{"kind":"bullet","text":"• Если неправильно определён объект на рисунке и хотя бы один последующий пункт ключа неверный - ставится 0 баллов за всё задание."},{"kind":"bullet","text":"• Если неправильно определён объект на рисунке, но ВСЕ ОСТАЛЬНЫЕ пункты"},{"kind":"h4","text":"ключа присутствуют - ставится 1 балл за всё задание."},{"kind":"h4","text":"Просят определить два объекта на рисунке:"},{"kind":"bullet","text":"• Если неправильно определён один из объектов на рисунке - задание оценивается согласно разбалловке, но 3/3 за задание не может быть выставлено."},{"kind":"bullet","text":"• Если неправильно определены оба объекта на рисунке - ставится 0 баллов за всё задание."},{"kind":"bullet","text":"• Если неправильно определён объект на рисунке, но ВСЕ ОСТАЛЬНЫЕ пункты ключа"},{"kind":"h4","text":"присутствуют - ставится 2 балла за всё задание."},{"kind":"h4","text":"Просят определить три объекта на рисунке:"},{"kind":"bullet","text":"• Если неправильно определен один объект на рисунке - задание оценивается как обычно, согласно разбалловке, но 3/3 за задание не может быть выставлено."},{"kind":"bullet","text":"• Если неправильно определены два объекта на рисунке - за задание выставляется максимум 1 балл (только в том случае, если суммарное количество засчитанных пунктов позволяло бы поставить 2-3 балла)"},{"kind":"bullet","text":"• Если неправильно определены три объекта на рисунке - за задание выставляется максимум 1 балл (только в том случае, если все остальные пункты верны)."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"label","text":"Ответ ученика:"},{"kind":"number","text":"1. 1 - гипокотиль;"},{"kind":"number","text":"2. образуется из зиготы;"},{"kind":"number","text":"3. обеспечивает развитие будущего растения (спорофита);"},{"kind":"number","text":"4. 2 - семенная кожура;"},{"kind":"number","text":"5. формируется из клеток покровов семязачатка (интегументов);"},{"kind":"number","text":"6. защищает зародыш (от механических повреждений, высыхания, проникновения микроорганизмов);"},{"kind":"number","text":"7. 3 - центральная клетка;"},{"kind":"number","text":"8. формируется из оплодотворенной центральной клетки зародышевого мешка;"}]},{"title":"Линия 27 · Биосинтез белка","blocks":[{"kind":"number","text":"9. обеспечивает питание зародыша (содержит запас питательных веществ, необходимых для прорастания семени)."},{"kind":"p","text":"В данном примере у ученика верно 6 пунктов из 9, при этом неверно определены 2"},{"kind":"h4","text":"структуры. Соответственно, за задание выставляется 1 балл."},{"kind":"p","text":"Остальные нюансы аналогичны 23, 25, 26 линиям."},{"kind":"h2","text":"Линия 27. Биосинтез белка."},{"kind":"h4","text":"Оформление"},{"kind":"number","text":"1. Триплеты в рамках одной молекулы ДНК, иРНК, тРНК или белка НЕЛЬЗЯ разделять запятой. За такое разделение сразу снимается один балл."},{"kind":"number","text":"2. Запятой разделяются только АНТИКОДОНЫ тРНК. Одна молекула тРНК содержит только один антикодон. Если слово во множественном числе («антикодоны»), значит и молекул было несколько, поэтому как при любом перечислении используем запятую."},{"kind":"h4","text":"Слитное написание антикодонов тРНК ни в коем случае не засчитываем."},{"kind":"number","text":"3. Нуклеотиды одной молекулы ДНК, иРНК, тРНК можно записывать слитно (АТЦГТАААЦГТЦ), через тире (А-Т-Ц-Г-Т-А-А-А-Ц-Г-Т-Ц) или по триплетам, разделенным тире (АТЦ–ГТА–ААЦ–ГТЦ). О возможности разделения триплетов тире, что делается для удобства восприятия, прописано в методичке для экспертов (саму методичку можно скачать на сайте ФИПИ). Но, если все же опасаетесь, что за это вопреки всему могут снять балл, рекомендуйте писать слитно без всяких знаков препинания (кроме антикодонов тРНК и аминокислот)."},{"kind":"p","text":"На триплеты детям разделять не рекомендуем - это вредит решению задачи и затрудняет поиск рамки считывания."},{"kind":"number","text":"4. Аминокислоты в молекуле белка пишутся через тире, никакие штрих-концы недопустимы! Между аминокислотами НЕЛЬЗЯ ставить ; , и просто пробелы, обязательно нужно тире."},{"kind":"number","text":"5. Писать “по принципу комплементарности/антипараллельности” не обязательно."},{"kind":"h4","text":"Ошибки в концевых обозначениях"},{"kind":"p","text":"5′ и 3′ концы в нуклеиновых кислотах должны стоять верно. У аминокислотных"},{"kind":"h4","text":"последовательностей никакие штрихи ставить нельзя. Написать 5’-лей-ала-гли-глу-3’"},{"kind":"p","text":"— очень грубая ошибка, из-за которой такой пункт не засчитывается"},{"kind":"p","text":"Если они перепутаны или опущены - этот элемент НЕ засчитывать. Остальные правильные элементы можно засчитать."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"p","text":"открытая рамка считывания иРНК: 5’-АУГЦГАУАЦГЦГЦАУЦГ-3’"},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"p","text":"открытая рамка считывания иРНК: АУГЦГАУАЦГЦГЦАУЦГ"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"В данном случае пункт ключа не засчитывается. Нет указателей штрих-концов у полинуклеотидной цепочки."},{"kind":"p","text":"В случае триплетом штрих-концы можно опустить. При этом рекомендуем штрих-концы писать всегда и везде, даже в триплетах."},{"kind":"h4","text":"Важно: засчитываем без штрих-концов только триплеты, соответствующие"},{"kind":"p","text":"расположению от 5 к 3:"},{"kind":"bullet","text":"• АУГ можно засчитать как 5'-АУГ-3'"},{"kind":"bullet","text":"• ГУА можно засчитать как 3'-АУГ-5'"},{"kind":"bullet","text":"• АУГ нельзя засчитать как 3'-АУГ-5'"},{"kind":"p","text":"Палиндром, ОРС или РНК (любую цепь больше 3 нуклеотидом) без штрих-концов не засчитываем!"},{"kind":"h4","text":"Зеркальная запись полинуклеотидных цепей"},{"kind":"p","text":"Любую полинуклеотидную цепочку можно записать зеркально. 5’-ГГГГГГААААААУУУУУУ-3’ это то же самое, что и 3’-УУУУУУААААААГГГГГГ-5’"},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"p","text":"открытая рамка считывания иРНК: 5’-АУГЦГАУАЦГЦГЦАУЦГ-3’"},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"p","text":"открытая рамка считывания иРНК: 3’-ГЦУАЦГГЦГЦАУАГЦГУА-5’"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"В данном случае пункт ключа засчитывается. иРНК записана абсолютно верно."},{"kind":"h4","text":"Описки в последовательности нуклеотидов"},{"kind":"p","text":"Оценивайте на ваше усмотрение. Если это единичная описка, остальное решение логически правильное и не искажено (неверна только одна аминокислота из-за описки), балл снижается только за тот элемент, в котором неверно написан нуклеотид (т.е. снижаем балл за тот пункт, где просят написать последовательность нуклеотидов)."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"3) открытая рамка считывания иРНК: 5’-АУГАУУЦУУУЦГААГ-3’;"},{"kind":"number","text":"4) последовательность полипептида: мет-иле-лей-сер-лиз."},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"number","text":"3) открытая рамка считывания иРНК: 5’-АУГЦУУЦУУУЦГААГ-3’"},{"kind":"number","text":"4) последовательность полипептида: мет-лей-лей-сер-лиз."},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"В данном случае из-за описки нуклеотида в рамке считывания не засчитывается только 3 пункт ключа."},{"kind":"h4","text":"Указание открытой рамки считывания"},{"kind":"h4","text":"Если в задании просят указывать открытую рамку считывания, это обязательно"},{"kind":"p","text":"нужно сделать. Просто подчеркнуть – недостаточно, в ключах всегда пишется “или указана и подписана в последовательности РНК // на вторичной структуре”. Ученик должен ее подчеркнуть и рядом подписать “открытая рамка считывания”, либо выписать отдельным пунктом. Пункт в таком случае не засчитывается."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"В данном случае не засчитывается открытая рамка считывания 5’-АУГ ЦГГ ГАУ ЦАУ УЦГ-3’, несмотря на то, что она выписана у ребенка. Её нужно либо подписать рядом как ОРС/открытая рамка считывания, либо выделить на исходной цепи иРНК и подписать."},{"kind":"h4","text":"1-2 нуклеотида, не кодирующие аминокислоту в рамках задачи"},{"kind":"p","text":"Иногда бывает такое, что у ребенка в ответе верные аминокислоты, а в открытой рамке считывания не хватает 1-2 нуклеотидов по краям. Чаще всего это не ошибка ребенка!"},{"kind":"p","text":"В открытой рамке считывания советуйте прописывать даже те нуклеотиды (1-2),"},{"kind":"h4","text":"которые считаются “лишними” (то есть, не кодируют аминокислоту в рамках данной"},{"kind":"p","text":"задачи). Баллы за это не снижаются, однако на это стоит указать ребенку."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"3) фрагмент открытой рамки считывания: 5'-ГЦААЦЦУГЦУУЦУ-3'"},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Открытая рамка считывания засчитывается, несмотря на отсутствие в ней крайнего нуклеотида У. Ребенку стоит прописать: “Привет! Засчитываю твою ОРС, но будь внимательнее — стоит писать даже те, что не образуют полноценный триплет в данной рамке. Они же не обрубаются стоп-кодоном, нам дан всего-лишь фрагмент рамки."},{"kind":"p","text":"Ученику эти скобки в ответе указывать НЕ НУЖНО! Они только для эксперта. Если ребенок пишет запись со скобками - балл не снимайте, но в обязательном порядке прописывайте это."},{"kind":"h4","text":"Аналогично с задачами, где дан фрагмент конца гена."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"6) открытая рамка считывания иРНК: 5’-ЦГАУАЦГЦГЦАУЦГУАГ-3’"},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"p","text":"Последовательность конца открытой рамки считывания 5’-АУАЦГЦГЦАУЦГУАГ-3’"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Открытая рамка считывания засчитывается, несмотря на отсутствие в ней крайних нуклеотидов ЦГ. Ребенку стоит прописать: “Привет! Засчитываю твою ОРС, но будь внимательнее — стоит писать даже те, что не образуют полноценный триплет в данной рамке. Нам дан всего-лишь фрагмент рамки, оно не обрубается старт-кодоном."},{"kind":"h4","text":"Хвостики, выходящие за пределы комплементарных участков (в случае палиндромов)"},{"kind":"p","text":"Ученик должен указывать полную вторичную структуру."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Во вторичной структуре у ребенка не хватает 2 нуклеотидов (ЦА). 2 пункт ключа не засчитывается."},{"kind":"h4","text":"Допустимые варианты оформления палиндромов:"},{"kind":"h4","text":"Огромные ключи с 2 вариантами решения и 7 пунктами ключа"},{"kind":"p","text":"Данные ключи (https://neofamily.ru/biologiya/task-bank/75119) — ЕГЭшная недоработка, когда составители пытались сделать максимально инклюзивное решение."},{"kind":"p","text":"У большинства ключей (но не всех) на платформе стоит примечание: Если сразу верно определено расположение искомых кодонов, открытая рамка считывания и матричная цепь (без поиска смысловой), по которой найден верный белок, то ставится"},{"kind":"h4","text":"максимальный балл."},{"kind":"p","text":"Недостаточно наугад определить верную цепь, отметить иРНК старт-кодон и кодон для искомой аминокислоты, определить ОРС и последовательность аминокислот и получить 3/3."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"1) аминокислоте мет соответствует кодон 5’-АУГ-3’ и, соответственно, триплет на матричной цепи ДНК 3’-ТАЦ-5’;"},{"kind":"number","text":"2) такой триплет присутствует в обеих цепях ДНК;"},{"kind":"number","text":"3) аминокислоте ала соответствует кодон иРНК 5’-ГЦ_-3’ и, соответственно, триплет на матричной цепи ДНК 3’-ЦГ_-5’, (5’-_ГЦ-3’)"},{"kind":"number","text":"4) такой триплет присутствует только на верхней цепи ДНК;"},{"kind":"number","text":"5) следовательно, верхняя цепь матричная;"},{"kind":"number","text":"6) открытая рамка считывания иРНК: 5’-АУГЦГАУАЦГЦГЦАУЦГ-3’ (может быть указана полная иРНК, на которой отмечена рамка считывания);"},{"kind":"number","text":"7) фрагмент полипептида: мет-арг-тир-ала-гис."},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"p","text":"ДНК: 5'-ЦГАТГЦГЦГТАТЦГЦАТТТАЦГАГЦ-3' 3'-ГЦТАЦГЦГЦАТАГЦГТАААТГЦТЦГ-5' Аминокислоту мет кодирует кодон иРНК 5'-АУГ'-3'; а аминокислоту ала кодируют кодоны ИРНК 5'-ГЦУ-3', 5'-ГЦЦ-3', 5'-ГЦА-3', 5'-ГЦГ-3' - по таблице генетического кода. Этим кодонам иРНК соответствуют триплеты ДНК 3'-ТАЦ-5', 3'-ЦГА-5', 3'-ЦГГ-5', 3'-ЦГТ-5, 3'-ЦГЦ-5'- по принципу комплементарности. Триплеты 3'-ТАЦ-5' и 3'-ЦГЦ-5' расположены в верхней цепи верхняя цепь - транскрибируемая (матричная), а нижняя - смысловая иРНК: 5'-ГЦУЦГУАААУГЦГАУАЦГЦГЦАУЦГ-3' - по принципу комплементарности. Синтез начинается с аминокислоты мет (с 9-го нуклеотида). Аминокислотная последовательность: мет-арг-тир-ала-гис - по таблице генетического кода."},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Несмотря на то, что в ответе ребенка нет 2 пункта ключа, а 4 и 5 неполные, в его решении полностью обоснован ход и порядок получения правильного ответа. Такой ответ оценивается на 3/3."},{"kind":"p","text":"Еще один пример — альтернативный способ решения"},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"1) если матричная цепь нижняя (смысловая цепь верхняя), то последовательность иРНК: 5’-ЦГАУГЦГЦГУАУЦГЦАУУУАЦГАГЦ-3’;"},{"kind":"number","text":"2) аминокислоте мет соответствует кодон 5’-АУГ-3’;"},{"kind":"number","text":"3) открытая рамка считывания: 5’-АУГЦГЦГУАУЦГЦАУУУАЦГАГЦ-3’ (или обозначена и подписана на иРНК);"},{"kind":"number","text":"4) данная рамка считывания не содержит кодонов, кодирующих аминокислоту ала (кодонов ГЦУ, ГЦЦ, ГЦА или ГЦГ; кодоны указывать не обязательно);"},{"kind":"number","text":"5) если матричная цепь верхняя (смысловая цепь нижняя), то последовательность иРНК: 3'-ГЦУАЦГЦГЦАУАГЦГУАААУГЦУЦГ-5' ИЛИ 5’-ГЦУЦГУАААУГЦГАУАЦГЦГЦАУЦГ-3’;"},{"kind":"number","text":"6) открытая рамка считывания: 5’-АУГЦГАУАЦГЦГЦАУЦГ-3’ (или обозначена и подписана на иРНК);"},{"kind":"number","text":"7) фрагмент полипептида: мет-арг-тир-ала-гис."},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"number","text":"1) Аминокислоте МЕТ соответствует кодон 5'-АУГ-3'."},{"kind":"number","text":"2) Аминокислоте АЛА соответствуют кодоны: 5'-ГЦУ-3'; 5'-ГЦЦ-3'; 5'-ГЦА-3'; 5'-ГЦГ-3'."},{"kind":"number","text":"3) Верхняя цепь являвется матричной ДНК; потому что на ИРНК, синтезируемой на основе нижней матричной ДНК, есть аминокислота мет, кодируемая 5'-АУГ-3', а также есть аминокислота АЛА, которая находится в открытой рамке считывания."},{"kind":"number","text":"4) Нижняя цепочка не является матричной ДНК, в открытой рамке считывания отсутствует аминокислота АЛА. иРНК: 5'-ГЦУЦГУАААУГЦГАУАЦГЦГЦАУЦГ-3' Открытая рамка считывания: 5'-АУГЦГАУАЦГЦГЦАУЦГ-3' последовательность аминокислот: мет-арг-тир-ала-гис."},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"В ответе ребенка не приведено достаточное обоснование, почему нижняя цепь не является матричной - не построена иРНК с нее и не указано отсутствие на ней необходимых кодонов. Допущено ошибка - в открытой рамке нет аминокислот (в ней кодоны). Такой ответ оценивается на 2/3."},{"kind":"h4","text":"Открытая рамка считывания в задачах на сдвиг рамки считывания"},{"kind":"p","text":"Указание новой открытой рамки считывания с удалением первого нуклеотида стоп-кодона (после которого рамка сдвигается) считается биологической ошибкой, за которую снимается балл (либо не засчитывается пункт с указанием рамки)."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"1) нуклеотидная последовательность иРНК: 5'-ЦУГААУГУГГГГЦУААЦУГЦГУА-3'"},{"kind":"number","text":"2) аминокислоте мет соответствует кодон 5'-АУГ-3';"},{"kind":"number","text":"3) в рамке считывания имеется стоп-кодон 5'-УАА-3';"},{"kind":"number","text":"4) происходит сдвиг рамки считывания до кодона 5'-ААЦ-3';"},{"kind":"number","text":"5) последовательность аминокислот в полипептиде: мет-три-гли-асн-цис-вал."},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"number","text":"1) нуклеотидная последовательность иРНК: 5'-ЦУГААУГУГГГГЦУААЦУГЦГУА-3'"},{"kind":"number","text":"2) аминокислоте мет соответствует кодон 5'-АУГ-3';"},{"kind":"number","text":"3) в рамке считывания имеется стоп-кодон 5'-УАА-3';"},{"kind":"number","text":"4) происходит сдвиг рамки считывания до кодона 5'-ААЦ-3';"},{"kind":"number","text":"5) открытая рамка считывания становится 5'-АУГУГГГГЦААЦУГЦГУА-3'"},{"kind":"number","text":"5) последовательность аминокислот в полипептиде: мет-три-гли-асн-цис-вал."},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Ребенок выписал открытую рамку считывания, удалив из нее нуклеотид (который пропускается рибосомой), что является грубой ошибкой (делеции не происходит). Снимается балл за ошибку."}]},{"title":"Линия 27 · Харди—Вайнберг","blocks":[{"kind":"h2","text":"Линия 27. Харди-Вайнберг"},{"kind":"p","text":"Сложность оценивания задач на закон Харди-Вайнберга заключается в том, что существуют не только нюансы в оформлении, а вдобавок и несколько способов того, как решается та или иная задача. Если у ребенка числа сходятся с ключом, а ход решения нет — повод задуматься, а точно ли стоит снижать баллы? Перепроверьте, не использует ли ребенок альтернативный способ решения. Ведь не просто так цифры сходятся."},{"kind":"h4","text":"Оформление без символов"},{"kind":"p","text":"Если ученик использует сокращенные корректные обозначения («частота а», «частота аа», “частота рецессивного аллеля“) –  засчитывайте как правильный вариант. Писать “равновесная” не обязательно. Использование p², q² и т.д. — опционально, однако, если вводятся эти переменные, то обязательно нужно пояснить, что они значат (p - частота аллеля и т.д.), иначе пункт без пояснения не засчитывается. Пояснить можно в начале в форме легенды (1 раз упомянуть), а затем просто считать, используя символы."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"1) частота рецессивных гомозигот (аа; особей с желтой окраской) в изначальной популяции составляет 35/1000 = 0,035;"},{"kind":"number","text":"2) частота рецессивного аллеля (а) в изначальной популяции составляет: q = 0,035 = 0,1871;"},{"kind":"number","text":"3) частота доминантного аллеля (А) в изначальной популяции составляет: р = 1 - 0,1871 = 0,8129;"},{"kind":"number","text":"4) частота доминантных гомозигот (АА; особей с голубой окраской) в изначальной популяции составляет 0,81292 = 0,6608;"},{"kind":"number","text":"5) после гибели 50% голубых особей в популяции осталось 0,6696 особей (66,96%; 0,6696 = 1 -0,66080,5);"},{"kind":"number","text":"6) частота фенотипов (генотипов) сразу после гибели 50% доминантных гомозигот у голубых особей: 0,3304/0,6696 = 0,4934;"},{"kind":"number","text":"7) частота фенотипов (генотипов) сразу после гибели 50% доминантных гомозигот у особей с промежуточной окраской: 0,3042/0,6696 = 0,4543;"},{"kind":"number","text":"8) частота фенотипов (генотипов) сразу после гибели 50% доминантных гомозигот у особей с желтой окраской: 0,035/0,6696 = 0,0523 (ИЛИ 1 - 0,4934 - 0,4543 = 0,0523)."},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"number","text":"1) Частота рецессивных гомозигот: 35/1000 = 0,035."},{"kind":"number","text":"2) Частота рецессивного аллеля (а): 0,035 = 0,1871."},{"kind":"number","text":"3) Частота доминантного аллеля (А): 1 - 0,1871 = 0,8129."},{"kind":"number","text":"4) Частота доминантных гомозигот: 0,8129² = 0,6608."},{"kind":"number","text":"5) Частота доминантных гомозигот после отлова: 0,3304/0,6696 = 0,4934."},{"kind":"number","text":"6) Частота гетерозигот после отлова: 0,3042/0,6696 = 0,4543."},{"kind":"number","text":"7) Частота рецессивных гомозигот после отлова: 0,035/0,6696 = 0,0523."},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"В своем ответе ребенок не использует общепринятые обозначения для Закона Харди-Вайнберга, однако получает полностью верный и логически обоснованный ответ. 3/3."},{"kind":"h4","text":"Математическое обоснование цифр"},{"kind":"h4","text":"Писать ответ без математических расчетов можно, так как именно так оформлены"},{"kind":"h4","text":"ключи 2026 года. Однако рекомендуйте прописывать, каким образом было получено то"},{"kind":"p","text":"или иное число, если ребенок что-то неправильно посчитал/разделил - это ошибка. Такие пункты засчитываются. Старые ключи более подробные, но оценивайте их в"},{"kind":"h4","text":"соответствии с 2026 годом."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"1) частота рецессивных гомозигот (аа; особей с желтой окраской) в изначальной популяции составляет 70/1000 = 0,07;"},{"kind":"number","text":"2) частота рецессивного аллеля (а) в изначальной популяции составляет: q = 0,07 = 0,2646;"},{"kind":"number","text":"3) частота доминантного аллеля (А) в изначальной популяции составляет: р = 1 - 0,2646 = 0,7354;"},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"number","text":"4) Частота особей с жёлтой окраской в исходной популяции составляет 0,07."},{"kind":"number","text":"5) Частота рецессивного аллеля (а) в исходной популяции составляет 0,2646."},{"kind":"number","text":"6) Частота доминантного аллеля (А) в исходной популяции составляет 0,7354."},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Данные пункты засчитываются в соответствии с ключами 2026 года."},{"kind":"p","text":"То есть, важно найти правильное число и чему оно соответствует."},{"kind":"bullet","text":"• Если у ребенка есть верные расчеты, показан ход действий - идеальный вариант."},{"kind":"bullet","text":"• Если у ребенка нет расчетов, только финальные числа - ок."},{"kind":"bullet","text":"• Если у ребенка есть верные цифры, но они получены неверными рассуждениями (просто по удачному совпадению) - не ок."},{"kind":"h4","text":"Частота аллеля и генотипа"},{"kind":"p","text":"Важно не путать частоту аллеля и генотипа. Такие пункты не засчитываются."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"1) частота рецессивных гомозигот (аа; особей с желтой окраской) в изначальной популяции составляет 90/1000 = 0,09;"},{"kind":"number","text":"2) частота рецессивного аллеля (а) в изначальной популяции составляет: q = 0,09 = 0,3;"},{"kind":"number","text":"3) частота доминантного аллеля (А) в изначальной популяции составляет: р = 1 - 0,3 = 0,7;"},{"kind":"number","text":"4) частота доминантных гомозигот (АА; особей с голубой окраской) в изначальной популяции составляет 0,72 = 0,49;"},{"kind":"number","text":"5) после гибели 30% голубых особей в популяции осталось 0,853 особей (85,3%; 0,853 = 1 - 0,490,3);"},{"kind":"number","text":"6) частота фенотипов (генотипов) сразу после гибели 30% доминантных гомозигот у голубых особей: 0,343/0,853 = 0,4021;"},{"kind":"number","text":"7) частота фенотипов (генотипов) сразу после гибели 30% доминантных гомозигот у особей с промежуточной окраской: 0,42/0,853 = 0,4924;"},{"kind":"number","text":"8) частота фенотипов (генотипов) сразу после гибели 30% доминантных гомозигот у особей с желтой окраской: 0,09/0,853 = 0,1055 (ИЛИ 1 - 0,4021 - 0,4924 = 0,1055)"},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"number","text":"1) Частота встречаемости рецессивного аллеля (а), отвечающего за ген жёлтого цвета, в равновесной популяции: a = q = 90/1000 = 0,09."},{"kind":"number","text":"2) Частота встречаемости доминантного аллеля, в равновесной популяции (А), отвечающего за ген голубой окраски: A = p = 1 - q = 1 - 0,09 = 0,91."},{"kind":"number","text":"3) Частота особей с голубой окраской (АА) в равновесной популяции: AA = p² = 0,91² = 0,8281."},{"kind":"number","text":"4) Частота особей с жёлтой окраской (аа) в равновесной популяции: aa = q² = 0,09² = 0,0081."},{"kind":"number","text":"5) Частота фенотипа голубого цвета после отлова волнистых попугаев хищниками: 0,7 · 0,8281 = 0,57967  0,5797."},{"kind":"number","text":"6) Частота фенотипа жёлтого цвета после отлова волнистых попугаев хищниками остаётся прежней: 0,0081."},{"kind":"number","text":"7) Частота фенотипа промежуточной окраски (соответствует генотипу Aа) после отлова волнистых попугаев хищниками вычисляется по формуле: 1 - q² - p² = 2pq: 1 - 0,0081 - 0,5797 = 0,4122."},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"У ребенка перепутана частота аллеля и частота генотипа. Все дальнейшее решение из-за этого неверное, 0/3."},{"kind":"h4","text":"Гибель/прибавление особей (5 элемент Федорова)"},{"kind":"p","text":"p², q², 2pq в тексте, а также извлечение корня и возведение в квадрат после выхода"},{"kind":"h4","text":"популяции из равновесия (то есть, гибели её части или добавления особей)"},{"kind":"p","text":"За такое оформление снимаются баллы. Обычно это , если все остальное верно"},{"kind":"h4","text":"Пример (https://neofamily.ru/biologiya/task-bank/75117):"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"1) частота рецессивных гомозигот (аа; особей с желтой окраской) в изначальной популяции составляет 100/1000 = 0,1;"},{"kind":"number","text":"2) частота рецессивного аллеля (а) в изначальной популяции составляет: q = 0,1 = 0,3162;"},{"kind":"number","text":"3) частота доминантного аллеля (А) в изначальной популяции составляет: р = 1 - 0,3162 = 0,6838;"},{"kind":"number","text":"4) частота доминантных гомозигот (АА; особей с зеленой окраской) в изначальной популяции составляет 0,68382 = 0,4676;"},{"kind":"number","text":"5) после гибели 40% зеленых особей в популяции осталось 0,8130 особей (81,30%; 0,8130 = 1 - 0,46760,4);"},{"kind":"number","text":"6) частота фенотипов (генотипов) сразу после гибели 40% доминантных гомозигот у зеленых особей: 0,2806/0,8130 = 0,3451;"},{"kind":"number","text":"7) частота фенотипов (генотипов) сразу после гибели 40% доминантных гомозигот у особей с промежуточной окраской: 0,4324/0,8130 = 0,5319;"},{"kind":"number","text":"8) частота фенотипов (генотипов) сразу после гибели 40% доминантных гомозигот у особей с желтой окраской: 0,1/0,8130 = 0,1230 (ИЛИ 1 - 0,3451 - 0,5319 = 0,1230)."},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"number","text":"1) Частота встречаемости жёлтых (аа) агам в равновесной популяции: q²(аа) = 100 : 1000 = 0,1."},{"kind":"number","text":"2) Частота рецессивного аллеля (а): q(a) = 0,1 = 0,3162."},{"kind":"number","text":"3) Частота доминантного аллеля (А): p(A) = 1 – 0,3162 = 0,6838."},{"kind":"number","text":"4) Частота встречаемости зелёных (АА) агам: p²(АА) = (0,6838)² = 0,4676."},{"kind":"number","text":"5) Частота жёлто-зелёных (Аа): 2pq(Аа) = 2 · 0,3162 · 0,6838 = 0,4324. После отлова хищниками:"},{"kind":"number","text":"1) Частота встречаемости зелёных (АА) агам: p² · 0,4 = 0,4676 = 0,4676 · 0,4 = 0,187."},{"kind":"number","text":"2) Частота встречаемости рецессивных гомозигот и гетерозигот из-за этого стала: q² + 2pq = 1 – 0,187 = 0,813."},{"kind":"number","text":"3) Частота встречаемости жёлтых агам (аа) теперь: q² = 0,1/0,813 = 0,123."},{"kind":"number","text":"4) Частота встречаемости жёлто-зелёных агам (Аа): 2pq = 0,4324/0,813 = 0,5319."},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Несмотря на верные цифры “после отлова хищниками”, данные пункты нельзя засчитать, поскольку в них используется символика для закона Харди-Вайнберга (он НЕ применим в неравновесной популяции)."},{"kind":"h4","text":"Округление"},{"kind":"p","text":"Помните про округление - обычно в задаче просят округлить до четвертого знака после запятой. НО в ключах ЕГЭ разрешается погрешность до 2го знака (0,01) - тут нужно просто быть внимательным."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"1) частота рецессивных гомозигот (аа; особей с желтой окраской) в изначальной популяции составляет 800/1000 = 0,8;"},{"kind":"number","text":"2) частота рецессивного аллеля (а) в изначальной популяции составляет: q = 0,8 = 0,8944;"},{"kind":"number","text":"3) частота доминантного аллеля (А) в изначальной популяции составляет: р = 1 - 0,8944 = 0,1056;"},{"kind":"number","text":"4) частота доминантных гомозигот (АА; особей с вулканической окраской) в изначальной популяции составляет 0,1056^2 = 0,0112;"},{"kind":"number","text":"5) после гибели 50% вулканических особей в популяции осталось 0,9944 особей (99,44%; 0,9944 = 1 - 0,01120,5);"},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"number","text":"1) частота рецессивных гомозигот (аа; особей с желтой окраской) в изначальной популяции составляет 800/1000 = 0,8;"},{"kind":"number","text":"2) частота рецессивного аллеля (а) в изначальной популяции составляет: q = 0,8 = 0,894;"},{"kind":"number","text":"3) частота доминантного аллеля (А) в изначальной популяции составляет: р = 1 - 0,8944 = 0,106;"},{"kind":"number","text":"4) частота доминантных гомозигот (АА; особей с вулканической окраской) в изначальной популяции составляет 0,106^2 = 0,011;"},{"kind":"number","text":"5) после гибели 50% вулканических особей в популяции осталось 0,985 особей;"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Все пункты засчитаны, несмотря на округление ребенком до 3го знака после запятой и, как следствие, отличающимися от ключа числами. Однако абсолютно верный ход решения привел к получению числа, входящего в рамки погрешности"},{"kind":"h4","text":"2 способа решения"},{"kind":"p","text":"Часто равнозначные (альтеративные) способы решения дают разную погрешность и, как следствие, разные числа."},{"kind":"h4","text":"Пример (см. пункты 1-2):"},{"kind":"h4","text":"Альтернативный способ поиска частот после изменения численности популяции"},{"kind":"p","text":"Задачи, где нужно рассчитать частоты генотипов после изменения численности можно решать 2 способами — в ключе отражен только один из них. Если у ребенка верные числа, а способа их получения нет в ключе — скорее всего, он решал альтернативным способом"},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"5) после гибели 30% голубых особей в популяции осталось 0,853 особей (85,3%; 0,853 = 1 - 0,490,3);"},{"kind":"number","text":"6) частота фенотипов (генотипов) сразу после гибели 30% доминантных гомозигот у голубых особей: 0,343/0,853 = 0,4021;"},{"kind":"number","text":"7) частота фенотипов (генотипов) сразу после гибели 30% доминантных гомозигот у особей с промежуточной окраской: 0,42/0,853 = 0,4924;"},{"kind":"number","text":"8) частота фенотипов (генотипов) сразу после гибели 30% доминантных гомозигот у особей с желтой окраской: 0,09/0,853 = 0,1055 (ИЛИ 1 - 0,4021 - 0,4924 = 0,1055)"},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"number","text":"6) После отлова погибло 30% голубых особей: 490 – 30% (147 особей) = 343 особи осталось."},{"kind":"number","text":"7) Всего особей в популяции = 853 (343 + 420 + 90)."},{"kind":"number","text":"8) Частота фенотипа АА (голубой) = 343/853 = 0,4021; частота фенотипа Аа (зелёный) = 420/853 = 0,4924; частота фенотипа аа (жёлтый) = 90/853 = 0,1055."},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Расчет произведен через число особей. Все пункты должны быть засчитаны."},{"kind":"h4","text":"Цифра отдельно не найдена, но ответ получен верный"},{"kind":"p","text":"Некоторые расчеты могут фигурировать в формуле, однако в явном виде не быть указаны. Если из ответа в явном виде следует, как взялось то или иное число — пункт засчитывается."},{"kind":"h4","text":"Пример (https://neofamily.ru/biologiya/task-bank/75117):"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"5) после гибели 40% зеленых особей в популяции осталось 0,8130 особей (81,30%; 0,8130 = 1 - 0,46760,4);"},{"kind":"number","text":"6) частота фенотипов (генотипов) сразу после гибели 40% доминантных гомозигот у зеленых особей: 0,2806/0,8130 = 0,3451;"},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"number","text":"6) Погибло зелёных особей после отлова хищниками: 0,4676 · 0,4 = 0,1870. Выжило зелёных особей после отлова хищниками: 0,4676 · 0,6 = 0,2806."},{"kind":"number","text":"7) Частота встречаемости зелёных особей в популяции после отлова хищниками:"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"И 5, и 6 пункты ключа должны быть засчитаны. Расчет написан в знаменателе дроби при расчете частот генотипов после отлова, а в 6 пункте дано пояснение откуда взялось число 0,187"}]},{"title":"Линия 27 · Филогенетические деревья","blocks":[{"kind":"h4","text":"Соответствие фенотипов и генотипов"},{"kind":"p","text":"Обращайте внимание, чтобы ученик писал, какие генотипы соответствуют какому фенотипу - да, это тоже может опускаться в рамках проверки ЕГЭ, но настоятельно рекомендуйте это делать."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"1) мутантный фенотип представлен доминантными гомозиготами (AA) и гетерозиготами (Aa);"},{"kind":"number","text":"2) частота мутантного фенотипа в равновесной человеческой популяции составляет p2 + 2pq = 1/700 = 0,0014;"},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"number","text":"1) мутантный фенотип представлен доминантными гомозиготами"},{"kind":"number","text":"2) частота мутантного фенотипа в равновесной человеческой популяции составляет 1/700 = 0,0014;"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Первый пункт ключа не может быть засчитан"},{"kind":"h2","text":"Линия 27. Филогенетические деревья."},{"kind":"h4","text":"Форма и ориентация дерева — не биологическая ошибка"},{"kind":"p","text":"Ключ прямо разрешает «любой вариант изображения» — важна топология (кто с кем группируется), а не то, как дерево нарисовано визуально: сверху вниз или слева направо, зеркально развёрнутое, с закруглёнными или прямыми линиями, в виде кладограммы или в виде текстовой скобочной записи вида «(A,(B,C))»."},{"kind":"label","text":"Ключ:"},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"h4","text":"Вердикт: засчитывается — топология идентична ключевой, различие чисто визуальное."},{"kind":"h4","text":"Формулировки пункта «кто возник первым» — принимаются альтернативы"},{"kind":"p","text":"Обе формулировки ключа равноценны и должны приниматься наравне с любыми корректными перефразировками: «A — базальная (первая отделившаяся) линия», «A разошёлся с общим предком линии B/C раньше, чем B и C разошлись между собой» и т. п. Но нужно в явном виде показать, какой штамм возник первым и какие позже. Если нельзя сказать, какой из 2 штаммов раньше возник - нужно указать оба"},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"2) сначала возник штамм А и предок штаммов В/С (предковый штамм ВС);"},{"kind":"number","text":"3) затем возникли штаммы В и С;"},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"number","text":"2) сначала возник предок штаммов В/С"},{"kind":"number","text":"3) затем возник штамм В, потом штамм С;"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Ни 2, ни 3 пункты не засчитываются. Не указано, когда возник штамм А, а вывод, что штамм В возник раньше штамма С является ошибочным"},{"kind":"h4","text":"Округление"},{"kind":"p","text":"Условие требует округлять до первого знака после запятой. При полностью верном ходе решения допускайте небольшую погрешность (например, N = 66,6-66,7 или t = 1332-1336 мин) — это следствие точки округления на промежуточных шагах, а не ошибка по существу. Если расхождение большое (например, ребёнок округлил 100/3 до 30 и получил N = 60) — это уже вычислительная ошибка, а не погрешность округления, и пункт не засчитывается."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"4) между штаммами В и С имеется четыре нуклеотидных различия (имеются нуклеотидные различия в позициях 9, 17, 28, 32);"},{"kind":"number","text":"5) после разделения два штамма накопили в среднем по две нейтральные мутации;"},{"kind":"number","text":"6) количество поколений (N), необходимое для накопления такого количество мутаций, составит 2*100/3 = 66,7"},{"kind":"number","text":"7) время, необходимое для формирования такого количества различий (t), составит t = 66,7 · 20 = 1334 минуты (22,2 часа)."},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"number","text":"4) между штаммами имеется четыре нуклеотидных различия"},{"kind":"number","text":"5) после разделения штаммы накопили по две нейтральные мутации;"},{"kind":"number","text":"6) количество поколений составит 66,7 (68)"},{"kind":"number","text":"7) время, необходимое для формирования такого количества различий (t), составит t = 68 · 20 = 1360 минут"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"4 пункт не засчитывается - не указано, между какими штаммами различия 5 пункт засчитывается 6 пункт не засчитывается - отсутствует формула в ответе 7 пункт не засчитывается - изначальное округление отличается больше, чем на 0,1"}]},{"title":"Линия 27 · Жизненные циклы / линия 28 · Генетика","blocks":[{"kind":"p","text":"При этом 3 балла выставляется только если верно указаны пункты 1, 6, 7."},{"kind":"p","text":"2 балла выставляется только если указан пункт 1."},{"kind":"h2","text":"Линия 27. Жизненные циклы — уже не встречаются на ЕГЭ."},{"kind":"bullet","text":"• В задачах на набор хромосом всегда должны быть пояснения (почему на картинке та или иная фаза деления)"},{"kind":"bullet","text":"• Обращаем внимание, чтобы ученики не путали понятия “набор хромосом” - 2n, 4n, 3n и “количество хромосом” - 46, 8, 16"},{"kind":"h2","text":"Линия 28. Генетика."},{"kind":"p","text":"В задачах по генетике главная сложность — нюансы в оформлении. Их достаточно много, их надо запоминать и приловчиться."},{"kind":"h4","text":"Дано (легенда)"},{"kind":"p","text":"Не обязательно писать легенду, дано и т.д. Если написано — окей, но если в ней совершена ошибка — снимается балл."},{"kind":"h4","text":"Кроссоверные гаметы"},{"kind":"p","text":"В некоторых ключах на платформе указано, какие гаметы являются кроссоверными, какие особи являются кроссоверными и т.д. Писать это необязательно, за отсутствие"},{"kind":"h4","text":"балл не снимается. Обводить гаметы в кружок тоже необязательно."},{"kind":"h4","text":"Индексы (F1, F2, P1)"},{"kind":"p","text":"Не нужны. За их наличие/отсутствие баллы не снимаются, если они неправильные — тоже. Это можно как-то прокомментировать, но на экзамене на это закрывают глаза."},{"kind":"h4","text":"Генетическая карта"},{"kind":"p","text":"В 2026 разрешается писать гены на концах отрезка. Да, не самый лучший вариант (гены на концах хромосомы располагаться не могут), однако это является допустимым вариантом. Следует написать ребенку “Привет! Не стоит писать гены на концах \"хромосомы”, так как там они не могут располагаться. Баллы не снижаю, но учти этот момент, чтобы произвести хорошее впечатление на эксперта.”"},{"kind":"h4","text":"Указание пола"},{"kind":"p","text":"Если в задаче наследуются сцепленные с полом признаки, указывать пол обязательно в любом случае"},{"kind":"p","text":"Если наследуются аутосомные признаки: Для животных — указывать обязательно у родителей."},{"kind":"p","text":"Для растений — можно (и желательно) не указывать. Но указание ошибкой не будет."},{"kind":"h4","text":"Написание фенотипов"},{"kind":"h4","text":"Важно: при голандрическом наследовании признак, который наследуется сцепленно с"},{"kind":"p","text":"Y-хромосомой пишем в фенотипе женщин тоже. Нужно показать, что данного заболевания у женщин в фенотипе нет (и быть не может). То есть, надо у всех девушек написать “нет гипертрихоза”."},{"kind":"h4","text":"В идеале — писать фенотип полностью по обоим признакам, например, “нет"},{"kind":"p","text":"ксеродермы, нет дальтонизма”."},{"kind":"h4","text":"Ответ “здоров или норма” считается верным. Если особь здорова по обоим признакам,"},{"kind":"p","text":"можно писать “здоров/норма” 1 раз."},{"kind":"label","text":"Пример сообщения ребёнку:"},{"kind":"p","text":"Привет! Рекомендация от меня: не ленись писать полные фенотипы, а не “здоров”. Не видел(а) случаев, чтобы на ЕГЭ за такое снижали, но все равно стоит быть аккуратнее и не лениться, так как можно запутаться."},{"kind":"h4","text":"Важно: порядок признаков в фенотипе должен соответствовать порядку генов и быть"},{"kind":"p","text":"единообразным по всему решению."},{"kind":"h4","text":"Нельзя так:"},{"kind":"bullet","text":"• АаВВ - серые, красные глаза"},{"kind":"bullet","text":"• ААВв - красные глаза, серые"},{"kind":"bullet","text":"• АаХDY - дальтонизм, волнистые волосы."},{"kind":"h4","text":"Сокращения"},{"kind":"p","text":"Сокращать фенотипов можно. Написать вместо “нет ксеродермы” “нет ксер.” допустимо и является общепринятым сокращением. Написание в очень кратком виде “нет ксер.” также является верным, хоть и нерекомендуемым."},{"kind":"label","text":"Пример сообщения ребенку:"},{"kind":"p","text":"Привет! Фенотипы засчитаю, но рекомендация: не ленись писать их полностью. Да, я сейчас понимаю, что ты под “нет ксер.” имеешь в виду “нет ксеродермы”, однако это может быть плохой привычкой на ЕГЭ. Эксперт неправильно прочитает букву — и всё, балла нет."},{"kind":"p","text":"Важно: в фенотипе должна быть написано БОЛЬШАЯ часть слова. Сокращение до 1-2 букв (н.к.) не засчитываем."},{"kind":"h4","text":"Написание фенотипов родителей"},{"kind":"p","text":"Если в условии задачи просят — нужно писать. Если не просят — можно не писать."},{"kind":"p","text":"В условии это обычно звучит как “определите генотипы, фенотипы родителей и … в двух браках”. Если фенотипы написаны неверно — балл должен быть снят."},{"kind":"h4","text":"За одну и ту же ошибку баллы дважды не снимаются"},{"kind":"p","text":"Если в обоих скрещиваниях у ребенка пропущены гаметы, не написан пол детей/родителей, то снимается только 1 балл. В целом, за верную схему скрещивания без указания гамет можно получить 2/3."},{"kind":"p","text":"Но на ЕГЭ могут и обнулить :( Предупреждайте ребенка."},{"kind":"h4","text":"Решётка Пеннета"},{"kind":"p","text":"Если ученик пишет решетку Пеннета, то в каждой клетке должен быть указан фенотип! Если фенотип не указан — балл должен быть снят."},{"kind":"p","text":"Рекомендовать её писать не нужно (отнимает много времени, может быть неразборчиво), однако она имеет место быть."},{"kind":"h4","text":"Аллели в полимерии"},{"kind":"p","text":"В 2026 принимаются 2 варианта оформления — через индексы (А1А1А2А2) и через отдельные буквы (ААВВ). Однако на ЕГЭ-2027 будет приниматься вариант только через индексы (А1А2)."},{"kind":"h4","text":"Соотношение генотипов"},{"kind":"p","text":"В генетике МОЖНО писать потомков как подряд с повторением"},{"kind":"p","text":"АаBb — круглый, красный АаBb — круглый, красный ааbb — грушевидный, желтый"},{"kind":"h4","text":"Так и с помощью коэффициентов. Разницы никакой нет!"},{"kind":"p","text":"2АаBb — круглый красный ааbb — грушевидный желтый"},{"kind":"p","text":"Однако игнорирование одного из потомков в данном случае является грубой ошибкой, за которую снижается балл."},{"kind":"h4","text":"Не нужно рекомендовать ученикам использовать коэффициенты"},{"kind":"h4","text":"Смена аллелей"},{"kind":"p","text":"Ребёнок может поменять местами названия аллелей – это допустимо. Ну, назвать цвет крыльев не А/а, а В/b. Следите внимательно и НЕ снижайте баллы за это. Но по"},{"kind":"h4","text":"правилам первый признак, упомянутый в задаче обозначается как А/а."},{"kind":"label","text":"Условие:"},{"kind":"p","text":"При скрещивании растения томата со сложными соцветиями, опушёнными плодами и растения с простыми соцветиями, гладкими плодами всё потомство получилось с простыми соцветиями, опушёнными плодами."},{"kind":"label","text":"Ответ ребёнка / ключ:"},{"kind":"p","text":"В данном случае ребёнок (решение слева) обозначил соцветия через буквы “В/b”, а плоды через “А/а”. Никакой ошибки в этом нет, ведь решение ребенка соответствует условию."},{"kind":"h4","text":"Задачи с летальным аллелем"},{"kind":"h4","text":"В потомстве нельзя писать фенотип для особей, которые погибают (желательно их"},{"kind":"p","text":"вообще не писать). Если и записали, то нужно указать, что они погибают (не просто с фенотипами)."},{"kind":"p","text":"В пояснении любые формулировки по типу \"АА подыхают\" допустимы, за них баллы не снимаем, однако для полного зачета должны быть все умершие генотипы в пояснении."},{"kind":"p","text":"В данном случае засчитывается пояснение (3 пункт задачи), но второе скрещивание не засчитывается, так как в нем написан фенотип для особей, которые гибнут на эмбриональной стадии. Если в схеме скрещивания их обвести в кружок и написать “гибнут” — можно было бы зачесть элемент."},{"kind":"h4","text":"Перепутанные местами скрещивания"},{"kind":"p","text":"В задачах скрещивания могут быть перепутаны местами"},{"kind":"p","text":"Будьте внимательны и не снижайте, если они правильны и соответствуют условию задачи."},{"kind":"h4","text":"Пример ответа ребенку:"},{"kind":"p","text":"Привет! Скрещивания правильные, но рекомендую писать их в хронологическом порядке (том, в котором они записаны в задачке). Так будет проще и тебе, и эксперту не запутаться при оценивании"},{"kind":"h4","text":"Одинаковые недостатки в оформлении в нескольких скрещиваниях:"},{"kind":"p","text":"Не указание пола/фенотипа родителей/пропуск гамет в двух скрещиваниях считается за одну ошибку, снимается только 1 балл, несмотря на то что каждое скрещивание оценивается независимо друг от друга."},{"kind":"p","text":"Если перепутан тип наследования (ребенок решает псевдоаутосомно, хотя признак по условию аутосомный) — обнуляются оба скрещивания. Если ответ на вопрос задачи верный (и там не фигурируют хромосомы) — можно выставить 1/3."},{"kind":"h4","text":"Пример: https://neofamily.ru/biologiya/task-bank/75113"},{"kind":"h4","text":"Пояснения (аутосомное наследование)"},{"kind":"p","text":"Ученик может писать более сжато и емко, это не будет ошибкой, но нужно"},{"kind":"h4","text":"придерживаться того стиля, который находится в ключе. Если ребенок расписал все"},{"kind":"p","text":"подробно, но при этом чего-то нет (например, не указал, какие аллели сцеплены), то балл снимается, дается укаание на то, что пояснение лучше писать так, как в ключах"},{"kind":"label","text":"Пример комментария ребенку:"},{"kind":"p","text":"Привет! Смотри, пояснение хорошее, но нужно написать, что многочисленная группа образована сцеплением аллелей: А сцеплен с b; а сцеплен с B. Ну и про кроссинговер малочисленной группы тоже обязательно сказать!"},{"kind":"p","text":"В задачах ЕГЭ-2025 (на построение хромосомной карты) вообще пояснения не требуются."},{"kind":"h4","text":"Пояснения (сцепленное с полом наследование)"},{"kind":"h4","text":"Нельзя в пояснении писать “ребенок получил ГАМЕТУ, содержащую аллель”. Ребёнок"},{"kind":"p","text":"получает не гамету, а ХРОМОСОМУ! А вот образуется он в результате слияния гамет."},{"kind":"h4","text":"Пояснение не засчитывается."},{"kind":"h4","text":"Для голандрического наследования достаточным является пояснение \"Y-хромосома"},{"kind":"p","text":"сцеплена с аллелем заболевания // признак наследуется голандрически\"."},{"kind":"h4","text":"Для псевдоаутосомного наследования достаточно показать, в результате слияния"},{"kind":"p","text":"каких гамет (с какими хромосомами) появляется такой ребенок. Если гамета (Х или Y)"},{"kind":"h4","text":"кроссоверная или некроссоверная, обязательно это указываем (если написано без"},{"kind":"h4","text":"уточнения, кроссоверная/нет — нельзя засчитывать, обязательно прописать)!"},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ключ:"},{"kind":"p","text":"В первом браке возможно рождение сына с дисхондростеозом и гипертрихозом (X(a)Y(Ab)). В генотипе этого ребёнка находятся материнская Х(а)-хромосома и некроссоверная отцовская Y(Ab)-хромосома."},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"p","text":"В первом браке возможно рождение сына с дисхондростеозом и гипертрихозом (X(a)Y(Ab)). Гипертрихоз наследуется голандрически и все сыновья будут больны, дисхондростеоз наследуется псевдоаутосомно. Так как заболевание доминантно, все сыновья будут больны."},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Пояснение не засчитывается. В ответе ребенка отсутствует объяснение, почему рождается ребенок с дисхондростеозом, в результате каких хромосом."},{"kind":"h4","text":"Для крисс-кросс (Х-сцепления) достаточно минималистичного \"расщепление связано"},{"kind":"p","text":"со сцеплением признака цвета перьев с Х-хромосомой\", однако нужно рекомендовать также писать фразу из ключей, что \"гомогаметный пол получает Х-хромосому от"},{"kind":"h4","text":"обоих родителей, а гетерогаметный пол — только от одного\". Эта рекомендация"},{"kind":"p","text":"обязательна, но баллы за отсутствие этой фразы не снимаются!"},{"kind":"h4","text":"Запись генотипа при независимом аутосомном наследовании"},{"kind":"p","text":"Указание генотипов гетерозиготных особей (аА вместо Аа) — является грубой ошибкой, о ней нужно сказать ребенку."},{"kind":"label","text":"Пример комментария ребенку:"},{"kind":"p","text":"Привет! Балл снимаю, у тебя нарушена генетическая символика — всегда в задачах на генетике пишут сначала доминантный аллель, затем рецессивный. Иная запись может вызвать вопросы у проверяющего."},{"kind":"h4","text":"Порядок записи также неважен в задачах, где один признак аутосомный, а другой"},{"kind":"p","text":"сцеплен с полом. Принято писать сначала аутосомный, затем сцепленный с полом (АаХ(В)Y), однако запись наоборот Х(В)YАа ошибочной не будет. Балл за это не"},{"kind":"p","text":"снимается, можно лишь написать ребёнку."},{"kind":"label","text":"Пример комментария ребенку:"},{"kind":"p","text":"Привет! Балл не снимаю, но принято писать сначала аутосомный ген, потом уже сцепленный с полом. Это правило во всех задачах используется, так будет легче и тебе, и проверяющему)"},{"kind":"p","text":"Использование одной и той же буквы (А/a и В/b) для другого признака в задачах на группу крови ошибкой не является. Об этом следует написать ребёнку, однако балл не снижается."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Ответ ребенка:"},{"kind":"label","text":"Комментарий ребенку:"},{"kind":"p","text":"Привет! В задачах, где у тебя группа крови, не стоит использовать одну и ту же букву для второго (аутосомного) признака. Это может запутать и тебя, и эксперта, лучше используй любую другую букву алфавита. На ЕГЭ уже нечасто встречаются задачки на группу крови, однако никто не исключает их появления в дальнейшем."},{"kind":"h4","text":"Запись генотипа при сцепленном с полом наследовании"},{"kind":"p","text":"Для задач с гемофилией/дальтонизмом/другими признаками на платформе чаще всего используются буквы H/h, D/d. Конечно, ребенок может обозвать какой угодно буквой, чаще всего они будут обозначать буквами А/а и В/b. Это допустимо."},{"kind":"h4","text":"Запись генотипа при сцепленном аутосомном наследовании"},{"kind":"p","text":"Допустимым является вариант как с палочками, так и без. При этом вариант с палочками рекомендуется экспертами, так как в нём меньше шансов запутаться и данный формат записи помогает определить, какие потомки являются кроссоверными, а какие нет (но при оценивании следите, чтобы верно было обозначено расположение аллелей)."},{"kind":"h4","text":"Конечно же, вертикальная запись палочек тоже разрешается!"},{"kind":"h4","text":"Запись аллеля, сцепленного с половыми хромосомами (но не голандрического)"},{"kind":"p","text":"Оформление половых хромосом палочками допустимо, не рекомендуется так делать."},{"kind":"h4","text":"Запись голандрического аллеля (сцепленного с Y)"},{"kind":"p","text":"Допустимы несколько вариантов записи аллеля, сцепленного с Y:"}]},{"title":"Проверка домашних заданий","blocks":[{"kind":"h3","text":"Вкратце:"},{"kind":"bullet","text":"• Рекомендуемое время проверки одной домашней работы — 7 минут (не более 10-12 минут) без потери качества проверки."},{"kind":"bullet","text":"• Комментарий по каждому заданию пишется в поле у самого задания, внизу - общий комментарий по домашней работе. Можно заготовить себе шаблоны, чтобы ими эффективно пользоваться"},{"kind":"bullet","text":"• Вся информация о твоих проверках отображается у старшего методиста, поэтому старайся делать это как можно оперативнее."},{"kind":"bullet","text":"• Tone of voice: нейтральный, к детям обращаемся по имени. Без излишнего милашества, отвечайте без излишних эмоций."},{"kind":"h3","text":"Примеры хороших ответов:"},{"kind":"p","text":"Надежда, привет. Домашка хорошая, мне очень понравилось проверять, получила удовольствие! Успехов тебе в учебе, есть некоторые замечания по твоим ответам -посмотри на них у заданий. Если есть вопросы - спрашивай в чате с методистом!"},{"kind":"p","text":"Смотри, у тебя есть ошибка в механизме заражения: в хозяина финны попадают, не яйца (заболевание же финноз). Высокую плодовитость я засчитаю, а про редукцию НС ничего у тебя не написано."},{"kind":"p","text":"Допущена ошибка в формулировке: печень не вырабатывает ферменты “при помощи” эндокринных и экзокринных желез, она сама осуществляет синтез соответствующих веществ. Вдобавок ты забыла про антикоагулянтный эффект метаболитов печени (гепарина) и синтез холестерина. 3/3 вышло по разбалловке, но обрати внимание в любом случае."},{"kind":"p","text":"Очень круто, когда вы обращаетесь к ребёнку по имени — вот прям здорово. Ну и обращайте внимание на пол ребенка, чтобы не было случаев, когда обращаются с местоимениями противоположного пола. Если не знаете, как обратиться к ребенку - просто “Привет!”."},{"kind":"p","text":"Каждому методисту нужно заготовить несколько шаблонных фраз “для себя”, которые вы будете отправлять ребёнку (просто копируете из домашки в домашку):"},{"kind":"p","text":"Первая для идеальных домашек."},{"kind":"label","text":"Пример:"},{"kind":"p","text":"Привет! Идеальная домашка, ни единой ошибки, ты просто супер Остались какие-то вопросы по пройденной теме? Если что-то осталось непонятным, обязательно спрашивай у методистов в чате <з"},{"kind":"p","text":"Вторая на случай неплохо выполненной домашки."},{"kind":"label","text":"Пример:"},{"kind":"p","text":"Привет! Домашка выполнена хорошо, пояснения по ошибкам в первой части посмотри прямо в пояснениях к заданиям, а по второй части расписала у самих заданий! Остались какие-то вопросы по пройденной теме? Если что-то осталось непонятным, обязательно спрашивай у методистов в чате <з"},{"kind":"p","text":"Третья на случай откровенно слабого/плохого прохождения."},{"kind":"label","text":"Пример:"},{"kind":"p","text":"Привет! Вижу, что возникли трудности с домашкой, пояснения по ошибкам в первой части посмотри прямо в пояснениях к заданиям, по второй тоже всё расписала у заданий. Обязательно разбери эту тему! По ЛЮБЫМ вопросам обязательно спрашивай у методистов в чате!"},{"kind":"h4","text":"Важно: сначала отправляешь свой комментарий и только после этого нажимаешь"},{"kind":"p","text":"“завершить проверку”."},{"kind":"p","text":"Задания первой части в домашних заданиях НЕ проверяются, но на вопросы по ней, конечно же, надо отвечать."},{"kind":"p","text":"В комментарии к каждому заданию вы пишите, каких пунктов ключа нет в ответе ребенка и что стоило бы исправить в ответе ребенка. Если есть биологические ошибки, рекомендую их выписывать отдельно, выделять жирным шрифтом (ctrl+B)."},{"kind":"p","text":"Привет! Вижу, что есть биологическая ошибка: Неверно указано, что из нерпы выходят личинки; на схеме показаны яйца паразита. Второй пункт не засчитываю)"},{"kind":"p","text":"Если задание сделано на отлично - его можно не комментировать. Однако когда вся домашка сдана на максимум, желательно написать хоть что-то по 1-2 заданиям, чтобы ребенок увидел, что в его работу действительно вчитались. Ну, или отметить почерк/стиль изложения.”"},{"kind":"p","text":"Привет! Работа просто прекрасная :) Только “анабиоз”, а не “анабеоз” — следи за орфографией, хоть и за нее не снижают"},{"kind":"p","text":"Если задания не сделаны - это лучше отметить в комментарии внизу (а не писать у каждого задания)."},{"kind":"p","text":"Привет! Почему не получилось выполнить 25, 27 задания? Если есть вопросы — смело задавай, разберемся!"},{"kind":"p","text":"В поле для общего комментария вы отправляете \"шаблонную шапку\"."},{"kind":"p","text":"Аделина, привет! Хорошая домашка, ты молодец Ошибки в заданиях 1й части глянь в пояснениях к ним, по второй части расписано у самих заданий"},{"kind":"p","text":"Ну, или на отличную домашку:"},{"kind":"p","text":"Даня, отличный результат Остались какие-то вопросы по материалу? Смело спрашивай в нашем чатике методистов!"},{"kind":"p","text":"Соответственно, вопросы дети (в идеале) будут задавать у самих заданий. Ваша задача - не пропустить их (они подсвечены красной точкой) и ответить на них. Если это вопрос по проверке - вы должны ответить на каждое такое сообщение, иначе домашка \"не снимется\" с вас (а потом передать в послания."},{"kind":"h2","text":"Вторая часть"},{"kind":"p","text":"Балл за задания второй части нужно выставлять прямо на платформе"},{"kind":"p","text":"Оценивай строго, но справедливо — все сдавали ЕГЭ, все понимают специфику. Иногда лучше поставить балл повыше, но в пояснении указать, что на экзамене этот пункт могут и не засчитать. Никогда не советуй ученику писать меньше, чем нужно — это неправильная тактика. Никто не знает, что будет в ключе — поэтому самым правильным советом будет писать \"всё, что знаешь по этой теме и в чём уверен, чтобы не допустить биологических ошибок и повысить шансы попадания в ключ, рассматривай вопрос с разных сторон\"."},{"kind":"h3","text":"За списывание — ставим 3/3"},{"kind":"p","text":"Списывание — дело самого ученика, ваша задача это проверять задания и справедливо их оценивать. Давайте обойдемся без синдрома вахтера, то, как сделал ученик не должно вас волновать. В 16-17 лет это уже осознанные люди, которые должны понимать последствия."},{"kind":"p","text":"На крайний случай — оставляйте «шапку для списывальщиков»."},{"kind":"p","text":"Пояснения к заданиям из ключей с платформы ни в коем случае не копируем - всё пишем от себя."},{"kind":"p","text":"Твоя задача — сделать так, чтобы у ученика не возник вопрос «а за что мне сняли балл???» Как это сделать быстро и качественно — решаешь ты сам(а)."},{"kind":"p","text":"В ваши обязанности также входят ответы на вопросы ученика в конце прохождения (там, где обычно “спасибо большое, вопросов нет!”). На такое отвечаем так, как и в жизни:"},{"kind":"p","text":"Пожалуйста! Передала благодарность методисту!"},{"kind":"p","text":"В случае, если одновременно падает домашка и вопрос — сначала отвечаем на вопрос, потом проверяем домашку."},{"kind":"p","text":"Важнейший момент: сначала отправляем комментарий и отвечаем на вопрос ребёнка, и только после этого нажимаем “завершить проверку”. Это важно — после нажатия на “завершить проверку” на страницу прохождения ребёнка попасть будет невозможно."},{"kind":"p","text":"Сначала нажимаем “отправить” и только после этого завершаем проверку."},{"kind":"p","text":"Если по каким-то причинам (надеюсь, таких случаев не будет), ты завершил проверку раньше, чем отправил комментарий - ты можешь вернуться в неё через “проверено”"},{"kind":"h2","text":"Какой должна быть проверка?"},{"kind":"h3","text":"Быстрой."},{"kind":"p","text":"В идеале на одно задание должно уходить не более 1,5 минуты. Первые проверки могут идти долго - это нормально. Со временем вы обязательно набьете руку и станете проверять намного быстрее без потери в качестве."},{"kind":"p","text":"Чтобы быстро проверять, придумайте себе заранее заготовленные фразы для типовых ситуаций (скопировал — вставил — готово)."},{"kind":"bullet","text":"• Не нужно каждый раз придумывать «с нуля», как отреагировать на типовую ситуацию — это убивает скорость. Держите список готовых фраз перед глазами (например, в отдельном файле)."},{"kind":"bullet","text":"• Увидели типовую ситуацию — скопировали фразу, вставили в комментарий."},{"kind":"bullet","text":"• При необходимости добавляете 1–2 слова про конкретную ошибку."},{"kind":"h3","text":"Понятной ученику."},{"kind":"p","text":"Комментарий должен объяснять суть ошибки обычными словами, без лишней воды и сложных терминов. Если у ученика частично верный ответ, очень важно прямо указать ему на ошибку, не копируя целиком пункт ключа."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Условие:"},{"kind":"p","text":"Какая переменная в этом эксперименте будет зависимой (изменяющейся), а какая — независимой (задаваемой)?"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"1) зависимая переменная (изменяющаяся в эксперименте) – объем (форма, размер) живой части растительной клетки (протопласта); независимая переменная (задаваемая экспериментатором) – концентрация (% содержание) соли в окружающем растворе (должны быть указаны обе переменные);"},{"kind":"label","text":"Ответ ученика:"},{"kind":"number","text":"1) зависимая — концентрация соли раствора, а независимая переменная — форма протопласта"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Ни в коем случае не копируем ключи. Здесь достаточно написать: “у тебя перепутаны переменные местами, поэтому засчитать не могу!”"},{"kind":"p","text":"В противном случае при копировании ключа ученик ученик может не понять суть ошибки, вам придется возвращаться к домашке и снова объяснять."},{"kind":"h3","text":"Полной."},{"kind":"p","text":"Внимательно просматриваем весь развёрнутый ответ ученика — каждую фразу, каждое утверждение. Даже если начало ответа верное, в середине или конце может быть ошибка, которую нельзя пропустить."},{"kind":"p","text":"Даже если вся работа сделана идеально на 3/3, то нужно хоть что-то (неточность, любую опечатку) найти, чтобы было видно, что работа действительно проверялась. Это показывает ученику, что вы внимательно разобрали его ответ, а не просто просмотрели для галочки."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Условие:"},{"kind":"p","text":"Как в ходе эксперимента изменяется длина передних конечностей и длина хвоста? Почему на последнем этапе эксперимента исследователи не смогли определить количественно исследуемый параметр? Какие органоиды в клетках хвоста головастика обеспечивают его изменение в ходе метаморфоза? Ответ поясните."},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"1) длина передних конечностей увеличивается, длина хвоста - снижается (должны быть указаны оба пункта);"},{"kind":"number","text":"2) в конце метаморфоза хвост у головастиков полностью исчез; 3)лизосомы;"},{"kind":"number","text":"4) обеспечивают разрушение клеток ферментами лизосом (гидролазами)."},{"kind":"label","text":"Ответ ученика:"},{"kind":"number","text":"1) длина передних конечностей увеличивается, а длина хвоста - снижается"},{"kind":"number","text":"2) к концу развития хвост исчезает"},{"kind":"number","text":"3) лизосомы, которые обеспечивают разрушение клеток"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Все пункты верные, соответствуют ключам, очевидно, что это 3/3. Однако здесь важно прописать, что не сами лизосомы разрушают клетки, а их ферменты! Нужна конкретика."},{"kind":"p","text":"На такие детали следует обращать внимание, несмотря на то что за задание ставится 3 балла."},{"kind":"p","text":"Если разбалловка позволяет поставить 3/3 за задание, несмотря на отсутствие недостающих пунктов ключа, всё равно необходимо на это указать!"},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Условие:"},{"kind":"p","text":"Каковы особенности строения и физиологии кардиомиоцитов? Укажите три особенности."},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"3) имеют поперечную исчерченность;"},{"kind":"number","text":"4) соединяются друг с другом (при помощи вставочных дисков);"},{"kind":"number","text":"5) одноядерность (двуядерность; многоядерность)"},{"kind":"number","text":"6) низкая утомляемость;"},{"kind":"number","text":"7) способность генерировать и проводить электрический (нервный) импульс (потенциал действия)."},{"kind":"label","text":"Ответ ученика:"},{"kind":"number","text":"3) имеют поперечную исчерченность"},{"kind":"number","text":"4) соединяются друг с другом"},{"kind":"number","text":"5) способность генерировать и проводить электрический импульс"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Разбалловка позволяет поставить 3 балла, однако ученику необходимо указать на недостающие 5 и 6 пункты ключа."},{"kind":"h3","text":"С индивидуальным подходом."},{"kind":"h3","text":"Человечной."},{"kind":"h2","text":"Частые вопросы по оцениванию второй части"},{"kind":"p","text":"Что делать, если перечислены не все пункты? Например, в пункте ключа идет перечисление каких-то органоидов или признаков, и ученик их назвал, но не все"},{"kind":"p","text":"Оцениваем в соответствии с ключом. Обычно это засчитывается как +/- (неполный элемент ответа)."},{"kind":"label","text":"Пример:"},{"kind":"label","text":"Условие:"},{"kind":"p","text":"При интенсивных нагрузках у крупных пустынных жуков многие ткани и органы используют гликолиз в качестве основного метаболического пути. Как можно объяснить такую закономерность?"},{"kind":"label","text":"Ключ:"},{"kind":"number","text":"5) при интенсивных нагрузках используется много кислорода"},{"kind":"label","text":"Ответ ребёнка:"},{"kind":"number","text":"5) При интенсивных нагрузках крупные жуки в качестве основного метаболического пути используют гликолиз, потому что им не хватает кислорода"},{"kind":"label","text":"Вердикт:"},{"kind":"p","text":"Исключения: различные примеры. Когда просят привести пример белка с четвертичной структурой и в ключе гемоглобин, а ребёнок написал АТФ-синтазу или лактатдегидрогеназу, мы засчитываем этот пункт. Но и советуем приводить несколько примеров, в том числе самые очевидные. Но если написал миоглобин — это ошибка, и вы должны знать, почему)"},{"kind":"h4","text":"Ответ на вопрос является набором слов/перечислением терминов."},{"kind":"p","text":"Пытаемся всеми силами читать внимательно и выявить в ответе ребёнка пункты ключа. Следим за правильным использованием терминов, просим выражаться более академично. К счастью, здесь нет высоких требований к грамматике, можно просить ученика делить ответ на пункты и писать понятно. Можно посоветовать перечитать свой ответ с точки зрения учителя и подумать, достаточно ли его ответ доступный для понимания?"},{"kind":"p","text":"Если мысль (пункт ключа) учеником переданы верно - этот пункт засчитываем."},{"kind":"h4","text":"Пример ответа:"},{"kind":"p","text":"Привет! Пишешь верно, но совсем непонятно, к чему что относится. Просто случайное перечисление, непонятно, что изображено под цифрой 1, атф-синтаза или хлоропласт) Пиши не просто по пунктам, но и полными предложениями — в своём ответе формулируй пункты вопросы, на которые ты отвечаешь"},{"kind":"p","text":"На орфографические ошибки мы указываем, но не снижаем баллы за них. Кроссенговер, комплиментарность — во второй части за эти термины баллы не снижаются!"}]},{"title":"Чат с методистом","blocks":[{"kind":"p","text":"Ответ на вопрос ученика должен быть дан в течение 5 минут после его появления с 10:00 до 22:00."},{"kind":"p","text":"Вопросы от детей появляются в хронологическом порядке сверху вниз. То есть, сверху -самый старый неотвеченный вопрос. В КАЖДОМ диалоге последнее сообщение должно быть за методистом."},{"kind":"p","text":"Общие правила: будьте вежливы, не душните, на одной волне с детьми. Не надо расписывать полотна."},{"kind":"p","text":"Некоторые ответы на частые вопросы лежат в регламенте."},{"kind":"h3","text":"В одном диалоге не может быть одновременно несколько методистов."},{"kind":"p","text":"Пока вы находитесь в диалоге, в него не может зайти другой человек. Диалог закрепляется за методистом еще в течение трёх следующих минут после выхода из него (и никто эти 3 минуты не может открыть)."},{"kind":"p","text":"Поэтому если вы ведете диалог с одним ребенком - желательно всю смену с ним и разговаривать, чтобы не вникать каждый раз в контекст."},{"kind":"p","text":"! ЕСЛИ У ВАС НЕТ СМЕНЫ В ЧАТЕ, В ЧАТ ВЫ НЕ ЗАХОДИТЕ"},{"kind":"h3","text":"Каким должен быть ответ?"},{"kind":"bullet","text":"• Понятным — не должно быть непонятных терминов или сложных объяснений, о которых узнаёшь только в вузе."},{"kind":"bullet","text":"• Проиллюстрированным — различные картинки, схемы, ссылки на УС будут только в помощь."},{"kind":"p","text":"• Правильным — да, это очень важно. Если не знаешь — не бойся искать в интернете, можно даже спрашивать у нейросетей, если сильно сомневаешься (только, пожалуйста, в таком случае переформатируй ответ, не надо копировать его полностью! Ребенок ни в коем случае не должен засомневаться в знаниях методиста). Старший методист периодически просматривает различные чаты, всегда можно понять, кто и как ответил на вопрос"},{"kind":"bullet","text":"• Эстетичным — пожалуйста, не отправляй детям странные картинки (целые слайды из презентаций в интернете) и уж тем более картинки от других онлайн-школ."},{"kind":"p","text":"Если ребенок задает 2-3 вопроса с другой платформы - на них мы отвечаем. Это занимает 1-2 минуты (тут ответ сразу понятен), но в глазах ребенка вы выглядите лучше и не отталкиваете от себя."},{"kind":"p","text":"Если ребенок просит в чате проверить пробник школьный/с платформы — это можно сделать. Не обязательно за 5 минут, но указать примерный балл и вкратце ошибку нужно! Как вариант - просто скинуть ключ и указать, каких пунктов у него нет."},{"kind":"p","text":"А ещё у вас есть доступ к конспектам вебинаров — они очень красивые и на них можно ссылаться :)"},{"kind":"p","text":"В первую очередь ссылаемся на конспект и вебинар, затем уже на умный справочник. Крайне нежелательно ссылаться на какие-то материалы в интернете, а уж на материалы других онлайн-школ — вообще табу. Поэтому никогда в чате не отправляйте ссылки на какие-то сайты в интернете."},{"kind":"h2","text":"Ответы на частые вопросы детей:"},{"kind":"h4","text":"Гайд по продажам:"},{"kind":"p","text":"https://nfsales.yonote.ru/share/3c1c8573-9b19-4101-ab62-742d7d253528"},{"kind":"h4","text":"! детям его кидать НЕЛЬЗЯ, он только для ВАШЕГО пользования"},{"kind":"h4","text":"Как найти куратора?"},{"kind":"p","text":"Привет! Нужно перейти в «Мои занятия» и кликнуть на баннер, призывающий выбрать куратора. Возможно, система его распределила автоматически, если с момента покупки прошло больше часа"},{"kind":"h4","text":"Не отвечает куратор"},{"kind":"p","text":"Привет! Передам в учебный отдел: обязательно разберемся, что произошло с куратором. Обратись, пожалуйста, в службу заботы: t.me/NeoFamilyHelp или сообщения сообщества ВК: https://vk.com/im?sel=-184221081"},{"kind":"h4","text":"Как сменить куратора?"},{"kind":"p","text":"Чтобы сменить куратора, открой раздел «Мои занятия» и нажми на значок куратора. Там будет кнопка «Хочу к другому куратору» — кликай на неё."},{"kind":"p","text":"Не переживай и указывай настоящую причину: твой текущий куратор её не увидит."},{"kind":"p","text":"Но для начала обратись, пожалуйста, в службу заботы: t.me/NeoFamilyHelp или сообщения сообщества ВК: https://vk.com/im?sel=-184221081"},{"kind":"h4","text":"Что делать если мне не написал куратор?"},{"kind":"p","text":"Если у тебя возникли сложности, обратись в техподдержку. Для этого нажми на значок с вопросительным знаком в правом нижнем углу платформы."},{"kind":"p","text":"Если значка нет, переходи по ссылке: t.me/NeoFamilyHelp."},{"kind":"h4","text":"Где найти курсы?"},{"kind":"p","text":"Все курсы ты найдёшь в разделе «Мои занятия» на платформе. Занятия проходят по понедельникам, средам и пятницам в 17:00 (МСК)."},{"kind":"h4","text":"Как отменить запись на курс?"},{"kind":"p","text":"Обратись в Службу заботы! Тебе там обязательно помогут: https://t.me/NeoFamilyHelp"},{"kind":"h4","text":"Когда начинаются занятия?"},{"kind":"p","text":"Занятия стартуют 15 сентября в 17:00 (МСК)! Расписание всегда можно посмотреть следующими способами:"},{"kind":"bullet","text":"• спросить у своего куратора;"},{"kind":"bullet","text":"• открыть раздел «Мои занятия» и нажать кнопку «Расписание» — там есть удобный календарь и красиво оформленные расписания по всем курсам."},{"kind":"h4","text":"Будут ли скрипты?"},{"kind":"p","text":"На вебинарах Андрей вместе с учениками пишет конспект прямо во время занятия."},{"kind":"p","text":"На видеоуроках Нурлан опирается на презентацию — её можно заранее распечатать и оформлять вместе с ним."},{"kind":"p","text":"К обоим из форматов также прикреплены скрипты :) Выбирай тот формат, который удобнее именно тебе!"},{"kind":"h4","text":"Что такое Умное повторение?"},{"kind":"p","text":"Умное повторение — это алгоритм интервального повторения. К каждому занятию добавляются карточки по теме, и твоя задача — каждый день заходить в раздел «Умное повторение» и нажимать кнопку «Повторить всё!». Алгоритм сам подберёт нужные карточки для повторения, а тебе останется только отвечать на них. Лучше всего уделять этому 15–30 минут утром, днём и вечером. Если проходить УП регулярно, материал будет запоминаться легко и надолго, а если делать это нерегулярно, карточки начнут копиться и превратятся в настоящий «снежный ком». Подробнее об этом можно прочитать в Инструкции."},{"kind":"h4","text":"Где взять конспекты?"},{"kind":"p","text":"Конспекты прикрепляются к соответствующим теоретическим вебинарам!"},{"kind":"h4","text":"Где домашка будет?"},{"kind":"p","text":"Домашка находится ниже основных вебинаров в карточке веба."},{"kind":"h4","text":"Чем отличаются вебинары от видеуроков? Надо и то и то смотреть?"},{"kind":"p","text":"Вебинары ведёт Андрей. Изначально онлайн, но остаётся запись"},{"kind":"p","text":"Они длятся дольше, поскольку преподаватель взаимодействует с чатом. При объяснении темы вместе с учениками составляет конспект"},{"kind":"p","text":"Видеоуроки ведёт Нурлан, изначально в записи. Длятся меньше, поскольку преподаватель не отвлекается на чат и опирается на презентацию при объяснении темы. Вебинары и видеоуроки равнозначны! Используй то, что больше нравится."},{"kind":"h4","text":"Как обратиться в службу заботы(поддержку)?"},{"kind":"p","text":"Привет! Если у тебя технические неполадки, финансовый вопрос или ты хочешь пожаловаться – обратись в Службу заботы! Тебе там обязательно помогут: https://t.me/NeoFamilyHelp"},{"kind":"p","text":"Еще можешь обращаться по любому вопросу в сообщения сообщества ВКонтакте по биологии: https://vk.com/im?sel=-184221081"},{"kind":"p","text":"Или WhatsApp:"},{"kind":"p","text":"https://api.whatsapp.com/message/HBDYSMGTIRWQM1?autoload=1&app_absent=0"},{"kind":"p","text":"Пиши по любому вопросу, даже если ты не по адресу – тебе все равно помогут или скажут, куда обратиться."},{"kind":"p","text":"Сюда перенаправляем, когда ребенок что-то спрашивает по вопросам оплаты курса, не может распечатать что-то, у него не открываются вебинары и т.д."},{"kind":"h4","text":"Чем отличаются кислые соли от средних?"},{"kind":"p","text":"На вопросы по другим предметам отвечать вы не обязаны. Мягко перенаправляйте в чат с методистами по химии/русскому, чтобы задали свои вопросы специалистам по предмету."},{"kind":"p","text":"Сменить предмет можно в верхнем меню на платформе."},{"kind":"h4","text":"Какие книжки/платформы можете посоветовать ?"},{"kind":"p","text":"Привет! Для полноценной подготовки к ЕГЭ материал, который даётся на наших курсах, будет более чем достаточным. ЕГЭ строится на школьных учебниках, которые мы каждый год изучаем и актуализируем инфу на вебинарах. Классика для ЕГЭ — учебник Теремова/Петросовой (10-11 класс, профильный уровень), Пасечник (10-11 класс) и сейчас всё чаще стали мелькать задания, вдохновленные учебником Дымшица. Остальные учебники и справочники (тот же трёхтомник Тейлор Грин Стаут) — хороший материал, но не совсем для формата ЕГЭ."},{"kind":"p","text":"Побольше решай наш банк заданий, не забывай про карточки умного повторения и делай все домашки — для сдачи на 90+ баллов этого хватит."},{"kind":"h4","text":"Как найти телеграм-канал неофэмили?"},{"kind":"p","text":"Открытый телеграм-канал по биологии: @biofamily_ege"},{"kind":"p","text":"Для попадания в закрытый телеграм-канал для учеников курса нужно под руководством куратора заполнить специальную форму. Вкратце: заполнить форму, убедиться, что в телеграме у тебя открыты номер телефона/ник, подать заявку в канал. После этого в течение суток тебя примут в него :)"},{"kind":"h4","text":"Почему у меня 400 карточек УП в день?"},{"kind":"p","text":"Делай Умное повторение каждый день. Возьмите это в привычку: 15 минут утром, 15 минут днем, 15 минут перед сном. Это очень эффективный способ запоминать большой объем информации, ты выйдешь на ЕГЭ супер-подкованными. Без регулярного повторения есть риск забыть что-то важное, с помощью Умного повторения этот риск нивелируется. Если проходить УП не каждый день (а, например, 3 раза в неделю), то будет копиться снежный ком из карточек, придется тратить очень много времени – ведь в течение курса колоды будут добавляться постоянно. Если повторять УП каждый день, мозг сделает всю работу за тебя. Мозгу очень нравится интервальное повторение “понемногу”. Он вознаградит тебя шикарной памятью."},{"kind":"p","text":"Ну и чем дальше курс, тем больше карточек — больше карточек для запоминания)"},{"kind":"h4","text":"Можно ли скачивать видео с платформы?"},{"kind":"p","text":"Нет, скачивать и скриншотить видео нельзя в целях сохранения авторских прав :("},{"kind":"h4","text":"Что такое кодовое слово?"},{"kind":"p","text":"Над вебинаром находится окошко для ввода кодового слова. Его преподаватель озвучивает на вебинаре (при этом он явно указывает на то, что говорит кодовое слово в данный момент). При вводе этого слова в окошко вебинар из пропущенных переходит в просмотренные, а тебе даются баллы в рейтинг."},{"kind":"p","text":"Если ты прослушал кодовое слово, можно нажать на кнопку “Отметить просмотренным”. Так вебинар тоже перейдет в просмотренные, однако бонусов не будет."},{"kind":"h4","text":"Какое кодовое слово к ___?"},{"kind":"p","text":"Привет! Если честно, я не знаю, у меня нет доступа к вебинарам. Оно должно было звучать на вебинаре :)"},{"kind":"h4","text":"Что лучше — умный справочник или конспекты?"},{"kind":"p","text":"PDF-конспекты к вебинарам."},{"kind":"p","text":"Мы рекомендуем пользоваться статьями Умного справочника только на начальном этапе, либо когда тема дается трудно. PDF-конспекты гораздо лучше подходят для изучения тем, именно на них строится образовательная программа. Статьи УС – лишь вспомогательный инструмент, который просто надо иметь в виду"},{"kind":"h4","text":"А мне проверят второе прохождение домашки?"},{"kind":"p","text":"Привет! Нет, второе прохождение не проверяется. Если у тебя есть какие-то вопросы по конкретным заданиям, ты можешь всегда их задать здесь, в чатике!"}]},{"title":"Расписание","blocks":[{"kind":"p","text":"Выходить на проверки домашних заданий можно в любое время, предварительно стоит записываться в табличку распределения (в какое время вы планируете выйти на смену). В течение проверки у тебя должно быть под рукой удобное устройство (компьютер/ноутбук, в крайнем случае планшет) со стабильным интернетом и сосредоточенность на проверках."},{"kind":"p","text":"Распределение в таблицу в 2026 остаётся актуальным. На него вы ориентируетесь тогда, когда в очереди меньше 80 домашек. К сожалению, на биологии такое бывает только в субботу. Табличка нужно в том числе для вашего личного удобства — чтобы не забыть, когда вы планировали выйти. Да и привыкли все уже."},{"kind":"p","text":"По факту в очереди всегда множество домашек, так что можно выходить проверять в любое время и не быть привязанным к табличке. Сидите на паре - проверили 2-3 штучки, потом в транспорте, потом еще дома минут на 40, пока есть свободное время. То есть, вы к времени не привязаны, просто выходите и проверяйте."},{"kind":"p","text":"Как обычно — в очереди 221 домашка. Да, домашки по биологии дети сдают непрерывно (для вас это только плюс)."},{"kind":"p","text":"Для тех, кто на чате важно выходить в соответствии с табличкой, ибо там ограниченное количество человек. Не успеваете/опаздываете — пишите старшему методисту, вам найдут замену. Желательно так не делать, конечно."},{"kind":"p","text":"Те, кто проверяет домашки, могут не уведомлять об опозданиях/ранних и поздних выходах. Ваши проверки — ваши деньги, ни к чему больше Вы не привязаны."},{"kind":"p","text":"Используем следующий коэффициент: 1 смена = 20 проверенных домашек = 2 часа. Если вы в течение дня проверили 35 домашек, где-то у себя вы фиксируете как 1,75 смены."},{"kind":"p","text":"Но на смены в любом случае необходимо записываться в табличку, чтобы старший методист прикидывал примерное число людей, которые планируют выйти!"},{"kind":"h3","text":"Как происходит распределение?"},{"kind":"p","text":"Распределение проходит каждое воскресенье в 4 потока, списки отправляются до 10:00 воскресенья. Потоки чередуются в течение месяца (4-3-2-1-4-3-2-1-…), чтобы все заняли +- равное количество смен."},{"kind":"p","text":"В 12:00 по московскому времени открывается доступ к табличке, первый поток вписывается. В 12:30 второй, в 13:00 третий, в 13:30 четвертый. Раньше своего времени заходить не надо, поскольку гугл-таблицы начинают сильно лагать."},{"kind":"p","text":"Каждый месяц формируется топ-25 методистов исходя из рейтинга. Эти методисты получают возможность всегда записываться в 1 потоке."},{"kind":"p","text":"Первые столбцы (окрашенные в фиолетовый) - методисты, которые отвечают в Чате. На эти смены можно вписываться самим, если вы ни разу не были на чате - для распределения на чат нужно получить одобрение старшего методиста."},{"kind":"h3","text":"Запись в ячейки"},{"kind":"p","text":"В свободные ячейки вы вписываете ТОЛЬКО свою фамилию. Если есть однофамилец - еще и инициалы"},{"kind":"p","text":"Из-за не самой лучшей синхронизации гугл-таблиц в момент времени случается так, что, сами того не зная, люди заменяют ваше имя в ячейке. В таком случае просто смотрим по истории ячейки и вписываемся рядом, благо, места есть. Если мест рядом нет, то вписывается тот, кто изначально записал себя раньше (это можно посмотреть по истории, кликнув на ячейку правой кнопкой мыши), обязательно предупредив об этом другого методиста, который его заменил!"},{"kind":"p","text":"Количество смен, которое вы можете занять - любое, в соответствии с вашей нагрузкой. В течение воскресенья можно редактировать, дополнительно себя вписывать (и выписывать тоже, но не злоупотребляйте), потом доступ закрывается."},{"kind":"h3","text":"Перенос смены, опоздания, перерывы, отмены"},{"kind":"p","text":"Только, если Вы записаны на чат."},{"kind":"h3","text":"Учёт смен"},{"kind":"p","text":"Вести учет количества ваших смен в течение недели вы должны следить сами, не полагаться только на табличку, тк там может быть не всё. Советую всем просто для себя выписывать, сколько каждую неделю у вас смен (и в какое время, если не лень), чтобы оно было под рукой. Это всё нужно для подсчета выплат. Используем следующий коэффициент: 1 смена = 20 проверенных домашек = 2 часа. Если вы в течение дня проверили 35 домашек, где-то у себя вы фиксируете как 1,75 смены."},{"kind":"p","text":"Особенно актуально для чата."},{"kind":"p","text":"Напоминаю: Статистика о каждом методисте, среднее время проверки, кол-во проверок за смену и тд отображается у старшего методиста на аккаунте. В случае нарушений условий договора его придется расторгнуть в одностороннем порядке."}]},{"title":"Вознаграждение","blocks":[{"kind":"h3","text":"Как рассчитывается выплата?"},{"kind":"p","text":"Выплата строится исходя из проверенных вами домашний заданий и отвеченных вопросов."},{"kind":"p","text":"Каждое проверенное задание - 5/6/7* рублей. Оно учитывается, если в ответе ребенок написал хотя бы один символ/прикрепил картинку (скрин ниже). Обычно в домашке 5-7 заданий второй части (около 35 р/домашку), но бывает и до 10-11."},{"kind":"p","text":"Каждое проверенное задание с нейропроверкой 2/3/4* рубля."},{"kind":"p","text":"При этом стоимость задания также зависит от того, какую оценку от старшего методиста вы получаете в конце месяца в обратной связи."},{"kind":"h4","text":"1. Минимальная стоимость заданий с нейропроверкой - 2р/задание. Данная стоимость"},{"kind":"p","text":"применима к тем, кто получит за проверки оценку 0-3 (много ошибок, игнорируете ошибки ИИ-модели, никак не меняете ее спорные формулировки). То есть, от ваших проверок складывается впечатление, что вы совершенно не понимаете как оценивать."},{"kind":"h4","text":"2. Средняя стоимость заданий с нейропроверкой - 3р/задание, она будет применяться"},{"kind":"p","text":"ко всем с оценкой 4-7. Это подавляющее большинство методистов - стабильные и хорошие проверки."},{"kind":"h4","text":"3. Повышенная стоимость заданий с нейропроверкой - 4р/задание. Она будет у всех"},{"kind":"p","text":"методистов с оценкой 8-10. Это качественные проверки, которые соблюдают все требования из регламента (см. раздел нейропроверка)."},{"kind":"p","text":"Отвеченное под домашкой сообщение - 2р. Это может быть как ответ на теоретический вопрос ребенка, так и обычное “пожалуйста” в ответ на “спасибо” (90% случаев)"},{"kind":"p","text":"В данном случае Методист Малика получит 6р за проверенное задание, а Методист Даша -2р за отвеченное сообщение"},{"kind":"p","text":"Отвеченное сообщение в чате - 9р. Если перед вашим сообщением ребенок написал несколько сообщений подряд — выплата идет за каждое из них."},{"kind":"p","text":"Каждое такое сообщение - 9р. То есть, методист, который ответил Елене в чате с методистом, получит 27р."},{"kind":"h3","text":"Высокий спрос"},{"kind":"p","text":"В период большого количества домашек требуется дополнительная ваша помощь. Если в очереди больше 80 домашек (а это почти всегда) вы можете выйти на любое время, которое вам позволяет нагрузка - хоть на полчаса, хоть на час, хоть на 3 часа. Цель -проверить как можно больше домашних заданий. Поскольку выплата зависит от вас и вашей скорости, выходить можно как угодно."},{"kind":"p","text":"Важно: если в очереди меньше 80 домашек (обычно это бывает только в субботу), вы выходите в соответствии с таблицей распределения."},{"kind":"h3","text":"В разработке: статистика методиста."},{"kind":"p","text":"Появится ориентировочно с начала апреля. Выглядеть она будет как-то так :)"},{"kind":"h3","text":"Дополнительная выплата"},{"kind":"p","text":"Топ-40 лучших методистов получают дополнительную выплату за качество, а топ-25 может распределяться в любом из потоков. Рейтинг рассчитывается исходя из следующих показателей:"},{"kind":"bullet","text":"• Проверки — качество ваших проверок. Сюда входит качество (отсутствие ошибок), внимательность, человечность (насколько легко ребенку понять ошибку из вашего объяснения), индивидуальный подход (отклонение от скриптов, комментарии от себя), скорость проверок и эстетическая составляющая. От 0 до 10, если вы получаете 0-2 балла — поднимается вопрос о продолжении сотрудничества с Вами."},{"kind":"bullet","text":"• Ответы под домашками — как Вы отвечаете на вопросы детей под домашками. Будь то ответы на теоретические вопросы или вопросы детей к вашим проверкам. От 0 до 2 баллов."},{"kind":"bullet","text":"• Чат — оценка вашей работы в чате. Понимаете ли Вы вопросы детей, насколько подробно/понятно им отвечаете. От 0 до 3 баллов."},{"kind":"bullet","text":"• Баллы за тесты — как хорошо вы пишите различные тестирования, которые отправляются методистам (где-то 1 раз в месяц). От 0 до 5 баллов."},{"kind":"bullet","text":"• Ошибки — ссылки на проверки, в которых у вас были допущены проверки. Когда старший методист присылает обратную связь, он их указывает — нужно отписаться детям в этих проверках."},{"kind":"p","text":"Пример: “Привет! Пересмотрела твою работу, забыла отметить — в этом задании не забывай …”."},{"kind":"bullet","text":"• Кол-во ошибок — число домашек, в которых Вами была допущена ошибка. За каждую ошибку снимается 0.5 балла."},{"kind":"bullet","text":"• Активность в беседе — помощь другим методистам по их вопросам, активность в теме “частые ошибки”. От 0 до 4 баллов."},{"kind":"bullet","text":"• Кол-во проверенных домашек — тут все просто, сколько ДЗ вы проверили за месяц. Для учета в рейтинге оно делится на 375. То есть, если за месяц у Вас вышло 1800 проверенных домашек — это 4,8 балла в рейтинге."},{"kind":"h4","text":"Топ-5 5 000"},{"kind":"h4","text":"6–15 3 000"},{"kind":"h4","text":"16–30 2 000"},{"kind":"h4","text":"31–40 1 000"},{"kind":"h3","text":"Как получать выплату?"},{"kind":"p","text":"Большинство методистов выбирают оказание услуг по самозанятости. Ознакомиться с особенностями данного вида можно в файле по ссылке: https://t.me/c/2279082428/2/100016"},{"kind":"p","text":"Если вы желаете сотрудничать по самозанятости, ознакамливайтесь с этим постом от Ксении (https://t.me/c/2279082428/2/131148) и заполняйте форму: https://forms.yandex.ru/u/698c490149363904ee236a2a"},{"kind":"p","text":"Если вы не желаете сотрудничать по самозанятости, хотите оформлять ГПХ/ИП — обращайтесь к Ксении (автору поста)"}]},{"title":"FAQ","blocks":[{"kind":"h4","text":"Как найти куратора?"},{"kind":"h4","text":"Как сменить куратора?"},{"kind":"p","text":"Чтобы сменить куратора, открой раздел «Мои занятия» и нажми на значок куратора. Там будет кнопка «Хочу к другому куратору» — кликай на неё."},{"kind":"p","text":"Не переживай и указывай настоящую причину: твой текущий куратор её не увидит."},{"kind":"h4","text":"Что делать если мне не написал куратор?"},{"kind":"p","text":"Если у тебя возникли сложности, обратись в техподдержку. Для этого нажми на значок с вопросительным знаком в правом нижнем углу платформы."},{"kind":"p","text":"Если значка нет, переходи по ссылке: t.me/NeoFamilyHelp."},{"kind":"h4","text":"Где найти курсы?"},{"kind":"p","text":"Все курсы ты найдёшь в разделе «Мои занятия» на платформе."},{"kind":"p","text":"Занятия проходят по понедельникам, средам и пятницам в 17:00 (МСК)."},{"kind":"h4","text":"Как отменить запись на курс?"},{"kind":"p","text":"Обратись в Службу заботы! Тебе там обязательно помогут: https://t.me/NeoFamilyHelp"},{"kind":"h4","text":"Когда начинаются занятия?"},{"kind":"p","text":"Занятия стартуют 15 сентября в 17:00 (МСК)! Расписание всегда можно посмотреть следующими способами:"},{"kind":"bullet","text":"• спросить у своего куратора;"},{"kind":"bullet","text":"• открыть раздел «Мои занятия» и нажать кнопку «Расписание» — там есть удобный календарь и красиво оформленные расписания по всем курсам."},{"kind":"h4","text":"Будут ли скрипты?"},{"kind":"p","text":"На вебинарах Андрей вместе с учениками пишет конспект прямо во время занятия."},{"kind":"p","text":"На видеоуроках Нурлан опирается на презентацию — её можно заранее распечатать и оформлять вместе с ним."},{"kind":"p","text":"К обоим из форматов также прикреплены скрипты :)"},{"kind":"p","text":"Выбирай тот формат, который удобнее именно тебе!"},{"kind":"h4","text":"Что такое Умное повторение?"},{"kind":"p","text":"Умное повторение — это алгоритм интервального повторения. К каждому занятию добавляются карточки по теме, и твоя задача — каждый день заходить в раздел «Умное повторение» и нажимать кнопку «Повторить всё!». Алгоритм сам подберёт нужные карточки для повторения, а тебе останется только отвечать на них. Лучше всего уделять этому 15–30 минут утром, днём и вечером. Если проходить УП регулярно, материал будет запоминаться легко и надолго, а если делать это нерегулярно, карточки начнут копиться и превратятся в настоящий «снежный ком». Подробнее об этом можно прочитать в Инструкции."},{"kind":"h4","text":"Где взять конспекты?"},{"kind":"p","text":"Конспекты прикрепляются к соответствующим теоретическим вебинарам!"},{"kind":"h4","text":"Где домашка будет?"},{"kind":"p","text":"Домашка находится ниже основных вебинаров в карточке веба."},{"kind":"h4","text":"Чем отличаются вебинары от видеуроков? Надо и то и то смотреть?"},{"kind":"p","text":"Вебинары ведёт Андрей. Изначально онлайн, но остаётся запись"},{"kind":"p","text":"Они длятся дольше, поскольку преподаватель взаимодействует с чатом. При объяснении темы вместе с учениками составляет конспект"},{"kind":"p","text":"Видеоуроки ведёт Нурлан, изначально в записи. Длятся меньше, поскольку преподаватель не отвлекается на чат и опирается на презентацию при объяснении темы. Вебинары и видеоуроки равнозначны! Используй то, что больше нравится."},{"kind":"h4","text":"На меня назначилась домашка, уже проверенная другим методистом. Что делать?"},{"kind":"p","text":"Это значит, что ученик задал вопрос, его сообщение последнее в диалоге. На него надо ответить в зависимости от контекста. Обратите внимание, что перед этим могли быть и другие методисты — вчитывайтесь в контекст диалога. Если там просто “спасибо” вопросов нет” — пишем что-нибудь в духе “отлично, появятся вопросы — задавай!”"},{"kind":"h4","text":"Ребёнок отправил домашку и задал вопрос под ней, как делать?"},{"kind":"p","text":"Отправляем ОТДЕЛЬНЫМИ сообщениями проверку домашки и ответ на вопрос. У детей страх больших сообщений, они могут просто проглядеть ответ. Поэтому отвечаем прям новым сообщением на вопрос, чтобы ребёнок видел, что его вопрос точно не остался без ответа (за исключением случаев, если его вопрос совпадает с единственной проверкой)."},{"kind":"h4","text":"Какое должно быть время проверки домашек?"},{"kind":"p","text":"Стараемся выдерживать не более 7 минут. Если получается быстрее — здорово, но, пожалуйста, качественно. Если больше (не повезло с домашкой, очень медленный интернет) — ну, бывает, главное чтоб это было не систематически"},{"kind":"h4","text":"Я не ответил на вопрос/забыл отправить проверку, меня убьют?"},{"kind":"p","text":"Нет, всякое бывает. Мы всегда на вашей стороне, формат непривычный и новый для всех. Пишите своему тимлиду, решим!"}]}];
  const NF_REG_SHORT = {"22":["Переменные: если пункт требует независимую и зависимую переменные, должны быть верно названы обе. Одной недостаточно.","Нулевая гипотеза: допускай равнозначные варианты «X не влияет на Y» и «Y не зависит от X»; важны смысл и конкретные величины.","Отрицательный контроль с инъекцией: нужно указать введение растворителя, а не просто отсутствие введения вещества.","В выводах и достоверности: требуй конкретные переменные, факторы и направление изменений. Общего «зависимость не установлена» недостаточно.","Синонимы и порядок ответа допустимы, если логика верна; противоречивые части ответа не засчитывай.","Общее: ошибка внутри самого элемента ключа означает, что этот элемент не засчитывается; дополнительный балл за неё не снимай. За отдельную биологическую ошибку в дополнительной информации регламент предписывает снять 1 балл.","Для линий 22–26 с нейропроверкой обязательно перепроверяй вывод ИИ: зачтённые/незачтённые пункты, разбалловку и снятие баллов. «+/−» округляется вверх; не пересылай сырой комментарий модели.","Конкретная разбалловка — только по критериям текущего задания; краткая памятка не заменяет ключ и полный регламент."],"23":["Учитывай смысл и допустимые синонимы, а не только дословное совпадение с ключом.","Причинно-следственная связь и конкретика должны быть выражены явно: намёка без объяснения может быть недостаточно.","Альтернативы через «ИЛИ» — варианты одного элемента, а не дополнительные баллы.","Не начисляй баллы механически за совпавшие слова: сопоставь ответ с вопросом, ключом и логикой.","Общее: ошибка внутри самого элемента ключа означает, что этот элемент не засчитывается; дополнительный балл за неё не снимай. За отдельную биологическую ошибку в дополнительной информации регламент предписывает снять 1 балл.","Для линий 22–26 с нейропроверкой обязательно перепроверяй вывод ИИ: зачтённые/незачтённые пункты, разбалловку и снятие баллов. «+/−» округляется вверх; не пересылай сырой комментарий модели.","Конкретная разбалловка — только по критериям текущего задания; краткая памятка не заменяет ключ и полный регламент."],"24":["Проверяй соответствие конкретному изображению, объектам и вопросу; не засчитывай расплывчатые обозначения.","Следи, чтобы ученик действительно назвал требуемые структуры/характеристики и не перепутал их.","Разбалловка зависит от ключа задания — сопоставляй число зачтённых элементов с критериями.","Общее: ошибка внутри самого элемента ключа означает, что этот элемент не засчитывается; дополнительный балл за неё не снимай. За отдельную биологическую ошибку в дополнительной информации регламент предписывает снять 1 балл.","Для линий 22–26 с нейропроверкой обязательно перепроверяй вывод ИИ: зачтённые/незачтённые пункты, разбалловку и снятие баллов. «+/−» округляется вверх; не пересылай сырой комментарий модели.","Конкретная разбалловка — только по критериям текущего задания; краткая памятка не заменяет ключ и полный регламент."],"25":["Допускаются корректные смысловые синонимы, но должны быть названы все необходимые признаки элемента.","Проверяй логическую связь объяснения с условием — верный термин без нужной связи может не раскрывать пункт.","Не засчитывай биологически неверные утверждения, даже если отдельные слова совпадают с ключом.","Общее: ошибка внутри самого элемента ключа означает, что этот элемент не засчитывается; дополнительный балл за неё не снимай. За отдельную биологическую ошибку в дополнительной информации регламент предписывает снять 1 балл.","Для линий 22–26 с нейропроверкой обязательно перепроверяй вывод ИИ: зачтённые/незачтённые пункты, разбалловку и снятие баллов. «+/−» округляется вверх; не пересылай сырой комментарий модели.","Конкретная разбалловка — только по критериям текущего задания; краткая памятка не заменяет ключ и полный регламент."],"26":["Ответ должен не просто называть факт, но и объяснять причинно-следственную связь, когда этого требует условие.","Достаточно равнозначной формулировки, необязательно повторять текст ключа.","Разделяй отсутствие элемента ключа и дополнительную биологическую ошибку — правила вычета разные.","Общее: ошибка внутри самого элемента ключа означает, что этот элемент не засчитывается; дополнительный балл за неё не снимай. За отдельную биологическую ошибку в дополнительной информации регламент предписывает снять 1 балл.","Для линий 22–26 с нейропроверкой обязательно перепроверяй вывод ИИ: зачтённые/незачтённые пункты, разбалловку и снятие баллов. «+/−» округляется вверх; не пересылай сырой комментарий модели.","Конкретная разбалловка — только по критериям текущего задания; краткая памятка не заменяет ключ и полный регламент."],"27":["В биосинтезе белка проверяй направление, матричность, комплементарность, последовательности и корректность всех этапов решения по конкретному ключу.","В задачах Харди—Вайнберга проверяй, что частоты аллелей и генотипов не смешаны; учитывай ход вычислений и округление.","В филогенетических деревьях сверяй интерпретацию узлов, ветвей и сделанные выводы с данными задания.","Для каждого типа задачи — своя разбалловка. Не применяй единый шаблон «по числу пунктов».","Общее: ошибка внутри самого элемента ключа означает, что этот элемент не засчитывается; дополнительный балл за неё не снимай. За отдельную биологическую ошибку в дополнительной информации регламент предписывает снять 1 балл.","Для линий 22–26 с нейропроверкой обязательно перепроверяй вывод ИИ: зачтённые/незачтённые пункты, разбалловку и снятие баллов. «+/−» округляется вверх; не пересылай сырой комментарий модели.","Конкретная разбалловка — только по критериям текущего задания; краткая памятка не заменяет ключ и полный регламент."],"28":["Сверяй схему скрещивания и обозначения генов/аллелей с условием.","Проверяй гаметы, генотипы, фенотипы, вероятности и пояснения в рамках конкретного задания.","При арифметической или генетической ошибке оценивай по указанным критериям, не по общему числу написанных строк.","Общее: ошибка внутри самого элемента ключа означает, что этот элемент не засчитывается; дополнительный балл за неё не снимай. За отдельную биологическую ошибку в дополнительной информации регламент предписывает снять 1 балл.","Для линий 22–26 с нейропроверкой обязательно перепроверяй вывод ИИ: зачтённые/незачтённые пункты, разбалловку и снятие баллов. «+/−» округляется вверх; не пересылай сырой комментарий модели.","Конкретная разбалловка — только по критериям текущего задания; краткая памятка не заменяет ключ и полный регламент."]};
  const NF_REG_LINE_SECTIONS = {"22": 5, "23": 6, "24": 7, "25": 6, "26": 6, "27": 8, "28": 11};
  let nfRegOpen = false;
  let nfRegSelected = 0;
  function nfRegText(tag, text, css='') {
    const x=document.createElement(tag);x.textContent=text;if(css)x.style.cssText=css;return x;
  }
  function nfRegModal(sectionIndex=0, query='') {
    nfRegSelected=sectionIndex;
    document.getElementById('nf-reg-overlay')?.remove();
    nfRegOpen=true;
    const overlay=nfRegText('div','');overlay.id='nf-reg-overlay';
    overlay.style.cssText='position:fixed;inset:0;z-index:2147483640;background:rgba(24,20,39,.62);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
    const box=nfRegText('section','');box.style.cssText='width:min(1100px,97vw);height:min(890px,96vh);background:#fff;border-radius:20px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 65px #0004;color:#302a3e;font-family:Nunito,system-ui,sans-serif;';
    const header=nfRegText('div','');header.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:10px;padding:18px 22px;background:#f4f1fb;';
    const title=nfRegText('strong','📖 Регламент методистов · Биология','font-size:18px;letter-spacing:-.02em;');
    const close=nfRegText('button','✕');close.type='button';close.style.cssText='border:0;background:#302a3e;color:#fff;border-radius:9px;padding:8px 14px;cursor:pointer;font-size:17px;';
    const shut=()=>{overlay.remove();nfRegOpen=false;};close.onclick=shut;overlay.addEventListener('click',e=>{if(e.target===overlay)shut();});
    header.append(title,close);
    const notice=nfRegText('div','Текстовая версия приложенного регламента. Схемы и скриншоты остаются в исходном PDF; для спорных случаев сверяйся с оригиналом.','padding:9px 22px;background:#fdfbff;color:#736d7f;font-size:12px;line-height:1.5;border-bottom:1px solid #eee;');
    const finder=nfRegText('input','');finder.type='search';finder.placeholder='Поиск по всему регламенту';finder.value=query;finder.style.cssText='margin:13px 21px;border:1px solid #ddd8e8;border-radius:11px;padding:11px 14px;font:14px Nunito,system-ui,sans-serif;';
    const body=nfRegText('div','');body.style.cssText='display:grid;grid-template-columns:minmax(170px,240px) minmax(0,1fr);min-height:0;flex:1;';
    const menu=nfRegText('nav','');menu.style.cssText='overflow-y:auto;padding:12px;border-right:1px solid #eeebf3;background:#fcfbff;';
    const article=nfRegText('article','');article.style.cssText='overflow-y:auto;padding:24px clamp(16px,3vw,42px) 55px;font:15px/1.75 Nunito,system-ui,sans-serif;overflow-wrap:anywhere;';
    function matches(s,term){return s.title.toLocaleLowerCase('ru').includes(term)||s.blocks.some(x=>x.text.toLocaleLowerCase('ru').includes(term));}
    function drawMenu(){
      menu.replaceChildren();const q=finder.value.trim().toLocaleLowerCase('ru');
      NF_REG_SECTIONS.forEach((s,i)=>{
        if(q&&!matches(s,q))return;
        const item=nfRegText('button',s.title);item.type='button';
        item.style.cssText='width:100%;display:block;text-align:left;border:0;padding:11px 12px;margin:2px 0;border-radius:9px;cursor:pointer;font:700 13px/1.5 Nunito,system-ui,sans-serif;background:'+(i===nfRegSelected?'#e9e2f8':'transparent')+';color:#302a3e;';
        item.onclick=()=>{nfRegSelected=i;drawMenu();drawArticle();};menu.appendChild(item);
      });
    }
    function drawArticle(){
      article.replaceChildren();const sec=NF_REG_SECTIONS[nfRegSelected];if(!sec)return;
      article.appendChild(nfRegText('h1',sec.title,'font-size:26px;line-height:1.32;margin:0 0 25px;font-weight:850;color:#302a3e;'));
      const q=finder.value.trim().toLocaleLowerCase('ru');
      let blocks=sec.blocks;
      if(q&&!sec.title.toLocaleLowerCase('ru').includes(q)){
        // Показать найденные фрагменты с предшествующим контекстным заголовком.
        const included=new Set();blocks.forEach((b,i)=>{if(b.text.toLocaleLowerCase('ru').includes(q)){included.add(i);for(let j=i-1;j>=0;j--)if(/^h[234]$/.test(blocks[j].kind)){included.add(j);break;}}});
        blocks=blocks.filter((_,i)=>included.has(i));
      }
      // Примеры оформляются единой карточкой, включая «Ключ», «Ответ ребёнка» и «Вердикт».
      // Работаем с текстовыми блоками, ничего в исходном содержании не изменяем.
      let exampleBox=null;
      let verdictTextSeen=false;
      function startExample(){
        exampleBox=nfRegText('section','');
        exampleBox.className='nf-reg-example-card';
        exampleBox.style.cssText='background:#f7f5fc;border:1px solid #e7e0f2;border-left:4px solid #a998d5;border-radius:15px;padding:17px 20px 9px;margin:20px 0 24px;box-shadow:0 3px 12px rgba(55,38,82,.045);';
        article.appendChild(exampleBox);
        verdictTextSeen=false;
      }
      const isExampleStart=b=>/^(?:пример(?:\s+\d+)?|разбор примера)\s*:/i.test(b.text.trim());
      const isInsideLabel=b=>b.kind==='label' && /^(?:пример(?:\s+\d+)?|ключ|ответ (?:ребёнка|ребенка|ученика)|вердикт|пояснение|комментарий)\s*:/i.test(b.text.trim());
      for(const block of blocks){
        const kind=block.kind;
        const isHeading=/^h[234]$/.test(kind);
        // Карточка заканчивается на новом разделе/примере либо после вердикта.
        if(exampleBox && (isHeading || isExampleStart(block) ||
           (kind==='label' && !isInsideLabel(block)) ||
           (verdictTextSeen && kind!=='p'))) {
          exampleBox=null;
          verdictTextSeen=false;
        }
        if(isExampleStart(block))startExample();
        const tag=kind==='h2'?'h2':kind==='h3'?'h3':kind==='h4'?'h4':kind==='bullet'||kind==='number'?'p':kind==='label'?'strong':'p';
        const styles={h2:'font-size:22px;line-height:1.4;font-weight:850;color:#b83f53;margin:32px 0 12px;border-bottom:1px solid #f2dbe0;padding-bottom:7px;',h3:'font-size:19px;line-height:1.42;font-weight:850;color:#51438b;margin:26px 0 10px;',h4:'font-size:17px;line-height:1.45;font-weight:800;color:#383048;margin:23px 0 8px;',label:'display:block;font-weight:800;margin:13px 0 5px;font-size:14px;color:#574a68;',bullet:'margin:7px 0 7px 17px;padding-left:6px;',number:'margin:8px 0 8px 10px;',p:'margin:0 0 13px;white-space:normal;'};
        const node=nfRegText(tag,block.text,styles[kind]||styles.p);
        if(exampleBox && isExampleStart(block))node.style.cssText='display:block;font-size:16px;font-weight:850;color:#63528d;margin:0 0 13px;';
        if(exampleBox && /^вердикт\s*:/i.test(block.text.trim()) && kind==='label'){
          node.style.cssText='display:block;font-size:14px;font-weight:850;color:#564277;margin:13px 0 5px;';
          verdictTextSeen=false;
        } else if(exampleBox && kind==='p' && exampleBox.querySelector('strong:last-of-type')?.textContent?.match(/^Вердикт\s*:/i)) {
          verdictTextSeen=true;
        }
        if(kind==='bullet')node.style.listStyle='disc';
        (exampleBox||article).appendChild(node);
      }
      if(!blocks.length)article.appendChild(nfRegText('p','В этом разделе совпадений не найдено.'));
      article.scrollTop=0;
    }
    finder.addEventListener('input',()=>{
      const q=finder.value.trim().toLocaleLowerCase('ru');
      if(q&&!matches(NF_REG_SECTIONS[nfRegSelected],q)){
        const next=NF_REG_SECTIONS.findIndex(s=>matches(s,q));if(next>=0)nfRegSelected=next;
      }
      drawMenu();drawArticle();
    });
    body.append(menu,article);box.append(header,notice,finder,body);overlay.appendChild(box);document.body.appendChild(overlay);
    drawMenu();drawArticle();
  }
  function nfRegLine(card) {
    if(card.querySelector(':scope .nf-reg-quick'))return;
    const region=card.querySelector('[role="region"]');if(!region)return;
    // Определяем линию только по явной подписи в карточке, без угадывания по номеру задачи.
    const elLine=[...card.querySelectorAll('div,span')].find(x=>x.children.length===0 && /^(?:линия\s*\d+|\d+\s*линия)$/i.test(x.textContent.trim()));
    const m=elLine?.textContent.match(/\d+/);const line=m?.[0];if(!NF_REG_SHORT[line])return;
    const anchor=card.querySelector('.nf-view-row')||card.querySelector('.nf-copy-btn');if(!anchor)return;
    const wrap=nfRegText('div','');wrap.className='nf-reg-quick';wrap.style.cssText='margin:7px 0;align-self:flex-start;max-width:100%;';
    const btn=nfRegText('button','📖 Памятка · линия '+line+' ▾');btn.type='button';btn.style.cssText='padding:8px 12px;border:1px solid #b5a2dc;background:#f5f1fe;color:#3f326a;border-radius:11px;font:700 12px Comfortaa,system-ui,sans-serif;cursor:pointer;';
    const details=nfRegText('div','');details.hidden=true;details.style.cssText='margin-top:7px;padding:13px 16px;max-width:660px;border:1px solid #ded6ee;border-radius:12px;background:#fcfaff;font:13px/1.6 system-ui,sans-serif;';
    details.appendChild(nfRegText('strong','Коротко о проверке · линия '+line));
    const list=nfRegText('ol','');list.style.cssText='padding-left:20px;margin:7px 0 11px;';
    NF_REG_SHORT[line].forEach(v=>list.appendChild(nfRegText('li',v,'margin-bottom:6px;')));
    details.appendChild(list);
    const more=nfRegText('button','Читать полный регламент →');more.type='button';more.style.cssText='background:transparent;border:0;color:#6552aa;font-weight:700;cursor:pointer;padding:5px 0;';
    more.onclick=e=>{e.stopPropagation();nfRegModal(NF_REG_LINE_SECTIONS[line]||4);};
    details.appendChild(more);
    btn.onclick=e=>{e.stopPropagation();details.hidden=!details.hidden;btn.textContent='📖 Памятка · линия '+line+(details.hidden?' ▾':' ▴');};
    wrap.append(btn,details);anchor.after(wrap);
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
      a.onclick=()=>nfRegModal(0);
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
    const title=document.querySelector('main h1');
    if(title && /домашк/i.test(title.textContent) && !document.getElementById('nf-reg-top-button')) {
      const b=nfRegText('button','📖 Регламент');b.id='nf-reg-top-button';b.type='button';b.style.cssText='border:0;border-radius:13px;background:#e9e4f4;color:#302a3e;padding:11px 14px;font:700 12px Comfortaa,system-ui,sans-serif;cursor:pointer;margin-left:12px;';
      b.onclick=()=>nfRegModal(0);title.after(b);
    }
    document.querySelectorAll('[data-task-id]').forEach(nfRegLine);
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
  function ncCfg() { return jsonLoad(NC_CFG_KEY, {url:NC_SCHOOL_URL,key:'',enabled:false}); }
  function ncHttp(url, payload) {
    return new Promise((resolve, reject) => GM_xmlhttpRequest({
      method:'POST', url, headers:{'Content-Type':'text/plain;charset=utf-8'},
      data:JSON.stringify(payload), timeout:20000,
      onload:r => {
        try { const j=JSON.parse(r.responseText); if(j.ok) resolve(j); else reject(new Error(j.error||'API_ERROR')); }
        catch(e){reject(new Error('Не удалось прочитать ответ сервера: '+e.message));}
      }, onerror:()=>reject(new Error('Сетевая ошибка')), ontimeout:()=>reject(new Error('Таймаут'))
    }));
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
    // Send only the last 45 calendar days (including today), not 45 arbitrary entries.
    const now = new Date();
    const dateISO = d => [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
    const end = dateISO(now);
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate()-44);
    const start = dateISO(cutoff);
    return [...m.values()].filter(x=>x.date>=start && x.date<=end)
      .sort((a,b)=>a.date.localeCompare(b.date))
      .map(x=>({...x,money:Math.round(x.money*100)/100}));
  }
  async function ncSync(manual=false) {
    const cfg=ncCfg();
    if(!cfg.enabled || !cfg.key || ncBusy) return;
    ncBusy=true;
    try { await ncHttp(NC_SCHOOL_URL,{action:'neocheck_sync_v1',key:cfg.key,days:ncDaily()});
      if(manual) toast('✅ NeoCheck: статистика отправлена');
    } catch(e) { console.warn('[NeoCheck Telegram]',e.message); if(manual) toast('Telegram: '+e.message,true); }
    finally {ncBusy=false;}
  }
  function nfTgInject() {
    if(document.getElementById('nf-nc-telegram')) return;
    const b=el('button','position:fixed;right:12px;bottom:12px;z-index:10000;padding:8px 12px;border:1px solid #6b5cff;border-radius:12px;background:#fff;color:#4a3fd6;font:bold 12px sans-serif;cursor:pointer;',
      {id:'nf-nc-telegram',type:'button',textContent:'🔗 Telegram'});
    b.onclick=()=>{
      const old=ncCfg();
      if(!old.key && confirm('Открыть школьного Telegram-бота для команды /nc_token?')) {
        window.open(NC_BOT_URL, '_blank', 'noopener,noreferrer');
      }
      const key=prompt('Личный ключ из /nc_token в @MetodistNotifications_bot. Не отправляйте его другим людям:',old.key||'');
      if(key===null)return;
      if(key.trim().length<80){toast('Неверный ключ',true);return;}
      const enabled=confirm('Включить передачу личной статистики школе? Синхронизация при подключении и затем раз в 3 часа, пока открыт NeoFamily. Отмена — отключить передачу.');
      jsonSave(NC_CFG_KEY,{url:NC_SCHOOL_URL,key:key.trim(),enabled});
      toast(enabled?'Передача включена':'Передача отключена');
      if(enabled)ncSync(true);
    };
    document.body.appendChild(b);
  }
  setInterval(()=>ncSync(false),NC_SYNC_INTERVAL_MS);

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
  }

  let timer;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(inject, 300);
  }).observe(document.body, { childList: true, subtree: true });

  inject();
})();
