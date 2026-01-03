import { useState } from 'react'
import { ethers } from 'ethers'
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
  const [inputMode, setInputMode] = useState<'function' | 'abi'>('function')
  const [functionDefinition, setFunctionDefinition] = useState('')
  const [abiJson, setAbiJson] = useState('')
  const [parsedAbi, setParsedAbi] = useState<FunctionInfo[]>([])
  const [originalAbiItems, setOriginalAbiItems] = useState<any[]>([]) // Store original ABI items with full structure
  const [selectedFunction, setSelectedFunction] = useState<FunctionInfo | null>(null)
  const [selectedAbiItem, setSelectedAbiItem] = useState<any | null>(null) // Store original ABI item for selected function
  const [functionArgs, setFunctionArgs] = useState<string[]>([])
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    
    // Handle mapping types: mapping(address => uint256) balances
    // Also handles nested: mapping(address => mapping(uint256 => bool))
    const mappingResult = extractMappingType(trimmed)
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
    const match = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_\[\]]*)(?:\s+(\w+))?$/)
    if (match) {
      return {
        type: match[1].trim(),
        name: match[2] || ''
      }
    }
    
    // Fallback: treat entire string as type
    return {
      type: trimmed,
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
                             trimmed.includes('view') ? 'view' : 'view'
      
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
      
      // If it's a mapping type, extract keys as inputs
      const inputs: Array<{ name: string; type: string }> = []
      if (type.startsWith('mapping(')) {
        const keys = extractMappingKeys(type)
        keys.forEach((key, index) => {
          inputs.push({
            name: `key${index + 1}`,
            type: key
          })
        })
      }
      
      return {
        name,
        inputs,
        outputs: [{ name: 'value', type }],
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

  const functionInfoToAbi = (func: FunctionInfo) => {
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
      if (selectedAbiItem && inputMode === 'abi') {
        // Use the original ABI item which has full structure including components
        abiItem = selectedAbiItem
      } else {
        // Convert FunctionInfo to proper ABI format (for function definition mode)
        abiItem = functionInfoToAbi(selectedFunction)
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
          const expanded = expandTupleComponents(callResult, originalOutput.components, output?.name || '')
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
            // Expand tuple components - use output name if available, otherwise empty prefix
            const expanded = expandTupleComponents(value, originalOutput.components, output.name || '')
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
                setParsedAbi([])
                setOriginalAbiItems([])
                setSelectedFunction(null)
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
                setSelectedFunction(null)
                setSelectedAbiItem(null)
                setResult(null)
              }}
            />
            ABI JSON
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

