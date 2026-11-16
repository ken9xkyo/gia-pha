import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode, Suspense, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { ApiError } from "@/api/client";
import { AdminShell, PublicShell } from "@/app/Shell";
import { ConfirmHost } from "@/components/confirm";
import { Spinner } from "@/components/ui";
import Landing, { NotFound } from "@/pages/Landing";
import TreePage from "@/pages/TreePage";
import "./index.css";

const ListPage = lazy(() => import("@/pages/ListPage"));
const AnniversaryPage = lazy(() => import("@/pages/AnniversaryPage"));
const PhaKyPage = lazy(() => import("@/pages/PhaKyPage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const TrashPage = lazy(() => import("@/pages/admin/TrashPage"));
const AuditPage = lazy(() => import("@/pages/admin/AuditPage"));
const SettingsPage = lazy(() => import("@/pages/admin/SettingsPage"));
const KinshipPage = lazy(() => import("@/pages/admin/KinshipPage"));
const UsersPage = lazy(() => import("@/pages/admin/UsersPage"));
const BackupsPage = lazy(() => import("@/pages/admin/BackupsPage"));
const StatsPage = lazy(() => import("@/pages/admin/StatsPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

const S = (el: ReactNode) => (
  <Suspense
    fallback={
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-8 text-brand-800" />
      </div>
    }
  >
    {el}
  </Suspense>
);

const sharedChildren = [
  // Một route duy nhất cho cây (/, /p/:id) để trang cây không bị mount lại khi chọn người
  { path: "p?/:personId?", element: <TreePage key="tree" /> },
  // Mạng lưới quan hệ quanh một người (gồm nhà thông gia)
  { path: "mang-luoi/:personId?", element: <TreePage key="network" network /> },
  { path: "danh-sach", element: S(<ListPage />) },
  { path: "ngay-gio", element: S(<AnniversaryPage />) },
  { path: "pha-ky", element: S(<PhaKyPage />) },
];

const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  { path: "/t/:token", element: <PublicShell />, children: sharedChildren },
  { path: "/admin/login", element: S(<LoginPage />) },
  {
    path: "/admin",
    element: <AdminShell />,
    children: [
      ...sharedChildren,
      { path: "thung-rac", element: S(<TrashPage />) },
      { path: "nhat-ky", element: S(<AuditPage />) },
      { path: "cai-dat", element: S(<SettingsPage />) },
      { path: "xung-ho", element: S(<KinshipPage />) },
      { path: "tai-khoan", element: S(<UsersPage />) },
      { path: "sao-luu", element: S(<BackupsPage />) },
      { path: "thong-ke", element: S(<StatsPage />) },
    ],
  },
  { path: "*", element: <NotFound /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ConfirmHost />
      <Toaster position="bottom-center" richColors closeButton toastOptions={{ style: { fontSize: 16 } }} />
    </QueryClientProvider>
  </StrictMode>,
);
