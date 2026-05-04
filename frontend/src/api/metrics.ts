import { api } from './client'

export interface FlSnapshot {
  businessDate: string
  totalSales: number
  foodCost: number
  laborCostHourly: number
  laborCostBack: number
  expenseTotal: number
  flRate: number
  profit: number
}

export const metricsApi = {
  getFlToday: () => api.get<FlSnapshot>('/api/metrics/fl'),
  getFlMonthly: (month: string) =>
    api.get<{ month: string; days: FlSnapshot[]; total: FlSnapshot }>(
      `/api/metrics/fl/monthly?month=${encodeURIComponent(month)}`,
    ),
}
