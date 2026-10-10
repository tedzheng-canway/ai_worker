// Shared with coworker/tools/ask.py. A skip is distinct from an empty answer.
export const SKIP_SENTINEL = '__ocw_skip__';
export const questionKey = question => question.header || question.question;
export function skipRemaining(specs, answers) {
  return Object.fromEntries(specs.map(spec => [questionKey(spec), answers[questionKey(spec)] ?? SKIP_SENTINEL]));
}
export function resolutionLabel(resolution, translate = value => value) {
  if (resolution === SKIP_SENTINEL) return translate('已跳过');
  try {
    const answers = JSON.parse(resolution);
    if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
      return Object.entries(answers).map(([key, value]) => `${key}: ${value == null || value === SKIP_SENTINEL ? translate('已跳过') : value}`).join('；');
    }
  } catch { /* plain single answer */ }
  return resolution || translate('已提交');
}
