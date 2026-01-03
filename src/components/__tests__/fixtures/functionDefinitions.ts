export const SAMPLE_FUNCTIONS = {
  SIMPLE_VIEW_FUNCTION: 'function balanceOf(address account) public view returns (uint256)',

  PURE_FUNCTION: 'function calculate(uint256 a, uint256 b) public pure returns (uint256)',

  STATE_VARIABLE: 'uint256 public totalSupply',

  SIMPLE_MAPPING: 'mapping(address => uint256) public balances',

  NESTED_MAPPING: 'mapping(address => mapping(uint256 => bool)) public allowances',

  ARRAY_OF_MAPPINGS: 'mapping(address => uint256)[] public arrayOfMappings',

  FUNCTION_WITH_MULTIPLE_PARAMS: 'function transfer(address to, uint256 amount) public view returns (bool)',

  FUNCTION_WITH_ARRAYS: 'function getBalances(address[] memory accounts) public view returns (uint256[] memory)',

  STATE_VAR_WITH_MODIFIERS: 'uint256 public constant MAX_SUPPLY = 1000000',

  IMMUTABLE_STATE_VAR: 'address public immutable owner',

  // Non-view/pure functions (should be rejected after fix)
  NON_VIEW_FUNCTION: 'function transfer(address to, uint256 amount) public returns (bool)',

  // Multi-line function (edge case)
  MULTI_LINE_FUNCTION: `function getData(
    address account,
    uint256 id
  ) public view returns (uint256)`,
}
