import { describe, it, expect } from 'vitest'
import {
  extractMappingType,
  extractMappingValueType,
  extractMappingKeys,
  isMappingType,
  parseMappingStructure
} from '../mappingParser'

describe('extractMappingType', () => {
  it('extracts simple mapping type', () => {
    const input = 'mapping(address => uint256) public balances'
    const result = extractMappingType(input)
    expect(result).toEqual({
      type: 'mapping(address => uint256)',
      remainder: 'public balances'
    })
  })

  it('extracts nested mapping type', () => {
    const input = 'mapping(address => mapping(uint256 => bool)) public data'
    const result = extractMappingType(input)
    expect(result).toEqual({
      type: 'mapping(address => mapping(uint256 => bool))',
      remainder: 'public data'
    })
  })

  it('returns null for non-mapping types', () => {
    const input = 'uint256 public value'
    const result = extractMappingType(input)
    expect(result).toBeNull()
  })

  it('handles mapping with no remainder', () => {
    const input = 'mapping(address => uint256)'
    const result = extractMappingType(input)
    expect(result).toEqual({
      type: 'mapping(address => uint256)',
      remainder: ''
    })
  })
})

describe('extractMappingValueType', () => {
  it('extracts value type from simple mapping', () => {
    const input = 'mapping(address => uint256)'
    const result = extractMappingValueType(input)
    expect(result).toBe('uint256')
  })

  it('extracts nested mapping as value type', () => {
    const input = 'mapping(address => mapping(uint256 => bool))'
    const result = extractMappingValueType(input)
    expect(result).toBe('mapping(uint256 => bool)')
  })

  it('returns input for non-mapping types', () => {
    const input = 'uint256'
    const result = extractMappingValueType(input)
    expect(result).toBe('uint256')
  })

  it('handles complex value types', () => {
    const input = 'mapping(address => uint256[])'
    const result = extractMappingValueType(input)
    expect(result).toBe('uint256[]')
  })

  it('handles struct value types', () => {
    const input = 'mapping(address => MyStruct)'
    const result = extractMappingValueType(input)
    expect(result).toBe('MyStruct')
  })
})

describe('extractMappingKeys', () => {
  it('extracts single key from simple mapping', () => {
    const input = 'mapping(address => uint256)'
    const result = extractMappingKeys(input)
    expect(result).toEqual(['address'])
  })

  it('extracts multiple keys from nested mappings', () => {
    const input = 'mapping(address => mapping(uint256 => bool))'
    const result = extractMappingKeys(input)
    expect(result).toEqual(['address', 'uint256'])
  })

  it('extracts keys from deeply nested mappings', () => {
    const input = 'mapping(address => mapping(uint256 => mapping(bytes32 => bool)))'
    const result = extractMappingKeys(input)
    expect(result).toEqual(['address', 'uint256', 'bytes32'])
  })

  it('returns empty array for non-mapping types', () => {
    const input = 'uint256'
    const result = extractMappingKeys(input)
    expect(result).toEqual([])
  })
})

describe('isMappingType', () => {
  it('returns true for mapping types', () => {
    expect(isMappingType('mapping(address => uint256)')).toBe(true)
    expect(isMappingType('  mapping(address => uint256)')).toBe(true)
  })

  it('returns false for non-mapping types', () => {
    expect(isMappingType('uint256')).toBe(false)
    expect(isMappingType('address')).toBe(false)
    expect(isMappingType('MyStruct')).toBe(false)
  })

  it('returns true for nested mappings', () => {
    expect(isMappingType('mapping(address => mapping(uint256 => bool))')).toBe(true)
  })

  it('returns true for array of mappings', () => {
    expect(isMappingType('mapping(address => uint256)[]')).toBe(true)
  })
})

describe('parseMappingStructure', () => {
  it('parses simple mapping structure', () => {
    const input = 'mapping(address => uint256)'
    const result = parseMappingStructure(input)
    expect(result).toEqual({
      keys: ['address'],
      valueType: 'uint256',
      isArray: false
    })
  })

  it('parses nested mapping structure', () => {
    const input = 'mapping(address => mapping(uint256 => bool))'
    const result = parseMappingStructure(input)
    expect(result).toEqual({
      keys: ['address', 'uint256'],
      valueType: 'bool',
      isArray: false
    })
  })

  it('parses deeply nested mapping structure', () => {
    const input = 'mapping(address => mapping(uint256 => mapping(bytes32 => string)))'
    const result = parseMappingStructure(input)
    expect(result).toEqual({
      keys: ['address', 'uint256', 'bytes32'],
      valueType: 'string',
      isArray: false
    })
  })

  it('detects array of mappings', () => {
    const input = 'mapping(address => uint256)[]'
    const result = parseMappingStructure(input)
    expect(result).toEqual({
      keys: ['address'],
      valueType: 'uint256',
      isArray: true
    })
  })

  it('returns null for non-mapping types', () => {
    const input = 'uint256'
    const result = parseMappingStructure(input)
    expect(result).toBeNull()
  })

  it('handles complex value types in nested mappings', () => {
    const input = 'mapping(address => mapping(uint256 => uint256[]))'
    const result = parseMappingStructure(input)
    expect(result).toEqual({
      keys: ['address', 'uint256'],
      valueType: 'uint256[]',
      isArray: false
    })
  })

  it('handles struct value types', () => {
    const input = 'mapping(address => MyStruct)'
    const result = parseMappingStructure(input)
    expect(result).toEqual({
      keys: ['address'],
      valueType: 'MyStruct',
      isArray: false
    })
  })
})
