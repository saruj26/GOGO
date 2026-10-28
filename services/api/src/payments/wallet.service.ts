import { Injectable } from '@nestjs/common';
import { Prisma, WalletTransactionType } from '@prisma/client';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { Money } from '../common/utils/money';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The customer wallet, as an append-only ledger.
 *
 * Every movement writes a `wallet_transactions` row carrying the balance that
 * resulted from it, so the balance is always reconstructible. Debits take an
 * exclusive row lock on the wallet, which is what stops two concurrent
 * checkouts each believing the same funds are available; `wallets_balance_non_negative`
 * is the database-level backstop if that discipline were ever bypassed.
 */
@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async debit(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: Money,
    reference: { type: string; id: string; description: string },
  ): Promise<Money> {
    const rows = await tx.$queryRaw<Array<{ id: string; balance: Prisma.Decimal; frozen: boolean }>>`
      SELECT id, balance, frozen
      FROM wallets
      WHERE user_id = ${userId}::uuid
      FOR UPDATE
    `;

    const wallet = rows[0];
    if (!wallet) {
      throw DomainError.notFound('Wallet');
    }
    if (wallet.frozen) {
      throw new DomainError(
        DomainErrorCode.PAYMENT_FAILED,
        'Your wallet is temporarily frozen. Please contact support.',
      );
    }

    const balance = new Prisma.Decimal(wallet.balance);
    if (balance.lessThan(amount)) {
      throw new DomainError(
        DomainErrorCode.INSUFFICIENT_WALLET_BALANCE,
        'Your wallet balance is not enough for this order. Choose another payment method or top up.',
      );
    }

    const balanceAfter = balance.minus(amount);

    await tx.wallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter } });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: WalletTransactionType.DEBIT,
        amount,
        balanceAfter,
        referenceType: reference.type,
        referenceId: reference.id,
        description: reference.description,
      },
    });

    return balanceAfter;
  }

  async credit(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: Money,
    reference: { type: string; id: string; description: string },
  ): Promise<Money> {
    const rows = await tx.$queryRaw<Array<{ id: string; balance: Prisma.Decimal }>>`
      SELECT id, balance FROM wallets WHERE user_id = ${userId}::uuid FOR UPDATE
    `;

    const wallet = rows[0];
    if (!wallet) throw DomainError.notFound('Wallet');

    const balanceAfter = new Prisma.Decimal(wallet.balance).plus(amount);

    await tx.wallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter } });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: WalletTransactionType.CREDIT,
        amount,
        balanceAfter,
        referenceType: reference.type,
        referenceId: reference.id,
        description: reference.description,
      },
    });

    return balanceAfter;
  }
}
