import { describe, it, expect } from 'vitest'
import {
  parseStructDefinitions,
  parseSolidityContract
} from '../contractParser'

describe('parseStructDefinitions', () => {
  describe('Enum parsing', () => {
    it('extracts enum definitions', () => {
      const source = `
        enum Status {
          Active,
          Inactive,
          Pending
        }
      `
      const result = parseStructDefinitions(source)
      expect(result.enumSet.has('Status')).toBe(true)
    })

    it('extracts multiple enums', () => {
      const source = `
        enum Status { Active, Inactive }
        enum Priority { High, Medium, Low }
      `
      const result = parseStructDefinitions(source)
      expect(result.enumSet.has('Status')).toBe(true)
      expect(result.enumSet.has('Priority')).toBe(true)
    })
  })

  describe('Struct parsing', () => {
    it('extracts simple struct definitions', () => {
      const source = `
        struct User {
          address addr;
          uint256 balance;
          string name;
        }
      `
      const result = parseStructDefinitions(source)
      expect(result.structMap.has('User')).toBe(true)
      const components = result.structMap.get('User')
      expect(components).toHaveLength(3)
      expect(components).toEqual([
        { name: 'addr', type: 'address' },
        { name: 'balance', type: 'uint256' },
        { name: 'name', type: 'string' }
      ])
    })

    it('handles structs with arrays', () => {
      const source = `
        struct Data {
          uint256[] values;
          address[] addresses;
        }
      `
      const result = parseStructDefinitions(source)
      expect(result.structMap.has('Data')).toBe(true)
      const components = result.structMap.get('Data')
      expect(components).toEqual([
        { name: 'values', type: 'uint256[]' },
        { name: 'addresses', type: 'address[]' }
      ])
    })

    it('converts enum fields to uint8', () => {
      const source = `
        enum Status { Active, Inactive }
        struct User {
          address addr;
          Status status;
        }
      `
      const result = parseStructDefinitions(source)
      const components = result.structMap.get('User')
      expect(components).toEqual([
        { name: 'addr', type: 'address' },
        { name: 'status', type: 'uint8' }
      ])
    })

    it('converts nested structs to tuples', () => {
      const source = `
        struct Inner {
          uint256 value;
          address addr;
        }
        struct Outer {
          Inner data;
          bool flag;
        }
      `
      const result = parseStructDefinitions(source)
      const components = result.structMap.get('Outer')
      expect(components).toHaveLength(2)
      expect(components![0]).toEqual({
        name: 'data',
        type: 'tuple',
        components: [
          { name: 'value', type: 'uint256' },
          { name: 'addr', type: 'address' }
        ]
      })
      expect(components![1]).toEqual({ name: 'flag', type: 'bool' })
    })

    it('handles structs with mappings', () => {
      const source = `
        struct Storage {
          mapping(address => uint256) balances;
          uint256 total;
        }
      `
      const result = parseStructDefinitions(source)
      const components = result.structMap.get('Storage')
      expect(components).toEqual([
        { name: 'balances', type: 'mapping(address => uint256)' },
        { name: 'total', type: 'uint256' }
      ])
    })

    it('handles interface-scoped types', () => {
      const source = `
        struct User {
          IProverRegistry.ProverInstance prover;
          uint256 value;
        }
      `
      const result = parseStructDefinitions(source)
      const components = result.structMap.get('User')
      expect(components).toEqual([
        { name: 'prover', type: 'IProverRegistry.ProverInstance' },
        { name: 'value', type: 'uint256' }
      ])
    })
  })
})

describe('parseSolidityContract', () => {
  describe('Public state variables', () => {
    it('extracts simple public state variables', () => {
      const source = `
        contract MyContract {
          uint256 public totalSupply;
          address public owner;
          bool public paused;
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(3)
      expect(result.functions.map(f => f.name)).toEqual(['totalSupply', 'owner', 'paused'])
      expect(result.warnings).toHaveLength(0)
    })

    it('skips private and internal variables', () => {
      const source = `
        contract MyContract {
          uint256 public publicVar;
          uint256 private privateVar;
          uint256 internal internalVar;
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(1)
      expect(result.functions[0].name).toBe('publicVar')
    })

    it('extracts public mapping state variables', () => {
      const source = `
        contract MyContract {
          mapping(address => uint256) public balances;
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(1)
      expect(result.functions[0].name).toBe('balances')
      expect(result.functions[0].inputs).toEqual([{ name: 'key1', type: 'address' }])
      expect(result.functions[0].outputs).toEqual([{ name: 'value', type: 'uint256' }])
      expect(result.functions[0].stateMutability).toBe('view')
    })

    it('extracts nested mapping state variables', () => {
      const source = `
        contract MyContract {
          mapping(address => mapping(uint256 => bool)) public approvals;
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(1)
      expect(result.functions[0].name).toBe('approvals')
      expect(result.functions[0].inputs).toEqual([
        { name: 'key1', type: 'address' },
        { name: 'key2', type: 'uint256' }
      ])
      expect(result.functions[0].outputs).toEqual([{ name: 'value', type: 'bool' }])
    })

    it('handles mapping with struct value type', () => {
      const source = `
        struct User {
          address addr;
          uint256 balance;
        }
        contract MyContract {
          mapping(address => User) public users;
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(1)
      expect(result.functions[0].name).toBe('users')
      expect(result.functions[0].inputs).toEqual([{ name: 'key1', type: 'address' }])
      expect(result.functions[0].outputs).toEqual([{ name: 'value', type: 'tuple' }])
      // Check originalItems for components
      expect(result.originalItems[0].outputs[0]).toEqual({
        name: 'value',
        type: 'tuple',
        components: [
          { name: 'addr', type: 'address' },
          { name: 'balance', type: 'uint256' }
        ]
      })
    })

    it('handles mapping with enum value type', () => {
      const source = `
        enum Status { Active, Inactive }
        contract MyContract {
          mapping(address => Status) public statuses;
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(1)
      expect(result.functions[0].outputs).toEqual([{ name: 'value', type: 'uint8' }])
    })

    it('generates warnings for unresolved struct types', () => {
      const source = `
        contract MyContract {
          mapping(address => UnknownStruct) public data;
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(0)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain('Missing struct definition for "UnknownStruct"')
    })
  })

  describe('View and pure functions', () => {
    it('extracts view functions', () => {
      const source = `
        contract MyContract {
          function getBalance() public view returns (uint256) {
            return 0;
          }
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(1)
      expect(result.functions[0]).toEqual({
        name: 'getBalance',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view'
      })
    })

    it('extracts pure functions', () => {
      const source = `
        contract MyContract {
          function add(uint256 a, uint256 b) public pure returns (uint256) {
            return a + b;
          }
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(1)
      expect(result.functions[0]).toEqual({
        name: 'add',
        inputs: [
          { name: 'a', type: 'uint256' },
          { name: 'b', type: 'uint256' }
        ],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'pure'
      })
    })

    it('skips private and internal functions', () => {
      const source = `
        contract MyContract {
          function publicFunc() public view returns (uint256) {}
          function privateFunc() private view returns (uint256) {}
          function internalFunc() internal view returns (uint256) {}
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(1)
      expect(result.functions[0].name).toBe('publicFunc')
    })

    it('skips non-view/non-pure functions', () => {
      const source = `
        contract MyContract {
          function viewFunc() public view returns (uint256) {}
          function pureFunc() public pure returns (uint256) {}
          function payableFunc() public payable returns (uint256) {}
          function normalFunc() public returns (uint256) {}
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(2)
      expect(result.functions.map(f => f.name)).toEqual(['viewFunc', 'pureFunc'])
    })

    it('handles functions with struct parameters', () => {
      const source = `
        struct User {
          address addr;
          uint256 balance;
        }
        contract MyContract {
          function getUser(User memory user) public pure returns (address) {
            return user.addr;
          }
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(1)
      expect(result.functions[0].inputs).toEqual([{ name: 'user', type: 'User' }])
    })

    it('handles functions with struct return types', () => {
      const source = `
        struct User {
          address addr;
          uint256 balance;
        }
        contract MyContract {
          function getUser() public view returns (User memory) {
            return User(address(0), 0);
          }
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(1)
      expect(result.functions[0].outputs).toEqual([{ name: '', type: 'User' }])
      // Check originalItems for tuple conversion
      expect(result.originalItems[0].outputs[0]).toEqual({
        name: '',
        type: 'tuple',
        components: [
          { name: 'addr', type: 'address' },
          { name: 'balance', type: 'uint256' }
        ]
      })
    })

    it('handles functions with enum return types', () => {
      const source = `
        enum Status { Active, Inactive }
        contract MyContract {
          function getStatus() public view returns (Status) {
            return Status.Active;
          }
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(1)
      expect(result.originalItems[0].outputs).toEqual([{ name: '', type: 'uint8' }])
    })

    it('generates warnings for unresolved struct parameters', () => {
      const source = `
        contract MyContract {
          function test(UnknownStruct memory data) public view returns (uint256) {}
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(0)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain('Missing struct definition for input type "UnknownStruct"')
    })

    it('generates warnings for unresolved struct return types', () => {
      const source = `
        contract MyContract {
          function test() public view returns (UnknownStruct memory) {}
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(0)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain('Missing struct definition for return type "UnknownStruct"')
    })
  })

  describe('Complex contracts', () => {
    it('handles contracts with multiple queryable items', () => {
      const source = `
        contract MyContract {
          uint256 public totalSupply;
          mapping(address => uint256) public balances;

          function getTotalSupply() public view returns (uint256) {
            return totalSupply;
          }

          function add(uint256 a, uint256 b) public pure returns (uint256) {
            return a + b;
          }
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(4)
      expect(result.functions.map(f => f.name)).toEqual([
        'totalSupply',
        'balances',
        'getTotalSupply',
        'add'
      ])
      expect(result.warnings).toHaveLength(0)
    })

    it('handles contracts with structs, enums, and custom types', () => {
      const source = `
        enum Status { Active, Inactive }

        struct User {
          address addr;
          uint256 balance;
          Status status;
        }

        contract MyContract {
          mapping(address => User) public users;

          function getUser(address addr) public view returns (User memory) {
            return users[addr];
          }
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(2)
      expect(result.functions[0].name).toBe('users')
      expect(result.functions[1].name).toBe('getUser')
      expect(result.warnings).toHaveLength(0)

      // Verify enum conversion in struct
      const userComponents = result.originalItems[0].outputs[0].components
      expect(userComponents).toEqual([
        { name: 'addr', type: 'address' },
        { name: 'balance', type: 'uint256' },
        { name: 'status', type: 'uint8' }
      ])
    })

    it('deduplicates state variables with same name', () => {
      const source = `
        contract MyContract {
          uint256 public value;
          uint256 public value; // Duplicate
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(1)
      expect(result.functions[0].name).toBe('value')
    })

    it('handles comments in source code', () => {
      const source = `
        contract MyContract {
          // This is a comment
          uint256 public value; // Inline comment

          /* Multi-line
             comment */
          function getValue() public view returns (uint256) {
            // Comment in function
            return value;
          }
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(2)
      expect(result.functions.map(f => f.name)).toEqual(['value', 'getValue'])
    })
  })

  describe('Edge cases', () => {
    it('handles empty source code', () => {
      const result = parseSolidityContract('')
      expect(result.functions).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
    })

    it('handles source with only comments', () => {
      const source = `
        // Just comments
        /* Nothing here */
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(0)
    })

    it('handles external visibility', () => {
      const source = `
        contract MyContract {
          function externalView() external view returns (uint256) {}
          function externalPure() external pure returns (uint256) {}
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(2)
    })

    it('handles functions without return values', () => {
      const source = `
        contract MyContract {
          function doNothing() public view {}
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(1)
      expect(result.functions[0].outputs).toEqual([{ name: 'value', type: 'uint256' }])
    })

    it('handles array types in parameters', () => {
      const source = `
        contract MyContract {
          function sum(uint256[] memory values) public pure returns (uint256) {}
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(1)
      expect(result.functions[0].inputs).toEqual([{ name: 'values', type: 'uint256[]' }])
    })

    it('handles multi-dimensional arrays', () => {
      const source = `
        contract MyContract {
          function process(uint256[][] memory matrix) public pure returns (uint256) {}
        }
      `
      const result = parseSolidityContract(source)
      expect(result.functions).toHaveLength(1)
      expect(result.functions[0].inputs).toEqual([{ name: 'matrix', type: 'uint256[][]' }])
    })
  })
})
