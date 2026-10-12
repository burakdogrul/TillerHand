# Bu kitle kurulan projeler için güvenlik rehberi

security-guidance eklentisinin model incelemeleri bu dosyayı ek kontrol listesi olarak okur. Projeye özel kurallar `docs/security/checklist.md`'de; burada sadece her projede geçerli olanlar var.

- Supabase `service_role` anahtarı ve her türlü gizli anahtar sadece sunucuda kullanılır; istemci koduna, `NEXT_PUBLIC_` / `EXPO_PUBLIC_` değişkenine girmez.
- Supabase'de her tabloda RLS açıktır; yeni tablo RLS politikası olmadan eklenmez. Politika `auth.uid()` ile satır sahibini kontrol eder.
- Her API ucu ve server action önce oturumu, sonra kaynağın sahibini kontrol eder (IDOR). İstemciden gelen `user_id` / `org_id` değerine güvenilmez.
- Webhook'lar (ödeme, e-posta, üçüncü taraf) imza doğrulaması olmadan işlenmez; aynı olay iki kez gelirse iki kez işlenmez.
- Kişisel veri (ad, e-posta, telefon, TC kimlik no, konum, sağlık) INFO veya üstü seviyede loglanmaz, hata izlemeye (Sentry) gönderilmez. KVKK.
- Dosya yüklemede tür ve boyut sunucuda doğrulanır; yüklenen dosya herkese açık kovaya varsayılan olarak konmaz.
- LLM çağrılarında kullanıcı girdisi ve dış içerik (web sayfası, belge) talimat olarak değil veri olarak ayrılır; modelin çıktısı doğrulanmadan SQL, kabuk komutu veya HTML olarak çalıştırılmaz.
- Para, kredi, kota değiştiren işlemler sunucuda ve atomik yapılır; istemcinin gönderdiği fiyata güvenilmez.
