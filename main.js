import { routeAction } from './Utilidades/api-config.js';
import { initIndexedDB, getDB, dbSet, dbGetAll, dbClear, requestWakeLock, releaseWakeLock, levenshteinDistance, isApproximateMatch, isExtraordinarySlot, calculateDistance, classifyTravel } from './Utilidades/helpers.js';

import { AgendaEngine } from './Motores de negocio/agenda.js';
import { PlanificacionEngine } from './Motores de negocio/planificacion.js';
import { BusquedaEngine } from './Motores de negocio/busqueda.js';
import { ConsultasEngine } from './Motores de negocio/consultas.js';
import { SincronizacionEngine } from './Motores de negocio/sincronizacion.js';
import { AutenticacionEngine } from './Motores de negocio/autenticacion.js';
import { ReportesEngine } from './Motores de negocio/reportes.js';

const SESSION_KEY = 'gos_session';

const RBAC = {
    isDev() {
        return ['desarrollador', 'administrador'].includes((AppState.user?.Privilegios || '').toLowerCase().trim());
    },
    isJefe() {
        return ['jefe', 'jefe de division', 'gerente', 'jefe de tienda'].includes((AppState.user?.Privilegios || '').toLowerCase().trim());
    },
    isAsesor() {
        return ['asesor', 'asesor de venta', 'vendedor', 'supervisor'].includes((AppState.user?.Privilegios || '').toLowerCase().trim());
    },
    isTech() {
        return ['tecnico', 'tecnico_exterior', 'instalador', 'técnico'].includes((AppState.user?.Privilegios || '').toLowerCase().trim());
    },

    canCreateCupo() {
        return this.isDev() || this.isJefe() || this.isAsesor();
    },

    canEditCupo(order) {
        if (this.isDev()) return true;
        if (this.isJefe()) {
            const orderSector = order.sector || 'San Pedro Sula';
            const requestorSector = AppState.user?.Sector || 'San Pedro Sula';
            if (orderSector !== requestorSector) {
                return false;
            }
            return true;
        }
        if (this.isAsesor()) {
            const isOwn = (order.vendedor || '').toString().toLowerCase().trim() === (AppState.user?.Nombre_Usuario || '').toString().toLowerCase().trim();
            const isExtra = isExtraordinarySlot(order.fecha, order.hora);
            return isOwn && isExtra;
        }
        return false;
    },

    canDeleteCupo(order) {
        return this.canEditCupo(order);
    },

    canAuthorizeCupo() {
        return this.isDev() || this.isJefe();
    }
};

let dashboardInterval = null;

/**
 * UI_TEMPLATES: Bloques de construcción para la interfaz.
 * v0.4.1
 */
const UI_TEMPLATES = {
    loading: '<div class="loading-spinner"><p>Cargando información...</p></div>',

    table(headers, rows) {
        let html = `<table class="gos-table"><thead><tr>`;
        headers.forEach(h => html += `<th>${h}</th>`);
        html += `</tr></thead><tbody>`;
        rows.forEach(r => html += `<tr>${r}</tr>`);
        html += `</tbody></table>`;
        return html;
    },

    badge(status) {
        const safeStatus = (status || 'Pendiente').toLowerCase().replace(/\s+/g, '');
        return `<span class="badge badge-${safeStatus}">${status}</span>`;
    },

    priorityBadge(priority) {
        const p = (priority || 'Normal').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        let color = '#28a745'; // Normal -> Verde
        if (p === 'alta') {
            color = '#fd7e14'; // Alta -> Naranja
        } else if (p === 'maxima' || p === 'urgente') {
            color = '#dc3545'; // Máxima -> Rojo
        }
        return `<span class="priority-dot" style="display:inline-block; width:15px; height:15px; border-radius:50%; background-color:${color}; vertical-align:middle;" title="Prioridad: ${priority}"></span>`;
    },

    chart(data) {
        // data: [{label: 'Tech1', value: 10}, ...]
        const maxVal = Math.max(...data.map(d => d.value)) || 1;
        let html = '<div class="gos-chart-container">';
        data.forEach(d => {
            const pct = (d.value / maxVal) * 100;
            html += `
                <div class="chart-bar-row">
                    <div class="chart-label">${d.label}</div>
                    <div class="chart-bar-wrapper">
                        <div class="chart-bar" style="width: ${pct}%"></div>
                        <span class="chart-value">${d.value}</span>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        return html;
    },

    modal(title, message, onConfirm, onCancel) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="modal-actions">
                    <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
                    <button class="btn btn-primary" id="modal-confirm">Confirmar</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#modal-confirm').onclick = () => {
            onConfirm();
            document.body.removeChild(overlay);
        };
        overlay.querySelector('#modal-cancel').onclick = () => {
            if (onCancel) onCancel();
            document.body.removeChild(overlay);
        };
    },

    orderForm(options = {}) {
        return `
            <h3>Crear Nueva Orden</h3>
            <form id="order-form" class="order-form">
                <div class="form-grid">
                    <div class="form-group"><label>Fecha</label><input type="date" name="fecha" id="order-fecha" class="form-control"></div>
                    <div class="form-group">
                        <label>Hora (Turno)</label>
                        <select name="hora" id="order-hora" class="form-control">
                            <option value="">Seleccione...</option>
                            <!-- Normal Slots -->
                            <option value="08:00 - 10:00">08:00 - 10:00</option>
                            <option value="10:00 - 12:00">10:00 - 12:00</option>
                            <option value="13:00 - 15:00">13:00 - 15:00</option>
                            <option value="15:00 - 17:00">15:00 - 17:00</option>
                            <!-- Extraordinary Slots -->
                            <option value="06:00 - 08:00">06:00 - 08:00 (Extraordinario Mañana)</option>
                            <option value="12:00 - 13:00">12:00 - 13:00 (Extraordinario Mediodía)</option>
                            <option value="17:00 - 19:00">17:00 - 19:00 (Extraordinario Tarde)</option>
                        </select>
                    </div>
                    <div class="form-group autocomplete-wrapper" style="position:relative;">
                        <label>Cliente</label>
                        <input type="text" name="cliente" id="order-cliente" class="form-control" placeholder="Escriba el nombre del cliente...">
                        <div id="suggestions-client" class="autocomplete-suggestions" style="display:none; position:absolute; z-index:100; width:100%; background:#fff; border:1px solid #ddd; max-height:200px; overflow-y:auto;"></div>
                    </div>
                    <div class="form-group"><label>Dirección del cliente (Domicilio)</label><input type="text" name="contacto" id="order-contacto" class="form-control"></div>
                    <div class="form-group"><label>Teléfono</label><input type="text" name="telefono" id="order-telefono" class="form-control"></div>
                    <div class="form-group"><label>Nombre del contacto (Persona que entrega)</label><input type="text" name="contacto_nombre" id="order-contacto-nombre" class="form-control" placeholder="Nombre de quien entrega..."></div>
                    <div class="form-group"><label>Teléfono del contacto (Persona que entrega)</label><input type="text" name="contacto_telefono" id="order-contacto-telefono" class="form-control" placeholder="Teléfono de quien entrega..."></div>
                    <div class="form-group autocomplete-wrapper" style="position:relative; grid-column: 1 / -1;">
                        <label style="font-weight:bold;">Ubicación de la instalación</label>
                        <input type="text" id="order-saved-loc-search" class="form-control" placeholder="Escriba la dirección o busque ubicación guardada, ej: Excel">
                        <div id="suggestions-saved-loc" class="autocomplete-suggestions" style="display:none; position:absolute; z-index:100; width:100%; background:#fff; border:1px solid #ddd;"></div>
                        <!-- Botón oculto por defecto para Guardar Ubicación -->
                        <button type="button" id="save-location-btn" class="btn btn-sm btn-outline-primary" style="display:none; margin-top:10px;">💾 Guardar ubicación</button>
                        <p style="font-size:0.8rem; color:var(--secondary); margin-top:5px; margin-bottom:0;">Dejar vacío si el cliente llevará el vehículo a la oficina.</p>
                        <!-- Campo oculto para guardar nombre de la nueva ubicación -->
                        <input type="hidden" id="order-location-name-save" name="location_name_save">
                    </div>
                    <div class="form-group" style="display:none;"><label>Dirección</label><input type="text" name="direccion" id="order-direccion" class="form-control"></div>
                    <div class="form-group" style="display:none;"><label>Coordenadas (Lat, Lng)</label><input type="text" name="coordenadas" id="order-coords" class="form-control"></div>
                    <div class="form-group" style="display:none;"><label>Link Google Maps</label><input type="url" name="linkMaps" id="order-maps-link" class="form-control"></div>

                    <!-- Selector Interactivo de Mapa GOS -->
                    <div id="form-map-picker-container" style="grid-column: 1 / -1; margin-top:10px;">
                        <label style="font-weight:bold; color:var(--dark);">Selector de Ubicación en Mapa (Haga clic para obtener coordenadas):</label>
                        <div id="form-map-picker" style="width: 100%; max-width: 300px; aspect-ratio: 1 / 1; border-radius:8px; border:1px solid #ddd; background:#eee; display:flex; align-items:center; justify-content:center; margin-top:5px; margin-left:auto; margin-right:auto;">
                            <p style="font-size:0.85rem; color:#718096; text-align:center; padding:15px;">
                                📍 Haga clic en el mapa de su división para ubicar el punto de trabajo y autocompletar coordenadas y enlace.<br>
                                <small style="display:block; margin-top:5px; color:#a0aec0;">(La carga del mapa puede tomar unos instantes)</small>
                            </p>
                        </div>
                    </div>

                    <!-- Chasis VIN (para consulta de historial automático) -->
                    <div class="form-group">
                        <label>VIN (Chasis)</label>
                        <input type="text" name="vin" id="order-vin" class="form-control" placeholder="Ingrese el número de chasis (VIN)...">
                    </div>
                    <div class="form-group">
                        <label>Clasificación del Vehículo</label>
                        <select name="clasificacionVehiculo" id="order-clasificacion" class="form-control">
                            <option value="">Seleccione...</option>
                            <option value="Vehículo nuevo">Vehículo nuevo</option>
                            <option value="Vehículo usado">Vehículo usado</option>
                        </select>
                    </div>

                    <div class="form-group autocomplete-wrapper" style="position:relative;">
                        <label>Marca</label>
                        <input type="text" name="marca" id="order-marca" class="form-control">
                        <div id="suggestions-brand" class="autocomplete-suggestions" style="display:none; position:absolute; z-index:100; width:100%; background:#fff; border:1px solid #ddd; max-height:200px; overflow-y:auto;"></div>
                    </div>
                    <div class="form-group"><label>Modelo</label><input type="text" name="modelo" id="order-modelo" class="form-control"></div>
                    <div class="form-group"><label>Número Motor</label><input type="text" name="motor" id="order-motor" class="form-control"></div>
                    <div class="form-group"><label>Año</label><input type="number" name="anio" id="order-anio" class="form-control"></div>
                    <div class="form-group" id="order-placa-container" style="display:none;"><label>Placa</label><input type="text" name="placa" id="order-placa" class="form-control"></div>
                    <div class="form-group"><label>Color</label><input type="text" name="color" id="order-color" class="form-control"></div>

                    <div class="form-group" style="display:none;">
                        <label>Sector / División</label>
                        <select name="sector" id="order-sector" class="form-control">
                            <option value="San Pedro Sula">San Pedro Sula</option>
                            <option value="Tegucigalpa">Tegucigalpa</option>
                            <option value="La Ceiba">La Ceiba</option>
                            <option value="Choluteca">Choluteca</option>
                            <option value="Occidente">Occidente</option>
                        </select>
                    </div>

                    <div class="form-group" style="grid-column: 1 / -1;">
                        <label style="font-weight:bold;">Servicio</label>
                        <div style="display:flex; gap:20px; align-items:center; margin-top:5px;">
                            <label><input type="checkbox" name="servicio_chk" value="Tracklink" id="service-tracklink"> Tracklink</label>
                            <label><input type="checkbox" name="servicio_chk" value="Controlcar" id="service-controlcar"> Controlcar</label>
                        </div>
                    </div>

                    <div class="form-group" id="tipo-servicio-container" style="display:none; grid-column: 1 / -1;">
                        <label style="font-weight:bold;">Tipo de servicio</label>
                        <select name="tipoServicio" id="order-tipo-servicio" class="form-control">
                            <option value="Básico (Roadlink)">Básico (Roadlink)</option>
                            <option value="Full (Transtrack)">Full (Transtrack)</option>
                        </select>
                    </div>

                    <div class="form-group"><label id="order-inventario-label">Inventario</label><textarea name="inventario" id="order-inventario" class="form-control"></textarea></div>
                    <div class="form-group">
                        <label>Tipo de Trabajo</label>
                        <select name="tipoTrabajo" id="order-tipo-trabajo" class="form-control">${options.tiposTrabajo || '<option>Cargando...</option>'}</select>
                    </div>
                    <div class="form-group">
                        <label>Prioridad</label>
                        <select name="prioridad" class="form-control">${options.prioridades || '<option>Cargando...</option>'}</select>
                    </div>
                    <div class="form-group"><label>Observaciones</label><textarea name="observaciones" class="form-control"></textarea></div>

                    <!-- Contenedor dinámico de memoria histórica y validaciones de chasis -->
                    <div id="vehicle-history-container" style="grid-column: 1 / -1; margin-top: 15px; display: none;"></div>
                    <!-- Contenedor de mensajes de advertencia de divisiones para Asesores -->
                    <div id="order-warning-msg" style="display:none; grid-column: 1 / -1; margin-top:10px; background:#fff3cd; color:#856404; padding:10px; border-radius:5px; border:1px solid #ffeeba; font-weight:bold;"></div>
                    <!-- Contenedor de advertencia de retraso de horario -->
                    <div id="retraso-warning-msg" style="display:none; grid-column: 1 / -1; margin-top:10px; background:#f8d7da; color:#721c24; padding:10px; border-radius:5px; border:1px solid #f5c6cb; font-weight:bold;"></div>
                </div>
                <div style="display:flex; gap:10px; margin-top:20px;">
                    <button type="submit" id="submit-order-assign-btn" class="btn btn-primary">Guardar y Asignar</button>
                    <button type="button" id="submit-order-draft-btn" class="btn btn-warning">Guardar como Borrador</button>
                    <button type="button" id="cancel-order-btn" class="btn btn-secondary">Cancelar</button>
                </div>
            </form>
        `;
    }
};

/**
 * AppState: Gestor central de estado de la aplicación.
 * v0.4.0
 */
const AppState = {
    user: null,
    currentSection: 'dashboard',
    activeOrder: null,
    config: null,

    setUser(userData) {
        this.user = userData;
        localStorage.setItem(SESSION_KEY, JSON.stringify(userData));
    },

    clearUser() {
        this.user = null;
        localStorage.removeItem(SESSION_KEY);
    },

    async loadConfig() {
        try {
            const result = await routeAction('GOS_CORE', 'getSystemConfig');
            if (result.status === 'success') {
                this.config = result.data;
                this.loadMapsScript();
            }
        } catch (error) {
            console.error("Error cargando configuración:", error);
        }
    },

    loadMapsScript() {
        if (this.config?.Sistema?.GoogleMapsAPIKey && !window.google) {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${this.config.Sistema.GoogleMapsAPIKey}&callback=initMap`;
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);
        }
    }
};

async function init() {
    window.loadSection = loadSection;
    window.markStatus = markStatus;
    window.initMap = initMap;
    window.openDrive = openDrive;
    window.openMaps = openMaps;
    window.UI_TEMPLATES = UI_TEMPLATES; // Exponer para utilidades globales
    window.AppState = AppState;
    window.RBAC = RBAC;

    setupAuthListeners();
    setupNavigationListeners();
    setupGeolocation();
    setupGlobalSearch();
    setupNotificationCenter();

    const session = localStorage.getItem(SESSION_KEY);
    if (session) {
        AppState.user = JSON.parse(session);
        await AppState.loadConfig();
        showMainView(AppState.user);
    }
}

function setupGeolocation() {
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition((position) => {
            const { latitude, longitude } = position.coords;
            // Aquí se enviaría la ubicación al backend periódicamente
            console.log(`Ubicación actualizada: ${latitude}, ${longitude}`);
            checkArrivalStatus(latitude, longitude);
        }, (error) => {
            console.warn("Error de geolocalización:", error.message);
        }, {
            enableHighAccuracy: true,
            maximumAge: 30000,
            timeout: 27000
        });
    }
}

async function checkArrivalStatus(lat, lng) {
    if (!AppState.user) return;

    // Enviar ubicación al backend
    routeAction('GOS_CORE', 'updateTechnicianLocation', {
        tecnicoId: AppState.user.ID,
        lat,
        lng
    });

    // Lógica de proximidad: Solo procesar si hay una orden activa en estado 'En camino'
    const activeOrder = AppState.activeOrder;
    if (activeOrder && activeOrder.estado === 'En Camino' && activeOrder.coordenadas) {
        const [targetLat, targetLng] = activeOrder.coordenadas.split(',').map(Number);
        const distance = calculateDistance(lat, lng, targetLat, targetLng);

        let threshold = 0.2; // 200m
        if (AppState.config && AppState.config.Sistema && AppState.config.Sistema.RadioLlegada) {
            threshold = parseFloat(AppState.config.Sistema.RadioLlegada) / 1000;
        }

        if (distance < threshold && activeOrder.estado !== 'Llegó') {
            markStatus(activeOrder.id, 'Llegó');
        }
    }

    // Detección automática al retirarse del sitio después de pruebas con monitoreo
    if (activeOrder && (activeOrder.estado === 'Haciendo pruebas' || activeOrder.estado === 'pruebas con monitoreo' || activeOrder.estado === 'Haciendo pruebas') && activeOrder.coordenadas) {
        const [targetLat, targetLng] = activeOrder.coordenadas.split(',').map(Number);
        const distance = calculateDistance(lat, lng, targetLat, targetLng);

        let threshold = 0.3; // 300m
        if (AppState.config && AppState.config.Sistema && AppState.config.Sistema.RadioLlegada) {
            threshold = (parseFloat(AppState.config.Sistema.RadioLlegada) * 1.5) / 1000;
        }

        if (distance > threshold) {
            markStatus(activeOrder.id, 'Instalación completada', `Finalización automática al retirarse del sitio de trabajo (${Math.round(distance * 1000)}m de distancia).`);
        }
    }
}


// Exponer markStatus de forma inmediata a nivel global
window.markStatus = markStatus;

async function markStatus(orderId, newStatus, observaciones = '') {
    try {
        const result = await routeAction('GOS_CORE', 'updateOrderStatus', {
            orderId,
            status: newStatus,
            usuario: AppState.user?.Nombre_Usuario || 'Sistema',
            observaciones: observaciones
        });
        if (result.status === 'success') {
            // Actualizar activeOrder en AppState y administrar Screen Wake Lock de PWA
            if (newStatus === 'En Camino') {
                AppState.activeOrder = { id: orderId, estado: newStatus };
                const row = document.querySelector(`tr[data-id="${orderId}"]`);
                if (row) {
                    AppState.activeOrder.coordenadas = row.dataset.coords;
                }
                requestWakeLock();

                // Validación de desplazamiento (Capturar coordenadas al iniciar recorrido)
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition((position) => {
                        const lat = position.coords.latitude;
                        const lng = position.coords.longitude;
                        const coordsStr = `${lat}, ${lng}`;
                        routeAction('GOS_CORE', 'sendNotification', {
                            recipient: 'Sistema',
                            message: `Validación Desplazamiento - Técnico inició recorrido en coordenadas: ${coordsStr}`,
                            type: 'Desplazamiento'
                        }).catch(err => console.error("Error logging displacement verification:", err));
                    });
                }
            } else if (['Iniciando', 'Instalando', 'Haciendo pruebas'].includes(newStatus)) {
                requestWakeLock();
            } else if (newStatus === 'Finalizada' || newStatus === 'Cancelada') {
                AppState.activeOrder = null;
                releaseWakeLock();
            } else if (AppState.activeOrder && AppState.activeOrder.id === orderId) {
                AppState.activeOrder.estado = newStatus;
            }

            notifyChange(newStatus);
            loadSection(AppState.currentSection || 'ordenes');
        }
    } catch (error) {
        console.error("Error al actualizar estado:", error);
    }
}

function notifyChange(status) {
    const toast = document.getElementById('toast');
    toast.textContent = `Estado actualizado: ${status}`;
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);

    // Registrar en backend para auditoría de gerencia
    routeAction('GOS_CORE', 'sendNotification', {
        recipient: 'Gerencia',
        message: `Orden cambió a ${status}`,
        type: 'StatusChange'
    });
}

function setupNavigationListeners() {
    const navLinks = document.querySelectorAll('.nav-link[data-section]');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = e.currentTarget.dataset.section;
            loadSection(section);
        });
    });
}

function loadSection(section) {
    const user = AppState.user;
    AppState.currentSection = section;
    const titleEl = document.getElementById('section-title');
    const contentEl = document.getElementById('section-content');

    if (AppState.activeLock) {
        const { date, slot } = AppState.activeLock;
        routeAction('GOS_CORE', 'unlockSlot', { date, slot }).catch(console.error);
        AppState.activeLock = null;
    }

    if (dashboardInterval) {
        clearInterval(dashboardInterval);
        dashboardInterval = null;
    }

    const sections = {
        dashboard: { title: 'Planificación de la semana', content: '<p>Cargando planificación...</p>' },
        agenda: { title: 'Agenda de Instalaciones', content: '<p>Cargando turnos...</p>' },
        ordenes: { title: 'Gestión de Órdenes', content: '<p>Cargando órdenes de trabajo...</p>' },
        clientes: { title: 'Directorio de Clientes', content: '<p>Cargando base de datos de clientes...</p>' },
        tecnicos: { title: 'Panel de Técnicos', content: '<p>Cargando disponibilidad de técnicos...</p>' },
        consulta: { title: 'Consulta Técnica GPSpedia', content: '<p>Cargando motor de consulta...</p>' },
        reportes: { title: 'Reportes Operativos', content: '<p>Cargando reportes...</p>' },
        'admin': { title: 'Administración', content: '<p>Cargando panel...</p>' }
    };

    if (sections[section]) {
        titleEl.textContent = sections[section].title;
        contentEl.innerHTML = sections[section].content;

        if (section === 'dashboard') {
            renderDashboardModule(contentEl);
        } else if (section === 'ordenes') {
            renderOrdersModule(contentEl);
        } else if (section === 'agenda') {
            renderAgendaModule(contentEl);
        } else if (section === 'tecnicos') {
            renderTechniciansModule(contentEl);
        } else if (section === 'clientes') {
            renderClientsModule(contentEl);
        } else if (section === 'consulta') {
            renderConsultationModule(contentEl);
        } else if (section === 'reportes') {
            renderReportsModule(contentEl);
        } else if (section === 'admin') {
            renderAdminModule(contentEl);
        }
    }
}

async function renderReportsModule(container) {
    const config = AppState.config || {};
    const reportOptions = config.Reportes ? Object.values(config.Reportes) : ['diario', 'semanal', 'mensual'];

    const isChiefOrManager = ['jefe', 'gerente', 'desarrollador', 'jefe de tienda', 'administrador'].includes((AppState.user?.Privilegios || '').toLowerCase().trim());

    let statsHtml = '';
    if (isChiefOrManager) {
        statsHtml = `<div id="admin-stats-container" style="margin-bottom: 30px;"></div>`;
    }

    container.innerHTML = `
        ${statsHtml}
        <div class="orders-table-container" style="background:#fff; padding:20px; border-radius:8px; border:1px solid #ddd;">
            <h3 style="margin-top:0; margin-bottom:15px; border-bottom:2px solid var(--light); padding-bottom:8px; color:var(--dark);">Generador de Reportes Operativos</h3>
            <div class="actions-bar" style="display:flex; justify-content:flex-start; gap:10px; align-items:center; margin-bottom:15px;">
                <select id="report-type" class="form-control" style="width:auto; display:inline-block;">
                    ${reportOptions.map(opt => `<option value="${opt.toLowerCase()}">${opt.charAt(0).toUpperCase() + opt.slice(1)}</option>`).join('')}
                </select>
                <button id="generate-report-btn" class="btn btn-primary">Generar Reporte</button>
                <button id="export-report-btn" class="btn btn-secondary" style="display:none;">Exportar CSV</button>
            </div>
            <div id="report-results" style="margin-top:20px;">
                <p>Seleccione el tipo de reporte y presione generar.</p>
            </div>
        </div>
    `;

    if (isChiefOrManager) {
        const statsDiv = document.getElementById('admin-stats-container');
        if (statsDiv) {
            await renderAdminMetricsModule(statsDiv);
        }
    }

    const exportBtn = document.getElementById('export-report-btn');
    let currentReportData = null;

    document.getElementById('generate-report-btn').addEventListener('click', async () => {
        const type = document.getElementById('report-type').value;
        const resultsDiv = document.getElementById('report-results');
        resultsDiv.innerHTML = '<p>Procesando datos...</p>';
        exportBtn.style.display = 'none';

        try {
            const result = await routeAction('GOS_CORE', 'generateReport', { type });
            if (result.status === 'success') {
                currentReportData = result.reportData;
                const data = result.reportData;
                if (data.length <= 1) {
                    resultsDiv.innerHTML = '<p>No hay datos para este período.</p>';
                    return;
                }

                exportBtn.style.display = 'inline-block';
                const headers = data[0];

                // Helper para mapeo dinámico basado en nombres de columnas
                const getVal = (row, name) => {
                    const idx = headers.indexOf(name);
                    return idx !== -1 ? row[idx] : 'N/A';
                };

                const rows = data.slice(1).map(row => {
                    return `
                        <td>${getVal(row, 'Fecha')}</td>
                        <td>${getVal(row, 'Cliente')}</td>
                        <td>${getVal(row, 'Técnico Asignado')}</td>
                        <td>${UI_TEMPLATES.badge(getVal(row, 'Estado'))}</td>
                    `;
                });

                // Generar Estadísticas para Gráfico (Ej: Órdenes por técnico)
                const stats = {};
                data.slice(1).forEach(row => {
                    const tech = getVal(row, 'Técnico Asignado');
                    stats[tech] = (stats[tech] || 0) + 1;
                });
                const chartData = Object.entries(stats).map(([label, value]) => ({ label, value }));

                resultsDiv.innerHTML = `
                    <h3>Reporte ${type.charAt(0).toUpperCase() + type.slice(1)}</h3>
                    <div style="margin-bottom:30px;">
                        <h4>Distribución por Técnico</h4>
                        ${UI_TEMPLATES.chart(chartData)}
                    </div>
                    ${UI_TEMPLATES.table(['Fecha', 'Cliente', 'Técnico', 'Estado'], rows)}
                `;
            }
        } catch (error) {
            resultsDiv.innerHTML = `<p style="color:var(--danger);">Error: ${error.message}</p>`;
        }
    });

    exportBtn.addEventListener('click', () => {
        if (!currentReportData) return;
        const csvContent = "data:text/csv;charset=utf-8,"
            + currentReportData.map(e => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `GOS_Reporte_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

async function renderConsultationModule(container) {
    container.innerHTML = `
        <form id="consult-form" class="order-form">
            <div class="form-grid">
                <div class="form-group"><label>Categoría</label><input type="text" name="categoria" class="form-control" placeholder="Ej: Automóvil"></div>
                <div class="form-group"><label>Marca</label><input type="text" name="marca" class="form-control" required></div>
                <div class="form-group"><label>Modelo</label><input type="text" name="modelo" class="form-control" required></div>
            </div>
            <button type="submit" class="btn btn-primary" style="margin-top:10px;">Consultar Capacidades</button>
        </form>
        <div id="consult-result" style="margin-top:20px;"></div>
    `;

    document.getElementById('consult-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const payload = Object.fromEntries(formData.entries());
        const resultDiv = document.getElementById('consult-result');

        resultDiv.innerHTML = '<p>Consultando catálogo...</p>';
        try {
            const result = await routeAction('GOS_CORE', 'getTechnicalConsultation', payload);
            if (result.status === 'success') {
                const data = result.data;
                resultDiv.innerHTML = `
                    <div class="stat-card" style="text-align:left;">
                        <p><strong>Apagado Remoto:</strong> ${data.apagadoRemoto}</p>
                        <p><strong>Apertura:</strong> ${data.apertura}</p>
                        <p><strong>Botón de Pánico:</strong> ${data.botonPanico}</p>
                        <p><strong>Micrófono:</strong> ${data.microfono}</p>
                    </div>
                `;
            }
        } catch (error) {
            resultDiv.innerHTML = `<p style="color:var(--danger);">Error: ${error.message}</p>`;
        }
    });
}

async function renderClientsModule(container) {
    container.innerHTML = `
        <div class="actions-bar">
            <button id="new-client-btn" class="btn btn-primary">Nuevo Cliente</button>
        </div>
        <div id="clients-list"><p>Cargando clientes...</p></div>
    `;

    document.getElementById('new-client-btn').addEventListener('click', () => {
        renderClientForm(container);
    });

    try {
        const result = await routeAction('GOS_CORE', 'getClients');
        const listDiv = document.getElementById('clients-list');
        if (result.status === 'success') {
            if (result.data.length === 0) {
                listDiv.innerHTML = '<p>No hay clientes registrados.</p>';
            } else {
                let html = `<table class="gos-table"><thead><tr><th>Cliente</th><th>Teléfono</th><th>Acciones</th></tr></thead><tbody>`;
                result.data.forEach(client => {
                    html += `<tr><td>${client.nombre}</td><td>${client.telefono}</td><td><button class="btn btn-sm btn-secondary">Editar</button></td></tr>`;
                });
                html += `</tbody></table>`;
                listDiv.innerHTML = html;
            }
        }
    } catch (error) {
        document.getElementById('clients-list').innerHTML = `<p>Error al cargar clientes.</p>`;
    }
}

function renderClientForm(container) {
    container.innerHTML = `
        <h3>Registrar Nuevo Cliente</h3>
        <form id="client-form" class="order-form">
            <div class="form-grid">
                <div class="form-group"><label>Nombre Completo</label><input type="text" name="nombre" class="form-control" required></div>
                <div class="form-group"><label>Empresa</label><input type="text" name="empresa" class="form-control"></div>
                <div class="form-group"><label>Teléfono</label><input type="text" name="telefono" class="form-control" required></div>
                <div class="form-group"><label>Correo</label><input type="email" name="correo" class="form-control"></div>
                <div class="form-group"><label>RTN</label><input type="text" name="rtn" class="form-control"></div>
                <div class="form-group"><label>Dirección</label><input type="text" name="direccion" class="form-control"></div>
                <div class="form-group"><label>Observaciones</label><textarea name="observaciones" class="form-control"></textarea></div>
            </div>
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button type="submit" class="btn btn-primary">Guardar Cliente</button>
                <button type="button" onclick="loadSection('clientes')" class="btn btn-secondary">Cancelar</button>
            </div>
        </form>
    `;

    document.getElementById('client-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = Object.fromEntries(new FormData(e.target).entries());
        try {
            await routeAction('GOS_CORE', 'createClient', payload);
            alert('Cliente creado');
            loadSection('clientes');
        } catch (error) {
            alert('Error: ' + error.message);
        }
    });
}

async function renderTechniciansModule(container) {
    container.innerHTML = `
        <div class="stats-dashboard">
            <div class="stat-card">
                <h4>Técnicos Activos</h4>
                <p id="active-techs-count">Cargando...</p>
            </div>
        </div>
        <div id="tech-map" style="height:400px; border-radius:12px; margin-bottom:20px; background:#ddd; display:flex; align-items:center; justify-content:center;">
            <p>Mapa de Seguimiento en Tiempo Real</p>
        </div>
        <div id="techs-list" class="techs-table-container"></div>
    `;

    try {
        const result = await routeAction('GOS_CORE', 'getTechnicians');
        if (result.status === 'success') {
            document.getElementById('active-techs-count').textContent = result.data.length;
            const list = document.getElementById('techs-list');
            let html = `<table class="gos-table"><thead><tr><th>Técnico</th><th>Última Ubicación</th><th>Última Act.</th></tr></thead><tbody>`;
            result.data.forEach(t => {
                html += `<tr><td>${t.nombre}</td><td>${t.lat || 'N/A'}, ${t.lng || 'N/A'}</td><td>${t.ultimaact || 'Nunca'}</td></tr>`;
            });
            html += `</tbody></table>`;
            list.innerHTML = html;

            // Actualizar Mapa
            updateMap(result.data);
        }
    } catch (error) {
        console.error("Error techs:", error);
    }
}

async function renderAgendaModule(container) {
    const user = AppState.user;
    if (!user) {
        container.innerHTML = '<p>Por favor inicie sesión para ver esta información.</p>';
        return;
    }

    if (!AppState.activeAgendaSector) {
        AppState.activeAgendaSector = user.Sector || 'San Pedro Sula';
    }

    const isPowerUser = ['desarrollador', 'jefe', 'gerente', 'jefe de tienda', 'administrador'].includes((user.Privilegios || '').toLowerCase().trim());
    const isTechnician = ['tecnico', 'técnico', 'instalador'].includes((user.Privilegios || '').toLowerCase().trim());

    if (isTechnician) {
        AppState.activeAgendaSector = user.Sector || 'San Pedro Sula';
    }

    const sectores = ['San Pedro Sula', 'Tegucigalpa', 'La Ceiba', 'Choluteca', 'Occidente'];
    let tabsHtml = '';
    if (!isTechnician) {
        tabsHtml = `
            <div class="agenda-tabs" style="display:flex; gap:10px; margin-bottom:15px; border-bottom:1px solid #ddd; padding-bottom:10px;">
                ${sectores.map(sec => {
                    const isActive = sec.toLowerCase().trim() === AppState.activeAgendaSector.toLowerCase().trim();
                    const btnClass = isActive ? 'btn btn-primary' : 'btn btn-secondary';
                    const activeStyle = isActive ? 'background-color: var(--primary); color: white;' : 'background-color: #e2e8f0; color: #4a5568;';
                    return `<button class="${btnClass}" style="${activeStyle} font-size:0.85rem; padding: 6px 12px;" onclick="changeAgendaSector('${sec}')">${sec}</button>`;
                }).join('')}
            </div>
        `;
    }

    let grid = document.getElementById('agenda-weekly-grid');
    if (!grid) {
        container.innerHTML = `
            <div class="agenda-container-fluid" style="padding: 10px;">
                ${tabsHtml}
                <div id="agenda-weekly-grid" class="agenda-weekly-grid">
                    <p>Cargando agenda semanal...</p>
                </div>
            </div>
        `;
        grid = document.getElementById('agenda-weekly-grid');
    }

    window.changeAgendaSector = (sec) => {
        AppState.activeAgendaSector = sec;
        if (grid) grid.innerHTML = '<p>Cargando agenda semanal...</p>';
        renderAgendaModule(container);
    };

    const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const daysList = [];
    const today = new Date();

    for (let i = 0; i < 8; i++) {
        const d = new Date();
        d.setDate(today.getDate() + i);
        daysList.push(d);
    }

    const isHoldExpired = (orderDate, orderTime) => {
        const match = (orderTime || '').match(/(\d{2}):(\d{2})/);
        let hours = 8, minutes = 0;
        if (match) {
            hours = parseInt(match[1]);
            minutes = parseInt(match[2]);
        }
        const appointmentDate = new Date(`${orderDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
        const expirationDate = new Date(appointmentDate.getTime() + 60 * 60 * 1000); // 60 mins later
        return new Date() > expirationDate;
    };

    const parseSlotStart = (orderDate, orderTime) => {
        const match = (orderTime || '').match(/(\d{2}):(\d{2})/);
        let hours = 8, minutes = 0;
        if (match) {
            hours = parseInt(match[1]);
            minutes = parseInt(match[2]);
        }
        return new Date(`${orderDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
    };

    const getElapsedMinutes = (orderDate, orderTime) => {
        const start = parseSlotStart(orderDate, orderTime);
        const now = new Date();
        const diffMs = now - start;
        return diffMs / (60 * 1000);
    };

    const interpolateColor = (color1, color2, factor) => {
        const r = Math.round(color1[0] + factor * (color2[0] - color1[0]));
        const g = Math.round(color1[1] + factor * (color2[1] - color1[1]));
        const b = Math.round(color1[2] + factor * (color2[2] - color1[2]));
        return `rgb(${r}, ${g}, ${b})`;
    };

    const getSlotMinutes = (slot) => {
        const match = slot.match(/(\d{2}):(\d{2})/);
        if (match) return parseInt(match[1]) * 60 + parseInt(match[2]);
        return 9999;
    };

    const isRegularSlot = (dayOfWeek, slot) => {
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            return ["08:00 - 10:00", "10:00 - 12:00", "13:00 - 15:00", "15:00 - 17:00"].includes(slot);
        }
        if (dayOfWeek === 6) {
            return ["08:00 - 10:00", "10:00 - 12:00"].includes(slot);
        }
        return false;
    };

    const drawAgenda = (orders) => {
        const visibleDays = daysList.filter(day => {
            const year = day.getFullYear();
            const month = String(day.getMonth() + 1).padStart(2, '0');
            const dateNum = String(day.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${dateNum}`;
            const dayOfWeek = day.getDay();

            if (dayOfWeek === 0) {
                const sundayOrders = orders.filter(o => o.fecha === dateStr && (o.sector || '').toLowerCase().trim() === AppState.activeAgendaSector.toLowerCase().trim());
                const hasAppt = sundayOrders.some(o => {
                    const stateLower = (o.estado || '').toLowerCase().trim();
                    if (['cancelada', 'expirada'].includes(stateLower)) return false;
                    if (stateLower === 'borrador') return !isHoldExpired(o.fecha, o.hora);
                    return true;
                });
                return hasAppt;
            }
            return true;
        });

        if (!grid) return;
        grid.style.gridTemplateColumns = `repeat(${visibleDays.length}, minmax(180px, 1fr))`;

        if (grid.innerHTML.includes('Cargando') || grid.children.length === 0) {
            grid.innerHTML = '';
            visibleDays.forEach(day => {
                const year = day.getFullYear();
                const month = String(day.getMonth() + 1).padStart(2, '0');
                const dateNum = String(day.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${dateNum}`;
                const weekdayName = WEEKDAYS[day.getDay()];
                const dateLabel = `${day.getDate()} ${MONTHS[day.getMonth()]}`;
                const dayOfWeek = day.getDay();
                const isToday = dateStr === today.toISOString().split('T')[0];

                const normalSlots = [];
                if (dayOfWeek >= 1 && dayOfWeek <= 5) {
                    normalSlots.push("08:00 - 10:00", "10:00 - 12:00", "13:00 - 15:00", "15:00 - 17:00");
                } else if (dayOfWeek === 6) {
                    normalSlots.push("08:00 - 10:00", "10:00 - 12:00");
                }

                const ordersOnDate = orders.filter(o => o.fecha === dateStr && (o.sector || '').toLowerCase().trim() === AppState.activeAgendaSector.toLowerCase().trim());
                const extraSlotsSet = new Set();
                ordersOnDate.forEach(o => {
                    if (o.hora && !normalSlots.includes(o.hora)) {
                        extraSlotsSet.add(o.hora);
                    }
                });

                const allSlots = [...normalSlots, ...extraSlotsSet];
                allSlots.sort((a, b) => getSlotMinutes(a) - getSlotMinutes(b));

                const col = document.createElement('div');
                col.className = 'agenda-column';
                if (isToday) col.classList.add('agenda-column-today');

                const canManageExtraordinary = RBAC.isAsesor() || RBAC.isJefe() || RBAC.isDev();

                let colHtml = `
                    <div class="agenda-column-header ${isToday ? 'header-today' : ''}">
                        <div class="agenda-column-dayname">${weekdayName}</div>
                        <div class="agenda-column-date">${dateLabel}</div>
                    </div>
                    <div class="agenda-column-body">
                `;

                if (canManageExtraordinary && dayOfWeek !== 0) {
                    colHtml += `
                        <div class="extra-slot-btn-container" style="text-align: center; margin-bottom: 8px;">
                            <button class="extra-slot-btn" onclick="bookExtraordinarySlot('${dateStr}', 'before', event)">+</button>
                        </div>
                    `;
                }

                allSlots.forEach(slot => {
                    const slotClean = slot.replace(/[^a-zA-Z0-9]/g, '');
                    colHtml += `<div id="shell-${dateStr}-${slotClean}" class="slot-card-shell"></div>`;
                });

                if (canManageExtraordinary && dayOfWeek !== 0) {
                    if (dayOfWeek === 6) {
                        colHtml += `
                            <div class="extra-slot-btn-container" style="text-align: center; margin-top: 8px; margin-bottom: 8px;">
                                <button class="extra-slot-btn" onclick="bookExtraordinarySlot('${dateStr}', 'saturday_late', event)">+</button>
                            </div>
                        `;
                    }
                    colHtml += `
                        <div class="extra-slot-btn-container" style="text-align: center; margin-top: 8px;">
                            <button class="extra-slot-btn" onclick="bookExtraordinarySlot('${dateStr}', 'after', event)">+</button>
                        </div>
                    `;
                }

                colHtml += `</div>`;
                col.innerHTML = colHtml;
                grid.appendChild(col);
            });
        }

        visibleDays.forEach(day => {
            const year = day.getFullYear();
            const month = String(day.getMonth() + 1).padStart(2, '0');
            const dateNum = String(day.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${dateNum}`;
            const dayOfWeek = day.getDay();

            const normalSlots = [];
            if (dayOfWeek >= 1 && dayOfWeek <= 5) {
                normalSlots.push("08:00 - 10:00", "10:00 - 12:00", "13:00 - 15:00", "15:00 - 17:00");
            } else if (dayOfWeek === 6) {
                normalSlots.push("08:00 - 10:00", "10:00 - 12:00");
            }

            const ordersOnDate = orders.filter(o => o.fecha === dateStr && (o.sector || '').toLowerCase().trim() === AppState.activeAgendaSector.toLowerCase().trim());
            const extraSlotsSet = new Set();
            ordersOnDate.forEach(o => {
                if (o.hora && !normalSlots.includes(o.hora)) {
                    extraSlotsSet.add(o.hora);
                }
            });

            const allSlots = [...normalSlots, ...extraSlotsSet];
            allSlots.sort((a, b) => getSlotMinutes(a) - getSlotMinutes(b));

            allSlots.forEach(slot => {
                const slotOrders = ordersOnDate.filter(o => o.hora === slot);
                const activeLocks = slotOrders.filter(o => (o.estado || '').toLowerCase().trim() === 'reservando');
                const confirmedOrder = slotOrders.find(o => !['borrador', 'reservando', 'cancelada', 'expirada'].includes((o.estado || '').toLowerCase().trim()));
                const activeDrafts = slotOrders.filter(o => (o.estado || '').toLowerCase().trim() === 'borrador' && !isHoldExpired(o.fecha, o.hora));

                const isRegular = isRegularSlot(dayOfWeek, slot);
                const hasAppt = confirmedOrder || activeDrafts.length > 0 || activeLocks.length > 0;

                const slotClean = slot.replace(/[^a-zA-Z0-9]/g, '');
                const shellEl = document.getElementById(`shell-${dateStr}-${slotClean}`);
                if (!shellEl) return;

                if (!isRegular && !hasAppt && !isPowerUser) {
                    shellEl.innerHTML = '';
                    return;
                }

                let slotHtml = '';
                if (activeLocks.length > 0) {
                    slotHtml = `
                        <div class="agenda-slot-card card-locking" style="border-left: 5px solid #a1887f;">
                            <div class="card-slot-time">⏱️ ${slot}</div>
                            <div class="card-confirmed-title">
                                <strong>Reservando...</strong>
                            </div>
                            <div class="card-confirmed-info">
                                👤 Creador: ${activeLocks[0].vendedor || 'Otro usuario'}<br>
                                ⏳ Bloqueo temporal activo
                            </div>
                        </div>
                    `;
                } else if (confirmedOrder) {
                    const p = (confirmedOrder.prioridad || 'Normal').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    let pColor = '#28a745';
                    if (p === 'alta') pColor = '#fd7e14';
                    else if (p === 'maxima' || p === 'urgente') pColor = '#dc3545';

                    const configColors = AppState.config?.Agenda || {};
                    const statusColor = configColors[`Color_${confirmedOrder.estado}`] || '#007bff';

                    const elapsed = getElapsedMinutes(confirmedOrder.fecha, confirmedOrder.hora);
                    const statusLower = (confirmedOrder.estado || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    const isReceived = !['pendiente', 'asignada', 'en camino', 'llego'].includes(statusLower);

                    let cardStyle = `border-left: 5px solid ${statusColor};`;
                    if (!isReceived && elapsed > 0) {
                        const factor = Math.min(1, Math.max(0, elapsed / 40));
                        const blueRgb = [224, 242, 254];
                        const redRgb = [252, 165, 165];
                        const bgColor = interpolateColor(blueRgb, redRgb, factor);
                        cardStyle += ` background-color: ${bgColor} !important;`;
                    }

                    slotHtml = `
                        <div class="agenda-slot-card card-confirmed" style="${cardStyle}">
                            <div class="card-slot-time">⏱️ ${slot} - Confirmado</div>
                            <div class="card-confirmed-title">
                                <span class="priority-dot" style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:${pColor}; margin-right:5px;" title="Prioridad: ${confirmedOrder.prioridad}"></span>
                                <strong>${confirmedOrder.cliente || 'S/N'}</strong>
                            </div>
                            <div class="card-confirmed-info">
                                🚗 ${confirmedOrder.marca || ''} ${confirmedOrder.modelo || ''}<br>
                                👤 <small>${confirmedOrder.tecnicoasignado || 'Sin asignar'}</small>
                            </div>
                            <div class="card-status-badge">
                                <span class="badge" style="background:${statusColor}; color:white; font-size:0.7rem; padding: 2px 6px;">${confirmedOrder.estado}</span>
                            </div>
                        </div>
                    `;
                } else if (activeDrafts.length > 0) {
                    activeDrafts.forEach((draft, idx) => {
                        const p = (draft.prioridad || 'Normal').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        let pColor = '#28a745';
                        if (p === 'alta') pColor = '#fd7e14';
                        else if (p === 'maxima' || p === 'urgente') pColor = '#dc3545';

                        const elapsed = getElapsedMinutes(draft.fecha, draft.hora);
                        let cardStyle = '';
                        if (elapsed > 0) {
                            const factor = Math.min(1, Math.max(0, elapsed / 40));
                            const yellowRgb = [254, 243, 199];
                            const redRgb = [252, 165, 165];
                            const bgColor = interpolateColor(yellowRgb, redRgb, factor);

                            const yellowBorder = [245, 158, 11];
                            const redBorder = [239, 68, 68];
                            const borderCol = interpolateColor(yellowBorder, redBorder, factor);
                            cardStyle = `style="background-color: ${bgColor} !important; border: 1px dashed ${borderCol} !important; color: #78350f;"`;
                        }

                        slotHtml += `
                            <div class="agenda-slot-card card-draft" ${cardStyle}>
                                <div class="card-slot-time" style="color: #856404;">⏱️ ${slot} - Reservado (Hold ${idx + 1}/2)</div>
                                <div class="card-draft-title">
                                    <span class="priority-dot" style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:${pColor}; margin-right:5px;" title="Prioridad: ${draft.prioridad}"></span>
                                    <strong>${draft.cliente || 'Sin nombre'}</strong>
                                </div>
                                <div class="card-draft-info">
                                    👤 Vend: ${draft.vendedor || 'S/V'}<br>
                                    ⚠️ Pendiente Confirmar
                                </div>
                            </div>
                        `;
                    });

                    if (activeDrafts.length === 1) {
                        slotHtml += `
                            <div class="agenda-slot-card card-available-partial" onclick="bookSlot('${dateStr}', '${slot}', event)">
                                <div class="card-slot-time">⏱️ ${slot}</div>
                                <div class="card-available-text">🟢 Hold 2 de 2 Disponible</div>
                                <button class="btn btn-sm btn-outline-primary" style="padding: 2px 5px; font-size:0.7rem; margin-top:5px; width:100%;">+ Apartar</button>
                            </div>
                        `;
                    }
                } else {
                    slotHtml = `
                        <div class="agenda-slot-card card-available" onclick="bookSlot('${dateStr}', '${slot}', event)">
                            <div class="card-slot-time">⏱️ ${slot}</div>
                            <div class="card-available-text">🟢 Disponible</div>
                            <button class="btn btn-sm btn-outline-secondary" style="padding: 2px 5px; font-size:0.7rem; margin-top:5px; width:100%;">+ Reservar</button>
                        </div>
                    `;
                }

                if (shellEl.innerHTML !== slotHtml) {
                    shellEl.innerHTML = slotHtml;
                }
            });
        });
    };

    try {
        const cached = await dbGetAll('orders');
        if (cached && cached.length > 0) {
            drawAgenda(cached);
        }
    } catch (e) {
        console.warn("IndexedDB read error:", e);
    }

    try {
        const ordersRes = await routeAction('GOS_CORE', 'getOrders');
        if (ordersRes.status === 'success') {
            const orders = ordersRes.data;
            await dbClear('orders');
            for (let o of orders) {
                await dbSet('orders', o.id, o);
            }
            drawAgenda(orders);
        }
    } catch (error) {
        console.error("Error al actualizar agenda semanal en segundo plano:", error);
    }

    if (dashboardInterval) clearInterval(dashboardInterval);
    dashboardInterval = setInterval(async () => {
        if (AppState.currentSection === 'agenda') {
            try {
                const res = await routeAction('GOS_CORE', 'getOrders');
                if (res.status === 'success') {
                    await dbClear('orders');
                    for (let o of res.data) {
                        await dbSet('orders', o.id, o);
                    }
                    drawAgenda(res.data);
                }
            } catch (err) {
                console.warn("Silent background agenda update failed:", err);
            }
        }
    }, 30000);
}

function showDropMenu(anchor, options, onSelect) {
    const existing = document.querySelector('.gos-drop-menu');
    if (existing) {
        existing.remove();
    }

    const menu = document.createElement('div');
    menu.className = 'gos-drop-menu';
    menu.style.position = 'absolute';
    menu.style.zIndex = '2000';
    menu.style.background = 'rgba(255, 255, 255, 0.94)';
    menu.style.backdropFilter = 'blur(6px)';
    menu.style.border = '1px solid rgba(226, 232, 240, 0.9)';
    menu.style.borderRadius = '8px';
    menu.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)';
    menu.style.padding = '6px 0';
    menu.style.minWidth = '170px';
    menu.style.display = 'flex';
    menu.style.flexDirection = 'column';

    options.forEach(opt => {
        const item = document.createElement('div');
        item.style.padding = '8px 16px';
        item.style.fontSize = '0.85rem';
        item.style.color = '#1e293b';
        item.style.cursor = 'pointer';
        item.style.transition = 'background-color 0.2s';
        item.textContent = opt.label;

        item.onmouseenter = () => {
            item.style.backgroundColor = 'rgba(59, 130, 246, 0.08)';
        };
        item.onmouseleave = () => {
            item.style.backgroundColor = 'transparent';
        };
        item.onclick = (e) => {
            e.stopPropagation();
            onSelect(opt.value);
            menu.remove();
        };
        menu.appendChild(item);
    });

    document.body.appendChild(menu);

    const rect = anchor.getBoundingClientRect();
    const menuWidth = menu.offsetWidth || 170;
    let left = rect.left + window.scrollX;
    if (left + menuWidth > window.innerWidth) {
        left = window.innerWidth - menuWidth - 10;
    }
    let top = rect.bottom + window.scrollY;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    const clickOutside = (e) => {
        if (!menu.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', clickOutside);
        }
    };
    setTimeout(() => {
        document.addEventListener('click', clickOutside);
    }, 10);
}

window.bookSlot = (date, slot, event) => {
    if (event) {
        event.stopPropagation();
    }
    const anchor = event ? (event.currentTarget || event.target) : null;

    const proceedWithBooking = async (selectedType) => {
        try {
            const lockRes = await routeAction('GOS_CORE', 'lockSlot', {
                date,
                slot,
                username: AppState.user?.Nombre_Usuario || 'Carlos Ruiz'
            });
            if (lockRes.status !== 'success') {
                showToast("⚠️ " + (lockRes.message || 'El cupo ya está siendo reservado por otro usuario.'), true);
                if (AppState.currentSection === 'agenda') {
                    const contentEl = document.getElementById('section-content');
                    renderAgendaModule(contentEl);
                }
                return;
            }
            AppState.activeLock = { date, slot };
        } catch (err) {
            console.error("Error locking slot:", err);
            showToast("⚠️ Error al reservar cupo: " + err.message, true);
            return;
        }

        const contentEl = document.getElementById('section-content');
        renderOrderForm(contentEl);

        setTimeout(() => {
            const tipoTrabajoSelect = document.getElementById('order-tipo-trabajo');
            if (tipoTrabajoSelect) {
                let exists = false;
                for (let opt of tipoTrabajoSelect.options) {
                    if (opt.value === selectedType) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    const newOpt = document.createElement('option');
                    newOpt.value = selectedType;
                    newOpt.textContent = selectedType;
                    tipoTrabajoSelect.appendChild(newOpt);
                }
                tipoTrabajoSelect.value = selectedType;
                tipoTrabajoSelect.dispatchEvent(new Event('change'));
            }

            const dateInput = document.getElementById('order-fecha');
            if (dateInput) {
                dateInput.value = date;
                dateInput.dispatchEvent(new Event('change'));
            }
            const horaSelect = document.getElementById('order-hora');
            if (horaSelect) {
                let exists = false;
                for (let option of horaSelect.options) {
                    if (option.value === slot) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    const newOpt = document.createElement('option');
                    newOpt.value = slot;
                    newOpt.textContent = slot;
                    horaSelect.appendChild(newOpt);
                }
                horaSelect.value = slot;
                horaSelect.dispatchEvent(new Event('change'));
            }
        }, 400);
    };

    const options = [
        { label: "Instalación nueva", value: "Instalación nueva" },
        { label: "Revisión por falla", value: "Revisión por falla" },
        { label: "Desinstalación", value: "Desinstalación" },
        { label: "Mantenimiento", value: "Mantenimiento" },
        { label: "Traspaso", value: "Traspaso" }
    ];

    if (anchor) {
        showDropMenu(anchor, options, proceedWithBooking);
    } else {
        proceedWithBooking("Instalación nueva");
    }
};

window.bookExtraordinarySlot = (date, position, event) => {
    let slot = '17:00 - 19:00';
    if (position === 'before') {
        slot = '06:00 - 08:00';
    } else if (position === 'saturday_late') {
        slot = '12:00 - 14:00';
    }
    window.bookSlot(date, slot, event);
};

window.authorizeOrder = async (orderId, coords) => {
    if (confirm(`¿Desea autorizar y asignar el cupo #${orderId}?`)) {
        await markStatus(orderId, 'Asignada', 'Cupo Autorizado por Jefatura');
        await routeAction('GOS_CORE', 'autoAssignTechnical', { orderId, coordinates: coords });
        loadSection('ordenes');
    }
};

window.cancelOrder = async (orderId) => {
    if (confirm(`¿Desea cancelar el cupo #${orderId}?`)) {
        await markStatus(orderId, 'Cancelada', 'Cupo Cancelado por Usuario');
        loadSection('ordenes');
    }
};

async function renderOrdersModule(container) {
    const showNewOrder = RBAC.canCreateCupo();
    container.innerHTML = `
        <div class="actions-bar" style="${showNewOrder ? '' : 'display:none;'}">
            <button id="new-order-btn" class="btn btn-primary">Nueva Orden</button>
        </div>
        <div id="orders-list" class="orders-table-container">
            <p>Cargando órdenes...</p>
        </div>
    `;

    if (showNewOrder) {
        document.getElementById('new-order-btn').addEventListener('click', () => {
            renderOrderForm(container);
        });
    }

    try {
        const result = await routeAction('GOS_CORE', 'getOrders');
        if (result.status === 'success') {
            const listContainer = document.getElementById('orders-list');
            let filteredData = result.data || [];
            const isTechnician = ['tecnico', 'técnico', 'instalador'].includes((AppState.user?.Privilegios || '').toLowerCase().trim());
            if (isTechnician) {
                const techSector = (AppState.user?.Sector || 'San Pedro Sula').toLowerCase().trim();
                filteredData = filteredData.filter(order => (order.sector || '').toLowerCase().trim() === techSector);
            }

            if (filteredData.length === 0) {
                listContainer.innerHTML = '<p>No hay órdenes registradas en esta división.</p>';
            } else {
                let tableHtml = `
                    <table class="gos-table">
                        <thead>
                            <tr>
                                <th>Fecha</th><th>Cliente</th><th>Vehículo</th><th>Estado</th><th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                filteredData.forEach(order => {
                    const status = order.estado || 'Pendiente';
                    tableHtml += `
                        <tr data-id="${order.id}" data-coords="${order.coordenadas || ''}">
                            <td>${order.fecha}</td>
                            <td>${order.cliente}</td>
                            <td>${order.marca} ${order.modelo}</td>
                            <td>${UI_TEMPLATES.badge(status)}</td>
                            <td class="actions-cell">
                                <div style="display:flex; gap:5px; flex-wrap:wrap;">
                                    ${status === 'Asignada' ? `<button class="btn btn-sm btn-secondary" title="Marcar En camino" onclick="markStatus('${order.id}', 'En Camino')">En camino</button>` : ''}
                                    ${['En Camino', 'Llegó', 'Vehículo recibido'].includes(status) ? `<button class="btn btn-sm btn-primary" title="Finalizar" onclick="markStatus('${order.id}', 'Finalizada')">Finalizar</button>` : ''}

                                    ${status.toLowerCase() === 'borrador' && RBAC.canAuthorizeCupo() ? `<button class="btn btn-sm btn-success" title="Autorizar Cupo" onclick="authorizeOrder('${order.id}', '${order.coordenadas}')">✅ Autorizar</button>` : ''}
                                    ${RBAC.canDeleteCupo(order) && status.toLowerCase() !== 'cancelada' && status.toLowerCase() !== 'finalizada' ? `<button class="btn btn-sm btn-danger" title="Cancelar Cupo" onclick="cancelOrder('${order.id}')">🚫 Cancelar</button>` : ''}

                                    <button class="btn btn-sm btn-outline" title="Drive" onclick="openDrive('${order.id}', '${order.cliente}')">📂</button>
                                    <button class="btn btn-sm btn-outline" title="Maps" onclick="openMaps('${order.coordenadas}')">📍</button>
                                </div>
                            </td>
                        </tr>
                    `;
                });
                tableHtml += '</tbody></table>';
                listContainer.innerHTML = tableHtml;
            }
        }
    } catch (error) {
        console.error("Error al cargar órdenes:", error);
    }
}

function renderOrderForm(container) {
    const config = AppState.config || {};

    const buildOptions = (category, defaultList = []) => {
        const options = config[category] ? Object.values(config[category]) : defaultList;
        return options.map(opt => `<option value="${opt}">${opt}</option>`).join('');
    };

    container.innerHTML = UI_TEMPLATES.orderForm({
        servicios: buildOptions('Servicios', ['Básico', 'Full']),
        tiposTrabajo: buildOptions('TiposTrabajo', ['Instalación', 'Revisión por falla', 'Mantenimiento', 'Desinstalación', 'Reinstalación', 'Otros']),
        prioridades: buildOptions('Prioridades', ['Normal', 'Alta', 'Máxima'])
    });

    document.getElementById('cancel-order-btn').addEventListener('click', () => loadSection('ordenes'));

    // Auto-fill Date logic:
    const initDateAutocomplete = async () => {
        const dateInput = document.getElementById('order-fecha');
        if (!dateInput || dateInput.value) return; // Only auto-fill if empty

        try {
            const ordersRes = await routeAction('GOS_CORE', 'getOrders');
            if (ordersRes.status === 'success') {
                const orders = ordersRes.data;
                const sector = AppState.user?.Sector || 'San Pedro Sula';
                let maxTechCount = 4;
                const techCountRes = await routeAction('GOS_CORE', 'getDivisionTechniciansCount', { sector });
                if (techCountRes.status === 'success' && techCountRes.count) {
                    maxTechCount = techCountRes.count;
                }

                const hasAvailableNormalSlots = (dateStr) => {
                    const d = new Date(dateStr + 'T00:00:00');
                    const dow = d.getDay();
                    if (dow === 0) return false;

                    const normalSlots = [];
                    if (dow >= 1 && dow <= 5) {
                        normalSlots.push("08:00 - 10:00", "10:00 - 12:00", "13:00 - 15:00", "15:00 - 17:00");
                    } else if (dow === 6) {
                        normalSlots.push("08:00 - 10:00", "10:00 - 12:00");
                    }

                    const sectorOrders = orders.filter(o => o.fecha === dateStr && (o.sector || '').toLowerCase().trim() === sector.toLowerCase().trim());
                    return normalSlots.some(slot => {
                        const slotOrders = sectorOrders.filter(o => o.hora === slot);
                        const activeOrders = slotOrders.filter(o => !['cancelada', 'expirada'].includes((o.estado || '').toLowerCase().trim()));
                        return activeOrders.length < maxTechCount;
                    });
                };

                const findFirstAvailableDate = () => {
                    const today = new Date();
                    for (let i = 0; i < 30; i++) {
                        const d = new Date();
                        d.setDate(today.getDate() + i);
                        const dateStr = d.toISOString().split('T')[0];
                        if (hasAvailableNormalSlots(dateStr)) {
                            return dateStr;
                        }
                    }
                    return today.toISOString().split('T')[0];
                };

                const autoDate = findFirstAvailableDate();
                if (dateInput && !dateInput.value) {
                    dateInput.value = autoDate;
                    dateInput.dispatchEvent(new Event('change'));
                }
            }
        } catch (err) {
            console.error("Error autocomplete date:", err);
            if (dateInput && !dateInput.value) {
                dateInput.value = new Date().toISOString().split('T')[0];
                dateInput.dispatchEvent(new Event('change'));
            }
        }
    };
    initDateAutocomplete();

    // Configuración inicial de Sector y lógica de Borrador para Asesores
    const sectorSelect = document.getElementById('order-sector');
    const warningMsgDiv = document.getElementById('order-warning-msg');
    const assignBtn = document.getElementById('submit-order-assign-btn');
    const draftBtn = document.getElementById('submit-order-draft-btn');

    if (sectorSelect) {
        // Pre-poblar con el sector del usuario
        sectorSelect.value = AppState.user?.Sector || 'San Pedro Sula';

        const isRegularSlot = (dow, slot) => {
            if (dow >= 1 && dow <= 5) {
                return ["08:00 - 10:00", "10:00 - 12:00", "13:00 - 15:00", "15:00 - 17:00"].includes(slot);
            }
            if (dow === 6) {
                return ["08:00 - 10:00", "10:00 - 12:00"].includes(slot);
            }
            return false;
        };

        const checkSectorPermission = () => {
            const selectedSector = sectorSelect.value;
            const userSector = AppState.user?.Sector || 'San Pedro Sula';
            const isAsesor = RBAC.isAsesor();

            const fechaVal = document.getElementById('order-fecha')?.value;
            const horaVal = document.getElementById('order-hora')?.value;
            let isExtraordinary = false;
            if (fechaVal && horaVal) {
                const d = new Date(fechaVal + 'T00:00:00');
                isExtraordinary = !isRegularSlot(d.getDay(), horaVal);
            }

            if (isAsesor && isExtraordinary) {
                if (assignBtn) assignBtn.style.display = 'none';
                if (warningMsgDiv) {
                    warningMsgDiv.textContent = '⚠️ Los cupos extraordinarios solo pueden ser guardados como Borrador por Asesores. La confirmación y asignación requiere la autorización de un Jefe de División.';
                    warningMsgDiv.style.display = 'block';
                }
            } else if (isAsesor && selectedSector !== userSector) {
                if (assignBtn) assignBtn.style.display = 'none';
                if (warningMsgDiv) {
                    warningMsgDiv.textContent = '⚠️ Estás programando en otra división. Debes guardar como Borrador para esperar la autorización del Jefe de División correspondiente.';
                    warningMsgDiv.style.display = 'block';
                }
            } else {
                if (assignBtn) assignBtn.style.display = 'inline-block';
                if (warningMsgDiv) warningMsgDiv.style.display = 'none';
            }
        };

        const checkRetrasoWarning = async () => {
            const fechaVal = document.getElementById('order-fecha')?.value;
            const horaVal = document.getElementById('order-hora')?.value;
            const sectorVal = sectorSelect?.value || 'San Pedro Sula';
            const retrasoDiv = document.getElementById('retraso-warning-msg');
            if (!retrasoDiv) return;

            if (!fechaVal || !horaVal) {
                retrasoDiv.style.display = 'none';
                return;
            }

            const match = horaVal.match(/^(\d{2}):(\d{2})/);
            if (!match) {
                retrasoDiv.style.display = 'none';
                return;
            }

            const hours = parseInt(match[1]);
            const minutes = parseInt(match[2]);
            const turnStart = new Date(`${fechaVal}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
            const now = new Date();
            const tenMinsAfter = new Date(turnStart.getTime() + 10 * 60 * 1000);

            if (now >= tenMinsAfter) {
                try {
                    const res = await routeAction('GOS_CORE', 'getOrders');
                    if (res.status === 'success') {
                        const orders = res.data;
                        const currentSlotMin = getSlotMinutes(horaVal);
                        const hasSubsequent = orders.some(o => {
                            if (o.fecha !== fechaVal) return false;
                            if ((o.sector || '').toLowerCase().trim() !== sectorVal.toLowerCase().trim()) return false;
                            if (['cancelada', 'expirada'].includes((o.estado || '').toLowerCase().trim())) return false;
                            return getSlotMinutes(o.hora) > currentSlotMin;
                        });

                        if (hasSubsequent) {
                            retrasoDiv.innerHTML = `⚠️ Advertencia de Horario: La instalación iniciará con retraso debido a que la reserva se realiza 10 minutos o más después del inicio del turno. Existe la posibilidad de que el técnico finalice más tarde de lo previsto, ya que tiene otra asignación programada posteriormente.`;
                            retrasoDiv.style.display = 'block';
                            return;
                        }
                    }
                } catch (err) {
                    console.error("Error checking subsequent bookings:", err);
                }
            }
            retrasoDiv.style.display = 'none';
        };

        sectorSelect.addEventListener('change', checkSectorPermission);
        document.getElementById('order-fecha')?.addEventListener('change', checkSectorPermission);
        document.getElementById('order-hora')?.addEventListener('change', checkSectorPermission);
        checkSectorPermission();

        sectorSelect.addEventListener('change', checkRetrasoWarning);
        document.getElementById('order-fecha')?.addEventListener('change', checkRetrasoWarning);
        document.getElementById('order-hora')?.addEventListener('change', checkRetrasoWarning);
        checkRetrasoWarning();

        // --------------------------------------------------------------------
        // BÚSQUEDA INTELIGENTE DE UBICACIONES GUARDADAS & SUGERENCIAS
        // --------------------------------------------------------------------
        const savedLocInput = document.getElementById('order-saved-loc-search');
        const savedLocSuggestions = document.getElementById('suggestions-saved-loc');
        const locationNameSaveInput = document.getElementById('order-location-name-save');
        const orderDireccionInput = document.getElementById('order-direccion');
        const orderCoordsInput = document.getElementById('order-coords');
        const orderMapsLinkInput = document.getElementById('order-maps-link');

        let allSavedLocations = [];

        const loadSavedLocations = async () => {
            try {
                const res = await routeAction('GOS_CORE', 'getSavedLocations');
                if (res.status === 'success') {
                    allSavedLocations = res.data || [];
                }
            } catch (err) {
                console.error("Error al cargar ubicaciones guardadas:", err);
            }
        };

        loadSavedLocations();


        const saveLocationBtn = document.getElementById('save-location-btn');
        if (saveLocationBtn) {
            saveLocationBtn.addEventListener('click', () => {
                const name = prompt("Ingrese el nombre para guardar esta ubicación:");
                if (name) {
                    if (locationNameSaveInput) locationNameSaveInput.value = name;
                    saveLocationBtn.textContent = `✔️ Guardado: ${name}`;
                    saveLocationBtn.className = "btn btn-sm btn-success";
                }
            });
        }

        if (savedLocInput) {
            savedLocInput.addEventListener('input', () => {
                const val = savedLocInput.value.trim();
                if (orderDireccionInput) orderDireccionInput.value = val;

                savedLocSuggestions.innerHTML = '';
                if (!val) {
                    savedLocSuggestions.style.display = 'none';
                    if (saveLocationBtn) saveLocationBtn.style.display = 'none';
                    return;
                }

                const matches = allSavedLocations.filter(loc =>
                    isApproximateMatch(val, loc.nombre || '') ||
                    isApproximateMatch(val, loc.direccion || '')
                );

                if (matches.length > 0) {
                    savedLocSuggestions.style.display = 'block';
                    if (saveLocationBtn) saveLocationBtn.style.display = 'none';

                    matches.forEach(loc => {
                        const div = document.createElement('div');
                        div.className = 'suggestion-item';
                        div.style.padding = '8px';
                        div.style.cursor = 'pointer';
                        div.style.borderBottom = '1px solid #eee';
                        div.innerHTML = `📍 <strong>${loc.nombre}</strong><br><small style="color:#718096;">${loc.direccion || 'Sin dirección'}</small>`;

                        div.onclick = () => {
                            savedLocInput.value = loc.direccion || loc.nombre;
                            if (locationNameSaveInput) locationNameSaveInput.value = loc.nombre;
                            if (orderDireccionInput) orderDireccionInput.value = loc.direccion || '';
                            if (orderCoordsInput) {
                                orderCoordsInput.value = loc.coordenadas || '';
                                if (formMap && formMarker && loc.coordenadas) {
                                    const [latVal, lngVal] = loc.coordenadas.split(',').map(Number);
                                    const pos = [latVal, lngVal];
                                    formMarker.setLatLng(pos);
                                    formMap.setView(pos, 15);
                                }
                            }
                            if (orderMapsLinkInput) orderMapsLinkInput.value = loc.linkmaps || `https://www.google.com/maps/search/?api=1&query=${loc.coordenadas}`;

                            savedLocSuggestions.style.display = 'none';
                        };
                        savedLocSuggestions.appendChild(div);
                    });
                } else {
                    savedLocSuggestions.style.display = 'none';
                    if (saveLocationBtn) {
                        saveLocationBtn.style.display = 'inline-block';
                        saveLocationBtn.textContent = '💾 Guardar ubicación';
                        saveLocationBtn.className = "btn btn-sm btn-outline-primary";
                    }
                }
            });

            document.addEventListener('click', (e) => {
                if (e.target !== savedLocInput) {
                    savedLocSuggestions.style.display = 'none';
                }
            });
        }

        // --------------------------------------------------------------------
        // UTILERIAS DE GEOLOCALIZACION Y MAPAS ABIERTOS (LEAFLET / NOMINATIM)
        // --------------------------------------------------------------------
        const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
            const R = 6371000; // Earth radius in meters
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                      Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        };

        const isNearExistingSavedLocation = (lat, lng, allLocations) => {
            return allLocations.some(loc => {
                if (!loc.coordenadas) return false;
                const [lLat, lLng] = loc.coordenadas.split(',').map(Number);
                const dist = calculateDistanceMeters(lat, lng, lLat, lLng);
                return dist >= 50 && dist <= 100;
            });
        };

        const parseGoogleMapsLink = (url) => {
            const regex = /@(-?\d+\.\d+),(-?\d+\.\d+)|query=(-?\d+\.\d+),(-?\d+\.\d+)|q=(-?\d+\.\d+),(-?\d+\.\d+)/;
            const match = url.match(regex);
            if (match) {
                const lat = parseFloat(match[1] || match[3] || match[5]);
                const lng = parseFloat(match[2] || match[4] || match[6]);
                return { lat, lng };
            }
            return null;
        };

        const reverseGeocode = async (lat, lng) => {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
                    headers: {
                        'User-Agent': 'GOS-GPS-Operations-Suite'
                    }
                });
                const data = await res.json();
                return data.display_name || `📍 Coordenadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            } catch (err) {
                console.error("Error reverse geocoding:", err);
                return `📍 Coordenadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            }
        };

        // Listen for Google Maps links, raw coordinates, or addresses in the Location search field:
        if (savedLocInput) {
            savedLocInput.addEventListener('change', async () => {
                const val = savedLocInput.value.trim();
                let lat = null, lng = null;

                // 1. Check Google Maps link
                if (val.startsWith('http') && (val.includes('google.com/maps') || val.includes('maps.google') || val.includes('goo.gl/maps') || val.includes('maps.app.goo.gl'))) {
                    const parsed = parseGoogleMapsLink(val);
                    if (parsed) {
                        lat = parsed.lat;
                        lng = parsed.lng;
                    }
                }
                // 2. Check raw coordinates string, e.g. "15.5042, -88.0250" or "15.5042 -88.0250"
                else {
                    const coordMatch = val.match(/^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/);
                    const coordSpaceMatch = val.match(/^\s*(-?\d+\.\d+)\s+(-?\d+\.\d+)\s*$/);
                    if (coordMatch) {
                        lat = parseFloat(coordMatch[1]);
                        lng = parseFloat(coordMatch[2]);
                    } else if (coordSpaceMatch) {
                        lat = parseFloat(coordSpaceMatch[1]);
                        lng = parseFloat(coordSpaceMatch[2]);
                    }
                }

                if (lat !== null && lng !== null) {
                    if (orderCoordsInput) orderCoordsInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                    if (orderMapsLinkInput) orderMapsLinkInput.value = val.startsWith('http') ? val : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

                    if (formMap && formMarker) {
                        formMarker.setLatLng([lat, lng]);
                        formMap.setView([lat, lng], 15);
                    }

                    const address = await reverseGeocode(lat, lng);
                    savedLocInput.value = address;
                    if (orderDireccionInput) orderDireccionInput.value = address;

                    const isNear = isNearExistingSavedLocation(lat, lng, allSavedLocations);
                    if (isNear) {
                        if (saveLocationBtn) saveLocationBtn.style.display = 'none';
                    } else {
                        if (saveLocationBtn) {
                            saveLocationBtn.style.display = 'inline-block';
                            saveLocationBtn.textContent = '💾 Guardar ubicación';
                            saveLocationBtn.className = "btn btn-sm btn-outline-primary";
                        }
                    }
                }
            });
        }

        // --------------------------------------------------------------------
        // SELECTOR INTERACTIVO DE MAPA LEAFLET (OPENSTREETMAP)
        // --------------------------------------------------------------------
        const mapPickerEl = document.getElementById('form-map-picker');
        let formMap = null;
        let formMarker = null;

        const cityCenters = {
            'San Pedro Sula': { lat: 15.5042, lng: -88.0250 },
            'Tegucigalpa': { lat: 14.0818, lng: -87.2068 },
            'La Ceiba': { lat: 15.7597, lng: -86.7865 },
            'Choluteca': { lat: 13.3000, lng: -87.1833 },
            'Occidente': { lat: 14.7667, lng: -88.7833 }
        };

        const initFormMapPicker = () => {
            if (window.L && mapPickerEl) {
                const selectedSector = sectorSelect ? sectorSelect.value : 'San Pedro Sula';
                const center = cityCenters[selectedSector] || cityCenters['San Pedro Sula'];

                mapPickerEl.innerHTML = ''; // Limpiar indicador texto

                formMap = L.map(mapPickerEl).setView([center.lat, center.lng], 13);

                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '© OpenStreetMap contributors'
                }).addTo(formMap);

                formMarker = L.marker([center.lat, center.lng], { draggable: true }).addTo(formMap);

                const handleMapClick = async (lat, lng) => {
                    if (orderCoordsInput) orderCoordsInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                    if (orderMapsLinkInput) orderMapsLinkInput.value = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

                    formMarker.setLatLng([lat, lng]);

                    const address = await reverseGeocode(lat, lng);
                    if (savedLocInput) {
                        savedLocInput.value = address;
                    }
                    if (orderDireccionInput) {
                        orderDireccionInput.value = address;
                    }

                    const isNear = isNearExistingSavedLocation(lat, lng, allSavedLocations);
                    if (isNear) {
                        if (saveLocationBtn) saveLocationBtn.style.display = 'none';
                    } else {
                        if (saveLocationBtn && savedLocInput.value.trim()) {
                            saveLocationBtn.style.display = 'inline-block';
                            saveLocationBtn.textContent = '💾 Guardar ubicación';
                            saveLocationBtn.className = "btn btn-sm btn-outline-primary";
                        }
                    }
                };

                formMap.on('click', (e) => {
                    handleMapClick(e.latlng.lat, e.latlng.lng);
                });

                formMarker.on('dragend', (e) => {
                    const pos = formMarker.getLatLng();
                    handleMapClick(pos.lat, pos.lng);
                });

                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition((pos) => {
                        const userLat = pos.coords.latitude;
                        const userLng = pos.coords.longitude;
                        if (!orderCoordsInput.value) {
                            formMap.setView([userLat, userLng], 14);
                            formMarker.setLatLng([userLat, userLng]);
                        }
                    }, (err) => console.log("Geolocation center error:", err));
                }
            }
        };

        // Escuchar cambios de sector para re-centrar mapapicker
        if (sectorSelect) {
            sectorSelect.addEventListener('change', () => {
                if (formMap && window.L) {
                    const center = cityCenters[sectorSelect.value] || cityCenters['San Pedro Sula'];
                    formMap.setView([center.lat, center.lng], 13);
                    formMarker.setLatLng([center.lat, center.lng]);
                }
            });
        }

        // Ejecutar inicialización de mapa de formulario con retraso
        setTimeout(initFormMapPicker, 600);
    }

    const vinInput = document.getElementById('order-vin');
    const historyContainer = document.getElementById('vehicle-history-container');

    vinInput.addEventListener('blur', async () => {
        const vin = vinInput.value.trim();
        if (!vin) {
            historyContainer.style.display = 'none';
            return;
        }

        try {
            historyContainer.innerHTML = '<p style="color:var(--secondary); font-style:italic;">Buscando historial del vehículo...</p>';
            historyContainer.style.display = 'block';

            const result = await routeAction('GOS_CORE', 'getVehicleHistory', { vin });
            if (result.status === 'success' && result.history && result.history.length > 0) {
                const hist = result.history;

                // Buscar si posee registros previos de instalación
                const hasPrevInstallation = hist.some(h => {
                    const t = (h.tipotrabajo || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    return t.includes('instalacion') || t.includes('reinstalacion');
                });

                const lastRecord = hist[hist.length - 1]; // Usar el último registro para autocompletar

                let warningHtml = '';
                if (hasPrevInstallation) {
                    warningHtml = `
                        <div style="background: #fff3cd; color: #856404; border: 1px solid #ffeeba; padding: 15px; border-radius: 8px; margin-bottom: 15px; font-weight: bold;">
                            ⚠️ ¡ATENCIÓN ASISTENTE DE VENTAS! Este vehículo ya posee un GPS instalado anteriormente en nuestro sistema. (Clasificado como Vehículo Usado).
                        </div>
                    `;
                    const clasifSelect = document.getElementById('order-clasificacion');
                    if (clasifSelect) clasifSelect.value = 'Vehículo usado';
                }

                let historyListHtml = `
                    <div style="background: #f8f9fa; border: 1px solid #eee; padding: 15px; border-radius: 8px; margin-top: 10px;">
                        ${warningHtml}
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 8px;">
                            <h4 style="margin:0; color:var(--dark);">Memoria Histórica del Vehículo</h4>
                            <button type="button" class="btn btn-sm btn-primary" id="autofill-vehicle-btn" style="padding: 4px 10px; font-size: 0.8rem;">📦 Autocompletar Datos</button>
                        </div>

                        <div style="margin-bottom:15px; font-size: 0.9rem; line-height: 1.4;">
                            <strong>Últimos Datos Registrados:</strong><br>
                            🚗 Vehículo: ${lastRecord.marca || ''} ${lastRecord.modelo || ''} (${lastRecord.anio || ''}) | Color: ${lastRecord.color || ''} | Placa: ${lastRecord.placa || ''} | Motor: ${lastRecord.motor || ''}
                            ${(lastRecord.fotos && (lastRecord.fotos.frontal || lastRecord.fotos.posterior || lastRecord.fotos.interior_derecho)) ? `
                            <div style="margin-top:10px;">
                                <strong>📷 Fotografías del Historial:</strong>
                                <div style="display:flex; gap:10px; margin-top:5px; flex-wrap: wrap;">
                                    ${lastRecord.fotos.frontal ? `<img src="${lastRecord.fotos.frontal}" style="width:70px; height:70px; object-fit:cover; border-radius:4px; border:1px solid #ddd; cursor:pointer;" onclick="window.open('${lastRecord.fotos.frontal}', '_blank')" title="Vista Frontal">` : ''}
                                    ${lastRecord.fotos.posterior ? `<img src="${lastRecord.fotos.posterior}" style="width:70px; height:70px; object-fit:cover; border-radius:4px; border:1px solid #ddd; cursor:pointer;" onclick="window.open('${lastRecord.fotos.posterior}', '_blank')" title="Vista Posterior">` : ''}
                                    ${lastRecord.fotos.interior_derecho ? `<img src="${lastRecord.fotos.interior_derecho}" style="width:70px; height:70px; object-fit:cover; border-radius:4px; border:1px solid #ddd; cursor:pointer;" onclick="window.open('${lastRecord.fotos.interior_derecho}', '_blank')" title="Lado Derecho / Interior">` : ''}
                                </div>
                            </div>
                            ` : ''}
                        </div>

                        <strong>Historial Operativo de Servicios:</strong>
                        <table class="gos-table" style="margin-top: 10px; font-size:0.8rem;">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Tipo de Trabajo</th>
                                    <th>Técnico</th>
                                    <th>Sector/División</th>
                                    <th>Lugar de Ejecución</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${hist.map(h => `
                                    <tr>
                                        <td>${h.fecha || ''}</td>
                                        <td><strong>${h.tipotrabajo || ''}</strong></td>
                                        <td>${h.tecnico || ''}</td>
                                        <td><span class="badge" style="background:#e2e3e5; color:#383d41;">${h.sector || ''}</span></td>
                                        <td><small>${h.lugar || ''}</small></td>
                                        <td><small>${h.estado || ''}</small></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;

                historyContainer.innerHTML = historyListHtml;
                historyContainer.style.display = 'block';

                // Configurar acción del botón autocompletar
                document.getElementById('autofill-vehicle-btn').onclick = (e) => {
                    e.preventDefault();
                    document.getElementById('order-marca').value = lastRecord.marca || '';
                    document.getElementById('order-modelo').value = lastRecord.modelo || '';
                    document.getElementById('order-motor').value = lastRecord.motor || '';
                    document.getElementById('order-anio').value = lastRecord.anio || '';
                    document.getElementById('order-placa').value = lastRecord.placa || '';
                    document.getElementById('order-color').value = lastRecord.color || '';
                    alert("¡Campos del vehículo autocompletados desde el historial!");
                };

            } else {
                // Es un vehículo nuevo o sin registros previos
                historyContainer.innerHTML = `
                    <div style="background: #d4edda; color: #155724; border: 1px solid #c3e6cb; padding: 12px; border-radius: 8px; font-weight: bold;">
                        🚗 No se encontraron registros previos para este chasis. Clasificado tentativamente como Vehículo Nuevo.
                    </div>
                `;
                historyContainer.style.display = 'block';
                const clasifSelect = document.getElementById('order-clasificacion');
                if (clasifSelect) clasifSelect.value = 'Vehículo nuevo';
            }
        } catch (err) {
            console.error("Error al consultar historial:", err);
            historyContainer.style.display = 'none';
        }
    });

    // --------------------------------------------------------------------
    // CONTROLADORES DE SERVICIOS Y TIPO DE SERVICIO DROPDOWN
    // --------------------------------------------------------------------
    const serviceTracklink = document.getElementById('service-tracklink');
    const serviceControlcar = document.getElementById('service-controlcar');
    const tipoServicioContainer = document.getElementById('tipo-servicio-container');

    const toggleTipoServicio = () => {
        if (serviceTracklink && serviceTracklink.checked) {
            tipoServicioContainer.style.display = 'block';
        } else {
            tipoServicioContainer.style.display = 'none';
        }
    };

    if (serviceTracklink) {
        serviceTracklink.addEventListener('change', toggleTipoServicio);
    }
    if (serviceControlcar) {
        serviceControlcar.addEventListener('change', toggleTipoServicio);
    }

    // --------------------------------------------------------------------
    // VISIBILIDAD DINÁMICA DEL CAMPO PLACA
    // --------------------------------------------------------------------
    const orderAnio = document.getElementById('order-anio');
    const orderPlacaContainer = document.getElementById('order-placa-container');
    const orderPlaca = document.getElementById('order-placa');

    const checkPlacaVisibility = () => {
        if (!orderAnio) return;
        const val = parseInt(orderAnio.value.trim(), 10);
        const currentYear = new Date().getFullYear();
        if (!isNaN(val) && val < currentYear) {
            if (orderPlacaContainer) orderPlacaContainer.style.display = 'block';
        } else {
            if (orderPlacaContainer) {
                orderPlacaContainer.style.display = 'none';
                if (orderPlaca) orderPlaca.value = '';
            }
        }
    };

    if (orderAnio) {
        orderAnio.addEventListener('input', checkPlacaVisibility);
        orderAnio.addEventListener('change', checkPlacaVisibility);
    }

    // --------------------------------------------------------------------
    // AUTOCOMPLETADO EN TIEMPO REAL DE CLIENTE Y VEHÍCULOS
    // --------------------------------------------------------------------
    const clientInput = document.getElementById('order-cliente');
    const clientSuggestions = document.getElementById('suggestions-client');
    const inventarioInput = document.getElementById('order-inventario');
    const inventarioLabel = document.getElementById('order-inventario-label');
    const brandInput = document.getElementById('order-marca');
    const brandSuggestions = document.getElementById('suggestions-brand');

    let cachedClients = [];
    let cachedOrders = [];
    let selectedClientVehicles = [];

    const loadClientsAndOrders = async () => {
        try {
            const clientsRes = await routeAction('GOS_CORE', 'getClients');
            if (clientsRes.status === 'success') {
                cachedClients = clientsRes.data || [];
            }
            const ordersRes = await routeAction('GOS_CORE', 'getOrders');
            if (ordersRes.status === 'success') {
                cachedOrders = ordersRes.data || [];
            }
        } catch (e) {
            console.error("Error cargando clientes u órdenes:", e);
        }
    };
    loadClientsAndOrders();

    if (clientInput && clientSuggestions) {
        clientInput.addEventListener('input', () => {
            const val = clientInput.value.trim().toLowerCase();
            clientSuggestions.innerHTML = '';
            selectedClientVehicles = []; // Reset on typing
            if (brandSuggestions) brandSuggestions.style.display = 'none';

            if (!val) {
                clientSuggestions.style.display = 'none';
                return;
            }

            const matches = cachedClients.filter(c =>
                (c.nombre || '').toLowerCase().includes(val) ||
                (c.empresa || '').toLowerCase().includes(val)
            );

            if (matches.length > 0) {
                clientSuggestions.style.display = 'block';
                matches.forEach(c => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    div.style.padding = '8px';
                    div.style.cursor = 'pointer';
                    div.style.borderBottom = '1px solid #eee';
                    div.innerHTML = `👤 <strong>${c.nombre}</strong> <small style="color:#718096;">${c.empresa ? '| ' + c.empresa : ''}</small>`;

                    div.onclick = () => {
                        clientInput.value = c.nombre || '';
                        clientSuggestions.style.display = 'none';

                        // Autocompletar datos del cliente
                        const contactoInput = document.getElementById('order-contacto');
                        const telefonoInput = document.getElementById('order-telefono');
                        if (contactoInput) contactoInput.value = c.direccion || '';
                        if (telefonoInput) telefonoInput.value = c.telefono || '';

                        // Validar si el cliente utiliza inventario (tiene empresa no vacía)
                        if (c.empresa && c.empresa.trim() !== '') {
                            if (inventarioInput) inventarioInput.setAttribute('required', 'required');
                            if (inventarioLabel) inventarioLabel.innerHTML = 'Número de Inventario <span style="color:red;">*</span>';
                        } else {
                            if (inventarioInput) inventarioInput.removeAttribute('required');
                            if (inventarioLabel) inventarioLabel.textContent = 'Inventario';
                        }

                        // Buscar vehículos en el historial
                        const cName = (c.nombre || '').toLowerCase().trim();
                        const seenVins = new Set();
                        selectedClientVehicles = [];

                        cachedOrders.forEach(o => {
                            if ((o.cliente || '').toLowerCase().trim() === cName) {
                                const vin = (o.vin || '').trim();
                                if (vin && !seenVins.has(vin)) {
                                    seenVins.add(vin);
                                    selectedClientVehicles.push(o);
                                }
                            }
                        });

                        // "Si encuentra un cliente registrado: Deberá completar automáticamente la información personal del cliente y la información del vehículo si el cliente solamente tiene un vehículo."
                        if (selectedClientVehicles.length === 1) {
                            const v = selectedClientVehicles[0];
                            if (brandInput) brandInput.value = v.marca || '';
                            document.getElementById('order-modelo').value = v.modelo || '';
                            document.getElementById('order-color').value = v.color || '';
                            document.getElementById('order-anio').value = v.anio || '';
                            document.getElementById('order-motor').value = v.motor || '';
                            document.getElementById('order-vin').value = v.vin || '';
                            document.getElementById('order-placa').value = v.placa || '';

                            // Desencadenar eventos para placa e historial
                            if (orderAnio) {
                                checkPlacaVisibility();
                            }
                            const vinInput = document.getElementById('order-vin');
                            if (vinInput) {
                                vinInput.dispatchEvent(new Event('blur'));
                            }
                        } else {
                            // "Clientes con Múltiples Vehículos: completar cliente, mantener vacía la información específica del vehículo."
                            if (brandInput) brandInput.value = '';
                            document.getElementById('order-modelo').value = '';
                            document.getElementById('order-color').value = '';
                            document.getElementById('order-anio').value = '';
                            document.getElementById('order-motor').value = '';
                            document.getElementById('order-vin').value = '';
                            document.getElementById('order-placa').value = '';
                            if (orderPlacaContainer) orderPlacaContainer.style.display = 'none';
                        }
                    };
                    clientSuggestions.appendChild(div);
                });
            } else {
                clientSuggestions.style.display = 'none';
            }
        });

        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (e.target !== clientInput) {
                clientSuggestions.style.display = 'none';
            }
        });
    }

    if (brandInput && brandSuggestions) {
        brandInput.addEventListener('input', () => {
            const val = brandInput.value.trim().toLowerCase();
            brandSuggestions.innerHTML = '';
            if (!val || selectedClientVehicles.length <= 1) {
                brandSuggestions.style.display = 'none';
                return;
            }

            const matches = selectedClientVehicles.filter(v =>
                (v.marca || '').toLowerCase().includes(val)
            );

            if (matches.length > 0) {
                brandSuggestions.style.display = 'block';
                matches.forEach(v => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    div.style.padding = '8px';
                    div.style.cursor = 'pointer';
                    div.style.borderBottom = '1px solid #eee';
                    const last6 = (v.vin || '').slice(-6);
                    div.innerHTML = `🚗 <strong>${v.marca}</strong> | ${v.modelo || ''} | ${v.placa || 'Sin placa'} | ${last6}`;

                    div.onclick = () => {
                        brandInput.value = v.marca || '';
                        document.getElementById('order-modelo').value = v.modelo || '';
                        document.getElementById('order-color').value = v.color || '';
                        document.getElementById('order-anio').value = v.anio || '';
                        document.getElementById('order-motor').value = v.motor || '';
                        document.getElementById('order-vin').value = v.vin || '';
                        document.getElementById('order-placa').value = v.placa || '';

                        brandSuggestions.style.display = 'none';

                        // Desencadenar eventos
                        if (orderAnio) {
                            checkPlacaVisibility();
                        }
                        const vinInput = document.getElementById('order-vin');
                        if (vinInput) {
                            vinInput.dispatchEvent(new Event('blur'));
                        }
                    };
                    brandSuggestions.appendChild(div);
                });
            } else {
                brandSuggestions.style.display = 'none';
            }
        });

        document.addEventListener('click', (e) => {
            if (e.target !== brandInput) {
                brandSuggestions.style.display = 'none';
            }
        });
    }

    let isDraftMode = false;
    const btnDraftSubmit = document.getElementById('submit-order-draft-btn');
    const btnAssignSubmit = document.getElementById('submit-order-assign-btn');

    if (btnDraftSubmit) {
        btnDraftSubmit.addEventListener('click', (e) => {
            isDraftMode = true;
            const form = document.getElementById('order-form');
            form.dispatchEvent(new Event('submit', { cancelable: true }));
        });
    }
    if (btnAssignSubmit) {
        btnAssignSubmit.addEventListener('click', (e) => {
            isDraftMode = false;
        });
    }

    document.getElementById('order-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        // 1. Programmatic validation
        const val_fecha = document.getElementById('order-fecha')?.value;
        const val_hora = document.getElementById('order-hora')?.value;
        const val_cliente = document.getElementById('order-cliente')?.value.trim();

        if (!val_fecha || !val_hora || !val_cliente) {
            alert("⚠️ Error de validación: Los campos Fecha, Hora y Cliente son obligatorios para guardar.");
            return;
        }

        if (!isDraftMode) {
            // Validar campos obligatorios para confirmación
            const val_marca = document.getElementById('order-marca')?.value.trim();
            const val_modelo = document.getElementById('order-modelo')?.value.trim();
            const val_color = document.getElementById('order-color')?.value.trim();
            const val_anio = document.getElementById('order-anio')?.value.trim();
            const val_motor = document.getElementById('order-motor')?.value.trim();
            const val_vin = document.getElementById('order-vin')?.value.trim();

            if (!val_marca || !val_modelo || !val_color || !val_anio || !val_motor || !val_vin) {
                alert("⚠️ Error de validación: Para confirmar y asignar una Orden, debe completar la información del vehículo (Marca, Modelo, Color, Año, Número de motor y Número de chasis/VIN).");
                return;
            }

            // Validar servicios
            const chk_tracklink = document.getElementById('service-tracklink')?.checked;
            const chk_controlcar = document.getElementById('service-controlcar')?.checked;

            if (!chk_tracklink && !chk_controlcar) {
                alert("⚠️ Error de validación: Debe seleccionar al menos un Servicio (Tracklink o Controlcar) para confirmar la orden.");
                return;
            }

            if (chk_tracklink) {
                const val_tipo_serv = document.getElementById('order-tipo-servicio')?.value;
                if (!val_tipo_serv) {
                    alert("⚠️ Error de validación: Debe seleccionar un Tipo de servicio para Tracklink.");
                    return;
                }
            }

            // Validar inventario obligatorio si el cliente utiliza inventario
            const inventarioInputEl = document.getElementById('order-inventario');
            if (inventarioInputEl && inventarioInputEl.hasAttribute('required') && !inventarioInputEl.value.trim()) {
                alert("⚠️ Error de validación: El campo Inventario es obligatorio para este cliente.");
                return;
            }
        }

        const formData = new FormData(e.target);
        const payload = Object.fromEntries(formData.entries());
        payload.vendedor = AppState.user?.Nombre_Usuario || 'Carlos Ruiz';

        // Compilar campo servicio
        const servicesSelected = [];
        if (document.getElementById('service-tracklink')?.checked) {
            const trackType = document.getElementById('order-tipo-servicio')?.value || 'Básico (Roadlink)';
            servicesSelected.push(`Tracklink (${trackType})`);
        }
        if (document.getElementById('service-controlcar')?.checked) {
            servicesSelected.push('Controlcar');
        }
        payload.servicio = servicesSelected.join(', ');
        if (!payload.sector) {
            payload.sector = AppState.user?.Sector || 'San Pedro Sula';
        }

        try {
            // 0. Validar capacidad del turno/cupo
            const ordersRes = await routeAction('GOS_CORE', 'getOrders');
            if (ordersRes.status === 'success') {
                const activeOrdersInSlot = ordersRes.data.filter(o => {
                    if (o.fecha !== payload.fecha || o.hora !== payload.hora) return false;
                    const sectorOfUser = AppState.user?.Sector || 'San Pedro Sula';
                    if ((o.sector || '').toLowerCase().trim() !== sectorOfUser.toLowerCase().trim()) return false;
                    // Excluir canceladas o expiradas
                    const stateLower = (o.estado || '').toLowerCase().trim();
                    if (['cancelada', 'expirada'].includes(stateLower)) return false;
                    if (stateLower === 'borrador') {
                        // Comprobar si ya expiró el borrador (60 mins de hold)
                        const match = (o.hora || '').match(/(\d{2}):(\d{2})/);
                        let hours = 8, minutes = 0;
                        if (match) {
                            hours = parseInt(match[1]);
                            minutes = parseInt(match[2]);
                        }
                        const apptDate = new Date(`${o.fecha}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
                        const expDate = new Date(apptDate.getTime() + 60 * 60 * 1000);
                        if (new Date() > expDate) return false;
                    }
                    return true;
                });

                // Determinar si el slot es regular o extraordinario
                const selectedDate = new Date(payload.fecha + 'T00:00:00');
                const dayOfWeek = selectedDate.getDay();

                const isRegularSlot = (dow, slot) => {
                    if (dow >= 1 && dow <= 5) {
                        return ["08:00 - 10:00", "10:00 - 12:00", "13:00 - 15:00", "15:00 - 17:00"].includes(slot);
                    }
                    if (dow === 6) {
                        return ["08:00 - 10:00", "10:00 - 12:00"].includes(slot);
                    }
                    return false; // Domingos son extraordinarios
                };

                const isRegular = isRegularSlot(dayOfWeek, payload.hora);

                const isAsesor = RBAC.isAsesor();
                if (!isRegular && isAsesor && !isDraftMode) {
                    alert("⚠️ Error: Como Asesor de Venta, únicamente tienes permitido guardar cupos extraordinarios como Borrador. La confirmación y asignación requiere la autorización de un Jefe de División.");
                    return;
                }

                const priorityLower = (payload.prioridad || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                if (isRegular) {
                    let maxTechCount = 4;
                    try {
                        const techCountRes = await routeAction('GOS_CORE', 'getDivisionTechniciansCount', {
                            sector: payload.sector,
                            date: payload.fecha,
                            slot: payload.hora
                        });
                        if (techCountRes.status === 'success') {
                            maxTechCount = techCountRes.count || 4;
                        }
                    } catch (errTech) {
                        console.error("Error al obtener capacidad de técnicos:", errTech);
                    }

                    if (activeOrdersInSlot.length >= maxTechCount) {
                        alert(`⚠️ Error de Capacidad: El turno regular seleccionado ya cuenta con el límite máximo de ${maxTechCount} cupos, correspondiente a la cantidad de técnicos activos de esta división (${payload.sector}).`);
                        return;
                    }
                } else {
                    // Turno extraordinario
                    if (!['alta', 'maxima', 'urgente'].includes(priorityLower)) {
                        alert("⚠️ Error de Prioridad: Los cupos extraordinarios solo pueden programarse para trabajos con prioridad Alta o Máxima.");
                        return;
                    }
                    if (activeOrdersInSlot.length >= 1) {
                        alert("⚠️ Error de Capacidad: El turno extraordinario seleccionado ya está ocupado (límite de 1 cupo).");
                        return;
                    }
                }
            }

            // 1. Crear Orden
            if (isDraftMode) {
                payload.estado = 'Borrador';
            }
            const result = await routeAction('GOS_CORE', 'createOrder', payload);
            if (result.status === 'success') {
                AppState.activeLock = null; // Clear lock
                const orderId = result.orderId;

                // Guardar/Incrementar Uso de Ubicación en Base de Datos
                const locationNameVal = document.getElementById('order-location-name-save')?.value.trim();
                if (locationNameVal) {
                    try {
                        await routeAction('GOS_CORE', 'saveSavedLocation', {
                            nombre: locationNameVal,
                            direccion: payload.direccion,
                            coordenadas: payload.coordenadas,
                            division: payload.sector
                        });
                    } catch (errLoc) {
                        console.error("Error al registrar ubicación guardada:", errLoc);
                    }
                }

                if (isDraftMode) {
                    alert(`Cupo apartado como Borrador exitosamente (Orden #${orderId}). Espere autorización de Jefatura.`);
                    loadSection('ordenes');
                    return;
                }

                // 2. Disparar Auto-Asignación
                const assignResult = await routeAction('GOS_CORE', 'autoAssignTechnical', {
                    orderId,
                    coordinates: payload.coordenadas
                });

                if (assignResult.status === 'pending_confirmation') {
                    UI_TEMPLATES.modal(
                        'Asignación Requerida',
                        assignResult.message,
                        async () => {
                            // Re-intentar forzando la asignación
                            const forceResult = await routeAction('GOS_CORE', 'autoAssignTechnical', {
                                orderId,
                                coordinates: payload.coordenadas,
                                force: true
                            });
                            if (forceResult.status === 'success') {
                                notifyChange(`Orden #${orderId} asignada a ${forceResult.tecnico}`);
                                loadSection('ordenes');
                            } else {
                                alert(`Error al forzar asignación: ${forceResult.message}`);
                            }
                        },
                        () => {
                            notifyChange('Asignación Pendiente de Revisión Manual');
                            loadSection('ordenes');
                        }
                    );
                } else if (assignResult.status === 'success') {
                    alert(`Orden #${orderId} creada y asignada a: ${assignResult.tecnico}`);
                    loadSection('ordenes');
                } else {
                    alert(`Orden #${orderId} creada pero falló asignación automática: ${assignResult.message}`);
                    loadSection('ordenes');
                }

                loadSection('ordenes');
            }
        } catch (error) {
            alert('Error en el proceso: ' + error.message);
        }
    });
}

function setupAuthListeners() {
    const loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorEl = document.getElementById('login-error');

        try {
            const result = await routeAction('AUTH', 'login', { username, password });
            if (result.status === 'success') {
                AppState.setUser(result.user);
                await AppState.loadConfig();
                showMainView(result.user);
            }
        } catch (error) {
            errorEl.textContent = error.message;
            errorEl.style.display = 'block';
        }
    });

    document.getElementById('logout-btn').addEventListener('click', (e) => {
        e.preventDefault();
        AppState.clearUser();
        location.reload();
    });
}

async function showMainView(user) {
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('main-view').style.display = 'block';
    document.getElementById('welcome-msg').textContent = `Hola, ${user.Nombre_Usuario || 'Usuario'}`;

    try {
        const result = await routeAction('GOS_CORE', 'getUserSector', { username: user.Nombre_Usuario });
        if (result.status === 'success') {
            user.Sector = result.sector;
        } else {
            user.Sector = 'San Pedro Sula';
        }
    } catch (e) {
        console.error("Error al obtener sector:", e);
        user.Sector = 'San Pedro Sula';
    }

    const navAgenda = document.querySelector('.nav-links [data-section="agenda"]');
    if (navAgenda) {
        navAgenda.style.display = 'inline-block';
    }

    // RBAC: Mostrar enlace a Métricas Administrativas si el rol lo amerita
    const isChiefOrManager = ['jefe', 'gerente', 'desarrollador', 'jefe de tienda', 'administrador'].includes((user.Privilegios || '').toLowerCase().trim());
    const navAdmin = document.getElementById('nav-admin');
    if (navAdmin) {
        if (isChiefOrManager) {
            navAdmin.style.display = 'inline-block';
        } else {
            navAdmin.style.display = 'none';
        }
    }

    loadSection('agenda');
}

let mapInstance = null;
let markers = [];

function initMap() {
    console.log("Google Maps API inicializada");
}

function calculateEstimatedDuration(tipoTrabajo, subTipo = '') {
    const t = (tipoTrabajo || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (t.includes('instalacion nueva') || t.includes('instalación nueva') || t === 'instalacion' || t === 'instalación') {
        return 120; // 90 min install + 30 min traslado/margen
    }
    if (t.includes('revision por falla') || t.includes('revisión por falla')) {
        const s = (subTipo || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (s.includes('cambio de unidad')) {
            if (s.includes('no compatible') || s.includes('diferente')) {
                return 60; // Instalación completa de 60 mins
            }
            return 30; // compatible -> reprogramación (e.g. 30 mins)
        }
        if (s.includes('cambio de arnes') || s.includes('cambio de arnés')) {
            return 60;
        }
        if (s.includes('reparacion de conexion') || s.includes('reparación de conexión') || s.includes('conexion') || s.includes('conexión')) {
            return 35; // Rango 30-40 minutos (e.g. 35 mins)
        }
        return 60; // Diagnóstico inicial de duración indeterminada, mostramos 60 como marcador
    }
    if (t.includes('traspaso')) return 180;
    if (t.includes('desinstalacion') || t.includes('desinstalación')) return 60;
    if (t.includes('mantenimiento')) return 15;
    return 30; // Por defecto
}

function getWaitTimeInMinutes(order) {
    const obs = order.observaciones || '';
    const match = obs.match(/\[WaitStart:\s*([^\]]+)\]/);
    if (match) {
        const start = new Date(match[1]);
        const elapsedMs = new Date() - start;
        return Math.floor(elapsedMs / (1000 * 60));
    }
    return 0;
}

async function openDrive(orderId, cliente) {
    try {
        const result = await routeAction('GOS_CORE', 'getOrCreateOrderFolder', { orderId, cliente });
        if (result.status === 'success') {
            window.open(result.folderUrl, '_blank');
        } else {
            alert("Error al abrir Drive: " + result.message);
        }
    } catch (e) {
        alert("Error de conexión con Drive");
    }
}

function openMaps(coordenadas) {
    if (!coordenadas) {
        alert("No hay coordenadas disponibles para esta orden.");
        return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${coordenadas}`;
    window.open(url, '_blank');
}

function updateMap(techs) {
    const mapEl = document.getElementById('tech-map');
    if (!mapEl) return;

    if (!mapInstance && window.google) {
        mapInstance = new google.maps.Map(mapEl, {
            center: { lat: 9.9333, lng: -84.0833 },
            zoom: 12
        });
    }

    if (mapInstance) {
        // Limpiar markers previos
        markers.forEach(m => m.setMap(null));
        markers = [];

        techs.forEach(t => {
            if (t.lat && t.lng) {
                const marker = new google.maps.Marker({
                    position: { lat: parseFloat(t.lat), lng: parseFloat(t.lng) },
                    map: mapInstance,
                    title: t.nombre,
                    label: t.nombre.charAt(0)
                });
                markers.push(marker);
            }
        });
    }
}

/**
 * Renderiza el Dashboard Operativo con métricas y órdenes de trabajo filtradas por sector.
 */
async function renderDashboardModule(container) {
    const user = AppState.user;
    if (!user) {
        container.innerHTML = '<p>Por favor inicie sesión para ver esta información.</p>';
        return;
    }

    const isPowerUser = ['desarrollador', 'jefe', 'gerente', 'jefe de tienda', 'administrador'].includes((user.Privilegios || '').toLowerCase().trim());
    let activeSector = isPowerUser ? 'Todos' : (user.Sector || 'San Pedro Sula');

    let shell = document.getElementById('dashboard-shell-container');
    if (!shell) {
        container.innerHTML = `<div id="dashboard-shell-container"></div>`;
        shell = document.getElementById('dashboard-shell-container');
    }

    const updateDashboardView = (orders) => {
        const filteredOrders = orders.filter(order => {
            if (activeSector === 'Todos') return true;
            return (order.sector || '').toLowerCase().trim() === activeSector.toLowerCase().trim();
        });

        let html = `
            <div class="dashboard-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:15px;">
                <div>
                    <p style="margin:0; font-size:0.95rem; color:var(--secondary);">
                        Sector Operativo Activo: <strong id="sector-display" style="color:var(--primary); font-size:1.1rem;">${activeSector}</strong>
                    </p>
                </div>
        `;

        if (isPowerUser) {
            const sectores = ['Todos', 'San Pedro Sula', 'Tegucigalpa', 'La Ceiba', 'Choluteca', 'Occidente'];
            html += `
                <div>
                    <label style="font-weight:bold; margin-right:8px; font-size:0.9rem;">Zona Operativa:</label>
                    <select id="sector-selector" class="form-control" style="width:auto; display:inline-block; padding: 5px 10px;">
                        ${sectores.map(sec => `<option value="${sec}" ${activeSector === sec ? 'selected' : ''}>${sec}</option>`).join('')}
                    </select>
                </div>
            `;
        }

        html += `
            </div>
        `;

        if (isPowerUser) {
            const today = new Date();
            const nextWeek = new Date();
            nextWeek.setDate(today.getDate() + 7);

            const formatLocalDate = (d) => d.toISOString().split('T')[0];
            const startStr = formatLocalDate(today);
            const endStr = formatLocalDate(nextWeek);

            const weeklyInstalls = filteredOrders.filter(o => {
                const dateVal = o.fecha || '';
                const isInstall = ['instalacion', 'reinstalacion'].includes((o.tipotrabajo || '').toLowerCase().trim());
                return dateVal >= startStr && dateVal <= endStr && isInstall;
            });

            const techCounts = {};
            weeklyInstalls.forEach(o => {
                const t = o.tecnicoasignado || 'Sin asignar';
                techCounts[t] = (techCounts[t] || 0) + 1;
            });
            const chartData = Object.entries(techCounts).map(([label, value]) => ({ label, value }));

            html += `
                <div style="background: #e3f2fd; padding:15px; border-radius:8px; margin-bottom:20px; font-size:0.95rem; color:#0d47a1;">
                    📅 <strong>Planificación de Instalaciones de la Semana (Jefatura/Gerencia)</strong><br>
                    Mostrando instalaciones programadas desde hoy hasta el ${endStr}.
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-bottom:25px; flex-wrap:wrap;">
                    <div class="orders-table-container">
                        <h3 style="margin-top:0; margin-bottom:15px; border-bottom:2px solid var(--light); padding-bottom:8px; color:var(--dark);">Distribución de Trabajos</h3>
                        ${chartData.length > 0 ? UI_TEMPLATES.chart(chartData) : '<p style="color:var(--secondary); font-style:italic;">No hay instalaciones distribuidas esta semana.</p>'}
                    </div>
                    <div class="orders-table-container">
                        <h3 style="margin-top:0; margin-bottom:15px; border-bottom:2px solid var(--light); padding-bottom:8px; color:var(--dark);">Estados de Ejecución</h3>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:0.9rem;">
                            <div>⏳ Pendientes: <strong>${weeklyInstalls.filter(o => (o.estado || '').toLowerCase().trim() === 'pendiente').length}</strong></div>
                            <div>🔧 Asignadas: <strong>${weeklyInstalls.filter(o => (o.estado || '').toLowerCase().trim() === 'asignada').length}</strong></div>
                            <div>🚚 En Camino/Llegó: <strong>${weeklyInstalls.filter(o => ['en camino', 'llego'].includes((o.estado || '').toLowerCase().trim())).length}</strong></div>
                            <div>✅ Completadas: <strong>${weeklyInstalls.filter(o => ['finalizada', 'instalacion completada'].includes((o.estado || '').toLowerCase().trim())).length}</strong></div>
                        </div>
                    </div>
                </div>

                <div class="orders-table-container">
                    <h3 style="margin-top:0; margin-bottom:15px; border-bottom:2px solid var(--light); padding-bottom:8px; color:var(--dark);">Planificación Semanal de Instalaciones</h3>
                    <table class="gos-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Fecha Programada</th>
                                <th>Hora</th>
                                <th>Cliente</th>
                                <th>Vehículo</th>
                                <th>Prioridad</th>
                                <th>Estado de Ejecución</th>
                                <th>Técnico</th>
                                <th>Sector</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${weeklyInstalls.map(o => `
                                <tr>
                                    <td><strong>${o.id}</strong></td>
                                    <td>${o.fecha || ''}</td>
                                    <td>${o.hora || ''}</td>
                                    <td>${o.cliente || ''}</td>
                                    <td>${o.marca || ''} ${o.modelo || ''}</td>
                                    <td>${UI_TEMPLATES.priorityBadge(o.prioridad)}</td>
                                    <td>${UI_TEMPLATES.badge(o.estado)}</td>
                                    <td><small>${o.tecnicoasignado || 'Sin asignar'}</small></td>
                                    <td><span class="badge" style="background:#e8f4fd; color:#1a73e8;">${o.sector || ''}</span></td>
                                </tr>
                            `).join('')}
                            ${weeklyInstalls.length === 0 ? '<tr><td colspan="9" style="text-align:center; color:var(--secondary);">No hay instalaciones planificadas para esta semana.</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            const isTech = RBAC.isTech();
            const activeJobs = filteredOrders.filter(o => {
                const statusLower = (o.estado || '').toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
                const statusMatch = ['pendiente', 'asignada', 'en camino', 'llego', 'vehiculo recibido', 'iniciando', 'instalando', 'haciendo pruebas', 'instalacion completada', 'finalizada', 'trabajo retrasado', 'vehiculo no disponible'].includes(statusLower);
                if (!statusMatch) return false;

                if (isTech) {
                    const tAsignado = (o.tecnicoasignado || '').toString().toLowerCase().trim();
                    const userName = (user.Nombre_Completo || '').toString().toLowerCase().trim();
                    const userLogin = (user.Nombre_Usuario || '').toString().toLowerCase().trim();
                    return tAsignado === userName || tAsignado === userLogin || tAsignado.includes(userLogin) || userName.includes(tAsignado);
                }
                return true;
            });

            let motoAlertHtml = "";
            if (isTech) {
                const activeTechJob = activeJobs.find(o => !['finalizada', 'cancelada', 'expirada'].includes((o.estado || '').toLowerCase().trim()));
                if (activeTechJob) {
                    AppState.activeOrder = {
                        id: activeTechJob.id,
                        estado: activeTechJob.estado,
                        coordenadas: activeTechJob.coordenadas
                    };
                } else {
                    AppState.activeOrder = null;
                }

                // Alerta de Viaje en Moto 30 minutos antes (Notificación previa al técnico)
                const now = new Date();
                const todayStr = now.toISOString().split('T')[0];
                const upcomingMotoJob = activeJobs.find(o => {
                    const travelType = classifyTravel(o.direccion || '', o.sector || 'San Pedro Sula');
                    if (travelType !== "Viaje en moto") return false;
                    if (!['pendiente', 'asignada', 'en camino'].includes((o.estado || '').toLowerCase().trim())) return false;

                    const oDateStr = o.fecha || "";
                    if (oDateStr !== todayStr) return false;

                    const match = (o.hora || "").match(/(\d{2}):(\d{2})/);
                    if (!match) return false;
                    const schedTime = new Date(todayStr + "T" + match[1] + ":" + match[2] + ":00");
                    const diffMins = (schedTime - now) / (60 * 1000);
                    return (diffMins > 0 && diffMins <= 35);
                });

                if (upcomingMotoJob) {
                    motoAlertHtml = `
                        <div class="alert alert-warning" style="background:#fff3cd; color:#856404; border:1px solid #ffeeba; padding:15px; border-radius:8px; margin-bottom:20px; font-weight:bold; display:flex; align-items:center; gap:10px;">
                            <span>🚨 <strong>Aviso de Viaje en Moto:</strong> Debe iniciar su desplazamiento para la Orden <strong>#${upcomingMotoJob.id}</strong> en Choloma/Villanueva (programada para las ${upcomingMotoJob.hora}). ¡Por favor inicie su recorrido 30 minutos antes!</span>
                        </div>
                    `;
                }
            }

            if (motoAlertHtml) {
                html += motoAlertHtml;
            }

            html += `
                <div style="background: #f8f9fa; border: 1px solid #ddd; padding: 15px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <span style="font-weight:bold; color:var(--dark); font-size:1.1rem;">🛠️ Panel de Técnico: ${user.Nombre_Completo || user.Nombre_Usuario}</span><br>
                        <small style="color:var(--secondary);">Rol: ${user.Privilegios} | Sector: ${user.Sector}</small>
                    </div>
                    <button class="btn btn-secondary" id="btn-tech-change-pass" style="padding: 6px 12px; font-size:0.85rem;">🔄 Cambiar Mi Contraseña</button>
                </div>
            `;

            html += `
                <div class="orders-table-container">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:2px solid var(--light); padding-bottom:10px;">
                        <h3 style="margin:0; font-size:1.1rem; color:var(--dark);">Trabajos Programados y Asignaciones - Sector ${activeSector}</h3>
                        <span class="badge" style="background:var(--light); color:var(--secondary); font-size:0.8rem;">Total: ${activeJobs.length}</span>
                    </div>
                    <table class="gos-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Hora</th>
                                <th>Cliente</th>
                                <th>Vehículo</th>
                                <th>Prioridad</th>
                                <th>Estado de la Orden</th>
                                <th>Técnico</th>
                                <th style="min-width: 150px;">Control Operativo</th>
                                <th>Tickets</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            activeJobs.forEach(o => {
                const status = o.estado || 'Pendiente';
                const id = o.id;
                const time = o.hora || '--:--';
                const client = o.cliente || 'Sin nombre';
                const vehicle = `${o.marca || ''} ${o.modelo || ''}`.trim() || 'Desconocido';
                const priority = o.prioridad || 'Normal';
                const tech = o.tecnicoasignado || 'Sin asignar';

                let controlBtn = '';
                const statusLower = (status || '').toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

                if (statusLower === 'pendiente' || statusLower === 'asignada') {
                    controlBtn = `<button class="btn btn-sm btn-secondary" onclick="markStatus('${id}', 'En Camino')">🚚 Moviéndose al lugar</button>`;
                } else if (statusLower === 'en camino') {
                    controlBtn = `<small style="color:var(--primary); font-weight:bold;">🚚 En camino (Ubicación activa)</small>`;
                } else if (statusLower === 'llego') {
                    controlBtn = `
                        <div style="display:flex; flex-direction:column; gap:5px;">
                            <button class="btn btn-sm btn-success receive-vehicle-btn" data-id="${id}">🚗 Se recibió el vehículo</button>
                            <button class="btn btn-sm btn-danger not-available-btn" data-id="${id}">❌ Vehículo no disponible</button>
                        </div>
                    `;
                } else if (statusLower === 'vehiculo recibido') {
                    controlBtn = `<button class="btn btn-sm btn-primary" onclick="markStatus('${id}', 'Iniciando')">➡️ Iniciar Trabajo</button>`;
                } else if (statusLower === 'iniciando') {
                    controlBtn = `<button class="btn btn-sm btn-secondary" disabled>➡️ Iniciando Trabajo...</button>`;
                    setTimeout(() => {
                        markStatus(id, 'Instalando');
                    }, 1000);
                } else if (statusLower === 'instalando') {
                    const isRevision = (o.tipotrabajo || '').toLowerCase().includes('revision') || (o.tipotrabajo || '').toLowerCase().includes('revisión');
                    if (isRevision && !(o.observaciones || '').toLowerCase().includes('cambio') && !(o.observaciones || '').toLowerCase().includes('conexion') && !(o.observaciones || '').toLowerCase().includes('conexión') && !(o.observaciones || '').toLowerCase().includes('reparacion') && !(o.observaciones || '').toLowerCase().includes('reparación')) {
                        controlBtn = `<button class="btn btn-sm btn-warning diagnosis-btn" data-id="${id}">🔍 Registrar Diagnóstico</button>`;
                    } else {
                        controlBtn = `<button class="btn btn-sm btn-primary test-monitoreo-btn" data-id="${id}">📞 Iniciar Pruebas (Monitoreo)</button>`;
                    }
                } else if (statusLower === 'diagnostico realizado' || statusLower === 'diagnóstico realizado') {
                    controlBtn = `<button class="btn btn-sm btn-outline-primary diagnosis-btn" data-id="${id}">➡️ Seleccionar Intervención</button>`;
                } else if (statusLower === 'esperando autorizacion' || statusLower === 'esperando autorización') {
                    controlBtn = `<button class="btn btn-sm btn-success" onclick="markStatus('${id}', 'Instalando', 'Autorizado por Ventas')">✅ Autorizar e Instalar</button>`;
                } else if (statusLower === 'haciendo pruebas' || statusLower === 'pruebas con monitoreo') {
                    controlBtn = `<button class="btn btn-sm btn-primary" onclick="markStatus('${id}', 'Instalación completada')">➡️ Concluir Pruebas</button>`;
                } else if (statusLower === 'instalacion completada' || statusLower === 'terminando la instalacion' || statusLower === 'terminando la instalación') {
                    controlBtn = `<button class="btn btn-sm btn-success deliver-vehicle-btn" data-id="${id}">🤝 Entregar Vehículo</button>`;
                } else if (statusLower === 'vehiculo no disponible' || statusLower === 'vehículo no disponible') {
                    const waitTime = getWaitTimeInMinutes(o);
                    let waitStyle = '';
                    let waitLabel = '';
                    if (waitTime <= 40) {
                        waitStyle = 'background: #fff9db; color: #856404; border: 1px solid #ffeeba;';
                        waitLabel = `⏳ Espera Prudente (${waitTime} min)`;
                    } else {
                        waitStyle = 'background: #ffe8cc; color: #d9480f; border: 1px solid #ffd8a8;';
                        waitLabel = `⚠️ Espera Prolongada (${waitTime} min)`;
                    }
                    controlBtn = `
                        <div style="display:flex; flex-direction:column; gap:5px; padding: 5px; border-radius: 5px; ${waitStyle}">
                            <small style="font-weight:bold; font-size:0.75rem;">${waitLabel}</small>
                            <button class="btn btn-sm btn-secondary not-available-btn" data-id="${id}" style="font-size:0.75rem; padding:2px 5px;">🔄 Cambiar Estado</button>
                        </div>
                    `;
                } else if (statusLower === 'trabajo retrasado' || statusLower === 'retrasado') {
                    controlBtn = `
                        <div style="display:flex; flex-direction:column; gap:5px; background:#f8d7da; border:1px solid #f5c6cb; color:#721c24; padding:5px; border-radius:5px;">
                            <small style="font-weight:bold; font-size:0.75rem;">⚠️ ¡Trabajo Retrasado!</small>
                            <button class="btn btn-sm btn-danger check-subsequent-btn" data-id="${id}" style="font-size:0.75rem; padding: 2px 5px;">Revisar Siguiente</button>
                        </div>
                    `;
                } else if (statusLower === 'finalizada') {
                    controlBtn = `<span class="badge" style="background:#d4edda; color:#155724;">✅ Entregado</span>`;
                } else {
                    controlBtn = `<small style="color:var(--secondary); font-style:italic;">Esperando llegada</small>`;
                }

                const hasReceived = !['pendiente', 'asignada', 'en camino', 'llego'].includes(statusLower);
                const isFinalized = statusLower === 'finalizada';

                const ticketPreBtn = hasReceived
                    ? `<button class="btn btn-sm btn-outline view-ticket-pre-btn" data-id="${id}" title="Ticket Pre-instalación" style="padding: 4px 8px; font-size: 0.8rem;">🎟️ Pre</button>`
                    : `<button class="btn btn-sm btn-outline" disabled title="Falta recepción" style="padding: 4px 8px; font-size: 0.8rem; opacity:0.5;">🎟️ Pre</button>`;

                const ticketPostBtn = isFinalized
                    ? `<button class="btn btn-sm btn-outline view-ticket-post-btn" data-id="${id}" title="Evidencia Post-instalación" style="padding: 4px 8px; font-size: 0.8rem;">🎟️ Post</button>`
                    : `<button class="btn btn-sm btn-outline" disabled title="No entregado" style="padding: 4px 8px; font-size: 0.8rem; opacity:0.5;">🎟️ Post</button>`;

                html += `
                    <tr data-id="${id}">
                        <td><strong>${id}</strong></td>
                        <td>${time}</td>
                        <td>${client}</td>
                        <td>${vehicle}</td>
                        <td>${UI_TEMPLATES.priorityBadge(priority)}</td>
                        <td>${UI_TEMPLATES.badge(status)}</td>
                        <td><small>${tech}</small></td>
                        <td>${controlBtn}</td>
                        <td>
                            <div style="display:flex; gap:5px;">
                                ${ticketPreBtn}
                                ${ticketPostBtn}
                            </div>
                        </td>
                    </tr>
                `;
            });

            html += `
                    </tbody>
                </table>
            `;
        }

        html += `</div>`;

        if (shell.innerHTML !== html) {
            shell.innerHTML = html;
            bindDashboardEvents(orders);
        }
    };

    const bindDashboardEvents = (orders) => {
        const btnChangePass = shell.querySelector('#btn-tech-change-pass');
        if (btnChangePass) {
            btnChangePass.onclick = () => {
                const modalHtml = `
                    <div style="padding:15px; text-align:left;">
                        <div class="form-group" style="margin-bottom:12px;">
                            <label style="font-weight:bold; font-size:0.85rem;">Contraseña Actual:</label>
                            <input type="password" id="tech-current-pass" class="form-control" required>
                        </div>
                        <div class="form-group" style="margin-bottom:12px;">
                            <label style="font-weight:bold; font-size:0.85rem;">Nueva Contraseña:</label>
                            <input type="password" id="tech-new-pass" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label style="font-weight:bold; font-size:0.85rem;">Confirmar Contraseña:</label>
                            <input type="password" id="tech-confirm-pass" class="form-control" required>
                        </div>
                    </div>
                `;
                UI_TEMPLATES.modal(
                    'Cambiar Contraseña',
                    modalHtml,
                    async () => {
                        const cur = document.getElementById('tech-current-pass').value;
                        const nw = document.getElementById('tech-new-pass').value;
                        const conf = document.getElementById('tech-confirm-pass').value;
                        if(!cur || !nw || !conf) {
                            alert("Todos los campos son obligatorios.");
                            return;
                        }
                        if(nw !== conf) {
                            alert("Las nuevas contraseñas no coinciden.");
                            return;
                        }
                        try {
                            const passRes = await routeAction('GOS_CORE', 'changePassword', {
                                username: user.Nombre_Usuario,
                                currentPassword: cur,
                                newPassword: nw
                            });
                            if (passRes.status === 'success') {
                                alert("¡Contraseña actualizada con éxito!");
                            } else {
                                alert("Error: " + passRes.message);
                            }
                        } catch(err) {
                            alert("Error de conexión: " + err.message);
                        }
                    }
                );
            };
        }

        const sectorSelector = shell.querySelector('#sector-selector');
        if (sectorSelector) {
            sectorSelector.addEventListener('change', (e) => {
                activeSector = e.target.value;
                if (shell) shell.innerHTML = '<p>Actualizando sector...</p>';
                refreshDashboard();
            });
        }

        const receiveBtns = shell.querySelectorAll('.receive-vehicle-btn');
        receiveBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const orderId = e.currentTarget.dataset.id;
                const order = orders.find(ord => ord.id === orderId);
                if (!order) return;

                try {
                    const configRes = await routeAction('GOS_CORE', 'getOTConfig');
                    const otConfig = configRes.status === 'success' ? configRes.data : { OT_Auto_Numeration: 'active', OT_Generation_Method: 'automatic' };

                    const isManual = otConfig.OT_Auto_Numeration !== 'active' || otConfig.OT_Generation_Method === 'manual';

                    const modalHtml = `
                        <div style="padding:15px; text-align:left; font-size:0.9rem; line-height:1.5;">
                            <p style="margin-bottom:15px; color:var(--dark);">Por seguridad y para validar que el vehículo coincide con la orden comercial, <strong>ingrese el número VIN/Chasis del vehículo:</strong></p>
                            <div class="form-group" style="margin-bottom:15px;">
                                <label style="font-weight:bold; font-size:0.85rem;">Número VIN/Chasis:</label>
                                <input type="text" id="validation-vin" class="form-control" placeholder="Ingrese VIN del vehículo..." required style="text-transform:uppercase;">
                            </div>
                            ${isManual ? `
                                <div class="form-group" style="margin-bottom:15px;">
                                    <label style="font-weight:bold; font-size:0.85rem;">ID de Orden de Trabajo (Manual):</label>
                                    <input type="text" id="validation-manual-ot-id" class="form-control" placeholder="Ingrese identificador de OT..." required>
                                </div>
                            ` : ''}
                        </div>
                    `;

                    UI_TEMPLATES.modal(
                        'Validación de Vehículo',
                        modalHtml,
                        async () => {
                            const inputVin = document.getElementById('validation-vin').value.trim().toUpperCase();
                            if (!inputVin) {
                                alert("El número VIN es requerido.");
                                return;
                            }

                            let manualOtId = '';
                            if (isManual) {
                                manualOtId = document.getElementById('validation-manual-ot-id').value.trim();
                                if (!manualOtId) {
                                    alert("El ID de la Orden de Trabajo manual es requerido.");
                                    return;
                                }
                            }

                            try {
                                const result = await routeAction('GOS_CORE', 'createOT', {
                                    oiId: order.id,
                                    enteredVin: inputVin,
                                    manualOtId: manualOtId
                                });

                                if (result.status === 'success') {
                                    alert(`¡Vehículo Validado con Éxito!
Se ha generado la Orden de Trabajo ID: ${result.otId}`);
                                    renderVehicleReceptionForm(container, order, result.otId);
                                } else {
                                    alert(`⚠️ Error de Validación: ${result.message}`);
                                }
                            } catch (err) {
                                alert("Error al procesar validación: " + err.message);
                            }
                        }
                    );
                } catch (err) {
                    alert("Error de conexión al obtener configuración de OT: " + err.message);
                }
            });
        });

        const deliverBtns = shell.querySelectorAll('.deliver-vehicle-btn');
        deliverBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const orderId = e.currentTarget.dataset.id;
                const order = orders.find(ord => ord.id === orderId);
                if (order) {
                    renderPostInstallationForm(container, order);
                }
            });
        });

        const viewPreBtns = shell.querySelectorAll('.view-ticket-pre-btn');
        viewPreBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const orderId = e.currentTarget.dataset.id;
                const order = orders.find(ord => ord.id === orderId);
                if (order) {
                    renderTicketPreView(container, order);
                }
            });
        });

        const viewPostBtns = shell.querySelectorAll('.view-ticket-post-btn');
        viewPostBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const orderId = e.currentTarget.dataset.id;
                const order = orders.find(ord => ord.id === orderId);
                if (order) {
                    renderTicketPostView(container, order);
                }
            });
        });

        const diagBtns = shell.querySelectorAll('.diagnosis-btn');
        diagBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const orderId = e.currentTarget.dataset.id;
                const order = orders.find(ord => ord.id === orderId);
                if (order) {
                    renderDiagnosisInterventionSelection(container, order);
                }
            });
        });

        const testBtns = shell.querySelectorAll('.test-monitoreo-btn');
        testBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const orderId = e.currentTarget.dataset.id;
                const order = orders.find(ord => ord.id === orderId);
                if (order) {
                    renderMonitoreoTestsForm(container, order);
                }
            });
        });

        const notAvailBtns = shell.querySelectorAll('.not-available-btn');
        notAvailBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const orderId = e.currentTarget.dataset.id;
                const order = orders.find(ord => ord.id === orderId);
                if (!order) return;

                const modalHtml = `
                    <div style="padding:15px; text-align:left; font-size:0.9rem; line-height:1.5;">
                        <p style="font-weight:bold; color:var(--dark);">Seleccione el motivo de indisponibilidad:</p>

                        <div class="form-group" style="margin-bottom:12px;">
                            <label><input type="radio" name="not-avail-reason" value="alistamiento" checked> 🧼 Alistamiento (Lavado, polarizado, accesorios)</label>
                        </div>
                        <div id="alistamiento-options" style="margin-left:20px; margin-bottom:15px;">
                            <label style="font-size:0.8rem; font-weight:bold;">Hora estimada de disponibilidad:</label>
                            <input type="time" id="alistamiento-time" class="form-control" style="width:auto; margin-top:5px;">
                        </div>

                        <div class="form-group">
                            <label><input type="radio" name="not-avail-reason" value="taller"> 🔧 Taller (Mecánica, reparaciones)</label>
                        </div>
                        <div id="taller-options" style="margin-left:20px; display:none; margin-bottom:15px;">
                            <p style="font-size:0.8rem; margin:5px 0;">El tiempo de espera podría ser prolongado.</p>
                            <label><input type="checkbox" id="taller-wait-confirm"> Deseo esperar el vehículo en el taller</label>
                        </div>
                    </div>
                `;

                UI_TEMPLATES.modal(
                    'Vehículo No Disponible',
                    modalHtml,
                    async () => {
                        const reason = document.querySelector('input[name="not-avail-reason"]:checked').value;
                        if (reason === 'alistamiento') {
                            const estTime = document.getElementById('alistamiento-time').value;
                            if (!estTime) {
                                alert("Por favor ingrese la hora estimada.");
                                return;
                            }
                            await markStatus(orderId, 'Vehículo no disponible', `Alistamiento - Disponible aprox: ${estTime}`);
                            refreshDashboard();
                        } else {
                            const wait = document.getElementById('taller-wait-confirm').checked;
                            if (wait) {
                                await markStatus(orderId, 'Vehículo no disponible', 'Taller - Esperando en taller');
                                refreshDashboard();
                            } else {
                                alert("Se notificará a la jefatura para la reasignación automática de su siguiente trabajo.");
                                await routeAction('GOS_CORE', 'reassignNextJob', { currentOrderId: orderId, force: true });
                                markStatus(orderId, 'Vehículo no disponible', 'Taller - Reasignado por tiempo prolongado');
                            }
                        }
                    }
                );

                setTimeout(() => {
                    const rAlist = document.querySelector('input[name="not-avail-reason"][value="alistamiento"]');
                    const rTall = document.querySelector('input[name="not-avail-reason"][value="taller"]');
                    if (rAlist && rTall) {
                        rAlist.addEventListener('change', () => {
                            document.getElementById('alistamiento-options').style.display = 'block';
                            document.getElementById('taller-options').style.display = 'none';
                        });
                        rTall.addEventListener('change', () => {
                            document.getElementById('alistamiento-options').style.display = 'none';
                            document.getElementById('taller-options').style.display = 'block';
                        });
                    }
                }, 200);
            });
        });

        const checkBtns = shell.querySelectorAll('.check-subsequent-btn');
        checkBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const orderId = e.currentTarget.dataset.id;
                try {
                    const checkRes = await routeAction('GOS_CORE', 'reassignNextJob', { currentOrderId: orderId });
                    if (checkRes.status === 'no_next_job') {
                        alert("ℹ️ " + checkRes.message);
                    } else if (checkRes.status === 'no_tech_available') {
                         alert("ℹ️ Recordatorio: " + checkRes.message);
                    } else if (checkRes.status === 'tech_available') {
                        UI_TEMPLATES.modal(
                            'Aviso de Retraso y Reasignación',
                            `
                                <div style="padding:15px; text-align:left;">
                                    <p style="font-weight:bold; color:#721c24;">⚠️ ¡Estás retrasado en este trabajo!</p>
                                    <p>${checkRes.message}</p>
                                </div>
                            `,
                            async () => {
                                alert("Entendido. Por favor continúa lo más rápido posible.");
                            },
                            async () => {
                                const reassignRes = await routeAction('GOS_CORE', 'reassignNextJob', { currentOrderId: orderId, force: true });
                                alert(reassignRes.message);
                                refreshDashboard();
                            }
                        );
                        setTimeout(() => {
                            const btnCancel = document.getElementById('modal-cancel');
                            if (btnCancel) {
                                btnCancel.textContent = '❌ No podré (Reasignar)';
                                btnCancel.className = 'btn btn-secondary';
                            }
                            const btnConfirm = document.getElementById('modal-confirm');
                            if (btnConfirm) {
                                btnConfirm.textContent = '✅ Sí podré cumplir';
                            }
                        }, 100);
                    }
                } catch (err) {
                    console.error("Error check subsequent:", err);
                }
            });
        });
    };

    const refreshDashboard = async () => {
        try {
            const result = await routeAction('GOS_CORE', 'getOrders');
            if (result.status === 'success') {
                const orders = result.data;
                await dbClear('orders');
                for (let o of orders) {
                    await dbSet('orders', o.id, o);
                }
                updateDashboardView(orders);
            }
        } catch (error) {
            console.error("Error refreshDashboard:", error);
        }
    };

    try {
        const cached = await dbGetAll('orders');
        if (cached && cached.length > 0) {
            updateDashboardView(cached);
        }
    } catch (e) {
        console.warn("IndexedDB read error:", e);
    }

    await refreshDashboard();

    if (dashboardInterval) clearInterval(dashboardInterval);
    dashboardInterval = setInterval(async () => {
        if (AppState.currentSection === 'dashboard') {
            await refreshDashboard();
        }
    }, 30000);
}/**
 * Renderiza el Formulario Inteligente de Recepción de Vehículos.
 */
function renderVehicleReceptionForm(container, order, otId = '') {
    if (dashboardInterval) {
        clearInterval(dashboardInterval);
        dashboardInterval = null;
    }

    const categories = [
        { id: 'vin', label: 'Número de Chasis (VIN)', group: 'Identificación' },
        { id: 'odometro', label: 'Odómetro', group: 'Identificación' },
        { id: 'tablero', label: 'Tablero de Instrumentos', group: 'Identificación' },
        { id: 'asientos_delanteros', label: 'Asientos Delanteros', group: 'Interior' },
        { id: 'asientos_traseros', label: 'Asientos Traseros', group: 'Interior' },
        { id: 'techo_interior', label: 'Techo Interior', group: 'Interior' },
        { id: 'estribos', label: 'Estribos', group: 'Interior' },
        { id: 'lado_izquierdo', label: 'Lado Izquierdo', group: 'Exterior' },
        { id: 'vista_frontal', label: 'Vista Frontal', group: 'Exterior' },
        { id: 'lado_derecho', label: 'Lado Derecho', group: 'Exterior' },
        { id: 'vista_trasera', label: 'Vista Trasera', group: 'Exterior' }
    ];

    const photosData = {}; // Guardará base64 o metadatos de cada foto
    const damagesData = {}; // Guardará los daños por cada categoría
    const qualityData = {}; // Guardará el resultado del quality check por cada categoría

    categories.forEach(cat => {
        photosData[cat.id] = null;
        damagesData[cat.id] = [];
        qualityData[cat.id] = { valid: false, brightness: 0, contrast: 0 };
    });

    let html = `
        <div class="reception-container">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid var(--light); padding-bottom:15px; margin-bottom:25px;">
                <h2 style="margin:0; color:var(--primary);">Módulo de Recepción de Vehículo</h2>
                <button class="btn btn-secondary" id="back-to-dash-btn" style="padding: 8px 15px; font-size:0.9rem;">Volver al Dashboard</button>
            </div>

            <!-- Información del Cliente y Orden (Validación Visual) -->
            <fieldset style="border: 1px solid #ddd; border-radius: 8px; padding: 1.5rem; margin-bottom: 25px;">
                <legend style="font-weight:bold; padding: 0 10px; color: var(--secondary);">Información del Cliente y Orden #${order.id} ${otId ? `/ OT: #${otId}` : ''}</legend>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Cliente:</label>
                        <input type="text" class="form-control" value="${order.cliente || ''}" readonly style="background:#eee;">
                    </div>
                    <div class="form-group">
                        <label>Contacto:</label>
                        <input type="text" class="form-control" value="${order.contacto || ''}" readonly style="background:#eee;">
                    </div>
                    <div class="form-group">
                        <label>Teléfono:</label>
                        <input type="text" class="form-control" value="${order.telefono || ''}" readonly style="background:#eee;">
                    </div>
                    <div class="form-group">
                        <label>Ubicación Programada (Instalación):</label>
                        <input type="text" class="form-control" value="${order.direccion || ''} (${order.coordenadas || ''})" readonly style="background:#eee;">
                    </div>
                    <div class="form-group">
                        <label>Servicio Contratado:</label>
                        <input type="text" class="form-control" value="${order.servicio || 'Servicio Estándar'}" readonly style="background:#eee;">
                    </div>
                    <div class="form-group">
                        <label>Vendedor Responsable:</label>
                        <input type="text" class="form-control" value="${order.vendedor || 'Carlos Ruiz'}" readonly style="background:#eee;">
                    </div>
                    <div class="form-group" style="grid-column: 1 / -1;">
                        <label>Observaciones de la Orden:</label>
                        <textarea class="form-control" readonly style="background:#eee; height: 50px;">${order.observaciones || 'Ninguna observacion'}</textarea>
                    </div>
                </div>
                <div style="margin-top: 15px; background: #e8f4fd; padding: 10px 15px; border-radius: 6px; font-size: 0.85rem; color: #31708f;">
                    💡 El técnico debe validar visualmente estos datos antes de continuar con la recepción del vehículo.
                </div>
            </fieldset>

            <!-- Información del Vehículo (Campos Inteligentes y Autocompletado) -->
            <form id="vehicle-reception-form">
                <fieldset style="border: 1px solid #ddd; border-radius: 8px; padding: 1.5rem; margin-bottom: 25px;">
                    <legend style="font-weight:bold; padding: 0 10px; color: var(--secondary);">Información del Vehículo</legend>
                    <div class="form-grid">
                        <div class="form-group autocomplete-wrapper">
                            <label>Marca:</label>
                            <input type="text" id="vehiculo-marca" name="marca" class="form-control" value="${order.marca || ''}" required placeholder="Ej: Toyota">
                            <div id="suggestions-marca" class="autocomplete-suggestions" style="display:none;"></div>
                        </div>
                        <div class="form-group autocomplete-wrapper">
                            <label>Modelo:</label>
                            <input type="text" id="vehiculo-modelo" name="modelo" class="form-control" value="${order.modelo || ''}" required placeholder="Ej: Hilux">
                            <div id="suggestions-modelo" class="autocomplete-suggestions" style="display:none;"></div>
                        </div>
                        <div class="form-group">
                            <label>Año:</label>
                            <input type="number" name="anio" class="form-control" value="${order.anio || ''}" required placeholder="Ej: 2022">
                        </div>
                        <div class="form-group">
                            <label>Color:</label>
                            <input type="text" name="color" class="form-control" value="${order.color || ''}" required placeholder="Ej: Gris Metálico">
                        </div>
                        <div class="form-group">
                            <label>Placa:</label>
                            <input type="text" name="placa" class="form-control" value="${order.placa || ''}" required placeholder="Ej: HAD-1234">
                        </div>
                        <div class="form-group">
                            <label>Número de Chasis (VIN):</label>
                            <input type="text" name="vin" class="form-control" value="${order.vin || ''}" required placeholder="Ej: Número de chasis (VIN)...">
                        </div>
                        <div class="form-group">
                            <label>Número de Motor:</label>
                            <input type="text" name="motor" class="form-control" value="${order.motor || ''}" placeholder="Ej: 1KD-FTV">
                        </div>
                    </div>
                </fieldset>

                <!-- Validación Fotográfica Obligatoria -->
                <h3 style="border-bottom:1px solid #eee; padding-bottom:10px; margin-bottom:15px; color: var(--primary);">Validación Fotográfica Obligatoria (11 Categorías)</h3>
                <p style="font-size:0.9rem; color:var(--secondary);">Suba o capture fotografías para cada área. Haga clic sobre la imagen cargada para registrar daños existentes.</p>

                <div class="photo-checklist">
                    ${categories.map(cat => `
                        <div class="photo-card" id="card-${cat.id}">
                            <div>
                                <span class="badge" style="background:#5bc0de; color:white; font-size:0.7rem; float:right;">${cat.group}</span>
                                <h4>${cat.label}</h4>
                            </div>

                            <div class="canvas-wrapper" id="wrapper-${cat.id}" style="display:none;">
                                <canvas id="canvas-${cat.id}"></canvas>
                            </div>

                            <div style="margin: 15px 0;">
                                <label class="input-file-label" id="label-${cat.id}">
                                    📷 Capturar/Cargar Foto
                                    <input type="file" id="file-${cat.id}" accept="image/*" style="display:none;">
                                </label>
                            </div>

                            <!-- Indicadores de Calidad -->
                            <div class="quality-checklist" id="quality-${cat.id}" style="display:none;">
                                <div class="quality-item">
                                    <span>Nitidez:</span>
                                    <span class="quality-status" id="quality-nitidez-${cat.id}">--</span>
                                </div>
                                <div class="quality-item">
                                    <span>Iluminación:</span>
                                    <span class="quality-status" id="quality-luz-${cat.id}">--</span>
                                </div>
                                <div class="quality-item">
                                    <span>Encuadre:</span>
                                    <span class="quality-status" id="quality-encuadre-${cat.id}">OK</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <!-- Firmas Digitales del Técnico y Cliente en Recepción -->
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-top:35px; border-top:2px solid var(--light); padding-top:20px; flex-wrap:wrap;">
                    <!-- Firma del Técnico -->
                    <fieldset style="border: 1px solid #ddd; border-radius: 8px; padding: 1.5rem;">
                        <legend style="font-weight:bold; padding: 0 10px; color: var(--secondary);">Firma Digital del Técnico</legend>
                        <div id="tech-sig-saved-container-rec" style="display:none; margin-bottom:15px; background:#e8f4fd; padding:15px; border-radius:6px; border:1px solid #b8daff;">
                            <p style="margin:0 0 10px 0; font-weight:bold; color:#004085;">✍️ Firma guardada encontrada.</p>
                            <button type="button" class="btn btn-sm btn-primary" id="btn-use-saved-tech-sig-rec">✍️ Usar Mi Firma Guardada</button>
                        </div>
                        <div id="tech-sig-canvas-container-rec">
                            <p style="margin:2px 0 10px 0; font-size:0.8rem; color:var(--secondary);">Dibuje su firma de técnico:</p>
                            <div class="signature-wrapper">
                                <canvas id="tech-signature-pad-rec" class="signature-canvas" width="400" height="150" style="border:1px dashed #ccc; width:100%; height:150px;"></canvas>
                            </div>
                            <div class="signature-actions" style="margin-top:10px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                                <button class="btn btn-secondary btn-sm" id="clear-tech-sig-btn-rec" type="button">🔄 Limpiar Firma</button>
                                <label style="font-size:0.85rem; color:var(--dark); cursor:pointer;"><input type="checkbox" id="save-tech-sig-check-rec" style="margin-right:5px;"> Guardar firma</label>
                            </div>
                        </div>
                        <input type="hidden" id="tech-sig-base64-rec">
                    </fieldset>

                    <!-- Firma del Cliente -->
                    <fieldset style="border: 1px solid #ddd; border-radius: 8px; padding: 1.5rem;">
                        <legend style="font-weight:bold; padding: 0 10px; color: var(--secondary);">Firma Digital del Cliente</legend>
                        <p style="margin:2px 0 10px 0; font-size:0.8rem; color:var(--secondary);">Dibuje su firma de cliente:</p>
                        <div class="signature-wrapper">
                            <canvas id="signature-pad-rec" class="signature-canvas" width="400" height="150" style="border:1px dashed #ccc; width:100%; height:150px;"></canvas>
                        </div>
                        <div class="signature-actions" style="margin-top:10px;">
                            <button class="btn btn-secondary btn-sm" id="clear-sig-btn-rec" type="button">🔄 Limpiar Firma</button>
                        </div>
                    </fieldset>
                </div>

                <div style="margin-top:35px; border-top:2px solid var(--light); padding-top:20px; display:flex; gap:15px; justify-content:flex-end;">
                    <button type="button" class="btn btn-secondary" id="cancel-reception-btn">Cancelar Recepción</button>
                    <button type="submit" class="btn btn-primary">Registrar Vehículo y Comenzar</button>
                </div>
            </form>
        </div>
    `;

    container.innerHTML = html;

    const backToDash = () => {
        loadSection('dashboard');
    };
    document.getElementById('back-to-dash-btn').onclick = backToDash;
    document.getElementById('cancel-reception-btn').onclick = backToDash;

    setupRealtimeAutocomplete();

    const clientPad = initSignatureCanvas('signature-pad-rec', 'clear-sig-btn-rec');
    const techPadRec = initSignatureCanvas('tech-signature-pad-rec', 'clear-tech-sig-btn-rec');

    // Verificar si hay firma guardada para el técnico
    (async () => {
        try {
            const res = await routeAction('GOS_CORE', 'getTechnicianSignature', { tecnico: AppState.user?.Nombre_Usuario });
            if (res.status === 'success' && res.firma) {
                const savedContainer = document.getElementById('tech-sig-saved-container-rec');
                const canvasContainer = document.getElementById('tech-sig-canvas-container-rec');
                if (savedContainer && canvasContainer) {
                    savedContainer.style.display = 'block';
                    canvasContainer.style.display = 'none';
                }

                const useSavedBtn = document.getElementById('btn-use-saved-tech-sig-rec');
                if (useSavedBtn) {
                    useSavedBtn.onclick = async () => {
                        const pass = prompt("Por seguridad y confirmación de identidad, ingrese su contraseña de acceso:");
                        if (pass) {
                            try {
                                const verifyRes = await routeAction('GOS_CORE', 'verifyPassword', {
                                    username: AppState.user?.Nombre_Usuario,
                                    password: pass
                                });
                                if (verifyRes.status === 'success') {
                                    document.getElementById('tech-sig-base64-rec').value = res.firma;
                                    alert("Firma digital del técnico aplicada correctamente.");
                                    document.getElementById('tech-sig-saved-container-rec').innerHTML = '<p style="margin:0; font-weight:bold; color:#155724;">✅ Firma Guardada Aplicada Correctamente.</p>';
                                } else {
                                    alert("Contraseña incorrecta. Confirmación de identidad fallida.");
                                }
                            } catch (err) {
                                alert("Error al verificar identidad: " + err.message);
                            }
                        }
                    };
                }
            }
        } catch (err) {
            console.error("Error al cargar firma guardada de técnico:", err);
        }
    })();

    categories.forEach(cat => {
        const fileInput = document.getElementById(`file-${cat.id}`);
        const canvas = document.getElementById(`canvas-${cat.id}`);
        const wrapper = document.getElementById(`wrapper-${cat.id}`);
        const label = document.getElementById(`label-${cat.id}`);
        const qualityDiv = document.getElementById(`quality-${cat.id}`);

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const maxDim = 400;
                    let width = img.width;
                    let height = img.height;
                    if (width > height) {
                        if (width > maxDim) {
                            height = Math.round((height * maxDim) / width);
                            width = maxDim;
                        }
                    } else {
                        if (height > maxDim) {
                            width = Math.round((width * maxDim) / height);
                            height = maxDim;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const imgData = ctx.getImageData(0, 0, width, height);
                    const pixels = imgData.data;

                    let totalBrightness = 0;
                    for (let i = 0; i < pixels.length; i += 4) {
                        totalBrightness += (pixels[i] + pixels[i+1] + pixels[i+2]) / 3;
                    }
                    const avgBrightness = totalBrightness / (pixels.length / 4);

                    let totalDev = 0;
                    for (let i = 0; i < pixels.length; i += 4) {
                        const val = (pixels[i] + pixels[i+1] + pixels[i+2]) / 3;
                        totalDev += Math.abs(val - avgBrightness);
                    }
                    const avgContrast = totalDev / (pixels.length / 4);

                    const isLuzOk = avgBrightness >= 40 && avgBrightness <= 240;
                    const isNitidezOk = avgContrast >= 15;
                    const isValid = isLuzOk && isNitidezOk;

                    qualityDiv.style.display = 'block';
                    wrapper.style.display = 'inline-block';
                    label.innerHTML = '🔄 Re-capturar Foto';

                    const nitidezEl = document.getElementById(`quality-nitidez-${cat.id}`);
                    const luzEl = document.getElementById(`quality-luz-${cat.id}`);

                    if (isNitidezOk) {
                        nitidezEl.textContent = 'OK';
                        nitidezEl.className = 'quality-status ok';
                    } else {
                        nitidezEl.textContent = 'Rechazado';
                        nitidezEl.className = 'quality-status fail';
                    }

                    if (isLuzOk) {
                        luzEl.textContent = 'OK';
                        luzEl.className = 'quality-status ok';
                    } else {
                        luzEl.textContent = 'Oscura';
                        luzEl.className = 'quality-status fail';
                    }

                    qualityData[cat.id] = { valid: isValid, brightness: avgBrightness, contrast: avgContrast };

                    if (isValid) {
                        document.getElementById(`card-${cat.id}`).className = 'photo-card completed';
                        photosData[cat.id] = canvas.toDataURL('image/jpeg', 0.8);
                    } else {
                        document.getElementById(`card-${cat.id}`).className = 'photo-card';
                        photosData[cat.id] = null;
                        alert(`La imagen para "${cat.label}" no cumple con la calidad mínima requerida (iluminación o nitidez). Por favor tome otra foto con mejor iluminación y enfoque.`);
                    }
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });

        wrapper.addEventListener('click', (e) => {
            if (!photosData[cat.id]) {
                alert("Primero debe cargar una foto válida antes de registrar anomalías.");
                return;
            }

            const rect = canvas.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;

            const damageTypes = [
                'Rayón', 'Golpe', 'Abolladura', 'Daño de pintura',
                'Pieza fracturada', 'Pieza faltante', 'Cristal fracturado',
                'Accesorio dañado', 'Observación relevante'
            ];

            const selectOptions = damageTypes.map(t => `<option value="${t}">${t}</option>`).join('');

            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.innerHTML = `
                <div class="modal-content" style="max-width:350px;">
                    <h3>Registrar Daño Existente</h3>
                    <div class="form-group">
                        <label>Tipo de Anomalía:</label>
                        <select id="damage-type" class="form-control">
                            ${selectOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Observación Adicional (Opcional):</label>
                        <input type="text" id="damage-obs" class="form-control" placeholder="Detalle adicional">
                    </div>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" id="damage-cancel" style="padding: 5px 10px;">Cancelar</button>
                        <button class="btn btn-primary" id="damage-save" style="padding: 5px 15px;">Guardar Pin</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            overlay.querySelector('#damage-cancel').onclick = () => {
                document.body.removeChild(overlay);
            };

            overlay.querySelector('#damage-save').onclick = () => {
                const type = overlay.querySelector('#damage-type').value;
                const obs = overlay.querySelector('#damage-obs').value;
                const note = obs ? `${type} - ${obs}` : type;

                const damageEntry = { x, y, note, type };
                damagesData[cat.id].push(damageEntry);

                addPinToWrapper(wrapper, x, y, damageEntry, cat.id, damagesData[cat.id].length - 1);

                document.body.removeChild(overlay);
            };
        });
    });

    function setupRealtimeAutocomplete() {
        const marcasList = ['Toyota', 'Nissan', 'Hyundai', 'Honda', 'Mazda', 'Ford', 'Chevrolet', 'Mercedes', 'BMW', 'Suzuki', 'Kia', 'Mitsubishi'];
        const modelosList = {
            'Toyota': ['Hilux', 'Corolla', 'Yaris', 'RAV4', 'Land Cruiser', 'Prado'],
            'Nissan': ['Frontier', 'Sentra', 'Versa', 'Kicks', 'Qashqai', 'Pathfinder'],
            'Hyundai': ['Elantra', 'Tucson', 'Santa Fe', 'Accent', 'Grand i10'],
            'Honda': ['Civic', 'CR-V', 'Accord', 'HR-V', 'Fit'],
            'Mazda': ['BT-50', 'Mazda 3', 'CX-5', 'CX-30', 'Mazda 2']
        };

        const marcaInput = document.getElementById('vehiculo-marca');
        const modeloInput = document.getElementById('vehiculo-modelo');
        const suggestionsMarca = document.getElementById('suggestions-marca');
        const suggestionsModelo = document.getElementById('suggestions-modelo');

        marcaInput.addEventListener('input', () => {
            const val = marcaInput.value.trim().toLowerCase();
            suggestionsMarca.innerHTML = '';
            if (!val) {
                suggestionsMarca.style.display = 'none';
                return;
            }

            const matches = marcasList.filter(m => m.toLowerCase().includes(val));
            if (matches.length > 0) {
                suggestionsMarca.style.display = 'block';
                matches.forEach(m => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    div.textContent = m;
                    div.onclick = () => {
                        marcaInput.value = m;
                        suggestionsMarca.style.display = 'none';
                    };
                    suggestionsMarca.appendChild(div);
                });
            } else {
                suggestionsMarca.style.display = 'none';
            }
        });

        modeloInput.addEventListener('input', () => {
            const val = modeloInput.value.trim().toLowerCase();
            const brand = marcaInput.value.trim();
            suggestionsModelo.innerHTML = '';
            if (!val) {
                suggestionsModelo.style.display = 'none';
                return;
            }

            const activeModels = modelosList[brand] || Object.values(modelosList).flat();
            const matches = activeModels.filter(m => m.toLowerCase().includes(val));
            if (matches.length > 0) {
                suggestionsModelo.style.display = 'block';
                matches.forEach(m => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    div.textContent = m;
                    div.onclick = () => {
                        modeloInput.value = m;
                        suggestionsModelo.style.display = 'none';
                    };
                    suggestionsModelo.appendChild(div);
                });
            } else {
                suggestionsModelo.style.display = 'none';
            }
        });

        document.addEventListener('click', (e) => {
            if (e.target !== marcaInput) suggestionsMarca.style.display = 'none';
            if (e.target !== modeloInput) suggestionsModelo.style.display = 'none';
        });
    }

    function addPinToWrapper(wrapper, x, y, damage, catId, idx) {
        const pin = document.createElement('div');
        pin.className = 'damage-pin';
        pin.style.left = `${x}%`;
        pin.style.top = `${y}%`;

        const letter = damage.type ? damage.type.charAt(0).toUpperCase() : 'X';
        pin.innerHTML = `
            ${letter}
            <div class="tooltip">${damage.note} <small style="display:block; opacity:0.7;">Haga clic para remover</small></div>
        `;

        pin.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`¿Desea eliminar la anomalía "${damage.note}" registrada en esta posición?`)) {
                damagesData[catId].splice(idx, 1);
                wrapper.removeChild(pin);
            }
        });

        wrapper.appendChild(pin);
    }

    document.getElementById('vehicle-reception-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        // Validar firma del técnico
        let techSigBase64 = document.getElementById('tech-sig-base64-rec').value;
        const saveTechSigChecked = document.getElementById('save-tech-sig-check-rec')?.checked;

        if (!techSigBase64) {
            if (techPadRec.isEmpty()) {
                alert("Por favor firme como técnico o aplique su firma guardada antes de continuar.");
                return;
            }
            techSigBase64 = techPadRec.getDataUrl();

            // Si marcó guardar firma, guardarla en el backend
            if (saveTechSigChecked) {
                try {
                    await routeAction('GOS_CORE', 'saveTechnicianSignature', {
                        tecnico: AppState.user?.Nombre_Usuario,
                        firma: techSigBase64
                    });
                } catch (err) {
                    console.error("Error al guardar firma de técnico en backend:", err);
                }
            }
        }

        // Validar firma del cliente
        if (clientPad.isEmpty()) {
            alert("Por favor solicite al cliente registrar su firma digital de recepción antes de continuar.");
            return;
        }
        const clientSigBase64 = clientPad.getDataUrl();

        const missingPhotos = categories.filter(cat => !photosData[cat.id]);
        if (missingPhotos.length > 0) {
            alert(`Para registrar el vehículo debe cargar las fotografías obligatorias restantes:\n\n${missingPhotos.map(p => `- ${p.label}`).join('\n')}`);
            return;
        }

        const formData = new FormData(e.target);
        const vehiculoInfo = Object.fromEntries(formData.entries());

        const user = AppState.user;
        const payload = {
            orderId: order.id,
            otId: otId,
            tecnico: user.Nombre_Completo || user.Nombre_Usuario,
            sector: user.Sector || 'San Pedro Sula',
            clienteInfo: {
                nombre: order.cliente || '',
                contacto: order.contacto || '',
                telefono: order.telefono || '',
                direccion: order.direccion || ''
            },
            vehiculoInfo: vehiculoInfo,
            fotos: photosData,
            danos: damagesData,
            calidadCheck: qualityData
        };

        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '⏳ Registrando Recepción...';

        try {
            // Guardar firmas en la Orden de Trabajo vinculada
            if (otId) {
                try {
                    await routeAction('GOS_CORE', 'saveOTDetails', {
                        otId: otId,
                        updates: {
                            Firma_Tecnico: techSigBase64,
                            Firma_Cliente_Recepcion: clientSigBase64,
                            FechaHora_Recepcion: new Date().toISOString()
                        }
                    });
                } catch (err) {
                    console.error("Error guardando firmas en Ordenes_Trabajo:", err);
                }
            }

            const result = await routeAction('GOS_CORE', 'saveVehicleReception', payload);
            if (result.status === 'success') {
                alert(`¡Vehículo Recibido con Éxito!\nRegistro de Recepción: ${result.id}\nSe ha actualizado el estado de la Orden a 'Vehículo recibido'.\nA continuación se presentará el comprobante digital de recepción.`);
                renderDigitalReceipt(container, order, vehiculoInfo, damagesData, result.id, otId);
            } else {
                alert(`Error al registrar vehículo: ${result.message}`);
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Registrar Vehículo y Comenzar';
            }
        } catch (error) {
            alert(`Error de red o conexión: ${error.message}`);
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Registrar Vehículo y Comenzar';
        }
    });
}

/**
 * Renderiza el Comprobante Digital de Recepción del Vehículo con el Código QR de Consulta.
 */
function renderDigitalReceipt(container, order, vehiculoInfo, damages, receptionId, otId = '') {
    const user = AppState.user;
    const dateStr = new Date().toLocaleString();

    const secureToken = order.token || 'tok_' + order.id;
    const portalUrl = `${window.location.origin}/portal.html?ot=${order.id}&token=${secureToken}`;

    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(portalUrl)}`;

    let damagesHtml = '';
    let hasDamages = false;

    Object.entries(damages).forEach(([catId, list]) => {
        if (list && list.length > 0) {
            hasDamages = true;
            const catLabel = catId.toUpperCase().replace('_', ' ');
            damagesHtml += `
                <div style="margin-bottom:10px;">
                    <strong>${catLabel}:</strong>
                    <ul style="margin:5px 0 0 15px; padding:0; font-size:0.85rem;">
                        ${list.map(d => `<li>📍 Posición: (${Math.round(d.x)}%, ${Math.round(d.y)}%) - ${d.note}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
    });

    if (!hasDamages) {
        damagesHtml = '<p style="color:var(--success); margin:0; font-style:italic;">No se registraron daños ni anomalías físicas previas en el vehículo.</p>';
    }

    let html = `
        <div class="receipt-container">
            <div class="receipt-header">
                <span style="font-size:3rem; color:var(--success);">✔️</span>
                <h2>Comprobante de Recepción Digital</h2>
                <p style="margin:5px 0; color:var(--secondary); font-size:0.95rem;">GOS - GPS Operations Suite</p>
                <span class="badge badge-finalizada" style="font-size:0.8rem; padding: 5px 12px;">REGISTRO: ${receptionId}</span>
            </div>

            <!-- Botones de Acción -->
            <div class="actions-bar" style="display:flex; justify-content:space-between; margin-bottom:30px; flex-wrap:wrap; gap:10px;">
                <button class="btn btn-secondary" id="receipt-back-btn">⬅️ Volver al Dashboard</button>
                <div style="display:flex; gap:10px;">
                    <button class="btn btn-primary" id="receipt-print-btn">🖨️ Imprimir</button>
                    <button class="btn btn-secondary" id="receipt-download-btn">📥 Descargar</button>
                    <button class="btn btn-secondary" id="receipt-share-btn">🔗 Compartir</button>
                </div>
            </div>

            <!-- Datos de la Recepción -->
            <div class="receipt-section">
                <h4>Información de la Recepción</h4>
                <div class="receipt-grid">
                    <div class="receipt-item"><strong>ID Recepción:</strong> ${receptionId}</div>
                    <div class="receipt-item"><strong>Orden de Instalación (OI):</strong> ${order.id}</div>
                    ${otId ? `<div class="receipt-item"><strong>Orden de Trabajo (OT):</strong> ${otId}</div>` : ''}
                    <div class="receipt-item"><strong>Fecha y Hora:</strong> ${dateStr}</div>
                    <div class="receipt-item"><strong>Técnico Responsable:</strong> ${user.Nombre_Completo || user.Nombre_Usuario}</div>
                    <div class="receipt-item"><strong>Sector Operativo:</strong> ${user.Sector || 'San Pedro Sula'}</div>
                    <div class="receipt-item"><strong>Vendedor Responsable:</strong> ${order.vendedor || 'Carlos Ruiz'}</div>
                </div>
            </div>

            <!-- Datos del Cliente -->
            <div class="receipt-section">
                <h4>Información del Cliente</h4>
                <div class="receipt-grid">
                    <div class="receipt-item"><strong>Cliente:</strong> ${order.cliente || ''}</div>
                    <div class="receipt-item"><strong>Contacto:</strong> ${order.contacto || ''}</div>
                    <div class="receipt-item"><strong>Teléfono:</strong> ${order.telefono || ''}</div>
                    <div class="receipt-item"><strong>Ubicación Programada:</strong> ${order.direccion || ''}</div>
                </div>
            </div>

            <!-- Datos del Vehículo -->
            <div class="receipt-section">
                <h4>Información del Vehículo</h4>
                <div class="receipt-grid">
                    <div class="receipt-item"><strong>Marca:</strong> ${vehiculoInfo.marca}</div>
                    <div class="receipt-item"><strong>Modelo:</strong> ${vehiculoInfo.modelo}</div>
                    <div class="receipt-item"><strong>Año:</strong> ${vehiculoInfo.anio}</div>
                    <div class="receipt-item"><strong>Color:</strong> ${vehiculoInfo.color}</div>
                    <div class="receipt-item"><strong>Placa:</strong> ${vehiculoInfo.placa}</div>
                    <div class="receipt-item"><strong>VIN/Chasis:</strong> ${vehiculoInfo.vin}</div>
                    <div class="receipt-item"><strong>Número Motor:</strong> ${vehiculoInfo.motor || 'N/A'}</div>
                </div>
            </div>

            <!-- Registro de Daños Existentes -->
            <div class="receipt-section">
                <h4>Registro de Daños Existentes (Estado Físico Previo)</h4>
                <div class="receipt-damage-list">
                    ${damagesHtml}
                </div>
            </div>

            <!-- Código QR único de Consulta para el Cliente -->
            <div class="qr-code-section">
                <div class="qr-code-container">
                    <img src="${qrCodeUrl}" alt="Código QR de Consulta Seguro" style="width:150px; height:150px; display:block;">
                </div>
                <h4 style="margin:5px 0; color:var(--dark); font-size:0.95rem;">Código QR de Consulta Seguro</h4>
                <p style="margin:0; font-size:0.8rem; color:var(--secondary); max-width:300px;">
                    Escanee este código QR para acceder en tiempo real al estado de su orden, instalador asignado y evidencias registradas.
                </p>
                <p style="margin-top:5px; font-size:0.75rem;"><a href="${portalUrl}" target="_blank" style="color:var(--primary); word-break:break-all;">${portalUrl}</a></p>
            </div>
        </div>
    `;

    container.innerHTML = html;

    document.getElementById('receipt-back-btn').onclick = () => {
        loadSection('dashboard');
    };

    document.getElementById('receipt-print-btn').onclick = () => {
        window.print();
    };

    document.getElementById('receipt-download-btn').onclick = () => {
        const textContent = `
GOS - COMPROBANTE DE RECEPCION DIGITAL
======================================
ID Recepcion: ${receptionId}
Orden de Trabajo: ${order.id}
Fecha/Hora: ${dateStr}
Tecnico: ${user.Nombre_Completo || user.Nombre_Usuario}
Sector: ${user.Sector || 'San Pedro Sula'}

CLIENTE:
--------
Nombre: ${order.cliente}
Contacto: ${order.contacto}
Telefono: ${order.telefono}

VEHICULO:
---------
Marca: ${vehiculoInfo.marca}
Modelo: ${vehiculoInfo.modelo}
Anio: ${vehiculoInfo.anio}
Color: ${vehiculoInfo.color}
Placa: ${vehiculoInfo.placa}
VIN: ${vehiculoInfo.vin}
Motor: ${vehiculoInfo.motor || 'N/A'}

Portal de consulta del cliente:
${portalUrl}
        `.trim();

        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `GOS_Comprobante_${order.id}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    document.getElementById('receipt-share-btn').onclick = () => {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(portalUrl).then(() => {
                alert("¡Enlace del Portal de Clientes copiado al portapapeles!");
            }).catch(err => {
                alert("Error al copiar enlace: " + err);
            });
        } else {
            alert("Su navegador no soporta el portapapeles. Copie el enlace manualmente:\\n\\n" + portalUrl);
        }
    };
}

/**
 * Renderiza las métricas administrativas de acceso restringido.
 */

// ============================================================================
// MODULO DE ADMINISTRACIÓN (v0.6.0)
// ============================================================================
function getCoordinatesForPercent(percent) {
    const x = 50 + 40 * Math.cos(2 * Math.PI * percent - Math.PI / 2);
    const y = 50 + 40 * Math.sin(2 * Math.PI * percent - Math.PI / 2);
    return [x, y];
}

function drawSvgPieChart(slices) {
    if (!slices || slices.length === 0) return '<p style="color:var(--secondary); font-style:italic;">No hay datos para graficar.</p>';
    const total = slices.reduce((acc, s) => acc + s.value, 0) || 1;
    let cumulativePercent = 0;

    let html = `<div style="display:flex; align-items:center; gap:20px; flex-wrap:wrap; justify-content:center;">
        <svg viewBox="0 0 100 100" style="width:160px; height:160px; overflow:visible;">`;

    const colors = ['#007bff', '#28a745', '#ffc107', '#dc3545', '#17a2b8', '#6610f2', '#e83e8c', '#fd7e14'];

    slices.forEach((slice, idx) => {
        const percent = slice.value / total;
        const color = colors[idx % colors.length];

        if (percent === 1) {
            html += `<circle cx="50" cy="50" r="40" fill="${color}"><title>${slice.label}: 100% (${slice.value})</title></circle>`;
            return;
        }

        const [startX, startY] = getCoordinatesForPercent(cumulativePercent);
        cumulativePercent += percent;
        const [endX, endY] = getCoordinatesForPercent(cumulativePercent);
        const largeArcFlag = percent > 0.5 ? 1 : 0;

        const pathData = [
            `M 50 50`,
            `L ${startX} ${startY}`,
            `A 40 40 0 ${largeArcFlag} 1 ${endX} ${endY}`,
            `Z`
        ].join(' ');

        html += `<path d="${pathData}" fill="${color}">
            <title>${slice.label}: ${Math.round(percent * 100)}% (${slice.value})</title>
        </path>`;
    });

    html += `</svg>
        <div style="text-align:left; font-size:0.85rem;">`;

    slices.forEach((slice, idx) => {
        const percent = Math.round((slice.value / total) * 100);
        const color = colors[idx % colors.length];
        html += `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;">
                <span style="display:inline-block; width:12px; height:12px; border-radius:3px; background-color:${color};"></span>
                <span><strong>${slice.label}:</strong> ${percent}% (${slice.value})</span>
            </div>
        `;
    });

    html += `</div></div>`;
    return html;
}

function drawSvgLineChart(points) {
    if (!points || points.length === 0) return '<p style="color:var(--secondary); font-style:italic;">No hay datos para graficar.</p>';
    const maxVal = Math.max(...points.map(p => p.value)) || 1;
    const height = 150;
    const width = 450;
    const padding = 35;

    let chartHtml = `<svg viewBox="0 0 ${width} ${height}" style="width:100%; height:auto; overflow:visible;">`;

    for (let i = 0; i <= 4; i++) {
        const y = padding + (i * (height - 2 * padding)) / 4;
        chartHtml += `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />`;
    }

    const stepX = (width - 2 * padding) / (points.length - 1 || 1);
    const coords = points.map((p, idx) => {
        const x = padding + idx * stepX;
        const y = height - padding - (p.value / maxVal) * (height - 2 * padding);
        return { x, y, label: p.label, value: p.value };
    });

    let pathData = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
        pathData += ` L ${coords[i].x} ${coords[i].y}`;
    }
    chartHtml += `<path d="${pathData}" fill="none" stroke="#007bff" stroke-width="3" />`;

    coords.forEach(c => {
        chartHtml += `
            <circle cx="${c.x}" cy="${c.y}" r="5" fill="#007bff" stroke="#fff" stroke-width="1.5">
                <title>${c.label}: ${c.value}</title>
            </circle>
            <text x="${c.x}" y="${height - 10}" font-size="9" fill="#718096" text-anchor="middle">${c.label}</text>
            <text x="${c.x}" y="${c.y - 10}" font-size="9" font-weight="bold" fill="#2d3748" text-anchor="middle">${c.value}</text>
        `;
    });

    chartHtml += '</svg>';
    return chartHtml;
}

async function renderAdminModule(container) {
    const user = AppState.user;
    if (!user) {
        container.innerHTML = '<p>Por favor inicie sesión para ver esta información.</p>';
        return;
    }

    let activeSubTab = 'metricas';

    const renderLayout = () => {
        container.innerHTML = `
            <div class="admin-tabs-bar" style="display:flex; gap:10px; margin-bottom:20px; border-bottom:2px solid var(--light); padding-bottom:10px; flex-wrap:wrap;">
                <button class="btn sub-tab-btn active" data-subtab="metricas">📊 Métricas</button>
                <button class="btn sub-tab-btn" data-subtab="desempeno">📈 Desempeño</button>
                <button class="btn sub-tab-btn" data-subtab="usuarios">👥 Usuarios</button>
                <button class="btn sub-tab-btn" data-subtab="configuracion">⚙️ Configuración</button>
                <button class="btn sub-tab-btn" data-subtab="horas-extras">⏱️ Horas Extras</button>
            </div>
            <div id="admin-subtab-content">
                <p>Cargando panel...</p>
            </div>
        `;

        const tabBtns = container.querySelectorAll('.sub-tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                tabBtns.forEach(b => {
                    b.classList.remove('active');
                    b.style.backgroundColor = '#e2e8f0';
                    b.style.color = '#4a5568';
                });
                btn.classList.add('active');
                btn.style.backgroundColor = 'var(--primary)';
                btn.style.color = 'white';

                activeSubTab = btn.dataset.subtab;
                loadSubTabContent();
            });
        });

        // Set initial styling for active tab button
        const activeBtn = container.querySelector('.sub-tab-btn.active');
        if (activeBtn) {
            activeBtn.style.backgroundColor = 'var(--primary)';
            activeBtn.style.color = 'white';
        }

        loadSubTabContent();
    };

    const loadSubTabContent = async () => {
        const subContentEl = document.getElementById('admin-subtab-content');
        if (!subContentEl) return;
        subContentEl.innerHTML = UI_TEMPLATES.loading;

        try {
            const ordersRes = await routeAction('GOS_CORE', 'getOrders');
            if (ordersRes.status !== 'success') {
                subContentEl.innerHTML = `<p class="error-msg">Error al cargar datos: ${ordersRes.message}</p>`;
                return;
            }
            const orders = ordersRes.data;

            if (activeSubTab === 'metricas') {
                renderMetricasTab(subContentEl, orders);
            } else if (activeSubTab === 'desempeno') {
                renderDesempenoTab(subContentEl, orders);
            } else if (activeSubTab === 'usuarios') {
                renderUsuariosTab(subContentEl);
            } else if (activeSubTab === 'configuracion') {
                renderConfiguracionTab(subContentEl);
            } else if (activeSubTab === 'horas-extras') {
                renderHorasExtrasTab(subContentEl);
            }
        } catch (err) {
            subContentEl.innerHTML = `<p class="error-msg">Error de conexión: ${err.message}</p>`;
        }
    };

    const renderMetricasTab = (subEl, orders) => {
        const isJefe = RBAC.isJefe();
        const requestorSector = user.Sector || 'San Pedro Sula';

        // Filter orders by sector if Jefe
        const filtered = orders.filter(o => {
            if (!isJefe) return true;
            return (o.sector || '').toLowerCase().trim() === requestorSector.toLowerCase().trim();
        });

        // Computations
        const installs = filtered.filter(o => (o.tipotrabajo || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('instalacion nueva')).length;
        const deinstalls = filtered.filter(o => (o.tipotrabajo || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('desinstalacion')).length;
        const revisions = filtered.filter(o => (o.tipotrabajo || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('revision por falla')).length;
        const maintenance = filtered.filter(o => (o.tipotrabajo || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('mantenimiento')).length;
        const reinstalls = filtered.filter(o => (o.tipotrabajo || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('reinstalacion')).length;

        // Line chart data (Installations per month)
        const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        const monthlyCounts = Array(12).fill(0);

        filtered.forEach(o => {
            const isInstall = (o.tipotrabajo || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('instalacion');
            if (isInstall && o.fecha) {
                const parts = o.fecha.split('-');
                const mIdx = parseInt(parts[1]) - 1;
                if (mIdx >= 0 && mIdx < 12) {
                    monthlyCounts[mIdx]++;
                }
            }
        });

        const lineChartData = months.map((label, idx) => ({
            label,
            value: monthlyCounts[idx]
        }));

        subEl.innerHTML = `
            <div class="dashboard-grid" style="margin-bottom:30px;">
                <div class="dashboard-card" style="border-top: 4px solid #007bff;">
                    <h3>Instalaciones Nuevas</h3>
                    <div class="value" style="color:#007bff;">${installs}</div>
                </div>
                <div class="dashboard-card" style="border-top: 4px solid #fd7e14;">
                    <h3>Desinstalaciones</h3>
                    <div class="value" style="color:#fd7e14;">${deinstalls}</div>
                </div>
                <div class="dashboard-card" style="border-top: 4px solid #dc3545;">
                    <h3>Revisiones por Falla</h3>
                    <div class="value" style="color:#dc3545;">${revisions}</div>
                </div>
                <div class="dashboard-card" style="border-top: 4px solid #28a745;">
                    <h3>Mantenimiento Preventivo</h3>
                    <div class="value" style="color:#28a745;">${maintenance}</div>
                </div>
                <div class="dashboard-card" style="border-top: 4px solid #17a2b8;">
                    <h3>Reinstalaciones</h3>
                    <div class="value" style="color:#17a2b8;">${reinstalls}</div>
                </div>
            </div>

            <div class="orders-table-container" style="background:#fff; padding:20px; border-radius:8px; border:1px solid #ddd;">
                <h3 style="margin-top:0; margin-bottom:20px; border-bottom:2px solid var(--light); padding-bottom:10px; color:var(--dark);">
                    📈 Cantidad de Instalaciones Realizadas por Mes (${new Date().getFullYear()})
                </h3>
                <div style="max-width:600px; margin:0 auto;">
                    ${drawSvgLineChart(lineChartData)}
                </div>
            </div>
        `;
    };

    const renderDesempenoTab = async (subEl, orders) => {
        const isJefe = RBAC.isJefe();
        const requestorSector = user.Sector || 'San Pedro Sula';

        const filtered = orders.filter(o => {
            if (!isJefe) return true;
            return (o.sector || '').toLowerCase().trim() === requestorSector.toLowerCase().trim();
        });

        // Compute advisor total jobs of the month and technician total jobs of the month
        const advisorsData = {};
        const techniciansData = {};

        filtered.forEach(o => {
            const advisor = o.vendedor || 'Carlos Ruiz';
            const tech = o.tecnicoasignado || 'Sin asignar';

            advisorsData[advisor] = (advisorsData[advisor] || 0) + 1;
            if ((o.estado || '').toLowerCase().trim() === 'finalizada') {
                techniciansData[tech] = (techniciansData[tech] || 0) + 1;
            }
        });

        const advisorSlices = Object.entries(advisorsData).map(([label, value]) => ({ label, value }));
        const techSlices = Object.entries(techniciansData).map(([label, value]) => ({ label, value }));

        let metricsHtml = '<p style="color:var(--secondary); font-style:italic;">Cargando métricas de desempeño detalladas...</p>';
        let metricsChartHtml = '';

        try {
            const metricsRes = await routeAction('GOS_CORE', 'getTechnicianMetrics');
            if (metricsRes.status === 'success') {
                const metrics = metricsRes.data || metricsRes.metrics || [];
                if (metrics.length > 0) {
                    metricsHtml = `
                        <table class="gos-table" style="font-size:0.8rem; margin-top:15px;">
                            <thead>
                                <tr>
                                    <th>Técnico</th>
                                    <th>Trabajos</th>
                                    <th>Duración Prom.</th>
                                    <th>Retrasos</th>
                                    <th>Puntualidad</th>
                                    <th>Local vs Remoto</th>
                                    <th>Mejor Vehículo</th>
                                    <th>Peor Vehículo</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${metrics.map(m => `
                                    <tr>
                                        <td><strong>${m.technician}</strong></td>
                                        <td>${m.totalJobs}</td>
                                        <td>${m.avgDuration} min</td>
                                        <td><span class="badge" style="background:#fff3cd; color:#856404;">${m.delaysCount}</span></td>
                                        <td><span class="badge" style="background:#d4edda; color:#155724;">${m.punctualityRate}%</span></td>
                                        <td><small>Local: ${m.avgByLoc?.Local || 0}m / Ext: ${m.avgByLoc?.Remoto || 0}m</small></td>
                                        <td><small style="color:#2b8a3e;">${m.bestVehicle || 'N/A'}</small></td>
                                        <td><small style="color:#c92a2a;">${m.worstVehicle || 'N/A'}</small></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `;

                    // Generate SVG bar chart comparing averages against division average
                    const totalAvg = metrics.reduce((sum, m) => sum + m.avgDuration, 0);
                    const divAvg = Math.round(totalAvg / metrics.length);
                    const chartHeight = 150;
                    const maxVal = Math.max(...metrics.map(m => m.avgDuration), divAvg, 120);

                    let barsHtml = '';
                    metrics.forEach((m, idx) => {
                        const barHeight = Math.round((m.avgDuration / maxVal) * 100);
                        const x = 50 + idx * 80;
                        const y = 120 - barHeight;
                        barsHtml += `
                            <rect x="${x}" y="${y}" width="40" height="${barHeight}" fill="#1a73e8" rx="4"></rect>
                            <text x="${x + 20}" y="${y - 6}" font-size="9" font-weight="bold" fill="#1e293b" text-anchor="middle">${m.avgDuration}m</text>
                            <text x="${x + 20}" y="135" font-size="9" fill="#64748b" text-anchor="middle">${m.technician.split(' ')[0]}</text>
                        `;
                    });

                    const divY = 120 - Math.round((divAvg / maxVal) * 100);
                    const lineHtml = `
                        <line x1="30" y1="${divY}" x2="${50 + metrics.length * 80 + 10}" y2="${divY}" stroke="#dc3545" stroke-width="1.5" stroke-dasharray="3"></line>
                        <text x="${50 + metrics.length * 80 + 15}" y="${divY + 3}" font-size="9" font-weight="bold" fill="#dc3545">Prom: ${divAvg}m</text>
                    `;

                    metricsChartHtml = `
                        <div style="text-align:center; margin-top:20px;">
                            <h4 style="margin-bottom:10px; color:var(--secondary); font-size:0.95rem;">Comparativa de Tiempos Promedio (Nativo SVG)</h4>
                            <svg width="100%" height="${chartHeight}" viewBox="0 0 500 ${chartHeight}" style="background:#fafbfc; border-radius:8px; border:1px solid #e2e8f0; max-width:450px; margin:0 auto; display:block;">
                                <line x1="30" y1="120" x2="450" y2="120" stroke="#cbd5e1" stroke-width="1"></line>
                                ${barsHtml}
                                ${lineHtml}
                            </svg>
                        </div>
                    `;
                } else {
                    metricsHtml = '<p style="color:var(--secondary); font-style:italic;">No hay registros de rendimiento acumulados todavía.</p>';
                }
            }
        } catch (err) {
            console.error("Error loading tech metrics:", err);
            metricsHtml = '<p style="color:var(--danger); font-style:italic;">No se pudieron cargar las métricas detalladas.</p>';
        }

        subEl.innerHTML = `
            <div class="orders-table-container" style="background:#fff; padding:20px; border-radius:8px; border:1px solid #ddd; margin-bottom:20px;">
                <h3 style="margin-top:0; margin-bottom:15px; border-bottom:2px solid var(--light); padding-bottom:8px; color:var(--dark);">Métricas de Desempeño Histórico por Técnico</h3>
                <p style="font-size:0.85rem; color:var(--secondary); margin:0 0 10px 0;">Registro acumulativo de duraciones promedio, vehículos y puntualidad.</p>
                ${metricsHtml}
                ${metricsChartHtml}
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; flex-wrap:wrap; margin-bottom:30px;">
                <!-- Productividad Asesores -->
                <div class="orders-table-container" style="background:#fff; padding:20px; border-radius:8px; border:1px solid #ddd;">
                    <h3 style="margin-top:0; margin-bottom:15px; border-bottom:2px solid var(--light); padding-bottom:8px; color:var(--dark);">Productividad de Asesores</h3>
                    <table class="gos-table" style="font-size:0.85rem; margin-bottom:20px;">
                        <thead>
                            <tr><th>Asesor de Venta</th><th>Trabajos Asignados</th></tr>
                        </thead>
                        <tbody>
                            ${Object.entries(advisorsData).map(([name, count]) => `<tr><td><strong>${name}</strong></td><td>${count}</td></tr>`).join('')}
                            ${Object.keys(advisorsData).length === 0 ? '<tr><td colspan="2" style="text-align:center; color:var(--secondary);">No hay datos registrados.</td></tr>' : ''}
                        </tbody>
                    </table>

                    <h4 style="margin-top:20px; margin-bottom:10px; color:var(--secondary); font-size:0.95rem;">Distribución de Ventas (Gráfico Circular)</h4>
                    ${drawSvgPieChart(advisorSlices)}
                </div>

                <!-- Productividad Técnicos -->
                <div class="orders-table-container" style="background:#fff; padding:20px; border-radius:8px; border:1px solid #ddd;">
                    <h3 style="margin-top:0; margin-bottom:15px; border-bottom:2px solid var(--light); padding-bottom:8px; color:var(--dark);">Productividad de Técnicos</h3>
                    <table class="gos-table" style="font-size:0.85rem; margin-bottom:20px;">
                        <thead>
                            <tr><th>Técnico de Instalación</th><th>Trabajos Realizados</th></tr>
                        </thead>
                        <tbody>
                            ${Object.entries(techniciansData).map(([name, count]) => `<tr><td><strong>${name}</strong></td><td>${count}</td></tr>`).join('')}
                            ${Object.keys(techniciansData).length === 0 ? '<tr><td colspan="2" style="text-align:center; color:var(--secondary);">No hay datos registrados.</td></tr>' : ''}
                        </tbody>
                    </table>

                    <h4 style="margin-top:20px; margin-bottom:10px; color:var(--secondary); font-size:0.95rem;">Distribución de Trabajo Técnico (Gráfico Circular)</h4>
                    ${drawSvgPieChart(techSlices)}
                </div>
            </div>
        `;
    };

    const renderUsuariosTab = async (subEl) => {
        subEl.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
            <h3 style="margin:0; color:var(--dark);">Administración de Usuarios</h3>
            <button class="btn btn-primary" id="btn-admin-new-user" style="padding: 6px 12px; font-size:0.85rem;">+ Nuevo Usuario</button>
        </div>
        <div id="admin-users-list">Cargando lista de usuarios...</div>`;

        const listDiv = document.getElementById('admin-users-list');

        const loadUsers = async () => {
            try {
                const res = await routeAction('GOS_CORE', 'getUsersList', { requestorUsername: user.Nombre_Usuario });
                if (res.status === 'success') {
                    let html = `<table class="gos-table" style="font-size:0.85rem;">
                        <thead>
                            <tr><th>Usuario</th><th>Nombre Completo</th><th>Rol/Privilegios</th><th>División/Sector</th><th>Contacto</th><th>Acciones</th></tr>
                        </thead>
                        <tbody>`;
                    res.data.forEach(u => {
                        html += `
                            <tr>
                                <td><strong>${u.nombre_usuario}</strong></td>
                                <td>${u.nombre_completo}</td>
                                <td><span class="badge" style="background:#e8f4fd; color:#1a73e8;">${u.privilegios}</span></td>
                                <td><span class="badge" style="background:#f1f3f5; color:#495057;">${u.sector}</span></td>
                                <td><small>${u.telefono}<br>${u.correo_electronico}</small></td>
                                <td>
                                    <div style="display:flex; gap:5px;">
                                        <button class="btn btn-sm btn-secondary btn-edit-user" data-user='${JSON.stringify(u)}' style="padding: 2px 6px; font-size:0.75rem;">Editar</button>
                                        <button class="btn btn-sm btn-danger btn-delete-user" data-username="${u.nombre_usuario}" style="padding: 2px 6px; font-size:0.75rem;">Eliminar</button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    });
                    html += `</tbody></table>`;
                    listDiv.innerHTML = html;

                    // Bind listeners
                    listDiv.querySelectorAll('.btn-edit-user').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const uObj = JSON.parse(e.currentTarget.dataset.user);
                            renderUserFormModal(uObj);
                        });
                    });

                    listDiv.querySelectorAll('.btn-delete-user').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const uName = e.currentTarget.dataset.username;
                            if (confirm(`¿Desea eliminar el usuario "${uName}" de forma permanente?`)) {
                                const delRes = await routeAction('GOS_CORE', 'deleteUser', { requestorUsername: user.Nombre_Usuario, username: uName });
                                alert(delRes.message);
                                loadUsers();
                            }
                        });
                    });

                } else {
                    listDiv.innerHTML = `<p class="error-msg">Error: ${res.message}</p>`;
                }
            } catch (err) {
                listDiv.innerHTML = `<p class="error-msg">Error de conexión: ${err.message}</p>`;
            }
        };

        const renderUserFormModal = (uObj = null) => {
            const isEdit = !!uObj;
            const title = isEdit ? 'Modificar Usuario' : 'Crear Nuevo Usuario';

            const roles = ['desarrollador', 'jefe', 'asesor', 'tecnico', 'tecnico_exterior'];
            const sectors = ['San Pedro Sula', 'Tegucigalpa', 'La Ceiba', 'Choluteca', 'Occidente'];

            const modalHtml = `
                <div style="padding:15px; text-align:left;">
                    <form id="admin-user-form">
                        <div class="form-group" style="margin-bottom:12px;">
                            <label style="font-weight:bold; font-size:0.85rem;">Nombre de Usuario (Log-in):</label>
                            <input type="text" id="m-user-username" class="form-control" value="${isEdit ? uObj.nombre_usuario : ''}" required ${isEdit ? 'readonly' : ''}>
                        </div>
                        <div class="form-group" style="margin-bottom:12px;">
                            <label style="font-weight:bold; font-size:0.85rem;">Contraseña:</label>
                            <input type="password" id="m-user-pass" class="form-control" placeholder="${isEdit ? 'Dejar vacío para no modificar' : 'Requerida'}" ${isEdit ? '' : 'required'}>
                        </div>
                        <div class="form-group" style="margin-bottom:12px;">
                            <label style="font-weight:bold; font-size:0.85rem;">Nombre Completo:</label>
                            <input type="text" id="m-user-fullname" class="form-control" value="${isEdit ? uObj.nombre_completo : ''}" required>
                        </div>
                        <div class="form-group" style="margin-bottom:12px;">
                            <label style="font-weight:bold; font-size:0.85rem;">Rol / Privilegios:</label>
                            <select id="m-user-priv" class="form-control" required>
                                ${roles.map(r => `<option value="${r}" ${isEdit && uObj.privilegios.toLowerCase() === r ? 'selected' : ''}>${r.toUpperCase()}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom:12px;">
                            <label style="font-weight:bold; font-size:0.85rem;">División / Sector:</label>
                            <select id="m-user-sector" class="form-control" required>
                                ${sectors.map(s => `<option value="${s}" ${isEdit && uObj.sector === s ? 'selected' : ''}>${s}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom:12px;">
                            <label style="font-weight:bold; font-size:0.85rem;">Teléfono:</label>
                            <input type="text" id="m-user-phone" class="form-control" value="${isEdit ? uObj.telefono : ''}">
                        </div>
                        <div class="form-group" style="margin-bottom:12px;">
                            <label style="font-weight:bold; font-size:0.85rem;">Correo Electrónico:</label>
                            <input type="email" id="m-user-email" class="form-control" value="${isEdit ? uObj.correo_electronico : ''}">
                        </div>
                    </form>
                </div>
            `;

            UI_TEMPLATES.modal(
                title,
                modalHtml,
                async () => {
                    const username = document.getElementById('m-user-username').value;
                    const password = document.getElementById('m-user-pass').value;
                    const nombre_completo = document.getElementById('m-user-fullname').value;
                    const privilegios = document.getElementById('m-user-priv').value;
                    const sector = document.getElementById('m-user-sector').value;
                    const telefono = document.getElementById('m-user-phone').value;
                    const correo_electronico = document.getElementById('m-user-email').value;

                    const payload = {
                        requestorUsername: user.Nombre_Usuario,
                        username,
                        password,
                        nombre_completo,
                        privilegios,
                        sector,
                        telefono,
                        correo_electronico
                    };

                    if (isEdit) {
                        payload.id = uObj.id;
                        const res = await routeAction('GOS_CORE', 'updateUser', payload);
                        alert(res.message);
                    } else {
                        const res = await routeAction('GOS_CORE', 'createUser', payload);
                        alert(res.message);
                    }
                    loadUsers();
                }
            );
        };

        document.getElementById('btn-admin-new-user').onclick = () => renderUserFormModal();

        loadUsers();
    };

    const renderConfiguracionTab = async (subEl) => {
        const isJefe = RBAC.isJefe();
        const requestorSector = user.Sector || 'San Pedro Sula';

        let techs = [];
        try {
            const techsRes = await routeAction('GOS_CORE', 'getTechnicians');
            techs = (techsRes.status === 'success' ? techsRes.data : []).filter(t => {
                return (t.sector || '').toLowerCase().trim() === requestorSector.toLowerCase().trim();
            });
        } catch (err) {
            console.error("Error loading techs for unavail form:", err);
        }

        subEl.innerHTML = `
            <div class="orders-table-container" style="background:#fff; padding:20px; border-radius:8px; border:1px solid #ddd; max-width:600px; margin:0 auto;">
                <h3 style="margin-top:0; margin-bottom:20px; border-bottom:2px solid var(--light); padding-bottom:10px; color:var(--dark);">⚙️ Preferencias Locales y Configuración de División</h3>
                <form id="admin-config-form">
                    <div class="form-group" style="margin-bottom:15px;">
                        <label style="font-weight:bold; font-size:0.9rem;">Ámbito de Modificación:</label>
                        <input type="text" class="form-control" value="${isJefe ? 'División de Gestión Local: ' + requestorSector : 'Gestión Global (Desarrollador)'}" readonly style="background:#eee;">
                    </div>
                    <div class="form-group" style="margin-bottom:15px;">
                        <label style="font-weight:bold; font-size:0.9rem;">Radio de Llegada Geocerca (Metros):</label>
                        <input type="number" id="cfg-radio-llegada" class="form-control" value="${AppState.config?.Sistema?.RadioLlegada || 200}" required>
                    </div>
                    <div class="form-group" style="margin-bottom:15px;">
                        <label style="font-weight:bold; font-size:0.9rem;">Tiempo de Espera para Confirmación Técnica (Segundos):</label>
                        <input type="number" id="cfg-tiempo-confirmacion" class="form-control" value="${AppState.config?.Sistema?.TiempoConfirmacion || 60}" required>
                    </div>
                    <div class="form-group" style="margin-bottom:15px;">
                        <label style="font-weight:bold; font-size:0.9rem;">ID Carpeta Raíz de Almacenamiento (Google Drive):</label>
                        <input type="text" id="cfg-drive-root" class="form-control" value="${AppState.config?.Sistema?.RootFolderId || ''}" required ${isJefe ? 'readonly style="background:#eee;"' : ''}>
                    </div>
                    <button type="submit" class="btn btn-primary" style="width:100%; margin-top:10px; padding:10px;">Guardar Cambios de Configuración</button>
                </form>
            </div>

            <div class="orders-table-container" style="background:#fff; padding:20px; border-radius:8px; border:1px solid #ddd; max-width:600px; margin:20px auto 0 auto;">
                <h3 style="margin-top:0; margin-bottom:20px; border-bottom:2px solid var(--light); padding-bottom:10px; color:var(--dark);">🛑 Gestión de Indisponibilidad Temporal de Técnicos</h3>
                <form id="admin-unavail-form">
                    <div class="form-group" style="margin-bottom:15px;">
                        <label style="font-weight:bold; font-size:0.9rem;">Seleccionar Técnico:</label>
                        <select id="unavail-tecnico" class="form-control" required>
                            <option value="">Seleccione...</option>
                            ${techs.map(t => `<option value="${t.nombre}">${t.nombre}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom:15px;">
                        <label style="font-weight:bold; font-size:0.9rem;">Fecha de Inicio:</label>
                        <input type="date" id="unavail-inicio" class="form-control" required>
                    </div>
                    <div class="form-group" style="margin-bottom:15px;">
                        <label style="font-weight:bold; font-size:0.9rem;">Fecha de Finalización:</label>
                        <input type="date" id="unavail-fin" class="form-control" required>
                    </div>

                    <div id="unavail-partial-container" style="display:none; background: #fff8f8; border: 1px solid #ffe3e3; padding: 12px; border-radius: 6px; margin-bottom:15px;">
                        <label style="font-weight:bold; font-size:0.85rem; color:#c92a2a; display:block; margin-bottom:5px;">⚠️ Ausencia Parcial (Mismo Día)</label>
                        <label style="font-size:0.8rem; display:block; margin-bottom:5px;">Indique la hora en que el técnico volverá a estar disponible (máximo hasta el turno de 3:00 PM - 5:00 PM):</label>
                        <select id="unavail-retorno" class="form-control">
                            <option value="">Seleccione...</option>
                            <option value="10:00">10:00 AM</option>
                            <option value="12:00">12:00 PM</option>
                            <option value="13:00">01:00 PM</option>
                            <option value="15:00">03:00 PM (Turno 3:00 PM - 5:00 PM)</option>
                        </select>
                    </div>

                    <button type="submit" class="btn btn-danger" style="width:100%; padding:10px; font-weight:bold;">Registrar Ausencia de Técnico</button>
                </form>

                <div id="unavail-list-container" style="margin-top:20px; border-top:1px dashed #ddd; padding-top:15px;">
                    <h4 style="margin-top:0; margin-bottom:10px; color:var(--dark);">Historial de Ausencias / Indisponibilidades:</h4>
                    <div id="unavail-table-wrapper">Cargando ausencias...</div>
                </div>
            </div>
        `;

        document.getElementById('admin-config-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const radio = document.getElementById('cfg-radio-llegada').value;
            const time = document.getElementById('cfg-tiempo-confirmacion').value;
            const drive = document.getElementById('cfg-drive-root').value;

            if (isJefe) {
                alert(`Guardando configuración local únicamente para la división: ${requestorSector}. Las carpetas globales de Drive permanecen restringidas.`);
            }

            if (!AppState.config) AppState.config = {};
            if (!AppState.config.Sistema) AppState.config.Sistema = {};

            AppState.config.Sistema.RadioLlegada = radio;
            AppState.config.Sistema.TiempoConfirmacion = time;
            if (!isJefe) AppState.config.Sistema.RootFolderId = drive;

            alert("Configuraciones de la división guardadas correctamente de forma local en la sesión.");
        });

        // Event listeners for start and end date of unavailability
        const startInput = document.getElementById('unavail-inicio');
        const endInput = document.getElementById('unavail-fin');
        const partialContainer = document.getElementById('unavail-partial-container');
        const returnSelect = document.getElementById('unavail-retorno');

        const checkPartialDates = () => {
            if (startInput.value && endInput.value && startInput.value === endInput.value) {
                partialContainer.style.display = 'block';
                returnSelect.setAttribute('required', 'true');
            } else {
                partialContainer.style.display = 'none';
                returnSelect.removeAttribute('required');
                returnSelect.value = '';
            }
        };

        startInput.addEventListener('change', checkPartialDates);
        endInput.addEventListener('change', checkPartialDates);

        // Load unavailability list
        const loadUnavailabilityList = async () => {
            const tableWrapper = document.getElementById('unavail-table-wrapper');
            if (!tableWrapper) return;
            try {
                const res = await routeAction('GOS_CORE', 'getUnavailability');
                if (res.status === 'success') {
                    const filteredList = res.data.filter(u => u.division.toLowerCase().trim() === requestorSector.toLowerCase().trim());
                    if (filteredList.length === 0) {
                        tableWrapper.innerHTML = '<p style="color:var(--secondary); font-style:italic;">No hay registros de indisponibilidad para esta división.</p>';
                        return;
                    }
                    tableWrapper.innerHTML = `
                        <table class="gos-table" style="font-size:0.8rem;">
                            <thead>
                                <tr>
                                    <th>Técnico</th>
                                    <th>Inicio</th>
                                    <th>Finalización</th>
                                    <th>Tipo</th>
                                    <th>Hora Retorno</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filteredList.map(u => `
                                    <tr>
                                        <td><strong>${u.tecnico}</strong></td>
                                        <td>${u.fechaInicio}</td>
                                        <td>${u.fechaFin}</td>
                                        <td>${u.esParcial ? 'Ausencia Parcial' : 'Día Completo'}</td>
                                        <td>${u.horaRetorno || '--:--'}</td>
                                        <td><span class="badge" style="background:${u.estado === 'Activo' ? '#28a745' : '#6c757d'}; color:white;">${u.estado}</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `;
                }
            } catch (err) {
                console.error("Error loading unavailability list:", err);
                tableWrapper.innerHTML = '<p style="color:var(--danger); font-style:italic;">Error al cargar indisponibilidades.</p>';
            }
        };

        await loadUnavailabilityList();

        document.getElementById('admin-unavail-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const tecnico = document.getElementById('unavail-tecnico').value;
            const fechaInicio = startInput.value;
            const fechaFin = endInput.value;
            const esParcial = (fechaInicio === fechaFin);
            const horaRetorno = returnSelect.value;

            try {
                const res = await routeAction('GOS_CORE', 'saveUnavailability', {
                    tecnico,
                    fechaInicio,
                    fechaFin,
                    esParcial,
                    horaRetorno,
                    division: requestorSector
                });

                if (res.status === 'success') {
                    alert("¡Indisponibilidad del técnico registrada con éxito!");
                    document.getElementById('admin-unavail-form').reset();
                    partialContainer.style.display = 'none';
                    await loadUnavailabilityList();
                } else {
                    alert("Error: " + res.message);
                }
            } catch (err) {
                alert("Error de conexión: " + err.message);
            }
        });

        // Insert Asignación Preferencial Form
        const prefDiv = document.createElement('div');
        prefDiv.className = 'orders-table-container';
        prefDiv.style = 'background:#fff; padding:20px; border-radius:8px; border:1px solid #ddd; max-width:600px; margin:20px auto 0 auto;';
        prefDiv.innerHTML = `
            <h3 style="margin-top:0; margin-bottom:20px; border-bottom:2px solid var(--light); padding-bottom:10px; color:var(--dark);">🛠️ Asignación Preferencial de Técnico a Trabajo</h3>
            <form id="admin-specialization-form">
                <div class="form-group" style="margin-bottom:15px;">
                    <label style="font-weight:bold; font-size:0.9rem;">Seleccionar Técnico:</label>
                    <select id="pref-tecnico" class="form-control" required>
                        <option value="">Seleccione...</option>
                        ${techs.map(t => `<option value="${t.nombre}">${t.nombre}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group" style="margin-bottom:15px;">
                    <label style="font-weight:bold; font-size:0.9rem;">Buscar y Seleccionar Trabajo:</label>
                    <div style="display:flex; gap:10px;">
                        <input type="text" id="pref-work-id" class="form-control" readonly required placeholder="Seleccione un trabajo ->">
                        <button type="button" class="btn btn-outline-primary" id="btn-select-pref-work" style="padding: 6px 12px; font-size:0.85rem; font-weight:bold; min-width:160px;">Seleccionar trabajo ></button>
                    </div>
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%; padding:10px; font-weight:bold;">Guardar Asignación Preferencial</button>
            </form>
        `;
        subEl.appendChild(prefDiv);

        document.getElementById('btn-select-pref-work').addEventListener('click', async () => {
            try {
                const ordersRes = await routeAction('GOS_CORE', 'getOrders');
                if (ordersRes.status !== 'success') {
                    alert("Error al cargar órdenes para selección.");
                    return;
                }
                const activeOrds = ordersRes.data.filter(o => {
                    const stateLower = (o.estado || '').toLowerCase().trim();
                    if (['cancelada', 'expirada', 'finalizada'].includes(stateLower)) return false;
                    return (o.sector || '').toLowerCase().trim() === requestorSector.toLowerCase().trim();
                });

                const modalHtml = `
                    <div style="padding:15px; text-align:left; max-height:350px; overflow-y:auto;">
                        <p style="margin-bottom:15px; font-weight:bold;">Seleccione un trabajo activo de la planificación semanal:</p>
                        <div style="display:flex; flex-direction:column; gap:10px;">
                            ${activeOrds.map(o => `
                                <button class="btn btn-outline pref-work-select-opt" data-id="${o.id}" style="text-align:left; border-color:#ddd; color:var(--dark); padding:10px; border-radius:6px; background:#fafbfc; transition:all 0.2s;">
                                    📅 <strong>OT-#${o.id}</strong> - ${o.fecha} (${o.hora})<br>
                                    👤 Cliente: ${o.cliente} | 🚗 ${o.marca || ''} ${o.modelo || ''} | Estado: ${o.estado}
                                </button>
                            `).join('')}
                            ${activeOrds.length === 0 ? '<p style="color:var(--secondary); font-style:italic;">No hay trabajos activos/reservados esta semana.</p>' : ''}
                        </div>
                        <div style="border-top: 1px dashed #ddd; margin-top:20px; padding-top:15px; text-align:center;">
                            <button class="btn btn-primary" id="btn-pref-create-new-work">+ Crear Nuevo Trabajo</button>
                        </div>
                    </div>
                `;

                UI_TEMPLATES.modal(
                    'Selección de Trabajo para Especialización',
                    modalHtml,
                    () => {}
                );

                const modalConfirmBtn = document.getElementById('modal-confirm');
                if (modalConfirmBtn) modalConfirmBtn.style.display = 'none';
                const modalCancelBtn = document.getElementById('modal-cancel');
                if (modalCancelBtn) modalCancelBtn.textContent = 'Cancelar';

                document.querySelectorAll('.pref-work-select-opt').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const oId = e.currentTarget.dataset.id;
                        document.getElementById('pref-work-id').value = oId;
                        document.querySelector('.modal-overlay')?.remove();
                    });
                });

                document.getElementById('btn-pref-create-new-work').addEventListener('click', () => {
                    document.querySelector('.modal-overlay')?.remove();
                    loadSection('agenda');
                });

            } catch (err) {
                alert("Error al cargar agenda para selección: " + err.message);
            }
        });

        document.getElementById('admin-specialization-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const tecnico = document.getElementById('pref-tecnico').value;
            const orderId = document.getElementById('pref-work-id').value;

            try {
                const res = await routeAction('GOS_CORE', 'updateOrderTechnician', { orderId, technician: tecnico });
                if (res.status === 'success') {
                    alert(`¡Asignación preferencial guardada exitosamente!\nTécnico ${tecnico} ha sido asignado a la orden #${orderId}.`);
                    document.getElementById('admin-specialization-form').reset();
                } else {
                    alert("Error: " + res.message);
                }
            } catch (err) {
                alert("Error de conexión: " + err.message);
            }
        });
    };

    const renderHorasExtrasTab = (subEl) => {
        const currentMonthStr = new Date().toISOString().substring(0, 7);
        subEl.innerHTML = `
            <div class="orders-table-container" style="background:#fff; padding:20px; border-radius:8px; border:1px solid #ddd; margin-bottom:20px;">
                <h3 style="margin-top:0; margin-bottom:15px; color:var(--dark);">Reporte Mensual de Horas Extras de Técnicos</h3>
                <div style="display:flex; gap:10px; align-items:center; margin-bottom:20px;">
                    <label style="font-weight:bold;">Seleccione Mes:</label>
                    <input type="month" id="extra-hours-month" class="form-control" value="${currentMonthStr}" style="width:auto;">
                    <button class="btn btn-primary" id="btn-get-extra-hours" style="padding: 6px 15px;">Calcular Horas Extras</button>
                    <button class="btn btn-secondary" id="btn-export-extra-hours" style="display:none; padding: 6px 15px;">📥 Exportar Reporte</button>
                </div>

                <div id="extra-hours-report-results">
                    <p style="color:var(--secondary); font-style:italic;">Seleccione el mes y haga clic en Calcular Horas Extras.</p>
                </div>
            </div>
        `;

        let lastReportData = null;

        document.getElementById('btn-get-extra-hours').onclick = async () => {
            const mStr = document.getElementById('extra-hours-month').value;
            const resDiv = document.getElementById('extra-hours-report-results');
            const expBtn = document.getElementById('btn-export-extra-hours');
            expBtn.style.display = 'none';

            resDiv.innerHTML = UI_TEMPLATES.loading;

            try {
                const res = await routeAction('GOS_CORE', 'getOvertimeReport', { monthStr: mStr, requestorUsername: user.Nombre_Usuario });
                if (res.status === 'success') {
                    lastReportData = res.data;
                    if (res.data.length === 0) {
                        resDiv.innerHTML = `<p style="color:var(--secondary); font-style:italic;">No hay horas extraordinarias registradas para los técnicos en este mes.</p>`;
                        return;
                    }

                    expBtn.style.display = 'inline-block';
                    let html = `<table class="gos-table" style="font-size:0.85rem;">
                        <thead>
                            <tr><th>Técnico</th><th>Horas Extraordinarias Acumuladas</th></tr>
                        </thead>
                        <tbody>`;
                    res.data.forEach(item => {
                        html += `
                            <tr>
                                <td><strong>${item.tecnico}</strong></td>
                                <td><span style="font-size:1.1rem; font-weight:bold; color:var(--primary);">${item.horas_extras} hrs</span></td>
                            </tr>
                        `;
                    });
                    html += `</tbody></table>`;
                    resDiv.innerHTML = html;
                } else {
                    resDiv.innerHTML = `<p class="error-msg">Error: ${res.message}</p>`;
                }
            } catch (err) {
                resDiv.innerHTML = `<p class="error-msg">Error de conexión: ${err.message}</p>`;
            }
        };

        document.getElementById('btn-export-extra-hours').onclick = () => {
            if (!lastReportData) return;
            const mStr = document.getElementById('extra-hours-month').value;
            const csvRows = [["Tecnico", "Horas Extras Acumuladas", "Mes"]];
            lastReportData.forEach(item => {
                csvRows.push([item.tecnico, item.horas_extras, mStr]);
            });
            const csvContent = "data:text/csv;charset=utf-8," + csvRows.map(e => e.join(",")).join("\n");
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `GOS_Horas_Extras_${mStr}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };
    };

    renderLayout();
}

async function renderAdminMetricsModule(container) {
    const user = AppState.user;
    if (!user) {
        container.innerHTML = '<p>Por favor inicie sesión para ver esta información.</p>';
        return;
    }

    try {
        container.innerHTML = '<p>Cargando métricas administrativas...</p>';
        const result = await routeAction('GOS_CORE', 'getOrders');
        if (result.status !== 'success') {
            container.innerHTML = `<p class="error-msg">Error al cargar datos: ${result.message}</p>`;
            return;
        }

        const orders = result.data;

        // Calcular Métricas Globales/Administrativas
        const totalPending = orders.filter(o => ['pendiente', 'asignada'].includes((o.estado || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))).length;

        const todayStr = new Date().toISOString().split('T')[0];
        const totalAssignedToday = orders.filter(o => {
            const dateMatch = o.fecha === todayStr;
            const statusMatch = ['asignada', 'en camino', 'llego', 'vehiculo recibido', 'iniciando', 'instalando', 'haciendo pruebas', 'instalacion completada'].includes((o.estado || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
            return dateMatch && statusMatch;
        }).length;

        const totalReceived = orders.filter(o => (o.estado || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'vehiculo recibido').length;
        const totalFinished = orders.filter(o => (o.estado || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'finalizada').length;

        // Calcular distribución para gráficos
        const techCounts = {};
        orders.forEach(o => {
            if (o.tecnicoasignado && o.tecnicoasignado !== 'Sin asignar') {
                techCounts[o.tecnicoasignado] = (techCounts[o.tecnicoasignado] || 0) + 1;
            }
        });
        const chartData = Object.entries(techCounts).map(([label, value]) => ({ label, value }));

        container.innerHTML = `
            <div style="background: #eef2f7; padding:15px; border-radius:8px; margin-bottom:20px; font-size:0.95rem; color:#495057;">
                📊 <strong>Panel de Control Administrativo (Restringido)</strong><br>
                Este módulo consolidado contiene métricas de supervisión operativa y flujo general de toda la operación.
            </div>

            <!-- Métricas Consolidadas -->
            <div class="dashboard-grid">
                <div class="dashboard-card pending">
                    <h3>Trabajos Pendientes Generales</h3>
                    <div class="value">${totalPending}</div>
                </div>
                <div class="dashboard-card assigned">
                    <h3>Trabajos Asignados Hoy</h3>
                    <div class="value">${totalAssignedToday}</div>
                </div>
                <div class="dashboard-card received">
                    <h3>Vehículos Recibidos</h3>
                    <div class="value">${totalReceived}</div>
                </div>
                <div class="dashboard-card finished">
                    <h3>Trabajos Finalizados Globales</h3>
                    <div class="value">${totalFinished}</div>
                </div>
            </div>

            <div style="margin-top:30px; display:grid; grid-template-columns: 1fr 1fr; gap:20px; flex-wrap:wrap;">
                <div class="orders-table-container" style="background:#fff; padding:15px; border-radius:8px; border:1px solid #ddd;">
                    <h3 style="margin-top:0; margin-bottom:15px; border-bottom:2px solid var(--light); padding-bottom:8px; color:var(--dark);">Distribución por Técnico</h3>
                    ${chartData.length > 0 ? UI_TEMPLATES.chart(chartData) : '<p style="color:var(--secondary); font-style:italic;">No hay asignaciones registradas hoy.</p>'}
                </div>
                <div class="orders-table-container" style="background:#fff; padding:15px; border-radius:8px; border:1px solid #ddd;">
                    <h3 style="margin-top:0; margin-bottom:15px; border-bottom:2px solid var(--light); padding-bottom:8px; color:var(--dark);">Resumen Operativo</h3>
                    <p style="font-size:0.9rem; line-height:1.6; color:#495057;">
                        - El <strong>Tiempo Promedio de Instalación</strong> de la semana se mantiene en el rango esperado.<br>
                        - Los sectores activos están procesando solicitudes con normalidad.<br>
                        - Puede exportar un reporte detallado en la sección de <strong>Reportes</strong>.
                    </p>
                </div>
            </div>
        `;
    } catch (error) {
        console.error("Error en renderAdminMetricsModule:", error);
        container.innerHTML = `<p style="color:var(--danger); padding:20px;">Error al conectar con el servidor: ${error.message}</p>`;
    }
}

/**
 * Inicializador de lienzo de firma digital con soporte touch y mouse.
 */
function initSignatureCanvas(canvasId, clearBtnId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    let drawing = false;

    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000000';

    const getMousePos = (e) => {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height)
        };
    };

    const getTouchPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        return {
            x: (touch.clientX - rect.left) * (canvas.width / rect.width),
            y: (touch.clientY - rect.top) * (canvas.height / rect.height)
        };
    };

    canvas.addEventListener('mousedown', (e) => {
        drawing = true;
        const pos = getMousePos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!drawing) return;
        const pos = getMousePos(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    });

    canvas.addEventListener('mouseup', () => drawing = false);
    canvas.addEventListener('mouseleave', () => drawing = false);

    canvas.addEventListener('touchstart', (e) => {
        drawing = true;
        const pos = getTouchPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        if (!drawing) return;
        const pos = getTouchPos(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchend', () => drawing = false);

    const clearBtn = document.getElementById(clearBtnId);
    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        });
    }

    return {
        isEmpty() {
            const buffer = new Uint32Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
            return !buffer.some(color => color !== 0);
        },
        getDataUrl() {
            return canvas.toDataURL('image/png');
        }
    };
}

/**
 * Renderiza el Formulario de Entrega Post-instalación con Firma Digital.
 */
function renderPostInstallationForm(container, order) {
    if (dashboardInterval) {
        clearInterval(dashboardInterval);
        dashboardInterval = null;
    }

    const secureToken = order.token || 'tok_' + order.id;

    container.innerHTML = `
        <div class="reception-container">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid var(--light); padding-bottom:15px; margin-bottom:25px;">
                <h2 style="margin:0; color:var(--success);">Módulo de Entrega de Vehículo (Post-instalación)</h2>
                <button class="btn btn-secondary" id="back-to-dash-btn-post" style="padding: 8px 15px; font-size:0.9rem;">Volver al Dashboard</button>
            </div>

            <fieldset style="border: 1px solid #ddd; border-radius: 8px; padding: 1.5rem; margin-bottom: 25px;">
                <legend style="font-weight:bold; padding: 0 10px; color: var(--secondary);">Detalles de la Orden #${order.id}</legend>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Cliente:</label>
                        <p style="margin:5px 0; font-weight:bold; color:var(--dark);">${order.cliente || 'Sin nombre'}</p>
                    </div>
                    <div class="form-group">
                        <label>Vehículo:</label>
                        <p style="margin:5px 0; font-weight:bold; color:var(--dark);">${order.marca || ''} ${order.modelo || ''} (${order.anio || ''})</p>
                    </div>
                    <div class="form-group">
                        <label>Placa / Color:</label>
                        <p style="margin:5px 0; font-weight:bold; color:var(--dark);">${order.placa || ''} / ${order.color || 'No especificado'}</p>
                    </div>
                    <div class="form-group">
                        <label>Servicio Realizado:</label>
                        <p style="margin:5px 0; font-weight:bold; color:var(--dark);">${order.servicio || 'Instalación Estándar'}</p>
                    </div>
                </div>
            </fieldset>

            <form id="delivery-confirmation-form">
                <fieldset style="border: 1px solid #ddd; border-radius: 8px; padding: 1.5rem; margin-bottom: 25px;">
                    <legend style="font-weight:bold; padding: 0 10px; color: var(--secondary);">Confirmación de Entrega y Firma del Cliente</legend>

                    <div class="form-group" style="margin-bottom:20px;">
                        <label style="display:flex; align-items:center; font-weight:bold; gap:10px; cursor:pointer; color:var(--dark);">
                            <input type="checkbox" id="delivery-confirm-check" required style="width:20px; height:20px;">
                            <span>Confirmar entrega del vehículo al cliente en perfectas condiciones y con servicio verificado de GPS.</span>
                        </label>
                    </div>

                    <div class="form-group">
                        <label style="font-weight:bold; color:var(--dark);">Firma Digital del Cliente:</label>
                        <p style="margin:2px 0 10px 0; font-size:0.8rem; color:var(--secondary);">Dibuje la firma dentro del recuadro punteado:</p>
                        <div class="signature-wrapper">
                            <canvas id="signature-pad" class="signature-canvas" width="450" height="180"></canvas>
                        </div>
                        <div class="signature-actions">
                            <button class="btn btn-secondary btn-sm" id="clear-sig-btn">🔄 Limpiar Firma</button>
                        </div>
                    </div>
                </fieldset>

                <div style="display:flex; gap:15px; justify-content:flex-end;">
                    <button type="button" class="btn btn-secondary" id="cancel-delivery-btn">Cancelar</button>
                    <button type="submit" class="btn btn-success" id="submit-delivery-btn">🤝 Registrar Entrega y Finalizar</button>
                </div>
            </form>
        </div>
    `;

    document.getElementById('back-to-dash-btn-post').onclick = () => loadSection('dashboard');
    document.getElementById('cancel-delivery-btn').onclick = () => loadSection('dashboard');

    const pad = initSignatureCanvas('signature-pad', 'clear-sig-btn');

    document.getElementById('delivery-confirmation-form').onsubmit = async (e) => {
        e.preventDefault();

        if (pad.isEmpty()) {
            alert("Por favor solicite al cliente registrar su firma digital antes de guardar.");
            return;
        }

        const signatureBase64 = pad.getDataUrl();
        const submitBtn = document.getElementById('submit-delivery-btn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '⏳ Guardando entrega...';

        try {
            const result = await routeAction('GOS_CORE', 'updateOrderStatus', {
                orderId: order.id,
                status: 'Finalizada',
                firmaDigital: signatureBase64,
                fechaInstalacion: new Date().toISOString().split('T')[0]
            });

            if (result.status === 'success') {
                alert(`¡Entrega de Vehículo Registrada con Éxito!\nLa orden #${order.id} se ha cerrado correctamente.`);
                loadSection('dashboard');
            } else {
                alert(`Error al guardar entrega: ${result.message}`);
                submitBtn.disabled = false;
                submitBtn.innerHTML = '🤝 Registrar Entrega y Finalizar';
            }
        } catch (error) {
            alert(`Error de red o conexión: ${error.message}`);
            submitBtn.disabled = false;
            submitBtn.innerHTML = '🤝 Registrar Entrega y Finalizar';
        }
    };
}

/**
 * Renderiza el Ticket Pre-instalación (Recepción).
 */
async function renderTicketPreView(container, order) {
    if (dashboardInterval) {
        clearInterval(dashboardInterval);
        dashboardInterval = null;
    }

    container.innerHTML = '<p>Cargando datos del ticket de recepción...</p>';

    try {
        const secureToken = order.token || 'tok_' + order.id;
        const result = await routeAction('GOS_CORE', 'getClientPortalData', { ot: order.id, token: secureToken });

        if (result.status !== 'success') {
            container.innerHTML = `<p class="error-msg">Error al cargar ticket: ${result.message}</p>`;
            return;
        }

        const data = result.data;
        const v = data.vehiculo;
        const serv = data.servicio;
        const damages = data.danos || {};

        let damagesHtml = '';
        let hasDamages = false;

        Object.entries(damages).forEach(([catId, list]) => {
            if (list && list.length > 0) {
                hasDamages = true;
                const catLabel = catId.toUpperCase().replace('_', ' ');
                damagesHtml += `
                    <div style="margin-bottom:8px;">
                        <strong>${catLabel}:</strong>
                        <ul style="margin:3px 0 0 15px; padding:0; font-size:0.85rem;">
                            ${list.map(d => `<li>📍 Posición: (${Math.round(d.x)}%, ${Math.round(d.y)}%) - ${d.note}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
        });

        if (!hasDamages) {
            damagesHtml = '<p style="color:var(--success); margin:0; font-style:italic;">No se registraron anomalías físicas previas en el vehículo.</p>';
        }

        const portalUrl = `${window.location.origin}/portal.html?ot=${order.id}&token=${secureToken}`;
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(portalUrl)}`;

        container.innerHTML = `
            <div class="receipt-container">
                <div class="receipt-header" style="border-bottom: 3px double var(--secondary); padding-bottom:15px; margin-bottom:20px;">
                    <h2 style="margin:0; color:var(--primary);">TICKET DE RECEPCIÓN VEHICULAR</h2>
                    <p style="margin:5px 0; font-size:0.9rem; color:var(--secondary);">GOS - GPS Operations Suite | Pre-instalación</p>
                    <span class="badge badge-en camino" style="font-size:0.85rem; padding: 4px 10px;">RECEPCIÓN PREVIA</span>
                </div>

                <div class="actions-bar" style="display:flex; justify-content:space-between; margin-bottom:25px; flex-wrap:wrap; gap:10px;">
                    <button class="btn btn-secondary" id="ticket-back-btn">⬅️ Volver</button>
                    <button class="btn btn-primary" id="ticket-print-btn">🖨️ Imprimir Ticket</button>
                </div>

                <div class="receipt-section">
                    <h4>Datos Generales de la Orden</h4>
                    <div class="receipt-grid">
                        <div class="receipt-item"><strong>Orden de Trabajo:</strong> ${order.id}</div>
                        <div class="receipt-item"><strong>Fecha de Entrada:</strong> ${serv.fechaRecepcion}</div>
                        <div class="receipt-item"><strong>Lugar de Ejecución:</strong> ${serv.lugar}</div>
                        <div class="receipt-item"><strong>Instalador Responsable:</strong> ${data.instalador.nombre} ${data.instalador.apellido}</div>
                        <div class="receipt-item"><strong>Vendedor:</strong> ${data.vendedor.nombre} ${data.vendedor.apellido}</div>
                    </div>
                </div>

                <div class="receipt-section">
                    <h4>Información del Cliente</h4>
                    <div class="receipt-grid">
                        <div class="receipt-item"><strong>Cliente:</strong> ${order.cliente || 'No especificado'}</div>
                        <div class="receipt-item"><strong>Contacto:</strong> ${order.contacto || ''}</div>
                        <div class="receipt-item"><strong>Teléfono:</strong> ${order.telefono || ''}</div>
                    </div>
                </div>

                <div class="receipt-section">
                    <h4>Ficha del Vehículo</h4>
                    <div class="receipt-grid">
                        <div class="receipt-item"><strong>Marca:</strong> ${v.marca}</div>
                        <div class="receipt-item"><strong>Modelo:</strong> ${v.modelo}</div>
                        <div class="receipt-item"><strong>Año:</strong> ${v.anio}</div>
                        <div class="receipt-item"><strong>Color:</strong> ${v.color}</div>
                        <div class="receipt-item"><strong>Placa:</strong> ${v.placa}</div>
                        <div class="receipt-item"><strong>VIN/Chasis:</strong> ${v.vin || ''}</div>
                        <div class="receipt-item"><strong>Clasificación:</strong> ${v.clasificacionVehiculo || 'No especificada'}</div>
                    </div>
                </div>

                <div class="receipt-section">
                    <h4>Inventario de Daños Registrados</h4>
                    <div class="receipt-damage-list" style="background:#fdfdfe; border:1px solid #ddd; padding:12px; border-radius:6px;">
                        ${damagesHtml}
                    </div>
                </div>

                <div class="qr-code-section" style="text-align:center; margin-top:30px; border-top: 1px dashed #ccc; padding-top:20px;">
                    <img src="${qrCodeUrl}" alt="QR" style="width:140px; height:140px; margin-bottom:5px;">
                    <p style="margin:5px 0 0 0; font-size:0.8rem; font-weight:bold; color:var(--dark);">Código QR de Consulta Seguro</p>
                    <p style="margin:0 auto; font-size:0.75rem; color:var(--secondary); max-width:320px;">
                        Escanee para consultar en línea el estado de avance, las fotografías y anotaciones de su vehículo.
                    </p>
                </div>
            </div>
        `;

        document.getElementById('ticket-back-btn').onclick = () => loadSection('dashboard');
        document.getElementById('ticket-print-btn').onclick = () => window.print();

    } catch (e) {
        container.innerHTML = `<p class="error-msg">Error al conectar con el servidor: ${e.message}</p>`;
    }
}

/**
 * Renderiza la Evidencia Post-instalación (Firma de Entrega).
 */
async function renderTicketPostView(container, order) {
    if (dashboardInterval) {
        clearInterval(dashboardInterval);
        dashboardInterval = null;
    }

    container.innerHTML = '<p>Cargando datos de la evidencia de entrega...</p>';

    try {
        const secureToken = order.token || 'tok_' + order.id;
        const result = await routeAction('GOS_CORE', 'getClientPortalData', { ot: order.id, token: secureToken });

        if (result.status !== 'success') {
            container.innerHTML = `<p class="error-msg">Error al cargar evidencia: ${result.message}</p>`;
            return;
        }

        const data = result.data;
        const v = data.vehiculo;
        const serv = data.servicio;
        const damages = data.danos || {};

        let damagesHtml = '';
        let hasDamages = false;

        Object.entries(damages).forEach(([catId, list]) => {
            if (list && list.length > 0) {
                hasDamages = true;
                const catLabel = catId.toUpperCase().replace('_', ' ');
                damagesHtml += `
                    <div style="margin-bottom:8px;">
                        <strong>${catLabel}:</strong>
                        <ul style="margin:3px 0 0 15px; padding:0; font-size:0.85rem;">
                            ${list.map(d => `<li>📍 Posición: (${Math.round(d.x)}%, ${Math.round(d.y)}%) - ${d.note}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
        });

        if (!hasDamages) {
            damagesHtml = '<p style="color:var(--success); margin:0; font-style:italic;">No se registraron anomalías físicas previas en el vehículo.</p>';
        }

        const signatureHtml = data.firmaDigital
            ? `<div style="text-align:center; margin-top:15px;">
                   <img src="${data.firmaDigital}" alt="Firma del Cliente" style="max-height:120px; border:1px solid #ddd; background:#fff; padding:5px; border-radius:6px; display:inline-block;">
                   <p style="margin:5px 0 0 0; font-size:0.85rem; font-weight:bold; color:var(--dark);">Firma del Cliente (Digital)</p>
                   <p style="margin:0; font-size:0.75rem; color:var(--secondary);">Confirmación de Entrega Satisfecha</p>
               </div>`
            : `<p style="font-style:italic; color:var(--danger);">No se ha registrado firma digital para esta entrega.</p>`;

        container.innerHTML = `
            <div class="receipt-container">
                <div class="receipt-header" style="border-bottom: 3px double var(--secondary); padding-bottom:15px; margin-bottom:20px;">
                    <h2 style="margin:0; color:var(--success);">EVIDENCIA DE ENTREGA VEHICULAR (POST-INSTALACIÓN)</h2>
                    <p style="margin:5px 0; font-size:0.9rem; color:var(--secondary);">GOS - GPS Operations Suite | Post-instalación</p>
                    <span class="badge badge-finalizada" style="font-size:0.85rem; padding: 4px 10px; background:#c3e6cb; color:#155724;">ENTREGADO SATISFACTORIAMENTE</span>
                </div>

                <div class="actions-bar" style="display:flex; justify-content:space-between; margin-bottom:25px; flex-wrap:wrap; gap:10px;">
                    <button class="btn btn-secondary" id="evidence-back-btn">⬅️ Volver</button>
                    <button class="btn btn-primary" id="evidence-print-btn">🖨️ Imprimir Evidencia</button>
                </div>

                <div class="receipt-section">
                    <h4>Datos Generales del Servicio Finalizado</h4>
                    <div class="receipt-grid">
                        <div class="receipt-item"><strong>Orden de Trabajo:</strong> ${order.id}</div>
                        <div class="receipt-item"><strong>Fecha de Recepción:</strong> ${serv.fechaRecepcion}</div>
                        <div class="receipt-item"><strong>Fecha de Instalación:</strong> ${serv.fechaInstalacion}</div>
                        <div class="receipt-item"><strong>Lugar de Ejecución:</strong> ${serv.lugar}</div>
                        <div class="receipt-item"><strong>Instalador Técnico:</strong> ${data.instalador.nombre} ${data.instalador.apellido}</div>
                        <div class="receipt-item"><strong>Vendedor:</strong> ${data.vendedor.nombre} ${data.vendedor.apellido}</div>
                    </div>
                </div>

                <div class="receipt-section">
                    <h4>Información del Cliente</h4>
                    <div class="receipt-grid">
                        <div class="receipt-item"><strong>Cliente:</strong> ${order.cliente || 'No especificado'}</div>
                        <div class="receipt-item"><strong>Contacto:</strong> ${order.contacto || ''}</div>
                        <div class="receipt-item"><strong>Teléfono:</strong> ${order.telefono || ''}</div>
                    </div>
                </div>

                <div class="receipt-section">
                    <h4>Ficha del Vehículo</h4>
                    <div class="receipt-grid">
                        <div class="receipt-item"><strong>Marca:</strong> ${v.marca}</div>
                        <div class="receipt-item"><strong>Modelo:</strong> ${v.modelo}</div>
                        <div class="receipt-item"><strong>Año:</strong> ${v.anio}</div>
                        <div class="receipt-item"><strong>Color:</strong> ${v.color}</div>
                        <div class="receipt-item"><strong>Placa:</strong> ${v.placa}</div>
                        <div class="receipt-item"><strong>VIN/Chasis:</strong> ${v.vin || ''}</div>
                        <div class="receipt-item"><strong>Clasificación:</strong> ${v.clasificacionVehiculo || 'No especificada'}</div>
                    </div>
                </div>

                <div class="receipt-section">
                    <h4>Estado Físico en Recepción Previa</h4>
                    <div class="receipt-damage-list" style="background:#fdfdfe; border:1px solid #ddd; padding:12px; border-radius:6px;">
                        ${damagesHtml}
                    </div>
                </div>

                <div class="receipt-section" style="border-top:1px dashed #ccc; padding-top:20px; margin-top:25px;">
                    <h4>Conformidad de Entrega del Vehículo</h4>
                    <div style="background:#e8f4fd; padding:15px; border-radius:8px; margin-bottom:15px; font-size:0.9rem; color:#1a73e8; line-height:1.4;">
                        El cliente confirma mediante este documento digital haber recibido el vehículo descrito en perfectas condiciones y con el servicio de GPS instalado de conformidad con las pruebas realizadas.
                    </div>
                    ${signatureHtml}
                </div>
            </div>
        `;

        document.getElementById('evidence-back-btn').onclick = () => loadSection('dashboard');
        document.getElementById('evidence-print-btn').onclick = () => window.print();

    } catch (e) {
        container.innerHTML = `<p class="error-msg">Error al conectar con el servidor: ${e.message}</p>`;
    }
}

// ============================================================================
// BUSQUEDA GLOBAL Y ACCIONES RAPIDAS (TRECEAVO)
// ============================================================================
function setupGlobalSearch() {
    const searchInput = document.getElementById('global-search-input');
    const searchResults = document.getElementById('global-search-results');
    if (!searchInput || !searchResults) return;

    searchInput.addEventListener('input', async () => {
        const val = searchInput.value.trim().toLowerCase();
        searchResults.innerHTML = '';
        if (val.length < 2) {
            searchResults.style.display = 'none';
            return;
        }

        try {
            const res = await routeAction('GOS_CORE', 'getOrders');
            if (res.status === 'success') {
                const orders = res.data || [];

                const matches = orders.filter(o => {
                    const fields = [
                        o.id?.toString(),
                        o.cliente,
                        o.contacto,
                        o.vin,
                        o.placa,
                        o.marca,
                        o.modelo,
                        o.tecnicoasignado,
                        o.vendedor,
                        o.direccion,
                        o.servicio,
                        o.estado
                    ];
                    return fields.some(f => {
                        const valStr = (f || '').toString().toLowerCase().trim();
                        return valStr.includes(val) || (val.length >= 3 && levenshteinDistance(val, valStr) <= 2);
                    });
                });

                if (matches.length > 0) {
                    searchResults.style.display = 'block';
                    matches.forEach(o => {
                        const div = document.createElement('div');
                        div.className = 'suggestion-item';
                        div.style.padding = '10px';
                        div.style.cursor = 'pointer';
                        div.style.borderBottom = '1px solid #eee';
                        div.innerHTML = `
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span style="font-weight:bold; color:var(--primary);">OT-#${o.id}</span>
                                <span class="badge" style="background:#e8f4fd; color:#1a73e8; font-size:0.7rem;">${o.estado}</span>
                            </div>
                            <div style="font-size:0.8rem; color:var(--dark); margin-top:2px;">
                                👤 <strong>Clte:</strong> ${o.cliente || 'S/N'} | 🚗 ${o.marca || ''} ${o.modelo || ''} (${o.placa || 'Sin placa'})
                            </div>
                            <div style="font-size:0.75rem; color:var(--secondary); margin-top:2px;">
                                🛠️ <strong>Téc:</strong> ${o.tecnicoasignado || 'Sin asignar'} | 📅 ${o.fecha || ''} ${o.hora || ''}
                            </div>
                        `;

                        div.onclick = () => {
                            searchInput.value = '';
                            searchResults.style.display = 'none';
                            showOrderDetailsModal(o);
                        };
                        searchResults.appendChild(div);
                    });
                } else {
                    searchResults.innerHTML = '<p style="color:var(--secondary); font-style:italic; font-size:0.8rem; padding:10px; margin:0; text-align:center;">No se encontraron resultados aproximados</p>';
                    searchResults.style.display = 'block';
                }
            }
        } catch (err) {
            console.error("Error global search:", err);
        }
    });

    document.addEventListener('click', (e) => {
        if (e.target !== searchInput) {
            searchResults.style.display = 'none';
        }
    });
}

function showOrderDetailsModal(o) {
    const secureToken = o.token || 'tok_' + o.id;
    const portalUrl = `${window.location.origin}/portal.html?ot=${o.id}&token=${secureToken}`;

    const modalContentHtml = `
        <div style="text-align:left; line-height:1.5; font-size:0.9rem; max-height:450px; overflow-y:auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:8px;">
                <h4 style="margin:0; color:var(--primary); font-size:1.1rem;">Detalles de la Orden OT-#${o.id}</h4>
                <span class="badge badge-pendiente" style="font-size:0.8rem;">${o.estado}</span>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:15px;">
                <div>👤 <strong>Cliente:</strong> ${o.cliente || 'S/N'}</div>
                <div>📞 <strong>Teléfono:</strong> ${o.telefono || 'N/A'}</div>
                <div style="grid-column: 1 / -1;">🏠 <strong>Dirección del Cliente:</strong> ${o.contacto || 'No especificada'}</div>
                <div style="grid-column: 1 / -1;">📍 <strong>Instalación en:</strong> ${o.direccion ? o.direccion : 'Oficina de la División (Local)'}</div>
                <div>🚗 <strong>Vehículo:</strong> ${o.marca || ''} ${o.modelo || ''} (${o.anio || ''})</div>
                <div>🎨 <strong>Color:</strong> ${o.color || 'N/A'} | 🔢 <strong>Placa:</strong> ${o.placa || 'N/A'}</div>
                <div style="grid-column: 1 / -1;">🆔 <strong>VIN/Chasis:</strong> ${o.vin || 'N/A'}</div>
                <div>⚙️ <strong>Número de Motor:</strong> ${o.motor || 'N/A'}</div>
                <div>🔢 <strong>Número de Inventario:</strong> ${o.inventario || 'N/A'}</div>
                <div>💼 <strong>Servicio Contratado:</strong> ${o.servicio || 'No especificado'}</div>
                <div>💼 <strong>Vendedor:</strong> ${o.vendedor || 'S/V'}</div>
                <div>🛠️ <strong>Técnico:</strong> ${o.tecnicoasignado || 'Sin asignar'}</div>
                <div>📅 <strong>Fecha:</strong> ${o.fecha || ''}</div>
                <div>⏱️ <strong>Hora (Turno):</strong> ${o.hora || ''}</div>
                <div style="grid-column: 1 / -1; border-top:1px dashed #eee; padding-top:8px; margin-top:5px;">👤 <strong>Persona de Contacto:</strong> ${o.contactonombre || o.contacto_nombre || 'No registrado'}</div>
                <div style="grid-column: 1 / -1;">📞 <strong>Teléfono del Contacto:</strong> ${o.contactotelefono || o.contacto_telefono || 'No registrado'}</div>

                ${o.coordenadas ? `
                <div style="grid-column: 1 / -1; margin-top: 10px; text-align: center;">
                    <strong>📍 Ubicación en Mapa (Haga clic para navegar):</strong>
                    <div id="details-map" style="width: 100%; max-width: 250px; aspect-ratio: 1 / 1; border-radius: 8px; border: 1px solid #ddd; margin-top: 5px; cursor: pointer; margin-left: auto; margin-right: auto;" title="Haga clic para abrir en Google Maps"></div>
                </div>
                ` : ''}
            </div>

            <div style="border-top:1px solid #eee; padding-top:10px; margin-top:10px;">
                <strong>📋 Inventario / Notas:</strong>
                <p style="margin:5px 0; font-size:0.8rem; background:#f8f9fa; padding:8px; border-radius:4px; color:var(--secondary);">${o.inventario || 'Ninguno'}</p>
            </div>

            <div style="border-top:1px solid #eee; padding-top:10px; margin-top:10px;">
                <strong>💡 Acciones Rápidas (Shortcuts):</strong>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
                    <button class="btn btn-sm btn-primary" id="act-open-agenda" style="font-size:0.75rem; padding:5px 8px;">📅 Abrir Agenda</button>
                    <button class="btn btn-sm btn-outline" id="act-open-drive" style="font-size:0.75rem; padding:5px 8px;">📂 Abrir Drive</button>
                    <button class="btn btn-sm btn-outline" id="act-open-maps" style="font-size:0.75rem; padding:5px 8px;">📍 Ver Mapa</button>
                    <button class="btn btn-sm btn-secondary" id="act-view-ticket-pre" style="font-size:0.75rem; padding:5px 8px;">🎟️ Ticket Pre</button>
                    ${['instalacion completada', 'terminando la instalacion', 'terminando la instalación'].includes((o.estado || '').toLowerCase().trim()) ? `<button class="btn btn-sm btn-success" id="act-deliver-vehicle" style="font-size:0.75rem; padding:5px 8px;">🤝 Entregar Vehículo</button>` : ''}
                    ${['pendiente', 'asignada'].includes((o.estado || '').toLowerCase().trim()) ? `<button class="btn btn-sm btn-secondary" id="act-start-transit" style="font-size:0.75rem; padding:5px 8px;">🚚 Iniciar camino</button>` : ''}
                </div>
            </div>
        </div>
    `;

    UI_TEMPLATES.modal(
        `OT-#${o.id} - Búsqueda Rápida`,
        modalContentHtml,
        () => {}, // Empty confirm
        () => {}  // Empty cancel
    );

    const modalConfirmBtn = document.getElementById('modal-confirm');
    if (modalConfirmBtn) {
        modalConfirmBtn.textContent = 'Cerrar';
        modalConfirmBtn.className = 'btn btn-secondary';
    }
    const modalCancelBtn = document.getElementById('modal-cancel');
    if (modalCancelBtn) modalCancelBtn.style.display = 'none';

    // Initialize details map if available and coords exist
    setTimeout(() => {
        const detailsMapEl = document.getElementById('details-map');
        if (detailsMapEl && window.L && o.coordenadas) {
            const [lat, lng] = o.coordenadas.split(',').map(Number);
            if (!isNaN(lat) && !isNaN(lng)) {
                try {
                    const dMap = L.map(detailsMapEl, {
                        zoomControl: false,
                        attributionControl: false
                    }).setView([lat, lng], 14);
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        maxZoom: 19
                    }).addTo(dMap);
                    L.marker([lat, lng]).addTo(dMap);

                    detailsMapEl.onclick = (e) => {
                        e.stopPropagation();
                        // Open native Google Maps app
                        window.open(`geo:${lat},${lng}?q=${lat},${lng}`, '_system');
                        window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
                    };
                } catch (mapErr) {
                    console.error("Error loading details map:", mapErr);
                }
            }
        }
    }, 400);

    document.getElementById('act-open-agenda').onclick = () => {
        document.querySelector('.modal-overlay')?.remove();
        loadSection('agenda');
    };
    document.getElementById('act-open-drive').onclick = () => {
        openDrive(o.id, o.cliente);
    };
    document.getElementById('act-open-maps').onclick = () => {
        openMaps(o.coordenadas);
    };
    document.getElementById('act-view-ticket-pre').onclick = () => {
        document.querySelector('.modal-overlay')?.remove();
        const contentEl = document.getElementById('section-content');
        renderTicketPreView(contentEl, o);
    };
    const deliverBtn = document.getElementById('act-deliver-vehicle');
    if (deliverBtn) {
        deliverBtn.onclick = () => {
            document.querySelector('.modal-overlay')?.remove();
            const contentEl = document.getElementById('section-content');
            renderPostInstallationForm(contentEl, o);
        };
    }
    const startTransitBtn = document.getElementById('act-start-transit');
    if (startTransitBtn) {
        startTransitBtn.onclick = () => {
            document.querySelector('.modal-overlay')?.remove();
            markStatus(o.id, 'En Camino');
        };
    }
}

// ============================================================================
// CENTRO DE NOTIFICACIONES CENTRALIZADO (TRECEAVO)
// ============================================================================
let systemNotifications = [];

async function updateNotifications() {
    const listEl = document.getElementById('notification-items-list');
    const counterEl = document.getElementById('notification-counter');
    if (!listEl || !counterEl) return;

    try {
        const res = await routeAction('GOS_CORE', 'getOrders');
        if (res.status === 'success') {
            const orders = res.data || [];
            systemNotifications = []; // Recalculate

            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];

            orders.forEach(o => {
                const statusLower = (o.estado || '').toLowerCase().trim();

                // 1. Trabajos retrasados
                if (statusLower === 'trabajo retrasado' || statusLower === 'retrasado') {
                    systemNotifications.push({
                        id: o.id,
                        order: o,
                        type: 'Retraso',
                        priority: 'Máxima',
                        date: o.fecha || todayStr,
                        status: o.estado,
                        message: `⚠️ OT-#${o.id} presenta retraso.`,
                        actionLabel: 'Ver Detalles',
                        action: () => showOrderDetailsModal(o)
                    });
                }

                // 2. Espera prolongada (>40 min)
                if (statusLower === 'vehiculo no disponible' || statusLower === 'vehículo no disponible') {
                    const waitMin = getWaitTimeInMinutes(o);
                    if (waitMin > 40) {
                        systemNotifications.push({
                            id: o.id,
                            order: o,
                            type: 'Espera',
                            priority: 'Alta',
                            date: o.fecha || todayStr,
                            status: o.estado,
                            message: `⏳ OT-#${o.id} en espera prolongada (${waitMin} min).`,
                            actionLabel: 'Revisar Espera',
                            action: () => showOrderDetailsModal(o)
                        });
                    }
                }

                // 3. Citas próximas (scheduled for today starting in < 60 minutes)
                if (o.fecha === todayStr && ['pendiente', 'asignada'].includes(statusLower) && o.hora) {
                    const match = o.hora.match(/^(\d{2}):(\d{2})/);
                    if (match) {
                        const h = parseInt(match[1]);
                        const m = parseInt(match[2]);
                        const apptTime = new Date(`${todayStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
                        const diffMs = apptTime - now;
                        const diffMin = Math.floor(diffMs / (1000 * 60));

                        if (diffMin >= 0 && diffMin <= 60) {
                            systemNotifications.push({
                                id: o.id,
                                order: o,
                                type: 'Próxima',
                                priority: 'Normal',
                                date: o.fecha,
                                status: o.estado,
                                message: `📅 OT-#${o.id} programada para iniciar en ${diffMin} min.`,
                                actionLabel: 'Ver Cita',
                                action: () => showOrderDetailsModal(o)
                            });
                        }
                    }
                }
            });

            const count = systemNotifications.length;
            if (count > 0) {
                counterEl.textContent = count;
                counterEl.style.display = 'flex';
            } else {
                counterEl.style.display = 'none';
            }

            if (count === 0) {
                listEl.innerHTML = '<p style="color:var(--secondary); font-style:italic; font-size:0.8rem; margin:0; padding:10px; text-align:center;">No hay notificaciones activas</p>';
            } else {
                let html = '';
                systemNotifications.forEach((n, idx) => {
                    const isMax = n.priority === 'Máxima';
                    const isHigh = n.priority === 'Alta';
                    const badgeBg = isMax ? '#dc3545' : (isHigh ? '#fd7e14' : '#28a745');

                    html += `
                        <div class="notification-item" style="border-left: 4px solid ${badgeBg}; background:#f8fafc; padding:8px; border-radius:4px; font-size:0.8rem; box-shadow:0 1px 3px rgba(0,0,0,0.05); display:flex; flex-direction:column; gap:4px; text-align:left;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span class="badge" style="background:${badgeBg}; color:white; font-size:0.65rem; padding:1px 5px; text-transform:none;">${n.type} [${n.priority}]</span>
                                <small style="color:var(--secondary); font-size:0.7rem;">${n.date}</small>
                            </div>
                            <div style="color:var(--dark); font-weight:500;">${n.message}</div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:3px; border-top:1px solid #edf2f7; padding-top:4px;">
                                <small style="color:var(--secondary);"><strong>Recomendado:</strong> ${n.type === 'Retraso' ? 'Reasignar' : (n.type === 'Espera' ? 'Adelantar' : 'Preparar')}</small>
                                <button class="btn btn-sm btn-primary" onclick="triggerNotificationAction(${idx})" style="padding:1px 6px; font-size:0.7rem;">${n.actionLabel}</button>
                            </div>
                        </div>
                    `;
                });
                listEl.innerHTML = html;
            }
        }
    } catch (err) {
        console.error("Error updating notifications:", err);
    }
}

window.triggerNotificationAction = (idx) => {
    const notif = systemNotifications[idx];
    if (notif && notif.action) {
        const dropdown = document.getElementById('notification-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        notif.action();
    }
};

function setupNotificationCenter() {
    const bell = document.getElementById('nav-notification-bell');
    const dropdown = document.getElementById('notification-dropdown');
    const clearLink = document.getElementById('clear-notifications-link');
    if (!bell || !dropdown) return;

    bell.addEventListener('click', (e) => {
        e.stopPropagation();
        const show = dropdown.style.display === 'none' || !dropdown.style.display;
        dropdown.style.display = show ? 'block' : 'none';
    });

    if (clearLink) {
        clearLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            systemNotifications = [];
            const listEl = document.getElementById('notification-items-list');
            const counterEl = document.getElementById('notification-counter');
            if (listEl) listEl.innerHTML = '<p style="color:var(--secondary); font-style:italic; font-size:0.8rem; margin:0; padding:10px; text-align:center;">No hay notificaciones activas</p>';
            if (counterEl) counterEl.style.display = 'none';
            dropdown.style.display = 'none';
        });
    }

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== bell) {
            dropdown.style.display = 'none';
        }
    });

    updateNotifications();
    setInterval(updateNotifications, 30000);
}

// Registro de Service Worker para PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('GOs Service Worker registrado'))
            .catch(err => console.warn('Fallo al registrar Service Worker', err));
    });
}

document.addEventListener('DOMContentLoaded', init);
