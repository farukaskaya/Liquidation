import Phaser from 'phaser';

// ─── GLOBAL SABİTLER ───────────────────────────────────────────────────────

const GRAPH_MARGIN    = 50;
const LERP_SPEED      = 0.5;  // İmleç hareket hızı
const SAMPLE_INTERVAL = 20;   // Her 20 framede 1 fiyat kaydı
const HISTORY_LEN     = 180;  // Grafik için fiyat kaydı

// ─── LEVELLAR ─────────────────────────────────────────────────────────────

const LEVEL_CONFIGS = [
  {
    id         : 1,
    label      : 'LEVEL 1 — Perakende Piyasası',
    targetLoss : 3,
    npcCount   : 5,
    archetypes : ['retail', 'retail', 'retail', 'retail', 'retail'],
    hint       : 'Yükselt satın alım olunca anında düşür',
  },
  {
    id         : 2,
    label      : 'LEVEL 2 — Biraz Daha Akıllı',
    targetLoss : 5,
    npcCount   : 6,
    archetypes : ['retail', 'retail', 'hodler', 'hodler', 'retail', 'retail'],
    hint       : 'HODL\'cular çok bekler — sabırla yükselt, sonra çok sert düşür',
  },
  {
    id         : 3,
    label      : 'LEVEL 3 — Uyanık Piyasa',
    targetLoss : 6,
    npcCount   : 7,
    archetypes : ['retail', 'hodler', 'contrarian', 'contrarian', 'retail', 'hodler', 'retail'],
    hint       : 'Kontraryenler düşüşte alır — onları önce kandır, sonra çöktür',
  },
];

// ─── ARKETİPLER ────────────────────────────────────────────────────────────
//
//  retail     : Klasik perakende yatırımcı.
//               Fiyat yükselince panikle alır, düşünce panikle satar.
//
//  hodler     : Uzun vadeli yatırımcı.
//               Çok daha uzun yükseliş ister ve dip teyidine bakar.
//               Kazancını erken kesmez, uzun süre bekler.
//
//  contrarian : Tersine oynayan zeki para.
//               Düşüş trendinde alır ("dibini gördüm" mentalitesi).
//               Ama çok sabırsız — küçük bir toparlanma görmeden de panikler.
//
//  scalper    : Hızlı alım-satım yapan, küçük kâr hedefler.
//               Çok kısa yükseliş streaki yeter ama GAIN_TRIGGER çok küçük;
//               erken çıkar. LOSS_TRIGGER da küçük: hızlı keser.
//               Zarara uğratmak için onu "içeride tut" ve sonra sert çökt.

const ARCHETYPES = {
  retail: {
    BUY_STREAK   : 25,    // grafik yükseliş streaki (örnek sayısı)
    LOSS_TRIGGER : 0.08,  // alış fiyatından %8 düşünce panik satış
    GAIN_TRIGGER : 0.12,  // alış fiyatından %12 yükselince satar
    INTEREST_DEC : 0.25,  // fiyat durgunken ilgi düşüşü/frame
    BUY_ON_RISE  : true,  // yükselişte mi, düşüşte mi alır
  },
  hodler: {
    BUY_STREAK   : 60,    // 2,4x daha uzun yükseliş ister
    LOSS_TRIGGER : 0.20,  // %20 düşene kadar dayanır (diamond hands)
    GAIN_TRIGGER : 0.30,  // %30 yükseliş ister — çıkmaz çabuk
    INTEREST_DEC : 0.10,  // ilgisi çok yavaş düşer (sabırlı)
    BUY_ON_RISE  : true,
  },
  contrarian: {
    BUY_STREAK   : 20,    // 20 frame düşüş streaki sonra alır (düşüşte alır)
    LOSS_TRIGGER : 0.06,  // %6 daha düşerse panikler (beklediği dip değil)
    GAIN_TRIGGER : 0.10,  // %10 yükselince çıkar
    INTEREST_DEC : 0.30,  // ilgisi hızlı düşer
    BUY_ON_RISE  : false, // düşüşte alır
  },
  scalper: {
    BUY_STREAK   : 8,     // 8 frame yükseliş yeter
    LOSS_TRIGGER : 0.03,  // %3 düşünce hızlı keser
    GAIN_TRIGGER : 0.04,  // %4 yükselince hemen çıkar — zarara uğratmak ZOR
    INTEREST_DEC : 0.40,  // çok sabırsız
    BUY_ON_RISE  : true,
  },
};

// ─── FİYAT ────────────────────────────────────────────────────────────────

function createPriceState() {
  return {
    current     : 0.5,
    target      : 0.5,
    // Başlangıçta grafik BOŞ — null ile dolduruyoruz, sadece gerçek veriler çizilecek
    history     : Array(HISTORY_LEN).fill(null),
    sampleTick  : 0,
    // Kaç gerçek örnek aldık
    sampleCount : 0,
  };
}

function updatePrice(state, mouseY, screenH) {
  state.target  = 1 - (mouseY / screenH);
  state.target  = Math.max(0.02, Math.min(0.98, state.target));
  state.current += (state.target - state.current) * LERP_SPEED;

  state.sampleTick = (state.sampleTick + 1) % SAMPLE_INTERVAL;
  if (state.sampleTick === 0) {
    state.history.push(state.current);
    if (state.history.length > HISTORY_LEN) state.history.shift();
    state.sampleCount++;
  }

  return state;
}

// Son 'frames' örnek içindeki fiyat değişiminin hız vektörü
function getPriceVelocity(history, frames = 8) {
  // Null olmayan son değerleri filtrele
  const real = history.filter(v => v !== null);
  if (real.length < frames + 1) return 0;
  return real[real.length - 1] - real[real.length - 1 - frames];
}

// Normalize fiyat (0-1) -> ekran Y koordinatı
function priceToY(p, screenH) {
  return GRAPH_MARGIN + (1 - p) * (screenH - GRAPH_MARGIN * 2);
}

// ─── NPC ─────────────────────────────────────────────────────────────────

function createNPC(id, archetype) {
  return {
    id,
    archetype,
    state        : 'watching',
    buyPrice     : null,
    sellPrice    : null,
    interest     : 75 + Math.random() * 25,
    streak       : 0,  // yükseliş veya düşüş streaki (arketipe göre)
  };
}

function tickNPC(npc, priceState) {
  if (npc.state === 'sold_loss' || npc.state === 'sold_gain') return null;

  const params   = ARCHETYPES[npc.archetype];
  const price    = priceState.current;
  const velocity = getPriceVelocity(priceState.history);
  const isMoving = Math.abs(velocity) > 0.003;

  if (!isMoving) {
    npc.interest = Math.max(0, npc.interest - params.INTEREST_DEC);
  }

  if (npc.state === 'watching') {
    if (params.BUY_ON_RISE) {
      // Yükselişte alır (retail, hodler, scalper)
      if (velocity > 0.003) {
        npc.streak++;
      } else {
        npc.streak = Math.max(0, npc.streak - 2);
      }
    } else {
      // Düşüşte alır (contrarian)
      if (velocity < -0.003) {
        npc.streak++;
      } else {
        npc.streak = Math.max(0, npc.streak - 2);
      }
    }

    if (npc.streak >= params.BUY_STREAK) {
      npc.state    = 'bought';
      npc.buyPrice = price;
      npc.streak   = 0;
    }
  } else if (npc.state === 'bought') {
    const delta = price - npc.buyPrice;
    if (delta <= -params.LOSS_TRIGGER) {
      npc.state     = 'sold_loss';
      npc.sellPrice = price;
      return 'loss';
    }
    if (delta >= params.GAIN_TRIGGER) {
      npc.state     = 'sold_gain';
      npc.sellPrice = price;
      return 'gain';
    }
  }

  return null;
}

// ─── LEVEL ────────────────────────────────────────────────────────────────

function createLevelState(config) {
  return {
    config,
    npcs      : config.archetypes.map((arch, i) => createNPC(i, arch)),
    lossCount : 0,
    complete  : false,
  };
}

function tickLevel(level, priceState) {
  if (level.complete) return;
  for (const npc of level.npcs) {
    const result = tickNPC(npc, priceState);
    if (result === 'loss') {
      level.lossCount++;
      if (level.lossCount >= level.config.targetLoss) level.complete = true;
    }
  }
}

function isLevelFailed(level) {
  if (level.complete) return false;
  const active = level.npcs.filter(n => n.state === 'watching' || n.state === 'bought');
  return active.length === 0 || active.every(n => n.interest <= 0);
}

// ─── UI SABİTLERİ ─────────────────────────────────────────────────────────

const STATE_COLOR = {
  watching  : '#888888',
  bought    : '#ffaa00',
  sold_loss : '#ff4466',
  sold_gain : '#4499ff',
};

const STATE_LABEL = {
  watching  : '(0 -0 ) İzliyor',
  bought    : '$ ALDI',
  sold_loss : '(T - T) Zararda sattı',
  sold_gain : '(0 U 0) Kârda sattı',
};

const ARCHETYPE_LABEL = {
  retail     : 'Perakendeci',
  hodler     : 'HODLer',
  contrarian : 'Kontraryene',
  scalper    : 'Scalper',
};

// ─── PHASER SAHNESİ ───────────────────────────────────────────────────────

const MAX_NPC_SLOTS = 8;

// Oyun durumları (state machine)
const GAME_STATE = {
  PLAYING    : 'playing',    // Normal oyun
  PAUSED     : 'paused',     // Bölüm bitti/başarısız — oyuncu buton bekliyor
  GAME_OVER  : 'game_over',  // Tüm bölümler bitti — oyun durdu
};

class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    this.priceState  = createPriceState();
    this.levelIndex  = 0;
    this.levelState  = createLevelState(LEVEL_CONFIGS[this.levelIndex]);
    this.gameState   = GAME_STATE.PLAYING;
    this.pendingNext = null; // 'next_level' | 'restart' | 'game_over'

    this.mouseY = H / 2;
    this.input.on('pointermove', p => { this.mouseY = p.y; });

    // Grafik katmanları
    this.bgGfx = this.add.graphics();
    this.fgGfx = this.add.graphics();

    // Sol üste level adı + hedef + ipucu
    this.levelLabel = this.add.text(12, 12, '', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
    }).setDepth(10);

    this.progressLabel = this.add.text(12, 34, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#aaaaaa',
    }).setDepth(10);

    this.hintLabel = this.add.text(12, 54, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#445566',
    }).setDepth(10);

    // Fiyat etiketi
    this.priceLabel = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#00ff88',
    }).setDepth(10);

    // NPC slotları
    this.npcTexts = Array.from({ length: MAX_NPC_SLOTS }, (_, i) =>
      this.add.text(W - 205, 80 + i * 68, '', {
        fontFamily: 'monospace', fontSize: '11px', color: '#cccccc',
        backgroundColor: '#0d0d1a', padding: { x: 6, y: 5 },
        wordWrap: { width: 190 },
      }).setDepth(10).setVisible(false)
    );

    // ── Overlay bileşenleri ──────────────────────────────────────────────
    this.overlayBg = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0)
      .setDepth(18);

    this.overlayLabel = this.add.text(W / 2, H / 2 - 40, '', {
      fontFamily: 'monospace', fontSize: '24px', color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5).setDepth(20).setVisible(false);

    this.subLabel = this.add.text(W / 2, H / 2 + 5, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#aaaaaa',
      align: 'center',
    }).setOrigin(0.5).setDepth(20).setVisible(false);

    // Oyuncu aksiyonu butonu (devam et / tekrar oyna)
    this.actionBtn = this.add.text(W / 2, H / 2 + 60, '', {
      fontFamily  : 'monospace',
      fontSize    : '18px',
      color       : '#000000',
      backgroundColor: '#00ff88',
      padding     : { x: 20, y: 10 },
      align       : 'center',
    })
      .setOrigin(0.5)
      .setDepth(21)
      .setVisible(false)
      .setInteractive({ useHandCursor: true })
      .on('pointerover',  () => this.actionBtn.setStyle({ color: '#000000', backgroundColor: '#00cc66' }))
      .on('pointerout',   () => this.actionBtn.setStyle({ color: '#000000', backgroundColor: '#00ff88' }))
      .on('pointerdown',  () => this.onActionBtn());

    // "Tekrar Oyna" butonu — sadece game over ekranında görünür
    this.restartBtn = this.add.text(W / 2, H / 2 + 115, '[ Tekrar Oyna ]', {
      fontFamily  : 'monospace',
      fontSize    : '15px',
      color       : '#888888',
      backgroundColor: '#1a1a2e',
      padding     : { x: 16, y: 8 },
      align       : 'center',
    })
      .setOrigin(0.5)
      .setDepth(21)
      .setVisible(false)
      .setInteractive({ useHandCursor: true })
      .on('pointerover',  () => this.restartBtn.setStyle({ color: '#ffffff' }))
      .on('pointerout',   () => this.restartBtn.setStyle({ color: '#888888' }))
      .on('pointerdown',  () => this.onRestartBtn());

    this.refreshLevelUI();
  }

  // ── Update döngüsü ────────────────────────────────────────────────────

  update() {
    // PAUSED veya GAME_OVER durumunda oyun mantığı çalışmaz
    if (this.gameState !== GAME_STATE.PLAYING) return;

    const { width: W, height: H } = this.scale;

    updatePrice(this.priceState, this.mouseY, H);

    if (this.priceState.sampleTick === 0) {
      tickLevel(this.levelState, this.priceState);

      if (this.levelState.complete) {
        const isLast = this.levelIndex >= LEVEL_CONFIGS.length - 1;
        this.showPauseScreen(isLast ? 'game_over' : 'next_level');
        return;
      }
      if (isLevelFailed(this.levelState)) {
        this.showPauseScreen('restart');
        return;
      }
    }

    this.drawGraph(W, H);
    this.updateUI(W, H);
  }

  // ── Duraklatma ekranı ─────────────────────────────────────────────────

  showPauseScreen(type) {
    this.gameState   = type === 'game_over' ? GAME_STATE.GAME_OVER : GAME_STATE.PAUSED;
    this.pendingNext = type;

    const W = this.scale.width;
    const H = this.scale.height;

    this.overlayBg.setFillStyle(0x000000, 0.65);
    this.overlayBg.setPosition(W / 2, H / 2);

    if (type === 'game_over') {
      this.overlayLabel
        .setText('🏆 TÜM BÖLÜMLER TAMAMLANDI')
        .setColor('#ffd700')
        .setVisible(true);
      this.subLabel
        .setText('Piyasayı çökerttiniz. İş dünyası sizi arıyor.')
        .setVisible(true);
      this.actionBtn
        .setText('[ Oyun Bitti ]')
        .setStyle({ backgroundColor: '#ffd700', color: '#000000' })
        .setVisible(true);
      this.restartBtn.setVisible(true); // "Tekrar Oyna" butonu görünür
    } else if (type === 'next_level') {
      this.overlayLabel
        .setText(`✅ ${this.levelState.config.label} TAMAMLANDI`)
        .setColor('#00ff88')
        .setVisible(true);
      this.subLabel
        .setText('Sonraki bölüme hazır mısın?')
        .setVisible(true);
      this.actionBtn
        .setText('[ Devam Et ]')
        .setStyle({ backgroundColor: '#00ff88', color: '#000000' })
        .setVisible(true);
      this.restartBtn.setVisible(false);
    } else { // restart
      this.overlayLabel
        .setText('⚠ İLGİ BİTTİ')
        .setColor('#ff4466')
        .setVisible(true);
      this.subLabel
        .setText('Piyasa seni unuttu. Tekrar dene.')
        .setVisible(true);
      this.actionBtn
        .setText('[ Tekrar Dene ]')
        .setStyle({ backgroundColor: '#ff4466', color: '#ffffff' })
        .setVisible(true);
      this.restartBtn.setVisible(false);
    }
  }

  hideOverlay() {
    this.overlayBg.setFillStyle(0x000000, 0);
    this.overlayLabel.setVisible(false);
    this.subLabel.setVisible(false);
    this.actionBtn.setVisible(false);
    this.restartBtn.setVisible(false);
  }

  // Oyuncu aksiyonu butonu (Devam / Tekrar Dene)
  onActionBtn() {
    if (this.gameState === GAME_STATE.GAME_OVER) {
      // Oyun gerçekten bitti — butona basılsa da hiçbir şey olmaz
      // (zaten "Oyun Bitti" yazıyor, tekrar oyna için ayrı buton var)
      return;
    }

    const type = this.pendingNext;
    this.hideOverlay();

    if (type === 'next_level') {
      this.levelIndex++;
      this.levelState  = createLevelState(LEVEL_CONFIGS[this.levelIndex]);
      this.priceState  = createPriceState(); // yeni levelde grafik sıfırlanır
      this.refreshLevelUI();
    } else if (type === 'restart') {
      this.levelState  = createLevelState(LEVEL_CONFIGS[this.levelIndex]);
      this.priceState  = createPriceState();
      this.refreshLevelUI();
    }

    this.pendingNext = null;
    this.gameState   = GAME_STATE.PLAYING;
  }

  // Tekrar Oyna — baştan başla (sadece game over ekranında)
  onRestartBtn() {
    this.levelIndex  = 0;
    this.levelState  = createLevelState(LEVEL_CONFIGS[this.levelIndex]);
    this.priceState  = createPriceState();
    this.pendingNext = null;
    this.hideOverlay();
    this.refreshLevelUI();
    this.gameState = GAME_STATE.PLAYING;
  }

  // ── Level UI ──────────────────────────────────────────────────────────

  refreshLevelUI() {
    const cfg = this.levelState.config;
    this.levelLabel.setText(cfg.label);
    this.hintLabel.setText(`💡 ${cfg.hint}`);

    this.npcTexts.forEach((t, i) => {
      t.setVisible(i < cfg.npcCount).setText('');
    });
  }

  // ── Grafik çizimi ────────────────────────────────────────────────────

  drawGraph(W, H) {
    // Arkaplan grid
    this.bgGfx.clear();
    this.bgGfx.lineStyle(1, 0x1a1a2e, 1);
    for (let i = 0; i <= 4; i++) {
      this.bgGfx.lineBetween(0, (H / 4) * i, W, (H / 4) * i);
    }
    const refY = priceToY(this.priceState.current, H);
    this.bgGfx.lineStyle(1, 0x00ff88, 0.18);
    this.bgGfx.lineBetween(0, refY, W, refY);

    // Fiyat geçmişi — sadece null olmayan (gerçek) noktalar çizilir
    this.fgGfx.clear();
    const history = this.priceState.history;
    const stepX   = W / (HISTORY_LEN - 1);

    this.fgGfx.lineStyle(2, 0x00ff88, 1);
    this.fgGfx.beginPath();

    let pathStarted = false;
    for (let i = 0; i < history.length; i++) {
      if (history[i] === null) continue; // boş slotları atla

      const x = i * stepX;
      const y = priceToY(history[i], H);

      if (!pathStarted) {
        this.fgGfx.moveTo(x, y);
        pathStarted = true;
      } else {
        this.fgGfx.lineTo(x, y);
      }
    }
    this.fgGfx.strokePath();

    // 'bought' durumundaki NPC alış çizgileri
    for (const npc of this.levelState.npcs) {
      if (npc.state === 'bought') {
        const by = priceToY(npc.buyPrice, H);
        this.fgGfx.lineStyle(1, 0xffaa00, 0.45);
        this.fgGfx.lineBetween(0, by, W, by);
      }
    }
  }

  // ── Dinamik UI ───────────────────────────────────────────────────────

  updateUI(W, H) {
    const pct    = Math.round(this.priceState.current * 100);
    const labelY = priceToY(this.priceState.current, H) - 10;
    this.priceLabel.setPosition(W - 52, Math.max(4, Math.min(H - 20, labelY)));
    this.priceLabel.setText(`${pct}%`);

    const { lossCount, config } = this.levelState;
    this.progressLabel.setText(`Zarara uğrat: ${lossCount} / ${config.targetLoss}`);

    this.levelState.npcs.forEach((npc, i) => {
      const txt      = this.npcTexts[i];
      const interest = Math.round(npc.interest);
      const filled   = Math.round(interest / 10);
      const bar      = '█'.repeat(filled) + '░'.repeat(10 - filled);
      const archName = ARCHETYPE_LABEL[npc.archetype] || npc.archetype;

      const lines = [
        `NPC #${npc.id + 1} [${archName}]  ${STATE_LABEL[npc.state]}`,
        `İlgi: [${bar}]`,
      ];
      if (npc.state === 'bought') {
        lines.push(`Alış: %${Math.round(npc.buyPrice * 100)}`);
      } else if (npc.state === 'sold_loss') {
        const loss = Math.round((npc.buyPrice - npc.sellPrice) * 100);
        lines.push(`Zarar: -%${loss} ✓`);
      }

      txt.setText(lines.join('\n')).setColor(STATE_COLOR[npc.state]);
    });
  }
}

// ─── PHASER KONFİGÜRASYONU ───────────────────────────────────────────────

new Phaser.Game({
  type           : Phaser.AUTO,
  width          : window.innerWidth,
  height         : window.innerHeight,
  backgroundColor: '#0a0a0f',
  fps            : { target: 60, limit: 60 },
  scene          : [GameScene],
});