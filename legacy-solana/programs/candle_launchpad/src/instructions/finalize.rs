use anchor_lang::prelude::*;

use crate::errors::CandleError;
use crate::state::*;

#[derive(Accounts)]
pub struct Finalize<'info> {
    #[account(mut)]
    pub auction: Account<'info, Auction>,
}

pub struct Clearing {
    pub clearing_tick: u8,
    pub margin_supply: u64,
    pub margin_demand: u64,
    pub total_sold: u64,
}

/// Uniform-price clearing over the tick histogram (plan §5).
pub fn compute_clearing(demand: &[u64], num_ticks: u8, supply: u64) -> Clearing {
    let mut cumulative: u64 = 0;
    for tick in (0..num_ticks as usize).rev() {
        let d = demand[tick];
        cumulative = cumulative.saturating_add(d);
        if cumulative >= supply {
            let above = cumulative - d;
            let remaining = supply - above;
            return Clearing {
                clearing_tick: tick as u8,
                margin_supply: remaining,
                margin_demand: d,
                total_sold: supply,
            };
        }
    }
    // Demand < supply: everyone revealed is filled in full at the floor price.
    // margin_demand == demand[0] (may be 0); margin_supply == demand[0] gives ratio 1.
    Clearing {
        clearing_tick: 0,
        margin_supply: demand[0],
        margin_demand: demand[0],
        total_sold: cumulative,
    }
}

pub fn finalize(ctx: Context<Finalize>) -> Result<()> {
    let clock = Clock::get()?;
    let auction = &mut ctx.accounts.auction;
    require!(auction.state == AuctionState::Revealing, CandleError::InvalidState);
    require!(clock.slot > auction.reveal_end_slot, CandleError::RevealPeriodNotEnded);

    let c = compute_clearing(&auction.demand_by_tick, auction.num_ticks, auction.supply);
    auction.clearing_tick = c.clearing_tick;
    auction.margin_supply = c.margin_supply;
    auction.margin_demand = c.margin_demand;
    auction.total_sold = c.total_sold;

    let price = auction.price_of_tick(c.clearing_tick)?;
    let raised = auction.cost(c.total_sold, price)?;
    if c.total_sold == 0 || raised < auction.min_raise {
        auction.state = AuctionState::Cancelled;
    } else {
        auction.state = AuctionState::Finalized;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oversubscribed_margin() {
        let mut d = [0u64; MAX_TICKS];
        d[5] = 100; // highest
        d[3] = 300;
        d[1] = 1000;
        let c = compute_clearing(&d, 8, 250);
        assert_eq!(c.clearing_tick, 3);
        assert_eq!(c.margin_supply, 150);
        assert_eq!(c.margin_demand, 300);
        assert_eq!(c.total_sold, 250);
    }

    #[test]
    fn undersubscribed() {
        let mut d = [0u64; MAX_TICKS];
        d[5] = 100;
        d[0] = 50;
        let c = compute_clearing(&d, 8, 1000);
        assert_eq!(c.clearing_tick, 0);
        assert_eq!(c.total_sold, 150);
        assert_eq!(c.margin_supply, 50);
        assert_eq!(c.margin_demand, 50);
    }

    #[test]
    fn exact_fill_at_top_tick() {
        let mut d = [0u64; MAX_TICKS];
        d[63] = 1000;
        let c = compute_clearing(&d, 64, 1000);
        assert_eq!(c.clearing_tick, 63);
        assert_eq!(c.margin_supply, 1000);
        assert_eq!(c.margin_demand, 1000);
    }

    #[test]
    fn pro_rata_never_overfills() {
        // 7 bids of odd sizes at the margin, supply 100.
        let qs = [13u64, 29, 7, 41, 3, 17, 23];
        let demand: u64 = qs.iter().sum();
        let mut d = [0u64; MAX_TICKS];
        d[2] = demand;
        let c = compute_clearing(&d, 4, 100);
        let filled: u64 = qs.iter().map(|q| ((*q as u128) * (c.margin_supply as u128) / (c.margin_demand as u128)) as u64).sum();
        assert!(filled <= 100);
        assert!(filled >= 100 - qs.len() as u64);
    }
}
