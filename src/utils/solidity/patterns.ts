/**
 * Centralized regex patterns and keywords for Solidity parsing.
 * All patterns are well-documented to explain their purpose and matches.
 */

/**
 * Solidity regex patterns for parsing various constructs.
 */
export const SOLIDITY_PATTERNS = {
  /**
   * Storage location keywords (memory, storage, calldata).
   * Used to strip storage location from type declarations.
   * Example: "uint256[] memory" → "uint256[]"
   */
  STORAGE_LOCATION: /\s+(memory|storage|calldata)\s*$/i,

  /**
   * Function definition pattern.
   * Matches: function name(params) [visibility] (view|pure) [returns (types)]
   * Note: view or pure is required
   *
   * Captures:
   * [1] - function name
   * [2] - parameters
   * [3] - state mutability (view|pure)
   * [4] - return types
   */
  FUNCTION: /function\s+(\w+)\s*\(([^)]*)\)\s*(?:public|external|private|internal)?\s*(view|pure)\s*(?:returns\s*\(([^)]+)\))?/gi,

  /**
   * Function definition (simpler version for initial parsing).
   * Matches: function name(params) [modifiers] [returns (types)]
   *
   * Captures:
   * [1] - function name
   * [2] - parameters
   * [3] - return types
   */
  FUNCTION_SIMPLE: /^function\s+(\w+)\s*\(([^)]*)\)\s*(?:(?:public|private|internal|external)\s+)?(?:(?:view|pure)\s+)?(?:returns\s*\(([^)]+)\))?/i,

  /**
   * State variable declaration pattern.
   * Matches: type [modifiers] name [;=]
   * Example: "uint256 public constant MAX_SUPPLY = 1000"
   */
  STATE_VAR: /^((?:mapping\([^)]+(?:\([^)]*\))*[^)]*\)|[a-zA-Z_][a-zA-Z0-9_\[\]]*))\s+(?:public|private|internal|external)?\s*(?:immutable|override|constant)*\s*(\w+)\s*[;=]?/,

  /**
   * Simple type variable pattern for extracting state variables.
   * Example: "uint256 public value" or "address public owner"
   */
  SIMPLE_TYPE_VAR: /([a-zA-Z_][a-zA-Z0-9_\[\]]*)\s+(public\s+)?(?:constant\s+|immutable\s+)?(?:override\s+)*(?:private\s+|internal\s+)?(\w+)\s*[;=]/g,

  /**
   * Public variable pattern.
   * Used to check for public visibility in state variables.
   * Example: "public balances" in "mapping(...) public balances"
   */
  PUBLIC_VAR: /public\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[;=]/,

  /**
   * Enum definition pattern.
   * Matches: enum EnumName { Value1, Value2, ... }
   *
   * Captures:
   * [1] - enum name
   */
  ENUM: /enum\s+(\w+)\s*\{[^}]*\}/g,

  /**
   * Struct definition pattern.
   * Matches: struct StructName { type1 name1; type2 name2; }
   * Handles single-level nested braces.
   *
   * Captures:
   * [1] - struct name
   * [2] - struct body
   */
  STRUCT: /struct\s+(\w+)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,

  /**
   * Struct member pattern.
   * Matches struct field declarations including mappings and arrays.
   * Example: "mapping(address => uint256) balances" or "uint256[] values"
   *
   * Captures:
   * [1] - type (can be mapping or simple type)
   * [2] - member name
   */
  STRUCT_MEMBER: /(mapping\([^)]+\)(?:\[\])?|[a-zA-Z_][a-zA-Z0-9_.\[\]]*)\s+(\w+)\s*$/,

  /**
   * Type with optional name pattern.
   * Matches: type [name]
   * Supports interface types (e.g., IUniswapV3Pool)
   *
   * Captures:
   * [1] - type
   * [2] - name (optional)
   */
  TYPE_WITH_NAME: /^([a-zA-Z_][a-zA-Z0-9_.\[\]]*)(?:\s+(\w+))?$/,

  /**
   * Variable name extraction pattern.
   * Extracts identifier at start of string.
   */
  VAR_NAME: /^(\w+)/,

  /**
   * Mapping start pattern.
   * Checks if a string starts with "mapping("
   */
  MAPPING_START: /^mapping\(/,

  /**
   * Built-in Solidity types pattern.
   * Used to check if a type is a standard Solidity type.
   */
  BUILTIN_TYPES: /^(uint|int|bytes|address|bool|string|mapping)/,

  /**
   * Brace counting patterns.
   * Used for context analysis.
   */
  OPEN_BRACE: /\{/g,
  CLOSE_BRACE: /\}/g,

  /**
   * Function declaration pattern (for counting).
   * Matches "function name("
   */
  FUNCTION_DECLARATION: /\bfunction\s+\w+\s*\(/g,
}

/**
 * Solidity keywords organized by category.
 */
export const SOLIDITY_KEYWORDS = {
  /**
   * Visibility modifiers.
   */
  VISIBILITY: ['public', 'private', 'internal', 'external'] as const,

  /**
   * State mutability keywords.
   */
  STATE_MUTABILITY: ['view', 'pure', 'payable', 'nonpayable'] as const,

  /**
   * Storage location keywords.
   */
  STORAGE_LOCATION: ['memory', 'storage', 'calldata'] as const,

  /**
   * Variable modifiers.
   */
  MODIFIERS: ['constant', 'immutable', 'override'] as const,
}

/**
 * Helper function to check if a string contains a specific keyword.
 */
export function containsKeyword(str: string, keywords: readonly string[]): boolean {
  return keywords.some(keyword => str.includes(keyword))
}

/**
 * Helper function to extract the first matching keyword from a string.
 */
export function extractKeyword(str: string, keywords: readonly string[]): string | null {
  for (const keyword of keywords) {
    if (str.includes(keyword)) {
      return keyword
    }
  }
  return null
}
