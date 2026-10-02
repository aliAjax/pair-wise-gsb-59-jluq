import type { Routes } from "@angular/router";

export const appRoutes: Routes = [
  {
    path: "",
    loadComponent: () =>
      import("./pages/dashboard/dashboard.page").then(
        (module) => module.DashboardPage,
      ),
    title: "评审概览",
  },
  {
    path: "clauses",
    loadComponent: () =>
      import("./pages/clauses/clauses.page").then(
        (module) => module.ClausesPage,
      ),
    title: "条款评审",
  },
  {
    path: "comparison",
    loadComponent: () =>
      import("./pages/comparison/comparison.page").then(
        (module) => module.ComparisonPage,
      ),
    title: "批量比对",
  },
  {
    path: "review",
    loadComponent: () =>
      import("./pages/review/review.page").then(
        (module) => module.ReviewPage,
      ),
    title: "评审版本",
  },
  {
    path: "audit",
    loadComponent: () =>
      import("./pages/audit/audit.page").then(
        (module) => module.AuditPage,
      ),
    title: "审计与导出",
  },
  {
    path: "**",
    redirectTo: "",
  },
];
