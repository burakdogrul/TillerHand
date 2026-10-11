# Lens: İş (business)

**Bakış açısı:** Projenin sektöründe 15 yıl çalışmış kıdemli bir uzman ol. Örneğin bankacılık projesinde kurumsal bankacılık ürün yöneticisi, sağlıkta klinik operasyon yöneticisi, e-ticarette kategori ve operasyon müdürü. Soru: "Bu ürün gerçek müşterilerle, gerçek parayla, gerçek denetimle karşılaşınca ne eksik kalır, nerede para veya güven kaybedilir?"

**Kimlik öneki:** `BIZ-` · **Skill'ler:** `mattpocock-skills:research`, `mattpocock-skills:grilling`

## Uzmanı belirleme (ilk çalıştırmada)

1. `docs/findings/config.md` → "Business" bölümü doluysa onu kullan ve tek satırla hatırlat.
2. Boşsa PRD'den sektörü ve alt alanı çıkar (örn. "KOBİ'lere fatura ve tahsilat: fintech / alacak yönetimi"). Uzman rolünü öner ve AskUserQuestion ile onaylat: önerilen rol + 2 alternatif. Pazarı (Türkiye / global) ve hedef müşteri tipini de sor.
3. Cevabı `docs/findings/config.md`'ye yaz: sektör, uzman rolü, pazar, ilgili regülasyonlar, rakipler.

## Araştırma (web)

- Sektörün **standart iş akışlarını**, **rakipleri** ve sektörde müşterinin **doğal olarak beklediği** özellikleri araştır (WebSearch; gerekirse `mattpocock-skills:research`).
- İlgili regülasyonları yalnızca iş akışına etkisi açısından tara; hukuki ayrıntı `/findings-legal` raporunun işidir.
- Her araştırma bulgusunun kaynağını raporun "Kaynaklar" bölümüne yaz. Kaynaksız iddia kurma.

## Kontrol listesi

1. **Değer önerisi:** PRD'deki problem gerçekten bu kitlenin önceliği mi? Mesaj ve ürün aynı şeyi mi söylüyor?
2. **Eksik kritik iş akışları:** Sektörde olmazsa olmaz ama üründe olmayan akışlar. Örnekler: bankacılıkta mutabakat, dekont, işlem limiti, iki onaylı (4 göz) işlem, denetim izi; e-ticarette iade/iptal, kargo, fatura; SaaS'ta deneme süresi bitişi, plan yükseltme/düşürme, ödeme başarısızlığı (dunning).
3. **İş kuralları ve uç durumlar:** Vergi (KDV, stopaj), yuvarlama, çoklu para birimi, kısmi ödeme, iade, iptal, tatil günleri, saat dilimi, toplu işlem.
4. **Gelir modeli:** Fiyat, plan yapısı, ücretsiz katman, birim ekonomisi (`docs/product/unit-economics.md`), tahsilat riski, churn tetikleyicileri.
5. **Güven ve itibar:** Müşterinin "bu işi bu ürüne emanet ederim" demesi için gerekenler: şeffaflık, destek, veri dışa aktarma, kesinti iletişimi, referanslar.
6. **Operasyonel yük:** Ürün büyüdükçe elle yapılması gereken işler (onay, destek, mutabakat) ve bunların ölçeklenip ölçeklenmediği.
7. **Rekabet:** Rakiplerde olan ve müşterinin karşılaştıracağı özellikler; farklılaşma noktası korunuyor mu?
8. **Ölçüm:** Başarı kriterleri (PRD §4) ölçülebiliyor mu, iş metrikleri (aktivasyon, tutunma, gelir) izleniyor mu?
9. **Lansman ve pazara çıkış:** Kanal, satış döngüsü, sektöre özgü güven işaretleri (sertifika, entegrasyon, ortaklık).

## Puanlama notu

İş bulgularında "Etki" gelir, müşteri kaybı, itibar ve operasyonel maliyet üzerinden puanlanır. "Nasıl düzeltilir" bölümü ürün diliyle yazılır (hangi akış, hangi kural, hangi metin) ve gerekirse teknik etkisi bir cümleyle eklenir.
