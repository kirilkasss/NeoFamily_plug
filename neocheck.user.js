// ==UserScript==
// @name         NeoCheck V3
// @namespace    neofamily-copy-for-check
// @version      3
// @updateURL    https://raw.githubusercontent.com/kirilkasss/NeoFamily_plug/main/neocheck.user.js
// @downloadURL  https://raw.githubusercontent.com/kirilkasss/NeoFamily_plug/main/neocheck.user.js
// @description  1) Копирование задания и ключа, сканер/лупа фото, режим «ключ рядом». 2) Шаблоны ответов и вложения. 3) Подсчёт заданий и выплат с гибким периодом, точным переключением ИИ/обычная и облачным восстановлением. 4) Личный график смен и быстрый регламент.
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
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ======================================================================
  //  ЧАСТЬ 1. Копирование задания для проверки
  // ======================================================================

  // Эта строка добавляется в начало копируемого текста. Можно поменять или оставить пустой ''.
  const PREFIX = 'Проверь по скиллу ege-bio-check.';
  const NF_SCRIPT_VERSION = (typeof GM_info !== 'undefined' && GM_info && GM_info.script && GM_info.script.version) ? String(GM_info.script.version) : '1.83';
  const NF_SCRIPT_UPDATE_URL = 'https://raw.githubusercontent.com/kirilkasss/NeoFamily_plug/main/neocheck.user.js';

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
    const m = d && d.id.match(/^attempt-(.+)-dialogue$/);
    if (m) return m[1];
    const u = location.pathname.match(/\/attempts?\/([^/?#]+)/i);
    return u ? u[1] : location.pathname;
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
    const answerBox = (label.parentElement && (label.parentElement.querySelector(DETAIL) || label.nextElementSibling || label.parentElement)) || null;
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
    // Умножитель берётся ТОЛЬКО из самой записи (зафиксированный в момент проверки работы).
    // Изменение ползунка коэффициента влияет только на новые проверки и НЕ меняет прошлые суммы.
    const mult = (r.multiplier !== undefined && Number(r.multiplier) >= 1) ? Number(r.multiplier) : 1;
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
  const fmtDateRu = iso => {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? (m[3] + '.' + m[2] + '.' + m[1]) : String(iso || '');
  };
  const defaultPayoutFrom = (now = new Date()) => {
    const today = dayKey(now);
    return (today >= '2026-11-10' && today <= '2026-11-25') ? '2026-11-10' : today;
  };
  function inPayoutPeriod(r, st) {
    if (!r || !r.date) return false;
    const from = st.payoutFrom || '';
    const to = st.payoutTo || '';
    const resetTs = Number(st.payoutResetTs) || 0;
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    if (resetTs > 0 && from && r.date === from && Number(r.ts || 0) < resetTs) return false;
    return true;
  }
  function periodStats(records, st, now) {
    now = now || new Date();
    const t = dayKey(now), w = weekStartKey(now), m = t.slice(0, 7);
    const resetTs = Number(st.payoutResetTs) || 0;
    const resetIsToday = resetTs > 0 && st.payoutFrom === t;
    const todayRecs = records.filter(r => r.date === t);
    const todayActiveRecs = resetIsToday ? todayRecs.filter(r => Number(r.ts || 0) >= resetTs) : todayRecs;
    return {
      today: sumRecords(todayRecs, st),
      todayActive: sumRecords(todayActiveRecs, st),
      week: sumRecords(records.filter(r => r.date >= w && r.date <= t), st),
      month: sumRecords(records.filter(r => r.date.slice(0, 7) === m), st),
      payout: sumRecords(records.filter(r => inPayoutPeriod(r, st)), st),
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

  function normalizeRecordList(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    const workIdx = new Map();
    const msgIds = new Set();

    for (const raw of list) {
      if (!raw || !raw.date) continue;
      const r = { ...raw };
      const kind = r.kind || 'work';
      r.kind = kind;
      r.ts = Number(r.ts) || Date.now();
      r.neuro = Math.max(0, Math.round(Number(r.neuro) || 0));
      r.regular = Math.max(0, Math.round(Number(r.regular) || 0));
      r.msgs = Math.max(0, Math.round(Number(r.msgs) || 0));
      r.chatMsgs = Math.max(0, Math.round(Number(r.chatMsgs) || 0));
      if (r.multiplier !== undefined) {
        const mv = Number(r.multiplier);
        r.multiplier = Number.isFinite(mv) && mv >= 1 ? Math.min(3, Math.round(mv * 2) / 2) : 1;
      }

      if (kind === 'work') {
        const wid = String(r.id || '').trim();
        if (wid && workIdx.has(wid)) {
          // Убираем случайные дубли одной и той же работы: берём более актуальное изменение, никогда не суммируем поверх!
          const idx = workIdx.get(wid);
          const prev = out[idx];
          const prevVer = Number(prev.updatedAt || prev.ts || 0);
          const curVer = Number(r.updatedAt || r.ts || 0);
          const unionIds = [...new Set((Array.isArray(prev.taskIds) ? prev.taskIds : []).concat(Array.isArray(r.taskIds) ? r.taskIds : []))];
          const chosen = curVer >= prevVer ? { ...r } : { ...prev };
          if (unionIds.length) {
            chosen.taskIds = unionIds;
            const tot = Number(chosen.neuro) + Number(chosen.regular);
            if (tot < unionIds.length) {
              if (Number(chosen.neuro) >= Number(chosen.regular)) chosen.neuro = unionIds.length;
              else chosen.regular = unionIds.length;
            }
          }
          out[idx] = chosen;
          continue;
        }
        if (wid) workIdx.set(wid, out.length);
        out.push(r);
      } else {
        const mid = String(r.id || '').trim();
        if (mid && mid !== 'manual' && (mid.startsWith('chat:') || mid.startsWith('m:') || mid.startsWith('chat-dom:'))) {
          if (msgIds.has(mid)) continue;
          msgIds.add(mid);
        }
        out.push(r);
      }
    }
    return out;
  }

  function normalizePrevPeriods(list) {
    const byId = new Map();
    for (const p of (Array.isArray(list) ? list : [])) {
      if (!p || typeof p !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(String(p.from || ''))) continue;
      const id = String(p.id || ('per_' + (Number(p.closedAt) || 0) + '_' + p.from));
      byId.set(id, {
        id,
        from: String(p.from),
        to: /^\d{4}-\d{2}-\d{2}$/.test(String(p.to || '')) ? String(p.to) : '',
        resetTs: Number(p.resetTs) > 0 ? Number(p.resetTs) : 0,
        closedAt: Number(p.closedAt) > 0 ? Number(p.closedAt) : 0,
        reason: String(p.reason || 'reset'),
        works: Number(p.works) || 0,
        neuro: Number(p.neuro) || 0,
        regular: Number(p.regular) || 0,
        msgs: Number(p.msgs) || 0,
        chatMsgs: Number(p.chatMsgs) || 0,
        money: Math.round((Number(p.money) || 0) * 100) / 100,
        tasksSummary: String(p.tasksSummary || ''),
        msgsSummary: String(p.msgsSummary || '')
      });
    }
    return [...byId.values()].sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0)).slice(0, 10);
  }

  function loadStats() {
    let s = jsonLoad(STAT_KEY, null);
    let dirtyPeriod = false;
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s.payoutFrom || ''))) {
      s.payoutFrom = defaultPayoutFrom();
      dirtyPeriod = true;
    }
    s.payoutTo = /^\d{4}-\d{2}-\d{2}$/.test(String(s.payoutTo || '')) ? String(s.payoutTo) : '';
    s.payoutResetTs = Number(s.payoutResetTs) > 0 ? Number(s.payoutResetTs) : 0;
    s.prevPeriods = normalizePrevPeriods(s.prevPeriods);
    s.rev = Number(s.rev) > 0 ? Number(s.rev) : 0;
    s.cloudKnownRev = Number(s.cloudKnownRev) > 0 ? Number(s.cloudKnownRev) : 0;
    s.lastCloudSyncAt = Number(s.lastCloudSyncAt) > 0 ? Number(s.lastCloudSyncAt) : 0;
    const r = s.rates || {};
    const okList = a => Array.isArray(a) && a.length === 3 && a.every(x => Number(x) >= 0);
    s.rates = {
      regular: okList(r.regular) ? r.regular.map(Number) : DEF_RATES.regular.slice(),
      neuro: okList(r.neuro) ? r.neuro.map(Number) : DEF_RATES.neuro.slice(),
      msg: r.msg === undefined || !(Number(r.msg) >= 0) ? DEF_RATES.msg : Number(r.msg),
      chatMsg: r.chatMsg === undefined || !(Number(r.chatMsg) >= 0) ? DEF_RATES.chatMsg : Number(r.chatMsg),
      multiplier: r.multiplier === undefined || !Number.isFinite(Number(r.multiplier)) ? DEF_RATES.multiplier : Math.min(3, Math.max(1, Math.round(Number(r.multiplier) * 2) / 2))
    };
    s.records = normalizeRecordList(s.records);
    if (dirtyPeriod) jsonSave(STAT_KEY, s);
    return s;
  }
  function saveStats(o, opts = {}) {
    o.records = normalizeRecordList(o.records);
    o.prevPeriods = normalizePrevPeriods(o.prevPeriods);
    o.rev = Math.max(Date.now(), (Number(o.rev) || 0) + 1);
    const ok = jsonSave(STAT_KEY, o);
    if (ok && !opts.skipCloud && typeof nfCloudSchedulePush === 'function') {
      nfCloudSchedulePush(opts.immediateCloud ? 400 : 4000);
    }
    return ok;
  }

  function loadSeen() {
    const s = jsonLoad(SEEN_KEY, {});
    return Array.isArray(s) ? {} : s;
  }

  const EMPTY_ANSWER_RE = /^(?:ответ\s*ученика\s*:?|нет\s*ответа|ответ\s*(?:отсутствует|не\s*дан|не\s*найден|не\s*приложен|не\s*предоставлен)|без\s*ответа|не\s*решено|не\s*выполнено)$/i;

  function cleanAnswerText(raw) {
    return String(raw || '')
      .replace(/[\u00a0\u200b-\u200d\ufeff]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findAnswerLabel(region) {
    if (!region) return null;
    const exact = [...region.querySelectorAll('span, div, p, strong, label, h1, h2, h3, h4, h5, h6')]
      .filter(el => /^Ответ ученика\s*:?$/i.test(cleanAnswerText(el.textContent)));
    if (exact.length) return exact[exact.length - 1];
    return [...region.querySelectorAll('span')]
      .find(s => s.children.length === 0 && /Ответ ученика/i.test(s.textContent || '')) || null;
  }

  function elementHasAnswerMedia(root) {
    if (!root) return false;
    for (const img of root.querySelectorAll('img')) {
      const alt = (img.getAttribute('alt') || '').toLowerCase();
      const src = (img.getAttribute('src') || '').toLowerCase();
      if (alt.includes('avatar') || alt.includes('аватар') || src.startsWith('data:image/svg+xml')) continue;
      return true;
    }
    if (root.querySelector('video, audio, canvas')) return true;
    for (const a of root.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || '';
      if (href && !href.startsWith('#')) return true;
    }
    return false;
  }

  // Есть ли у задания реальный ответ ученика: хотя бы 1 видимый символ (даже «.»), картинка или файл.
  // Пустые блоки (без текста, только заголовок «Ответ ученика» или заглушка «Нет ответа») возвращают false.
  function hasStudentAnswer(card) {
    const region = card.querySelector('[role="region"]');
    if (!region) return false;
    const label = findAnswerLabel(region);
    if (!label || !label.parentElement) return false;

    const parent = label.parentElement;
    const isKeySection = el => /Элементы\s+(?:ключа|ответа)|Ключ\s+ответа|Перевод\s+элементов/i.test(el.textContent || '');
    const isExcluded = el => !el || el === label || isKeySection(el) || !!(el.closest && el.closest('button, [role="button"]'));

    const candidates = [];
    let sib = label.nextElementSibling;
    while (sib) {
      if (isKeySection(sib)) break;
      if (!isExcluded(sib)) candidates.push(sib);
      sib = sib.nextElementSibling;
    }
    const detailAfter = [...parent.querySelectorAll(DETAIL)].find(d =>
      !d.contains(label)
      && !isExcluded(d)
      && (typeof label.compareDocumentPosition !== 'function' || Boolean(label.compareDocumentPosition(d) & 4))
    );
    if (detailAfter && !candidates.includes(detailAfter)) candidates.unshift(detailAfter);

    for (const box of candidates) {
      if (elementHasAnswerMedia(box)) return true;
      const clone = box.cloneNode ? box.cloneNode(true) : null;
      if (clone && clone.querySelectorAll) {
        clone.querySelectorAll('button, [role="button"], svg, style, script').forEach(n => n.remove());
      }
      const txt = cleanAnswerText((clone || box).textContent).replace(/^Ответ ученика\s*:?\s*/i, '').trim();
      if (txt.length > 0 && !EMPTY_ANSWER_RE.test(txt)) return true;
    }

    // Прямой текст после label внутри общего родителя без обёрточного элемента
    let afterLabel = false;
    for (const node of (parent.childNodes || [])) {
      if (node === label) { afterLabel = true; continue; }
      if (!afterLabel) continue;
      if (node.nodeType === 3) {
        const txt = cleanAnswerText(node.nodeValue);
        if (txt.length > 0 && !EMPTY_ANSWER_RE.test(txt)) return true;
      }
    }
    return false;
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

  // Запоминаем задания, в которых есть ответ ученика (и снимаем ложную отметку, если раскрытый блок пуст).
  function trackAnswers() {
    const aid = attemptId();
    const db = loadSeen();
    const cur = db[aid] || (db[aid] = { ts: Date.now(), ids: [] });
    cur.ids = Array.isArray(cur.ids) ? cur.ids : [];

    let changed = false;
    document.querySelectorAll('[data-task-id]').forEach(card => {
      const id = card.getAttribute('data-task-id');
      if (!id) return;
      const region = card.querySelector('[role="region"]');
      if (!region) return;
      const answered = hasStudentAnswer(card);
      const idx = cur.ids.indexOf(id);
      if (answered && idx === -1) {
        cur.ids.push(id);
        changed = true;
      } else if (!answered && idx !== -1 && findAnswerLabel(region)) {
        cur.ids.splice(idx, 1);
        changed = true;
      }
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

  // Переключатель типа домашки (ИИ / обычная) СПРАВА от кнопки «Завершить проверку» (сама кнопка — слева)
  function injectFinishModePicker() {
    const fb = finishButton();
    const existing = document.getElementById('nf-finish-mode-picker');
    if (!fb || !fb.parentElement) {
      if (existing) existing.remove();
      return;
    }
    const s = loadStats();
    const aid = attemptId();
    const curWork = s.records.find(r => (r.kind || 'work') === 'work' && String(r.id) === String(aid));
    const effectiveMode = curWork
      ? ((Number(curWork.neuro) || 0) >= (Number(curWork.regular) || 0) ? 'neuro' : 'regular')
      : (s.mode === 'regular' ? 'regular' : 'neuro');
    const isNeuro = effectiveMode !== 'regular';
    const mult = (s.rates && s.rates.multiplier >= 1) ? Number(s.rates.multiplier) : 1;
    const sig = effectiveMode + ':' + mult + ':' + (curWork ? ((curWork.neuro || 0) + '+' + (curWork.regular || 0)) : 'new');

    let bar = existing;
    if (!bar || bar.parentElement !== fb.parentElement || fb.nextElementSibling !== bar) {
      if (bar) bar.remove();
      bar = el('div', 'display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:12px;border:1px solid #d9d2e9;background:#f8f6ff;margin-left:8px;flex-wrap:wrap;');
      bar.id = 'nf-finish-mode-picker';
      fb.insertAdjacentElement('afterend', bar);
    }
    if (bar.dataset.sig === sig) return;
    bar.dataset.sig = sig;
    bar.innerHTML = '';

    bar.appendChild(el('span', 'font:700 12px sans-serif;color:#554b68;', {
      textContent: curWork ? 'Тип ДЗ (в учёте ✓):' : 'Тип ДЗ:'
    }));

    function applyFinishModeChoice(nextMode) {
      const x = loadStats();
      x.mode = nextMode;
      const nextIsNeuro = nextMode !== 'regular';
      const wRec = x.records.find(r => (r.kind || 'work') === 'work' && String(r.id) === String(attemptId()));
      if (wRec) {
        const tot = (Number(wRec.neuro) || 0) + (Number(wRec.regular) || 0);
        wRec.neuro = nextIsNeuro ? tot : 0;
        wRec.regular = nextIsNeuro ? 0 : tot;
        wRec.updatedAt = Date.now();
        saveStats(x, { immediateCloud: true });
        toast('🔄 Учтённая работа изменена на ' + (nextIsNeuro ? '🤖 ИИ' : '✍ обычную') + ' (' + tot + ' зад.)');
      } else {
        saveStats(x);
      }
      forceStats();
      injectFinishModePicker();
    }

    const bNeuro = chipBtn('🤖 ИИ', isNeuro, '#6b5cff', 'Засчитать эту домашку как ИИ-проверку');
    bNeuro.onclick = e => { e.stopPropagation(); applyFinishModeChoice('neuro'); };
    const bReg = chipBtn('✍ Обычная', !isNeuro, '#2e7d6b', 'Засчитать эту домашку как обычную проверку');
    bReg.onclick = e => { e.stopPropagation(); applyFinishModeChoice('regular'); };
    bar.append(bNeuro, bReg);
    if (mult > 1) {
      bar.appendChild(el('span', 'padding:3px 7px;border-radius:8px;background:#e6f6ec;color:#276e43;font:800 11px sans-serif;', {
        textContent: '×' + mult,
        title: 'Текущий коэффициент заданий'
      }));
    }
  }

  // ---------- засчитывание заданий ----------
  let pendingFinish = null; // { aid, hw, controls, ts }

  function commitFinish(p) {
    trackAnswers();

    const seen = loadSeen()[p.aid] || {};
    const ids = [...new Set(Array.isArray(seen.ids) ? seen.ids : [])];
    const n = ids.length;
    if (!n) { toast('Пустая работа: нет заданий с ответом ученика, в оплату не засчитано', true); return; }

    const s = loadStats();
    // Методист самостоятельно выбирает тип домашки (ИИ или обычная)
    const isNeuro = s.mode !== 'regular';
    const counts = {
      neuro: isNeuro ? n : 0,
      regular: isNeuro ? 0 : n
    };
    const activeMult = (s.rates && s.rates.multiplier >= 1) ? Number(s.rates.multiplier) : 1;

    const i = s.records.findIndex(r => (r.kind || 'work') === 'work' && String(r.id) === String(p.aid));

    if (i > -1) {
      const r = s.records[i];
      const prevTotal = (Number(r.neuro) || 0) + (Number(r.regular) || 0);
      const wasNeuro = (Number(r.neuro) || 0) >= (Number(r.regular) || 0);
      const unionIds = [...new Set((Array.isArray(r.taskIds) ? r.taskIds : []).concat(ids))];
      const total = Math.max(unionIds.length, prevTotal);
      const rMult = (r.multiplier !== undefined && Number(r.multiplier) >= 1) ? Number(r.multiplier) : 1;
      const modeChanged = wasNeuro !== isNeuro;
      const countChanged = total !== prevTotal;
      const multChanged = rMult !== activeMult;

      if (modeChanged || countChanged || multChanged) {
        r.taskIds = unionIds;
        // Обновляем ровно эту запись без наложения ИИ и ручных поверх друг друга
        r.neuro = isNeuro ? total : 0;
        r.regular = isNeuro ? 0 : total;
        r.multiplier = activeMult;
        if (p.hw && p.hw.title) r.hw = p.hw.title;
        r.updatedAt = Date.now();
        saveStats(s, { immediateCloud: true });
        toast('Работа обновлена: ' + total + ' зад. (' + (isNeuro ? '🤖 ИИ' : '✍ обычная') + (activeMult > 1 ? ', ×' + activeMult : '') + ') ≈ ' + fmtMoney(recMoney(r, s)));
      } else {
        toast('Эта работа уже учтена (' + prevTotal + ' зад., ' + (wasNeuro ? '🤖 ИИ' : '✍ обычная') + ')');
      }
      forceStats();
      return;
    }

    const rec = {
      kind: 'work', mode: 'check', id: String(p.aid), date: dayKey(), ts: Date.now(), hw: p.hw.title,
      neuro: counts.neuro, regular: counts.regular, multiplier: activeMult, taskIds: ids
    };

    s.records.push(rec);
    saveStats(s, { immediateCloud: true });
    forceStats();
    toastAction(
      'Засчитано: ' + n + ' зад. (' + (isNeuro ? '🤖 ИИ' : '✍ обычная')
        + (activeMult > 1 ? ', ×' + activeMult : '') + ') ≈ ' + fmtMoney(recMoney(rec, s)),
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
  const msgDropMem = {}; // защита от ложных провалов при частичном ререндере DOM (не сбрасываем base.n раньше времени)

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

      if (T === base.n) {
        delete msgDropMem[key];
        return;
      }

      // При ререндере/неполной загрузке число может временно уменьшиться.
      // Ждём 8 сек стабильности, чтобы мгновенный перерендер DOM не вызвал повторного начисления при восстановлении истории.
      if (T < base.n) {
        const dm = msgDropMem[key] || (msgDropMem[key] = { T, t: Date.now() });
        if (dm.T !== T) {
          dm.T = T;
          dm.t = Date.now();
          return;
        }
        if (Date.now() - dm.t < 8000) return;
        base.n = T;
        base.ts = Date.now();
        delete msgDropMem[key];
        changed = true;
        return;
      }
      delete msgDropMem[key];

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
      html:not([data-nf-theme="halloween"]) .nf-stats-widget .nf-stats-payout-card {
        background:linear-gradient(135deg,#eef9f2,#f3f0ff) !important;color:#1f4e3a !important;-webkit-text-fill-color:#1f4e3a !important;
        border:1px solid #bfe3ce !important;
      }
      html:not([data-nf-theme="halloween"]) .nf-stats-widget .nf-stats-payout-card .nf-payout-sub {
        color:#4b5e54 !important;-webkit-text-fill-color:#4b5e54 !important;
      }
      html:not([data-nf-theme="halloween"]) .nf-stats-widget .nf-stats-cloud-box {
        background:#f2f6ff !important;border:1px solid #d2e0fa !important;color:#2c4670 !important;-webkit-text-fill-color:#2c4670 !important;
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
      html[data-nf-theme="halloween"] .nf-stats-widget .nf-stats-payout-card {
        background:#283938 !important;color:#c9f7e1 !important;-webkit-text-fill-color:#c9f7e1 !important;
        border:1px solid #4d8174 !important;
      }
      html[data-nf-theme="halloween"] .nf-stats-widget .nf-stats-payout-card .nf-payout-sub {
        color:#b5d7ca !important;-webkit-text-fill-color:#b5d7ca !important;
      }
      html[data-nf-theme="halloween"] .nf-stats-widget .nf-stats-cloud-box {
        background:#2b2d46 !important;border:1px solid #596094 !important;color:#dde5ff !important;-webkit-text-fill-color:#dde5ff !important;
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

  function formatPeriodSpan(from, to, resetTs) {
    if (to) return fmtDateRu(from) + ' – ' + fmtDateRu(to);
    const hasResetTime = Number(resetTs) > 0 && from === dayKey(new Date(Number(resetTs)));
    return 'с ' + fmtDateRu(from) + (hasResetTime
      ? ' ' + new Date(Number(resetTs)).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      : '');
  }

  function snapshotClosedPeriod(statsObj, reason) {
    const P = periodStats(statsObj.records || [], statsObj);
    const p = P.payout;
    if (!p || (p.works === 0 && p.msgs === 0 && p.chatMsgs === 0 && p.money <= 0)) return null;
    const closedAt = Date.now();
    const snap = {
      id: 'per_' + closedAt + '_' + Math.random().toString(36).slice(2, 6),
      from: statsObj.payoutFrom || dayKey(),
      to: statsObj.payoutTo || '',
      resetTs: Number(statsObj.payoutResetTs) || 0,
      closedAt,
      reason: String(reason || 'reset'),
      works: p.works,
      neuro: p.neuro,
      regular: p.regular,
      msgs: p.msgs,
      chatMsgs: p.chatMsgs,
      money: Math.round(p.money * 100) / 100,
      tasksSummary: p.works + ' работ / ' + (p.neuro + p.regular) + ' зад. (🤖' + p.neuro + ' ✍' + p.regular + ')',
      msgsSummary: 'ДЗ: ' + p.msgs + ' · Чат: ' + p.chatMsgs
    };
    const existing = normalizePrevPeriods(statsObj.prevPeriods).filter(item =>
      !(item.from === snap.from && (item.to || '') === snap.to && Number(item.resetTs || 0) === snap.resetTs
        && Number(item.money || 0) === snap.money && Number(item.works || 0) === snap.works)
    );
    existing.unshift(snap);
    statsObj.prevPeriods = normalizePrevPeriods(existing);
    return snap;
  }

  function applyPeriodChange(nextFrom, nextTo, nextResetTs, reason) {
    const x = loadStats();
    const changed = (x.payoutFrom || '') !== nextFrom
      || (x.payoutTo || '') !== (nextTo || '')
      || (Number(x.payoutResetTs) || 0) !== (Number(nextResetTs) || 0);
    if (changed) snapshotClosedPeriod(x, reason);
    x.payoutFrom = nextFrom;
    x.payoutTo = nextTo || '';
    x.payoutResetTs = Number(nextResetTs) || 0;
    saveStats(x, { immediateCloud: true });
    forceStats();
    return x;
  }

  function restorePrevPeriod(snapId) {
    const x = loadStats();
    const list = normalizePrevPeriods(x.prevPeriods);
    const snap = list.find(p => p.id === snapId);
    if (!snap) return false;
    x.payoutFrom = snap.from;
    x.payoutTo = snap.to || '';
    x.payoutResetTs = Number(snap.resetTs) || 0;
    x.prevPeriods = list.filter(p => p.id !== snapId);
    saveStats(x, { immediateCloud: true });
    forceStats();
    toast('↩ Возвращён период: ' + formatPeriodSpan(x.payoutFrom, x.payoutTo, x.payoutResetTs));
    return true;
  }

  function openResetZeroModal() {
    document.getElementById('nf-reset-zero-modal')?.remove();
    const s = loadStats();
    const P = periodStats(s.records, s);
    const p = P.payout;
    const hasData = p.works > 0 || p.msgs > 0 || p.chatMsgs > 0 || p.money > 0;
    const cloudInfo = typeof nfCloudStatusInfo === 'function' ? nfCloudStatusInfo() : {};

    const cover = el('div', 'position:fixed;inset:0;z-index:2147483645;background:rgba(24,20,39,.65);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Comfortaa,system-ui,sans-serif;');
    cover.id = 'nf-reset-zero-modal';
    const box = el('div', 'width:min(440px,95vw);background:#fff;color:#2c2538;border-radius:18px;padding:20px;box-shadow:0 18px 55px rgba(0,0,0,.32);display:flex;flex-direction:column;gap:11px;font:13px/1.45 sans-serif;');

    const title = el('div', 'font:800 17px Comfortaa,sans-serif;color:#9f2c42;', { textContent: '⚠️ Начать новый период с 0 ₽?' });
    const summary = el('div', 'padding:9px 11px;border-radius:11px;background:#fff7f8;border:1px solid #f0ccd4;font-size:12px;color:#5a2a36;', {
      textContent: hasData
        ? ('Сейчас в периоде (' + formatPeriodSpan(s.payoutFrom, s.payoutTo, s.payoutResetTs) + '): '
          + p.works + ' работ · ' + p.msgs + ' ДЗ · ' + p.chatMsgs + ' чат = ' + fmtMoney(p.money))
        : ('Текущий период (' + formatPeriodSpan(s.payoutFrom, s.payoutTo, s.payoutResetTs) + ') уже по нулям.')
    });
    const info = el('div', 'font-size:12px;color:#4a4259;display:flex;flex-direction:column;gap:5px;');
    [
      '• Счётчик выплаты на сайте и активная сводка в таблице «Облако статистики» обнулятся и будут считать только новые работы с этой минуты — периоды не смешаются.',
      '• Прошлые записи НЕ удаляются: они остаются в блоке «Неделя / Месяц / Архив», а сам закрытый период сохраняется в «📅 Задать период → Предыдущие периоды» и на листе «Архив периодов» в таблице.',
      '• Если нажали случайно — всегда можно вернуть прошлый период обратно кнопкой «↩ Вернуть» внутри «📅 Задать период».'
    ].forEach(txt => info.appendChild(el('div', '', { textContent: txt })));

    box.append(title, summary, info);

    if (hasData && !cloudInfo.hasPin) {
      box.appendChild(el('div', 'padding:8px 10px;border-radius:10px;background:#fff9e6;border:1px solid #efd58c;font-size:11px;color:#6f5414;font-weight:700;', {
        textContent: '🔐 Облако ещё не подключено: прошлый период сохранится локально в браузере, но в Google Таблицу попадёт только после нажатия «🔐 Включить облако».'
      }));
    }

    const actions = el('div', 'display:flex;justify-content:flex-end;gap:8px;margin-top:4px;flex-wrap:wrap;');
    const closeModal = () => {
      document.removeEventListener('keydown', onKey);
      cover.remove();
    };
    const onKey = e => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', onKey);

    const cancelBtn = el('button', 'padding:9px 16px;border-radius:10px;border:1px solid #cbbce8;background:#f7f4ff;color:#3d3257;font:700 13px sans-serif;cursor:pointer;', {
      type: 'button', textContent: 'Отмена'
    });
    cancelBtn.onclick = closeModal;

    const confirmBtn = el('button', 'padding:9px 16px;border-radius:10px;border:0;background:#b83f53;color:#fff;font:800 13px sans-serif;cursor:pointer;', {
      type: 'button', textContent: '🔄 Да, начать с 0 ₽'
    });
    confirmBtn.onclick = () => {
      applyPeriodChange(dayKey(), '', Date.now(), 'reset_zero');
      closeModal();
      toast('🔄 Новый период начат с 0 ₽! Прошлый период сохранён в «📅 Задать период».');
    };

    actions.append(cancelBtn, confirmBtn);
    box.appendChild(actions);
    cover.appendChild(box);
    cover.addEventListener('mousedown', e => { if (e.target === cover) closeModal(); });
    document.body.appendChild(cover);
    setTimeout(() => cancelBtn.focus(), 30);
  }

  function openPeriodModal() {
    document.getElementById('nf-period-modal')?.remove();
    const s = loadStats();
    const today = dayKey();

    const cover = el('div', 'position:fixed;inset:0;z-index:2147483645;background:rgba(24,20,39,.62);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Comfortaa,system-ui,sans-serif;');
    cover.id = 'nf-period-modal';
    const box = el('div', 'width:min(440px,95vw);max-height:90vh;overflow:auto;background:#fff;color:#2c2538;border-radius:18px;padding:20px;box-shadow:0 18px 55px rgba(0,0,0,.3);display:flex;flex-direction:column;gap:12px;font:13px/1.45 sans-serif;');
    const title = el('div', 'font:800 17px Comfortaa,sans-serif;color:#2c2538;', { textContent: '📅 Период выплат' });
    const desc = el('div', 'color:#665c78;font-size:12px;', {
      textContent: 'Выбери даты расчётного периода. Старые записи сохраняются в архиве, а виджет будет считать выплату строго за выбранный период (даже после переустановки через облако).'
    });

    const rowDates = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:10px;');
    const fromWrap = el('label', 'display:flex;flex-direction:column;gap:4px;font-weight:700;font-size:12px;color:#4a3f68;', { textContent: 'С даты:' });
    const fromIn = el('input', 'padding:8px 10px;border-radius:10px;border:1px solid #cbbce8;font:600 13px sans-serif;color:#222;background:#faf8ff;', {
      type: 'date', value: s.payoutFrom || today
    });
    fromWrap.appendChild(fromIn);

    const toWrap = el('label', 'display:flex;flex-direction:column;gap:4px;font-weight:700;font-size:12px;color:#4a3f68;', { textContent: 'По дату (пусто = по сегодня):' });
    const toIn = el('input', 'padding:8px 10px;border-radius:10px;border:1px solid #cbbce8;font:600 13px sans-serif;color:#222;background:#faf8ff;', {
      type: 'date', value: s.payoutTo || ''
    });
    toWrap.appendChild(toIn);
    rowDates.append(fromWrap, toWrap);

    let chosenResetTs = s.payoutResetTs || 0;
    const resetNote = el('div', 'font-size:11px;color:#2e7d6b;font-weight:700;min-height:14px;');
    function syncResetNote() {
      if (chosenResetTs > 0 && fromIn.value === dayKey(new Date(chosenResetTs))) {
        const tm = new Date(chosenResetTs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        resetNote.textContent = '⏱ Точный старт от сброса: ' + fmtDateRu(fromIn.value) + ' в ' + tm;
      } else {
        resetNote.textContent = '';
      }
    }
    syncResetNote();
    fromIn.onchange = () => { chosenResetTs = 0; syncResetNote(); };
    toIn.onchange = () => { chosenResetTs = 0; syncResetNote(); };

    const presets = el('div', 'display:flex;flex-wrap:wrap;gap:6px;');
    const mkPreset = (txt, fn, accent = '#6b5cff') => {
      const b = el('button', 'padding:6px 10px;border-radius:9px;border:1px solid #d5cbed;background:#f7f4ff;color:' + accent + ';font:700 11px sans-serif;cursor:pointer;', {
        type: 'button', textContent: txt
      });
      b.onclick = fn;
      return b;
    };

    const now = new Date();
    const ym = today.slice(0, 7);
    const lastDayNum = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    presets.append(
      mkPreset('🟢 С сегодняшнего дня', () => { fromIn.value = today; toIn.value = ''; chosenResetTs = 0; syncResetNote(); }, '#2e7d6b'),
      mkPreset('🧹 В 0 с этой минуты', () => { fromIn.value = today; toIn.value = ''; chosenResetTs = Date.now(); syncResetNote(); }, '#b83f53'),
      mkPreset('📆 1–15 число', () => { fromIn.value = ym + '-01'; toIn.value = ym + '-15'; chosenResetTs = 0; syncResetNote(); }),
      mkPreset('📆 16–конец месяца', () => { fromIn.value = ym + '-16'; toIn.value = ym + '-' + pad2(lastDayNum); chosenResetTs = 0; syncResetNote(); }),
      mkPreset('📆 Весь месяц', () => { fromIn.value = ym + '-01'; toIn.value = ''; chosenResetTs = 0; syncResetNote(); })
    );

    box.append(title, desc, rowDates, resetNote, presets);

    const prevList = normalizePrevPeriods(s.prevPeriods);
    if (prevList.length) {
      const prevWrap = el('div', 'padding:9px 10px;border-radius:12px;background:#f7f5fc;border:1px solid #e1d8f3;display:flex;flex-direction:column;gap:6px;');
      prevWrap.appendChild(el('div', 'font:800 12px sans-serif;color:#4a3f68;', {
        textContent: '🕘 Предыдущие периоды (можно вернуть без смешивания)'
      }));
      prevList.slice(0, 4).forEach(item => {
        const row = el('div', 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 8px;border-radius:9px;background:#fff;border:1px solid #ebe4f8;font-size:11px;');
        const left = el('div', 'display:flex;flex-direction:column;gap:1px;min-width:0;');
        const closedStr = item.closedAt
          ? ' · закрыт ' + new Date(item.closedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
          : '';
        left.appendChild(el('div', 'font-weight:800;color:#2c2538;', {
          textContent: formatPeriodSpan(item.from, item.to, item.resetTs) + ' · ' + fmtMoney(item.money)
        }));
        left.appendChild(el('div', 'color:#6b627d;', {
          textContent: item.works + ' работ · ' + item.msgs + ' отв · ' + item.chatMsgs + ' чат' + closedStr
        }));
        const backBtn = el('button', MINI + 'flex-shrink:0;font-size:11px;padding:4px 8px;font-weight:700;color:#1b6840;border-color:#bde2cb;background:#eefaf3;', {
          type: 'button', textContent: '↩ Вернуть', title: 'Отменить сброс и снова сделать этот период активным'
        });
        backBtn.onclick = () => {
          restorePrevPeriod(item.id);
          cover.remove();
        };
        row.append(left, backBtn);
        prevWrap.appendChild(row);
      });
      box.appendChild(prevWrap);
    }

    const actions = el('div', 'display:flex;justify-content:flex-end;gap:8px;margin-top:4px;');
    const cancelBtn = el('button', MINI, { type: 'button', textContent: 'Отмена' });
    cancelBtn.onclick = () => cover.remove();
    const saveBtn = el('button', 'padding:8px 16px;border-radius:10px;border:0;background:#6b5cff;color:#fff;font:700 13px sans-serif;cursor:pointer;', {
      type: 'button', textContent: '💾 Сохранить период'
    });
    saveBtn.onclick = () => {
      const f = fromIn.value.trim();
      const t = toIn.value.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) { toast('Выбери корректную дату начала', true); return; }
      if (t && t < f) { toast('Дата окончания не может быть раньше начала', true); return; }
      const nextReset = chosenResetTs && f === dayKey(new Date(chosenResetTs)) ? chosenResetTs : 0;
      applyPeriodChange(f, t, nextReset, 'period_change');
      cover.remove();
      toast('✅ Период выплат сохранён: ' + formatPeriodSpan(f, t, nextReset));
    };
    actions.append(cancelBtn, saveBtn);
    box.appendChild(actions);
    cover.appendChild(box);
    cover.addEventListener('mousedown', e => { if (e.target === cover) cover.remove(); });
    document.body.appendChild(cover);
  }

  function renderStats() {
    const w = statsWidget;
    if (!w) return;
    const s = loadStats();
    const aid = attemptId();
    const cur = ((loadSeen()[aid] || {}).ids || []).length;
    if (!w._month) w._month = dayKey().slice(0, 7);
    if (!w._workScope) w._workScope = 'today';
    const cloudInfo = typeof nfCloudStatusInfo === 'function' ? nfCloudStatusInfo() : {};
    const sig = JSON.stringify([s, cur, dayKey(), w._month, w._workScope, pageMode(), aid, cloudInfo]);
    if (w._sig === sig) return;
    w._sig = sig;
    const P = periodStats(s.records, s);
    w.innerHTML = '';

    const tasksToday = P.todayActive.neuro + P.todayActive.regular;
    const periodLabelText = s.payoutTo
      ? (fmtDateRu(s.payoutFrom) + ' – ' + fmtDateRu(s.payoutTo))
      : ('с ' + fmtDateRu(s.payoutFrom) + (s.payoutResetTs > 0 && s.payoutFrom === dayKey(new Date(s.payoutResetTs))
        ? ' ' + new Date(s.payoutResetTs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
        : ''));

    // Компактный режим по умолчанию: одна строка с главными счётчиками.
    if (!w._expanded) {
      w.style.width = 'auto';
      w.style.minWidth = '0';
      w.style.maxWidth = 'calc(100vw - 16px)';
      w.style.height = 'auto';
      w.style.padding = '0';
      w.style.overflow = 'visible';

      const compact = el('div', 'display:flex;align-items:center;gap:7px;padding:9px 11px;cursor:grab;user-select:none;white-space:nowrap;');
      compact.title = 'Период: ' + periodLabelText + '. Перетащи или кликни, чтобы открыть статистику';
      compact.appendChild(el('span', 'font:800 14px sans-serif;line-height:1;', { textContent: '📊' }));
      compact.appendChild(el('span', 'font:800 12px sans-serif;color:#2b2b2b;', {
        textContent: tasksToday + ' ДЗ · ' + P.todayActive.msgs + ' отв · ' + P.todayActive.chatMsgs + ' чат · 💰 ' + fmtMoney(P.payout.money)
      }));
      if (cloudInfo.pendingRestore) {
        compact.appendChild(el('span', 'font:800 11px sans-serif;padding:2px 6px;border-radius:7px;background:#e6f6ec;color:#1b7a43;', {
          textContent: '☁️',
          title: 'В облаке найдена сохранённая статистика — нажми для восстановления'
        }));
      }
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
    w.style.width = 'min(370px, calc(100vw - 16px))';
    w.style.minWidth = '300px';
    w.style.maxWidth = '370px';
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
        textContent: 'Сегодня: ' + tasksToday + ' ДЗ · ' + P.todayActive.msgs + ' отв · ' + P.todayActive.chatMsgs + ' чат · ' + fmtMoney(P.todayActive.money)
      });
      summaryCard.className = 'nf-stats-summary-card';
      w.appendChild(summaryCard);
    }

    // Карточка расчётного периода выплат + быстрый сброс с нуля
    {
      const payoutCard = el('div', 'padding:8px 9px;border-radius:10px;display:flex;flex-direction:column;gap:5px;');
      payoutCard.className = 'nf-stats-payout-card';
      const pTop = el('div', 'display:flex;justify-content:space-between;align-items:center;gap:6px;font:800 13px sans-serif;');
      pTop.appendChild(el('span', '', { textContent: '💰 Период (' + periodLabelText + ')' }));
      pTop.appendChild(el('span', 'font:900 14px sans-serif;', { textContent: fmtMoney(P.payout.money) }));

      const pSub = el('div', 'font:600 11px sans-serif;');
      pSub.className = 'nf-payout-sub';
      pSub.textContent = 'задания ' + (P.payout.neuro + P.payout.regular)
        + ' (🤖' + P.payout.neuro + ' ✍' + P.payout.regular + ') = ' + fmtMoney(P.payout.moneyTasks)
        + ' · ответы ДЗ ' + P.payout.msgs + ' = ' + fmtMoney(P.payout.moneyMsgs)
        + ' · чат ' + P.payout.chatMsgs + ' = ' + fmtMoney(P.payout.moneyChatMsgs)
        + ' · работ ' + P.payout.works;

      const pBtns = el('div', 'display:flex;gap:6px;flex-wrap:wrap;margin-top:2px;');
      const setPerBtn = el('button', MINI + 'font-size:11px;padding:4px 8px;font-weight:700;', {
        type: 'button', textContent: '📅 Задать период', title: 'Выбрать даты расчётного периода (сохранится и в облаке)'
      });
      setPerBtn.onclick = openPeriodModal;
      const resetZeroBtn = el('button', MINI + 'font-size:11px;padding:4px 8px;font-weight:700;color:#9f2c42;border-color:#e8bac3;', {
        type: 'button', textContent: '🔄 С нуля сейчас', title: 'Начать новый период выплат с нуля с этого момента (прошлый период сохранится для возврата и в архиве)'
      });
      resetZeroBtn.onclick = openResetZeroModal;
      pBtns.append(setPerBtn, resetZeroBtn);
      payoutCard.append(pTop, pSub, pBtns);
      w.appendChild(payoutCard);
    }

    const pm = pageMode();
    if (pm) {
      const curWork = s.records.find(r => (r.kind || 'work') === 'work' && String(r.id) === String(aid));
      const modeCard = el('div', 'padding:6px 8px;border-radius:8px;font:12px sans-serif;color:#333;display:flex;flex-direction:column;gap:5px;background:'
        + (pm === 'check' ? '#e6f6ec' : '#eef3ff') + ';');
      modeCard.className = 'nf-stats-mode-card';
      const curWorkIsNeuro = curWork ? ((Number(curWork.neuro) || 0) >= (Number(curWork.regular) || 0)) : (s.mode !== 'regular');
      modeCard.appendChild(el('div', '', {
        textContent: pm === 'check'
          ? (cur > 0
            ? ('🟢 Идёт проверка. Засчитаются задания с ответом: ' + cur + ' как ' + (curWorkIsNeuro ? '🤖 ИИ' : '✍ обычная ДЗ') + ' и ответы.')
            : '🟡 Ответов ученика нет (0 зад.) — пустые задания в оплату не засчитаются.')
          : (curWork
            ? ('✅ Работа уже учтена: ' + ((curWork.neuro || 0) + (curWork.regular || 0)) + ' зад. (' + (curWorkIsNeuro ? '🤖 ИИ' : '✍ обычная') + ') = ' + fmtMoney(recMoney(curWork, s)))
            : ('💬 Работа уже проверена. Задания не считаются, только ответы: по ' + s.rates.msg + ' ₽.'))
      }));
      if (curWork) {
        const quickFlip = el('button', MINI + 'align-self:flex-start;font-size:11px;padding:4px 8px;font-weight:700;', {
          type: 'button',
          textContent: curWorkIsNeuro ? '⇄ Изменить эту работу на ✍ Обычную' : '⇄ Изменить эту работу на 🤖 ИИ',
          title: 'Переключить тип уже учтённой работы без дублирования'
        });
        quickFlip.onclick = () => {
          const t = loadStats();
          const x = t.records.find(z => (z.kind || 'work') === 'work' && String(z.id) === String(aid));
          if (!x) return;
          const tot = (Number(x.neuro) || 0) + (Number(x.regular) || 0);
          if ((Number(x.neuro) || 0) >= (Number(x.regular) || 0)) { x.neuro = 0; x.regular = tot; }
          else { x.neuro = tot; x.regular = 0; }
          x.updatedAt = Date.now();
          saveStats(t, { immediateCloud: true });
          forceStats();
          injectFinishModePicker();
          toast('🔄 Работа переключена: ' + ((x.neuro || 0) > 0 ? '🤖 ИИ' : '✍ обычная') + ' (' + tot + ' зад.)');
        };
        modeCard.appendChild(quickFlip);
      }
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
      b.onclick = () => { const x = loadStats(); x.tiers[w._month] = t; saveStats(x, { immediateCloud: true }); forceStats(); };
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
      saveStats(x, { immediateCloud: true });
      forceStats();
    };
    const resetRates = el('button', MINI, { type: 'button', textContent: '↺ Сбросить ставки', title: 'Вернуть ставки по умолчанию: обычные 5/6/7, нейро 2/3/4, ДЗ 2, чат 9' });
    resetRates.onclick = () => {
      if (!confirm('Сбросить ставки на стандартные?\nОбычные: 5,6,7 ₽\nНейро: 2,3,4 ₽\nДЗ: 2 ₽\nЧат: 9 ₽')) return;
      const x = loadStats();
      x.rates = { regular: DEF_RATES.regular.slice(), neuro: DEF_RATES.neuro.slice(), msg: DEF_RATES.msg, chatMsg: DEF_RATES.chatMsg, multiplier: x.rates.multiplier || 1 };
      saveStats(x, { immediateCloud: true });
      forceStats();
    };
    trow.append(gear, resetRates);
    w.appendChild(trow);
    const i = TIERS.indexOf(tier);
    w.appendChild(el('div', 'font:12px sans-serif;color:#555;', {
      textContent: 'Сейчас: обычное ' + s.rates.regular[i] + ' ₽ · нейро ' + s.rates.neuro[i] + ' ₽ · ДЗ ' + s.rates.msg + ' ₽ · чат ' + s.rates.chatMsg + ' ₽'
        + (s.tiers[w._month] ? '' : ' (по умолчанию 4–7, пока оценки нет)')
    }));

    // Ручной выбор типа проверяемой домашки (ИИ или обычная)
    w.appendChild(el('div', 'font:700 12px sans-serif;color:#777;margin-top:4px;', { textContent: 'Тип проверяемой домашки:' }));
    const hwModeRow = el('div', 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;');
    const isNeuroMode = s.mode !== 'regular';
    const btnNeuro = chipBtn('🤖 ИИ-проверка (' + s.rates.neuro[i] + ' ₽)', isNeuroMode, '#6b5cff', 'Считать задания домашки как ИИ-проверку');
    btnNeuro.onclick = () => {
      const x = loadStats();
      x.mode = 'neuro';
      saveStats(x);
      forceStats();
      injectFinishModePicker();
    };
    const btnRegular = chipBtn('✍ Обычная (' + s.rates.regular[i] + ' ₽)', !isNeuroMode, '#2e7d6b', 'Считать задания домашки как обычную проверку');
    btnRegular.onclick = () => {
      const x = loadStats();
      x.mode = 'regular';
      saveStats(x);
      forceStats();
      injectFinishModePicker();
    };
    hwModeRow.append(btnNeuro, btnRegular);
    w.appendChild(hwModeRow);

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
      injectFinishModePicker();
    };

    const ticks = el('div', 'display:flex;justify-content:space-between;font:10px sans-serif;color:#888;');
    ticks.className = 'nf-stats-factor-ticks';
    [1, 1.5, 2, 2.5, 3].forEach(v => ticks.appendChild(el('span', '', {
      textContent: '×' + v.toLocaleString('ru-RU', { maximumFractionDigits: 1 })
    })));
    factorBox.append(factorTop, slider, ticks);
    w.appendChild(factorBox);

    // календарные периоды
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
    per.append(line('Неделя', P.week), line('Месяц', P.month), line('Архив (за всё время)', P.all));
    w.appendChild(per);

    // записи (переключение Сегодня / Весь период)
    const todayWorks = s.records.filter(r => r.date === dayKey() && (r.kind || 'work') === 'work').sort((a, b) => b.ts - a.ts);
    const periodWorks = s.records.filter(r => inPayoutPeriod(r, s) && (r.kind || 'work') === 'work').sort((a, b) => b.ts - a.ts);
    const shownWorks = w._workScope === 'period' ? periodWorks : todayWorks;

    if (todayWorks.length || periodWorks.length) {
      const workHead = el('div', 'display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:4px;');
      workHead.appendChild(el('span', 'font:700 12px sans-serif;color:#777;', {
        textContent: w._workScope === 'period' ? ('Работы периода (' + periodWorks.length + '):') : ('Сегодня засчитано (' + todayWorks.length + '):')
      }));
      const scopeToggle = el('button', MINI + 'font-size:11px;padding:3px 7px;', {
        type: 'button',
        textContent: w._workScope === 'period' ? ('Только сегодня (' + todayWorks.length + ')') : ('Весь период (' + periodWorks.length + ')')
      });
      scopeToggle.onclick = () => { w._workScope = w._workScope === 'period' ? 'today' : 'period'; renderStats(); };
      workHead.appendChild(scopeToggle);
      w.appendChild(workHead);

      const worksList = el('div', 'display:flex;flex-direction:column;gap:4px;max-height:170px;overflow:auto;');
      shownWorks.forEach(r => {
        const row = el('div', 'display:flex;gap:4px;align-items:center;justify-content:space-between;font:12px sans-serif;color:#333;');
        const title = r.hw || 'Без названия';
        const rMult = (r.multiplier !== undefined && Number(r.multiplier) > 1) ? ' · ×' + Number(r.multiplier) : '';
        const dateTag = w._workScope === 'period' ? (fmtDateRu(r.date).slice(0, 5) + ' ') : '';
        row.appendChild(el('span', 'max-width:175px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', {
          textContent: dateTag + '🤖' + (r.neuro || 0) + ' ✍' + (r.regular || 0) + rMult + ' · ' + fmtMoney(recMoney(r, s)) + ' · ' + title, title
        }));
        const flip = el('button', MINI, { type: 'button', textContent: '⇄', title: 'Переключить эту работу между ИИ и Обычной' });
        flip.onclick = () => {
          const t = loadStats();
          const x = t.records.find(z => (z.kind || 'work') === 'work' && String(z.id) === String(r.id));
          if (x) {
            const tot = (Number(x.neuro) || 0) + (Number(x.regular) || 0);
            if ((Number(x.neuro) || 0) >= (Number(x.regular) || 0)) { x.neuro = 0; x.regular = tot; }
            else { x.neuro = tot; x.regular = 0; }
            x.updatedAt = Date.now();
            saveStats(t, { immediateCloud: true });
            forceStats();
            injectFinishModePicker();
          }
        };
        const ed = el('button', MINI, { type: 'button', textContent: '✎', title: 'Изменить число заданий и коэффициент' });
        ed.onclick = () => {
          const curMult = (r.multiplier !== undefined && Number(r.multiplier) >= 1) ? Number(r.multiplier) : 1;
          const ans = prompt('Заданий ИИ, обычных и коэффициент через пробел (например: 12 0 1.5):', (r.neuro || 0) + ' ' + (r.regular || 0) + ' ' + curMult);
          if (ans === null) return;
          const [a, b, c] = ans.trim().split(/\s+/);
          const n1 = parseInt(a, 10), n2 = parseInt(b === undefined ? '0' : b, 10);
          const mVal = c === undefined ? curMult : parseFloat(String(c).replace(',', '.'));
          if (!(n1 >= 0) || !(n2 >= 0) || !(mVal >= 1)) { toast('Проверьте введённые числа', true); return; }
          const t = loadStats();
          const x = t.records.find(z => (z.kind || 'work') === 'work' && String(z.id) === String(r.id));
          if (x) {
            x.neuro = n1;
            x.regular = n2;
            x.multiplier = Math.min(3, Math.max(1, mVal));
            x.updatedAt = Date.now();
            saveStats(t, { immediateCloud: true });
            forceStats();
            injectFinishModePicker();
          }
        };
        const del = el('button', MINI, { type: 'button', textContent: '✕', title: 'Убрать из подсчёта' });
        del.onclick = () => { if (confirm('Убрать эту работу из подсчёта?')) removeRecord(r); };
        row.append(flip, ed, del);
        worksList.appendChild(row);
      });
      w.appendChild(worksList);
    }

    // Облако (Google Таблица, защищено личным секретным кодом методиста)
    const cloudBox = el('div', 'margin-top:4px;padding:7px 9px;border-radius:10px;display:flex;flex-direction:column;gap:5px;font:12px sans-serif;');
    cloudBox.className = 'nf-stats-cloud-box';
    const cloudStatusText = cloudInfo.pendingRestore
      ? '☁️ Для твоего профиля есть копия в облаке — восстанови по личному коду!'
      : (cloudInfo.busy ? '☁️ Синхронизация с таблицей…' : (!cloudInfo.hasPin
        ? '🔐 Облако не подключено (защищено твоим личным кодом)'
        : (s.lastCloudSyncAt
          ? '☁️ Облако синхр.: ' + new Date(s.lastCloudSyncAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
          : '☁️ Облако подключено (автосохранение активно)')));
    cloudBox.appendChild(el('div', 'font:700 11px sans-serif;', { textContent: cloudStatusText }));
    const cloudBtns = el('div', 'display:flex;gap:6px;flex-wrap:wrap;');
    const cloudPushBtn = el('button', MINI + 'font-size:11px;padding:4px 8px;font-weight:700;', {
      type: 'button', textContent: cloudInfo.hasPin ? '☁️ Сохранить в облако' : '🔐 Включить облако',
      title: 'Сохранить счётчик и период в Google Таблицу под защитой личного кода'
    });
    cloudPushBtn.onclick = () => {
      if (typeof nfCloudPushNow === 'function') nfCloudPushNow({ manual: true });
    };
    const cloudPullBtn = el('button', MINI + 'font-size:11px;padding:4px 8px;font-weight:700;' + (cloudInfo.pendingRestore ? 'background:#e4f5e8;color:#1b7a43;border-color:#88cca2;' : ''), {
      type: 'button', textContent: '☁️ Восстановить по коду', title: 'Загрузить твой счётчик и период из облака (требует твой личный код)'
    });
    cloudPullBtn.onclick = () => {
      if (typeof nfCloudMergeRestore === 'function') nfCloudMergeRestore({ manual: true });
    };
    cloudBtns.append(cloudPushBtn, cloudPullBtn);
    cloudBox.appendChild(cloudBtns);
    w.appendChild(cloudBox);

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

  let statsSyncTickBound = false;
  function ensureStatsWidget() {
    // Виджет доступен на всех страницах NeoFamily. Его положение сохраняется между перезагрузками.
    if (!statsWidget || !statsWidget.isConnected) {
      statsWidget = el('div', 'position:fixed;left:12px;bottom:12px;z-index:9999;background:#fff;border:1px solid #f0d9a8;'
        + 'border-radius:14px;padding:8px;display:flex;flex-direction:column;gap:6px;box-shadow:0 5px 18px rgba(0,0,0,.16);'
        + 'max-width:370px;max-height:74vh;overflow:hidden auto;box-sizing:border-box;');
      statsWidget.className = 'nf-stats-widget';
      statsWidget._month = dayKey().slice(0, 7);
      statsWidget._expanded = loadStatsExpanded();
      document.body.appendChild(statsWidget);
      applyStatsPos(statsWidget);
    }
    if (!statsSyncTickBound) {
      statsSyncTickBound = true;
      window.addEventListener('focus', () => renderStats(), { passive: true });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) renderStats(); });
      setInterval(() => { if (!document.hidden && statsWidget) renderStats(); }, 3000);
    }
    renderStats();
  }

  window.addEventListener('resize', () => {
    if (!statsWidget || !statsWidget.isConnected) return;
    applyStatsPos(statsWidget);
  }, { passive: true });

  // ======================================================================
  //  ЧАСТЬ 7. Улучшение фото ответов учеников: ЧБ-сканер, Контраст, Поворот, Лупа
  // ======================================================================

  function nfBuildPhotoFilter(st) {
    const parts = [];
    if (st.scanner) {
      parts.push('grayscale(100%)');
    }
    if (st.invert) {
      parts.push('invert(100%) hue-rotate(180deg)');
    }
    // Базовый множитель от ЧБ-сканера + ручной пресет контраста
    const contrastPresets = [100, 165, 245, 135];
    const brightPresets = [100, 106, 114, 142];
    let c = st.customContrast || contrastPresets[st.contrastIdx || 0] || 100;
    let b = st.customBright || brightPresets[st.contrastIdx || 0] || 100;
    if (st.scanner && !st.customContrast) {
      c = Math.round(c * 2.15);
      b = Math.round(b * 1.10);
    }
    if (c !== 100) parts.push('contrast(' + c + '%)');
    if (b !== 100) parts.push('brightness(' + b + '%)');
    return parts.join(' ') || 'none';
  }

  function nfApplyPhotoState(img) {
    const st = img._nfPhotoState || (img._nfPhotoState = { turns: 0, scanner: false, contrastIdx: 0, invert: false });
    const turns = ((st.turns % 4) + 4) % 4;
    img.setAttribute('data-tm-rot', String(turns));
    img.style.filter = nfBuildPhotoFilter(st);
    img.style.transition = 'transform .18s ease, filter .15s ease, margin .18s ease';

    const deg = turns * 90;
    if (turns % 2 === 1) {
      const w = img.clientWidth || img.naturalWidth || 300;
      const h = img.clientHeight || img.naturalHeight || 200;
      const diff = Math.max(0, Math.round((w - h) / 2));
      img.style.transform = 'rotate(' + deg + 'deg)';
      img.style.margin = diff + 'px auto';
    } else {
      img.style.transform = deg ? ('rotate(' + deg + 'deg)') : '';
      img.style.margin = '';
    }
  }

  function nfOpenPhotoScannerModal(origImg) {
    document.getElementById('nf-photo-scanner-modal')?.remove();
    const src = origImg.currentSrc || origImg.src;
    if (!src) return;

    const baseState = origImg._nfPhotoState || { turns: 0, scanner: false, contrastIdx: 0, invert: false };
    const st = {
      turns: baseState.turns || 0,
      scanner: !!baseState.scanner,
      contrastIdx: baseState.contrastIdx || 0,
      invert: !!baseState.invert,
      customContrast: baseState.scanner ? 225 : ( [100, 165, 245, 135][baseState.contrastIdx || 0] || 100 ),
      customBright: baseState.scanner ? 112 : ( [100, 106, 114, 142][baseState.contrastIdx || 0] || 100 ),
      zoom: 1,
      panX: 0,
      panY: 0
    };

    const overlay = document.createElement('div');
    overlay.id = 'nf-photo-scanner-modal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(12,10,20,.92);display:flex;flex-direction:column;'
      + 'user-select:none;font-family:Comfortaa,system-ui,sans-serif;';

    const topBar = document.createElement('div');
    topBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;padding:10px 16px;'
      + 'background:rgba(28,23,44,.95);border-bottom:1px solid #3d335c;color:#fff;z-index:2;';

    const btnCss = active => 'padding:7px 12px;border-radius:10px;border:1px solid ' + (active ? '#8e74f0' : '#4b3f6e')
      + ';background:' + (active ? '#6b5cff' : '#2a2240') + ';color:#fff;font:700 12px sans-serif;cursor:pointer;';

    const btnScan = document.createElement('button');
    btnScan.type = 'button';
    btnScan.textContent = '🔆 ЧБ-сканер (проявить текст)';

    const btnInv = document.createElement('button');
    btnInv.type = 'button';
    btnInv.textContent = '🌗 Инверсия';

    const btnRot = document.createElement('button');
    btnRot.type = 'button';
    btnRot.textContent = '↻ Повернуть 90°';

    // Ползунки точной подстройки контраста и яркости
    const cWrap = document.createElement('label');
    cWrap.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font:600 12px sans-serif;color:#dcd4f0;background:#231c35;padding:5px 10px;border-radius:10px;';
    const cOut = document.createElement('span');
    const cRange = document.createElement('input');
    cRange.type = 'range'; cRange.min = '60'; cRange.max = '380'; cRange.step = '5'; cRange.value = String(st.customContrast);
    cRange.style.cssText = 'width:95px;accent-color:#6b5cff;cursor:pointer;';
    cWrap.append('Контраст:', cRange, cOut);

    const bWrap = document.createElement('label');
    bWrap.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font:600 12px sans-serif;color:#dcd4f0;background:#231c35;padding:5px 10px;border-radius:10px;';
    const bOut = document.createElement('span');
    const bRange = document.createElement('input');
    bRange.type = 'range'; bRange.min = '60'; bRange.max = '240'; bRange.step = '5'; bRange.value = String(st.customBright);
    bRange.style.cssText = 'width:85px;accent-color:#6b5cff;cursor:pointer;';
    bWrap.append('Яркость:', bRange, bOut);

    const btnReset = document.createElement('button');
    btnReset.type = 'button';
    btnReset.textContent = 'Сброс';
    btnReset.style.cssText = btnCss(false);

    const btnClose = document.createElement('button');
    btnClose.type = 'button';
    btnClose.textContent = '✕ Закрыть (Esc)';
    btnClose.style.cssText = 'padding:7px 14px;border-radius:10px;border:0;background:#d9386a;color:#fff;font:800 12px sans-serif;cursor:pointer;margin-left:8px;';

    const stage = document.createElement('div');
    stage.style.cssText = 'flex:1;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;cursor:grab;';

    const bigImg = document.createElement('img');
    bigImg.src = src;
    bigImg.draggable = false;
    bigImg.style.cssText = 'max-width:92vw;max-height:82vh;object-fit:contain;border-radius:8px;transform-origin:center center;will-change:transform,filter;';

    const hint = document.createElement('div');
    hint.style.cssText = 'position:absolute;bottom:12px;left:50%;transform:translateX(-50%);padding:6px 14px;border-radius:99px;'
      + 'background:rgba(20,16,34,.8);color:#cbc2e3;font:600 12px sans-serif;pointer-events:none;';

    function syncModal() {
      btnScan.style.cssText = btnCss(st.scanner);
      btnInv.style.cssText = btnCss(st.invert);
      btnRot.style.cssText = btnCss(st.turns % 4 !== 0);
      cRange.value = String(st.customContrast);
      bRange.value = String(st.customBright);
      cOut.textContent = st.customContrast + '%';
      bOut.textContent = st.customBright + '%';
      bigImg.style.filter = nfBuildPhotoFilter(st);
      const deg = ((st.turns % 4) + 4) % 4 * 90;
      bigImg.style.transform = `translate(${st.panX}px, ${st.panY}px) scale(${st.zoom}) rotate(${deg}deg)`;
      hint.textContent = `Колёсико мыши: зум (${Math.round(st.zoom * 100)}%) · Зажми ЛКМ: двигать фото · Двойной клик: сбросить зум`;
    }

    btnScan.onclick = () => {
      st.scanner = !st.scanner;
      if (st.scanner) {
        st.customContrast = Math.max(st.customContrast, 235);
        st.customBright = Math.max(st.customBright, 112);
      } else {
        st.customContrast = 100;
        st.customBright = 100;
      }
      origImg._nfPhotoState = { ...origImg._nfPhotoState, scanner: st.scanner, turns: st.turns, invert: st.invert };
      nfApplyPhotoState(origImg);
      origImg._nfSyncToolbar?.();
      syncModal();
    };

    btnInv.onclick = () => {
      st.invert = !st.invert;
      origImg._nfPhotoState = { ...origImg._nfPhotoState, invert: st.invert };
      nfApplyPhotoState(origImg);
      origImg._nfSyncToolbar?.();
      syncModal();
    };

    btnRot.onclick = () => {
      st.turns = (st.turns + 1) % 4;
      origImg._nfPhotoState = { ...origImg._nfPhotoState, turns: st.turns };
      nfApplyPhotoState(origImg);
      origImg._nfSyncToolbar?.();
      syncModal();
    };

    cRange.oninput = () => { st.customContrast = Number(cRange.value); syncModal(); };
    bRange.oninput = () => { st.customBright = Number(bRange.value); syncModal(); };

    btnReset.onclick = () => {
      st.scanner = false; st.invert = false; st.turns = 0;
      st.customContrast = 100; st.customBright = 100;
      st.zoom = 1; st.panX = 0; st.panY = 0;
      origImg._nfPhotoState = { turns: 0, scanner: false, contrastIdx: 0, invert: false };
      nfApplyPhotoState(origImg);
      origImg._nfSyncToolbar?.();
      syncModal();
    };

    stage.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.18 : (1 / 1.18);
      st.zoom = Math.min(6.5, Math.max(0.5, Math.round(st.zoom * factor * 100) / 100));
      syncModal();
    }, { passive: false });

    stage.addEventListener('dblclick', () => {
      st.zoom = st.zoom > 1.2 ? 1 : 2.2;
      st.panX = 0; st.panY = 0;
      syncModal();
    });

    let dragging = false, sx = 0, sy = 0, spx = 0, spy = 0;
    stage.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      spx = st.panX; spy = st.panY;
      stage.style.cursor = 'grabbing';
      stage.setPointerCapture?.(e.pointerId);
    });
    stage.addEventListener('pointermove', e => {
      if (!dragging) return;
      st.panX = spx + (e.clientX - sx);
      st.panY = spy + (e.clientY - sy);
      syncModal();
    });
    const endDrag = e => {
      if (!dragging) return;
      dragging = false;
      stage.style.cursor = 'grab';
      stage.releasePointerCapture?.(e.pointerId);
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
    };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    btnClose.onclick = close;

    topBar.append(btnScan, cWrap, bWrap, btnInv, btnRot, btnReset, btnClose);
    stage.append(bigImg, hint);
    overlay.append(topBar, stage);
    document.body.appendChild(overlay);
    syncModal();
  }

  function addRotateControl(img) {
    if (!img || !(img instanceof HTMLImageElement) || img.dataset.nfPhotoEnhanced === '1') return;
    if (img.closest('.nf-tpl-panel, .nf-attach-preview, #nf-remote-popup, #nf-admin-console, #nf-photo-scanner-modal')) return;

    img.dataset.nfPhotoEnhanced = '1';
    const st = img._nfPhotoState || (img._nfPhotoState = { turns: 0, scanner: false, contrastIdx: 0, invert: false });

    const bar = document.createElement('div');
    bar.className = 'nf-photo-tools';
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0;'
      + 'padding:5px 8px;border-radius:11px;background:#f5f2ff;border:1px solid #dcd3f7;width:fit-content;max-width:100%;';

    const chipStyle = (active, accent = '#6b5cff') =>
      'padding:5px 10px;border-radius:8px;border:1px solid ' + (active ? accent : '#ccc4e3')
      + ';background:' + (active ? accent : '#fff') + ';color:' + (active ? '#fff' : '#32294a')
      + ';font:700 12px/1.2 Nunito,system-ui,sans-serif;cursor:pointer;transition:all .12s;';

    const bScan = document.createElement('button');
    bScan.type = 'button';
    bScan.title = 'Превратить фото тетради в чёткий чёрно-белый скан (проявить бледный карандаш или ручку)';

    const bContrast = document.createElement('button');
    bContrast.type = 'button';
    bContrast.title = 'Переключить усиление контраста и яркости (3 режима)';

    const bInvert = document.createElement('button');
    bInvert.type = 'button';
    bInvert.textContent = '🌗 Инверсия';
    bInvert.title = 'Инвертировать цвета (удобно при сильном засвете)';

    const bRot = document.createElement('button');
    bRot.type = 'button';
    bRot.textContent = '↻ 90°';
    bRot.title = 'Повернуть фотографию на 90° по часовой стрелке';

    const bZoom = document.createElement('button');
    bZoom.type = 'button';
    bZoom.textContent = '🔍 Лупа + Слайдеры';
    bZoom.title = 'Открыть фото во весь экран с зумом до 600% и точной настройкой контраста';
    bZoom.style.cssText = chipStyle(false, '#2e7d6b');

    const contrastLabels = ['☀️ Вытянуть контраст', '☀️ Контраст ×1.6', '☀️ Контраст МАКС ×2.5', '☀️ Высветлить +40%'];

    function syncBar() {
      bScan.textContent = st.scanner ? '🔆 ЧБ-сканер: ВКЛ' : '🔆 ЧБ-сканер';
      bScan.style.cssText = chipStyle(st.scanner, '#6b5cff');

      bContrast.textContent = contrastLabels[st.contrastIdx] || contrastLabels[0];
      bContrast.style.cssText = chipStyle(st.contrastIdx > 0, '#d97706');

      bInvert.style.cssText = chipStyle(st.invert, '#4a3f68');
      bRot.style.cssText = chipStyle((st.turns % 4) !== 0, '#1a73e8');
    }
    img._nfSyncToolbar = syncBar;

    bScan.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      st.scanner = !st.scanner;
      nfApplyPhotoState(img);
      syncBar();
    };

    bContrast.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      st.contrastIdx = ((st.contrastIdx || 0) + 1) % 4;
      nfApplyPhotoState(img);
      syncBar();
    };

    bInvert.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      st.invert = !st.invert;
      nfApplyPhotoState(img);
      syncBar();
    };

    bRot.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      st.turns = ((st.turns || 0) + 1) % 4;
      nfApplyPhotoState(img);
      syncBar();
    };

    bZoom.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      nfOpenPhotoScannerModal(img);
    };

    syncBar();
    bar.append(bScan, bContrast, bInvert, bRot, bZoom);
    if (img.parentElement) {
      img.parentElement.insertBefore(bar, img);
    }
  }

  function scanRotate() {
    // 1) Все фотографии в блоке «Ответ ученика» внутри карточек заданий
    document.querySelectorAll('[data-task-id]').forEach(card => {
      const region = card.querySelector('[role="region"]');
      if (!region) return;
      const answerLabel = [...region.querySelectorAll('span')]
        .find(s => /Ответ ученика/i.test(s.textContent));
      if (!answerLabel) return;
      let ans = answerLabel;
      const keyBox = [...region.querySelectorAll(DETAIL)].find(d => /Элементы (ключа|ответа)/i.test(d.textContent));
      if (keyBox) {
        while (ans.parentElement && !ans.parentElement.contains(keyBox)) ans = ans.parentElement;
      } else if (answerLabel.parentElement) {
        ans = answerLabel.parentElement;
      }
      ans.querySelectorAll('img').forEach(addRotateControl);
    });

    // 2) Крупные фотографии, присланные учеником в диалоге к домашке
    document.querySelectorAll('[id$="-dialogue"] img').forEach(img => {
      if (img.closest('.nf-tpl-panel, .nf-attach-preview')) return;
      if ((img.naturalWidth && img.naturalWidth < 90) || (img.width && img.width < 70)) return;
      addRotateControl(img);
    });
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
    const recId = 'chat:' + unique;
    if (st.records.some(r => String(r.id) === recId)) {
      seen[unique] = now;
      jsonSave(CHAT_SEEN_KEY, seen);
      return;
    }
    // Сохраняем ID вместо текста переписки. Статистика не включает сообщения других людей.
    st.records.push({ kind: 'chat_msg', id: recId, date: dayKey(dt),
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
  const SHIFT_VIEW_METHODIST_STORE = 'nf_shift_view_name_v1';
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
  function shiftGetViewName() {
    try {
      const x = typeof GM_getValue === 'function' ? GM_getValue(SHIFT_VIEW_METHODIST_STORE, '') : localStorage.getItem(SHIFT_VIEW_METHODIST_STORE);
      return String(x || '').trim();
    } catch (e) { return ''; }
  }
  function shiftSaveViewName(name) {
    const n = String(name || '').trim();
    try {
      if (typeof GM_setValue === 'function') GM_setValue(SHIFT_VIEW_METHODIST_STORE, n);
      else localStorage.setItem(SHIFT_VIEW_METHODIST_STORE, n);
    } catch (e) {}
  }
  function shiftDetectMethodistName() {
    const first = shiftSidebarFirstName();
    const cached = shiftCachedMethodistName();
    const matchesFirst = full => !first || full.toLocaleLowerCase('ru-RU').startsWith(first.toLocaleLowerCase('ru-RU') + ' ');
    if (cached && cached.split(/\s+/).length >= 2 && matchesFirst(cached)) return cached;

    // 1) Приоритетно проверяем собственные сообщения авторизованного пользователя [data-current-user="true"]
    const ownCandidates = new Set();
    document.querySelectorAll('[data-current-user="true"] span, [data-current-user="true"] div').forEach(el => {
      if (el.children.length) return;
      const raw = (el.textContent || '').trim();
      if (raw.length > 90 || !/^(Методист|Куратор|Администратор|Преподаватель|Модератор)\s+/i.test(raw)) return;
      const n = shiftCleanStaffName(raw);
      if (n && n.split(/\s+/).length >= 2 && matchesFirst(n)) ownCandidates.add(n);
    });
    if (ownCandidates.size === 1) {
      const n = [...ownCandidates][0];
      shiftSaveMethodistName(n);
      return n;
    }

    // 2) Запасной поиск по странице строго с фильтром по имени из левого меню сайта
    const candidates = new Set();
    document.querySelectorAll('span').forEach(el => {
      if (el.children.length) return;
      const raw = (el.textContent || '').trim();
      if (raw.length > 90 || !/^(Методист|Куратор|Администратор|Преподаватель|Модератор)\s+/i.test(raw)) return;
      const n = shiftCleanStaffName(raw);
      if (!n || n.split(/\s+/).length < 2) return;
      if (matchesFirst(n)) candidates.add(n);
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
    const old = shiftGetViewName() || shiftCachedMethodistName();
    const entered = prompt('Укажи имя и фамилию (или фамилию) для просмотра расписания из Google:', old || (first ? first + ' ' : ''));
    if (entered === null) return '';
    const n = String(entered).replace(/\s+/g,' ').trim();
    if (!n) { toast('Укажи фамилию или имя и фамилию', true); return ''; }
    shiftSaveViewName(n);
    return n;
  }

  let shiftGoogleBusy = false;
  let shiftGoogleLastTry = 0;
  let shiftGoogleLastError = '';
  function shiftGoogleRequest(name) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') { reject(new Error('GM_xmlhttpRequest недоступен')); return; }
      const url = SHIFT_GOOGLE_URL + '?key=' + encodeURIComponent(SHIFT_GOOGLE_KEY) + '&name=' + encodeURIComponent(name) + '&v=' + encodeURIComponent(NF_SCRIPT_VERSION);
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
    let name = opts.name || shiftGetViewName() || shiftDetectMethodistName();
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
    if (!shiftGetViewName() && !shiftDetectMethodistName()) return;
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
      const picked = shiftAskMethodistName();
      if (picked) shiftSyncGoogle({manual:true, name:picked});
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
  const NF_REG_REMOTE_URL = 'https://raw.githubusercontent.com/kirilkasss/NeoFamily_plug/main/reglament.json';
  const NF_REG_CACHE_KEY = 'nf_reg_remote_cache_v1';
  let NF_REG_SECTIONS = [];
  let NF_REG_SHORT = {};
  let NF_REG_FIGURES = {};
  let NF_REG_FIGURE_PLACEMENTS = {};
  let nfRegLoading = false;

  function nfRegApplyData(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.sections) || !data.sections.length) return false;
    NF_REG_SECTIONS = data.sections;
    NF_REG_SHORT = data.short || {};
    NF_REG_FIGURES = data.figures || {};
    NF_REG_FIGURE_PLACEMENTS = data.placements || {};
    return true;
  }

  async function nfRegEnsureLoaded(forceReload = false) {
    if (!forceReload && NF_REG_SECTIONS.length) return true;
    if (!forceReload) {
      const cached = jsonLoad(NF_REG_CACHE_KEY, null);
      if (nfRegApplyData(cached)) return true;
    }
    if (nfRegLoading) return false;
    nfRegLoading = true;
    toast('Загружаем регламент…');
    try {
      const data = await new Promise((resolve, reject) => {
        if (typeof GM_xmlhttpRequest === 'function') {
          GM_xmlhttpRequest({
            method: 'GET',
            url: NF_REG_REMOTE_URL + '?t=' + Date.now(),
            timeout: 20000,
            onload: r => {
              try { resolve(JSON.parse(r.responseText)); }
              catch (e) { reject(new Error('Не удалось разобрать JSON регламента')); }
            },
            onerror: () => reject(new Error('Ошибка сети при загрузке регламента')),
            ontimeout: () => reject(new Error('Превышено время ожидания загрузки регламента'))
          });
        } else {
          fetch(NF_REG_REMOTE_URL + '?t=' + Date.now())
            .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(resolve)
            .catch(reject);
        }
      });
      if (!nfRegApplyData(data)) throw new Error('Пустой или повреждённый файл регламента');
      jsonSave(NF_REG_CACHE_KEY, data);
      if (forceReload) toast('Регламент обновлён');
      return true;
    } catch (err) {
      console.error('[NeoCheck Reglament]', err);
      toast('Не удалось загрузить регламент: ' + (err.message || err), true);
      return false;
    } finally {
      nfRegLoading = false;
    }
  }
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
  async function nfRegModal(sectionIndex=null, query='') {
    const ok = await nfRegEnsureLoaded(false);
    if (!ok || !NF_REG_SECTIONS.length) return;
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
    const hint=nfRegText('div','Разделы сгруппированы по темам. Текст перенесён из PDF от 14.10.2026. Оригинальные изображения показаны рядом с соответствующими правилами. Для спорных формулировок сверяйся с PDF.','font:12px/1.5 Nunito,sans-serif;color:#e9dff0;margin-top:4px;');
    header.append(top,hint);
    const tools=nfRegText('div','');tools.style.cssText='padding:13px 20px 10px;background:#faf8fe;border-bottom:1px solid #e9e4f0;display:flex;gap:10px;align-items:center;flex-wrap:wrap;';
    const finder=nfRegText('input','');finder.type='search';finder.placeholder='🔎 Найти правило, термин или пример во всём регламенте';finder.value=query;
    finder.style.cssText='box-sizing:border-box;flex:1 1 260px;min-width:160px;padding:11px 14px;border:1px solid #ddd5e9;border-radius:12px;background:white;color:#302a3e;font:600 13px Nunito,sans-serif;outline-color:#8b77ba;';
    const favorites=nfRegText('button','☆ Избранное');favorites.type='button';favorites.className='nf-reg-tool';
    const prev=nfRegText('button','←');prev.type='button';prev.title='Предыдущий раздел';prev.className='nf-reg-tool';
    const next=nfRegText('button','→');next.type='button';next.title='Следующий раздел';next.className='nf-reg-tool';
    const reloadReg=nfRegText('button','↻');reloadReg.type='button';reloadReg.title='Обновить регламент с GitHub';reloadReg.className='nf-reg-tool';
    reloadReg.onclick=async()=>{if(await nfRegEnsureLoaded(true)){shut();nfRegModal(selected,finder.value);}};
    tools.append(finder,favorites,prev,next,reloadReg);
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
      .nf-reg-modern .nf-reg-figure{display:block;width:100%;max-width:800px;box-sizing:border-box;text-align:left;background:#fbfaff;border:1px solid #e6def1;border-radius:13px;padding:10px;margin:12px 0;cursor:zoom-in;}
      .nf-reg-modern .nf-reg-figure img{display:block;width:100%;height:auto;object-fit:contain;border-radius:8px;}
      .nf-reg-modern .nf-reg-figure span{display:block;margin:7px 2px 1px;font:700 11px Nunito,sans-serif;color:#84778f;}
      .nf-reg-zoom{position:fixed;inset:0;z-index:1000003;background:rgba(16,10,26,.87);display:flex;align-items:center;justify-content:center;padding:60px 20px 25px;box-sizing:border-box;}
      .nf-reg-zoom img{max-width:98%;max-height:95%;object-fit:contain;background:white;border-radius:10px;}
      .nf-reg-zoom button{position:absolute;right:20px;top:14px;color:#fff;background:#52456a;padding:10px 15px;border:0;border-radius:10px;cursor:pointer;}
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
      // Вставляем оригинальные рисунки непосредственно после соответствующих правил,
      // а не отдельной галереей в конце раздела.
      const figureQueue=(NF_REG_FIGURE_PLACEMENTS[selected]||[]).slice();
      const figureAssets=NF_REG_FIGURES[selected]||[];
      function figureAt(index){
        if(q)return;
        while(figureQueue.length && figureQueue[0].after<=index){
          const placement=figureQueue.shift();
          const it=figureAssets[placement.image];if(!it)continue;
          const frame=nfRegText('button','');frame.type='button';frame.className='nf-reg-figure';
          frame.setAttribute('aria-label','Увеличить иллюстрацию из регламента, страница '+it.page);
          const im=document.createElement('img');im.src=it.src;im.loading='lazy';
          im.alt='Оригинальная иллюстрация из регламента NeoFamily, страница '+it.page;
          const cap=nfRegText('span','Иллюстрация к правилу · оригинал, стр. '+it.page);
          frame.append(im,cap);
          frame.onclick=()=>{
            const shade=nfRegText('div','');shade.className='nf-reg-zoom';
            const full=document.createElement('img');full.src=it.src;full.alt=im.alt;
            const leave=nfRegText('button','✕ Закрыть');leave.type='button';
            leave.onclick=()=>shade.remove();shade.onclick=e=>{if(e.target===shade)shade.remove();};
            shade.append(full,leave);document.body.append(shade);
          };
          (example||article).append(frame);
        }
      }
      let example=null;
      for(const [blockIndex,b] of blocks.entries()){
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
        figureAt(blockIndex);
      }
      figureAt(Number.MAX_SAFE_INTEGER);
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
    'nf_my_shifts_v1', 'nf_my_shift_windows_v1',
    'nf_nc_gas_cfg_v1', 'nf_methodist_full_name_v1'
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

    const cloudRestoreBtn = button('☁️ Восстановить счётчик и период из облака');
    cloudRestoreBtn.style.background = '#e8f5ee';
    cloudRestoreBtn.style.borderColor = '#8cc7a6';
    cloudRestoreBtn.style.color = '#1b6840';
    cloudRestoreBtn.onclick = async () => {
      cloudRestoreBtn.disabled = true;
      status.textContent = '⏳ Ищем сохранённый счётчик в Google Таблице…';
      try {
        const res = typeof nfCloudMergeRestore === 'function'
          ? await nfCloudMergeRestore({ manual: true })
          : null;
        if (res && res.ok) {
          status.textContent = '✅ Счётчик восстановлен (' + (res.mergedCount || 0) + ' записей, период с ' + fmtDateRu(res.payoutFrom) + ')!';
        } else {
          status.textContent = (res && res.message) || 'Не удалось найти сохранённую копию в облаке.';
        }
      } catch (e) {
        status.textContent = '❌ Ошибка облака: ' + e.message;
      } finally {
        cloudRestoreBtn.disabled = false;
      }
    };

    panel.append(title,desc,save,restore,cloudRestoreBtn,file,status,note,close);
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
        html[data-nf-theme="newyear"] #nf-quick-dock .nf-dock-btn {background:#f4f9ff;color:#1b465c;border-color:#b8d6ef;box-shadow:0 6px 20px rgba(42,102,158,.16);}
        html[data-nf-theme="newyear"] #nf-quick-dock .nf-dock-btn:hover {background:#e5f1fc;border-color:#7fb7e2;}
        html[data-nf-theme="newyear"] #nf-theme-dock-menu {background:#f8fbff;border-color:#b8d6ef;box-shadow:0 12px 30px rgba(42,102,158,.20);}
        html[data-nf-theme="newyear"] #nf-theme-dock-menu button {color:#1b3650;}
        html[data-nf-theme="newyear"] #nf-theme-dock-menu button:hover,
        html[data-nf-theme="newyear"] #nf-theme-dock-menu button[data-active="true"]{background:#dff0fd;}
        html.nf-check-focus #tm-pink-coquette-decor,html.nf-check-focus .tm-pink-note,
        html.nf-check-focus #nf-ny-garland,html.nf-check-focus #nf-ny-snow {display:none !important;}
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
    const options=[['pink','🎀 Pink Pick Me'],['halloween','🎃 Halloween'],['newyear','🎄 Новый год']];
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

  // ======================================================================
  //  ЧАСТЬ 13. Приём уведомлений с экрана + Облачное сохранение счётчика
  // ======================================================================
  const NF_REMOTE_SEEN_KEY = 'nf_remote_seen_msg_v1';
  const NF_REMOTE_POLL_MS = 15 * 1000;
  let nfRemotePendingMsg = null;
  let nfRemoteShownReportedId = '';

  function nfRemoteMyName() {
    // Строго подтверждённое ФИО авторизованного пользователя (никогда не подменяется чужим из «Мои смены»)
    return shiftDetectMethodistName() || '';
  }

  function nfRemotePost(payload) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        reject(new Error('GM_xmlhttpRequest недоступен'));
        return;
      }
      GM_xmlhttpRequest({
        method: 'POST',
        url: SHIFT_GOOGLE_URL,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        data: JSON.stringify({ key: SHIFT_GOOGLE_KEY, ...payload }),
        timeout: 20000,
        onload: r => {
          try {
            resolve(JSON.parse(r.responseText || '{}'));
          } catch (e) {
            reject(new Error('Ошибка ответа сервера'));
          }
        },
        onerror: () => reject(new Error('Ошибка сети')),
        ontimeout: () => reject(new Error('Таймаут'))
      });
    });
  }

  // --- Облачное сохранение и восстановление счётчика (Google Таблица, строго по подтверждённому профилю + личному коду) ---
  const NF_CLOUD_PIN_KEY = 'nf_cloud_pin_token_v1';
  const nfCloudState = {
    busy: false,
    pendingRestore: false,
    checkedStartup: false,
    pushTimer: null
  };

  function nfCloudGetPinObj() {
    const obj = jsonLoad(NF_CLOUD_PIN_KEY, null);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  }

  function nfCloudGetPinToken(name) {
    const obj = nfCloudGetPinObj();
    if (!obj || !obj.token || !name) return '';
    const norm = String(name).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
    return obj.name === norm ? String(obj.token) : '';
  }

  function nfCloudSavePinToken(name, token) {
    const norm = String(name || '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
    if (!norm || !token) return;
    jsonSave(NF_CLOUD_PIN_KEY, { name: norm, token: String(token) });
  }

  function nfCloudClearPinToken() {
    try {
      if (typeof GM_setValue === 'function') GM_setValue(NF_CLOUD_PIN_KEY, '');
      else localStorage.removeItem(NF_CLOUD_PIN_KEY);
    } catch (_) {}
  }

  function nfCloudStatusInfo() {
    const myName = nfRemoteMyName();
    return {
      busy: nfCloudState.busy,
      pendingRestore: nfCloudState.pendingRestore,
      hasPin: !!nfCloudGetPinToken(myName)
    };
  }

  async function nfCloudHashPin(name, rawPin) {
    const norm = String(name || '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
    const input = 'NF_CLOUD_CLIENT_2026|' + norm + '|' + String(rawPin || '');
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Резервный детерминированный SHA-256-совместимый многораундовый хеш (если crypto.subtle отключён)
    let h1 = 0x811c9dc5, h2 = 0x9e3779b9, h3 = 0x85ebca6b, h4 = 0xc2b2ae35;
    for (let i = 0; i < input.length; i++) {
      const c = input.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 + c + i, 0x85ebca6b) >>> 0;
      h3 = Math.imul(h3 ^ (c << (i % 7)), 0xc2b2ae35) >>> 0;
      h4 = Math.imul(h4 + (h1 ^ h2), 0x27d4eb2f) >>> 0;
    }
    return [h1, h2, h3, h4].map(x => x.toString(16).padStart(8, '0')).join('');
  }

  function nfCloudPromptPinModal(mode, profileName) {
    return new Promise(resolve => {
      document.getElementById('nf-cloud-pin-modal')?.remove();
      const cover = el('div', 'position:fixed;inset:0;z-index:2147483645;background:rgba(24,20,39,.65);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Comfortaa,system-ui,sans-serif;');
      cover.id = 'nf-cloud-pin-modal';

      const box = el('div', 'width:min(410px,95vw);background:#fff;color:#2c2538;border-radius:18px;padding:20px;box-shadow:0 18px 55px rgba(0,0,0,.3);display:flex;flex-direction:column;gap:11px;font:13px/1.45 sans-serif;');
      const isRestore = mode === 'restore';
      box.appendChild(el('div', 'font:800 17px Comfortaa,sans-serif;color:#2c2538;', {
        textContent: isRestore ? '🔐 Восстановление из облака' : '🔐 Личный код облака'
      }));

      const profBadge = el('div', 'padding:8px 10px;border-radius:10px;background:#f4effc;border:1px solid #d5c7ef;color:#3d2f63;font:700 12px sans-serif;', {
        textContent: '👤 Подтверждённый профиль: ' + profileName
      });
      box.appendChild(profBadge);

      box.appendChild(el('div', 'font-size:12px;color:#5f5670;', {
        textContent: isRestore
          ? 'Введи свой личный секретный код (ПИН), который ты задавал(а) при подключении облака. Загрузить данные другого человека невозможно.'
          : 'Придумай короткий личный код (от 4 символов). Он защитит твой счётчик от доступа или перезаписи посторонними и понадобится, только если переустановишь скрипт.'
      }));

      const pinIn = el('input', 'padding:10px 12px;border-radius:10px;border:1px solid #cbbce8;font:700 14px sans-serif;color:#222;background:#faf8ff;', {
        type: 'password',
        placeholder: isRestore ? 'Твой личный код (ПИН)' : 'Придумай код (минимум 4 символа)',
        autocomplete: 'current-password'
      });
      const errLine = el('div', 'font:700 12px sans-serif;color:#b83f53;min-height:16px;');
      const btns = el('div', 'display:flex;justify-content:flex-end;gap:8px;');
      const cancel = el('button', MINI, { type: 'button', textContent: 'Отмена' });
      const ok = el('button', 'padding:8px 16px;border-radius:10px;border:0;background:#2e7d6b;color:#fff;font:700 13px sans-serif;cursor:pointer;', {
        type: 'button', textContent: isRestore ? '☁️ Восстановить' : '🔐 Подключить и сохранить'
      });

      const done = val => { cover.remove(); resolve(val); };
      cancel.onclick = () => done(null);
      cover.addEventListener('mousedown', e => { if (e.target === cover) done(null); });

      const submit = async () => {
        const val = pinIn.value.trim();
        if (val.length < 4) {
          errLine.textContent = 'Код должен быть не короче 4 символов';
          pinIn.focus();
          return;
        }
        ok.disabled = true;
        const token = await nfCloudHashPin(profileName, val);
        done(token);
      };
      ok.onclick = submit;
      pinIn.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

      btns.append(cancel, ok);
      box.append(pinIn, errLine, btns);
      cover.appendChild(box);
      document.body.appendChild(cover);
      setTimeout(() => pinIn.focus(), 40);
    });
  }

  function nfCloudSchedulePush(delayMs = 4000) {
    clearTimeout(nfCloudState.pushTimer);
    nfCloudState.pushTimer = setTimeout(() => {
      nfCloudPushNow({ manual: false });
    }, delayMs);
  }

  async function nfCloudPushNow({ manual = false, forceOverwrite = false } = {}) {
    if (nfCloudState.busy) return null;
    const name = nfRemoteMyName();
    if (!name) {
      if (manual) {
        const first = shiftSidebarFirstName();
        toast(first
          ? 'Открой любую свою проверенную работу или чат (где есть твоё сообщение), чтобы автоматически подтвердить профиль «' + first + '»'
          : 'Открой раздел «Домашние работы» или чат на Neofamily для определения твоего профиля', true);
      }
      return null;
    }

    let pinToken = nfCloudGetPinToken(name);
    if (!pinToken) {
      if (!manual) return null; // Фоново не отправляем, пока методист сам не подключил защиту личным кодом
      pinToken = await nfCloudPromptPinModal('setup', name);
      if (!pinToken) return null;
    }

    const s = loadStats();
    // Пустой несинхронизированный скрипт никогда не пытается затереть облако
    if (!manual && !forceOverwrite && s.records.length === 0 && !s.cloudKnownRev) {
      return null;
    }

    nfCloudState.busy = true;
    if (manual) forceStats();
    try {
      const P = periodStats(s.records, s);
      const compactRecords = s.records.map(r => {
        const item = {
          kind: r.kind || 'work',
          id: r.id,
          date: r.date,
          ts: r.ts,
          hw: r.hw ? String(r.hw).slice(0, 90) : '',
          neuro: Number(r.neuro) || 0,
          regular: Number(r.regular) || 0,
          msgs: Number(r.msgs) || 0,
          chatMsgs: Number(r.chatMsgs) || 0
        };
        if (r.mode) item.mode = r.mode;
        if (r.src) item.src = r.src;
        if (r.updatedAt) item.updatedAt = r.updatedAt;
        if (r.multiplier !== undefined && Number(r.multiplier) !== 1) item.multiplier = Number(r.multiplier);
        if (Array.isArray(r.taskIds) && r.taskIds.length) item.taskIds = r.taskIds;
        return item;
      });

      const res = await nfRemotePost({
        action: 'save_stats_cloud',
        name,
        pinToken,
        version: NF_SCRIPT_VERSION,
        clientKnownRev: Number(s.cloudKnownRev) || 0,
        forceOverwrite: !!forceOverwrite,
        summary: {
          tasksSummary: P.payout.works + ' работ / ' + (P.payout.neuro + P.payout.regular) + ' зад. (🤖' + P.payout.neuro + ' ✍' + P.payout.regular + ')',
          msgsSummary: 'ДЗ: ' + P.payout.msgs + ' · Чат: ' + P.payout.chatMsgs,
          payoutMoney: Math.round(P.payout.money * 100) / 100
        },
        stats: {
          records: compactRecords,
          tiers: s.tiers,
          rates: s.rates,
          mode: s.mode,
          taskComments: !!s.taskComments,
          payoutFrom: s.payoutFrom,
          payoutTo: s.payoutTo,
          payoutResetTs: s.payoutResetTs,
          prevPeriods: normalizePrevPeriods(s.prevPeriods),
          rev: s.rev
        }
      });

      if (res && res.ok) {
        nfCloudSavePinToken(name, pinToken);
        const fresh = loadStats();
        fresh.cloudKnownRev = Number(res.rev) || fresh.cloudKnownRev;
        fresh.lastCloudSyncAt = Date.now();
        jsonSave(STAT_KEY, fresh);
        nfCloudState.pendingRestore = false;
        if (manual) toast('☁️ Статистика и период сохранены в облако (' + (res.recordsCount || 0) + ' зап.)');
        return res;
      }

      if (res && res.error === 'bad_pin') {
        nfCloudClearPinToken();
        if (manual) toast('❌ Неверный личный код облака для профиля «' + name + '»!', true);
        return res;
      }
      if (res && res.error === 'pin_locked') {
        if (manual) toast('⏳ Слишком много неверных попыток. Попробуй через 10 минут.', true);
        return res;
      }

      if (res && (res.error === 'cloud_has_data' || res.error === 'cloud_conflict')) {
        nfCloudSavePinToken(name, pinToken);
        nfCloudState.pendingRestore = true;
        if (manual) {
          const m = res.cloudMeta || {};
          const wantMerge = confirm(
            'В облаке уже есть твоя сохранённая статистика (' + name + '):\n'
            + '• Записей: ' + (m.recordsCount || 0) + '\n'
            + '• Период: с ' + fmtDateRu(m.payoutFrom || '') + '\n'
            + '• Выплата: ' + fmtMoney(m.payoutMoney || 0) + '\n'
            + '• Сохранено: ' + (m.updatedAtMsk || 'ранее') + '\n\n'
            + 'Нажми «ОК», чтобы ВОССТАНОВИТЬ и ОБЪЕДИНИТЬ её с текущими записями (рекомендуется).\n'
            + 'Нажми «Отмена», чтобы оставить облако нетронутым.'
          );
          if (wantMerge) {
            nfCloudState.busy = false;
            return await nfCloudMergeRestore({ manual: true });
          }
          const wantOverwrite = confirm('Хочешь ПРИНУДИТЕЛЬНО перезаписать облако твоими текущими локальными данными (' + s.records.length + ' зап.)?');
          if (wantOverwrite) {
            nfCloudState.busy = false;
            return await nfCloudPushNow({ manual: true, forceOverwrite: true });
          }
        }
        return res;
      }

      if (manual) toast('☁️ Ошибка облака: ' + (res?.error || 'неизвестно'), true);
      return res;
    } catch (e) {
      if (manual) toast('☁️ Ошибка соединения с облаком: ' + e.message, true);
      return null;
    } finally {
      nfCloudState.busy = false;
      forceStats();
    }
  }

  async function nfCloudMergeRestore({ manual = false } = {}) {
    if (nfCloudState.busy) return { ok: false, message: 'Синхронизация уже выполняется…' };
    const name = nfRemoteMyName();
    if (!name) {
      const first = shiftSidebarFirstName();
      const msg = first
        ? 'Открой любую свою проверенную работу или чат (где есть твоё сообщение), чтобы автоматически подтвердить профиль «' + first + '»'
        : 'Открой «Домашние работы» или чат на Neofamily для автоопределения твоего профиля';
      if (manual) toast(msg, true);
      return { ok: false, message: msg };
    }

    let pinToken = nfCloudGetPinToken(name);
    if (!pinToken) {
      if (!manual) return { ok: false, message: 'Требуется личный код' };
      pinToken = await nfCloudPromptPinModal('restore', name);
      if (!pinToken) return { ok: false, message: 'Отменено пользователем' };
    }

    nfCloudState.busy = true;
    forceStats();
    try {
      const res = await nfRemotePost({ action: 'load_stats_cloud', name, pinToken });
      if (res && res.error === 'bad_pin') {
        nfCloudClearPinToken();
        if (manual) toast('❌ Неверный личный код облака для «' + name + '»!', true);
        return { ok: false, message: 'Неверный личный код' };
      }
      if (res && res.error === 'pin_locked') {
        if (manual) toast('⏳ Слишком много неверных попыток. Подожди 10 минут.', true);
        return { ok: false, message: 'Слишком много неверных попыток' };
      }
      if (!res || !res.ok || !res.exists || !res.stats) {
        if (manual) toast('Для профиля «' + name + '» в облаке пока нет сохранённой копии', true);
        return { ok: false, message: 'Копия для «' + name + '» не найдена' };
      }

      nfCloudSavePinToken(name, pinToken);
      const cloud = res.stats;
      const local = loadStats();
      const cloudRecords = Array.isArray(cloud.records) ? cloud.records : [];
      const localHadRecords = local.records.length > 0;
      const mergedRecords = normalizeRecordList(cloudRecords.concat(local.records));
      const cloudPrevPeriods = normalizePrevPeriods(cloud.prevPeriods);
      const mergedPrevPeriods = normalizePrevPeriods(cloudPrevPeriods.concat(local.prevPeriods || []));

      const takeCloudPeriod = !localHadRecords || (Number(cloud.rev || 0) >= Number(local.rev || 0));
      const merged = {
        ...local,
        records: mergedRecords,
        tiers: takeCloudPeriod ? { ...(local.tiers || {}), ...(cloud.tiers || {}) } : { ...(cloud.tiers || {}), ...(local.tiers || {}) },
        rates: takeCloudPeriod && cloud.rates ? { ...local.rates, ...cloud.rates } : local.rates,
        mode: takeCloudPeriod && cloud.mode ? cloud.mode : local.mode,
        taskComments: takeCloudPeriod && cloud.taskComments !== undefined ? !!cloud.taskComments : local.taskComments,
        payoutFrom: takeCloudPeriod && /^\d{4}-\d{2}-\d{2}$/.test(String(cloud.payoutFrom || '')) ? cloud.payoutFrom : local.payoutFrom,
        payoutTo: takeCloudPeriod && cloud.payoutTo !== undefined ? (cloud.payoutTo || '') : local.payoutTo,
        payoutResetTs: takeCloudPeriod ? (Number(cloud.payoutResetTs) || 0) : local.payoutResetTs,
        prevPeriods: mergedPrevPeriods,
        cloudKnownRev: Number(res.meta?.rev || cloud.rev || 0),
        lastCloudSyncAt: Date.now()
      };

      saveStats(merged, { skipCloud: true });
      nfCloudState.pendingRestore = false;

      // Обновляем кеш отправленных сообщений чата, чтобы восстановленные записи никогда не задвоились
      const seenChat = jsonLoad(CHAT_SEEN_KEY, {});
      let chatDirty = false;
      for (const rec of mergedRecords) {
        if (rec.kind === 'chat_msg' && String(rec.id || '').startsWith('chat:')) {
          const u = String(rec.id).slice(5);
          if (!seenChat[u]) { seenChat[u] = Number(rec.ts) || Date.now(); chatDirty = true; }
        }
      }
      if (chatDirty) jsonSave(CHAT_SEEN_KEY, seenChat);

      if (manual) {
        toast('✅ Восстановлено из облака: ' + mergedRecords.length + ' зап. (период с ' + fmtDateRu(merged.payoutFrom) + ')');
      }

      const shouldPushMerged = mergedRecords.length > cloudRecords.length || mergedPrevPeriods.length > cloudPrevPeriods.length;
      nfCloudState.busy = false;
      forceStats();
      injectFinishModePicker();
      if (shouldPushMerged) {
        await nfCloudPushNow({ manual: false, forceOverwrite: true });
      }
      return { ok: true, mergedCount: mergedRecords.length, payoutFrom: merged.payoutFrom };
    } catch (e) {
      if (manual) toast('☁️ Ошибка восстановления: ' + e.message, true);
      return { ok: false, message: e.message };
    } finally {
      nfCloudState.busy = false;
      forceStats();
    }
  }

  async function nfCloudCheckStartup() {
    if (nfCloudState.checkedStartup) return;
    const name = nfRemoteMyName();
    if (!name) return;
    nfCloudState.checkedStartup = true;
    const s = loadStats();
    if (s.records.length === 0) {
      try {
        const res = await nfRemotePost({ action: 'check_stats_cloud', name });
        if (res && res.ok && res.exists) {
          nfCloudState.pendingRestore = true;
          forceStats();
          toastAction(
            '☁️ Для профиля «' + name + '» найдена копия в облаке. Восстановить по коду?',
            'Восстановить',
            () => nfCloudMergeRestore({ manual: true })
          );
        }
      } catch (_) {}
    } else if (nfCloudGetPinToken(name) && !s.cloudKnownRev) {
      nfCloudSchedulePush(2500);
    }
  }

  // Синтезатор звуковых эффектов (Web Audio API — работает без внешних файлов и блокировщиков)
  function nfRemotePlaySound(soundType) {
    if (!soundType || soundType === 'none') return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      const playTone = (freq, startOffset, duration, type = 'sine', gainVal = 0.22) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now + startOffset);
        gain.gain.setValueAtTime(0.001, now + startOffset);
        gain.gain.exponentialRampToValueAtTime(gainVal, now + startOffset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + startOffset);
        osc.stop(now + startOffset + duration + 0.02);
      };

      if (soundType === 'chime') {
        // Приятный двойной колокольчик
        playTone(587.33, 0.00, 0.28, 'triangle', 0.28);
        playTone(880.00, 0.14, 0.55, 'triangle', 0.30);
      } else if (soundType === 'fanfare') {
        // Торжественные фанфары победы
        playTone(523.25, 0.00, 0.16, 'sawtooth', 0.18);
        playTone(659.25, 0.15, 0.16, 'sawtooth', 0.18);
        playTone(783.99, 0.30, 0.16, 'sawtooth', 0.20);
        playTone(1046.50, 0.45, 0.65, 'triangle', 0.28);
        playTone(783.99, 0.45, 0.65, 'sine', 0.18);
      } else if (soundType === 'alarm') {
        // Бодрящая сирена внимания
        for (let i = 0; i < 4; i++) {
          playTone(880, i * 0.22, 0.11, 'square', 0.20);
          playTone(622.25, i * 0.22 + 0.11, 0.11, 'square', 0.20);
        }
      } else if (soundType === 'retro') {
        // 8-битный звук монетки / уровня
        playTone(987.77, 0.00, 0.09, 'square', 0.18);
        playTone(1318.51, 0.09, 0.42, 'square', 0.20);
      }
    } catch (_) {}
  }

  // Салют из конфетти на весь экран
  function nfRemoteFireConfetti() {
    try {
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647;';
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      document.body.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      const colors = ['#6b5cff', '#ff5c8a', '#00d285', '#ffbe0b', '#3a86ff', '#fb5607', '#a855f7'];
      const particles = Array.from({ length: 130 }, (_, i) => {
        const fromLeft = i % 2 === 0;
        const angle = fromLeft ? (-Math.PI / 3 + (Math.random() - 0.5) * 0.6) : (-2 * Math.PI / 3 + (Math.random() - 0.5) * 0.6);
        const speed = 11 + Math.random() * 14;
        return {
          x: fromLeft ? canvas.width * 0.15 : canvas.width * 0.85,
          y: canvas.height * 0.72,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 4,
          size: 7 + Math.random() * 7,
          color: colors[i % colors.length],
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 0.25,
          alpha: 1
        };
      });

      let frame = 0;
      function tick() {
        frame++;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = false;
        for (const p of particles) {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.36; // гравитация
          p.vx *= 0.99;
          p.rot += p.vrot;
          if (frame > 95) p.alpha -= 0.02;
          if (p.alpha > 0 && p.y < canvas.height + 40) {
            alive = true;
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.alpha);
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
            ctx.restore();
          }
        }
        if (alive && frame < 180) requestAnimationFrame(tick);
        else canvas.remove();
      }
      requestAnimationFrame(tick);
    } catch (_) {}
  }

  function nfRemoteOpenUpdateTab() {
    const url = NF_SCRIPT_UPDATE_URL + '?update=' + Date.now();
    try {
      if (typeof GM_openInTab === 'function') {
        GM_openInTab(url, { active: true, insert: true });
        return;
      }
    } catch (_) {}
    window.open(url, '_blank');
  }

  function nfRemoteShowPopup(msg) {
    // Если это же окно уже открыто на экране — не пересоздаём его
    const existing = document.getElementById('nf-remote-popup');
    if (existing && existing.dataset.msgId === msg.id) return;
    if (existing) existing.remove();

    const myName = nfRemoteMyName();
    // Отправляем сигнал «👀 Показано на экране» один раз при реальной отрисовке на активной вкладке
    if (myName && msg.id && nfRemoteShownReportedId !== msg.id) {
      nfRemoteShownReportedId = msg.id;
      nfRemotePost({ action: 'shown_screen', id: msg.id, name: myName }).catch(() => {});
    }

    // Запускаем звук и спецэффекты
    nfRemotePlaySound(msg.sound || (msg.forceUpdate ? 'alarm' : 'chime'));
    if (msg.effect === 'confetti') {
      setTimeout(nfRemoteFireConfetti, 80);
    }

    const overlay = document.createElement('div');
    overlay.id = 'nf-remote-popup';
    overlay.dataset.msgId = msg.id || '';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(15,12,28,.82);'
      + 'backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;padding:20px;'
      + 'animation:nfRemoteFadeIn .25s ease-out;font-family:Comfortaa,system-ui,sans-serif;';

    const style = document.createElement('style');
    style.textContent = `
      @keyframes nfRemoteFadeIn { from { opacity:0; transform:scale(.92); } to { opacity:1; transform:scale(1); } }
      @keyframes nfRemoteShake {
        0%, 100% { transform:translate(0, 0) rotate(0deg); }
        15% { transform:translate(-10px, -4px) rotate(-1.5deg); }
        30% { transform:translate(10px, 4px) rotate(1.5deg); }
        45% { transform:translate(-8px, 3px) rotate(-1deg); }
        60% { transform:translate(8px, -3px) rotate(1deg); }
        75% { transform:translate(-4px, 2px) rotate(-.5deg); }
      }
      @keyframes nfRemoteGlow {
        0%, 100% { box-shadow: 0 24px 80px rgba(107,92,255,.55), 0 0 25px rgba(107,92,255,.6); }
        50% { box-shadow: 0 24px 90px rgba(255,92,138,.7), 0 0 45px rgba(255,92,138,.85); }
      }
    `;
    overlay.appendChild(style);

    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;color:#2c2538;border-radius:24px;padding:24px;max-width:min(92vw,680px);'
      + 'max-height:90vh;display:flex;flex-direction:column;align-items:center;gap:14px;'
      + 'box-shadow:0 24px 80px rgba(0,0,0,.45);border:3px solid ' + (msg.forceUpdate ? '#ff5c8a' : '#6b5cff') + ';overflow:auto;';

    if (msg.effect === 'shake') {
      card.style.animation = 'nfRemoteShake .65s ease-in-out';
    } else if (msg.effect === 'glow' || msg.forceUpdate) {
      card.style.animation = 'nfRemoteGlow 2s infinite ease-in-out';
    }

    const header = document.createElement('div');
    header.style.cssText = 'font:800 13px Comfortaa,sans-serif;color:' + (msg.forceUpdate ? '#d9386a' : '#7a679e') + ';letter-spacing:.04em;text-align:center;';
    header.textContent = msg.forceUpdate
      ? '🚀 ОБЯЗАТЕЛЬНОЕ ОБНОВЛЕНИЕ NEOCHECK · ОТ ' + (msg.sender || 'Кирилла').toUpperCase()
      : '✨ СООБЩЕНИЕ НА ЭКРАН · ' + (msg.sender || 'NeoCheck');
    card.appendChild(header);

    if (msg.image) {
      const img = document.createElement('img');
      img.src = msg.image;
      img.style.cssText = 'max-width:100%;max-height:58vh;object-fit:contain;border-radius:16px;box-shadow:0 6px 24px rgba(0,0,0,.12);';
      card.appendChild(img);
    }

    if (msg.caption) {
      const cap = document.createElement('div');
      cap.style.cssText = 'font:700 18px/1.45 Comfortaa,sans-serif;color:#2c2538;text-align:center;white-space:pre-wrap;';
      cap.textContent = msg.caption;
      card.appendChild(cap);
    }

    const hint = document.createElement('div');
    hint.style.cssText = 'font:600 12px sans-serif;color:#8c829e;text-align:center;';
    hint.textContent = msg.forceUpdate
      ? 'Нажми кнопку ниже — откроется окно Tampermonkey, где нужно нажать «Обновить / Переустановить»:'
      : 'Нажми на кнопку ниже, чтобы подтвердить, что сообщение прочитано:';
    card.appendChild(hint);

    const actionsWrap = document.createElement('div');
    actionsWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:4px;';

    function confirmAndClose(reactionLabel, openUpdate = false) {
      try {
        if (typeof GM_setValue === 'function') GM_setValue(NF_REMOTE_SEEN_KEY, msg.id);
        else localStorage.setItem(NF_REMOTE_SEEN_KEY, msg.id);
      } catch (_) {}
      nfRemotePendingMsg = null;
      if (myName && msg.id) {
        nfRemotePost({
          action: 'ack_screen',
          id: msg.id,
          name: myName,
          reaction: reactionLabel,
          version: NF_SCRIPT_VERSION
        }).catch(() => {});
      }
      overlay.remove();
      if (openUpdate) {
        nfRemoteOpenUpdateTab();
      }
    }

    if (msg.forceUpdate) {
      const updateBtn = document.createElement('button');
      updateBtn.type = 'button';
      updateBtn.textContent = '⚡ Обновить NeoCheck в 1 клик (сейчас у тебя v' + NF_SCRIPT_VERSION + ')';
      updateBtn.style.cssText = 'padding:13px 26px;border:0;border-radius:14px;background:linear-gradient(135deg,#00b874,#00d285);'
        + 'color:#fff;font:800 15px Comfortaa,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(0,184,116,.4);';
      updateBtn.onclick = () => confirmAndClose('Нажал Обновить 🚀 (с v' + NF_SCRIPT_VERSION + ')', true);
      actionsWrap.appendChild(updateBtn);
    } else {
      const reactions = [
        { label: msg.buttonText || 'Понятно 💜', primary: true },
        { label: '👍 Принято', primary: false },
        { label: '🫡 Сделаю!', primary: false },
        { label: '❤️ Спасибо', primary: false }
      ];
      for (const r of reactions) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = r.label;
        b.style.cssText = r.primary
          ? 'padding:11px 26px;border:0;border-radius:14px;background:linear-gradient(135deg,#6b5cff,#8e74f0);color:#fff;font:800 14px Comfortaa,sans-serif;cursor:pointer;box-shadow:0 4px 15px rgba(107,92,255,.35);'
          : 'padding:10px 16px;border:1px solid #dcd0f5;border-radius:14px;background:#f8f5ff;color:#4a3f68;font:700 13px Comfortaa,sans-serif;cursor:pointer;';
        b.onclick = () => confirmAndClose(r.label, false);
        actionsWrap.appendChild(b);
      }
    }

    // Не даём случайно закрыть кликом мимо окна: при клике по фону карточка дрожит, напоминая нажать кнопку
    overlay.addEventListener('mousedown', e => {
      if (e.target === overlay) {
        card.style.animation = 'none';
        void card.offsetWidth;
        card.style.animation = 'nfRemoteShake .45s ease-in-out';
        nfRemotePlaySound('chime');
      }
    });

    card.appendChild(actionsWrap);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  function nfRemoteBannerCheckVersion() {
    // Авто-плашка сверху экрана отключена, чтобы не мешать методистам
    document.getElementById('nf-update-bar')?.remove();
  }

  async function nfRemotePoll() {
    const myName = nfRemoteMyName();
    if (!myName) return;
    try {
      const res = await nfRemotePost({ action: 'poll_screen', name: myName, version: NF_SCRIPT_VERSION });
      if (res && res.actualVersion) {
        nfRemoteBannerCheckVersion(res.actualVersion);
      }
      if (res && res.ok) {
        if (res.msg && res.msg.id) {
          const lastSeen = typeof GM_getValue === 'function'
            ? GM_getValue(NF_REMOTE_SEEN_KEY, '')
            : localStorage.getItem(NF_REMOTE_SEEN_KEY);
          if (res.msg.id !== lastSeen) {
            // Если методист сейчас не смотрит на вкладку (вкладка свёрнута), ждём пока откроет вкладку!
            if (document.hidden) {
              nfRemotePendingMsg = res.msg;
            } else {
              nfRemoteShowPopup(res.msg);
            }
          }
        } else {
          // Если сообщение было отменено на сервере (или истекло) — сбрасываем ожидание и закрываем неподтверждённое окно
          nfRemotePendingMsg = null;
          document.getElementById('nf-remote-popup')?.remove();
        }
      }
    } catch (_) {}
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && nfRemotePendingMsg) {
      // Переспрашиваем сервер перед показом, чтобы не показать сообщение, если админ уже успел его отменить
      nfRemotePoll();
    }
  });

  setInterval(nfRemotePoll, NF_REMOTE_POLL_MS);
  setTimeout(nfRemotePoll, 3500);
  setTimeout(nfCloudCheckStartup, 4200);
  setInterval(() => {
    const s = loadStats();
    if (s.records.length > 0) nfCloudPushNow({ manual: false });
  }, 15 * 60 * 1000);

  function inject() {
    document.querySelectorAll('[data-task-id]').forEach(card => { addCopyButton(card); addViewRow(card); });
    injectPanels();
    syncAttach();
    refreshView();
    scanRotate();
    trackAnswers();
    injectFinishModePicker();
    ensureStatsWidget();
    nfTgInject();
    scanMessages(); // обновляем счётчик сообщений при каждом изменении DOM
    shiftInject();
    nfRegInject();
    nfBackupInject();
    nfQuickReplyInject();
    nfFocusInject();
    nfChatLocksInject();
    if (!nfCloudState.checkedStartup) nfCloudCheckStartup();
  }

  let timer;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(inject, 300);
  }).observe(document.body, { childList: true, subtree: true });

  inject();
})();
