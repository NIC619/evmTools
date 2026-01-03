import { useState } from 'react'
import { ethers } from 'ethers'
import './ParseCalldata.css'

interface ParseCalldataProps {
  rpcUrl?: string
}


interface DecodedResult {
  selector: string
  signatures: string[]
  selectedSignature: string | null
  decodedParams: Array<{ name: string; type: string; value: any }> | null
  error?: string
}

export function ParseCalldata({ rpcUrl: _rpcUrl }: ParseCalldataProps) {
  const [calldata, setCalldata] = useState('')
  const [result, setResult] = useState<DecodedResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lookupFunctionSignature = async (selector: string): Promise<string[]> => {
    try {
      // Normalize selector (ensure it has 0x prefix and is lowercase)
      const normalizedSelector = selector.startsWith('0x') ? selector.toLowerCase() : `0x${selector.toLowerCase()}`
      
      // Use openchain.xyz API (same as Foundry's cast 4byte)
      const response = await fetch(`https://api.4byte.sourcify.dev/signature-database/v1/lookup?function=${normalizedSelector}`)
      const data = await response.json()
      
      if (data.ok && data.result && data.result.function) {
        // The API returns function signatures keyed by selector
        // Structure: { "0xd8f7b946": [{ name: "...", ... }] }
        const selectorKey = Object.keys(data.result.function)[0]
        if (selectorKey && data.result.function[selectorKey]) {
          const signatures = data.result.function[selectorKey].map((sig: any) => sig.name)
          if (signatures.length > 0) {
            return signatures
          }
        }
      }
      
      // Fallback to 4byte.directory
      const response2 = await fetch(`https://www.4byte.directory/api/v1/signatures/?hex_signature=${normalizedSelector}`)
      const data2 = await response2.json()
      
      if (data2.results && data2.results.length > 0) {
        return data2.results.map((sig: any) => sig.text_signature)
      }
      
      return []
    } catch (e) {
      console.error('Error looking up signature:', e)
      return []
    }
  }

  // Helper function to format a value for display
  const formatValue = (value: any): string => {
    if (value === null || value === undefined) {
      return 'null'
    } else if (typeof value === 'bigint') {
      return value.toString()
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      return JSON.stringify(value, (_, v) => 
        typeof v === 'bigint' ? v.toString() : v
      )
    } else if (Array.isArray(value)) {
      return JSON.stringify(value, (_, v) => 
        typeof v === 'bigint' ? v.toString() : v
      )
    } else {
      return String(value)
    }
  }

  // Helper function to parse tuple type string and extract components
  const parseTupleComponents = (typeString: string): Array<{ name: string; type: string }> | null => {
    // Match tuple(type1,type2,...) or tuple(type1,type2,...)[]
    const tupleMatch = typeString.match(/^tuple\(([^)]+)\)/)
    if (!tupleMatch) return null
    
    const innerTypes = tupleMatch[1]
    const components: Array<{ name: string; type: string }> = []
    
    // Parse the inner types, handling nested tuples
    let depth = 0
    let currentType = ''
    let i = 0
    
    while (i < innerTypes.length) {
      const char = innerTypes[i]
      if (char === '(') {
        depth++
        currentType += char
      } else if (char === ')') {
        depth--
        currentType += char
      } else if (char === ',' && depth === 0) {
        if (currentType.trim()) {
          components.push({ name: '', type: currentType.trim() })
        }
        currentType = ''
      } else {
        currentType += char
      }
      i++
    }
    
    if (currentType.trim()) {
      components.push({ name: '', type: currentType.trim() })
    }
    
    return components.length > 0 ? components : null
  }

  // Helper function to expand tuple components recursively
  const expandTupleComponents = (value: any, components: readonly any[], prefix: string = ''): Array<{ name: string; type: string; value: any }> => {
    const results: Array<{ name: string; type: string; value: any }> = []
    
    if (!value || typeof value !== 'object') {
      console.log('expandTupleComponents: value is not an object', value)
      return results
    }
    
    console.log('expandTupleComponents called with:', {
      prefix,
      componentsCount: components.length,
      valueType: typeof value,
      isArray: Array.isArray(value),
      valueLength: value.length
    })
    
    // ethers.js returns tuples as objects with both named properties and array-like access
    components.forEach((component, index) => {
      // Use index-based name if component has no name (common for unnamed tuple components)
      const componentName = component.name || (prefix ? `${index}` : `item${index}`)
      const componentType = component.type || ''
      // For unnamed components, use dot notation only if we have a prefix, otherwise just use the index
      const fullName = prefix 
        ? (component.name ? `${prefix}.${componentName}` : `${prefix}[${index}]`)
        : componentName
      
      // Try multiple ways to access the value
      let componentValue: any = undefined
      
      // Result objects are array-like, so access by index
      if (Array.isArray(value) || (typeof value.length === 'number' && index < value.length)) {
        componentValue = value[index]
        console.log(`  Component ${index} (${componentType}):`, componentValue)
      } else {
        // Try by name first
        if (componentName && componentName !== `item${index}`) {
          try {
            componentValue = value[componentName]
          } catch (e) {
            // Ignore errors
          }
        }
        
        // If name access didn't work, try by index
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
      
      // Check if this component is an array of tuples (e.g., tuple(bytes,address,uint256)[])
      const isArrayOfTuples = (componentType.startsWith('tuple[') || componentType.match(/^tuple\([^)]+\)\[/)) && Array.isArray(componentValue)
      
      if (isArrayOfTuples) {
        // Array of tuples - expand each element
        // Try to get components from the component object, or parse from type string
        let tupleComponents = component.components
        if (!tupleComponents) {
          // Parse the tuple type from the string (e.g., "tuple(bytes,address,uint256)[]" -> "tuple(bytes,address,uint256)")
          const baseType = componentType.replace(/\[\]$/, '')
          tupleComponents = parseTupleComponents(baseType)
        }
        
        componentValue.forEach((item: any, itemIndex: number) => {
          // Result objects are array-like but represent tuples
          if (tupleComponents && item && typeof item === 'object') {
            const expanded = expandTupleComponents(item, tupleComponents, `${fullName}[${itemIndex}]`)
            if (expanded.length > 0) {
              results.push(...expanded)
            } else {
              results.push({
                name: `${fullName}[${itemIndex}]`,
                type: componentType,
                value: formatValue(item)
              })
            }
          } else {
            results.push({
              name: `${fullName}[${itemIndex}]`,
              type: componentType,
              value: formatValue(item)
            })
          }
        })
      } else {
        // Regular component
        results.push({
          name: fullName,
          type: componentType,
          value: formatValue(componentValue)
        })
      }
    })
    
    return results
  }

  // Helper function to parse parameters from function signature, handling nested tuples
  const parseParameters = (paramsStr: string): { types: string[], names: string[] } => {
    const types: string[] = []
    const names: string[] = []
    
    if (!paramsStr.trim()) {
      return { types, names }
    }
    
    let depth = 0
    let currentParam = ''
    let i = 0
    
    while (i < paramsStr.length) {
      const char = paramsStr[i]
      
      if (char === '(') {
        depth++
        currentParam += char
      } else if (char === ')') {
        depth--
        currentParam += char
      } else if (char === ',' && depth === 0) {
        // We're at the top level, this is a parameter separator
        const trimmed = currentParam.trim()
        if (trimmed) {
          // Handle named parameters: "uint256 amount" or just "uint256"
          const paramMatch = trimmed.match(/^(.+?)(?:\s+(\w+))$/)
          if (paramMatch) {
            types.push(paramMatch[1].trim())
            names.push(paramMatch[2].trim())
          } else {
            types.push(trimmed)
            names.push('')
          }
        }
        currentParam = ''
      } else {
        currentParam += char
      }
      i++
    }
    
    // Handle the last parameter
    if (currentParam.trim()) {
      const trimmed = currentParam.trim()
      const paramMatch = trimmed.match(/^(.+?)(?:\s+(\w+))$/)
      if (paramMatch) {
        types.push(paramMatch[1].trim())
        names.push(paramMatch[2].trim())
      } else {
        types.push(trimmed)
        names.push('')
      }
    }
    
    return { types, names }
  }

  const decodeParameters = (signature: string, calldataHex: string): Array<{ name: string; type: string; value: any }> | null => {
    try {
      // Parse the function signature to extract name and types
      // Handle nested parentheses by matching everything after the first (
      const match = signature.match(/^(\w+)\((.*)\)$/)
      if (!match) {
        console.error('Failed to parse function signature:', signature)
        return null
      }

      const functionName = match[1]
      const paramsStr = match[2]
      
      // Parse parameters with proper handling of nested tuples
      const { types: paramTypes, names: paramNames } = parseParameters(paramsStr)

      // Create an interface for this function
      const interfaceString = `function ${functionName}(${paramTypes.join(',')})`
      console.log('Creating interface with:', interfaceString)
      const iface = new ethers.Interface([interfaceString])
      
      // Get the function fragment to access ABI components
      const fragment = iface.getFunction(functionName)
      if (!fragment) {
        throw new Error('Function fragment not found')
      }
      
      // Decode the calldata using decodeFunctionData
      console.log('Decoding with function name:', functionName)
      console.log('Calldata selector:', calldataHex.slice(0, 10))
      const decoded = iface.decodeFunctionData(functionName, calldataHex)
      console.log('Decoding successful, got', decoded.length, 'arguments')
      
      // Format the decoded parameters with tuple expansion
      const decodedParams: Array<{ name: string; type: string; value: any }> = []
      if (decoded) {
        // decoded is an array of arguments
        const argsArray = Array.isArray(decoded) ? decoded : [decoded]
        argsArray.forEach((arg, index) => {
          const paramType = paramTypes[index] || 'unknown'
          const paramName = paramNames[index] || `param${index}`
          const input = fragment.inputs[index]
          
          // Check if this is a tuple type (type can be 'tuple' or 'tuple(...)')
          // Note: ethers.js Result objects are array-like but represent tuples, not arrays
          // A tuple type ends with ')' or is just 'tuple', while array types end with '[]'
          const isTupleType = input && (input.type === 'tuple' || (input.type.startsWith('tuple(') && !input.type.endsWith('[]')))
          const isArrayOfTuples = input && (input.type.startsWith('tuple[') || (input.type.startsWith('tuple(') && input.type.endsWith('[]')))
          
          console.log(`Processing param ${index}:`, {
            paramName,
            paramType,
            inputType: input?.type,
            isTupleType,
            isArrayOfTuples,
            hasComponents: !!input?.components,
            argType: typeof arg,
            isArray: Array.isArray(arg)
          })
          
          if (isTupleType && input.components && arg && typeof arg === 'object') {
            // Expand tuple recursively
            // Even though Result is array-like, it represents a single tuple
            console.log('Expanding tuple with components:', input.components.map(c => c.type))
            const expanded = expandTupleComponents(arg, input.components, paramName)
            console.log('Expanded result:', expanded.length, 'items')
            if (expanded.length > 0) {
              decodedParams.push(...expanded)
            } else {
              console.log('Expansion failed, using JSON fallback')
              // Fallback to JSON if expansion fails
              decodedParams.push({
                name: paramName,
                type: paramType,
                value: JSON.stringify(arg, (_, value) => 
                  typeof value === 'bigint' ? value.toString() : value
                )
              })
            }
          } else if (isArrayOfTuples && Array.isArray(arg)) {
            // Array of tuples - expand each element
            arg.forEach((item: any, itemIndex: number) => {
              if (input.components && item && typeof item === 'object') {
                const expanded = expandTupleComponents(item, input.components, `${paramName}[${itemIndex}]`)
                if (expanded.length > 0) {
                  decodedParams.push(...expanded)
                } else {
                  decodedParams.push({
                    name: `${paramName}[${itemIndex}]`,
                    type: input.type,
                    value: JSON.stringify(item, (_, value) => 
                      typeof value === 'bigint' ? value.toString() : value
                    )
                  })
                }
              } else {
                decodedParams.push({
                  name: `${paramName}[${itemIndex}]`,
                  type: input.type,
                  value: formatValue(item)
                })
              }
            })
          } else {
            // Regular parameter
            decodedParams.push({
              name: paramName,
              type: paramType,
              value: formatValue(arg)
            })
          }
        })
      }
      
      return decodedParams
    } catch (e: any) {
      console.error('Error decoding parameters:', e)
      console.error('Signature:', signature)
      console.error('Calldata length:', calldataHex.length)
      // Re-throw to get better error messages
      throw e
    }
  }

  const parseCalldata = async () => {
    if (!calldata) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      // Normalize calldata (remove whitespace, ensure 0x prefix)
      const normalized = calldata.trim().replace(/\s+/g, '')
      const calldataHex = normalized.startsWith('0x') ? normalized : `0x${normalized}`

      // Validate calldata format
      if (!/^0x[0-9a-fA-F]+$/.test(calldataHex)) {
        throw new Error('Invalid calldata format. Must be a hexadecimal string.')
      }

      if (calldataHex.length < 10) {
        throw new Error('Calldata too short. Must be at least 4 bytes (8 hex characters) for selector.')
      }

      // Extract function selector (first 4 bytes = 8 hex characters + 0x)
      const selector = calldataHex.slice(0, 10)

      // Look up function signatures
      const signatures = await lookupFunctionSignature(selector)

      if (signatures.length === 0) {
        setResult({
          selector,
          signatures: [],
          selectedSignature: null,
          decodedParams: null,
          error: 'Function signature not found in database'
        })
        setLoading(false)
        return
      }

      // Try to decode with the first signature
      let decodedParams: Array<{ name: string; type: string; value: any }> | null = null
      let selectedSignature: string | null = signatures[0]
      let decodeError: string | undefined = undefined

      try {
        decodedParams = decodeParameters(signatures[0], calldataHex)
        if (!decodedParams) {
          decodeError = 'Failed to decode parameters. The signature may not match the calldata, or the parameters may be incorrectly encoded.'
        }
      } catch (e: any) {
        decodeError = e.message || `Failed to decode parameters: ${e.toString()}`
        console.error('Decode error details:', e)
      }

      setResult({
        selector,
        signatures,
        selectedSignature,
        decodedParams,
        error: decodeError
      })
    } catch (e: any) {
      setError(e.message || 'Failed to parse calldata')
    } finally {
      setLoading(false)
    }
  }

  const handleSignatureSelect = (signature: string) => {
    if (!result || !calldata) return

    const normalized = calldata.trim().replace(/\s+/g, '')
    const calldataHex = normalized.startsWith('0x') ? normalized : `0x${normalized}`

    let decodedParams: Array<{ name: string; type: string; value: any }> | null = null
    let decodeError: string | undefined = undefined

    try {
      decodedParams = decodeParameters(signature, calldataHex)
      if (!decodedParams) {
        decodeError = 'Failed to decode parameters. The signature may not match the calldata, or the parameters may be incorrectly encoded.'
      }
    } catch (e: any) {
      decodeError = e.message || `Failed to decode parameters: ${e.toString()}`
      console.error('Decode error details:', e)
    }

    setResult({
      ...result,
      selectedSignature: signature,
      decodedParams,
      error: decodeError
    })
  }

  return (
    <div className="parse-calldata">
      <h2>Parse Calldata</h2>
      
      <div className="form-group">
        <label htmlFor="calldata-input">Raw Calldata</label>
        <textarea
          id="calldata-input"
          placeholder="0xa9059cbb000000000000000000000000..."
          value={calldata}
          onChange={(e) => setCalldata(e.target.value)}
          rows={3}
        />
        <div className="help-text">
          Enter raw calldata (hex string starting with 0x)
        </div>
      </div>

      <button
        className="parse-button"
        onClick={parseCalldata}
        disabled={!calldata || loading}
      >
        {loading ? 'Parsing...' : 'Parse Calldata'}
      </button>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {result && (
        <div className="result">
          <h3>Result:</h3>
          
          <div className="result-section">
            <div className="result-label">Function Selector:</div>
            <code className="selector">{result.selector}</code>
          </div>

          {result.signatures.length > 0 && (
            <>
              <div className="result-section">
                <div className="result-label">Function Signatures:</div>
                <div className="signatures-list">
                  {result.signatures.map((sig, index) => (
                    <div
                      key={index}
                      className={`signature-item ${result.selectedSignature === sig ? 'selected' : ''}`}
                      onClick={() => handleSignatureSelect(sig)}
                    >
                      <code>{sig}</code>
                    </div>
                  ))}
                </div>
              </div>

              {result.decodedParams && result.decodedParams.length > 0 && (
                <div className="result-section">
                  <div className="result-label">Decoded Parameters:</div>
                  <div className="parameters-list">
                    {(() => {
                      // Group parameters by their top-level param name
                      const groupedParams = new Map<string, Array<{ param: typeof result.decodedParams[0], index: number }>>()
                      
                      result.decodedParams.forEach((param, index) => {
                        const name = param.name || `param${index}`
                        const topLevelMatch = name.match(/^(param\d+)/)
                        const topLevelParam = topLevelMatch ? topLevelMatch[1] : name
                        
                        if (!groupedParams.has(topLevelParam)) {
                          groupedParams.set(topLevelParam, [])
                        }
                        groupedParams.get(topLevelParam)!.push({ param, index })
                      })
                      
                      // Render grouped parameters
                      return Array.from(groupedParams.entries()).map(([topLevelParam, params]) => {
                        const hasNestedValues = params.some(({ param }) => {
                          const name = param.name || ''
                          return name.includes('[') || name.includes('.')
                        })
                        
                        // If this is a top-level param with nested values, wrap in a container
                        // Also handle case where param0 itself might not be in the list, only its nested values
                        if (hasNestedValues) {
                          // Find if there's a param entry that matches the top-level name exactly
                          const topLevelEntry = params.find(({ param }) => {
                            const name = param.name || ''
                            return name === topLevelParam
                          })
                          
                          return (
                            <div key={topLevelParam} className="parameter-group">
                              {topLevelEntry ? (
                                <div className="parameter-item parameter-top-level">
                                  <div className="parameter-name">
                                    <strong>{topLevelParam}</strong>
                                    <span className="parameter-type">({topLevelEntry.param.type})</span>
                                  </div>
                                  {topLevelEntry.param.value && (
                                    <div className="parameter-value">
                                      <code>{topLevelEntry.param.value}</code>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="parameter-item parameter-top-level">
                                  <div className="parameter-name">
                                    <strong>{topLevelParam}</strong>
                                    <span className="parameter-type">(tuple)</span>
                                  </div>
                                </div>
                              )}
                              <div className="parameter-group-nested">
                                {params
                                  .filter(({ param }) => {
                                    const name = param.name || ''
                                    return name !== topLevelParam && (name.includes('[') || name.includes('.'))
                                  })
                                  .map(({ param, index }) => {
                                    const name = param.name || `param${index}`
                                    const paramNestingLevel = (name.match(/\[/g) || []).length
                                    const isNested = paramNestingLevel > 0
                                    
                                    return (
                                      <div 
                                        key={index} 
                                        className={`parameter-item ${isNested ? 'parameter-nested' : ''}`}
                                        data-nesting-level={paramNestingLevel}
                                      >
                                        <div className="parameter-name">
                                          <strong>{name}</strong>
                                          <span className="parameter-type">({param.type})</span>
                                        </div>
                                        <div className="parameter-value">
                                          <code>{param.value}</code>
                                        </div>
                                      </div>
                                    )
                                  })}
                              </div>
                            </div>
                          )
                        } else {
                          // Regular parameter (no nesting or single value)
                          return params.map(({ param, index }) => {
                            const name = param.name || `param${index}`
                            const paramNestingLevel = (name.match(/\[/g) || []).length
                            const isTopLevel = !name.includes('[') && !name.includes('.')
                            const isNested = paramNestingLevel > 0
                            
                            return (
                              <div 
                                key={index} 
                                className={`parameter-item ${isTopLevel ? 'parameter-top-level' : ''} ${isNested ? 'parameter-nested' : ''}`}
                                data-nesting-level={paramNestingLevel}
                              >
                                <div className="parameter-name">
                                  <strong>{name}</strong>
                                  <span className="parameter-type">({param.type})</span>
                                </div>
                                <div className="parameter-value">
                                  <code>{param.value}</code>
                                </div>
                              </div>
                            )
                          })
                        }
                      })
                    })()}
                  </div>
                </div>
              )}

              {result.error && (
                <div className="error-message">
                  {result.error}
                </div>
              )}
            </>
          )}

          {result.signatures.length === 0 && (
            <div className="warning-message">
              No function signatures found for this selector. The function may be unknown or the selector may be incorrect.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

