// EXAMPLE_DATA for the family-office demo: the K-1s of an invented office.
// Every name, number and ID comes from k1-data.json and is made up. The page
// images and field positions are drawn from the same file by
// scripts/k1-pdfs.mjs.
import type { ReviewField } from '../lib/types';
import type { ExampleDocument } from './fixtures';
import data from './k1-data.json';
import placed from './k1-boxes.json';
import { k1Truth, type K1Entity, type K1Row } from './k1-fields';

export const K1 = data;
const rows = data.k1s as unknown as (K1Row & { received: string | null })[];
const places = placed as unknown as Record<string, { pages: number; boxes: Record<string, number[]> }>;
const REFERENCE = ['records', 'prior', 'estimate'];
const asset = (name: string) => `${import.meta.env.BASE_URL}k1/${name}`;
const today = Date.parse(`${data.today}T15:00:00Z`);

export function k1Documents(): ExampleDocument[] {
  return rows.filter((r) => r.doc).map((r) => {
    const doc = r.doc!;
    const entity = (data.entities as Record<string, K1Entity>)[r.entity];
    const done = r.slug === 'permian';
    const fields: ReviewField[] = k1Truth(r, entity).map((t, i) => {
      const reference = REFERENCE.includes(t.group);
      const wrong = doc.misreads?.[`${t.group}.${t.key}`];
      const at = places[r.slug].boxes[`${t.group}.${t.key}`];
      const approved = !reference && (done || doc.started?.includes(t.group));
      return {
        ...t, id: `f${i}`, row: null, original: null, value: wrong?.value ?? t.value,
        confidence: reference ? null : wrong?.confidence ?? 0.965 + ((i * 37) % 30) / 1000,
        page: at ? at[0] : null, ...(at ? { box: at.slice(1) as ReviewField['box'] } : {}),
        ...(approved ? { approvedByName: 'Priya Raman', approvedAt: new Date(today - (done ? 8 : 2) * 864e5).toISOString() } : {}),
      };
    });
    return {
      slug: r.slug, template: 'k1', title: `K-1, ${r.investment}`, subject: entity.name, period: `Tax year ${data.taxYear}`,
      hoursAgo: Math.round((today - Date.parse(`${r.received}T15:00:00Z`)) / 36e5), fields, pages: [],
      images: { pdfUrl: asset(`${r.slug}.pdf`), pages: Array.from({ length: places[r.slug].pages }, (_, i) => ({ page: i + 1, src: asset(`${r.slug}-${i + 1}.png`) })) },
      ...(done ? { decided: { status: 'approved' as const, by: 'Priya Raman' } } : {}),
    };
  });
}
