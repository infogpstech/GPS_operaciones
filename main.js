import { routeAction } from './api-config.js';

const SESSION_KEY = 'gos_session';

async function init() {
    window.loadSection = loadSection; // Exponer para depuración y tests
    setupAuthListeners();
    setupNavigationListeners();
    setupGeolocation();
    checkSession();
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
    const session = localStorage.getItem(SESSION_KEY);
    if (!session) return;
    const user = JSON.parse(session);

    // Enviar ubicación al backend
    routeAction('GOS_CORE', 'updateTechnicianLocation', {
        tecnicoId: user.ID,
        lat,
        lng
    });

    // Simulación de detección de llegada
    // En una implementación real, se compararía con el destino de la orden activa
}

async function markStatus(orderId, newStatus) {
    try {
        const result = await routeAction('GOS_CORE', 'updateOrderStatus', { orderId, status: newStatus });
        if (result.status === 'success') {
            notifyChange(newStatus);
            loadSection('ordenes');
        }
    } catch (error) {
        console.error("Error al actualizar estado:", error);
    }
}

function notifyChange(status) {
    // Aquí se dispararían las notificaciones a Gerencia y Asesores
    console.log(`Notificación GOS: Nuevo estado - ${status}`);
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
    const titleEl = document.getElementById('section-title');
    const contentEl = document.getElementById('section-content');

    const sections = {
        agenda: { title: 'Agenda de Instalaciones', content: '<p>Cargando turnos...</p>' },
        ordenes: { title: 'Gestión de Órdenes', content: '<p>Cargando órdenes de trabajo...</p>' },
        clientes: { title: 'Directorio de Clientes', content: '<p>Cargando base de datos de clientes...</p>' },
        tecnicos: { title: 'Panel de Técnicos', content: '<p>Cargando disponibilidad de técnicos...</p>' }
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
        }
    }
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
                row.innerHTML = `
                    <div class="agenda-time">${turno}</div>
                    <div class="agenda-slots" id="slots-${turno.replace(':', '')}">
                        <!-- Órdenes asignadas aquí -->
                    </div>
                `;
                grid.appendChild(row);
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
                // Implementar tabla de órdenes aquí
                listContainer.innerHTML = '<p>Órdenes cargadas exitosamente.</p>';
            }
        }
    } catch (error) {
        console.error("Error al cargar órdenes:", error);
    }
}

function renderOrderForm(container) {
    container.innerHTML = `
        <h3>Crear Nueva Orden</h3>
        <form id="order-form" class="order-form">
            <div class="form-grid">
                <div class="form-group"><label>Cliente</label><input type="text" name="cliente" class="form-control" required></div>
                <div class="form-group"><label>Teléfono</label><input type="text" name="telefono" class="form-control" required></div>
                <div class="form-group"><label>Marca</label><input type="text" name="marca" class="form-control" required></div>
                <div class="form-group"><label>Modelo</label><input type="text" name="modelo" class="form-control" required></div>
                <div class="form-group">
                    <label>Tipo de Trabajo</label>
                    <select name="tipoTrabajo" class="form-control">
                        <option value="Instalación">Instalación</option>
                        <option value="Revisión">Revisión</option>
                        <option value="Traspaso">Traspaso</option>
                        <option value="Desinstalación">Desinstalación</option>
                    </select>
                </div>
            </div>
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button type="submit" class="btn btn-primary">Guardar Orden</button>
                <button type="button" id="cancel-order-btn" class="btn btn-secondary">Cancelar</button>
            </div>
        </form>
    `;

    document.getElementById('cancel-order-btn').addEventListener('click', () => loadSection('ordenes'));

    document.getElementById('order-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const payload = Object.fromEntries(formData.entries());

        try {
            const result = await routeAction('GOS_CORE', 'createOrder', payload);
            if (result.status === 'success') {
                alert('Orden creada con éxito');
                loadSection('ordenes');
            }
        } catch (error) {
            alert('Error al crear la orden: ' + error.message);
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
                localStorage.setItem(SESSION_KEY, JSON.stringify(result.user));
                showMainView(result.user);
            }
        } catch (error) {
            errorEl.textContent = error.message;
            errorEl.style.display = 'block';
        }
    });

    document.getElementById('logout-btn').addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem(SESSION_KEY);
        location.reload();
    });
}

function checkSession() {
    const session = localStorage.getItem(SESSION_KEY);
    if (session) {
        showMainView(JSON.parse(session));
    }
}

function showMainView(user) {
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('main-view').style.display = 'block';
    document.getElementById('welcome-msg').textContent = `Hola, ${user.Nombre_Usuario || 'Usuario'}`;
}

document.addEventListener('DOMContentLoaded', init);
