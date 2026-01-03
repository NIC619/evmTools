export const SAMPLE_ABIS = {
  ERC20_BALANCE_OF: [
    {
      inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
  ],

  STATE_VARIABLE: [
    {
      inputs: [],
      name: 'totalSupply',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
  ],

  WITH_TUPLE: [
    {
      inputs: [],
      name: 'getData',
      outputs: [
        {
          components: [
            { internalType: 'address', name: 'addr', type: 'address' },
            { internalType: 'uint256', name: 'value', type: 'uint256' },
          ],
          internalType: 'struct MyContract.Data',
          name: '',
          type: 'tuple',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  ],

  MAPPING_STATE_VAR: [
    {
      inputs: [{ internalType: 'address', name: '', type: 'address' }],
      name: 'balances',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
  ],

  NESTED_MAPPING: [
    {
      inputs: [
        { internalType: 'address', name: '', type: 'address' },
        { internalType: 'uint256', name: '', type: 'uint256' },
      ],
      name: 'allowances',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
  ],
}
