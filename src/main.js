import Phaser from 'phaser';

//GLOBAL SABİTLER

const GRAPH_MARGIN    = 50;
const LERP_SPEED      = 0.5;  // İmleç hareket hızı
const SAMPLE_INTERVAL = 20;   // Her 20 framede 1 fiyat kaydı
const HISTORY_LEN     = 180;  // Grafik için fiyat kaydı

// LEVELLAR

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
    targetLoss : 4,
    npcCount   : 6,
    archetypes : ['retail', 'retail', 'retail', 'retail', 'retail', 'retail'],
    hint       : '???',  // Yeni arketip eklenecek
  },
  {
    id         : 3,
    label      : 'LEVEL 3 — Uyanık Piyasa',
    targetLoss : 5,
    npcCount   : 7,
    archetypes : ['retail', 'retail', 'retail', 'retail', 'retail', 'retail', 'retail'],
    hint       : '???',
  },
];

// ARKETİPLER

const ARCHETYPES = {
  retail: {
    BUY_STREAK   : 25,    // grafik yükseliş streaki
    LOSS_TRIGGER : 0.08,  // alış fiyatından %8 düşünce panik satış
    GAIN_TRIGGER : 0.12,  // alış fiyatından %12 yükselince satar
    INTEREST_DEC : 0.25,  // fiyat durgunken ilgi düşüşü/frame
  },
};

//FİYAT

function createPriceState() {
  return {
    current     : 0.5,
    target      : 0.5,
    history     : Array(HISTORY_LEN).fill(0.5),
    sampleTick  : 0,   // örnekleme sayacı
  };
}

function updatePrice(state, mouseY, screenH) {
  // Anlık fiyat her frame güncellenir
  state.target  = 1 - (mouseY / screenH);
  state.target  = Math.max(0.02, Math.min(0.98, state.target));
  state.current += (state.target - state.current) * LERP_SPEED;

  // Grafik geçmişi sadece her SAMPLE_INTERVAL frame üstünde kayıt
  state.sampleTick = (state.sampleTick + 1) % SAMPLE_INTERVAL;
  if (state.sampleTick === 0) {
    state.history.push(state.current);
    if (state.history.length > HISTORY_LEN) state.history.shift();
  }

  return state;
}

// Son 'frames' örnek içindeki fiyat değişiminin hız vektörü
function getPriceVelocity(history, frames = 8) {
  if (history.length < frames + 1) return 0;
  return history[history.length - 1] - history[history.length - 1 - frames];
}

// Normalize fiyat (0-1) -> ekran Y koordinatı
function priceToY(p, screenH) {
  return GRAPH_MARGIN + (1 - p) * (screenH - GRAPH_MARGIN * 2);
}

//NPC

function createNPC(id, archetype) {
  return {
    id,
    archetype,
    state        : 'watching',
    buyPrice     : null,
    sellPrice    : null,
    interest     : 75 + Math.random() * 25,
    risingStreak : 0,
  };
}

// Tek NPC tick
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
    if (velocity > 0.003) {
      npc.risingStreak++;
    } else {
      npc.risingStreak = Math.max(0, npc.risingStreak - 2);
    }
    if (npc.risingStreak >= params.BUY_STREAK) {
      npc.state        = 'bought';
      npc.buyPrice     = price;
      npc.risingStreak = 0;
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

//LEVEL Kodları

// Level configten yeni bir level state üretir
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

// Tüm aktif NPC'ler bitti ya da ilgileri sıfırlandıysa Fail
function isLevelFailed(level) {
  if (level.complete) return false;
  const active = level.npcs.filter(n => n.state === 'watching' || n.state === 'bought');
  return active.length === 0 || active.every(n => n.interest <= 0);
}

//UI Değişkenleri

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

//PHASER SAHNESİ

const MAX_NPC_SLOTS = 8; // desteklenen max NPC sayısı (panel slotları)

class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    this.priceState    = createPriceState();
    this.levelIndex    = 0;
    this.levelState    = createLevelState(LEVEL_CONFIGS[this.levelIndex]);
    this.transitioning = false;

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

    // Sol tarafa fiyat etiketi
    this.priceLabel = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#00ff88',
    }).setDepth(10);

    // Sağ tarafa NPC slotları
    this.npcTexts = Array.from({ length: MAX_NPC_SLOTS }, (_, i) =>
      this.add.text(W - 205, 80 + i * 68, '', {
        fontFamily: 'monospace', fontSize: '11px', color: '#cccccc',
        backgroundColor: '#0d0d1a', padding: { x: 6, y: 5 },
        wordWrap: { width: 190 },
      }).setDepth(10).setVisible(false)
    );

    // Geçiş / reset overlay metinleri
    this.overlayBg = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0)
      .setDepth(18);

    this.overlayLabel = this.add.text(W / 2, H / 2, '', {
      fontFamily: 'monospace', fontSize: '24px', color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5).setDepth(20).setVisible(false);

    this.subLabel = this.add.text(W / 2, H / 2 + 40, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#aaaaaa',
      align: 'center',
    }).setOrigin(0.5).setDepth(20).setVisible(false);

    this.refreshLevelUI();
  }

  update() {
    if (this.transitioning) return;

    const { width: W, height: H } = this.scale;

    updatePrice(this.priceState, this.mouseY, H);

    // NPC mantığını sadece yeni bir grafik örneği yazıldığında çalıştır.
    // Böylece NPC kararları frame hızıyla çalışmaz grafik hızıyla senkronize olur
    if (this.priceState.sampleTick === 0) {
      tickLevel(this.levelState, this.priceState);

      if (this.levelState.complete) {
        this.startTransition('complete');
        return;
      }
      if (isLevelFailed(this.levelState)) {
        this.startTransition('failed');
        return;
      }
    }

    this.drawGraph(W, H);
    this.updateUI(W, H);
  }

  //LEVEL GEÇİŞLERİ/RESET

  startTransition(type) {
    this.transitioning = true;

    if (type === 'complete') {
      const isLast = this.levelIndex >= LEVEL_CONFIGS.length - 1;
      this.showOverlay(
        isLast ? 'TÜM LEVELLAR TAMAMLANDI' : `✅ ${this.levelState.config.label} TAMAMLANDI`,
        isLast ? 'Oyun bitti!' : 'Sonraki level yükleniyor...',
        '#00ff88',
      );
      this.time.delayedCall(2200, () => {
        if (isLast) {
          this.hideOverlay();
          this.transitioning = false; // ya da "game won" ekranı
        } else {
          this.levelIndex++;
          this.levelState = createLevelState(LEVEL_CONFIGS[this.levelIndex]);
          this.refreshLevelUI();
          this.hideOverlay();
          this.transitioning = false;
        }
      });
    } else {
      this.showOverlay(
        '⚠ İLGİ BİTTİ',
        'Level baştan başlıyor...',
        '#ff4466',
      );
      this.time.delayedCall(1400, () => {
        this.levelState = createLevelState(LEVEL_CONFIGS[this.levelIndex]);
        this.refreshLevelUI();
        this.hideOverlay();
        this.transitioning = false;
      });
    }
  }

  showOverlay(title, sub, color) {
    this.overlayBg.setFillStyle(0x000000, 0.55);
    this.overlayLabel.setText(title).setColor(color).setVisible(true);
    this.subLabel.setText(sub).setVisible(true);
  }

  hideOverlay() {
    this.overlayBg.setFillStyle(0x000000, 0);
    this.overlayLabel.setVisible(false);
    this.subLabel.setVisible(false);
  }

  // Level değişince statik UI ı güncelle
  refreshLevelUI() {
    const cfg = this.levelState.config;
    this.levelLabel.setText(cfg.label);
    this.hintLabel.setText(`💡 ${cfg.hint}`);

    // NPC slotlarını görünür/gizli ayarla
    this.npcTexts.forEach((t, i) => {
      t.setVisible(i < cfg.npcCount).setText('');
    });
  }

  //GRAF

  drawGraph(W, H) {
    // Arkaplan grid + referans çizgisi
    this.bgGfx.clear();
    this.bgGfx.lineStyle(1, 0x1a1a2e, 1);
    for (let i = 0; i <= 4; i++) {
      this.bgGfx.lineBetween(0, (H / 4) * i, W, (H / 4) * i);
    }
    const refY = priceToY(this.priceState.current, H);
    this.bgGfx.lineStyle(1, 0x00ff88, 0.18);
    this.bgGfx.lineBetween(0, refY, W, refY);

    // Fiyat GEçmişi
    this.fgGfx.clear();
    const history = this.priceState.history;
    const stepX   = W / (history.length - 1);

    this.fgGfx.lineStyle(2, 0x00ff88, 1);
    this.fgGfx.beginPath();
    for (let i = 0; i < history.length; i++) {
      const x = i * stepX;
      const y = priceToY(history[i], H);
      i === 0 ? this.fgGfx.moveTo(x, y) : this.fgGfx.lineTo(x, y);
    }
    this.fgGfx.strokePath();

    // 'bought' durumundaki NPC'lerin alış çizgileri (turuncu)
    for (const npc of this.levelState.npcs) {
      if (npc.state === 'bought') {
        const by = priceToY(npc.buyPrice, H);
        this.fgGfx.lineStyle(1, 0xffaa00, 0.45);
        this.fgGfx.lineBetween(0, by, W, by);
      }
    }
  }

  //DİNAMİK UI

  updateUI(W, H) {
    // Fiyat etiketi
    const pct   = Math.round(this.priceState.current * 100);
    const labelY = priceToY(this.priceState.current, H) - 10;
    this.priceLabel.setPosition(W - 52, Math.max(4, Math.min(H - 20, labelY)));
    this.priceLabel.setText(`${pct}%`);

    // İlerleme
    const { lossCount, config } = this.levelState;
    this.progressLabel.setText(`Zarara uğrat: ${lossCount} / ${config.targetLoss}`);

    // NPC paneli
    this.levelState.npcs.forEach((npc, i) => {
      const txt      = this.npcTexts[i];
      const interest = Math.round(npc.interest);
      const filled   = Math.round(interest / 10);
      const bar      = '█'.repeat(filled) + '░'.repeat(10 - filled);

      const lines = [
        `NPC #${npc.id + 1}  ${STATE_LABEL[npc.state]}`,
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

// PHASER Konfigirasyonu

new Phaser.Game({
  type           : Phaser.AUTO,
  width          : window.innerWidth,
  height         : window.innerHeight,
  backgroundColor: '#0a0a0f',
  fps            : { target: 60, limit: 60 },
  scene          : [GameScene],
});