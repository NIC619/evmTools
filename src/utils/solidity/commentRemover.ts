/**
 * Removes comments from Solidity source code while preserving string literals.
 * Handles both single-line and multi-line comments.
 *
 * @param source The Solidity source code
 * @returns The source code with comments removed
 */
export function removeComments(source: string): string {
  let result = ''
  let i = 0

  while (i < source.length) {
    const char = source[i]
    const nextChar = source[i + 1]

    // Handle string literals (single quotes)
    if (char === "'") {
      result += char
      i++
      while (i < source.length) {
        const strChar = source[i]
        result += strChar
        // Handle escaped quotes
        if (strChar === '\\' && i + 1 < source.length) {
          result += source[i + 1]
          i += 2
          continue
        }
        if (strChar === "'") {
          i++
          break
        }
        i++
      }
      continue
    }

    // Handle string literals (double quotes)
    if (char === '"') {
      result += char
      i++
      while (i < source.length) {
        const strChar = source[i]
        result += strChar
        // Handle escaped quotes
        if (strChar === '\\' && i + 1 < source.length) {
          result += source[i + 1]
          i += 2
          continue
        }
        if (strChar === '"') {
          i++
          break
        }
        i++
      }
      continue
    }

    // Handle single-line comments
    if (char === '/' && nextChar === '/') {
      // Skip until end of line
      while (i < source.length && source[i] !== '\n') {
        i++
      }
      // Keep the newline
      if (i < source.length && source[i] === '\n') {
        result += '\n'
        i++
      }
      continue
    }

    // Handle multi-line comments
    if (char === '/' && nextChar === '*') {
      i += 2
      // Skip until closing */
      while (i < source.length - 1) {
        if (source[i] === '*' && source[i + 1] === '/') {
          i += 2
          break
        }
        // Preserve newlines to maintain line numbers
        if (source[i] === '\n') {
          result += '\n'
        }
        i++
      }
      continue
    }

    // Regular character
    result += char
    i++
  }

  return result
}
