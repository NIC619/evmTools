/**
 * Solidity contract parser for extracting queryable items (view/pure functions and public state variables).
 */

import { removeComments } from './commentRemover'
import { findMatchingClosingParen } from './parenthesisCounter'
import { extractMappingKeys, extractMappingValueType, isMappingType } from './mappingParser'
import { parseParamOrReturn, splitByComma, isCustomType } from './parameterParser'
import type {
  FunctionInfo,
  ParseResult,
  ParseContext,
  StateVariableMatch,
  RawStructInfo
} from './types'

/**
 * Parses struct and enum definitions from Solidity source code.
 * Returns a map of struct names to their ABI components and a set of enum names.
 *
 * @param source The Solidity source code
 * @returns Object containing structMap and enumSet
 */
export function parseStructDefinitions(source: string): ParseContext {
  const structMap = new Map<string, any[]>()
  const enumSet = new Set<string>()
  const structRawMap = new Map<string, RawStructInfo>()

  // First, parse enum definitions
  // Pattern: enum EnumName { Value1, Value2, ... }
  const enumPattern = /enum\s+(\w+)\s*\{[^}]*\}/g
  let enumMatch
  while ((enumMatch = enumPattern.exec(source)) !== null) {
    const enumName = enumMatch[1]
    enumSet.add(enumName)
  }

  // First pass: Parse all struct definitions and store raw information
  // Pattern: struct StructName { type1 name1; type2 name2; }
  const structPattern = /struct\s+(\w+)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g
  let structMatch
  while ((structMatch = structPattern.exec(source)) !== null) {
    const structName = structMatch[1]
    const structBody = structMatch[2]

    const components: Array<{ originalType: string; name: string }> = []
    // Parse struct members - handle complex types including mappings and nested structs
    // Split by semicolon first, then parse each member
    const members = structBody.split(';').filter(m => m.trim())
    for (const member of members) {
      const trimmed = member.trim()
      if (!trimmed) continue

      // Try to match: type name or mapping(...) name or mapping(...)[] name (array of mappings)
      let memberMatch = trimmed.match(
        /(mapping\([^)]+\)(?:\[\])?|[a-zA-Z_][a-zA-Z0-9_.\[\]]*)\s+(\w+)\s*$/
      )
      if (memberMatch) {
        const originalType = memberMatch[1].trim()
        const memberName = memberMatch[2] || ''
        components.push({ originalType, name: memberName })
      }
    }

    if (components.length > 0) {
      structRawMap.set(structName, { body: structBody, components })
    }
  }

  // Second pass: Convert struct components to ABI format, handling enums and nested structs
  const convertToAbiComponents = (structName: string): any[] => {
    const raw = structRawMap.get(structName)
    if (!raw) return []

    return raw.components.map(c => {
      const originalType = c.originalType
      const typeName = originalType.split('.')[originalType.split('.').length - 1] // Get last part after dot

      // Check if it's an enum - convert to uint8
      if (enumSet.has(typeName)) {
        return { name: c.name, type: 'uint8' }
      }

      // Check if it's a nested struct - convert to tuple
      if (structRawMap.has(typeName)) {
        const nestedComponents = convertToAbiComponents(typeName)
        return {
          name: c.name,
          type: 'tuple',
          components: nestedComponents
        }
      }

      // Otherwise, keep the original type
      return { name: c.name, type: originalType }
    })
  }

  // Convert all structs to ABI format
  for (const structName of structRawMap.keys()) {
    const abiComponents = convertToAbiComponents(structName)
    if (abiComponents.length > 0) {
      structMap.set(structName, abiComponents)
    }
  }

  return { structMap, enumSet }
}

/**
 * Resolves a type name by removing storage location keywords and extracting the base type.
 * Handles interface.typename format by returning just the typename.
 *
 * @param type The type string to resolve
 * @returns The resolved type name
 */
function resolveTypeName(type: string): string {
  // Remove storage location keywords first
  const withoutStorage = type.replace(/\s+(memory|storage|calldata)\s*$/i, '').trim()
  // Extract just the type name (last part after dot)
  const parts = withoutStorage.split('.')
  return parts[parts.length - 1]
}

/**
 * Gets ABI components for a custom type (struct).
 *
 * @param type The type string
 * @param context The parse context
 * @returns The ABI components or undefined if not found
 */
function getComponentsForType(type: string, context: ParseContext): any[] | undefined {
  const typeName = resolveTypeName(type)
  return context.structMap.get(typeName)
}

/**
 * Checks if a type can be resolved using the available struct and enum definitions.
 *
 * @param type The type string
 * @param context The parse context
 * @returns True if the type can be resolved
 */
function canResolveType(type: string, context: ParseContext): boolean {
  if (!isCustomType(type)) {
    return true // Primitive types are always resolvable
  }
  const typeName = resolveTypeName(type)
  // Check if it's an enum (always resolvable as uint8)
  if (context.enumSet.has(typeName)) {
    return true
  }
  return context.structMap.has(typeName)
}

/**
 * Recursively extracts the final value type from a potentially nested mapping.
 * For simple types, returns the type as-is.
 * For mappings, recursively extracts until reaching the final non-mapping value type.
 *
 * @param type The type string
 * @returns The final value type
 *
 * @example
 * extractFinalValueType("uint256") // Returns "uint256"
 * extractFinalValueType("mapping(address => uint256)") // Returns "uint256"
 * extractFinalValueType("mapping(address => mapping(uint256 => bool))") // Returns "bool"
 */
function extractFinalValueType(type: string): string {
  if (!isMappingType(type)) {
    return type
  }
  const valueType = extractMappingValueType(type)
  return extractFinalValueType(valueType)
}

/**
 * Finds public state variable declarations in cleaned Solidity source code.
 *
 * @param cleaned The cleaned source code (comments removed)
 * @returns Array of state variable matches
 */
function findPublicStateVariables(cleaned: string): StateVariableMatch[] {
  const stateVarMatches: StateVariableMatch[] = []

  // First, find potential state variable declarations
  // Only include PUBLIC variables (skip private/internal)
  // Look for: type public name; or type public constant name; etc.
  // Skip mappings - they'll be handled separately
  const simpleTypePattern = /([a-zA-Z_][a-zA-Z0-9_\[\]]*)\s+(public\s+)?(?:constant\s+|immutable\s+)?(?:override\s+)*(?:private\s+|internal\s+)?(\w+)\s*[;=]/g
  let simpleMatch
  while ((simpleMatch = simpleTypePattern.exec(cleaned)) !== null) {
    // Skip mappings - they're handled separately
    const beforeType = cleaned.substring(Math.max(0, simpleMatch.index - 10), simpleMatch.index)
    if (beforeType.includes('mapping')) {
      continue
    }

    // Skip if it's marked as private or internal
    const matchText = simpleMatch[0]
    if (matchText.includes('private') || matchText.includes('internal')) {
      continue
    }

    // Only include if it's marked as public
    if (!simpleMatch[2] || !simpleMatch[2].includes('public')) {
      continue
    }

    const beforeMatch = cleaned.substring(0, simpleMatch.index)
    const openBraces = (beforeMatch.match(/\{/g) || []).length
    const closeBraces = (beforeMatch.match(/\}/g) || []).length
    const functionDeclarations = (beforeMatch.match(/\bfunction\s+\w+\s*\(/g) || []).length

    if (openBraces > closeBraces && functionDeclarations > 0) {
      continue
    }

    stateVarMatches.push({
      type: simpleMatch[1].trim(),
      name: simpleMatch[3].trim(),
      index: simpleMatch.index
    })
  }

  // Also find mapping types manually - look for "mapping(...) public name"
  // This pattern handles: mapping(type => type) public variableName;
  const mappingPattern = /mapping\s*\(/g
  let mappingMatch
  while ((mappingMatch = mappingPattern.exec(cleaned)) !== null) {
    const beforeMatch = cleaned.substring(0, mappingMatch.index)
    const openBraces = (beforeMatch.match(/\{/g) || []).length
    const closeBraces = (beforeMatch.match(/\}/g) || []).length
    const functionDeclarations = (beforeMatch.match(/\bfunction\s+\w+\s*\(/g) || []).length

    if (openBraces > closeBraces && functionDeclarations > 0) {
      continue
    }

    // Extract the full mapping type by finding matching parentheses
    const mappingStartIndex = cleaned.indexOf('(', mappingMatch.index) // Find the ( after "mapping"
    const closingParenIndex = findMatchingClosingParen(cleaned, mappingStartIndex, { ignoreStrings: false })

    if (closingParenIndex > mappingStartIndex) {
      const typeEnd = closingParenIndex + 1
      const type = cleaned.substring(mappingMatch.index, typeEnd)
      const afterType = cleaned.substring(typeEnd)

      // Check for public keyword after the mapping type
      // Pattern: mapping(...) public name; or mapping(...) public name; // comment
      // Use a more flexible pattern that handles various whitespace
      const publicPattern = /public\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[;=]/
      const publicMatch = afterType.match(publicPattern)

      if (publicMatch && publicMatch.index !== undefined) {
        // Check if private/internal appears between the mapping and the variable name
        const matchStart = typeEnd + publicMatch.index
        const betweenMappingAndName = cleaned.substring(mappingMatch.index, matchStart + publicMatch[0].length)
        if (betweenMappingAndName.includes('private') || betweenMappingAndName.includes('internal')) {
          continue
        }

        const varName = publicMatch[1].trim()
        // Make sure we got a valid name
        if (varName && varName.length > 0) {
          stateVarMatches.push({
            type: type.trim(),
            name: varName,
            index: mappingMatch.index
          })
        }
      }
    }
  }

  return stateVarMatches
}

/**
 * Processes state variable matches and converts them to function info and ABI items.
 *
 * @param stateVarMatches Array of state variable matches
 * @param context Parse context
 * @returns Object containing functions, originalItems, and warnings
 */
function processStateVariables(
  stateVarMatches: StateVariableMatch[],
  context: ParseContext
): { functions: FunctionInfo[]; originalItems: any[]; warnings: string[] } {
  const functions: FunctionInfo[] = []
  const originalItems: any[] = []
  const warnings: string[] = []

  // Process all found state variables - deduplicate by name
  const seenNames = new Set<string>()
  for (const match of stateVarMatches) {
    const type = match.type
    const name = match.name

    // Skip if we've already seen this name (deduplicate)
    if (seenNames.has(name)) {
      continue
    }
    seenNames.add(name)

    // Skip if type starts with "mapping" but we didn't extract it properly
    // (this shouldn't happen, but just in case)
    if (type.startsWith('mapping') && !type.includes('=>')) {
      continue
    }

    // For mapping types, extract keys as inputs and value type as output
    const inputs: Array<{ name: string; type: string }> = []
    let outputType = type
    let outputComponents: any[] | undefined = undefined

    if (type.startsWith('mapping(')) {
      const keys = extractMappingKeys(type)
      keys.forEach((key, index) => {
        inputs.push({
          name: `key${index + 1}`,
          type: key
        })
      })
      // For public mappings, the getter returns the final value type (recursively extracted for nested mappings)
      let valueType = extractFinalValueType(type)
      // Remove storage location keywords from value type
      valueType = valueType.replace(/\s+(memory|storage|calldata)\s*$/i, '').trim()
      const valueTypeName = resolveTypeName(valueType)

      // Check if it's an enum - convert to uint8
      if (context.enumSet.has(valueTypeName)) {
        outputType = 'uint8'
      } else if (isCustomType(valueType)) {
        // It's a struct or other custom type
        const components = getComponentsForType(valueType, context)
        if (components) {
          // We found the struct definition, use tuple with components
          outputType = 'tuple'
          outputComponents = components
        } else {
          // Custom type but no struct definition found - skip this variable
          warnings.push(
            `Skipping "${name}": Missing struct definition for "${valueType}". Please add the struct definition to the contract source or use ABI JSON mode.`
          )
          continue // Skip this variable
        }
      } else {
        outputType = valueType
      }
    }

    // Check if any input types are unresolved custom types
    let hasUnresolvedInputs = false
    for (const input of inputs) {
      if (isCustomType(input.type) && !canResolveType(input.type, context)) {
        warnings.push(
          `Skipping "${name}": Missing struct definition for input type "${input.type}". Please add the struct definition to the contract source or use ABI JSON mode.`
        )
        hasUnresolvedInputs = true
        break
      }
    }

    if (hasUnresolvedInputs) {
      continue // Skip this variable
    }

    const funcInfo: FunctionInfo = {
      name,
      inputs,
      outputs: [{ name: 'value', type: outputType }],
      stateMutability: 'view'
    }

    // Create output with proper type handling
    const originalOutput: any = { name: 'value', type: outputType }
    if (outputComponents) {
      originalOutput.components = outputComponents
    }

    functions.push(funcInfo)
    originalItems.push({
      type: 'function',
      name,
      inputs: inputs.map(i => ({ name: i.name, type: i.type })),
      outputs: [originalOutput],
      stateMutability: 'view'
    })
  }

  return { functions, originalItems, warnings }
}

/**
 * Processes view and pure functions and converts them to function info and ABI items.
 *
 * @param cleaned The cleaned source code
 * @param context Parse context
 * @returns Object containing functions, originalItems, and warnings
 */
function processViewAndPureFunctions(
  cleaned: string,
  context: ParseContext
): { functions: FunctionInfo[]; originalItems: any[]; warnings: string[] } {
  const functions: FunctionInfo[] = []
  const originalItems: any[] = []
  const warnings: string[] = []

  // Extract view and pure functions
  // Pattern: function name(params) [visibility] (view|pure) [returns (types)]
  // Note: view or pure is required in the regex to filter out non-view/pure functions early
  // Visibility is captured to filter out private/internal functions
  const functionRegex = /function\s+(\w+)\s*\(([^)]*)\)\s*(public|external|private|internal)?\s*(view|pure)\s*(?:returns\s*\(([^)]+)\))?/gi
  let funcMatch
  while ((funcMatch = functionRegex.exec(cleaned)) !== null) {
    const name = funcMatch[1]
    const paramsStr = funcMatch[2]?.trim() || ''
    const visibility = funcMatch[3]?.trim() || 'public' // Default to public if not specified
    const funcStateMutability = funcMatch[4]?.trim() || 'view' // view or pure (captured from regex)
    const returnsStr = funcMatch[5]?.trim() || ''

    // Skip functions with "private" or "internal" visibility
    if (visibility === 'private' || visibility === 'internal') {
      continue
    }

    // Note: view/pure check is now done in regex, so we don't need to check funcContext here

    // Parse inputs
    const inputs: Array<{ name: string; type: string }> = []
    if (paramsStr) {
      const params = splitByComma(paramsStr)
      for (const param of params) {
        const parsed = parseParamOrReturn(param)
        if (parsed.type) {
          inputs.push(parsed)
        }
      }
    }

    // Parse outputs
    const outputs: Array<{ name: string; type: string }> = []
    if (returnsStr) {
      const returnTypes = splitByComma(returnsStr)
      for (const returnType of returnTypes) {
        const parsed = parseParamOrReturn(returnType)
        if (parsed.type) {
          outputs.push(parsed)
        }
      }
    }

    // Check if any input types are unresolved custom types
    let hasUnresolvedInputs = false
    for (const input of inputs) {
      if (isCustomType(input.type) && !canResolveType(input.type, context)) {
        warnings.push(
          `Skipping function "${name}": Missing struct definition for input type "${input.type}". Please add the struct definition to the contract source or use ABI JSON mode.`
        )
        hasUnresolvedInputs = true
        break
      }
    }

    // Check if any output types are unresolved custom types
    let hasUnresolvedOutputs = false
    const originalOutputs: any[] = []
    for (const output of outputs) {
      const outputTypeName = resolveTypeName(output.type)

      // Check if it's an enum - convert to uint8
      if (context.enumSet.has(outputTypeName)) {
        originalOutputs.push({ name: output.name, type: 'uint8' })
      } else if (isCustomType(output.type) && !canResolveType(output.type, context)) {
        warnings.push(
          `Skipping function "${name}": Missing struct definition for return type "${output.type}". Please add the struct definition to the contract source or use ABI JSON mode.`
        )
        hasUnresolvedOutputs = true
        break
      } else if (isCustomType(output.type)) {
        // We have the struct definition, convert to tuple
        const components = getComponentsForType(output.type, context)
        if (components) {
          originalOutputs.push({ name: output.name, type: 'tuple', components })
        } else {
          // Shouldn't happen if canResolveType worked, but just in case
          originalOutputs.push({ name: output.name, type: output.type })
        }
      } else {
        originalOutputs.push({ name: output.name, type: output.type })
      }
    }

    if (hasUnresolvedInputs || hasUnresolvedOutputs) {
      continue // Skip this function
    }

    // State mutability was captured from regex (funcStateMutability)
    const stateMutability = funcStateMutability

    // For FunctionInfo, keep original output types (not converted to tuple)
    const funcInfo: FunctionInfo = {
      name,
      inputs,
      outputs: outputs.length > 0 ? outputs : [{ name: 'value', type: 'uint256' }],
      stateMutability
    }

    functions.push(funcInfo)
    originalItems.push({
      type: 'function',
      name,
      inputs: inputs.map(i => ({ name: i.name, type: i.type })),
      outputs: originalOutputs.length > 0 ? originalOutputs : [{ name: 'value', type: 'uint256' }],
      stateMutability
    })
  }

  return { functions, originalItems, warnings }
}

/**
 * Parses a Solidity contract source code and extracts queryable items.
 * Queryable items include:
 * - Public state variables (including mappings)
 * - View and pure functions
 *
 * @param source The Solidity contract source code
 * @returns Object containing functions, originalItems (ABI format), and warnings
 */
export function parseSolidityContract(source: string): ParseResult {
  // Parse struct and enum definitions first to build a map of custom types
  const context = parseStructDefinitions(source)

  // Remove comments (single-line and multi-line) while preserving string literals
  const cleaned = removeComments(source)

  // Extract and process public state variables
  const stateVarMatches = findPublicStateVariables(cleaned)
  const stateVarResult = processStateVariables(stateVarMatches, context)

  // Extract and process view and pure functions
  const functionsResult = processViewAndPureFunctions(cleaned, context)

  // Combine results
  return {
    functions: [...stateVarResult.functions, ...functionsResult.functions],
    originalItems: [...stateVarResult.originalItems, ...functionsResult.originalItems],
    warnings: [...stateVarResult.warnings, ...functionsResult.warnings]
  }
}
