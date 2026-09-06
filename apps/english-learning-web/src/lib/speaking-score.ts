/** Normalize a line into comparison words: lowercase, punctuation stripped. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter(w => w !== '')
}

/** Word-level Levenshtein distance between two word lists. */
function levenshtein(a: string[], b: string[]): number {
  let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const currentRow: number[] = [i]
    for (let j = 1; j <= b.length; j++) {
      const aboveLeft = previousRow[j - 1]
      const above = previousRow[j]
      const left = currentRow[j - 1]
      currentRow[j] = Math.min(
        (above ?? Number.MAX_SAFE_INTEGER) + 1,
        (left ?? Number.MAX_SAFE_INTEGER) + 1,
        (aboveLeft ?? Number.MAX_SAFE_INTEGER) + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    previousRow = currentRow
  }
  return previousRow[b.length] ?? Number.MAX_SAFE_INTEGER
}

/**
 * Similarity between the recognized transcript and the target line as 0-100,
 * from word-level edit distance over the longer of the two word lists. 100
 * means every word matches in order.
 */
export function similarityScore(target: string, spoken: string): number {
  const targetWords = words(target)
  const spokenWords = words(spoken)
  if (targetWords.length === 0 && spokenWords.length === 0) return 100
  if (targetWords.length === 0 || spokenWords.length === 0) return 0
  const distance = levenshtein(targetWords, spokenWords)
  return Math.max(0, Math.round((1 - distance / Math.max(targetWords.length, spokenWords.length)) * 100))
}

/** Score at or above which a repeated line counts as correct for the progress record. */
export const SPEAKING_PASS_SCORE = 60
