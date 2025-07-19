document.addEventListener('DOMContentLoaded', () => {
    // Configuración de URL del backend. Asegúrate de que esta URL sea correcta para tu servidor.
    const SOCKET_IO_URL = 'http://localhost:3000';
    const BACKEND_API_URL = 'http://localhost:3000/api';

    // --- Referencias a elementos del DOM ---
    const formRepartidor = document.getElementById('form-repartidor');
    const numeroMovilInput = document.getElementById('numero-movil');
    const nombreRepartidorInput = document.getElementById('nombre-repartidor');
    const telefonoRepartidorInput = document.getElementById('telefono-repartidor');
    const passwordRepartidorInput = document.getElementById('password-repartidor'); // Referencia al nuevo campo de contraseña

    const repartidoresList = document.getElementById('repartidores-list');
    const repartidorSelect = document.getElementById('repartidor-select');

    const formPedido = document.getElementById('form-pedido');
    const direccionRecogidaInput = document.getElementById('direccion-recogida');
    const descripcionPedidoInput = document.getElementById('descripcion-pedido');
    const direccionEntregaInput = document.getElementById('direccion-entrega');
    const pedidosList = document.getElementById('pedidos-list');

    const mapid = document.getElementById('mapid');

    let map = null; // Variable para el mapa de Leaflet
    const markers = {}; // Objeto para guardar los marcadores de los móviles en el mapa
    // const activePedidos = {}; // Esta variable no se usa en el JS actual, se puede eliminar si no se piensa usar

    // --- Inicialización y Eventos de Socket.IO ---
    const socket = io(SOCKET_IO_URL);

    // Evento al conectar con el servidor WebSocket
    socket.on('connect', () => {
        console.log('Conectado al servidor WebSocket como Administrador de DOMIFACIL24/7');
        cargarMoviles(); // Carga los móviles al conectar
        cargarPedidos(); // Carga los pedidos al conectar
    });

    // Evento al desconectar del servidor WebSocket
    socket.on('disconnect', () => {
        console.log('Desconectado del servidor WebSocket como Administrador de DOMIFACIL24/7');
    });

    // Escucha actualizaciones de ubicación de los repartidores y las muestra en el mapa
    socket.on('updateLocation', (data) => {
        updateRepartidorLocation(data);
    });

    // Escucha si un pedido fue aceptado por un repartidor (desde el panel del repartidor)
    socket.on('pedidoAceptado', (pedido) => {
        console.log(`Pedido ${pedido.id} aceptado por ${pedido.nombreRepartidor}`);
        alert(`DOMIFACIL24/7: Pedido ${pedido.id} aceptado por ${pedido.nombreRepartidor}`);
        cargarPedidos(); // Recargar la lista de pedidos para reflejar el cambio de estado/asignación
    });

    // Escucha si un pedido fue actualizado (ej. recogido, entregado, cancelado)
    socket.on('pedidoActualizado', (pedido) => {
        console.log(`Pedido ${pedido.id} actualizado a estado: ${pedido.estado}`);
        cargarPedidos(); // Recargar la lista de pedidos para reflejar el cambio de estado
    });

    // --- Funciones para Gestión de Móviles ---

    // Maneja el envío del formulario de registro de repartidores
    formRepartidor.addEventListener('submit', async (e) => {
        e.preventDefault();

        const numeroMovil = numeroMovilInput.value.trim();
        const nombreRepartidor = nombreRepartidorInput.value.trim();
        const telefonoRepartidor = telefonoRepartidorInput.value.trim();
        const passwordRepartidor = passwordRepartidorInput.value.trim(); // Obtener el valor de la contraseña

        // Validación de campos: asegúrate de que todos los campos estén llenos
        if (!numeroMovil || !nombreRepartidor || !telefonoRepartidor || !passwordRepartidor) {
            alert('Por favor, completa todos los campos (Número de Móvil, Nombre, Teléfono, y Contraseña Inicial) para registrar el móvil de DOMIFACIL24/7.');
            return;
        }

        const nuevoMovil = {
            numeroMovil: numeroMovil,
            nombre: nombreRepartidor,
            telefono: telefonoRepartidor,
            password: passwordRepartidor // Enviar la contraseña al backend
        };

        try {
            const response = await fetch(`${BACKEND_API_URL}/moviles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(nuevoMovil)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Error al registrar el móvil.');
            }

            const data = await response.json();
            alert(data.message);
            formRepartidor.reset(); // Limpia el formulario después de un registro exitoso
            cargarMoviles(); // Recarga la lista de móviles para que aparezca el nuevo
        } catch (error) {
            console.error('Error registrando móvil:', error);
            alert(`Error al registrar el móvil: ${error.message}`);
        }
    });

    // Carga la lista de móviles registrados desde el backend
    const cargarMoviles = async () => {
        try {
            const response = await fetch(`${BACKEND_API_URL}/moviles`);
            if (!response.ok) throw new Error('Error al cargar móviles.');
            const moviles = await response.json();
            renderMoviles(moviles); // Renderiza la lista de móviles
            populateRepartidorSelect(moviles); // Rellena el select para asignar pedidos
        } catch (error) {
            console.error('Error cargando móviles:', error);
            repartidoresList.innerHTML = '<li>Error al cargar móviles.</li>';
            repartidorSelect.innerHTML = '<option value="">-- Error --</option>';
        }
    };

    // Renderiza la lista de móviles en la sección "Móviles Registrados"
    const renderMoviles = (moviles) => {
        repartidoresList.innerHTML = ''; // Limpia la lista actual
        if (moviles.length === 0) {
            repartidoresList.innerHTML = '<li>No hay móviles registrados en DOMIFACIL24/7.</li>';
            return;
        }
        moviles.forEach(movil => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>Móvil #${movil.numeroMovil}: ${movil.nombre} (${movil.telefono})</span>
                <button class="eliminar-movil" data-id="${movil.numeroMovil}"><i class="fas fa-trash"></i> Eliminar</button>
            `;
            repartidoresList.appendChild(li);
        });

        // Agrega event listeners a los botones de eliminar
        document.querySelectorAll('.eliminar-movil').forEach(button => {
            button.addEventListener('click', (e) => {
                const numeroMovil = e.target.dataset.id;
                if (confirm(`¿Estás seguro de que quieres eliminar al móvil #${numeroMovil}? Esta acción es irreversible.`)) {
                    eliminarMovil(numeroMovil);
                }
            });
        });
    };

    // Rellena el campo <select> para asignar pedidos con los móviles disponibles
    const populateRepartidorSelect = (moviles) => {
        repartidorSelect.innerHTML = '<option value="">-- Seleccione un móvil --</option>'; // Opción por defecto
        moviles.forEach(movil => {
            const option = document.createElement('option');
            option.value = movil.numeroMovil;
            option.textContent = `Móvil #${movil.numeroMovil}: ${movil.nombre}`;
            repartidorSelect.appendChild(option);
        });
    };

    // Elimina un móvil del sistema por su número
    const eliminarMovil = async (numeroMovil) => {
        try {
            const response = await fetch(`${BACKEND_API_URL}/moviles/${numeroMovil}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Error al eliminar el móvil.');
            }

            const data = await response.json();
            alert(data.message);
            cargarMoviles(); // Recarga la lista de móviles y el select
        } catch (error) {
            console.error('Error eliminando móvil:', error);
            alert(`Error al eliminar el móvil: ${error.message}`);
        }
    };

    // --- Funciones de Mapa (Leaflet) ---

    // Inicializa el mapa de Leaflet
    const initMap = () => {
        // Solo inicializa el mapa si aún no ha sido creado
        if (!map) {
            // Centrado en Ibagué, Colombia (Latitud, Longitud) y nivel de zoom
            map = L.map('mapid').setView([4.4388, -75.2166], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);
        }
    };

    // Actualiza la ubicación de un repartidor en el mapa o crea un nuevo marcador
    const updateRepartidorLocation = (data) => {
        const { numeroMovil, lat, lng, nombre } = data;

        if (!map) { // Asegura que el mapa esté inicializado
            initMap();
        }

        // Si el marcador ya existe para este móvil, actualiza su posición y popup
        if (markers[numeroMovil]) {
            markers[numeroMovil].setLatLng([lat, lng]);
            markers[numeroMovil].getPopup().setContent(`<b>Móvil #${numeroMovil}: ${nombre}</b><br>Lat: ${lat}<br>Lng: ${lng}`);
        } else {
            // Si el marcador no existe, crea uno nuevo con un ícono personalizado
            const marker = L.marker([lat, lng], {
                icon: L.AwesomeMarkers.icon({
                    icon: 'motorcycle',      // Ícono de moto
                    markerColor: 'blue',     // Color del marcador
                    prefix: 'fa'             // Prefijo para los íconos de Font Awesome
                })
            }).addTo(map)
              .bindPopup(`<b>Móvil #${numeroMovil}: ${nombre}</b><br>Lat: ${lat}<br>Lng: ${lng}`); // Información en el popup
            markers[numeroMovil] = marker; // Guarda el marcador para futuras actualizaciones
        }
    };

    // --- Funciones para Gestión de Pedidos ---

    // Maneja el envío del formulario de asignación de pedidos
    formPedido.addEventListener('submit', async (e) => {
        e.preventDefault();

        const repartidorId = repartidorSelect.value;
        const direccionRecogida = direccionRecogidaInput.value.trim();
        const descripcion = descripcionPedidoInput.value.trim();
        const direccionEntrega = direccionEntregaInput.value.trim();

        // Validación de campos
        if (!repartidorId || !direccionRecogida || !descripcion || !direccionEntrega) {
            alert('Por favor, completa todos los campos para asignar el pedido de DOMIFACIL24/7.');
            return;
        }

        const nuevoPedido = {
            repartidorId: repartidorId,
            direccionRecogida: direccionRecogida,
            descripcion: descripcion,
            direccionEntrega: direccionEntrega,
            estado: 'asignado' // El administrador asigna el pedido en estado 'asignado'
        };

        try {
            const response = await fetch(`${BACKEND_API_URL}/pedidos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(nuevoPedido)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Error al asignar el pedido.');
            }

            const data = await response.json();
            alert(data.message);
            formPedido.reset(); // Limpia el formulario
            cargarPedidos(); // Recarga la lista de pedidos para mostrar el recién asignado
        } catch (error) {
            console.error('Error asignando pedido:', error);
            alert(`Error al asignar el pedido: ${error.message}`);
        }
    });

    // Carga todos los pedidos desde el backend
    const cargarPedidos = async () => {
        try {
            const response = await fetch(`${BACKEND_API_URL}/pedidos`);
            if (!response.ok) throw new Error('Error al cargar pedidos.');
            const pedidos = await response.json();
            renderPedidos(pedidos); // Renderiza la lista de pedidos
        } catch (error) {
            console.error('Error cargando pedidos:', error);
            pedidosList.innerHTML = '<li>Error al cargar pedidos.</li>';
        }
    };

    // Renderiza la lista de pedidos en la sección "Pedidos Asignados"
    const renderPedidos = (pedidos) => {
        pedidosList.innerHTML = ''; // Limpia la lista actual
        if (pedidos.length === 0) {
            pedidosList.innerHTML = '<li>No hay pedidos registrados en DOMIFACIL24/7.</li>';
            return;
        }
        pedidos.forEach(pedido => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>
                    <strong>ID:</strong> ${pedido.id}<br>
                    <strong>Móvil Asignado:</strong> #${pedido.repartidorId} (${pedido.nombreRepartidor || 'N/A'})<br>
                    <strong>Descripción:</strong> ${pedido.descripcion}<br>
                    <strong>Recogida:</strong> ${pedido.direccionRecogida}<br>
                    <strong>Entrega:</strong> ${pedido.direccionEntrega}<br>
                    <strong>Estado:</strong> <span class="pedido-estado-${pedido.estado}">${pedido.estado.toUpperCase()}</span>
                </span>
                ${pedido.estado !== 'entregado' && pedido.estado !== 'cancelado' ? 
                    `<button class="desasignar-pedido" data-id="${pedido.id}"><i class="fas fa-undo"></i> Desasignar</button>` : ''}
                <button class="eliminar-pedido" data-id="${pedido.id}"><i class="fas fa-trash"></i> Eliminar</button>
            `;
            pedidosList.appendChild(li);
        });

        // Agrega event listeners a los botones de desasignar
        document.querySelectorAll('.desasignar-pedido').forEach(button => {
            button.addEventListener('click', (e) => {
                const pedidoId = e.target.dataset.id;
                if (confirm(`¿Estás seguro de que quieres desasignar el pedido ${pedidoId}? Esto lo pondrá como pendiente de nuevo.`)) {
                    desasignarPedido(pedidoId);
                }
            });
        });

        // Agrega event listeners a los botones de eliminar
        document.querySelectorAll('.eliminar-pedido').forEach(button => {
            button.addEventListener('click', (e) => {
                const pedidoId = e.target.dataset.id;
                if (confirm(`¿Estás seguro de que quieres eliminar el pedido ${pedidoId}? Esta acción es irreversible.`)) {
                    eliminarPedido(pedidoId);
                }
            });
        });
    };

    // Desasigna un pedido: lo libera del repartidor y lo pone en estado 'pendiente'
    const desasignarPedido = async (pedidoId) => {
        try {
            const response = await fetch(`${BACKEND_API_URL}/pedidos/${pedidoId}/desasignar`, {
                method: 'PUT' // Usar PUT para actualizar el estado
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Error al desasignar el pedido.');
            }
            alert(`Pedido ${pedidoId} desasignado y puesto en estado pendiente.`);
            cargarPedidos(); // Recargar la lista de pedidos para reflejar el cambio
            socket.emit('pedidoActualizado', { id: pedidoId }); // Notificar a los clientes que el pedido cambió
        } catch (error) {
            console.error('Error desasignando pedido:', error);
            alert(`Error al desasignar el pedido: ${error.message}`);
        }
    };

    // Elimina un pedido completamente del sistema
    const eliminarPedido = async (pedidoId) => {
        try {
            const response = await fetch(`${BACKEND_API_URL}/pedidos/${pedidoId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Error al eliminar el pedido.');
            }

            const data = await response.json();
            alert(data.message);
            cargarPedidos(); // Recarga la lista de pedidos
        } catch (error) {
            console.error('Error eliminando pedido:', error);
            alert(`Error al eliminar el pedido: ${error.message}`);
        }
    };

    // --- Inicialización al cargar la página ---
    initMap(); // Inicializa el mapa
    cargarMoviles(); // Carga la lista de móviles registrados
    cargarPedidos(); // Carga la lista de pedidos
});