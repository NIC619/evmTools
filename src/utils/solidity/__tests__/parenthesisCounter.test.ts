import { describe, it, expect } from 'vitest'
import { findMatchingClosingParen, extractBalancedContent, findAtDepth } from '../parenthesisCounter'

describe('findMatchingClosingParen', () => {
  describe('Basic parenthesis matching', () => {
    it('finds matching closing paren for simple case', () => {
      const str = '(hello world)'
      const result = findMatchingClosingParen(str, 0)
      expect(result).toBe(12)
    })

    it('finds matching closing paren with nested parens', () => {
      const str = 'mapping(address => uint256)'
      const result = findMatchingClosingParen(str, 7) // Start at first (
      expect(result).toBe(26)
    })

    it('handles multiple levels of nesting', () => {
      const str = 'mapping(address => mapping(uint256 => bool))'
      const result = findMatchingClosingParen(str, 7) // Start at first (
      expect(result).toBe(43)
    })

    it('returns -1 when no matching paren found', () => {
      const str = '(unclosed paren'
      const result = findMatchingClosingParen(str, 0)
      expect(result).toBe(-1)
    })
  })

  describe('String literal handling', () => {
    it('ignores parentheses inside double-quoted strings', () => {
      const str = 'func("string with (parens)", value)'
      const result = findMatchingClosingParen(str, 4) // Start at opening (
      expect(result).toBe(34) // Closing ) at last index
    })

    it('ignores parentheses inside single-quoted strings', () => {
      const str = "func('string with (parens)', value)"
      const result = findMatchingClosingParen(str, 4) // Start at opening (
      expect(result).toBe(34) // Closing ) at last index
    })

    it('handles escaped quotes in strings', () => {
      const str = 'func("string with \\"()\\" chars", value)'
      const result = findMatchingClosingParen(str, 4)
      expect(result).toBe(38)
    })

    it('handles multiple strings with parens', () => {
      const str = 'test("(one)", "(two)", value)'
      const result = findMatchingClosingParen(str, 4)
      expect(result).toBe(28)
    })
  })

  describe('Solidity-specific cases', () => {
    it('handles mapping types', () => {
      const str = 'mapping(address => uint256) public balances'
      const result = findMatchingClosingParen(str, 7)
      expect(result).toBe(26)
    })

    it('handles nested mapping types', () => {
      const str = 'mapping(address => mapping(uint256 => bool)) public data'
      const result = findMatchingClosingParen(str, 7)
      expect(result).toBe(43)
    })

    it('handles function parameters with complex types', () => {
      const str = 'function test(mapping(address => uint256) memory data, uint256 value)'
      const result = findMatchingClosingParen(str, 13) // Start at function (
      expect(result).toBe(68) // Closing ) at last index
    })
  })

  describe('Options', () => {
    it('can disable string ignoring when ignoreStrings is false', () => {
      const str = 'func("(", value)' // Unbalanced paren in string
      // With string ignoring (default) - ignores the ( in the string
      const resultWithIgnore = findMatchingClosingParen(str, 4, { ignoreStrings: true })
      expect(resultWithIgnore).toBe(15) // Finds the closing ) at the end

      // Without string ignoring - counts the ( in the string, never finds matching )
      const resultWithoutIgnore = findMatchingClosingParen(str, 4, { ignoreStrings: false })
      expect(resultWithoutIgnore).toBe(-1) // Can't find matching ) because string has unbalanced (
    })
  })
})

describe('extractBalancedContent', () => {
  it('extracts content between balanced parens', () => {
    const str = 'mapping(address => uint256) public'
    const result = extractBalancedContent(str, 7)
    expect(result).toEqual({
      content: 'address => uint256',
      endIndex: 26
    })
  })

  it('handles nested parentheses', () => {
    const str = 'func((a, b), c)'
    const result = extractBalancedContent(str, 4)
    expect(result).toEqual({
      content: '(a, b), c',
      endIndex: 14
    })
  })

  it('returns null when start index is not an opening paren', () => {
    const str = 'test value'
    const result = extractBalancedContent(str, 0)
    expect(result).toBeNull()
  })

  it('returns null when no matching closing paren', () => {
    const str = '(unclosed'
    const result = extractBalancedContent(str, 0)
    expect(result).toBeNull()
  })

  it('works with custom delimiters', () => {
    const str = 'array[index]'
    const result = extractBalancedContent(str, 5, '[', ']')
    expect(result).toEqual({
      content: 'index',
      endIndex: 11
    })
  })
})

describe('findAtDepth', () => {
  it('finds string at depth 0', () => {
    const str = 'a => b'
    const result = findAtDepth(str, 0, '=>', 0)
    expect(result).toBe(2)
  })

  it('finds string at depth 1 (inside one level of parens)', () => {
    const str = 'mapping(address => uint256)'
    const result = findAtDepth(str, 0, '=>', 1)
    expect(result).toBe(16)
  })

  it('finds string in nested mappings', () => {
    const str = 'mapping(address => mapping(uint256 => bool))'
    // First => at depth 1
    const firstArrow = findAtDepth(str, 0, '=>', 1)
    expect(firstArrow).toBe(16)

    // For the second =>, we need to search from the beginning again with target depth 2
    // because findAtDepth tracks depth from startIndex
    const secondArrow = findAtDepth(str, 0, '=>', 2)
    expect(secondArrow).toBe(35)
  })

  it('returns -1 when string not found at target depth', () => {
    const str = 'mapping(address => uint256)'
    const result = findAtDepth(str, 0, '=>', 2) // => is at depth 1, not 2
    expect(result).toBe(-1)
  })

  it('returns -1 when depth goes negative (unbalanced)', () => {
    const str = ') unbalanced'
    const result = findAtDepth(str, 0, 'test', 0)
    expect(result).toBe(-1)
  })

  it('handles multiple occurrences, returns first at target depth', () => {
    const str = '=> mapping(address => uint256) =>'
    // First => at depth 0
    const first = findAtDepth(str, 0, '=>', 0)
    expect(first).toBe(0)

    // Third => at depth 0
    const third = findAtDepth(str, first + 2, '=>', 0)
    expect(third).toBe(31)
  })
})
