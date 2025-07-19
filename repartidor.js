document.addEventListener('DOMContentLoaded', () => {
    // URLs de tu backend. ¡Asegúrate de que coincidan con tu configuración de servidor!
    const SOCKET_IO_URL = 'http://localhost:3000'; 
    const BACKEND_API_URL = 'http://localhost:3000/api'; 

    // --- Referencias a los elementos del DOM ---

    // Elementos de la sección de login
    const loginRepartidorSection = document.getElementById('login-repartidor');
    const formLoginRepartidor = document.getElementById('form-login-repartidor');
    const loginNumeroMovilInput = document.getElementById('login-numero-movil');
    const loginPasswordInput = document.getElementById('login-password'); 
    const loginErrorMessage = document.getElementById('login-error-message');
    
    // Elementos del panel principal del repartidor (visibles post-login)
    const panelRepartidorMain = document.getElementById('panel-repartidor-main');
    const displayNumeroMovil = document.getElementById('display-numero-movil');
    const displayNombreRepartidor = document.getElementById('display-nombre-repartidor');
    const toggleRastreoButton = document.getElementById('toggle-rastreo');
    const listaPedidosDisponibles = document.getElementById('lista-pedidos-disponibles');
    const listaMisPedidos = document.getElementById('lista-mis-pedidos');

    // --- Variables de estado ---
    let miRepartidor = null;      // Almacenará la información del repartidor logueado
    let rastreoActivo = false;    // Indica si el rastreo de ubicación está activo
    let rastreoIntervalo = null;  // ID del intervalo para detener/iniciar el rastreo periódico

    // --- Configuración y Eventos de Socket.IO ---
    const socket = io(SOCKET_IO_URL);

    // Evento al conectar con el servidor WebSocket
    socket.on('connect', () => {
        console.log('Conectado al servidor WebSocket de DOMIFACIL24/7 como Repartidor');
        // Si ya hay un repartidor identificado, se asegura de cargar los pedidos
        if (miRepartidor) {
            cargarPedidosDisponibles();
            cargarMisPedidos();
        }
    });

    // Evento al desconectar del servidor WebSocket
    socket.on('disconnect', () => {
        console.log('Desconectado del servidor WebSocket de DOMIFACIL24/7 como Repartidor');
    });

    // Evento para cuando el administrador asigna un pedido (si implementaste esa lógica en backend)
    socket.on('pedidoAsignado', (pedido) => {
        // Verifica si el pedido es para este repartidor específico
        if (miRepartidor && pedido.repartidorId === miRepartidor.numeroMovil) {
            console.log('¡Nuevo pedido asignado!', pedido);
            alert(`¡DOMIFACIL24/7! Nuevo pedido asignado. Recoger en: ${pedido.direccionRecogida}`);
            cargarMisPedidos();         // Recarga "Mis Pedidos" para mostrar el nuevo
            cargarPedidosDisponibles(); // Recarga "Pedidos Disponibles" por si se movió de ahí
        }
    });

    // Evento para cuando el estado de un pedido se actualiza (ej. entregado, cancelado)
    socket.on('pedidoActualizado', (pedidoActualizado) => {
        console.log(`Estado del pedido ${pedidoActualizado.id} actualizado a ${pedidoActualizado.estado}`);
        // Recarga ambas listas para mantener la interfaz consistente
        cargarPedidosDisponibles();
        cargarMisPedidos();
    });

    // --- Funciones para la Gestión de Vistas (Login vs. Panel Principal) ---

    /**
     * Muestra el panel principal del repartidor y oculta el formulario de login.
     * También actualiza la información del repartidor en la interfaz y carga los datos.
     */
    const showRepartidorPanel = () => {
        loginRepartidorSection.classList.add('hidden'); // Oculta la sección de login
        panelRepartidorMain.classList.remove('hidden'); // Muestra el panel principal

        // Actualiza la información del repartidor en el header del panel
        displayNumeroMovil.textContent = miRepartidor.numeroMovil;
        displayNombreRepartidor.textContent = miRepartidor.nombre;

        // Inicia el rastreo de ubicación y carga los pedidos
        iniciarRastreo();
        cargarPedidosDisponibles();
        cargarMisPedidos();
    };

    /**
     * Muestra el formulario de login y oculta el panel principal.
     * También limpia la información del repartidor del localStorage y detiene el rastreo.
     */
    const showLoginPanel = () => {
        loginRepartidorSection.classList.remove('hidden'); // Muestra la sección de login
        panelRepartidorMain.classList.add('hidden');       // Oculta el panel principal

        // Limpia cualquier información de sesión en localStorage
        localStorage.removeItem('domifacil_numeroMovilRepartidor'); 
        localStorage.removeItem('domifacil_nombreRepartidor');
        miRepartidor = null; // Reinicia la variable del repartidor

        detenerRastreo(); // Detiene cualquier rastreo de ubicación activo

        loginPasswordInput.value = ''; // Limpia el campo de contraseña para el nuevo intento
    };

    // --- Funciones de Autenticación y Sesión ---

    /**
     * Maneja el intento de inicio de sesión cuando el formulario es enviado.
     * Envía las credenciales al backend para autenticación.
     */
    const handleLogin = async (e) => {
        e.preventDefault(); // Previene el comportamiento por defecto de recargar la página del formulario
        loginErrorMessage.style.display = 'none'; // Oculta cualquier mensaje de error previo

        const numeroMovil = loginNumeroMovilInput.value.trim();
        const password = loginPasswordInput.value.trim();

        // Validación básica de campos vacíos
        if (!numeroMovil || !password) {
            loginErrorMessage.textContent = 'Por favor, ingresa tu número de Móvil y contraseña.';
            loginErrorMessage.style.display = 'block';
            return; // Detiene la función si los campos están vacíos
        }

        try {
            // Envía las credenciales al backend a la ruta de login
            const response = await fetch(`${BACKEND_API_URL}/repartidor-login`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ numeroMovil, password })
            });

            // Si la respuesta no es exitosa (ej. 401 Unauthorized, 404 Not Found)
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Credenciales inválidas.');
            }
            
            // Si el login es exitoso, el backend debería devolver la información del móvil
            const movilData = await response.json(); 
            
            // Almacena la información del repartidor en la variable global
            miRepartidor = {
                numeroMovil: numeroMovil, 
                nombre: movilData.nombre  
            };

            // Guarda el número de móvil y nombre en localStorage para auto-login futuro.
            // La contraseña NO se guarda en localStorage por seguridad.
            localStorage.setItem('domifacil_numeroMovilRepartidor', miRepartidor.numeroMovil);
            localStorage.setItem('domifacil_nombreRepartidor', miRepartidor.nombre);

            console.log(`Repartidor ${miRepartidor.nombre} (${miRepartidor.numeroMovil}) ha iniciado sesión en DOMIFACIL24/7.`);
            showRepartidorPanel(); // Muestra el panel principal tras un login exitoso

        } catch (error) {
            console.error('Error durante el login:', error);
            loginErrorMessage.textContent = `Error al iniciar sesión: ${error.message}. Verifica tus credenciales.`;
            loginErrorMessage.style.display = 'block';
            showLoginPanel(); // Si el login falla, asegura que el formulario de login esté visible
        }
    };

    /**
     * Intenta iniciar sesión automáticamente si ya hay credenciales válidas en localStorage.
     * Esto evita que el repartidor tenga que iniciar sesión manualmente cada vez.
     */
    const autoLogin = async () => {
        const numeroMovil = localStorage.getItem('domifacil_numeroMovilRepartidor');
        const nombreRepartidor = localStorage.getItem('domifacil_nombreRepartidor');

        // Si existe un número de móvil y nombre guardados en localStorage
        if (numeroMovil && nombreRepartidor) {
            try {
                // Aquí, hacemos una llamada al backend para verificar que el móvil sigue siendo válido.
                // Esta ruta no necesita contraseña, solo confirma que el ID es reconocido y activo.
                const response = await fetch(`${BACKEND_API_URL}/moviles/${numeroMovil}`);
                if (!response.ok) {
                    throw new Error('Móvil no es válido o ha sido desactivado en el servidor.');
                }
                const movilData = await response.json(); 

                // Si la verificación es exitosa, se establece el repartidor
                miRepartidor = {
                    numeroMovil: numeroMovil,
                    nombre: movilData.nombre // Usa el nombre del backend por si se actualizó
                };

                console.log(`Auto-login exitoso para ${miRepartidor.nombre} (${miRepartidor.numeroMovil}).`);
                showRepartidorPanel(); // Muestra el panel si el auto-login es exitoso
            } catch (error) {
                console.error('Auto-login fallido:', error);
                showLoginPanel(); // Si el auto-login falla (ej. móvil desactivado), muestra el login
            }
        } else {
            showLoginPanel(); // Si no hay credenciales en localStorage, muestra directamente el login
        }
    };

    // --- Funciones de Geolocalización y Rastreo ---

    /**
     * Inicia el envío periódico de la ubicación del repartidor al backend.
     */
    const iniciarRastreo = () => {
        // Solo inicia el rastreo si el repartidor está logueado y el rastreo no está ya activo
        if (!miRepartidor || rastreoActivo) return;

        // Comprueba si el navegador soporta geolocalización
        if (navigator.geolocation) {
            rastreoActivo = true;
            toggleRastreoButton.innerHTML = '<i class="fas fa-pause"></i> Detener Rastreo'; // Cambia el texto del botón
            console.log(`Rastreo iniciado para el móvil ${miRepartidor.numeroMovil} en DOMIFACIL24/7.`);

            // Obtiene y envía la ubicación inmediatamente
            navigator.geolocation.getCurrentPosition(enviarUbicacion, manejarErrorUbicacion, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
            
            // Configura un intervalo para enviar la ubicación cada 5 segundos
            rastreoIntervalo = setInterval(() => {
                navigator.geolocation.getCurrentPosition(enviarUbicacion, manejarErrorUbicacion, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
            }, 5000); // Envía ubicación cada 5 segundos
        } else {
            alert("Tu navegador no soporta geolocalización. La ubicación no se podrá rastrear en DOMIFACIL24/7.");
        }
    };

    /**
     * Detiene el envío periódico de la ubicación.
     */
    const detenerRastreo = () => {
        if (!rastreoActivo) return; // Solo detiene si está activo

        clearInterval(rastreoIntervalo); // Limpia el intervalo para detener el envío
        rastreoActivo = false;
        toggleRastreoButton.innerHTML = '<i class="fas fa-play"></i> Iniciar Rastreo'; // Restaura el texto del botón
        console.log('Rastreo detenido para DOMIFACIL24/7.');
    };

    /**
     * Envía la ubicación actual del repartidor al servidor a través de Socket.IO.
     * @param {GeolocationPosition} position - Objeto de posición proporcionado por la API de Geolocalización.
     */
    const enviarUbicacion = (position) => {
        if (!miRepartidor) return; // Asegura que solo se envíe si el repartidor está identificado

        const { latitude, longitude } = position.coords;
        socket.emit('updateLocation', {
            numeroMovil: miRepartidor.numeroMovil,
            lat: latitude,
            lng: longitude,
            nombre: miRepartidor.nombre
        });
        // console.log(`Ubicación enviada por ${miRepartidor.nombre}: ${latitude}, ${longitude}`); // Para depuración
    };

    /**
     * Maneja los errores que pueden ocurrir al intentar obtener la ubicación.
     * @param {GeolocationPositionError} error - Objeto de error de geolocalización.
     */
    const manejarErrorUbicacion = (error) => {
        console.warn('Error al obtener la ubicación:', error.message);
        if (error.code === error.PERMISSION_DENIED) {
            alert("Permiso de geolocalización denegado. No se podrá rastrear tu ubicación para DOMIFACIL24/7. Por favor, habilita la ubicación en tu navegador.");
            detenerRastreo(); // Si el permiso es denegado, se detiene el rastreo
        }
    };

    // --- Funciones para la Gestión de Pedidos ---

    /**
     * Carga los pedidos que están en estado 'pendiente' (disponibles para ser tomados)
     * desde el backend y los muestra en la interfaz.
     */
    const cargarPedidosDisponibles = async () => {
        try {
            const response = await fetch(`${BACKEND_API_URL}/pedidos?estado=pendiente`);
            if (!response.ok) throw new Error('Error al cargar pedidos disponibles de DOMIFACIL24/7.');
            const pedidosDisponibles = await response.json();
            renderPedidosDisponibles(pedidosDisponibles); // Pasa los pedidos a la función de renderizado
        } catch (error) {
            console.error('Error cargando pedidos disponibles:', error);
            listaPedidosDisponibles.innerHTML = '<li>Error al cargar pedidos disponibles. Asegúrate de que el backend esté funcionando y tenga pedidos.</li>';
        }
    };

    /**
     * Renderiza la lista de pedidos disponibles en la interfaz del repartidor.
     * @param {Array<Object>} pedidos - Array de objetos de pedidos disponibles.
     */
    const renderPedidosDisponibles = (pedidos) => {
        listaPedidosDisponibles.innerHTML = ''; // Limpia la lista actual
        if (pedidos.length === 0) {
            listaPedidosDisponibles.innerHTML = '<li>No hay pedidos disponibles en este momento. ¡A esperar!</li>';
            return;
        }
        // Crea un elemento de lista (li) para cada pedido
        pedidos.forEach(pedido => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div>
                    <strong>ID:</strong> ${pedido.id}<br>
                    <strong>Descripción:</strong> ${pedido.descripcion}<br>
                    <strong>Recogida:</strong> ${pedido.direccionRecogida}<br>
                    <strong>Entrega:</strong> ${pedido.direccionEntrega}
                </div>
                <button class="aceptar-pedido" data-id="${pedido.id}">Aceptar Pedido</button>
            `;
            listaPedidosDisponibles.appendChild(li);
        });

        // Añade event listeners a los botones "Aceptar Pedido"
        document.querySelectorAll('.aceptar-pedido').forEach(button => {
            button.addEventListener('click', (e) => {
                const pedidoId = e.target.dataset.id; // Obtiene el ID del pedido del atributo data-id
                aceptarPedido(pedidoId);
            });
        });
    };

    /**
     * Permite al repartidor aceptar un pedido, enviando la solicitud al backend.
     * @param {string} pedidoId - El ID del pedido que el repartidor desea aceptar.
     */
    const aceptarPedido = async (pedidoId) => {
        if (!miRepartidor) {
            alert("Por favor, inicia sesión para aceptar pedidos en DOMIFACIL24/7.");
            return;
        }
        try {
            const response = await fetch(`${BACKEND_API_URL}/pedidos/${pedidoId}/aceptar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ numeroMovil: miRepartidor.numeroMovil }) // Envía el ID del repartidor
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Error al aceptar el pedido de DOMIFACIL24/7.');
            }
            alert('¡Pedido aceptado con éxito en DOMIFACIL24/7!');
            cargarPedidosDisponibles(); // Recarga los pedidos disponibles (el aceptado ya no debería estar)
            cargarMisPedidos();         // Recarga "Mis Pedidos" (el aceptado ahora debería aparecer aquí)
        } catch (error) {
            console.error('Error aceptando pedido:', error);
            alert(`No se pudo aceptar el pedido: ${error.message}`);
        }
    };

    /**
     * Carga los pedidos que están asignados al repartidor actualmente logueado.
     */
    const cargarMisPedidos = async () => {
        if (!miRepartidor) {
            listaMisPedidos.innerHTML = '<li>Inicia sesión para ver tus pedidos asignados.</li>';
            return;
        }
        try {
            // Solicita al backend los pedidos filtrados por el ID del repartidor logueado
            const response = await fetch(`${BACKEND_API_URL}/pedidos?repartidorId=${miRepartidor.numeroMovil}`);
            if (!response.ok) throw new Error('Error al cargar tus pedidos asignados de DOMIFACIL24/7.');
            const misPedidos = await response.json();
            renderMisPedidos(misPedidos); // Pasa los pedidos a la función de renderizado
        } catch (error) {
            console.error('Error cargando mis pedidos:', error);
            listaMisPedidos.innerHTML = '<li>Error al cargar tus pedidos.</li>';
        }
    };

    /**
     * Renderiza la lista de pedidos asignados al repartidor.
     * @param {Array<Object>} pedidos - Array de objetos de pedidos asignados.
     */
    const renderMisPedidos = (pedidos) => {
        listaMisPedidos.innerHTML = ''; // Limpia la lista actual
        if (pedidos.length === 0) {
            listaMisPedidos.innerHTML = '<li>No tienes pedidos asignados en este momento. ¡Aceptar uno disponible!</li>';
            return;
        }
        // Crea un elemento de lista (li) para cada pedido asignado
        pedidos.forEach(pedido => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div>
                    <strong>ID Pedido:</strong> ${pedido.id}<br>
                    <strong>Estado:</strong> <span class="pedido-estado-${pedido.estado}">${pedido.estado.toUpperCase()}</span><br>
                    <strong>Descripción:</strong> ${pedido.descripcion}<br>
                    <strong>Recogida:</strong> ${pedido.direccionRecogida}<br>
                    <strong>Entrega:</strong> ${pedido.direccionEntrega}
                </div>
                ${pedido.estado === 'asignado' ? `<button class="actualizar-estado" data-id="${pedido.id}" data-estado="recogido"><i class="fas fa-box"></i> Pedido Recogido</button>` : ''}
                ${pedido.estado === 'recogido' ? `<button class="actualizar-estado" data-id="${pedido.id}" data-estado="entregado"><i class="fas fa-check-circle"></i> Marcar como Entregado</button>` : ''}
                ${(pedido.estado === 'asignado' || pedido.estado === 'recogido') ? `<button class="actualizar-estado cancelar-btn" data-id="${pedido.id}" data-estado="cancelado"><i class="fas fa-times-circle"></i> Cancelar Pedido</button>` : ''}
            `;
            listaMisPedidos.appendChild(li);
        });

        // Añade event listeners a los botones de "Actualizar Estado"
        document.querySelectorAll('.actualizar-estado').forEach(button => {
            button.addEventListener('click', (e) => {
                const pedidoId = e.target.dataset.id;
                const nuevoEstado = e.target.dataset.estado;
                // Confirmación para cancelar un pedido
                if (nuevoEstado === 'cancelado' && !confirm('¿Estás seguro de que quieres cancelar este pedido?')) {
                    return; // Si el usuario cancela la confirmación, no hace nada
                }
                actualizarEstadoPedido(pedidoId, nuevoEstado);
            });
        });
    };

    /**
     * Actualiza el estado de un pedido en el backend.
     * @param {string} pedidoId - El ID del pedido a actualizar.
     * @param {string} nuevoEstado - El nuevo estado del pedido (ej. 'recogido', 'entregado', 'cancelado').
     */
    const actualizarEstadoPedido = async (pedidoId, nuevoEstado) => {
        try {
            const response = await fetch(`${BACKEND_API_URL}/pedidos/${pedidoId}/estado`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: nuevoEstado })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Error al actualizar el estado del pedido de DOMIFACIL24/7.');
            }
            alert(`Pedido ${pedidoId} actualizado a: ${nuevoEstado} en DOMIFACIL24/7.`);
            cargarMisPedidos();         // Recarga "Mis Pedidos" para reflejar el cambio
            cargarPedidosDisponibles(); // Recarga "Pedidos Disponibles" por si un pedido cancelado vuelve a estar disponible, etc.
        } catch (error) {
            console.error('Error actualizando estado del pedido:', error);
            alert(`No se pudo actualizar el estado del pedido: ${error.message}`);
        }
    };


    // --- Inicialización y Event Listeners Principales ---

    // Asocia la función handleLogin al evento 'submit' del formulario de login
    formLoginRepartidor.addEventListener('submit', handleLogin);

    // Asocia la función toggleRastreo al evento 'click' del botón de rastreo
    toggleRastreoButton.addEventListener('click', () => {
        if (!miRepartidor) {
            alert("Por favor, inicia sesión primero para gestionar el rastreo.");
            return;
        }
        if (rastreoActivo) {
            detenerRastreo();
        } else {
            iniciarRastreo();
        }
    });

    // Al cargar la página, se intenta realizar un auto-login.
    // Esto determinará si se muestra el panel de login o el panel del repartidor.
    autoLogin();
});