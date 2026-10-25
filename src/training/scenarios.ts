import scenarioData from '../data/scenarios.json';
import type { Scenario } from './types';

export const scenarios = scenarioData.scenarios as unknown as Scenario[];
