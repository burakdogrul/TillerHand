# Kit Değişiklik Günlüğü

Kit sürümü `kit/VERSION` dosyasında. Bir projeyi güncellemek: projede `/kit-update`.
"Elle uyarla" notu olan maddeler projeye ait dosyalardadır; güncelleme bunlara dokunmaz.

## [Yayınlanmamış]

## [3.16.0] - 2026-10-24

### Yeni
- **Hafif komut listesi:** Komut açıklamaları her oturumda skill listesine giriyordu (~1.600 token) ve 200K bağlamda liste taşıyordu. Hafif ve Standart profilde artık 18 seyrek komut (`/findings-*`, `/board`, `/retro`, `/rollback` gibi) listede sadece adıyla durur: `/` menüsünde görünür, adıyla çağrılır, açıklaması bağlama girmez. Her oturum ~1.100 token daha az. Açıklamasıyla kalan 10 komut: `/start`, `/adopt`, `/build`, `/fix-bug`, `/plan-task`, `/design`, `/tools`, `/review-changes`, `/wrap-up`, `/release`.
- **Tam profil:** `/tools komutlar tam` (`node .claude/hooks/tools.mjs --commands full`) bütün açıklamaları geri getirir; `komutlar hafif` geri alır. Ayar `.claude/settings.json` → `skillOverrides`'ta, ekibin hepsi için geçerli; kendi değerlerin korunur. Codex ve Antigravity'de etkisi yoktur.
- `/kit-update`, `skillOverrides` anahtarı olmayan projeye hafif listeyi ekler ve raporda yazar.
- **Elle uyarla:** Projen Tam profildeyse güncellemeden sonra `/tools komutlar tam` çalıştır; yoksa seyrek komutların açıklaması listeden çıkar. Pano bu durumda uyarır.

### Değişen
- Eski bayraklar ve eski durum anahtarları bir sürüm daha (3.17.0'a kadar) çalışır.

## [3.15.1] - 2026-10-24

### Değişen
- **Daha az bağlam:** `AGENTS.md`'deki "Codex ve Antigravity'de" bölümü yalnız bu araçlardan biri seçiliyse dolu kurulur. Sadece Claude Code kullanan projede her oturum ~450 token (AGENTS.md'nin ~%20'si) daha az yüklenir. Sonradan `--tool codex` veya `--tool antigravity` eklenince bölüm geri gelir. Bölümü değiştirdiysen kit ona dokunmaz.
- **Elle uyarla:** Kurulu projelerin `AGENTS.md`'si değişmez (proje dosyası). Aynı kazancı istersen, Codex/Antigravity kullanmıyorsan bu bölümü silebilirsin.

## [3.15.0] - 2026-10-24

Kitin kodu İngilizceye geçti. Kullanıcıya ve AI'ya giden mesajlar, belgeler ve komutlar Türkçe kalıyor; davranış değişmedi.

### Değişen
- **Kod İngilizce:** Hook'ların, `kit.mjs`'in, şablon betiklerinin ve testlerin adları ve yorumları İngilizce. `.claude/hooks/arac.mjs` artık `shared.mjs`.
- **Yeni bayraklar:**
  - `freeze-guard.mjs`: `--plan-save`, `--plan-add`, `--plan-end` (eskiden `--plan-kaydet`, `--plan-ekle`, `--plan-bitir`)
  - `gate.mjs`: `--approve` (eskiden `--onayla`)
  - `tools.mjs`: `--enable`, `--disable`, `--required`, `--measure` (eskiden `--ac`, `--kapat`, `--gerekli`, `--olc`)
  - `plugins-sync.mjs`: `--install` (eskiden `--kur`)
  - `checkpoint.mjs`: `--restore <hedef> --yes` (eskiden `--evet`)
  - `dashboard.mjs`: `--quiet` (eskiden `--sessiz`)

  Eski bayraklar 3.16.0'a kadar çalışır ve kullanılınca uyarı yazar. Onay isteyen eski bayraklar (`--plan-ekle`, `--onayla`, `--ac`) yine sorulur.
- **Durum dosyaları:** `.claude/state/` altındaki dosyaların anahtarları İngilizce. Eski anahtarlı dosyalar 3.16.0'a kadar okunur. Kapı komut onayı artık `~/.vibe-kit/gate-approval/` altında; eski `kapi-onayi/` klasöründeki onay da geçerli sayılır.
- **Güncelleme izin kurallarını ekler:** `/kit-update`, kitin `settings.json` izin satırlarından projede eksik olanları ekler; projenin kendi satırları kalır. Stop hook'undaki `dashboard.mjs --sessiz` satırı `--quiet` olur, pano ve bildirim iki kez çalışmaz.
- **RLS şablonu:** `tests/security/rls.mjs` içinde `TABLOLAR` yerine `TABLES`, `HERKESE_ACIK` yerine `PUBLIC_TABLES`; tablo kaydı `{ name, owner, sample, key }`. Kurulu projelerin kendi `rls.mjs` dosyası değişmez.

### Düzeltilen
- `kit.mjs init` kişisel `CLAUDE.local.md` dosyasını projeye kopyalamaz (yerel bir klasörden kurulumda taşınıyordu).

### Elle uyarla
- `.claude/hooks/arac.mjs` kitten kaldırıldı. Güncelleme raporunda "Kitten kaldırılmış" altında görünür; silebilirsin. Kendi betiğin bu dosyadan içe aktarıyorsa `shared.mjs` ve yeni adları kullan.
- Kendi `rls.mjs` dosyanı yeni şablona geçirmek istersen tablo kayıtlarındaki alanları yeniden adlandır (`ad` → `name`, `sahip` → `owner`, `ornek` → `sample`, `anahtar` → `key`).

## [3.14.4] - 2026-10-24

### Değişen
- **Onay kaydı glob ve bağla da korunur:** Kabuk hedefi onay klasörünü (`~/.vibe-kit/`) içeren bir klasöre çözülürse (`rm ~/.v*/…`) ya da bağ üzerinden gerçek yolu oraya çıkarsa sorulur.
- **Cihaz yolları:** `\\?\` ve `\\.\` yalnız sürücü harfinden önce düşer, `\\?\UNC\…` normal UNC sayılır; `\\?\GLOBALROOT\…` gibi diğer biçimler "doğrulanamadı" sayılır.

## [3.14.3] - 2026-10-24

Commit sonrası otomatik güvenlik incelemesinin üç bulgusu.

### Değişen
- **Kapı komut onayı kullanıcı klasöründe:** Onay artık `.git/` yerine `~/.vibe-kit/kapi-onayi/<proje yolu özeti>.json`'da durur. Ev klasörü işletim sisteminden okunur, `HOME`/`USERPROFILE` ile yönlendirilemez. `.git` içeren zip/arşiv veya `.claude/state/` ile gelen hazır onay artık okunmaz. Bu kayda dosya aracıyla veya kabukla yazmak sorulur.
- **`--onayla` sadece tam yazımla:** `node .claude/hooks/gate.mjs --onayla` dışındaki her yazım engellenir: ortam değişkeni öneki, node bayrağı, yönlendirme, zincir.
- **Çözülemeyen kabuk hedefi:** Hedef değişken, ters tırnak, süslü parantez veya ağ yolu yüzünden çözülemiyorsa ve komut kural/koruma dosyası adını anıyorsa (`$D/AGENTS.md`, `{AGENTS,X}.md`, `.claude`, `.git`), kilit veya plan olmasa da sorulur. Yerel UNC yolları (`\\?\C:\…`, `\\localhost\c$\…`) sürücü yoluna çevrilir.
- **Elle uyarla:** 3.14.1/3.14.2'de verilen komut onayı geçersiz olur; ilk kapı çalışmasında komutlar bir kez yeniden onaylanır. Eski `.git/kit-kapi-onayi.json` silinebilir.

## [3.14.2] - 2026-10-24

### Değişen
- **Kapı komut onayı tek başına çalışır:** `gate.mjs --onayla` başka komutlarla zincirlenirse (`&&`, `;`, `|`) veya `$(...)` içerirse engellenir. Onay penceresi AGENTS.md'deki komutları pencere açılırken okur; zincirdeki bir komut dosyayı sonradan değiştirip başka bir listeyi onaylatamaz.

## [3.14.1] - 2026-10-24

3.14.0 güvenlik denetiminden ertelenen ORTA/DÜŞÜK bulgular.

### Değişen
- **Boş kapı commit'i durdurur:** Hiçbir kontrol çalışmadıysa (Komutlar boş, Semgrep yok) kapı "BOŞ" der, çıkış kodu 1; commit kapısı açılmaz. Kullanıcı isterse `--approve "atlandı: kullanıcı isteği"`.
- **Kapı komut onayı (`gate.mjs --onayla`):** AGENTS.md → Komutlar'daki lint/tip/test komutları yeni veya değişmişse kapı onları çalıştırmaz, listeleyip kullanıcı onayı ister. Onay git ortak dizininde (`.git/kit-kapi-onayi.json`) durur: klonlanan veya PR'la gelen depo hazır onay taşıyamaz. `GIT_DIR`/`GIT_COMMON_DIR` ortam değişkeniyle başka yere yönlendirilemez. `--onayla` her yazımda sorulur (Claude: izin listesi + commit kapısı hook'u; Codex/Antigravity: kalkan); onay penceresi onaylanacak komutları gösterir. `.git/` altına ve `.git` işaretçi dosyasına (worktree) dosya aracıyla veya kabukla yazmak da sorulur.
- **Kabuk komutları kilit ve kapsam kalkanına takılır:** Kilit veya onaylı plan açıkken `sed -i`, `mv`, `cp`, `rm`, `ln`, `dd of=`, `curl -o`, `>`/`>>`/`>|`, `git checkout/restore`, `Set-Content`, `prettier --write`, `eslint --fix` gibi komutlar proje içindeki mevcut, liste/kilit dışı dosyayı hedefliyorsa sorulur. Yazan komut, komutun adına bakılarak bulunur (yoldaki "copy" sayılmaz). Zincirdeki `cd`/`pushd`/`popd`/`Set-Location`, alt kabuk, `bash -c`/`sh -c`/`cmd /c` içi, kelime ortası tırnak, `~` ve Git Bash yolları (`/c/...`) izlenir. `find -delete/-exec`, `tar -x`, `unzip`, `rsync` ve birleşik bayraklar (`curl -sSLo`) da görülür. Glob hedefi klasörü sayılır. Şunlar da sorulur: kökü veya üst klasörü hedefleyen komut (`git checkout .`), değişkenli, ters tırnaklı ya da süslü parantezli hedef, doğrulanamayan `cd` ve hedefini göstermeyen komut (`git apply`, `git stash`, `git switch`, dal adıyla `git checkout`, `patch`, `xargs rm`). Yeni dosya, proje dışı dosya ve `docs/` serbest.
- **Kural ve koruma dosyaları kabukla da korunur (Claude Code dahil):** `.claude/` (kilit, plan, kapı ve onay durumları dahil), `.git/` ve `.git` işaretçi dosyası, `AGENTS.md`, `CLAUDE.md`, `.codex/`, iş akışları kabuk komutunun hedefi olunca kilit veya plan olmasa da sorulur; `.env` ve `secrets/` engellenir. Kilit ve plan Bash ile kapatılamaz, `.git/hooks/` altına sessizce hook yazılamaz.
- **Sembolik bağ ve junction çözülür:** Kilit, kapsam kalkanı ve Codex/Antigravity korumalı dosya kuralı gerçek yola bakar; kilitli klasördeki bir bağ üzerinden dışarı yazılamaz.
- **NotebookEdit:** Sır engeli, kilit/kapsam kalkanı ve test koruması Jupyter defter düzenlemesini de görür.
- **Semgrep:** `--metrics=off` ile çalışır. Windows'ta `.cmd`/`.bat` olarak bulunursa "kurulu değil" yerine "bulundu ama çalıştırılamadı; `SEMGREP=<semgrep.exe yolu>`" der (dosya adları kabuğa verilmez). Proje klasörünün içindeki semgrep önerilmez.
- `.claude/settings.json` (matcher `Write|Edit|MultiEdit|NotebookEdit`; ask: `gate.mjs --onayla`, `Edit(./.git/**)`), `.claude/board/rules.md`, `/build`, `/plan-task`, `/freeze`, README ve `kit/guide.html` güncellendi.
- **Elle uyarla:** `settings.json`'ı değiştirdiysen yeni satırları `.kit-new`'den al. Güncellemeden sonra ilk kapı çalışmasında komut onayı istenir; komutları kontrol edip onayla.

### Bilinen sınır
- Kabuk hedefleri sezgisel: `cp`'nin kaynak dosyası da hedef sayılır (fazladan soru); `node -e`, `python -c` ve betik içinden yapılan yazım görülmez.
- Komut onayı komutun metnini bağlar, çalıştırdığı içeriği bağlamaz: onaydan sonra `package.json` betiği veya test ayarı değişirse kapı yeni hali çalıştırır.
- `awk -i inplace` ve `curl -O` (uzak adla kaydetme) hedef olarak görülmez.

## [3.14.0] - 2026-10-24

### Eklenen
- **Deterministik kapı (`gate.mjs --run`):** AGENTS.md → Komutlar'daki `lint`, `tip kontrol` ve `test` komutları ile (kuruluysa) değişen kod dosyalarında Semgrep çalışır. Sonuç `.claude/state/gate.json`'a değişiklik imzasıyla yazılır. Yeşil kontrolün çıktısı yazılmaz, kırmızının son 30 satırı yazılır. Boş komut "tanımsız" sayılır; hiçbir kontrol çalışmadıysa uyarı verir. Commit, görev sonu ve faz sonu toplantısından önce çalışır, çıktısı kurul üyelerine girdi olur. Üyeler kırmızı kontrolde RET verir, lint/tip/test'in yakaladığını yeniden aramaz. `/build` doğrulama adımı da bunu kullanır.
- **Kapsam kalkanı (`freeze-guard.mjs --plan-kaydet / --plan-ekle / --plan-bitir`):** `/plan-task` onayından sonra planın dosya listesi kaydedilir. Plan açıkken listede olmayan mevcut dosyaya yazım (Claude Code, Codex, Antigravity) sorulur. Listeye dosya eklemek onaya bağlı; yeni dosya, `docs/` ve `CHANGELOG.md` serbest. Plan yoksa sessiz. `/build` sonunda ve `/wrap-up`'ta kapanır. Kilit ve plan, alt klasörden çağrılsa da proje köküne yazılır; tırnaklı `'--plan-ekle'` / `'--off'` da Codex ve Antigravity'de sorulur.

### Değişen
- **Commit kapısı:** Kurul onayına ek olarak aynı değişiklikler için yeşil kapı ister. Kapı kırmızı, eski veya hiç çalışmamışsa commit durur. Kullanıcı ara commit için açıkça isterse `--approve "atlandı: kullanıcı isteği"`. İzlenmeyen yeni dosyalar da imzaya girer (`git add -A && git commit` ile yalnız yeni dosya içeren commit artık denetimsiz geçmez). `git --no-pager commit`, `git -C x commit` gibi yazımlar yakalanır. Commit tek başına ya da yalnızca `cd` / `git add` ile zincirlenebilir: `sed … && git commit`, `$(...)` içeren komut ve `git commit && git push` durdurulur (push ayrı komut). Heredoc ve `$(cat <<'EOF' … EOF)` mesajı serbest. `--approve "atlandı…"` her yazımda kullanıcıya sorulur. Değişen dosya listesi `git -z` ile okunur (Türkçe yollar doğru); `.claude/state/` imzaya girmez.
- `.claude/board/rules.md` §4, kurul üye şablonları, `/plan-task`, `/build`, `/wrap-up`, `.claude/settings.json` izinleri (`gate.mjs --run`, `--plan-kaydet`, `--plan-bitir` sorusuz; `--plan-ekle` sorulur), README ve `kit/guide.html` güncellendi.
- **Elle uyarla:** Kurulu projede `.claude/agents/board-*.md` dosyaları projeye aittir: her birinin "Çıktı" bölümüne kapı satırını `.claude/board/board-<rol>.md`'den kopyala. `AGENTS.md` → Komutlar'da `lint`, `tip kontrol`, `test` satırları dolu olmalı. `settings.json`'ı değiştirdiysen yeni izin satırlarını `.kit-new`'den al.

### Bilinen sınır
- Kapı sadece Claude Code'un commit kapısında zorunlu; Codex ve Antigravity'de komutla çalıştırılır.
- Kapsam kalkanı AI'nın planı kapatıp yeniden kaydetmesini engellemez; bu AGENTS.md'deki "hook atlatma yasak" kuralına dayanır.
- Kapı, komutlar boşsa ve Semgrep kurulu değilse uyarıyla yeşil döner; commit'i durdurmaz.
- AGENTS.md → Komutlar onaysız çalışır: güvenilmeyen depodan (klon, PR) gelen komutu çalıştırmadan önce AGENTS.md'yi oku.
- Kapsam kalkanı sadece dosya araçlarında: kabukla (`sed -i`, `mv`, `cp`) plan dışı dosyaya yazmak sorulmaz (test dosyası hariç); sembolik bağlar çözülmez; `docs/` altındaki kod (Docusaurus vb.) serbest sayılır.
- Kapı çalışırken dosya değiştiren komut (`lint --fix`, anlık görüntü güncellemesi) imzayı değiştirir; kapı tekrar çalıştırılmalı.

## [3.13.1] - 2026-10-24

### Değişen
- **Test koruması kabukta da çalışır:** Test dosyasını kabuk komutuyla değiştiren, taşıyan veya silen komut (`sed -i`, `perl -i`, `rm`, `mv`, `cp`, `tee`, `>`/`>>`, `git checkout/restore`, PowerShell `Set-Content` vb.) kalkanda sorulur. Test ayar dosyaları da kapsanır; `sed -e … -i` ve `--in-place` yazımları da. Komut zincirinin her parçasına ayrı bakılır; testi çalıştırmak serbest.
- **Test ayar dosyaları:** `vitest`/`vite`/`jest`/`playwright`/`cypress` config (`.json` dahil), `.mocharc.*`, `conftest.py`, `noxfile.py`, `pytest.ini`, `pyproject.toml`, `package.json` gibi dosyalarda kapsamı daraltabilecek bir satır (`include`/`exclude`, `testMatch`, `testIgnore`, `passWithNoTests`, `bail`, `retries`, `forbidOnly`, `setupFiles`, kapsam eşikleri `lines`/`branches`/`fail_under`, `addopts`, `collect_ignore`, `"test…"`/`"ci…"` script'i) eklenir veya çıkarsa sorulur. Alias, eklenti gibi değişiklikler sessiz geçer.
- **Test koruması sezgileri:** `;//` ile yoruma alma, Python'da boşluksuz `#assert`, `skipIf`/`runIf` ve matcher'sız `expect(x)` yakalanır. `model.fit(` odaklanmış test, supertest `.expect(200)` matcher'sız expect sayılmaz; satır kıran `expect(x)
  .toBe()` zinciri sorun sayılmaz. Test yolu desenlerine `*.e2e-spec.ts`, `*_test.go` ve `spec/` eklendi.
- **Codex taşıma:** Test klasöründe kalsa da koşucunun tanımadığı bir ada (`a.test.ts` → `tests/a.ts`) taşıma ve herhangi bir dosyayı var olan bir testin üstüne taşıma sorulur.
- **RLS testi (web ve mobil şablon):** Başka kullanıcının güncelleme denemesi satırdan farklı değer yazar (sahibi kendisine çevirir); güncelleme ve silme denemesinden sonra satır admin ile yeniden okunur ve ilk haliyle karşılaştırılır (select politikası yokken dönen satır sayısı 0 olsa da değişiklik yakalanır). CI'da `DB_URL` yoksa tablo listesi atlanmaz, test kırmızı olur. View ve `SECURITY DEFINER` fonksiyonların kapsam dışı olduğu dosyada yazıyor.
- **CI şablonları (üçü):** `permissions: contents: read`; gitleaks işine ayrıca `pull-requests: read` (özel depoda PR commit listesi için); gitleaks PR yorumu kapalı (`GITLEAKS_ENABLE_COMMENTS: "false"`, sızıntı yine işi kırmızı yapar). RLS işinde `supabase status -o env` çıktısı `eval` edilmez; yalnız gereken anahtarlar okunup aktarılır.
- **Elle uyarla:** Değiştirdiğin `ci.yml` için `/kit-update` `.kit-new` bırakır: üstteki `permissions` bloğunu, gitleaks adımına `GITLEAKS_ENABLE_COMMENTS` satırını ve `rls` işinin yeni ortam aktarma satırlarını kendi dosyana al. `tests/security/rls.mjs`'i değiştirdiysen `TABLOLAR` listeni yeni dosyaya taşı.

### Bilinen sınır
- Kabuk koruması metne bakar: betik içinden (`node -e`, `python -c`, heredoc'la çalıştırılan program), `find … -delete`, `awk -i inplace`, `git apply`, `cd tests; rm *` ile test dosyasına yazmak yakalanmaz.
- Ayar dosyası kuralı sezgiseldir: listede olmayan bir alan veya çok satırlı `include: [` dizisinden satır silmek sorulmaz.
- Test koruması sezgisi `it['skip']`, `test.todo`, `it.fails`, `expect.any(Object)` yazımlarını yakalamaz.

## [3.13.0] - 2026-10-24

### Eklenen
- **Test koruması (`test-guard.mjs`, Claude Code, Codex, Antigravity):** Test dosyasında beklenti (`expect`/`assert`) silinir veya yoruma alınırsa, `.skip`/`.only`/`xit`/`@pytest.mark.skip` eklenirse, beklenti gevşetilirse (`toBeTruthy`, `toBeDefined`, `expect.anything`, `assert True`) ya da test dosyası silinirse kullanıcıya sorulur. Write ile (Codex'te `Add File` ile) var olan dosyanın tamamını ezmek diskteki halle karşılaştırılır; Codex `Move to` ile testi test olmayan bir yola taşımak da sorulur. Codex'te onay penceresi olmadığı için engellenir ve AI'ya "kullanıcıya sor" denir.
- **Düzenleme turu sayacı (`edit-rounds.mjs`):** Aynı kod dosyası bir oturumda 5., 10., ... kez düzenlenince AI'ya Semgrep ve `security-auditor` hatırlatılır; iş engellenmez. Claude ve Codex'te PostToolUse notu, Antigravity'de PreInvocation `injectSteps` ile (sadece notu üreten oturuma). Dosya adı özel karakter içeriyorsa nota ve Semgrep komutuna yazılmaz; yol tırnaklı ve `--` sonrasında. Bozuk durum dosyası çökertmez.
- **Karmaşıklık bütçesi (`budget.mjs`, CI `karmasiklik` işi, üç şablon):** PR'da değişen kod dosyalarında fonksiyon karmaşıklığı 15, fonksiyon 80 satır (lizard 1.24.1, `pipx run`), dosya 400 satır aşılırsa CI kırmızı. Test, migration, üretilmiş ve kit dosyaları hariç. Kite alınan eski kod dokunulana kadar engellemez. Türkçe ve boşluklu yollar ölçülür (`git -z`); `build`/`out`/`vendor` sadece kökteyse hariç; `--base` ve dosya adları bayrak sayılmaz. `/start` her fazın sonuna "Refactor turu" görevi koyar.
- **RLS saldırgan testi (web ve mobil şablon, `tests/security/rls.mjs`, CI `rls` işi):** CI içinde boş bir yerel Supabase açılır; anonim ve ikinci kullanıcı, birinci kullanıcının satırını okumayı, güncellemeyi, silmeyi ve onun adına yazmayı dener. RLS'i kapalı veya teste kayıtsız public tablo varsa kırmızı. Sır gerekmez; yerel olmayan URL'ye karşı çalışmayı reddeder. Dosya adı `.test.mjs` değil: Vitest/Jest ortamsız toplamasın. `/release`'de engelleyici.
- Pano: prod ref'i `.mcp.json`'da geçerse kritik, Supabase varken RLS testi yoksa uyarı.

### Değişen
- **Dev/prod ayrımı:** Şablonlardaki salt-okunur Supabase MCP artık `DEV_REF`'e bağlanır (önce prod olabiliyordu). `.env.example` "yerel = dev, prod sadece barındırma panelinde" der. `docs/operations/accounts.md`'ye "Ortamlar (dev / prod)" tablosu. `/release` prod ref'inin repoda ve AI ayarlarında geçmediğini kontrol eder, `.env.local`'in dev'e bağlı olduğunu kullanıcıya sorar.
- Kalkan: prod ortam değişkenlerini makineye çekmek (`vercel env pull` / `vercel pull`, prod hedefli) engellenir; ortam düz `development`/`preview` değilse (değişken, `$(...)`, özel ortam) sorulur. Vercel kuralları kısa adı `vc`'yi de kapsar.
- `arac.mjs` → `cozumle` düzenlenen parçanın önceki ve sonraki halini (`once`/`sonra`), silmeyi ve oturum kimliğini de verir.
- `AGENTS.md`, `docs/quality/test-plan.md`, `docs/security/checklist.md`, şablon `stack.md`'leri, `docs/workflow/mcp-catalog.md`, README, `kit/guide.html` ve pano güncellendi.
- **Elle uyarla:** Kurulu projede `.mcp.json` Supabase satırı prod ref'ine bağlıysa dev ref'i ile değiştir. Değiştirdiğin `ci.yml` için `/kit-update` `.kit-new` bırakır: `karmasiklik` ve `rls` işlerini kendi dosyana al. `docs/operations/accounts.md`'ye Ortamlar tablosunu, `docs/product/roadmap.md`'ye faz sonu refactor görevlerini ekle. Supabase'li projede `tests/security/rls.mjs` → `TABLOLAR`'a mevcut tabloları yaz.

### Bilinen sınır
- Test koruması ve kalkan metne bakar: kabuk komutuyla (`sed`, heredoc) test dosyası değiştirmek test korumasına takılmaz (3.13.1'de kalkana eklendi). Kalkan, belge yazan bir heredoc içinde geçen örnek komutu da yakalayabilir.
- Antigravity'de PostToolUse çıktı taşımaz; düzenleme turu notu bir sonraki model çağrısında gelir.
- RLS testi kit içinde Docker'sız doğrulandı (yerel olmayan URL reddi, ortam yok hatası); gerçek `supabase start` ile uçtan uca çalıştırma ilk kullanan projede CI'da görülecek.

## [3.12.0] - 2026-10-23

### Eklenen
- **rea (tersine mühendislik CLI'ı, sabit sürüm `rea-agents@6.2.0`):** `/research` bir rakip özelliğin nasıl çalıştığını kanıtıyla inceleyebilir; `/adopt` repodaki kaynağı olmayan parçaları (derlenmiş paket, küçültülmüş JS, ASAR) listeler. Her ikisi önce yetki ve lisans uyarısıyla sorar; rakibin kodu, metni ve markası alınmaz. `setup` çalıştırılmaz (ajan ayarlarını değiştirir). Katalog: `docs/workflow/mcp-catalog.md`.
- **Understand-Anything (insan için kod haritası, `yayin` paketi):** `/adopt` görsel harita, `/handoff` devralan için tanıtım rehberi (`/understand-onboard`), `/release first` bakım haritası önerir. İlk çalıştırma bütün kodu okur: maliyet söylenir ve sorulur. Türkçe çıktı yok (`--language en`), `--auto-update` kullanılmaz. Pano, graf 30 günden eskiyse ipucu verir.
- **İlham markası (`/design` 1b):** awesome-design-md'den (84 marka, MIT) sadece seçilen markanın DESIGN.md'si sabit commit'ten `.previews/ref/`'e indirilir, Impeccable ile ilkeleri damıtılır. Marka taklidi yok.
- **three.js (`/start` 3c):** 3D seçilirse `CloudAI-X/threejs-skills`'ten (MIT) `threejs-fundamentals`, `threejs-performance` ve React'te `threejs-react-three-fiber` sabit commit'ten kopyalanır; gerisi Context7.
- **`ui-motion` → 3D bölümü:** tembel yükleme, WebGL yoksa statik yedek, hareket azaltma, mobil GPU (piksel oranı ≤2, isteğe bağlı render), `dispose()`, fps ölçüsü. GSAP satırı lisans notuyla.
- **GSAP (`/design` cesur yön):** `gsap-skills:` skill'leri. Lisans doğrulandı: ücretsiz, ticari kullanım dahil; tek yasak Webflow'a rakip kodsuz animasyon aracı (gsap.com/standard-license, arşiv kopyası 2026).
- `/findings-perf` ve `/findings-ux` lens'lerine animasyon ve 3D kontrolleri (tembel yükleme, `dispose`, ScrollTrigger temizliği, statik yedek, scroll-jacking erişilebilirliği).

### Değişen
- Yapı haritalarına `.ua/**` eklendi (Understand-Anything grafı). **Elle uyarla:** kurulu projede `.claude/structure.json` → `allow`'a `".ua/**"` ekle.
- `.gitignore`: `.ua/intermediate/`, `.ua/diff-overlay.json`. **Elle uyarla:** kurulu projenin `.gitignore`'una ekle.
- README, `kit/guide.html` ve pano güncellendi.

## [3.11.4] - 2026-10-23

### Güvenlik
- **Şüpheliyse sor.** Komutta gizleme işareti (satır sonu `\`, `$'..'`, `$(...)`, `` `...` ``, `${...}`, `$@`/`$*`) varken, gevşek normalleştirmeden sonra korunan bir işlem çıkarsa (Vercel prod/promote/rollback, `DROP`/`TRUNCATE`, `reset --hard`, `push --force`, `rm -rf`, `db reset`) kalkan sorar. Kabuğu taklit etmeye çalışmaz; bu atlatma sınıfını tek kuralla kapatır. Commit sonrası güvenlik incelemesinin bulgusu.

### Bilinen sınır
- Kalkan metne bakar; `$X` değişkeni veya bir dosyadan okunan komut çözülemez. Claude Code'da asıl sınır izin katmanıdır (`permissions.ask`/`deny`) ve kullanıcının onayıdır. Gizleme işaretli komut içinde korunan kelime geçerse (örn. `$(...)` ile yazılan bir commit mesajında "rollback") nadiren gereksiz soru çıkar.

## [3.11.3] - 2026-10-23

### Güvenlik
- Yıkıcı komut kalkanı ve izin karşılığı (Codex, Antigravity) komutu kabuğun göreceği hale getirip de değerlendirir: `$'..'` açılır, tırnaklar, `\` ve PowerShell `` ` `` kaçışları düşer. Ham ve açılmış halden sıkı olan karar kazanır. Böylece `--pro""d`, `pr\omote`, `$'--prod'`, `DR""OP`, `--ha"rd"` gibi yazımlar tek tek regex'e gerek kalmadan yakalanır. Commit sonrası güvenlik incelemesinin bulgusu (kök neden düzeltmesi; 3.11.2'nin tırnak eklerinin yerini alır).

## [3.11.2] - 2026-10-23

### Güvenlik
- Kalkan: tırnaklı veya çok boşluklu yazım da yakalanır (`--target "production"`, `--target='prod'`, `--target    production`, `"promote"`). Commit sonrası güvenlik incelemesinin bulgusu.

## [3.11.1] - 2026-10-23

### Güvenlik
Commit sonrası güvenlik incelemesinin bulguları.
- Kalkan: `vercel` alt komutu bayraklardan sonra gelse de (`vercel --scope ekip promote …`) `promote` ve `rollback` sorulur. `--target production` / `--target=production` de prod deploy sayılır.
- Web şablonunda Playwright CLI izni sadece `open`, `snapshot`, `console`, `requests`, `screenshot` alt komutlarına daraltıldı. Sayfada kod çalıştıran `eval` ve `run-code` sorulur.

### Elle uyarla
- 3.11.0'ı uyguladıysan web projesinde `.claude/settings.json` → `permissions.allow`'daki `Bash(npx -y @playwright/cli@0.1.22:*)` satırını kitin web şablonundaki beş dar satırla değiştir.

## [3.11.0] - 2026-10-23

### Eklendi
- **Playwright CLI** (`npx -y @playwright/cli@0.1.22`): ajanın sayfaya bakması, konsol, ağ ve ekran görüntüsü. Sayfa verisini bağlama zorlamadığı için MCP'den az token harcar. Kabul testleri yine `npx playwright test`.
- **Vercel CLI akışı** (`/release`): önizleme deploy'u → önizleme URL'sinde kanıt → onayla `promote` veya `deploy --prod`. Git entegrasyonu açıksa CLI ile ayrıca deploy edilmez.
- **Supabase dev MCP** (katalog, `supabase-dev`): yazma yetkili, sadece geliştirme projesi veya branch'i. Prod MCP salt-okunur kalır; şema değişikliği her zaman migration dosyasıyla (mobil şablona da eklendi).
- `/design`: tasarım Figma'daysa Figma MCP'yi bu makineye eklemeyi önerir.
- Katalogda "Gerektiğinde eklenenler" bölümü: Playwright MCP, Chrome DevTools MCP, Figma, Supabase dev; `--scope local`, sürüm sabit.

### Değişti
- Web şablonunun `.mcp.json`'ından Playwright ve Chrome DevTools MCP çıkarıldı; `/findings-perf` ve `/findings-ux` gerekirse sorup ekler.
- Kalkan: `vercel promote` ve `vercel rollback` de sorulur (prod ortamını değiştirir).

### Elle uyarla
- Web projesinde `.mcp.json`: `playwright` ve `chrome-devtools` girdilerini kaldırmak isteğe bağlı (bağlam tasarrufu; gerekince katalogdan eklenir).
- Web projesinde `.claude/settings.json` → `permissions.allow`'a `Bash(npx -y @playwright/cli@0.1.22 open:*)` ve `snapshot`, `console`, `requests`, `screenshot` için aynı biçimde birer satır ekle (3.11.1).
- `docs/architecture/stack.md`: "Doğrulama" bölümünde Playwright MCP yerine Playwright CLI; "MCP" satırı ve şema kuralı kitin şablonundaki gibi (web ve mobil).

## [3.10.1] - 2026-10-23

### Güvenlik
- `tools.mjs` izni daraltıldı (commit sonrası güvenlik incelemesi): durum, `--gerekli`, `--olc` ve `--kapat` izinli; `--ac` her zaman sorulur. Paket açmak eklenti hook'larını kullanıcının yetkisiyle çalıştırır.

### Elle uyarla
- 3.10.0'ı uyguladıysan `.claude/settings.json` → `permissions.allow`'daki `Bash(node .claude/hooks/tools.mjs:*)` satırını kitin dört dar satırıyla değiştir, `permissions.ask`'e `Bash(node .claude/hooks/tools.mjs --ac:*)` ekle.

## [3.10.0] - 2026-10-23

### Eklendi
- **Bağlam paketleri ve `/tools`.** Eklentiler çekirdek (hep açık) ve paket olarak ayrıldı. `tasarim` (taste-skill, ui-ux-pro-max, gsap-skills), `guvenlik` (Trail of Bits 7'li, claude-security), `yayin` (understand-anything, session-report) ve `video` (remotion) kapalı gelir. `/design`, `/findings-security`, `/findings-all`, `/release first` ilk adımda `tools.mjs --gerekli <paket>` ile bakar, kapalıysa maliyetiyle açmayı sorar. Açma sadece bu makineyi etkiler (`.claude/settings.local.json`). Neden: skill listesi bağlamın %1'iyle sınırlı; taşınca açıklamalar düşer ve skill kaçırılır.
- `node .claude/hooks/tools.mjs --olc`: kurulu eklentilerin skill ve ajan açıklama yükünü ölçer. `/maintain monthly` bağlam bütçesini kontrol eder.
- Yeni pazarlar: `gsap-skills` (GreenSock, resmi) ve `understand-anything` (kapalı; kullanımı sonraki sürümde komutlara bağlanacak).

### Değişti
- `motion-video` Remotion'ı `tools.mjs --ac video` ile açar.
- `/start` Hafif profil artık sadece hookify ve claude-md-management'ı kapatır; paket eklentileri her profilde zaten kapalı.
- Pano, açık kalan paketleri "Dikkat" listesinde gösterir.

### Elle uyarla
- `.claude/settings.json` projeye aittir ve güncellemede değişmez. Paketleri kullanmak için `enabledPlugins` içinde şunları `false` yap: `taste-skill@taste-skill`, `ui-ux-pro-max@ui-ux-pro-max-skill`, Trail of Bits'in 7 eklentisi, `claude-security@claude-plugins-official`, `session-report@claude-plugins-official`. `extraKnownMarketplaces`'e `gsap-skills` ve `understand-anything` pazarlarını ekle; izinler için yukarıdaki güvenlik maddesine bak. Örnek: kitin `.claude/settings.json` dosyası.
- `CLAUDE.md`: "Doğru skill'i kullan" maddesinin sonuna paket cümlesi (kitin `CLAUDE.md`'si).

## [3.9.3] - 2026-10-23

### Düzeltildi
- Antigravity okuma koruması iç içe argümanlara da bakar: dizi ya da nesne içindeki `.env` ve `secrets/` yolları da engellenir.

## [3.9.2] - 2026-10-23

### Düzeltildi
- Antigravity okuma koruması, bütün araçlarda (`matcher: "*"`) ve argümanlardaki her metinde `.env` ve `secrets/` yolunu arar. Böylece bilinmeyen bir okuma aracı da kapsanır. `secrets` klasörünün kendisi de engellenir.

### Bilinen sınır
- Proje kökünde içerik araması (`grep_search`, kabukta `grep -r`), `.env` içeriğine ulaşabilir. Hook arama sonucunu süzemez. `.env` dosyası olan projede kök aramayı engellemek aramayı kullanılmaz hale getirirdi.

### Elle uyarla
- Projede `.agents/hooks.json`'ı değiştirdiysen, `kit-okuma-korumasi` → `matcher` değerini `"*"` yap.

## [3.9.1] - 2026-10-23

Yayın sonrası otomatik güvenlik incelemesinin bulguları (sadece Codex ve Antigravity'yi etkiler).

### Düzeltildi
- Kabukla koruma dosyası değiştirme kuralı, yolu eğik çizgisiz yazılan komutları da yakalar (`rm -r .claude`). `git checkout` ve `git restore` ile geri döndürme de sorulur.
- Kalkanın iki listesi aynı komutta farklı karar verirse sıkı olan kazanır: `git push --force origin main` artık "sor" yerine engellenir.
- Antigravity'de `.env` ve `secrets/` okuma araçlarıyla (`view_file`, `grep_search`, `list_dir`, `find_by_name`) okunamaz. Claude Code'daki `Read(./.env)` engelinin karşılığı. `.agents/hooks.json`'a `kit-okuma-korumasi` eklendi.

### Bilinen sınır
- Codex'te hook betiği Unix'te `git rev-parse --show-toplevel` ile bulunur. Git yoksa veya klasör depo değilse hook çalışmaz ve koruma devreye girmez. `init` git deposu açtığı için normal kurulumda bu olmaz.

### Elle uyarla
- Projede `.agents/hooks.json`'ı değiştirdiysen, `/kit-update` yeni hali `.kit-new` olarak getirir; `kit-okuma-korumasi` bölümünü elle ekle.

## [3.9.0] - 2026-10-23

Kit artık OpenAI Codex ve Google Antigravity'de de çalışıyor: kurallar, komutlar ve korumalar. Kurul ajanları, soru arayüzü ve durum çubuğu Claude Code'a özel kalıyor. Dayanak: iki aracın resmi hook ve skill dokümanları.

### Eklendi
- **`AGENTS.md`:** Ortak kurallar (temel kurallar, Bitti tanımı, Asla, Git, Komutlar, proje adı) buraya taşındı. Üç araç da bu dosyayı okur. `CLAUDE.md` onu `@AGENTS.md` ile içe alır ve Claude Code'a özel kuralları tutar (skill tablosu, limit). Claude Code'un gördüğü kurallar değişmedi; sadece sıralama değişti ve iki araç için bir karşılık bölümü eklendi.
- **`kit.mjs --tool claude,codex,antigravity`** (`init`, `install`, `update`): Birden fazla araç seçilebilir. `init` bu seçeneği verilmezse terminalde sorar. Seçim `.kit.json` → `tool` alanına yazılır. Claude Code dosyaları her durumda kurulur.
  - Codex veya Antigravity seçildiyse `.claude/commands/*.md` ve `.claude/skills/` dosyalarından `.agents/skills/<ad>/SKILL.md` üretilir. Codex bunları `$start` ya da `/skills` ile, Antigravity `/start` ile çağırır. Kaynak tek kalır, kit reposunda kopya tutulmaz. Kopyalar her güncellemede yenilenir.
  - Hook ayarları: `.codex/hooks.json` (Codex) ve `.agents/hooks.json` (Antigravity). Şablonları `kit/tools/<araç>/` altında. Güncellemede diğer kit dosyalarıyla aynı kural geçerli: değiştirilmediyse yenilenir, değiştirildiyse `.kit-new` olarak gelir.
- **Hook girdi/çıktı katmanı (`.claude/hooks/arac.mjs`):** Sır engeli, yıkıcı komut kalkanı, paket kapısı, yapı koruyucu, düzenleme kilidi ve oturum başı hook'u üç aracın biçimini okur ve kararı o aracın biçiminde yazar.
  - Codex: Claude ile aynı alanlar. Dosya düzenleme `apply_patch` ile gelir; eklenen, güncellenen ve taşınan dosyalar yama metninden çıkarılır.
  - Antigravity: `toolCall.name/args` biçimi. Desteklenen araçlar: `run_command`, `write_to_file`, `replace_file_content`, `multi_replace_file_content`. Karar `decision`, oturum notu `injectSteps` ile yazılır.
  - Codex'te "sor" kararı (`ask`) yok; verilirse araç yine çalışıyor. Bu yüzden Codex'te "sor" engellemeye döner ve AI'ya kullanıcıya sorması söylenir (kullanıcı kararı).
  - Proje kökü Codex'te girdideki `cwd`'den, Antigravity'de `workspacePaths`'ten alınır.
- **Claude Code izin listesinin karşılığı (Codex, Antigravity):** Bu araçlarda `.claude/settings.json` izinleri yok. Güvenlik denetiminin RET kararı üzerine karşılıkları hook'a eklendi. Sadece bu iki araçta uygulanır, Claude Code'un davranışı değişmez.
  - Engellenen komutlar: `rm -rf`, Windows'ta toplu silme, `git reset --hard`, `git push --force` ve `.env` ile `secrets/` erişimi.
  - `freeze-guard --off` sorulur.
  - `.env` dosyalarına yazma engellenir. Şu dosyalara yazma sorulur: `CLAUDE.md`, `AGENTS.md`, `.claude/**` (kilit dosyası dahil), `.codex/**`, `.agents/hooks.json`, `.mcp.json`, `.github/workflows/**`. Codex'te "sor" engellemeye döner.
  - Sır engeli kabuk komutunu da tarar (heredoc, `echo > dosya`).
  - Fail-closed: Yama başlığı anlaşılmazsa yamanın tamamı taranır ve kilit engeller. Antigravity'de içerik alanının adı ne olursa olsun bütün argümanlar taranır; hedef yol yoksa kilit engeller.
  - Proje kökü, hook betiğinin kendi yerinden (`<proje>/.claude/hooks/`) bulunur; cwd'ye ya da ajanın açabileceği işaretlere (`.git`) bağlı değildir. Böylece Codex alt klasörde açılsa da kilit ve yapı koruması çalışır. Göreli yama yolları oturumun klasörüne göre çözülür.
  - Kural veya koruma dosyasını anan ve onu yazan ya da silen kabuk komutu sorulur (`rm`, `sed -i`, `>`, `cp`, `Remove-Item`…). Kit betiklerini çalıştırmak (`node .claude/hooks/...`) serbesttir.
  - Codex tanıma: `CLAUDE_PROJECT_DIR` yoksa girdi Codex sayılır (ask, engellemeye döner).
- **`/start` ve `/adopt` Adım 0c:** Projede kullanılacak araçlar çoklu seçimle sorulur. `init` sırasında seçildiyse sadece bildirilir.
- Pano başlığında Claude Code dışındaki araçlar görünür. Yapı haritasına `AGENTS.md`, `.agents/**` ve `.codex/**` eklendi.
- Testler (`kit/tests/arac.test.mjs`): Sır yazma denemesi üç aracın girdi biçiminde de engellenir. Denetimde bulunan atlatma yolları saldırgan testi olarak eklendi: boşluklu yama başlığı, alan adı değişimi, alt klasör, koruma dosyası ve kilit silme, yasak komutlar, kabukla sır yazma, turn_id'siz Codex girdisi. Ayrıca kalkan, yapı koruyucu, düzenleme kilidi ve oturum başı her biçimde test edilir. `init --tool` ile doğru dosyaların üretildiği, güncellemede kopyaların yenilendiği ve kullanıcının değiştirdiği hook ayarının korunduğu da testli.

### Değişti
- **`init` dolu klasörde Codex ve Antigravity dosyalarını da ezmez.** Projenin kendi `.agents/skills/` dosyaları korunur; kitin hali `.kit-new` olarak yanına konur. Projede `AGENTS.md` varsa kitin `CLAUDE.md`'si, `/adopt` Adım 4'e kadar kitin kurallarını `@AGENTS.md.kit-new` satırıyla içe alır.
- `--tool` verilmeden ve etkileşimsiz çalışan `init` (örneğin AI'nın çalıştırdığı) `tool` alanını boş bırakır; aracı `/start` veya `/adopt` sorar.
- Yıkıcı komut kalkanı `git clean` komutunu bayraklar ayrı yazıldığında da yakalıyor (`-f -d`, `-d -f`, `--force -d`). Bu düzeltme Claude Code'u da etkiler.
- Sır engeli artık çıkış kodu 2 yerine `permissionDecision: deny` ile engelliyor. Claude Code'da sonuç aynı; Antigravity çıkış kodunu belgelemediği için bu biçime geçildi.
- `git push` kalkanı `-fu` ve `+dal` biçimlerini de yakalar; `.env` kuralı `.env.example` dışındaki tüm `.env*` dosyalarını kapsar (sadece Codex ve Antigravity).
- Proje adı `AGENTS.md`'den okunur (durum çubuğu, pano, bildirim). 3.9.0 öncesi projelerde ad `CLAUDE.md`'de kalır ve oradan okunmaya devam eder.
- "Komutlar", "Bitti tanımı" ve "Asla" listelerine yapılan atıflar `AGENTS.md`'yi gösteriyor (`/build`, `/release`, `/rollback`, `/retro`, `/wrap-up`, karar protokolü, kod inceleme ajanı).

### Bilinen sınırlar
- Kurul ve konsey ajanları, `AskUserQuestion`, durum çubuğu, limit okuma, pano yenileme (`Stop`), commit kapısı ve hatırlatıcı Codex ve Antigravity'de yok.
- Antigravity IDE'de skill'lerin eğik çizgiyle çağrıldığı belgelenmemiş (App ve CLI'da belgeli).
- Codex'te proje hook'ları, klasöre güvenilip `/hooks` ile onaylanınca çalışır.
- Kabuk komutları için hook sadece kazara veya tek adımda yapılan atlatmayı keser. Glob (`rm .cl*/…`), `cd` ile yol bölme ve değişkenle kurulan yollar yakalanmaz; asıl sınırı aracın kendi sandbox'ı çizer.
- Kabuk komutuyla dosya yazmak (`echo > dosya`, `sed -i`) yapı koruyucuya ve düzenleme kilidine takılmaz. Claude Code'da da aynı, orada kabuk komutları onaya gelir.
- Codex'te hook betiği Unix'te `git rev-parse --show-toplevel` ile, Windows'ta göreli yolla çağrılır. Bu yüzden Windows'ta Codex proje kökünde açılmalı.
- İki aracın hook biçimi resmi dokümana göre yazıldı ve testlerle doğrulandı. Gerçek araçta henüz denenmedi.

### Elle uyarla
- **`AGENTS.md` ve `CLAUDE.md`** (Codex veya Antigravity kullanacaksan gerekli, yoksa isteğe bağlı): Güncelleme `AGENTS.md`'yi yer tutucularla ekler; mevcut `CLAUDE.md`'ye dokunmaz. Proje adını, tek cümlelik tanımı, Komutlar bölümünü ve varsa `## Proje kuralları` bölümünü `AGENTS.md`'ye taşı. Sonra `CLAUDE.md`'yi kitin yeni `CLAUDE.md`'si ile değiştir (`@AGENTS.md` + Claude'a özel kurallar). Bu yapılmazsa Claude Code eskisi gibi çalışır, Codex ve Antigravity ise yer tutuculu kuralları görür.
- **Araç eklemek:** `/kit-update --tool claude,codex`.
- **`.claude/settings.json` → `permissions.ask`:** `Edit(./AGENTS.md)`, `Edit(./.codex/**)` ve `Edit(./.agents/hooks.json)` satırlarını ekle. Bu dosyalar da kural ve koruma taşıdığı için değişiklikleri onayla yapılmalı.
- **`.claude/structure.json` → `allow`:** `AGENTS.md`, `.agents/**` ve `.codex/**` satırlarını ekle.

## [3.8.0] - 2026-10-23

### Eklendi
- **`/handoff` (devir):** Proje başka bir kişiye veya hesaba geçerken (ekip arkadaşı, kurumsal hesap, kapanan hesap) aynı yerden devam etmek için.
  - Devreden kişi `/handoff` çalıştırır: `/wrap-up` adımları uygulanır, `docs/workflow/handoff.md`'ye devir notu yazılır. Notta nerede kalındığı, bekleyen kararlar, gereken hesaplar ve ortam değişkenlerinin sadece adları (değerleri asla) bulunur. Ardından commit ve push önerilir.
  - Devralan kişi `/handoff devral` çalıştırır: not özetlenir; eklentiler, bağımlılıklar ve testler kurulup çalıştırılır; sıradaki görev söylenir.
  - Bekleyen devir notu oturum başında ekranda (`Devir notu var: /handoff devral`) ve panonun "Dikkat" listesinde görünür (testli).
- **`/research` (literatür ve pazar araştırması):** Akademik makaleler (Semantic Scholar ve arXiv açık arayüzleri), GitHub'daki benzer projeler (`gh search repos`) ve ticari ürünler taranır.
  - Rapor `docs/research/` altına yazılır: kategori tabloları, fark haritası, fırsatlar. Panoda zaten bir yeri vardı.
  - Eklenecek özellikler çoklu seçimle sorulur; seçilenler PRD'ye ve yol haritasına girer.
  - Derinlik maliyetiyle sorulur: hızlı ~%10-15, derin ~%25-35. `/start` Adım 1b'de ve `/adopt` Adım 3b'de pahalı adım olarak isteğe bağlı sunulur.

### Değişti
- **Limit artık işi durdurmuyor, sadece uyarıyor.** Gerçek kullanımda %90'daki "güvenli dur" kuralı işi neredeyse tamamen kesiyordu ve kullanıcının devam için ikna etmesi gerekiyordu. Yeni kural:
  - %90'da hatırlatma, %95'te "çok azaldı" uyarısı (kaldığı yer sessizce kaydedilir), %99'da "iş yarım kalabilir" uyarısı.
  - Kullanıcı "dur" demedikçe iş devam eder. Sarı ve kırmızı seviyede seçenek sorusu da kalktı; maliyet tek satırla söylenir, seçenekler istenirse sunulur.
  - Etkilenen yerler: `docs/workflow/usage-limits.md`, `CLAUDE.md` kural 4, `/build`, `/plan-task`, `/start`, `/board`.

### Elle uyarla
- `CLAUDE.md` (projenin) kural 4: limit cümlesini kitin `CLAUDE.md`'sindeki yeni haliyle değiştir. Değiştirilmezse eski "%90'da güvenli dur" kuralı projede geçerli kalır.

## [3.7.0] - 2026-10-23

Kit ile proje artık ayrı klasörlerde durabiliyor ve var olan projeler kite alınabiliyor. İkisi de gerçek proje denemesinden gelen geri bildirim.

### Eklendi
- **`kit.mjs init` (kur ve ayrıl):** Kit hangi klasörde duruyorsa oradan çalışır ve projeyi hedef klasöre kurar (`node vibe-kit/kit/kit.mjs init`, varsayılan hedef bulunulan klasör). Kit klasörüne dokunulmaz, birden çok projede tekrar kullanılabilir.
  - Proje klasöründe git deposu yoksa açar. Kit proje klasörünün içindeyse `.gitignore`'a ekler.
  - Dolu klasörde projenin dosyalarının üzerine yazmaz: kitin hali yanına `.kit-new` olarak konur. `.gitignore` satır satır, `.claude/settings.json` derin birleşir; projenin değerleri korunur.
  - `.kit.json` → `type: null` "kuruldu, tip bekleniyor" demek. Durum çubuğu, pano ve oturum başı bunu `/start` veya `/adopt` önerisi olarak gösterir.
  - `install --type <tip> --project <yol>`: init ile kurulan projeye tip katmanını ekler. init'in koyduğu ve kullanıcının değiştirmediği yer tutucular ezilir, projenin kendi dosyaları ezilmez. Kit klasörü silinmez.
  - Testli: boş klasör, dolu klasör, ikinci init reddi, ardından `update`.
- **`/adopt` (var olan projeyi kite al):** 9 adımlı uyum sihirbazı.
  - Tarama derinliği maliyetiyle sorulur (hızlı / derin + seçilen bulgu raporları).
  - Stack, yapı, özellikler, testler ve git geçmişi taranır. `.kit-new` dosyaları tek tek karar olarak sorulur.
  - PRD, stack, mimari ve README koddan çıkarılır; amaç, kitle ve "neyi beğenmiyorsun" sorulur.
  - CLAUDE.md kitinkine göre yeniden yazılır. Eski dosyadaki projeye özel kurallar çoklu seçimle sorulup `## Proje kuralları` bölümüne taşınır; eskisi `docs/archive/`'e gider.
  - Mevcut testler çalıştırılıp değerlendirilir. Kritik akışların doğru davranışı kullanıcıya sorulur: kod yanlış davranışı kilitlemesin.
  - Uyum yol haritası: Faz 0'da güvenli zemin ve kritik akış testleri, Faz 1'de kitin klasör yapısına özellik özellik taşıma (ayrı dal, her görevde çalışan nokta), Faz 2'de bulgular, sonra yeni özellikler.

### Değişti
- `/start` Adım 1 iki kurulum yolunu tanır (template veya init); klasörde kod varsa `/adopt` önerir. Adım 3'te init yolunun komutu var.
- README ve rehber: Yeni kurulum yolu ana yol oldu, "Use this template" alternatif olarak kaldı.

### Elle uyarla
- `CLAUDE.md` (projenin): "Kurulum durumu" satırı `.kit.json` → `type: null` durumunu ve `/adopt`'u da içeriyor (kitin `CLAUDE.md`'sine bak). Kurulmuş projelerde etkisi yok.

## [3.6.0] - 2026-10-23

Dondurma bitti. Bu sürüm, kitin ilk gerçek projede (3.5.1) denenmesinden gelen geri bildirimlerden çıktı.

### Eklendi
- **Planlama derinliği** (`/start` Adım 0a): Profilden ayrı ikinci soru. Seçenekler: Hızlı (~%25-35), Standart (~%50-70), Ayrıntılı (~%80-100). Sebep: Hafif profilde bile 9 adım 5 saatlik limitin tamamını harcadı ve koda hiç başlanamadı.
- **Pahalı adımlarda maliyet kapısı:** Adım 4'teki konseyden, Adım 6 kurulundan ve Adım 7 tasarımından önce tahmini maliyet söylenir, sonra "Yap / Hafif yap / Sonraya bırak" diye sorulur. Bu adımlar kaldırılmadı. Sonraya bırakılanlar Faz 0'a görev olarak girer. Maliyet tablosu: `docs/workflow/usage-limits.md`.
- **Pano en başta** (`/start` Adım 0 madde 6b): Pano oluşturulur ve tarayıcıda açılması önerilir. Kararlar verildiği anda günlüğe yazılır, yani pano onları adım adım gösterir.
- **`/clear` sonrası sıradaki komut ekranda:** Oturum başı hook'u sıradaki komutu artık kullanıcıya da gösteriyor (`systemMessage`). Örnek: `Sıradaki: /build G-004 · ...`, `Devam: /start (adım 4/9)` (testli). `/wrap-up` son satırda tam komutu verir.
- **Başka bilgisayarda kurulabilirlik:** `/start` Adım 4, sürüm dosyasını (`.nvmrc` / `.python-version`) ve README'nin Gereksinimler/Kurulum bölümünü doldurur. `/build` yeni bağımlılıkta README'yi günceller. `/release` ve aylık `/maintain` temiz klasöre klonlayıp kurulum testi yapar.

### Düzeltildi
- **`/kit-update` çalışmıyordu:** Komut `kit.mjs guncelle` çağırıyordu, ama komutun adı `update`.

### Elle uyarla
- `README.md` (projenin): Gereksinimler bölümüne "Sistem bağımlılıkları" satırını ve kilit dosyası notunu ekle (şablon: `kit/project/README.md`).

## [3.5.1] - 2026-10-12

### Güvenlik
- **İzin listesi önek açığı** (commit güvenlik incelemesi buldu). İzin kuralları komutun başıyla eşleşiyor, betikler ise argümanları herhangi bir sırada okuyordu. Sonuç:
  - `checkpoint.mjs --list --restore X --evet` onaysız geri dönüş yapıyordu.
  - `freeze-guard.mjs --set x --off` düzenleme kilidini onaysız kaldırıyordu.
  - `freeze-guard.mjs --set .` kilidi bütün projeye genişletiyordu.
- Düzeltme:
  - İki betikte de ne yapılacağını artık sadece ilk argüman belirliyor.
  - Açık kilit onaysız sadece daraltılabiliyor.
  - İzin listesinde sadece `freeze-guard --set` ve `--status` var; `--off` onay istiyor.
  - Her iki açık için test eklendi.
- Bilinen: `commit-gate.mjs --approve` aynı türden bir öz-onay yolu olarak izin listesinde duruyor (3.4.0 notu). Hafif profilde commit denetimi kapalı.

## [3.5.0] - 2026-10-12

Dondurmadan önce son eklemeler. Kit bu sürümle dondurulur.

### Eklendi
- **`/rollback` (son çalışan hale dön):** `checkpoint.mjs` betiği eklendi (testli).
  - `/build` ve `/wrap-up`, testler yeşilken çalışan nokta olarak `calisan/...` etiketi koyar.
  - Geri dönüşte yarım iş önce saklanır (stash), dosyalar hedef hale getirilir ve yeni bir commit atılır. Böylece geçmiş silinmez ve geri dönüş de geri alınabilir.
  - `.gitignore`'daki dosyalara (`.env`) dokunulmaz. `reset --hard` kullanılmaz.
  - Geri dönüş komutu izin listesinde değildir; her seferinde onay ister.
- **Anlatıcı mod** (`.claude/output-styles/anlatici.md`): Her adımdan sonra "Ne oldu?" bloğu (ne yaptım, neden, sen nasıl görürsün, yeni kavram) ve hataların sade dille açıklaması. `/start` Adım 0b'de sorulur; `.claude/settings.local.json` → `outputStyle: anlatici`.
- **Harcama alarmı** (`docs/operations/spend-alarms.md`):
  - Ücretli servis başına tavan ve uyarı tablosu.
  - Sağlayıcı ayarları (Anthropic, OpenAI, Vercel, Supabase, Google Cloud; 2026-10-12'de doğrulandı).
  - Uygulama içi koruma: kullanıcı kotası, genel günlük bütçe, %100'de bayrağın otomatik kapanması.
  - Panonun Operasyon sekmesinde kart; ayarlanmamış alarm "Dikkat" listesine düşer (testli).
  - `/start` Adım 5 tabloyu doldurur; `/release` ve `/maintain` kontrol eder.
- README'ye **"Hiç bilmiyorsan: adım adım"** bölümü eklendi: hesaplar, programlar, proje oluşturma, ilk sorular, günlük kullanım. Rehbere de kısa hali eklendi.

### Düzeltildi
- `kit-tests.yml`: İş seviyesindeki `if: hashFiles(...)` koşulu GitHub'da desteklenmiyor ve her push'ta "No jobs were run" hatası veriyordu. Koşul kaldırıldı; `kit.mjs install` bu dosyayı zaten projeye taşımıyor.

## [3.4.0] - 2026-10-12

İlk konsey değerlendirmesinin sonucu: Kit, gerçek projede denenmek üzere bu sürümle **donduruldu**. Bundan sonra kitte sadece engelleyici hatalar düzeltilecek.

### Eklendi
- **Profil** (`/start` Adım 0): Hafif, Standart ve Tam profillerinden biri seçilir. Pro planda Hafif önerilir. Profil şunları belirler:
  - açık eklentiler
  - commit denetimi
  - hangi toplantıların ve kararların konseye gideceği

  Hafif profilde çekirdek 6 eklenti açık kalır, commit denetimi kapalıdır ve toplantı konseyi yoktur. Profil `progress.md` → `**Profil:**` satırına yazılır ve panonun Şimdi kutusunda görünür.
- Hook komutlarını `bash` ile gerçekten çalıştıran test eklendi. Önceki testler sadece komut metnine bakıyordu ve aşağıdaki bildirim hatasını kaçırmıştı.

### Değişti
- Karar konseyi artık sadece veritabanı ve auth kararlarında toplanıyor; Tam profilde ise tüm tek yönlü kararlarda. Diğer tek yönlü kararlarda mimarın görüşü alınıyor. Ölçüm: Bir konsey Pro planda 5 saatlik limitin yaklaşık %12'sini kullandı.

### Düzeltildi
- **Commit kapısı kurul yokken devreye giriyordu.** Şablonla gelen `board-chair.md` kurul üyesi sayılıyordu; bu yüzden `/start`'ın kurulum commit'i, henüz kurulmamış bir kurulu bekleyerek duruyordu. Hatayı bulan: konsey (opus danışmanı).
- **Uzun iş bildirimi hiç çalışmıyordu.** Stop hook komutunda tırnak yanlış yerdeydi (`notify.mjs --stop` tek bir yol gibi okunuyordu) ve Node "modül bulunamadı" diye çöküyordu.
- CHANGELOG başlığında eski komut adı (`/kit-guncelle`) duruyordu.

### Bilinen, açık bırakılanlar (dondurma kararıyla)
- Commit kapısındaki `--approve` izin listesinde duruyor; ajan kapıyı kendi açabilir. Hafif profilde commit denetimi zaten kapalı.
- Konsey sayımında ABARTILI oyu itiraz sayılıyor ve 2 oylu 1-1 beraberlik "tartışmalı" çıkıyor. Bu kural gerçek kullanımda gözden geçirilecek.

## [3.3.2] - 2026-10-12

### Değişti
- `plugins-sync.mjs`: Kurulu olduğu halde bu makinede kişisel tercihle kapatılmış eklentiler (settings.local.json veya /plugin) artık bilgi satırıyla bildiriliyor. Betik bu tercihi değiştirmiyor.
  - Denemeyle doğrulandı: Bu durum yükleme hatası değildir, Claude Code eklentiyi bilerek kaydetmez.
  - `claude plugin list --json` çıktısındaki `enabled` alanı, CLI'ın çalıştığı klasöre göre hesaplanır; `projectEnabled` ise proje ayarını gösterir.

## [3.3.1] - 2026-10-12

### Düzeltildi
- **Eklenti yükleme hatası** (`/reload-plugins`: "1 error during load"). Proje ayarı (`enabledPlugins`) eklentileri açıyor ama indirmiyordu.
  - Trail of Bits'in 7 eklentisi ve Anthropic'in 5 eklentisi kurulum kaydında yoktu. Başsız oturumda "not cached" hatası verip yüklenmiyorlardı.
  - Remotion için `false` değeri bile "enabled in project settings but isn't installed" hatası veriyordu.
  - Bu repoda hepsi proje kapsamında kuruldu, Remotion kapalı bırakıldı. Debug kaydında yükleme hatası 0 oldu, yüklenen skill sayısı 78'den 90'a çıktı.

### Eklendi
- `plugins-sync.mjs` (testli): Proje ayarındaki eklentileri kurulum kaydıyla eşitler. Varsayılan olarak sadece listeler; `--kur` ile eksikleri proje kapsamında kurar, `false` olanları kurup kapatır. Kabuk kullanmaz (`execFileSync`).
  - `/start` ortam adımında onayla çalışır, `/kit-update` yeni eklenti geldiğinde çalıştırır.

## [3.3.0] - 2026-10-12

### Eklendi
- **Konsey (üç aşama):** Karpathy'nin llm-council yapısının kurula uyarlanması (`.claude/board/council.md`).
  - **Toplantı konseyi:** Plan, faz sonu, canlıya alma ve RET çıkan görev sonu toplantılarında uygulanır. Üyeler önce bağımsız görüş verir. Sonra her üye diğerlerinin bulgularını kimin yazdığını bilmeden oylar (DOĞRU, ABARTILI veya YANLIŞ) ve görüşleri sıralar. En son başkan karar verir.
  - **Karar konseyi:** Tek yönlü kapı kararlarında ve `/board council <soru>` ile çalışır. 3 `council-advisor` (haiku, sonnet, opus) aynı soruyu cevaplar ve birbirini anonim sıralar. `board-chair` önerir; AskUserQuestion'daki "(Önerilen)" seçenek konseyden gelir, her seçeneğe konsey oyu ve azınlık görüşü eklenir.
  - `board-chair` (opus) ve `council-advisor` ajanları eklendi.
  - Sayım için `council.mjs` eklendi (testli). Ortalama sırayı, bulgu oylarını, tartışmalı bulguları ve uzlaşmayı kodla hesaplar. Başkan tartışmalı KRİTİK bulguyu eleyemez.
  - Tutanaklar `docs/workflow/council/` klasörüne yazılır. Panonun Kurul sekmesine yeni Konsey kartı eklendi: son karar, uzlaşma, tartışmalı ve elenen bulgu sayısı, kimlikleriyle toplu sıralama, son 10 tutanak.

### Değişti
- `docs/workflow/decision-protocol.md` §2a: Tek yönlü kararlarda önceki tek mimar görüşünün yerini karar konseyi aldı. Limit kırmızıysa eski yönteme dönülür.
- `.claude/board/rules.md`: Konsey toplantıları ve §4'e 2b adımı eklendi. `/board` komutuna `council` eklendi.
- Rehber, pano ve README 3.3 ile güncellendi.

## [3.2.0] - 2026-10-12

Ekosistem araştırmasından (yıldız ve bakım durumu GitHub API'den, kurulum ayrıntıları birincil kaynaktan) seçilenler.

### Eklendi
- **Anthropic resmi eklentileri** (`claude-plugins-official`, her tipte): `security-guidance` (yazarken kalıp uyarısı + commit incelemesi; tur sonu incelemesi kota için `ENABLE_STOP_REVIEW=0` ile kapalı), `claude-security` (`/findings-security` derin tarama), `hookify`, `claude-md-management`, `session-report`.
- **LSP:** `typescript-lsp` (web, mobil), `pyright-lsp` (backend). Dil sunucusu kurulumu `/start`'ta.
- **Stack skill'leri:** Supabase `supabase` + `postgres-best-practices` (web, mobil; backend'de postgres), `web-quality-skills` (web), Expo resmi `expo` eklentisi (mobil, Expo MCP dahil), Vercel `react-best-practices` / `composition-patterns` / `react-native-guidelines` (`/start` `npx skills` ile kopyalar).
- **Maestro MCP** mobil `.mcp.json`'da; servis MCP kataloğu `docs/workflow/mcp-catalog.md` (GitHub, Stripe, Vercel, PostHog, Figma, Firebase, Linear).
- **Düzenleme kilidi:** `/freeze <klasör> | off`, `freeze-guard.mjs` hook'u (testli).
- **Token ve maliyet:** `cost.mjs` (ccusage, proje başına son 30 gün) → panonun Limit ve maliyet sekmesinde yeni kart (testli).
- Güvenlik kuralları `.claude/claude-security-guidance.md` ve `.claude/security-patterns.json` (service_role istemcide, public env'de sır, kişisel veri logu).

### Değişti
- `CLAUDE.md` kural 7'ye Karpathy'nin dört ilkesi; "Bitti" tanımında doğrulama komutu bu turda çalıştırılıp çıktısı gösterilir.
- `/fix-bug`: tek değişken, çürütme kanıtı, kök neden bulununca `/freeze` önerisi.
- Kurul: Ürün üyesi plan toplantısında kapsam modu sorar (genişlet / koru / küçült).
- `/retro` ve `/wrap-up`: `claude-md-improver`, `/revise-claude-md`, `/hookify` önerileri. `/dashboard` ve `/wrap-up` maliyet verisini yeniler.
- `/findings-security`: `claude-security` taraması; çıktı klasörü `CLAUDE-SECURITY-*/` git dışı ve yapı haritasında izinli.
- Rehber, pano ve README 3.2 ile güncellendi.

### Elle uyarla (mevcut projeler)
- Dil sunucusunu kur: `npm i -g typescript-language-server typescript` veya `npm i -g pyright`. Mobilde Maestro CLI.

## [3.1.1] - 2026-10-12

### Değişti
- Rehber (`kit/guide.html`) v3.1'e getirildi: 10 sekmeli pano ve bildirim, yeni skill tablosu (source-research, logo-design, ui-motion, motion-video, Trail of Bits), "Yetenek paketleri" bölümü, tüm koruma katmanları.
- Pano: "Ürün ve teknik" sekmesine marka paketi, tanıtım videoları ve araştırma notları kartları eklendi (`uretimVarliklari`, testli).
- README: bildirim, Ürün ve teknik sekmesinin içeriği; sürüm adımlarına "rehber, pano ve README güncellenir" kuralı.

## [3.1.0] - 2026-10-12

### Eklendi
- **Kitin kendi skill'leri** (`.claude/skills/`, kit yönetiminde):
  - `source-research`: Kaynak politikası (A-D güven seviyeleri, birincil kaynak önce, çapraz doğrulama, tarih ve sürüm), Türkiye resmi kaynak listesi, `docs/research/` kayıtları. İsteğe bağlı Firecrawl kurulumu: anahtar kullanıcının ortam değişkeninde kalır.
  - `logo-design`: Marka özeti soruları, 4-6 SVG konsept (16 px okunurluk, tek renk hal), görsel önizleme, iyileştirme, marka paketi (favicon, apple-touch, 192/512, mobil ikonları), `docs/design/brand.md`.
  - `motion-video`: N01ennn'in "UI motion design" prompt'undan uyarlandı. Kapalı formlu yay fonksiyonu (testle doğrulandı), vuruş haritası, 4 kare onay, 240 fps alt kareden hareket bulanıklığı, döngü dikişi ve belirlenimcilik kontrolü. Remotion seçeneği.
  - `ui-motion`: Uygulama içi hareket kuralları (süre belirteçleri, yay ayarları, hareket azaltma, performans; Motion ve Reanimated).
- **MCP:**
  - Context7 her tipte (uzak HTTP).
  - Chrome DevTools MCP web'de.
  - Playwright ve Chrome DevTools sürümleri sabitlendi (`@latest` kaldırıldı).
- **Trail of Bits güvenlik plugin'leri** (7 adet): security lens'ine ve `security-auditor`'a bağlandı.
- **Remotion resmi plugin'i:** Tanımlı, varsayılan kapalı.
- **Bildirim hook'u** (`notify.mjs`): Claude soru veya onay beklerken (Notification) ve 90 saniyeden uzun iş bitince (Stop) masaüstü bildirimi gelir. Windows, macOS ve Linux destekleniyor.
- **Skill bütçesi:** Backend projelerinde arayüz tasarım plugin'leri kapalı gelir. `docs/workflow/skills.md`'ye bütçe kuralları eklendi.
- **Yapı haritası:** `marketing/**` alanı eklendi (tanıtım videosu kaynakları; kareler ve çıktılar git dışı).

## [3.0.0] - 2026-10-12

Profesyonel yapı ve bulgu raporları. **Kırıcı değişiklik:** dosya ve komut adları değişti, `.kit.json` biçimi değişti; 2.x projeleri otomatik güncellenemez.

### Değişti
- **Dosya ve klasör adları İngilizce kebab-case oldu** (içerik Türkçe). `docs/` alt klasörlere ayrıldı: `product`, `architecture`, `design`, `decisions`, `quality`, `security`, `legal`, `operations`, `workflow`, `findings`, `archive`.
  - Örnekler: `docs/PRD.md` → `docs/product/prd.md`, `docs/ILERLEME.md` → `docs/workflow/progress.md`, `docs/KARARLAR.md` → `docs/decisions/log.md`.
- **Komutlar İngilizce oldu:**

  | Eski | Yeni | Eski | Yeni |
  |---|---|---|---|
  | `/baslat` | `/start` | `/oturum-sonu` | `/wrap-up` |
  | `/planla` | `/plan-task` | `/canliya-al` | `/release` |
  | `/gelistir` | `/build` | `/bakim` | `/maintain` |
  | `/incele` | `/review-changes` | `/tasarim` | `/design` |
  | `/hata-ayikla` | `/fix-bug` | `/soru` | `/ask-mode` |
  | `/durum` | `/dashboard` | `/kurul` | `/board` |
  | `/kit-guncelle` | `/kit-update` | `/geri-bildirim` | `/user-feedback` |

  Argümanlar da İngilizce: `setup`, `convene`, `first`, `on`/`off`, `weekly`/`monthly`/`quarterly`.
- **Ajanlar:** `inceleyici` → `code-reviewer`, `guvenlik-denetcisi` → `security-auditor`, `kurul-*` → `board-*`.
- **Hook dosyaları:**
  - İngilizce adlar aldı: `dashboard.mjs`, `commit-gate.mjs`, `package-gate.mjs`, `destructive-guard.mjs`, `usage.mjs`, `reminder.mjs`, `status-read.mjs`, `dashboard-data.mjs`.
  - Çalışma durumu dosyaları `.claude/state/` altında toplandı.
- **Pano:** `DURUM.html` → `dashboard.html`. Tasarım önizlemeleri `.previews/` altında.
- **Kit iç yapısı:**
  - `kit/sablon` → `kit/templates`, `mobil` → `mobile`, `ekler` → `addons`.
  - `SURUM`/`KAYNAK` → `VERSION`/`SOURCE`, `REHBER.html` → `guide.html`, `testler` → `tests`.
  - Özel dosya uzantıları: `.ekle` → `.append`, `.birlestir.json` → `.merge.json`. Çakışma dosyası: `.yeni` → `.kit-new`.
  - `kit.mjs`: `kur`/`guncelle` → `install`/`update`, `--tip`/`--ekler`/`--proje` → `--type`/`--addons`/`--project`. `.kit.json` alanları İngilizce.
- **Ayrıntılı kararlar ADR dosyalarına taşındı:** `docs/decisions/adr-NNNN-*.md` (şablon `adr-template.md`). Karar günlüğü `docs/decisions/log.md`.

### Eklendi
- **Korunan proje yapısı:**
  - Tip başına özellik bazlı yapı haritası (`.claude/structure.json`) ve rehberi (`docs/architecture/structure.md`).
  - `structure-guard.mjs`: Harita dışı yeni dosya için kullanıcıya sorulur; dağınıklık kalıpları (`*.bak`, `*-old.*`, kopya, `temp/`, `deneme*`) engellenir; `--check` ile tüm depo denetlenir.
  - Her tipin CI'ına `structure` işi eklendi. Kurul Mimarı ve `/findings-tech` da yapıyı denetler.
  - `sandbox/` (git dışı deneme alanı) ve `docs/archive/` eklendi.
- **Bulgu raporları:**
  - Komutlar: `/findings-tech`, `/findings-business`, `/findings-security`, `/findings-ux`, `/findings-perf`, `/findings-legal`, `/findings-all`.
  - Ortak protokol (`.claude/findings/protocol.md`), tür başına bakış açısı (`lenses/`) ve rapor şablonu.
  - En fazla 20 bulgu; önem puanı = etki + olasılık + yayılım + aciliyet; alan sağlık puanı; önceki raporla karşılaştırma.
  - Rapor sonrası düzeltme planı, kurul görüşü ve yol haritasına aktarma.
  - Business raporu sektör uzmanı rolünü PRD'den çıkarır, kullanıcıya onaylatır ve web araştırması yapar; ayarlar `docs/findings/config.md`'de tutulur.
- **Panoya "Bulgular" sekmesi:** tür başına sağlık puanı ve değişimi, rapor geçmişi; kritik bulgular "Dikkat" alanına düşer.
- **README yenilendi:** banner (`kit/assets/banner.svg`), rozetler, Mermaid diyagramları.
- **Kitin kendi CI'ı:** `.github/workflows/kit-tests.yml` (projeye taşınmaz).

## [2.3.0] - 2026-10-11

Araştırmaya dayalı 15 öneri.

### Eklendi
- **Güvenlik:**
  - **Paket kapısı** (`paket-kapisi.mjs`): AI'nın kurmak istediği paket kurulumdan önce kayıt defterinden doğrulanır. Var olmayan paket engellenir. Çok yeni, az indirilmiş veya popüler bir pakete çok benzeyen paket için kullanıcıya sorulur (slopsquatting'e karşı).
  - **Yıkıcı komut kalkanı** (`yikici-kalkan.mjs`): `DROP`, `TRUNCATE`, koşulsuz `DELETE`, `db reset`, volume silme, `git clean` engellenir. Prod deploy, ana dala push ve uzak veritabanı bağlantısı için kullanıcıya sorulur. Karar Claude Code'un izin katmanında verilir; AI kendisi atlayamaz.
  - **Ajan yapılandırması koruması:** `CLAUDE.md`, `.claude/`, `.mcp.json` ve `.github/workflows/` düzenlemeleri kullanıcı onayı gerektirir. GUVENLIK.md'ye "AI ajanı güvenliği" bölümü eklendi.
  - **CI'da Semgrep** ve TEST-PLANI'nda saldırgan testleri (IDOR, oturumsuz erişim, rol aşımı, XSS, girdi sınırı, log enjeksiyonu).
- **Kalite:**
  - **Kabul testleri yaşayan şartname oldu:** PRD kriterlerinin kimliği var (`Ö-01.1`), testler koddan önce kırmızı yazılır. Pano JUnit raporunu okur ve "işaretli ama testi yok/kırmızı" uyumsuzluğunu yakalar.
  - **CI'da kopya kod denetimi** (jscpd, eşik %5).
  - **Bağlam sağlığı:** Durum çubuğunda bağlam doluluğu gösterilir. Bir UserPromptSubmit hook'u 12 mesajda bir temel kuralları hatırlatır ve %50/%70 eşiklerinde `/clear` önerir.
  - **`docs/METRIKLER.md`:** Görev süresi, düzeltme oranı, geri alma, kopya kod, kabul oranı aylık olarak kaydedilir; retro bu verilerle yapılır.
- **Operasyon:**
  - **Canlı izleme iş akışı** (web, backend): Kritik akışlar saatlik denenir, bozulursa issue açılır.
  - **Bulut ajanları** (`claude-code-action`): CI kırmızıysa PR dalına düzeltme (döngü ve fork koruması ile) ve haftalık bakım issue'su. Değişkenle açılırlar.
  - **`docs/HESAPLAR.md`:** Servis, sahip, 2FA ve bitiş tarihleri; pano 30 gün içinde dolanları uyarır.
  - **`docs/BAYRAKLAR.md` ve STACK'lerde bayrak yöntemi:** Acil kapatma deploy gerektirmez.
- **Ürün:**
  - **Tek yönlü / çift yönlü kapı:** Karar günlüğüne "Kapı" sütunu eklendi. Tek yönlü kararlarda kurul görüşü ve ayrıntılı kayıt zorunlu.
  - **`docs/BIRIM-EKONOMISI.md`:** Pano katkı payını, başa baş noktasını ve hedefteki kâr/zararı hesaplar.
  - **`/geri-bildirim` komutu ve `docs/GERI-BILDIRIM.md`:** Gelen kutusu, temalar ve yol haritasına aktarma.
- **DURUM panosu:**
  - Yeni "Operasyon" sekmesi: hesaplar, bayraklar, GitHub (CI, açık PR'lar, canlı izleme; gh varsa 5 dk önbellekle).
  - Kabul testi tablosu, metrik eğilimi, birim ekonomisi, geri bildirim, bağlam kartı, karar kapı filtresi.
  - "Dikkat" listesi önem sırasına dizilir; ilk 6 madde gösterilir, kalanı açılır.

### Değişti
- **`docs/KARARLAR.md` karar günlüğü 8 sütun oldu (Kapı).** Pano eski 7 sütunlu tabloyu da okur. *(Elle uyarla: KARARLAR.md tablo başlığı)*
- **`docs/MALIYET-GUNLUGU.md`'ye "Süre (dk)" sütunu eklendi.** *(Elle uyarla)*
- **`docs/PRD.md` kabul kriterlerine kimlik eklendi.** *(Elle uyarla)*
- **Komutlar güncellendi:** `/baslat`, `/planla`, `/gelistir`, `/bakim`, `/retro`, `/canliya-al` ve `/oturum-sonu` yeni kuralları uygular.

## [2.2.0] - 2026-10-11

### Değişti
- **DURUM.html proje sahibinin kontrol paneline dönüştü:**
  - Üst bölümde "Şimdi" (aşama, görev, sıradaki adım) ve "Dikkat gerektirenler" alanları var. Burada kurul RET'i, limit, bekleyen kararlar, yarıda kalan iş, açık sorunlar, eski ILERLEME ve soru modu görünür.
  - Genel sağlık rozeti: Yolunda / Dikkat / Engel var.
  - Özet kutucuklar: görevler, MVP kabul kriterleri, kararlar, kurul, son 7 günün commit'leri, limit.
  - 8 sekme: Genel, Yol haritası (görev listesi, aktif görev vurgulu), Kararlar (konu filtresi), Kurul, Kalite (kontrol listeleri, kod sağlığı, düzeltme oranı, kritik akış testleri, bakım), Aktivite (14 günlük commit grafiği ve birleşik akış), Ürün ve teknik (PRD, MVP, stack, tasarım, önizleme bağlantıları, CHANGELOG), Limit ve maliyet.
  - Açık ve koyu tema, 30 saniyede bir otomatik yenileme, klavyeyle sekme gezintisi.
- **Stop hook'u:** Panoyu her Claude cevabından sonra yeniler (token harcamaz).
- **`durum-oku.mjs`:** Yardımcı fonksiyonları dışa açar; görev listeleri ve son oturum bilgisini okur.

## [2.1.0] - 2026-10-11

### Eklendi
- **Uzman kurulu:**
  - 10 rol şablonu (`.claude/kurul/`): Ürün, Mimar, UX, Performans/SEO, KVKK, QA, DevOps, Mobil, API ve AI. Güvenlik üyesi olarak `guvenlik-denetcisi` kullanılır.
  - `/baslat` Adım 6'da tipe göre kurul önerilir, onaylanır ve projeye özel ajanlar `.claude/agents/kurul-*.md` olarak üretilir.
  - Toplantılar: plan, görev sonu, commit (hafif) ve faz sonu/canlıya alma.
  - Kurul danışmandır; kritik bulguda durdurur.
  - `/kurul` komutu ve `docs/KURUL.md` toplantı günlüğü.
- **Commit kapısı hook'u** (`commit-kapisi.mjs`): AI'nın commit'i hafif kurul denetimi olmadan geçmez. Sadece doküman değiştiyse muaf; `docs/KURUL.md` üzerinden kapatılabilir.
- **Limit farkındalığı:**
  - `limit.mjs` ve durum çubuğu Claude Code'un `rate_limits` bilgisini okur ve önbelleğe alır. Masaüstünde `get_usage` aracı kullanılır.
  - `docs/LIMIT-PLANI.md`: eşikler, maliyet tahmini, sarı/kırmızı seviyede seçenekler, güvenli durma.
  - Görev maliyetleri `docs/MALIYET-GUNLUGU.md`'ye kaydedilir.
  - `docs/ILERLEME.md`'ye "Kaldığı yer" bölümü eklendi.
- **Kod haritası:** `/baslat`, codebase-memory-mcp kurulumunu önerir; CLAUDE.md onu öncelikli keşif aracı yapar.
- **Durum panosu ve oturum notu:** Limit, kurul ve "kaldığı yer" bilgisi eklendi.

### Değişti
- **Açılış yükü yaklaşık 8.000 token'dan 1.700 token'a indi:**
  - `CLAUDE.md` artık sadece `docs/ILERLEME.md`'yi içe aktarıyor.
  - Protokol, skill ve stack kuralları CLAUDE.md'de özet olarak duruyor; ayrıntılı dokümanlar gerektiğinde okunuyor. *(Elle uyarla: CLAUDE.md)*
- **`/baslat` 9 adım oldu** (yeni adım: Kurul). *(Elle uyarla: ILERLEME.md'deki `Başlangıç adımı` satırının paydası 9 oldu)*
- **`guvenlik-denetcisi`:** `model: sonnet` ve kurul çıktı formatı eklendi.
- **Komutlar güncellendi:** `/planla`, `/gelistir`, `/incele`, `/oturum-sonu`, `/canliya-al` ve `/durum` artık kurul toplantılarını ve limit kontrolünü içeriyor.

## [2.0.0] - 2026-10-11

Soru odaklı akış ve GitHub template yapısı. **Kırıcı değişiklik:** 1.x projeleri otomatik güncellenemez (`.kit.json` biçimi ve dosya düzeni değişti).

### Eklendi
- **Karar protokolü** (`docs/KARAR-PROTOKOLU.md`):
  - Her ürün, teknik, tasarım, içerik, veri, güvenlik ve maliyet kararı AskUserQuestion ile sorulur.
  - Önerilen seçenek ilk sıradadır ve her seçeneğin ne zaman daha iyi olduğu açıklanır.
- **Soru modu:** Konu bazlı kapatılıp açılır (`/soru`, ya da "tasarımda sorma" demek yeterli). Kapalı konudaki kararlar "otomatik" olarak kaydedilir.
- **Görsel önizleme:** Tasarım kararları `.onizleme/` altında üretilen örneklerle sorulur.
- **Skill yönlendirme** (`docs/SKILLER.md`):
  - Caveman, Impeccable, Taste Skill (stil yönüne göre), UI UX Pro Max, Humanizer, Ponytail, Matt Pocock skills.
  - Bu plugin'ler `.claude/settings.json`'da tanımlı; proje açılınca Claude Code kurmayı önerir.
- **Raporlama:**
  - Her cevabın sonunda durum bloğu.
  - Alt durum çubuğu (`statusline.mjs`).
  - `/durum` komutu ve `DURUM.html` panosu (`durum-panosu.mjs`).
- **`/baslat` sihirbazı:**
  - 8 adım: fikir sorgulama, proje tipi, kurulum, teknoloji, mimari, tasarım, yol haritası, kapanış.
  - Kaldığı adımdan devam eder.
- **STACK.md'lere "Karar noktaları" kataloğu:** Her tip için seçenekler ve hangisinin ne zaman daha iyi olduğu.
- **Yeni komutlar:** `/tasarim`, `/soru`, `/durum`, `/kit-guncelle`.
- **`docs/KARARLAR.md`'ye karar günlüğü tablosu.**
- **`docs/ILERLEME.md`'ye yeni alanlar:** başlangıç adımı, soru modu, bekleyen kararlar.

### Değişti
- **Template yapısı:**
  - Repo kökü artık ortak katmanın kendisi.
  - Tipler ve ekler `kit/sablon/` altında.
  - `/baslat`, `node kit/kit.mjs kur` ile tipi yerleştirir ve `kit/` klasörünü siler.
- **Kurulum aracı Node.js'e taşındı** (`kit/kit.mjs`). `kit.ps1` kaldırıldı.
- **Tip katmanları birleştirmeyle uygulanıyor:** `.gitignore.ekle` ve `.claude/settings.birlestir.json` artık kökteki dosyalarla birleştiriliyor.
- **`TASARIM.md`:** Belirteçler Impeccable'ın `DESIGN.md` dosyasına taşındı. TASARIM.md artık seçilen yön, karar günlüğü ve kalıcı kurallar için.
- **Komutlar:** `/planla`, `/gelistir`, `/incele`, `/hata-ayikla`, `/canliya-al`, `/bakim`, `/retro` ve `/oturum-sonu` karar sorma ve skill adımlarıyla güncellendi.
- **`/retro`:** Kit önerileri artık kit reposunda bir dal olarak hazırlanır ve onayla push edilir.

## [1.1.0] - 2026-10-11

### Eklendi
- **Otomatik kontroller**
  - Claude Code hook'ları (`.claude/hooks/`): sır yazımını engelleme, dosya biçimlendirme, oturum başında git ve ILERLEME durumu.
  - Commit öncesi kontrol: web/mobil için husky + lint-staged, backend için pre-commit. İkisi de sır taraması yapar.
  - GitHub Actions CI ve Dependabot (her tip için).
- **İnceleme**
  - `inceleyici` ve `guvenlik-denetcisi` alt ajanları (`.claude/agents/`).
  - `/incele` artık bu ajanları kullanıyor.
- **Doğrulama:** `/gelistir`'e "kanıt üret" adımı, STACK.md'lere "Doğrulama" bölümü, "Bitti" tanımına kanıt maddesi.
- **MCP:** `.mcp.json` (Playwright, Supabase salt-okunur, Sentry). `/bakim` bunları kullanabiliyor.
- **Yeni dokümanlar:** `docs/SOZLUK.md`, `docs/LANSMAN.md`, `docs/RETRO.md`; web ve mobil için `docs/TASARIM.md`.
- **AI eki** (`-Ekler ai`): `docs/AI.md`, `evals/`, `prompts/`, `.env.example` parçası.
- **`/retro` komutu:** dersleri projeye ve kite geri yazar.
- **`kit.ps1`:** `yeni` ve `guncelle` işlemleri. Projede `.kit.json` ile dosya takibi yapılır; güncelleme kullanıcının değiştirdiği dosyaları ezmez.
- Testler: `testler/`.

### Değişti
- `yeni-proje.ps1` kaldırıldı, yerine `kit.ps1 yeni` geldi.
- Yol haritası Faz 0'a pre-commit + CI (G-004) ve SOZLUK/TASARIM (G-007) görevleri eklendi; sonraki görev numaraları kaydı. *(Elle uyarla: YOL-HARITASI.md)*
- `CLAUDE.md`'ye yeni dokümanlar, hook ve ajan kuralları eklendi. *(Elle uyarla)*
- Backend bağımlılık taraması `uv run --with pip-audit pip-audit` oldu. Eski `uvx pip-audit` komutu projenin değil, kendi ortamını tarıyordu. *(Elle uyarla: STACK.md, settings.json)*
- `CANLIYA-ALMA.md`'ye CI, dal koruması, AI eki ve lansman maddeleri eklendi.

## [1.0.0] - 2026-10-11

### Eklendi
- İlk sürüm: ortak dokümanlar, 8 komut, web-saas / mobil / backend şablonları, `REHBER.html`.
