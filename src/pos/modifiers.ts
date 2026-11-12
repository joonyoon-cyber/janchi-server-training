// Modifier groups from the BLUU back-office modifier screens (11/2026).
// Each group needs one choice; the colors match the real modifier buttons.
export interface ModifierGroup {
  name: string;
  color: string;
  options: string[];
}

const SPICE: ModifierGroup = { name: 'Spice level', color: '#e8b2b0', options: ['NO SPICY', 'MILD', 'MEDIUM', 'SPICY', 'VERY SPICY'] };
const SOON_TOFU_PROTEIN: ModifierGroup = { name: 'Protein', color: '#82cba8', options: ['ASSORTED', 'BEEF', 'SEAFOOD', 'VEGI'] };
const BIBIMBAP_PROTEIN: ModifierGroup = { name: 'Protein', color: '#ffffff', options: ['BEEF', 'CHICKEN', 'TOFU', 'VEGI', 'SPICY PORK'] };
// Not yet verified on the POS: the draft beer choices are a guess.
const DRAFTS: ModifierGroup = { name: 'Draft beer (unverified)', color: '#ffffff', options: ['COORS LIGHT', 'ASAHI', 'SAPPORO', 'BLUE MOON', 'SAMUEL ADAMS', 'LAGUNITAS IPA', 'FAT TIRE', 'SIERRA NEVADA'] };

export function modifierGroups(posId: string): ModifierGroup[] | null {
  if (posId.startsWith('bibimbap-')) return [BIBIMBAP_PROTEIN];
  if (posId.startsWith('soon-tofu-')) return [SPICE, SOON_TOFU_PROTEIN];
  if (posId === 'ultimate-w-beer') return [DRAFTS];
  return null;
}
