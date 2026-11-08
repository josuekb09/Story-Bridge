export function editAiTranslationDraft(state, text) {
  return { ...state, translation: text, translationApproved: false };
}

export function translationApprovalCanContinue({ translationOrigin, translationApproved, translation }) {
  return !['ai_draft', 'ai_approved'].includes(translationOrigin) || (translationApproved === true && Boolean(translation?.trim()));
}
