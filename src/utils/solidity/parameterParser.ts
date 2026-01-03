/**
 * Utilities for parsing Solidity function parameters and return values.
 */

import { extractMappingType } from './mappingParser'
import { SOLIDITY_PATTERNS } from './patterns'

/**
 * Parses a parameter or return value string into type and name components.
 * Handles mapping types, storage locations, and interface types.
 *
 * @param str The parameter/return string to parse
 * @returns An object with type and name (name may be empty)
 *
 * @example
 * parseParamOrReturn("uint256 amount")
 * // Returns { type: "uint256", name: "amount" }
 *
 * parseParamOrReturn("mapping(address => uint256) balances")
 * // Returns { type: "mapping(address => uint256)", name: "balances" }
 *
 * parseParamOrReturn("IUniswapV3Pool memory pool")
 * // Returns { type: "IUniswapV3Pool", name: "pool" }
 */
export function parseParamOrReturn(str: string): { type: string; name: string } {
  const trimmed = str.trim()

  // First, try to handle mapping types before removing storage location
  // Handle mapping types: mapping(address => uint256) balances
  // Also handles nested: mapping(address => mapping(uint256 => bool))
  const mappingResult = extractMappingType(trimmed)
  if (mappingResult) {
    // Extract name from remainder if present (may have storage location)
    const remainder = mappingResult.remainder.replace(/\b(memory|storage|calldata)\b/gi, '').trim()
    const nameMatch = remainder.match(SOLIDITY_PATTERNS.VAR_NAME)
    return {
      type: mappingResult.type,
      name: nameMatch ? nameMatch[1] : ''
    }
  }

  // Remove storage location keywords (memory, storage, calldata) from anywhere in the string
  // They can appear after the type: "uint256[] memory values" or "IProverRegistry.ProverInstance memory data"
  const withoutStorage = trimmed.replace(/\b(memory|storage|calldata)\b/gi, ' ').replace(/\s+/g, ' ').trim()

  // Handle types with names: "uint256 amount" or "IERC20 token"
  // Match: type name or just type
  // Support interface types (IERC20, IUniswapV3Pool, etc.) and simple types
  // Pattern: identifier (can start with I for interfaces) followed by optional name
  const match = withoutStorage.match(SOLIDITY_PATTERNS.TYPE_WITH_NAME)
  if (match) {
    return {
      type: match[1].trim(),
      name: match[2] || ''
    }
  }

  // Fallback: treat entire string as type (without storage location)
  return {
    type: withoutStorage,
    name: ''
  }
}

/**
 * Splits a comma-separated list of parameters/returns, handling nested parentheses.
 * Ensures commas inside parentheses (like in tuple or mapping types) are not treated as separators.
 *
 * @param str The comma-separated string to split
 * @returns An array of trimmed parameter/return strings
 *
 * @example
 * splitByComma("uint256 a, address b, bool c")
 * // Returns ["uint256 a", "address b", "bool c"]
 *
 * splitByComma("tuple(uint256, address), bool")
 * // Returns ["tuple(uint256, address)", "bool"]
 *
 * splitByComma("mapping(address => uint256), uint256")
 * // Returns ["mapping(address => uint256)", "uint256"]
 */
export function splitByComma(str: string): string[] {
  const result: string[] = []
  let current = ''
  let depth = 0

  for (let i = 0; i < str.length; i++) {
    const char = str[i]
    if (char === '(') {
      depth++
      current += char
    } else if (char === ')') {
      depth--
      current += char
    } else if (char === ',' && depth === 0) {
      if (current.trim()) {
        result.push(current.trim())
      }
      current = ''
    } else {
      current += char
    }
  }

  if (current.trim()) {
    result.push(current.trim())
  }

  return result
}

/**
 * Normalizes a Solidity type by removing storage location keywords.
 *
 * @param type The type string to normalize
 * @returns The normalized type without storage location
 *
 * @example
 * normalizeType("uint256[] memory")
 * // Returns "uint256[]"
 *
 * normalizeType("IUniswapV3Pool storage")
 * // Returns "IUniswapV3Pool"
 */
export function normalizeType(type: string): string {
  return type.replace(SOLIDITY_PATTERNS.STORAGE_LOCATION, '').trim()
}

/**
 * Checks if a type is a custom type (not a built-in Solidity type).
 * Custom types include structs and interface types.
 *
 * @param type The type string to check
 * @returns True if the type is custom, false if it's a built-in type
 *
 * @example
 * isCustomType("MyStruct")
 * // Returns true
 *
 * isCustomType("IUniswapV3Pool.Slot0")
 * // Returns true
 *
 * isCustomType("uint256")
 * // Returns false
 */
export function isCustomType(type: string): boolean {
  const cleanType = normalizeType(type)
  return (
    cleanType.includes('.') ||
    (cleanType.length > 0 &&
      cleanType[0] === cleanType[0].toUpperCase() &&
      !cleanType.match(SOLIDITY_PATTERNS.BUILTIN_TYPES))
  )
}
