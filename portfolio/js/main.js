/*
 * Portfolio behaviour. No dependencies, no globals.
 * Every feature is a small init function that bails out quietly if its
 * markup is missing, so the page works fully without JavaScript.
 */
(function () {
  'use strict';

  var $ = function (selector, root) { return (root || document).querySelector(selector); };
  var $$ = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };

  var root = document.documentElement;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

  /** localStorage can throw (private windows, blocked storage), so wrap it. */
  var store = {
    get: function (key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set: function (key, value) { try { localStorage.setItem(key, value); } catch (e) { /* ignore */ } },
    remove: function (key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
  };

  /** Run a callback at most once per animation frame. */
  function onFrame(callback) {
    var queued = false;
    return function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; callback(); });
    };
  }

  /* ------------------------------------------------------------------ */
  /* Theme toggle: system -> light -> dark -> system                     */
  /* ------------------------------------------------------------------ */
  function initTheme() {
    var button = $('#theme-toggle');
    if (!button) return;

    var MODES = ['system', 'light', 'dark'];
    var saved = store.get('theme');
    var mode = MODES.indexOf(saved) > -1 ? saved : 'system';

    function apply() {
      if (mode === 'system') {
        if (saved) root.removeAttribute('data-theme');
      } else {
        root.setAttribute('data-theme', mode);
      }
      button.dataset.mode = mode;
      var next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      button.setAttribute('aria-label', 'Theme: ' + mode + '. Switch to ' + next);
      button.title = 'Theme: ' + mode;
    }

    button.addEventListener('click', function () {
      mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      saved = mode;
      if (mode === 'system') store.remove('theme'); else store.set('theme', mode);
      apply();
    });

    if (saved && saved !== 'system') apply();
    else { button.dataset.mode = 'system'; apply(); }
  }

  /* ------------------------------------------------------------------ */
  /* Reading progress bar                                                */
  /* ------------------------------------------------------------------ */
  function initProgress() {
    var bar = $('#progress');
    if (!bar) return;

    var update = onFrame(function () {
      var max = root.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      bar.style.transform = 'scaleX(' + ratio + ')';
    });

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  }

  /* ------------------------------------------------------------------ */
  /* Highlight the section in view inside the side navigation            */
  /* ------------------------------------------------------------------ */
  function initScrollSpy() {
    var links = $$('.toc__link');
    if (!links.length || !('IntersectionObserver' in window)) return;

    var byId = {};
    links.forEach(function (link) { byId[link.getAttribute('href').slice(1)] = link; });

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (link) { link.removeAttribute('aria-current'); });
        var active = byId[entry.target.id];
        if (active) active.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-20% 0px -70% 0px' });

    Object.keys(byId).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) observer.observe(section);
    });

    // The last section is shorter than the viewport and can never reach the
    // observer's band, so mark it active once the page is scrolled to the end.
    var last = links[links.length - 1];
    window.addEventListener('scroll', onFrame(function () {
      var atEnd = window.innerHeight + window.scrollY >= root.scrollHeight - 4;
      if (!atEnd) return;
      links.forEach(function (link) { link.removeAttribute('aria-current'); });
      last.setAttribute('aria-current', 'true');
    }), { passive: true });
  }

  /* ------------------------------------------------------------------ */
  /* Copy email button with a small toast                                */
  /* ------------------------------------------------------------------ */
  function initCopyEmail() {
    var button = $('#copy-email');
    var toast = $('#toast');
    var source = $('#email');
    if (!button || !source) return;

    var timer;

    function notify(message) {
      if (!toast) return;
      toast.textContent = message;
      toast.dataset.show = 'true';
      clearTimeout(timer);
      timer = setTimeout(function () { toast.dataset.show = 'false'; }, 2200);
    }

    function selectText() {
      var range = document.createRange();
      range.selectNodeContents(source);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }

    function markDone() {
      button.dataset.state = 'done';
      button.textContent = 'Copied';
      setTimeout(function () { button.dataset.state = ''; button.textContent = 'Copy'; }, 1800);
    }

    button.addEventListener('click', function () {
      var email = source.textContent.trim();
      var write = navigator.clipboard && navigator.clipboard.writeText;
      if (!write) { selectText(); notify('Press Ctrl+C to copy'); return; }
      navigator.clipboard.writeText(email).then(function () {
        markDone();
        notify('Email copied');
      }, function () {
        selectText();
        notify('Press Ctrl+C to copy');
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Screenshot viewer: zooms out of the thumbnail, arrows/swipe to move */
  /* ------------------------------------------------------------------ */
  function initViewer() {
    var dialog = $('#viewer');
    if (!dialog || typeof dialog.showModal !== 'function') return;

    var image = $('.viewer__img', dialog);
    var caption = $('.viewer__caption', dialog);
    var counter = $('.viewer__count', dialog);
    var prevButton = $('.viewer__btn--prev', dialog);
    var nextButton = $('.viewer__btn--next', dialog);
    var closeButton = $('.viewer__btn--close', dialog);

    var thumbs = $$('.thumb');
    var group = [];
    var index = 0;
    var closing = false;

    function animates() { return !reducedMotion.matches && typeof image.animate === 'function'; }

    function show(i) {
      index = (i + group.length) % group.length;
      var thumb = group[index];
      image.src = thumb.dataset.full;
      image.alt = thumb.querySelector('img').alt;
      caption.textContent = thumb.dataset.caption || '';
      counter.textContent = (index + 1) + ' / ' + group.length;
      prevButton.hidden = nextButton.hidden = group.length < 2;

      // Warm the cache for the neighbours so arrow-keying feels instant.
      [index - 1, index + 1].forEach(function (n) {
        var neighbour = group[(n + group.length) % group.length];
        if (neighbour && neighbour !== thumb) new Image().src = neighbour.dataset.full;
      });
    }

    function step(direction) {
      if (group.length < 2 || closing) return;
      show(index + direction);
      if (animates()) {
        image.animate(
          [{ opacity: 0, transform: 'translateX(' + direction * 24 + 'px)' }, { opacity: 1, transform: 'none' }],
          { duration: 220, easing: EASE }
        );
      }
    }

    /** FLIP: animate between the thumbnail's box and the viewer image's box. */
    function flip(from, to, duration, reverse) {
      var dx = from.left - to.left;
      var dy = from.top - to.top;
      var sx = from.width / to.width;
      var sy = from.height / to.height;
      return image.animate(
        [{ transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')' }, { transform: 'none' }],
        { duration: duration, easing: EASE, direction: reverse ? 'reverse' : 'normal', fill: 'forwards' }
      );
    }

    function open(thumb) {
      group = thumbs.filter(function (t) { return t.dataset.group === thumb.dataset.group; });
      closing = false;
      show(group.indexOf(thumb));
      dialog.showModal();
      root.classList.add('is-locked');
      if (animates()) flip(thumb.getBoundingClientRect(), image.getBoundingClientRect(), 340);
    }

    function finishClose() {
      dialog.getAnimations().concat(image.getAnimations()).forEach(function (a) { a.cancel(); });
      dialog.close();
      root.classList.remove('is-locked');
      closing = false;
    }

    function close() {
      if (closing) return;
      closing = true;
      var thumb = group[index];
      var rect = thumb.getBoundingClientRect();
      var visible = rect.bottom > 0 && rect.top < window.innerHeight;

      if (!animates()) { finishClose(); return; }

      var animation = visible
        ? flip(rect, image.getBoundingClientRect(), 260, true)
        : image.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
      dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-out', fill: 'forwards' });
      animation.onfinish = finishClose;
    }

    thumbs.forEach(function (thumb) {
      thumb.addEventListener('click', function () { open(thumb); });
    });

    prevButton.addEventListener('click', function () { step(-1); });
    nextButton.addEventListener('click', function () { step(1); });
    closeButton.addEventListener('click', close);

    // Clicking the dark area around the image closes the viewer.
    dialog.addEventListener('click', function (event) {
      if (!event.target.closest('.viewer__stage')) close();
    });

    // Escape is intercepted so the close animation can run.
    dialog.addEventListener('cancel', function (event) { event.preventDefault(); close(); });

    dialog.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
    });

    // Horizontal swipe on touch screens.
    var startX = 0;
    var startY = 0;
    image.addEventListener('pointerdown', function (event) { startX = event.clientX; startY = event.clientY; });
    image.addEventListener('pointerup', function (event) {
      var dx = event.clientX - startX;
      var dy = event.clientY - startY;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    });
  }

  initTheme();
  initProgress();
  initScrollSpy();
  initCopyEmail();
  initViewer();
})();
