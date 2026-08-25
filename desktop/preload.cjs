const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

const api = {
  platform: "desktop",
  database: Object.freeze({
    load: () => invoke("academy:database:load"),
    save: (snapshot) => invoke("academy:database:save", snapshot),
    getPage: (collection, request) =>
      invoke("academy:database:get-page", { collection, request }),
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
    html: (request) => invoke("academy:print:html", request),
  }),
  app: Object.freeze({
    getInfo: () => invoke("academy:app:get-info"),
    checkForUpdates: () => invoke("academy:app:check-updates"),
    quit: () => invoke("academy:app:quit"),
  }),
};

contextBridge.exposeInMainWorld("academyDesktop", Object.freeze(api));
