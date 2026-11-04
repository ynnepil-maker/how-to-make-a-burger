/* How to make a burger — 互動引擎
   不使用任何外部套件，不追蹤、不收集資料，也不使用瀏覽器儲存空間。
   進度只放在網址的 # 後面，方便重新整理後回到同一頁。 */
(function () {
  'use strict';

  var SITE = window.SITE, CHAPTERS = window.CHAPTERS;
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage'), prevBtn = $('prevBtn'), nextBtn = $('nextBtn'), foot = $('foot');

  /* 攤平成一維清單 */
  var flat = [];
  CHAPTERS.forEach(function (ch, ci) {
    ch.screens.forEach(function (s, si) { flat.push({ ci: ci, si: si, ch: ch, s: s }); });
  });

  var cur = 0;
  var done = {};     // 這一頁是否已完成
  var mem = {};      // 各畫面暫存的作答狀態（只在這次瀏覽中存在）
  var choice = {};   // 跨畫面的選擇，例如第 5 關的動機

  /* 斷句：中文沒有字詞邊界，瀏覽器會在任何兩個字之間換行。
     標題用「|」標出可以換行的位置；題目與選項則在標點後自動斷開（每段不超過 13 字才當成一個整體）。 */
  function phr(str) {
    if (str.indexOf('|') < 0) return str;
    return str.split('|').map(function (p) { return '<span class="nb">' + p + '</span>'; }).join('');
  }
  function autoPhr(str) {
    if (/[<>]/.test(str)) return str;
    var parts = str.split(/(?<=[，、：；？。！])/);
    if (parts.length < 2) return str;
    return parts.map(function (p) { return [...p].length <= 13 ? '<span class="nb">' + p + '</span>' : p; }).join('');
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function html(el, h) { el.innerHTML = h; }

  /* ───── 小工具 ───── */
  function frame(file, alt, cls) {
    return '<div class="frame ' + (cls || '') + '"><img src="images/' + esc(file) + '" alt="' + esc(alt || '') + '" loading="eager" decoding="async" width="4" height="3"></div>';
  }
  function paras(arr) { return (arr && arr.length) ? '<div class="body">' + arr.map(function (p) { return '<p>' + p + '</p>'; }).join('') + '</div>' : ''; }
  function note(t) { return t ? '<p class="note">' + t + '</p>' : ''; }
  function chip(i) { var f = flat[i]; return '<p class="chip">' + esc(f.ch.tag) + (f.ch.id === 'p' || f.ch.id === 'end' ? '' : '・' + f.ch.name.split('：')[0]) + '</p>'; }
  function head(i, s) { return chip(i) + '<h2 class="title">' + phr(s.title) + '</h2>'; }
  function fb(kind, text) {
    return '<p class="fb ' + kind + '" role="status"><span class="fb-mk" aria-hidden="true">' + (kind === 'ok' ? '✓' : '✗') + '</span>' + text + '</p>';
  }
  function shuffled(n, seed) {
    var a = [], i; for (i = 0; i < n; i++) a.push(i);
    var x = seed * 9301 + 49297;
    for (i = n - 1; i > 0; i--) { x = (x * 9301 + 49297) % 233280; var j = Math.floor(x / 233280 * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    var same = a.every(function (v, k) { return v === k; });
    if (same && n > 1) a.push(a.shift());
    return a;
  }
  function copyText(text, btn) {
    var ok = function () { var o = btn.textContent; btn.textContent = '已複製'; setTimeout(function () { btn.textContent = o; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) {} document.body.removeChild(ta);
    }
  }
  function setDone(i, v) { done[i] = v; updateNav(); }

  /* ───── 各畫面類型 ───── */
  var R = {};  // R.type(i, s, card) → 回傳 HTML；R.type.bind(i, s, card) → 綁事件

  R.cover = {
    render: function (i, s) {
      return '<div class="deco" aria-hidden="true"></div><div class="cover">' + frame(s.img, s.alt) +
        '<h1 class="title">' + s.title + '</h1><p class="sub body">' + s.body[0] + '</p>' +
        '<div class="actions"><button class="btn" type="button" data-go="next">' + s.btn + '</button></div>' + note(s.note) + '</div>';
    }
  };

  R.story = {
    render: function (i, s) {
      var h = head(i, s);
      if (s.img) h += frame(s.img, s.alt);
      if (s.gallery) h += '<div class="gallery" style="--n:' + Math.min(s.gallery.length, 3) + '">' + s.gallery.map(function (g) { return '<figure>' + frame(g.img, g.cap, g.fit === 'cover' ? 'cover' : '') + '<figcaption>' + g.cap + '</figcaption></figure>'; }).join('') + '</div>';
      if (s.envelope) h += '<div class="env">' + envelopeSVG() + '</div>';
      if (s.dialog) h += '<div class="bubbles">' + s.dialog.map(function (d, k) {
        var right = d.who !== s.dialog[0].who;
        return '<div class="bub' + (right ? ' r' : '') + '"><span class="who">' + d.who + '</span><p>「' + d.t + '」</p></div>';
      }).join('') + '</div>';
      if (s.dynamic === 'motive') {
        h += paras([s.replies[choice.motive || 'fun']]);
      }
      h += paras(s.body);
      if (s.cards4) h += '<div class="grid4">' + s.cards4.map(function (c) { return '<div class="g4"><h3>' + c.h + '</h3><p>' + c.d + '</p></div>'; }).join('') + '</div>';
      if (s.twoCols) h += '<div class="cols2">' + s.twoCols.map(function (c, k) { return '<div class="col ' + (k ? 'no' : 'yes') + '"><h3>' + c.h + '</h3><ul>' + c.l.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>'; }).join('') + '</div>';
      if (s.bullets) h += '<ul class="bul">' + s.bullets.map(function (b) { return '<li>' + b + '</li>'; }).join('') + '</ul>';
      h += note(s.note);
      return h;
    },
    ready: function (i, s) { setDone(i, true); }
  };

  function envelopeSVG() {
    return '<svg viewBox="0 0 360 230" role="img" aria-label="一封蓋著「下架」章的信">' +
      '<rect x="20" y="40" width="320" height="170" rx="8" fill="#F9E7C3" stroke="#0F3D24" stroke-width="4"/>' +
      '<path d="M24 46 L180 150 L336 46" fill="none" stroke="#0F3D24" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M24 206 L130 120 M336 206 L230 120" fill="none" stroke="#0F3D24" stroke-width="3"/>' +
      '<g transform="rotate(-14 250 150)"><rect x="196" y="118" width="110" height="56" rx="6" fill="#FAF3E0" fill-opacity=".92" stroke="#F96B16" stroke-width="5"/>' +
      '<text x="251" y="157" text-anchor="middle" font-size="30" font-weight="800" fill="#0F3D24" font-family="Chiron GoRound TC, Nunito, sans-serif" letter-spacing="3">下架</text></g></svg>';
  }

  /* 單選 */
  R.single = {
    render: function (i, s) {
      var m = mem[i] || (mem[i] = {});
      var h = head(i, s);
      if (s.img) h += frame(s.img, s.alt);
      h += paras(s.body);
      h += '<div class="q"><div class="opts" role="group" aria-label="選項">' + s.options.map(function (o, k) {
        var cls = '';
        if (m.pick === k && !s.noFb) cls = o.ok ? ' right' : ' wrong';
        return '<button class="opt' + cls + '" type="button" data-k="' + k + '" aria-pressed="' + (m.pick === k) + '"><span class="mk" aria-hidden="true"></span><span>' + autoPhr(o.t) + '</span></button>';
      }).join('') + '</div></div>';
      h += '<div id="fbBox">' + (m.pick != null && !s.noFb ? fb(s.options[m.pick].ok ? 'ok' : 'bad', s.options[m.pick].fb) : '') + '</div>';
      return h;
    },
    ready: function (i, s) { var m = mem[i] || {}; setDone(i, m.pick != null); },
    bind: function (i, s, root) {
      root.addEventListener('click', function (e) {
        var b = e.target.closest('.opt'); if (!b) return;
        var k = +b.dataset.k, o = s.options[k], m = mem[i];
        m.pick = k;
        if (s.key && o.v) choice[s.key] = o.v;
        rerender(); setDone(i, true);
      });
    }
  };

  /* 多題單選（含配對） */
  R.multi = {
    render: function (i, s) {
      var m = mem[i] || (mem[i] = { a: [], checked: false, result: null });
      var h = head(i, s);
      h += paras(s.body);
      if (s.context) h += '<p class="q-ctx">' + s.context + '</p>';
      h += s.questions.map(function (q, qi) {
        return '<div class="q"><p class="q-t">' + (s.questions.length > 1 ? (qi + 1) + '．' : '') + autoPhr(q.q) + '</p><div class="opts' + (q.options.length <= 4 && q.options.join('').length < 22 ? ' inline' : '') + '" role="group">' + q.options.map(function (o, k) {
          var cls = '';
          if (m.checked && m.a[qi] === k) cls = (k === q.a) ? ' right' : ' wrong';
          return '<button class="opt' + cls + '" type="button" data-q="' + qi + '" data-k="' + k + '" aria-pressed="' + (m.a[qi] === k) + '"' + (m.result === 'ok' ? ' disabled' : '') + '><span class="mk" aria-hidden="true"></span><span>' + o + '</span></button>';
        }).join('') + '</div></div>';
      }).join('');
      var all = s.questions.every(function (q, qi) { return m.a[qi] != null; });
      h += '<div class="actions"><button class="btn" type="button" id="chk"' + (all && m.result !== 'ok' ? '' : ' disabled') + '>' + (m.checked && m.result !== 'ok' ? '再檢查一次' : '檢查答案') + '</button></div>';
      h += '<div id="fbBox">' + (m.result === 'ok' ? fb('ok', s.fbOk) : m.result === 'bad' ? fb('bad', SITE.bad + ' ' + s.fbBad) : '') + '</div>';
      return h;
    },
    ready: function (i, s) { setDone(i, !!(mem[i] && mem[i].checked)); },
    bind: function (i, s, root) {
      root.addEventListener('click', function (e) {
        var m = mem[i], b = e.target.closest('.opt');
        if (b && !b.disabled) { m.a[+b.dataset.q] = +b.dataset.k; m.checked = false; m.result = null; rerender(); return; }
        if (e.target.closest('#chk')) {
          var ok = s.questions.every(function (q, qi) { return m.a[qi] === q.a; });
          m.checked = true; m.result = ok ? 'ok' : 'bad';
          rerender(); setDone(i, true);
        }
      });
    }
  };

  /* 分類（點選所屬的一邊） */
  R.classify = {
    render: function (i, s) {
      var m = mem[i] || (mem[i] = { z: [], checked: false, result: null });
      var h = head(i, s);
      h += paras(s.body);
      h += '<div class="cards">' + s.cards.map(function (c, k) {
        var cls = '';
        if (m.checked) cls = (m.z[k] === c.z) ? ' right' : ' wrong';
        return '<div class="cc' + (c.icon ? '' : ' noicon') + cls + '">' + (c.icon ? '<img class="ic" src="images/' + c.icon + '" alt="" loading="eager">' : '') +
          '<span class="ct">' + autoPhr(c.t) + '</span><div class="zs" role="group" aria-label="' + esc(c.t) + '">' + s.zones.map(function (z, zi) {
            return '<button class="zbtn" type="button" data-c="' + k + '" data-z="' + zi + '" aria-pressed="' + (m.z[k] === zi) + '">' + z + '</button>';
          }).join('') + '</div>' + (m.checked ? '<p class="res">' + ((m.z[k] === c.z) ? '✓ 放對了' : '✗ 再想想') + '</p>' : '') + '</div>';
      }).join('') + '</div>';
      var all = s.cards.every(function (c, k) { return m.z[k] != null; });
      h += '<div class="actions"><button class="btn" type="button" id="chk"' + (all && m.result !== 'ok' ? '' : ' disabled') + '>' + (m.checked && m.result !== 'ok' ? '再檢查一次' : '檢查答案') + '</button></div>';
      h += '<div id="fbBox">' + (m.result === 'ok' ? fb('ok', s.fbOk) : m.result === 'bad' ? fb('bad', s.fbBad) : '') + '</div>';
      return h;
    },
    ready: function (i, s) { setDone(i, !!(mem[i] && mem[i].checked)); },
    bind: function (i, s, root) {
      root.addEventListener('click', function (e) {
        var m = mem[i], b = e.target.closest('.zbtn');
        if (b && m.result !== 'ok') { m.z[+b.dataset.c] = +b.dataset.z; m.checked = false; m.result = null; rerender(true); return; }
        if (e.target.closest('#chk')) {
          var ok = s.cards.every(function (c, k) { return m.z[k] === c.z; });
          m.checked = true; m.result = ok ? 'ok' : 'bad';
          rerender(true); setDone(i, true);
        }
      });
    }
  };

  /* 排序（依序點選） */
  R.order = {
    render: function (i, s) {
      var m = mem[i] || (mem[i] = { seq: [], checked: false, result: null, order: shuffled(s.steps.length, i + 3) });
      var h = head(i, s);
      h += paras(s.body);
      h += '<ol class="steps">' + m.order.map(function (idx) {
        var pos = m.seq.indexOf(idx), cls = '';
        if (m.checked && pos > -1) cls = (pos === idx) ? ' right' : ' wrong';
        return '<li><button class="stp' + cls + '" type="button" data-k="' + idx + '" aria-pressed="' + (pos > -1) + '"><span class="num" aria-hidden="true">' + (pos > -1 ? pos + 1 : '') + '</span><span>' + autoPhr(s.steps[idx]) + '</span></button></li>';
      }).join('') + '</ol>';
      var all = m.seq.length === s.steps.length;
      h += '<div class="actions"><button class="btn" type="button" id="chk"' + (all && m.result !== 'ok' ? '' : ' disabled') + '>' + (m.checked && m.result !== 'ok' ? '再檢查一次' : '檢查答案') + '</button>' +
        '<button class="btn btn-ghost" type="button" id="rst"' + (m.seq.length && m.result !== 'ok' ? '' : ' disabled') + '>重來</button></div>';
      h += '<div id="fbBox">' + (m.result === 'ok' ? fb('ok', s.fbOk) : m.result === 'bad' ? fb('bad', s.fbBad) : '') + '</div>';
      return h;
    },
    ready: function (i, s) { setDone(i, !!(mem[i] && mem[i].checked)); },
    bind: function (i, s, root) {
      root.addEventListener('click', function (e) {
        var m = mem[i], b = e.target.closest('.stp');
        if (b && m.result !== 'ok') {
          var k = +b.dataset.k, p = m.seq.indexOf(k);
          if (p > -1) m.seq.splice(p, 1); else m.seq.push(k);
          m.checked = false; m.result = null; rerender(true); return;
        }
        if (e.target.closest('#rst')) { m.seq = []; m.checked = false; m.result = null; rerender(true); return; }
        if (e.target.closest('#chk')) {
          var ok = m.seq.every(function (v, p) { return v === p; });
          m.checked = true; m.result = ok ? 'ok' : 'bad';
          rerender(true); setDone(i, true);
        }
      });
    }
  };

  /* 第 3 關：點單組合器 */
  R.builder = {
    render: function (i, s) {
      var m = mem[i] || (mem[i] = { v: [] });
      var h = head(i, s) + paras(s.body);
      h += s.dims.map(function (d, di) {
        return '<div class="dim"><h3>' + d.h + '</h3><div class="opts inline" role="group" aria-label="' + d.h + '">' + d.o.map(function (o, k) {
          return '<button class="opt" type="button" data-d="' + di + '" data-k="' + k + '" aria-pressed="' + (m.v[di] === k) + '"><span class="mk" aria-hidden="true"></span><span>' + o + '</span></button>';
        }).join('') + '</div></div>';
      }).join('');
      var all = s.dims.every(function (d, di) { return m.v[di] != null; });
      if (all) {
        var parts = s.dims.map(function (d, di) { return d.o[m.v[di]]; });
        h += '<div class="out"><p class="sent">請做一份「' + parts.join('、') + '」的漢堡。</p>' + frame(s.imgs[m.v[0]], parts[0]) + fb('ok', s.fb) + '</div>';
      } else {
        h += '<p class="out ph">四個維度都選好，就會出現你的點單與漢堡。</p>';
      }
      return h;
    },
    ready: function (i, s) { var m = mem[i]; setDone(i, !!m && s.dims.every(function (d, di) { return m.v[di] != null; })); },
    bind: function (i, s, root) {
      root.addEventListener('click', function (e) {
        var b = e.target.closest('.opt'); if (!b) return;
        mem[i].v[+b.dataset.d] = +b.dataset.k; rerender(true);
        setDone(i, s.dims.every(function (d, di) { return mem[i].v[di] != null; }));
      });
    }
  };

  /* 第 5 關：冰箱 */
  R.fridge = {
    render: function (i, s) {
      var m = mem[i] || (mem[i] = { amt: null, q: null });
      var h = head(i, s) + paras(s.body);
      h += '<div class="dim"><h3>分量</h3><div class="seg" role="group" aria-label="分量">' +
        ['少', '夠'].map(function (t, k) { return '<button type="button" data-t="amt" data-k="' + k + '" aria-pressed="' + (m.amt === k) + '">' + t + '</button>'; }).join('') + '</div></div>';
      h += '<div class="dim"><h3>品質</h3><div class="seg" role="group" aria-label="品質">' +
        ['差', '好'].map(function (t, k) { return '<button type="button" data-t="q" data-k="' + k + '" aria-pressed="' + (m.q === k) + '">' + t + '</button>'; }).join('') + '</div></div>';
      if (m.amt != null && m.q != null) {
        // 圖：左上＝夠＋好，右上＝夠＋差，左下＝少＋好，右下＝少＋差
        var x = (m.amt === 1 ? (m.q === 1 ? '0% 0%' : '100% 0%') : (m.q === 1 ? '0% 100%' : '100% 100%'));
        var caps = { '11': '漂亮的漢堡', '10': '歪斜乾癟的漢堡', '01': '只有薄薄一片的漢堡', '00': '勉強像漢堡的東西' };
        h += '<div class="fr-grid"><figure>' + frame(m.amt === 1 ? '05-fridge-stocked.jpg' : '05-fridge-empty.jpg', m.amt === 1 ? '塞滿食材的冰箱' : '幾乎空的冰箱') +
          '<figcaption>冰箱：' + (m.amt === 1 ? '分量夠' : '分量少') + '、品質' + (m.q === 1 ? '好' : '差') + '</figcaption></figure>' +
          '<figure><div class="crop" role="img" aria-label="' + caps['' + m.amt + m.q] + '" style="background-position:' + x + '"></div><figcaption>做出來：' + caps['' + m.amt + m.q] + '</figcaption></figure></div>' + fb('ok', s.fb);
      } else {
        h += '<p class="out ph">兩個都選好，就會看到結果。</p>';
      }
      return h;
    },
    ready: function (i, s) { var m = mem[i]; setDone(i, !!m && m.amt != null && m.q != null); },
    bind: function (i, s, root) {
      root.addEventListener('click', function (e) {
        var b = e.target.closest('.seg button'); if (!b) return;
        mem[i][b.dataset.t] = +b.dataset.k; rerender(true);
        setDone(i, mem[i].amt != null && mem[i].q != null);
      });
    }
  };

  /* 第 7 關：模擬 repo 頁 */
  R.repo = {
    render: function (i, s) {
      var m = mem[i] || (mem[i] = { fork: false, lic: false, hint: '' });
      var step = !m.fork ? 0 : !m.lic ? 1 : 2;
      var h = head(i, s) + paras(s.body);
      h += '<ul class="tasks"><li class="' + (m.fork ? 'done' : 'cur') + '">哪裡可以 fork？</li><li class="' + (m.lic ? 'done' : (m.fork ? 'cur' : '')) + '">授權寫在哪裡？</li></ul>';
      h += '<div class="rp" role="group" aria-label="模擬的食譜社群頁面">' +
        '<div class="rp-head"><p class="rp-name">auntie-egg-burger <small>公開</small></p><div class="rp-btns">' +
        '<button type="button" class="rp-hit" data-hit="star">收藏</button>' +
        '<button type="button" class="rp-hit' + (m.fork ? ' found' : '') + '" data-hit="fork">Fork</button></div></div>' +
        '<div class="rp-body"><div class="rp-main"><div class="rp-file"><span>sauce-recipe.txt</span><span>三天前</span></div><div class="rp-file"><span>egg-burger-steps.txt</span><span>一週前</span></div><div class="rp-file"><span>notes-on-thickness.txt</span><span>兩週前</span></div></div>' +
        '<div class="rp-side"><div><h4>關於</h4><p>阿姨的蛋堡作法，歡迎參考。</p></div>' +
        '<div><h4>說明</h4><button type="button" class="rp-lic' + (m.lic ? ' found' : '') + '" data-hit="lic">License：商用需先聯絡</button></div>' +
        '<div><h4>更新</h4><p>已有 12 人複製過</p></div></div></div></div>';
      h += '<div id="fbBox">' + (step === 2 ? fb('ok', 'Fork 按鈕在右上角，授權在側邊欄的 License。') : (m.hint ? fb('bad', m.hint) : '')) + '</div>';
      return h;
    },
    ready: function (i, s) { var m = mem[i]; setDone(i, !!m && m.fork && m.lic); },
    bind: function (i, s, root) {
      root.addEventListener('click', function (e) {
        var b = e.target.closest('.rp-hit, .rp-lic'); if (!b) return;
        var m = mem[i], hit = b.dataset.hit;
        if (!m.fork) {
          if (hit === 'fork') { m.fork = true; m.hint = ''; } else m.hint = '再找找看：要把別人的專案複製成自己的版本，按哪個鈕？';
        } else if (!m.lic) {
          if (hit === 'lic') { m.lic = true; m.hint = ''; } else m.hint = '再找找看：授權通常寫在側邊欄。';
        }
        rerender(true); setDone(i, m.fork && m.lic);
      });
    }
  };

  /* 第 9 關：勾選清單 */
  R.pick = {
    render: function (i, s) {
      var m = mem[i] || (mem[i] = { sel: [], checked: false, result: null, order: shuffled(s.cards.length, i + 7) });
      var h = head(i, s) + paras(s.body);
      h += '<div class="pks">' + m.order.map(function (k) {
        var c = s.cards[k], on = m.sel.indexOf(k) > -1, cls = '';
        if (m.checked) { if (on && c.ok) cls = ' right'; else if (on && !c.ok) cls = ' wrong'; }
        return '<button class="pk' + cls + '" type="button" data-k="' + k + '" aria-pressed="' + on + '"><span class="bx" aria-hidden="true"></span><span>' + autoPhr(c.t) + '</span></button>';
      }).join('') + '</div>';
      h += '<p class="count">已勾 ' + m.sel.length + ' / ' + s.need + ' 項</p>';
      h += '<div class="actions"><button class="btn" type="button" id="chk"' + (m.sel.length === s.need && m.result !== 'ok' ? '' : ' disabled') + '>' + (m.checked && m.result !== 'ok' ? '再檢查一次' : '檢查答案') + '</button></div>';
      h += '<div id="fbBox">' + (m.result === 'ok' ? fb('ok', s.fbOk) : m.result === 'bad' ? fb('bad', s.fbBad) : '') + '</div>';
      return h;
    },
    ready: function (i, s) { setDone(i, !!(mem[i] && mem[i].checked)); },
    bind: function (i, s, root) {
      root.addEventListener('click', function (e) {
        var m = mem[i], b = e.target.closest('.pk');
        if (b && m.result !== 'ok') {
          var k = +b.dataset.k, p = m.sel.indexOf(k);
          if (p > -1) m.sel.splice(p, 1); else m.sel.push(k);
          m.checked = false; m.result = null; rerender(true); return;
        }
        if (e.target.closest('#chk')) {
          var ok = s.cards.every(function (c, k) { return (m.sel.indexOf(k) > -1) === c.ok; });
          m.checked = true; m.result = ok ? 'ok' : 'bad';
          rerender(true); setDone(i, true);
        }
      });
    }
  };

  /* 結業：三選一小任務 */
  R.mission = {
    render: function (i, s) {
      var m = mem[i] || (mem[i] = { pick: null });
      var h = head(i, s) + paras(s.body);
      h += '<div class="tiles" role="group" aria-label="三選一">' + s.items.map(function (it, k) {
        return '<button class="tile" type="button" data-k="' + k + '" aria-pressed="' + (m.pick === k) + '">' + (k + 1) + '．' + it.h + '</button>';
      }).join('') + '</div>';
      if (m.pick != null) {
        var it = s.items[m.pick];
        h += '<div class="mi">' + (it.tpl ? '<p>範本，可以直接複製來改：</p><p class="tpl">' + it.tpl + '</p><button class="btn" type="button" id="cp">複製</button>' : '<p>' + it.d + '</p>') + '</div>';
      }
      h += note(s.note);
      return h;
    },
    ready: function (i, s) { setDone(i, true); },
    bind: function (i, s, root) {
      root.addEventListener('click', function (e) {
        var t = e.target.closest('.tile');
        if (t) { mem[i].pick = +t.dataset.k; rerender(true); return; }
        var cp = e.target.closest('#cp');
        if (cp) copyText(s.items[mem[i].pick].tpl, cp);
      });
    }
  };

  /* 結業：自我檢核（只在畫面上勾選，不儲存） */
  R.selfcheck = {
    render: function (i, s) {
      var m = mem[i] || (mem[i] = { on: [] });
      var h = head(i, s) + paras(s.body);
      h += '<div class="pks">' + s.items.map(function (t, k) {
        return '<button class="pk" type="button" data-k="' + k + '" aria-pressed="' + (m.on.indexOf(k) > -1) + '"><span class="bx" aria-hidden="true"></span><span>' + autoPhr(t) + '</span></button>';
      }).join('') + '</div>';
      h += '<p class="count">' + m.on.length + ' / ' + s.items.length + '</p>';
      return h;
    },
    ready: function (i, s) { setDone(i, true); },
    bind: function (i, s, root) {
      root.addEventListener('click', function (e) {
        var b = e.target.closest('.pk'); if (!b) return;
        var k = +b.dataset.k, m = mem[i], p = m.on.indexOf(k);
        if (p > -1) m.on.splice(p, 1); else m.on.push(k);
        rerender(true);
      });
    }
  };

  /* ───── 留言板（資料存在使用者自己的 Google 試算表，透過 Apps Script 讀寫） ───── */
  function guestbookHTML() {
    var on = !!SITE.guestbookUrl;
    return '<section class="gb" aria-labelledby="gbH"><h3 id="gbH" class="gb-h">留言板</h3>' +
      '<p class="note">留言會公開顯示，任何人都看得到。請不要留下電話、住址等個人資料。暱稱 20 字內，留言 100 字內。</p>' +
      '<form id="gbForm" class="gb-form" autocomplete="off"' + (on ? '' : ' aria-disabled="true"') + '>' +
      '<label class="gb-l" for="gbNick">暱稱</label><input id="gbNick" class="gb-in" type="text" maxlength="20" required' + (on ? '' : ' disabled') + '>' +
      '<label class="gb-l" for="gbMsg">留言內容</label><textarea id="gbMsg" class="gb-in gb-ta" maxlength="100" rows="3" required' + (on ? '' : ' disabled') + '></textarea>' +
      '<input id="gbHp" class="gb-hp" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<div class="gb-row"><span id="gbCount" class="note" aria-live="off">0 / 100</span><button class="btn" type="submit"' + (on ? '' : ' disabled') + '>送出留言</button></div>' +
      '<p id="gbStatus" class="note gb-status" role="status">' + (on ? '' : '留言板還沒開放。') + '</p></form>' +
      '<ul id="gbList" class="gb-list" aria-label="大家的留言"></ul></section>';
  }
  function mountGuestbook(root) {
    var url = SITE.guestbookUrl; if (!url) return;
    var list = root.querySelector('#gbList'), form = root.querySelector('#gbForm'), st = root.querySelector('#gbStatus');
    var nick = root.querySelector('#gbNick'), msg = root.querySelector('#gbMsg'), hp = root.querySelector('#gbHp'), cnt = root.querySelector('#gbCount');
    var last = 0;
    function item(it) {   // 一律用 textContent，使用者輸入的內容不會被當成 HTML
      var li = document.createElement('li'); li.className = 'gb-item';
      var h = document.createElement('p'); h.className = 'gb-meta';
      var n = document.createElement('b'); n.className = 'gb-nick'; n.textContent = it.n;
      var t = document.createElement('span'); t.textContent = it.t;
      h.appendChild(n); h.appendChild(t);
      var m = document.createElement('p'); m.className = 'gb-text'; m.textContent = it.m;
      li.appendChild(h); li.appendChild(m); return li;
    }
    function show(items) {
      list.textContent = '';
      if (!items.length) { var e = document.createElement('li'); e.className = 'gb-empty'; e.textContent = '還沒有留言，你可以當第一個。'; list.appendChild(e); return; }
      items.forEach(function (it) { list.appendChild(item(it)); });
    }
    st.textContent = '載入留言中…';
    fetch(url).then(function (r) { return r.json(); }).then(function (d) { st.textContent = ''; show(d.items || []); })
      .catch(function () { st.textContent = '留言載入失敗，請稍後再試。'; });
    msg.addEventListener('input', function () { cnt.textContent = [...msg.value].length + ' / 100'; });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (Date.now() - last < 15000) { st.textContent = '請稍等一下再送出下一則。'; return; }
      var n = nick.value.trim(), m = msg.value.trim();
      if (!n || !m) { st.textContent = '暱稱和留言都要填。'; return; }
      st.textContent = '送出中…'; last = Date.now();
      fetch(url, { method: 'POST', body: JSON.stringify({ n: n, m: m, hp: hp.value }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.ok) { st.textContent = d.error === 'busy' ? '現在留言的人有點多，請 5 秒後再試。' : '送出失敗，請稍後再試。'; return; }
          var ph = list.querySelector('.gb-empty'); if (ph) ph.remove();
          list.insertBefore(item(d.item), list.firstChild);
          nick.value = n; msg.value = ''; cnt.textContent = '0 / 100'; st.textContent = '已送出，謝謝你的留言。';
        })
        .catch(function () { st.textContent = '送出失敗，請稍後再試。'; });
    });
  }

  R.final = {
    render: function (i, s) {
      return '<div class="deco" aria-hidden="true"></div>' + chip(i) + '<h2 class="title">' + phr(s.title) + '</h2>' + paras(s.body) +
        (s.thanks ? '<p class="chip chip-sm">感謝</p>' + paras([s.thanks]) : '') +
        (s.credits ? '<ul class="credits">' + s.credits.map(function (c) { return '<li>' + c + '</li>'; }).join('') + '</ul>' : '') +
        '<div class="actions"><button class="btn" type="button" data-go="restart">' + s.btn + '</button></div>' +
        (s.guestbook ? guestbookHTML() : '');
    },
    mount: function (i, s, root) {
      if (s.guestbook) mountGuestbook(root);
    }
  };

  /* ───── 畫面切換 ───── */
  var curRoot = null;
  var popIdx = -1;   // 剛被點的按鈕，重新渲染後只讓它彈一下

  function renderScreen(i, keepScroll) {
    var f = flat[i], s = f.s, r = R[s.type];
    var cardCls = 'card' + (s.summary ? ' sum' : '') + (s.type === 'cover' ? ' cover-card' : '') + (keepScroll ? ' still' : '');
    var h = '<article class="' + cardCls + '" id="card" data-type="' + s.type + '">' + r.render(i, s) + '</article>' +
      '<div class="page-foot"><p class="note">' + SITE.footer + '</p></div>';
    var y = window.pageYOffset;
    html(stage, h);
    watchImages();
    curRoot = $('card');
    if (R[s.type].mount && !keepScroll) R[s.type].mount(i, s, curRoot);
    if (keepScroll) {
      window.scrollTo(0, y);
      if (popIdx > -1) {
        var btns = curRoot.querySelectorAll('button');
        if (btns[popIdx]) { btns[popIdx].classList.add('pop'); btns[popIdx].focus({ preventScroll: true }); }
        popIdx = -1;
      }
    }
    return curRoot;
  }

  function rerender(keepScroll) {
    // 事件使用單一委派綁在 stage 上，重新渲染不會重複綁定
    renderScreen(cur, true);
  }

  function watchImages() {
    stage.querySelectorAll('.frame img').forEach(function (img) {
      var fr = img.closest('.frame');
      img.addEventListener('error', function () { fr.classList.add('missing'); }, { once: true });
      if (img.complete && img.naturalWidth === 0) fr.classList.add('missing');
    });
  }

  function go(i, opts) {
    opts = opts || {};
    if (i < 0 || i >= flat.length) return;
    cur = i;
    var s = flat[i].s;
    renderScreen(i, false);
    if (R[s.type].ready) R[s.type].ready(i, s);
    updateNav();
    updateBar();
    var h = flat[i].ch.id + '-' + (flat[i].si + 1);
    try { history.replaceState(null, '', '#' + h); } catch (e) { /* 部分環境不允許 */ }
    closeMenu();
    if (!opts.noScroll) window.scrollTo(0, 0);
    stage.focus({ preventScroll: true });
  }

  /* 單一事件委派：各畫面的互動由 delegate() 轉發 */
  stage.addEventListener('click', function (e) {
    var g = e.target.closest('[data-go]');
    if (g) { if (g.dataset.go === 'next') go(cur + 1); else if (g.dataset.go === 'restart') { mem = {}; done = {}; choice = {}; go(0); } return; }
    var s = flat[cur].s, r = R[s.type];
    var hit = e.target.closest('#card button.opt, #card button.zbtn, #card button.stp, #card button.pk, #card button.tile, #card .seg button, #card button.rp-hit, #card button.rp-lic');
    popIdx = hit ? Array.prototype.indexOf.call($('card').querySelectorAll('button'), hit) : -1;
    if (r.handle) r.handle(e);
  });

  /* 把各類型的 bind 改成使用 handle（單一委派）：包裝 */
  Object.keys(R).forEach(function (k) {
    var r = R[k];
    if (r.bind) {
      var fake = { handlers: [], addEventListener: function (ev, fn) { this.handlers.push(fn); } };
      r.bind(-1, {}, fake);
      r.handle = function (e) {
        var i = cur, s = flat[i].s;
        var f = { handlers: [], addEventListener: function (ev, fn) { this.handlers.push(fn); } };
        r.bind(i, s, f);
        f.handlers.forEach(function (fn) { fn(e); });
      };
    }
  });

  /* ───── 導覽 ───── */
  function updateNav() {
    var f = flat[cur], s = f.s;
    var hide = (s.type === 'cover' || s.type === 'final');
    foot.hidden = hide;
    prevBtn.disabled = cur === 0;
    var last = f.si === f.ch.screens.length - 1;
    nextBtn.textContent = s.btn && s.type === 'story' ? s.btn : (last ? '進下一關' : '下一步');
    var need = !!(R[s.type] && R[s.type].ready);
    nextBtn.disabled = need && !done[cur];
    if (cur === flat.length - 1) nextBtn.disabled = true;
  }
  function updateBar() {
    var f = flat[cur];
    $('barTag').textContent = f.ch.tag + (f.ch.id === 'p' ? '' : '・' + f.ch.name.split('：')[0]);
    $('barCount').textContent = (f.si + 1) + ' / ' + f.ch.screens.length;
    var pct = Math.round(cur / (flat.length - 1) * 100);
    $('barFill').style.width = pct + '%';
    $('barProg').setAttribute('aria-valuenow', pct);
  }

  prevBtn.addEventListener('click', function () { go(cur - 1); });
  nextBtn.addEventListener('click', function () { go(cur + 1); });

  /* 目錄 */
  var menu = $('menu'), menuBtn = $('menuBtn');
  function buildMenu() {
    var h = '';
    var idx = 0;
    CHAPTERS.forEach(function (ch, ci) {
      h += '<li><button type="button" data-idx="' + idx + '" data-ci="' + ci + '"><span class="m-tag">' + ch.tag + '</span><span class="m-name">' + ch.name + '</span></button></li>';
      idx += ch.screens.length;
    });
    $('menuList').innerHTML = h;
  }
  function openMenu() {
    menu.hidden = false; menuBtn.setAttribute('aria-expanded', 'true');
    menu.querySelectorAll('button').forEach(function (b) { b.classList.toggle('cur', +b.dataset.ci === flat[cur].ci); });
  }
  function closeMenu() { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
  menuBtn.addEventListener('click', function () { menu.hidden ? openMenu() : closeMenu(); });
  menu.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) go(+b.dataset.idx); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });

  /* 從網址還原位置 */
  function fromHash() {
    var m = /^#([a-z0-9]+)-(\d+)$/.exec(location.hash || '');
    if (!m) return 0;
    for (var i = 0; i < flat.length; i++) if (flat[i].ch.id === m[1] && flat[i].si === (+m[2] - 1)) return i;
    return 0;
  }
  window.addEventListener('hashchange', function () { var i = fromHash(); if (i !== cur) go(i); });

  buildMenu();
  go(fromHash(), { noScroll: true });
})();
