import { describe, it, expect } from 'vitest'
import {
  parseParamOrReturn,
  splitByComma,
  normalizeType,
  isCustomType
} from '../parameterParser'

describe('parseParamOrReturn', () => {
  describe('Simple types', () => {
    it('parses type with name', () => {
      const result = parseParamOrReturn('uint256 amount')
      expect(result).toEqual({ type: 'uint256', name: 'amount' })
    })

    it('parses type without name', () => {
      const result = parseParamOrReturn('uint256')
      expect(result).toEqual({ type: 'uint256', name: '' })
    })

    it('parses array types', () => {
      const result = parseParamOrReturn('uint256[] values')
      expect(result).toEqual({ type: 'uint256[]', name: 'values' })
    })

    it('parses multi-dimensional arrays', () => {
      const result = parseParamOrReturn('uint256[][] matrix')
      expect(result).toEqual({ type: 'uint256[][]', name: 'matrix' })
    })
  })

  describe('Storage locations', () => {
    it('removes memory keyword', () => {
      const result = parseParamOrReturn('uint256[] memory values')
      expect(result).toEqual({ type: 'uint256[]', name: 'values' })
    })

    it('removes storage keyword', () => {
      const result = parseParamOrReturn('MyStruct storage data')
      expect(result).toEqual({ type: 'MyStruct', name: 'data' })
    })

    it('removes calldata keyword', () => {
      const result = parseParamOrReturn('bytes calldata input')
      expect(result).toEqual({ type: 'bytes', name: 'input' })
    })
  })

  describe('Mapping types', () => {
    it('parses simple mapping', () => {
      const result = parseParamOrReturn('mapping(address => uint256) balances')
      expect(result).toEqual({
        type: 'mapping(address => uint256)',
        name: 'balances'
      })
    })

    it('parses nested mapping', () => {
      const result = parseParamOrReturn('mapping(address => mapping(uint256 => bool)) data')
      expect(result).toEqual({
        type: 'mapping(address => mapping(uint256 => bool))',
        name: 'data'
      })
    })

    it('parses mapping without name', () => {
      const result = parseParamOrReturn('mapping(address => uint256)')
      expect(result).toEqual({
        type: 'mapping(address => uint256)',
        name: ''
      })
    })
  })

  describe('Interface and custom types', () => {
    it('parses interface types', () => {
      const result = parseParamOrReturn('IUniswapV3Pool pool')
      expect(result).toEqual({ type: 'IUniswapV3Pool', name: 'pool' })
    })

    it('parses interface types with memory', () => {
      const result = parseParamOrReturn('IUniswapV3Pool memory pool')
      expect(result).toEqual({ type: 'IUniswapV3Pool', name: 'pool' })
    })

    it('parses nested interface types', () => {
      const result = parseParamOrReturn('IProverRegistry.ProverInstance memory data')
      expect(result).toEqual({
        type: 'IProverRegistry.ProverInstance',
        name: 'data'
      })
    })

    it('parses custom struct types', () => {
      const result = parseParamOrReturn('MyStruct data')
      expect(result).toEqual({ type: 'MyStruct', name: 'data' })
    })
  })
})

describe('splitByComma', () => {
  it('splits simple comma-separated list', () => {
    const result = splitByComma('uint256 a, address b, bool c')
    expect(result).toEqual(['uint256 a', 'address b', 'bool c'])
  })

  it('handles empty string', () => {
    const result = splitByComma('')
    expect(result).toEqual([])
  })

  it('handles single parameter', () => {
    const result = splitByComma('uint256 amount')
    expect(result).toEqual(['uint256 amount'])
  })

  it('handles nested parentheses in tuples', () => {
    const result = splitByComma('tuple(uint256, address), bool')
    expect(result).toEqual(['tuple(uint256, address)', 'bool'])
  })

  it('handles nested parentheses in mappings', () => {
    const result = splitByComma('mapping(address => uint256), uint256')
    expect(result).toEqual(['mapping(address => uint256)', 'uint256'])
  })

  it('handles deeply nested parentheses', () => {
    const result = splitByComma('mapping(address => mapping(uint256 => bool)), address')
    expect(result).toEqual([
      'mapping(address => mapping(uint256 => bool))',
      'address'
    ])
  })

  it('handles extra whitespace', () => {
    const result = splitByComma('  uint256 a  ,  address b  ')
    expect(result).toEqual(['uint256 a', 'address b'])
  })

  it('ignores empty segments', () => {
    const result = splitByComma('uint256 a,, address b')
    expect(result).toEqual(['uint256 a', 'address b'])
  })
})

describe('normalizeType', () => {
  it('removes memory keyword', () => {
    const result = normalizeType('uint256[] memory')
    expect(result).toBe('uint256[]')
  })

  it('removes storage keyword', () => {
    const result = normalizeType('MyStruct storage')
    expect(result).toBe('MyStruct')
  })

  it('removes calldata keyword', () => {
    const result = normalizeType('bytes calldata')
    expect(result).toBe('bytes')
  })

  it('returns unchanged type without storage location', () => {
    const result = normalizeType('uint256')
    expect(result).toBe('uint256')
  })

  it('handles types with trailing whitespace', () => {
    const result = normalizeType('uint256 memory   ')
    expect(result).toBe('uint256')
  })
})

describe('isCustomType', () => {
  it('returns true for custom struct types', () => {
    expect(isCustomType('MyStruct')).toBe(true)
    expect(isCustomType('UserData')).toBe(true)
  })

  it('returns true for interface types', () => {
    expect(isCustomType('IUniswapV3Pool')).toBe(true)
    expect(isCustomType('IERC20')).toBe(true)
  })

  it('returns true for nested types', () => {
    expect(isCustomType('IProverRegistry.ProverInstance')).toBe(true)
  })

  it('returns false for built-in types', () => {
    expect(isCustomType('uint256')).toBe(false)
    expect(isCustomType('int128')).toBe(false)
    expect(isCustomType('address')).toBe(false)
    expect(isCustomType('bool')).toBe(false)
    expect(isCustomType('string')).toBe(false)
    expect(isCustomType('bytes')).toBe(false)
    expect(isCustomType('bytes32')).toBe(false)
  })

  it('returns false for mapping types', () => {
    expect(isCustomType('mapping(address => uint256)')).toBe(false)
  })

  it('handles storage location keywords', () => {
    expect(isCustomType('MyStruct memory')).toBe(true)
    expect(isCustomType('uint256 memory')).toBe(false)
  })

  it('handles array types', () => {
    expect(isCustomType('uint256[]')).toBe(false)
    expect(isCustomType('MyStruct[]')).toBe(true)
  })
})
