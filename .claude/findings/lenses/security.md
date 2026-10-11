# Lens: Güvenlik

**Bakış açısı:** Bu ürüne saldırmak isteyen deneyimli bir saldırgan ve onu durdurmakla görevli uygulama güvenliği uzmanı ol. Soru: "Kimse fark etmeden ne çalınabilir, değiştirilebilir veya durdurulabilir?"

**Kimlik öneki:** `SEC-` · **Ajan:** `security-auditor` · **Skill:** `security-review`

## Kontrol listesi (OWASP Top 10 temelli)

1. **Erişim kontrolü:** Her uçta sunucu tarafı yetki; IDOR (başkasının kaydı); rol aşımı; RLS her tabloda açık mı?
2. **Kimlik doğrulama:** Oturum süresi, şifre sıfırlama akışı, hız sınırı, hesap numaralandırma (kayıtlı e-posta sızdırma).
3. **Enjeksiyon:** SQL (string birleştirme), komut, şablon, log enjeksiyonu; XSS (HTML olarak basılan kullanıcı içeriği, `dangerouslySetInnerHTML`).
4. **Sırlar:** Kodda veya geçmişte sır, istemci paketine giden gizli değişken (`NEXT_PUBLIC_`, `EXPO_PUBLIC_`), loglarda token.
5. **Güvenlik yapılandırması:** CORS `*`, güvenlik başlıkları (CSP, HSTS), prod'da açık debug ve `/docs`, varsayılan şifreler.
6. **Bağımlılıklar:** Bilinen açıklar, bakımı bırakılmış paketler, çok yeni veya şüpheli paketler.
7. **Veri koruma:** Hassas verinin şifrelenmesi, yedeklerin erişimi, dosya yükleme (tür, boyut, herkese açık depolama).
8. **Webhook ve entegrasyonlar:** İmza doğrulaması, tekrar saldırısına karşı idempotency.
9. **AI ajanı ve LLM güvenliği:** Prompt injection yolları, modelin tetiklediği işlemler, `.mcp.json` ve `.claude/` değişiklikleri, `@latest` MCP sürümleri.
10. **Saldırgan testleri:** `docs/quality/test-plan.md` §1b'deki testler veri döndüren her uç için var mı?

## Araçlar

| Ne | Komut |
|---|---|
| Statik analiz | `semgrep scan --config p/default --config p/owasp-top-ten` (veya `docker run --rm -v "$PWD:/src" semgrep/semgrep semgrep scan ...`) |
| Bağımlılık açıkları | `npm audit --omit=dev` · `uv run --with pip-audit pip-audit` |
| Sır taraması | `gitleaks detect --source .` (kuruluysa); yoksa `docs/security/checklist.md` §9'daki grep |
| Yapılandırma | `docs/security/checklist.md` maddeleri tek tek |

Sırların değerini rapora asla yazma; sadece dosya:satır ve türünü yaz.
