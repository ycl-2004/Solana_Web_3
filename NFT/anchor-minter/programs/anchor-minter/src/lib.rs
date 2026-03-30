use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::{
        self, create_master_edition_v3, create_metadata_accounts_v3,
        set_and_verify_sized_collection_item, update_metadata_accounts_v2,
        CreateMasterEditionV3, CreateMetadataAccountsV3, Metadata,
        SetAndVerifySizedCollectionItem, UpdateMetadataAccountsV2,
    },
    token::{self, Burn, CloseAccount},
    token_interface::{self, Mint, MintTo, TokenAccount, TokenInterface},
};

declare_id!("4ZGqxpGWvEC71CDC1tghV7meg6fQ1hnKVgn2iUTYzb56");

const MINT_CONFIG_SEED: &[u8] = b"config";
const USER_RECORD_SEED: &[u8] = b"user";
const METADATA_PREFIX: &[u8] = b"metadata";
const EDITION_PREFIX: &[u8] = b"edition";
const COLLECTION_AUTHORITY_PREFIX: &[u8] = b"collection_authority";

#[program]
pub mod anchor_minter {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        collection_mint: Pubkey,
        mint_price: u64,
        max_supply: u32,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;

        // 1. 记录这个 minter 的管理员
        // 这里先直接使用部署者/初始化者的钱包。
        config.authority = ctx.accounts.authority.key();

        // 2. 记录这个程序绑定的 collection。
        // 后面所有通过程序 mint 的 NFT，都会进这个 collection。
        config.collection_mint = collection_mint;

        // 3. 记录 mint 的固定价格。
        config.mint_price = mint_price;

        // 4. 初始化供应量状态。
        config.current_supply = 0;
        config.max_supply = max_supply;

        // 5. 记录收款金库地址。
        config.treasury = ctx.accounts.treasury.key();

        // 6. 保存 PDA bump，后面 mint 时程序需要用它签名。
        config.bump = ctx.bumps.config;

        msg!("Anchor minter 初始化完成");
        msg!("Authority: {}", config.authority);
        msg!("Collection Mint: {}", config.collection_mint);
        msg!("Mint Price: {}", config.mint_price);
        msg!("Max Supply: {}", config.max_supply);
        msg!("Treasury: {}", config.treasury);
        Ok(())
    }

    pub fn mint_nft(ctx: Context<MintNft>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        let user_record = &mut ctx.accounts.user_record;

        // 1. 检查总供应量是否已经用完。
        require!(
            config.current_supply < config.max_supply,
            MinterError::SoldOut
        );

        // 2. 第一版先实现“每个钱包只能 mint 1 次”。
        // 后续如果要支持“销毁后再 mint”，会在 burn 流程里把 mint_count 减回来。
        require!(user_record.mint_count == 0, MinterError::MintLimitReached);

        // 3. 初始化用户记录。
        // 如果这是用户第一次 mint，这里会把 owner 固定下来。
        if user_record.owner == Pubkey::default() {
            user_record.owner = ctx.accounts.minter.key();
        }

        // 4. 再次确认当前 user_record 真的是属于这个 minter。
        require_keys_eq!(
            user_record.owner,
            ctx.accounts.minter.key(),
            MinterError::InvalidUserRecord
        );

        // 5. 铸造 1 个 token 给当前用户。
        // 这里把 config PDA 作为 mint authority，因此程序可以自动签名完成 mint。
        let signer_seeds: &[&[u8]] = &[MINT_CONFIG_SEED, &[config.bump]];
        let signer = &[signer_seeds];

        let cpi_accounts = MintTo {
            mint: ctx.accounts.nft_mint.to_account_info(),
            to: ctx.accounts.nft_token_account.to_account_info(),
            authority: config.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

        token_interface::mint_to(cpi_ctx, 1)?;

        // 6. 更新链上状态。
        user_record.mint_count = 1;
        config.current_supply = config
            .current_supply
            .checked_add(1)
            .ok_or(MinterError::MathOverflow)?;

        msg!("Mint rule check 通过");
        msg!("Minter: {}", ctx.accounts.minter.key());
        msg!("NFT Mint: {}", ctx.accounts.nft_mint.key());
        msg!("NFT Token Account: {}", ctx.accounts.nft_token_account.key());
        msg!("Current Supply: {}", ctx.accounts.config.current_supply);
        Ok(())
    }

    pub fn mint_nft_with_metadata(
        ctx: Context<MintNftWithMetadata>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        let config_key = ctx.accounts.config.key();
        let collection_mint = ctx.accounts.config.collection_mint;
        let bump = ctx.accounts.config.bump;

        {
            let config = &ctx.accounts.config;
            let user_record = &mut ctx.accounts.user_record;

            // 1. 这一步和基础版一样，先做最核心的规则检查。
            require!(
                config.current_supply < config.max_supply,
                MinterError::SoldOut
            );
            require!(user_record.mint_count == 0, MinterError::MintLimitReached);

            if user_record.owner == Pubkey::default() {
                user_record.owner = ctx.accounts.minter.key();
            }

            require_keys_eq!(
                user_record.owner,
                ctx.accounts.minter.key(),
                MinterError::InvalidUserRecord
            );
        }

        // 2. 先校验所有 Metaplex 相关 PDA 都是正确的。
        // 这样即使前端传错地址，我们也会在程序里挡住。
        validate_full_mint_accounts(&ctx.accounts, collection_mint, config_key)?;

        // 3. 程序 PDA 会扮演当前这张新 NFT 的 mint authority / update authority。
        // 因为后面创建 metadata、master edition、verify collection 都要继续签名。
        let signer_seeds: &[&[u8]] = &[MINT_CONFIG_SEED, &[bump]];
        mint_token_to_user(&ctx.accounts, signer_seeds)?;
        create_nft_metadata_account(&ctx.accounts, signer_seeds, &name, &symbol, &uri)?;
        create_nft_master_edition_account(&ctx.accounts, signer_seeds)?;
        hand_over_nft_update_authority_to_collection_owner(&ctx.accounts, signer_seeds)?;
        verify_nft_into_collection(&ctx.accounts, signer_seeds)?;

        // 8. 只有整套流程都成功时，才把用户记录和 supply 真正更新。
        ctx.accounts.user_record.mint_count = 1;
        ctx.accounts.config.current_supply = ctx
            .accounts
            .config
            .current_supply
            .checked_add(1)
            .ok_or(MinterError::MathOverflow)?;

        msg!("完整 NFT mint 完成");
        msg!("Minter: {}", ctx.accounts.minter.key());
        msg!("NFT Mint: {}", ctx.accounts.nft_mint.key());
        msg!("NFT Metadata: {}", ctx.accounts.nft_metadata.key());
        msg!("NFT Master Edition: {}", ctx.accounts.nft_master_edition.key());
        msg!("Collection: {}", ctx.accounts.collection_mint.key());
        msg!("Current Supply: {}", ctx.accounts.config.current_supply);
        Ok(())
    }

    pub fn burn_nft(ctx: Context<BurnNft>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        let user_record = &mut ctx.accounts.user_record;

        // 1. 只有当前钱包真的 mint 过，才允许走 burn。
        require!(user_record.mint_count > 0, MinterError::NothingToBurn);

        if user_record.owner == Pubkey::default() {
            return err!(MinterError::InvalidUserRecord);
        }

        require_keys_eq!(
            user_record.owner,
            ctx.accounts.owner.key(),
            MinterError::InvalidUserRecord
        );

        // 2. 先把 token burn 掉。
        // 这里由当前 owner 自己签名，因为 token 在他的 ATA 里。
        let burn_accounts = Burn {
            mint: ctx.accounts.nft_mint.to_account_info(),
            from: ctx.accounts.nft_token_account.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };

        let burn_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), burn_accounts);
        token::burn(burn_ctx, 1)?;

        // 3. token 数量归零之后，把 ATA 关掉，租金退回给 owner。
        let close_accounts = CloseAccount {
            account: ctx.accounts.nft_token_account.to_account_info(),
            destination: ctx.accounts.owner.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };

        let close_ctx =
            CpiContext::new(ctx.accounts.token_program.to_account_info(), close_accounts);
        token::close_account(close_ctx)?;

        // 4. 把“这个钱包已经 mint 过”的状态清掉，
        // 这样它之后就能重新 mint 一张新的 NFT。
        user_record.mint_count = 0;
        config.current_supply = config
            .current_supply
            .checked_sub(1)
            .ok_or(MinterError::MathUnderflow)?;

        msg!("NFT 已销毁");
        msg!("Owner: {}", ctx.accounts.owner.key());
        msg!("NFT Mint: {}", ctx.accounts.nft_mint.key());
        msg!("Current Supply: {}", config.current_supply);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + MintConfig::INIT_SPACE,
        seeds = [MINT_CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, MintConfig>,

    /// CHECK:
    /// 第一版先只保存金库地址。
    /// 后续 mint 时会把用户支付转到这个地址。
    pub treasury: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintNft<'info> {
    #[account(mut)]
    pub minter: Signer<'info>,

    #[account(
        mut,
        seeds = [MINT_CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Account<'info, MintConfig>,

    #[account(
        init_if_needed,
        payer = minter,
        space = 8 + UserRecord::INIT_SPACE,
        seeds = [USER_RECORD_SEED, minter.key().as_ref()],
        bump
    )]
    pub user_record: Account<'info, UserRecord>,

    #[account(
        init,
        payer = minter,
        mint::decimals = 0,
        mint::authority = config,
        mint::freeze_authority = config,
        mint::token_program = token_program
    )]
    pub nft_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = minter,
        associated_token::mint = nft_mint,
        associated_token::authority = minter,
        associated_token::token_program = token_program
    )]
    pub nft_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintNftWithMetadata<'info> {
    #[account(mut)]
    pub minter: Signer<'info>,

    #[account(
        mut,
        seeds = [MINT_CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Account<'info, MintConfig>,

    #[account(
        init_if_needed,
        payer = minter,
        space = 8 + UserRecord::INIT_SPACE,
        seeds = [USER_RECORD_SEED, minter.key().as_ref()],
        bump
    )]
    pub user_record: Account<'info, UserRecord>,

    #[account(
        init,
        payer = minter,
        mint::decimals = 0,
        mint::authority = config,
        mint::freeze_authority = config,
        mint::token_program = token_program
    )]
    pub nft_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = minter,
        associated_token::mint = nft_mint,
        associated_token::authority = minter,
        associated_token::token_program = token_program
    )]
    pub nft_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK:
    /// 这是新 NFT 的 metadata PDA。
    /// 程序里会再次验证它是否真的是正确的 PDA。
    #[account(mut)]
    pub nft_metadata: UncheckedAccount<'info>,

    /// CHECK:
    /// 这是新 NFT 的 master edition PDA。
    /// 程序里会再次验证它是否真的是正确的 PDA。
    #[account(mut)]
    pub nft_master_edition: UncheckedAccount<'info>,

    /// CHECK:
    /// 这里引用你已经存在的 collection mint。
    /// 因为这不是本程序创建出来的账户，所以先作为 unchecked 传入，再在程序里验证地址。
    pub collection_mint: UncheckedAccount<'info>,

    /// CHECK:
    /// 现有 collection 的 metadata PDA。
    #[account(mut)]
    pub collection_metadata: UncheckedAccount<'info>,

    /// CHECK:
    /// 现有 collection 的 master edition PDA。
    pub collection_master_edition: UncheckedAccount<'info>,

    /// CHECK:
    /// 这是“collection authority delegate record”账户。
    /// 只有当你的主钱包先把 config PDA delegate 成 collection authority 后，这个 PDA 才会存在。
    pub collection_authority_record: UncheckedAccount<'info>,

    /// CHECK:
    /// 这里传入 collection 当前真正的 update authority。
    /// 你现在的设计里，这个地址仍然应该是你的主钱包。
    pub collection_update_authority: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub metadata_program: Program<'info, Metadata>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BurnNft<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [MINT_CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Account<'info, MintConfig>,

    #[account(
        mut,
        seeds = [USER_RECORD_SEED, owner.key().as_ref()],
        bump
    )]
    pub user_record: Account<'info, UserRecord>,

    #[account(mut)]
    pub nft_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = nft_mint,
        associated_token::authority = owner,
        associated_token::token_program = token_program
    )]
    pub nft_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[account]
#[derive(InitSpace)]
pub struct MintConfig {
    pub authority: Pubkey,
    pub collection_mint: Pubkey,
    pub mint_price: u64,
    pub current_supply: u32,
    pub max_supply: u32,
    pub treasury: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserRecord {
    pub owner: Pubkey,
    pub mint_count: u32,
}

impl UserRecord {
    pub const SEED_PREFIX: &'static [u8] = USER_RECORD_SEED;
}

#[error_code]
pub enum MinterError {
    #[msg("这个 collection 已经 mint 完了")]
    SoldOut,
    #[msg("这个钱包已经 mint 过一张 NFT 了")]
    MintLimitReached,
    #[msg("UserRecord 和当前钱包不匹配")]
    InvalidUserRecord,
    #[msg("数学溢出")]
    MathOverflow,
    #[msg("传入的 NFT metadata PDA 不正确")]
    InvalidMetadataPda,
    #[msg("传入的 NFT master edition PDA 不正确")]
    InvalidMasterEditionPda,
    #[msg("传入的 collection mint 和配置不一致")]
    InvalidCollectionMint,
    #[msg("传入的 collection metadata PDA 不正确")]
    InvalidCollectionMetadataPda,
    #[msg("传入的 collection master edition PDA 不正确")]
    InvalidCollectionMasterEditionPda,
    #[msg("传入的 collection authority record PDA 不正确")]
    InvalidCollectionAuthorityRecordPda,
    #[msg("传入的 collection update authority 不正确")]
    InvalidCollectionUpdateAuthority,
    #[msg("这个钱包当前没有可销毁的 NFT")]
    NothingToBurn,
    #[msg("数学下溢")]
    MathUnderflow,
}

fn find_metadata_pda(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[METADATA_PREFIX, metadata::ID.as_ref(), mint.as_ref()],
        &metadata::ID,
    )
    .0
}

fn find_master_edition_pda(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[
            METADATA_PREFIX,
            metadata::ID.as_ref(),
            mint.as_ref(),
            EDITION_PREFIX,
        ],
        &metadata::ID,
    )
    .0
}

fn find_collection_authority_record_pda(collection_mint: &Pubkey, authority: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[
            METADATA_PREFIX,
            metadata::ID.as_ref(),
            collection_mint.as_ref(),
            COLLECTION_AUTHORITY_PREFIX,
            authority.as_ref(),
        ],
        &metadata::ID,
    )
    .0
}

fn validate_full_mint_accounts(
    accounts: &MintNftWithMetadata,
    expected_collection_mint: Pubkey,
    config_key: Pubkey,
) -> Result<()> {
    require_keys_eq!(
        accounts.collection_mint.key(),
        expected_collection_mint,
        MinterError::InvalidCollectionMint
    );
    require_keys_eq!(
        accounts.nft_metadata.key(),
        find_metadata_pda(&accounts.nft_mint.key()),
        MinterError::InvalidMetadataPda
    );
    require_keys_eq!(
        accounts.nft_master_edition.key(),
        find_master_edition_pda(&accounts.nft_mint.key()),
        MinterError::InvalidMasterEditionPda
    );
    require_keys_eq!(
        accounts.collection_metadata.key(),
        find_metadata_pda(&expected_collection_mint),
        MinterError::InvalidCollectionMetadataPda
    );
    require_keys_eq!(
        accounts.collection_master_edition.key(),
        find_master_edition_pda(&expected_collection_mint),
        MinterError::InvalidCollectionMasterEditionPda
    );
    require_keys_eq!(
        accounts.collection_authority_record.key(),
        find_collection_authority_record_pda(&expected_collection_mint, &config_key),
        MinterError::InvalidCollectionAuthorityRecordPda
    );
    require_keys_eq!(
        accounts.collection_update_authority.key(),
        accounts.config.authority,
        MinterError::InvalidCollectionUpdateAuthority
    );
    Ok(())
}

fn mint_token_to_user(accounts: &MintNftWithMetadata, signer_seeds: &[&[u8]]) -> Result<()> {
    let signer = &[signer_seeds];
    let mint_to_accounts = MintTo {
        mint: accounts.nft_mint.to_account_info(),
        to: accounts.nft_token_account.to_account_info(),
        authority: accounts.config.to_account_info(),
    };

    let mint_to_program = accounts.token_program.to_account_info();
    let mint_to_ctx = CpiContext::new_with_signer(mint_to_program, mint_to_accounts, signer);
    token_interface::mint_to(mint_to_ctx, 1)
}

fn create_nft_metadata_account(
    accounts: &MintNftWithMetadata,
    signer_seeds: &[&[u8]],
    name: &str,
    symbol: &str,
    uri: &str,
) -> Result<()> {
    let signer = &[signer_seeds];
    let metadata_data = metadata::mpl_token_metadata::types::DataV2 {
        name: name.to_string(),
        symbol: symbol.to_string(),
        uri: uri.to_string(),
        seller_fee_basis_points: 0,
        creators: None,
        collection: None,
        uses: None,
    };

    let create_metadata_accounts = CreateMetadataAccountsV3 {
        metadata: accounts.nft_metadata.to_account_info(),
        mint: accounts.nft_mint.to_account_info(),
        mint_authority: accounts.config.to_account_info(),
        payer: accounts.minter.to_account_info(),
        // 新 NFT 自己的 update authority 交给程序 PDA。
        // 这样公开用户 mint 时，不需要 collection owner 每次都一起签名。
        update_authority: accounts.config.to_account_info(),
        system_program: accounts.system_program.to_account_info(),
        rent: accounts.rent.to_account_info(),
    };

    let create_metadata_ctx = CpiContext::new_with_signer(
        accounts.metadata_program.to_account_info(),
        create_metadata_accounts,
        signer,
    );

    create_metadata_accounts_v3(
        create_metadata_ctx,
        metadata_data,
        true,
        true,
        None,
    )
}

fn create_nft_master_edition_account(
    accounts: &MintNftWithMetadata,
    signer_seeds: &[&[u8]],
) -> Result<()> {
    let signer = &[signer_seeds];
    let create_master_edition_accounts = CreateMasterEditionV3 {
        edition: accounts.nft_master_edition.to_account_info(),
        mint: accounts.nft_mint.to_account_info(),
        // master edition 也沿用程序 PDA 作为 update authority。
        update_authority: accounts.config.to_account_info(),
        mint_authority: accounts.config.to_account_info(),
        payer: accounts.minter.to_account_info(),
        metadata: accounts.nft_metadata.to_account_info(),
        token_program: accounts.token_program.to_account_info(),
        system_program: accounts.system_program.to_account_info(),
        rent: accounts.rent.to_account_info(),
    };

    let create_master_edition_ctx = CpiContext::new_with_signer(
        accounts.metadata_program.to_account_info(),
        create_master_edition_accounts,
        signer,
    );

    create_master_edition_v3(create_master_edition_ctx, Some(0))
}

fn verify_nft_into_collection(
    accounts: &MintNftWithMetadata,
    signer_seeds: &[&[u8]],
) -> Result<()> {
    let signer = &[signer_seeds];
    let verify_accounts = SetAndVerifySizedCollectionItem {
        metadata: accounts.nft_metadata.to_account_info(),
        collection_authority: accounts.config.to_account_info(),
        payer: accounts.minter.to_account_info(),
        // 这里要求 collection NFT 和当前新 NFT 拥有同一个 update authority。
        // 前一步我们已经把新 NFT 的 update authority 交回给 collection owner，
        // 所以 verify 这里必须传 collection owner 钱包。
        update_authority: accounts.collection_update_authority.to_account_info(),
        collection_mint: accounts.collection_mint.to_account_info(),
        collection_metadata: accounts.collection_metadata.to_account_info(),
        collection_master_edition: accounts.collection_master_edition.to_account_info(),
    };

    let verify_ctx = CpiContext::new_with_signer(
        accounts.metadata_program.to_account_info(),
        verify_accounts,
        signer,
    )
    .with_remaining_accounts(vec![accounts.collection_authority_record.to_account_info()]);

    set_and_verify_sized_collection_item(
        verify_ctx,
        Some(accounts.collection_authority_record.key()),
    )
}

fn hand_over_nft_update_authority_to_collection_owner(
    accounts: &MintNftWithMetadata,
    signer_seeds: &[&[u8]],
) -> Result<()> {
    let signer = &[signer_seeds];
    let update_accounts = UpdateMetadataAccountsV2 {
        metadata: accounts.nft_metadata.to_account_info(),
        update_authority: accounts.config.to_account_info(),
    };

    let update_ctx = CpiContext::new_with_signer(
        accounts.metadata_program.to_account_info(),
        update_accounts,
        signer,
    );

    update_metadata_accounts_v2(
        update_ctx,
        Some(accounts.collection_update_authority.key()),
        None,
        None,
        None,
    )
}
