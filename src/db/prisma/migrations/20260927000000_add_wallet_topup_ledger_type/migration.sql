-- AlterEnum
-- Adds WALLET_TOPUP so a payment can be recorded as money coming into the
-- wallet (CREDIT) before it's spent (DEBIT) in the same transaction, instead
-- of a single DEBIT that could drive walletBalance negative. Placed first so
-- reading the enum reads top-down as the lifecycle of money in this system.
ALTER TYPE "LedgerEntryType" ADD VALUE 'WALLET_TOPUP' BEFORE 'BOOKING_PAYMENT';
