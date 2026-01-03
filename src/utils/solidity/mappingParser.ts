/**
 * Utilities for parsing Solidity mapping types.
 * Handles nested mappings, key extraction, and value type resolution.
 */

import { findMatchingClosingParen, findAtDepth } from './parenthesisCounter'

/**
 * Extracts a complete mapping type from a string, handling nested parentheses.
 *
 * @param str The string potentially starting with a mapping type
 * @returns An object with the mapping type and the remainder of the string, or null if not a mapping
 *
 * @example
 * extractMappingType("mapping(address => uint256) public balances")
 * // Returns { type: "mapping(address => uint256)", remainder: "public balances" }
 */
export function extractMappingType(str: string): { type: string; remainder: string } | null {
  if (!str.startsWith('mapping(')) return null

  const closeIndex = findMatchingClosingParen(str, 7, { ignoreStrings: false }) // Start at opening ( after "mapping"

  if (closeIndex > 0) {
    return {
      type: str.substring(0, closeIndex + 1),
      remainder: str.substring(closeIndex + 1).trim()
    }
  }

  return null
}

/**
 * Extracts the value type from a mapping type.
 * For nested mappings, returns the innermost value type.
 *
 * @param mappingType The mapping type string (e.g., "mapping(address => uint256)")
 * @returns The value type (the type after the =>)
 *
 * @example
 * extractMappingValueType("mapping(address => uint256)")
 * // Returns "uint256"
 *
 * extractMappingValueType("mapping(address => mapping(uint256 => bool))")
 * // Returns "mapping(uint256 => bool)"
 */
export function extractMappingValueType(mappingType: string): string {
  if (!mappingType.startsWith('mapping(')) {
    return mappingType
  }

  // Find the => separator at depth 1 (inside the mapping parentheses)
  const arrowIndex = findAtDepth(mappingType, 0, '=>', 1)

  if (arrowIndex > 0) {
    // Extract everything after => until the closing )
    const valueStart = arrowIndex + 2 // Skip =>
    const closingParen = findMatchingClosingParen(mappingType, 7, { ignoreStrings: false }) // mapping( starts at 7

    if (closingParen > valueStart) {
      return mappingType.substring(valueStart, closingParen).trim()
    }
  }

  return mappingType
}

/**
 * Extracts all key types from a mapping type, handling nested mappings recursively.
 *
 * @param mappingType The mapping type string
 * @returns An array of key types, in order from outermost to innermost
 *
 * @example
 * extractMappingKeys("mapping(address => uint256)")
 * // Returns ["address"]
 *
 * extractMappingKeys("mapping(address => mapping(uint256 => bool))")
 * // Returns ["address", "uint256"]
 */
export function extractMappingKeys(mappingType: string): string[] {
  if (!mappingType.startsWith('mapping(')) {
    return []
  }

  const keys: string[] = []

  // Find the => separator at depth 1 (inside the mapping parentheses)
  const arrowIndex = findAtDepth(mappingType, 0, '=>', 1)

  if (arrowIndex > 0) {
    // Extract the key type (between "mapping(" and "=>")
    const keyType = mappingType.substring(8, arrowIndex).trim() // 8 = "mapping(".length
    keys.push(keyType)

    // Check if the value is another mapping
    const valueStart = arrowIndex + 2 // Skip =>
    const remaining = mappingType.substring(valueStart).trim()

    if (remaining.startsWith('mapping(')) {
      // Recursively extract keys from nested mapping
      const nestedKeys = extractMappingKeys(remaining)
      keys.push(...nestedKeys)
    }
  }

  return keys
}

/**
 * Checks if a given type string is a mapping type.
 *
 * @param type The type string to check
 * @returns True if the type is a mapping, false otherwise
 */
export function isMappingType(type: string): boolean {
  return type.trim().startsWith('mapping(')
}

/**
 * Parses a mapping type into a structured format with keys and value type.
 *
 * @param mappingType The mapping type string
 * @returns An object containing the keys and value type, or null if not a valid mapping
 *
 * @example
 * parseMappingStructure("mapping(address => mapping(uint256 => bool))")
 * // Returns {
 * //   keys: ["address", "uint256"],
 * //   valueType: "bool",
 * //   isArray: false
 * // }
 */
export function parseMappingStructure(mappingType: string): {
  keys: string[]
  valueType: string
  isArray: boolean
} | null {
  if (!isMappingType(mappingType)) {
    return null
  }

  // Check if it's an array of mappings (e.g., "mapping(...)[]")
  const isArray = mappingType.trim().endsWith('[]')
  const cleanType = isArray ? mappingType.trim().slice(0, -2) : mappingType.trim()

  const keys = extractMappingKeys(cleanType)

  // Get the final value type by recursively getting the value of the innermost mapping
  let currentType = cleanType
  let valueType = cleanType

  while (isMappingType(currentType)) {
    valueType = extractMappingValueType(currentType)
    currentType = valueType
  }

  return {
    keys,
    valueType,
    isArray
  }
}
