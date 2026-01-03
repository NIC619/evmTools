export const SAMPLE_CONTRACTS = {
  SIMPLE_TOKEN: `
    contract SimpleToken {
      string public name;
      string public symbol;
      uint256 public totalSupply;
      mapping(address => uint256) public balances;

      function balanceOf(address account) public view returns (uint256) {
        return balances[account];
      }
    }
  `,

  COMPLEX_MAPPINGS: `
    contract ComplexMappings {
      mapping(address => uint256) public simpleMapping;
      mapping(address => mapping(uint256 => bool)) public nestedMapping;
      mapping(address => uint256)[] public arrayOfMappings;

      function getSimple(address addr) public view returns (uint256) {
        return simpleMapping[addr];
      }

      function getNested(address addr, uint256 id) public view returns (bool) {
        return nestedMapping[addr][id];
      }
    }
  `,

  NESTED_STRUCTS: `
    contract NestedStructs {
      struct Inner {
        address addr;
        uint256 value;
      }

      struct Outer {
        Inner inner;
        bool flag;
      }

      Outer public data;

      function getData() public view returns (Outer memory) {
        return data;
      }
    }
  `,

  WITH_ENUMS: `
    contract WithEnums {
      enum Status { Pending, Active, Completed }

      Status public currentStatus;

      function getStatus() public view returns (Status) {
        return currentStatus;
      }
    }
  `,

  WITH_COMMENTS: `
    contract WithComments {
      // This is a single-line comment
      uint256 public value;

      /* This is a multi-line comment
         with multiple lines */
      address public owner;

      // URL in comment: http://example.com
      string public url = "http://actual-url.com";

      function getValue() public view returns (uint256) {
        return value;
      }
    }
  `,

  CUSTOM_TYPES: `
    interface IExternalContract {
      struct ExternalData {
        uint256 id;
        address owner;
      }
    }

    contract CustomTypes {
      IExternalContract.ExternalData public data;

      function getData() public view returns (IExternalContract.ExternalData memory) {
        return data;
      }
    }
  `,
}
