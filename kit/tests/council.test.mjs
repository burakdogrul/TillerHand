// Çalıştır: node --test "kit/tests/*.test.mjs"
// Konsey sayımı: anonim sıralama, bulgu oyları, karar konseyi oy dağılımı, tutanağa yazma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siralamaAyikla, oylariAyikla, say, tutanagaYaz } from '../../.claude/hooks/council.mjs';

const TOPLANTI = `# Konsey: plan · G-012 kayıt formu
**Tarih:** 2026-10-12 · **Tür:** plan

## 1. İlk görüşler

### Görüş A
- A1 [KRİTİK] api/kayit.ts:12 — e-posta doğrulanmadan hesap aktif — doğrulama ekle
- A2 [ÖNERİ] form metni uzun

### Görüş B
- B1 [ÖNEMLİ] RLS politikası yok — politika ekle

### Görüş C
Bulgu yok.

## 2. Çapraz inceleme

### İnceleyen: A
B, C'den daha somut.
OYLAR:
B1: DOĞRU
SIRALAMA:
1. Görüş B
2. Görüş C

### İnceleyen: B
OYLAR:
A1: ABARTILI
A2: doğru
SIRALAMA:
1. Görüş A
2. Görüş C

### İnceleyen: C
OYLAR:
- A1: YANLIŞ
- B1: DOĞRU
SIRALAMA:
1. Görüş B
2. Görüş A

## 4. Başkan kararı
**Karar:** KOŞULLU ONAY
`;

test('konsey: sıralama ve oy ayıklama (Karpathy biçimi, Türkçe)', () => {
  assert.deepEqual(siralamaAyikla('Görüş A iyi.\nSIRALAMA:\n1. Görüş C\n2. Görüş A\n'), ['C', 'A']);
  assert.deepEqual(siralamaAyikla('Görüş B, Görüş A\'dan iyi'), [], 'SIRALAMA yoksa düzyazıdan sıra çıkarılmaz');
  assert.deepEqual(siralamaAyikla('SIRALAMA:\n1. **Görüş B**\n2. Görüş A'), ['B', 'A'], 'kalın yazım');
  const s = say('## 1. İlk görüşler\n### Görüş A\nÖNERİ: $& planı\n### Görüş B\nÖNERİ: $$ 25/ay\n## 2. Çapraz inceleme\n### İnceleyen: A\nGörüş B iyi.\n### İnceleyen: B\nSIRALAMA:\n1. Görüş A\n## 4. Başkan kararı\n');
  assert.deepEqual(s.gecersiz, ['A']);
  const yazilan = tutanagaYaz('## 4. Başkan kararı\n', s);
  assert.match(yazilan, /\| \$& planı \| 1 \|[\s\S]*\| \$\$ 25\/ay \| 1 \|/, '$ dizileri olduğu gibi yazılır');
  assert.equal(tutanagaYaz(yazilan, s), yazilan);
  assert.deepEqual(oylariAyikla('OYLAR:\nA1: doğru\n- B2 = ABARTILI\nSIRALAMA:\n1. Görüş A'), { A1: 'DOĞRU', B2: 'ABARTILI' });
});

test('konsey: toplu sıralama, tartışmalı kritik bulgu, uzlaşma', () => {
  const s = say(TOPLANTI);
  assert.equal(s.inceleyenSayisi, 3);
  assert.deepEqual(s.siralama.map((r) => [r.gorus, r.ortalama, r.oy]), [['B', 1, 2], ['A', 1.5, 2], ['C', 2, 2]]);
  const a1 = s.bulgular.find((f) => f.id === 'A1');
  assert.equal(a1.onem, 'KRİTİK');
  assert.equal(a1.tartismali, true);
  assert.equal(s.bulgular.find((f) => f.id === 'B1').tartismali, false);
  assert.equal(s.uzlasma, 60, '5 oydan 3 doğru');
  const yazilan = tutanagaYaz(TOPLANTI, s);
  assert.match(yazilan, /## 3\. Toplu sıralama[\s\S]*\| A1 \| KRİTİK \| 0 \| 1 \| 1 \| tartışmalı · kullanıcıya sor \|[\s\S]*## 4\. Başkan kararı/);
  assert.equal(tutanagaYaz(yazilan, s), yazilan, 'tekrar çalıştırmak bölümü çoğaltmaz');
});

test('konsey: karar konseyinde seçenek oyları uzlaşmayı belirler', () => {
  const metin = `## 1. İlk görüşler\n### Görüş A\nÖNERİ: Supabase\n### Görüş B\nÖNERİ: Supabase\n### Görüş C\nÖNERİ: Neon\n## 2. Çapraz inceleme\n### İnceleyen: A\nSIRALAMA:\n1. Görüş B\n2. Görüş C\n`;
  const s = say(metin);
  assert.deepEqual(s.secenekler, [{ secenek: 'Supabase', oy: 2 }, { secenek: 'Neon', oy: 1 }]);
  assert.equal(s.uzlasma, 67);
});

test('konsey: pano tutanağı okur (karar, uzlaşma, kimlikli sıralama); ajanlar tanımlı', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { konseyTutanaklari } = await import('../../.claude/hooks/dashboard-data.mjs');
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'konsey-'));
  assert.deepEqual(konseyTutanaklari(p), []);
  fs.mkdirSync(path.join(p, 'docs/workflow/council'), { recursive: true });
  const s = say(TOPLANTI);
  const tutanak = `${tutanagaYaz(TOPLANTI, s).replace('**Karar:** KOŞULLU ONAY', '**Karar:** KOŞULLU ONAY\n**Elenen:** 1')}\n## Kimlikler\nA = board-architect (sonnet) · B = security-auditor (sonnet) · C = board-product (haiku)\n`;
  fs.writeFileSync(path.join(p, 'docs/workflow/council/2026-10-12-plan-kayit.md'), tutanak);
  const [k] = konseyTutanaklari(p);
  assert.equal(k.konu, 'plan · G-012 kayıt formu');
  assert.equal(k.tur, 'plan');
  assert.equal(k.karar, 'KOŞULLU ONAY');
  assert.equal(k.uzlasma, 60);
  assert.equal(k.tartismali, 1);
  assert.equal(k.elenen, 1);
  assert.deepEqual(k.siralama[0], { gorus: 'B', kim: 'security-auditor (sonnet)', ortalama: '1' });
  const { fileURLToPath } = await import('node:url');
  const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  for (const [ajan, model] of [['board-chair', 'opus'], ['council-advisor', 'sonnet']]) {
    assert.match(fs.readFileSync(path.join(kok, `.claude/agents/${ajan}.md`), 'utf8'), new RegExp(`^model: ${model}$`, 'm'), ajan);
  }
});
