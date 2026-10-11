# Metrikler

> His değil veri. Araştırmalar, AI ile çalışan geliştiricilerin kendilerini daha hızlı sanırken daha yavaş
> çalışabildiğini gösteriyor (METR, 2025). Burada projenin gerçek gidişatı aylık olarak kayıt altında.
> `/maintain monthly` ve `/retro` birer satır ekler; `/dashboard` panosu eğilimi gösterir.

## Tanımlar

- **Tamamlanan görev:** Dönemde işaretlenen yol haritası görevi sayısı.
- **Ort. görev süresi (dk):** `docs/workflow/cost-log.md` → "Süre (dk)" ortalaması.
- **Ort. limit maliyeti (%):** Aynı günlükteki 5 saatlik kullanım farkı ortalaması.
- **Düzeltme oranı (%):** Dönemdeki `fix` commit'leri ÷ (`feat` + `fix`). Yüksekse yeni özellikler sık bozuluyor.
- **Geri alma:** Dönemdeki `revert` commit sayısı.
- **Kopya kod (%):** `npx jscpd` raporundaki tekrar oranı.
- **Açık kritik:** Kapanmamış kurul RET bulgusu sayısı.
- **Kabul testi (%):** MVP kabul kriterlerinden testi geçenlerin oranı.

## Kayıtlar

| Dönem | Tamamlanan görev | Ort. görev süresi (dk) | Ort. limit maliyeti (%) | Düzeltme oranı (%) | Geri alma | Kopya kod (%) | Açık kritik | Kabul testi (%) | Not |
|---|---|---|---|---|---|---|---|---|---|
