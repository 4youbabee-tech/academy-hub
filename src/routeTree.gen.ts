// routeTree.gen.ts
// هذا الملف مؤقت وسيُستبدل تلقائياً
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import RootRoute from "./routes/__root";
import IndexRoute from "./routes/index";
import StudentsRoute from "./routes/students";
import StudentsIdRoute from "./routes/students.$id";
import CoursesRoute from "./routes/courses";
import ClassesRoute from "./routes/classes";
import EmployeesRoute from "./routes/employees";
import ExpensesRoute from "./routes/expenses";
import FinanceRoute from "./routes/finance";
import ReceiptsRoute from "./routes/receipts";
import ReportsRoute from "./routes/reports";
import SettingsRoute from "./routes/settings";
import UsersRoute from "./routes/users";
import AuditRoute from "./routes/audit";
import BackupRoute from "./routes/backup";

const rootRoute = createRootRoute({
  component: () => <RootRoute />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <IndexRoute />,
});

const studentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/students",
  component: () => <StudentsRoute />,
});

const studentsIdRoute = createRoute({
  getParentRoute: () => studentsRoute,
  path: "/$id",
  component: () => <StudentsIdRoute />,
});

const coursesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/courses",
  component: () => <CoursesRoute />,
});

const classesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes",
  component: () => <ClassesRoute />,
});

const employeesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/employees",
  component: () => <EmployeesRoute />,
});

const expensesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/expenses",
  component: () => <ExpensesRoute />,
});

const financeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/finance",
  component: () => <FinanceRoute />,
});

const receiptsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/receipts",
  component: () => <ReceiptsRoute />,
});

const reportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reports",
  component: () => <ReportsRoute />,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: () => <SettingsRoute />,
});

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/users",
  component: () => <UsersRoute />,
});

const auditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/audit",
  component: () => <AuditRoute />,
});

const backupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/backup",
  component: () => <BackupRoute />,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  studentsRoute.addChildren([studentsIdRoute]),
  coursesRoute,
  classesRoute,
  employeesRoute,
  expensesRoute,
  financeRoute,
  receiptsRoute,
  reportsRoute,
  settingsRoute,
  usersRoute,
  auditRoute,
  backupRoute,
]);
