// ============================================================================
// GOS-CORE SERVICE (GPS Operations Suite)
// ============================================================================
// Version: 1.2.0

const CONFIG = {
  get SPREADSHEET_ID() {
    return PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID") || "1IiXxydi02QnVUVwWsEnC5lpB730mASI-6rTsmuI4XhE";
  },
  get GPSPEDIA_SPREADSHEET_ID() {
    return PropertiesService.getScriptProperties().getProperty("GPSPEDIA_SPREADSHEET_ID") || "1M6zAVch_EGKGGRXIo74Nbn_ihH1APZ7cdr2kNdWfiDs";
  },
  get ROOT_FOLDER_ID() {
    return PropertiesService.getScriptProperties().getProperty("ROOT_FOLDER_ID") || "1-8QqhS-wtEFFwyBG8CmnEOp5i8rxSM-2";
  }
};

const SPREADSHEET_ID = CONFIG.SPREADSHEET_ID;

/**
 * DESTINO DE RESPALDO DESACOPLADO (Backup Storage Abstraction)
 * Permite cambiar el destino de almacenamiento de respaldos fácilmente (Drive, S3, FTP, REST API, etc.)
 */
const BackupStorageDestination = {
  save(filename, contentJson) {
    try {
      const folderId = CONFIG.ROOT_FOLDER_ID;
      const rootFolder = DriveApp.getFolderById(folderId);

      const folders = rootFolder.getFoldersByName("Backups");
      let backupFolder = folders.hasNext() ? folders.next() : rootFolder.createFolder("Backups");

      backupFolder.createFile(filename, contentJson, "text/plain");
      return true;
    } catch (e) {
      console.error("Error in BackupStorageDestination.save: ", e);
      return false;
    }
  }
};

/**
 * GESTOR DE RESPALDOS AUTOMÁTICOS (Backup Manager)
 */
const BackupManager = {
  generateBackup() {
    try {
      const sheetsToBackup = [
        "Ordenes", "Clientes", "Configuracion", "Sectores", "Usuarios_Sectores",
        "RecepcionVehiculos", "UbicacionesGuardadas", "Indisponibilidad", "Ordenes_Trabajo", "Historial_Viajes_Especiales"
      ];

      const backupData = {
        timestamp: new Date().toISOString(),
        version: "v1.1.0",
        data: {}
      };

      sheetsToBackup.forEach(sheetName => {
        try {
          const values = Database.getTableValues(sheetName);
          backupData.data[sheetName] = values;
        } catch (err) {
          console.warn("Could not backup sheet " + sheetName + ": " + err.message);
        }
      });

      const filename = "GOS_Backup_" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
      const serialized = JSON.stringify(backupData, null, 2);

      const success = BackupStorageDestination.save(filename, serialized);
      if (success) {
        logToSheet("Auditoria", "Backup", "generateBackup", "success", "", "Respaldo exitoso creado: " + filename);
        return { status: "success", filename: filename };
      } else {
        throw new Error("Failed to save to backup storage destination");
      }
    } catch (e) {
      logToSheet("Logs", "Backup", "generateBackup", "error", e.message, e.stack);
      return { status: "error", message: e.message };
    }
  }
};

/**
 * DATABASE ABSTRACTION LAYER (DAO/Repository Pattern)
 * Encapsula todo acceso directo a persistencia. Facilita la migración futura
 * a SQL, PostgreSQL, SQLite, Firestore, MongoDB, etc. sin reescribir lógica.
 */
const Database = {
  findOrCreateTable(tableName, headers = []) {
    return findOrCreateSheet(tableName, headers);
  },
  getTableValues(tableName) {
    const sheet = findOrCreateSheet(tableName);
    return sheet.getDataRange().getValues();
  },
  appendRow(tableName, rowData) {
    const sheet = findOrCreateSheet(tableName);
    sheet.appendRow(rowData);
    return true;
  },
  updateCell(tableName, row, col, value) {
    const sheet = findOrCreateSheet(tableName);
    sheet.getRange(row, col).setValue(value);
    return true;
  },
  deleteRow(tableName, row) {
    const sheet = findOrCreateSheet(tableName);
    sheet.deleteRow(row);
    return true;
  },
  getColHeaders(tableName) {
    const sheet = findOrCreateSheet(tableName);
    return getHeaderMap(sheet);
  }
};

/**
 * Función FindOrCreateSheet: Busca una hoja por nombre o la crea si no existe.
 * v1.2.0: Ahora inicializa encabezados si la hoja es nueva, normaliza claves y aplica formato.
 */
function findOrCreateSheet(sheetName, headers = []) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (headers.length > 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#f3f3f3");
      sheet.setFrozenRows(1);

      // Activar filtros si hay datos
      sheet.getRange(1, 1, 1, headers.length).createFilter();

      // Ajuste automático de columnas
      sheet.autoResizeColumns(1, headers.length);
    }
  }
  return sheet;
}

/**
 * Inicialización Automática del Sistema (v1.2.0)
 */
function initializeSystem() {
  const config = [
    { sheet: "Roles", headers: ["ID", "Nombre", "Nivel", "Estado"] },
    { sheet: "Estados", headers: ["ID", "Nombre", "Color", "Estado"] },
    { sheet: "Prioridades", headers: ["ID", "Nombre", "Color", "Estado"] },
    { sheet: "TiposTrabajo", headers: ["ID", "Nombre", "Duración (min)", "Estado"] },
    { sheet: "Servicios", headers: ["ID", "Nombre", "Estado"] },
    { sheet: "Turnos", headers: ["ID", "Hora", "Estado"] },
    { sheet: "Permisos", headers: ["ID", "Rol", "Módulo", "Acción", "Estado"] },
    { sheet: "Auditoria", headers: ["Fecha", "Usuario", "Módulo", "Acción", "Resultado", "Detalles"] },
    { sheet: "Logs", headers: ["Fecha", "Usuario", "Módulo", "Nivel", "Mensaje", "Stack"] },
    { sheet: "Sectores", headers: ["ID", "Nombre", "Estado"] },
    { sheet: "Usuarios_Sectores", headers: ["Usuario", "Sector", "Estado"] },
    { sheet: "RecepcionVehiculos", headers: ["ID", "OrdenID", "Tecnico", "FechaHora", "Sector", "ClienteInfo", "VehiculoInfo", "Fotos", "Danos", "CalidadCheck"] },
    { sheet: "UbicacionesGuardadas", headers: ["ID", "Nombre", "Dirección", "Coordenadas", "División", "Usos", "Historial"] },
    { sheet: "Indisponibilidad", headers: ["ID", "Técnico", "Fecha Inicio", "Fecha Fin", "Es Parcial", "Hora Retorno", "División", "Estado"] },
    { sheet: "Ordenes_Trabajo", headers: [
      "ID", "OI_ID", "Estado", "Firma_Tecnico", "Firma_Cliente_Recepcion", "Firma_Cliente_Entrega",
      "FechaHora_Recepcion", "FechaHora_Inicio", "FechaHora_Pruebas", "FechaHora_Fin", "FechaHora_Abandono", "FechaHora_Entrega",
      "IMEI", "SIM", "Info_Interna", "Datos_Prog", "Funcionalidades", "Segundo_GPS", "Segundo_GPS_Info", "Tipo_Apagado_Remoto", "Otras_Funcionalidades",
      "Fotos", "Danos", "CalidadCheck", "Observaciones"
    ] },
    { sheet: "Firmas_Tecnicos", headers: ["Tecnico", "Firma"] },
    { sheet: "Historial_Viajes_Especiales", headers: ["ID", "Fecha", "Técnico", "Tipo Viaje", "Destino", "OrdenID"] }
  ];

  config.forEach(item => {
    findOrCreateSheet(item.sheet, item.headers);
  });

  // Pre-poblar sectores si está vacío
  const sectoresSheet = findOrCreateSheet("Sectores", ["ID", "Nombre", "Estado"]);
  if (sectoresSheet.getLastRow() <= 1) {
    const defaultSectores = [
      ["SEC001", "San Pedro Sula", "Activo"],
      ["SEC002", "Tegucigalpa", "Activo"],
      ["SEC003", "La Ceiba", "Activo"],
      ["SEC004", "Choluteca", "Activo"],
      ["SEC005", "Occidente", "Activo"]
    ];
    defaultSectores.forEach(row => sectoresSheet.appendRow(row));
  }

  // Pre-poblar relación usuario-sector si está vacío
  const userSectoresSheet = findOrCreateSheet("Usuarios_Sectores", ["Usuario", "Sector", "Estado"]);
  if (userSectoresSheet.getLastRow() <= 1) {
    const defaultMappings = [
      ["tecnico", "San Pedro Sula", "Activo"],
      ["tecnico_exterior", "Tegucigalpa", "Activo"],
      ["supervisor", "La Ceiba", "Activo"]
    ];
    defaultMappings.forEach(row => userSectoresSheet.appendRow(row));
  }

  // Pre-poblar Tipos de Trabajo si está vacío
  const tiposTrabajoSheet = findOrCreateSheet("TiposTrabajo", ["ID", "Nombre", "Duración (min)", "Estado"]);
  if (tiposTrabajoSheet.getLastRow() <= 1) {
    const defaultTipos = [
      ["TT001", "Instalación", 90, "Activo"],
      ["TT002", "Revisión por falla", 60, "Activo"],
      ["TT003", "Mantenimiento", 15, "Activo"],
      ["TT004", "Desinstalación", 60, "Activo"],
      ["TT005", "Reinstalación", 90, "Activo"],
      ["TT006", "Otros", 30, "Activo"]
    ];
    defaultTipos.forEach(row => tiposTrabajoSheet.appendRow(row));
  }

  // Pre-poblar Estados si está vacío
  const estadosSheet = findOrCreateSheet("Estados", ["ID", "Nombre", "Color", "Estado"]);
  if (estadosSheet.getLastRow() <= 1) {
    const defaultEstados = [
      ["EST001", "Pendiente", "#6c757d", "Activo"],
      ["EST002", "Asignada", "#007bff", "Activo"],
      ["EST003", "En camino", "#ffc107", "Activo"],
      ["EST004", "Llegó", "#17a2b8", "Activo"],
      ["EST005", "Vehículo recibido", "#28a745", "Activo"],
      ["EST006", "Iniciando", "#343a40", "Activo"],
      ["EST007", "Instalando", "#fd7e14", "Activo"],
      ["EST008", "Haciendo pruebas", "#e83e8c", "Activo"],
      ["EST009", "Instalación completada", "#20c997", "Activo"],
      ["EST010", "Finalizada", "#212529", "Activo"],
      ["EST011", "Cancelada", "#dc3545", "Activo"]
    ];
    defaultEstados.forEach(row => estadosSheet.appendRow(row));
  }

  // Pre-poblar Prioridades si está vacío
  const prioridadesSheet = findOrCreateSheet("Prioridades", ["ID", "Nombre", "Color", "Estado"]);
  if (prioridadesSheet.getLastRow() <= 1) {
    const defaultPrioridades = [
      ["PRI001", "Normal", "#28a745", "Activo"],
      ["PRI002", "Alta", "#fd7e14", "Activo"],
      ["PRI003", "Máxima", "#dc3545", "Activo"]
    ];
    defaultPrioridades.forEach(row => prioridadesSheet.appendRow(row));
  }

  // Pre-poblar Servicios si está vacío
  const serviciosSheet = findOrCreateSheet("Servicios", ["ID", "Nombre", "Estado"]);
  if (serviciosSheet.getLastRow() <= 1) {
    const defaultServicios = [
      ["SRV001", "Básico", "Activo"],
      ["SRV002", "Full", "Activo"]
    ];
    defaultServicios.forEach(row => serviciosSheet.appendRow(row));
  }

  // Pre-poblar Turnos si está vacío
  const turnosSheet = findOrCreateSheet("Turnos", ["ID", "Hora", "Estado"]);
  if (turnosSheet.getLastRow() <= 1) {
    const defaultTurnos = [
      ["TRN001", "08:00", "Activo"],
      ["TRN002", "10:00", "Activo"],
      ["TRN003", "13:00", "Activo"],
      ["TRN004", "15:00", "Activo"]
    ];
    defaultTurnos.forEach(row => turnosSheet.appendRow(row));
  }

  return { status: 'success', message: 'Sistema inicializado correctamente' };
}

/**
 * Obtiene un mapeo de encabezados a índices de columna (1-based).
 */
function getHeaderMap(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return {};
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const map = {};
  headers.forEach((header, index) => {
    map[header.trim()] = index + 1;
  });
  return map;
}

/**
 * Sistema de IDs persistentes.
 */
function getNextId(prefix) {
  const sheet = findOrCreateSheet("Configuracion", ["Categoría", "Clave", "Valor", "Estado"]);
  const data = sheet.getDataRange().getValues();
  const headerMap = getHeaderMap(sheet);

  const claveIdx = headerMap["Clave"] - 1;
  const valorIdx = headerMap["Valor"] - 1;

  const counterKey = `Counter_${prefix}`;
  let rowIdx = -1;
  let currentVal = 0;

  for(let i=1; i<data.length; i++) {
    if(data[i][claveIdx] === counterKey) {
      rowIdx = i + 1;
      currentVal = parseInt(data[i][valorIdx]) || 0;
      break;
    }
  }

  const nextVal = currentVal + 1;
  if(rowIdx === -1) {
    sheet.appendRow(["Sistema", counterKey, nextVal, "Activo"]);
  } else {
    sheet.getRange(rowIdx, valorIdx + 1).setValue(nextVal);
  }

  const year = new Date().getFullYear();
  return `${prefix}-${year}-${nextVal.toString().padStart(6, '0')}`;
}

/**
 * Actualiza el estado de la orden, guardando opcionalmente firma digital e instalación.
 */
function handleUpdateOrderStatus(payload) {
  const { orderId, status, firmaDigital, fechaInstalacion, usuario, observaciones } = payload;
  const sheet = findOrCreateSheet("Ordenes");
  const data = sheet.getDataRange().getValues();
  const headerMap = getHeaderMap(sheet);

  const idIdx = headerMap["ID"] - 1;
  const estadoIdx = headerMap["Estado"];

  let orderRow = -1;
  for(let i=1; i<data.length; i++) {
    if(data[i][idIdx].toString() == orderId.toString()) {
      orderRow = i + 1;
      break;
    }
  }

  if (orderRow !== -1) {
    var oldStatus = data[orderRow - 1][estadoIdx - 1] || "Pendiente";
    sheet.getRange(orderRow, estadoIdx).setValue(status);

    if (observaciones) {
      const obsIdx = headerMap["Observaciones"];
      if (obsIdx) {
        sheet.getRange(orderRow, obsIdx).setValue(observaciones);
      }
    }

    if (firmaDigital) {
      const firmaIdx = headerMap["Firma Digital"];
      if (firmaIdx) {
        sheet.getRange(orderRow, firmaIdx).setValue(firmaDigital);
      }
    }

    if (fechaInstalacion) {
      const fechaInstIdx = headerMap["Fecha Instalacion"];
      if (fechaInstIdx) {
        sheet.getRange(orderRow, fechaInstIdx).setValue(fechaInstalacion);
      }
    }

    // Log status transition in Historial_Estados
    try {
      var histSheet = findOrCreateSheet("Historial_Estados", ["Fecha", "Hora", "OrdenID", "Estado Anterior", "Estado Nuevo", "Usuario", "Observaciones"]);
      var now = new Date();
      var dateStr = now.toISOString().split('T')[0];
      var timeStr = now.toTimeString().split(' ')[0].substring(0, 5);
      histSheet.appendRow([
        dateStr,
        timeStr,
        orderId,
        oldStatus,
        status,
        usuario || "Sistema",
        observaciones || ""
      ]);
    } catch (e) {
      console.error("Error logging state transition:", e);
    }

    // Compensación de Almuerzo por retrasos / reajuste de agenda
    if (status === 'Finalizada' || status === 'Instalación completada' || status === 'Instalacion completada') {
      try {
        var technicianName = data[orderRow - 1][headerMap["Técnico Asignado"] - 1] || "";
        var sector = data[orderRow - 1][headerMap["Sector"] - 1] || "San Pedro Sula";
        handleLunchAndRescheduling(orderId, technicianName, sector, new Date());
        handleLogPerformance(orderId, status);
      } catch (err) {
        console.error("Error running lunch rescheduling and metric log:", err);
      }
    }

    return { status: 'success' };
  }

  return { status: 'error', message: 'Orden no encontrada' };
}

/**
 * Obtiene el historial operativo de un vehículo por número de chasis (VIN).
 */
function handleGetVehicleHistory(payload) {
  const { vin } = payload;
  if (!vin) return { status: 'error', message: 'Número de chasis (VIN) es requerido' };

  const sheet = findOrCreateSheet("Ordenes");
  const data = sheet.getDataRange().getValues();
  const headerMap = getHeaderMap(sheet);

  const vinIdx = headerMap["VIN"] - 1;
  if (vinIdx < 0) return { status: 'success', history: [] };

  const recSheet = findOrCreateSheet("RecepcionVehiculos");
  const recData = recSheet.getDataRange().getValues();
  const recHeaderMap = getHeaderMap(recSheet);
  const recOrderIdIdx = recHeaderMap["OrdenID"] - 1;
  const recFotosIdx = recHeaderMap["Fotos"] - 1;

  const orderFotosMap = {};
  for (let j = 1; j < recData.length; j++) {
    const oId = recData[j][recOrderIdIdx];
    if (oId) {
      orderFotosMap[oId.toString()] = recData[j][recFotosIdx] || "{}";
    }
  }

  const history = [];
  for (let i = 1; i < data.length; i++) {
    const rowVin = data[i][vinIdx] ? data[i][vinIdx].toString().trim() : "";
    if (rowVin.toLowerCase() === vin.toString().trim().toLowerCase()) {
      const orderId = data[i][headerMap["ID"] - 1] || "";
      const fotosJson = orderFotosMap[orderId.toString()] || "{}";
      let parsedFotos = {};
      try {
        parsedFotos = JSON.parse(fotosJson);
      } catch (e) {}

      history.push({
        id: orderId,
        fecha: data[i][headerMap["Fecha"] - 1] || "",
        tipoTrabajo: data[i][headerMap["Tipo Trabajo"] - 1] || "",
        tecnico: data[i][headerMap["Técnico Asignado"] - 1] || "",
        lugar: data[i][headerMap["Dirección"] - 1] || "",
        sector: data[i][headerMap["Sector"] - 1] || "",
        marca: data[i][headerMap["Marca"] - 1] || "",
        modelo: data[i][headerMap["Modelo"] - 1] || "",
        anio: data[i][headerMap["Año"] - 1] || "",
        color: data[i][headerMap["Color"] - 1] || "",
        placa: data[i][headerMap["Placa"] - 1] || "",
        motor: data[i][headerMap["Motor"] - 1] || "",
        clasificacionVehiculo: data[i][headerMap["Clasificación Vehículo"] - 1] || "",
        estado: data[i][headerMap["Estado"] - 1] || "",
        fotos: {
          frontal: parsedFotos["vista_frontal"] || "",
          posterior: parsedFotos["vista_trasera"] || "",
          interior_derecho: parsedFotos["lado_derecho"] || parsedFotos["asientos_delanteros"] || ""
        }
      });
    }
  }

  return { status: 'success', history: history };
}

/**
 * Procesa la consulta técnica simplificada basada en GPSpedia.
 */
function handleGetTechnicalConsultation(payload) {
  const { categoria, marca, modelo, detallesTecnicos } = payload;

  let response = {
    apagadoRemoto: "No",
    apertura: "No",
    botonPanico: "No",
    microfono: "No"
  };

  const isAltaGamaDesc = (detallesTecnicos || "").toLowerCase().includes("no se recomienda");
  if (isAltaGamaDesc) return { status: 'success', data: response };

  response.apagadoRemoto = "Sí";
  response.microfono = "Sí";

  const isMoto = (categoria || "").toLowerCase().includes("moto");
  if (!isMoto) {
    response.apertura = "Sí";
    response.botonPanico = "Sí";
  }

  return { status: 'success', data: response };
}

/**
 * Gestión de Órdenes
 */
function handleCreateOrder(payload) {
  const headers = [
    "ID", "Fecha", "Hora", "Cliente", "Contacto", "Teléfono", "Dirección",
    "Coordenadas", "Link Maps", "Marca", "Modelo", "VIN", "Motor", "Año",
    "Placa", "Servicio", "Inventario", "Tipo Trabajo", "Prioridad",
    "Técnico Asignado", "Estado", "Observaciones", "Sector", "Vendedor", "Color", "Fecha Instalacion", "Token",
    "Clasificación Vehículo", "Firma Digital", "Contacto Nombre", "Contacto Teléfono"
  ];
  const sheet = findOrCreateSheet("Ordenes", headers);
  const nextId = getNextId("OI");

  const orderData = headers.map(h => {
    switch(h) {
      case "ID": return nextId;
      case "Fecha": return payload.fecha || new Date().toISOString().split('T')[0];
      case "Hora": return payload.hora || "";
      case "Cliente": return payload.cliente || "";
      case "Contacto": return payload.contacto || "";
      case "Teléfono": return payload.telefono || "";
      case "Dirección": return payload.direccion || "";
      case "Coordenadas": return payload.coordenadas || "";
      case "Link Maps": return payload.linkMaps || "";
      case "Marca": return payload.marca || "";
      case "Modelo": return payload.modelo || "";
      case "VIN": return payload.vin || "";
      case "Motor": return payload.motor || "";
      case "Año": return payload.anio || "";
      case "Placa": return payload.placa || "";
      case "Servicio": return payload.servicio || "";
      case "Inventario": return payload.inventario || "";
      case "Tipo Trabajo": return payload.tipoTrabajo || "";
      case "Prioridad": return payload.prioridad || "Normal";
      case "Técnico Asignado": return payload.tecnicoAsignado || "";
      case "Estado": return payload.estado || "Pendiente";
      case "Observaciones": return payload.observaciones || "";
      case "Sector": return payload.sector || "";
      case "Vendedor": return payload.vendedor || "Sin vendedor";
      case "Color": return payload.color || "Sin color";
      case "Fecha Instalacion": return payload.fechaInstalacion || "";
      case "Token": return payload.token || Utilities.getUuid();
      case "Clasificación Vehículo": return payload.clasificacionVehiculo || "";
      case "Firma Digital": return payload.firmaDigital || "";
      case "Contacto Nombre": return payload.contacto_nombre || "";
      case "Contacto Teléfono": return payload.contacto_telefono || "";
      default: return "";
    }
  });

  sheet.appendRow(orderData);
  return { status: 'success', message: 'Orden creada exitosamente', orderId: nextId };
}

function handleGetOrders() {
  try {
    checkAndExpireDrafts();
  } catch (e) {
    console.error("Error auto-expiring drafts: " + e.message);
  }
  try {
    checkAndUpdateJobDelays();
  } catch (e) {
    console.error("Error auto-checking delays: " + e.message);
  }
  const sheet = findOrCreateSheet("Ordenes");
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { status: 'success', data: [] };
  const headers = data.shift();

  const orders = data.map(row => {
    let obj = {};
    headers.forEach((header, index) => {
      const key = header.toLowerCase()
        .replace(/\s+/g, '')
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      obj[key] = row[index];
    });
    return obj;
  });

  return { status: 'success', data: orders };
}

/**
 * Gestión de Agenda y Técnicos.
 * Soporta múltiples categorías: Agenda, Roles, Estados, Prioridades, etc.
 */
function handleGetSystemConfig() {
  const sheet = findOrCreateSheet("Configuracion", ["Categoría", "Clave", "Valor", "Estado"]);

  // Asegurar parámetros iniciales críticos si la hoja está vacía
  if (sheet.getLastRow() === 1) {
    const defaultParams = [
      ["Sistema", "GoogleMapsAPIKey", "PLACEHOLDER_KEY", "Activo"],
      ["Sistema", "RootFolderId", CONFIG.ROOT_FOLDER_ID, "Activo"],
      ["Sistema", "RadioLlegada", "200", "Activo"],
      ["Sistema", "TiempoConfirmacion", "60", "Activo"],
      ["Sistema", "LastTechnicianIndex", "0", "Activo"],
      ["Agenda", "Color_Pendiente", "#f0ad4e", "Activo"],
      ["Agenda", "Color_Asignada", "#5bc0de", "Activo"],
      ["Agenda", "Color_Finalizada", "#5cb85c", "Activo"]
    ];
    defaultParams.forEach(row => sheet.appendRow(row));
    initializeSystem(); // Disparar inicialización de otras hojas
  }

  const data = sheet.getDataRange().getValues();
  const headerMap = getHeaderMap(sheet);

  const catIdx = headerMap["Categoría"] - 1;
  const claveIdx = headerMap["Clave"] - 1;
  const valorIdx = headerMap["Valor"] - 1;
  const estadoIdx = headerMap["Estado"] - 1;

  const config = {};

  data.slice(1).forEach(row => {
    if (row[estadoIdx] !== "Activo") return;

    const cat = row[catIdx];
    const clave = row[claveIdx];
    const valor = row[valorIdx];

    if (!config[cat]) config[cat] = {};

    // Si la clave ya existe, convertimos a array para soportar múltiples valores (ej: Turnos)
    if (config[cat][clave]) {
      if (!Array.isArray(config[cat][clave])) {
        config[cat][clave] = [config[cat][clave]];
      }
      config[cat][clave].push(valor);
    } else {
      config[cat][clave] = valor;
    }
  });

  return { status: 'success', data: config };
}

/**
 * Mantenimiento de compatibilidad con v1.0.x
 */
function handleGetAgendaConfig() {
  const sysConfig = handleGetSystemConfig().data;
  const agenda = sysConfig["Agenda"] || {};

  let turnos = agenda["HoraTurno"] || ["08:00", "10:00", "13:00", "15:00"];
  if (!Array.isArray(turnos)) turnos = [turnos];

  return {
    status: 'success',
    data: {
      turnos,
      cantidadTecnicos: parseInt(agenda["CantidadTecnicos"]) || 4
    }
  };
}

/**
 * Genera el hash SHA-256 de una contraseña para evitar almacenamiento en texto plano.
 */
function hashPassword(password) {
  if (!password) return "";
  const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password.toString(), Utilities.Charset.UTF_8);
  let output = "";
  for (let i = 0; i < rawHash.length; i++) {
    let byteValue = rawHash[i];
    if (byteValue < 0) byteValue += 256;
    let byteString = byteValue.toString(16);
    if (byteString.length == 1) byteString = "0" + byteString;
    output += byteString;
  }
  return output;
}

/**
 * Verifica si una contraseña coincide con el hash almacenado, soportando fallbacks de texto plano.
 */
function verifyPassword(inputPassword, storedPassword) {
  if (!inputPassword || !storedPassword) return false;
  const hashedInput = hashPassword(inputPassword);
  return (hashedInput === storedPassword || inputPassword.toString() === storedPassword.toString());
}

/**
 * Motor de Asignación Automática
 */
function handleAutoAssignTechnical(payload) {
  const { orderId, force = false } = payload;
  const techSheet = findOrCreateSheet("Tecnicos", ["ID", "Nombre", "Lat", "Lng", "UltimaAct", "Sector"]);
  const tecnicos = techSheet.getDataRange().getValues();
  if (tecnicos.length <= 1) return { status: 'error', message: 'No hay técnicos registrados' };

  const techHeaderMap = getHeaderMap(techSheet);
  const techNameIdx = techHeaderMap["Nombre"] - 1;

  const configSheet = findOrCreateSheet("Configuracion");
  const configData = configSheet.getDataRange().getValues();
  const configHeaderMap = getHeaderMap(configSheet);
  const configClaveIdx = configHeaderMap["Clave"] - 1;
  const configValorIdx = configHeaderMap["Valor"] - 1;

  let lastIndex = 0;
  let lastIndexRow = -1;

  for(let i=1; i<configData.length; i++) {
    if(configData[i][configClaveIdx] === "LastTechnicianIndex") {
      lastIndex = parseInt(configData[i][configValorIdx]) || 0;
      lastIndexRow = i + 1;
      break;
    }
  }

  if (lastIndexRow === -1) {
    configSheet.appendRow(["Sistema", "LastTechnicianIndex", 0, "Activo"]);
    lastIndexRow = configSheet.getLastRow();
  }

  const orderSheet = findOrCreateSheet("Ordenes");
  const ordersData = orderSheet.getDataRange().getValues();
  const orderHeaderMap = getHeaderMap(orderSheet);

  const orderIdIdx = orderHeaderMap["ID"] - 1;
  const orderTechIdx = orderHeaderMap["Técnico Asignado"];
  const orderEstadoIdx = orderHeaderMap["Estado"];
  const orderDirIdx = orderHeaderMap["Dirección"] - 1;
  const orderSectorIdx = orderHeaderMap["Sector"] - 1;

  let orderRow = -1;
  for(let i=1; i<ordersData.length; i++) {
    if(ordersData[i][orderIdIdx].toString() == orderId.toString()) {
      orderRow = i + 1;
      break;
    }
  }

  let travelType = "Trabajo Local";
  let address = "";
  let orderSector = "San Pedro Sula";

  if (orderRow !== -1) {
    address = ordersData[orderRow - 1][orderDirIdx] || "";
    orderSector = ordersData[orderRow - 1][orderSectorIdx] || "San Pedro Sula";
    travelType = classifyTravel(address, orderSector);
  }

  let tecnicoAsignado = "";
  let isSpecialTravel = (travelType === "Viaje en moto" || travelType === "Viaje largo");

  // Filtrar técnicos de esta división
  const techsInSector = [];
  for (let i = 1; i < tecnicos.length; i++) {
    const s = tecnicos[i][techHeaderMap["Sector"] - 1] || "";
    if (s.toLowerCase().trim() === orderSector.toLowerCase().trim()) {
      techsInSector.push(tecnicos[i][techNameIdx].toString().trim());
    }
  }

  if (isSpecialTravel && techsInSector.length > 0) {
    const rot = getNextRotationTechnician(travelType, techsInSector, orderSector);
    tecnicoAsignado = rot.nextEligible;
  } else {
    const nextIndex = (lastIndex + 1) % (tecnicos.length - 1);
    tecnicoAsignado = tecnicos[nextIndex + 1][techNameIdx];
  }

  // Verificar y resolver conflictos de adyacencia de viajes (Restricciones de planificación)
  if (orderRow !== -1) {
    const orderFecha = ordersData[orderRow - 1][orderHeaderMap["Fecha"] - 1] || "";
    const orderHora = ordersData[orderRow - 1][orderHeaderMap["Hora"] - 1] || "";

    const conflict = hasAdjacentTravelConflict(tecnicoAsignado, orderFecha, orderHora, travelType, orderSector, ordersData, orderHeaderMap);
    if (conflict && techsInSector.length > 1) {
      for (let alternateTech of techsInSector) {
        if (alternateTech !== tecnicoAsignado) {
          const altConflict = hasAdjacentTravelConflict(alternateTech, orderFecha, orderHora, travelType, orderSector, ordersData, orderHeaderMap);
          if (!altConflict) {
            tecnicoAsignado = alternateTech;
            break;
          }
        }
      }
    }
  }

  let jobsCount = 0;
  ordersData.forEach(row => {
    if (row[orderHeaderMap["Técnico Asignado"] - 1] === tecnicoAsignado && row[orderEstadoIdx - 1] === "Asignada") jobsCount++;
  });

  // Lógica de confirmación: si tiene trabajos y no es forzado, no asignar aún
  if (jobsCount > 0 && !force) {
    return {
      status: 'pending_confirmation',
      tecnico: tecnicoAsignado,
      message: 'El técnico ya tiene un trabajo activo. ¿Desea asignar como segundo trabajo?'
    };
  }

  // Si llegamos aquí, procedemos con la asignación física
  if (!isSpecialTravel) {
    const nextIndex = (lastIndex + 1) % (tecnicos.length - 1);
    configSheet.getRange(lastIndexRow, configValorIdx + 1).setValue(nextIndex);
  }

  if (orderRow !== -1) {
    orderSheet.getRange(orderRow, orderTechIdx).setValue(tecnicoAsignado);
    orderSheet.getRange(orderRow, orderEstadoIdx).setValue("Asignada");

    // Registrar en Historial de Viajes Especiales
    if (isSpecialTravel) {
      const specialSheet = findOrCreateSheet("Historial_Viajes_Especiales", ["ID", "Fecha", "Técnico", "Tipo Viaje", "Destino", "OrdenID"]);
      const nextHveId = getNextId("HVE");
      const todayStr = new Date().toISOString().split('T')[0];
      specialSheet.appendRow([
        nextHveId,
        todayStr,
        tecnicoAsignado,
        travelType,
        address,
        orderId
      ]);
    }
  }

  return {
    status: 'success',
    tecnico: tecnicoAsignado
  };
}

/**
 * Actualiza la ubicación del técnico
 */
function handleUpdateTechnicianLocation(payload) {
  const { tecnicoId, lat, lng } = payload;
  const sheet = findOrCreateSheet("Tecnicos");
  const data = sheet.getDataRange().getValues();
  const headerMap = getHeaderMap(sheet);

  const idIdx = headerMap["ID"] - 1;
  const latIdx = headerMap["Lat"];
  const lngIdx = headerMap["Lng"];
  const actIdx = headerMap["UltimaAct"];

  let tecnicoRow = -1;
  for(let i=1; i<data.length; i++) {
    if(data[i][idIdx].toString() == tecnicoId.toString()) {
      tecnicoRow = i + 1;
      break;
    }
  }

  if (tecnicoRow !== -1) {
    sheet.getRange(tecnicoRow, latIdx).setValue(lat);
    sheet.getRange(tecnicoRow, lngIdx).setValue(lng);
    sheet.getRange(tecnicoRow, actIdx).setValue(new Date().toISOString());
    return { status: 'success' };
  }

  return { status: 'error', message: 'Técnico no encontrado' };
}

/**
 * Estadísticas
 */
function handleUpdateStatistics(payload) {
  const { marca, modelo, tecnico, tiempoMinutos, tipoTrabajo, zona, servicio } = payload;
  const headers = ["Marca", "Modelo", "Técnico", "Tipo Trabajo", "Cantidad", "Promedio", "Última Act", "Zona", "Servicio"];
  const sheet = findOrCreateSheet("Estadisticas", headers);
  const data = sheet.getDataRange().getValues();
  const headerMap = getHeaderMap(sheet);

  const mIdx = headerMap["Marca"] - 1;
  const moIdx = headerMap["Modelo"] - 1;
  const tIdx = headerMap["Técnico"] - 1;
  const ttIdx = headerMap["Tipo Trabajo"] - 1;

  let entryRow = -1;
  for(let i=1; i<data.length; i++) {
    if(data[i][mIdx] === marca && data[i][moIdx] === modelo && data[i][tIdx] === tecnico && data[i][ttIdx] === tipoTrabajo) {
      entryRow = i + 1;
      break;
    }
  }

  if (entryRow !== -1) {
    const currentCount = parseInt(data[entryRow-1][headerMap["Cantidad"]-1]) || 0;
    const currentAvg = parseFloat(data[entryRow-1][headerMap["Promedio"]-1]) || 0;
    const newCount = currentCount + 1;
    const newAvg = ((currentAvg * currentCount) + tiempoMinutos) / newCount;

    sheet.getRange(entryRow, headerMap["Cantidad"]).setValue(newCount);
    sheet.getRange(entryRow, headerMap["Promedio"]).setValue(newAvg);
    sheet.getRange(entryRow, headerMap["Última Act"]).setValue(new Date().toISOString());
  } else {
    sheet.appendRow([marca, modelo, tecnico, tipoTrabajo, 1, tiempoMinutos, new Date().toISOString(), zona || "", servicio || ""]);
  }

  return { status: 'success' };
}

/**
 * Utilidad para Registro de Eventos y Errores
 */
function logToSheet(sheetName, module, action, level, message, details = "") {
  try {
    const sheet = findOrCreateSheet(sheetName);
    const timestamp = new Date().toISOString();
    const user = "SISTEMA"; // En v0.5.0 se usará el usuario de sesión

    if (sheetName === "Auditoria") {
      sheet.appendRow([timestamp, user, module, action, level, details]); // level actúa como resultado
    } else if (sheetName === "Logs") {
      sheet.appendRow([timestamp, user, module, level, message, details]); // details actúa como stack
    }
  } catch (e) {
    console.error("Error logging to sheet:", e);
  }
}

/**
 * Integración con Drive (Jerarquía: Año > Mes > Orden)
 */
function handleGetOrCreateOrderFolder(payload) {
  const { orderId, cliente } = payload;

  try {
    const sysConfig = handleGetSystemConfig().data;
    const systemParams = sysConfig["Sistema"] || {};
    const rootFolderId = systemParams["RootFolderId"] || CONFIG.ROOT_FOLDER_ID;

    const rootFolder = DriveApp.getFolderById(rootFolderId);

    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');

    // Navegar o crear jerarquía
    const getSubFolder = (parent, name) => {
      const folders = parent.getFoldersByName(name);
      return folders.hasNext() ? folders.next() : parent.createFolder(name);
    };

    const yearFolder = getSubFolder(rootFolder, year);
    const monthFolder = getSubFolder(yearFolder, month);

    const folderName = `Orden_${orderId}_${cliente}`;
    const folders = monthFolder.getFoldersByName(folderName);

    let folder;
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = monthFolder.createFolder(folderName);
      // Crear sub-estructura
      ["Fotografías", "PDF", "Documentación", "Evidencias"].forEach(sub => folder.createFolder(sub));
    }

    logToSheet("Auditoria", "Drive", "createFolder", "success", "", `Folder creado/recuperado: ${folderName}`);
    return { status: 'success', folderUrl: folder.getUrl(), folderId: folder.getId() };
  } catch (error) {
    logToSheet("Logs", "Drive", "createFolder", "error", error.message, error.stack);
    return { status: 'error', message: error.message };
  }
}

/**
 * Archivador de registros
 */
function handleArchiveOldOrders() {
  const sheet = findOrCreateSheet("Ordenes");
  const archiveSheet = findOrCreateSheet("Ordenes_Archivo");
  const data = sheet.getDataRange().getValues();
  const headerMap = getHeaderMap(sheet);

  const estadoIdx = headerMap["Estado"] - 1;
  const fechaIdx = headerMap["Fecha"] - 1;

  const threshold = new Date();
  threshold.setDate(threshold.getDate() - 30);

  const toArchive = data.filter((row, index) => {
    if (index === 0) return false;
    return row[estadoIdx] === "Finalizada" && new Date(row[fechaIdx]) < threshold;
  });

  toArchive.forEach(row => archiveSheet.appendRow(row));

  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][estadoIdx] === "Finalizada" && new Date(data[i][fechaIdx]) < threshold) {
      sheet.deleteRow(i + 1);
    }
  }

  return { status: 'success', archivedCount: toArchive.length };
}

/**
 * Reportes
 */
function handleGenerateReport(payload) {
  const { type } = payload;
  const sheet = findOrCreateSheet("Ordenes");
  const data = sheet.getDataRange().getValues();
  const headerMap = getHeaderMap(sheet);
  const fechaIdx = headerMap["Fecha"] - 1;

  const now = new Date();
  const reportData = data.filter((row, index) => {
    if (index === 0) return true;
    const orderDate = new Date(row[fechaIdx]);
    if (isNaN(orderDate)) return false;

    if (type === 'diario') return orderDate.toDateString() === now.toDateString();
    if (type === 'semanal') {
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 7);
      return orderDate >= weekAgo;
    }
    if (type === 'mensual') return orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
    return true;
  });

  return { status: 'success', reportData: reportData };
}

function handleSendNotification(payload) {
  const sheet = findOrCreateSheet("Notificaciones", ["Fecha", "Destinatario", "Tipo", "Mensaje", "Estado"]);
  sheet.appendRow([new Date().toISOString(), payload.recipient, payload.type, payload.message, "Pendiente"]);
  return { status: 'success' };
}

function handleGetClients() {
  const headersList = ["Nombre", "Empresa", "Teléfono", "Correo", "RTN", "Dirección", "Observaciones", "Fecha Registro"];
  const sheet = findOrCreateSheet("Clientes", headersList);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { status: 'success', data: [] };
  const headers = data.shift();
  const clients = data.map(row => {
    let obj = {};
    headers.forEach((header, index) => {
      // Normalizar claves: minúsculas, sin espacios y sin acentos
      const key = header.toLowerCase()
        .replace(/\s+/g, '')
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      obj[key] = row[index];
    });
    return obj;
  });
  return { status: 'success', data: clients };
}

function handleCreateClient(payload) {
  const headersList = ["Nombre", "Empresa", "Teléfono", "Correo", "RTN", "Dirección", "Observaciones", "Fecha Registro"];
  const sheet = findOrCreateSheet("Clientes", headersList);
  const headerMap = getHeaderMap(sheet);

  const rowData = headersList.map(h => {
    switch(h) {
      case "Nombre": return payload.nombre || "";
      case "Empresa": return payload.empresa || "";
      case "Teléfono": return payload.telefono || "";
      case "Correo": return payload.correo || "";
      case "RTN": return payload.rtn || "";
      case "Dirección": return payload.direccion || "";
      case "Observaciones": return payload.observaciones || "";
      case "Fecha Registro": return new Date().toISOString();
      default: return "";
    }
  });

  sheet.appendRow(rowData);
  logToSheet("Auditoria", "Clientes", "createClient", "success", "", `Cliente: ${payload.nombre}`);
  return { status: 'success' };
}

/**
 * Obtiene el sector de un usuario o técnico.
 */
function handleGetUserSector(payload) {
  const { username } = payload;
  if (!username) return { status: 'error', message: 'Nombre de usuario requerido' };

  // 1. Buscar en Usuarios_Sectores
  const userSectoresSheet = findOrCreateSheet("Usuarios_Sectores", ["Usuario", "Sector", "Estado"]);
  const userSectoresData = userSectoresSheet.getDataRange().getValues();
  const userSectoresHeaderMap = getHeaderMap(userSectoresSheet);
  const uIdx = userSectoresHeaderMap["Usuario"] - 1;
  const sIdx = userSectoresHeaderMap["Sector"] - 1;
  const estIdx = userSectoresHeaderMap["Estado"] - 1;

  for (let i = 1; i < userSectoresData.length; i++) {
    if (userSectoresData[i][uIdx].toString().trim().toLowerCase() === username.trim().toLowerCase() && userSectoresData[i][estIdx] === "Activo") {
      return { status: 'success', sector: userSectoresData[i][sIdx] };
    }
  }

  // 2. Buscar en Técnicos
  const techSheet = findOrCreateSheet("Tecnicos", ["ID", "Nombre", "Lat", "Lng", "UltimaAct", "Sector"]);
  const techData = techSheet.getDataRange().getValues();
  const techHeaderMap = getHeaderMap(techSheet);
  const tNameIdx = techHeaderMap["Nombre"] - 1;
  const tSectorIdx = techHeaderMap["Sector"] - 1;

  for (let i = 1; i < techData.length; i++) {
    if (techData[i][tNameIdx].toString().trim().toLowerCase() === username.trim().toLowerCase()) {
      return { status: 'success', sector: techData[i][tSectorIdx] || "San Pedro Sula" };
    }
  }

  // Fallback por defecto
  return { status: 'success', sector: "San Pedro Sula" };
}

/**
 * Registra o actualiza el sector asignado a un usuario.
 */
function handleUpdateUserSector(payload) {
  const { username, sector } = payload;
  if (!username || !sector) return { status: 'error', message: 'Usuario y sector son requeridos' };

  const userSectoresSheet = findOrCreateSheet("Usuarios_Sectores", ["Usuario", "Sector", "Estado"]);
  const userSectoresData = userSectoresSheet.getDataRange().getValues();
  const userSectoresHeaderMap = getHeaderMap(userSectoresSheet);
  const uIdx = userSectoresHeaderMap["Usuario"] - 1;
  const sIdx = userSectoresHeaderMap["Sector"] - 1;

  let rowIdx = -1;
  for (let i = 1; i < userSectoresData.length; i++) {
    if (userSectoresData[i][uIdx].toString().trim().toLowerCase() === username.trim().toLowerCase()) {
      rowIdx = i + 1;
      break;
    }
  }

  if (rowIdx !== -1) {
    userSectoresSheet.getRange(rowIdx, sIdx + 1).setValue(sector);
  } else {
    userSectoresSheet.appendRow([username, sector, "Activo"]);
  }

  logToSheet("Auditoria", "Usuarios", "updateUserSector", "success", "", `Usuario: ${username} asignado a sector: ${sector}`);
  return { status: 'success', message: 'Sector actualizado exitosamente' };
}

/**
 * Guarda la recepción del vehículo y cambia el estado de la orden.
 */
function handleSaveVehicleReception(payload) {
  const { orderId, otId, tecnico, sector, clienteInfo, vehiculoInfo, fotos, danos, calidadCheck } = payload;
  if (!orderId || !tecnico) return { status: 'error', message: 'OrdenID y Técnico son requeridos' };

  const headers = ["ID", "OrdenID", "Tecnico", "FechaHora", "Sector", "ClienteInfo", "VehiculoInfo", "Fotos", "Danos", "CalidadCheck"];
  const sheet = findOrCreateSheet("RecepcionVehiculos", headers);
  const nextId = getNextId("REC");

  const rowData = [
    nextId,
    orderId,
    tecnico,
    new Date().toISOString(),
    sector || "",
    typeof clienteInfo === 'string' ? clienteInfo : JSON.stringify(clienteInfo || {}),
    typeof vehiculoInfo === 'string' ? vehiculoInfo : JSON.stringify(vehiculoInfo || {}),
    typeof fotos === 'string' ? fotos : JSON.stringify(fotos || []),
    typeof danos === 'string' ? danos : JSON.stringify(danos || []),
    typeof calidadCheck === 'string' ? calidadCheck : JSON.stringify(calidadCheck || {})
  ];

  sheet.appendRow(rowData);

  // Actualizar estado de la orden a "Vehículo recibido"
  handleUpdateOrderStatus({ orderId, status: "Vehículo recibido" });

  // Si existe otId, actualizar la fila en Ordenes_Trabajo
  if (otId) {
    try {
      const otSheet = findOrCreateSheet("Ordenes_Trabajo");
      const otData = otSheet.getDataRange().getValues();
      const otHeaderMap = getHeaderMap(otSheet);
      const idIdx = otHeaderMap["ID"] - 1;
      let otRow = -1;
      for (let i = 1; i < otData.length; i++) {
        if (otData[i][idIdx].toString() === otId.toString()) {
          otRow = i + 1;
          break;
        }
      }
      if (otRow !== -1) {
        otSheet.getRange(otRow, otHeaderMap["Fotos"]).setValue(typeof fotos === 'string' ? fotos : JSON.stringify(fotos || {}));
        otSheet.getRange(otRow, otHeaderMap["Danos"]).setValue(typeof danos === 'string' ? danos : JSON.stringify(danos || {}));
        otSheet.getRange(otRow, otHeaderMap["CalidadCheck"]).setValue(typeof calidadCheck === 'string' ? calidadCheck : JSON.stringify(calidadCheck || {}));
        otSheet.getRange(otRow, otHeaderMap["Estado"]).setValue("Vehículo recibido");
      }
    } catch (err) {
      console.error("Error actualizando Ordenes_Trabajo desde recepcion:", err);
    }
  }

  logToSheet("Auditoria", "Recepcion", "saveVehicleReception", "success", "", `Recepción registrada #${nextId} para orden ${orderId} (OT: ${otId || 'N/A'})`);

  return { status: 'success', id: nextId, message: 'Recepción registrada exitosamente' };
}

/**
 * Helper para formatear nombres: extrae primer nombre y primer apellido.
 */
function parseName(fullName) {
  if (!fullName) return { first: "Sin nombre", last: "" };
  const parts = fullName.trim().split(/\s+/);
  return {
    first: parts[0] || "Sin nombre",
    last: parts[2] || parts[1] || "" // Por ejemplo, Juan Perez (idx 1), o Juan Alberto Perez (idx 2)
  };
}

/**
 * Obtiene los datos autorizados para visualización pública en el Portal del Cliente,
 * impidiendo la enumeración o acceso no autorizado mediante verificación estricta de token.
 */
function handleGetClientPortalData(payload) {
  const { ot, token } = payload;
  if (!ot || !token) {
    return { status: "error", message: "Acceso Denegado. Parámetros inválidos." };
  }

  // 1. Obtener la orden de trabajo
  const sheet = findOrCreateSheet("Ordenes");
  const data = sheet.getDataRange().getValues();
  const headerMap = getHeaderMap(sheet);

  const idIdx = headerMap["ID"] - 1;
  const tokenIdx = headerMap["Token"] - 1;

  let orderRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][idIdx].toString().trim() === ot.toString().trim()) {
      orderRow = i;
      break;
    }
  }

  if (orderRow === -1) {
    return { status: "error", message: "Acceso Denegado. Orden no encontrada." };
  }

  // 2. Validar que el token sea correcto (Seguridad Estricta contra Enumeración)
  const savedToken = data[orderRow][tokenIdx] || "";
  if (!savedToken || savedToken.toString().trim() !== token.toString().trim()) {
    return { status: "error", message: "Acceso Denegado. Token de seguridad inválido." };
  }

  const row = data[orderRow];

  // Extraer datos del instalador de forma autorizada
  const rawTecnico = row[headerMap["Técnico Asignado"] - 1] || "";
  const parsedTecnico = parseName(rawTecnico);
  const instaladorInfo = {
    nombre: parsedTecnico.first,
    apellido: parsedTecnico.last,
    puesto: "Instalador Técnico GPS"
  };

  // Extraer datos del vendedor
  const rawVendedor = row[headerMap["Vendedor"] - 1] || "";
  const parsedVendedor = parseName(rawVendedor);
  const vendedorInfo = {
    nombre: parsedVendedor.first,
    apellido: parsedVendedor.last
  };

  // Extraer información de la Orden de Trabajo de forma segura para el cliente
  let clientFeatures = ["Dispositivo GPS"];
  try {
    const otSheet = findOrCreateSheet("Ordenes_Trabajo");
    const otData = otSheet.getDataRange().getValues();
    const otHeaderMap = getHeaderMap(otSheet);
    let otRow = -1;
    for (let i = 1; i < otData.length; i++) {
      if (otData[i][otHeaderMap["OI_ID"] - 1].toString() === ot.toString() || otData[i][otHeaderMap["ID"] - 1].toString() === ot.toString()) {
        otRow = i;
        break;
      }
    }
    if (otRow !== -1) {
      const funcsStr = otData[otRow][otHeaderMap["Funcionalidades"] - 1] || "[]";
      let funcs = [];
      try { funcs = JSON.parse(funcsStr); } catch (e) {}

      clientFeatures = [];
      let secondGpsActive = otData[otRow][otHeaderMap["Segundo_GPS"] - 1] === "Sí";

      funcs.forEach(f => {
        if (f === "Dispositivo GPS") clientFeatures.push("Dispositivo GPS");
        if (f === "Segundo dispositivo GPS" && secondGpsActive) clientFeatures.push("Segundo dispositivo GPS");
        if (f === "Apagado remoto") clientFeatures.push("Bloqueo remoto");
        if (f === "Apertura de puertas") clientFeatures.push("Apertura de puertas");
        if (f === "Botón de pánico") clientFeatures.push("Botón de pánico");
        if (f === "Micrófono") clientFeatures.push("Micrófono");
        if (f === "Parlante") clientFeatures.push("Parlante");
      });

      const customOther = otData[otRow][otHeaderMap["Otras_Funcionalidades"] - 1] || "";
      if (customOther) {
        clientFeatures.push(customOther);
      }
    }
  } catch (err) {
    console.error("Error filtrando funcionalidades para cliente:", err);
  }

  // Extraer información del servicio
  const serviceInfo = {
    lugar: row[headerMap["Dirección"] - 1] || "No especificado",
    fechaRecepcion: row[headerMap["Fecha"] - 1] || "No especificada",
    fechaInstalacion: row[headerMap["Fecha Instalacion"] - 1] || "Pendiente",
    tipoServicio: row[headerMap["Servicio"] - 1] || "Básico",
    observaciones: row[headerMap["Observaciones"] - 1] || "",
    estado: row[headerMap["Estado"] - 1] || "Pendiente",
    funcionalidades: clientFeatures
  };

  // Extraer información del vehículo
  const vehiculoInfo = {
    marca: row[headerMap["Marca"] - 1] || "",
    modelo: row[headerMap["Modelo"] - 1] || "",
    anio: row[headerMap["Año"] - 1] || "",
    color: row[headerMap["Color"] - 1] || "No especificado",
    placa: row[headerMap["Placa"] - 1] || "En trámite",
    ot: ot,
    estado: serviceInfo.estado,
    clasificacionVehiculo: row[headerMap["Clasificación Vehículo"] - 1] || ""
  };

  const firmaDigital = row[headerMap["Firma Digital"] - 1] || "";

  // 3. Buscar evidencia fotográfica y anotaciones de la recepción
  const recSheet = findOrCreateSheet("RecepcionVehiculos");
  const recData = recSheet.getDataRange().getValues();
  const recHeaderMap = getHeaderMap(recSheet);
  const recOtIdx = recHeaderMap["OrdenID"] - 1;
  const recFotosIdx = recHeaderMap["Fotos"] - 1;
  const recDanosIdx = recHeaderMap["Danos"] - 1;

  let fotos = {};
  let danos = {};

  for (let i = 1; i < recData.length; i++) {
    if (recData[i][recOtIdx].toString().trim() === ot.toString().trim()) {
      try {
        fotos = JSON.parse(recData[i][recFotosIdx] || "{}");
        danos = JSON.parse(recData[i][recDanosIdx] || "{}");
      } catch (err) {
        console.error("Error parsing fotos/danos JSON:", err);
      }
      break;
    }
  }

  logToSheet("Auditoria", "Portal", "getClientPortalData", "success", "", `Consulta exitosa de OT ${ot} desde portal de cliente`);

  return {
    status: "success",
    data: {
      vehiculo: vehiculoInfo,
      instalador: instaladorInfo,
      vendedor: vendedorInfo,
      servicio: serviceInfo,
      fotos: fotos,
      danos: danos,
      firmaDigital: firmaDigital
    }
  };
}

/**
 * Impide combinaciones de trabajos incompatibles dentro de la misma jornada.
 * Retorna true si hay un conflicto de desplazamiento adyacente.
 */
function hasAdjacentTravelConflict(tecnico, fecha, horaRange, travelType, division, ordersData, orderHeaderMap) {
  if (!tecnico || !fecha || !horaRange) return false;

  const techIdx = orderHeaderMap["Técnico Asignado"] - 1;
  const dateIdx = orderHeaderMap["Fecha"] - 1;
  const hourIdx = orderHeaderMap["Hora"] - 1;
  const dirIdx = orderHeaderMap["Dirección"] - 1;
  const statusIdx = orderHeaderMap["Estado"] - 1;

  const getHours = (slotStr) => {
    const match = (slotStr || "").match(/(\d{2}):(\d{2})/g);
    if (!match) return null;
    const startHour = parseInt(match[0].split(":")[0]);
    const endHour = match[1] ? parseInt(match[1].split(":")[0]) : startHour + 2;
    return { start: startHour, end: endHour };
  };

  const currentSlot = getHours(horaRange);
  if (!currentSlot) return false;

  for (let i = 1; i < ordersData.length; i++) {
    const rowTech = ordersData[i][techIdx];
    const rowStatus = (ordersData[i][statusIdx] || "").toString().toLowerCase().trim();
    if (rowTech !== tecnico || rowStatus === "cancelada" || rowStatus === "expirada") continue;

    const rowDateVal = ordersData[i][dateIdx] instanceof Date ? ordersData[i][dateIdx].toISOString().split('T')[0] : ordersData[i][dateIdx].toString().substring(0, 10);
    const targetDateVal = fecha instanceof Date ? fecha.toISOString().split('T')[0] : fecha.toString().substring(0, 10);
    if (rowDateVal !== targetDateVal) continue;

    const rowSlot = getHours(ordersData[i][hourIdx]);
    if (!rowSlot) continue;

    const isAdjacent = (rowSlot.end === currentSlot.start || rowSlot.start === currentSlot.end);
    if (isAdjacent) {
      const rowAddress = ordersData[i][dirIdx] || "";
      const rowTravelType = classifyTravel(rowAddress, division);

      if (travelType !== "Trabajo Local" || rowTravelType !== "Trabajo Local") {
        return true;
      }
    }
  }

  return false;
}


// ============================================================================
// RBAC, USUARIOS Y CONTROL DE ACCESO
// ============================================================================
const GPSPEDIA_SPREADSHEET_ID = CONFIG.GPSPEDIA_SPREADSHEET_ID;

function getGpsPediaUsersSheet() {
  return SpreadsheetApp.openById(GPSPEDIA_SPREADSHEET_ID).getSheetByName("Users");
}

function handleGetUsersList(payload) {
  const { requestorUsername } = payload;
  if (!requestorUsername) return { status: 'error', message: 'Usuario solicitante es requerido' };

  const requestorSector = handleGetUserSector({ username: requestorUsername }).sector;
  const requestorRole = getUserRole(requestorUsername);

  const sheet = getGpsPediaUsersSheet();
  const data = sheet.getDataRange().getValues();
  data.shift(); // remove headers

  const users = [];
  data.forEach(row => {
    const username = (row[1] || '').toString().trim();
    if (!username) return;

    const userSector = handleGetUserSector({ username: username }).sector;

    const isJefe = ['jefe', 'jefe de division', 'gerente'].includes(requestorRole.toLowerCase());
    const isDev = ['desarrollador', 'administrador'].includes(requestorRole.toLowerCase());

    if (isJefe && userSector !== requestorSector) return;
    if (!isDev && !isJefe && username !== requestorUsername) return;

    users.push({
      id: row[0],
      nombre_usuario: username,
      privilegios: row[3] || '',
      telefono: row[4] || '',
      correo_electronico: row[5] || '',
      nombre_completo: row[6] || '',
      sector: userSector
    });
  });

  return { status: 'success', data: users };
}

function getUserRole(username) {
  const sheet = getGpsPediaUsersSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][1] || '').toString().trim().toLowerCase() === username.trim().toLowerCase()) {
      return (data[i][3] || '').toString().trim();
    }
  }
  return '';
}

function handleCreateUser(payload) {
  const { requestorUsername, username, password, privilegios, telefono, correo_electronico, nombre_completo, sector } = payload;
  if (!requestorUsername || !username || !password || !privilegios || !sector) {
    return { status: 'error', message: 'Datos incompletos para creación de usuario' };
  }

  const requestorRole = getUserRole(requestorUsername);
  const requestorSector = handleGetUserSector({ username: requestorUsername }).sector;

  const isDev = ['desarrollador', 'administrador'].includes(requestorRole.toLowerCase());
  const isJefe = ['jefe', 'jefe de division', 'gerente'].includes(requestorRole.toLowerCase());

  if (!isDev && !isJefe) {
    return { status: 'error', message: 'No tiene privilegios para crear usuarios' };
  }

  if (isJefe && requestorSector !== sector) {
    return { status: 'error', message: 'Un Jefe de división solo puede crear usuarios dentro de su propia división' };
  }

  const sheet = getGpsPediaUsersSheet();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if ((data[i][1] || '').toString().trim().toLowerCase() === username.trim().toLowerCase()) {
      return { status: 'error', message: 'El nombre de usuario ya existe' };
    }
  }

  const newId = data.length;
  const hashedPassword = hashPassword(password);
  const newRow = [
    newId,
    username.trim(),
    hashedPassword,
    privilegios,
    telefono || '',
    correo_electronico || '',
    nombre_completo || '',
    ''
  ];

  sheet.appendRow(newRow);
  handleUpdateUserSector({ username, sector });

  logToSheet("Auditoria", "Usuarios", "createUser", "success", "", `Usuario creado: ${username} por ${requestorUsername}`);
  return { status: 'success', message: 'Usuario creado exitosamente' };
}

function handleUpdateUser(payload) {
  const { requestorUsername, id, username, password, privilegios, telefono, correo_electronico, nombre_completo, sector } = payload;
  if (!requestorUsername || !id || !username) {
    return { status: 'error', message: 'Parámetros incompletos para actualizar usuario' };
  }

  const requestorRole = getUserRole(requestorUsername);
  const requestorSector = handleGetUserSector({ username: requestorUsername }).sector;

  const isDev = ['desarrollador', 'administrador'].includes(requestorRole.toLowerCase());
  const isJefe = ['jefe', 'jefe de division', 'gerente'].includes(requestorRole.toLowerCase());

  if (!isDev && !isJefe && requestorUsername !== username) {
    return { status: 'error', message: 'No tiene privilegios para modificar este usuario' };
  }

  const userSector = handleGetUserSector({ username }).sector;
  if (isJefe && (requestorSector !== userSector || requestorSector !== sector)) {
    return { status: 'error', message: 'Un Jefe de división no puede modificar usuarios de otras divisiones' };
  }

  const sheet = getGpsPediaUsersSheet();
  const data = sheet.getDataRange().getValues();

  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === id.toString()) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow === -1) {
    return { status: 'error', message: 'Usuario no encontrado' };
  }

  sheet.getRange(foundRow, 2).setValue(username);
  if (password) sheet.getRange(foundRow, 3).setValue(hashPassword(password));
  if (isDev || isJefe) sheet.getRange(foundRow, 4).setValue(privilegios);
  sheet.getRange(foundRow, 5).setValue(telefono || '');
  sheet.getRange(foundRow, 6).setValue(correo_electronico || '');
  sheet.getRange(foundRow, 7).setValue(nombre_completo || '');

  handleUpdateUserSector({ username, sector });

  logToSheet("Auditoria", "Usuarios", "updateUser", "success", "", `Usuario actualizado: ${username} por ${requestorUsername}`);
  return { status: 'success', message: 'Usuario actualizado correctamente' };
}

function handleDeleteUser(payload) {
  const { requestorUsername, username } = payload;
  if (!requestorUsername || !username) {
    return { status: 'error', message: 'Parámetros incompletos para eliminación' };
  }

  const requestorRole = getUserRole(requestorUsername);
  const requestorSector = handleGetUserSector({ username: requestorUsername }).sector;

  const isDev = ['desarrollador', 'administrador'].includes(requestorRole.toLowerCase());
  const isJefe = ['jefe', 'jefe de division', 'gerente'].includes(requestorRole.toLowerCase());

  if (!isDev && !isJefe) {
    return { status: 'error', message: 'No tiene privilegios para eliminar usuarios' };
  }

  const userSector = handleGetUserSector({ username }).sector;
  if (isJefe && requestorSector !== userSector) {
    return { status: 'error', message: 'Un Jefe de división no puede eliminar usuarios de otras divisiones' };
  }

  const sheet = getGpsPediaUsersSheet();
  const data = sheet.getDataRange().getValues();

  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if ((data[i][1] || '').toString().trim().toLowerCase() === username.trim().toLowerCase()) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow === -1) {
    return { status: 'error', message: 'Usuario no encontrado en la base de datos' };
  }

  sheet.deleteRow(foundRow);

  const userSectoresSheet = findOrCreateSheet("Usuarios_Sectores");
  const usData = userSectoresSheet.getDataRange().getValues();
  for (let i = 1; i < usData.length; i++) {
    if ((usData[i][0] || '').toString().trim().toLowerCase() === username.trim().toLowerCase()) {
      userSectoresSheet.getRange(i + 1, 3).setValue("Inactivo");
    }
  }

  logToSheet("Auditoria", "Usuarios", "deleteUser", "success", "", `Usuario eliminado: ${username} por ${requestorUsername}`);
  return { status: 'success', message: 'Usuario eliminado exitosamente' };
}

function handleVerifyPassword(payload) {
  const { username, password } = payload;
  if (!username || !password) return { status: 'error', message: 'Datos incompletos' };
  const sheet = getGpsPediaUsersSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][1] || '').toString().trim().toLowerCase() === username.trim().toLowerCase()) {
      if (verifyPassword(password, data[i][2])) {
        return { status: 'success', message: 'Identidad confirmada' };
      }
      break;
    }
  }
  return { status: 'error', message: 'Contraseña incorrecta' };
}

function handleChangePassword(payload) {
  const { username, currentPassword, newPassword } = payload;
  if (!username || !newPassword) {
    return { status: 'error', message: 'Datos incompletos para cambio de contraseña' };
  }

  const sheet = getGpsPediaUsersSheet();
  const data = sheet.getDataRange().getValues();

  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if ((data[i][1] || '').toString().trim().toLowerCase() === username.trim().toLowerCase()) {
      foundRow = i + 1;
      if (currentPassword && !verifyPassword(currentPassword, data[i][2])) {
        return { status: 'error', message: 'La contraseña actual es incorrecta' };
      }
      break;
    }
  }

  if (foundRow === -1) {
    return { status: 'error', message: 'Usuario no encontrado' };
  }

  sheet.getRange(foundRow, 3).setValue(hashPassword(newPassword));
  logToSheet("Auditoria", "Usuarios", "changePassword", "success", "", `Contraseña modificada para usuario: ${username}`);
  return { status: 'success', message: 'Contraseña actualizada exitosamente' };
}



// ============================================================================
// HORAS EXTRAS Y REPORTE MENSUAL
// ============================================================================
function handleGetOvertimeReport(payload) {
  const { monthStr, requestorUsername } = payload;
  if (!monthStr) return { status: 'error', message: 'Mes es requerido' };

  const requestorRole = getUserRole(requestorUsername);
  const isJefe = ['jefe', 'jefe de division', 'gerente'].includes(requestorRole.toLowerCase());
  const isDev = ['desarrollador', 'administrador'].includes(requestorRole.toLowerCase());

  if (!isJefe && !isDev) {
    return { status: 'error', message: 'No tiene permisos para consultar reportes de horas extras' };
  }

  const requestorSector = handleGetUserSector({ username: requestorUsername }).sector;

  const ordersSheet = findOrCreateSheet("Ordenes");
  const ordersData = ordersSheet.getDataRange().getValues();
  const ordersHeaderMap = getHeaderMap(ordersSheet);
  const orderIdIdx = ordersHeaderMap["ID"] - 1;
  const orderTechIdx = ordersHeaderMap["Técnico Asignado"] - 1;
  const orderSectorIdx = ordersHeaderMap["Sector"] - 1;

  const orderMap = {};
  for (let i = 1; i < ordersData.length; i++) {
    orderMap[ordersData[i][orderIdIdx].toString()] = {
      tech: ordersData[i][orderTechIdx] || 'Sin asignar',
      sector: ordersData[i][orderSectorIdx] || 'San Pedro Sula'
    };
  }

  const histSheet = findOrCreateSheet("Historial_Estados");
  const histData = histSheet.getDataRange().getValues();
  histData.shift();

  const orderEvents = {};
  histData.forEach(row => {
    const orderId = row[2] ? row[2].toString() : '';
    if (!orderId) return;
    if (!orderEvents[orderId]) orderEvents[orderId] = [];
    orderEvents[orderId].push({
      date: row[0],
      time: row[1],
      state: (row[4] || '').toString().toLowerCase().trim()
    });
  });

  const techOvertime = {};

  Object.entries(orderEvents).forEach(([orderId, events]) => {
    const orderInfo = orderMap[orderId];
    if (!orderInfo) return;

    if (isJefe && orderInfo.sector !== requestorSector) return;

    let startEvent = null;
    let endEvent = null;

    events.forEach(ev => {
      const state = ev.state;
      if (['iniciando', 'instalando', 'vehiculo recibido', 'vehículo recibido'].includes(state)) {
        if (!startEvent) startEvent = ev;
      }
      if (['finalizada', 'instalacion completada', 'instalación completada'].includes(state)) {
        endEvent = ev;
      }
    });

    if (startEvent && endEvent) {
      const startDateTime = parseDateTime(startEvent.date, startEvent.time);
      const endDateTime = parseDateTime(endEvent.date, endEvent.time);

      if (startDateTime && endDateTime && startDateTime < endDateTime) {
        const yearMonth = startDateTime.getFullYear() + '-' + String(startDateTime.getMonth() + 1).padStart(2, '0');
        if (yearMonth === monthStr) {
          const tech = orderInfo.tech;
          const chunks = splitRangeByDays(startDateTime, endDateTime);
          let itemOvertime = 0;

          chunks.forEach(chunk => {
            const dayOfWeek = chunk.start.getDay();
            if (dayOfWeek === 0) {
              itemOvertime += (chunk.end - chunk.start) / (1000 * 60 * 60);
            } else if (dayOfWeek === 6) {
              itemOvertime += getOverlapInHours(chunk.start, chunk.end, '00:00', '08:00');
              itemOvertime += getOverlapInHours(chunk.start, chunk.end, '12:00', '23:59');
            } else {
              itemOvertime += getOverlapInHours(chunk.start, chunk.end, '00:00', '08:00');
              itemOvertime += getOverlapInHours(chunk.start, chunk.end, '17:00', '23:59');
            }
          });

          if (itemOvertime > 0) {
            techOvertime[tech] = (techOvertime[tech] || 0) + itemOvertime;
          }
        }
      }
    }
  });

  const reportList = Object.entries(techOvertime).map(([tech, hours]) => ({
    tecnico: tech,
    horas_extras: Math.round(hours * 100) / 100
  }));

  try {
    const rSheet = findOrCreateSheet("Reporte_Horas_Extras", ["Mes", "Técnico", "Horas Extras", "Fecha Generación"]);
    const rData = rSheet.getDataRange().getValues();
    let exists = false;
    for (let j = 1; j < rData.length; j++) {
      if (rData[j][0] === monthStr) {
        exists = true;
        break;
      }
    }
    if (!exists && reportList.length > 0) {
      reportList.forEach(item => {
        rSheet.appendRow([monthStr, item.tecnico, item.horas_extras, new Date().toISOString()]);
      });
    }
  } catch (e) {
    console.error("Error saving overtime report:", e);
  }

  return { status: 'success', data: reportList };
}

function splitRangeByDays(start, end) {
  const chunks = [];
  let current = new Date(start.getTime());
  while (current < end) {
    const dayEnd = new Date(current.getFullYear(), current.getMonth(), current.getDate(), 23, 59, 59, 999);
    const chunkEnd = new Date(Math.min(end.getTime(), dayEnd.getTime()));
    chunks.push({ start: new Date(current.getTime()), end: chunkEnd });
    current = new Date(dayEnd.getTime() + 1);
  }
  return chunks;
}

function getOverlapInHours(start, end, limitStartStr, limitEndStr) {
  const baseDateStr = start.toISOString().split('T')[0];
  const limitStart = new Date(baseDateStr + 'T' + limitStartStr + ':00');
  const limitEnd = new Date(baseDateStr + 'T' + limitEndStr + ':00');

  const maxStart = new Date(Math.max(start.getTime(), limitStart.getTime()));
  const minEnd = new Date(Math.min(end.getTime(), limitEnd.getTime()));

  if (maxStart < minEnd) {
    return (minEnd.getTime() - maxStart.getTime()) / (1000 * 60 * 60);
  }
  return 0;
}


// ============================================================================
// COMPENSACIÓN DE ALMUERZO Y REORGANIZACIÓN DE AGENDA
// ============================================================================
function handleLunchAndRescheduling(orderId, technicianName, sector, finishTime) {
  const now = finishTime || new Date();
  const finishHour = now.getHours();
  const finishMinutes = now.getMinutes();
  const finishTimeDecimal = finishHour + finishMinutes / 60;

  if (finishTimeDecimal < 12.0) {
    return;
  }

  const lunchEndTime = new Date(now.getTime() + 60 * 60 * 1000);
  const sheet = findOrCreateSheet("Ordenes");
  const data = sheet.getDataRange().getValues();
  const headerMap = getHeaderMap(sheet);

  const idIdx = headerMap["ID"] - 1;
  const techIdx = headerMap["Técnico Asignado"] - 1;
  const statusIdx = headerMap["Estado"] - 1;
  const dateIdx = headerMap["Fecha"] - 1;
  const hourIdx = headerMap["Hora"] - 1;
  const sectorIdx = headerMap["Sector"] - 1;
  const tipoIdx = headerMap["Tipo Trabajo"] - 1;
  const obsIdx = headerMap["Observaciones"] - 1;

  const todayStr = now.toISOString().split('T')[0];

  const subOrders = [];
  for (let i = 1; i < data.length; i++) {
    if ((data[i][techIdx] || '').toString() === technicianName && data[i][idIdx].toString() !== orderId.toString()) {
      const oDateStr = data[i][dateIdx] instanceof Date ? data[i][dateIdx].toISOString().split('T')[0] : data[i][dateIdx].toString().substring(0, 10);
      if (oDateStr === todayStr) {
        const sLower = (data[i][statusIdx] || '').toString().toLowerCase().trim();
        if (['pendiente', 'asignada', 'en camino', 'llego', 'vehiculo recibido', 'iniciando', 'instalando', 'haciendo pruebas', 'instalacion completada', 'trabajo retrasado'].includes(sLower)) {
          const slotStr = data[i][hourIdx].toString();
          const match = slotStr.match(/(\d{2}):(\d{2})/);
          let startMin = 0;
          if (match) {
            startMin = parseInt(match[1]) * 60 + parseInt(match[2]);
          }
          subOrders.push({
            id: data[i][idIdx],
            row: i + 1,
            slotStr: slotStr,
            startMin: startMin,
            tipo: data[i][tipoIdx],
            obs: data[i][obsIdx],
            status: data[i][statusIdx]
          });
        }
      }
    }
  }

  subOrders.sort((a, b) => a.startMin - b.startMin);

  if (subOrders.length === 0) {
    return;
  }

  let currentAvailableTime = lunchEndTime;

  subOrders.forEach(subOrder => {
    const subStartMin = subOrder.startMin;
    const currentAvailableMin = currentAvailableTime.getHours() * 60 + currentAvailableTime.getMinutes();

    if (subStartMin < currentAvailableMin) {
      const techSheet = findOrCreateSheet("Tecnicos");
      const techData = techSheet.getDataRange().getValues();
      const otherTechs = [];
      for (let k = 1; k < techData.length; k++) {
        const tName = techData[k][1];
        const tSector = techData[k][5];
        if (tName !== technicianName && tSector === sector) {
          let isFree = true;
          for (let i = 1; i < data.length; i++) {
            if ((data[i][techIdx] || '').toString() === tName) {
              const oDateStr = data[i][dateIdx] instanceof Date ? data[i][dateIdx].toISOString().split('T')[0] : data[i][dateIdx].toString().substring(0, 10);
              if (oDateStr === todayStr && data[i][hourIdx].toString() === subOrder.slotStr) {
                const sLower = (data[i][statusIdx] || '').toString().toLowerCase().trim();
                if (['pendiente', 'asignada', 'en camino', 'llego', 'vehiculo recibido', 'iniciando', 'instalando', 'haciendo pruebas', 'instalacion completada'].includes(sLower)) {
                  isFree = false;
                  break;
                }
              }
            }
          }
          if (isFree) {
            otherTechs.push(tName);
          }
        }
      }

      if (otherTechs.length > 0) {
        const selectedTech = otherTechs[0];
        sheet.getRange(subOrder.row, techIdx + 1).setValue(selectedTech);

        try {
          const histSheet = findOrCreateSheet("Historial_Estados", ["Fecha", "Hora", "OrdenID", "Estado Anterior", "Estado Nuevo", "Usuario", "Observaciones"]);
          histSheet.appendRow([
            todayStr,
            String(now.getHours()).padStart(2, '0') + ":" + String(now.getMinutes()).padStart(2, '0'),
            subOrder.id,
            subOrder.status,
            subOrder.status,
            "Sistema",
            `Reasignado automáticamente a ${selectedTech} debido a compensación de almuerzo del técnico anterior (${technicianName}).`
          ]);
        } catch (e) {
          console.error("Error writing reassign transition:", e);
        }

        const notifSheet = findOrCreateSheet("Notificaciones", ["Fecha", "Destinatario", "Tipo", "Mensaje", "Estado"]);
        notifSheet.appendRow([
          new Date().toISOString(),
          selectedTech,
          "Asignación",
          `Se te ha reasignado la orden #${subOrder.id} debido a retraso operativo.`,
          "Pendiente"
        ]);
      } else {
        const newStartStr = String(currentAvailableTime.getHours()).padStart(2, '0') + ":" + String(currentAvailableTime.getMinutes()).padStart(2, '0');
        const duration = calculateEstimatedDuration(subOrder.tipo, subOrder.obs);
        const newEndMin = currentAvailableMin + duration;

        const nextFreeTime = new Date(now.getTime());
        nextFreeTime.setHours(Math.floor(newEndMin / 60));
        nextFreeTime.setMinutes(newEndMin % 60);

        const newEndStr = String(nextFreeTime.getHours()).padStart(2, '0') + ":" + String(nextFreeTime.getMinutes()).padStart(2, '0');
        const newSlotRangeStr = `${newStartStr} - ${newEndStr}`;

        sheet.getRange(subOrder.row, hourIdx + 1).setValue(newSlotRangeStr);

        try {
          const histSheet = findOrCreateSheet("Historial_Estados", ["Fecha", "Hora", "OrdenID", "Estado Anterior", "Estado Nuevo", "Usuario", "Observaciones"]);
          histSheet.appendRow([
            todayStr,
            String(now.getHours()).padStart(2, '0') + ":" + String(now.getMinutes()).padStart(2, '0'),
            subOrder.id,
            subOrder.status,
            subOrder.status,
            "Sistema",
            `Horario reajustado a ${newSlotRangeStr} para garantizar almuerzo del técnico (${technicianName}).`
          ]);
        } catch (e) {
          console.error("Error writing reschedule transition:", e);
        }

        currentAvailableTime = nextFreeTime;
      }
    } else {
      const duration = calculateEstimatedDuration(subOrder.tipo, subOrder.obs);
      const endMin = subStartMin + duration;
      currentAvailableTime = new Date(now.getTime());
      currentAvailableTime.setHours(Math.floor(endMin / 60));
      currentAvailableTime.setMinutes(endMin % 60);
    }
  });
}


// ============================================================================
// SISTEMA DE UBICACIONES GUARDADAS Y CAPACIDAD DINÁMICA
// ============================================================================
function handleGetSavedLocations() {
  const sheet = findOrCreateSheet("UbicacionesGuardadas");
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { status: 'success', data: [] };
  const headers = data.shift();

  const locations = data.map(row => {
    let obj = {};
    headers.forEach((header, index) => {
      const key = header.toLowerCase()
        .replace(/\s+/g, '')
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      obj[key] = row[index];
    });
    return obj;
  });

  // Ordenar por usos descendente (Priorización)
  locations.sort((a, b) => (parseInt(b.usos) || 0) - (parseInt(a.usos) || 0));

  return { status: 'success', data: locations };
}

function handleSaveSavedLocation(payload) {
  const { nombre, direccion, coordenadas, division } = payload;
  if (!nombre || !coordenadas) return { status: 'error', message: 'Nombre y coordenadas son requeridos.' };

  const sheet = findOrCreateSheet("UbicacionesGuardadas", ["ID", "Nombre", "Dirección", "Coordenadas", "División", "Usos", "Historial"]);
  const data = sheet.getDataRange().getValues();
  const headerMap = getHeaderMap(sheet);

  const nameIdx = headerMap["Nombre"] - 1;
  const usosIdx = headerMap["Usos"] - 1;
  const histIdx = headerMap["Historial"] - 1;

  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][nameIdx].toString().toLowerCase().trim() === nombre.toLowerCase().trim()) {
      foundRow = i + 1;
      break;
    }
  }

  const timestamp = new Date().toISOString();

  if (foundRow !== -1) {
    const currentUsos = parseInt(data[foundRow - 1][usosIdx]) || 0;
    const currentHist = data[foundRow - 1][histIdx] || "";
    const updatedHist = currentHist ? `${currentHist}, ${timestamp}` : timestamp;

    sheet.getRange(foundRow, usosIdx + 1).setValue(currentUsos + 1);
    sheet.getRange(foundRow, histIdx + 1).setValue(updatedHist);
  } else {
    const nextId = getNextId("LOC");
    sheet.appendRow([
      nextId,
      nombre.trim(),
      direccion || "",
      coordenadas,
      division || "San Pedro Sula",
      1,
      timestamp
    ]);
  }

  return { status: 'success', message: 'Ubicación guardada con éxito.' };
}

function handleGetDivisionTechniciansCount(payload) {
  const { sector, date, slot } = payload;
  if (!sector) return { status: 'error', message: 'Sector es requerido' };

  const sheet = findOrCreateSheet("Tecnicos");
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { status: 'success', count: 4 };

  const headerMap = getHeaderMap(sheet);
  const sectorIdx = headerMap["Sector"] - 1;
  const nameIdx = headerMap["Nombre"] - 1;

  let totalTechs = [];
  for (let i = 1; i < data.length; i++) {
    const techSector = data[i][sectorIdx] || '';
    if (techSector.toLowerCase().trim() === sector.toLowerCase().trim()) {
      totalTechs.push(data[i][nameIdx].toString().trim());
    }
  }

  if (!date) {
    return { status: 'success', count: totalTechs.length || 4 };
  }

  const indSheet = findOrCreateSheet("Indisponibilidad", ["ID", "Técnico", "Fecha Inicio", "Fecha Fin", "Es Parcial", "Hora Retorno", "División", "Estado"]);
  const indData = indSheet.getDataRange().getValues();
  const indHeader = getHeaderMap(indSheet);

  const indTechIdx = indHeader["Técnico"] - 1;
  const indStartIdx = indHeader["Fecha Inicio"] - 1;
  const indEndIdx = indHeader["Fecha Fin"] - 1;
  const indParIdx = indHeader["Es Parcial"] - 1;
  const indRetIdx = indHeader["Hora Retorno"] - 1;
  const indEstIdx = indHeader["Estado"] - 1;

  let unavailableTechs = new Set();

  for (let j = 1; j < indData.length; j++) {
    const status = (indData[j][indEstIdx] || "").toString().trim();
    if (status === "Inactivo") continue;

    const techName = (indData[j][indTechIdx] || "").toString().trim();
    const startDate = (indData[j][indStartIdx] || "").toString().trim();
    const endDate = (indData[j][indEndIdx] || "").toString().trim();
    const isPartial = indData[j][indParIdx] === "Sí";
    const returnTime = (indData[j][indRetIdx] || "").toString().trim();

    if (date >= startDate && date <= endDate) {
      if (isPartial) {
        if (slot && returnTime) {
          const slotMatch = slot.match(/(\d{2}):(\d{2})/);
          const retMatch = returnTime.match(/(\d{2}):(\d{2})/);
          if (slotMatch && retMatch) {
            const slotMin = parseInt(slotMatch[1]) * 60 + parseInt(slotMatch[2]);
            const retMin = parseInt(retMatch[1]) * 60 + parseInt(retMatch[2]);
            if (slotMin < retMin) {
              unavailableTechs.add(techName);
            }
          }
        } else {
          unavailableTechs.add(techName);
        }
      } else {
        unavailableTechs.add(techName);
      }
    }
  }

  const activeTechs = totalTechs.filter(t => !unavailableTechs.has(t));
  return { status: 'success', count: activeTechs.length || 1 };
}

function handleSaveUnavailability(payload) {
  const { tecnico, fechaInicio, fechaFin, esParcial, horaRetorno, division } = payload;
  if (!tecnico || !fechaInicio || !fechaFin) {
    return { status: 'error', message: 'Datos incompletos para registrar indisponibilidad' };
  }

  const sheet = findOrCreateSheet("Indisponibilidad", ["ID", "Técnico", "Fecha Inicio", "Fecha Fin", "Es Parcial", "Hora Retorno", "División", "Estado"]);
  const id = "IND-" + new Date().getTime();
  sheet.appendRow([id, tecnico, fechaInicio, fechaFin, esParcial ? "Sí" : "No", horaRetorno || "", division || "San Pedro Sula", "Activo"]);

  return { status: 'success', id: id };
}

function handleGetUnavailability(payload) {
  const sheet = findOrCreateSheet("Indisponibilidad", ["ID", "Técnico", "Fecha Inicio", "Fecha Fin", "Es Parcial", "Hora Retorno", "División", "Estado"]);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { status: 'success', data: [] };

  const headerMap = getHeaderMap(sheet);
  const list = [];
  for (let i = 1; i < data.length; i++) {
    list.push({
      id: data[i][headerMap["ID"] - 1],
      tecnico: data[i][headerMap["Técnico"] - 1],
      fechaInicio: data[i][headerMap["Fecha Inicio"] - 1],
      fechaFin: data[i][headerMap["Fecha Fin"] - 1],
      esParcial: data[i][headerMap["Es Parcial"] - 1] === "Sí",
      horaRetorno: data[i][headerMap["Hora Retorno"] - 1],
      division: data[i][headerMap["División"] - 1],
      estado: data[i][headerMap["Estado"] - 1]
    });
  }
  return { status: 'success', data: list };
}

function doGet(e) {
  return ContentService.createTextOutput("GOS-CORE Service: v1.1.0 OK")
    .setMimeType(ContentService.MimeType.TEXT);
}

function handleGetTechnicians() {
  const sheet = findOrCreateSheet("Tecnicos");
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { status: 'success', data: [] };
  const headers = data.shift();
  const techs = data.map(row => {
    let obj = {};
    headers.forEach((header, index) => {
      const key = header.toLowerCase()
        .replace(/\s+/g, '')
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      obj[key] = row[index];
    });
    return obj;
  });
  return { status: 'success', data: techs };
}

function handleGetOTConfig() {
  const sheet = findOrCreateSheet("Configuracion", ["Categoría", "Clave", "Valor", "Estado"]);
  const data = sheet.getDataRange().getValues();
  const config = {
    OT_Base_Number: 1000,
    OT_Generation_Method: "automatic",
    OT_Auto_Numeration: "active"
  };
  for (let i = 1; i < data.length; i++) {
    const key = data[i][1];
    const val = data[i][2];
    if (key === "OT_Base_Number") config.OT_Base_Number = parseInt(val) || 1000;
    if (key === "OT_Generation_Method") config.OT_Generation_Method = val;
    if (key === "OT_Auto_Numeration") config.OT_Auto_Numeration = val;
  }
  return { status: 'success', data: config };
}

function handleUpdateOTConfig(payload) {
  const { baseNumber, generationMethod, autoNumeration } = payload;
  const sheet = findOrCreateSheet("Configuracion", ["Categoría", "Clave", "Valor", "Estado"]);
  const data = sheet.getDataRange().getValues();

  const updateOrAppend = (key, val) => {
    let rowIdx = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === key) {
        rowIdx = i + 1;
        break;
      }
    }
    if (rowIdx !== -1) {
      sheet.getRange(rowIdx, 3).setValue(val);
    } else {
      sheet.appendRow(["Sistema", key, val, "Activo"]);
    }
  };

  if (baseNumber !== undefined) updateOrAppend("OT_Base_Number", baseNumber.toString());
  if (generationMethod !== undefined) updateOrAppend("OT_Generation_Method", generationMethod);
  if (autoNumeration !== undefined) updateOrAppend("OT_Auto_Numeration", autoNumeration);

  return { status: 'success', message: 'Configuración de OT actualizada correctamente' };
}

function handleSaveTechnicianSignature(payload) {
  const { tecnico, firma } = payload;
  if (!tecnico || !firma) return { status: 'error', message: 'Técnico y firma son requeridos' };
  const sheet = findOrCreateSheet("Firmas_Tecnicos", ["Tecnico", "Firma"]);
  const data = sheet.getDataRange().getValues();

  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString().toLowerCase() === tecnico.toString().toLowerCase()) {
      rowIdx = i + 1;
      break;
    }
  }
  if (rowIdx !== -1) {
    sheet.getRange(rowIdx, 2).setValue(firma);
  } else {
    sheet.appendRow([tecnico, firma]);
  }
  return { status: 'success', message: 'Firma de técnico guardada correctamente' };
}

function handleGetTechnicianSignature(payload) {
  const { tecnico } = payload;
  if (!tecnico) return { status: 'error', message: 'Técnico es requerido' };
  const sheet = findOrCreateSheet("Firmas_Tecnicos", ["Tecnico", "Firma"]);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString().toLowerCase() === tecnico.toString().toLowerCase()) {
      return { status: 'success', firma: data[i][1] };
    }
  }
  return { status: 'success', firma: null };
}

function handleDeleteTechnicianSignature(payload) {
  const { tecnico } = payload;
  if (!tecnico) return { status: 'error', message: 'Técnico es requerido' };
  const sheet = findOrCreateSheet("Firmas_Tecnicos", ["Tecnico", "Firma"]);
  const data = sheet.getDataRange().getValues();
  let deleted = false;
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0].toString().toLowerCase() === tecnico.toString().toLowerCase()) {
      sheet.deleteRow(i + 1);
      deleted = true;
    }
  }
  if (deleted) {
    return { status: 'success', message: 'Firma eliminada correctamente' };
  }
  return { status: 'error', message: 'No se encontró firma para el técnico' };
}

function handleCreateOT(payload) {
  const { oiId, enteredVin, manualOtId } = payload;
  if (!oiId || !enteredVin) return { status: 'error', message: 'OI ID y VIN son requeridos' };

  const oiSheet = findOrCreateSheet("Ordenes");
  const oiData = oiSheet.getDataRange().getValues();
  const oiHeaderMap = getHeaderMap(oiSheet);

  const idIdx = oiHeaderMap["ID"] - 1;
  const vinIdx = oiHeaderMap["VIN"] - 1;

  let oiRow = -1;
  for (let i = 1; i < oiData.length; i++) {
    if (oiData[i][idIdx].toString() === oiId.toString()) {
      oiRow = i;
      break;
    }
  }

  if (oiRow === -1) {
    return { status: 'error', message: 'Orden de Instalación no encontrada' };
  }

  const expectedVin = oiData[oiRow][vinIdx] || "";
  if (expectedVin.toString().trim().toLowerCase() !== enteredVin.toString().trim().toLowerCase()) {
    return { status: 'error', message: 'El VIN ingresado no coincide con la Orden de Instalación.' };
  }

  // Generar ID único para OT
  const configSheet = findOrCreateSheet("Configuracion", ["Categoría", "Clave", "Valor", "Estado"]);
  const configData = configSheet.getDataRange().getValues();
  let autoNum = "active";
  let genMethod = "automatic";
  let baseNum = 1000;
  let baseRowIdx = -1;

  for (let i = 1; i < configData.length; i++) {
    const key = configData[i][1];
    const val = configData[i][2];
    if (key === "OT_Auto_Numeration") autoNum = val;
    if (key === "OT_Generation_Method") genMethod = val;
    if (key === "OT_Base_Number") {
      baseNum = parseInt(val) || 1000;
      baseRowIdx = i + 1;
    }
  }

  let otId = "";
  if (autoNum === "active" && genMethod === "automatic") {
    const nextVal = baseNum + 1;
    if (baseRowIdx !== -1) {
      configSheet.getRange(baseRowIdx, 3).setValue(nextVal);
    } else {
      configSheet.appendRow(["Sistema", "OT_Base_Number", nextVal.toString(), "Activo"]);
    }
    otId = `OT-${nextVal}`;
  } else {
    if (!manualOtId) {
      return { status: 'error', message: 'Se requiere ingresar manualmente el ID de la Orden de Trabajo' };
    }
    otId = manualOtId;
  }

  // Registrar en Ordenes_Trabajo
  const otSheet = findOrCreateSheet("Ordenes_Trabajo", [
    "ID", "OI_ID", "Estado", "Firma_Tecnico", "Firma_Cliente_Recepcion", "Firma_Cliente_Entrega",
    "FechaHora_Recepcion", "FechaHora_Inicio", "FechaHora_Pruebas", "FechaHora_Fin", "FechaHora_Abandono", "FechaHora_Entrega",
    "IMEI", "SIM", "Info_Interna", "Datos_Prog", "Funcionalidades", "Segundo_GPS", "Segundo_GPS_Info", "Tipo_Apagado_Remoto", "Otras_Funcionalidades",
    "Fotos", "Danos", "CalidadCheck", "Observaciones"
  ]);

  // Verificar si ya existe para evitar duplicado
  const otData = otSheet.getDataRange().getValues();
  for (let i = 1; i < otData.length; i++) {
    if (otData[i][1].toString() === oiId.toString()) {
      return { status: 'success', otId: otData[i][0], message: 'Orden de Trabajo existente recuperada.' };
    }
  }

  const nowStr = new Date().toISOString();
  otSheet.appendRow([
    otId,
    oiId,
    "Recepción",
    "", "", "",
    nowStr, "", "", "", "", "",
    "", "", "", "", "[]", "No", "", "", "",
    "{}", "{}", "{}", ""
  ]);

  // Actualizar estado de OI a "Vehículo recibido"
  handleUpdateOrderStatus({ orderId: oiId, status: "Vehículo recibido" });

  return { status: 'success', otId: otId, message: 'Orden de Trabajo creada exitosamente.' };
}

function handleSaveOTDetails(payload) {
  const { otId, updates } = payload;
  if (!otId) return { status: 'error', message: 'OT ID es requerido' };
  const sheet = findOrCreateSheet("Ordenes_Trabajo");
  const data = sheet.getDataRange().getValues();
  const headerMap = getHeaderMap(sheet);

  const idIdx = headerMap["ID"] - 1;
  let otRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][idIdx].toString() === otId.toString()) {
      otRow = i + 1;
      break;
    }
  }

  if (otRow === -1) return { status: 'error', message: 'Orden de Trabajo no encontrada' };

  Object.entries(updates).forEach(([key, val]) => {
    const colIdx = headerMap[key];
    if (colIdx) {
      sheet.getRange(otRow, colIdx).setValue(val);
    }
  });

  return { status: 'success', message: 'Detalles de OT guardados correctamente' };
}

function handleGetOTDetails(payload) {
  const { otId, oiId } = payload;
  const sheet = findOrCreateSheet("Ordenes_Trabajo");
  const data = sheet.getDataRange().getValues();
  const headerMap = getHeaderMap(sheet);

  const idIdx = headerMap["ID"] - 1;
  const oiIdIdx = headerMap["OI_ID"] - 1;

  let otRow = -1;
  for (let i = 1; i < data.length; i++) {
    if ((otId && data[i][idIdx].toString() === otId.toString()) || (oiId && data[i][oiIdIdx].toString() === oiId.toString())) {
      otRow = i;
      break;
    }
  }

  if (otRow === -1) return { status: 'error', message: 'Orden de Trabajo no encontrada' };

  const otObj = {};
  Object.entries(headerMap).forEach(([key, colIdx]) => {
    otObj[key] = data[otRow][colIdx - 1];
  });

  return { status: 'success', data: otObj };
}

function handleGetSavedSignatures() {
  const sheet = findOrCreateSheet("Firmas_Tecnicos", ["Tecnico", "Firma"]);
  const data = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) {
      list.push(data[i][0].toString());
    }
  }
  return { status: 'success', data: list };
}

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    let response;

    switch (request.action) {
      case 'getOTConfig': response = handleGetOTConfig(); break;
      case 'updateOTConfig': response = handleUpdateOTConfig(request.payload); break;
      case 'saveTechnicianSignature': response = handleSaveTechnicianSignature(request.payload); break;
      case 'getTechnicianSignature': response = handleGetTechnicianSignature(request.payload); break;
      case 'deleteTechnicianSignature': response = handleDeleteTechnicianSignature(request.payload); break;
      case 'createOT': response = handleCreateOT(request.payload); break;
      case 'saveOTDetails': response = handleSaveOTDetails(request.payload); break;
      case 'getOTDetails': response = handleGetOTDetails(request.payload); break;
      case 'getSavedSignatures': response = handleGetSavedSignatures(); break;
      case 'getTechnicalConsultation': response = handleGetTechnicalConsultation(request.payload); break;
      case 'getSavedLocations': response = handleGetSavedLocations(); break;
      case 'saveSavedLocation': response = handleSaveSavedLocation(request.payload); break;
      case 'getSpecialTravelHistory': response = handleGetSpecialTravelHistory(request.payload); break;
      case 'getTechnicianMetrics': response = handleGetTechnicianMetrics(); break;
      case 'generateBackup': response = BackupManager.generateBackup(); break;
      case 'getDivisionTechniciansCount': response = handleGetDivisionTechniciansCount(request.payload); break;
      case 'saveUnavailability': response = handleSaveUnavailability(request.payload); break;
      case 'getUnavailability': response = handleGetUnavailability(request.payload); break;
      case 'updateOrderTechnician': response = handleUpdateOrderTechnician(request.payload); break;
      case 'getOvertimeReport': response = handleGetOvertimeReport(request.payload); break;
      case 'getUsersList': response = handleGetUsersList(request.payload); break;
      case 'createUser': response = handleCreateUser(request.payload); break;
      case 'updateUser': response = handleUpdateUser(request.payload); break;
      case 'deleteUser': response = handleDeleteUser(request.payload); break;
      case 'changePassword': response = handleChangePassword(request.payload); break;
      case 'verifyPassword': response = handleVerifyPassword(request.payload); break;
      case 'createOrder': response = handleCreateOrder(request.payload); break;
      case 'getOrders': response = handleGetOrders(); break;
      case 'lockSlot': response = handleLockSlot(request.payload); break;
      case 'unlockSlot': response = handleUnlockSlot(request.payload); break;
      case 'getSystemConfig': response = handleGetSystemConfig(); break;
      case 'initializeSystem': response = initializeSystem(); break;
      case 'getAgendaConfig': response = handleGetAgendaConfig(); break;
      case 'autoAssignTechnical': response = handleAutoAssignTechnical(request.payload); break;
      case 'updateStatistics': response = handleUpdateStatistics(request.payload); break;
      case 'getOrCreateOrderFolder': response = handleGetOrCreateOrderFolder(request.payload); break;
      case 'generateReport': response = handleGenerateReport(request.payload); break;
      case 'archiveOldOrders': response = handleArchiveOldOrders(); break;
      case 'updateTechnicianLocation': response = handleUpdateTechnicianLocation(request.payload); break;
      case 'updateOrderStatus': response = handleUpdateOrderStatus(request.payload); break;
      case 'getClients': response = handleGetClients(); break;
      case 'createClient': response = handleCreateClient(request.payload); break;
      case 'getTechnicians': response = handleGetTechnicians(); break;
      case 'sendNotification': response = handleSendNotification(request.payload); break;
      case 'getUserSector': response = handleGetUserSector(request.payload); break;
      case 'updateUserSector': response = handleUpdateUserSector(request.payload); break;
      case 'saveVehicleReception': response = handleSaveVehicleReception(request.payload); break;
      case 'getClientPortalData': response = handleGetClientPortalData(request.payload); break;
      case 'getVehicleHistory': response = handleGetVehicleHistory(request.payload); break;
      case 'reassignNextJob': response = handleReassignNextJob(request.payload); break;
      default: response = { status: 'error', message: 'Acción no soportada' };
    }

    return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.TEXT);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.message })).setMimeType(ContentService.MimeType.TEXT);
  }
}

function calculateEstimatedDuration(tipoTrabajo, subTipo) {
  var t = (tipoTrabajo || '').toLowerCase().replace(/^\s+|\s+$/g, '').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (t.indexOf('instalacion nueva') !== -1 || t.indexOf('instalación nueva') !== -1 || t === 'instalacion' || t === 'instalación') {
    return 120; // 90 min install + 30 min traslado/margen
  }
  if (t.indexOf('revision por falla') !== -1 || t.indexOf('revisión por falla') !== -1) {
    var s = (subTipo || '').toLowerCase().replace(/^\s+|\s+$/g, '').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (s.indexOf('cambio de unidad') !== -1) {
      if (s.indexOf('no compatible') !== -1 || s.indexOf('diferente') !== -1) {
        return 60; // Instalación completa de 60 mins
      }
      return 30; // compatible -> reprogramación (e.g. 30 mins)
    }
    if (s.indexOf('cambio de arnes') !== -1 || s.indexOf('cambio de arnés') !== -1) {
      return 60;
    }
    if (s.indexOf('reparacion de conexion') !== -1 || s.indexOf('reparación de conexión') !== -1 || s.indexOf('conexion') !== -1 || s.indexOf('conexión') !== -1) {
      return 35; // Rango 30-40 minutos (e.g. 35 mins)
    }
    return 60; // Diagnóstico inicial de duración indeterminada, mostramos 60 como marcador
  }
  if (t.indexOf('traspaso') !== -1) return 180;
  if (t.indexOf('desinstalacion') !== -1 || t.indexOf('desinstalación') !== -1) return 60;
  if (t.indexOf('mantenimiento') !== -1) return 15;
  return 30; // Por defecto
}

function handleLockSlot(payload) {
  const { date, slot, username } = payload;
  if (!date || !slot || !username) {
    return { status: 'error', message: 'Datos incompletos para bloquear cupo' };
  }

  checkAndExpireDrafts();

  const sheet = findOrCreateSheet("Ordenes");
  const data = sheet.getDataRange().getValues();
  const headerMap = getHeaderMap(sheet);

  const idIdx = headerMap["ID"] - 1;
  const fechaIdx = headerMap["Fecha"] - 1;
  const horaIdx = headerMap["Hora"] - 1;
  const estadoIdx = headerMap["Estado"] - 1;
  const sectorIdx = headerMap["Sector"] - 1;

  const userSheet = findOrCreateSheet("Usuarios");
  const uData = userSheet.getDataRange().getValues();
  const uHeader = getHeaderMap(userSheet);
  const uUserIdx = uHeader["Nombre_Usuario"] - 1;
  const uSectorIdx = uHeader["Sector"] - 1;

  let userSector = "San Pedro Sula";
  for (let i = 1; i < uData.length; i++) {
    if (uData[i][uUserIdx].toString().toLowerCase().trim() === username.toLowerCase().trim()) {
      userSector = uData[i][uSectorIdx] || "San Pedro Sula";
      break;
    }
  }

  for (let i = 1; i < data.length; i++) {
    const rowId = data[i][idIdx] ? data[i][idIdx].toString() : "";
    const rowDate = data[i][fechaIdx] ? data[i][fechaIdx].toString().trim() : "";
    const rowHora = data[i][horaIdx] ? data[i][horaIdx].toString().trim() : "";
    const rowStatus = data[i][estadoIdx] ? data[i][estadoIdx].toString().toLowerCase().trim() : "";
    const rowSector = data[i][sectorIdx] ? data[i][sectorIdx].toString().toLowerCase().trim() : "";

    if (rowDate === date && rowHora === slot && rowSector === userSector.toLowerCase().trim()) {
      if (rowStatus !== 'cancelada' && rowStatus !== 'expirada') {
        return { status: 'error', message: 'El cupo ya está reservado o bloqueado por otro usuario.' };
      }
    }
  }

  const lockId = "LOCK-" + date + "-" + slot.replace(/\s+/g, '') + "-" + username;
  const now = new Date();

  const newRow = [];
  const colCount = sheet.getLastColumn();
  for (let c = 0; c < colCount; c++) {
    newRow.push("");
  }

  newRow[headerMap["ID"] - 1] = lockId;
  newRow[headerMap["Fecha"] - 1] = date;
  newRow[headerMap["Hora"] - 1] = slot;
  newRow[headerMap["Estado"] - 1] = "Reservando";
  newRow[headerMap["Cliente"] - 1] = "Reservando...";
  newRow[headerMap["Vendedor"] - 1] = username;
  newRow[headerMap["Sector"] - 1] = userSector;
  newRow[headerMap["Observaciones"] - 1] = "LOCK_TS:" + now.toISOString();

  sheet.appendRow(newRow);

  return { status: 'success' };
}

function handleUnlockSlot(payload) {
  const { date, slot } = payload;
  if (!date || !slot) {
    return { status: 'error', message: 'Datos incompletos para desbloquear' };
  }

  const sheet = findOrCreateSheet("Ordenes");
  const data = sheet.getDataRange().getValues();
  const headerMap = getHeaderMap(sheet);

  const idIdx = headerMap["ID"] - 1;
  const estadoIdx = headerMap["Estado"] - 1;

  for (let i = data.length - 1; i >= 1; i--) {
    const rowId = data[i][idIdx] ? data[i][idIdx].toString() : "";
    const rowStatus = data[i][estadoIdx] ? data[i][estadoIdx].toString().toLowerCase().trim() : "";

    if (rowId.indexOf("LOCK-" + date + "-" + slot.replace(/\s+/g, '')) === 0 && rowStatus === "reservando") {
      sheet.deleteRow(i + 1);
    }
  }

  return { status: 'success' };
}

function checkAndExpireDrafts() {
  var sheet = findOrCreateSheet("Ordenes");
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;
  var headerMap = getHeaderMap(sheet);

  var idIdx = headerMap["ID"] - 1;
  var estadoIdx = headerMap["Estado"] - 1;
  var fechaIdx = headerMap["Fecha"] - 1;
  var horaIdx = headerMap["Hora"] - 1;
  var obsIdx = headerMap["Observaciones"] - 1;

  var histSheet = findOrCreateSheet("Historial_Estados", ["Fecha", "Hora", "OrdenID", "Estado Anterior", "Estado Nuevo", "Usuario", "Observaciones"]);

  var now = new Date();

  for (var i = data.length - 1; i >= 1; i--) {
    var status = (data[i][estadoIdx] || "").toString().toLowerCase().trim();
    if (status === "borrador") {
      var orderId = data[i][idIdx];
      var orderDate = data[i][fechaIdx];
      var orderTime = data[i][horaIdx];

      var startTime = parseDateTime(orderDate, orderTime);
      if (startTime) {
        var expTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 60 minutes past shift start
        if (now > expTime) {
          sheet.getRange(i + 1, estadoIdx + 1).setValue("Expirada");

          histSheet.appendRow([
            now.toISOString().split('T')[0],
            now.toTimeString().split(' ')[0].substring(0, 5),
            orderId,
            "Borrador",
            "Expirada",
            "Sistema",
            "Borrador expirado automáticamente después de 60 minutos"
          ]);
        }
      }
    } else if (status === "reservando") {
      var obsVal = (data[i][obsIdx] || "").toString();
      if (obsVal.indexOf("LOCK_TS:") === 0) {
        var tsStr = obsVal.substring(8);
        var lockTime = new Date(tsStr);
        if (isNaN(lockTime.getTime())) {
          lockTime = new Date();
        }
        var lockExp = new Date(lockTime.getTime() + 5 * 60 * 1000);
        if (now > lockExp) {
          sheet.deleteRow(i + 1);
        }
      }
    }
  }
}

function checkAndUpdateJobDelays() {
  var sheet = findOrCreateSheet("Ordenes");
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;
  var headerMap = getHeaderMap(sheet);

  var idIdx = headerMap["ID"] - 1;
  var estadoIdx = headerMap["Estado"] - 1;
  var tipoIdx = headerMap["Tipo Trabajo"] - 1;
  var obsIdx = headerMap["Observaciones"] - 1;

  var histSheet = findOrCreateSheet("Historial_Estados", ["Fecha", "Hora", "OrdenID", "Estado Anterior", "Estado Nuevo", "Usuario", "Observaciones"]);
  var histData = histSheet.getDataRange().getValues();

  var now = new Date();

  // Find orders currently in progress
  for (var i = 1; i < data.length; i++) {
    var orderId = data[i][idIdx];
    var status = (data[i][estadoIdx] || "").toString().toLowerCase().trim();
    var tipo = (data[i][tipoIdx] || "").toString();
    var obs = (data[i][obsIdx] || "").toString();

    // In progress states
    var inProgressStates = [
      "iniciando", "instalando", "haciendo pruebas", "trabajo iniciado",
      "en proceso", "pruebas con monitoreo", "esperando autorizacion",
      "esperando autorización", "pruebas finalizadas", "diagnostico realizado", "diagnóstico realizado"
    ];

    if (inProgressStates.indexOf(status) !== -1) {
      // Find start time: the earliest timestamp when order became in-progress
      var startTime = null;
      for (var j = 1; j < histData.length; j++) {
        if (histData[j][2].toString() == orderId.toString()) {
          var stateNew = histData[j][4].toString().toLowerCase().trim();
          if (inProgressStates.indexOf(stateNew) !== -1) {
            // Found a start transition
            var rowDate = histData[j][0];
            var rowTime = histData[j][1];
            startTime = parseDateTime(rowDate, rowTime);
            break;
          }
        }
      }

      if (!startTime) {
        // Fallback: use order scheduled date and time
        var orderDate = data[i][headerMap["Fecha"] - 1];
        var orderTime = data[i][headerMap["Hora"] - 1];
        startTime = parseDateTime(orderDate, orderTime);
      }

      if (startTime) {
        var elapsedMs = now.getTime() - startTime.getTime();
        var elapsedMins = elapsedMs / (1000 * 60);

        // Calculate estimated duration
        var estDuration = calculateEstimatedDuration(tipo, obs);

        // Wait, if it's "Revisión por falla" and NOT yet diagnosed, it has no fixed duration (diagnóstico indeterminado)
        var tLower = tipo.toLowerCase().trim();
        var isRevision = tLower.indexOf('revision por falla') !== -1 || tLower.indexOf('revisión por falla') !== -1;
        var sLower = obs.toLowerCase().trim();
        var hasIntervention = sLower.indexOf('cambio de unidad') !== -1 || sLower.indexOf('cambio de arnes') !== -1 || sLower.indexOf('cambio de arnés') !== -1 || sLower.indexOf('reparacion de conexion') !== -1 || sLower.indexOf('reparación de conexión') !== -1 || sLower.indexOf('conexion') !== -1 || sLower.indexOf('conexión') !== -1;

        if (isRevision && !hasIntervention) {
          // Indeterminate duration, skip delay check
          continue;
        }

        if (elapsedMins > estDuration && status !== "trabajo retrasado") {
          // Exceeded! Change status to "Trabajo retrasado"
          sheet.getRange(i + 1, estadoIdx + 1).setValue("Trabajo retrasado");

          // Log to history
          histSheet.appendRow([
            now.toISOString().split('T')[0],
            now.toTimeString().split(' ')[0].substring(0, 5),
            orderId,
            data[i][estadoIdx],
            "Trabajo retrasado",
            "Sistema",
            "Tiempo planificado excedido (" + Math.round(elapsedMins) + " mins transcurridos, est: " + estDuration + " mins)"
          ]);

          // Generate notification
          var notifSheet = findOrCreateSheet("Notificaciones", ["Fecha", "Destinatario", "Tipo", "Mensaje", "Estado"]);
          notifSheet.appendRow([
            now.toISOString().split('T')[0],
            data[i][headerMap["Técnico Asignado"] - 1] || "Tecnico",
            "Retraso",
            "El tiempo planificado para la orden #" + orderId + " ha sido excedido.",
            "Pendiente"
          ]);
        }
      }
    }
  }
}

function parseDateTime(dVal, tVal) {
  var dStr = "";
  if (dVal instanceof Date) {
    dStr = dVal.toISOString().split('T')[0];
  } else {
    dStr = dVal.toString().substring(0, 10);
  }

  var tStr = "08:00";
  if (tVal) {
    var match = tVal.toString().match(/(\d{2}):(\d{2})/);
    if (match) {
      tStr = match[1] + ":" + match[2];
    }
  }
  return new Date(dStr + "T" + tStr + ":00");
}

function handleReassignNextJob(payload) {
  var currentOrderId = payload.currentOrderId;
  var force = payload.force;

  var sheet = findOrCreateSheet("Ordenes");
  var data = sheet.getDataRange().getValues();
  var headerMap = getHeaderMap(sheet);

  var idIdx = headerMap["ID"] - 1;
  var techIdx = headerMap["Técnico Asignado"] - 1;
  var statusIdx = headerMap["Estado"] - 1;
  var dateIdx = headerMap["Fecha"] - 1;
  var hourIdx = headerMap["Hora"] - 1;
  var sectorIdx = headerMap["Sector"] - 1;

  // Find current order
  var currentOrder = null;
  for (var i = 1; i < data.length; i++) {
    if (data[i][idIdx].toString() == currentOrderId.toString()) {
      currentOrder = {
        id: data[i][idIdx],
        tecnico: data[i][techIdx],
        fecha: data[i][dateIdx],
        hora: data[i][hourIdx],
        sector: data[i][sectorIdx]
      };
      break;
    }
  }

  if (!currentOrder) {
    return { status: 'error', message: 'No se encontró la orden actual' };
  }

  // Find next order assigned to the SAME technician on the SAME day
  var nextOrder = null;
  for (var i = 1; i < data.length; i++) {
    if (data[i][techIdx] == currentOrder.tecnico && data[i][idIdx].toString() !== currentOrderId.toString()) {
      var oDateStr = data[i][dateIdx] instanceof Date ? data[i][dateIdx].toISOString().split('T')[0] : data[i][dateIdx].toString().substring(0, 10);
      var currDateStr = currentOrder.fecha instanceof Date ? currentOrder.fecha.toISOString().split('T')[0] : currentOrder.fecha.toString().substring(0, 10);
      if (oDateStr == currDateStr) {
        var nextHour = data[i][hourIdx].toString();
        if (nextHour > currentOrder.hora.toString()) {
          nextOrder = {
            id: data[i][idIdx],
            row: i + 1,
            tecnico: data[i][techIdx],
            fecha: oDateStr,
            hora: nextHour,
            sector: data[i][sectorIdx]
          };
          break;
        }
      }
    }
  }

  if (!nextOrder) {
    return { status: 'no_next_job', message: 'No tienes más asignaciones posteriores programadas para hoy.' };
  }

  // Find other available technicians for that next slot
  var techSheet = findOrCreateSheet("Tecnicos");
  var techData = techSheet.getDataRange().getValues();
  var otherTechs = [];
  for (var k = 1; k < techData.length; k++) {
    var tName = techData[k][1];
    if (tName !== currentOrder.tecnico && techData[k][5] == currentOrder.sector) {
      var isFree = true;
      for (var i = 1; i < data.length; i++) {
        if (data[i][techIdx] == tName) {
          var oDateStr = data[i][dateIdx] instanceof Date ? data[i][dateIdx].toISOString().split('T')[0] : data[i][dateIdx].toString().substring(0, 10);
          if (oDateStr == nextOrder.fecha && data[i][hourIdx].toString() == nextOrder.hora) {
            var sLower = (data[i][statusIdx] || "").toString().toLowerCase().trim();
            if (["pendiente", "asignada", "en camino", "llego", "vehiculo recibido", "iniciando", "instalando", "haciendo pruebas", "instalacion completada"].indexOf(sLower) !== -1) {
              isFree = false;
              break;
            }
          }
        }
      }
      if (isFree) {
        otherTechs.push(tName);
      }
    }
  }

  if (otherTechs.length === 0) {
    return {
      status: 'no_tech_available',
      nextOrderId: nextOrder.id,
      message: 'No existe otro técnico disponible para reasignar la orden posterior #' + nextOrder.id + '. Por favor continúa con la planificación vigente.'
    };
  }

  if (force) {
    var selectedTech = otherTechs[0];
    sheet.getRange(nextOrder.row, techIdx + 1).setValue(selectedTech);

    // Log to history
    try {
      var histSheet = findOrCreateSheet("Historial_Estados", ["Fecha", "Hora", "OrdenID", "Estado Anterior", "Estado Nuevo", "Usuario", "Observaciones"]);
      var now = new Date();
      histSheet.appendRow([
        now.toISOString().split('T')[0],
        now.toTimeString().split(' ')[0].substring(0, 5),
        nextOrder.id,
        "Asignada",
        "Asignada",
        "Sistema",
        "Reasignado automáticamente a " + selectedTech + " debido a retraso del técnico anterior (" + currentOrder.tecnico + ")"
      ]);
    } catch (e) {
      console.error("Error writing reassign transition:", e);
    }

    return {
      status: 'success',
      nextOrderId: nextOrder.id,
      tecnico: selectedTech,
      message: 'La siguiente orden #' + nextOrder.id + ' ha sido reasignada exitosamente al técnico ' + selectedTech + '.'
    };
  }

  return {
    status: 'tech_available',
    nextOrderId: nextOrder.id,
    otherTechs: otherTechs,
    message: 'Tienes una asignación posterior (Orden #' + nextOrder.id + '). ¿Podrás cumplir con ella dentro del horario previsto?'
  };
}

function handleLogPerformance(orderId, status) {
  try {
    const oSheet = findOrCreateSheet("Ordenes");
    const oData = oSheet.getDataRange().getValues();
    const oHeader = getHeaderMap(oSheet);

    let oRow = -1;
    for (let i = 1; i < oData.length; i++) {
      if (oData[i][oHeader["ID"] - 1].toString() === orderId.toString()) {
        oRow = i + 1;
        break;
      }
    }
    if (oRow === -1) return;

    const brand = oData[oRow - 1][oHeader["Marca"] - 1] || "";
    const model = oData[oRow - 1][oHeader["Modelo"] - 1] || "";
    const year = parseInt(oData[oRow - 1][oHeader["Año"] - 1]) || new Date().getFullYear();
    const range = brand + " " + model + " " + (year - 1) + " - " + (year + 1);

    const tech = oData[oRow - 1][oHeader["Técnico Asignado"] - 1] || "Sin asignar";
    const fecha = oData[oRow - 1][oHeader["Fecha"] - 1] || "";
    const slot = oData[oRow - 1][oHeader["Hora"] - 1] || "";
    const tipoTrabajo = oData[oRow - 1][oHeader["Tipo Trabajo"] - 1] || "";
    const direccion = oData[oRow - 1][oHeader["Dirección"] - 1] || "";
    const servicio = oData[oRow - 1][oHeader["Servicio"] - 1] || "";

    const locType = (!direccion || direccion.toLowerCase().indexOf("oficina") !== -1 || direccion.toLowerCase().indexOf("local") !== -1) ? "Local" : "Remoto";
    const servType = servicio.toLowerCase().indexOf("tracklink") !== -1 ? "Tracklink" : "Controlcar";

    const otSheet = findOrCreateSheet("Ordenes_Trabajo");
    const otData = otSheet.getDataRange().getValues();
    const otHeader = getHeaderMap(otSheet);

    let receptionStr = "";
    let startWorkStr = "";
    for (let j = 1; j < otData.length; j++) {
      if (otData[j][otHeader["OI_ID"] - 1].toString() === orderId.toString()) {
        receptionStr = otData[j][otHeader["FechaHora_Recepcion"] - 1] || "";
        startWorkStr = otData[j][otHeader["FechaHora_Inicio"] - 1] || "";
        break;
      }
    }

    const now = new Date();
    let durationMins = 90;
    if (startWorkStr) {
      const startTime = new Date(startWorkStr);
      if (!isNaN(startTime.getTime())) {
        durationMins = Math.round((now - startTime) / (60 * 1000));
      }
    }

    const estDuration = calculateEstimatedDuration(tipoTrabajo, "");
    const retraso = durationMins > estDuration ? "Sí" : "No";

    let puntualidad = "Puntual";
    if (receptionStr && slot) {
      const scheduledStart = parseDateTime(fecha, slot);
      const receptionTime = new Date(receptionStr);
      if (scheduledStart && !isNaN(receptionTime.getTime())) {
        const diffMins = (receptionTime - scheduledStart) / (60 * 1000);
        if (diffMins > 15) {
          puntualidad = "Tarde";
        }
      }
    }

    const logSheet = findOrCreateSheet("Log_Rendimiento", [
      "ID", "Técnico", "Fecha", "Hora Programada", "Hora Recepción", "Hora Fin",
      "Duración Minutos", "Tipo Trabajo", "Vehículo Rango", "Ubicación Tipo", "Servicio Tipo", "Retraso", "Puntualidad"
    ]);

    logSheet.appendRow([
      orderId,
      tech,
      fecha,
      slot,
      receptionStr || now.toISOString(),
      now.toISOString(),
      durationMins,
      tipoTrabajo,
      range,
      locType,
      servType,
      retraso,
      puntualidad
    ]);

  } catch (e) {
    console.error("Error logging performance:", e);
  }
}

function handleGetTechnicianMetrics() {
  const sheet = findOrCreateSheet("Log_Rendimiento");
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { status: 'success', metrics: [] };

  const headerMap = getHeaderMap(sheet);
  const techIdx = headerMap["Técnico"] - 1;
  const durIdx = headerMap["Duración Minutos"] - 1;
  const typeIdx = headerMap["Tipo Trabajo"] - 1;
  const vehIdx = headerMap["Vehículo Rango"] - 1;
  const locIdx = headerMap["Ubicación Tipo"] - 1;
  const delayIdx = headerMap["Retraso"] - 1;
  const puntIdx = headerMap["Puntualidad"] - 1;

  const techMetrics = {};

  for (let i = 1; i < data.length; i++) {
    const tech = data[i][techIdx] || "Sin asignar";
    const duration = parseFloat(data[i][durIdx]) || 0;
    const type = data[i][typeIdx] || "";
    const vehicle = data[i][vehIdx] || "";
    const loc = data[i][locIdx] || "Local";
    const delay = data[i][delayIdx] || "No";
    const punt = data[i][puntIdx] || "Puntual";

    if (!techMetrics[tech]) {
      techMetrics[tech] = {
        name: tech,
        totalJobs: 0,
        totalDuration: 0,
        delaysCount: 0,
        punctualCount: 0,
        byType: {},
        byVehicle: {},
        byLoc: { "Local": { total: 0, count: 0 }, "Remoto": { total: 0, count: 0 } }
      };
    }

    const m = techMetrics[tech];
    m.totalJobs++;
    m.totalDuration += duration;
    if (delay === "Sí") m.delaysCount++;
    if (punt === "Puntual") m.punctualCount++;

    if (!m.byType[type]) m.byType[type] = { total: 0, count: 0 };
    m.byType[type].total += duration;
    m.byType[type].count++;

    if (!m.byVehicle[vehicle]) m.byVehicle[vehicle] = { total: 0, count: 0 };
    m.byVehicle[vehicle].total += duration;
    m.byVehicle[vehicle].count++;

    if (!m.byLoc[loc]) m.byLoc[loc] = { total: 0, count: 0 };
    m.byLoc[loc].total += duration;
    m.byLoc[loc].count++;
  }

  const metricsList = Object.values(techMetrics).map(m => {
    const avgByType = {};
    Object.entries(m.byType).forEach(([k, v]) => {
      avgByType[k] = Math.round(v.total / v.count);
    });

    const avgByVehicle = {};
    Object.entries(m.byVehicle).forEach(([k, v]) => {
      avgByVehicle[k] = Math.round(v.total / v.count);
    });

    let bestVehicle = "N/A", bestTime = 99999;
    let worstVehicle = "N/A", worstTime = 0;
    Object.entries(avgByVehicle).forEach(([k, v]) => {
      if (v < bestTime) {
        bestTime = v;
        bestVehicle = k;
      }
      if (v > worstTime) {
        worstTime = v;
        worstVehicle = k;
      }
    });

    return {
      technician: m.name,
      totalJobs: m.totalJobs,
      avgDuration: Math.round(m.totalDuration / m.totalJobs),
      delaysCount: m.delaysCount,
      punctualityRate: Math.round((m.punctualCount / m.totalJobs) * 100),
      avgByType: avgByType,
      bestVehicle: bestVehicle + " (" + bestTime + " min)",
      worstVehicle: worstVehicle + " (" + worstTime + " min)",
      avgByLoc: {
        Local: m.byLoc["Local"].count > 0 ? Math.round(m.byLoc["Local"].total / m.byLoc["Local"].count) : 0,
        Remoto: m.byLoc["Remoto"].count > 0 ? Math.round(m.byLoc["Remoto"].total / m.byLoc["Remoto"].count) : 0
      }
    };
  });

  return { status: 'success', metrics: metricsList };
}

function handleUpdateOrderTechnician(payload) {
  const { orderId, technician } = payload;
  if (!orderId || !technician) return { status: 'error', message: 'Datos incompletos' };

  const sheet = findOrCreateSheet("Ordenes");
  const data = sheet.getDataRange().getValues();
  const headerMap = getHeaderMap(sheet);

  const idIdx = headerMap["ID"] - 1;
  const techIdx = headerMap["Técnico Asignado"];

  for (let i = 1; i < data.length; i++) {
    if (data[i][idIdx].toString() === orderId.toString()) {
      sheet.getRange(i + 1, techIdx).setValue(technician);
      return { status: 'success', message: 'Técnico asignado exitosamente.' };
    }
  }
  return { status: 'error', message: 'Orden no encontrada.' };
}

/**
 * Clasifica automáticamente las instalaciones fuera de la oficina en tres categorías.
 */
function classifyTravel(direccion, division) {
    if (!direccion) return "Trabajo Local";
    const dirNormalized = direccion.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const motoCities = ["villanueva", "choloma", "cofradia", "naco", "el progreso", "progreso"];
    const largoCities = ["tela", "puerto cortes", "santa rosa de copan", "copan", "gracias", "ocotepeque", "la entrada"];

    for (let city of largoCities) {
        if (dirNormalized.includes(city)) {
            return "Viaje largo";
        }
    }
    for (let city of motoCities) {
        if (dirNormalized.includes(city)) {
            return "Viaje en moto";
        }
    }
    return "Trabajo Local";
}

/**
 * Determina el siguiente técnico elegible en base al sistema de rotación equitativa.
 */
function getNextRotationTechnician(tipoViaje, availableTechs, sector) {
  const sheet = findOrCreateSheet("Historial_Viajes_Especiales", ["ID", "Fecha", "Técnico", "Tipo Viaje", "Destino", "OrdenID"]);
  const data = sheet.getDataRange().getValues();
  const headerMap = getHeaderMap(sheet);

  const techIdx = headerMap["Técnico"] - 1;
  const typeIdx = headerMap["Tipo Viaje"] - 1;
  const dateIdx = headerMap["Fecha"] - 1;

  const counts = {};
  const lastAssignedDate = {};
  availableTechs.forEach(t => {
    counts[t] = 0;
    lastAssignedDate[t] = 0;
  });

  for (let i = 1; i < data.length; i++) {
    const tech = data[i][techIdx];
    const type = data[i][typeIdx];
    if (tech && type === tipoViaje && availableTechs.includes(tech)) {
      counts[tech]++;
      const dateVal = new Date(data[i][dateIdx]).getTime() || 0;
      if (dateVal > lastAssignedDate[tech]) {
        lastAssignedDate[tech] = dateVal;
      }
    }
  }

  let bestTech = availableTechs[0];
  let minCount = 999999;
  let oldestDate = Infinity;

  availableTechs.forEach(t => {
    if (counts[t] < minCount) {
      minCount = counts[t];
      oldestDate = lastAssignedDate[t];
      bestTech = t;
    } else if (counts[t] === minCount) {
      if (lastAssignedDate[t] < oldestDate) {
        oldestDate = lastAssignedDate[t];
        bestTech = t;
      }
    }
  });

  return {
    nextEligible: bestTech,
    counts: counts,
    distribution: counts
  };
}

/**
 * Retorna el historial de asignaciones de viajes especiales por separado.
 */
function handleGetSpecialTravelHistory(payload) {
  const { division } = payload;
  const targetDivision = division || "San Pedro Sula";

  const techSheet = findOrCreateSheet("Tecnicos");
  const techData = techSheet.getDataRange().getValues();
  const techHeaderMap = getHeaderMap(techSheet);
  const nameIdx = techHeaderMap["Nombre"] - 1;
  const sectorIdx = techHeaderMap["Sector"] - 1;

  const techsInDivision = [];
  for (let i = 1; i < techData.length; i++) {
    const s = techData[i][sectorIdx] || "";
    if (s.toLowerCase().trim() === targetDivision.toLowerCase().trim()) {
      techsInDivision.push(techData[i][nameIdx].toString().trim());
    }
  }

  const motoRot = getNextRotationTechnician("Viaje en moto", techsInDivision, targetDivision);
  const largoRot = getNextRotationTechnician("Viaje largo", techsInDivision, targetDivision);

  const specialSheet = findOrCreateSheet("Historial_Viajes_Especiales");
  const specialData = specialSheet.getDataRange().getValues();
  const spHeaderMap = getHeaderMap(specialSheet);

  let lastMotoTech = "Ninguno";
  let lastLargoTech = "Ninguno";

  for (let i = specialData.length - 1; i >= 1; i--) {
    const t = specialData[i][spHeaderMap["Técnico"] - 1];
    const type = specialData[i][spHeaderMap["Tipo Viaje"] - 1];
    if (techsInDivision.includes(t)) {
      if (type === "Viaje en moto" && lastMotoTech === "Ninguno") {
        lastMotoTech = t;
      }
      if (type === "Viaje largo" && lastLargoTech === "Ninguno") {
        lastLargoTech = t;
      }
    }
  }

  return {
    status: "success",
    moto: {
      lastAssigned: lastMotoTech,
      nextEligible: motoRot.nextEligible,
      counts: motoRot.counts,
      distribution: motoRot.distribution
    },
    largo: {
      lastAssigned: lastLargoTech,
      nextEligible: largoRot.nextEligible,
      counts: largoRot.counts,
      distribution: largoRot.distribution
    }
  };
}
