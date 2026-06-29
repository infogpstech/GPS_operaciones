// ============================================================================
// GOS-CORE SERVICE (GPS Operations Suite)
// ============================================================================
// Version: 1.1.0

const SPREADSHEET_ID = "1IiXxydi02QnVUVwWsEnC5lpB730mASI-6rTsmuI4XhE";

/**
 * Función FindOrCreateSheet: Busca una hoja por nombre o la crea si no existe.
 * v1.1.0: Ahora inicializa encabezados si la hoja es nueva.
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
    }
  }
  return sheet;
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
 * Actualiza el estado de la orden
 */
function handleUpdateOrderStatus(payload) {
  const { orderId, status } = payload;
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
    sheet.getRange(orderRow, estadoIdx).setValue(status);
    return { status: 'success' };
  }

  return { status: 'error', message: 'Orden no encontrada' };
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
    "Técnico Asignado", "Estado", "Observaciones"
  ];
  const sheet = findOrCreateSheet("Ordenes", headers);
  const nextId = getNextId("OT");

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
      default: return "";
    }
  });

  sheet.appendRow(orderData);
  return { status: 'success', message: 'Orden creada exitosamente', orderId: nextId };
}

function handleGetOrders() {
  const sheet = findOrCreateSheet("Ordenes");
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { status: 'success', data: [] };
  const headers = data.shift();

  const orders = data.map(row => {
    let obj = {};
    headers.forEach((header, index) => {
      obj[header.toLowerCase().replace(/\s+/g, '')] = row[index];
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
 * Motor de Asignación Automática
 */
function handleAutoAssignTechnical(payload) {
  const { orderId } = payload;
  const techSheet = findOrCreateSheet("Tecnicos", ["ID", "Nombre", "Lat", "Lng", "UltimaAct"]);
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

  const nextIndex = (lastIndex + 1) % (tecnicos.length - 1);
  const tecnicoAsignado = tecnicos[nextIndex + 1][techNameIdx];

  const orderSheet = findOrCreateSheet("Ordenes");
  const ordersData = orderSheet.getDataRange().getValues();
  const orderHeaderMap = getHeaderMap(orderSheet);

  const orderIdIdx = orderHeaderMap["ID"] - 1;
  const orderTechIdx = orderHeaderMap["Técnico Asignado"];
  const orderEstadoIdx = orderHeaderMap["Estado"];

  let jobsCount = 0;
  ordersData.forEach(row => {
    if (row[orderHeaderMap["Técnico Asignado"] - 1] === tecnicoAsignado && row[orderEstadoIdx - 1] === "Asignada") jobsCount++;
  });

  configSheet.getRange(lastIndexRow, configValorIdx + 1).setValue(nextIndex);

  let orderRow = -1;
  for(let i=1; i<ordersData.length; i++) {
    if(ordersData[i][orderIdIdx].toString() == orderId.toString()) {
      orderRow = i + 1;
      break;
    }
  }

  if (orderRow !== -1) {
    orderSheet.getRange(orderRow, orderTechIdx).setValue(tecnicoAsignado);
    orderSheet.getRange(orderRow, orderEstadoIdx).setValue("Asignada");
  }

  return {
    status: 'success',
    tecnico: tecnicoAsignado,
    requiresConfirmation: jobsCount > 0
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
 * Integración con Drive
 */
function handleGetOrCreateOrderFolder(payload) {
  const { orderId, cliente } = payload;
  const configSheet = findOrCreateSheet("Configuracion");
  const configData = configSheet.getDataRange().getValues();
  const headerMap = getHeaderMap(configSheet);

  let rootFolderId = "1-8QqhS-wtEFFwyBG8CmnEOp5i8rxSM-2";
  for(let i=1; i<configData.length; i++) {
    if(configData[i][headerMap["Clave"]-1] === "RootFolderId") {
      rootFolderId = configData[i][headerMap["Valor"]-1];
      break;
    }
  }

  const rootFolder = DriveApp.getFolderById(rootFolderId);
  const folderName = `Orden_${orderId}_${cliente}`;
  const folders = rootFolder.getFoldersByName(folderName);

  let folder = folders.hasNext() ? folders.next() : rootFolder.createFolder(folderName);
  return { status: 'success', folderUrl: folder.getUrl(), folderId: folder.getId() };
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
  const sheet = findOrCreateSheet("Clientes", ["Nombre", "Teléfono", "Dirección", "Fecha Registro"]);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { status: 'success', data: [] };
  const headers = data.shift();
  const clients = data.map(row => {
    let obj = {};
    headers.forEach((header, index) => {
      obj[header.toLowerCase().replace(/\s+/g, '')] = row[index];
    });
    return obj;
  });
  return { status: 'success', data: clients };
}

function handleCreateClient(payload) {
  const sheet = findOrCreateSheet("Clientes");
  sheet.appendRow([payload.nombre, payload.telefono, payload.direccion, new Date().toISOString()]);
  return { status: 'success' };
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
      obj[header.toLowerCase().replace(/\s+/g, '')] = row[index];
    });
    return obj;
  });
  return { status: 'success', data: techs };
}

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    let response;

    switch (request.action) {
      case 'getTechnicalConsultation': response = handleGetTechnicalConsultation(request.payload); break;
      case 'createOrder': response = handleCreateOrder(request.payload); break;
      case 'getOrders': response = handleGetOrders(); break;
      case 'getSystemConfig': response = handleGetSystemConfig(); break;
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
      default: response = { status: 'error', message: 'Acción no soportada' };
    }

    return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.TEXT);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.message })).setMimeType(ContentService.MimeType.TEXT);
  }
}
