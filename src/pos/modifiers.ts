// Modifier choices come from the customer menu text. The BLUU modifier screen
// itself was not in the reference photos, so its layout is approximated.
const BIBIMBAP = ['BEEF', 'CHICKEN', 'TOFU', 'VEGETABLES', 'SPICY PORK'];
const SOON_TOFU = ['ASSORTED', 'SEAFOOD', 'VEGETABLES'];
const DRAFTS = ['COORS LIGHT', 'ASAHI', 'SAPPORO', 'BLUE MOON', 'SAMUEL ADAMS', 'LAGUNITAS IPA', 'FAT TIRE', 'SIERRA NEVADA'];

export function modifierOptions(posId: string): string[] | null {
  if (posId.startsWith('bibimbap-')) return BIBIMBAP;
  if (posId.startsWith('soon-tofu-')) return SOON_TOFU;
  if (posId === 'ultimate-w-beer') return DRAFTS;
  return null;
}
