import express from 'express'
import cors from 'cors'
import { requireAuth, requireRole } from './middleware/auth'
import { tablesRouter } from './routes/tables'
import { castsRouter } from './routes/casts'
import { menuRouter } from './routes/menu'
import { billingRouter } from './routes/billing'
import { bottlesRouter } from './routes/bottles'
import { payrollRouter } from './routes/payroll'
import { settingsRouter } from './routes/settings'
import { authRouter } from './routes/auth'
import { dailyReportsRouter } from './routes/dailyReports'
import { attendanceRouter } from './routes/attendance'
import { expensesRouter } from './routes/expenses'
import { advancesRouter } from './routes/advances'
import { metricsRouter } from './routes/metrics'
import { exportRouter } from './routes/export'
import { archiveRouter } from './routes/archive'
import { salaryRouter } from './routes/salary'

const app = express()
const port = parseInt(process.env.PORT || '3001', 10)

app.use(cors())
app.use(express.json())

// Public routes
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})
app.use('/api/auth', authRouter)

// Protected routes（設計書 §8.6 準拠）
app.use('/api/tables',        requireAuth, requireRole('owner', 'staff'), tablesRouter)
app.use('/api/casts',         requireAuth, castsRouter)  // 内部でロール分岐
app.use('/api/menu',          requireAuth, menuRouter)   // 内部でロール分岐
app.use('/api/billing',       requireAuth, requireRole('owner', 'staff'), billingRouter)
app.use('/api/bottles',       requireAuth, requireRole('owner', 'staff'), bottlesRouter)
app.use('/api/payroll',       requireAuth, requireRole('owner', 'staff'), payrollRouter)
app.use('/api/settings',      requireAuth, requireRole('owner'), settingsRouter)
app.use('/api/daily-reports', requireAuth, requireRole('owner', 'staff'), dailyReportsRouter)

// 新規ルーター
app.use('/api/attendance',    requireAuth, requireRole('owner', 'staff'), attendanceRouter)
app.use('/api/expenses',      requireAuth, requireRole('owner', 'staff'), expensesRouter)
app.use('/api/advances',      requireAuth, requireRole('owner', 'staff'), advancesRouter)
app.use('/api/metrics',       requireAuth, requireRole('owner'), metricsRouter)
app.use('/api/export',        requireAuth, requireRole('owner'), exportRouter)
app.use('/api/archive',       requireAuth, requireRole('owner'), archiveRouter)
app.use('/api/salary',        requireAuth, salaryRouter)  // JWT sub で自己制限

app.listen(port, () => {
  console.log(`Server running on port ${port}`)
})
