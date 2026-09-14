const { contextBridge, ipcRenderer } = require("electron");

const DATABASE_COLLECTIONS = new Set([
  "users",
  "students",
  "courses",
  "classes",
  "enrollments",
  "invoices",
  "installments",
  "payments",
  "employees",
  "payroll_items",
  "payroll_payments",
  "advances",
  "expenses",
  "incomes",
  "audit_log",
]);
const PAGE_LIMITS = new Set([10, 20, 50]);
const MAX_SEARCH_LENGTH = 200;

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

function validatedPageRequest(collection, request = {}) {
  if (!DATABASE_COLLECTIONS.has(collection)) throw new Error("Unknown database collection.");
  const limit = Number(request?.limit ?? 20);
  if (!PAGE_LIMITS.has(limit)) throw new Error("Invalid page limit.");
  const offset = Number(request?.offset ?? 0);
  if (!Number.isInteger(offset) || offset < 0 || offset > 10_000_000) throw new Error("Invalid page offset.");
  const search = typeof request?.search === "string" ? request.search.trim() : "";
  if (search.length > MAX_SEARCH_LENGTH) throw new Error("Search text is too long.");
  return { limit, offset, search };
}

const api = {
  platform: "desktop",
  database: Object.freeze({
    load: () => invoke("academy:database:load"),
    save: (snapshot) => {
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
        throw new Error("Invalid database snapshot.");
      }
      return invoke("academy:database:save", snapshot);
    },
    getPage: (collection, request) =>
      invoke("academy:database:get-page", { collection, request: validatedPageRequest(collection, request) }),
  }),
  license: Object.freeze({
    getStatus: () => invoke("academy:license:get-status"),
    importFile: () => invoke("academy:license:import"),
    copyMachineId: () => invoke("academy:license:copy-machine-id"),
  }),
  backup: Object.freeze({
    create: () => invoke("academy:backup:create"),
    restore: () => invoke("academy:backup:restore"),
  }),
  print: Object.freeze({
    html: (request) => {
      if (!request || typeof request !== "object" || typeof request.html !== "string") {
        throw new Error("Invalid print request.");
      }
      if (request.pageSize !== undefined && request.pageSize !== "A4" && request.pageSize !== "A5") {
        throw new Error("Invalid print page size.");
      }
      return invoke("academy:print:html", request);
    },
  }),
  app: Object.freeze({
    getInfo: () => invoke("academy:app:get-info"),
    checkForUpdates: () => invoke("academy:app:check-updates"),
    onPrepareClose: (callback) => {
      if (typeof callback !== "function") return () => {};
      const listener = () => callback();
      ipcRenderer.on("academy:app:prepare-close", listener);
      return () => ipcRenderer.removeListener("academy:app:prepare-close", listener);
    },
    confirmClose: (result) => invoke("academy:app:close-ready", result),
    quit: () => invoke("academy:app:quit"),
  }),
};

contextBridge.exposeInMainWorld("academyDesktop", Object.freeze(api));
