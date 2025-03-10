import { addYears, subYears } from 'date-fns';

export interface SeedingConfig {
  // Time ranges
  startDate: Date;
  endDate: Date;

  // Batch processing
  batchSize: number;

  // Data volumes
  volumes: {
    users: number;
    organizations: number;
    eventsDistribution: {
      largeOrg: { min: number; max: number }; // 30-50 events
      mediumOrg: { min: number; max: number }; // 15-30 events
      smallOrg: { min: number; max: number }; // 5-15 events
    };
    eventCapacityDistribution: {
      extraLarge: { min: number; max: number; percentage: number }; // 5%
      large: { min: number; max: number; percentage: number }; // 15%
      medium: { min: number; max: number; percentage: number }; // 40%
      small: { min: number; max: number; percentage: number }; // 40%
    };
    ticketTypesPerEvent: { min: number; max: number };
  };

  // Distribution parameters
  distribution: {
    organizations: {
      largePercentage: number; // 20%
      mediumPercentage: number; // 40%
      smallPercentage: number; // 40%
    };
    events: {
      pastPercentage: number; // 50%
      currentPercentage: number; // 10%
      futurePercentage: number; // 40%
    };
    orders: {
      earlyBirdPercentage: number; // 40%
      regularPercentage: number; // 40%
      lastMinutePercentage: number; // 20%
    };
    eventFillRate: {
      high: { min: number; max: number; percentage: number }; // 20% of events at 90-100%
      medium: { min: number; max: number; percentage: number }; // 30% of events at 70-89%
      moderate: { min: number; max: number; percentage: number }; // 30% of events at 50-69%
      low: { min: number; max: number; percentage: number }; // 20% of events at 0-49%
    };
  };
}

// Default configuration
export const defaultConfig: SeedingConfig = {
  startDate: subYears(new Date(), 2), // 2 years ago
  endDate: new Date(), // Today

  batchSize: 5000,

  volumes: {
    users: 5000,
    organizations: 100,
    eventsDistribution: {
      largeOrg: { min: 30, max: 50 },
      mediumOrg: { min: 15, max: 30 },
      smallOrg: { min: 5, max: 15 },
    },
    eventCapacityDistribution: {
      extraLarge: { min: 2000, max: 5000, percentage: 5 }, // Very few events have close to 1000 capacity
      large: { min: 1000, max: 2000, percentage: 15 }, // 15% are large venues
      medium: { min: 500, max: 1000, percentage: 35 }, // 35% are medium-sized venues
      small: { min: 100, max: 500, percentage: 45 }, // 45% are smaller venues
    },
    ticketTypesPerEvent: { min: 2, max: 4 },
  },

  distribution: {
    organizations: {
      largePercentage: 20,
      mediumPercentage: 40,
      smallPercentage: 40,
    },
    events: {
      pastPercentage: 50,
      currentPercentage: 25,
      futurePercentage: 25,
    },
    orders: {
      earlyBirdPercentage: 40,
      regularPercentage: 40,
      lastMinutePercentage: 20,
    },
    eventFillRate: {
      high: { min: 90, max: 100, percentage: 20 },
      medium: { min: 70, max: 89, percentage: 30 },
      moderate: { min: 50, max: 69, percentage: 30 },
      low: { min: 0, max: 49, percentage: 20 },
    },
  },
};
