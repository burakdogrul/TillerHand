# Çalıştır: powershell -ExecutionPolicy Bypass -File testler\kit.test.ps1
$ErrorActionPreference = 'Stop'
$kit = Join-Path $PSScriptRoot '..\kit.ps1'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("kit-test-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$hata = 0
function Dogrula($kosul, $ad) { if ($kosul) { Write-Host "  ok  $ad" } else { Write-Host "  HATA $ad"; $script:hata++ } }
function Oku($p) { [IO.File]::ReadAllText($p) }
function Kayit($proje) { [IO.File]::ReadAllText((Join-Path $proje '.kit.json')) | ConvertFrom-Json }
function KayitYaz($proje, $j) { [IO.File]::WriteAllText((Join-Path $proje '.kit.json'), (ConvertTo-Json $j -Depth 5)) }
function HashOf([string] $metin) {
    $sha = [Security.Cryptography.SHA256]::Create()
    -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($metin)) | ForEach-Object { $_.ToString('x2') })
}

try {
    Write-Host 'yeni (web-saas + ai)'
    $p = Join-Path $tmp 'a'
    & $kit yeni -Hedef $p -Tip web-saas -Ekler ai | Out-Null
    Dogrula (Test-Path "$p\docs\AI.md") 'AI eki kopyalandı'
    Dogrula (Test-Path "$p\docs\TASARIM.md") 'tip dosyası kopyalandı'
    Dogrula (Test-Path "$p\.claude\agents\inceleyici.md") 'ortak dosya kopyalandı'
    Dogrula (-not (Test-Path "$p\.env.example.ekle")) '.ekle dosyası kopyalanmadı'
    $env = Oku "$p\.env.example"
    Dogrula ($env.Contains('NEXT_PUBLIC_SUPABASE_URL') -and $env.Contains('AI_MODEL_VARSAYILAN')) '.env.example = tip + AI parçası'
    Dogrula (Test-Path "$p\.git") 'git init'
    $j = Kayit $p
    Dogrula ($j.tip -eq 'web-saas' -and @($j.ekler) -contains 'ai') '.kit.json tip/ekler'

    Write-Host 'yeni: dolu klasör reddedilir'
    $reddedildi = $false
    try { & $kit yeni -Hedef $p -Tip mobil | Out-Null } catch { $reddedildi = $true }
    Dogrula $reddedildi 'dolu klasöre kurmadı'

    Write-Host 'guncelle: değişiklik yok'
    $cikti = (& $kit guncelle -Proje $p 6>&1 | Out-String)
    Dogrula ($cikti -match 'Değişiklik yok') 'değişiklik yok'
    Dogrula ((Oku "$p\.env.example").Split([string[]]@('AI_MODEL_VARSAYILAN'), 'None').Count -eq 2) '.ekle tekrar eklenmedi'

    Write-Host 'guncelle: senaryolar'
    $j = Kayit $p
    # (1) Kullanıcı dokunmamış, kit değişmiş -> güncellenir
    $f1 = '.claude/commands/planla.md'; [IO.File]::WriteAllText("$p\$f1", 'eski kit'); $j.dosyalar.$f1 = HashOf 'eski kit'
    # (2) Kullanıcı değiştirmiş, kit de değişmiş -> .yeni
    $f2 = '.claude/commands/incele.md'; [IO.File]::WriteAllText("$p\$f2", 'kullanici'); $j.dosyalar.$f2 = HashOf 'eski kit'
    # (3) Kullanıcı değiştirmiş, kit değişmemiş -> dokunulmaz (kayıttaki hash zaten kitinki)
    $f3 = 'docs/GUVENLIK.md'; [IO.File]::WriteAllText("$p\$f3", 'kullanici notu')
    # (4) Kullanıcı silmiş -> geri gelmez
    $f4 = 'docs/LANSMAN.md'; Remove-Item "$p\$f4"
    # (5) Kitte yeni dosya (kayıtta yok, projede yok) -> eklenir
    $f5 = 'docs/SOZLUK.md'; Remove-Item "$p\$f5"; $j.dosyalar.PSObject.Properties.Remove($f5)
    # (6) Projeye ait dosya değiştirilmiş -> dokunulmaz
    [IO.File]::WriteAllText("$p\CLAUDE.md", 'proje kurali')
    KayitYaz $p $j

    & $kit guncelle -Proje $p | Out-Null
    Dogrula ((Oku "$p\$f1") -ne 'eski kit') '(1) dokunulmamış kit dosyası güncellendi'
    Dogrula ((Oku "$p\$f2") -eq 'kullanici' -and (Test-Path "$p\$f2.yeni")) '(2) çakışma: kullanıcı korundu + .yeni'
    Dogrula ((Oku "$p\$f3") -eq 'kullanici notu' -and -not (Test-Path "$p\$f3.yeni")) '(3) kit değişmemiş: dokunulmadı'
    Dogrula (-not (Test-Path "$p\$f4")) '(4) silinen dosya geri gelmedi'
    Dogrula (Test-Path "$p\$f5") '(5) yeni kit dosyası eklendi'
    Dogrula ((Oku "$p\CLAUDE.md") -eq 'proje kurali') '(6) projeye ait dosyaya dokunulmadı'

    Write-Host 'guncelle: sonradan ek ekleme'
    $q = Join-Path $tmp 'b'
    & $kit yeni -Hedef $q -Tip backend | Out-Null
    Dogrula (-not (Test-Path "$q\docs\AI.md")) 'başta AI yok'
    & $kit guncelle -Proje $q -Ekler ai | Out-Null
    Dogrula (Test-Path "$q\docs\AI.md") 'AI.md eklendi'
    Dogrula ((Oku "$q\.env.example").Contains('AI_MODEL_VARSAYILAN')) '.env.example parçası eklendi'
    Dogrula (@((Kayit $q).ekler) -contains 'ai') '.kit.json ekler güncellendi'
}
finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
if ($hata) { Write-Host "$hata test başarısız"; exit 1 } else { Write-Host 'Tüm testler geçti' }
