---
description: Güvenlik bulguları raporu. Projeyi saldırgan gözüyle tarar: erişim kontrolü, enjeksiyon, sırlar, bağımlılıklar, yapılandırma, AI ajanı güvenliği. En önemli 20 bulguyu 100 üzerinden puanlar.
argument-hint: [boş = tüm proje | klasör/özellik | --since <commit|tarih>]
---

Tür: **security** · Kapsam: $ARGUMENTS

1. `.claude/findings/protocol.md` dosyasını oku ve adımlarını sırayla uygula.
2. Bakış açısı, kontrol listesi ve araçlar için `.claude/findings/lenses/security.md` dosyasını kullan.
2a. **Paket:** `node .claude/hooks/tools.mjs --gerekli guvenlik`. Kapalıysa (çıkış 2) maliyetiyle açmayı sor; reddederse lens'teki araçlarla, derin tarama olmadan devam et.
2b. `claude-security` eklentisi yüklüyse derin tarama öner: `/claude-security scan codebase at medium` (kapsam `--since` ise `scan changes`). Süre ve token maliyetini plugin kendisi sorar; Pro planda limiti oku ve kullanıcıya bildir. Sonuç `CLAUDE-SECURITY-<zaman>/` klasörüne yazılır (git'e girmez). Doğrulanmış bulgularını rapora kaynak `claude-security` olarak al, aynı bulguyu iki kez sayma.
3. Raporu `.claude/findings/report-template.md` biçiminde `docs/findings/security/` altına yaz.
4. Kod değiştirme. Sadece rapor yaz, sonra hangi bulguların yol haritasına gireceğini sor.
