# Spec: [task code or short bug name] [title]

> Copy to: `docs/product/specs/<task code>.md`. `/plan-task` writes a feature spec for work on 3+ files, `/fix-bug` writes a bug spec for every bug; small work has no spec.
> The "behavior that must not change" lines start with an acceptance criterion id (`- Ö-01.1: ...`). The gate (`gate.mjs --run`) goes red if these ids have no test or if they are red in the last test report.
> The gate reads only the test report written in its own run; if the test command writes no JUnit report, it only checks that the test exists.
> If you change behavior on purpose or change a criterion id, update this file first; if the spec is no longer valid, move it to `docs/archive/`.
> The labels, values and one heading below stay Turkish because the dashboard reads them. Tür = type (özellik = feature, hata = bug), Sınıf = class, Kural = rule, "Değişmemesi gereken davranış" = behavior that must not change. Bug classes: boş-girdi = empty input, doğrulama = validation, yetki = authorization, tarih-saat = date-time, yerel-dil = locale, sıralama = ordering, eşzamanlılık = concurrency, yapılandırma = configuration, dış-servis = external service, sözleşme = contract, arayüz-durumu = UI state, diğer = other.

**Tür:** [özellik / hata]
**Sınıf:** [bug only: boş-girdi / doğrulama / yetki / tarih-saat / yerel-dil / sıralama / eşzamanlılık / yapılandırma / dış-servis / sözleşme / arayüz-durumu / diğer]
**Kural:** [bug only, written by `/fix-bug` when the same class repeats: where the added rule is, or "gerek yok" (not needed) · YYYY-AA-GG]

## Current behavior

[What happens now. For a bug: the reproduction steps and the result seen.]

## Expected behavior

[What should happen after the work. Write it measurably; if there is an acceptance criterion, give its id (`Ö-03.1`).]

## Değişmemesi gereken davranış

- [Ö-01.1: This work must not break it; a criterion that has an id and a test]
