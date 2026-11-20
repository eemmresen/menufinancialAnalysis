import { describe, expect, it } from 'vitest';
import { parseInvoiceText, parseTrNumber } from '@/lib/invoiceParser';

const SAMPLE = `PETRA ROASTING CO. GIDA TİC. A.Ş.
Petra Kahve Dünyası
Fatura Tarihi: 12.10.2026
Fatura No: PRT2026000123
Vergi No: 1234567890

Açıklama Miktar Birim Fiyat Tutar
Espresso Çekirdeği 2 kg 450,00 900,00
Süt 10 lt 42,00 420,00
Filtre Kahve Çekirdeği 2 kg 400,00 800,00

Ara Toplam 2.120,00
Toplam KDV 264,00
Genel Toplam 2.384,00`;

describe('fatura metni ayrıştırma', () => {
  it('Türkçe sayı biçimini okur', () => {
    expect(parseTrNumber('1.234,56')).toBeCloseTo(1234.56, 2);
    expect(parseTrNumber('450,00')).toBeCloseTo(450, 2);
    expect(parseTrNumber('1.500')).toBeCloseTo(1500, 2);
    expect(parseTrNumber('12.5')).toBeCloseTo(12.5, 2);
  });

  it('tedarikçi, tarih, toplam ve kalemleri çıkarır', () => {
    const result = parseInvoiceText(SAMPLE);
    expect(result.supplierName).toContain('PETRA');
    expect(result.date).toBe('2026-10-12');
    expect(result.totalGross).toBeCloseTo(2384, 2);
    expect(result.vatTotal).toBeCloseTo(264, 2);
    expect(result.lines.length).toBe(3);

    const espresso = result.lines.find((l) => l.description.includes('Espresso'));
    expect(espresso).toBeTruthy();
    expect(espresso!.qty).toBe(2);
    expect(espresso!.unit).toBe('kg');
    expect(espresso!.unitPrice).toBeCloseTo(450, 2);
  });

  it('boş metinde uyarı döndürür', () => {
    const result = parseInvoiceText('');
    expect(result.lines).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.totalGross).toBe(0);
  });

  it('toplam ve KDV satırlarını kalem olarak eklemez', () => {
    const result = parseInvoiceText(SAMPLE);
    expect(result.lines.some((l) => /toplam|kdv/i.test(l.description))).toBe(false);
  });

  it('okunamayan belgeyi çökmeden işler', () => {
    const result = parseInvoiceText('%%% --- ... 123 456');
    expect(result.totalGross).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.lines)).toBe(true);
  });

  it('satır toplamı olmayan iki sayılı kalemi miktar + birim fiyat olarak okur', () => {
    const result = parseInvoiceText(
      'KAHVE DÜNYASI LTD\nFatura Tarihi: 01.11.2026\nEspresso 2 kg 450,00\nTOPLAM 900,00',
    );
    const line = result.lines.find((l) => l.description.includes('Espresso'));
    expect(line).toBeTruthy();
    expect(line!.qty).toBe(2);
    expect(line!.unitPrice).toBeCloseTo(450, 2);
    expect(line!.unit).toBe('kg');
  });
});
