'use client'

// import { getWorkflow } from '@inverter-network/sdk' // Will use useWorkflow instead
import { useWorkflow } from '@inverter-network/react/client' // Import useWorkflow
import type { RequestedModules } from '@inverter-network/sdk'
import { useEffect, useState } from 'react'
import { parseUnits, formatUnits, type TransactionReceipt } from 'viem' // Added formatUnits
import { useAccount, useBalance, useWaitForTransactionReceipt } from 'wagmi'

// Constants
const IUSD_TOKEN_ADDRESS = '0x065775C7aB4E60ad1776A30DCfB15325d231Ce4F' as `0x${string}` // Assuming IUSD is funding token
const CLSR_TOKEN_ADDRESS = '0x050c24F1e840f8366753469aE7a2e81D0794F8ef' as `0x${string}` // Issuance token
const ORCHESTRATOR_ADDRESS = '0xbe29392B4010dA5A1DC515C2f42541584eb95B8C' as `0x${string}`

// Updated requestedModules to reflect actual FM
const requestedModules = {
    fundingManager: 'FM_BC_Bancor_Redeeming_VirtualSupply_v1',
    paymentProcessor: 'PP_Simple_v1',
    authorizer: 'AUT_Roles_v1',
    optionalModules: [
        'LM_PC_Bounties_v1', 'LM_PC_RecurringPayments_v1'
    ]
} as const satisfies RequestedModules;

interface BuyTokenTwoProps {
  chainId: number
  correctChain: boolean
}

export default function BuyTokenTwo({ chainId, correctChain }: BuyTokenTwoProps) {
  const { address } = useAccount()
  // const publicClient = usePublicClient({ chainId }) // Not needed with useWorkflow

  // Use useWorkflow hook
  const { data: workflowData, isLoading: workflowLoading, error: workflowErrorHook } = useWorkflow({
    orchestratorAddress: ORCHESTRATOR_ADDRESS,
    requestedModules,
    // chainId: chainId, // useWorkflow might infer chainId or use wagmi's context
  });

  // Adapt workflow state management
  const workflow = workflowData; 
  const workflowError = workflowErrorHook ? (workflowErrorHook instanceof Error ? workflowErrorHook.message : String(workflowErrorHook)) : null;

  // State for buying tokens
  const [iusdAmount, setIusdAmount] = useState('100') // Renamed from depositAmount
  const [buyTxHash, setBuyTxHash] = useState<`0x${string}` | null>(null) // Renamed
  const [buyError, setBuyError] = useState<string | null>(null) // Renamed
  const [isBuying, setIsBuying] = useState(false) // Renamed

  // State for CalculatePurchaseReturn
  const [calculatedPurchaseReturn, setCalculatedPurchaseReturn] = useState<string>("0")
  const [isCalculatingPurchaseReturn, setIsCalculatingPurchaseReturn] = useState(false)
  const [purchaseReturnError, setPurchaseReturnError] = useState<string | null>(null)
  
  const { data: buyReceipt, isLoading: isConfirmingBuy, error: buyReceiptError } = useWaitForTransactionReceipt({ hash: buyTxHash || undefined }); // Renamed

  // Balance for the funding token (IUSD)
  const { data: iusdBalanceData, isLoading: isIusdBalanceLoading, error: iusdBalanceError } = useBalance({ // Renamed
    address: address,
    token: workflow?.fundingToken?.address || IUSD_TOKEN_ADDRESS, // Use IUSD_TOKEN_ADDRESS as fallback or primary
    chainId: chainId,
    query: { enabled: !!address && !!workflow?.fundingToken?.address },
  })

  // Balance for the issuance token (CLSR)
   const { data: clsrBalanceData, isLoading: isClsrBalanceLoading, error: clsrBalanceError } = useBalance({
    address: address,
    token: workflow?.issuanceToken?.address || CLSR_TOKEN_ADDRESS, // Use CLSR_TOKEN_ADDRESS
    chainId: chainId,
    query: { enabled: !!address },
  })

  // useEffect for logging when workflowData changes (from useWorkflow)
  // Removed detailed SDK investigation logging from useEffect as it's now less relevant

  const handleCalculatePurchaseReturn = async () => {
    if (!iusdAmount || !iusdBalanceData || !workflow?.fundingManager?.read?.calculatePurchaseReturn) {
      setPurchaseReturnError("Please enter amount, connect wallet, or wait for workflow to load with calculation function.");
      return;
    }

    setIsCalculatingPurchaseReturn(true);
    setPurchaseReturnError(null);
    setCalculatedPurchaseReturn("0");

    try {
      const depositAmountInWei = parseUnits(iusdAmount, iusdBalanceData.decimals);
      if (depositAmountInWei === BigInt(0)) {
        setPurchaseReturnError("Amount cannot be zero.");
        setIsCalculatingPurchaseReturn(false);
        return;
      }

      // Pass argument directly if SDK expects single arg instead of array for single-input functions
      const result = await workflow.fundingManager.read.calculatePurchaseReturn.run(depositAmountInWei.toString());
      
      const returnValue = Array.isArray(result) ? result[0] : result; // Assuming result might still be an array for consistency
      if (returnValue === undefined || returnValue === null) {
        throw new Error("calculatePurchaseReturn returned undefined or null");
      }

      const issuanceDecimals = workflow.issuanceToken?.decimals || 18;
      setCalculatedPurchaseReturn(formatUnits(BigInt(returnValue.toString().split('.')[0]), issuanceDecimals));

    } catch (e: unknown) {
      console.error("Error during purchase return calculation:", e);
      setPurchaseReturnError(e instanceof Error ? e.message : "Unknown error calculating purchase return.");
    } finally {
      setIsCalculatingPurchaseReturn(false);
    }
  };

  const handleBuy = async () => {
    if (
      !iusdAmount || !address || !workflow?.fundingManager?.write?.buy ||
      !iusdBalanceData || !workflow.issuanceToken || !calculatedPurchaseReturn ||
      calculatedPurchaseReturn === "0" || purchaseReturnError
    ) {
        alert("Please enter amount, connect wallet, ensure balances/workflow are loaded, and calculate purchase return successfully.");
        return;
    }
    
    try {
      setIsBuying(true);
      setBuyError(null);
      setBuyTxHash(null);

      const amountInWei = parseUnits(iusdAmount, iusdBalanceData.decimals);
      const issuanceDecimals = workflow.issuanceToken.decimals;
      const calculatedReturnInWei = parseUnits(calculatedPurchaseReturn, issuanceDecimals);
      
      const slippageNumerator = BigInt(995); // 0.5% slippage
      const slippageDenominator = BigInt(1000);
      const minReturnInIssuanceWei = (calculatedReturnInWei * slippageNumerator) / slippageDenominator;

      if (minReturnInIssuanceWei === BigInt(0)) {
        setBuyError("Calculated minimum return is 0. Please try a larger amount.");
        setIsBuying(false);
        return;
      }
      
      await workflow.fundingManager.write.buy.run(
         [amountInWei.toString(), minReturnInIssuanceWei.toString()],
         { 
           confirmations: 1,
           onHash: (hash: `0x${string}`) => { setBuyTxHash(hash); console.log("Buy Tx Hash:", hash); }, // Added type for hash
           onConfirmation: (receipt: TransactionReceipt) => { // Added type for receipt
             console.log("Buy Tx Confirmed:", receipt);
             if (receipt.status !== 'success') setBuyError("Buy transaction failed on-chain.");
           },
         }
      );
    } catch (e: unknown) {
      console.error("Error during buy:", e);
      setBuyError(e instanceof Error ? e.message : "An unknown error occurred during purchase.");
    } finally {
      setIsBuying(false);
    }
  }

  useEffect(() => {
    if (buyReceipt) {
      console.log("Buy transaction receipt:", buyReceipt);
      if (buyReceipt.status !== 'success' && !buyError) {
        setBuyError("useWaitForTxReceipt: Buy Tx reverted.");
      }
    }
    if (buyReceiptError && !buyError) {
      console.error("Error fetching buy receipt:", buyReceiptError);
      setBuyError(`Error fetching buy receipt: ${buyReceiptError.message}`);
    }
  }, [buyReceipt, buyReceiptError, buyError]);

  return (
    <div className="space-y-4">
      {workflowLoading && <p>Loading workflow...</p>}
      {workflowError && <p className="text-red-500">Workflow Error: {workflowError}</p>}
      
      {workflow && workflow.fundingToken && (
        <div className="p-3 border rounded-md w-full max-w-md">
          <h2 className="text-lg font-semibold">Funding Token ({workflow.fundingToken.symbol || 'IUSD'}) Balance</h2>
          <p className="font-mono text-xs break-all">Token Address: {workflow.fundingToken.address}</p>
          {isIusdBalanceLoading && <p>Loading balance...</p>}
          {iusdBalanceError && <p className="text-red-500">Error: {iusdBalanceError.message}</p>}
          {iusdBalanceData && <p>Balance: {iusdBalanceData.formatted} {iusdBalanceData.symbol}</p>}
        </div>
      )}

      {workflow && workflow.issuanceToken && (
      <div className="p-3 border rounded-md w-full max-w-md">
        <h2 className="text-lg font-semibold">Issuance Token ({workflow.issuanceToken.symbol || 'CLSR'}) Balance</h2>
        <p className="font-mono text-xs break-all">Token Address: {workflow.issuanceToken.address}</p>
        {isClsrBalanceLoading && <p>Loading CLSR balance...</p>}
        {clsrBalanceError && <p className="text-red-500">Error: {clsrBalanceError.message}</p>}
        {clsrBalanceData && <p>Balance: {clsrBalanceData.formatted} {clsrBalanceData.symbol}</p>}
      </div>
      )}

      {/* Calculate Purchase Return Section */}
      {correctChain && workflow?.fundingManager?.read?.calculatePurchaseReturn && (
        <div className="p-4 border rounded-md w-full max-w-md mt-4">
          <h2 className="text-xl font-semibold">Calculate Expected {workflow?.issuanceToken?.symbol || 'Tokens'}</h2>
          <p className="text-xs text-gray-500 mb-2">Uses the {workflow?.fundingToken?.symbol || 'IUSD'} amount entered below.</p>
          <button
            onClick={handleCalculatePurchaseReturn}
            disabled={isCalculatingPurchaseReturn || !iusdAmount || !correctChain || workflowLoading || !workflow?.fundingManager?.read?.calculatePurchaseReturn}
            className="w-full mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {workflowLoading ? 'Loading Workflow...' : isCalculatingPurchaseReturn ? 'Calculating...' : 'Calculate Purchase Return'}
          </button>
          {purchaseReturnError && <p className="text-red-500 text-xs mt-1">Calculation Error: {purchaseReturnError}</p>}
          {calculatedPurchaseReturn !== "0" && <p className="text-green-700 text-xs mt-1">Estimated {workflow?.issuanceToken?.symbol || 'Tokens'} to receive: {calculatedPurchaseReturn}</p>}
        </div>
      )}

      {/* Buy Section */}
      {correctChain && workflow?.fundingManager?.write?.buy && (
        <div className="p-4 border rounded-md w-full max-w-md mt-4">
          <h2 className="text-xl font-semibold">Buy {workflow?.issuanceToken?.symbol || 'Tokens'} with {workflow?.fundingToken?.symbol || 'IUSD'}</h2>
          <div className="my-2">
            <label htmlFor="iusdAmount" className="block text-sm font-medium text-gray-700">
              Amount of {workflow?.fundingToken?.symbol || 'IUSD'} to spend:
            </label>
            <input
              type="number"
              id="iusdAmount"
              value={iusdAmount}
              onChange={(e) => setIusdAmount(e.target.value)}
              placeholder="e.g., 100"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          
          {/* Note: ERC20 Approve step might be needed here if fundingManager doesn't handle it or if it's not native token */}
          {/* For now, assuming buy.run handles what's needed or it's a native token deposit */}

          <button
            onClick={handleBuy}
            disabled={
              isBuying || 
              isConfirmingBuy || 
              !iusdAmount || 
              !correctChain || 
              workflowLoading || 
              !workflow?.fundingManager?.write?.buy ||
              !iusdBalanceData ||
              !clsrBalanceData || // Or use workflow.issuanceToken.decimals check
              !calculatedPurchaseReturn || calculatedPurchaseReturn === "0" || !!purchaseReturnError
            }
            className="w-full mt-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
          >
            {workflowLoading ? 'Loading Workflow...' : isBuying ? 'Processing Buy...' : isConfirmingBuy ? 'Confirming Buy Tx...' : `Buy ${workflow?.issuanceToken?.symbol || 'Tokens'}`}
          </button>
          {buyError && <p className="text-red-500 text-xs mt-1">Buy Error: {buyError}</p>}
          {buyTxHash && !buyReceipt && <p className="text-yellow-600 text-xs mt-1 break-all">Buy Tx Sent, awaiting confirmation: {buyTxHash}</p>}
          {buyReceipt && buyReceipt.status === 'success' && <p className="text-green-700 text-xs mt-1 break-all">Buy Tx Confirmed! Hash: {buyReceipt.transactionHash}</p>}
          {buyReceipt && buyReceipt.status === 'reverted' && <p className="text-red-700 text-xs mt-1 break-all">Buy Tx Reverted. Hash: {buyReceipt.transactionHash}</p>}
          {buyReceiptError && <p className="text-red-500 text-xs mt-1">Buy Confirmation Error: {buyReceiptError.message}</p>}
        </div>
      )}

      <div className="text-sm text-gray-600">
        <p>This component demonstrates buying tokens using the {workflow?.fundingManager?.name || 'current funding manager'}.</p>
        <p className="font-bold">Funding Manager from Workflow: {workflow?.fundingManager?.name || 'N/A (loading or error)'}</p>
      </div>
    </div>
  )
}
