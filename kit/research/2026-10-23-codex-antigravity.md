# Codex ve Antigravity: kit taşınabilirliği

**Tarih:** 2026-10-23 · **Soru:** Claude Code için yazılmış kit, Codex ve Google Antigravity'de hangi seviyede çalışabilir?

## Kısa cevap

Kitin metin kısmı (kurallar, komutlar, skill'ler) iki araca da taşınabilir. Codex ve Antigravity ortak bir skill klasörü okuyor (`.agents/skills/`), ikisi de `AGENTS.md` okuyor. Korumalar da taşınabilir: iki araçta da araç çağrısını engelleyebilen `PreToolUse` hook'u var. Codex'in hook biçimi Claude Code'unkine çok yakın, Antigravity'ninki farklı (alan adları, araç adları). Taşınamayan ya da doğrulanamayan kısımlar: durum çubuğu ve seçenekli soru arayüzü (Codex).

## Uyumluluk tablosu

| Kit parçası | Claude Code | Codex | Antigravity |
|---|---|---|---|
| Ana kurallar | `CLAUDE.md` | `AGENTS.md` (her klasörde, kökten aşağı; `AGENTS.override.md` önce). `CLAUDE.md` yedek ad olarak kullanıcı ayarıyla okunabilir. [1][2] | `AGENTS.md`, `GEMINI.md`, `.agents/rules/*.md`; dosya başı 24.000 bayt, toplam 20.000 token bütçe [3] |
| Komutlar (`/start`, `/build`…) | `.claude/commands/*.md` | Skill olarak: `$skill` ya da `/skills` ile çağrılır. Kullanıcı tanımlı eğik çizgi komutu: doğrulanamadı [4] | Skill'ler `/<skill-adı>` olarak çağrılır (App, CLI; IDE doğrulanamadı). Ayrıca IDE workflow'ları [5] |
| Skill'ler | `.claude/skills/` | `.agents/skills/` (repo köküne kadar üst klasörler de taranır) [4] | `.agents/skills/` (eski `.agent/skills` da okunur) [5] |
| Koruma hook'ları (engelleme) | `PreToolUse` → `permissionDecision: deny` | `PreToolUse` → `permissionDecision: deny` (Claude ile aynı biçim). Kapsam: shell, `apply_patch` (`Edit`/`Write` olarak eşleşir), MCP. Proje hook'ları `.codex/hooks.json`, güven onayı gerekir. Web araması kapsanmaz [6] | `PreToolUse` → `decision: "deny"`. Dosya `.agents/hooks.json`. Girdi biçimi farklı (`toolCall.name/args`, camelCase), araç adları farklı (`run_command`, `write_to_file`) [7] |
| Oturum başı notu | `SessionStart` | `SessionStart` [6] | `SessionStart` [7] |
| Cevap sonu (pano yenileme) | `Stop` | `Stop` [6] | `Stop` [7] |
| Kullanıcı mesajı hook'u (caveman, hatırlatıcı) | `UserPromptSubmit` | `UserPromptSubmit` [6] | Yok; en yakını `PreInvocation` [7] |
| Alt ajanlar (kurul, konsey) | `.claude/agents/*.md` | `.codex/agents/*.toml` (yalnız C seviyesi kaynak) [8] | `.agents/agents/<ad>.md`, frontmatter: `name`, `description`, `tools`, `model` (`flash`/`pro`) [9] |
| Seçenekli soru arayüzü | `AskUserQuestion` | Doğrulanamadı | `ask_question` aracı hook listesinde geçiyor [7]; davranışı doğrulanamadı |
| Durum çubuğu | `statusLine` | Doğrulanamadı | Doğrulanamadı |
| İzin listesi | `settings.json` allow/ask/deny | `PermissionRequest` hook'u, sandbox [6] | Permissions, politikalar `allow`/`deny`/`ask_user` [10] |

## Sonuç: üç seviye

1. **Ortak çekirdek:** `AGENTS.md` (kuralların özü; `CLAUDE.md` onu `@AGENTS.md` ile içe alır) ve komutların `.agents/skills/` altında skill hali. Codex ve Antigravity'de komutlar ve kurallar çalışır, korumalar çalışmaz.
2. **Çekirdek + korumalar:** Hook betiklerine girdiyi üç biçimden okuyan ve çıktıyı araca göre yazan ince bir katman. Codex'te sır engeli, yıkıcı komut kalkanı ve yapı koruyucu çalışır. Antigravity'de araç adları eşlenir.
3. **Tam eşdeğerlik:** Kurul ajanları her aracın biçiminde, durum çubuğu, soru arayüzü. Doğrulanamayan parçalar yüzünden şu an mümkün değil.

## Açık sorular

- Codex'te kullanıcı tanımlı eğik çizgi komutu var mı (eski `~/.codex/prompts`)? Yoksa komutlar sadece `$skill` ile çağrılır.
- Codex'te seçenekli soru aracı var mı? Yoksa karar protokolü düz metin seçeneklerle çalışır.
- Antigravity IDE'de skill'ler eğik çizgiyle çağrılabiliyor mu?
- Sayfaların hiçbirinde sürüm veya tarih yok. Uygulamadan önce iki aracın güncel sürümünde denenmeli.

## Kaynaklar

1. [Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) · OpenAI · tarih yok · A
2. [Advanced Configuration](https://learn.chatgpt.com/docs/config-file/config-advanced) · OpenAI · tarih yok · A
3. [Rules](https://antigravity.google/docs/rules/) · Google · tarih yok · A
4. [Build skills](https://learn.chatgpt.com/docs/build-skills) · OpenAI · tarih yok · A
5. [Agent skills](https://antigravity.google/docs/skills/) · Google · tarih yok · A
6. [Hooks](https://learn.chatgpt.com/docs/hooks) · OpenAI · tarih yok · A
7. [Lifecycle hooks](https://antigravity.google/docs/hooks/) · Google · tarih yok · A
8. [The Codex CLI Customisation Stack](https://codex.danielvaughan.com/2026/04/12/codex-cli-customisation-stack-unified-system/) · 2026-04 · C
9. [Custom subagents](https://antigravity.google/docs/subagents/) · Google · tarih yok · A
10. [Antigravity docs: permissions](https://antigravity.google/docs/permissions/) · Google · tarih yok · A (sayfa okunmadı, başlıktan)
