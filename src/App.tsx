import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { BasicLayout } from '@/layouts/BasicLayout'
import { LoginPage } from '@/pages/auth/LoginPage'
import { useUserStore } from '@/store/userStore'
import { DashboardPage } from '@/pages/dashboard'
import { CockpitPage } from '@/pages/dashboard/CockpitPage'
import { VoucherListPage } from '@/pages/voucher/VoucherList'
import { VoucherEditPage } from '@/pages/voucher/VoucherEdit'
import { AccountSubjectPage } from '@/pages/settings/AccountSubject'
import { CashManagePage } from '@/pages/cash/CashManage'
import { ContactManagePage } from '@/pages/contact/ContactManage'
import { AssetManagePage } from '@/pages/asset/AssetManage'
import { ExpenseManagePage } from '@/pages/expense/ExpenseManage'
import { ArApPage } from '@/pages/arap/ArApPage'
import { TaxManagePage } from '@/pages/tax/TaxManage'
import { ReportCenterPage } from '@/pages/report/ReportCenter'
import { ReportCompare } from '@/pages/report/ReportCompare'
import { ConsolidationReportPage } from '@/pages/report/ConsolidationReport'
import { LedgerPage } from '@/pages/ledger/LedgerPage'
import { ClosingPage } from '@/pages/closing/ClosingPage'
import { SystemSettingsPage } from '@/pages/system/SystemSettings'
import { AiSettingsPage } from '@/pages/system/AiSettings'
import { ExchangeRatePage } from '@/pages/system/ExchangeRatePage'
import { BackupSettingsPage } from '@/pages/settings/BackupSettings'
import { StatementImportPage } from '@/pages/settings/StatementImportPage'
import { AccountTemplatePage } from '@/pages/settings/AccountTemplatePage'
import { IntegrationSettingsPage } from '@/pages/system/IntegrationSettings'
import { NlAccountingEntryPage } from '@/pages/ai/NlAccountingEntry'
import { InventoryPage } from '@/pages/inventory/InventoryPage'
import { OpeningPage } from '@/pages/opening/OpeningPage'
import { BudgetManagePage } from '@/pages/budget/BudgetManage'
import { LogAuditPage } from '@/pages/system/LogAudit'
import { BossCockpitPage } from '@/pages/boss/BossCockpit'
import { QuickEntryPage } from '@/pages/quick/QuickEntry'
import { WorkbenchPage } from '@/pages/workbench/Workbench'
import { MobileHomePage } from '@/pages/mobile/MobileHome'

function RequireAuth({ children }: { children: JSX.Element }) {
  const currentUser = useUserStore((s) => s.currentUser)
  if (!currentUser) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><BasicLayout /></RequireAuth>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="boss" element={<BossCockpitPage />} />
          <Route path="quick" element={<QuickEntryPage />} />
          <Route path="workbench" element={<WorkbenchPage />} />
          <Route path="m" element={<MobileHomePage />} />
          <Route path="analytics" element={<CockpitPage />} />
          <Route path="voucher" element={<VoucherListPage />} />
          <Route path="voucher/edit" element={<VoucherEditPage />} />
          <Route path="voucher/edit/:id" element={<VoucherEditPage />} />
          <Route path="ai" element={<NlAccountingEntryPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="settings/account-subject" element={<AccountSubjectPage />} />
          <Route path="cash" element={<CashManagePage />} />
          <Route path="contact" element={<ContactManagePage />} />
          <Route path="arap" element={<ArApPage />} />
          <Route path="asset" element={<AssetManagePage />} />
          <Route path="expense" element={<ExpenseManagePage />} />
          <Route path="tax" element={<TaxManagePage />} />
          <Route path="report" element={<ReportCenterPage />} />
          <Route path="report/compare" element={<ReportCompare />} />
          <Route path="report/consolidation" element={<ConsolidationReportPage />} />
          <Route path="ledger" element={<LedgerPage />} />
          <Route path="closing" element={<ClosingPage />} />
          <Route path="system" element={<SystemSettingsPage />} />
          <Route path="system/ai" element={<AiSettingsPage />} />
          <Route path="system/exchange-rate" element={<ExchangeRatePage />} />
          <Route path="system/backup" element={<BackupSettingsPage />} />
          <Route path="system/statement-import" element={<StatementImportPage />} />
          <Route path="system/templates" element={<AccountTemplatePage />} />
          <Route path="system/integration" element={<IntegrationSettingsPage />} />
          <Route path="opening" element={<OpeningPage />} />
          <Route path="budget" element={<BudgetManagePage />} />
          <Route path="log" element={<LogAuditPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
