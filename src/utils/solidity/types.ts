/**
 * Shared type definitions for Solidity contract parsing.
 */

/**
 * Represents a function parameter or return value.
 */
export interface ParamInfo {
  name: string
  type: string
}

/**
 * Represents a parsed Solidity function.
 */
export interface FunctionInfo {
  name: string
  inputs: ParamInfo[]
  outputs: ParamInfo[]
  stateMutability: string
}

/**
 * Represents an ABI item with additional metadata.
 */
export interface AbiItem {
  type: string
  name: string
  inputs: any[]
  outputs: any[]
  stateMutability: string
}

/**
 * Intermediate structure for state variable matches.
 */
export interface StateVariableMatch {
  type: string
  name: string
  index: number
}

/**
 * Parse context containing struct and enum information.
 */
export interface ParseContext {
  structMap: Map<string, any[]>
  enumSet: Set<string>
}

/**
 * Result of parsing a Solidity contract.
 */
export interface ParseResult {
  functions: FunctionInfo[]
  originalItems: AbiItem[]
  warnings: string[]
}

/**
 * Raw struct information before ABI conversion.
 */
export interface RawStructInfo {
  body: string
  components: Array<{
    originalType: string
    name: string
  }>
}

/**
 * Options for contract parsing.
 */
export interface ParseOptions {
  /**
   * Whether to include private/internal functions (default: false)
   */
  includePrivate?: boolean

  /**
   * Whether to validate custom types (default: true)
   */
  validateCustomTypes?: boolean
}
