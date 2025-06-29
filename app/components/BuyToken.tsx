'use client'

import { useWorkflow } from '@inverter-network/react/client'
import type { MixedRequestedModules } from '@inverter-network/sdk'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { parseUnits, formatUnits } from 'viem'
import { useAccount, useBalance, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'


const IUSD_TOKEN_ADDRESS = '0x065775C7aB4E60ad1776A30DCfB15325d231Ce4F' as `0x${string}`
const CLSR_TOKEN_ADDRESS = '0x050c24F1e840f8366753469aE7a2e81D0794F8ef' as `0x${string}`

const ORCHESTRATOR_ADDRESS = '0xbe29392B4010dA5A1DC515C2f42541584eb95B8C' as `0x${string}`
const FUNDING_MANAGER_ADDRESS = '0x8616A376F8ABB7Db0C160ff2451E2b5E9ddB39E4' as `0x${string}`

const erc20Abi = [
  {
    "constant": true,
    "inputs": [
      { "name": "_owner", "type": "address" },
      { "name": "_spender", "type": "address" }
    ],
    "name": "allowance",
    "outputs": [{ "name": "", "type": "uint256" }],
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      { "name": "_spender", "type": "address" },
      { "name": "_value", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "name": "", "type": "bool" }],
    "type": "function"
  }
] as const;

const requestedModules = {
  fundingManager: 'FM_BC_Bancor_Redeeming_VirtualSupply_v1',
  paymentProcessor: 'PP_Simple_v1',
  authorizer: 'AUT_Roles_v1',
  optionalModules: [],
} as const satisfies MixedRequestedModules;

interface BuyTokenProps {
  chainId: number
  correctChain: boolean
}

export default function BuyToken({ chainId, correctChain }: BuyTokenProps) {
  const { address } = useAccount()

  const { data: iusdBalanceData, isLoading: isIusdBalanceLoading, error: iusdBalanceError } = useBalance({
    address: address,
    token: IUSD_TOKEN_ADDRESS,
    chainId: chainId,
    query: { enabled: !!address },
  })

  const { data: clsrBalanceData, isLoading: isClsrBalanceLoading, error: clsrBalanceError } = useBalance({
    address: address,
    token: CLSR_TOKEN_ADDRESS,
    chainId: chainId,
    query: { enabled: !!address },
  })

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: IUSD_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address!, FUNDING_MANAGER_ADDRESS],
    chainId: chainId,
    query: { enabled: !!address && !!FUNDING_MANAGER_ADDRESS },
  });

  const workflow = useWorkflow({
    orchestratorAddress: ORCHESTRATOR_ADDRESS,
    requestedModules,
  });

  const [iusdAmount, setIusdAmount] = useState('1')
  const [buyTxHash, setBuyTxHash] = useState<`0x${string}` | null>(null)
  const [buyError, setBuyError] = useState<string | null>(null)
  const [isBuying, setIsBuying] = useState(false)

  const iusdAmountInWei = useMemo(() => {
    if (!iusdAmount || !iusdBalanceData || parseFloat(iusdAmount) <= 0) return BigInt(0);
    try {
        return parseUnits(iusdAmount, iusdBalanceData.decimals);
    } catch (e) {
        console.error("Failed to parse iusdAmount:", e);
        return BigInt(0);
    }
  }, [iusdAmount, iusdBalanceData]);

  const isApprovalNeeded = useMemo(() => {
      if (typeof allowance !== 'bigint') return true;
      if (iusdAmountInWei === BigInt(0)) return false;
      return allowance < iusdAmountInWei;
  }, [allowance, iusdAmountInWei]);

  // State for CalculatePurchaseReturn
  const [calculatedPurchaseReturn, setCalculatedPurchaseReturn] = useState<string>("0")
  const [isCalculatingPurchaseReturn, setIsCalculatingPurchaseReturn] = useState(false)
  const [purchaseReturnError, setPurchaseReturnError] = useState<string | null>(null)

  const { writeContractAsync, data: approveDataHash, error: approveError, isPending: isApproving } = useWriteContract()
  const { data: approveReceipt, isLoading: isConfirmingApprove } = useWaitForTransactionReceipt({ hash: approveDataHash })
  
  const { data: buyReceipt, isLoading: isConfirmingBuy, error: buyReceiptError } = useWaitForTransactionReceipt({ hash: buyTxHash || undefined });

  const handleApprove = async () => {
    if (!address) return;
    try {
      const maxUint256 = BigInt(2) ** BigInt(256) - BigInt(1);
      await writeContractAsync({
        address: IUSD_TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [FUNDING_MANAGER_ADDRESS, maxUint256],
        chainId: chainId,
      });
    } catch (e: unknown) {
      console.error("Approval failed", e);
    }
  }

  const handleBuy = async () => {
    if (
      !iusdAmount || 
      !address || 
      !iusdBalanceData || 
      !clsrBalanceData || 
      !workflow.data || 
      !workflow.data.fundingManager ||
      !calculatedPurchaseReturn || 
      calculatedPurchaseReturn === "0" ||
      purchaseReturnError
    ) {
        console.log('[DEBUG] handleBuy: Pre-condition failed.', { 
            iusdAmount, 
            address, 
            iusdBalanceDataExists: !!iusdBalanceData, 
            clsrBalanceDataExists: !!clsrBalanceData,
            workflowDataExists: !!workflow.data, 
            fundingManagerExists: !!workflow.data?.fundingManager,
            calculatedPurchaseReturn,
            purchaseReturnError
        });
        alert("Please enter amount, connect wallet, ensure all token balances are loaded, calculate purchase return successfully, or wait for workflow to load.");
        return;
    }
    console.log('[DEBUG] handleBuy: Entered function with:', { iusdAmount, address, calculatedPurchaseReturn });
    console.log('[DEBUG] handleBuy: IUSD Balance Data:', iusdBalanceData);
    console.log('[DEBUG] handleBuy: Workflow Data:', workflow.data);
    
    try {
      setIsBuying(true);
      setBuyError(null);
      setBuyTxHash(null);
      console.log('[DEBUG] handleBuy: State initialized for buying.');

      const amountInWei = parseUnits(iusdAmount, iusdBalanceData.decimals);
      console.log('[DEBUG] handleBuy: Calculated amountInWei:', amountInWei.toString());

      const clsrDecimals = clsrBalanceData.decimals;
      
      // Use the dynamically calculated purchase return and apply slippage
      // calculatedPurchaseReturn is a string like "123.45"
      const calculatedReturnInWei = parseUnits(calculatedPurchaseReturn, clsrDecimals);
      
      // Apply 0.5% slippage: minReturn = calculatedReturn * 99.5%
      // To avoid floating point issues with BigInt, multiply by 995 then divide by 1000
      const slippageNumerator = BigInt(995); // for 99.5%
      const slippageDenominator = BigInt(1000);
      const minReturnInClsrWei = (calculatedReturnInWei * slippageNumerator) / slippageDenominator;

      if (minReturnInClsrWei === BigInt(0)) {
        console.error("[DEBUG] handleBuy: Calculated minReturnInClsrWei is 0. This might be due to very small calculatedPurchaseReturn or rounding. Aborting buy.");
        setBuyError("Calculated minimum return is 0. Please try with a larger amount or check calculation.");
        setIsBuying(false);
        return;
      }

      console.log(`[DEBUG] handleBuy: CLSR Decimals: ${clsrDecimals}, Calculated Return (Human): ${calculatedPurchaseReturn}, Calculated Return (Wei): ${calculatedReturnInWei.toString()}, Min Return (Wei with 0.5% slippage): ${minReturnInClsrWei.toString()}`);
      
      console.log('[DEBUG] handleBuy: About to call workflow.data.fundingManager.write.buy.run with args:', [amountInWei.toString(), minReturnInClsrWei.toString()], 'and SDK callbacks');
      


      await workflow.data.fundingManager.write.buy.run(
        [iusdAmount, formatUnits(minReturnInClsrWei, clsrDecimals)],
         { 
           confirmations: 1,
           onHash: (hash) => {
             console.log('[DEBUG] handleBuy SDK onHash callback. Hash:', hash);
             setBuyTxHash(hash);
           },
           onConfirmation: (receipt) => {
             console.log('[DEBUG] handleBuy SDK onConfirmation callback. Receipt:', receipt);
             if (receipt.status === 'success') {
               console.log("[DEBUG] SDK onConfirmation: Buy transaction successful on-chain.");
               setBuyError(null);
             } else {
               console.error("[DEBUG] SDK onConfirmation: Buy transaction failed on-chain (reverted). Receipt:", receipt);
               setBuyError("SDK: Buy Tx reverted. Check console. Possible reasons: Buying closed, supply cap reached, or address not whitelisted for this Funding Manager.");
             }
           },
         }
      );
      console.log('[DEBUG] handleBuy: workflow.data.fundingManager.write.buy.run call initiated/completed.');

    } catch (e: unknown) {
      console.error("[DEBUG] handleBuy: Error during buy.run execution or pre-flight checks:", e);
      if (e instanceof Error) {
        setBuyError(e.message);
        console.log('[DEBUG] handleBuy: Set buyError to (Error instance):', e.message);
      } else {
        setBuyError("An unknown error occurred during purchase.");
        console.log('[DEBUG] handleBuy: Set buyError to (unknown error).');
      }
    } finally {
      setIsBuying(false);
      console.log('[DEBUG] handleBuy: Exiting handleBuy, setIsBuying to false.');
    }
  }

  const handleCalculatePurchaseReturn = useCallback(async () => {
    if (!iusdAmount || !iusdBalanceData || !workflow.data || !workflow.data.fundingManager) {
      setPurchaseReturnError("Please enter amount, connect wallet, or wait for workflow to load.");
      return;
    }

    setIsCalculatingPurchaseReturn(true);
    setPurchaseReturnError(null);
    setCalculatedPurchaseReturn("0");

    try {
      const depositAmountInWei = parseUnits(iusdAmount, iusdBalanceData.decimals);

      if (depositAmountInWei === BigInt(0)) {
        setPurchaseReturnError("Deposit amount cannot be zero.");
        setIsCalculatingPurchaseReturn(false);
        return;
      }

      const argsArray = [depositAmountInWei.toString()];
      
      type SDKRunArgument = string;
      type SDKPrimaryReturnValue = bigint | string | number;
      type SDKPossibleReturnStructure = SDKPrimaryReturnValue | SDKPrimaryReturnValue[];

      const result = await (workflow.data.fundingManager.read.calculatePurchaseReturn.run as unknown as (
        args: SDKRunArgument[]
      ) => Promise<SDKPossibleReturnStructure>)(argsArray);
      
      const returnValue = Array.isArray(result) ? result[0] : result;
      
      if (returnValue === undefined || returnValue === null) {
        throw new Error("calculatePurchaseReturn returned undefined or null");
      }

      const clsrDecimals = clsrBalanceData?.decimals || 18;
      const returnValStr = returnValue.toString();
      const integerPartOfReturnVal = returnValStr.split('.')[0];
      setCalculatedPurchaseReturn(formatUnits(BigInt(integerPartOfReturnVal), clsrDecimals));

    } catch (e: unknown) {
      console.error("[DEBUG] handleCalculatePurchaseReturn: Error during calculation:", e);
      if (e instanceof Error) {
        setPurchaseReturnError(e.message);
      } else {
        setPurchaseReturnError("An unknown error occurred during purchase return calculation.");
      }
    } finally {
      setIsCalculatingPurchaseReturn(false);
    }
  }, [iusdAmount, iusdBalanceData, workflow.data, clsrBalanceData]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
        if (iusdAmount && parseFloat(iusdAmount) > 0 && workflow.data?.fundingManager) {
            handleCalculatePurchaseReturn();
        } else {
            setCalculatedPurchaseReturn("0");
            setPurchaseReturnError(null);
        }
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [iusdAmount, workflow.data?.fundingManager, handleCalculatePurchaseReturn]);

  useEffect(() => {
    if (approveReceipt) {
      console.log("Approval confirmed:", approveReceipt);
      refetchAllowance();
    }
  }, [approveReceipt, refetchAllowance])

  useEffect(() => {
    if (buyReceipt) {
      console.log("[DEBUG] useWaitForTransactionReceipt confirmed buyTx. Receipt:", buyReceipt);
      if (buyReceipt.status !== 'success' && !buyError) {
        setBuyError("useWaitForTxReceipt: Buy Tx reverted. Check console.");
      }
    }
    if (buyReceiptError && !buyError) {
      console.error("[DEBUG] useWaitForTransactionReceipt error for buyTx:", buyReceiptError);
      setBuyError(`useWaitForTxReceipt: Error fetching receipt. Details: ${buyReceiptError.message}`);
    }
  }, [buyReceipt, buyReceiptError, buyError])

  return (
    <div className="space-y-4">
      {/* Balance Displays */}
      <div className="p-3 border rounded-md w-full max-w-md">
        <h2 className="text-lg font-semibold">IUSD Balance (Collateral)</h2>
        <p className="font-mono text-xs break-all">Token Address: {IUSD_TOKEN_ADDRESS}</p>
        {isIusdBalanceLoading && <p>Loading IUSD balance...</p>}
        {iusdBalanceError && <p className="text-red-500">Error: {iusdBalanceError.message}</p>}
        {iusdBalanceData && <p>Balance: {iusdBalanceData.formatted} {iusdBalanceData.symbol}</p>}
      </div>

      <div className="p-3 border rounded-md w-full max-w-md">
        <h2 className="text-lg font-semibold">CLSR Token Balance</h2>
        <p className="font-mono text-xs break-all">Token Address: {CLSR_TOKEN_ADDRESS}</p>
        {isClsrBalanceLoading && <p>Loading CLSR balance...</p>}
        {clsrBalanceError && <p className="text-red-500">Error: {clsrBalanceError.message}</p>}
        {clsrBalanceData && <p>Balance: {clsrBalanceData.formatted} {clsrBalanceData.symbol}</p>}
      </div>

      {/* Sale Section */}
      {correctChain && (
        <div className="p-4 border rounded-md w-full max-w-md mt-4">
          <h2 className="text-xl font-semibold">Buy CLSR with IUSD</h2>
          <div className="my-2">
            <label htmlFor="iusdAmount" className="block text-sm font-medium text-gray-700">
              Amount of IUSD to spend:
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

          <div className="my-2 h-6 text-sm">
            {isCalculatingPurchaseReturn ? (
              <p className="text-gray-500">Calculating expected CLSR...</p>
            ) : purchaseReturnError ? (
              <p className="text-red-500">Error: {purchaseReturnError}</p>
            ) : calculatedPurchaseReturn && calculatedPurchaseReturn !== "0" ? (
              <p className="text-green-700">You will receive ≈ {calculatedPurchaseReturn} CLSR</p>
            ) : (
              <p>&nbsp;</p> 
            )}
          </div>

          <button
            onClick={handleApprove}
            disabled={!isApprovalNeeded || isApproving || isConfirmingApprove || !iusdAmount || !correctChain}
            className="w-full mt-2 px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50"
          >
            {isApproving ? 'Approving...' : isConfirmingApprove ? 'Waiting for Confirmation...' : isApprovalNeeded ? '1. Approve IUSD' : 'IUSD Approved'}
          </button>
          {approveError && <p className="text-red-500 text-xs mt-1">Approval Error: {approveError.message || 'Unknown approval error'}</p>}
          {approveDataHash && <p className="text-green-500 text-xs mt-1 break-all">Approve Tx Sent: {approveDataHash}</p>}
          {approveReceipt && <p className="text-green-700 text-xs mt-1">Approval Confirmed!</p>}
          
          <button
            onClick={handleBuy}
            disabled={
              isBuying || 
              isConfirmingBuy || 
              isApprovalNeeded ||
              !iusdAmount || 
              !correctChain || 
              workflow.isLoading || 
              !workflow.data?.fundingManager || 
              !clsrBalanceData || 
              isClsrBalanceLoading ||
              !calculatedPurchaseReturn ||
              calculatedPurchaseReturn === "0" ||
              !!purchaseReturnError
            }
            className="w-full mt-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
          >
            {workflow.isLoading ? 'Loading Workflow...' : isBuying ? 'Processing Buy...' : isConfirmingBuy ? 'Confirming Buy Tx...' : '2. Buy CLSR with IUSD'}
          </button>
          {buyError && <p className="text-red-500 text-xs mt-1">Buy Error: {buyError}</p>}
          {buyTxHash && !buyReceipt && <p className="text-yellow-600 text-xs mt-1 break-all">Buy Tx Sent, awaiting confirmation: {buyTxHash}</p>}
          {buyReceipt && buyReceipt.status === 'success' && <p className="text-green-700 text-xs mt-1 break-all">Buy Tx Confirmed! Hash: {buyReceipt.transactionHash}</p>}
          {buyReceipt && buyReceipt.status === 'reverted' && <p className="text-red-700 text-xs mt-1 break-all">Buy Tx Reverted. Hash: {buyReceipt.transactionHash}</p>}
          {buyReceiptError && <p className="text-red-500 text-xs mt-1">Buy Confirmation Error: {buyReceiptError.message}</p>}
        </div>
      )}

      <div className="text-sm text-gray-600">
        <p>This component demonstrates fetching token balances and a CLSR/IUSD sale.</p>
        <p className="font-bold text-orange-600">Note: The Funding Manager type is inferred as FM_BC_Bancor_Redeeming_VirtualSupply_v1 and the sale function as BUY.</p>
      </div>
    </div>
  )
}
