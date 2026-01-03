/**
 * Utilities for matching balanced parentheses in Solidity code while being aware of string literals.
 */

/**
 * Finds the index of the closing parenthesis that matches an opening parenthesis.
 * Handles nested parentheses and ignores parentheses inside string literals.
 *
 * @param str The string to search in
 * @param startIndex The index where the opening parenthesis is located (default: 0)
 * @param options Configuration options
 * @returns The index of the matching closing parenthesis, or -1 if not found
 *
 * @example
 * findMatchingClosingParen("mapping(address => uint256)", 7) // Returns 26 (the closing paren)
 * findMatchingClosingParen("test(\"(hello)\", value)", 4) // Returns 21 (ignores parens in string)
 */
export function findMatchingClosingParen(
  str: string,
  startIndex: number = 0,
  options: { ignoreStrings?: boolean } = { ignoreStrings: true }
): number {
  let depth = 0
  let i = startIndex

  while (i < str.length) {
    const char = str[i]

    // Handle string literals (single quotes) if ignoreStrings is true
    if (options.ignoreStrings && char === "'") {
      i++
      while (i < str.length) {
        const strChar = str[i]
        // Handle escaped quotes
        if (strChar === '\\' && i + 1 < str.length) {
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

    // Handle string literals (double quotes) if ignoreStrings is true
    if (options.ignoreStrings && char === '"') {
      i++
      while (i < str.length) {
        const strChar = str[i]
        // Handle escaped quotes
        if (strChar === '\\' && i + 1 < str.length) {
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

    // Count parentheses
    if (char === '(') {
      depth++
    } else if (char === ')') {
      depth--
      if (depth === 0) {
        return i
      }
    }

    i++
  }

  return -1 // No matching closing paren found
}

/**
 * Extracts content between balanced parentheses (or other delimiters).
 *
 * @param str The string to extract from
 * @param startIndex The index of the opening delimiter
 * @param openChar The opening delimiter character (default: '(')
 * @param closeChar The closing delimiter character (default: ')')
 * @returns An object with the extracted content and the end index, or null if not found
 *
 * @example
 * extractBalancedContent("mapping(address => uint256) public", 7)
 * // Returns { content: "address => uint256", endIndex: 26 }
 */
export function extractBalancedContent(
  str: string,
  startIndex: number,
  openChar: string = '(',
  closeChar: string = ')'
): { content: string; endIndex: number } | null {
  if (str[startIndex] !== openChar) {
    return null
  }

  // For custom delimiters, use a simpler matching algorithm
  if (openChar !== '(' || closeChar !== ')') {
    let depth = 0
    for (let i = startIndex; i < str.length; i++) {
      if (str[i] === openChar) depth++
      else if (str[i] === closeChar) {
        depth--
        if (depth === 0) {
          return {
            content: str.substring(startIndex + 1, i),
            endIndex: i
          }
        }
      }
    }
    return null
  }

  // For parentheses, use the string-aware matcher
  const closeIndex = findMatchingClosingParen(str, startIndex)
  if (closeIndex === -1) {
    return null
  }

  return {
    content: str.substring(startIndex + 1, closeIndex),
    endIndex: closeIndex
  }
}

/**
 * Finds the index of a character at a given depth level, useful for finding separators like '=>'.
 * Only works when ignoreStrings is false to maintain compatibility with existing code.
 *
 * @param str The string to search in
 * @param startIndex Where to start searching
 * @param searchStr The string to search for (e.g., '=>')
 * @param targetDepth The parenthesis depth level to search at (default: 0)
 * @returns The index where searchStr was found, or -1 if not found
 *
 * @example
 * findAtDepth("mapping(address => uint256)", 0, "=>", 1) // Finds => inside mapping()
 */
export function findAtDepth(
  str: string,
  startIndex: number,
  searchStr: string,
  targetDepth: number = 0
): number {
  let depth = 0
  let i = startIndex

  while (i < str.length) {
    const char = str[i]

    if (char === '(') {
      depth++
    } else if (char === ')') {
      depth--
      if (depth < 0) return -1
    }

    // Check if we're at the target depth and the search string matches
    if (depth === targetDepth) {
      const slice = str.substring(i, i + searchStr.length)
      if (slice === searchStr) {
        return i
      }
    }

    i++
  }

  return -1
}
