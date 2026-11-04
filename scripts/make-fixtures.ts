/**
 * Renders the fictional persona documents to PDFs under fixtures/<persona>/.
 * Every page carries a "FICTIONAL SAMPLE" footer.
 *
 *   npm run fixtures
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PERSONAS } from './fixtures/personas';

const OUT = path.resolve('fixtures');
const PAGE = { w: 612, h: 792, margin: 64 };

function wrap(text: string, font: import('pdf-lib').PDFFont, size: number, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

async function main() {
  await fs.rm(OUT, { recursive: true, force: true });
  const manifest: Record<string, unknown> = {};
  for (const p of PERSONAS) {
    const dir = path.join(OUT, p.key);
    await fs.mkdir(dir, { recursive: true });
    for (const d of p.docs) {
      const pdf = await PDFDocument.create();
      pdf.setTitle(d.title);
      pdf.setAuthor('PetitionPilot demo fixtures (fictional)');
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      for (const paras of d.pages) {
        const page = pdf.addPage([PAGE.w, PAGE.h]);
        let y = PAGE.h - PAGE.margin;
        paras.forEach((para, i) => {
          const f = i === 0 ? bold : font;
          const size = i === 0 ? 13 : 11;
          for (const line of wrap(para, f, size, PAGE.w - PAGE.margin * 2)) {
            page.drawText(line, { x: PAGE.margin, y, size, font: f });
            y -= size * 1.45;
          }
          y -= 8;
        });
        page.drawText('FICTIONAL SAMPLE DOCUMENT - generated for the PetitionPilot demo. Not a real record.', {
          x: PAGE.margin,
          y: 36,
          size: 8,
          font,
          color: rgb(0.55, 0.1, 0.1),
        });
      }
      const file = path.join(dir, `${d.label}-${d.slug}.pdf`);
      await fs.writeFile(file, await pdf.save());
    }
    manifest[p.key] = { beneficiary: p.beneficiary, docs: p.docs.map((d) => `${d.label}-${d.slug}.pdf`) };
  }
  await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Wrote fixtures for ${PERSONAS.length} fictional applicants to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
