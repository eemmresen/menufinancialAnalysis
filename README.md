# momo · Kafe Maliyet ve Kârlılık Analizi

Tek kullanıcılı, tamamen tarayıcıda çalışan kafe maliyet analizi uygulaması. Backend, veritabanı
sunucusu, API anahtarı, yapay zekâ veya harici OCR servisi kullanmaz. Tüm hesaplamalar deterministik
formüllerle, tüm veriler IndexedDB'de saklanır.

## Özellikler

| Modül | Kapsam |
|---|---|
| Hammaddeler | Alış miktarı/birimi/fiyatı, KDV, tedarikçi, fire, paket tanımı, alış geçmişi |
| Ürünler | Reçete, satış fiyatı, satış KDV'si, ürün fire oranı, ambalaj, işçilik, komisyon, görsel |
| Faturalar | PDF metin çıkarma, yerel Türkçe OCR, onay ekranı, mükerrer dosya kontrolü |
| Giderler | Sabit/değişken giderler, aylık ve yıllık özet |
| Satışlar | Aylık ürün adetleri ve ciro; gerçekleşen sonuçların temeli |
| Raporlar | Maliyet dökümü, gider dağıtımı, KDV özeti, dönem kapatma, Excel, yazdırma |
| Simülasyon | Dört fiyat senaryosu, başabaş ve hedef marj fiyatı, fiyatı ürüne uygulama |
| Panel | 8 özet kartı, 5 grafik, veri kalitesi kontrol listesi |
| Ayarlar | KDV oranları, hedef marj, işçilik, yuvarlama, JSON yedek/geri yükleme, sıfırlama |

## Kurulum

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ üretir
npm run preview    # dist/ sunucusu
```

İlk açılışta menüden alınan ürün adları/fiyatları ve **örnek** malzeme alış fiyatları yüklenir.
Ekranın üstündeki “Örnek veri yüklü” bandı bunu belirtir. Ayarlar > Veri yönetimi'nden örnek veriler
kaldırılabilir; kendi kayıtlarınız korunur.

### Çevrimdışı kullanım

Derleme çıktısı statik dosyalardan oluşur. Uygulama yüklendikten sonra internet gerekmez; OCR
(`public/ocr/tur.traineddata.gz`) ve PDF worker dosyaları da yereldir. Yeni bir oturumda açmak için
dosyaları bir web sunucusundan (ör. `npm run preview`) sunmanız yeterlidir.

## Testler

```bash
npm test            # birim testleri (Vitest)
npm run typecheck   # TypeScript kontrolü
```

Kapsanan başlıklar:

- Birim dönüşümleri (kg/g, L/ml, adet, paket), uyumsuz birim hataları
- KDV dahil/hariç dönüşümleri (%0, %10, %20)
- Reçete maliyeti, malzeme ve ürün fire oranları
- Değişken maliyet, katkı payı, genel gider payı, faaliyet kârı
- Başabaş fiyat ve hedef marj fiyatı doğrulaması
- Gider dağıtımı (adet ve ağırlık), komisyon hariç tutma
- Başabaş satış miktarı (satış karmasına göre)
- Fiyat simülasyonu ve fiyat yuvarlama
- Fatura metni ayrıştırma (Türkçe sayı biçimi dahil)
- JSON yedekleme/geri yükleme, birleştirme, bozuk yedek reddi, örnek veri temizliği

Uçtan uca kontrol (isteğe bağlı; Edge veya Chrome kurulu olmalı):

```bash
npm run preview
# ayrı terminalde:
npm run smoke
```

`scripts/smoke.mjs` tüm ekranları gezer; malzeme ekleme, fiyat değişiminin ürün maliyetine yansıması,
satış kaydı, Excel indirme, fatura onayı, OCR ve JSON yedek indirmeyi doğrular. Ekran görüntüleri
`artifacts/` altına yazılır.

## Mimari

```
src/
  app/            yönlendirme, yerleşim, hata sınırı
  components/ui/  Button, Field, Modal, Card, Badge, Toast, PeriodSelect
  db/             Dexie şeması, repository'ler, örnek veri, JSON yedekleme
  engine/         saf hesaplama fonksiyonları + birim testleri
  features/       dashboard, materials, products, invoices, expenses, sales,
                  reports, simulation, settings
  lib/            tarih, biçim, kimlik, görsel, hash, pdf, OCR, Excel, fatura ayrıştırma
```

Hesaplamalar arayüzden bağımsızdır: `engine` modülleri yalnızca veri alır, sonuç döndürür.

## Hesaplama formülleri

- `net gelir = KDV dahil fiyat / (1 + KDV)`
- `malzeme maliyeti = miktar × birim fiyat`; fire: `maliyet / (1 − fire oranı)`
- `komisyon = net gelir × komisyon oranı`
- `değişken maliyet = malzeme(fire dahil) + ambalaj + işçilik + komisyon`
- `katkı payı = net gelir − değişken maliyet`
- `genel gider payı = dağıtılan dönem gideri / satılan adet` (veya ürün ağırlığı)
- `faaliyet kârı = katkı payı − genel gider payı`
- `başabaş fiyat = (malzeme + ambalaj + işçilik + gider payı) / (1 − komisyon)`
- `hedef fiyat = (malzeme + ambalaj + işçilik + gider payı) / (1 − komisyon − hedef marj)`
- `başabaş adet = aylık sabit gider / ağırlıklı ortalama katkı payı`

Başabaş adet yalnızca **sabit** giderleri kullanır; değişken giderler birim maliyetin içindedir.
Dağıtım yöntemi ve varsayımı rapor ekranında açıkça yazılır.

## Geçmiş koruma

- Her fiyat değişikliği `materialLots` tablosuna ayrı alış kaydı olarak yazılır.
- Her kayıt KDV oranını kendi üzerinde taşır; oran ayarları sonradan değişse bile eski kayıt etkilenmez.
- Dönem kapatıldığında ürün maliyetleri `snapshots` tablosuna dondurulur.
- Panel ve ürün maliyetleri **güncel** fiyatlara göre tahminidir; gerçekleşen sonuçlar satış
  kayıtlarından ve dönem giderlerinden hesaplanır.

## Bilinçli sınırlamalar

- Uygulama resmî muhasebe/beyanname sistemi değildir. KDV dışındaki vergiler yalnızca seçilen oranla
  yapılan tahmini provizyondur.
- Fatura ayrıştırma “en iyi çaba”dır; her fatura düzeni farklıdır. Onay ekranı zorunludur ve tüm
  alanlar elle düzeltilebilir.
- Örnek malzeme fiyatları gerçek tedarikçi fiyatı değildir. Menü fiyatları momo menüsünden alınmıştır.
- PDF rapor çıktısı kapsam dışıdır; tarayıcının “Yazdır → PDF olarak kaydet” özelliği kullanılabilir.
- Tarayıcı verileri temizlenirse IndexedDB kayıtları da silinir. Düzenli JSON yedeği alın.
