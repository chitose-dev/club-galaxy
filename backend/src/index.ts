import express from 'express'
import cors from 'cors'
import { requireAuth } from './middleware/auth'
import { tablesRouter } from './routes/tables'
import { castsRouter } from './routes/casts'
import { menuRouter } from './routes/menu'
import { billingRouter } from './routes/billing'
import { bottlesRouter } from './routes/bottles'
import { payrollRouter } from './routes/payroll'
import { settingsRouter } from './routes/settings'
import { authRouter } from './routes/auth'

const app = express()
const port = parseInt(process.env.PORT || '3001', 10)

app.use(cors())
app.use(express.json())

// Public routes
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})
app.use('/api/auth', authRouter)

// Protected routes
app.use('/api/tables', requireAuth, tablesRouter)
app.use('/api/casts', requireAuth, castsRouter)
app.use('/api/menu', requireAuth, menuRouter)
app.use('/api/billing', requireAuth, billingRouter)
app.use('/api/bottles', requireAuth, bottlesRouter)
app.use('/api/payroll', requireAuth, payrollRouter)
app.use('/api/settings', requireAuth, settingsRouter)

app.listen(port, () => {
  console.log(`Server running on port ${port}`)
})
