// ============================================================================
// GPSPEDIA-UTILITIES SERVICE (COMPATIBLE WITH DB V2.0)
// ============================================================================
// COMPONENT VERSION: 1.0.0

// ============================================================================
// CONFIGURACIÓN GLOBAL
// ============================================================================
const SPREADSHEET_ID = "1M6zAVch_EGKGGRXIo74Nbn_ihH1APZ7cdr2kNdWfiDs";
let spreadsheet = null;

function getSpreadsheet() {
  if (spreadsheet === null) {
    spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return spreadsheet;
}

const SHEET_NAMES = {
    CORTES: "Cortes",
    USERS: "Users"
};

const COLS_CORTES = {
    anoDesde: 6,
    anoHasta: 7,
    imagenVehiculo: 9,
    timestamp: 37
};

const COLS_USERS = {
    ID: 1,
    Privilegios: 4
};


// ============================================================================
// ROUTER PRINCIPAL (doGet y doPost)
// ============================================================================
function doGet(e) {
    const defaultResponse = {
        status: 'success',
        message: 'GPSpedia Utilities-SERVICE v2.0 is active.'
    };
    return ContentService.createTextOutput(JSON.stringify(defaultResponse))
        .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
    let response;
    try {
        const request = JSON.parse(e.postData.contents);
        const { action, payload, session } = request;

        // Authorize the user
        authorize(session, ['Desarrollador']);

        let result;
        switch (action) {
            case 'migrateYearRanges':
                result = handleMigrateYearRanges();
                break;
            case 'migrateTimestamps':
                result = handleMigrateTimestamps();
                break;
            case 'getImageCreationDateFromUrl':
                if (!payload || !payload.url) {
                    throw new Error("La URL es requerida en el payload para esta acción.");
                }
                const date = getImageCreationDate(payload.url);
                result = { status: 'success', creationDate: date };
                break;
            default:
                throw new Error(`Acción desconocida en Utilities Service: ${action}`);
        }
        response = result;
    } catch (error) {
        response = {
            status: 'error',
            message: 'Ocurrió un error en el servicio de utilidades.',
            details: { errorMessage: error.message }
        };
    }
    return ContentService.createTextOutput(JSON.stringify(response))
        .setMimeType(ContentService.MimeType.TEXT);
}

// ============================================================================
// LÓGICA DE AUTORIZACIÓN
// ============================================================================
function authorize(session, requiredRoles) {
    if (!session || !session.userId) {
        throw new Error("Autenticación requerida. Sesión no proporcionada.");
    }

    const userSheet = getSpreadsheet().getSheetByName(SHEET_NAMES.USERS);
    const data = userSheet.getDataRange().getValues();
    data.shift();

    const userRow = data.find(row => row[COLS_USERS.ID - 1] == session.userId);

    if (!userRow) {
        throw new Error("Usuario no encontrado.");
    }

    const userRole = userRow[COLS_USERS.Privilegios - 1];
    if (!requiredRoles.includes(userRole)) {
        throw new Error("No tienes permisos para realizar esta acción.");
    }
}


// ============================================================================
// FUNCIONES AUXILIARES (HELPERS)
// ============================================================================

/**
 * Extrae el ID de una URL de Google Drive, obtiene el archivo y devuelve su fecha de creación.
 * @param {string} url La URL de Google Drive.
 * @returns {string} La fecha de creación del archivo en formato ISO string.
 * @throws {Error} Si la URL es inválida, no se puede extraer el ID o hay un error al acceder al archivo.
 */
function getImageCreationDate(url) {
    if (!url || typeof url !== 'string') {
        throw new Error("URL inválida o no proporcionada.");
    }

    const idMatch = url.match(/file\/d\/([a-zA-Z0-9_-]+)|id=([a-zA-Z0-9_-]+)|\/d\/([a-zA-Z0-9_-]+)/);
    if (!idMatch) {
        throw new Error("No se pudo extraer el ID del archivo de la URL proporcionada.");
    }

    const fileId = idMatch[1] || idMatch[2] || idMatch[3];

    try {
        const file = DriveApp.getFileById(fileId);
        const dateCreated = file.getDateCreated();
        return dateCreated.toISOString(); // Devolver en formato estándar para consistencia
    } catch (e) {
        // Captura errores comunes como "archivo no encontrado" o problemas de permisos.
        throw new Error(`Error al acceder al archivo de Drive con ID '${fileId}': ${e.message}`);
    }
}


// ============================================================================
// MANEJADORES DE ACCIONES (HANDLERS)
// ============================================================================

function handleMigrateYearRanges() {
    const sheet = getSpreadsheet().getSheetByName(SHEET_NAMES.CORTES);
    const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, COLS_CORTES.anoHasta);
    const values = range.getValues();
    let updatedCount = 0;

    const newValues = values.map(row => {
        let anoDesde = row[COLS_CORTES.anoDesde - 1];
        let anoHasta = row[COLS_CORTES.anoHasta - 1];

        if (anoDesde && typeof anoDesde === 'string' && anoDesde.includes('-')) {
            const parts = anoDesde.split('-').map(p => parseInt(p.trim(), 10));
            const year1 = parts[0];
            const year2 = parts[1];

            if (!isNaN(year1) && !isNaN(year2)) {
                row[COLS_CORTES.anoDesde - 1] = Math.min(year1, year2);
                row[COLS_CORTES.anoHasta - 1] = Math.max(year1, year2);
                updatedCount++;
            }
        } else if (anoDesde && !isNaN(parseInt(anoDesde, 10)) && !anoHasta) {
             row[COLS_CORTES.anoHasta - 1] = anoDesde;
             updatedCount++;
        }
        return row;
    });

    range.setValues(newValues);
    return { status: 'success', message: `Migración de rangos de años completada. Se actualizaron ${updatedCount} registros.` };
}


function handleMigrateTimestamps() {
    const sheet = getSpreadsheet().getSheetByName(SHEET_NAMES.CORTES);
    const range = sheet.getRange(2, COLS_CORTES.imagenVehiculo, sheet.getLastRow() - 1, 1);
    const urls = range.getValues();
    let updatedCount = 0;

    urls.forEach((row, index) => {
        const url = row[0];
        if (url && typeof url === 'string') {
            try {
                const idMatch = url.match(/file\/d\/([a-zA-Z0-9_-]+)|id=([a-zA-Z0-9_-]+)|\/d\/([a-zA-Z0-9_-]+)/);
                if (idMatch) {
                    const fileId = idMatch[1] || idMatch[2] || idMatch[3];
                    const file = DriveApp.getFileById(fileId);
                    const dateCreated = file.getDateCreated();

                    // Formatear a DD/MM/AAAA
                    const formattedDate = Utilities.formatDate(dateCreated, Session.getScriptTimeZone(), "dd/MM/yyyy");

                    sheet.getRange(index + 2, COLS_CORTES.timestamp).setValue(formattedDate);
                    updatedCount++;
                }
            } catch (e) {
                // Log error but continue
                console.error(`Error procesando URL en fila ${index + 2}: ${e.message}`);
            }
        }
    });

    return { status: 'success', message: `Migración de timestamps completada. Se procesaron e intentaron actualizar ${updatedCount} registros.` };
}
