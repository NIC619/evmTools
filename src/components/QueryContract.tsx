import { useState } from 'react'
import { ethers } from 'ethers'
import { removeComments } from '../utils/solidity/commentRemover'
import './QueryContract.css'

interface QueryContractProps {
  rpcUrl: string
}

interface FunctionInfo {
  name: string
  inputs: Array<{ name: string; type: string }>
  outputs: Array<{ name: string; type: string }>
  stateMutability: string
}

export function QueryContract({ rpcUrl }: QueryContractProps) {
  const [contractAddress, setContractAddress] = useState('')
  const [inputMode, setInputMode] = useState<'function' | 'abi' | 'contract'>('function')
  const [functionDefinition, setFunctionDefinition] = useState('')
  const [abiJson, setAbiJson] = useState('')
  const [contractSource, setContractSource] = useState('')
  const [parsedAbi, setParsedAbi] = useState<FunctionInfo[]>([])
  const [originalAbiItems, setOriginalAbiItems] = useState<any[]>([]) // Store original ABI items with full structure
  const [selectedFunction, setSelectedFunction] = useState<FunctionInfo | null>(null)
  const [selectedAbiItem, setSelectedAbiItem] = useState<any | null>(null) // Store original ABI item for selected function
  const [functionArgs, setFunctionArgs] = useState<string[]>([])
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  // Helper function to extract mapping type with nested parentheses
  const extractMappingType = (str: string): { type: string; remainder: string } | null => {
    if (!str.startsWith('mapping(')) return null
    
    let depth = 0
    let typeEnd = 0
    for (let i = 0; i < str.length; i++) {
      if (str[i] === '(') depth++
      if (str[i] === ')') {
        depth--
        if (depth === 0) {
          typeEnd = i + 1
          break
        }
      }
    }
    
    if (typeEnd > 0) {
      return {
        type: str.substring(0, typeEnd),
        remainder: str.substring(typeEnd).trim()
      }
    }
    
    return null
  }

  // Helper function to parse a parameter or return value
  const parseParamOrReturn = (str: string): { type: string; name: string } => {
    const trimmed = str.trim()
    
    // Remove storage location keywords (memory, storage, calldata) from the string
    // These can appear after the type name: "IProverRegistry.ProverInstance memory" or "uint256[] memory"
    const storageLocationPattern = /\s+(memory|storage|calldata)\s*$/i
    const withoutStorage = trimmed.replace(storageLocationPattern, '').trim()
    
    // Handle mapping types: mapping(address => uint256) balances
    // Also handles nested: mapping(address => mapping(uint256 => bool))
    const mappingResult = extractMappingType(withoutStorage)
    if (mappingResult) {
      // Extract name from remainder if present
      const nameMatch = mappingResult.remainder.match(/^(\w+)/)
      return {
        type: mappingResult.type,
        name: nameMatch ? nameMatch[1] : ''
      }
    }
    
    // Handle types with names: "uint256 amount" or "IERC20 token"
    // Match: type name or just type
    // Support interface types (IERC20, IUniswapV3Pool, etc.) and simple types
    // Pattern: identifier (can start with I for interfaces) followed by optional name
    const match = withoutStorage.match(/^([a-zA-Z_][a-zA-Z0-9_.\[\]]*)(?:\s+(\w+))?$/)
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

  // Helper function to split parameters/returns by comma, handling nested parentheses
  const splitByComma = (str: string): string[] => {
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

  // Helper function to extract the value type from a mapping type
  const extractMappingValueType = (mappingType: string): string => {
    if (!mappingType.startsWith('mapping(')) {
      return mappingType
    }
    
    // Find the => separator
    let depth = 0
    let arrowIndex = -1
    for (let i = 8; i < mappingType.length; i++) { // Start after "mapping("
      if (mappingType[i] === '(') depth++
      if (mappingType[i] === ')') {
        depth--
        if (depth < 0) break
      }
      if (depth === 0 && mappingType[i] === '=' && mappingType[i + 1] === '>') {
        arrowIndex = i + 2
        break
      }
    }
    
    if (arrowIndex > 0) {
      // Extract everything after => until the closing )
      let valueType = ''
      depth = 0
      for (let i = arrowIndex; i < mappingType.length; i++) {
        if (mappingType[i] === '(') depth++
        if (mappingType[i] === ')') {
          if (depth === 0) {
            // This is the closing ) of the mapping
            break
          }
          depth--
        }
        valueType += mappingType[i]
      }
      return valueType.trim()
    }
    
    return mappingType
  }

  // Helper function to extract all key types from a mapping type (handles nested mappings)
  const extractMappingKeys = (mappingType: string): string[] => {
    if (!mappingType.startsWith('mapping(')) {
      return []
    }
    
    const keys: string[] = []
    let depth = 0
    let currentKey = ''
    let inKey = false
    
    // Find the content between mapping( and =>)
    for (let i = 8; i < mappingType.length; i++) { // Start after "mapping("
      const char = mappingType[i]
      
      if (char === '(') {
        depth++
        if (inKey) currentKey += char
      } else if (char === ')') {
        if (depth === 0) break // End of mapping
        depth--
        if (inKey) currentKey += char
      } else if (char === '=' && mappingType[i + 1] === '>') {
        // Found => separator
        if (depth === 0) {
          // This is the key separator
          keys.push(currentKey.trim())
          currentKey = ''
          inKey = false
          i++ // Skip the '>'
          // Check if the value is another mapping
          const remaining = mappingType.substring(i + 1)
          if (remaining.trim().startsWith('mapping(')) {
            // Recursively extract keys from nested mapping
            const nestedKeys = extractMappingKeys(remaining.trim())
            keys.push(...nestedKeys)
            break
          }
        } else {
          if (inKey) currentKey += char
        }
      } else {
        if (depth === 0 && !inKey && char !== ' ') {
          inKey = true
        }
        if (inKey) currentKey += char
      }
    }
    
    return keys
  }

  // Helper function to get input fields needed for a parameter type
  const getInputFieldsForType = (type: string): Array<{ label: string; type: string; isMappingKey: boolean }> => {
    const fields: Array<{ label: string; type: string; isMappingKey: boolean }> = []
    
    if (type.startsWith('mapping(')) {
      // Extract keys from mapping
      const keys = extractMappingKeys(type)
      keys.forEach((key, index) => {
        fields.push({
          label: `Key ${index + 1} (${key})`,
          type: key,
          isMappingKey: true
        })
      })
    } else {
      // Regular parameter
      fields.push({
        label: type,
        type: type,
        isMappingKey: false
      })
    }
    
    return fields
  }

  const parseFunctionDefinition = (definition: string): FunctionInfo | null => {
    const trimmed = definition.trim()
    
    // Pattern 1: Function definition like `function messageNonce() public view returns (uint256)`
    // Handle modifiers in any order: public view, view public, etc.
    const functionMatch = trimmed.match(/^function\s+(\w+)\s*\(([^)]*)\)\s*(?:(?:public|private|internal|external)\s+)?(?:(?:view|pure)\s+)?(?:returns\s*\(([^)]+)\))?/i)
    if (functionMatch) {
      const name = functionMatch[1]
      const paramsStr = functionMatch[2]?.trim() || ''
      const returnsStr = functionMatch[3]?.trim() || ''
      
      // Parse inputs - handle complex types like mapping(address => uint256)
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
      
      // Parse outputs - handle interface types and complex types
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
      
      // Determine state mutability
      const stateMutability = trimmed.includes('pure') ? 'pure' :
                             trimmed.includes('view') ? 'view' : 'nonpayable'
      
      return {
        name,
        inputs,
        outputs: outputs.length > 0 ? outputs : [{ name: 'value', type: 'uint256' }],
        stateMutability
      }
    }
    
    // Pattern 2: State variable declaration
    // Handle simple types: `address public signalService;`
    // Handle mapping types: `mapping(address => uint256) public balances;`
    // Extract type by finding the first word or mapping(...) pattern, then modifiers, then variable name
    const stateVarPattern = /^((?:mapping\([^)]+(?:\([^)]*\))*[^)]*\)|[a-zA-Z_][a-zA-Z0-9_\[\]]*))\s+(?:public|private|internal|external)?\s*(?:immutable|override|constant)*\s*(\w+)\s*[;=]?/
    let stateVarMatch = trimmed.match(stateVarPattern)
    
    // If simple regex doesn't work, try to extract mapping type manually
    if (!stateVarMatch && trimmed.startsWith('mapping(')) {
      // Extract mapping type by finding matching parentheses
      let depth = 0
      let typeEnd = 0
      for (let i = 0; i < trimmed.length; i++) {
        if (trimmed[i] === '(') depth++
        if (trimmed[i] === ')') {
          depth--
          if (depth === 0) {
            typeEnd = i + 1
            break
          }
        }
      }
      if (typeEnd > 0) {
        const type = trimmed.substring(0, typeEnd)
        const rest = trimmed.substring(typeEnd).trim()
        const nameMatch = rest.match(/\s+(?:public|private|internal|external)?\s*(?:immutable|override|constant)*\s*(\w+)\s*[;=]?/)
        if (nameMatch) {
          stateVarMatch = [trimmed, type, nameMatch[1]]
        }
      }
    }
    
    if (stateVarMatch) {
      const type = stateVarMatch[1]
      const name = stateVarMatch[2]
      
      // If it's a mapping type, extract keys as inputs and value type as output
      const inputs: Array<{ name: string; type: string }> = []
      let outputType = type
      
      if (type.startsWith('mapping(')) {
        const keys = extractMappingKeys(type)
        keys.forEach((key, index) => {
          inputs.push({
            name: `key${index + 1}`,
            type: key
          })
        })
        // For public mappings, the getter returns the value type, not the mapping type
        outputType = extractMappingValueType(type)
      }
      
      return {
        name,
        inputs,
        outputs: [{ name: 'value', type: outputType }],
        stateMutability: 'view'
      }
    }
    
    return null
  }

  const handleFunctionDefinitionChange = (value: string) => {
    setFunctionDefinition(value)
    const parsed = parseFunctionDefinition(value)
    if (parsed) {
      setSelectedFunction(parsed)
      setSelectedAbiItem(null) // Function definitions don't have original ABI items
      // Calculate total number of input fields needed (including mapping keys)
      let totalFields = 0
      parsed.inputs.forEach(input => {
        const fields = getInputFieldsForType(input.type)
        totalFields += fields.length
      })
      // For state variables that are mappings, add inputs for the keys
      if (parsed.inputs.length === 0 && parsed.outputs.length > 0) {
        const outputType = parsed.outputs[0].type
        if (outputType.startsWith('mapping(')) {
          const keys = extractMappingKeys(outputType)
          totalFields = keys.length
        }
      }
      setFunctionArgs(new Array(totalFields).fill(''))
      setError(null)
    } else {
      setSelectedFunction(null)
      setSelectedAbiItem(null)
      setFunctionArgs([])
      if (value.trim()) {
        setError('Could not parse function definition. Please check the format.')
      } else {
        setError(null)
      }
    }
  }

  // Helper function to parse ABI from both JSON and JavaScript object notation
  const parseAbi = (value: string): any[] | null => {
    // Try standard JSON first
    try {
      return JSON.parse(value)
    } catch (e) {
      // If JSON parsing fails, try to convert JavaScript object notation to JSON
      try {
        // Replace unquoted keys with quoted keys
        // This is a simple approach - handle common cases
        let converted = value
          // Replace unquoted keys at the start of lines or after { or ,
          .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
          // Handle single quotes to double quotes for strings
          .replace(/'/g, '"')
        
        return JSON.parse(converted)
      } catch (e2) {
        // If that also fails, try using Function constructor (less safe but handles more cases)
        try {
          // Wrap in parentheses to make it an expression
          const parsed = new Function('return ' + value)()
          return Array.isArray(parsed) ? parsed : null
        } catch (e3) {
          return null
        }
      }
    }
  }

  // Helper function to check if a type is a custom type (struct/interface) that needs tuple format
  const isCustomType = (type: string): boolean => {
    // Remove storage location keywords first
    const cleanType = type.replace(/\s+(memory|storage|calldata)\s*$/i, '').trim()
    // Custom types typically contain dots (like IProverRegistry.ProverInstance) or are known struct names
    return cleanType.includes('.') || 
           (cleanType.length > 0 && cleanType[0] === cleanType[0].toUpperCase() && !cleanType.match(/^(uint|int|bytes|address|bool|string|mapping)/))
  }

  // Helper function to parse enum and struct definitions from contract source
  const parseStructDefinitions = (source: string): { structMap: Map<string, any[]>, enumSet: Set<string> } => {
    const structMap = new Map<string, any[]>()
    const enumSet = new Set<string>()
    const structRawMap = new Map<string, { body: string, components: Array<{ originalType: string, name: string }> }>()
    
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
      
      const components: Array<{ originalType: string, name: string }> = []
      // Parse struct members - handle complex types including mappings and nested structs
      // Split by semicolon first, then parse each member
      const members = structBody.split(';').filter(m => m.trim())
      for (const member of members) {
        const trimmed = member.trim()
        if (!trimmed) continue
        
        // Try to match: type name or mapping(...) name or mapping(...)[] name (array of mappings)
        let memberMatch = trimmed.match(/(mapping\([^)]+\)(?:\[\])?|[a-zA-Z_][a-zA-Z0-9_.\[\]]*)\s+(\w+)\s*$/)
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

  // Helper function to parse Solidity contract and extract queryable items
  const parseSolidityContract = (source: string): { functions: FunctionInfo[], originalItems: any[], warnings: string[] } => {
    const functions: FunctionInfo[] = []
    const originalItems: any[] = []
    const warnings: string[] = []
    
    // Parse struct and enum definitions first to build a map of custom types
    const { structMap, enumSet } = parseStructDefinitions(source)
    
    // Helper to resolve a type name (handle interface.typename format)
    const resolveTypeName = (type: string): string => {
      // Remove storage location keywords first
      const withoutStorage = type.replace(/\s+(memory|storage|calldata)\s*$/i, '').trim()
      // Extract just the type name (last part after dot)
      const parts = withoutStorage.split('.')
      return parts[parts.length - 1]
    }
    
    // Helper to get components for a custom type, converting enums and nested structs
    const getComponentsForType = (type: string): any[] | undefined => {
      const typeName = resolveTypeName(type)
      return structMap.get(typeName)
    }
    
    // Helper to check if a type can be resolved
    const canResolveType = (type: string): boolean => {
      if (!isCustomType(type)) {
        return true // Primitive types are always resolvable
      }
      const typeName = resolveTypeName(type)
      // Check if it's an enum (always resolvable as uint8)
      if (enumSet.has(typeName)) {
        return true
      }
      return structMap.has(typeName)
    }
    
    // Remove comments (single-line and multi-line) while preserving string literals
    let cleaned = removeComments(source)
    
    // Extract public state variables (including constants and immutables)
    // We'll search for patterns and manually extract mapping types
    const stateVarMatches: Array<{ type: string; name: string; index: number }> = []
    
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
      let depth = 0
      let typeEnd = mappingMatch.index
      for (let i = mappingMatch.index; i < cleaned.length; i++) {
        if (cleaned[i] === '(') depth++
        if (cleaned[i] === ')') {
          depth--
          if (depth === 0) {
            typeEnd = i + 1
            break
          }
        }
      }
      
      if (typeEnd > mappingMatch.index) {
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
        // For public mappings, the getter returns the value type, not the mapping type
        let valueType = extractMappingValueType(type)
        // Remove storage location keywords from value type
        valueType = valueType.replace(/\s+(memory|storage|calldata)\s*$/i, '').trim()
        const valueTypeName = resolveTypeName(valueType)
        
        // Check if it's an enum - convert to uint8
        if (enumSet.has(valueTypeName)) {
          outputType = 'uint8'
        } else if (isCustomType(valueType)) {
          // It's a struct or other custom type
          const components = getComponentsForType(valueType)
          if (components) {
            // We found the struct definition, use tuple with components
            outputType = 'tuple'
            outputComponents = components
          } else {
            // Custom type but no struct definition found - skip this variable
            warnings.push(`Skipping "${name}": Missing struct definition for "${valueType}". Please add the struct definition to the contract source or use ABI JSON mode.`)
            continue // Skip this variable
          }
        } else {
          outputType = valueType
        }
      }
      
      // Check if any input types are unresolved custom types
      let hasUnresolvedInputs = false
      for (const input of inputs) {
        if (isCustomType(input.type) && !canResolveType(input.type)) {
          warnings.push(`Skipping "${name}": Missing struct definition for input type "${input.type}". Please add the struct definition to the contract source or use ABI JSON mode.`)
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
    
    // Extract view and pure functions
    // Pattern: function name(params) [public|external] (view|pure) [returns (types)]
    // Note: view or pure is now required in the regex to filter out non-view/pure functions early
    const functionRegex = /function\s+(\w+)\s*\(([^)]*)\)\s*(?:public|external|private|internal)?\s*(view|pure)\s*(?:returns\s*\(([^)]+)\))?/gi
    let funcMatch
    while ((funcMatch = functionRegex.exec(cleaned)) !== null) {
      const name = funcMatch[1]
      const paramsStr = funcMatch[2]?.trim() || ''
      const funcStateMutability = funcMatch[3]?.trim() || 'view' // view or pure (captured from regex)
      const returnsStr = funcMatch[4]?.trim() || ''

      // Get a wider context around the function to check for private/internal modifiers
      // Look at the text before the function keyword (up to 50 chars) to catch modifiers
      const matchIndex = funcMatch.index
      const contextStart = Math.max(0, matchIndex - 50)
      const contextEnd = Math.min(cleaned.length, matchIndex + funcMatch[0].length + 50)
      const funcContext = cleaned.substring(contextStart, contextEnd)

      // Skip functions with "private" or "internal" visibility
      // Check both in the matched string and in the wider context
      if (funcContext.includes('private') || funcContext.includes('internal')) {
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
        if (isCustomType(input.type) && !canResolveType(input.type)) {
          warnings.push(`Skipping function "${name}": Missing struct definition for input type "${input.type}". Please add the struct definition to the contract source or use ABI JSON mode.`)
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
        if (enumSet.has(outputTypeName)) {
          originalOutputs.push({ name: output.name, type: 'uint8' })
        } else if (isCustomType(output.type) && !canResolveType(output.type)) {
          warnings.push(`Skipping function "${name}": Missing struct definition for return type "${output.type}". Please add the struct definition to the contract source or use ABI JSON mode.`)
          hasUnresolvedOutputs = true
          break
        } else if (isCustomType(output.type)) {
          // We have the struct definition, convert to tuple
          const components = getComponentsForType(output.type)
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

  const handleContractSourceChange = (value: string) => {
    setContractSource(value)
    try {
      const { functions, originalItems, warnings } = parseSolidityContract(value)
      setParsedAbi(functions)
      setOriginalAbiItems(originalItems)
      setWarnings(warnings)
      setError(null)
      
      if (functions.length > 0 && !selectedFunction) {
        const func = functions[0]
        const originalItem = originalItems[0]
        setSelectedFunction(func)
        setSelectedAbiItem(originalItem)
        // Calculate total number of input fields needed
        let totalFields = 0
        func.inputs.forEach(input => {
          const fields = getInputFieldsForType(input.type)
          totalFields += fields.length
        })
        // For state variables that are mappings, add inputs for keys
        if (func.inputs.length === 0 && func.outputs.length > 0) {
          const outputType = func.outputs[0].type
          if (outputType.startsWith('mapping(')) {
            const keys = extractMappingKeys(outputType)
            totalFields = keys.length
          }
        }
        setFunctionArgs(new Array(totalFields).fill(''))
      } else if (functions.length === 0 && value.trim()) {
        if (warnings.length > 0) {
          setError('No queryable items found. Some items were skipped due to missing struct definitions (see warnings below).')
        } else {
          setError('No public state variables or view functions found in the contract')
        }
      } else {
        setError(null)
      }
    } catch (e: any) {
      setParsedAbi([])
      setOriginalAbiItems([])
      setWarnings([])
      if (value.trim()) {
        setError(`Failed to parse contract: ${e.message || 'Unknown error'}`)
      } else {
        setError(null)
      }
    }
  }

  const handleAbiChange = (value: string) => {
    setAbiJson(value)
    try {
      const parsed = parseAbi(value)
      if (parsed && Array.isArray(parsed)) {
        const filtered = parsed
          .filter(
            (item: any) => item.type === 'function' && 
            (item.stateMutability === 'view' || item.stateMutability === 'pure')
          )
        
        // Store original ABI items
        setOriginalAbiItems(filtered)
        
        const functions = filtered.map((item: any) => {
          // Normalize the function info - ensure inputs and outputs are arrays
          return {
            type: item.type,
            name: item.name,
            inputs: Array.isArray(item.inputs) ? item.inputs.map((input: any) => ({
              name: input.name || '',
              type: input.type || ''
            })) : [],
            outputs: Array.isArray(item.outputs) ? item.outputs.map((output: any) => ({
              name: output.name || '',
              type: output.type || ''
            })) : [],
            stateMutability: item.stateMutability || 'view'
          } as FunctionInfo
        })
        
        setParsedAbi(functions)
        setError(null)
        if (functions.length > 0 && !selectedFunction) {
          const func = functions[0]
          const originalItem = filtered[0]
          setSelectedFunction(func)
          setSelectedAbiItem(originalItem)
          // Calculate total number of input fields needed (including mapping keys)
          let totalFields = 0
          func.inputs.forEach(input => {
            const fields = getInputFieldsForType(input.type)
            totalFields += fields.length
          })
          setFunctionArgs(new Array(totalFields).fill(''))
        }
      } else {
        setError('ABI must be an array')
        setParsedAbi([])
      }
    } catch (e: any) {
      setParsedAbi([])
      if (value.trim()) {
        setError(`Invalid ABI format: ${e.message || 'Unknown error'}`)
      } else {
        setError(null)
      }
    }
  }

  const handleFunctionSelect = (func: FunctionInfo) => {
    setSelectedFunction(func)
    // Find the original ABI item for this function
    const originalItem = originalAbiItems.find(item => item.name === func.name)
    setSelectedAbiItem(originalItem || null)
    // Calculate total number of input fields needed (including mapping keys)
    let totalFields = 0
    func.inputs.forEach(input => {
      const fields = getInputFieldsForType(input.type)
      totalFields += fields.length
    })
    setFunctionArgs(new Array(totalFields).fill(''))
    setResult(null)
  }

  // Helper function to expand tuple components recursively
  const expandTupleComponents = (value: any, components: any[], prefix: string = ''): Array<{ name: string; type: string; value: any }> => {
    const results: Array<{ name: string; type: string; value: any }> = []
    
    if (!value || typeof value !== 'object') {
      return results
    }
    
    // ethers.js returns tuples as objects with both named properties and array-like access
    // Try to access by name first, then by index
    components.forEach((component, index) => {
      const componentName = component.name || `item${index}`
      const componentType = component.type || ''
      const fullName = prefix ? `${prefix}.${componentName}` : componentName
      
      // Try multiple ways to access the value:
      // ethers.js v6 returns tuples as Proxy objects with both named properties and numeric indices
      // 1. By name (e.g., value.addr) - preferred for readability
      // 2. By index (e.g., value[0]) - fallback
      // 3. As array element if it's an array
      let componentValue: any = undefined
      
      if (Array.isArray(value)) {
        componentValue = value[index]
      } else {
        // Try by name first (ethers.js Proxy objects have named properties)
        if (componentName && componentName !== `item${index}`) {
          try {
            componentValue = value[componentName]
          } catch (e) {
            // Ignore errors accessing properties
          }
        }
        
        // If name access didn't work or returned undefined, try by index
        if (componentValue === undefined) {
          try {
            componentValue = value[index]
          } catch (e) {
            // Ignore errors
          }
        }
        
        // Last resort: try accessing as array-like
        if (componentValue === undefined && typeof value.length === 'number' && index < value.length) {
          try {
            componentValue = value[index]
          } catch (e) {
            // Ignore errors
          }
        }
      }
      
      // Skip if we couldn't find the value
      if (componentValue === undefined) {
        return
      }
      
      // Check if this component is itself a tuple
      if (componentType === 'tuple' && component.components && componentValue && typeof componentValue === 'object') {
        // Nested tuple - recurse
        const nestedResults = expandTupleComponents(componentValue, component.components, fullName)
        if (nestedResults.length > 0) {
          results.push(...nestedResults)
        } else {
          // If nested expansion failed, show as JSON
          results.push({
            name: fullName,
            type: componentType,
            value: JSON.stringify(componentValue, null, 2)
          })
        }
      } else {
        // Regular component
        let displayValue: string
        if (componentValue === null) {
          displayValue = 'null'
        } else if (componentValue === undefined) {
          displayValue = 'undefined'
        } else if (typeof componentValue === 'object' && !Array.isArray(componentValue)) {
          displayValue = JSON.stringify(componentValue)
        } else if (Array.isArray(componentValue)) {
          displayValue = JSON.stringify(componentValue)
        } else {
          displayValue = componentValue.toString()
        }
        
        results.push({
          name: fullName,
          type: componentType,
          value: displayValue
        })
      }
    })
    
    return results
  }

  const functionInfoToAbi = (func: FunctionInfo, originalItem?: any) => {
    // If we have an original item with components, use it
    if (originalItem && originalItem.outputs) {
      return originalItem
    }
    
    // Otherwise, construct from FunctionInfo
    return {
      type: 'function',
      name: func.name,
      inputs: func.inputs.map(input => ({
        name: input.name || '',
        type: input.type
      })),
      outputs: func.outputs.map(output => ({
        name: output.name || '',
        type: output.type
      })),
      stateMutability: func.stateMutability || 'view'
    }
  }

  const executeQuery = async () => {
    if (!contractAddress || !selectedFunction) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      // Validate contract address
      if (!ethers.isAddress(contractAddress)) {
        throw new Error('Invalid contract address format')
      }

      const provider = new ethers.JsonRpcProvider(rpcUrl)
      
      // Use original ABI item if available (preserves tuple components), otherwise convert from FunctionInfo
      let abiItem: any
      if (selectedAbiItem && (inputMode === 'abi' || inputMode === 'contract')) {
        // Use the original ABI item which has full structure including components
        abiItem = selectedAbiItem
        
        // For contract mode, check if we have tuple outputs without components
        if (inputMode === 'contract' && abiItem.outputs) {
          for (let i = 0; i < abiItem.outputs.length; i++) {
            const output = abiItem.outputs[i]
            if (output.type === 'tuple' && !output.components) {
              // Tuple without components - this is a problem
              // Check if the FunctionInfo has the original type name we can use
              const funcOutput = selectedFunction.outputs[i]
              if (funcOutput) {
                // Try to find the original custom type name
                const customTypeName = funcOutput.type
                if (isCustomType(customTypeName)) {
                  // We have a custom type but no components
                  // This will fail, but we'll let it fail with a clear error
                  throw new Error(`Cannot resolve custom type "${customTypeName}". The struct is likely defined in an imported interface. Please use ABI JSON mode and provide the full ABI with tuple components for this function.`)
                }
              }
            }
          }
        }
      } else {
        // Convert FunctionInfo to proper ABI format (for function definition mode)
        abiItem = functionInfoToAbi(selectedFunction, selectedAbiItem)
      }
      const contract = new ethers.Contract(contractAddress, [abiItem], provider)

      // Prepare arguments - handle mapping keys and regular parameters
      const args: any[] = []
      let argIndex = 0
      
      // Process function inputs (including mapping keys)
      selectedFunction.inputs.forEach((input) => {
        const fields = getInputFieldsForType(input.type)
        fields.forEach((field) => {
          const argValue = functionArgs[argIndex++]
          if (!argValue) return
          
          // Basic type conversion
          let converted: any = argValue
          if (field.type.includes('int')) {
            converted = BigInt(argValue)
          } else if (field.type === 'bool') {
            converted = argValue === 'true' || argValue === '1'
          } else if (field.type === 'address') {
            converted = ethers.getAddress(argValue)
          }
          args.push(converted)
        })
      })
      
      // For mapping state variables, add keys as arguments
      if (selectedFunction.inputs.length === 0 && selectedFunction.outputs.length > 0) {
        const outputType = selectedFunction.outputs[0].type
        if (outputType.startsWith('mapping(')) {
          const keys = extractMappingKeys(outputType)
          keys.forEach((key) => {
            const argValue = functionArgs[argIndex++]
            if (!argValue) return
            
            let converted: any = argValue
            if (key.includes('int')) {
              converted = BigInt(argValue)
            } else if (key === 'bool') {
              converted = argValue === 'true' || argValue === '1'
            } else if (key === 'address') {
              converted = ethers.getAddress(argValue)
            }
            args.push(converted)
          })
        }
      }

      // Call the function - for state variables, the getter has no args
      // Use getFunction to get the function instance
      let func
      try {
        func = contract.getFunction(selectedFunction.name)
      } catch (e: any) {
        throw new Error(`Function "${selectedFunction.name}" not found on contract. Make sure it's a public state variable or function. Error: ${e.message}`)
      }
      
      const callResult = await func(...args)
      
      // Format the result - handle tuples and arrays
      // ethers.js v6 returns tuples as Proxy objects that are array-like
      // ethers.js v6 returns tuples as Proxy objects that are array-like
      const formattedResults: Array<{ name: string; type: string; value: any }> = []
      
      // If there's only one output, treat callResult as that single output (even if it's array-like)
      // If there are multiple outputs, treat callResult as an array of outputs
      if (selectedFunction.outputs.length === 1) {
        // Single return value - the entire callResult is the tuple
        const output = selectedFunction.outputs[0]
        const originalOutput = selectedAbiItem?.outputs?.[0]
        
        // Check if this is a tuple type with components
        const isTuple = (output?.type === 'tuple' || originalOutput?.type === 'tuple') && 
                       originalOutput?.components && 
                       callResult && 
                       typeof callResult === 'object'
        
        if (isTuple) {
          // Expand tuple components - pass the entire callResult (which is the tuple Proxy)
          // Use empty prefix to avoid "value." prefix in display
          const expanded = expandTupleComponents(callResult, originalOutput.components, '')
          if (expanded.length > 0) {
            formattedResults.push(...expanded)
          } else {
            // Fallback if expansion failed
            formattedResults.push({
              name: output?.name || 'value',
              type: output?.type || 'unknown',
              value: JSON.stringify(callResult, null, 2)
            })
          }
        } else if (callResult && typeof callResult === 'object' && !Array.isArray(callResult)) {
          // Other object types
          formattedResults.push({
            name: output?.name || 'value',
            type: output?.type || 'unknown',
            value: JSON.stringify(callResult, null, 2)
          })
        } else {
          formattedResults.push({
            name: output?.name || 'value',
            type: output?.type || 'unknown',
            value: callResult?.toString() || String(callResult)
          })
        }
      } else {
        // Multiple outputs - treat as array
        selectedFunction.outputs.forEach((output, index) => {
          const value = callResult[index]
          const originalOutput = selectedAbiItem?.outputs?.[index]
          
          // Check if this is a tuple type with components
          const isTuple = (output.type === 'tuple' || originalOutput?.type === 'tuple') && 
                         originalOutput?.components && 
                         value && 
                         typeof value === 'object'
          
          if (isTuple) {
            // Expand tuple components - use empty prefix to avoid "value." prefix
            const expanded = expandTupleComponents(value, originalOutput.components, '')
            if (expanded.length > 0) {
              formattedResults.push(...expanded)
            } else {
              // Fallback if expansion failed
              formattedResults.push({
                name: output.name || `output${index}`,
                type: output.type,
                value: JSON.stringify(value, null, 2)
              })
            }
          } else if (value && typeof value === 'object' && !Array.isArray(value)) {
            // Other object types
            formattedResults.push({
              name: output.name || `output${index}`,
              type: output.type,
              value: JSON.stringify(value, null, 2)
            })
          } else {
            formattedResults.push({
              name: output.name || `output${index}`,
              type: output.type,
              value: value?.toString() || String(value)
            })
          }
        })
      }
      
      setResult(formattedResults)
    } catch (e: any) {
      setError(e.message || 'Failed to query contract')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="query-contract">
      <h2>Query Contract</h2>
      
      <div className="form-group">
        <label>Contract Address:</label>
        <input
          type="text"
          placeholder="0x..."
          value={contractAddress}
          onChange={(e) => setContractAddress(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label>Input Mode:</label>
        <div className="radio-group">
          <label>
            <input
              type="radio"
              value="function"
              checked={inputMode === 'function'}
              onChange={() => {
                setInputMode('function')
                setAbiJson('')
                setContractSource('')
                setParsedAbi([])
                setOriginalAbiItems([])
                setSelectedFunction(null)
                setWarnings([])
                setSelectedAbiItem(null)
                setResult(null)
              }}
            />
            Function Definition
          </label>
          <label>
            <input
              type="radio"
              value="abi"
              checked={inputMode === 'abi'}
              onChange={() => {
                setInputMode('abi')
                setFunctionDefinition('')
                setContractSource('')
                setSelectedFunction(null)
                setSelectedAbiItem(null)
                setResult(null)
                setWarnings([])
              }}
            />
            ABI JSON
          </label>
          <label>
            <input
              type="radio"
              value="contract"
              checked={inputMode === 'contract'}
              onChange={() => {
                setInputMode('contract')
                setFunctionDefinition('')
                setAbiJson('')
                setSelectedFunction(null)
                setSelectedAbiItem(null)
                setResult(null)
                setWarnings([])
              }}
            />
            Solidity Contract
          </label>
        </div>
      </div>

      {inputMode === 'function' && (
        <div className="form-group">
          <label>Function Definition:</label>
          <textarea
            placeholder="e.g., address public signalService; or mapping(address => uint256) public balances; or function balanceOf(address account) public view returns (uint256); or function getToken() public view returns (IERC20 token)"
            value={functionDefinition}
            onChange={(e) => handleFunctionDefinitionChange(e.target.value)}
            rows={3}
          />
          {selectedFunction && (
            <div className="parsed-info">
              <strong>Parsed:</strong> {selectedFunction.name}(
              {selectedFunction.inputs.length > 0 
                ? selectedFunction.inputs.map((input) => 
                    `${input.type}${input.name ? ' ' + input.name : ''}`
                  ).join(', ')
                : ''
              }) → {
              selectedFunction.outputs.length > 0
                ? selectedFunction.outputs.map((output) => 
                    `${output.type}${output.name ? ' ' + output.name : ''}`
                  ).join(', ')
                : 'void'
              }
            </div>
          )}
        </div>
      )}

      {inputMode === 'abi' && (
        <>
          <div className="form-group">
            <label>ABI JSON:</label>
            <textarea
              placeholder='JSON or JavaScript object notation: [{"type":"function","name":"balanceOf",...}] or [{type:"function",name:"balanceOf",...}]'
              value={abiJson}
              onChange={(e) => handleAbiChange(e.target.value)}
              rows={8}
            />
          </div>

          {parsedAbi.length > 0 && (
            <div className="form-group">
              <label>Select Function:</label>
              <select
                value={selectedFunction?.name || ''}
                onChange={(e) => {
                  const func = parsedAbi.find(f => f.name === e.target.value)
                  if (func) handleFunctionSelect(func)
                }}
              >
                <option value="">-- Select a function --</option>
                {parsedAbi.map((func, index) => (
                  <option key={index} value={func.name}>
                    {func.name}({func.inputs.length > 0 
                      ? func.inputs.map(i => `${i.name ? i.name + ': ' : ''}${i.type}`).join(', ')
                      : ''
                    }) → {func.outputs.length > 0
                      ? func.outputs.map(o => o.type).join(', ')
                      : 'void'
                    }
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {inputMode === 'contract' && (
        <>
          <div className="form-group">
            <label>Solidity Contract Source:</label>
            <textarea
              placeholder="Paste your Solidity contract source code here..."
              value={contractSource}
              onChange={(e) => handleContractSourceChange(e.target.value)}
              rows={12}
            />
          </div>

          {parsedAbi.length > 0 && (
            <div className="form-group">
              <label>Select Function or Variable:</label>
              <select
                value={selectedFunction?.name || ''}
                onChange={(e) => {
                  const func = parsedAbi.find(f => f.name === e.target.value)
                  if (func) handleFunctionSelect(func)
                }}
              >
                <option value="">-- Select a function or variable --</option>
                {parsedAbi.map((func, index) => (
                  <option key={index} value={func.name}>
                    {func.name}({func.inputs.length > 0 
                      ? func.inputs.map(i => `${i.name ? i.name + ': ' : ''}${i.type}`).join(', ')
                      : ''
                    }) → {func.outputs.length > 0
                      ? func.outputs.map(o => o.type).join(', ')
                      : 'void'
                    }
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {selectedFunction && (selectedFunction.inputs.length > 0 || 
        (selectedFunction.outputs.length > 0 && selectedFunction.outputs[0].type.startsWith('mapping('))) && (
        <div className="form-group">
          <label>Function Arguments:</label>
          {(() => {
            // Build list of all input fields (expanding mapping types)
            const allFields: Array<{ label: string; type: string; paramIndex: number; fieldIndex: number }> = []
            let argIndex = 0
            
            selectedFunction.inputs.forEach((input, paramIndex) => {
              const fields = getInputFieldsForType(input.type)
              fields.forEach((field) => {
                allFields.push({
                  label: input.name ? `${input.name} - ${field.label}` : field.label,
                  type: field.type,
                  paramIndex,
                  fieldIndex: argIndex++
                })
              })
            })
            
            // For mapping state variables, add fields for keys
            if (selectedFunction.inputs.length === 0 && selectedFunction.outputs.length > 0) {
              const outputType = selectedFunction.outputs[0].type
              if (outputType.startsWith('mapping(')) {
                const keys = extractMappingKeys(outputType)
                keys.forEach((key, index) => {
                  allFields.push({
                    label: `Key ${index + 1} (${key})`,
                    type: key,
                    paramIndex: -1,
                    fieldIndex: argIndex++
                  })
                })
              }
            }
            
            return allFields.map((field, displayIndex) => (
              <div key={displayIndex} className="arg-input">
                <label>{field.label} ({field.type}):</label>
                <input
                  type="text"
                  value={functionArgs[field.fieldIndex] || ''}
                  onChange={(e) => {
                    const newArgs = [...functionArgs]
                    newArgs[field.fieldIndex] = e.target.value
                    setFunctionArgs(newArgs)
                  }}
                  placeholder={`Enter ${field.type}`}
                />
              </div>
            ))
          })()}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="warning-message">
          <strong>Warnings:</strong>
          <ul>
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <button
        className="query-button"
        onClick={executeQuery}
        disabled={!contractAddress || !selectedFunction || loading}
      >
        {loading ? 'Querying...' : 'Query Contract'}
      </button>

      {result && (
        <div className="result">
          <h3>Result:</h3>
          {result.map((item: any, index: number) => (
            <div key={index} className="result-item">
              <strong>{item.name}</strong> ({item.type}): <code>{item.value}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

