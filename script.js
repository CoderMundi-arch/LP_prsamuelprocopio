/* ==========================================================================
   VSL — 100 Sermões | Pr. Samuel Procópio
   ========================================================================== */

/* ---------------------------------------------------------------------------
   CONFIGURAÇÃO — altere só aqui
   --------------------------------------------------------------------------- */
const CONFIG = {
  // Segundos de vídeo EFETIVAMENTE assistidos (com som ativado) para liberar
  // o preço e o botão de compra.
  unlockSeconds: 120,

  // Link do checkout. Os parâmetros da URL da página (utm_*, fbclid, src…)
  // são repassados automaticamente para o checkout.
  checkoutUrl: 'https://pay.hotmart.com/M51946131S?checkoutMode=10&bid=1795529626217',

  // Abrir o checkout em nova aba? (false = mesma aba, recomendado)
  checkoutNewTab: false,

  // Arquivos de vídeo: 720p para celular/conexões econômicas, 1080p para telas grandes.
  videoSD: 'assets/videos/vsl-720.mp4',
  videoHD: 'assets/videos/vsl.mp4',

  // Chave que guarda o progresso no navegador do visitante.
  // Troque o sufixo (v2 → v3) para "zerar" todos os visitantes.
  storageKey: 'sp_vsl_100sermoes_v3',
};

/* ------------------------------------------------------------------------- */

(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);

  const player   = $('.player');
  const video    = $('.player__video');
  const soundBtn = $('.player__sound');
  const fill     = $('.player__progress-fill');
  const offer    = $('#oferta');
  const cta      = $('[data-checkout]');
  const announce = $('[data-announce]');

  const params  = new URLSearchParams(location.search);
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  // Tempo de liberação: vem SOMENTE do CONFIG (não há atalho pela URL).
  let unlockAt = Math.max(1, Number(CONFIG.unlockSeconds) || 120);

  /* ---------- Armazenamento seguro --------------------------------------- */
  const store = {
    read()  { try { return JSON.parse(localStorage.getItem(CONFIG.storageKey)) || {}; } catch { return {}; } },
    write(d){ try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(d)); } catch { /* modo privado */ } },
    clear() { try { localStorage.removeItem(CONFIG.storageKey); } catch { /* noop */ } },
  };
  // limpa versões antigas da chave (v1, v2…) para não herdar estado anterior
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('sp_vsl_') && k !== CONFIG.storageKey)
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* noop */ }

  const saved = store.read();
  let watched  = Number(saved.watched) || 0;   // segundos efetivamente assistidos
  let unlocked = saved.unlocked === true;
  let resetting = false;
  const persist = () => { if (!resetting) store.write({ watched, unlocked }); };

  /* ---------- Pixel da Meta (só dispara se o fbq estiver instalado) ------- */
  const track = (event, data, custom = false) => {
    if (typeof window.fbq !== 'function') return;
    try { window.fbq(custom ? 'trackCustom' : 'track', event, data); } catch { /* noop */ }
  };

  /* ---------- Checkout com repasse de UTMs -------------------------------- */
  const buildCheckoutUrl = () => {
    const base = CONFIG.checkoutUrl;
    if (!base || base === '#') return '#';
    try {
      const url = new URL(base, location.href);
      params.forEach((value, key) => {
        if (!url.searchParams.has(key)) url.searchParams.set(key, value);
      });
      return url.toString();
    } catch { return base; }
  };

  cta.href = buildCheckoutUrl();
  if (CONFIG.checkoutNewTab) { cta.target = '_blank'; cta.rel = 'noopener'; }
  cta.addEventListener('click', (e) => {
    if (cta.getAttribute('href') === '#') {
      e.preventDefault();
      console.warn('[VSL] Configure CONFIG.checkoutUrl em script.js');
    }
    track('InitiateCheckout', { value: 50.0, currency: 'BRL', content_name: '100 Sermões' });
  });

  /* ---------- Oferta ------------------------------------------------------ */
  const showOffer = (instant = false) => {
    offer.hidden = false;
    if (instant) {
      offer.classList.add('is-instant', 'is-open');
      requestAnimationFrame(() => requestAnimationFrame(() => offer.classList.remove('is-instant')));
      return;
    }
    void offer.offsetHeight; // a transição parte do zero
    offer.classList.add('is-open');
    announce.textContent = 'Oferta liberada: de R$ 197,00 por apenas R$ 50,00.';
  };

  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    persist();
    showOffer(false);
    track('ViewContent', { value: 50.0, currency: 'BRL', content_name: '100 Sermões' });
  };

  if (unlocked) showOffer(true);

  /* ---------- Qualidade do vídeo ------------------------------------------ */
  const conn = navigator.connection || {};
  const wantsHD =
    !conn.saveData &&
    !/(^|-)2g$/.test(conn.effectiveType || '') &&
    Math.min(screen.width, screen.height) >= 768 &&
    window.innerWidth * (window.devicePixelRatio || 1) >= 1400;

  const source = video.querySelector('source');
  const chosen = wantsHD ? CONFIG.videoHD : CONFIG.videoSD;
  if (source.getAttribute('src') !== chosen) {
    source.setAttribute('src', chosen);
    video.load();
  }

  /* ---------- Estado ------------------------------------------------------
     preview  → tocando mudo (autoplay), aviso "Clique aqui para ativar o som"
     playing  → com som, contando o tempo assistido
     paused   → pausado (não conta)
     ended    → terminou; o aviso vira "Assistir novamente"                  */
  let activated = false;  // o visitante ativou o som (só então o tempo conta)
  const setState = (s) => { player.dataset.state = s; };
  const toggleBtn = $('[data-action="toggle"]', player);
  const muteBtn   = $('[data-action="mute"]', player);
  const soundTop    = $('[data-sound-top]');
  const soundBottom = $('[data-sound-bottom]');

  const play = () => {
    const p = video.play();
    if (p && p.catch) p.catch(() => {});
    return p;
  };

  // Autoplay mudo (alguns navegadores em economia de energia bloqueiam:
  // nesse caso o aviso continua por cima da capa e o clique inicia com som).
  video.muted = true;
  play();

  const activate = () => {
    activated = true;
    player.dataset.activated = 'true';
    video.muted = false;
    video.currentTime = 0;          // recomeça do início, agora com som
    resetClock();
    setState('playing');
    play();
    showUi();
    track('VideoPlay', {}, true);
  };

  soundBtn.addEventListener('click', () => {
    if (player.dataset.state === 'ended') {
      video.currentTime = 0;
      setState('playing');
      play();
      return;
    }
    activate();
  });

  /* ---------- Contagem do tempo efetivamente assistido -------------------
     Soma só o avanço natural do vídeo, com som ativado e em reprodução:
     mudo (prévia) não conta, pausado não conta, pular para frente não conta,
     voltar não desconta e rever trechos conta. Velocidade 2x é compensada. */
  let lastTime = null;
  let lastSave = 0;
  function resetClock() { lastTime = null; }

  video.addEventListener('timeupdate', () => {
    const t = video.currentTime;
    if (activated && lastTime !== null && !video.paused && !video.seeking) {
      const delta = t - lastTime;
      const rate = video.playbackRate || 1;
      if (delta > 0 && delta < 4 * rate) {
        watched += delta / rate;
        const now = performance.now();
        if (now - lastSave > 2000) { lastSave = now; persist(); }
        if (!unlocked && watched >= unlockAt) unlock();
      }
    }
    lastTime = t;
    if (video.duration) fill.style.transform = `scaleX(${t / video.duration})`;
  });
  video.addEventListener('seeking', resetClock);
  video.addEventListener('seeked', resetClock);
  window.addEventListener('pagehide', persist);

  /* ---------- Eventos do vídeo ------------------------------------------- */
  video.addEventListener('playing', () => {
    player.dataset.buffering = 'false';
    if (!activated) return;
    setState('playing');
    toggleBtn.setAttribute('aria-label', 'Pausar');
  });
  video.addEventListener('pause', () => {
    resetClock();
    persist();
    if (!activated || video.ended) return;
    setState('paused');
    toggleBtn.setAttribute('aria-label', 'Reproduzir');
  });
  video.addEventListener('ended', () => {
    if (!activated) {             // a prévia muda terminou: volta para o início
      video.currentTime = 0;
      play();
      return;
    }
    setState('ended');
    soundTop.textContent = 'Assistir';
    soundBottom.textContent = 'novamente';
    soundBtn.setAttribute('aria-label', 'Assistir novamente');
  });
  video.addEventListener('waiting', () => { player.dataset.buffering = 'true'; });
  video.addEventListener('canplay', () => { player.dataset.buffering = 'false'; });
  video.addEventListener('volumechange', () => {
    player.dataset.muted = String(video.muted);
    muteBtn.setAttribute('aria-label', video.muted ? 'Ativar som' : 'Desativar som');
  });

  const toggle = () => {
    const s = player.dataset.state;
    if (s === 'preview' || s === 'ended') { soundBtn.click(); return; }
    video.paused ? play() : video.pause();
  };
  video.addEventListener('click', toggle);

  /* ---------- Controles --------------------------------------------------- */
  player.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'toggle': toggle(); break;
      case 'back':   video.currentTime = Math.max(0, video.currentTime - 10); break;
      case 'mute':   video.muted = !video.muted; break;
      case 'fullscreen': {
        const frame = $('.player__frame', player);
        const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (fsEl) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else if (frame.requestFullscreen) frame.requestFullscreen().catch(() => {});
        else if (frame.webkitRequestFullscreen) frame.webkitRequestFullscreen();
        else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); // iOS
        break;
      }
    }
    showUi();
  });

  /* barra some após 2,5 s sem interação durante a reprodução */
  let uiTimer;
  function showUi() {
    player.dataset.ui = 'on';
    clearTimeout(uiTimer);
    uiTimer = setTimeout(() => { if (!video.paused) player.dataset.ui = 'off'; }, 2500);
  }
  player.addEventListener('pointermove', showUi, { passive: true });
  player.addEventListener('touchstart', showUi, { passive: true });

  /* teclado: espaço / K pausa e retoma quando o foco está no vídeo */
  video.tabIndex = 0;
  video.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'k' || e.key === 'K') { e.preventDefault(); toggle(); }
  });

  /* ---------- Acesso para testes no console ----------------------------- */
  window.VSL = {
    get watched()  { return Math.round(watched * 10) / 10; },
    get unlocked() { return unlocked; },
    get unlockAt() { return unlockAt; },
    reset() { resetting = true; store.clear(); location.reload(); },
  };
  // Só no computador de desenvolvimento: VSL.testUnlockAt(5) no console
  // libera em 5 s nesta aba (não salva nada, some ao recarregar).
  if (isLocal) window.VSL.testUnlockAt = (s) => { unlockAt = Math.max(1, Number(s) || unlockAt); };
})();
