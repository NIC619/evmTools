import { useState } from 'react'
import { ethers } from 'ethers'
import { removeComments } from '../utils/solidity/commentRemover'
import { isMappingType, extractMappingKeys } from '../utils/solidity/mappingParser'
import './UploadSelectors.css'

type FunctionStatus = 'checking' | 'new' | 'known' | 'uploaded' | 'duplicate' | 'error'

interface ParsedFunction {
  original: string
  signature: string
  selector: string
  status: FunctionStatus
  error?: string
}

function extractFunctionDefs(input: string): string[] {
  const funcDefs: string[] = []
  let i = 0

  while (i < input.length) {
    const idx = input.indexOf('function', i)
    if (idx === -1) break

    // Check word boundaries
    if (idx > 0 && /\w/.test(input[idx - 1])) { i = idx + 1; continue }
    if (idx + 8 < input.length && /\w/.test(input[idx + 8])) { i = idx + 1; continue }

    let j = idx + 8
    while (j < input.length && /\s/.test(input[j])) j++

    // Read function name
    const nameStart = j
    while (j < input.length && /\w/.test(input[j])) j++
    if (j === nameStart) { i = idx + 8; continue }

    while (j < input.length && /\s/.test(input[j])) j++
    if (j >= input.length || input[j] !== '(') { i = idx + 8; continue }

    // Find matching closing paren for the parameter list
    let depth = 0
    let k = j
    while (k < input.length) {
      if (input[k] === '(') depth++
      else if (input[k] === ')') {
        depth--
        if (depth === 0) { k++; break }
      }
      k++
    }

    funcDefs.push(input.slice(idx, k).trim())
    i = k
  }

  return funcDefs
}

// Escape special regex characters in a string used as a regex pattern
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Resolve any custom type names within a type string, avoiding cycles
function resolveTypeStr(
  type: string,
  raw: Map<string, string>,
  sortedNames: string[],
  visiting: Set<string>
): string {
  let result = type
  for (const name of sortedNames) {
    if (visiting.has(name)) continue
    const re = new RegExp(`(?:\\w+\\.)*${escapeRegex(name)}\\b`, 'g')
    if (re.test(result)) {
      const replacement = resolveTypeStr(
        raw.get(name)!,
        raw,
        sortedNames,
        new Set([...visiting, name])
      )
      result = result.replace(new RegExp(`(?:\\w+\\.)*${escapeRegex(name)}\\b`, 'g'), replacement)
    }
  }
  return result
}

// Build a map of custom type name → canonical ABI type from struct/type declarations
function buildTypeMap(input: string): Map<string, string> {
  const raw = new Map<string, string>()

  // type X is Y  (user-defined value types)
  const aliasRe = /\btype\s+(\w+)\s+is\s+(\w+)\s*;/g
  let m: RegExpExecArray | null
  while ((m = aliasRe.exec(input)) !== null) {
    raw.set(m[1], m[2])
  }

  // struct X { type1 field1; type2 field2; ... }
  const structRe = /\bstruct\s+(\w+)\s*\{([^}]*)\}/g
  while ((m = structRe.exec(input)) !== null) {
    const name = m[1]
    const fields = m[2]
      .split(';')
      .map((f) => f.trim())
      .filter((f) => f.length > 0)
      .map((f) => {
        // Strip the field name (last identifier) to get just the type
        const typeMatch = f.match(/^(.*?)\s+\w+\s*$/)
        return typeMatch ? typeMatch[1].trim() : f.trim()
      })
      .filter((f) => f.length > 0)
    if (fields.length > 0) {
      raw.set(name, `(${fields.join(',')})`)
    }
  }

  if (raw.size === 0) return raw

  // Resolve custom types referenced inside struct fields / aliases
  const sortedNames = [...raw.keys()].sort((a, b) => b.length - a.length)
  const resolved = new Map<string, string>()
  for (const [name, type] of raw) {
    resolved.set(name, resolveTypeStr(type, raw, sortedNames, new Set([name])))
  }
  return resolved
}

// Replace all custom type names in a function definition with their ABI equivalents.
// Also handles qualified names like IProverRegistry.Poe → consumes the prefix too.
function applyTypeMap(funcDef: string, typeMap: Map<string, string>): string {
  if (typeMap.size === 0) return funcDef
  const sortedNames = [...typeMap.keys()].sort((a, b) => b.length - a.length)
  let result = funcDef
  for (const name of sortedNames) {
    // Match bare "Name" or qualified "Prefix.Name" (any depth: A.B.Name)
    const re = new RegExp(`(?:\\w+\\.)*${escapeRegex(name)}\\b`, 'g')
    result = result.replace(re, typeMap.get(name)!)
  }
  return result
}

// Solidity keywords that can appear between visibility and the variable name
const VISIBILITY_MODIFIERS = new Set(['immutable', 'constant', 'override', 'virtual'])

// Derive the getter parameter list from a Solidity state variable type
function getGetterParams(type: string): string {
  const t = type.trim()
  if (isMappingType(t)) return extractMappingKeys(t).join(',')
  if (/\[\d*\]$/.test(t)) return 'uint256'
  return ''
}

// Extract public state variable getters (e.g. "address public foo;" → "foo()")
function extractPublicVarGetters(input: string, typeMap: Map<string, string>): ParsedFunction[] {
  const results: ParsedFunction[] = []

  for (const rawLine of input.split('\n')) {
    const line = rawLine.trim()
    if (!line.includes(';')) continue
    if (!/\bpublic\b/.test(line)) continue
    // Skip declarations that are function/event/modifier/etc.
    if (/^(function|event|modifier|error|struct|enum|constructor|receive|fallback)\b/.test(line)) continue

    const pubMatch = line.match(/\bpublic\b/)
    if (!pubMatch || pubMatch.index === undefined) continue

    // Type is everything before "public"
    const typePart = line.slice(0, pubMatch.index).trim()
    if (!typePart) continue

    // After "public", skip optional modifiers to find the variable name
    const afterPublic = line.slice(pubMatch.index + 6).trim()
    const tokens = afterPublic.split(/\s+/)
    let nameIdx = 0
    while (nameIdx < tokens.length && VISIBILITY_MODIFIERS.has(tokens[nameIdx])) nameIdx++
    if (nameIdx >= tokens.length) continue

    // Strip any trailing ; or = from the name token
    const varName = tokens[nameIdx].replace(/[;=()\s].*/, '')
    if (!varName || !/^\w+$/.test(varName)) continue

    // Resolve custom types in the type part, then derive getter params
    const resolvedType = applyTypeMap(typePart, typeMap)
    const params = getGetterParams(resolvedType)
    const sig = `function ${varName}(${params})`

    try {
      const fragment = ethers.FunctionFragment.from(sig)
      results.push({
        original: line,
        signature: fragment.format(),
        selector: fragment.selector,
        status: 'checking',
      })
    } catch {
      // Unparseable — skip silently
    }
  }

  return results
}

function parseInput(input: string): ParsedFunction[] {
  const stripped = removeComments(input)
  const typeMap = buildTypeMap(stripped)
  const funcDefs = extractFunctionDefs(stripped)

  const fromFunctions = funcDefs.map((def) => {
    try {
      const resolved = applyTypeMap(def, typeMap)
      const fragment = ethers.FunctionFragment.from(resolved)
      return {
        original: def,
        signature: fragment.format(),
        selector: fragment.selector,
        status: 'checking' as const,
      }
    } catch (e: any) {
      return {
        original: def,
        signature: '',
        selector: '',
        status: 'error' as const,
        error: e.message || 'Failed to parse',
      }
    }
  })

  const fromVars = extractPublicVarGetters(stripped, typeMap)

  if (fromFunctions.length > 0 || fromVars.length > 0) {
    return [...fromFunctions, ...fromVars]
  }

  // Fallback: no `function` keyword and no public vars — try each line as a bare signature
  return stripped
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.includes('('))
    .map((def) => {
      try {
        const fragment = ethers.FunctionFragment.from(def)
        return {
          original: def,
          signature: fragment.format(),
          selector: fragment.selector,
          status: 'checking' as const,
        }
      } catch (e: any) {
        return {
          original: def,
          signature: '',
          selector: '',
          status: 'error' as const,
          error: e.message || 'Failed to parse',
        }
      }
    })
}

async function checkSelector(selector: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.4byte.sourcify.dev/signature-database/v1/lookup?function=${selector}`
    )
    const data = await res.json()
    if (!data.ok || !data.result?.function) return false
    const selectorKey = Object.keys(data.result.function)[0]
    return !!(selectorKey && data.result.function[selectorKey]?.length > 0)
  } catch {
    return false
  }
}

export function UploadSelectors() {
  const [input, setInput] = useState('')
  const [parsed, setParsed] = useState<ParsedFunction[]>([])
  const [uploading, setUploading] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadDone, setUploadDone] = useState(false)

  const handleParse = async () => {
    setParseError(null)
    setUploadError(null)
    setUploadDone(false)

    const results = parseInput(input)

    if (results.length === 0) {
      setParseError('No function definitions found in input.')
      setParsed([])
      return
    }

    setParsed(results)

    // Check each valid selector against the DB in parallel
    const toCheck = results.filter((f) => f.status === 'checking' && f.selector)

    const checks = toCheck.map(async (f) => {
      const found = await checkSelector(f.selector)
      return { signature: f.signature, status: (found ? 'known' : 'new') as FunctionStatus }
    })

    const checkResults = await Promise.all(checks)
    const statusMap = new Map(checkResults.map((r) => [r.signature, r.status]))

    setParsed((prev) =>
      prev.map((f) => {
        if (f.status !== 'checking') return f
        return { ...f, status: statusMap.get(f.signature) ?? 'new' }
      })
    )
  }

  const handleUpload = async () => {
    const toUpload = parsed.filter((f) => f.status === 'new' && f.signature)
    if (toUpload.length === 0) return

    setUploading(true)
    setUploadError(null)

    try {
      const signatures = toUpload.map((f) => f.signature)

      const response = await fetch('https://api.4byte.sourcify.dev/signature-database/v1/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ function: signatures, event: [] }),
      })

      const data = await response.json()

      if (!data.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      // API returns objects keyed by signature, not arrays
      const imported = new Set(Object.keys(data.result?.function?.imported ?? {}))
      const duplicated = new Set(Object.keys(data.result?.function?.duplicated ?? {}))
      const invalid: string[] = data.result?.function?.invalid ?? []

      setParsed((prev) =>
        prev.map((f) => {
          if (f.status !== 'new') return f
          if (imported.has(f.signature)) return { ...f, status: 'uploaded' }
          if (duplicated.has(f.signature)) return { ...f, status: 'duplicate' }
          if (invalid.includes(f.signature)) return { ...f, status: 'error', error: 'Server rejected' }
          return f
        })
      )

      setUploadDone(true)
    } catch (e: any) {
      setUploadError(e.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const checking = parsed.some((f) => f.status === 'checking')
  const newCount = parsed.filter((f) => f.status === 'new').length
  const hasParsed = parsed.length > 0

  return (
    <div className="upload-selectors">
      <h2>Upload Function Selectors</h2>

      <div className="form-group">
        <label htmlFor="selectors-input">Contract Code or Function Definitions</label>
        <textarea
          id="selectors-input"
          placeholder={
            'Paste a full Solidity contract or individual function definitions, e.g.:\n\n' +
            'function transfer(address recipient, uint256 amount) external returns (bool)\n' +
            'function balanceOf(address account) external view returns (uint256)'
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={8}
        />
        <div className="help-text">
          Accepts full contracts or bare function signatures. Selectors are uploaded to{' '}
          <a href="https://4byte.sourcify.dev" target="_blank" rel="noopener noreferrer">
            4byte.sourcify.dev
          </a>
          .
        </div>
      </div>

      <button type="button" className="parse-button" onClick={handleParse} disabled={!input.trim() || checking}>
        Parse Functions
      </button>

      {parseError && <div className="error-message">{parseError}</div>}

      {hasParsed && (
        <div className="result">
          <div className="result-header">
            <h3>
              {parsed.length} function{parsed.length !== 1 ? 's' : ''} found
            </h3>
            {!checking && newCount > 0 && (
              <button
                type="button"
                className="upload-button"
                onClick={handleUpload}
                disabled={uploading || uploadDone}
              >
                {uploading
                  ? 'Uploading...'
                  : uploadDone
                  ? 'Done'
                  : `Upload ${newCount} new to Database`}
              </button>
            )}
          </div>

          {uploadError && <div className="error-message">{uploadError}</div>}

          <div className="selectors-list">
            {parsed.map((f, idx) => (
              <div key={idx} className={`selector-item status-${f.status}`}>
                <div className="selector-item-main">
                  <code className="selector-sig">{f.signature || f.original}</code>
                  {f.selector && <span className="selector-badge">{f.selector}</span>}
                </div>
                {f.status === 'checking' && (
                  <span className="status-label status-checking">Checking…</span>
                )}
                {f.status === 'known' && (
                  <span className="status-label status-known">Already in DB</span>
                )}
                {f.status === 'uploaded' && (
                  <span className="status-label status-success">Uploaded</span>
                )}
                {f.status === 'duplicate' && (
                  <span className="status-label status-known">Already in DB</span>
                )}
                {f.status === 'error' && (
                  <span className="status-label status-error" title={f.error}>
                    {f.error && f.error.length > 60
                      ? f.error.slice(0, 60) + '…'
                      : f.error || 'Parse error'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
