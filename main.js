// ============================================================
// main.js — puerta de acceso de index.html: login con Google, verificación
// del usuario en Firestore, carga de datos y arranque del simulador (app.js).
// ============================================================
import * as fb from "./firebase.js";

const $ = id => document.getElementById(id);
const REVISION_MS = 5 * 60 * 1000;   // cada 5 minutos se revisa que el usuario siga activo
let iniciado = false;
let errorPendiente = "";

function pantallaAcceso(texto, error, conBoton) {
  $("app").hidden = true;
  $("acceso").hidden = false;
  $("acceso-texto").textContent = texto;
  $("acceso-error").hidden = !error;
  $("acceso-error").textContent = error || "";
  $("btn-entrar").hidden = !conBoton;
}

async function alEntrar(user) {
  if (!user) {
    if (iniciado) { location.reload(); return; }
    pantallaAcceso("Entra con tu cuenta de Google autorizada.", errorPendiente, true);
    errorPendiente = "";
    return;
  }
  pantallaAcceso("Verificando acceso…", "", false);
  const u = await fb.miUsuario();
  if (!u) {
    errorPendiente = `La cuenta ${fb.correoActual()} no tiene acceso. Pídelo al administrador.`;
    await fb.salir();
    return;
  }
  fb.registrarAcceso("entrada");
  pantallaAcceso("Cargando datos…", "", false);
  let datos;
  try {
    datos = await fb.cargarDatos((i, n) => { $("acceso-texto").textContent = `Cargando datos… ${i} de ${n}`; });
  } catch (e) {
    pantallaAcceso("", "No se pudieron cargar los datos: " + e.message, false);
    return;
  }
  if (!datos) {
    pantallaAcceso(u.rol === "admin" ? "Todavía no hay datos cargados. Súbelos desde la página de usuarios." : "Todavía no hay datos cargados. Avisa al administrador.",
      "", false);
    if (u.rol === "admin") $("acceso-texto").insertAdjacentHTML("beforeend", ' <a href="admin.html">Ir a usuarios y datos</a>');
    return;
  }
  $("acceso").hidden = true;
  $("app").hidden = false;
  $("usuario-nombre").textContent = u.nombre || u.correo;
  $("usuario-nombre").title = u.correo;
  $("link-admin").hidden = u.rol !== "admin";
  if (!iniciado) { iniciado = true; window.iniciarSimulador(datos); }
  // si un administrador desactiva al usuario, la página se cierra en la siguiente revisión
  setInterval(async () => { if (!(await fb.miUsuario())) await fb.salir(); }, REVISION_MS);
}

if (!fb.configurado) {
  pantallaAcceso("", "Falta la configuración de Firebase (firebase-config.js). Ver README.", false);
} else {
  $("btn-entrar").onclick = () => fb.entrar().catch(e => {
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
      pantallaAcceso("Entra con tu cuenta de Google autorizada.", "No se pudo entrar con Google: " + (e.message || e.code), true);
    }
  });
  $("btn-salir").onclick = async () => { await fb.registrarAcceso("salida"); await fb.salir(); };
  fb.alCambiarSesion(alEntrar);
}
