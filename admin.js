// ============================================================
// admin.js — administración de usuarios, carga de datos y registro de accesos.
// Firestore (firestore.rules) rechaza cualquier escritura de quien no sea administrador.
// ============================================================
import * as fb from "./firebase.js";

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fecha = ts => ts && ts.toDate ? ts.toDate().toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }) : "–";
let yo = "";

function avisar(texto, esError) {
  $("aviso").hidden = esError || !texto; $("aviso").textContent = esError ? "" : texto;
  $("error").hidden = !esError || !texto; $("error").textContent = esError ? texto : "";
}

async function cargarUsuarios() {
  const lista = (await fb.listarUsuarios()).sort((a, b) =>
    (b.activo - a.activo) || ((a.rol !== "admin") - (b.rol !== "admin")) || a.correo.localeCompare(b.correo));
  $("titulo-usuarios").textContent = `Usuarios (${lista.length})`;
  $("tabla-usuarios").innerHTML = `<thead><tr><th class="txt">Correo</th><th class="txt">Nombre</th><th class="txt">Rol</th>
    <th class="txt">Estado</th><th class="txt">Agregado</th><th class="txt"></th></tr></thead><tbody>` + lista.map(u => {
    const propio = u.correo === yo;
    const acciones = propio ? '<span class="muted">(tú)</span>' : `
      <button data-accion="${u.activo ? "desactivar" : "activar"}" data-correo="${esc(u.correo)}">${u.activo ? "Desactivar" : "Activar"}</button>
      <button data-accion="rol" data-correo="${esc(u.correo)}">${u.rol === "admin" ? "Quitar admin" : "Hacer admin"}</button>
      <button data-accion="eliminar" data-correo="${esc(u.correo)}">Eliminar</button>`;
    return `<tr><td class="txt">${esc(u.correo)}</td><td class="txt">${esc(u.nombre)}</td>
      <td class="txt"><span class="chip ${u.rol === "admin" ? "admin" : ""}">${u.rol === "admin" ? "Administrador" : "Usuario"}</span></td>
      <td class="txt"><span class="chip ${u.activo ? "" : "inactivo"}">${u.activo ? "Activo" : "Desactivado"}</span></td>
      <td class="txt">${fecha(u.agregado)} <span class="muted">por ${esc(u.por)}</span></td>
      <td class="txt acciones">${acciones}</td></tr>`;
  }).join("") + "</tbody>";
  return lista;
}

async function cargarMeta() {
  const m = await fb.metaDatos();
  $("meta-datos").textContent = m
    ? `Datos generados el ${m.generado}, subidos el ${fecha(m.subido)} por ${m.por} (${(m.bytes / 1e6).toFixed(1)} MB en ${m.partes} partes).`
    : "Todavía no hay datos cargados.";
}

const NOMBRE_EVENTO = { entrada: "Entró", salida: "Salió" };
async function cargarAccesos() {
  const lista = await fb.listarAccesos(150);
  $("tabla-accesos").innerHTML = lista.length
    ? `<thead><tr><th class="txt">Fecha</th><th class="txt">Evento</th><th class="txt">Correo</th><th class="txt">Navegador</th></tr></thead><tbody>`
      + lista.map(e => `<tr><td class="txt">${fecha(e.t)}</td><td class="txt">${NOMBRE_EVENTO[e.tipo] || esc(e.tipo)}</td>
        <td class="txt">${esc(e.correo)}</td><td class="txt nombre muted" title="${esc(e.ua)}">${esc(e.ua)}</td></tr>`).join("") + "</tbody>"
    : "<tbody><tr><td class='txt muted'>Sin registros todavía.</td></tr></tbody>";
}

async function accion(tipo, correo) {
  const lista = await fb.listarUsuarios();
  const u = lista.find(x => x.correo === correo);
  if (!u) return;
  const { correo: _, ...datos } = u;
  try {
    if (tipo === "eliminar") {
      if (!confirm(`¿Eliminar a ${correo}?`)) return;
      await fb.eliminarUsuario(correo);
      avisar(`Se eliminó ${correo}.`);
    } else if (tipo === "rol") {
      datos.rol = u.rol === "admin" ? "usuario" : "admin";
      await fb.guardarUsuario(correo, datos);
      avisar(`${correo} ahora es ${datos.rol === "admin" ? "administrador" : "usuario"}.`);
    } else {
      datos.activo = tipo === "activar";
      await fb.guardarUsuario(correo, datos);
      avisar(`Se ${datos.activo ? "activó" : "desactivó"} ${correo}.`);
    }
  } catch (e) {
    avisar("No se pudo guardar el cambio: " + e.message, true);
  }
  cargarUsuarios();
}

async function iniciar(user) {
  if (!user) { location.href = "index.html"; return; }
  const u = await fb.miUsuario();
  if (!u || u.rol !== "admin") {
    $("estado").textContent = "Solo los administradores pueden ver esta página.";
    return;
  }
  yo = u.correo;
  $("usuario-nombre").textContent = u.nombre || u.correo;
  $("estado").hidden = true;
  $("contenido").hidden = false;
  await Promise.all([cargarUsuarios(), cargarMeta(), cargarAccesos()]);
}

if (!fb.configurado) {
  $("estado").textContent = "Falta la configuración de Firebase (firebase-config.js).";
} else {
  fb.alCambiarSesion(iniciar);
  $("btn-salir").onclick = async () => { await fb.registrarAcceso("salida"); await fb.salir(); };

  $("f-agregar").addEventListener("submit", async ev => {
    ev.preventDefault();
    const correo = $("nuevo-correo").value.trim().toLowerCase();
    const lista = await fb.listarUsuarios();
    if (lista.some(x => x.correo === correo)) { avisar("Ese correo ya está en la lista.", true); return; }
    try {
      await fb.guardarUsuario(correo, { nombre: $("nuevo-nombre").value.trim().slice(0, 80), rol: $("nuevo-rol").value,
        activo: true, agregado: fb.marcaTiempo(), por: yo });
      avisar(`Se agregó ${correo}. Ya puede entrar con su cuenta de Google.`);
      ev.target.reset();
      cargarUsuarios();
    } catch (e) {
      avisar("No se pudo agregar: " + e.message, true);
    }
  });

  $("tabla-usuarios").addEventListener("click", ev => {
    const b = ev.target.closest("button[data-accion]");
    if (b) accion(b.dataset.accion, b.dataset.correo);
  });

  $("f-datos").addEventListener("submit", async ev => {
    ev.preventDefault();
    const archivo = $("archivo-datos").files[0];
    if (!archivo) return;
    const boton = ev.target.querySelector("button");
    boton.disabled = true;
    try {
      const texto = await archivo.text();
      await fb.subirDatos(texto, (i, n) => { $("meta-datos").textContent = `Subiendo parte ${i} de ${n}…`; });
      avisar("Datos subidos. Los usuarios los ven al recargar el simulador.");
      ev.target.reset();
    } catch (e) {
      avisar("No se pudieron subir los datos: " + e.message, true);
    }
    boton.disabled = false;
    cargarMeta();
  });
}
