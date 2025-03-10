import { TransactionManager } from './utils/transaction-manager';

async function main() {
  // Get batch ID from command line arguments
  const batchId = process.argv[2];

  if (!batchId) {
    console.error('Please provide a batch ID to rollback');
    console.error('Usage: yarn seed:rollback <batch-id>');
    process.exit(1);
  }

  console.log(`Starting rollback for batch: ${batchId}`);

  const txManager = new TransactionManager();

  try {
    await txManager.rollback(batchId);
    console.log('Rollback completed successfully!');
  } catch (error) {
    console.error('Rollback failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };
