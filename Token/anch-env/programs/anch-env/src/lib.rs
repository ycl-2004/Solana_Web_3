// programs/token-program/src/lib.rs
use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{self, Token2022, MintTo, Transfer},
    token_interface::{Mint, TokenAccount, TokenInterface},
    associated_token::AssociatedToken,
};

declare_id!("YOUR_PROGRAM_ID");

#[program]
pub mod token_program {
    use super::*;

    /// 创建新代币
    pub fn create_token(
        ctx: Context<CreateToken>,
        decimals: u8,
    ) -> Result<()> {
        msg!("代币创建成功！");
        msg!("Mint 地址: {}", ctx.accounts.mint.key());
        msg!("精度: {}", decimals);
        Ok(())
    }

    /// 铸造代币
    pub fn mint_tokens(
        ctx: Context<MintTokens>,
        amount: u64,
    ) -> Result<()> {
        let cpi_accounts = MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        token_2022::mint_to(cpi_ctx, amount)?;

        msg!("铸造 {} 代币到 {}", amount, ctx.accounts.token_account.key());
        Ok(())
    }

    /// 转账代币
    pub fn transfer_tokens(
        ctx: Context<TransferTokens>,
        amount: u64,
    ) -> Result<()> {
        let cpi_accounts = Transfer {
            from: ctx.accounts.from.to_account_info(),
            to: ctx.accounts.to.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        token_2022::transfer(cpi_ctx, amount)?;

        msg!("转账 {} 代币", amount);
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(decimals: u8)]
pub struct CreateToken<'info> {
    #[account(
        init,
        payer = payer,
        mint::decimals = decimals,
        mint::authority = payer,
        mint::freeze_authority = payer,
        mint::token_program = token_program,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}