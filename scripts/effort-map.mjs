// Client effort levels -> the levels each upstream model actually declares.
//
// Both clients always offer five levels. DeepSeek and GLM declare only
// low/high/max, so medium/xhigh have to resolve to the nearest declared level:
// medium -> low, xhigh -> high. Sending an undeclared spelling risks a 400 and
// silently pretending it worked hides that the two levels are cap aliases.
export const CLIENT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
export const EFFORTS = {
  'deepseek-v4.1-flash': ['low', 'high', 'max'],
  'minimax-m3.1-flash': CLIENT_LEVELS,
  'glm-5.3-flashx': ['low', 'high', 'max'],
};
// Upstream defaultEffort from the account catalog: a fresh thread's level.
export const DEFAULT_EFFORT = {
  'deepseek-v4.1-flash': 'high',
  'minimax-m3.1-flash': 'max',
  'glm-5.3-flashx': 'high',
};

const nearest = (level, declared) => {
  if (!CLIENT_LEVELS.includes(level)) return undefined;
  if (declared.includes(level)) return level;
  const target = CLIENT_LEVELS.indexOf(level);
  return declared.reduce((best, candidate) => {
    const a = Math.abs(CLIENT_LEVELS.indexOf(candidate) - target);
    const b = Math.abs(CLIENT_LEVELS.indexOf(best) - target);
    return a < b || (a === b && CLIENT_LEVELS.indexOf(candidate) < CLIENT_LEVELS.indexOf(best)) ? candidate : best;
  });
};

/** Rank of a client level, for comparing picks against a ceiling. */
export function levelIndex(level) { return CLIENT_LEVELS.indexOf(level); }

/** Nearest declared level. Ties go to the cheaper level. */
export function mapEffort(model, level) {
  const declared = EFFORTS[model];
  if (!declared) return level;
  return nearest(level, declared);
}
