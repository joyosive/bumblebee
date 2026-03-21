import { Venture, TrustScoreBreakdown } from '../data/types.js';

const SECTOR_SCORES: Record<string, number> = {
  'Healthcare': 15,
  'Education': 15,
  'WASH': 15,
  'Environment': 14,
  'Human Rights': 13,
  'Economic Empowerment': 13,
  'Agriculture': 12,
  'Energy': 12,
  'Multi-sector': 10,
};

/**
 * Calculate a deterministic trust score for a venture.
 * No randomness — every component is derived from verifiable fields.
 *
 * Score breakdown (0-100):
 *   Maturity (0-20)     — years since founding
 *   Reach (0-15)        — number of operating countries
 *   Backing (0-20)      — support type and depth
 *   Transparency (0-15) — public website, named leadership
 *   Sector (0-15)       — SDG-aligned sector scoring
 *   Community (0-15)    — serves vulnerable populations
 */
export function calculateTrustScore(venture: Venture): TrustScoreBreakdown {
  // Maturity: older orgs are more established (max 20)
  const yearsActive = 2026 - (venture.yearFounded || 2020);
  const maturity = Math.min(yearsActive * 2, 20);

  // Geographic reach: operating in more countries = proven scalability (max 15)
  const countryList = venture.countries.split(',').map(s => s.trim()).filter(Boolean);
  const reach = Math.min(countryList.length * 3, 15);

  // Ecosystem backing: support type signals credibility (max 20)
  const support = (venture.supportType || '').toLowerCase();
  const hasGrant = support.includes('grant') || support.includes('funding') ? 10 : 0;
  const hasAdvisory = support.includes('advisory') || support.includes('capacity') || support.includes('expert') ? 10 : 0;
  const backing = hasGrant + hasAdvisory;

  // Transparency: publicly verifiable information available (max 15)
  const hasWebsite = venture.website && venture.website.length > 0 ? 5 : 0;
  const hasLeader = venture.leader ? 5 : 0;
  const hasProjectFocus = venture.projectFocus && venture.projectFocus.length > 0 ? 5 : 0;
  const transparency = hasWebsite + hasLeader + hasProjectFocus;

  // Sector alignment to UN SDGs (max 15)
  const sector = SECTOR_SCORES[venture.sector] || 10;

  // Community focus: serving vulnerable populations (max 15)
  const communities = (venture.communitiesServed || '').toLowerCase();
  const womenGirls = communities.includes('women') || communities.includes('girls') ? 5 : 0;
  const rural = communities.includes('rural') ? 5 : 0;
  const farmers = communities.includes('farmer') ? 5 : 0;
  const children = communities.includes('children') || communities.includes('youth') ? 5 : 0;
  const community = Math.min(womenGirls + rural + farmers + children, 15);

  const total = maturity + reach + backing + transparency + sector + community;

  return { total, maturity, reach, backing, transparency, sector, community };
}

/**
 * Format trust score as a readable report for Telegram.
 */
export function formatScoreReport(venture: Venture, score: TrustScoreBreakdown): string {
  const bar = (value: number, max: number) => {
    const filled = Math.round((value / max) * 5);
    return '█'.repeat(filled) + '░'.repeat(5 - filled);
  };

  return [
    `📊 **Trust Score: ${score.total}/100**`,
    '',
    `${bar(score.maturity, 20)} Maturity: ${score.maturity}/20`,
    `${bar(score.reach, 15)} Reach: ${score.reach}/15`,
    `${bar(score.backing, 20)} Backing: ${score.backing}/20`,
    `${bar(score.transparency, 15)} Transparency: ${score.transparency}/15`,
    `${bar(score.sector, 15)} Sector: ${score.sector}/15`,
    `${bar(score.community, 15)} Community: ${score.community}/15`,
    '',
    `📍 ${venture.countries}`,
    `🏢 HQ: ${venture.hq} | Founded: ${venture.yearFounded || 'N/A'}`,
    `👤 ${venture.leader || 'Leadership not public'}`,
    venture.website ? `🔗 ${venture.website}` : '',
  ].filter(Boolean).join('\n');
}
