import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { createTables } from './schema.js';
import { seedDatabase } from './seed.js';
import authRouter from './routes/auth.js';
import { requireAuth } from './middleware/auth.js';
import rulesRouter from './routes/rules.js';
import excludePatternsRouter from './routes/excludePatterns.js';
import cseRouter from './routes/cse.js';
import customersRouter from './routes/customers.js';
import transactionsRouter from './routes/transactions.js';
import usersRouter from './routes/users.js';
import targetsRouter from './routes/targets.js';
import historyRouter from './routes/history.js';
import recycleBinRouter from './routes/recycleBin.js';
import bankAccountsRouter from './routes/bankAccounts.js';
import columnOverridesRouter from './routes/columnOverrides.js';
import settingsRouter from './routes/settings.js';
import adviseFilesRouter from './routes/adviseFiles.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Auth route — public (no JWT required)
app.use('/api/auth', authRouter);

// Protect all other /api routes with JWT
app.use('/api', requireAuth);

// API routes
app.use('/api/rules', rulesRouter);
app.use('/api/exclude-patterns', excludePatternsRouter);
app.use('/api/cse', cseRouter);
app.use('/api/customers', customersRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/users', usersRouter);
app.use('/api/targets', targetsRouter);
app.use('/api/history', historyRouter);
app.use('/api/recycle-bin', recycleBinRouter);
app.use('/api/bank-accounts', bankAccountsRouter);
app.use('/api/column-overrides', columnOverridesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/advise-files', adviseFilesRouter);

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.get('/{*path}', (req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });
}

// Start server after DB is ready
async function start() {
  try {
    await createTables();
    await seedDatabase();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
