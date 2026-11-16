/**
 * Transaction tags / categories for expense tracking.
 */
export const TRANSACTION_TAGS = [
  { id: 'Food', label: 'Food', icon: '🍽️' },
  { id: 'Groceries', label: 'Groceries', icon: '🛒' },
  { id: 'Transport', label: 'Transport', icon: '🚗' },
  { id: 'Home', label: 'Home', icon: '🏠' },
  { id: 'Travel', label: 'Travel', icon: '✈️' },
  { id: 'Shopping', label: 'Shopping', icon: '🛍️' },
  { id: 'Other', label: 'Other', icon: '🏷️' },
];

/**
 * Combines a category tag and an optional custom comment into a formatted note string.
 * Examples:
 *   formatNoteWithTag('Food', 'Dinner with team') => 'Food • Dinner with team'
 *   formatNoteWithTag('Food', '')                => 'Food'
 *   formatNoteWithTag(null, 'Dinner with team')  => 'Dinner with team'
 */
export const formatNoteWithTag = (tag, comment) => {
  const cleanTag = (tag || '').trim();
  const cleanComment = (comment || '').trim();
  if (cleanTag && cleanComment) {
    return `${cleanTag} • ${cleanComment}`;
  }
  if (cleanTag) return cleanTag;
  return cleanComment || null;
};

/**
 * Parses a raw note string into its tag (if any) and remaining comment.
 * Accurately recognizes tags whether written as:
 *   - "Food"
 *   - "Food • Dinner"
 *   - "[Food] Dinner"
 *   - "Food: Dinner"
 *   - "🍽️ Food • Dinner"
 */
export const parseNoteTag = (rawNote) => {
  if (!rawNote || typeof rawNote !== 'string') {
    return { tag: null, tagInfo: null, comment: '' };
  }
  const trimmed = rawNote.trim();

  for (const item of TRANSACTION_TAGS) {
    // 1. Matches "Food • comment", "Food: comment", "[Food] comment", or with icon "🍽️ Food • comment"
    const regex = new RegExp(
      `^(?:\\[?(?:${item.icon}\\s*)?${item.id}\\]?)(?:\\s*[•:\\-]\\s*|\\s+)(.*)$`,
      'i'
    );
    const match = trimmed.match(regex);
    if (match) {
      return {
        tag: item.id,
        tagInfo: item,
        comment: (match[1] || '').trim(),
      };
    }

    // 2. Exact match for the tag by itself
    if (
      trimmed.toLowerCase() === item.id.toLowerCase() ||
      trimmed.toLowerCase() === `${item.icon} ${item.id}`.toLowerCase() ||
      trimmed.toLowerCase() === `[${item.id}]`.toLowerCase()
    ) {
      return {
        tag: item.id,
        tagInfo: item,
        comment: '',
      };
    }
  }

  // No known tag matched; whole string is treated as a free-form comment
  return { tag: null, tagInfo: null, comment: trimmed };
};
