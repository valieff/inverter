'use client'
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type Chain } from 'viem';
import { WagmiProvider, createConfig, http } from 'wagmi';

// Define OP Sepolia chain details
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

const chains = [opSepolia] as const; // Use OP Sepolia, assert as const for tuple type

// Updated getERPCTransport to use the chain's default RPC if Inverter RPC is not specifically needed for OP Sepolia
// Or, if Inverter provides an RPC for OP Sepolia, that could be used.
// For now, using the public OP Sepolia RPC.
const getERPCTransport = (chain: Chain) => {
  // Prefer Inverter RPC if available and configured for this chainId
  // For OP Sepolia, let's use its public RPC directly as per user instructions
  if (chain.id === opSepolia.id) {
    return http(chain.rpcUrls.default.http[0], { timeout: 10000 });
  }
  // Fallback or other chains (though we only have opSepolia in `chains` array now)
  return http(`https://rpc.inverter.network/main/evm/${chain.id}`, {
    timeout: 10000,
  });
};

const queryClient = new QueryClient()

const wagmiConfig = createConfig({
    chains,
    multiInjectedProviderDiscovery: false,
    transports: {
        [opSepolia.id]: getERPCTransport(opSepolia),
    },
    ssr: true, // If the user is using a SSR supporting framework
    cacheTime: 5000, // 5 seconds
  })




const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});



export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <QueryClientProvider client={queryClient}>
            <WagmiProvider config={wagmiConfig} reconnectOnMount>
              {children}
            </WagmiProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
