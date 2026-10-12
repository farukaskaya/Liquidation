# Likidasyon

> Borsa grafiği sensin. Amacın sana güvenen herkesi batırmak.

[Jam adı] için 1 ayda yapılmış, web tabanlı bir absürt strateji oyunu. Tema: **absürtlük**.

![Oynanış](screenshots/gameplay.gif)
<!-- screenshots/ klasörü aç, GIF'i veya ana ekran görüntüsünü gameplay.gif / gameplay.png olarak koy -->

**[▶ Oyna: itch.io'da]([itch.io linki])**

---

## Oyun hakkında

Her finans oyununda yatırımcı olursun ve kazanmaya çalışırsın. Burada tam tersi: sen yatırımcıların baktığı fiyat çizgisinin kendisisin ve onları zarara uğratmaya çalışıyorsun.

Ama bir sorun var. İnsanlar ilgilerini kaybederse hiçbir şey yapamazsın. Fiyatı oynatmazsan ilgi düşer, ilgi biterse level baştan başlar. Yani onları batırmak için önce onların sana bakmaya devam etmesi lazım.

## Nasıl oynanır

- Fiyat çizgisini **[kontrol: fare / ok tuşları / ...]** ile yukarı ve aşağı oynatırsın.
- Yatırımcıların **ilgi** değeri var. Fiyat durağan kalırsa ilgi azalır.
- Pahalıdan alıp ucuzdan satan yatırımcı zarar eder.
- Her level'da belirli sayıda yatırımcıyı zarara uğratırsan level biter.
- İlgi biterse o level baştan başlar.
- Level ilerledikçe yatırımcılar akıllanır, yani başardıkça işin zorlaşır.
- Her level yeni bir varlık tipi getirir.

<!--
## Leveller

| Level | Varlık | Yeni olan |
|-------|--------|-----------|
| 1 | [varlık adı] | [ne öğretiyor] |
| 2 | [varlık adı] | [ne değişiyor] |
-->

## Neden absürt?

Oyunda yatırımcıları batırmaya çalışan bir borsa grafiğisin ama onları batırabilmek için bile ilgilerini canlı tutmak zorundasın. Kurbanın sana bakmayı bıraktığı an kaybediyorsun. Başardıkça kurbanların akıllanıyor, yani işin kolaylaşmıyor, zorlaşıyor. Hiçbir değeri olmayan bir şeyin fiyatı sadece insanlar ona bakıyor diye var, oyun da bunu olabildiğince ciddiye alıyor.

## Ekran görüntüleri

| | |
|---|---|
| ![Ana menü](screenshots/menu.png) | ![Level 1](screenshots/level1.png) |
| ![Level [x]](screenshots/level2.png) | ![Level [y]](screenshots/level3.png) |

## Çalıştırma

Dosyaları indir, klasörde terminal aç ve yerel bir sunucu başlat (tarayıcı `index.html`'i doğrudan açınca bazı dosyaları yüklemeyebilir):

```
python -m http.server 8000
```

Sonra tarayıcıda `http://localhost:8000` adresine git.

<!--
npm kullanıyorsan yukarıdaki yerine bunu yaz:

npm install
npm run dev
-->

## Teknolojiler

- [Phaser](https://phaser.io/) [sürüm]
- JavaScript, HTML, CSS

## Yapımcı

[@farukaskaya](https://github.com/farukaskaya)

## Lisans

[Lisans seç, örn. MIT. Seçmezsen "tüm hakları saklıdır" sayılır]
