<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="kit/assets/banner-dark.svg">
    <img src="kit/assets/banner-light.svg" alt="TillerHand: Kodu AI yazar, dümen sende." width="100%">
  </picture>
</p>

<p align="center">
  <a href="kit/CHANGELOG.md"><img alt="Sürüm" src="https://img.shields.io/badge/s%C3%BCr%C3%BCm-3.26.0-2a78d6?style=flat-square"></a>
  <a href="LICENSE"><img alt="Lisans: MIT" src="https://img.shields.io/badge/lisans-MIT-2a78d6?style=flat-square"></a>
  <img alt="Claude Code" src="https://img.shields.io/badge/Claude%20Code-haz%C4%B1r-d97757?style=flat-square">
  <img alt="Node.js 18+" src="https://img.shields.io/badge/Node.js-18%2B-3c873a?style=flat-square">
</p>

<p align="center">
  <a href="README.md">English</a> · <b>Türkçe</b> · <a href="https://burakdogrul.github.io/TillerHand/kit/guide.html"><b>Rehberi oku →</b></a>
</p>

---

**TillerHand**, [Claude Code](https://claude.com/claude-code) ile gerçek bir ürünü ilk fikirden canlıya ve bakıma kadar götüren bir başlangıç kitidir. Kodu AI yazar, kararları sen verirsin. Ürün, teknik, tasarım ve maliyet kararlarının her biri sana birkaç seçenek, bir öneri ve her seçeneğin bedeliyle gelir.

## Neden TillerHand

| | |
|---|---|
| **Kararı sen verirsin** | AI önemli bir şeye girişmeden önce sorar: stack, veri modeli, tasarım, maliyet. Tasarım soruları görsel önizlemeyle gelir. |
| **Uzman kurulu denetler** | Ürün, mimari, güvenlik, UX, QA ve KVKK üyeleri planı, her görevi, her commit'i ve her fazı inceler. |
| **Söz değil, koruma** | Hook'lar sırrı, yıkıcı komutu, onaysız prod deploy'u ve zayıflatılan testi daha olmadan durdurur. |
| **Dağılmayan yapı** | Özellik bazlı klasör haritası, koddan önce yazılan kabul testleri ve projenin nerede olduğunu gösteren bir pano. |

## Hızlı başlangıç

Gereksinimler: [Claude Code](https://claude.com/claude-code), Git, Node.js 18+.

```bash
mkdir uygulamam && cd uygulamam
git clone https://github.com/burakdogrul/TillerHand.git vibe-kit
node vibe-kit/kit/kit.mjs init
claude
```

Sonra fikrini bir-üç cümleyle yaz:

```
/start Serbest çalışanlar için fatura ve tahsilat takip uygulaması
```

Var olan bir projen varsa `/adopt` kullan. Codex ve Antigravity de destekleniyor: `node vibe-kit/kit/kit.mjs init --tool codex`.

## Nasıl çalışır

| Adım | Komut | Ne olur |
|---|---|---|
| Planla | `/start` | Sorularla fikrin stack'e, mimariye, tasarıma ve yol haritasına dönüşür. |
| Geliştir | `/build` | Her seferinde tek görev: önce test, sonra kod, sonra inceleme. |
| Denetle | `/board` · `/findings-all` | Kurul ve teknik, güvenlik, UX, performans, hukuk için puanlı raporlar. |
| Yayınla | `/release first` | Kontrol listeleri, hosting ve alan adı kurulumu, onaylı prod deploy. |
| Bakım | `/maintain` · `/fix-bug` | Güncellemeler, canlı izleme ve kök nedenden hata düzeltme. |

Bütün komutlar, korumalar ve belgeler **[rehberde](https://burakdogrul.github.io/TillerHand/kit/guide.html)** anlatılıyor.

## Lisans

[MIT](LICENSE) © 2026 Burak Doğrul
