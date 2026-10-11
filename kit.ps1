# Vibe Coding Başlangıç Kiti
#   Yeni proje:  .\kit.ps1 yeni -Hedef "D:\Projeler\uygulama" -Tip web-saas [-Ekler ai]
#   Güncelleme:  .\kit.ps1 guncelle -Proje "D:\Projeler\uygulama" [-Ekler ai]
param(
    [Parameter(Mandatory, Position = 0)] [ValidateSet('yeni', 'guncelle')] [string] $Islem,
    [string] $Hedef,
    [string] $Proje,
    [ValidateSet('web-saas', 'mobil', 'backend')] [string] $Tip,
    [ValidateSet('ai')] [string[]] $Ekler = @()
)
$ErrorActionPreference = 'Stop'
$sablon = Join-Path $PSScriptRoot 'sablon'
$surum = (Get-Content -Raw (Join-Path $PSScriptRoot 'SURUM')).Trim()
$utf8 = New-Object Text.UTF8Encoding $false

# Kitin sahiplendiği dosyalar: güncellemede, kullanıcı değiştirmediyse yenisiyle değiştirilir.
# Diğerleri (CLAUDE.md, PRD, STACK, settings.json...) projeye aittir; güncelleme sadece eksikse ekler.
function Test-KitDosyasi([string] $rel) {
    $rel -like '.claude/commands/*' -or $rel -like '.claude/agents/*' -or $rel -like '.claude/hooks/*' -or
    $rel -in @('docs/GUVENLIK.md', 'docs/CANLIYA-ALMA.md', 'docs/BAKIM.md', 'docs/YASAL-KVKK.md')
}

# Satır sonu farkı (CRLF/LF) değişiklik sayılmasın
function Get-Hash([string] $yol) {
    $metin = [IO.File]::ReadAllText($yol).Replace("`r`n", "`n")
    $sha = [Security.Cryptography.SHA256]::Create()
    -join ($sha.ComputeHash($utf8.GetBytes($metin)) | ForEach-Object { $_.ToString('x2') })
}

# Göreli yol -> kaynak dosya. Katman sırası: ortak, tip, ekler; sonraki öncekini ezer.
function Get-Harita([string] $tip, [string[]] $ekler) {
    $harita = [ordered]@{}
    foreach ($katman in @('ortak', $tip) + @($ekler | ForEach-Object { "ekler\$_" })) {
        $kok = Join-Path $sablon $katman
        if (-not (Test-Path $kok)) { throw "Şablon katmanı bulunamadı: $kok" }
        foreach ($f in Get-ChildItem -LiteralPath $kok -Recurse -File -Force) {
            if ($f.Name.EndsWith('.ekle')) { continue }
            $harita[$f.FullName.Substring($kok.Length + 1).Replace('\', '/')] = $f.FullName
        }
    }
    $harita
}

function Copy-Dosya([string] $kaynak, [string] $hedef) {
    New-Item -ItemType Directory -Force (Split-Path $hedef) | Out-Null
    Copy-Item -Force -LiteralPath $kaynak -Destination $hedef
}

# Eklerdeki "x.ekle" dosyaları projedeki "x" dosyasının sonuna eklenir (örn. .env.example)
function Add-EkParcalari([string] $kok, [string[]] $ekler) {
    foreach ($ek in $ekler) {
        $ekKok = Join-Path $sablon "ekler\$ek"
        foreach ($f in Get-ChildItem -LiteralPath $ekKok -Recurse -File -Force -Filter '*.ekle') {
            $rel = $f.FullName.Substring($ekKok.Length + 1) -replace '\.ekle$', ''
            $hedef = Join-Path $kok $rel
            $parca = [IO.File]::ReadAllText($f.FullName)
            $mevcut = if (Test-Path -LiteralPath $hedef) { [IO.File]::ReadAllText($hedef) } else { '' }
            if (-not $mevcut.Contains($parca.Split("`n")[0])) {
                [IO.File]::AppendAllText($hedef, "`n" + $parca, $utf8)
            }
        }
    }
}

function Save-Kayit([string] $kok, $tip, $ekler, $olusturma, $dosyalar) {
    $veri = [ordered]@{
        surum      = $surum
        kaynak     = $PSScriptRoot
        tip        = $tip
        ekler      = @($ekler)
        olusturma  = $olusturma
        guncelleme = (Get-Date -Format 'yyyy-MM-dd')
        dosyalar   = $dosyalar
    }
    [IO.File]::WriteAllText((Join-Path $kok '.kit.json'), (ConvertTo-Json -InputObject $veri -Depth 5), $utf8)
}

if ($Islem -eq 'yeni') {
    if (-not $Hedef -or -not $Tip) { throw 'yeni için -Hedef ve -Tip gerekli.' }
    # Mevcut bir projenin dosyalarını ezmemek için sadece boş/yeni klasöre kur
    if ((Test-Path $Hedef) -and (Get-ChildItem -Force $Hedef | Select-Object -First 1)) {
        throw "Hedef klasör boş değil: $Hedef"
    }
    New-Item -ItemType Directory -Force $Hedef | Out-Null
    $Hedef = (Resolve-Path $Hedef).Path

    $harita = Get-Harita $Tip $Ekler
    foreach ($rel in $harita.Keys) { Copy-Dosya $harita[$rel] (Join-Path $Hedef $rel) }
    Add-EkParcalari $Hedef $Ekler

    $dosyalar = [ordered]@{}
    foreach ($rel in $harita.Keys) { $dosyalar[$rel] = Get-Hash (Join-Path $Hedef $rel) }
    Save-Kayit $Hedef $Tip $Ekler (Get-Date -Format 'yyyy-MM-dd') $dosyalar

    if (Get-Command git -ErrorAction SilentlyContinue) {
        git -C $Hedef init -q
        Write-Host 'git deposu oluşturuldu.'
    }
    Write-Host "Hazır: $Hedef ($Tip$(if ($Ekler) { ' + ' + ($Ekler -join ', ') }), kit $surum)"
    Write-Host 'Sonraki adım:'
    Write-Host "  cd `"$Hedef`"; claude"
    Write-Host '  /baslat [proje fikrin]'
    return
}

# --- guncelle ---
if (-not $Proje) { throw 'guncelle için -Proje gerekli.' }
$Proje = (Resolve-Path $Proje).Path
$kayitYolu = Join-Path $Proje '.kit.json'
if (-not (Test-Path $kayitYolu)) { throw ".kit.json bulunamadı: $Proje kit ile (v1.1+) oluşturulmamış." }
$j = [IO.File]::ReadAllText($kayitYolu) | ConvertFrom-Json
$eskiEkler = @($j.ekler | Where-Object { $_ })
$tumEkler = @(@($eskiEkler) + @($Ekler) | Where-Object { $_ } | Select-Object -Unique)
$kayit = [ordered]@{}
foreach ($p in $j.dosyalar.PSObject.Properties) { $kayit[$p.Name] = $p.Value }

$harita = Get-Harita $j.tip $tumEkler
$eklenen = @(); $guncellenen = @(); $cakisan = @(); $kaldirilan = @()

foreach ($rel in $harita.Keys) {
    $kaynak = $harita[$rel]
    $hedef = Join-Path $Proje $rel
    $kaynakHash = Get-Hash $kaynak

    if (-not (Test-Path -LiteralPath $hedef)) {
        if ($kayit.Contains($rel)) { continue } # kullanıcı bilerek silmiş, geri getirme
        Copy-Dosya $kaynak $hedef; $kayit[$rel] = $kaynakHash; $eklenen += $rel
        continue
    }
    if (-not (Test-KitDosyasi $rel)) { continue }

    $hedefHash = Get-Hash $hedef
    if ($hedefHash -eq $kaynakHash) { $kayit[$rel] = $kaynakHash; continue }
    if ($kayit.Contains($rel) -and $kaynakHash -eq $kayit[$rel]) { continue } # kit değişmemiş, kullanıcı değiştirmiş
    if ($kayit.Contains($rel) -and $hedefHash -eq $kayit[$rel]) {
        Copy-Dosya $kaynak $hedef; $kayit[$rel] = $kaynakHash; $guncellenen += $rel
    } else {
        Copy-Dosya $kaynak "$hedef.yeni"; $cakisan += $rel # ikisi de değişmiş: kullanıcının dosyasına dokunma
    }
}
Add-EkParcalari $Proje @($Ekler | Where-Object { $_ -notin $eskiEkler })
foreach ($rel in @($kayit.Keys)) {
    if (-not $harita.Contains($rel) -and (Test-KitDosyasi $rel)) { $kaldirilan += $rel }
}
Save-Kayit $Proje $j.tip $tumEkler $j.olusturma $kayit

Write-Host "Kit $($j.surum) -> $surum"
if ($eklenen) { Write-Host "Eklenen ($($eklenen.Count)):`n  $($eklenen -join "`n  ")" }
if ($guncellenen) { Write-Host "Güncellenen ($($guncellenen.Count)):`n  $($guncellenen -join "`n  ")" }
if ($cakisan) { Write-Host "Çakışma ($($cakisan.Count)) — senin değişikliğin korundu, kitin yeni hali yanına .yeni olarak kondu; karşılaştırıp birleştir, sonra .yeni dosyasını sil:`n  $($cakisan -join "`n  ")" }
if ($kaldirilan) { Write-Host "Kitten kaldırılmış (projede duruyor, istersen sil):`n  $($kaldirilan -join "`n  ")" }
if (-not ($eklenen -or $guncellenen -or $cakisan -or $kaldirilan)) { Write-Host 'Değişiklik yok.' }
Write-Host "Kitteki değişiklikler: $(Join-Path $PSScriptRoot 'CHANGELOG.md'). CLAUDE.md ve STACK.md gibi projeye ait dosyalara oradan bakarak elle uyarla."
