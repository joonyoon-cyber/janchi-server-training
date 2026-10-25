import posMenu from '../data/posMenu.json';
import customerMenu from '../data/customerMenu.json';
import menuMapping from '../data/menuMapping.json';
import tables from '../data/tables.json';
import type { CustomerMenuItem, MenuMapping, PosCategory, PosItem, SectionDef } from './types';

export const GRID_COLUMNS = posMenu.gridColumns;
export const GRID_ROWS = posMenu.gridRows;

export const categories: PosCategory[] = posMenu.categories;
export const posItems: PosItem[] = posMenu.items as PosItem[];
export const customerItems: CustomerMenuItem[] = customerMenu.items as CustomerMenuItem[];
export const mappings: MenuMapping[] = menuMapping.mappings as MenuMapping[];
export const sections: SectionDef[] = tables.sections as SectionDef[];

const byId = new Map(posItems.map((i) => [i.id, i]));
const categoryById = new Map(categories.map((c) => [c.id, c]));

export function posItem(id: string): PosItem {
  const item = byId.get(id);
  if (!item) throw new Error(`Unknown POS item: ${id}`);
  return item;
}

export function category(id: string): PosCategory {
  const c = categoryById.get(id);
  if (!c) throw new Error(`Unknown category: ${id}`);
  return c;
}

export function itemsInCategory(categoryId: string, page = 1): PosItem[] {
  return posItems.filter((i) => i.category === categoryId && i.page === page);
}

export function allTables() {
  return sections.flatMap((s) => s.tables.map((t) => ({ ...t, section: s.id })));
}

export function sectionOfTable(tableId: string): string | undefined {
  return sections.find((s) => s.tables.some((t) => t.id === tableId))?.id;
}

export function tableLabel(tableId: string): string {
  return allTables().find((t) => t.id === tableId)?.label ?? tableId;
}

export function isMeat(posId: string): boolean {
  return !!byId.get(posId)?.countsAsMeat;
}

const AYCE_PACKAGE_IDS = new Set([
  'premium-ayce-lunch',
  'premium-ayce-dinner',
  'premium-5-8',
  'premium-9-12',
  'ultimate-ayce',
  'ultimate-5-8',
  'ultimate-9-12',
]);

export function isAycePackage(posId: string): boolean {
  return AYCE_PACKAGE_IDS.has(posId);
}

/** Customer-facing mapping for a POS item, used by Practice-mode help. */
export function mappingsForPos(posId: string): MenuMapping[] {
  return mappings.filter((m) => m.posId === posId);
}
