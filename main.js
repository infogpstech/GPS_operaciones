import { routeAction } from './api-config.js';

const SESSION_KEY = 'gos_session';

/**
 * UI_TEMPLATES: Bloques de construcción para la interfaz.
 * v0.4.0
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

    orderForm(options = {}) {
        return `
            <h3>Crear Nueva Orden</h3>
            <form id="order-form" class="order-form">
                <div class="form-grid">
                    <div class="form-group"><label>Fecha</label><input type="date" name="fecha" class="form-control" required></div>
                    <div class="form-group"><label>Hora</label><input type="time" name="hora" class="form-control" required></div>
                    <div class="form-group"><label>Cliente</label><input type="text" name="cliente" class="form-control" required></div>
                    <div class="form-group"><label>Contacto</label><input type="text" name="contacto" class="form-control"></div>
                    <div class="form-group"><label>Teléfono</label><input type="text" name="telefono" class="form-control" required></div>
                    <div class="form-group"><label>Dirección</label><input type="text" name="direccion" class="form-control" required></div>
                    <div class="form-group"><label>Coordenadas (Lat, Lng)</label><input type="text" name="coordenadas" class="form-control" placeholder="Ej: 9.9333, -84.0833"></div>
                    <div class="form-group"><label>Link Google Maps</label><input type="url" name="linkMaps" class="form-control"></div>
                    <div class="form-group"><label>Marca</label><input type="text" name="marca" class="form-control" required></div>
                    <div class="form-group"><label>Modelo</label><input type="text" name="modelo" class="form-control" required></div>
                    <div class="form-group"><label>VIN (Chasis)</label><input type="text" name="vin" class="form-control"></div>
                    <div class="form-group"><label>Número Motor</label><input type="text" name="motor" class="form-control"></div>
                    <div class="form-group"><label>Año</label><input type="number" name="anio" class="form-control"></div>
                    <div class="form-group"><label>Placa</label><input type="text" name="placa" class="form-control"></div>
                    <div class="form-group"><label>Servicio</label>
                        <select name="servicio" class="form-control">${options.servicios || '<option>Cargando...</option>'}</select>
                    </div>
                    <div class="form-group"><label>Inventario</label><textarea name="inventario" class="form-control"></textarea></div>
                    <div class="form-group">
                        <label>Tipo de Trabajo</label>
                        <select name="tipoTrabajo" class="form-control">${options.tiposTrabajo || '<option>Cargando...</option>'}</select>
                    </div>
                    <div class="form-group">
                        <label>Prioridad</label>
                        <select name="prioridad" class="form-control">${options.prioridades || '<option>Cargando...</option>'}</select>
                    </div>
                    <div class="form-group"><label>Observaciones</label><textarea name="observaciones" class="form-control"></textarea></div>
                </div>
                <div style="display:flex; gap:10px; margin-top:20px;">
                    <button type="submit" class="btn btn-primary">Guardar y Asignar</button>
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
            }
        } catch (error) {
            console.error("Error cargando configuración:", error);
        }
    }
};

async function init() {
    window.loadSection = loadSection;
    window.markStatus = markStatus;

    setupAuthListeners();
    setupNavigationListeners();
    setupGeolocation();

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

    // Lógica de proximidad (Radio 200m aprox o configurable)
    const activeOrder = AppState.activeOrder;
    if (activeOrder && activeOrder.coordenadas) {
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
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

async function markStatus(orderId, newStatus) {
    try {
        const result = await routeAction('GOS_CORE', 'updateOrderStatus', { orderId, status: newStatus });
        if (result.status === 'success') {
            // Actualizar activeOrder en AppState
            if (newStatus === 'En Camino') {
                AppState.activeOrder = { id: orderId, estado: newStatus };
                const row = document.querySelector(`tr[data-id="${orderId}"]`);
                if (row) {
                    AppState.activeOrder.coordenadas = row.dataset.coords;
                }
            } else if (newStatus === 'Finalizada' || newStatus === 'Cancelada') {
                AppState.activeOrder = null;
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
    AppState.currentSection = section;
    const titleEl = document.getElementById('section-title');
    const contentEl = document.getElementById('section-content');

    const sections = {
        agenda: { title: 'Agenda de Instalaciones', content: '<p>Cargando turnos...</p>' },
        ordenes: { title: 'Gestión de Órdenes', content: '<p>Cargando órdenes de trabajo...</p>' },
        clientes: { title: 'Directorio de Clientes', content: '<p>Cargando base de datos de clientes...</p>' },
        tecnicos: { title: 'Panel de Técnicos', content: '<p>Cargando disponibilidad de técnicos...</p>' },
        consulta: { title: 'Consulta Técnica GPSpedia', content: '<p>Cargando motor de consulta...</p>' },
        reportes: { title: 'Reportes Operativos', content: '<p>Cargando reportes...</p>' }
    };

    if (sections[section]) {
        titleEl.textContent = sections[section].title;
        contentEl.innerHTML = sections[section].content;

        if (section === 'ordenes') {
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
        }
    }
}

async function renderReportsModule(container) {
    const config = AppState.config || {};
    const reportOptions = config.Reportes ? Object.values(config.Reportes) : ['diario', 'semanal', 'mensual'];

    container.innerHTML = `
        <div class="actions-bar">
            <select id="report-type" class="form-control" style="width:auto; display:inline-block;">
                ${reportOptions.map(opt => `<option value="${opt.toLowerCase()}">${opt.charAt(0).toUpperCase() + opt.slice(1)}</option>`).join('')}
            </select>
            <button id="generate-report-btn" class="btn btn-primary">Generar Reporte</button>
        </div>
        <div id="report-results" style="margin-top:20px;">
            <p>Seleccione el tipo de reporte y presione generar.</p>
        </div>
    `;

    document.getElementById('generate-report-btn').addEventListener('click', async () => {
        const type = document.getElementById('report-type').value;
        const resultsDiv = document.getElementById('report-results');
        resultsDiv.innerHTML = '<p>Procesando datos...</p>';

        try {
            const result = await routeAction('GOS_CORE', 'generateReport', { type });
            if (result.status === 'success') {
                const data = result.reportData;
                if (data.length <= 1) {
                    resultsDiv.innerHTML = '<p>No hay datos para este período.</p>';
                    return;
                }

                const headers = data[0];
                const rows = data.slice(1).map(row => {
                    // Mapeo dinámico basado en nombres de columnas para reporte resumido
                    const getVal = (name) => {
                        const idx = headers.indexOf(name);
                        return idx !== -1 ? row[idx] : 'N/A';
                    };

                    return `
                        <td>${getVal('Fecha')}</td>
                        <td>${getVal('Cliente')}</td>
                        <td>${getVal('Técnico Asignado')}</td>
                        <td>${UI_TEMPLATES.badge(getVal('Estado'))}</td>
                    `;
                });

                resultsDiv.innerHTML = `
                    <h3>Reporte ${type.charAt(0).toUpperCase() + type.slice(1)}</h3>
                    ${UI_TEMPLATES.table(['Fecha', 'Cliente', 'Técnico', 'Estado'], rows)}
                `;
            }
        } catch (error) {
            resultsDiv.innerHTML = `<p style="color:var(--danger);">Error: ${error.message}</p>`;
        }
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
                <div class="form-group"><label>Teléfono</label><input type="text" name="telefono" class="form-control" required></div>
                <div class="form-group"><label>Dirección</label><input type="text" name="direccion" class="form-control"></div>
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
        <div id="techs-list" class="techs-table-container"></div>
    `;
    // Lógica adicional para listar técnicos y su última ubicación
    try {
        const result = await routeAction('GOS_CORE', 'getTechnicians');
        if (result.status === 'success') {
            document.getElementById('active-techs-count').textContent = result.data.length;
            const list = document.getElementById('techs-list');
            let html = `<table class="gos-table"><thead><tr><th>Técnico</th><th>Última Ubicación</th></tr></thead><tbody>`;
            result.data.forEach(t => {
                html += `<tr><td>${t.nombre}</td><td>${t.lat || 'N/A'}, ${t.lng || 'N/A'}</td></tr>`;
            });
            html += `</tbody></table>`;
            list.innerHTML = html;
        }
    } catch (error) {
        console.error("Error techs:", error);
    }
}

async function renderAgendaModule(container) {
    container.innerHTML = `
        <div class="agenda-container">
            <div id="agenda-grid" class="agenda-grid">
                <p>Cargando agenda...</p>
            </div>
        </div>
    `;

    try {
        const config = await routeAction('GOS_CORE', 'getAgendaConfig');
        const orders = await routeAction('GOS_CORE', 'getOrders');

        if (config.status === 'success' && orders.status === 'success') {
            const grid = document.getElementById('agenda-grid');
            grid.innerHTML = '';

            config.data.turnos.forEach(turno => {
                const row = document.createElement('div');
                row.className = 'agenda-row';
                const turnoId = turno.replace(':', '');
                row.innerHTML = `
                    <div class="agenda-time">${turno}</div>
                    <div class="agenda-slots" id="slots-${turnoId}"></div>
                `;
                grid.appendChild(row);

                // Poblar con órdenes de este turno
                const slotsCont = document.getElementById(`slots-${turnoId}`);
                const ordersInTurn = orders.data.filter(o => o.hora === turno);
                ordersInTurn.forEach(order => {
                    const card = document.createElement('div');
                    card.className = 'order-mini-card';
                    card.innerHTML = `<strong>${order.cliente}</strong><br><small>${order.vehiculo || order.marca}</small>`;
                    slotsCont.appendChild(card);
                });
            });
        }
    } catch (error) {
        console.error("Error al cargar agenda:", error);
    }
}

async function renderOrdersModule(container) {
    container.innerHTML = `
        <div class="actions-bar">
            <button id="new-order-btn" class="btn btn-primary">Nueva Orden</button>
        </div>
        <div id="orders-list" class="orders-table-container">
            <p>Cargando órdenes...</p>
        </div>
    `;

    document.getElementById('new-order-btn').addEventListener('click', () => {
        renderOrderForm(container);
    });

    try {
        const result = await routeAction('GOS_CORE', 'getOrders');
        if (result.status === 'success') {
            const listContainer = document.getElementById('orders-list');
            if (result.data.length === 0) {
                listContainer.innerHTML = '<p>No hay órdenes registradas.</p>';
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
                result.data.forEach(order => {
                    tableHtml += `
                        <tr>
                            <td>${order.fecha}</td>
                            <td>${order.cliente}</td>
                            <td>${order.marca} ${order.modelo}</td>
                            <td><span class="badge badge-${order.estado.toLowerCase().replace(/\s+/g, '')}">${order.estado}</span></td>
                            <td>
                                <button class="btn btn-sm btn-secondary" onclick="markStatus(${order.id}, 'En camino')">En camino</button>
                                <button class="btn btn-sm btn-primary" onclick="markStatus(${order.id}, 'Finalizada')">Finalizar</button>
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
        tiposTrabajo: buildOptions('TiposTrabajo', ['Instalación', 'Revisión', 'Traspaso', 'Desinstalación', 'Mantenimiento Preventivo']),
        prioridades: buildOptions('Prioridades', ['Baja', 'Normal', 'Alta', 'Urgente'])
    });

    document.getElementById('cancel-order-btn').addEventListener('click', () => loadSection('ordenes'));

    document.getElementById('order-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const payload = Object.fromEntries(formData.entries());

        try {
            // 1. Crear Orden
            const result = await routeAction('GOS_CORE', 'createOrder', payload);
            if (result.status === 'success') {
                const orderId = result.orderId;

                // 2. Disparar Auto-Asignación
                const assignResult = await routeAction('GOS_CORE', 'autoAssignTechnical', {
                    orderId,
                    coordinates: payload.coordenadas
                });

                if (assignResult.status === 'success') {
                    alert(`Orden #${orderId} creada y asignada a: ${assignResult.tecnico}. ${assignResult.message}`);
                } else {
                    alert(`Orden #${orderId} creada pero falló asignación automática: ${assignResult.message}`);
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

function showMainView(user) {
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('main-view').style.display = 'block';
    document.getElementById('welcome-msg').textContent = `Hola, ${user.Nombre_Usuario || 'Usuario'}`;
}

// Registro de Service Worker para PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('GOS Service Worker registrado'))
            .catch(err => console.warn('Fallo al registrar Service Worker', err));
    });
}

document.addEventListener('DOMContentLoaded', init);
