// ============================================================================
// GOS-CORE SERVICE (GPS Operations Suite)
// ============================================================================
// Version: 1.0.2

const SPREADSHEET_ID = "1IiXxydi02QnVUVwWsEnC5lpB730mASI-6rTsmuI4XhE";

/**
 * Función FindOrCreateSheet: Busca una hoja por nombre o la crea si no existe.
 */
function findOrCreateSheet(sheetName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

/**
 * Actualiza el estado de la orden
 */
function handleUpdateOrderStatus(payload) {
  const { orderId, status } = payload;
  const sheet = findOrCreateSheet("Ordenes");
  const data = sheet.getDataRange().getValues();

  let orderRow = -1;
  for(let i=1; i<data.length; i++) {
    if(data[i][0].toString() == orderId.toString()) {
      orderRow = i + 1;
      break;
    }
  }

  if (orderRow !== -1) {
    sheet.getRange(orderRow, 21).setValue(status); // Col U: Estado
    return { status: 'success' };
  }

  return { status: 'error', message: 'Orden no encontrada' };
}

/**
 * Procesa la consulta técnica simplificada basada en GPSpedia.
 * Reglas: Motos no tienen apertura/pánico. Alta gama "No se recomienda" -> Todo No.
 */
function handleGetTechnicalConsultation(payload) {
  const { categoria, marca, modelo, detallesTecnicos } = payload;

  let response = {
    apagadoRemoto: "No",
    apertura: "No",
    botonPanico: "No",
    microfono: "No"
  };

  // Regla Alta Gama
  const isAltaGamaDesc = (detallesTecnicos || "").toLowerCase().includes("no se recomienda");
  if (isAltaGamaDesc) {
    return response;
  }

  // Lógica base (Simplificada para MVP, debería consultar microservicio CATALOG en producción real)
  // Aquí simulamos que si no es alta gama, habilitamos lo básico.
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
  const sheet = findOrCreateSheet("Ordenes");
  const lastRow = sheet.getLastRow();
  const nextId = lastRow > 0 ? lastRow : 1; // Simplificación para ID

  const orderData = [
    nextId,
    payload.fecha || new Date().toISOString().split('T')[0],
    payload.hora || "",
    payload.cliente || "",
    payload.contacto || "",
    payload.telefono || "",
    payload.direccion || "",
    payload.coordenadas || "",
    payload.linkMaps || "",
    payload.marca || "",
    payload.modelo || "",
    payload.vin || "",
    payload.motor || "",
    payload.anio || "",
    payload.placa || "",
    payload.servicio || "",
    payload.inventario || "",
    payload.tipoTrabajo || "",
    payload.prioridad || "Normal",
    payload.tecnicoAsignado || "",
    payload.estado || "Pendiente",
    payload.observaciones || ""
  ];

  sheet.appendRow(orderData);
  return { status: 'success', message: 'Orden creada exitosamente', orderId: nextId };
}

function handleGetOrders() {
  const sheet = findOrCreateSheet("Ordenes");
  const data = sheet.getDataRange().getValues();
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
 * Gestión de Agenda y Técnicos
 */
function handleGetAgendaConfig() {
  const sheet = findOrCreateSheet("Configuracion");
  const data = sheet.getDataRange().getValues();

  let config = {
    turnos: ["08:00", "10:00", "13:00", "15:00"],
    cantidadTecnicos: 4
  };

  if (data.length > 1) {
    data.forEach(row => {
      if (row[0] === "Turnos") {
        config.turnos = row[1].toString().split(',').map(t => t.trim());
      } else if (row[0] === "CantidadTecnicos") {
        config.cantidadTecnicos = parseInt(row[1]) || 4;
      }
    });
  } else {
    // Inicializar hoja con valores por defecto
    sheet.appendRow(["Turnos", "08:00, 10:00, 13:00, 15:00"]);
    sheet.appendRow(["CantidadTecnicos", 4]);
  }

  return { status: 'success', data: config };
}

/**
 * Motor de Asignación Automática (Basado en Rotación)
 */
function handleAutoAssignTechnical(payload) {
  const { orderId, coordinates } = payload;
  const sheet = findOrCreateSheet("Tecnicos");
  const tecnicos = sheet.getDataRange().getValues();
  tecnicos.shift(); // Quitar cabecera

  if (tecnicos.length === 0) {
    return { status: 'error', message: 'No hay técnicos registrados para asignación' };
  }

  const configSheet = findOrCreateSheet("Configuracion");
  let lastIndex = 0;
  const configData = configSheet.getDataRange().getValues();

  // Buscar o crear puntero de rotación
  let lastIndexRow = -1;
  for(let i=0; i<configData.length; i++) {
    if(configData[i][0] === "LastTechnicianIndex") {
      lastIndex = parseInt(configData[i][1]) || 0;
      lastIndexRow = i + 1;
      break;
    }
  }

  if (lastIndexRow === -1) {
    configSheet.appendRow(["LastTechnicianIndex", 0]);
    lastIndexRow = configSheet.getLastRow();
  }

  // Rotación simple: Siguiente técnico
  const nextIndex = (lastIndex + 1) % tecnicos.length;
  const tecnicoAsignado = tecnicos[nextIndex][1]; // Columna 2: Nombre

  // Verificar si es segundo trabajo o si el técnico está cerca (Lógica avanzada)
  const currentOrdersSheet = findOrCreateSheet("Ordenes");
  const ordersData = currentOrdersSheet.getDataRange().getValues();

  let jobsCount = 0;
  ordersData.forEach(row => {
    if (row[19] === tecnicoAsignado && row[20] === "Asignada") jobsCount++;
  });

  const requiresConfirmation = jobsCount > 0; // Si ya tiene uno, el segundo requiere confirmación

  // Actualizar puntero
  configSheet.getRange(lastIndexRow, 2).setValue(nextIndex);

  // Actualizar la orden
  let orderRow = -1;
  for(let i=1; i<ordersData.length; i++) {
    if(ordersData[i][0].toString() == orderId.toString()) {
      orderRow = i + 1;
      break;
    }
  }

  if (orderRow !== -1) {
    currentOrdersSheet.getRange(orderRow, 20).setValue(tecnicoAsignado); // Col T: Tecnico Asignado
    currentOrdersSheet.getRange(orderRow, 21).setValue("Asignada");      // Col U: Estado
  }

  return {
    status: 'success',
    message: requiresConfirmation ? 'Asignación pendiente de confirmación' : 'Técnico asignado automáticamente',
    tecnico: tecnicoAsignado,
    requiresConfirmation: requiresConfirmation
  };
}

/**
 * Actualiza la ubicación del técnico
 */
function handleUpdateTechnicianLocation(payload) {
  const { tecnicoId, lat, lng } = payload;
  const sheet = findOrCreateSheet("Tecnicos");
  const data = sheet.getDataRange().getValues();

  let tecnicoRow = -1;
  for(let i=1; i<data.length; i++) {
    if(data[i][0].toString() == tecnicoId.toString()) {
      tecnicoRow = i + 1;
      break;
    }
  }

  if (tecnicoRow !== -1) {
    sheet.getRange(tecnicoRow, 3).setValue(lat); // Col C: Lat
    sheet.getRange(tecnicoRow, 4).setValue(lng); // Col D: Lng
    sheet.getRange(tecnicoRow, 5).setValue(new Date().toISOString()); // Col E: Última Actualización
    return { status: 'success' };
  }

  return { status: 'error', message: 'Técnico no encontrado' };
}

/**
 * Estadísticas y Aprendizaje
 */
function handleUpdateStatistics(payload) {
  const { marca, modelo, tecnico, tiempoMinutos, tipoTrabajo, zona, servicio } = payload;
  const sheet = findOrCreateSheet("Estadisticas");
  const data = sheet.getDataRange().getValues();

  // Buscar entrada existente para actualizar promedio
  let entryRow = -1;
  const key = `${marca}|${modelo}|${tecnico}|${tipoTrabajo}|${zona || ''}|${servicio || ''}`;

  for(let i=1; i<data.length; i++) {
    const sheetKey = `${data[i][0]}|${data[i][1]}|${data[i][2]}|${data[i][3]}|${data[i][7] || ''}|${data[i][8] || ''}`;
    if(sheetKey === key) {
      entryRow = i + 1;
      break;
    }
  }

  if (entryRow !== -1) {
    const currentCount = parseInt(data[entryRow-1][4]) || 0;
    const currentAvg = parseFloat(data[entryRow-1][5]) || 0;
    const newCount = currentCount + 1;
    const newAvg = ((currentAvg * currentCount) + tiempoMinutos) / newCount;

    sheet.getRange(entryRow, 5).setValue(newCount); // Col E: Cantidad
    sheet.getRange(entryRow, 6).setValue(newAvg);   // Col F: Promedio
    sheet.getRange(entryRow, 7).setValue(new Date().toISOString()); // Col G: Última actualización
  } else {
    // Nueva entrada: Marca, Modelo, Tecnico, TipoTrabajo, Cantidad, Promedio, UltimaAct, Zona, Servicio
    sheet.appendRow([marca, modelo, tecnico, tipoTrabajo, 1, tiempoMinutos, new Date().toISOString(), zona || "", servicio || ""]);
  }

  return { status: 'success' };
}

/**
 * Integración con Drive
 */
function handleGetOrCreateOrderFolder(payload) {
  const { orderId, cliente } = payload;
  const rootFolderId = "1-8QqhS-wtEFFwyBG8CmnEOp5i8rxSM-2"; // Folder GOS en Drive
  const rootFolder = DriveApp.getFolderById(rootFolderId);

  const folderName = `Orden_${orderId}_${cliente}`;
  const folders = rootFolder.getFoldersByName(folderName);

  let folder;
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = rootFolder.createFolder(folderName);
  }

  return { status: 'success', folderUrl: folder.getUrl(), folderId: folder.getId() };
}

/**
 * Archivador de registros
 */
function handleArchiveOldOrders() {
  const sheet = findOrCreateSheet("Ordenes");
  const archiveSheet = findOrCreateSheet("Ordenes_Archivo");
  const data = sheet.getDataRange().getValues();

  // Archivar órdenes finalizadas hace más de 30 días
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - 30);

  const toArchive = data.filter((row, index) => {
    if (index === 0) return false;
    const status = row[20];
    const date = new Date(row[1]);
    return status === "Finalizada" && date < threshold;
  });

  toArchive.forEach(row => archiveSheet.appendRow(row));

  // Eliminación segura de las filas archivadas (de abajo hacia arriba)
  for (let i = data.length - 1; i >= 1; i--) {
    const status = data[i][20];
    const date = new Date(data[i][1]);
    if (status === "Finalizada" && date < threshold) {
      sheet.deleteRow(i + 1);
    }
  }

  return { status: 'success', archivedCount: toArchive.length };
}

/**
 * Generador de Reportes
 */
function handleGenerateReport(payload) {
  const { type, filter } = payload;
  const sheet = findOrCreateSheet("Ordenes");
  const data = sheet.getDataRange().getValues();

  // Lógica de filtrado por diario/semanal/mensual
  // Para MVP: Devolver datos crudos para que el frontend procese
  return { status: 'success', reportData: data };
}

/**
 * Sistema de Notificaciones
 */
function handleSendNotification(payload) {
  const { recipient, message, type } = payload;
  const sheet = findOrCreateSheet("Notificaciones");
  sheet.appendRow([new Date().toISOString(), recipient, type, message, "Pendiente"]);

  return { status: 'success' };
}

/**
 * Gestión de Clientes
 */
function handleGetClients() {
  const sheet = findOrCreateSheet("Clientes");
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

/**
 * Función doGet: Verifica el despliegue del microservicio.
 */
function doGet(e) {
  return ContentService.createTextOutput("GOS-CORE Service: Desplegado correctamente (v1.0.1)")
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Gestión de Técnicos
 */
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
      case 'getTechnicalConsultation':
        response = handleGetTechnicalConsultation(request.payload);
        break;
      case 'createOrder':
        response = handleCreateOrder(request.payload);
        break;
      case 'getOrders':
        response = handleGetOrders();
        break;
      case 'getAgendaConfig':
        response = handleGetAgendaConfig();
        break;
      case 'autoAssignTechnical':
        response = handleAutoAssignTechnical(request.payload);
        break;
      case 'updateStatistics':
        response = handleUpdateStatistics(request.payload);
        break;
      case 'getOrCreateOrderFolder':
        response = handleGetOrCreateOrderFolder(request.payload);
        break;
      case 'generateReport':
        response = handleGenerateReport(request.payload);
        break;
      case 'archiveOldOrders':
        response = handleArchiveOldOrders();
        break;
      case 'updateTechnicianLocation':
        response = handleUpdateTechnicianLocation(request.payload);
        break;
      case 'updateOrderStatus':
        response = handleUpdateOrderStatus(request.payload);
        break;
      case 'getClients':
        response = handleGetClients();
        break;
      case 'createClient':
        response = handleCreateClient(request.payload);
        break;
      case 'getTechnicians':
        response = handleGetTechnicians();
        break;
      case 'sendNotification':
        response = handleSendNotification(request.payload);
        break;
      default:
        response = { status: 'error', message: 'Acción no soportada' };
    }

    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.TEXT);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.message }))
      .setMimeType(ContentService.MimeType.TEXT);
  }
}
