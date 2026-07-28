import { Request, Response } from 'express';
import { Collection } from '../schemas/collection.schema';

export const getRanking = async (req: Request, res: Response) => {
  try {
    let { page = '1', limit = '10', chainId, category, time } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.max(1, parseInt(limit as string, 10));

    // 1. Build Match Filters
    const filters: any = {};
    if (chainId) filters.chainId = Number(chainId);
    if (category && category !== 'All') filters.category = category;

    // 2. Map frontend time keys to Schema paths
    const timeMap: Record<string, string> = {
      '7-days': 'stats.stats7d.volume',
      '14-days': 'stats.stats14d.volume',
      '30-days': 'stats.stats30d.volume',
      '60-days': 'stats.stats60d.volume',
      '90-days': 'stats.stats90d.volume',
      'all-time': 'stats.allTime.volume',
    };

    const sortPath = timeMap[time as string] || 'stats.totalVolume';
    

    // 3. Execution Pipeline
    const collections = await Collection.aggregate([
      { $match: filters },
      // Sort by the specific time-period volume before pagination
      { $sort: { [sortPath]: -1 } },
      { $skip: (pageNum - 1) * limitNum },
      { $limit: limitNum },
      {
        $project: {
          id: '$_id',
          name: 1,
          slug: 1,
          image: '$avatarUrl',
          verified: '$isVerified',

          volume: { $ifNull: [`$${sortPath}`, 0] },

          percentageChange: { $ifNull: ['$stats.volumeChange24h', 0] },
          percentageChangeweekly: { $ifNull: ['$stats.volumeChange7d', 0] },

          floorPrice: {
            $ifNull: [{ $ifNull: ['$stats.floorPrice', '$stats.allTime.floorPrice'] }, 0],
          },
          owner: { $ifNull: ['$stats.owners', 0] },
          supply: { $ifNull: ['$stats.items', 0] },
          creatorAddress:1,
          chainId: 1,
          category: 1,
        },
      },
    ]);

    const nextPage = collections.length < limitNum ? null : pageNum + 1;

    const formattedData = collections.map((col) => ({
      ...col,
      percentageChange: col.percentageChange >= 0 ? `+${col.percentageChange}%` : `${col.percentageChange}%`,
      percentageChangeweekly: col.percentageChangeweekly >= 0 ? `+${col.percentageChangeweekly}%` : `${col.percentageChangeweekly}%`,
      volume: col.volume.toLocaleString(),
      floorPrice: col.floorPrice.toLocaleString(),
    }));

    res.status(200).json({ data: formattedData, nextPage });
  } catch (err) {
    console.error('Error fetching ranking:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
