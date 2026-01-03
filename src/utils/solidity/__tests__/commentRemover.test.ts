import { describe, it, expect } from 'vitest'
import { removeComments } from '../commentRemover'

describe('removeComments', () => {
  describe('Single-line comments', () => {
    it('removes single-line comments', () => {
      const input = `
        uint256 public value; // This is a comment
        address public owner; // Another comment
      `
      const result = removeComments(input)
      expect(result).not.toContain('This is a comment')
      expect(result).not.toContain('Another comment')
      expect(result).toContain('uint256 public value;')
      expect(result).toContain('address public owner;')
    })

    it('preserves URLs in string literals', () => {
      const input = `
        // This is a comment
        string public url = "http://example.com";
        string public protocol = "https://secure.example.com";
      `
      const result = removeComments(input)
      expect(result).toContain('http://example.com')
      expect(result).toContain('https://secure.example.com')
      expect(result).not.toContain('This is a comment')
    })

    it('handles // inside string literals', () => {
      const input = `
        string public comment = "This is not // a comment";
        uint256 public value; // This IS a comment
      `
      const result = removeComments(input)
      expect(result).toContain('This is not // a comment')
      expect(result).not.toContain('This IS a comment')
    })
  })

  describe('Multi-line comments', () => {
    it('removes multi-line comments', () => {
      const input = `
        /* This is a
           multi-line comment */
        uint256 public value;
      `
      const result = removeComments(input)
      expect(result).not.toContain('This is a')
      expect(result).not.toContain('multi-line comment')
      expect(result).toContain('uint256 public value;')
    })

    it('preserves /* */ inside string literals', () => {
      const input = `
        string public comment = "This /* is not */ a comment";
        /* This IS a comment */
        uint256 public value;
      `
      const result = removeComments(input)
      expect(result).toContain('This /* is not */ a comment')
      expect(result).not.toContain('This IS a comment')
    })
  })

  describe('Mixed comments and strings', () => {
    it('handles complex mix of comments and strings', () => {
      const input = `
        // Single-line comment
        string public url = "http://example.com"; // Comment after code
        /* Multi-line
           comment */
        string public text = "String with // and /* symbols */";
        address public owner;
      `
      const result = removeComments(input)
      expect(result).toContain('http://example.com')
      expect(result).toContain('String with // and /* symbols */')
      expect(result).toContain('address public owner')
      expect(result).not.toContain('Single-line comment')
      expect(result).not.toContain('Multi-line')
      expect(result).not.toContain('Comment after code')
    })
  })

  describe('Edge cases', () => {
    it('handles escaped quotes in strings', () => {
      const input = `
        string public text = "She said \\"Hello\\""; // Comment
        string public text2 = 'He said \\'Hi\\''; // Comment
      `
      const result = removeComments(input)
      expect(result).toContain('She said \\"Hello\\"')
      expect(result).toContain("He said \\'Hi\\'")
      expect(result).not.toContain('Comment')
    })

    it('preserves newlines for line number consistency', () => {
      const input = `line1
// comment
line3`
      const result = removeComments(input)
      const lines = result.split('\n')
      expect(lines.length).toBe(3)
      expect(lines[0]).toContain('line1')
      expect(lines[1]).toBe('')
      expect(lines[2]).toContain('line3')
    })

    it('handles empty input', () => {
      expect(removeComments('')).toBe('')
    })

    it('handles input with no comments', () => {
      const input = 'uint256 public value;'
      expect(removeComments(input)).toBe(input)
    })
  })
})
