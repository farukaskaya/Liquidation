import Phaser from 'phaser';

// ─── SEEDED RNG (Mulberry32) ──────────────────────────────────────────────────

/**
 * Deterministik PRNG (Mulberry32).
 * Verilen sayısal seed ile 0-1 arası tekrarlanabilir sözde rastgele sayılar üretir.
 */
function createRNG(seed) {
  let s = (seed >>> 0) || 1337;
  return function() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── GLOBAL SABİTLER ──────────────────────────────────────────────────────────

const LERP_SPEED      = 0.22;
const SAMPLE_INTERVAL = 20;
const HISTORY_LEN     = 180;
const CHART_PAD       = 22;
const CHART_RADIUS    = 14;
const MAX_NPC_SLOTS   = 8;

// ─── LEVEL TANIMLARI (İlk 4 Öğretici Bölüm) ───────────────────────────────────

const LEVEL_CONFIGS = [
  {
    id         : 1,
    label      : 'LEVEL 1 — Armut CO. Stoğu',
    targetLoss : 4,
    npcCount   : 5,
    archetypes : ['retail', 'retail', 'retail', 'retail', 'retail'],
    hint       : 'Yükselt, perakendeciler alsın; sonra anında çökert!',
  },
  {
    id         : 2,
    label      : 'LEVEL 2 — Wuehai Stoğu',
    targetLoss : 5,
    npcCount   : 6,
    archetypes : ['retail', 'retail', 'hodler', 'hodler', 'retail', 'retail'],
    hint       : "HODL'cular çok bekler — sabırla yükselt, sonra çok sert düşür",
  },
  {
    id         : 3,
    label      : 'LEVEL 3 — Planet Y Stoğu',
    targetLoss : 5,
    npcCount   : 7,
    archetypes : ['retail', 'hodler', 'contrarian', 'contrarian', 'retail', 'hodler', 'retail'],
    hint       : 'Kontraryenler düşüşte alır — onları önce düşüşle kandır, sonra batır',
  },
  {
    id         : 4,
    label      : 'LEVEL 4 — Yıldırım Fonu Ltd.',
    targetLoss : 5,
    npcCount   : 7,
    archetypes : ['scalper', 'hodler', 'contrarian', 'contrarian', 'scalper', 'hodler', 'scalper'],
    hint       : 'Scalperlar anında kaçar — fırsat vermeden hızlıca aşağı vur',
  },
];

// ─── ARKETİPLER ───────────────────────────────────────────────────────────────

const ARCHETYPES = {
  retail: {
    BUY_STREAK   : 25,
    LOSS_TRIGGER : 0.08,
    GAIN_TRIGGER : 0.12,
    INTEREST_DEC : 0.25,
    BUY_ON_RISE  : true,
  },
  hodler: {
    BUY_STREAK   : 60,
    LOSS_TRIGGER : 0.20,
    GAIN_TRIGGER : 0.30,
    INTEREST_DEC : 0.10,
    BUY_ON_RISE  : true,
  },
  contrarian: {
    BUY_STREAK   : 20,
    LOSS_TRIGGER : 0.06,
    GAIN_TRIGGER : 0.10,
    INTEREST_DEC : 0.30,
    BUY_ON_RISE  : false,
  },
  scalper: {
    BUY_STREAK   : 8,
    LOSS_TRIGGER : 0.03,
    GAIN_TRIGGER : 0.04,
    INTEREST_DEC : 0.40,
    BUY_ON_RISE  : true,
  },
};

const ARCHETYPE_KEYS = Object.keys(ARCHETYPES);

// ─── SAF FONKSİYONLAR: FİYAT ─────────────────────────────────────────────────

function createPriceState() {
  return {
    current    : 0.5,
    target     : 0.5,
    history    : Array(HISTORY_LEN).fill(null),
    sampleTick : 0,
    sampleCount: 0,
  };
}

function updatePrice(state, mouseY, chartY, chartH) {
  const relY    = mouseY - chartY;
  state.target  = 1 - (relY / chartH);
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

function getPriceVelocity(history, frames = 8) {
  const real = history.filter(v => v !== null);
  if (real.length < frames + 1) return 0;
  return real[real.length - 1] - real[real.length - 1 - frames];
}

function priceToY(p, chartY, chartH, pad = CHART_PAD) {
  return chartY + pad + (1 - p) * (chartH - pad * 2);
}

// ─── SAF FONKSİYONLAR: NPC ───────────────────────────────────────────────────

function createNPC(id, archetype, rng) {
  const base = ARCHETYPES[archetype];

  // Bireysel varyans / jitter (±%15 sapma)
  // Böylece aynı tipteki NPC'ler senkronize bir arı kovanı gibi değil,
  // kademeli olarak farklı anlarda alıp satar.
  const streakJitter   = 0.85 + rng() * 0.30;
  const lossJitter     = 0.88 + rng() * 0.24;
  const gainJitter     = 0.88 + rng() * 0.24;
  const interestJitter = 0.85 + rng() * 0.30;

  return {
    id,
    archetype,
    state         : 'watching',
    buyPrice      : null,
    sellPrice     : null,
    interest      : 70 + rng() * 30,
    streak        : 0,
    buyStreak     : Math.max(3, Math.round(base.BUY_STREAK * streakJitter)),
    lossTrigger   : +(base.LOSS_TRIGGER * lossJitter).toFixed(3),
    gainTrigger   : +(base.GAIN_TRIGGER * gainJitter).toFixed(3),
    interestDec   : +(base.INTEREST_DEC * interestJitter).toFixed(3),
    buyOnRise     : base.BUY_ON_RISE,
  };
}

function tickNPC(npc, priceState) {
  if (npc.state === 'sold_loss' || npc.state === 'sold_gain') return null;

  const price    = priceState.current;
  const velocity = getPriceVelocity(priceState.history);
  const isMoving = Math.abs(velocity) > 0.003;

  if (!isMoving) {
    npc.interest = Math.max(0, npc.interest - npc.interestDec);
  }

  if (npc.state === 'watching') {
    if (npc.buyOnRise) {
      npc.streak = velocity > 0.003 ? npc.streak + 1 : Math.max(0, npc.streak - 2);
    } else {
      npc.streak = velocity < -0.003 ? npc.streak + 1 : Math.max(0, npc.streak - 2);
    }
    if (npc.streak >= npc.buyStreak) {
      npc.state    = 'bought';
      npc.buyPrice = price;
      npc.streak   = 0;
    }
  } else if (npc.state === 'bought') {
    const delta = price - npc.buyPrice;
    if (delta <= -npc.lossTrigger) {
      npc.state = 'sold_loss';
      npc.sellPrice = price;
      return 'loss';
    }
    if (delta >= npc.gainTrigger) {
      npc.state = 'sold_gain';
      npc.sellPrice = price;
      return 'gain';
    }
  }
  return null;
}

// ─── SAF FONKSİYONLAR: LEVEL & PROCEDURAL GENERATION ────────────────────────

function generateInfiniteLevel(levelIndex, stockNames, rng) {
  const stockName = (stockNames && stockNames.length > 0)
    ? stockNames[Math.floor(rng() * stockNames.length)]
    : 'Bilinmeyen Varlık A.Ş.';

  // min 3, max 7 NPC
  const npcCount = 3 + Math.floor(rng() * 5);
  const archetypes = Array.from({ length: npcCount }, () =>
    ARCHETYPE_KEYS[Math.floor(rng() * ARCHETYPE_KEYS.length)]
  );

  // Hedef: NPC'lerin en az ~%70'ini likide et (min 2)
  const targetLoss = Math.max(2, Math.round(npcCount * 0.7));

  return {
    id         : levelIndex + 1,
    label      : `LEVEL ${levelIndex + 1} — ${stockName}`,
    targetLoss,
    npcCount,
    archetypes,
    hint       : 'Absürt piyasa dinamikleri! Arketipler karışık, oyunu oku.',
  };
}

function getLevelConfig(levelIndex, stockNames, rng) {
  if (levelIndex < LEVEL_CONFIGS.length) {
    return LEVEL_CONFIGS[levelIndex];
  }
  return generateInfiniteLevel(levelIndex, stockNames, rng);
}

function createLevelState(config, rng) {
  return {
    config,
    npcs      : config.archetypes.map((arch, i) => createNPC(i, arch, rng)),
    lossCount : 0,
    complete  : false,
  };
}

function tickLevel(level, priceState, onEarn) {
  if (level.complete) return;
  for (const npc of level.npcs) {
    const result = tickNPC(npc, priceState);
    if (result === 'loss') {
      level.lossCount++;
      if (level.lossCount >= level.config.targetLoss) level.complete = true;
      if (onEarn) {
        const earned = Math.round((npc.buyPrice - npc.sellPrice) * 10000);
        onEarn(earned);
      }
    }
  }
}

function isLevelFailed(level) {
  if (level.complete) return false;
  const active = level.npcs.filter(n => n.state === 'watching' || n.state === 'bought');
  return active.length === 0 || active.every(n => n.interest <= 0);
}

function formatCurrency(n) {
  return '$' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ─── UI SABİTLERİ ─────────────────────────────────────────────────────────────

const STATE_COLOR = {
  watching  : '#888899',
  bought    : '#ffaa00',
  sold_loss : '#ff4466',
  sold_gain : '#44aaff',
};

const STATE_LABEL = {
  watching  : '(0 -0 ) İzliyor',
  bought    : '$ ALDI',
  sold_loss : '(T - T) Zararda',
  sold_gain : '(0 U 0) Kârda kaçtı',
};

const ARCHETYPE_LABEL = {
  retail     : 'Perakende',
  hodler     : 'HODLer',
  contrarian : 'Kontraryen',
  scalper    : 'Scalper',
};

const GAME_STATE = {
  PLAYING  : 'playing',
  PAUSED   : 'paused',
};

// ─── PHASER SAHNESİ ───────────────────────────────────────────────────────────

class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  preload() {
    // public/stocks.txt dosyasını yükler
    this.load.text('stockNames', 'stocks.txt');
  }

  create() {
    // Metin dosyasından stok listesini al
    const raw = this.cache.text.get('stockNames') || '';
    this.stockNames = raw
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    if (this.stockNames.length === 0) {
      this.stockNames = ['Uzay Muzları A.Ş.', 'Çorap Coin', 'FOMO Holding'];
    }

    // Oyun çekirdek durumu
    this.baseSeed   = 4242;
    this.levelIndex = 0;
    this.currency   = 0;
    this.gameState  = GAME_STATE.PLAYING;
    this.pendingNext = null;
    this.mouseY     = this.scale.height / 2;

    this.input.on('pointermove', p => { this.mouseY = p.y; });
    this.scale.on('resize', () => { this.recomputeLayout(); });

    // Grafik katmanları
    this.bgGfx = this.add.graphics();
    this.fgGfx = this.add.graphics();

    // Üst Panel: Beyaz arka plan üstünde koyu metinler
    this.levelLabel = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '17px', fontStyle: 'bold', color: '#111118',
    }).setDepth(10);

    this.progressLabel = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#444455',
    }).setDepth(10);

    this.hintLabel = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#666677',
    }).setDepth(10);

    this.currencyLabel = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '20px', fontStyle: 'bold', color: '#0a8844', align: 'right',
    }).setOrigin(1, 0).setDepth(10);

    // Fiyat etiketi: Grafiğin sağ kenarında, çizgiye bağlı yeşil kutu
    this.priceLabel = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#000000',
      backgroundColor: '#00ff88', padding: { x: 5, y: 3 },
    }).setDepth(15);

    // NPC Kartları (Grafiğin altında yatay sıralı)
    this.npcTexts = Array.from({ length: MAX_NPC_SLOTS }, () =>
      this.add.text(0, 0, '', {
        fontFamily : 'monospace',
        fontSize   : '11px',
        color      : '#cccccc',
        padding    : { x: 2, y: 2 },
      }).setDepth(12).setVisible(false)
    );

    // Overlay (Tam ekran karartma & Durum Ekranı)
    const W = this.scale.width;
    const H = this.scale.height;
    this.overlayBg = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(20);

    this.overlayLabel = this.add.text(W / 2, H / 2 - 45, '', {
      fontFamily: 'monospace', fontSize: '24px', fontStyle: 'bold', color: '#ffffff', align: 'center',
    }).setOrigin(0.5).setDepth(22).setVisible(false);

    this.subLabel = this.add.text(W / 2, H / 2, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#aaaaaa', align: 'center',
    }).setOrigin(0.5).setDepth(22).setVisible(false);

    this.overlayEarnings = this.add.text(W / 2, H / 2 + 30, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#00ff88', align: 'center',
    }).setOrigin(0.5).setDepth(22).setVisible(false);

    this.actionBtn = this.add.text(W / 2, H / 2 + 75, '', {
      fontFamily: 'monospace', fontSize: '17px', fontStyle: 'bold', color: '#000000',
      backgroundColor: '#00ff88', padding: { x: 22, y: 10 }, align: 'center',
    })
      .setOrigin(0.5).setDepth(23).setVisible(false)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => this.actionBtn.setStyle({ backgroundColor: '#00cc66' }))
      .on('pointerout',  () => this.actionBtn.setStyle({ backgroundColor: '#00ff88' }))
      .on('pointerdown', () => this.onActionBtn());

    this.initLevel();
  }

  recomputeLayout() {
    const W = this.scale.width;
    const H = this.scale.height;

    // Ortalanmış grafik paneli (ekranın ~%76 genişliği, max 940px)
    const chartW = Math.min(940, Math.max(480, Math.round(W * 0.76)));
    const chartH = Math.min(420, Math.max(240, Math.round(H * 0.48)));
    const chartX = Math.round((W - chartW) / 2);
    const chartY = 88;

    this.chart = { x: chartX, y: chartY, w: chartW, h: chartH };

    // NPC kartları alanı (grafiğin hemen altında)
    const npcY = chartY + chartH + 16;
    const npcH = Math.min(105, Math.max(75, H - npcY - 16));
    this.npcArea = { y: npcY, h: npcH };

    // Üst başlıkları hizala
    this.levelLabel.setPosition(chartX, 18);
    this.progressLabel.setPosition(chartX, 42);
    this.hintLabel.setPosition(chartX, 64);
    this.currencyLabel.setPosition(chartX + chartW, 20);

    // Overlay merkezini güncelle
    this.overlayBg.setPosition(W / 2, H / 2).setSize(W, H);
    this.overlayLabel.setPosition(W / 2, H / 2 - 45);
    this.subLabel.setPosition(W / 2, H / 2);
    this.overlayEarnings.setPosition(W / 2, H / 2 + 30);
    this.actionBtn.setPosition(W / 2, H / 2 + 75);
  }

  initLevel() {
    this.recomputeLayout();

    // Deterministik Seed: Seviye numarasına göre tekrarlanabilir
    const levelRng = createRNG(this.baseSeed + this.levelIndex * 7919);
    const config   = getLevelConfig(this.levelIndex, this.stockNames, levelRng);

    this.levelState = createLevelState(config, levelRng);
    this.priceState = createPriceState();

    this.refreshLevelUI();
  }

  // ── Update döngüsü ────────────────────────────────────────────────────────

  update() {
    if (this.gameState !== GAME_STATE.PLAYING) return;

    const { y: chartY, h: chartH } = this.chart;
    updatePrice(this.priceState, this.mouseY, chartY, chartH);

    if (this.priceState.sampleTick === 0) {
      tickLevel(this.levelState, this.priceState, (amount) => {
        this.currency += amount;
      });

      if (this.levelState.complete) {
        this.showPauseScreen('next_level');
        return;
      }
      if (isLevelFailed(this.levelState)) {
        this.showPauseScreen('restart');
        return;
      }
    }

    this.drawGraph();
    this.updateUI();
  }

  // ── Çizim: Koyu Gri Panel + Fiyat Çizgisi + Alt NPC Kartları ───────────────

  drawGraph() {
    const { x: cx, y: cy, w: cw, h: ch } = this.chart;
    const { y: ny, h: nh } = this.npcArea;

    this.bgGfx.clear();

    // 1. Ana Grafik Paneli: Koyu Gri (#161722)
    this.bgGfx.fillStyle(0x161722, 1);
    this.bgGfx.fillRoundedRect(cx, cy, cw, ch, CHART_RADIUS);
    this.bgGfx.lineStyle(1, 0x2a2c3d, 1);
    this.bgGfx.strokeRoundedRect(cx, cy, cw, ch, CHART_RADIUS);

    // Izgara çizgileri
    this.bgGfx.lineStyle(1, 0x232433, 1);
    for (let i = 1; i < 4; i++) {
      const gy = cy + CHART_PAD + (i / 4) * (ch - CHART_PAD * 2);
      this.bgGfx.lineBetween(cx + CHART_PAD, gy, cx + cw - CHART_PAD, gy);
    }

    // Fiyat referans çizgisi
    const refY = priceToY(this.priceState.current, cy, ch);
    this.bgGfx.lineStyle(1, 0x00ff88, 0.2);
    this.bgGfx.lineBetween(cx + CHART_PAD, refY, cx + cw - CHART_PAD, refY);

    // 2. Alt Panel: NPC Kart Arka Planları (Koyu Gri mini kutucuklar)
    const count = this.levelState.npcs.length;
    const gap   = 8;
    const cardW = Math.floor((cw - (count - 1) * gap) / count);

    for (let i = 0; i < count; i++) {
      const kx = cx + i * (cardW + gap);
      this.bgGfx.fillStyle(0x161722, 1);
      this.bgGfx.fillRoundedRect(kx, ny, cardW, nh, 8);
      this.bgGfx.lineStyle(1, 0x2a2c3d, 1);
      this.bgGfx.strokeRoundedRect(kx, ny, cardW, nh, 8);
    }

    // 3. Fiyat Çizgisi & Alış Noktaları
    this.fgGfx.clear();
    const history = this.priceState.history;
    const innerW  = cw - CHART_PAD * 2;
    const stepX   = innerW / (HISTORY_LEN - 1);

    this.fgGfx.lineStyle(2.5, 0x00ff88, 1);
    this.fgGfx.beginPath();

    let pathStarted = false;
    for (let i = 0; i < history.length; i++) {
      if (history[i] === null) continue;
      const px = cx + CHART_PAD + i * stepX;
      const py = priceToY(history[i], cy, ch);
      if (!pathStarted) { this.fgGfx.moveTo(px, py); pathStarted = true; }
      else               { this.fgGfx.lineTo(px, py); }
    }
    this.fgGfx.strokePath();

    // Satın almış NPC'lerin alış seviyeleri (turuncu çizgi)
    for (const npc of this.levelState.npcs) {
      if (npc.state === 'bought') {
        const by = priceToY(npc.buyPrice, cy, ch);
        this.fgGfx.lineStyle(1.5, 0xffaa00, 0.6);
        this.fgGfx.lineBetween(cx + CHART_PAD, by, cx + cw - CHART_PAD, by);
      }
    }
  }

  // ── Metinler ve Arayüz Güncellemesi ───────────────────────────────────────

  updateUI() {
    const { x: cx, y: cy, w: cw, h: ch } = this.chart;
    const { y: ny, h: nh } = this.npcArea;

    // Fiyat Rozeti
    const pct    = Math.round(this.priceState.current * 100);
    const labelY = priceToY(this.priceState.current, cy, ch);
    this.priceLabel
      .setPosition(cx + cw - 52, Math.max(cy + 4, Math.min(cy + ch - 22, labelY - 9)))
      .setText(`${pct}%`);

    // İlerleme ve Bakiye
    const { lossCount, config } = this.levelState;
    this.progressLabel.setText(`Zarara Uğrat: ${lossCount} / ${config.targetLoss}`);
    this.currencyLabel.setText(`Kazanç: ${formatCurrency(this.currency)}`);

    // NPC Kartlarının İçerikleri
    const count = this.levelState.npcs.length;
    const gap   = 8;
    const cardW = Math.floor((cw - (count - 1) * gap) / count);

    this.levelState.npcs.forEach((npc, i) => {
      const kx       = cx + i * (cardW + gap);
      const txt      = this.npcTexts[i];
      const interest = Math.round(npc.interest);
      const filled   = Math.round(interest / 10);
      const bar      = '█'.repeat(filled) + '░'.repeat(10 - filled);
      const archName = ARCHETYPE_LABEL[npc.archetype] || npc.archetype;

      const lines = [
        `#${npc.id + 1} ${archName}`,
        STATE_LABEL[npc.state],
        `[${bar}]`,
      ];

      if (npc.state === 'bought') {
        lines.push(`Alış: %${Math.round(npc.buyPrice * 100)}`);
      } else if (npc.state === 'sold_loss') {
        const earned = Math.round((npc.buyPrice - npc.sellPrice) * 10000);
        lines.push(`+${formatCurrency(earned)} ✓`);
      } else if (npc.state === 'sold_gain') {
        lines.push('Kaçtı ✗');
      }

      txt
        .setPosition(kx + 6, ny + 6)
        .setText(lines.join('\n'))
        .setColor(STATE_COLOR[npc.state])
        .setVisible(true);
    });

    for (let i = count; i < MAX_NPC_SLOTS; i++) {
      this.npcTexts[i].setVisible(false);
    }
  }

  // ── Seviye Geçiş ve Duraklama Ekranı ───────────────────────────────────────

  showPauseScreen(type) {
    this.gameState   = GAME_STATE.PAUSED;
    this.pendingNext = type;

    this.overlayBg.setFillStyle(0x000000, 0.72);
    this.overlayEarnings.setText(`Toplam Kazanç: ${formatCurrency(this.currency)}`).setVisible(true);

    if (type === 'next_level') {
      this.overlayLabel.setText(`✅ ${this.levelState.config.label} TAMAMLANDI`).setColor('#00ff88').setVisible(true);
      const sub = this.levelIndex >= 3
        ? 'Sonsuz piyasada sıradaki vurguna hazır mısın?'
        : 'Sonraki seviyeye hazır mısın?';
      this.subLabel.setText(sub).setVisible(true);
      this.actionBtn.setText('[ Devam Et ]').setStyle({ backgroundColor: '#00ff88', color: '#000000' }).setVisible(true);
    } else {
      this.overlayLabel.setText('⚠ İLGİ BİTTİ').setColor('#ff4466').setVisible(true);
      this.subLabel.setText('Piyasa seni unuttu. Tekrar dene.').setVisible(true);
      this.actionBtn.setText('[ Tekrar Dene ]').setStyle({ backgroundColor: '#ff4466', color: '#ffffff' }).setVisible(true);
    }
  }

  hideOverlay() {
    this.overlayBg.setFillStyle(0x000000, 0);
    this.overlayLabel.setVisible(false);
    this.subLabel.setVisible(false);
    this.overlayEarnings.setVisible(false);
    this.actionBtn.setVisible(false);
  }

  onActionBtn() {
    const type = this.pendingNext;
    this.hideOverlay();

    if (type === 'next_level') {
      this.levelIndex++;
    }
    // Her iki durumda da initLevel çalışır (restart'ta aynı bölüm, next'te bir sonraki)
    this.initLevel();

    this.pendingNext = null;
    this.gameState   = GAME_STATE.PLAYING;
  }

  refreshLevelUI() {
    const cfg = this.levelState.config;
    this.levelLabel.setText(cfg.label);
    this.hintLabel.setText(`💡 ${cfg.hint}`);
  }
}

// ─── PHASER KONFİGÜRASYONU ───────────────────────────────────────────────────

new Phaser.Game({
  type           : Phaser.AUTO,
  width          : window.innerWidth,
  height         : window.innerHeight,
  backgroundColor: '#ffffff', // Beyaz site arka planı
  scale          : {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  fps            : { target: 60, limit: 60 },
  scene          : [GameScene],
});