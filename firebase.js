// ============================================================
// firebase.js — acceso con Google, usuarios, datos y registro de accesos.
// Las reglas de Firestore (firestore.rules) deciden quién lee y escribe;
// este módulo solo hace las llamadas.
//
// usuarios/{correo}   { nombre, rol: "admin"|"usuario", activo, agregado, por }
// datos/meta          { partes, generado, subido, por, bytes }
// datos/parte_NN      { s }  trozos del JSON del simulador (un documento admite ~1 MB)
// accesos/{id}        { correo, tipo: "entrada"|"salida", t, ua }
// ============================================================
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, addDoc, query, orderBy, limit, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const TAM_PARTE = 600000;   // caracteres por documento (bajo el límite de 1 MiB de Firestore)

export const configurado = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
let auth = null, db = null;
if (configurado) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

// ---------------- sesión ----------------
export const correoActual = () => ((auth && auth.currentUser && auth.currentUser.email) || "").toLowerCase();
export const nombreActual = () => (auth && auth.currentUser && auth.currentUser.displayName) || correoActual();
export const alCambiarSesion = cb => onAuthStateChanged(auth, cb);
export const salir = () => signOut(auth);
export function entrar() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, p);
}

/** El usuario activo que entró, o null si no tiene acceso. La primera vez, el propietario
 *  definido en las reglas se crea a sí mismo como administrador. */
export async function miUsuario() {
  const c = correoActual();
  if (!c) return null;
  const ref = doc(db, "usuarios", c);
  let s;
  try { s = await getDoc(ref); } catch (e) { return null; }
  if (s.exists()) return s.data().activo ? { correo: c, ...s.data() } : null;
  try {
    const u = { nombre: nombreActual(), rol: "admin", activo: true, agregado: serverTimestamp(), por: c };
    await setDoc(ref, u);   // las reglas solo lo permiten al propietario
    return { correo: c, ...u };
  } catch (e) {
    return null;
  }
}

export function registrarAcceso(tipo) {
  return addDoc(collection(db, "accesos"), {
    correo: correoActual(), tipo, t: serverTimestamp(), ua: navigator.userAgent.slice(0, 200),
  }).catch(() => {});
}

// ---------------- datos del simulador ----------------
const nombreParte = i => "parte_" + String(i).padStart(2, "0");

/** Datos del simulador, o null si aún no se han subido. */
export async function cargarDatos(progreso) {
  const meta = await getDoc(doc(db, "datos", "meta"));
  if (!meta.exists()) return null;
  const n = meta.data().partes;
  let listas = 0;
  const partes = await Promise.all(Array.from({ length: n }, (_, i) =>
    getDoc(doc(db, "datos", nombreParte(i))).then(s => { if (progreso) progreso(++listas, n); return s.data().s; })));
  return JSON.parse(partes.join(""));
}

export async function metaDatos() {
  const s = await getDoc(doc(db, "datos", "meta"));
  return s.exists() ? s.data() : null;
}

/** Sube el JSON generado por tools/preparar_datos_salado.py, en trozos. */
export async function subirDatos(texto, progreso) {
  const obj = JSON.parse(texto);
  if (!obj || !Array.isArray(obj.minas) || !obj.planta) throw new Error("El archivo no es un datos_salado.json válido.");
  const partes = [];
  for (let i = 0; i < texto.length; i += TAM_PARTE) partes.push(texto.slice(i, i + TAM_PARTE));
  for (let i = 0; i < partes.length; i++) {
    await setDoc(doc(db, "datos", nombreParte(i)), { s: partes.at(i) });
    if (progreso) progreso(i + 1, partes.length);
  }
  const anterior = await metaDatos();
  await setDoc(doc(db, "datos", "meta"), {
    partes: partes.length, generado: obj.generado || "", subido: serverTimestamp(), por: correoActual(), bytes: texto.length,
  });
  if (anterior) for (let i = partes.length; i < anterior.partes; i++) await deleteDoc(doc(db, "datos", nombreParte(i)));
}

// ---------------- administración ----------------
export async function listarUsuarios() {
  const s = await getDocs(collection(db, "usuarios"));
  return s.docs.map(d => ({ correo: d.id, ...d.data() }));
}
export function guardarUsuario(correo, datos) {
  return setDoc(doc(db, "usuarios", correo.toLowerCase()), datos);
}
export function eliminarUsuario(correo) {
  return deleteDoc(doc(db, "usuarios", correo.toLowerCase()));
}
export const marcaTiempo = serverTimestamp;
export async function listarAccesos(n) {
  const s = await getDocs(query(collection(db, "accesos"), orderBy("t", "desc"), limit(n)));
  return s.docs.map(d => d.data());
}
