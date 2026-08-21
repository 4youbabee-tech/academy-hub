import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import RootComponent from "./routes/__root";
import IndexComponent from "./routes/index";
import AuditComponent from "./routes/audit";
import BackupComponent from "./routes/backup";
import ClassesComponent from "./routes/classes";
import CoursesComponent from "./routes/courses";
import EmployeesComponent from "./routes/employees";
import ExpensesComponent from "./routes/expenses";
import FinanceComponent from "./routes/finance";
import ReceiptsComponent from "./routes/receipts";
import ReportsComponent from "./routes/reports";
import SettingsComponent from "./routes/settings";
import StudentsComponent from "./routes/students";
import UsersComponent from "./routes/users";
import StudentsIdComponent from "./routes/students.$id";

// تعريف المسار الجذر
const rootRoute = createRootRoute({
  component: RootComponent,
});

// تعريف المسارات
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IndexComponent,
});

const auditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/audit",
  component: AuditComponent,
});

const backupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/backup",
  component: BackupComponent,
});

const classesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes",
  component: ClassesComponent,
});

const coursesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/courses",
  component: CoursesComponent,
});

const employeesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/employees",
  component: EmployeesComponent,
});

const expensesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/expenses",
  component: ExpensesComponent,
});

const financeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/finance",
  component: FinanceComponent,
});

const receiptsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/receipts",
  component: ReceiptsComponent,
});

const reportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reports",
  component: ReportsComponent,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsComponent,
});

const studentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/students",
  component: StudentsComponent,
});

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/users",
  component: UsersComponent,
});

// المسار الديناميكي للطلاب (يجب أن يكون تحت /students)
const studentsIdRoute = createRoute({
  getParentRoute: () => studentsRoute,
  path: "/$id",
  component: StudentsIdComponent,
});

// إضافة جميع المسارات إلى الشجرة
const routeTree = rootRoute.addChildren([
  indexRoute,
  auditRoute,
  backupRoute,
  classesRoute,
  coursesRoute,
  employeesRoute,
  expensesRoute,
  financeRoute,
  receiptsRoute,
  reportsRoute,
  settingsRoute,
  studentsRoute.addChildren([studentsIdRoute]),
  usersRoute,
]);

export { routeTree };
