'use client'

import BuyTokenTwo from '@/app/components/BuyTokenTwo' // Using alias @/app for components
import { useAccount, useConnect, useDisconnect } from 'wagmi' // Removed useChainId, Added useConnect, useDisconnect
import { injected } from 'wagmi/connectors' // Added injected
import { type Chain } from 'viem' // Added Chain type
import { useEffect, useState } from 'react' // Added useEffect, useState

// Define OP Sepolia chain details (consistent with layout.tsx and app/page.tsx)
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

export default function BuyTwoPage() {
  const { address, isConnected, chain } = useAccount() // Added chain
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()
  // Removed const currentChainId = useChainId()

  const [isClient, setIsClient] = useState(false)
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Determine if the connected chain is the correct one (e.g., OP Sepolia)
  const correctChain = chain?.id === opSepolia.id // Use opSepolia.id

  if (!isClient) {
    return null; // Prevent hydration errors
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 gap-4"> {/* Adjusted main styling for centering */}
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          Buy Token Two Page - Using FM_DepositVault_v1
        </p>
      </div>

      <div className="my-8 flex flex-col items-center gap-4"> {/* Centering content */}
        {isConnected ? (
          <>
            <p>Connected as: <span className="font-mono text-sm break-all">{address}</span></p>
            <p>Network: <span className="font-mono text-sm">{chain?.name} ({chain?.id})</span></p>
            {!correctChain && (
              <p className="text-red-500 font-bold mb-4">
                Please switch to the OP Sepolia network (Chain ID: {opSepolia.id}) in your wallet.
              </p>
            )}
            <button
              onClick={() => disconnect()}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Disconnect Wallet
            </button>
            <BuyTokenTwo chainId={opSepolia.id} correctChain={correctChain} /> {/* Pass opSepolia.id */}
          </>
        ) : (
          <button
            onClick={() => connect({ connector: injected() })}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg text-xl hover:bg-blue-600"
          >
            Connect Wallet
          </button>
        )}
      </div>

      <div className="mt-6 text-sm text-gray-600 text-center"> {/* Centered footer text */}
        <p>This page demonstrates depositing tokens using the Inverter SDK.</p>
        <p>Ensure your wallet is connected to the <span className="font-semibold">OP Sepolia</span> testnet (Chain ID: {opSepolia.id}).</p>
        {/* Placeholder for other links or content */}
      </div>
    </main>
  )
}
