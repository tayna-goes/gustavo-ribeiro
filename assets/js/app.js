/* lib/core.js */
/* Núcleo: registro de módulos e inicialização isolada (um módulo com erro não derruba os outros). */
(function (root) {
  'use strict';

  var GR = (root.GR = root.GR || {});
  var order = [];

  GR.modules = {};
  GR.errors = [];
  GR.ready = false;

  GR.reduced = function () {
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  };

  /** Mouse de verdade (com hover). Em celular os efeitos de ponteiro ficam desligados. */
  GR.fine = function () {
    return !!(root.matchMedia && root.matchMedia('(hover: hover) and (pointer: fine)').matches);
  };

  GR.register = function (name, mod) {
    GR.modules[name] = mod;
    GR[name] = mod;
    order.push(name);
  };

  GR.init = function ($) {
    order.forEach(function (name) {
      var mod = GR.modules[name];
      if (!mod || typeof mod.init !== 'function') return;
      try {
        mod.init($);
      } catch (err) {
        GR.errors.push({ module: name, error: err });
        if (root.console) root.console.error('[GR] módulo "' + name + '" falhou:', err);
      }
    });
    GR.ready = true;
    $(root.document).trigger('gr:ready');
  };
})(window);

/* modules/theme.js */
/* Botão de tema claro/escuro. A escolha fica salva neste navegador; sem escolha, segue o sistema. */
(function ($, GR) {
  'use strict';

  var KEY = 'gr-theme';
  var COLORS = { dark: '#0c0e10', light: '#f6f4ef' };

  GR.register('theme', {
    current: function () {
      return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    },

    apply: function (theme) {
      document.documentElement.setAttribute('data-theme', theme);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', COLORS[theme]);
      var btn = document.querySelector('[data-theme-toggle]');
      if (btn) {
        var next = theme === 'light' ? 'escuro' : 'claro';
        btn.setAttribute('aria-label', 'Mudar para o modo ' + next);
        btn.setAttribute('title', 'Modo ' + next);
      }
    },

    save: function (theme) {
      try { window.localStorage.setItem(KEY, theme); } catch (e) { /* sem armazenamento: vale só nesta visita */ }
    },

    init: function () {
      var self = GR.theme;
      self.apply(self.current());
      $(document).on('click', '[data-theme-toggle]', function () {
        var next = self.current() === 'light' ? 'dark' : 'light';
        self.apply(next);
        self.save(next);
      });
      // Enquanto o visitante não escolher, acompanha o sistema (ex.: modo escuro automático à noite).
      var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)');
      if (mq && mq.addEventListener) {
        mq.addEventListener('change', function (e) {
          var stored = null;
          try { stored = window.localStorage.getItem(KEY); } catch (err) { /* ignora */ }
          if (!stored) self.apply(e.matches ? 'light' : 'dark');
        });
      }
    }
  });
})(window.jQuery, window.GR);

/* lib/math.js */
/* Funções puras (sem DOM), usadas pelos efeitos e testadas isoladamente. */
(function (GR) {
  'use strict';

  var M = (GR.math = {});

  M.clamp = function (v, min, max) {
    return Math.min(max, Math.max(min, v));
  };

  M.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };

  /** Índice circular: wrap(-1, 5) → 4 */
  M.wrap = function (i, len) {
    return ((i % len) + len) % len;
  };

  M.pad = function (n, len) {
    var s = String(n);
    while (s.length < len) s = '0' + s;
    return s;
  };

  /**
   * Progresso de entrada de um elemento: 0 quando o topo encosta na base da tela,
   * 1 quando o topo chega a `end` (fração da altura da tela, padrão 0,55).
   */
  M.riseProgress = function (top, vh, end) {
    var e = end == null ? 0.55 : end;
    var p = (vh - top) / (vh - vh * e);
    return M.clamp(p, 0, 1);
  };

  /** Deslocamento vertical do parallax: 0 quando o centro do elemento está no centro da tela. */
  M.parallaxOffset = function (centerY, vh, speed) {
    return (centerY - vh / 2) * speed;
  };

  /** Inclinação 3D para um ponteiro em (px, py), ambos de 0 a 1 dentro do elemento. */
  M.tilt = function (px, py, max) {
    return { rx: (0.5 - py) * 2 * max, ry: (px - 0.5) * 2 * max };
  };

  /** Coverflow: rotação e escala conforme a distância (px) ao centro do carrossel. */
  M.coverflow = function (dist, width) {
    var n = dist / width;
    return {
      ry: M.clamp(-n * 14, -28, 28) + 0, // + 0 troca -0 por 0
      scale: 1 - Math.min(Math.abs(n), 2) * 0.05,
    };
  };

  /** Número do "quadro" (1 a total) conforme o progresso da página (0 a 1). */
  M.frameNumber = function (progress, total) {
    return M.clamp(1 + Math.floor(M.clamp(progress, 0, 1) * (total - 1)), 1, total);
  };
})((window.GR = window.GR || {}));

/* lib/quote.js */
/* Regras do formulário de orçamento. Funções puras (sem DOM), testadas isoladamente. */
(function (GR) {
  'use strict';

  var Q = (GR.quote = {});

  var WEEK = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  var MONTH = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  Q.MAX_YEARS = 5;

  var pad = function (n) { return (n < 10 ? '0' : '') + n; };

  /** Data local de hoje como "AAAA-MM-DD" (não usa toISOString, que é UTC e erra a data à noite no Brasil). */
  Q.today = function (d) {
    var now = d || new Date();
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  };

  /** Soma anos a uma data "AAAA-MM-DD". */
  Q.addYears = function (iso, years) {
    var p = iso.split('-');
    return Number(p[0]) + years + '-' + p[1] + '-' + p[2];
  };

  /** "AAAA-MM-DD" que existe de verdade (rejeita 2026-02-30, 2026-13-01, "abc"). */
  Q.validDate = function (iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return false;
    var y = +m[1], mo = +m[2], d = +m[3];
    var dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
  };

  /** "sábado, 12 de dezembro de 2026" (sem Intl, sem fuso: o resultado não muda de computador para computador). */
  Q.formatDate = function (iso) {
    if (!Q.validDate(iso)) return '';
    var p = iso.split('-').map(Number);
    var dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
    return WEEK[dow] + ', ' + p[2] + ' de ' + MONTH[p[1] - 1] + ' de ' + p[0];
  };

  Q.validEmail = function (s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());
  };

  /** Só dígitos; aceita telefone com ou sem DDI. Vazio é válido (campo opcional). */
  Q.validPhone = function (s) {
    var v = String(s || '').trim();
    if (!v) return true;
    if (/[^\d\s()+\-.]/.test(v)) return false;
    var n = v.replace(/\D/g, '').length;
    return n >= 10 && n <= 15;
  };

  /** Devolve { campo: "mensagem" } só com os campos inválidos. Vazio = tudo certo. */
  Q.validate = function (v, todayIso) {
    var e = {};
    var nome = String(v.nome || '').trim();
    if (nome.length < 2) e.nome = 'Escreva seu nome.';
    if (!String(v.email || '').trim()) e.email = 'Escreva seu e-mail.';
    else if (!Q.validEmail(v.email)) e.email = 'Confira o e-mail. Exemplo: nome@email.com';
    if (!Q.validPhone(v.whatsapp)) e.whatsapp = 'Use só números, com DDD. Exemplo: 11 91234-5678';
    if (!v.tipo) e.tipo = 'Escolha o tipo de sessão.';
    else if (!v.proposta) e.proposta = 'Escolha a proposta que deseja.';

    if (!v.semData) {
      var today = todayIso || Q.today();
      if (!v.data) e.data = 'Escolha uma data ou marque "Ainda não tenho a data".';
      else if (!Q.validDate(v.data)) e.data = 'Essa data não existe. Confira o dia e o mês.';
      else if (v.data < today) e.data = 'Escolha uma data a partir de hoje.';
      else if (v.data > Q.addYears(today, Q.MAX_YEARS)) e.data = 'Escolha uma data dentro dos próximos ' + Q.MAX_YEARS + ' anos.';
    }
    if (String(v.detalhes || '').length > 1000) e.detalhes = 'Use até 1000 caracteres.';
    if (!v.consent) e.consent = 'Marque para eu poder responder seu pedido.';
    return e;
  };

  /** Texto do pedido (usado no WhatsApp e no e-mail). */
  Q.message = function (v, brand) {
    var lines = ['Olá, ' + (brand ? brand.split(' ')[0] : 'tudo bem') + '! Vim pelo seu site e gostaria de um orçamento.', ''];
    lines.push('Nome: ' + String(v.nome).trim());
    lines.push('Tipo de sessão: ' + v.tipo);
    if (v.propostaLabel) lines.push('Proposta: ' + v.propostaLabel);
    lines.push('Data: ' + (v.semData || !v.data ? 'ainda não definida' : Q.formatDate(v.data)));
    if (String(v.local || '').trim()) lines.push('Local: ' + String(v.local).trim());
    lines.push('E-mail: ' + String(v.email).trim());
    if (String(v.whatsapp || '').trim()) lines.push('WhatsApp: ' + String(v.whatsapp).trim());
    if (String(v.detalhes || '').trim()) lines.push('', 'Detalhes: ' + String(v.detalhes).trim());
    return lines.join('\n');
  };

  Q.whatsappUrl = function (number, text) {
    var digits = String(number || '').replace(/\D/g, '');
    if (!digits) return '';
    // Mantém a URL num tamanho seguro para o WhatsApp.
    var t = text.length > 1400 ? text.slice(0, 1397) + '...' : text;
    return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(t);
  };

  Q.mailtoUrl = function (email, subject, body) {
    return 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  };

  /** Corpo enviado ao endpoint. */
  Q.payload = function (v, origin, extra) {
    var out = {
      nome: String(v.nome).trim(),
      email: String(v.email).trim(),
      whatsapp: String(v.whatsapp || '').trim(),
      tipo: v.tipo,
      proposta: v.propostaLabel || v.proposta || '',
      data: v.semData ? '' : v.data || '',
      data_formatada: v.semData || !v.data ? 'ainda não definida' : Q.formatDate(v.data),
      local: String(v.local || '').trim(),
      detalhes: String(v.detalhes || '').trim(),
      consentimento: true,
      origem: origin || '',
    };
    // Web3Forms pede a chave pública (access_key); o assunto e o remetente deixam o e-mail recebido legível.
    if (extra && extra.accessKey) {
      out.access_key = extra.accessKey;
      out.subject = 'Novo pedido de orçamento: ' + (extra.brand || '') + (v.tipo ? ' (' + v.tipo + ')' : '');
      out.from_name = extra.brand || '';
      out.replyto = String(v.email).trim();
    }
    return out;
  };
})((window.GR = window.GR || {}));

/* modules/scene.js */
/* Cena: parallax e entrada 3D ao rolar. Só escreve variáveis CSS (--p, --rise, --py); o CSS faz o resto. */
(function ($, GR) {
  'use strict';

  var M = GR.math;
  var items = [];
  var pending = false;
  var hero = null;
  var counter = null;
  var total = 36;
  var motion = true;

  function measure() {
    items = [];
    $('[data-rise], [data-parallax]').each(function () {
      var el = this;
      el.style.removeProperty('--rise');
      el.style.removeProperty('--py');
      var r = el.getBoundingClientRect();
      items.push({
        el: el,
        top: r.top + window.pageYOffset,
        h: r.height,
        rise: el.hasAttribute('data-rise'),
        speed: parseFloat(el.getAttribute('data-parallax')) || 0,
      });
    });
  }

  function tick() {
    pending = false;
    var y = window.pageYOffset;
    var vh = window.innerHeight;
    var doc = document.documentElement;
    var max = Math.max(1, doc.scrollHeight - vh);

    if (counter) counter.textContent = M.pad(M.frameNumber(y / max, total), 2);
    if (!motion) return;

    if (hero) hero.style.setProperty('--p', M.clamp(y / vh, 0, 1).toFixed(3));

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var top = it.top - y;
      if (it.rise) it.el.style.setProperty('--rise', M.riseProgress(top, vh).toFixed(3));
      if (it.speed) it.el.style.setProperty('--py', M.parallaxOffset(top + it.h / 2, vh, it.speed).toFixed(1));
    }
  }

  function request() {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(tick);
  }

  function remeasure() {
    if (motion) measure();
    tick();
  }

  GR.register('scene', {
    init: function () {
      motion = !GR.reduced();
      hero = document.querySelector('[data-hero]');
      counter = document.getElementById('frame-no');
      if (counter) total = parseInt(counter.getAttribute('data-total'), 10) || 36;

      remeasure();
      $(window)
        .on('scroll', request)
        .on('resize load', function () {
          remeasure();
          request();
        });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
    },
    measure: remeasure,
    tick: tick,
  });
})(window.jQuery, window.GR);

/* modules/hero.js */
/* Hero: a cena inteira inclina com o mouse (--rx, --ry) e as camadas se deslocam (--mx, --my). */
(function ($, GR) {
  'use strict';

  function set(el, rx, ry, mx, my) {
    el.style.setProperty('--rx', rx);
    el.style.setProperty('--ry', ry);
    el.style.setProperty('--mx', mx);
    el.style.setProperty('--my', my);
  }

  GR.register('hero', {
    init: function () {
      var hero = document.querySelector('[data-hero]');
      if (!hero || GR.reduced() || !GR.fine()) return;
      var $hero = $(hero);

      $hero.on('pointermove', function (e) {
        var r = hero.getBoundingClientRect();
        var nx = (e.clientX - r.left) / r.width - 0.5;
        var ny = (e.clientY - r.top) / r.height - 0.5;
        set(hero, (-ny * 6).toFixed(2), (nx * 10).toFixed(2), (nx * -24).toFixed(1), (ny * -14).toFixed(1));
      });

      $hero.on('pointerleave', function () {
        set(hero, 0, 0, 0, 0);
      });
    },
  });
})(window.jQuery, window.GR);

/* modules/tilt.js */
/* Tilt 3D dos cartões [data-tilt], com brilho que segue o cursor.
 * O ponteiro é lido no elemento pai (que não gira). Se fosse no próprio cartão, a borda
 * sairia de baixo do cursor ao inclinar e o cartão ficaria piscando. */
(function ($, GR) {
  'use strict';

  var MAX = 8;

  GR.register('tilt', {
    init: function () {
      if (GR.reduced() || !GR.fine()) return;

      $('[data-tilt]').each(function () {
        var card = this;
        var host = card.parentElement;

        $(host)
          .on('pointermove', function (e) {
            var r = host.getBoundingClientRect();
            var px = GR.math.clamp((e.clientX - r.left) / r.width, 0, 1);
            var py = GR.math.clamp((e.clientY - r.top) / r.height, 0, 1);
            var t = GR.math.tilt(px, py, MAX);
            card.classList.add('is-tilting');
            card.style.setProperty('--rx', t.rx.toFixed(2));
            card.style.setProperty('--ry', t.ry.toFixed(2));
            card.style.setProperty('--gx', (px * 100).toFixed(0) + '%');
            card.style.setProperty('--gy', (py * 100).toFixed(0) + '%');
          })
          .on('pointerleave', function () {
            card.classList.remove('is-tilting');
            card.style.setProperty('--rx', 0);
            card.style.setProperty('--ry', 0);
          });
      });
    },
  });
})(window.jQuery, window.GR);

/* modules/filters.js */
/* Filtro por tipo de projeto (Todos, Casamentos, Eventos...). */
(function ($, GR) {
  'use strict';

  GR.register('filters', {
    init: function () {
      var $chips = $('.filters .chip');
      var $items = $('.project-item');
      var $status = $('#filter-status');

      $chips.on('click', function () {
        var f = $(this).attr('data-filter');
        $chips.removeClass('is-on').attr('aria-pressed', 'false');
        $(this).addClass('is-on').attr('aria-pressed', 'true');

        var shown = 0;
        $items.each(function () {
          var show = f === 'todos' || $(this).attr('data-cat') === f;
          this.hidden = !show;
          if (show) shown++;
        });

        $status.text(shown === 1 ? 'Mostrando 1 projeto' : 'Mostrando ' + shown + ' projetos');
        if (GR.scene) GR.scene.measure();
      });
    },
  });
})(window.jQuery, window.GR);

/* modules/lightbox.js */
/* Visualizador de uma foto do álbum, com setas, teclado e volta ao botão de origem. */
(function ($, GR) {
  'use strict';

  var M = GR.math;
  var $lb, $media, $title, $count, $album, $opener;
  var items = [];
  var idx = 0;
  var open = false;
  var timer = null;

  function read(btn) {
    return {
      hue: btn.getAttribute('data-h'),
      src: btn.getAttribute('data-src'),
      ratio: btn.getAttribute('data-ratio') || 'tall',
      caption: btn.getAttribute('data-caption') || '',
    };
  }

  function show(i, animate) {
    idx = M.wrap(i, items.length);
    var it = items[idx];
    $media
      .attr('class', 'lb-media ph r-' + it.ratio)
      .css('--h', it.hue)
      .attr('role', 'img')
      .attr('aria-label', it.caption)
      .empty();
    if (it.src) $media.append($('<img>', { src: it.src, alt: '' }));
    $title.text(it.caption);
    $count.text(idx + 1 + ' / ' + items.length);
    if (animate && !GR.reduced()) {
      $media[0].classList.remove('is-swap');
      void $media[0].offsetWidth;
      $media[0].classList.add('is-swap');
    }
  }

  function openAt($btn) {
    var $list = $btn.closest('.album').find('.photo-btn');
    items = $list.map(function () { return read(this); }).get();
    $album = $btn.closest('.album');
    $opener = $btn;
    clearTimeout(timer);
    $lb.prop('hidden', false);
    show(parseInt($btn.attr('data-index'), 10) || 0, false);
    $album.attr('inert', '');
    void $lb[0].offsetWidth;
    $lb.addClass('is-open');
    open = true;
    $lb.find('.lb-close').trigger('focus');
  }

  function close() {
    if (!open) return;
    open = false;
    $lb.removeClass('is-open');
    $album.removeAttr('inert');
    if ($opener && $opener.length) $opener.trigger('focus');
    timer = setTimeout(function () { $lb.prop('hidden', true); }, GR.reduced() ? 0 : 320);
  }

  function trap(e) {
    var $f = $lb.find('button:visible');
    if (!$f.length) return;
    var first = $f[0], last = $f[$f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  GR.register('lightbox', {
    init: function () {
      $lb = $('#lightbox');
      if (!$lb.length) return;
      $media = $('#lb-media');
      $title = $('#lb-title');
      $count = $('#lb-count');

      $(document).on('click', '.photo-btn', function () { openAt($(this)); });
      $lb.find('.lb-close').on('click', close);
      $lb.find('.lb-prev').on('click', function () { show(idx - 1, true); });
      $lb.find('.lb-next').on('click', function () { show(idx + 1, true); });
      $lb.on('click', function (e) { if (e.target === this) close(); });

      $(document).on('keydown', function (e) {
        if (!open) return;
        if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); }
        else if (e.key === 'ArrowRight') show(idx + 1, true);
        else if (e.key === 'ArrowLeft') show(idx - 1, true);
        else if (e.key === 'Tab') trap(e);
      });
    },
    isOpen: function () { return open; },
    close: close,
  });
})(window.jQuery, window.GR);

/* modules/albums.js */
/* Álbuns: clicar num projeto abre o álbum dele (casamento → fotos do casamento, evento → fotos do evento). */
(function ($, GR) {
  'use strict';

  var $site, $body, current = null, lastFocus = null, closeTimer = null, io = null;

  var idFromHash = function () {
    var m = /^#album-([\w-]+)$/.exec(window.location.hash);
    return m ? m[1] : null;
  };

  function observePhotos($album) {
    var $photos = $album.find('.photo');
    if (!('IntersectionObserver' in window)) { $photos.addClass('in'); return; }
    if (io) io.disconnect();
    $photos.removeClass('in');
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { root: $album[0], threshold: 0.08 });
    $photos.each(function () { io.observe(this); });
  }

  function doOpen(id, trigger) {
    var $a = $('#album-' + id);
    if (!$a.length) return false;
    if (current && current !== id) doClose(true);
    clearTimeout(closeTimer);

    lastFocus = trigger || document.activeElement;
    if (trigger && trigger.getBoundingClientRect) {
      var r = trigger.getBoundingClientRect();
      $a.css({
        '--ox': ((r.left + r.width / 2) / window.innerWidth * 100).toFixed(1) + '%',
        '--oy': ((r.top + r.height / 2) / window.innerHeight * 100).toFixed(1) + '%',
      });
    }

    $a.prop('hidden', false);
    $a[0].scrollTop = 0;
    void $a[0].offsetWidth;
    $a.addClass('is-open');
    $site.attr('inert', '');
    $body.addClass('locked');
    current = id;
    observePhotos($a);
    $a.find('.album-close').trigger('focus');
    return true;
  }

  function doClose(immediate) {
    if (!current) return;
    var $a = $('#album-' + current);
    current = null;
    $a.removeClass('is-open');
    $site.removeAttr('inert');
    $body.removeClass('locked');
    if (io) io.disconnect();
    var hide = function () { $a.prop('hidden', true); };
    if (immediate || GR.reduced()) hide(); else closeTimer = setTimeout(hide, 380);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /** Fecha pela interface, mantendo o histórico coerente (o botão Voltar do navegador também fecha). */
  function closeUi() {
    if (!current) return;
    if (window.history.state && window.history.state.album) window.history.back();
    else {
      doClose();
      if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  function trap(e, $root) {
    var $f = $root.find('button:visible, a[href]:visible');
    if (!$f.length) return;
    var first = $f[0], last = $f[$f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  GR.register('albums', {
    init: function () {
      $site = $('#site');
      $body = $('body');

      $(document).on('click', '[data-album]', function (e) {
        var id = $(this).attr('data-album');
        if (!$('#album-' + id).length) return;
        e.preventDefault();
        if (doOpen(id, this)) window.history.pushState({ album: id }, '', '#album-' + id);
      });

      $(document).on('click', '.album-close', closeUi);

      $(document).on('click', '[data-close-album]', function (e) {
        e.preventDefault();
        var target = document.getElementById('contato');
        doClose(true);
        if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
        if (target) target.scrollIntoView({ behavior: GR.reduced() ? 'auto' : 'smooth' });
      });

      $(document).on('keydown', function (e) {
        if (!current || (GR.lightbox && GR.lightbox.isOpen())) return;
        if (e.key === 'Escape') closeUi();
        else if (e.key === 'Tab') trap(e, $('#album-' + current));
      });

      $(window).on('popstate', function () {
        var id = idFromHash();
        if (id) doOpen(id, null);
        else if (current) doClose();
      });

      var start = idFromHash();
      if (start) doOpen(start, null);
    },
    current: function () { return current; },
    open: doOpen,
    close: closeUi,
  });
})(window.jQuery, window.GR);

/* modules/coverflow.js */
/* Carrossel "Como funciona": arraste, teclado, pontos e rotação 3D (coverflow). */
(function ($, GR) {
  'use strict';

  var M = GR.math;

  GR.register('coverflow', {
    init: function () {
      var $car = $('#carousel');
      if (!$car.length) return;
      var car = $car[0];
      var $steps = $car.find('.step');
      var $dots = $('.dots');
      var motion = !GR.reduced();
      var active = -1;
      var pending = false;
      var lockUntil = 0; // durante um scroll programático (clique no ponto), não deixa a bolinha ativa oscilar
      var settle = null;

      var stepCenter = function (el) { return el.offsetLeft + el.offsetWidth / 2; };

      $steps.each(function (i) {
        $('<button>', { type: 'button', 'aria-label': 'Ir para a etapa ' + (i + 1) })
          .on('click', function () { goTo(i); })
          .appendTo($dots);
      });
      var $btns = $dots.children();

      function goTo(i) {
        var left = Math.max(0, stepCenter($steps[i]) - car.clientWidth / 2);
        lockUntil = Date.now() + (motion ? 800 : 0);
        car.scrollTo({ left: left, behavior: motion ? 'smooth' : 'auto' });
        setActive(i);
      }

      function setActive(i) {
        if (i === active) return;
        active = i;
        $btns.each(function (k) { this.setAttribute('aria-current', k === i ? 'true' : 'false'); });
      }

      function update() {
        pending = false;
        var viewCenter = car.scrollLeft + car.clientWidth / 2;
        var best = 0, bestDist = Infinity;
        $steps.each(function (i) {
          var dist = stepCenter(this) - viewCenter;
          if (Math.abs(dist) < bestDist) { bestDist = Math.abs(dist); best = i; }
          if (motion) {
            var cf = M.coverflow(dist, this.offsetWidth);
            this.style.setProperty('--cf-ry', cf.ry.toFixed(2));
            this.style.setProperty('--cf-s', cf.scale.toFixed(3));
          }
        });
        // Nos extremos do scroll, o primeiro/último ponto vale, mesmo que a etapa não chegue ao centro.
        var max = car.scrollWidth - car.clientWidth;
        if (car.scrollLeft <= 1) best = 0;
        else if (car.scrollLeft >= max - 1) best = $steps.length - 1;
        if (Date.now() >= lockUntil) setActive(best);
      }

      $car.on('scroll', function () {
        clearTimeout(settle);
        settle = setTimeout(update, 120);
        if (pending) return;
        pending = true;
        window.requestAnimationFrame(update);
      });
      $(window).on('resize', update);
      update();

      // Arrastar com o mouse (toque já rola nativamente).
      var down = false, moved = false, sx = 0, sl = 0;
      $car.on('pointerdown', function (e) {
        if (e.pointerType !== 'mouse') return;
        down = true; moved = false; sx = e.pageX; sl = car.scrollLeft;
      });
      $(window).on('pointerup', function () { down = false; $car.removeClass('drag'); });
      $car.on('pointermove', function (e) {
        if (!down) return;
        var dx = e.pageX - sx;
        if (Math.abs(dx) > 4) { moved = true; $car.addClass('drag'); }
        car.scrollLeft = sl - dx * 1.4;
      });
      $car.on('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } });

      $car.on('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); goTo(Math.min($steps.length - 1, active + 1)); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(Math.max(0, active - 1)); }
      });
    },
  });
})(window.jQuery, window.GR);

/* modules/quote-form.js */
/* Formulário de orçamento: validação em tempo real, envio ao endpoint e plano B por WhatsApp/e-mail. */
(function ($, GR) {
  'use strict';

  var Q = GR.quote;
  var FIELDS = ['nome', 'email', 'whatsapp', 'tipo', 'proposta', 'data', 'local', 'detalhes', 'consent'];
  var TIMEOUT_MS = 12000;

  function read($form) {
    var g = function (n) { return $form.find('[name="' + n + '"]'); };
    var v = {
      nome: g('nome').val(),
      email: g('email').val(),
      whatsapp: g('whatsapp').val(),
      tipo: g('tipo').val(),
      proposta: g('proposta').val(),
      propostaLabel: g('proposta').find('option:selected').text(),
      data: g('data').val(),
      semData: g('sem_data').prop('checked'),
      local: g('local').val(),
      detalhes: g('detalhes').val(),
      consent: g('consent').prop('checked'),
      website: g('website').val(),
    };
    if (!v.proposta) v.propostaLabel = '';
    return v;
  }

  function showError($form, name, msg) {
    var $input = $form.find('#q-' + (name === 'consent' ? 'consent' : name));
    var $err = $form.find('#q-' + name + '-err');
    if (msg) {
      $err.text(msg).prop('hidden', false);
      $input.attr('aria-invalid', 'true');
    } else {
      $err.text('').prop('hidden', true);
      $input.removeAttr('aria-invalid');
    }
  }

  function showAll($form, errors) {
    FIELDS.forEach(function (n) { showError($form, n, errors[n]); });
  }

  function post(endpoint, body) {
    var ctl = 'AbortController' in window ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT_MS) : null;
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: ctl ? ctl.signal : undefined,
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res;
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  GR.register('quoteForm', {
    init: function () {
      var $form = $('#orcamento');
      if (!$form.length) return;
      var $status = $('#quote-status');
      var $body = $form.find('.quote-body');
      var $done = $('#quote-done');
      var $submit = $form.find('.quote-submit');
      var $date = $('#q-data');
      var $none = $('#q-sem-data');
      var endpoint = $form.attr('data-endpoint') || '';
      var accessKey = $form.attr('data-access-key') || '';
      var email = $form.attr('data-email');
      var wa = $form.attr('data-wa');
      var brand = $form.attr('data-brand');
      var busy = false;
      var $tipo = $('#q-tipo');
      var $prop = $('#q-proposta');
      var proposals = {};
      try { proposals = JSON.parse($form.attr('data-proposals') || '{}'); } catch (err) { proposals = {}; }
      var customLabel = $form.attr('data-custom') || 'Proposta personalizada';

      // "Qual proposta deseja?" depende do tipo: casamento mostra os pacotes; os demais, proposta personalizada.
      function fillProposals(keep) {
        var tipo = $tipo.val();
        $prop.empty();
        if (!tipo) {
          $prop.append($('<option>', { value: '', disabled: true, selected: true }).text('Selecione o tipo de sessão primeiro')).prop('disabled', true);
          return;
        }
        var list = (proposals[tipo] || []).concat([{ id: 'personalizada', label: customLabel }]);
        $prop.append($('<option>', { value: '', disabled: true, selected: true }).text('Escolha uma proposta'));
        list.forEach(function (o) { $prop.append($('<option>', { value: o.id }).text(o.label)); });
        $prop.prop('disabled', false);
        if (keep && $prop.find('option[value="' + keep + '"]').length) $prop.val(keep);
        else if (list.length === 1) $prop.val(list[0].id);
      }
      $tipo.on('change', function () { fillProposals(); showError($form, 'proposta', ''); });

      // Botões "Quero a ..." dos cartões: escolhem tipo e proposta e levam ao formulário.
      $(document).on('click', '[data-pick]', function () {
        $tipo.val($(this).attr('data-pick-type')).trigger('change');
        fillProposals($(this).attr('data-pick'));
        $prop.trigger('change');
        var el = $form[0];
        el.scrollIntoView({ behavior: GR.reduced() ? 'auto' : 'smooth', block: 'start' });
        setTimeout(function () { $form.find('[name="nome"]')[0].focus({ preventScroll: true }); }, GR.reduced() ? 0 : 500);
      });

      // Intervalo de datas aceito, calculado no navegador (o site é estático e não sabe a data de hoje).
      var today = Q.today();
      $date.attr('min', today).attr('max', Q.addYears(today, Q.MAX_YEARS));

      $none.on('change', function () {
        var on = this.checked;
        $date.prop('disabled', on).prop('required', !on);
        if (on) { $date.val(''); showError($form, 'data', ''); }
      });

      // Corrige o erro assim que a pessoa mexe no campo.
      $form.on('input change', 'input, select, textarea', function () {
        var name = this.name === 'sem_data' ? 'data' : this.name;
        if (FIELDS.indexOf(name) === -1) return;
        if ($form.find('#q-' + name + '-err').prop('hidden')) return;
        var errors = Q.validate(read($form), today);
        showError($form, name, errors[name]);
      });

      function finish(mode, values) {
        var text = Q.message(values, brand);
        var $wa = $('#quote-wa');
        var $mail = $('#quote-mail');
        var waUrl = Q.whatsappUrl(wa, text);
        $wa.prop('hidden', !waUrl).attr('href', waUrl || '#');
        $mail.attr('href', Q.mailtoUrl(email, 'Orçamento: ' + values.tipo, text)).prop('hidden', false);

        var copy = {
          sent: ['Pedido enviado', 'Recebi seu pedido e respondo em até 1 dia útil, no e-mail ' + values.email.trim() + '.'],
          whatsapp: ['Quase lá', 'Abrimos o WhatsApp com a sua proposta pronta para conversarmos. Se ele não abriu, use um dos botões abaixo.'],
        }[mode];
        $('#quote-done-title').text(copy[0]);
        $('#quote-done-text').text(copy[1]);
        $body.prop('hidden', true);
        $done.prop('hidden', false).trigger('focus');
        $form.attr('data-state', mode);
      }

      $('#quote-again').on('click', function () {
        $done.prop('hidden', true);
        $body.prop('hidden', false);
        $status.text('');
        $form.removeAttr('data-state');
        $form.find('[name="nome"]').trigger('focus');
      });

      $form.on('submit', function (e) {
        e.preventDefault();
        if (busy) return;
        var values = read($form);

        // Campo-isca: robôs preenchem, pessoas não veem. Finge que deu certo e não envia nada.
        if (values.website) { finish('sent', { email: 'seu e-mail', tipo: '' }); return; }

        var errors = Q.validate(values, today);
        showAll($form, errors);
        var first = FIELDS.filter(function (n) { return errors[n]; })[0];
        if (first) {
          $status.text('Corrija ' + Object.keys(errors).length + (Object.keys(errors).length === 1 ? ' campo' : ' campos') + ' para enviar.');
          $form.find('#q-' + first).trigger('focus');
          return;
        }
        $status.text('');

        // O WhatsApp é onde a negociação termina: abre dentro do clique (o navegador só permite assim).
        var url = Q.whatsappUrl(wa, Q.message(values, brand));
        if (url) window.open(url, '_blank', 'noopener');
        // Se houver serviço de formulário, o pedido também vai para a caixa de entrada (sem travar o WhatsApp).
        if (endpoint) post(endpoint, Q.payload(values, window.location.href.split('#')[0], { accessKey: accessKey, brand: brand })).catch(function () {});
        finish('whatsapp', values);
      });
    },
  });
})(window.jQuery, window.GR);

/* modules/contact.js */
/* Botão que copia o e-mail e mostra um aviso. */
(function ($, GR) {
  'use strict';

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = $('<textarea readonly>').val(text).css({ position: 'fixed', opacity: 0 }).appendTo('body');
      ta[0].select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  GR.register('contact', {
    init: function () {
      var $mail = $('#mail');
      var $toast = $('#toast');
      var timer = null;
      if (!$mail.length) return;

      $mail.on('click', function () {
        var done = function (msg) {
          $toast.text(msg).addClass('show');
          clearTimeout(timer);
          timer = setTimeout(function () { $toast.removeClass('show'); }, 1800);
        };
        copy($mail.attr('data-email')).then(
          function () { done('E-mail copiado'); },
          function () { done('Não foi possível copiar. Selecione o e-mail manualmente.'); }
        );
      });
    },
  });
})(window.jQuery, window.GR);

/* main.js */
/* Entrada: inicia todos os módulos quando o DOM está pronto. */
window.jQuery(function ($) {
  window.GR.init($);
});
