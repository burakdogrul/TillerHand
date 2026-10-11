# Lens: Teknik

**Bakış açısı:** Projeyi yıllarca bakımını yapacak kıdemli bir yazılım mimarı ve kod incelemecisi gözüyle tara. Soru: "Bu kod 6 ay sonra hâlâ güvenle değiştirilebilir mi, şu an gizli bir hata var mı?"

**Kimlik öneki:** `TECH-` · **Skill'ler:** `ponytail:ponytail-audit`, `mattpocock-skills:codebase-design`

## Kontrol listesi

1. **Hatalar:** Mantık hataları, ele alınmamış hata yolları (yutulan exception, `catch {}`), yanlış async/await, yarış durumları, null/undefined erişimleri, sınır değerleri (boş liste, 0, negatif, çok büyük), tarih/saat dilimi, yuvarlama (para).
2. **Tekrar eden kod:** Aynı mantığın birden fazla yerde yazılması (özellikle doğrulama, yetki kontrolü, formatlama, sorgular).
3. **Kullanılmayan kod:** Kullanılmayan dosya, export, bağımlılık, ortam değişkeni, özellik bayrağı, ölü dal.
4. **Yapı:** `.claude/structure.json` ihlalleri, özellikler arası iç içe geçme (`features/a` → `features/b/internal`), iş mantığının rotalarda veya UI'da kalması, yanlış katman.
5. **Karmaşıklık:** Çok uzun fonksiyon/dosya, derin iç içe koşullar, gereksiz soyutlama, tek kullanım için yazılmış genel çözümler.
6. **Tip güvenliği:** `any`, `as` zorlamaları, `@ts-ignore`, tiplenmemiş dış veri (API yanıtı, form) ve şemasız JSON.
7. **Veri katmanı:** N+1 sorgu, sınırsız liste, eksik indeks, geri alınamayan migration, transaction gereken yerde transaction olmaması.
8. **Testler:** Kritik akışlarda test yok; kabul kriteri kimliği taşımayan veya sadece mock'u test eden testler; kırılgan (flaky) test.
9. **Bağımlılıklar:** Eski majör sürümler, kullanılmayan paketler, aynı işi yapan iki paket, bakımı bırakılmış paket.
10. **Yapılandırma:** `.env.example` ile koddaki değişkenlerin uyumsuzluğu, sabit kodlanmış URL veya anahtar, ortam ayrımı.
11. **Hata yönetimi ve gözlem:** Kullanıcıya teknik hata gösterme, loglanmayan hatalar, Sentry'ye gitmeyen istisnalar.

## Araçlar

| Ne | Web / mobil (TS) | Backend (Python) |
|---|---|---|
| Tekrar eden kod | `npx --yes jscpd@4 --silent --reporters console .` | aynı |
| Kullanılmayan kod/bağımlılık | `npx --yes knip` | `uvx vulture app/ --min-confidence 80` |
| Tip ve lint | `npx tsc --noEmit`, `npm run lint` | `uv run ruff check .` |
| Yapı | `node .claude/hooks/structure-guard.mjs --check` | aynı |
| Testler | `npm run test` (JUnit raporlu) | `uv run pytest -q` |
| Bağımlılık eskiliği | `npm outdated` | `uv tree --outdated` |
