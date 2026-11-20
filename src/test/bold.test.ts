import { describe, expect, it } from 'vitest';
import { boldParts } from '../training/ScenarioPanel';

describe('guest lines: bold items and numbers', () => {
  it('bolds short names guests use and quantities', () => {
    expect(boldParts('Last round for us: one spicy pork and one pork jowl.')).toEqual(['one', 'spicy pork', 'one', 'pork jowl']);
    expect(boldParts('Two vanilla and one mango, please. Here\'s $20 in cash.')).toEqual(['Two', 'vanilla', 'one', 'mango', '$20']);
    expect(boldParts('Next round: two spicy pork bulgogis and a shrimp.')).toContain('spicy pork bulgogis');
  });
});
