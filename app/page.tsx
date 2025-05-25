'use client'

import { useEffect, useState } from 'react'
import { type Chain } from 'viem'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import BuyToken from './components/BuyToken'

// Define OP Sepolia chain details (consistent with layout.tsx)
const opSepolia = {
  id: 11155420,
  name: 'OP Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://sepolia.optimism.io'] },
    public: { http: ['https://sepolia.optimism.io'] },
  },
  blockExplorers: {
    default: { name: 'Etherscan', url: 'https://sepolia-optimistic.etherscan.io' },
  },
  testnet: true,
} as const satisfies Chain;

export default function Page() {
  const { address, isConnected, chain } = useAccount()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()

  const [isClient, setIsClient] = useState(false)
  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return null;
  }

  const correctChain = chain?.id === opSepolia.id;

  return (
    <div className="w-screen min-h-screen flex flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-bold">Inverter SDK - CLSR/IUSD Sale</h1>

      {isConnected ? (
        <>
          <p>Connected as: <span className="font-mono text-sm break-all">{address}</span></p>
          <p>Network: <span className="font-mono text-sm">{chain?.name} ({chain?.id})</span></p>
          {!correctChain && <p className="text-red-500 font-bold">Please switch to OP Sepolia network in your wallet.</p>}
          <button
            onClick={() => disconnect()}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Disconnect Wallet
          </button>

          <BuyToken chainId={opSepolia.id} correctChain={correctChain} />
        </>
      ) : (
        <button
          onClick={() => connect({ connector: injected() })}
          className="px-6 py-3 bg-blue-500 text-white rounded-lg text-xl hover:bg-blue-600"
        >
          Connect Wallet
        </button>
      )}

      <div className="mt-6 text-sm text-gray-600">
        <p>This page demonstrates fetching token balances and a CLSR/IUSD sale.</p>
        <p>Ensure your wallet is connected to the <span className="font-semibold">OP Sepolia</span> testnet.</p>
      </div>
    </div>
  )
}
