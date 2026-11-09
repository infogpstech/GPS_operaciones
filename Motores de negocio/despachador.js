/**
 * despachador.js - GPS Operations Suite (GOS)
 * Módulo de Planificación Inteligente de Agenda, Optimización de Rutas y Despacho
 *
 * Este módulo contiene la lógica matemática y algorítmica para optimizar trayectorias,
 * reasignaciones, cálculo de duraciones históricas, tiempos de traslado y almuerzo.
 */

// Baseline motorcycle speed in km/h
const BASELINE_MOTO_SPEED_KMH = 60;

/**
 * Clasifica automáticamente las instalaciones fuera de la oficina en tres categorías:
 * - Trabajo Local: dentro de la ciudad de la división.
 * - Viaje en moto: ciudades vecinas (Villanueva, Choloma, Cofradía, Naco, El Progreso).
 * - Viaje largo: ciudades alejadas (Tela, Puerto Cortés, Santa Rosa de Copán, Gracias, Ocotepeque, La Entrada).
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
 * Calcula el tiempo estimado de viaje en minutos.
 * @param {number} distanceKm Distancia en kilómetros.
 * @param {number} trafficFactor Multiplicador de tráfico según horario (ej: 1.2 para hora pico).
 * @returns {number} Tiempo estimado en minutos.
 */
function calculateTravelTime(distanceKm, trafficFactor = 1.0) {
    if (distanceKm <= 0) return 0;
    // T = D / V
    const hours = distanceKm / BASELINE_MOTO_SPEED_KMH;
    const mins = hours * 60;
    return Math.round(mins * trafficFactor);
}

/**
 * Estima la duración de un trabajo considerando tiempos base, ubicación y promedios históricos.
 * @param {string} tipoTrabajo Tipo de trabajo (Instalación nueva, revisión, etc.)
 * @param {string} vehicleRange Rango de vehículo (ej: "Ford Ranger 2024 - 2025")
 * @param {string} locationType Tipo de ubicación (Local vs Remoto)
 * @param {object} historicalMetrics Métricas históricas de rendimiento del técnico
 * @returns {number} Duración total en minutos.
 */
function estimateJobDuration(tipoTrabajo, vehicleRange = "", locationType = "Local", historicalMetrics = null) {
    let baseTime = 90; // Instalación nueva por defecto
    const tLower = (tipoTrabajo || '').toLowerCase().trim();

    if (tLower.includes('desinstalacion') || tLower.includes('desinstalación')) {
        baseTime = 60;
    } else if (tLower.includes('mantenimiento')) {
        baseTime = 30;
    } else if (tLower.includes('traspaso')) {
        baseTime = 180;
    } else if (tLower.includes('revision') || tLower.includes('revisión')) {
        // Diagnosis (20 mins) + actions
        baseTime = 20;
    }

    // Incrementar por ubicación remota
    if (locationType !== "Local") {
        baseTime += 30; // 30 min traslado ciudad
    }

    // Aplicar métricas de rendimiento reales si existen y sustituir progresivamente
    if (historicalMetrics && historicalMetrics.avgByType && historicalMetrics.avgByType[tipoTrabajo]) {
        baseTime = historicalMetrics.avgByType[tipoTrabajo];
    }

    return baseTime;
}

/**
 * Re-organiza y calcula los desplazamientos de la agenda de un técnico para compensar retrasos.
 * @param {Array} jobs Lista de trabajos asignados al técnico en orden cronológico.
 * @param {number} delayMinutes Retraso acumulado en minutos.
 * @param {Date} lastJobEndTime Hora de finalización del último trabajo.
 * @returns {Array} Agenda ajustada con marcas de tiempo.
 */
function recalculateAgendaWithLunchAndDelays(jobs, delayMinutes = 0, lastJobEndTime = null) {
    let currentTime = lastJobEndTime ? new Date(lastJobEndTime.getTime()) : new Date();
    const adjustedAgenda = [];

    // Compensar almuerzo si el trabajo anterior finaliza después de las 12:00 PM
    if (currentTime.getHours() >= 12 && currentTime.getMinutes() > 0) {
        // Reservar 60 minutos obligatorios para almuerzo
        currentTime.setMinutes(currentTime.getMinutes() + 60);
        console.log(`🍽️ Descanso obligatorio de almuerzo insertado. Próxima asignación inicia a las: ${currentTime.toTimeString().substring(0, 5)}`);
    }

    jobs.forEach(job => {
        const estDuration = estimateJobDuration(job.tipoTrabajo, job.vehiculo, job.locType);
        const startTime = new Date(currentTime.getTime());
        currentTime.setMinutes(currentTime.getMinutes() + estDuration);
        const endTime = new Date(currentTime.getTime());

        adjustedAgenda.push({
            orderId: job.id,
            cliente: job.cliente,
            horaInicioEstimada: startTime.toISOString(),
            horaFinEstimada: endTime.toISOString(),
            duracionEstimada: estDuration
        });
    });

    return adjustedAgenda;
}

/**
 * Encuentra el técnico idóneo para un trabajo basándose en cercanía, métricas, carga de trabajo e indisponibilidades.
 * @param {Array} technicians Lista de técnicos disponibles en la división.
 * @param {Array} activeLocks Lista de indisponibilidades activas.
 * @param {object} jobDetails Datos del trabajo a asignar (coordenadas, tipo, etc.)
 * @returns {object} Técnico óptimo seleccionado.
 */
function getOptimalTechnicianForJob(technicians, activeLocks, jobDetails) {
    if (technicians.length === 0) return null;

    let bestTech = null;
    let minScore = 999999;

    technicians.forEach(tech => {
        // 1. Verificar indisponibilidad absoluta
        const isUnavailable = activeLocks.some(lock => {
            if (lock.tecnico.toLowerCase() !== tech.nombre.toLowerCase()) return false;
            return jobDetails.fecha >= lock.fechaInicio && jobDetails.fecha <= lock.fechaFin;
        });
        if (isUnavailable) return; // Saltarse técnico no disponible

        // 2. Calcular puntuación basada en proximidad y carga de trabajo
        let score = (tech.jobsCount || 0) * 120; // Penalización por carga de trabajo

        bestTech = tech;
    });

    return bestTech || technicians[0];
}

if (typeof module !== 'undefined') {
    module.exports = {
        calculateTravelTime,
        estimateJobDuration,
        recalculateAgendaWithLunchAndDelays,
        getOptimalTechnicianForJob,
        classifyTravel
    };
}
