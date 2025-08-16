// simulador.js - Modalidad (recinto/domicilio) + zonas por comuna + multiplicadores (30=x1, 60=x1.5) + WhatsApp + (NUEVO) 3 horarios fijos
document.addEventListener("DOMContentLoaded", () => {
  const contenedor = document.getElementById("simulador");
  if (!contenedor) return;

  const urlServicios = "../assets/js/servicios.json"; // Ruta relativa desde reserva.html
  const urlZonas = "../assets/js/zonas.json";         // Recargos por comuna (CLP)

  // Config: multiplicadores por duración (sin 90 min)
  const multiplicadoresDuracion = { "30": 1, "60": 1.5 };

  // Número de WhatsApp (formato internacional sin +)
  const telefonoWhatsApp = "56912345678"; // TODO: Reemplaza por tu número

  let servicios = [];
  let mapaPrecios = new Map(); // id -> precioBase
  let mapaNombres = new Map(); // id -> nombre

  // comuna (lowercase) -> recargo CLP
  let mapaComunaRecargo = new Map();

  // Utilidad: fecha mínima = hoy
  const hoyISO = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  };

  // Cargar datos y armar UI
  Promise.all([fetch(urlServicios), fetch(urlZonas)])
    .then(async ([resServ, resZon]) => {
      servicios = await resServ.json();
      const zonasData = await resZon.json();

      servicios.forEach(s => {
        mapaPrecios.set(String(s.id), Number(s.precioBase)||0);
        mapaNombres.set(String(s.id), s.nombre);
      });

      (zonasData.zonas || []).forEach(z => {
        (z.comunas || []).forEach(c => mapaComunaRecargo.set((c||"").toLowerCase(), Number(z.recargo)||0));
      });

      renderForm();
    })
    .catch(err => {
      console.error("Error cargando datos:", err);
      contenedor.innerHTML = `<p>No fue posible cargar el simulador. Intenta más tarde.</p>`;
    });

  function renderForm() {
    contenedor.innerHTML = `
      <form id="formSimulador" class="form-reserva">
        <div class="fields">
          <div class="field">
            <label for="nombre">Nombre</label>
            <input type="text" id="nombre" placeholder="Tu nombre" required>
          </div>

          <div class="field">
            <label for="servicio">Tipo de masaje</label>
            <select id="servicio" required>
              <option value="">Selecciona un servicio</option>
              ${servicios.map(s => `<option value="${s.id}">${s.nombre}</option>`).join("")}
            </select>
          </div>

          <div class="field">
            <label for="duracion">Duración</label>
            <select id="duracion" required>
              <option value="30">30 min</option>
              <option value="60" selected>60 min</option>
            </select>
          </div>

          <div class="field">
            <label for="fecha">Fecha (sólo fin de semana)</label>
            <input type="date" id="fecha" min="${hoyISO()}" required>
          </div>

          <!-- NUEVO: Selector de Horario (3 opciones fijas) -->
          <div class="field">
            <label for="horario">Horario</label>
            <select id="horario" required>
              <option value="">Selecciona un horario</option>
              <option value="12:00">12:00 </option>
              <option value="15:00">15:00 </option>
              <option value="18:00">18:00 </option>
            </select>
          </div>

          <div class="field">
            <label for="modalidad">Modalidad del servicio</label>
            <select id="modalidad" required>
              <option value="">Selecciona una opción</option>
              <option value="recinto">En nuestro recinto</option>
              <option value="domicilio">A domicilio</option>
            </select>
          </div>

          <div class="field" id="wrapComuna" style="display:none;">
            <label for="comuna">Comuna (sólo si es a domicilio)</label>
            <select id="comuna">
              <option value="">Selecciona tu comuna</option>
              ${Array.from(mapaComunaRecargo.keys())
                  .map(c => `<option value="${c}">${capitalize(c)}</option>`)
                  .sort((a,b)=>a.localeCompare(b,'es')).join("")}
            </select>
            <small>Recargo por domicilio: $<span id="recargoDomicilio">0</span> CLP</small>
          </div>

          <div class="field">
            <strong>Total estimado: $<span id="totalEstimado">0</span> CLP</strong>
          </div>
        </div>

        <ul class="actions">
          <li><button type="submit" id="btnWhatsApp" class="primary">Reservar por WhatsApp</button></li>
        </ul>
      </form>
    `;

    // refs
    const form = document.getElementById("formSimulador");
    const servicioSel = document.getElementById("servicio");
    const duracionSel = document.getElementById("duracion");
    const fechaInput = document.getElementById("fecha");
    const horarioSel = document.getElementById("horario"); // NUEVO
    const modalidadSel = document.getElementById("modalidad");
    const wrapComuna = document.getElementById("wrapComuna");
    const comunaSel = document.getElementById("comuna");
    const recargoEl = document.getElementById("recargoDomicilio");
    const totalEl = document.getElementById("totalEstimado");

    // Validar sólo fines de semana
    fechaInput.addEventListener("change", () => {
      const v = fechaInput.value;
      if (!v) return;
      const d = new Date(v + "T00:00:00");
      const day = d.getDay(); // 0=Dom, 6=Sáb
      if (day !== 0 && day !== 6) {
        if (window.Swal) {
          Swal.fire({
            icon: "info",
            title: "Agenda fin de semana",
            text: "Solo puedes reservar sábados o domingos.",
          });
        } else {
          alert("Solo puedes reservar sábados o domingos.");
        }
        fechaInput.value = "";
      }
    });

    // Mostrar/ocultar comuna según modalidad
    modalidadSel.addEventListener("change", actualizarVista);
    servicioSel.addEventListener("change", actualizarVista);
    duracionSel.addEventListener("change", actualizarVista);
    comunaSel.addEventListener("change", actualizarVista);
    // (El horario no afecta el total; no necesita actualizarVista)

    function actualizarVista() {
      if (modalidadSel.value === "domicilio") {
        wrapComuna.style.display = "block";
      } else {
        wrapComuna.style.display = "none";
        comunaSel.value = "";
      }
      const base = obtenerPrecioBase();
      const recDom = calcularRecargoDomicilio();
      const total = base + recDom;
      recargoEl.textContent = recDom.toLocaleString("es-CL");
      totalEl.textContent = total.toLocaleString("es-CL");
    }

    function obtenerPrecioBase() {
      const id = servicioSel.value;
      const base = mapaPrecios.get(String(id)) || 0;
      const dur = duracionSel.value || "60";
      const factor = (multiplicadoresDuracion[dur] || 1);
      return base * factor;
    }

    function calcularRecargoDomicilio() {
      if (modalidadSel.value !== "domicilio") return 0;
      const c = (comunaSel.value || "").toLowerCase();
      return mapaComunaRecargo.get(c) || 0;
    }

    function construirMensaje(total) {
      const nombre = document.getElementById("nombre").value.trim() || "Cliente";
      const servicioTxt = mapaNombres.get(String(servicioSel.value)) || "Servicio";
      const durTxt = `${duracionSel.value || "60"} min`;
      const fechaTxt = fechaInput.value || "Por coordinar";
      const horarioTxt = horarioSel.value || "Por coordinar"; 
      const modalidadTxt = modalidadSel.value === "domicilio" ? "A domicilio" : "En recinto";
      const comunaTxt = modalidadSel.value === "domicilio" && comunaSel.value ? `\nComuna: ${capitalize(comunaSel.value)}` : "";
      return `Reserva de masaje
             Nombre: ${nombre}
             Servicio: ${servicioTxt}
             Duración: ${durTxt}
             Fecha: ${fechaTxt}
             Horario: ${horarioTxt}
             Modalidad: ${modalidadTxt}${comunaTxt}
             Total estimado: $${total.toLocaleString("es-CL")}`;
    }

    // Envío por WhatsApp
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!servicioSel.value) return alert("Selecciona un servicio");
      if (!fechaInput.value) return alert("Selecciona una fecha");
      if (!horarioSel.value) return alert("Selecciona un horario"); 
      if (modalidadSel.value === "domicilio" && !comunaSel.value) {
        return alert("Selecciona tu comuna para calcular el recargo de domicilio.");
      }
      const base = obtenerPrecioBase();
      const recDom = calcularRecargoDomicilio();
      const total = base + recDom;

      const mensaje = construirMensaje(total);
      const url = `https://wa.me/${telefonoWhatsApp}?text=${encodeURIComponent(mensaje)}`;
      window.open(url, "_blank");
    });

    // Init cálculo
    actualizarVista();
  }

  function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
});
