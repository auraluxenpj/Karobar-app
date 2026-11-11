import React, { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";

import DashboardLayout from "../layouts/DashboardLayout.jsx";
import ProtectedRoute from "../components/ProtectedRoute.jsx";
import AuthGuard from "../components/AuthGuard.jsx";
import SaleSystemGuard from "../components/SaleSystemGuard.jsx";
import PageSkeleton from "../components/PageSkeleton.jsx";

const ROUTE_PRELOADERS = new Map();
const preloadedPaths = new Set();

function registerLazy(factory, paths = []) {
  const Comp = lazy(factory);
  for (const p of paths) {
    ROUTE_PRELOADERS.set(p, factory);
  }
  return Comp;
}

export function preloadRoute(path) {
  if (!path || typeof path !== "string") return;
  const clean = path.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  if (preloadedPaths.has(clean)) return;
  const loader = ROUTE_PRELOADERS.get(clean);
  if (loader) {
    preloadedPaths.add(clean);
    Promise.resolve(loader()).catch(() => {
      preloadedPaths.delete(clean);
    });
  }
}

const Login = registerLazy(() => import("../pages/Login.jsx"), ["/"]);
const ForgotPassword = registerLazy(() => import("../pages/ForgotPassword.jsx"), ["/forgot-password"]);
const ResetPassword = registerLazy(() => import("../pages/ResetPassword.jsx"));
const Profile = registerLazy(() => import("../pages/Profile.jsx"), ["/profile"]);
const Suppliers = registerLazy(() => import("../pages/Suppliers/index.jsx"), ["/suppliers"]);
const CreateSupplier = registerLazy(() => import("../pages/Suppliers/Create.jsx"), ["/suppliers/create"]);
const EditSupplier = registerLazy(() => import("../pages/Suppliers/Edit.jsx"));
const Customers = registerLazy(() => import("../pages/Customers/index.jsx"), ["/customers"]);
const CreateCustomer = registerLazy(() => import("../pages/Customers/Create.jsx"), ["/customers/create"]);
const EditCustomer = registerLazy(() => import("../pages/Customers/Edit.jsx"));
const ShowCustomer = registerLazy(() => import("../pages/Customers/Show.jsx"));
const Categories = registerLazy(() => import("../pages/Categories.jsx"), ["/categories"]);
const Brands = registerLazy(() => import("../pages/Brands/index.jsx"), ["/brands"]);
const CreateBrand = registerLazy(() => import("../pages/Brands/Create.jsx"), ["/brands/create"]);
const EditBrand = registerLazy(() => import("../pages/Brands/Edit.jsx"));
const ProductsIndex = registerLazy(() => import("../pages/Products/index.jsx"), ["/products"]);
const CreateProduct = registerLazy(() => import("../pages/Products/Create.jsx"), ["/products/create"]);
const EditProduct = registerLazy(() => import("../pages/Products/Edit.jsx"));
const PurchaseInvoicesIndex = registerLazy(() => import("../pages/PurchaseInvoice/index.jsx"), ["/purchase-invoices"]);
const CreatePurchaseInvoice = registerLazy(() => import("../pages/PurchaseInvoice/Create.jsx"), ["/purchase-invoices/create"]);
const EditPurchaseInvoice = registerLazy(() => import("../pages/PurchaseInvoice/Edit.jsx"));
const ShowPurchaseInvoice = registerLazy(() => import("../pages/PurchaseInvoice/Show.jsx"));
const PurchaseReturnsIndex = registerLazy(() => import("../pages/PurchaseReturn/index.jsx"), ["/purchase-returns"]);
const CreatePurchaseReturn = registerLazy(() => import("../pages/PurchaseReturn/Create.jsx"), ["/purchase-returns/create"]);
const EditPurchaseReturn = registerLazy(() => import("../pages/PurchaseReturn/Edit.jsx"));
const IndexSaleInvoice = registerLazy(() => import("../pages/SaleInvoice/Index.jsx"), ["/sale-invoices", "/wholesale-invoices"]);
const CreateSaleInvoiceRetail = registerLazy(() => import("../pages/SaleInvoice/CreateRetail.jsx"), ["/sale-invoices/create/retail", "/sale-invoices/create-retail"]);
const CreateSaleInvoiceWholesale = registerLazy(() => import("../pages/SaleInvoice/CreateWholesale.jsx"), ["/wholesale-invoices/create", "/sale-invoices/create/wholesale", "/sale-invoices/create-wholesale"]);
const BarcodePos = registerLazy(() => import("../pages/SaleInvoice/BarcodePos.jsx"), ["/sale-invoices/pos", "/sale-invoices/barcode-pos"]);
const EditSaleInvoice = registerLazy(() => import("../pages/SaleInvoice/Edit.jsx"));
const ShowSaleInvoice = registerLazy(() => import("../pages/SaleInvoice/Show.jsx"));
const IndexSaleReturn = registerLazy(() => import("../pages/SaleReturn/Index.jsx"), ["/sale-returns"]);
const CreateSaleReturn = registerLazy(() => import("../pages/SaleReturn/Create.jsx"), ["/sale-returns/create"]);
const EditSaleReturn = registerLazy(() => import("../pages/SaleReturn/Edit.jsx"));
const PurchaseOrders = registerLazy(() => import("../pages/PurchaseOrders.jsx"), ["/purchase-orders", "/purchase-orders/create"]);
const PurchaseOrder = registerLazy(() => import("../pages/PurchaseOrder.jsx"), ["/purchase-orders/forecast"]);
const UserDemandsIndex = registerLazy(() => import("../pages/UserDemand/index.jsx"), ["/user-demands"]);
const CreateUserDemand = registerLazy(() => import("../pages/UserDemand/Create.jsx"), ["/user-demands/create"]);
const Dashboard = registerLazy(() => import("../pages/Dashboard.jsx"), ["/dashboard"]);
const CostOfSaleReport = registerLazy(() => import("../pages/Reports/CostOfSaleReport.jsx"), ["/reports/cost-of-sale"]);
const CostOfSaleDetailReport = registerLazy(() => import("../pages/Reports/CostOfSaleDetailReport.jsx"), ["/reports/cost-of-sale-detail"]);
const PurchaseDetailReport = registerLazy(() => import("../pages/Reports/PurchaseDetailReport.jsx"), ["/reports/purchase-detail"]);
const SaleDetailReport = registerLazy(() => import("../pages/Reports/SaleDetailReport.jsx"), ["/reports/sale-detail"]);
const CurrentStockReport = registerLazy(() => import("../pages/Reports/CurrentStockReport.jsx"), ["/reports/current-stock"]);
const StockAdjustmentReport = registerLazy(() => import("../pages/Reports/StockAdjustmentReport.jsx"), ["/reports/stock-adjustment"]);
const ProductComprehensiveReport = registerLazy(() => import("../pages/Reports/ProductComprehensiveReport.jsx"), ["/reports/product-comprehensive"]);
const NearExpiryProductReport = registerLazy(() => import("../pages/Reports/NearExpiryProductReport.jsx"), ["/reports/near-expiry-product"]);
const BatchExpiryTracking = registerLazy(() => import("../pages/BatchExpiry/BatchExpiryTracking.jsx"), ["/batch-expiry"]);
const NetProfitReport = registerLazy(() => import("../pages/Reports/NetProfitReport.jsx"), ["/reports/net-profit"]);
const ExpensesIndex = registerLazy(() => import("../pages/Expenses/index.jsx"), ["/expenses"]);
const MissingReports = registerLazy(() => import("../pages/Reports/MissingReports.jsx"), [
  "/reports/purchase-returns",
  "/reports/sale-returns",
  "/reports/purchase-summary",
  "/reports/outstanding-aging",
  "/reports/reorder",
]);
const Setting = registerLazy(() => import("../pages/Setting.jsx"), ["/settings"]);
const SqliteImportPage = registerLazy(() => import("../pages/SqliteImportPage.jsx"), ["/settings/sqlite-import", "/sqlite-import"]);
const BackupsIndex = registerLazy(() => import("../pages/Backups/Index.jsx"), ["/backups"]);
const BarcodeIndex = registerLazy(() => import("../pages/Barcodes/Index.jsx"), ["/barcode-labels"]);
const StockAdjustmentsIndex = registerLazy(() => import("../pages/stock-adjustments/index.jsx"), ["/stock-adjustments"]);
const CreateStockAdjustment = registerLazy(() => import("../pages/stock-adjustments/Create.jsx"), ["/stock-adjustments/create"]);
const ShowStockAdjustment = registerLazy(() => import("../pages/stock-adjustments/Show.jsx"));
// Stocktake Sessions
const StocktakeIndex = registerLazy(() => import("../pages/stocktake/index.jsx"), ["/stocktake-sessions"]);
const CreateStocktake = registerLazy(() => import("../pages/stocktake/Create.jsx"), ["/stocktake-sessions/create"]);
const StocktakeSession = registerLazy(() => import("../pages/stocktake/Session.jsx"));
const StocktakeReview = registerLazy(() => import("../pages/stocktake/Review.jsx"));
// Stock Disposals & Quarantine
const StockDisposalsIndex = registerLazy(() => import("../pages/StockDisposals/index.jsx"), ["/stock-disposals"]);
const CreateStockDisposal = registerLazy(() => import("../pages/StockDisposals/Create.jsx"), ["/stock-disposals/create"]);
// Financial Accounts & Payment Vouchers
const AccountsPage = registerLazy(() => import("../pages/Accounts/index.jsx"), ["/accounts"]);
const PaymentsPage = registerLazy(() => import("../pages/Payments/index.jsx"), ["/payments"]);
const AccountingPage = registerLazy(() => import("../pages/Accounting/index.jsx"), ["/accounting"]);
const TaxReturnReport = registerLazy(() => import("../pages/Reports/TaxReturnReport.jsx"), ["/reports/tax-return"]);
const ProductBatchWorkbench = registerLazy(() => import("../pages/Batches/ProductBatchWorkbench.jsx"), ["/product-batches"]);
const HrPayrollCenter = registerLazy(() => import("../pages/HrPayroll/HrPayrollCenter.jsx"), ["/hr-payroll"]);
// Cash Drawer
const CashDrawerPage = registerLazy(() => import("../pages/CashDrawer/index.jsx"), ["/cash-drawer"]);
const SupplierLedgerPage = registerLazy(() => import("../pages/Ledger/SupplierLedgerPage.jsx"), ["/supplier-ledger"]);
const CustomerLedgerPage = registerLazy(() => import("../pages/Ledger/CustomerLedgerPage.jsx"), ["/customer-ledger"]);
const UsersIndex = registerLazy(() => import("../pages/users/index.jsx"), ["/users"]);
const CreateUser = registerLazy(() => import("../pages/users/Create.jsx"), ["/users/create"]);
const EditUser = registerLazy(() => import("../pages/users/Edit.jsx"));
const RolesIndex = registerLazy(() => import("../pages/roles/index.jsx"), ["/roles"]);
const CreateRole = registerLazy(() => import("../pages/roles/Create.jsx"), ["/roles/create"]);
const EditRole = registerLazy(() => import("../pages/roles/Edit.jsx"));
const ActivateLicense = registerLazy(() => import("../pages/ActivateLicense.jsx"), ["/activate"]);
const SetupWizard = registerLazy(() => import("../pages/SetupWizard.jsx"), ["/setup"]);
const BackgroundTasksPage = registerLazy(() => import("../pages/BackgroundTasks/Index.jsx"), ["/background-tasks"]);

function RouteFallback() {
  return <PageSkeleton fullScreen />;
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Public - Login page (redirects to dashboard if already authenticated) */}
        <Route
          path="/"
          element={
            <AuthGuard requireAuth={false}>
              <Login />
            </AuthGuard>
          }
        />

        {/* Public - Forgot Password page */}
        <Route
          path="/forgot-password"
          element={
            <AuthGuard requireAuth={false}>
              <ForgotPassword />
            </AuthGuard>
          }
        />

        {/* Public - Reset Password page */}
        <Route
          path="/reset-password/:token"
          element={
            <AuthGuard requireAuth={false}>
              <ResetPassword />
            </AuthGuard>
          }
        />
        <Route
          path="/reset-password/:token/:email"
          element={
            <AuthGuard requireAuth={false}>
              <ResetPassword />
            </AuthGuard>
          }
        />

        {/* First-Login Genie Setup Wizard (Fullscreen Protected Route) */}
        <Route
          path="/setup"
          element={
            <ProtectedRoute fullScreen shellOnly>
              <SetupWizard />
            </ProtectedRoute>
          }
        />

        {/* Fullscreen Protected Routes (POS Terminal) */}
        <Route
          path="/sale-invoices/pos"
          element={
            <ProtectedRoute fullScreen>
              <BarcodePos />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sale-invoices/barcode-pos"
          element={
            <ProtectedRoute fullScreen>
              <BarcodePos />
            </ProtectedRoute>
          }
        />

        {/* Persistent Dashboard Layout Shell — keeps Sidebar & Topbar mounted across navigations */}
        <Route
          element={
            <ProtectedRoute shellOnly>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/profile" element={<Profile />} />

          {/* Suppliers & Customers */}
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/suppliers/create" element={<CreateSupplier />} />
          <Route path="/suppliers/:id/edit" element={<EditSupplier />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/create" element={<CreateCustomer />} />
          <Route path="/customers/:id/edit" element={<EditCustomer />} />
          <Route path="/customers/:id" element={<ShowCustomer />} />

          {/* Catalog Masters */}
          <Route path="/categories" element={<Categories />} />
          <Route path="/brands" element={<Brands />} />
          <Route path="/brands/create" element={<CreateBrand />} />
          <Route path="/brands/:id/edit" element={<EditBrand />} />
          <Route path="/products" element={<ProductsIndex />} />
          <Route path="/products/create" element={<CreateProduct />} />
          <Route path="/products/:id/edit" element={<EditProduct />} />
          <Route path="/background-tasks" element={<BackgroundTasksPage />} />

          {/* Purchase Invoices */}
          <Route path="/purchase-invoices" element={<PurchaseInvoicesIndex />} />
          <Route path="/purchase-invoices/create" element={<CreatePurchaseInvoice />} />
          <Route path="/purchase-invoices/:id/edit" element={<EditPurchaseInvoice />} />
          <Route path="/purchase-invoices/:id" element={<ShowPurchaseInvoice />} />

          {/* Purchase Returns */}
          <Route path="/purchase-returns" element={<PurchaseReturnsIndex />} />
          <Route path="/purchase-returns/create" element={<CreatePurchaseReturn />} />
          <Route path="/purchase-returns/:id/edit" element={<EditPurchaseReturn />} />
          <Route path="/purchase-returns/:id" element={<PurchaseReturnsIndex />} />

          {/* Sale Invoices */}
          <Route path="/sale-invoices" element={<IndexSaleInvoice />} />
          <Route
            path="/wholesale-invoices"
            element={
              <SaleSystemGuard requiredSaleSystem="wholesale">
                <IndexSaleInvoice defaultSaleType="wholesale" />
              </SaleSystemGuard>
            }
          />
          <Route
            path="/wholesale-invoices/create"
            element={
              <SaleSystemGuard requiredSaleSystem="wholesale">
                <CreateSaleInvoiceWholesale />
              </SaleSystemGuard>
            }
          />
          <Route path="/sale-invoices/create/retail" element={<CreateSaleInvoiceRetail />} />
          <Route path="/sale-invoices/create-retail" element={<CreateSaleInvoiceRetail />} />
          <Route
            path="/sale-invoices/create/wholesale"
            element={
              <SaleSystemGuard requiredSaleSystem="wholesale">
                <CreateSaleInvoiceWholesale />
              </SaleSystemGuard>
            }
          />
          <Route
            path="/sale-invoices/create-wholesale"
            element={
              <SaleSystemGuard requiredSaleSystem="wholesale">
                <CreateSaleInvoiceWholesale />
              </SaleSystemGuard>
            }
          />
          <Route path="/sale-invoices/:id/edit" element={<EditSaleInvoice />} />
          <Route path="/sale-invoices/:id" element={<ShowSaleInvoice />} />
          <Route
            path="/wholesale-invoices/:id"
            element={
              <SaleSystemGuard requiredSaleSystem="wholesale">
                <ShowSaleInvoice defaultSaleType="wholesale" />
              </SaleSystemGuard>
            }
          />

          {/* Sale Returns */}
          <Route path="/sale-returns" element={<IndexSaleReturn />} />
          <Route path="/sale-returns/create" element={<CreateSaleReturn />} />
          <Route path="/sale-returns/:id/edit" element={<EditSaleReturn />} />
          <Route path="/sale-returns/:id" element={<IndexSaleReturn />} />

          {/* Purchase Orders */}
          <Route path="/purchase-orders/forecast" element={<PurchaseOrder />} />
          <Route path="/purchase-orders" element={<PurchaseOrders />} />
          <Route path="/purchase-orders/create" element={<PurchaseOrders />} />
          <Route path="/purchase-orders/:id" element={<PurchaseOrders />} />
          <Route path="/purchase-orders/:id/edit" element={<PurchaseOrders />} />

          {/* User Demands */}
          <Route path="/user-demands" element={<UserDemandsIndex />} />
          <Route path="/user-demands/create" element={<CreateUserDemand />} />

          {/* Reports */}
          <Route path="/reports/cost-of-sale" element={<CostOfSaleReport />} />
          <Route path="/reports/cost-of-sale-detail" element={<CostOfSaleDetailReport />} />
          <Route path="/reports/purchase-detail" element={<PurchaseDetailReport />} />
          <Route path="/reports/sale-detail" element={<SaleDetailReport />} />
          <Route path="/reports/current-stock" element={<CurrentStockReport />} />
          <Route path="/reports/stock-adjustment" element={<StockAdjustmentReport />} />
          <Route path="/reports/product-comprehensive" element={<ProductComprehensiveReport />} />
          <Route path="/reports/near-expiry-product" element={<NearExpiryProductReport />} />
          <Route path="/reports/purchase-returns" element={<MissingReports type="purchase-returns" />} />
          <Route path="/reports/sale-returns" element={<MissingReports type="sale-returns" />} />
          <Route path="/reports/purchase-summary" element={<MissingReports type="purchase-summary" />} />
          <Route path="/reports/outstanding-aging" element={<MissingReports type="outstanding-aging" />} />
          <Route path="/reports/reorder" element={<MissingReports type="reorder" />} />
          <Route path="/reports/net-profit" element={<NetProfitReport />} />
          <Route path="/reports/tax-return" element={<TaxReturnReport />} />

          {/* Operating Expenses */}
          <Route path="/expenses" element={<ExpensesIndex />} />

          {/* Batch Expiry & Tracking */}
          <Route path="/batch-expiry" element={<BatchExpiryTracking />} />
          <Route path="/product-batches" element={<ProductBatchWorkbench />} />

          {/* Settings & Backups */}
          <Route path="/settings" element={<Setting />} />
          <Route path="/settings/sqlite-import" element={<SqliteImportPage />} />
          <Route path="/sqlite-import" element={<SqliteImportPage />} />
          <Route path="/backups" element={<BackupsIndex />} />

          {/* Barcode Studio & Label Printing */}
          <Route path="/barcode-labels" element={<BarcodeIndex />} />

          {/* Stock Adjustments */}
          <Route path="/stock-adjustments" element={<StockAdjustmentsIndex />} />
          <Route path="/stock-adjustments/create" element={<CreateStockAdjustment />} />
          <Route path="/stock-adjustments/:id" element={<ShowStockAdjustment />} />

          {/* Stocktake Sessions */}
          <Route path="/stocktake-sessions" element={<StocktakeIndex />} />
          <Route path="/stocktake-sessions/create" element={<CreateStocktake />} />
          <Route path="/stocktake-sessions/:id" element={<StocktakeSession />} />
          <Route path="/stocktake-sessions/:id/review" element={<StocktakeReview />} />

          {/* Stock Disposals & Quarantine */}
          <Route path="/stock-disposals" element={<StockDisposalsIndex />} />
          <Route path="/stock-disposals/create" element={<CreateStockDisposal />} />

          {/* Finance, Accounting, HR & Ledgers */}
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/accounting" element={<AccountingPage />} />
          <Route path="/hr-payroll" element={<HrPayrollCenter />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/cash-drawer" element={<CashDrawerPage />} />
          <Route path="/supplier-ledger" element={<SupplierLedgerPage />} />
          <Route path="/customer-ledger" element={<CustomerLedgerPage />} />

          {/* Users & Roles */}
          <Route path="/users" element={<UsersIndex />} />
          <Route path="/users/create" element={<CreateUser />} />
          <Route path="/users/:id/edit" element={<EditUser />} />
          <Route path="/roles" element={<RolesIndex />} />
          <Route path="/roles/create" element={<CreateRole />} />
          <Route path="/roles/:id/edit" element={<EditRole />} />
        </Route>

        {/* License Activation - requires auth but not license */}
        <Route
          path="/activate"
          element={
            <AuthGuard requireAuth={true}>
              <ActivateLicense />
            </AuthGuard>
          }
        />
      </Routes>
    </Suspense>
  );
}
