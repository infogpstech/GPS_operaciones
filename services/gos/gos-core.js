// ============================================================================
// GOS-CORE SERVICE (GPS Operations Suite)
// ============================================================================
// Version: 1.2.0

const SPREADSHEET_ID = "1IiXxydi02QnVUVwWsEnC5lpB730mASI-6rTsmuI4XhE";

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
    { sheet: "RecepcionVehiculos", headers: ["ID", "OrdenID", "Tecnico", "FechaHora", "Sector", "ClienteInfo", "VehiculoInfo", "Fotos", "Danos", "CalidadCheck"] }
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

  const history = [];
  for (let i = 1; i < data.length; i++) {
    const rowVin = data[i][vinIdx] ? data[i][vinIdx].toString().trim() : "";
    if (rowVin.toLowerCase() === vin.toString().trim().toLowerCase()) {
      history.push({
        id: data[i][headerMap["ID"] - 1] || "",
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
        estado: data[i][headerMap["Estado"] - 1] || ""
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
    "Clasificación Vehículo", "Firma Digital"
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
      case "Sector": return payload.sector || "";
      case "Vendedor": return payload.vendedor || "Sin vendedor";
      case "Color": return payload.color || "Sin color";
      case "Fecha Instalacion": return payload.fechaInstalacion || "";
      case "Token": return payload.token || Utilities.getUuid();
      case "Clasificación Vehículo": return payload.clasificacionVehiculo || "";
      case "Firma Digital": return payload.firmaDigital || "";
      default: return "";
    }
  });

  sheet.appendRow(orderData);
  return { status: 'success', message: 'Orden creada exitosamente', orderId: nextId };
}

function handleGetOrders() {
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
      ["Sistema", "RootFolderId", "1-8QqhS-wtEFFwyBG8CmnEOp5i8rxSM-2", "Activo"],
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

  // Lógica de confirmación: si tiene trabajos y no es forzado, no asignar aún
  if (jobsCount > 0 && !force) {
    return {
      status: 'pending_confirmation',
      tecnico: tecnicoAsignado,
      message: 'El técnico ya tiene un trabajo activo. ¿Desea asignar como segundo trabajo?'
    };
  }

  // Si llegamos aquí, procedemos con la asignación física
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
    const rootFolderId = systemParams["RootFolderId"] || "1-8QqhS-wtEFFwyBG8CmnEOp5i8rxSM-2";

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
  const { orderId, tecnico, sector, clienteInfo, vehiculoInfo, fotos, danos, calidadCheck } = payload;
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

  logToSheet("Auditoria", "Recepcion", "saveVehicleReception", "success", "", `Recepción registrada #${nextId} para orden ${orderId}`);

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

  // Extraer información del servicio
  const serviceInfo = {
    lugar: row[headerMap["Dirección"] - 1] || "No especificado",
    fechaRecepcion: row[headerMap["Fecha"] - 1] || "No especificada",
    fechaInstalacion: row[headerMap["Fecha Instalacion"] - 1] || "Pendiente",
    tipoServicio: row[headerMap["Servicio"] - 1] || "Básico",
    observaciones: row[headerMap["Observaciones"] - 1] || "",
    estado: row[headerMap["Estado"] - 1] || "Pendiente"
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

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    let response;

    switch (request.action) {
      case 'getTechnicalConsultation': response = handleGetTechnicalConsultation(request.payload); break;
      case 'createOrder': response = handleCreateOrder(request.payload); break;
      case 'getOrders': response = handleGetOrders(); break;
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
